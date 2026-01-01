# Economy Editor

A comprehensive web-based toolkit for managing and visualizing DayZ server mission file data. Features a database-backed XML editor and an interactive 2D map viewer with advanced filtering capabilities.

## Overview

Economy Editor consists of three integrated applications:

- **Economy Editor** - Database-backed XML element editor for managing economy configuration files
- **Map Viewer** - Interactive 2D map visualization tool for viewing spawn points, territories, and markers
- **Launcher** - Unified entry point providing seamless navigation between applications

## Features

### Economy Editor

- **Database-Backed Management**
  - Normalized SQLite database schema for efficient data storage and querying
  - Automatic database creation and management
  - Database backup functionality

- **XML Import/Export**
  - Import XML files from mission directories
  - Export edited data back to XML format
  - Support for `cfgeconomycore.xml` and related economy files

- **Data Editing**
  - Inline cell editing for quick modifications
  - Add new items with comprehensive form
  - Delete items with confirmation
  - Duplicate detection and resolution

- **Advanced Filtering**
  - Filter by multiple criteria (name, category, tags, flags, etc.)
  - Numeric range filters for quantities and prices
  - Real-time filtering as you type
  - Save and restore filter configurations

- **Relationship Management**
  - Manage categories, item classes, and item tags
  - Edit value flags and usage flags
  - Visual relationship indicators

- **Column Management**
  - Show/hide columns for customized views
  - Column visibility persistence
  - Sortable columns

### Map Viewer

- **Multi-Layer Visualization**
  - Group markers from `mapgrouppos.xml`
  - Event spawn markers from `cfgeventspawns.xml` (purple markers)
  - Territory zones and bounding circles from `env/*.xml` files
  - Effect area circles from `cfgeffectareas.json`

- **Interactive Controls**
  - Pan with middle mouse button or space + drag
  - Zoom with mouse wheel
  - Click to select markers
  - Marquee selection for multiple markers
  - Hover tooltips with detailed information

- **Advanced Filtering System**
  - Filter group markers by usage and group name
  - Filter event spawns by type
  - Filter territories by type and name
  - Display/Hide filter logic for intuitive combination
  - Invert filters with checkbox controls
  - Multiple filters with OR logic
  - Filter state persistence in localStorage

- **Background Image Support**
  - Upload custom background images
  - Adjustable image dimensions (metres)
  - Opacity slider (0-100%) with WebGL acceleration
  - Show/hide background image toggle
  - Image persistence across sessions

- **Visualization Features**
  - Grid overlay with 100m and 1km lines
  - Color-coded markers (blue for groups, purple for event spawns)
  - Territory bounding circles with unique colors per territory type
  - Effect area circles with transparency
  - Selected marker highlighting
  - Hover effects

- **Data Export**
  - Copy selected markers' XML to clipboard
  - Multi-marker selection support

- **Display Controls**
  - Toggle grid visibility
  - Toggle marker visibility
  - Toggle event spawn visibility
  - Toggle territory visibility
  - Toggle effect area visibility
  - Toggle background image visibility
  - All settings persist in localStorage

### Launcher

- **Unified Interface**
  - Single entry point for all applications
  - Tab-based navigation between Economy Editor and Map Viewer
  - Real-time status indicators for each application
  - Automatic iframe loading and error handling

- **Status Monitoring**
  - Online/offline status for each application
  - Automatic connection checking
  - Retry functionality for failed connections

## Installation

### Prerequisites

- **Python 3.13 or higher** - Download from [python.org](https://www.python.org/downloads/)
  - During installation, ensure "Add Python to PATH" is checked
- **Windows 10/11** (for batch scripts) or any OS with Python support
- **Internet connection** (for initial package installation)

### Quick Setup (Windows)

1. **Extract the application** to your desired location

2. **Run the setup script:**
   ```cmd
   setup.bat
   ```
   This will:
   - Check Python installation
   - Create a virtual environment
   - Install all required dependencies

3. **Start all applications:**
   ```cmd
   start_all_apps.bat
   ```
   This will launch all three applications in separate windows/tabs.

4. **Open your browser** to:
   ```
   http://localhost:5000
   ```

### Manual Setup

1. **Create virtual environment:**
   ```cmd
   python -m venv venv
   ```

2. **Activate virtual environment:**
   ```cmd
   venv\Scripts\activate
   ```
   (On Linux/Mac: `source venv/bin/activate`)

3. **Install dependencies:**
   ```cmd
   pip install -r requirements.txt
   ```

4. **Start applications:**
   
   **Option A: Use startup script**
   ```cmd
   start_all_apps.bat
   ```
   
   **Option B: Run manually (3 separate terminals)**
   ```cmd
   # Terminal 1 - Economy Editor
   python run_economy_editor.py
   
   # Terminal 2 - Map Viewer
   python run_map_viewer.py
   
   # Terminal 3 - Launcher (optional)
   python run_launcher.py
   ```

## Startup Instructions

### Using the Launcher (Recommended)

1. Start all three applications using `start_all_apps.bat` or manually
2. Open browser to `http://localhost:5000`
3. Use the tabs to switch between Economy Editor and Map Viewer
4. Check status indicators at the bottom to verify all apps are online

### Direct Access

You can also access applications directly:

- **Economy Editor**: `http://localhost:5004`
- **Map Viewer**: `http://localhost:5003`
- **Launcher**: `http://localhost:5000`

### Port Configuration

Default ports:
- Launcher: `5000`
- Economy Editor: `5004`
- Map Viewer: `5003`

To change ports, edit the `run_*.py` files and modify the `port` parameter in `app.run()`.

## Usage

### Economy Editor

1. **Load Data:**
   - Enter your mission directory path (e.g., `E:\DayZ_Servers\Server\mpmissions\dayzOffline.nyheim`)
   - Click "Load XML Data" to import from `cfgeconomycore.xml`
   - Or click "Load Database" to work with an existing database file

2. **Edit Items:**
   - Click on any cell to edit inline
   - Use "Add New Item" to create new entries
   - Select rows and use context actions to delete

3. **Filter Data:**
   - Use the filter row at the top of the table
   - Apply multiple filters simultaneously
   - Filters persist across sessions

4. **Export:**
   - Use export functionality to save changes back to XML

### Map Viewer

1. **Load Markers:**
   - Enter your mission directory path
   - Click "Load Markers" to load all marker data

2. **Navigate:**
   - **Pan**: Middle mouse button or Space + drag
   - **Zoom**: Mouse wheel
   - **Select**: Click on markers or use marquee selection

3. **Filter Markers:**
   - Use filter sections for groups, event spawns, and territories
   - Add multiple filters with "Display" or "Hide" logic
   - Toggle filter inversion with checkboxes

4. **Background Image:**
   - Click "Load Image" to upload a map background
   - Set image dimensions in metres
   - Adjust opacity with the slider
   - Toggle visibility with checkbox

5. **Export:**
   - Select markers (click or marquee)
   - Click "Copy Selected XML" to copy to clipboard

## Project Structure

```
.
├── economy_editor_app.py      # Economy Editor Flask application
├── map_viewer_app.py          # Map Viewer Flask application
├── launcher_app.py            # Launcher Flask application
├── run_economy_editor.py      # Economy Editor startup script
├── run_map_viewer.py          # Map Viewer startup script
├── run_launcher.py            # Launcher startup script
├── setup.bat                  # Automated setup script
├── start_all_apps.bat         # Startup script for all apps
├── requirements.txt           # Python dependencies
├── static/
│   ├── css/
│   │   ├── economy_editor.css # Economy Editor styles (Nord theme)
│   │   ├── map_viewer.css      # Map Viewer styles (Nord theme)
│   │   └── launcher.css        # Launcher styles (Nord theme)
│   └── js/
│       ├── economy_editor.js   # Economy Editor frontend logic
│       ├── map_viewer.js       # Map Viewer frontend logic
│       └── launcher.js         # Launcher frontend logic
├── templates/
│   ├── economy_editor.html     # Economy Editor UI
│   ├── map_viewer.html         # Map Viewer UI
│   └── launcher.html           # Launcher UI
└── uploads/
    └── background_images/      # Uploaded background images
```

## Requirements

- **Python**: 3.13 or higher
- **Dependencies** (installed via `requirements.txt`):
  - Flask 3.0.0
  - watchdog 3.0.0

## Technology Stack

- **Backend**: Flask (Python web framework)
- **Database**: SQLite (for Economy Editor)
- **Frontend**: Vanilla JavaScript, HTML5 Canvas, WebGL
- **XML Processing**: Python ElementTree (standard library)
- **Theme**: Nord color scheme (dark theme, no rounded corners)

## Troubleshooting

### Python Not Found
- Ensure Python 3.13+ is installed and added to PATH
- Reinstall Python with "Add Python to PATH" checked

### Port Already in Use
- Close other applications using ports 5000, 5003, or 5004
- Or modify port numbers in the `run_*.py` files

### Module Not Found
- Ensure virtual environment is activated: `venv\Scripts\activate`
- Install dependencies: `pip install -r requirements.txt`

### Applications Won't Load in Launcher
- Verify all three applications are running
- Check status indicators at bottom of launcher page
- Try accessing applications directly:
  - Economy Editor: `http://localhost:5004`
  - Map Viewer: `http://localhost:5003`

### Background Image Not Visible
- Ensure "Show Background Image" checkbox is checked
- Check that image was uploaded successfully
- Verify image dimensions are set correctly

## Stopping Applications

Press `Ctrl+C` in each terminal window to stop the applications, or simply close the terminal windows.

## License

See `LICENSE` file for details.

## Support

For detailed setup instructions, see `SETUP_INSTRUCTIONS.md`.

For distribution instructions, see `DISTRIBUTION.md`.
