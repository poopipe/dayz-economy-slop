#!/usr/bin/env python3
"""
Migration script to convert type_elements data from JSON to normalized table structure.
This script normalizes existing data in the database by extracting fields from JSON
and storing them in the type_element_fields table.
"""

import sqlite3
import json
import sys
from pathlib import Path
from datetime import datetime

# Fields that should always be single values (not lists)
SINGLE_VALUE_FIELDS = ['name', 'nominal', 'lifetime', 'restock', 'min', 'quantmin', 'quantmax', 'cost']


def normalize_single_value_field(value, field_name):
    """Normalize a field value - if it's a list, take the first item."""
    if value is None:
        return None
    
    if isinstance(value, list):
        if len(value) == 0:
            return None
        
        # If it's a list, take the first element
        first_item = value[0]
        
        # If the first item is a dict with _text, extract that
        if isinstance(first_item, dict) and '_text' in first_item:
            return first_item['_text']
        elif isinstance(first_item, dict):
            # If it's a dict, try to get a meaningful value
            if 'name' in first_item:
                return first_item['name']
            elif len(first_item) == 1:
                return list(first_item.values())[0]
            else:
                # Multiple attributes - keep as dict for now
                return first_item
        else:
            return first_item
    
    # If it's already a single value, return as-is
    return value

def get_db_path(mission_dir):
    """Get the database file path for a given mission directory."""
    mission_path = Path(mission_dir)
    db_dir = mission_path / 'type-editor-db'
    return db_dir / 'editor_data.db'


def create_backup(db_file):
    """Create a backup of the database before migration."""
    import shutil
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_file = db_file.parent / f'editor_data_backup_before_normalization_{timestamp}.db'
    shutil.copy2(db_file, backup_file)
    print(f"Created backup: {backup_file}")
    return backup_file


def migrate_database(mission_dir):
    """Migrate database from JSON data to normalized field structure."""
    db_file = get_db_path(mission_dir)
    
    if not db_file.exists():
        print(f"Database file not found: {db_file}")
        return False
    
    print(f"Database file: {db_file}")
    print("Creating backup before migration...")
    backup_file = create_backup(db_file)
    print(f"Backup created: {backup_file}\n")
    
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        # Check if migration already done
        cursor.execute('''
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='type_element_fields'
        ''')
        table_exists = cursor.fetchone()
        
        if table_exists:
            # Check if there's existing data
            cursor.execute('SELECT COUNT(*) as count FROM type_element_fields')
            existing_count = cursor.fetchone()['count']
            
            if existing_count > 0:
                print(f"Migration already completed (found {existing_count} normalized field entries)")
                response = input("Do you want to re-run migration? This will clear existing normalized data. (yes/no): ")
                if response.lower() != 'yes':
                    conn.close()
                    print("Migration cancelled.")
                    return False
                print("Clearing existing normalized data...")
                cursor.execute('DELETE FROM type_element_fields')
                conn.commit()
            else:
                print("Normalized table exists but is empty. Proceeding with migration...")
        
        # Create normalized table if it doesn't exist
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS type_element_fields (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                element_key TEXT NOT NULL,
                field_name TEXT NOT NULL,
                field_value TEXT,
                field_order INTEGER,
                attributes_json TEXT,
                FOREIGN KEY (element_key) REFERENCES type_elements(element_key),
                UNIQUE(element_key, field_name, field_order)
            )
        ''')
        
        # Create indexes
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_element_field_key ON type_element_fields(element_key)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_element_field_name ON type_element_fields(field_name)')
        
        # Get all elements
        cursor.execute('SELECT element_key, data FROM type_elements')
        rows = cursor.fetchall()
        
        print(f"Migrating {len(rows)} elements...")
        
        migrated_count = 0
        for row in rows:
            element_key = row['element_key']
            data_json = row['data']
            
            try:
                data = json.loads(data_json)
            except json.JSONDecodeError:
                print(f"Warning: Invalid JSON for element {element_key}, skipping")
                continue
            
            # Normalize single-value fields before processing
            for field in SINGLE_VALUE_FIELDS:
                if field in data:
                    data[field] = normalize_single_value_field(data[field], field)
            
            # Process each field
            for field_name, field_value in data.items():
                # Skip internal fields
                if field_name.startswith('_'):
                    continue
                
                # Handle different field types
                if field_value is None:
                    continue
                elif isinstance(field_value, list):
                    # Array field - store each item
                    for order, item in enumerate(field_value):
                        if isinstance(item, dict):
                            # Object in array (e.g., usage with name attribute)
                            # Extract text value if present
                            text_value = item.get('_text') or item.get('name') or None
                            # Store attributes as JSON (excluding _text and name if used as value)
                            attrs = {k: v for k, v in item.items() if k != '_text'}
                            attrs_json = json.dumps(attrs) if attrs else None
                            cursor.execute('''
                                INSERT INTO type_element_fields 
                                (element_key, field_name, field_value, field_order, attributes_json)
                                VALUES (?, ?, ?, ?, ?)
                            ''', (element_key, field_name, text_value, order, attrs_json))
                        elif isinstance(item, str):
                            # Simple string in array
                            cursor.execute('''
                                INSERT INTO type_element_fields 
                                (element_key, field_name, field_value, field_order, attributes_json)
                                VALUES (?, ?, ?, ?, NULL)
                            ''', (element_key, field_name, item, order))
                        else:
                            # Other types - convert to string
                            cursor.execute('''
                                INSERT INTO type_element_fields 
                                (element_key, field_name, field_value, field_order, attributes_json)
                                VALUES (?, ?, ?, ?, NULL)
                            ''', (element_key, field_name, str(item), order))
                elif isinstance(field_value, dict):
                    # Object field (e.g., usage, category with name attribute)
                    text_value = field_value.get('_text') or field_value.get('name') or None
                    attrs = {k: v for k, v in field_value.items() if k != '_text'}
                    attrs_json = json.dumps(attrs) if attrs else None
                    cursor.execute('''
                        INSERT INTO type_element_fields 
                        (element_key, field_name, field_value, field_order, attributes_json)
                        VALUES (?, ?, ?, NULL, ?)
                    ''', (element_key, field_name, text_value, attrs_json))
                else:
                    # Simple value (string, number, etc.)
                    cursor.execute('''
                        INSERT INTO type_element_fields 
                        (element_key, field_name, field_value, field_order, attributes_json)
                        VALUES (?, ?, ?, NULL, NULL)
                    ''', (element_key, field_name, str(field_value),))
            
            migrated_count += 1
            if migrated_count % 100 == 0:
                print(f"  Migrated {migrated_count} elements...")
                conn.commit()
        
        conn.commit()
        
        # Get statistics
        cursor.execute('SELECT COUNT(*) as count FROM type_element_fields')
        field_count = cursor.fetchone()['count']
        cursor.execute('SELECT COUNT(DISTINCT field_name) as count FROM type_element_fields')
        unique_fields = cursor.fetchone()['count']
        
        print(f"\nMigration completed successfully!")
        print(f"  - Migrated {migrated_count} elements")
        print(f"  - Created {field_count} field entries")
        print(f"  - Found {unique_fields} unique field names")
        return True
        
    except Exception as e:
        conn.rollback()
        print(f"Error during migration: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        conn.close()


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python migrate_to_normalized_schema.py <mission_directory>")
        sys.exit(1)
    
    mission_dir = sys.argv[1]
    success = migrate_database(mission_dir)
    sys.exit(0 if success else 1)

