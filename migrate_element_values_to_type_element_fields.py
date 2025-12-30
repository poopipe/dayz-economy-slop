#!/usr/bin/env python3
"""
Migration script to move data from element_values table to type_element_fields table.
This script migrates the many-to-many relationship stored in element_values
to the normalized type_element_fields table structure.
"""

import sqlite3
import json
import sys
import shutil
from pathlib import Path
from datetime import datetime


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
    backup_file = db_file.parent / f'editor_data_backup_before_value_migration_{timestamp}.db'
    shutil.copy2(db_file, backup_file)
    return backup_file


def migrate_element_values(mission_dir_or_db_file, force=False):
    """
    Migrate data from element_values table to type_element_fields table.
    
    Args:
        mission_dir_or_db_file: Either a mission directory path or direct database file path
        force: If True, re-migrate even if values already exist in type_element_fields
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
        # Check if element_values table exists
        cursor.execute('''
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='element_values'
        ''')
        if not cursor.fetchone():
            print("element_values table does not exist. Nothing to migrate.")
            conn.close()
            return True
        
        # Check if there's data to migrate
        cursor.execute('SELECT COUNT(*) as count FROM element_values')
        element_values_count = cursor.fetchone()['count']
        
        if element_values_count == 0:
            print("element_values table is empty. Nothing to migrate.")
            conn.close()
            return True
        
        print(f"Found {element_values_count} value assignments in element_values table")
        
        # Check if values already exist in type_element_fields
        cursor.execute('''
            SELECT COUNT(DISTINCT element_key) as count 
            FROM type_element_fields 
            WHERE field_name = 'value'
        ''')
        existing_count = cursor.fetchone()['count']
        
        if existing_count > 0 and not force:
            print(f"WARNING: Found {existing_count} elements with 'value' field in type_element_fields.")
            print("Use --force flag to re-migrate and overwrite existing values.")
            conn.close()
            return False
        
        if force and existing_count > 0:
            print(f"Clearing existing 'value' fields from type_element_fields...")
            cursor.execute("DELETE FROM type_element_fields WHERE field_name = 'value'")
            conn.commit()
        
        # Get all value assignments grouped by element_key
        cursor.execute('''
            SELECT 
                ev.element_key,
                GROUP_CONCAT(v.name) as value_names
            FROM element_values ev
            JOIN valueflags v ON ev.value_id = v.id
            GROUP BY ev.element_key
        ''')
        
        migrated_count = 0
        error_count = 0
        
        print("Migrating value assignments...")
        
        for row in cursor.fetchall():
            element_key = row['element_key']
            value_names_str = row['value_names']
            
            if not value_names_str:
                continue
            
            try:
                # Parse value names
                value_names = [name.strip() for name in value_names_str.split(',')]
                
                # Create value field entries in type_element_fields
                for order, value_name in enumerate(value_names):
                    # Store as {'name': 'ValueName'} in attributes_json
                    val_obj = {'name': value_name}
                    cursor.execute('''
                        INSERT INTO type_element_fields 
                        (element_key, field_name, field_value, field_order, attributes_json)
                        VALUES (?, ?, ?, ?, ?)
                    ''', (element_key, 'value', None, order, json.dumps(val_obj)))
                
                migrated_count += 1
                
                if migrated_count % 100 == 0:
                    conn.commit()
                    print(f"  Migrated {migrated_count} elements...")
                
            except Exception as e:
                error_count += 1
                print(f"  ERROR: Failed to migrate element {element_key}: {e}")
                continue
        
        # Final commit
        conn.commit()
        
        # Get statistics
        cursor.execute('''
            SELECT COUNT(DISTINCT element_key) as count 
            FROM type_element_fields 
            WHERE field_name = 'value'
        ''')
        final_count = cursor.fetchone()['count']
        
        print(f"\n{'='*60}")
        print("Migration completed successfully!")
        print(f"{'='*60}")
        print(f"  Elements migrated: {migrated_count}")
        print(f"  Elements with errors: {error_count}")
        print(f"  Total elements with values in type_element_fields: {final_count}")
        print(f"  Backup saved to: {backup_file}")
        print(f"{'='*60}")
        
        # Ask if user wants to drop element_values table
        print("\nMigration complete. The element_values table is now redundant.")
        print("You can safely drop it after verifying the migration was successful.")
        print("To drop it manually, run:")
        print(f"  sqlite3 \"{db_file}\" \"DROP TABLE IF EXISTS element_values;\"")
        
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
        description='Migrate element_values table data to type_element_fields table',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  # Using mission directory:
  python migrate_element_values_to_type_element_fields.py "E:\\DayZ_Servers\\Nyheim20_Server\\mpmissions\\empty.nyheim"
  
  # Using direct database file path:
  python migrate_element_values_to_type_element_fields.py "E:\\path\\to\\editor_data.db"
  
  # Force re-migration (overwrites existing values):
  python migrate_element_values_to_type_element_fields.py "E:\\path\\to\\editor_data.db" --force
        '''
    )
    
    parser.add_argument(
        'path',
        help='Mission directory path or direct database file path'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Re-migrate even if values already exist in type_element_fields'
    )
    
    args = parser.parse_args()
    
    success = migrate_element_values(args.path, force=args.force)
    sys.exit(0 if success else 1)

