# XML Data Viewer

A collection of web-based tools for viewing and editing XML data from DayZ server mission files.

## Applications

### Launcher (`launcher_app.py`)
A unified entry point that provides navigation between all applications in a single browser session.

**Run:**
```cmd
python run_launcher.py
```

**Access:** `http://localhost:5000`

**Note:** The launcher requires both Economy Editor and Map Viewer to be running. Start them in separate terminals:
```cmd
# Terminal 1
python run_economy_editor.py

# Terminal 2
python run_map_viewer.py

# Terminal 3 (optional - for launcher)
python run_launcher.py
```

### 1. Economy Editor (`economy_editor_app.py`)
A database editor for managing XML type elements with a normalized database schema.

**Run:**
```cmd
python run_economy_editor.py
```

**Access:** `http://localhost:5004`

### 2. Map Viewer (`map_viewer_app.py`)
A 2D map viewer for visualizing group positions from `mapgrouppos.xml` with filtering capabilities.

**Run:**
```cmd
python run_map_viewer.py
```

**Access:** `http://localhost:5003`

## Requirements

- Python 3.13+
- Virtual environment (created automatically)

## Setup

1. Activate the virtual environment:
   ```cmd
   activate_venv.bat
   ```

2. Install dependencies (if not already installed):
   ```cmd
   pip install -r requirements.txt
   ```

## Project Structure

```
.
├── launcher_app.py           # Launcher Flask application
├── economy_editor_app.py     # Economy editor Flask application
├── map_viewer_app.py         # Map viewer Flask application
├── run_launcher.py           # Convenience script to run launcher
├── run_economy_editor.py     # Convenience script to run economy editor
├── run_map_viewer.py         # Convenience script to run map viewer
├── static/                   # Static files (CSS, JS)
│   ├── css/
│   │   ├── launcher.css
│   │   ├── economy_editor.css
│   │   └── map_viewer.css
│   └── js/
│       ├── launcher.js
│       ├── economy_editor.js
│       └── map_viewer.js
├── templates/                 # HTML templates
│   ├── launcher.html
│   ├── economy_editor.html
│   └── map_viewer.html
├── uploads/                  # Uploaded files (background images, etc.)
│   └── background_images/
├── requirements.txt          # Python dependencies
├── activate_venv.bat         # Virtual environment activation script
└── venv/                     # Virtual environment (created automatically)
```

## Features

### Economy Editor
- Database-backed XML element management
- Normalized schema for efficient querying
- Import/export XML files
- Filter and search capabilities
- Relationship management (categories, tags, flags, etc.)

### Map Viewer
- 2D visualization of group positions
- Pan and zoom functionality
- Background image support
- Filter by usage and group name
- Marker selection and XML export
- Grid overlay with 100m and 1km lines

## Distribution

To distribute these applications to other users:

1. **Package the application:**
   - Include all source files (Python, HTML, CSS, JS, templates)
   - Include `requirements.txt`, `README.md`, and `SETUP_INSTRUCTIONS.md`
   - Include `setup.bat` and `start_all_apps.bat`
   - **Exclude**: `venv/`, `__pycache__/`, `uploads/` (user-generated content)
   - Create a ZIP archive

2. **Recipient setup:**
   - Extract the ZIP file
   - Run `setup.bat` (or follow manual setup in `SETUP_INSTRUCTIONS.md`)
   - Run `start_all_apps.bat` to start all applications
   - Open browser to `http://localhost:5000`

See `DISTRIBUTION.md` for detailed distribution instructions and `SETUP_INSTRUCTIONS.md` for end-user setup guide.

## Development

The applications use:
- **Flask**: Web framework
- **SQLite**: Database (for economy editor)
- **ElementTree**: XML parsing (Python standard library)
- **WebGL**: GPU-accelerated rendering (for map viewer background)
