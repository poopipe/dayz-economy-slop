#!/usr/bin/env python3
"""
Flask application for XML data editor with editing and grouping capabilities.
"""

import os
import json
import sqlite3
import xml.etree.ElementTree as ET
from pathlib import Path
from flask import Flask, render_template, jsonify, request, Response
from collections import defaultdict
import threading
import queue
import time
from datetime import datetime
import shutil

app = Flask(__name__)

# Default mission directory
DEFAULT_MISSION_DIR = r"E:\DayZ_Servers\Nyheim20_Server\mpmissions\empty.nyheim"

# Current mission directory (can be changed by user)
current_mission_dir = DEFAULT_MISSION_DIR

# File change notification queue for SSE
file_change_queue = queue.Queue()


def get_db_path(mission_dir):
    """Get the database file path for a given mission directory."""
    mission_path = Path(mission_dir)
    db_dir = mission_path / 'type-editor-db'
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / 'editor_data.db'


def get_backup_path(mission_dir, backup_name=None):
    """Get the backup database file path for a given mission directory."""
    mission_path = Path(mission_dir)
    db_dir = mission_path / 'type-editor-db'
    db_dir.mkdir(parents=True, exist_ok=True)
    if backup_name:
        return db_dir / backup_name
    else:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        return db_dir / f'editor_data_backup_{timestamp}.db'


def get_current_db_path():
    """Get the database file path for the current mission directory."""
    return get_db_path(current_mission_dir)


def init_database(mission_dir=None):
    """Initialize the SQLite database with required tables for a given mission directory."""
    if mission_dir is None:
        mission_dir = current_mission_dir
    db_file = get_db_path(mission_dir)
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()
    
    # Table for type elements (current state)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS type_elements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            element_key TEXT UNIQUE NOT NULL,
            name TEXT,
            data TEXT NOT NULL,
            source_file TEXT,
            source_folder TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table for edit history (undo support)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS edit_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            element_key TEXT NOT NULL,
            field_name TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (element_key) REFERENCES type_elements(element_key)
        )
    ''')
    
    # Table for itemclasses (renamed from groups, exclusive - one element per class)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS itemclasses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table for element-itemclass assignments (exclusive - one element per class)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS element_itemclasses (
            element_key TEXT PRIMARY KEY,
            itemclass_id INTEGER NOT NULL,
            FOREIGN KEY (element_key) REFERENCES type_elements(element_key),
            FOREIGN KEY (itemclass_id) REFERENCES itemclasses(id)
        )
    ''')
    
    # Table for itemtags (non-exclusive - elements can have multiple tags)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS itemtags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table for element-itemtag assignments (many-to-many)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS element_itemtags (
            element_key TEXT NOT NULL,
            itemtag_id INTEGER NOT NULL,
            PRIMARY KEY (element_key, itemtag_id),
            FOREIGN KEY (element_key) REFERENCES type_elements(element_key),
            FOREIGN KEY (itemtag_id) REFERENCES itemtags(id)
        )
    ''')
    
    # Migrate old groups table to itemclasses if it exists
    cursor.execute('''
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='groups'
    ''')
    if cursor.fetchone():
        # Migrate groups to itemclasses
        cursor.execute('''
            INSERT OR IGNORE INTO itemclasses (id, name, description, created_at)
            SELECT id, name, description, created_at FROM groups
        ''')
        cursor.execute('''
            INSERT OR IGNORE INTO element_itemclasses (element_key, itemclass_id)
            SELECT element_key, group_id FROM element_groups
        ''')
        # Drop old tables
        cursor.execute('DROP TABLE IF EXISTS element_groups')
        cursor.execute('DROP TABLE IF EXISTS groups')
    
    # Indexes for performance
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_element_key ON type_elements(element_key)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_edit_element ON edit_history(element_key)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_itemclass_id ON element_itemclasses(itemclass_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_itemtag_id ON element_itemtags(itemtag_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_itemtag_element ON element_itemtags(element_key)')
    
    conn.commit()
    conn.close()


def get_db_connection(mission_dir=None):
    """Get a database connection for a given mission directory."""
    if mission_dir is None:
        mission_dir = current_mission_dir
    db_file = get_db_path(mission_dir)
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    return conn


def extract_element_data(element, element_type='type'):
    """
    Extract data from XML elements, using specified element type as key.
    Same as main app.
    """
    results = []
    
    if element.tag == element_type:
        data = {}
        data.update(element.attrib)
        
        for child in element:
            child_tag = child.tag
            child_text = child.text.strip() if child.text and child.text.strip() else None
            child_attrib = dict(child.attrib)
            has_subchildren = len(child) > 0
            
            if has_subchildren:
                child_data = {}
                child_data.update(child_attrib)
                
                for subchild in child:
                    subchild_text = subchild.text.strip() if subchild.text and subchild.text.strip() else None
                    subchild_attrib = dict(subchild.attrib)
                    
                    if len(subchild) == 0:
                        if subchild_text:
                            subchild_value = subchild_text
                        elif subchild_attrib:
                            subchild_value = subchild_attrib
                        else:
                            continue
                    else:
                        subchild_value = {}
                        subchild_value.update(subchild_attrib)
                        for subsubchild in subchild:
                            subsubchild_text = subsubchild.text.strip() if subsubchild.text and subsubchild.text.strip() else None
                            if subsubchild_text:
                                subchild_value[subsubchild.tag] = subsubchild_text
                    
                    if subchild.tag in child_data:
                        if not isinstance(child_data[subchild.tag], list):
                            child_data[subchild.tag] = [child_data[subchild.tag]]
                        child_data[subchild.tag].append(subchild_value)
                    else:
                        child_data[subchild.tag] = subchild_value
                
                if child_tag in data:
                    if not isinstance(data[child_tag], list):
                        data[child_tag] = [data[child_tag]]
                    data[child_tag].append(child_data)
                else:
                    data[child_tag] = child_data
            else:
                # Child has no sub-elements
                if child_text and child_attrib:
                    # Has both text and attributes - store as object with _text key
                    child_value = {'_text': child_text}
                    child_value.update(child_attrib)
                elif child_text:
                    # Only has text content
                    child_value = child_text
                elif child_attrib:
                    # Only has attributes (like usage, value, flags, category)
                    child_value = child_attrib
                else:
                    continue  # Skip empty elements
                
                # Store child value
                if child_tag in data:
                    if not isinstance(data[child_tag], list):
                        data[child_tag] = [data[child_tag]]
                    data[child_tag].append(child_value)
                else:
                    data[child_tag] = child_value
        
        results.append(data)
    
    # Recursively process children
    for child in element:
        results.extend(extract_element_data(child, element_type))
    
    return results


def to_db_string(value):
    """Convert a value to a string suitable for database storage."""
    if value is None:
        return None
    if isinstance(value, list):
        # If it's a list, take the first element or join them
        if len(value) == 0:
            return None
        # If first element is a dict, convert to JSON string
        if isinstance(value[0], dict):
            return json.dumps(value)
        # Otherwise, take the first element
        return str(value[0])
    if isinstance(value, dict):
        # Convert dict to JSON string
        return json.dumps(value)
    return str(value)


def load_xml_to_database(mission_dir, element_type='type'):
    """
    Load XML files from mission directory structure and populate/update the database.
    
    Structure:
    - mission_dir/db/types.xml (always included)
    - mission_dir/cfgeconomycore.xml contains <ce> elements with folder attributes
    - Each <ce> contains <file> elements with type="types"
    - Only <file> elements with type="types" are used
    - File paths are relative to mission folder: mission_dir + ce.folder + file.name
    """
    conn = get_db_connection(mission_dir)
    cursor = conn.cursor()
    
    mission_path = Path(mission_dir)
    if not mission_path.exists():
        conn.close()
        return {'file_count': 0, 'element_count': 0, 'error': 'Mission directory does not exist'}
    
    file_count = 0
    element_count = 0
    files_to_load = []
    
    # 1. Always include db/types.xml (even if empty or doesn't exist)
    db_types_file = mission_path / 'db' / 'types.xml'
    # Include it - if it doesn't exist, we'll handle it in the loading loop
    files_to_load.append(('db/types.xml', 'db', 'types.xml', db_types_file))
    
    # 2. Parse cfgeconomycore.xml to find all type files
    cfgeconomycore_file = mission_path / 'cfgeconomycore.xml'
    print(f"Looking for cfgeconomycore.xml at: {cfgeconomycore_file}")
    print(f"File exists: {cfgeconomycore_file.exists()}")
    
    if cfgeconomycore_file.exists():
        try:
            tree = ET.parse(cfgeconomycore_file)
            root = tree.getroot()
            print(f"Root element: {root.tag}")
            
            # Find all <ce> elements
            ce_elements = root.findall('.//ce')
            print(f"Found {len(ce_elements)} <ce> elements")
            
            for ce_element in ce_elements:
                ce_folder_attr = ce_element.get('folder')
                print(f"  <ce> element with folder='{ce_folder_attr}'")
                if not ce_folder_attr:
                    continue
                
                # Normalize folder path (handle backslashes/forward slashes, remove trailing slashes)
                ce_folder_attr = ce_folder_attr.replace('\\', '/').strip('/')
                
                # Resolve the ce folder path (relative to mission directory)
                # Path is: mission_dir + ce.folder + file.name
                ce_folder_path = mission_path / ce_folder_attr
                print(f"    Resolved folder path: {ce_folder_path}")
                
                # Find all <file> elements with type="types"
                file_elements = ce_element.findall('.//file')
                print(f"    Found {len(file_elements)} <file> elements")
                
                for file_element in file_elements:
                    file_type = file_element.get('type')
                    file_name = file_element.get('name')
                    print(f"      <file> type='{file_type}' name='{file_name}'")
                    if file_type != 'types':
                        continue
                    
                    if not file_name:
                        continue
                    
                    # Full path: mission_dir + ce_folder + file_name
                    full_file_path = ce_folder_path / file_name
                    print(f"        Full path: {full_file_path}")
                    print(f"        Path exists: {full_file_path.exists()}")
                    
                    # Create source identifier: ce_folder/file_name
                    # ce_folder_attr is already normalized above
                    source_folder = ce_folder_attr
                    source_file = file_name
                    source_identifier = f"{source_folder}/{source_file}" if source_folder else source_file
                    
                    files_to_load.append((source_identifier, source_folder, source_file, full_file_path))
        except Exception as e:
            print(f"Error parsing cfgeconomycore.xml: {e}")
            import traceback
            traceback.print_exc()
    
    print(f"Total files to load: {len(files_to_load)}")
    
    # 3. Load all identified files
    for file_info in files_to_load:
        source_identifier, source_folder, source_file, full_file_path = file_info
        print(f"Processing file: {source_identifier} -> {full_file_path}")
        
        if not full_file_path.exists():
            print(f"  File does not exist, skipping")
            continue
        
        try:
            tree = ET.parse(full_file_path)
            root = tree.getroot()
            print(f"  Root tag: {root.tag}")
            
            elements = extract_element_data(root, element_type)
            print(f"  Extracted {len(elements)} elements")
            
            for elem in elements:
                # Create unique key from name attribute or generate one
                name_value = elem.get('name')
                element_key = to_db_string(name_value)
                
                if not element_key:
                    # If no name, generate a unique key based on type and source
                    element_key = f"element_{elem.get('type', 'unknown')}_{source_folder}_{Path(source_file).stem}"
                
                # Normalize name for database storage (convert lists/dicts to strings)
                name_for_db = to_db_string(name_value)
                
                # Store element data as JSON
                data_json = json.dumps(elem)
                
                # Insert or update (same name = same element, updates existing)
                # This preserves existing itemclass/itemtag assignments since we're updating by element_key
                cursor.execute('''
                    INSERT OR REPLACE INTO type_elements 
                    (element_key, name, data, source_file, source_folder, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (
                    element_key,
                    name_for_db,
                    data_json,
                    source_file,
                    source_folder,
                    datetime.now().isoformat()
                ))
                element_count += 1
            
            file_count += 1
        except Exception as e:
            print(f"Error processing {full_file_path}: {e}")
    
    conn.commit()
    conn.close()
    
    return {'file_count': file_count, 'element_count': element_count}


# Initialize database for default mission directory on import
init_database(DEFAULT_MISSION_DIR)


@app.route('/')
def index():
    """Main page."""
    return render_template('editor.html')


@app.route('/api/load', methods=['POST'])
def load_data():
    """Load XML data from mission directory into database."""
    try:
        data = request.json
        mission_dir = data.get('mission_dir', current_mission_dir)
        element_type = data.get('element_type', 'type')
        
        # Initialize database for this mission directory
        init_database(mission_dir)
        
        result = load_xml_to_database(mission_dir, element_type)
        
        if result.get('error'):
            return jsonify({
                'success': False,
                'error': result['error'],
                'file_count': result.get('file_count', 0),
                'element_count': result.get('element_count', 0)
            }), 400
        
        return jsonify({
            'success': True,
            'file_count': result['file_count'],
            'element_count': result['element_count']
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/elements')
def get_elements():
    """Get all type elements from database."""
    try:
        # Get mission_dir from query parameter if provided
        mission_dir = request.args.get('mission_dir', current_mission_dir)
        conn = get_db_connection(mission_dir)
        cursor = conn.cursor()
        
        # Get all elements with their itemclass and itemtag assignments
        cursor.execute('''
            SELECT 
                te.element_key,
                te.name,
                te.data,
                te.source_file,
                te.source_folder,
                eic.itemclass_id,
                ic.name as itemclass_name
            FROM type_elements te
            LEFT JOIN element_itemclasses eic ON te.element_key = eic.element_key
            LEFT JOIN itemclasses ic ON eic.itemclass_id = ic.id
            ORDER BY te.name
        ''')
        
        elements = []
        for row in cursor.fetchall():
            data = json.loads(row['data'])
            data['_element_key'] = row['element_key']
            data['_source_file'] = row['source_file']
            data['_source_folder'] = row['source_folder']
            # Add user-friendly source column: folder/filename
            folder_name = row['source_folder'] if row['source_folder'] else ''
            source_file = row['source_file'] if row['source_file'] else ''
            data['source'] = f"{folder_name}/{source_file}" if folder_name else source_file
            data['_itemclass_id'] = row['itemclass_id']
            data['_itemclass_name'] = row['itemclass_name']
            
            # Get itemtags for this element
            cursor.execute('''
                SELECT it.id, it.name
                FROM itemtags it
                JOIN element_itemtags eit ON it.id = eit.itemtag_id
                WHERE eit.element_key = ?
            ''', (row['element_key'],))
            itemtags = [{'id': tag_row['id'], 'name': tag_row['name']} for tag_row in cursor.fetchall()]
            data['_itemtags'] = itemtags
            data['_itemtag_names'] = [tag['name'] for tag in itemtags]
            
            elements.append(data)
        
        conn.close()
        
        return jsonify({
            'success': True,
            'elements': elements,
            'total': len(elements)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/elements/<element_key>/field/<field_name>', methods=['PUT'])
def update_field(element_key, field_name):
    """Update a field value for an element."""
    try:
        data = request.json
        new_value = data.get('value')
        mission_dir = data.get('mission_dir', current_mission_dir)
        conn = get_db_connection(mission_dir)
        cursor = conn.cursor()
        
        # Get current element data
        cursor.execute('SELECT data FROM type_elements WHERE element_key = ?', (element_key,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return jsonify({'error': 'Element not found'}), 404
        
        element_data = json.loads(row['data'])
        old_value = element_data.get(field_name)
        
        # Update the field
        element_data[field_name] = new_value
        
        # Save updated data
        cursor.execute('''
            UPDATE type_elements 
            SET data = ?, updated_at = ?
            WHERE element_key = ?
        ''', (json.dumps(element_data), datetime.now().isoformat(), element_key))
        
        # Record in edit history for undo support
        cursor.execute('''
            INSERT INTO edit_history (element_key, field_name, old_value, new_value)
            VALUES (?, ?, ?, ?)
        ''', (
            element_key,
            field_name,
            json.dumps(old_value) if old_value is not None else None,
            json.dumps(new_value) if new_value is not None else None
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/elements/<element_key>/undo', methods=['POST'])
def undo_edit(element_key):
    """Undo the last edit for an element."""
    try:
        data = request.json
        mission_dir = data.get('mission_dir', current_mission_dir)
        conn = get_db_connection(mission_dir)
        cursor = conn.cursor()
        
        # Get the most recent edit for this element
        cursor.execute('''
            SELECT field_name, old_value, new_value
            FROM edit_history
            WHERE element_key = ?
            ORDER BY timestamp DESC
            LIMIT 1
        ''', (element_key,))
        
        row = cursor.fetchone()
        if not row:
            conn.close()
            return jsonify({'error': 'No edit history found'}), 404
        
        field_name = row['field_name']
        old_value = json.loads(row['old_value']) if row['old_value'] else None
        new_value = json.loads(row['new_value']) if row['new_value'] else None
        
        # Get current element data
        cursor.execute('SELECT data FROM type_elements WHERE element_key = ?', (element_key,))
        elem_row = cursor.fetchone()
        if not elem_row:
            conn.close()
            return jsonify({'error': 'Element not found'}), 404
        
        element_data = json.loads(elem_row['data'])
        
        # Handle special fields
        if field_name == '_itemclass_id':
            # Restore itemclass assignment
            cursor.execute('DELETE FROM element_itemclasses WHERE element_key = ?', (element_key,))
            if old_value is not None:
                cursor.execute('''
                    INSERT OR REPLACE INTO element_itemclasses (element_key, itemclass_id)
                    VALUES (?, ?)
                ''', (element_key, old_value))
        elif field_name == '_itemtag_ids':
            # Restore itemtag assignments
            cursor.execute('DELETE FROM element_itemtags WHERE element_key = ?', (element_key,))
            if old_value is not None:
                for itemtag_id in old_value:
                    cursor.execute('''
                        INSERT OR IGNORE INTO element_itemtags (element_key, itemtag_id)
                        VALUES (?, ?)
                    ''', (element_key, itemtag_id))
        else:
            # Restore field value
            element_data[field_name] = old_value
            cursor.execute('''
                UPDATE type_elements 
                SET data = ?, updated_at = ?
                WHERE element_key = ?
            ''', (json.dumps(element_data), datetime.now().isoformat(), element_key))
        
        # Remove the undone edit from history
        cursor.execute('''
            DELETE FROM edit_history 
            WHERE id = (
                SELECT id FROM edit_history 
                WHERE element_key = ? 
                ORDER BY timestamp DESC 
                LIMIT 1
            )
        ''', (element_key,))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/itemclasses', methods=['GET', 'POST'])
def manage_itemclasses():
    """Get all itemclasses or create a new itemclass."""
    mission_dir = request.args.get('mission_dir') or (request.json.get('mission_dir') if request.json else None) or current_mission_dir
    conn = get_db_connection(mission_dir)
    cursor = conn.cursor()
    
    if request.method == 'POST':
        data = request.json
        name = data.get('name', '').strip()
        description = data.get('description', '')
        
        if not name:
            conn.close()
            return jsonify({'error': 'Itemclass name is required'}), 400
        
        try:
            cursor.execute('''
                INSERT INTO itemclasses (name, description)
                VALUES (?, ?)
            ''', (name, description))
            conn.commit()
            itemclass_id = cursor.lastrowid
            conn.close()
            return jsonify({'success': True, 'id': itemclass_id, 'name': name})
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'error': 'Itemclass name already exists'}), 400
    else:
        cursor.execute('SELECT id, name, description FROM itemclasses ORDER BY name')
        itemclasses = [{'id': row['id'], 'name': row['name'], 'description': row['description']} 
                       for row in cursor.fetchall()]
        conn.close()
        return jsonify({'itemclasses': itemclasses})


@app.route('/api/itemclasses/<int:itemclass_id>', methods=['PUT', 'DELETE'])
def manage_itemclass(itemclass_id):
    """Update or delete an itemclass."""
    mission_dir = request.json.get('mission_dir', current_mission_dir) if request.json else current_mission_dir
    conn = get_db_connection(mission_dir)
    cursor = conn.cursor()
    
    if request.method == 'PUT':
        # Rename itemclass
        data = request.json
        new_name = data.get('name')
        description = data.get('description', '')
        
        if not new_name:
            conn.close()
            return jsonify({'error': 'Itemclass name is required'}), 400
        
        try:
            cursor.execute('''
                UPDATE itemclasses 
                SET name = ?, description = ?
                WHERE id = ?
            ''', (new_name, description, itemclass_id))
            conn.commit()
            conn.close()
            return jsonify({'success': True, 'name': new_name})
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'error': 'Itemclass name already exists'}), 400
    else:
        # DELETE - Remove all element assignments
        cursor.execute('DELETE FROM element_itemclasses WHERE itemclass_id = ?', (itemclass_id,))
        
        # Delete itemclass
        cursor.execute('DELETE FROM itemclasses WHERE id = ?', (itemclass_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})


@app.route('/api/elements/<element_key>/itemclass', methods=['PUT', 'DELETE'])
def manage_element_itemclass(element_key):
    """Assign or remove element from an itemclass."""
    mission_dir = request.json.get('mission_dir', current_mission_dir)
    conn = get_db_connection(mission_dir)
    cursor = conn.cursor()
    
    # Get current itemclass_id for edit history
    cursor.execute('SELECT itemclass_id FROM element_itemclasses WHERE element_key = ?', (element_key,))
    old_row = cursor.fetchone()
    old_itemclass_id = old_row['itemclass_id'] if old_row else None
    
    if request.method == 'PUT':
        data = request.json
        new_itemclass_id = data.get('itemclass_id')
        
        # Remove from any existing itemclass first
        cursor.execute('DELETE FROM element_itemclasses WHERE element_key = ?', (element_key,))
        
        # Add to new itemclass
        if new_itemclass_id:
            cursor.execute('''
                INSERT OR REPLACE INTO element_itemclasses (element_key, itemclass_id)
                VALUES (?, ?)
            ''', (element_key, new_itemclass_id))
        
        # Record in edit history for undo support
        cursor.execute('''
            INSERT INTO edit_history (element_key, field_name, old_value, new_value)
            VALUES (?, ?, ?, ?)
        ''', (
            element_key,
            '_itemclass_id',
            json.dumps(old_itemclass_id) if old_itemclass_id else None,
            json.dumps(new_itemclass_id) if new_itemclass_id else None
        ))
        
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    else:
        # DELETE - remove from itemclass
        # Record in edit history for undo support
        cursor.execute('''
            INSERT INTO edit_history (element_key, field_name, old_value, new_value)
            VALUES (?, ?, ?, ?)
        ''', (
            element_key,
            '_itemclass_id',
            json.dumps(old_itemclass_id) if old_itemclass_id else None,
            None
        ))
        
        cursor.execute('DELETE FROM element_itemclasses WHERE element_key = ?', (element_key,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})


@app.route('/api/itemtags', methods=['GET', 'POST'])
def manage_itemtags():
    """Get all itemtags or create a new itemtag."""
    mission_dir = request.args.get('mission_dir') or (request.json.get('mission_dir') if request.json else None) or current_mission_dir
    conn = get_db_connection(mission_dir)
    cursor = conn.cursor()
    
    if request.method == 'POST':
        data = request.json
        name = data.get('name', '').strip()
        description = data.get('description', '')
        
        if not name:
            conn.close()
            return jsonify({'error': 'Itemtag name is required'}), 400
        
        try:
            cursor.execute('''
                INSERT INTO itemtags (name, description)
                VALUES (?, ?)
            ''', (name, description))
            conn.commit()
            itemtag_id = cursor.lastrowid
            conn.close()
            return jsonify({'success': True, 'id': itemtag_id, 'name': name})
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'error': 'Itemtag name already exists'}), 400
    else:
        cursor.execute('SELECT id, name, description FROM itemtags ORDER BY name')
        itemtags = [{'id': row['id'], 'name': row['name'], 'description': row['description']} 
                    for row in cursor.fetchall()]
        conn.close()
        return jsonify({'itemtags': itemtags})


@app.route('/api/itemtags/<int:itemtag_id>', methods=['PUT', 'DELETE'])
def manage_itemtag(itemtag_id):
    """Update or delete an itemtag."""
    mission_dir = request.json.get('mission_dir', current_mission_dir) if request.json else current_mission_dir
    conn = get_db_connection(mission_dir)
    cursor = conn.cursor()
    
    if request.method == 'PUT':
        data = request.json
        new_name = data.get('name')
        description = data.get('description', '')
        
        if not new_name:
            conn.close()
            return jsonify({'error': 'Itemtag name is required'}), 400
        
        try:
            cursor.execute('''
                UPDATE itemtags 
                SET name = ?, description = ?
                WHERE id = ?
            ''', (new_name, description, itemtag_id))
            conn.commit()
            conn.close()
            return jsonify({'success': True, 'name': new_name})
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'error': 'Itemtag name already exists'}), 400
    else:
        # DELETE - Remove all element assignments
        cursor.execute('DELETE FROM element_itemtags WHERE itemtag_id = ?', (itemtag_id,))
        
        # Delete itemtag
        cursor.execute('DELETE FROM itemtags WHERE id = ?', (itemtag_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})


@app.route('/api/elements/<element_key>/itemtags', methods=['PUT'])
def manage_element_itemtags(element_key):
    """Update element itemtags."""
    mission_dir = request.json.get('mission_dir', current_mission_dir)
    conn = get_db_connection(mission_dir)
    cursor = conn.cursor()
    
    # Get current itemtag_ids for edit history
    cursor.execute('SELECT itemtag_id FROM element_itemtags WHERE element_key = ?', (element_key,))
    old_itemtag_ids = [row['itemtag_id'] for row in cursor.fetchall()]
    
    data = request.json
    new_itemtag_ids = data.get('itemtag_ids', [])
    
    # Remove all existing assignments
    cursor.execute('DELETE FROM element_itemtags WHERE element_key = ?', (element_key,))
    
    # Add new assignments
    for itemtag_id in new_itemtag_ids:
        cursor.execute('''
            INSERT OR IGNORE INTO element_itemtags (element_key, itemtag_id)
            VALUES (?, ?)
        ''', (element_key, itemtag_id))
    
    # Record in edit history for undo support
    cursor.execute('''
        INSERT INTO edit_history (element_key, field_name, old_value, new_value)
        VALUES (?, ?, ?, ?)
    ''', (
        element_key,
        '_itemtag_ids',
        json.dumps(old_itemtag_ids) if old_itemtag_ids else None,
        json.dumps(new_itemtag_ids) if new_itemtag_ids else None
    ))
    
    conn.commit()
    conn.close()
    return jsonify({'success': True})


def reconstruct_xml_element(data_dict, element_tag='type'):
    """
    Reconstruct an XML element from a data dictionary (reverse of extract_element_data).
    """
    element = ET.Element(element_tag)
    
    # Add attributes (excluding internal fields)
    for key, value in data_dict.items():
        if key.startswith('_'):
            continue
        if isinstance(value, (dict, list)):
            continue
        element.set(key, str(value))
    
    # Add child elements
    for key, value in data_dict.items():
        if key.startswith('_'):
            continue
        
        if isinstance(value, list):
            for item in value:
                child = reconstruct_child_element(key, item)
                if child is not None:
                    element.append(child)
        elif isinstance(value, dict):
            child = reconstruct_child_element(key, value)
            if child is not None:
                element.append(child)
        elif value is not None:
            # Simple text child
            child = ET.Element(key)
            child.text = str(value)
            element.append(child)
    
    return element


def reconstruct_child_element(tag, value):
    """
    Reconstruct a child XML element from a value (can be dict, string, or dict with _text).
    Handles nested structures with subchildren.
    """
    if isinstance(value, dict):
        child = ET.Element(tag)
        
        # Separate attributes from subchildren
        # Attributes are simple string values (or _text)
        # Subchildren are dict/list values
        has_subchildren = any(isinstance(v, (dict, list)) for k, v in value.items() if k != '_text')
        
        if has_subchildren:
            # This element has subchildren
            # Set attributes (simple string values)
            for k, v in value.items():
                if k == '_text':
                    child.text = str(v)
                elif isinstance(v, str) and not isinstance(v, (dict, list)):
                    # Simple string value = attribute
                    child.set(k, v)
            
            # Add subchildren (dict/list values)
            for k, v in value.items():
                if k == '_text':
                    continue
                if isinstance(v, list):
                    for item in v:
                        subchild = reconstruct_child_element(k, item)
                        if subchild is not None:
                            child.append(subchild)
                elif isinstance(v, dict):
                    subchild = reconstruct_child_element(k, v)
                    if subchild is not None:
                        child.append(subchild)
        else:
            # No subchildren - this is a simple element
            # Handle _text special key (text content with attributes)
            if '_text' in value:
                child.text = str(value['_text'])
                # Add other attributes
                for k, v in value.items():
                    if k != '_text':
                        child.set(k, str(v))
            else:
                # All dict values are attributes
                for k, v in value.items():
                    child.set(k, str(v))
        
        return child
    elif isinstance(value, str):
        child = ET.Element(tag)
        child.text = value
        return child
    else:
        return None


def export_database_to_xml(mission_dir, export_by_itemclass=False, export_subfolder='exported-types'):
    """
    Export database contents back to original XML files.
    If export_by_itemclass is True, exports elements grouped by itemclass to a subfolder.
    Returns dict with file_count and success status.
    """
    conn = get_db_connection(mission_dir)
    cursor = conn.cursor()
    
    mission_path = Path(mission_dir)
    if not mission_path.exists():
        conn.close()
        return {
            'success': False,
            'error': f'Mission directory does not exist: {mission_dir}',
            'exported_count': 0,
            'error_count': 0,
            'errors': []
        }
    
    if export_by_itemclass:
        return export_by_itemclass_to_xml(mission_dir, export_subfolder, conn, cursor, mission_path)
    
    # Original export logic - grouped by source file
    cursor.execute('''
        SELECT 
            te.element_key,
            te.data,
            te.source_file,
            te.source_folder
        FROM type_elements te
        WHERE te.source_file IS NOT NULL AND te.source_folder IS NOT NULL
        ORDER BY te.source_folder, te.source_file
    ''')
    
    # Group by source file
    files_data = defaultdict(list)
    for row in cursor.fetchall():
        source_folder = row['source_folder']
        source_file = row['source_file']
        data = json.loads(row['data'])
        files_data[(source_folder, source_file)].append(data)
    
    conn.close()
    
    exported_count = 0
    error_count = 0
    errors = []  # List of error details
    
    # Export each file
    for (folder_name, filename), elements in files_data.items():
        # Reconstruct the full file path
        # source_folder might be like "db" or a ce folder path
        # We need to construct: mission_dir + source_folder + filename
        xml_file = mission_path / folder_name / filename
        
        # Ensure parent directory exists
        xml_file.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            # Create root <types> element
            root = ET.Element('types')
            
            # Add each type element
            for elem_data in elements:
                type_elem = reconstruct_xml_element(elem_data, 'type')
                if type_elem is not None:
                    root.append(type_elem)
            
            # Create tree and write with proper formatting
            tree = ET.ElementTree(root)
            
            # Pretty print (if available in Python 3.9+)
            try:
                ET.indent(tree, space='    ')
            except AttributeError:
                # Python < 3.9 doesn't have indent, skip pretty printing
                pass
            
            # Write to file with XML declaration
            with open(xml_file, 'wb') as f:
                f.write('<?xml version="1.0" encoding="UTF-8"?>\n'.encode('utf-8'))
                tree.write(f, encoding='utf-8', xml_declaration=False)
            
            exported_count += 1
        except Exception as e:
            error_count += 1
            error_msg = str(e)
            file_path = f"{folder_name}/{filename}"
            errors.append({
                'file': file_path,
                'error': error_msg
            })
            print(f"Error exporting {xml_file}: {e}")
    
    return {
        'success': True,
        'exported_count': exported_count,
        'error_count': error_count,
        'errors': errors
    }


def export_by_itemclass_to_xml(mission_dir, export_subfolder, conn, cursor, mission_path):
    """
    Export elements grouped by itemclass to XML files in a subfolder.
    Also updates cfgeconomycore.xml to add a new ce section and comment out existing ones.
    """
    # Get all elements with their itemclass assignments
    cursor.execute('''
        SELECT 
            te.element_key,
            te.data,
            ic.id as itemclass_id,
            ic.name as itemclass_name
        FROM type_elements te
        LEFT JOIN element_itemclasses eic ON te.element_key = eic.element_key
        LEFT JOIN itemclasses ic ON eic.itemclass_id = ic.id
        ORDER BY ic.name, te.name
    ''')
    
    # Group elements by itemclass
    itemclass_data = defaultdict(list)
    unassigned_elements = []
    
    for row in cursor.fetchall():
        data = json.loads(row['data'])
        itemclass_id = row['itemclass_id']
        itemclass_name = row['itemclass_name']
        
        if itemclass_id and itemclass_name:
            # Sanitize itemclass name for filename (remove invalid characters)
            safe_name = sanitize_filename(itemclass_name)
            itemclass_data[safe_name].append(data)
        else:
            unassigned_elements.append(data)
    
    # Create export subfolder
    export_folder = mission_path / export_subfolder
    export_folder.mkdir(parents=True, exist_ok=True)
    
    exported_count = 0
    error_count = 0
    errors = []
    exported_files = []  # Track files for cfgeconomycore.xml update
    
    # Export each itemclass to its own file
    for itemclass_name, elements in itemclass_data.items():
        if not elements:
            continue
        
        filename = f"{itemclass_name}.xml"
        xml_file = export_folder / filename
        
        try:
            # Create root <types> element
            root = ET.Element('types')
            
            # Add each type element
            for elem_data in elements:
                type_elem = reconstruct_xml_element(elem_data, 'type')
                if type_elem is not None:
                    root.append(type_elem)
            
            # Create tree and write with proper formatting
            tree = ET.ElementTree(root)
            
            # Pretty print (if available in Python 3.9+)
            try:
                ET.indent(tree, space='    ')
            except AttributeError:
                pass
            
            # Write to file with XML declaration
            with open(xml_file, 'wb') as f:
                f.write('<?xml version="1.0" encoding="UTF-8"?>\n'.encode('utf-8'))
                tree.write(f, encoding='utf-8', xml_declaration=False)
            
            exported_count += 1
            exported_files.append(filename)
        except Exception as e:
            error_count += 1
            error_msg = str(e)
            errors.append({
                'file': f"{export_subfolder}/{filename}",
                'error': error_msg
            })
            print(f"Error exporting {xml_file}: {e}")
    
    # Export unassigned elements to a special file
    if unassigned_elements:
        filename = "misc.xml"
        xml_file = export_folder / filename
        
        try:
            root = ET.Element('types')
            for elem_data in unassigned_elements:
                type_elem = reconstruct_xml_element(elem_data, 'type')
                if type_elem is not None:
                    root.append(type_elem)
            
            tree = ET.ElementTree(root)
            try:
                ET.indent(tree, space='    ')
            except AttributeError:
                pass
            
            with open(xml_file, 'wb') as f:
                f.write('<?xml version="1.0" encoding="UTF-8"?>\n'.encode('utf-8'))
                tree.write(f, encoding='utf-8', xml_declaration=False)
            
            exported_count += 1
            exported_files.append(filename)
        except Exception as e:
            error_count += 1
            errors.append({
                'file': f"{export_subfolder}/{filename}",
                'error': str(e)
            })
    
    conn.close()
    
    # Update cfgeconomycore.xml
    cfgeconomycore_result = update_cfgeconomycore_xml(mission_path, export_subfolder, exported_files)
    if not cfgeconomycore_result.get('success'):
        errors.append({
            'file': 'cfgeconomycore.xml',
            'error': cfgeconomycore_result.get('error', 'Unknown error')
        })
        error_count += 1
    
    return {
        'success': True,
        'exported_count': exported_count,
        'error_count': error_count,
        'errors': errors,
        'cfgeconomycore_updated': cfgeconomycore_result.get('success', False)
    }


def sanitize_filename(name):
    """Sanitize a string to be safe for use as a filename."""
    # Remove or replace invalid filename characters
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        name = name.replace(char, '_')
    # Remove leading/trailing spaces and dots
    name = name.strip(' .')
    # Replace multiple underscores with single
    while '__' in name:
        name = name.replace('__', '_')
    return name if name else 'unnamed'


def update_cfgeconomycore_xml(mission_path, export_subfolder, exported_files):
    """
    Update cfgeconomycore.xml to:
    1. Comment out existing <ce> elements (but skip already commented ones)
    2. If a <ce> element with the same folder attribute exists, replace it instead of commenting
    3. Add a new <ce> section with folder pointing to export_subfolder if it doesn't exist
    4. Add <file> elements for each exported file
    """
    cfgeconomycore_file = mission_path / 'cfgeconomycore.xml'
    
    try:
        if not cfgeconomycore_file.exists():
            # Create new file if it doesn't exist
            with open(cfgeconomycore_file, 'w', encoding='utf-8') as f:
                f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
                f.write('<economy>\n')
                f.write(f'    <ce folder="{export_subfolder}">\n')
                for filename in sorted(exported_files):
                    f.write(f'        <file name="{filename}" type="types" />\n')
                f.write(f'    </ce>\n')
                f.write('</economy>\n')
            return {'success': True}
        
        # Read existing file as text
        with open(cfgeconomycore_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        # Process lines to handle <ce> elements
        output_lines = []
        in_ce_block = False
        in_comment_block = False
        ce_block_lines = []
        ce_indent = ''
        ce_folder = None
        found_matching_ce = False
        
        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()
            
            # Check if we're entering a comment block
            if '<!--' in line:
                # Start of a comment block - preserve everything until -->
                in_comment_block = True
                output_lines.append(line)
                i += 1
                continue
            
            # Check if we're in a comment block - if so, preserve all lines until -->
            if in_comment_block:
                output_lines.append(line)
                if '-->' in line:
                    in_comment_block = False
                i += 1
                continue
            
            # Only process <ce> elements if we're NOT in a comment block
            # Check if this line starts a <ce> element (not commented)
            if stripped.startswith('<ce') and not stripped.startswith('<!--'):
                in_ce_block = True
                ce_indent = line[:len(line) - len(line.lstrip())]
                ce_block_lines = [line.rstrip('\n\r')]
                
                # Extract folder attribute
                import re
                folder_match = re.search(r'folder=["\']([^"\']+)["\']', line)
                if folder_match:
                    ce_folder = folder_match.group(1)
                else:
                    ce_folder = None
                
                i += 1
                continue
            
            # If we're in a ce block, collect lines until we find </ce>
            if in_ce_block:
                ce_block_lines.append(line.rstrip('\n\r'))
                if '</ce>' in stripped and not stripped.startswith('<!--'):
                    # End of ce block
                    # Check if folder matches export_subfolder
                    if ce_folder == export_subfolder:
                        # Replace this ce element with the new one
                        found_matching_ce = True
                        new_ce_lines = [
                            f'{ce_indent}<ce folder="{export_subfolder}">\n'
                        ]
                        for filename in sorted(exported_files):
                            new_ce_lines.append(f'{ce_indent}    <file name="{filename}" type="types" />\n')
                        new_ce_lines.append(f'{ce_indent}</ce>\n')
                        output_lines.extend(new_ce_lines)
                    else:
                        # Comment out this ce element
                        output_lines.append(f"{ce_indent}<!--\n")
                        for ce_line in ce_block_lines:
                            output_lines.append(f"{ce_line}\n")
                        output_lines.append(f"{ce_indent}-->\n")
                    
                    in_ce_block = False
                    ce_block_lines = []
                    ce_folder = None
                
                i += 1
                continue
            
            # Regular line - add it to output
            output_lines.append(line)
            i += 1
        
        # If we didn't find a matching ce element, add a new one
        if not found_matching_ce:
            # Find where to insert the new ce element (before closing root tag)
            insert_index = len(output_lines)
            for i in range(len(output_lines) - 1, -1, -1):
                if output_lines[i].strip().startswith('</') and not any(tag in output_lines[i] for tag in ['</file>', '</ce>', '<!--', '-->']):
                    insert_index = i
                    break
            
            # Determine indent from the closing tag
            if insert_index < len(output_lines):
                closing_line = output_lines[insert_index]
                indent = closing_line[:len(closing_line) - len(closing_line.lstrip())]
            else:
                indent = '    '
            
            # Insert new ce element
            new_ce_lines = [
                f'{indent}<ce folder="{export_subfolder}">\n'
            ]
            for filename in sorted(exported_files):
                new_ce_lines.append(f'{indent}    <file name="{filename}" type="types" />\n')
            new_ce_lines.append(f'{indent}</ce>\n')
            
            output_lines[insert_index:insert_index] = new_ce_lines
        
        # Write the updated file
        with open(cfgeconomycore_file, 'w', encoding='utf-8') as f:
            f.writelines(output_lines)
        
        return {'success': True}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {'success': False, 'error': str(e)}


def backup_database(mission_dir):
    """Create a backup of the database before merge operation."""
    db_file = get_db_path(mission_dir)
    if not db_file.exists():
        return {'success': False, 'error': 'Database does not exist'}
    
    backup_file = get_backup_path(mission_dir)
    try:
        shutil.copy2(db_file, backup_file)
        return {
            'success': True,
            'backup_path': str(backup_file),
            'backup_name': backup_file.name
        }
    except Exception as e:
        return {'success': False, 'error': f'Failed to create backup: {str(e)}'}


def restore_database_from_backup(mission_dir, backup_name):
    """Restore database from a backup file."""
    db_file = get_db_path(mission_dir)
    backup_file = get_backup_path(mission_dir, backup_name)
    
    if not backup_file.exists():
        return {'success': False, 'error': f'Backup file does not exist: {backup_name}'}
    
    temp_backup = None
    try:
        # Close any existing connections first
        # Create a temporary backup of current DB in case restore fails
        temp_backup = db_file.with_suffix('.db.temp')
        if db_file.exists():
            shutil.copy2(db_file, temp_backup)
        
        # Restore from backup
        shutil.copy2(backup_file, db_file)
        
        # Remove temp backup if restore succeeded
        if temp_backup.exists():
            temp_backup.unlink()
        
        return {'success': True, 'message': 'Database restored successfully'}
    except Exception as e:
        # Try to restore from temp backup if restore failed
        if temp_backup and temp_backup.exists() and db_file.exists():
            try:
                shutil.copy2(temp_backup, db_file)
                temp_backup.unlink()
            except:
                pass
        return {'success': False, 'error': f'Failed to restore backup: {str(e)}'}


def get_latest_backup(mission_dir):
    """Get the most recent backup file for a mission directory."""
    mission_path = Path(mission_dir)
    db_dir = mission_path / 'type-editor-db'
    
    if not db_dir.exists():
        return None
    
    # Find all backup files
    backup_files = list(db_dir.glob('editor_data_backup_*.db'))
    if not backup_files:
        return None
    
    # Sort by modification time, most recent first
    backup_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return backup_files[0].name


def merge_xml_file(mission_dir, xml_file_path, element_type='type'):
    """
    Merge a user-supplied XML file into the database.
    Skips existing elements with the same name (element_key).
    Returns statistics about the merge operation.
    """
    conn = get_db_connection(mission_dir)
    cursor = conn.cursor()
    
    xml_path = Path(xml_file_path)
    if not xml_path.exists():
        conn.close()
        return {
            'success': False,
            'error': f'XML file does not exist: {xml_file_path}',
            'added_count': 0,
            'skipped_count': 0
        }
    
    try:
        # Parse XML file
        tree = ET.parse(xml_path)
        root = tree.getroot()
        
        # Extract elements using the same function as load_xml_to_database
        elements = extract_element_data(root, element_type)
        
        added_count = 0
        skipped_count = 0
        errors = []
        
        # Get existing element keys to check for duplicates
        cursor.execute('SELECT element_key FROM type_elements')
        existing_keys = {row['element_key'] for row in cursor.fetchall()}
        
        for elem in elements:
            try:
                # Create unique key from name attribute
                name_value = elem.get('name')
                element_key = to_db_string(name_value)
                
                if not element_key:
                    # If no name, generate a unique key
                    element_key = f"element_{elem.get('type', 'unknown')}_merged_{Path(xml_file_path).stem}"
                
                # Skip if element already exists
                if element_key in existing_keys:
                    skipped_count += 1
                    continue
                
                # Normalize name for database storage
                name_for_db = to_db_string(name_value)
                
                # Store element data as JSON
                data_json = json.dumps(elem)
                
                # Insert new element (use INSERT OR IGNORE to be safe)
                cursor.execute('''
                    INSERT OR IGNORE INTO type_elements 
                    (element_key, name, data, source_file, source_folder, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (
                    element_key,
                    name_for_db,
                    data_json,
                    Path(xml_file_path).name,  # Use filename as source_file
                    'merged',  # Use 'merged' as source_folder to identify merged files
                    datetime.now().isoformat()
                ))
                
                # Check if insert was successful (not ignored)
                if cursor.rowcount > 0:
                    added_count += 1
                    existing_keys.add(element_key)  # Add to set to avoid duplicates in same merge
                else:
                    skipped_count += 1
                    
            except Exception as e:
                errors.append(f"Error processing element: {str(e)}")
                print(f"Error processing element in merge: {e}")
        
        conn.commit()
        conn.close()
        
        return {
            'success': True,
            'added_count': added_count,
            'skipped_count': skipped_count,
            'total_in_file': len(elements),
            'errors': errors
        }
        
    except ET.ParseError as e:
        conn.close()
        return {
            'success': False,
            'error': f'Invalid XML file: {str(e)}',
            'added_count': 0,
            'skipped_count': 0
        }
    except Exception as e:
        conn.close()
        return {
            'success': False,
            'error': f'Error processing XML file: {str(e)}',
            'added_count': 0,
            'skipped_count': 0
        }


@app.route('/api/export', methods=['POST'])
def export_to_xml():
    """Export database to XML files."""
    try:
        mission_dir = request.json.get('mission_dir', DEFAULT_MISSION_DIR)
        export_by_itemclass = request.json.get('export_by_itemclass', False)
        export_subfolder = request.json.get('export_subfolder', 'exported-types')
        result = export_database_to_xml(mission_dir, export_by_itemclass, export_subfolder)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/create-backup', methods=['POST'])
def create_backup():
    """Create a manual backup of the database."""
    try:
        mission_dir = request.json.get('mission_dir', DEFAULT_MISSION_DIR)
        result = backup_database(mission_dir)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/restore-backup', methods=['POST'])
def restore_backup():
    """Restore database from the most recent backup."""
    try:
        mission_dir = request.json.get('mission_dir', DEFAULT_MISSION_DIR)
        backup_name = request.json.get('backup_name')
        
        if not backup_name:
            # Get latest backup if not specified
            backup_name = get_latest_backup(mission_dir)
            if not backup_name:
                return jsonify({
                    'success': False,
                    'error': 'No backup found to restore'
                }), 404
        
        result = restore_database_from_backup(mission_dir, backup_name)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/get-backup-info', methods=['GET'])
def get_backup_info():
    """Get information about the latest backup."""
    try:
        mission_dir = request.args.get('mission_dir', DEFAULT_MISSION_DIR)
        backup_name = get_latest_backup(mission_dir)
        
        if backup_name:
            backup_path = get_backup_path(mission_dir, backup_name)
            if backup_path.exists():
                stat = backup_path.stat()
                return jsonify({
                    'success': True,
                    'backup_name': backup_name,
                    'backup_path': str(backup_path),
                    'backup_time': datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
        
        return jsonify({
            'success': False,
            'message': 'No backup found'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/merge-xml', methods=['POST'])
def merge_xml():
    """Merge a user-supplied XML file into the database."""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        mission_dir = request.form.get('mission_dir', DEFAULT_MISSION_DIR)
        element_type = request.form.get('element_type', 'type')
        
        # Save uploaded file temporarily
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xml') as tmp_file:
            file.save(tmp_file.name)
            tmp_path = tmp_file.name
        
        try:
            # Create backup before merge
            backup_result = backup_database(mission_dir)
            if not backup_result.get('success'):
                return jsonify({
                    'success': False,
                    'error': f'Failed to create backup: {backup_result.get("error", "Unknown error")}'
                }), 500
            
            # Perform merge
            merge_result = merge_xml_file(mission_dir, tmp_path, element_type)
            
            if merge_result.get('success'):
                merge_result['backup_name'] = backup_result.get('backup_name')
                merge_result['backup_path'] = backup_result.get('backup_path')
            
            return jsonify(merge_result)
        finally:
            # Clean up temporary file
            try:
                os.unlink(tmp_path)
            except:
                pass
                
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def import_from_database(mission_dir, source_db_path):
    """
    Import data from another database file into the current mission's database.
    Returns statistics about the import operation.
    """
    source_db = Path(source_db_path)
    if not source_db.exists():
        return {
            'success': False,
            'error': f'Source database does not exist: {source_db_path}',
            'imported_count': 0,
            'skipped_count': 0
        }
    
    # Create backup before import
    backup_result = backup_database(mission_dir)
    if not backup_result.get('success'):
        return {
            'success': False,
            'error': f'Failed to create backup: {backup_result.get("error", "Unknown error")}',
            'imported_count': 0,
            'skipped_count': 0
        }
    
    # Initialize target database
    init_database(mission_dir)
    target_conn = get_db_connection(mission_dir)
    target_cursor = target_conn.cursor()
    
    # Connect to source database
    source_conn = sqlite3.connect(str(source_db))
    source_conn.row_factory = sqlite3.Row
    source_cursor = source_conn.cursor()
    
    imported_count = 0
    skipped_count = 0
    
    try:
        # Get existing element keys in target database
        target_cursor.execute('SELECT element_key FROM type_elements')
        existing_keys = {row['element_key'] for row in target_cursor.fetchall()}
        
        # Import type_elements
        source_cursor.execute('SELECT element_key, name, data, source_file, source_folder FROM type_elements')
        for row in source_cursor.fetchall():
            element_key = row['element_key']
            
            if element_key in existing_keys:
                skipped_count += 1
                continue
            
            target_cursor.execute('''
                INSERT INTO type_elements (element_key, name, data, source_file, source_folder, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                element_key,
                row['name'],
                row['data'],
                row['source_file'],
                row['source_folder'],
                datetime.now().isoformat()
            ))
            existing_keys.add(element_key)
            imported_count += 1
        
        # Import itemclasses
        source_cursor.execute('SELECT id, name, description FROM itemclasses')
        itemclass_id_map = {}  # Map old ID to new ID
        for row in source_cursor.fetchall():
            old_id = row['id']
            name = row['name']
            description = row['description']
            
            # Check if itemclass with same name already exists
            target_cursor.execute('SELECT id FROM itemclasses WHERE name = ?', (name,))
            existing = target_cursor.fetchone()
            
            if existing:
                itemclass_id_map[old_id] = existing['id']
            else:
                target_cursor.execute('''
                    INSERT INTO itemclasses (name, description)
                    VALUES (?, ?)
                ''', (name, description))
                new_id = target_cursor.lastrowid
                itemclass_id_map[old_id] = new_id
        
        # Import itemtags
        source_cursor.execute('SELECT id, name, description FROM itemtags')
        itemtag_id_map = {}  # Map old ID to new ID
        for row in source_cursor.fetchall():
            old_id = row['id']
            name = row['name']
            description = row['description']
            
            # Check if itemtag with same name already exists
            target_cursor.execute('SELECT id FROM itemtags WHERE name = ?', (name,))
            existing = target_cursor.fetchone()
            
            if existing:
                itemtag_id_map[old_id] = existing['id']
            else:
                target_cursor.execute('''
                    INSERT INTO itemtags (name, description)
                    VALUES (?, ?)
                ''', (name, description))
                new_id = target_cursor.lastrowid
                itemtag_id_map[old_id] = new_id
        
        # Import element-itemclass assignments
        source_cursor.execute('SELECT element_key, itemclass_id FROM element_itemclasses')
        for row in source_cursor.fetchall():
            element_key = row['element_key']
            old_itemclass_id = row['itemclass_id']
            new_itemclass_id = itemclass_id_map.get(old_itemclass_id)
            
            if new_itemclass_id:
                # Check if element exists in target database
                target_cursor.execute('SELECT element_key FROM type_elements WHERE element_key = ?', (element_key,))
                if target_cursor.fetchone():
                    target_cursor.execute('''
                        INSERT OR REPLACE INTO element_itemclasses (element_key, itemclass_id)
                        VALUES (?, ?)
                    ''', (element_key, new_itemclass_id))
        
        # Import element-itemtag assignments
        source_cursor.execute('SELECT element_key, itemtag_id FROM element_itemtags')
        for row in source_cursor.fetchall():
            element_key = row['element_key']
            old_itemtag_id = row['itemtag_id']
            new_itemtag_id = itemtag_id_map.get(old_itemtag_id)
            
            if new_itemtag_id:
                # Check if element exists in target database
                target_cursor.execute('SELECT element_key FROM type_elements WHERE element_key = ?', (element_key,))
                if target_cursor.fetchone():
                    target_cursor.execute('''
                        INSERT OR IGNORE INTO element_itemtags (element_key, itemtag_id)
                        VALUES (?, ?)
                    ''', (element_key, new_itemtag_id))
        
        target_conn.commit()
        
        return {
            'success': True,
            'imported_count': imported_count,
            'skipped_count': skipped_count,
            'backup_name': backup_result.get('backup_name')
        }
        
    except Exception as e:
        target_conn.rollback()
        return {
            'success': False,
            'error': str(e),
            'imported_count': imported_count,
            'skipped_count': skipped_count
        }
    finally:
        target_conn.close()
        source_conn.close()


@app.route('/api/import-database', methods=['POST'])
def import_database():
    """Import data from another database file."""
    try:
        data = request.json
        mission_dir = data.get('mission_dir', DEFAULT_MISSION_DIR)
        source_db_path = data.get('source_db_path')
        
        if not source_db_path:
            return jsonify({'success': False, 'error': 'No source database path provided'}), 400
        
        result = import_from_database(mission_dir, source_db_path)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/events')
def stream_events():
    """Server-Sent Events endpoint for file change notifications."""
    def event_stream():
        while True:
            try:
                try:
                    file_change_queue.get(timeout=30)
                    yield f"data: {{'type': 'file_changed'}}\n\n"
                except queue.Empty:
                    yield f": keepalive\n\n"
            except GeneratorExit:
                break
    return Response(event_stream(), mimetype='text/event-stream')


if __name__ == '__main__':
    print(f"XML Data Editor starting...")
    print(f"Default mission directory: {DEFAULT_MISSION_DIR}")
    print(f"Database will be stored in: <mission_dir>/type-editor-db/editor_data.db")
    print(f"Open your browser to http://localhost:5001")
    app.run(debug=True, host='0.0.0.0', port=5001)

