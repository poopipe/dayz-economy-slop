# Distribution Guide

This guide explains how to distribute the XML Data Viewer applications to other users for local installation.

## Quick Start (Automated)

The easiest way to create a distribution package is to use the automated script:

```cmd
python prepare_distribution.py
```

Or use the batch file:
```cmd
create_distribution.bat
```

This will:
- Create a clean copy of the project
- Exclude unnecessary files (venv, __pycache__, uploads, etc.)
- Create a ZIP archive in the `dist/` folder
- Generate a distribution info file

The ZIP file will be named `xml-data-viewer-{version}.zip` and can be distributed directly to users.

## Manual Distribution

If you prefer to create the distribution manually:

## What to Include

When distributing the applications, include the following files and folders:

### Required Files:
- All Python application files:
  - `economy_editor_app.py`
  - `map_viewer_app.py`
  - `launcher_app.py`
  - `run_economy_editor.py`
  - `run_map_viewer.py`
  - `run_launcher.py`
- All template files:
  - `templates/economy_editor.html`
  - `templates/map_viewer.html`
  - `templates/launcher.html`
- All static files:
  - `static/css/` (all CSS files)
  - `static/js/` (all JS files)
- Configuration files:
  - `requirements.txt`
  - `README.md`
  - `DISTRIBUTION.md` (this file)
  - `SETUP_INSTRUCTIONS.md` (setup guide for end users)
- Startup scripts:
  - `start_all_apps.bat` (Windows)
  - `activate_venv.bat` (Windows)

### Files to EXCLUDE:
- `venv/` - Virtual environment (recipient will create their own)
- `__pycache__/` - Python cache files
- `uploads/` - User-generated content (optional - can include empty folder structure)
- `.git/` - Git repository (if present)
- Any database files in `type-editor-db-v2/` folders

## Packaging for Distribution

### Option 1: ZIP Archive (Recommended)
1. Create a clean copy of the project
2. Remove the excluded files/folders listed above
3. Create a ZIP archive named something like `xml-data-viewer-v1.0.zip`
4. Include the setup instructions

### Option 2: Git Repository
If distributing via Git:
1. Ensure `.gitignore` excludes `venv/`, `__pycache__/`, `uploads/`
2. Recipient can clone and follow setup instructions

## What the Recipient Needs

### Prerequisites:
- **Python 3.13 or higher** installed on their system
- **Windows 10/11** (for the batch scripts)
- Internet connection (for initial package installation only)

### Installation Steps (for Recipient):

1. **Extract the ZIP file** to a location of their choice (e.g., `C:\Users\Username\Documents\xml-data-viewer`)

2. **Open Command Prompt** in the extracted folder

3. **Create a virtual environment:**
   ```cmd
   python -m venv venv
   ```

4. **Activate the virtual environment:**
   ```cmd
   venv\Scripts\activate
   ```

5. **Install dependencies:**
   ```cmd
   pip install -r requirements.txt
   ```

6. **Run the applications:**
   - Option A: Use the startup script
     ```cmd
     start_all_apps.bat
     ```
   - Option B: Run manually
     ```cmd
     python run_launcher.py
     ```
     (Then open separate terminals for the other apps if needed)

7. **Open browser** to `http://localhost:5000` to access the launcher

## Port Configuration

The applications use the following ports:
- **Launcher**: Port 5000
- **Economy Editor**: Port 5004
- **Map Viewer**: Port 5003

If these ports are already in use, the user will need to modify the port numbers in:
- `run_launcher.py` (line 9)
- `run_economy_editor.py` (line 9)
- `run_map_viewer.py` (line 9)
- `launcher_app.py` (lines 12-13)

## Customization Notes

### Default Mission Directories
The applications have hardcoded default mission directories:
- **Economy Editor**: `E:\DayZ_Servers\Nyheim20_Server\mpmissions\empty.nyheim`
- **Map Viewer**: `E:\DayZ_Servers\Nyheim_Server\mpmissions\dayzOffline.nyheim`

Users can change these in the respective application files or use the UI to select different directories.

### Database Location
The Economy Editor creates databases in:
`[mission_directory]/type-editor-db-v2/editor_data_v2.db`

This is created automatically when the user first loads a mission directory.

## Troubleshooting

### Port Already in Use
If a port is already in use, modify the port number in the run scripts.

### Python Not Found
Ensure Python 3.13+ is installed and added to PATH. Test with:
```cmd
python --version
```

### Module Not Found Errors
Ensure the virtual environment is activated and dependencies are installed:
```cmd
venv\Scripts\activate
pip install -r requirements.txt
```

### Windows Terminal Not Found
If `start_all_apps.bat` fails with Windows Terminal errors, it will fall back to separate windows. This is normal if Windows Terminal is not installed.

## Distribution Checklist

Before distributing, ensure:
- [ ] All source files are included
- [ ] `venv/` folder is excluded
- [ ] `__pycache__/` folders are excluded
- [ ] `uploads/` folder is excluded (or empty)
- [ ] `requirements.txt` is up to date
- [ ] `README.md` is included
- [ ] `SETUP_INSTRUCTIONS.md` is included
- [ ] Default paths are documented or made configurable
- [ ] Test the distribution package on a clean system

