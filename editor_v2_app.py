#!/usr/bin/env python3
"""
New Database Editor Application v2
Uses a properly normalized database schema without JSON blobs.
"""

import os
import sqlite3
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from flask import Flask, render_template, jsonify, request
from datetime import datetime
from collections import defaultdict

app = Flask(__name__)

# Default mission directory
DEFAULT_MISSION_DIR = r"E:\DayZ_Servers\Nyheim20_Server\mpmissions\empty.nyheim"
current_mission_dir = DEFAULT_MISSION_DIR


def get_db_path(mission_dir):
    """Get the database file path for a given mission directory."""
    mission_path = Path(mission_dir)
    db_dir = mission_path / 'type-editor-db-v2'
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / 'editor_data_v2.db'


def get_db_connection(mission_dir=None):
    """Get a database connection with row factory."""
    if mission_dir is None:
        mission_dir = current_mission_dir
    db_file = get_db_path(mission_dir)
    conn = sqlite3.connect(str(db_file))
    conn.row_factory = sqlite3.Row
    return conn


def infer_data_type(value):
    """Infer the SQLite data type from a Python value."""
    if value is None:
        return 'TEXT'  # Default for NULL
    
    if isinstance(value, bool):
        return 'INTEGER'  # SQLite uses INTEGER for booleans (0/1)
    elif isinstance(value, int):
        return 'INTEGER'
    elif isinstance(value, float):
        return 'REAL'
    elif isinstance(value, str):
        # Try to parse as number
        try:
            int(value)
            return 'INTEGER'
        except ValueError:
            try:
                float(value)
                return 'REAL'
            except ValueError:
                return 'TEXT'
    else:
        return 'TEXT'


def parse_cfglimitsdefinition(mission_dir):
    """
    Parse cfglimitsdefinition.xml to extract categories, tags, usageflags, and valueflags.
    Returns a dict with keys: categories, tags, usageflags, valueflags
    """
    xml_file = Path(mission_dir) / 'cfglimitsdefinition.xml'
    
    result = {
        'categories': [],
        'tags': [],
        'usageflags': [],
        'valueflags': []
    }
    
    if not xml_file.exists():
        return result
    
    try:
        tree = ET.parse(xml_file)
        root = tree.getroot()
        
        # Parse categories
        categories_elem = root.find('categories')
        if categories_elem is not None:
            for cat_elem in categories_elem.findall('category'):
                name = cat_elem.get('name')
                if name:
                    result['categories'].append({'name': name})
        
        # Parse tags
        tags_elem = root.find('tags')
        if tags_elem is not None:
            for tag_elem in tags_elem.findall('tag'):
                name = tag_elem.get('name')
                if name:
                    result['tags'].append({'name': name})
        
        # Parse usageflags
        usageflags_elem = root.find('usageflags')
        if usageflags_elem is not None:
            for usage_elem in usageflags_elem.findall('usage'):
                name = usage_elem.get('name')
                if name:
                    result['usageflags'].append({'name': name})
        
        # Parse valueflags
        valueflags_elem = root.find('valueflags')
        if valueflags_elem is not None:
            for value_elem in valueflags_elem.findall('value'):
                name = value_elem.get('name')
                if name:
                    result['valueflags'].append({'name': name})
    
    except Exception as e:
        print(f"Error parsing cfglimitsdefinition.xml: {e}")
    
    return result


def init_database(mission_dir=None):
    """Initialize the normalized database schema."""
    if mission_dir is None:
        mission_dir = current_mission_dir
    
    db_file = get_db_path(mission_dir)
    conn = sqlite3.connect(str(db_file))
    cursor = conn.cursor()
    
    # Parse cfglimitsdefinition.xml to get reference data
    ref_data = parse_cfglimitsdefinition(mission_dir)
    
    # Table: categories
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table: tags
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table: usageflags
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS usageflags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table: valueflags
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS valueflags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table: itemclasses
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS itemclasses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table: itemtags
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS itemtags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table: type_elements (main table)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS type_elements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            element_key TEXT UNIQUE NOT NULL,
            name TEXT,
            source_file TEXT,
            source_folder TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table: type_element_fields (normalized field storage)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS type_element_fields (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            element_key TEXT NOT NULL,
            field_name TEXT NOT NULL,
            field_value TEXT,
            data_type TEXT,
            field_order INTEGER,
            attributes_json TEXT,
            FOREIGN KEY (element_key) REFERENCES type_elements(element_key) ON DELETE CASCADE,
            UNIQUE(element_key, field_name, field_order)
        )
    ''')
    
    # Linking tables for many-to-many relationships
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS element_categories (
            element_key TEXT NOT NULL,
            category_id INTEGER NOT NULL,
            PRIMARY KEY (element_key, category_id),
            FOREIGN KEY (element_key) REFERENCES type_elements(element_key) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS element_tags (
            element_key TEXT NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (element_key, tag_id),
            FOREIGN KEY (element_key) REFERENCES type_elements(element_key) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS element_usageflags (
            element_key TEXT NOT NULL,
            usageflag_id INTEGER NOT NULL,
            PRIMARY KEY (element_key, usageflag_id),
            FOREIGN KEY (element_key) REFERENCES type_elements(element_key) ON DELETE CASCADE,
            FOREIGN KEY (usageflag_id) REFERENCES usageflags(id) ON DELETE CASCADE
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS element_valueflags (
            element_key TEXT NOT NULL,
            valueflag_id INTEGER NOT NULL,
            PRIMARY KEY (element_key, valueflag_id),
            FOREIGN KEY (element_key) REFERENCES type_elements(element_key) ON DELETE CASCADE,
            FOREIGN KEY (valueflag_id) REFERENCES valueflags(id) ON DELETE CASCADE
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS element_itemclasses (
            element_key TEXT PRIMARY KEY,
            itemclass_id INTEGER,
            FOREIGN KEY (element_key) REFERENCES type_elements(element_key) ON DELETE CASCADE,
            FOREIGN KEY (itemclass_id) REFERENCES itemclasses(id) ON DELETE SET NULL
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS element_itemtags (
            element_key TEXT NOT NULL,
            itemtag_id INTEGER NOT NULL,
            PRIMARY KEY (element_key, itemtag_id),
            FOREIGN KEY (element_key) REFERENCES type_elements(element_key) ON DELETE CASCADE,
            FOREIGN KEY (itemtag_id) REFERENCES itemtags(id) ON DELETE CASCADE
        )
    ''')
    
    # Table: flags (stores all possible flag names)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS flags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table: element_flags (stores which flags are set for each element)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS element_flags (
            element_key TEXT NOT NULL,
            flag_id INTEGER NOT NULL,
            value INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (element_key, flag_id),
            FOREIGN KEY (element_key) REFERENCES type_elements(element_key) ON DELETE CASCADE,
            FOREIGN KEY (flag_id) REFERENCES flags(id) ON DELETE CASCADE
        )
    ''')
    
    # Create indexes
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_element_key ON type_elements(element_key)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_field_element ON type_element_fields(element_key)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_field_name ON type_element_fields(field_name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_category_name ON categories(name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_tag_name ON tags(name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_usageflag_name ON usageflags(name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_valueflag_name ON valueflags(name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_flag_name ON flags(name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_element_flag_element ON element_flags(element_key)')
    
    # Populate reference tables from cfglimitsdefinition.xml
    for cat in ref_data['categories']:
        cursor.execute('INSERT OR IGNORE INTO categories (name) VALUES (?)', (cat['name'],))
    
    for tag in ref_data['tags']:
        cursor.execute('INSERT OR IGNORE INTO tags (name) VALUES (?)', (tag['name'],))
    
    for usage in ref_data['usageflags']:
        cursor.execute('INSERT OR IGNORE INTO usageflags (name) VALUES (?)', (usage['name'],))
    
    for value in ref_data['valueflags']:
        cursor.execute('INSERT OR IGNORE INTO valueflags (name) VALUES (?)', (value['name'],))
    
    conn.commit()
    conn.close()


def extract_element_data(root, element_type='type'):
    """
    Extract data from XML elements, matching the logic from editor_app.py.
    """
    results = []
    
    for element in root.findall(element_type):
        data = {}
        # Add attributes
        data.update(element.attrib)
        
        for child in element:
            child_tag = child.tag
            child_text = child.text.strip() if child.text and child.text.strip() else None
            child_attrib = dict(child.attrib)
            has_subchildren = len(child) > 0
            
            if has_subchildren:
                # Child has subchildren - store as nested structure
                child_data = {}
                child_data.update(child_attrib)
                
                for subchild in child:
                    subchild_text = subchild.text.strip() if subchild.text and subchild.text.strip() else None
                    subchild_attrib = dict(subchild.attrib)
                    
                    if len(subchild) == 0:
                        # Leaf node
                        if subchild_text:
                            subchild_value = subchild_text
                        elif subchild_attrib:
                            subchild_value = subchild_attrib
                        else:
                            continue
                    else:
                        # Has further nesting
                        subchild_value = {}
                        subchild_value.update(subchild_attrib)
                        for subsubchild in subchild:
                            subsubchild_text = subsubchild.text.strip() if subsubchild.text and subsubchild.text.strip() else None
                            if subsubchild_text:
                                subchild_value[subsubchild.tag] = subsubchild_text
                    
                    if subchild.tag not in child_data:
                        child_data[subchild.tag] = []
                    if not isinstance(child_data[subchild.tag], list):
                        child_data[subchild.tag] = [child_data[subchild.tag]]
                    child_data[subchild.tag].append(subchild_value)
                
                if child_tag not in data:
                    data[child_tag] = []
                if not isinstance(data[child_tag], list):
                    data[child_tag] = [data[child_tag]]
                data[child_tag].append(child_data)
            else:
                # Simple child element
                if child_attrib:
                    # Has attributes - store as object
                    child_obj = child_attrib.copy()
                    if child_text:
                        child_obj['_text'] = child_text
                    if child_tag not in data:
                        data[child_tag] = []
                    if not isinstance(data[child_tag], list):
                        data[child_tag] = [data[child_tag]]
                    data[child_tag].append(child_obj)
                elif child_text:
                    # Simple text content
                    if child_tag not in data:
                        data[child_tag] = child_text
                    else:
                        # Convert to list if multiple
                        if not isinstance(data[child_tag], list):
                            data[child_tag] = [data[child_tag]]
                        data[child_tag].append(child_text)
                else:
                    # Empty element - skip or store as empty dict
                    pass
        
        results.append(data)
    
    return results


def load_xml_to_database(mission_dir, element_type='type'):
    """
    Load XML files from mission directory and populate normalized database.
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
    
    # 1. Always include db/types.xml
    db_types_file = mission_path / 'db' / 'types.xml'
    files_to_load.append(('db/types.xml', 'db', 'types.xml', db_types_file))
    
    # 2. Parse cfgeconomycore.xml to find all type files
    cfgeconomycore_file = mission_path / 'cfgeconomycore.xml'
    if cfgeconomycore_file.exists():
        try:
            tree = ET.parse(cfgeconomycore_file)
            root = tree.getroot()
            
            for ce_element in root.findall('.//ce'):
                ce_folder_attr = ce_element.get('folder')
                if not ce_folder_attr:
                    continue
                
                ce_folder_attr = ce_folder_attr.replace('\\', '/').strip('/')
                ce_folder_path = mission_path / ce_folder_attr
                
                for file_element in ce_element.findall('.//file'):
                    file_type = file_element.get('type')
                    file_name = file_element.get('name')
                    if file_type == 'types' and file_name:
                        full_file_path = ce_folder_path / file_name
                        source_folder = ce_folder_attr
                        source_file = file_name
                        files_to_load.append((f"{source_folder}/{source_file}", source_folder, source_file, full_file_path))
        except Exception as e:
            print(f"Error parsing cfgeconomycore.xml: {e}")
    
    # 3. Load all identified files
    for file_info in files_to_load:
        source_identifier, source_folder, source_file, full_file_path = file_info
        
        if not full_file_path.exists():
            continue
        
        try:
            tree = ET.parse(full_file_path)
            root = tree.getroot()
            
            elements = extract_element_data(root, element_type)
            
            for elem in elements:
                # Get name for element_key
                name_value = elem.get('name')
                if not name_value:
                    continue
                
                element_key = str(name_value)
                
                # Insert or update type_elements
                cursor.execute('''
                    INSERT OR REPLACE INTO type_elements 
                    (element_key, name, source_file, source_folder, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                ''', (element_key, name_value, source_file, source_folder, datetime.now().isoformat()))
                
                # Delete existing fields for this element
                cursor.execute('DELETE FROM type_element_fields WHERE element_key = ?', (element_key,))
                
                # Process each field and save to type_element_fields
                for field_name, field_value in elem.items():
                    if field_name == 'name':
                        continue  # Already stored in type_elements.name
                    
                    # Handle categories
                    if field_name == 'category':
                        if isinstance(field_value, dict) and 'name' in field_value:
                            cat_name = field_value['name']
                            cursor.execute('SELECT id FROM categories WHERE name = ?', (cat_name,))
                            cat_row = cursor.fetchone()
                            if cat_row:
                                cursor.execute('''
                                    INSERT OR REPLACE INTO element_categories (element_key, category_id)
                                    VALUES (?, ?)
                                ''', (element_key, cat_row['id']))
                        elif isinstance(field_value, list):
                            for cat_item in field_value:
                                if isinstance(cat_item, dict) and 'name' in cat_item:
                                    cat_name = cat_item['name']
                                    cursor.execute('SELECT id FROM categories WHERE name = ?', (cat_name,))
                                    cat_row = cursor.fetchone()
                                    if cat_row:
                                        cursor.execute('''
                                            INSERT OR REPLACE INTO element_categories (element_key, category_id)
                                            VALUES (?, ?)
                                        ''', (element_key, cat_row['id']))
                        continue
                    
                    # Handle tags
                    if field_name == 'tag':
                        tag_names = []
                        if isinstance(field_value, dict) and 'name' in field_value:
                            tag_names = [field_value['name']]
                        elif isinstance(field_value, list):
                            tag_names = [item.get('name') for item in field_value if isinstance(item, dict) and 'name' in item]
                        
                        for tag_name in tag_names:
                            cursor.execute('SELECT id FROM tags WHERE name = ?', (tag_name,))
                            tag_row = cursor.fetchone()
                            if tag_row:
                                cursor.execute('''
                                    INSERT OR REPLACE INTO element_tags (element_key, tag_id)
                                    VALUES (?, ?)
                                ''', (element_key, tag_row['id']))
                        continue
                    
                    # Handle usage
                    if field_name == 'usage':
                        usage_names = []
                        if isinstance(field_value, dict) and 'name' in field_value:
                            usage_names = [field_value['name']]
                        elif isinstance(field_value, list):
                            usage_names = [item.get('name') for item in field_value if isinstance(item, dict) and 'name' in item]
                        
                        for usage_name in usage_names:
                            cursor.execute('SELECT id FROM usageflags WHERE name = ?', (usage_name,))
                            usage_row = cursor.fetchone()
                            if usage_row:
                                cursor.execute('''
                                    INSERT OR REPLACE INTO element_usageflags (element_key, usageflag_id)
                                    VALUES (?, ?)
                                ''', (element_key, usage_row['id']))
                        continue
                    
                    # Handle value
                    if field_name == 'value':
                        value_names = []
                        if isinstance(field_value, dict) and 'name' in field_value:
                            value_names = [field_value['name']]
                        elif isinstance(field_value, list):
                            value_names = [item.get('name') for item in field_value if isinstance(item, dict) and 'name' in item]
                        
                        for value_name in value_names:
                            cursor.execute('SELECT id FROM valueflags WHERE name = ?', (value_name,))
                            value_row = cursor.fetchone()
                            if value_row:
                                cursor.execute('''
                                    INSERT OR REPLACE INTO element_valueflags (element_key, valueflag_id)
                                    VALUES (?, ?)
                                ''', (element_key, value_row['id']))
                        continue
                    
                    # Handle flags - extract attributes as boolean flags
                    if field_name == 'flags':
                        # flags can be a dict or a list containing dict(s)
                        flags_dict = None
                        if isinstance(field_value, dict):
                            flags_dict = field_value
                        elif isinstance(field_value, list) and len(field_value) > 0:
                            # If it's a list, take the first dict (or merge all dicts)
                            flags_dict = {}
                            for item in field_value:
                                if isinstance(item, dict):
                                    flags_dict.update(item)
                        
                        if flags_dict:
                            for flag_name, flag_value in flags_dict.items():
                                if flag_name == '_text':
                                    continue
                                # Only store flags that are set to 1
                                if str(flag_value) == '1' or flag_value == 1:
                                    # Ensure flag exists in flags table
                                    cursor.execute('SELECT id FROM flags WHERE name = ?', (flag_name,))
                                    flag_row = cursor.fetchone()
                                    if not flag_row:
                                        cursor.execute('INSERT INTO flags (name) VALUES (?)', (flag_name,))
                                        flag_id = cursor.lastrowid
                                    else:
                                        flag_id = flag_row['id']
                                    
                                    # Store flag assignment
                                    cursor.execute('''
                                        INSERT OR REPLACE INTO element_flags (element_key, flag_id, value)
                                        VALUES (?, ?, 1)
                                    ''', (element_key, flag_id))
                        continue
                    
                    # Handle regular fields
                    if field_value is None:
                        continue
                    elif isinstance(field_value, list):
                        # Array field
                        for order, item in enumerate(field_value):
                            if isinstance(item, dict):
                                text_value = item.get('_text') or item.get('name') or None
                                attrs = {k: v for k, v in item.items() if k != '_text'}
                                data_type = infer_data_type(text_value)
                                attrs_json = json.dumps(attrs) if attrs else None
                                cursor.execute('''
                                    INSERT INTO type_element_fields 
                                    (element_key, field_name, field_value, data_type, field_order, attributes_json)
                                    VALUES (?, ?, ?, ?, ?, ?)
                                ''', (element_key, field_name, str(text_value) if text_value else None, data_type, order, attrs_json))
                            else:
                                data_type = infer_data_type(item)
                                cursor.execute('''
                                    INSERT INTO type_element_fields 
                                    (element_key, field_name, field_value, data_type, field_order, attributes_json)
                                    VALUES (?, ?, ?, ?, ?, NULL)
                                ''', (element_key, field_name, str(item), data_type, order))
                    elif isinstance(field_value, dict):
                        # Object field
                        text_value = field_value.get('_text') or field_value.get('name') or None
                        attrs = {k: v for k, v in field_value.items() if k != '_text'}
                        data_type = infer_data_type(text_value)
                        attrs_json = json.dumps(attrs) if attrs else None
                        cursor.execute('''
                            INSERT INTO type_element_fields 
                            (element_key, field_name, field_value, data_type, field_order, attributes_json)
                            VALUES (?, ?, ?, ?, NULL, ?)
                        ''', (element_key, field_name, str(text_value) if text_value else None, data_type, attrs_json))
                    else:
                        # Simple value
                        data_type = infer_data_type(field_value)
                        cursor.execute('''
                            INSERT INTO type_element_fields 
                            (element_key, field_name, field_value, data_type, field_order, attributes_json)
                            VALUES (?, ?, ?, ?, NULL, NULL)
                        ''', (element_key, field_name, str(field_value), data_type))
                
                element_count += 1
            
            file_count += 1
        except Exception as e:
            print(f"Error processing {full_file_path}: {e}")
            import traceback
            traceback.print_exc()
    
    conn.commit()
    conn.close()
    
    return {
        'file_count': file_count,
        'element_count': element_count
    }


@app.route('/')
def index():
    """Main page."""
    return render_template('editor_v2.html')


@app.route('/api/load', methods=['POST'])
def load_data():
    """Load XML data into the database."""
    try:
        data = request.json
        mission_dir = data.get('mission_dir', current_mission_dir)
        element_type = data.get('element_type', 'type')
        
        # Initialize database
        init_database(mission_dir)
        
        # Load XML data
        result = load_xml_to_database(mission_dir, element_type)
        
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
        mission_dir = request.args.get('mission_dir', current_mission_dir)
        conn = get_db_connection(mission_dir)
        cursor = conn.cursor()
        
        # Get all elements
        cursor.execute('''
            SELECT element_key, name, source_file, source_folder
            FROM type_elements
            ORDER BY name
        ''')
        
        elements = []
        for row in cursor.fetchall():
            element_key = row['element_key']
            
            # Load fields from type_element_fields
            cursor.execute('''
                SELECT field_name, field_value, data_type, field_order, attributes_json
                FROM type_element_fields
                WHERE element_key = ?
                ORDER BY field_name, field_order
            ''', (element_key,))
            
            data = {}
            # Add name from type_elements table
            if row['name']:
                data['name'] = row['name']
            
            for field_row in cursor.fetchall():
                field_name = field_row['field_name']
                field_value = field_row['field_value']
                field_order = field_row['field_order']
                attributes_json = field_row['attributes_json']
                
                if field_order is not None:
                    # Array field
                    if field_name not in data:
                        data[field_name] = []
                    if attributes_json:
                        attrs = json.loads(attributes_json)
                        if field_value:
                            attrs['_text'] = field_value
                        data[field_name].append(attrs)
                    else:
                        data[field_name].append(field_value)
                else:
                    # Single value
                    if attributes_json:
                        attrs = json.loads(attributes_json)
                        if field_value:
                            attrs['_text'] = field_value
                        data[field_name] = attrs
                    else:
                        data[field_name] = field_value
            
            # Get categories
            cursor.execute('''
                SELECT c.id, c.name
                FROM categories c
                JOIN element_categories ec ON c.id = ec.category_id
                WHERE ec.element_key = ?
            ''', (element_key,))
            categories = [{'id': r['id'], 'name': r['name']} for r in cursor.fetchall()]
            data['_categories'] = categories
            data['_category_names'] = [c['name'] for c in categories]
            
            # Get tags
            cursor.execute('''
                SELECT t.id, t.name
                FROM tags t
                JOIN element_tags et ON t.id = et.tag_id
                WHERE et.element_key = ?
            ''', (element_key,))
            tags = [{'id': r['id'], 'name': r['name']} for r in cursor.fetchall()]
            data['_tags'] = tags
            data['_tag_names'] = [t['name'] for t in tags]
            
            # Get usageflags
            cursor.execute('''
                SELECT u.id, u.name
                FROM usageflags u
                JOIN element_usageflags eu ON u.id = eu.usageflag_id
                WHERE eu.element_key = ?
            ''', (element_key,))
            usageflags = [{'id': r['id'], 'name': r['name']} for r in cursor.fetchall()]
            data['_usageflags'] = usageflags
            data['_usageflag_names'] = [u['name'] for u in usageflags]
            
            # Get valueflags
            cursor.execute('''
                SELECT v.id, v.name
                FROM valueflags v
                JOIN element_valueflags ev ON v.id = ev.valueflag_id
                WHERE ev.element_key = ?
            ''', (element_key,))
            valueflags = [{'id': r['id'], 'name': r['name']} for r in cursor.fetchall()]
            data['_valueflags'] = valueflags
            data['_valueflag_names'] = [v['name'] for v in valueflags]
            
            # Get itemclass (always set, even if None)
            cursor.execute('''
                SELECT ic.id, ic.name
                FROM itemclasses ic
                JOIN element_itemclasses eic ON ic.id = eic.itemclass_id
                WHERE eic.element_key = ?
            ''', (element_key,))
            itemclass_row = cursor.fetchone()
            data['_itemclass_id'] = itemclass_row['id'] if itemclass_row else None
            data['_itemclass_name'] = itemclass_row['name'] if itemclass_row else None
            
            # Get itemtags
            cursor.execute('''
                SELECT it.id, it.name
                FROM itemtags it
                JOIN element_itemtags eit ON it.id = eit.itemtag_id
                WHERE eit.element_key = ?
            ''', (element_key,))
            itemtags = [{'id': r['id'], 'name': r['name']} for r in cursor.fetchall()]
            data['_itemtags'] = itemtags
            data['_itemtag_names'] = [it['name'] for it in itemtags]
            
            # Get flags
            cursor.execute('''
                SELECT f.id, f.name
                FROM flags f
                JOIN element_flags ef ON f.id = ef.flag_id
                WHERE ef.element_key = ? AND ef.value = 1
            ''', (element_key,))
            flags = [{'id': r['id'], 'name': r['name']} for r in cursor.fetchall()]
            data['_flags'] = flags
            data['_flag_names'] = [f['name'] for f in flags]
            
            # Add metadata
            data['_element_key'] = element_key
            data['_source_file'] = row['source_file']
            data['_source_folder'] = row['source_folder']
            folder_name = row['source_folder'] if row['source_folder'] else ''
            source_file = row['source_file'] if row['source_file'] else ''
            data['source'] = f"{folder_name}/{source_file}" if folder_name else source_file
            
            elements.append(data)
        
        conn.close()
        
        return jsonify({
            'success': True,
            'elements': elements,
            'total': len(elements)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/reference-data')
def get_reference_data():
    """Get all reference data (categories, tags, usageflags, valueflags, itemclasses, itemtags)."""
    try:
        mission_dir = request.args.get('mission_dir', current_mission_dir)
        conn = get_db_connection(mission_dir)
        cursor = conn.cursor()
        
        # Get all reference tables
        cursor.execute('SELECT id, name FROM categories ORDER BY name')
        categories = [{'id': r['id'], 'name': r['name']} for r in cursor.fetchall()]
        
        cursor.execute('SELECT id, name FROM tags ORDER BY name')
        tags = [{'id': r['id'], 'name': r['name']} for r in cursor.fetchall()]
        
        cursor.execute('SELECT id, name FROM usageflags ORDER BY name')
        usageflags = [{'id': r['id'], 'name': r['name']} for r in cursor.fetchall()]
        
        cursor.execute('SELECT id, name FROM valueflags ORDER BY name')
        valueflags = [{'id': r['id'], 'name': r['name']} for r in cursor.fetchall()]
        
        cursor.execute('SELECT id, name, description FROM itemclasses ORDER BY name')
        itemclasses = [{'id': r['id'], 'name': r['name'], 'description': r['description']} for r in cursor.fetchall()]
        
        cursor.execute('SELECT id, name, description FROM itemtags ORDER BY name')
        itemtags = [{'id': r['id'], 'name': r['name'], 'description': r['description']} for r in cursor.fetchall()]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'categories': categories,
            'tags': tags,
            'usageflags': usageflags,
            'valueflags': valueflags,
            'itemclasses': itemclasses,
            'itemtags': itemtags
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def reconstruct_xml_element(data_dict, element_tag='type'):
    """Reconstruct an XML element from normalized data."""
    elem = ET.Element(element_tag)
    
    # Add name attribute if present
    if 'name' in data_dict:
        elem.set('name', str(data_dict['name']))
    
    # Process fields (skip internal fields)
    for field_name, field_value in data_dict.items():
        if field_name.startswith('_'):
            continue
        
        if field_value is None:
            continue
        elif field_name == 'flags' and isinstance(field_value, dict):
            # Flags are stored as a dict with attributes
            flags_elem = ET.Element('flags')
            for flag_name, flag_value in field_value.items():
                if str(flag_value) == '1' or flag_value == 1:
                    flags_elem.set(flag_name, '1')
            # Only add flags element if it has at least one attribute
            if len(flags_elem.attrib) > 0:
                elem.append(flags_elem)
        elif isinstance(field_value, list):
            for item in field_value:
                child = reconstruct_child_element(field_name, item)
                if child is not None:
                    elem.append(child)
        elif isinstance(field_value, dict):
            child = reconstruct_child_element(field_name, field_value)
            if child is not None:
                elem.append(child)
        else:
            child = ET.Element(field_name)
            child.text = str(field_value)
            elem.append(child)
    
    return elem


def reconstruct_child_element(tag, value):
    """Reconstruct a child XML element."""
    if isinstance(value, dict):
        child = ET.Element(tag)
        for key, val in value.items():
            if key == '_text':
                child.text = str(val) if val else None
            else:
                child.set(key, str(val))
        return child
    elif isinstance(value, str):
        child = ET.Element(tag)
        child.text = value
        return child
    else:
        return None


def export_database_to_xml(mission_dir, export_by_itemclass=False, export_subfolder='exported-types'):
    """
    Export database contents back to XML files.
    Supports both normal export and export by itemclass.
    """
    conn = get_db_connection(mission_dir)
    cursor = conn.cursor()
    
    mission_path = Path(mission_dir)
    if not mission_path.exists():
        conn.close()
        return {'success': False, 'error': 'Mission directory does not exist'}
    
    if export_by_itemclass:
        return export_by_itemclass_to_xml(mission_dir, export_subfolder, conn, cursor, mission_path)
    
    # Normal export - group by source file
    cursor.execute('''
        SELECT DISTINCT source_folder, source_file
        FROM type_elements
        WHERE source_file IS NOT NULL AND source_folder IS NOT NULL
        ORDER BY source_folder, source_file
    ''')
    
    files_data = defaultdict(list)
    for row in cursor.fetchall():
        source_folder = row['source_folder']
        source_file = row['source_file']
        
        # Get all elements for this file
        cursor.execute('''
            SELECT element_key
            FROM type_elements
            WHERE source_folder = ? AND source_file = ?
        ''', (source_folder, source_file))
        
        for elem_row in cursor.fetchall():
            element_key = elem_row['element_key']
            
            # Load element data
            data = load_element_data(cursor, element_key)
            files_data[(source_folder, source_file)].append(data)
    
    conn.close()
    
    # Export each file
    exported_count = 0
    error_count = 0
    errors = []
    
    for (folder_name, filename), elements in files_data.items():
        xml_file = mission_path / folder_name / filename
        xml_file.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            root = ET.Element('types')
            for elem_data in elements:
                type_elem = reconstruct_xml_element(elem_data, 'type')
                root.append(type_elem)
            
            tree = ET.ElementTree(root)
            ET.indent(tree, space='    ')
            
            with open(xml_file, 'wb') as f:
                f.write('<?xml version="1.0" encoding="UTF-8"?>\n'.encode('utf-8'))
                tree.write(f, encoding='utf-8', xml_declaration=False)
            
            exported_count += 1
        except Exception as e:
            error_count += 1
            errors.append({'file': str(xml_file), 'error': str(e)})
    
    return {
        'success': True,
        'exported_count': exported_count,
        'error_count': error_count,
        'errors': errors
    }


def load_element_data(cursor, element_key):
    """Load complete element data from normalized tables."""
    data = {}
    
    # Get element name
    cursor.execute('SELECT name FROM type_elements WHERE element_key = ?', (element_key,))
    name_row = cursor.fetchone()
    if name_row and name_row['name']:
        data['name'] = name_row['name']
    
    # Load fields
    cursor.execute('''
        SELECT field_name, field_value, field_order, attributes_json
        FROM type_element_fields
        WHERE element_key = ?
        ORDER BY field_name, field_order
    ''', (element_key,))
    
    for field_row in cursor.fetchall():
        field_name = field_row['field_name']
        field_value = field_row['field_value']
        field_order = field_row['field_order']
        attributes_json = field_row['attributes_json']
        
        if field_order is not None:
            if field_name not in data:
                data[field_name] = []
            if attributes_json:
                attrs = json.loads(attributes_json)
                if field_value:
                    attrs['_text'] = field_value
                data[field_name].append(attrs)
            else:
                data[field_name].append(field_value)
        else:
            if attributes_json:
                attrs = json.loads(attributes_json)
                if field_value:
                    attrs['_text'] = field_value
                data[field_name] = attrs
            else:
                data[field_name] = field_value
    
    # Add categories
    cursor.execute('''
        SELECT c.name
        FROM categories c
        JOIN element_categories ec ON c.id = ec.category_id
        WHERE ec.element_key = ?
    ''', (element_key,))
    categories = [r['name'] for r in cursor.fetchall()]
    if categories:
        data['category'] = [{'name': name} for name in categories]
    
    # Add tags
    cursor.execute('''
        SELECT t.name
        FROM tags t
        JOIN element_tags et ON t.id = et.tag_id
        WHERE et.element_key = ?
    ''', (element_key,))
    tags = [r['name'] for r in cursor.fetchall()]
    if tags:
        data['tag'] = [{'name': name} for name in tags]
    
    # Add usageflags
    cursor.execute('''
        SELECT u.name
        FROM usageflags u
        JOIN element_usageflags eu ON u.id = eu.usageflag_id
        WHERE eu.element_key = ?
    ''', (element_key,))
    usageflags = [r['name'] for r in cursor.fetchall()]
    if usageflags:
        data['usage'] = [{'name': name} for name in usageflags]
    
    # Add valueflags
    cursor.execute('''
        SELECT v.name
        FROM valueflags v
        JOIN element_valueflags ev ON v.id = ev.valueflag_id
        WHERE ev.element_key = ?
    ''', (element_key,))
    valueflags = [r['name'] for r in cursor.fetchall()]
    if valueflags:
        data['value'] = [{'name': name} for name in valueflags]
    
    # Add flags - reconstruct as attributes dict
    cursor.execute('''
        SELECT f.name
        FROM flags f
        JOIN element_flags ef ON f.id = ef.flag_id
        WHERE ef.element_key = ? AND ef.value = 1
    ''', (element_key,))
    flag_names = [r['name'] for r in cursor.fetchall()]
    if flag_names:
        # Create flags dict with all flags set to 1
        flags_dict = {name: '1' for name in flag_names}
        data['flags'] = flags_dict
    
    return data


def export_by_itemclass_to_xml(mission_dir, export_subfolder, conn, cursor, mission_path):
    """Export elements grouped by itemclass."""
    # Get all elements with itemclasses
    cursor.execute('''
        SELECT te.element_key, ic.name as itemclass_name
        FROM type_elements te
        LEFT JOIN element_itemclasses eic ON te.element_key = eic.element_key
        LEFT JOIN itemclasses ic ON eic.itemclass_id = ic.id
        ORDER BY ic.name, te.name
    ''')
    
    itemclass_data = defaultdict(list)
    unassigned_elements = []
    
    for row in cursor.fetchall():
        element_key = row['element_key']
        itemclass_name = row['itemclass_name']
        
        data = load_element_data(cursor, element_key)
        
        if itemclass_name:
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
    exported_files = []
    
    # Export each itemclass
    for itemclass_name, elements in itemclass_data.items():
        if not elements:
            continue
        
        filename = f"{itemclass_name}.xml"
        xml_file = export_folder / filename
        
        try:
            root = ET.Element('types')
            for elem_data in elements:
                type_elem = reconstruct_xml_element(elem_data, 'type')
                root.append(type_elem)
            
            tree = ET.ElementTree(root)
            ET.indent(tree, space='    ')
            
            with open(xml_file, 'wb') as f:
                f.write('<?xml version="1.0" encoding="UTF-8"?>\n'.encode('utf-8'))
                tree.write(f, encoding='utf-8', xml_declaration=False)
            
            exported_count += 1
            exported_files.append(filename)
        except Exception as e:
            error_count += 1
            errors.append({'file': str(xml_file), 'error': str(e)})
    
    # Export unassigned elements to misc.xml
    if unassigned_elements:
        xml_file = export_folder / 'misc.xml'
        try:
            root = ET.Element('types')
            for elem_data in unassigned_elements:
                type_elem = reconstruct_xml_element(elem_data, 'type')
                root.append(type_elem)
            
            tree = ET.ElementTree(root)
            ET.indent(tree, space='    ')
            
            with open(xml_file, 'wb') as f:
                f.write('<?xml version="1.0" encoding="UTF-8"?>\n'.encode('utf-8'))
                tree.write(f, encoding='utf-8', xml_declaration=False)
            
            exported_count += 1
            exported_files.append('misc.xml')
        except Exception as e:
            error_count += 1
            errors.append({'file': str(xml_file), 'error': str(e)})
    
    # Update cfgeconomycore.xml
    cfgeconomycore_updated = update_cfgeconomycore_xml(mission_path, export_subfolder, exported_files)
    
    return {
        'success': True,
        'exported_count': exported_count,
        'error_count': error_count,
        'errors': errors,
        'cfgeconomycore_updated': cfgeconomycore_updated
    }


def sanitize_filename(name):
    """Sanitize a string for use as a filename."""
    import re
    # Remove invalid characters
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    return name.strip()


def update_cfgeconomycore_xml(mission_path, export_subfolder, exported_files):
    """Update cfgeconomycore.xml with new ce section."""
    cfgeconomycore_file = mission_path / 'cfgeconomycore.xml'
    
    if not cfgeconomycore_file.exists():
        return False
    
    try:
        # Read existing file
        with open(cfgeconomycore_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        # Find existing ce elements with matching folder
        new_lines = []
        in_comment_block = False
        found_matching_ce = False
        ce_start_idx = None
        ce_end_idx = None
        
        i = 0
        while i < len(lines):
            line = lines[i]
            
            # Track comment blocks
            if '<!--' in line:
                in_comment_block = True
            if '-->' in line:
                in_comment_block = False
                new_lines.append(line)
                i += 1
                continue
            
            if in_comment_block:
                new_lines.append(line)
                i += 1
                continue
            
            # Look for <ce folder="export_subfolder">
            if f'<ce folder="{export_subfolder}"' in line or f"<ce folder='{export_subfolder}'" in line:
                found_matching_ce = True
                ce_start_idx = len(new_lines)
                # Skip until </ce>
                while i < len(lines) and '</ce>' not in lines[i]:
                    i += 1
                if i < len(lines):
                    ce_end_idx = len(new_lines)
                    i += 1  # Skip the </ce> line
                continue
            
            new_lines.append(line)
            i += 1
        
        # Create new ce section
        ce_section = []
        ce_section.append(f'    <ce folder="{export_subfolder}">\n')
        for filename in sorted(exported_files):
            ce_section.append(f'        <file name="{filename}" type="types" />\n')
        ce_section.append('    </ce>\n')
        
        # Insert or replace
        if found_matching_ce and ce_start_idx is not None:
            # Replace existing ce
            new_lines[ce_start_idx:ce_end_idx+1] = ce_section
        else:
            # Find insertion point (before closing </cfglimitsdefinition> or at end)
            insert_idx = len(new_lines)
            for idx, line in enumerate(new_lines):
                if '</cfglimitsdefinition>' in line:
                    insert_idx = idx
                    break
            new_lines.insert(insert_idx, '\n')
            new_lines.insert(insert_idx + 1, ''.join(ce_section))
        
        # Write back
        with open(cfgeconomycore_file, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        
        return True
    except Exception as e:
        print(f"Error updating cfgeconomycore.xml: {e}")
        return False


@app.route('/api/elements/<element_key>/field/<field_name>', methods=['PUT'])
def update_field(element_key, field_name):
    """Update a field value for an element."""
    try:
        from urllib.parse import unquote
        element_key = unquote(element_key)
        
        if not request.json:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        data = request.json
        new_value = data.get('value')
        mission_dir = data.get('mission_dir', current_mission_dir)
        
        if new_value is None:
            return jsonify({'error': 'Value is required'}), 400
        
        conn = get_db_connection(mission_dir)
        cursor = conn.cursor()
        
        # Check if element exists
        cursor.execute('SELECT element_key FROM type_elements WHERE element_key = ?', (element_key,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Element not found'}), 404
        
        # Get current field value
        cursor.execute('''
            SELECT field_value, attributes_json
            FROM type_element_fields
            WHERE element_key = ? AND field_name = ? AND field_order IS NULL
        ''', (element_key, field_name))
        field_row = cursor.fetchone()
        
        old_value = field_row['field_value'] if field_row else None
        
        # Try to convert to number if it's a numeric field
        numeric_fields = ['nominal', 'lifetime', 'restock', 'min', 'quantmin', 'quantmax', 'cost']
        if field_name in numeric_fields:
            try:
                new_value = float(new_value) if '.' in str(new_value) else int(new_value)
            except (ValueError, TypeError):
                pass  # Keep as string if conversion fails
        
        # Update or insert the field
        if field_row:
            # Update existing field
            cursor.execute('''
                UPDATE type_element_fields
                SET field_value = ?, data_type = ?
                WHERE element_key = ? AND field_name = ? AND field_order IS NULL
            ''', (str(new_value), infer_data_type(new_value), element_key, field_name))
        else:
            # Insert new field
            cursor.execute('''
                INSERT INTO type_element_fields
                (element_key, field_name, field_value, data_type, field_order, attributes_json)
                VALUES (?, ?, ?, ?, NULL, NULL)
            ''', (element_key, field_name, str(new_value), infer_data_type(new_value)))
        
        # Update the updated_at timestamp in type_elements
        cursor.execute('''
            UPDATE type_elements
            SET updated_at = ?
            WHERE element_key = ?
        ''', (datetime.now().isoformat(), element_key))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/export', methods=['POST'])
def export_to_xml():
    """Export database to XML files."""
    try:
        data = request.json
        mission_dir = data.get('mission_dir', current_mission_dir)
        export_by_itemclass = data.get('export_by_itemclass', False)
        export_subfolder = data.get('export_subfolder', 'exported-types')
        
        result = export_database_to_xml(mission_dir, export_by_itemclass, export_subfolder)
        
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    print("Editor v2 starting...")
    print(f"Default mission directory: {DEFAULT_MISSION_DIR}")
    print(f"Open your browser to http://localhost:5004")
    app.run(debug=True, host='0.0.0.0', port=5004)

