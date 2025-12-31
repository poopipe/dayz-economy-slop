# XML Data Viewer

A collection of web-based tools for viewing and editing XML data from DayZ server mission files.

## Applications

### 1. Economy Editor (`economy_editor_app.py`)
A database editor for managing XML type elements with a normalized database schema.

**Run:**
```cmd
python run_economy_editor.py
```

**Access:** `http://localhost:5004`

### 2. Marker Viewer (`marker_viewer_app.py`)
A 2D marker viewer for visualizing group positions from `mapgrouppos.xml` with filtering capabilities.

**Run:**
```cmd
python run_marker_viewer.py
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
├── economy_editor_app.py     # Economy editor Flask application
├── marker_viewer_app.py      # Marker viewer Flask application
├── run_economy_editor.py     # Convenience script to run economy editor
├── run_marker_viewer.py      # Convenience script to run marker viewer
├── static/                   # Static files (CSS, JS)
│   ├── css/
│   │   ├── economy_editor.css
│   │   └── marker_viewer.css
│   └── js/
│       ├── economy_editor.js
│       └── marker_viewer.js
├── templates/                # HTML templates
│   ├── economy_editor.html
│   └── marker_viewer.html
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

### Marker Viewer
- 2D visualization of group positions
- Pan and zoom functionality
- Background image support
- Filter by usage and group name
- Marker selection and XML export
- Grid overlay with 100m and 1km lines

## Development

The applications use:
- **Flask**: Web framework
- **SQLite**: Database (for economy editor)
- **ElementTree**: XML parsing (Python standard library)
- **WebGL**: GPU-accelerated rendering (for marker viewer background)
