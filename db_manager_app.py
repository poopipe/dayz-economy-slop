#!/usr/bin/env python3
"""
Database Manager Application for viewing and modifying the editor database.
"""

import os
import json
import sqlite3
from pathlib import Path
from flask import Flask, render_template, jsonify, request
from collections import defaultdict
from datetime import datetime

app = Flask(__name__)

# Default mission directory
DEFAULT_MISSION_DIR = r"E:\DayZ_Servers\Nyheim20_Server\mpmissions\empty.nyheim"


def get_db_path(mission_dir):
    """Get the database file path for a given mission directory."""
    mission_path = Path(mission_dir)
    db_dir = mission_path / 'type-editor-db'
    return db_dir / 'editor_data.db'


def get_db_connection_from_path(db_path_or_mission_dir):
    """Get a database connection with row factory.
    Accepts either a direct database file path or a mission directory.
    """
    db_path = Path(db_path_or_mission_dir)
    
    # If it's a direct path to a .db file, use it
    if db_path.is_file() and db_path.suffix in ['.db', '.sqlite', '.sqlite3']:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        return conn
    
    # Otherwise, treat it as a mission directory
    db_file = get_db_path(db_path_or_mission_dir)
    conn = sqlite3.connect(str(db_file))
    conn.row_factory = sqlite3.Row
    return conn


def get_db_connection(mission_dir):
    """Get a database connection with row factory (backward compatibility)."""
    return get_db_connection_from_path(mission_dir)


@app.route('/')
def index():
    """Main page."""
    return render_template('db_manager.html')


@app.route('/api/mission-dirs', methods=['GET'])
def get_mission_dirs():
    """Get list of available mission directories with databases."""
    # Look for common mission directory patterns
    mission_dirs = []
    
    # Check default location
    default_path = Path(DEFAULT_MISSION_DIR)
    if default_path.exists():
        db_path = get_db_path(DEFAULT_MISSION_DIR)
        if db_path.exists():
            mission_dirs.append({
                'path': DEFAULT_MISSION_DIR,
                'name': default_path.name,
                'db_exists': True
            })
    
    # You can add more search paths here if needed
    # For now, just return the default if it exists
    
    return jsonify({'mission_dirs': mission_dirs})


@app.route('/api/tables', methods=['GET'])
def get_tables():
    """Get list of all tables in the database."""
    try:
        db_path = request.args.get('db_path') or request.args.get('mission_dir', DEFAULT_MISSION_DIR)
        conn = get_db_connection_from_path(db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = [row['name'] for row in cursor.fetchall()]
        
        conn.close()
        return jsonify({'success': True, 'tables': tables})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/table/<table_name>', methods=['GET'])
def get_table_data(table_name):
    """Get all data from a table."""
    try:
        db_path = request.args.get('db_path') or request.args.get('mission_dir', DEFAULT_MISSION_DIR)
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 100))
        offset = (page - 1) * per_page
        
        conn = get_db_connection_from_path(db_path)
        cursor = conn.cursor()
        
        # Get total count
        cursor.execute(f'SELECT COUNT(*) as count FROM {table_name}')
        total = cursor.fetchone()['count']
        
        # Get paginated data
        cursor.execute(f'SELECT * FROM {table_name} LIMIT ? OFFSET ?', (per_page, offset))
        rows = cursor.fetchall()
        
        # Convert rows to dictionaries
        columns = [description[0] for description in cursor.description]
        data = []
        for row in rows:
            row_dict = {}
            for col in columns:
                value = row[col]
                # Convert JSON strings back to objects for display
                if isinstance(value, str) and (value.startswith('{') or value.startswith('[')):
                    try:
                        value = json.loads(value)
                    except:
                        pass
                row_dict[col] = value
            data.append(row_dict)
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': data,
            'columns': columns,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/table/<table_name>/duplicates', methods=['GET'])
def get_duplicates(table_name):
    """Find duplicate entries in a table."""
    try:
        db_path = request.args.get('db_path') or request.args.get('mission_dir', DEFAULT_MISSION_DIR)
        column = request.args.get('column', 'name')
        
        conn = get_db_connection_from_path(db_path)
        cursor = conn.cursor()
        
        # Get all columns
        cursor.execute(f'PRAGMA table_info({table_name})')
        columns_info = cursor.fetchall()
        all_columns = [col[1] for col in columns_info]
        
        if column not in all_columns:
            conn.close()
            return jsonify({'success': False, 'error': f'Column {column} does not exist'}), 400
        
        # Find duplicates
        cursor.execute(f'''
            SELECT {column}, COUNT(*) as count, GROUP_CONCAT(rowid) as rowids
            FROM {table_name}
            WHERE {column} IS NOT NULL AND {column} != ''
            GROUP BY {column}
            HAVING count > 1
            ORDER BY count DESC
        ''')
        
        duplicates = []
        for row in cursor.fetchall():
            duplicates.append({
                'value': row[column],
                'count': row['count'],
                'rowids': [int(rid) for rid in row['rowids'].split(',')]
            })
        
        conn.close()
        return jsonify({'success': True, 'duplicates': duplicates})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/table/<table_name>/row/<int:row_id>', methods=['GET', 'PUT', 'DELETE'])
def manage_row(table_name, row_id):
    """Get, update, or delete a specific row."""
    try:
        db_path = (request.args.get('db_path') or request.args.get('mission_dir') or 
                  (request.json.get('db_path') if request.json else None) or
                  (request.json.get('mission_dir') if request.json else None) or 
                  DEFAULT_MISSION_DIR)
        
        conn = get_db_connection_from_path(db_path)
        cursor = conn.cursor()
        
        if request.method == 'GET':
            # Get row by rowid
            cursor.execute(f'SELECT * FROM {table_name} WHERE rowid = ?', (row_id,))
            row = cursor.fetchone()
            
            if not row:
                conn.close()
                return jsonify({'success': False, 'error': 'Row not found'}), 404
            
            columns = [description[0] for description in cursor.description]
            row_dict = {}
            for col in columns:
                value = row[col]
                if isinstance(value, str) and (value.startswith('{') or value.startswith('[')):
                    try:
                        value = json.loads(value)
                    except:
                        pass
                row_dict[col] = value
            
            conn.close()
            return jsonify({'success': True, 'data': row_dict})
        
        elif request.method == 'PUT':
            # Update row
            data = request.json
            updates = data.get('updates', {})
            
            if not updates:
                conn.close()
                return jsonify({'success': False, 'error': 'No updates provided'}), 400
            
            # Get table structure
            cursor.execute(f'PRAGMA table_info({table_name})')
            columns_info = cursor.fetchall()
            valid_columns = [col[1] for col in columns_info]
            
            # Build update query
            set_clauses = []
            values = []
            for col, value in updates.items():
                if col in valid_columns:
                    # Convert objects to JSON strings if needed
                    if isinstance(value, (dict, list)):
                        value = json.dumps(value)
                    set_clauses.append(f'{col} = ?')
                    values.append(value)
            
            if not set_clauses:
                conn.close()
                return jsonify({'success': False, 'error': 'No valid columns to update'}), 400
            
            values.append(row_id)
            query = f'UPDATE {table_name} SET {", ".join(set_clauses)} WHERE rowid = ?'
            
            cursor.execute(query, values)
            conn.commit()
            conn.close()
            
            return jsonify({'success': True, 'message': 'Row updated successfully'})
        
        elif request.method == 'DELETE':
            # Delete row
            cursor.execute(f'DELETE FROM {table_name} WHERE rowid = ?', (row_id,))
            conn.commit()
            conn.close()
            
            return jsonify({'success': True, 'message': 'Row deleted successfully'})
    
    except Exception as e:
        if conn:
            conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/table/<table_name>/deduplicate', methods=['POST'])
def deduplicate_table(table_name):
    """Remove duplicate entries, keeping the first occurrence."""
    try:
        mission_dir = request.json.get('mission_dir', DEFAULT_MISSION_DIR)
        column = request.json.get('column', 'name')
        keep_first = request.json.get('keep_first', True)
        
        conn = get_db_connection(mission_dir)
        cursor = conn.cursor()
        
        # Get all columns
        cursor.execute(f'PRAGMA table_info({table_name})')
        columns_info = cursor.fetchall()
        all_columns = [col[1] for col in columns_info]
        
        if column not in all_columns:
            conn.close()
            return jsonify({'success': False, 'error': f'Column {column} does not exist'}), 400
        
        # Find duplicates
        cursor.execute(f'''
            SELECT {column}, COUNT(*) as count
            FROM {table_name}
            WHERE {column} IS NOT NULL AND {column} != ''
            GROUP BY {column}
            HAVING count > 1
        ''')
        duplicates = cursor.fetchall()
        
        deleted_count = 0
        for dup_row in duplicates:
            dup_value = dup_row[column]
            cursor.execute(f'SELECT rowid FROM {table_name} WHERE {column} = ? ORDER BY rowid', (dup_value,))
            rowids = [row['rowid'] for row in cursor.fetchall()]
            
            # Keep first or last, delete the rest
            if keep_first:
                rowids_to_delete = rowids[1:]
            else:
                rowids_to_delete = rowids[:-1]
            
            for rid in rowids_to_delete:
                cursor.execute(f'DELETE FROM {table_name} WHERE rowid = ?', (rid,))
                deleted_count += 1
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'deleted_count': deleted_count,
            'message': f'Deleted {deleted_count} duplicate entries'
        })
    except Exception as e:
        if conn:
            conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/table/<table_name>/delete-all', methods=['POST'])
def delete_all_rows(table_name):
    """Delete all rows from a table."""
    try:
        db_path = request.json.get('db_path') or request.json.get('mission_dir', DEFAULT_MISSION_DIR)
        confirm = request.json.get('confirm', False)
        
        if not confirm:
            return jsonify({'success': False, 'error': 'Confirmation required'}), 400
        
        conn = get_db_connection_from_path(db_path)
        cursor = conn.cursor()
        
        cursor.execute(f'DELETE FROM {table_name}')
        deleted_count = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'deleted_count': deleted_count,
            'message': f'Deleted {deleted_count} rows'
        })
    except Exception as e:
        if conn:
            conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    print(f"Database Manager starting...")
    print(f"Default mission directory: {DEFAULT_MISSION_DIR}")
    print(f"Open your browser to http://localhost:5003")
    app.run(debug=True, host='0.0.0.0', port=5003)



