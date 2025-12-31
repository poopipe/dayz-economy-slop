#!/usr/bin/env python3
"""
Migration script to populate the type_element_fields table from existing JSON data.
This script extracts all fields from the type_elements.data JSON column and stores
them in the normalized type_element_fields table using the same logic as the application.
"""

import sqlite3
import json
import sys
import shutil
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


def get_db_path(mission_dir_or_db_file):
    """Get the database file path. Accepts either a mission directory or direct database file path."""
    db_path = Path(mission_dir_or_db_file)
    
    # If it's a direct path to a .db file, use it
    if db_path.is_file() and db_path.suffix in ['.db', '.sqlite', '.sqlite3']:
        return db_path
    
    # Otherwise, treat it as a mission directory
    mission_path = Path(mission_dir_or_db_file)
    db_dir = mission_path / 'type-editor-db'
    return db_dir / 'editor_data.db'


def create_backup(db_file):
    """Create a backup of the database before migration."""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_file = db_file.parent / f'editor_data_backup_before_populate_fields_{timestamp}.db'
    shutil.copy2(db_file, backup_file)
    return backup_file


def save_element_fields_to_normalized(cursor, element_key, data_dict):
    """
    Save element fields to normalized type_element_fields table.
    """
    # Delete existing fields for this element
    cursor.execute('DELETE FROM type_element_fields WHERE element_key = ?', (element_key,))
    
    # Process each field
    for field_name, field_value in data_dict.items():
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
                    text_value = item.get('_text') or item.get('name') or None
                    attrs = {k: v for k, v in item.items() if k != '_text'}
                    attrs_json = json.dumps(attrs) if attrs else None
                    cursor.execute('''
                        INSERT INTO type_element_fields 
                        (element_key, field_name, field_value, field_order, attributes_json)
                        VALUES (?, ?, ?, ?, ?)
                    ''', (element_key, field_name, text_value, order, attrs_json))
                elif isinstance(item, str):
                    cursor.execute('''
                        INSERT INTO type_element_fields 
                        (element_key, field_name, field_value, field_order, attributes_json)
                        VALUES (?, ?, ?, ?, NULL)
                    ''', (element_key, field_name, item, order))
                else:
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


def populate_type_element_fields(mission_dir_or_db_file, force=False):
    """
    Populate the type_element_fields table from existing JSON data in type_elements.
    
    Args:
        mission_dir_or_db_file: Either a mission directory path or direct database file path
        force: If True, clear existing data and re-populate
    """
    db_file = get_db_path(mission_dir_or_db_file)
    
    if not db_file.exists():
        print(f"ERROR: Database file not found: {db_file}")
        return False
    
    print(f"Database file: {db_file}")
    
    # Create backup
    print("Creating backup before migration...")
    backup_file = create_backup(db_file)
    print(f"Backup created: {backup_file}\n")
    
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        # Ensure the table exists
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
        
        # Check if table already has data
        cursor.execute('SELECT COUNT(*) as count FROM type_element_fields')
        existing_count = cursor.fetchone()['count']
        
        if existing_count > 0:
            if not force:
                print(f"WARNING: type_element_fields table already has {existing_count} entries.")
                print("Use --force flag to clear and re-populate the table.")
                conn.close()
                return False
            else:
                print(f"Clearing existing {existing_count} entries from type_element_fields...")
                cursor.execute('DELETE FROM type_element_fields')
                conn.commit()
        
        # Get all elements
        cursor.execute('SELECT element_key, data FROM type_elements')
        rows = cursor.fetchall()
        
        if len(rows) == 0:
            print("No elements found in type_elements table.")
            conn.close()
            return False
        
        print(f"Found {len(rows)} elements to process...")
        print("Populating type_element_fields table...\n")
        
        processed_count = 0
        error_count = 0
        total_fields_created = 0
        
        for row in rows:
            element_key = row['element_key']
            data_json = row['data']
            
            try:
                # Parse JSON data
                data = json.loads(data_json)
                
                # Normalize single-value fields before processing
                for field in SINGLE_VALUE_FIELDS:
                    if field in data:
                        data[field] = normalize_single_value_field(data[field], field)
                
                # Count fields before saving
                fields_before = cursor.execute(
                    'SELECT COUNT(*) FROM type_element_fields WHERE element_key = ?',
                    (element_key,)
                ).fetchone()[0]
                
                # Save to normalized table using the same logic as the application
                save_element_fields_to_normalized(cursor, element_key, data)
                
                # Count fields after saving
                fields_after = cursor.execute(
                    'SELECT COUNT(*) FROM type_element_fields WHERE element_key = ?',
                    (element_key,)
                ).fetchone()[0]
                
                fields_created = fields_after - fields_before
                total_fields_created += fields_created
                
                processed_count += 1
                
                # Commit every 100 elements for progress tracking
                if processed_count % 100 == 0:
                    conn.commit()
                    print(f"  Processed {processed_count}/{len(rows)} elements ({total_fields_created} fields created)...")
                
            except json.JSONDecodeError as e:
                error_count += 1
                print(f"  ERROR: Invalid JSON for element {element_key}: {e}")
                continue
            except Exception as e:
                error_count += 1
                print(f"  ERROR: Failed to process element {element_key}: {e}")
                continue
        
        # Final commit
        conn.commit()
        
        # Get statistics
        cursor.execute('SELECT COUNT(*) as count FROM type_element_fields')
        total_field_count = cursor.fetchone()['count']
        cursor.execute('SELECT COUNT(DISTINCT element_key) as count FROM type_element_fields')
        elements_with_fields = cursor.fetchone()['count']
        cursor.execute('SELECT COUNT(DISTINCT field_name) as count FROM type_element_fields')
        unique_field_names = cursor.fetchone()['count']
        
        print(f"\n{'='*60}")
        print("Migration completed successfully!")
        print(f"{'='*60}")
        print(f"  Elements processed: {processed_count}")
        print(f"  Elements with errors: {error_count}")
        print(f"  Total field entries created: {total_field_count}")
        print(f"  Elements with normalized fields: {elements_with_fields}")
        print(f"  Unique field names: {unique_field_names}")
        print(f"  Backup saved to: {backup_file}")
        print(f"{'='*60}")
        
        return True
        
    except Exception as e:
        conn.rollback()
        print(f"\nERROR during migration: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        conn.close()


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Populate type_element_fields table from existing JSON data',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  # Using mission directory:
  python populate_type_element_fields.py "E:\\DayZ_Servers\\Nyheim20_Server\\mpmissions\\empty.nyheim"
  
  # Using direct database file path:
  python populate_type_element_fields.py "E:\\path\\to\\editor_data.db"
  
  # Force re-population (clears existing data):
  python populate_type_element_fields.py "E:\\path\\to\\editor_data.db" --force
        '''
    )
    
    parser.add_argument(
        'path',
        help='Mission directory path or direct database file path'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Clear existing data and re-populate the table'
    )
    
    args = parser.parse_args()
    
    success = populate_type_element_fields(args.path, force=args.force)
    sys.exit(0 if success else 1)


