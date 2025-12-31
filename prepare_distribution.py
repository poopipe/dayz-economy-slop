#!/usr/bin/env python3
"""
Distribution Preparation Script

This script creates a clean distribution package by:
1. Copying necessary files to a temporary directory
2. Excluding development files (venv, __pycache__, etc.)
3. Creating a ZIP archive
4. Cleaning up temporary files
"""

import os
import shutil
import zipfile
from pathlib import Path
from datetime import datetime

# Configuration
PROJECT_NAME = "xml-data-viewer"
VERSION = "1.0.0"  # Update this for each release

# Files and folders to include
INCLUDE_PATTERNS = [
    "*.py",
    "*.bat",
    "*.txt",
    "*.md",
    "templates/**/*",
    "static/**/*",
    "uploads/background_images/",  # Empty folder structure
]

# Files and folders to exclude
EXCLUDE_PATTERNS = [
    "__pycache__",
    "*.pyc",
    "*.pyo",
    "*.pyd",
    ".git",
    ".gitignore",
    ".vscode",
    ".idea",
    "*.swp",
    "*.swo",
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
]

# Specific files/folders to exclude
EXCLUDE_ITEMS = [
    "venv",
    "__pycache__",
    ".git",
    ".vscode",
    ".idea",
    "prepare_distribution.py",  # Don't include this script
    "uploads/background_images/*.png",
    "uploads/background_images/*.jpg",
    "uploads/background_images/*.jpeg",
    "uploads/background_images/*.gif",
    "uploads/background_images/*.bmp",
    "uploads/background_images/*.webp",
    "*.db",  # Exclude database files
    "type-editor-db-v2",
]

# Files that must be included
REQUIRED_FILES = [
    "economy_editor_app.py",
    "map_viewer_app.py",
    "launcher_app.py",
    "run_economy_editor.py",
    "run_map_viewer.py",
    "run_launcher.py",
    "requirements.txt",
    "README.md",
    "SETUP_INSTRUCTIONS.md",
    "DISTRIBUTION.md",
    "setup.bat",
    "start_all_apps.bat",
    "activate_venv.bat",
]


def should_exclude(path: Path, root: Path) -> bool:
    """Check if a path should be excluded from distribution."""
    rel_path = path.relative_to(root)
    path_str = str(rel_path).replace("\\", "/")
    
    # Check specific exclude items
    for exclude in EXCLUDE_ITEMS:
        if exclude in path_str or path.name in EXCLUDE_ITEMS:
            # Allow empty folder structure for uploads
            if "uploads/background_images" in path_str and path.is_dir():
                return False
            return True
    
    # Check exclude patterns
    for pattern in EXCLUDE_PATTERNS:
        if pattern in path_str or path.name.startswith(pattern.replace("*", "")):
            return True
    
    # Exclude hidden files/folders (except .gitignore which we might want)
    if path.name.startswith(".") and path.name != ".gitignore":
        return True
    
    return False


def should_include(path: Path, root: Path) -> bool:
    """Check if a path should be included in distribution."""
    rel_path = path.relative_to(root)
    
    # Always include required files
    if path.name in REQUIRED_FILES:
        return True
    
    # Include templates and static files
    if "templates" in rel_path.parts or "static" in rel_path.parts:
        return True
    
    # Include documentation
    if path.suffix == ".md" or path.name in ["DISTRIBUTION.md", "SETUP_INSTRUCTIONS.md"]:
        return True
    
    # Include all batch files
    if path.suffix == ".bat":
        return True
    
    # Include requirements and other config files
    if path.name in ["requirements.txt", ".gitignore"]:
        return True
    
    # Include uploads folder structure (but not files)
    if "uploads" in rel_path.parts:
        return path.is_dir()  # Only include directories, not files
    
    return False


def create_distribution():
    """Create a distribution package."""
    print("=" * 60)
    print(f"Preparing {PROJECT_NAME} Distribution")
    print("=" * 60)
    print()
    
    # Get project root (directory containing this script)
    project_root = Path(__file__).parent.resolve()
    print(f"Project root: {project_root}")
    
    # Create distribution directory
    dist_dir = project_root / "dist"
    dist_dir.mkdir(exist_ok=True)
    
    # Create temporary build directory
    build_dir = dist_dir / f"{PROJECT_NAME}-{VERSION}"
    if build_dir.exists():
        print(f"Cleaning existing build directory: {build_dir}")
        shutil.rmtree(build_dir)
    
    build_dir.mkdir(parents=True)
    print(f"Build directory: {build_dir}")
    print()
    
    # Copy files
    print("Copying files...")
    copied_files = []
    skipped_files = []
    
    # Ensure uploads folder structure exists
    uploads_dir = build_dir / "uploads" / "background_images"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    (uploads_dir / ".gitkeep").touch(exist_ok=True)
    
    # Copy all files and directories
    for item in project_root.rglob("*"):
        if item == project_root:
            continue
        
        # Skip if should be excluded
        if should_exclude(item, project_root):
            skipped_files.append(item.relative_to(project_root))
            continue
        
        # Include if it matches include criteria
        if should_include(item, project_root):
            rel_path = item.relative_to(project_root)
            dest_path = build_dir / rel_path
            
            try:
                if item.is_dir():
                    dest_path.mkdir(parents=True, exist_ok=True)
                    # Create empty .gitkeep if needed for uploads structure
                    if "uploads" in rel_path.parts and not any(dest_path.iterdir()):
                        (dest_path / ".gitkeep").touch(exist_ok=True)
                else:
                    dest_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(item, dest_path)
                    copied_files.append(rel_path)
            except Exception as e:
                print(f"  Warning: Could not copy {rel_path}: {e}")
                skipped_files.append(rel_path)
    
    print(f"  Copied {len(copied_files)} files")
    print(f"  Skipped {len(skipped_files)} files/folders")
    print()
    
    # Verify required files are present
    print("Verifying required files...")
    missing_files = []
    for req_file in REQUIRED_FILES:
        req_path = build_dir / req_file
        if not req_path.exists():
            missing_files.append(req_file)
            print(f"  WARNING: Missing required file: {req_file}")
    
    if missing_files:
        print()
        print("ERROR: Some required files are missing!")
        print("Please ensure all required files exist before creating distribution.")
        shutil.rmtree(build_dir)
        return False
    
    print("  All required files present")
    print()
    
    # Create ZIP archive
    zip_filename = dist_dir / f"{PROJECT_NAME}-{VERSION}.zip"
    if zip_filename.exists():
        print(f"Removing existing archive: {zip_filename}")
        zip_filename.unlink()
    
    print(f"Creating ZIP archive: {zip_filename}")
    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file_path in build_dir.rglob("*"):
            if file_path.is_file():
                arcname = file_path.relative_to(build_dir)
                zipf.write(file_path, arcname)
                print(f"  Added: {arcname}")
    
    zip_size = zip_filename.stat().st_size / (1024 * 1024)  # Size in MB
    print(f"  Archive created: {zip_size:.2f} MB")
    print()
    
    # Create distribution info file
    info_file = dist_dir / f"{PROJECT_NAME}-{VERSION}-info.txt"
    with open(info_file, 'w') as f:
        f.write(f"{PROJECT_NAME} Distribution Package\n")
        f.write("=" * 60 + "\n")
        f.write(f"Version: {VERSION}\n")
        f.write(f"Created: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Archive: {zip_filename.name}\n")
        f.write(f"Size: {zip_size:.2f} MB\n")
        f.write("\n")
        f.write("Files included:\n")
        f.write("-" * 60 + "\n")
        for file_path in sorted(copied_files):
            f.write(f"  {file_path}\n")
        f.write("\n")
        f.write("Files excluded:\n")
        f.write("-" * 60 + "\n")
        for file_path in sorted(skipped_files)[:50]:  # Limit to first 50
            f.write(f"  {file_path}\n")
        if len(skipped_files) > 50:
            f.write(f"  ... and {len(skipped_files) - 50} more\n")
    
    print("=" * 60)
    print("Distribution package created successfully!")
    print("=" * 60)
    print()
    print(f"Archive: {zip_filename}")
    print(f"Size: {zip_size:.2f} MB")
    print(f"Info file: {info_file}")
    print()
    print("Next steps:")
    print("1. Test the ZIP file on a clean system")
    print("2. Verify all required files are included")
    print("3. Distribute the ZIP file to users")
    print()
    
    # Ask if user wants to clean up build directory
    response = input("Keep build directory for inspection? (y/n): ").strip().lower()
    if response != 'y':
        print("Cleaning up build directory...")
        shutil.rmtree(build_dir)
        print("Done!")
    else:
        print(f"Build directory kept at: {build_dir}")
    
    return True


if __name__ == "__main__":
    try:
        success = create_distribution()
        if not success:
            exit(1)
    except KeyboardInterrupt:
        print("\n\nDistribution creation cancelled by user.")
        exit(1)
    except Exception as e:
        print(f"\n\nERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(1)

