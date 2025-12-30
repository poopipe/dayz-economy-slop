#!/usr/bin/env python3
"""
Script to remove duplicate consecutive lines from XML files in exported-types folder.
Creates backups before modifying files.
"""

import os
import shutil
from pathlib import Path
from datetime import datetime


def remove_duplicate_lines(content):
    """
    Remove lines that are preceded by an identical line.
    Returns the cleaned content and count of removed lines.
    Preserves original line endings.
    """
    # Detect line ending style from the file
    if '\r\n' in content:
        line_ending = '\r\n'
    elif '\n' in content:
        line_ending = '\n'
    elif '\r' in content:
        line_ending = '\r'
    else:
        # No line breaks found, return as-is
        return content, 0
    
    # Split while preserving line endings
    lines = []
    if line_ending == '\r\n':
        # Handle CRLF
        parts = content.split('\r\n')
        for i, part in enumerate(parts):
            if i < len(parts) - 1:
                lines.append(part + '\r\n')
            else:
                # Last part might not have line ending
                if content.endswith('\r\n'):
                    lines.append(part + '\r\n')
                else:
                    lines.append(part)
    elif line_ending == '\n':
        # Handle LF
        parts = content.split('\n')
        for i, part in enumerate(parts):
            if i < len(parts) - 1:
                lines.append(part + '\n')
            else:
                # Last part might not have line ending
                if content.endswith('\n'):
                    lines.append(part + '\n')
                else:
                    lines.append(part)
    else:
        # Handle CR
        parts = content.split('\r')
        for i, part in enumerate(parts):
            if i < len(parts) - 1:
                lines.append(part + '\r')
            else:
                if content.endswith('\r'):
                    lines.append(part + '\r')
                else:
                    lines.append(part)
    
    if not lines:
        return content, 0
    
    cleaned_lines = [lines[0]]  # Always keep the first line
    removed_count = 0
    
    for i in range(1, len(lines)):
        # Compare current line with previous line (strip whitespace for comparison)
        current_line = lines[i]
        previous_line = lines[i-1]
        
        # Compare stripped versions to catch duplicates with different whitespace
        # But preserve the original line ending style
        if current_line.rstrip('\r\n') == previous_line.rstrip('\r\n') and current_line.rstrip('\r\n'):
            # This line is a duplicate of the previous one, skip it
            removed_count += 1
        else:
            # Keep this line with its original ending
            cleaned_lines.append(current_line)
    
    cleaned_content = ''.join(cleaned_lines)
    return cleaned_content, removed_count


def process_file(file_path, backup_dir):
    """
    Process a single file: create backup, remove duplicates, save result.
    Returns tuple of (success, removed_count, error_message).
    """
    try:
        # Read the file in binary mode first to preserve line endings exactly
        with open(file_path, 'rb') as f:
            original_bytes = f.read()
        
        # Decode to string for processing
        try:
            original_content = original_bytes.decode('utf-8')
        except UnicodeDecodeError:
            # Try other encodings if UTF-8 fails
            try:
                original_content = original_bytes.decode('utf-8-sig')  # Handle BOM
            except:
                original_content = original_bytes.decode('latin-1')
        
        # Remove duplicate lines
        cleaned_content, removed_count = remove_duplicate_lines(original_content)
        
        # Only proceed if there were duplicates removed
        if removed_count > 0:
            # Create backup
            backup_path = backup_dir / file_path.name
            shutil.copy2(file_path, backup_path)
            
            # Write cleaned content - preserve original encoding
            # Use 'wb' mode to write exactly what we want
            cleaned_bytes = cleaned_content.encode('utf-8')
            with open(file_path, 'wb') as f:
                f.write(cleaned_bytes)
            
            return True, removed_count, None
        else:
            return True, 0, None
            
    except Exception as e:
        return False, 0, str(e)


def main():
    """Main function to process all XML files in exported-types folder."""
    # Get the script directory
    script_dir = Path(__file__).parent
    
    # Look for exported-types folder (could be in current dir or mission folders)
    exported_types_dir = script_dir / 'exported-types'
    
    # If not found, try to find it in common locations
    if not exported_types_dir.exists():
        # Try looking in parent directories or ask user
        print(f"Looking for exported-types folder...")
        print(f"Checked: {exported_types_dir}")
        print("\nPlease specify the path to the exported-types folder:")
        user_path = input("Path: ").strip()
        if user_path:
            exported_types_dir = Path(user_path)
        else:
            print("No path provided. Exiting.")
            return
    
    if not exported_types_dir.exists():
        print(f"Error: Directory does not exist: {exported_types_dir}")
        return
    
    if not exported_types_dir.is_dir():
        print(f"Error: Path is not a directory: {exported_types_dir}")
        return
    
    # Create backup directory
    backup_dir = exported_types_dir / 'backup'
    backup_dir.mkdir(exist_ok=True)
    print(f"Backup directory: {backup_dir}")
    
    # Find all XML files
    xml_files = list(exported_types_dir.glob('*.xml'))
    
    if not xml_files:
        print(f"No XML files found in {exported_types_dir}")
        return
    
    print(f"\nFound {len(xml_files)} XML file(s) to process")
    print(f"Processing files in: {exported_types_dir}\n")
    
    total_removed = 0
    files_processed = 0
    files_modified = 0
    errors = []
    
    for xml_file in sorted(xml_files):
        # Skip backup directory files
        if xml_file.parent == backup_dir:
            continue
        
        print(f"Processing: {xml_file.name}...", end=' ')
        
        success, removed_count, error = process_file(xml_file, backup_dir)
        
        if success:
            files_processed += 1
            if removed_count > 0:
                files_modified += 1
                total_removed += removed_count
                print(f"✓ Removed {removed_count} duplicate line(s)")
            else:
                print("✓ No duplicates found")
        else:
            errors.append((xml_file.name, error))
            print(f"✗ Error: {error}")
    
    # Summary
    print(f"\n{'='*60}")
    print(f"Summary:")
    print(f"  Files processed: {files_processed}")
    print(f"  Files modified: {files_modified}")
    print(f"  Total duplicate lines removed: {total_removed}")
    print(f"  Errors: {len(errors)}")
    
    if errors:
        print(f"\nErrors encountered:")
        for filename, error in errors:
            print(f"  {filename}: {error}")
    
    print(f"\nBackups saved to: {backup_dir}")


if __name__ == '__main__':
    main()

