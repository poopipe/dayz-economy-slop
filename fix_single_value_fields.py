#!/usr/bin/env python3
"""
Migration script to fix fields that should be single values but are currently lists.
Takes the first item from lists for: name, nominal, lifetime, restock, min, quantmin, quantmax, cost
"""

import sqlite3
import json
import sys
from pathlib import Path

# Fields that should be single values
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
            # For most fields, we want the text or a single attribute value
            if 'name' in first_item:
                return first_item['name']
            elif len(first_item) == 1:
                return list(first_item.values())[0]
            else:
                # Multiple attributes - convert to string representation
                return str(first_item)
        else:
            return first_item
    
    # If it's already a single value, return as-is
    return value


def fix_database(mission_dir):
    """Fix single-value fields in the database."""
    db_path = Path(mission_dir) / 'type-editor-db' / 'editor_data.db'
    
    if not db_path.exists():
        print(f"Database not found: {db_path}")
        return False
    
    print(f"Opening database: {db_path}")
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get all elements
    cursor.execute('SELECT element_key, data FROM type_elements')
    rows = cursor.fetchall()
    
    updated_count = 0
    fixed_count = 0
    
    for row in rows:
        element_key = row['element_key']
        data_json = row['data']
        
        try:
            data = json.loads(data_json)
            original_data = json.loads(data_json)  # Keep original for comparison
            
            # Fix each single-value field
            for field in SINGLE_VALUE_FIELDS:
                if field in data:
                    original_value = data[field]
                    normalized_value = normalize_single_value_field(original_value, field)
                    
                    if original_value != normalized_value:
                        data[field] = normalized_value
                        fixed_count += 1
                        print(f"  Fixed {field} for {element_key}: {original_value} -> {normalized_value}")
            
            # Only update if something changed
            if data != original_data:
                new_data_json = json.dumps(data)
                cursor.execute(
                    'UPDATE type_elements SET data = ? WHERE element_key = ?',
                    (new_data_json, element_key)
                )
                updated_count += 1
        
        except Exception as e:
            print(f"Error processing {element_key}: {e}")
            continue
    
    conn.commit()
    conn.close()
    
    print(f"\nMigration complete:")
    print(f"  Updated {updated_count} elements")
    print(f"  Fixed {fixed_count} field values")
    
    return True


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python fix_single_value_fields.py <mission_directory>")
        print("Example: python fix_single_value_fields.py \"E:\\DayZ_Servers\\...\\empty.nyheim\"")
        sys.exit(1)
    
    mission_dir = sys.argv[1]
    
    if not Path(mission_dir).exists():
        print(f"Mission directory does not exist: {mission_dir}")
        sys.exit(1)
    
    print(f"Fixing single-value fields in database for: {mission_dir}")
    print(f"Fields to fix: {', '.join(SINGLE_VALUE_FIELDS)}")
    print()
    
    success = fix_database(mission_dir)
    
    if success:
        print("\nDatabase migration completed successfully!")
    else:
        print("\nDatabase migration failed!")
        sys.exit(1)



