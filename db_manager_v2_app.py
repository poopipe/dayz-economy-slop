#!/usr/bin/env python3
"""
Database Manager Application v2 for viewing and modifying the editor v2 database.
Works with the normalized database schema.
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
    """Get the database file path for a given mission directory (v2)."""
    mission_path = Path(mission_dir)
    db_dir = mission_path / 'type-editor-db-v2'
    return db_dir / 'editor_data_v2.db'


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
    return render_template('db_manager_v2.html')


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
        
        conn = get_db_connection_from_path(db_path)
        cursor = conn.cursor()
        
        # Get total count
        cursor.execute(f'SELECT COUNT(*) as count FROM "{table_name}"')
        total_count = cursor.fetchone()['count']
        
        # Get paginated data
        offset = (page - 1) * per_page
        cursor.execute(f'SELECT * FROM "{table_name}" LIMIT ? OFFSET ?', (per_page, offset))
        
        rows = []
        for row in cursor.fetchall():
            row_dict = {}
            for key in row.keys():
                value = row[key]
                # Convert JSON strings to objects for display
                if isinstance(value, str) and (value.startswith('{') or value.startswith('[')):
                    try:
                        value = json.loads(value)
                    except:
                        pass
                row_dict[key] = value
            rows.append(row_dict)
        
        # Get column names
        cursor.execute(f'PRAGMA table_info("{table_name}")')
        columns = [row['name'] for row in cursor.fetchall()]
        
        conn.close()
        
        total_pages = (total_count + per_page - 1) // per_page
        
        return jsonify({
            'success': True,
            'rows': rows,
            'columns': columns,
            'total_count': total_count,
            'page': page,
            'per_page': per_page,
            'total_pages': total_pages
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/table/<table_name>/row', methods=['PUT'])
def update_row(table_name):
    """Update a row in a table."""
    try:
        db_path = request.json.get('db_path') or request.json.get('mission_dir', DEFAULT_MISSION_DIR)
        row_data = request.json.get('row_data', {})
        row_id = request.json.get('row_id')
        id_column = request.json.get('id_column', 'id')
        
        if not row_id:
            return jsonify({'success': False, 'error': 'row_id is required'}), 400
        
        conn = get_db_connection_from_path(db_path)
        cursor = conn.cursor()
        
        # Build UPDATE query
        set_clauses = []
        values = []
        for key, value in row_data.items():
            if key == id_column:
                continue
            set_clauses.append(f'"{key}" = ?')
            # Convert dict/list to JSON string
            if isinstance(value, (dict, list)):
                values.append(json.dumps(value))
            else:
                values.append(value)
        
        values.append(row_id)
        
        query = f'UPDATE "{table_name}" SET {", ".join(set_clauses)} WHERE "{id_column}" = ?'
        cursor.execute(query, values)
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/table/<table_name>/row', methods=['DELETE'])
def delete_row(table_name):
    """Delete a row from a table."""
    try:
        db_path = request.json.get('db_path') or request.json.get('mission_dir', DEFAULT_MISSION_DIR)
        row_id = request.json.get('row_id')
        id_column = request.json.get('id_column', 'id')
        
        if not row_id:
            return jsonify({'success': False, 'error': 'row_id is required'}), 400
        
        conn = get_db_connection_from_path(db_path)
        cursor = conn.cursor()
        
        query = f'DELETE FROM "{table_name}" WHERE "{id_column}" = ?'
        cursor.execute(query, (row_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/table/<table_name>/duplicates', methods=['GET'])
def find_duplicates(table_name):
    """Find duplicate rows in a table."""
    try:
        db_path = request.args.get('db_path') or request.args.get('mission_dir', DEFAULT_MISSION_DIR)
        conn = get_db_connection_from_path(db_path)
        cursor = conn.cursor()
        
        # Get table structure
        cursor.execute(f'PRAGMA table_info("{table_name}")')
        columns = [row['name'] for row in cursor.fetchall()]
        
        # Find duplicates based on all columns except id
        id_column = 'id' if 'id' in columns else columns[0]
        other_columns = [c for c in columns if c != id_column]
        
        if not other_columns:
            conn.close()
            return jsonify({'success': True, 'duplicates': []})
        
        # Build query to find duplicates
        column_list = ', '.join([f'"{c}"' for c in other_columns])
        group_by = ', '.join([f'"{c}"' for c in other_columns])
        
        query = f'''
            SELECT {column_list}, COUNT(*) as count, GROUP_CONCAT("{id_column}") as ids
            FROM "{table_name}"
            GROUP BY {group_by}
            HAVING COUNT(*) > 1
        '''
        
        cursor.execute(query)
        duplicates = []
        for row in cursor.fetchall():
            dup = {}
            for key in row.keys():
                dup[key] = row[key]
            duplicates.append(dup)
        
        conn.close()
        
        return jsonify({'success': True, 'duplicates': duplicates})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/table/<table_name>/deduplicate', methods=['POST'])
def deduplicate_table(table_name):
    """Remove duplicate rows, keeping the first occurrence."""
    try:
        db_path = request.json.get('db_path') or request.json.get('mission_dir', DEFAULT_MISSION_DIR)
        conn = get_db_connection_from_path(db_path)
        cursor = conn.cursor()
        
        # Get table structure
        cursor.execute(f'PRAGMA table_info("{table_name}")')
        columns = [row['name'] for row in cursor.fetchall()]
        
        id_column = 'id' if 'id' in columns else columns[0]
        other_columns = [c for c in columns if c != id_column]
        
        if not other_columns:
            conn.close()
            return jsonify({'success': True, 'deleted': 0})
        
        # Find and delete duplicates
        column_list = ', '.join([f'"{c}"' for c in other_columns])
        group_by = ', '.join([f'"{c}"' for c in other_columns])
        
        # Get duplicate IDs (keep first, delete rest)
        query = f'''
            SELECT {column_list}, MIN("{id_column}") as keep_id, GROUP_CONCAT("{id_column}") as all_ids
            FROM "{table_name}"
            GROUP BY {group_by}
            HAVING COUNT(*) > 1
        '''
        
        cursor.execute(query)
        duplicates = cursor.fetchall()
        
        deleted_count = 0
        for dup in duplicates:
            all_ids = [int(id_str) for id_str in str(dup['all_ids']).split(',')]
            keep_id = dup['keep_id']
            delete_ids = [id_val for id_val in all_ids if id_val != keep_id]
            
            if delete_ids:
                placeholders = ','.join(['?'] * len(delete_ids))
                delete_query = f'DELETE FROM "{table_name}" WHERE "{id_column}" IN ({placeholders})'
                cursor.execute(delete_query, delete_ids)
                deleted_count += len(delete_ids)
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'deleted': deleted_count})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/table/<table_name>/delete-all', methods=['POST'])
def delete_all_rows(table_name):
    """Delete all rows from a table."""
    try:
        db_path = request.json.get('db_path') or request.json.get('mission_dir', DEFAULT_MISSION_DIR)
        conn = get_db_connection_from_path(db_path)
        cursor = conn.cursor()
        
        cursor.execute(f'DELETE FROM "{table_name}"')
        deleted_count = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'deleted': deleted_count})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    print("Database Manager v2 starting...")
    print(f"Default mission directory: {DEFAULT_MISSION_DIR}")
    print("Open your browser to http://localhost:5005")
    app.run(debug=True, host='0.0.0.0', port=5005)

