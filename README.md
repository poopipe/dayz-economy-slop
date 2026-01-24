# XML Data Viewer

A comprehensive web-based toolkit for managing and visualizing DayZ server mission file data. Features a database-backed XML editor and an interactive 2D map viewer with advanced filtering and editing capabilities.

This application was written by an LLM in Cursor, an AI-powered code editor. The codebase was developed through iterative conversation and refinement, with the AI assistant handling implementation, debugging, and feature additions based on user requirements.

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

## Running the Application

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

## Overview

XML Data Viewer consists of three integrated applications:

- **Economy Editor** - Database-backed XML element editor for managing economy configuration files
- **Map Viewer** - Interactive 2D map visualization and editing tool for viewing and modifying spawn points, territories, and markers
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

#### Visualization Features

- **Multi-Layer Visualization**
  - Group markers from `mapgrouppos.xml` (blue markers)
  - Event spawn markers from `cfgeventspawns.xml` (purple markers)
  - Territory zones and bounding circles from `env/*.xml` files (color-coded by territory type)
  - Effect area circles from `cfgeffectareas.json` (orange circles)
  - Player spawn points from `cfgplayerspawnpoints.xml` (rectangular markers)

- **Interactive Controls**
  - **Pan**: Middle mouse button or Space + drag
  - **Zoom**: Mouse wheel
  - **Select**: Click on markers or use marquee selection (drag to create selection rectangle)
  - **Hover**: Tooltips with detailed marker information
  - **Right-click**: Copy location coordinates to clipboard

- **Visualization Features**
  - Grid overlay with 100m and 1km lines
  - Color-coded markers by type
  - Territory bounding circles with unique colors per territory type
  - Effect area circles with transparency
  - Selected marker highlighting
  - Hover effects
  - Radius handles for editable markers in edit mode

- **Background Image Support**
  - Upload custom background images (PNG, JPG, JPEG, GIF, BMP, WEBP)
  - Adjustable image dimensions (metres)
  - Opacity slider (0-100%) with WebGL acceleration
  - Show/hide background image toggle
  - Image persistence across sessions

- **Display Controls**
  - Toggle grid visibility
  - Toggle marker visibility
  - Toggle event spawn visibility
  - Toggle territory visibility
  - Toggle effect area visibility
  - Toggle player spawn points visibility
  - Toggle background image visibility
  - Height filter: Min/Max Y-coordinate sliders (hides markers outside range)
  - All settings persist in localStorage

#### Advanced Filtering System

- **Group Marker Filters**
  - Filter by usage (multiple selections)
  - Filter by group name (search and select)
  - Display/Hide filter logic
  - Multiple filters with OR logic
  - Filter state persistence

- **Event Spawn Filters**
  - Filter by event spawn type
  - "Is One Of" or "Is Not One Of" criteria
  - Multiple filters with OR logic

- **Territory Filters**
  - Filter by territory type
  - Filter by territory name
  - Multiple filters with OR logic

#### Editing Features

The Map Viewer includes comprehensive editing capabilities for various marker types:

- **Event Spawns** (`cfgeventspawns.xml`)
  - Enable **Marker editing**, then select **Event Spawns** from the edit dropdown
  - **Event Type for New Spawns**: choose the `<event name="...">` group for new positions
  - **Add**: Ctrl+Click (Cmd+Click on Mac) to add event spawn at cursor
  - **Move**: Click and drag to move marker
  - **Delete**: Select markers and press Delete/Backspace
  - **Save Changes**: Saves to `cfgeventspawns.xml` while preserving existing event/pos grouping
  - **Discard Changes**: Restores all changes made since entering edit mode

- **Player Spawn Points** (`cfgplayerspawnpoints.xml`)
  - Enable **Marker editing**, then select **Player Spawn Points** from the edit dropdown
  - **Add**: Ctrl+Click (Cmd+Click on Mac) to add spawn point at cursor
  - **Move**: Click and drag to move marker
  - **Resize**: Drag corners to resize rectangle (width/height)
  - **Delete**: Select markers and press Delete/Backspace
  - **Save Changes**: Saves to `cfgplayerspawnpoints.xml`
  - **Discard Changes**: Restores all changes made since entering edit mode

- **Effect Areas** (`cfgeffectareas.json`)
  - Enable **Marker editing**, then select **Effect Areas** from the edit dropdown
  - **Add**: Ctrl+Click to add effect area at cursor
  - **Move**: Click and drag center of circle
  - **Resize**: Click and drag edge or handle (white dot) to change radius
  - **Delete**: Select effect areas and press Delete/Backspace
  - **Save Changes**: Saves to `cfgeffectareas.json`
  - **Discard Changes**: Restores all changes made since entering edit mode

- **Territory Zones** (`env/*.xml` files)
  - Enable **Marker editing**, then select a territory type from the edit dropdown
  - **Territory Type Selector**: Choose territory type for new zones
  - **Add**: Ctrl+Click to add zone at cursor (uses selected territory type)
  - **Move**: Click and drag center of circle
  - **Resize**: Click and drag edge or handle (white dot) to change radius
  - **Delete**: Select zones and press Delete/Backspace
  - **Save Changes**: Saves to appropriate `env/*.xml` files
  - **Discard Changes**: Restores all changes made since entering edit mode

- **Zombie Territory Zones** (`env/*.xml` files)
  - Enable **Marker editing**, then select **Zombie Territory Zones** from the edit dropdown
  - **Add**: Ctrl+Click to add zone at cursor
  - **Move**: Click and drag center of circle
  - **Resize**: Click and drag edge or handle (white dot) to change radius
  - **Delete**: Select zones and press Delete/Backspace
  - **Zone Parameters**: Configure zone parameters using list boxes (for selected zones)
  - **Save Changes**: Saves to appropriate `env/*.xml` files
  - **Discard Changes**: Restores all changes made since entering edit mode

**Multi-Marker Editing:**
- Select multiple markers using Ctrl+Click or marquee selection
- When moving a marker, all selected markers move together while retaining relative positions
- When adjusting radius, all selected markers are assigned the same radius value
- Changes are tracked and can be saved or discarded

**Edit Mode Behavior:**
- Each edit mode includes a **"Show only this marker type"** checkbox to temporarily filter the display to the active type
- Only one marker type can be edited at a time
- When enabling edit mode for a type, other types' edit modes are disabled
- Unsaved changes prompt confirmation when disabling edit mode
- Visual indicators show selected, new, modified, and deleted markers

- **Data Export**
  - Copy selected markers' XML to clipboard
  - Multi-marker selection support
  - Right-click on map to copy location coordinates

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

#### Basic Usage

1. **Load Markers:**
   - Enter your mission directory path (e.g., `E:\DayZ_Servers\Server\mpmissions\dayzOffline.nyheim`)
   - Click "Load Markers" to load all marker data from:
     - `mapgrouppos.xml` (group markers)
     - `cfgeventspawns.xml` (event spawns)
     - `env/*.xml` (territories)
     - `cfgeffectareas.json` (effect areas)
     - `cfgplayerspawnpoints.xml` (player spawn points)

2. **Navigate:**
   - **Pan**: Middle mouse button or Space + drag
   - **Zoom**: Mouse wheel
   - **Select**: Click on markers or use marquee selection (drag to create selection rectangle)
   - **Right-click**: Copy location coordinates to clipboard

3. **Filter Markers:**
   - Use filter sections for groups, event spawns, and territories
   - Add multiple filters with "Display" or "Hide" logic
   - Toggle filter inversion with checkboxes
   - Filters persist across sessions

4. **Background Image:**
   - Click "Load Image" to upload a map background
   - Set image dimensions in metres (width and height)
   - Adjust opacity with the slider (0-100%)
   - Toggle visibility with checkbox
   - Click "Clear Image" to remove background

5. **Export:**
   - Select markers (click or marquee)
   - Click "Copy Selected XML" to copy to clipboard

#### Editing Markers

1. **Enable Edit Mode:**
   - Check **"Marker editing"**
   - Select the marker type you want to edit from the dropdown
   - Edit controls will appear for the selected type
   - Only one marker type can be edited at a time

2. **Add Markers:**
   - Hold Ctrl (Cmd on Mac) and click on the map where you want to add a marker
   - For territory zones, select the territory type in the **"Territory Type for New Zones"** control
   - For event spawns, select the event type in the **"Event Type for New Spawns"** control

3. **Move Markers:**
   - Click and drag the center of the marker
   - For circles (effect areas, territory zones), drag the center point
   - For rectangles (player spawn points), drag anywhere on the marker
   - Multiple selected markers move together while maintaining relative positions

4. **Resize Markers:**
   - **Circles** (effect areas, territory zones): Click and drag the edge or the white handle dot
   - **Rectangles** (player spawn points): Drag the corners
   - When multiple markers are selected, all selected markers get the same radius/dimensions

5. **Delete Markers:**
   - Select one or more markers (click or marquee)
   - Press Delete or Backspace
   - Markers are marked for deletion (will be removed on save)

6. **Save Changes:**
   - Click "Save Changes" button in the edit controls
   - Changes are written to the appropriate XML/JSON files
   - Success message confirms the save operation

7. **Discard Changes:**
   - Click "Discard Changes" button to revert all changes made since entering edit mode
   - This restores original positions, removes newly added markers, and restores deleted markers
   - All change tracking is cleared

8. **Disable Edit Mode:**
   - Uncheck **"Marker editing"**
   - If there are unsaved changes, you'll be prompted to discard them
   - Selections are cleared when disabling edit mode

## How It Works

### Architecture

The application uses a client-server architecture:

- **Backend**: Flask (Python) web framework serving REST API endpoints
- **Frontend**: Vanilla JavaScript with HTML5 Canvas for rendering
- **Data Storage**: XML/JSON files in mission directory, SQLite database for Economy Editor
- **Communication**: RESTful API endpoints for data loading and saving

### Map Viewer Rendering

The Map Viewer uses a multi-layer canvas system:

1. **Background Canvas**: Renders background images with WebGL acceleration
2. **Marker Canvas**: Renders all markers, territories, and effect areas
3. **Overlay Canvas**: Renders temporary UI elements (marquee selection, tooltips)

This separation allows for optimized rendering - the overlay canvas can be updated without redrawing the entire scene.

### Marker Editing System

The editing system uses a unified architecture:

- **Marker Types Configuration**: Each marker type (event spawns, player spawn points, effect areas, territory zones, zombie territory zones) has a configuration object defining its capabilities and behavior
- **EditControlsManager**: Dynamically generates UI controls for each marker type based on configuration
- **State Management**: Tracks original positions, new markers, deleted markers, and modifications
- **Event System**: Publishes events for marker changes (created, deleted, moved, resized, selected)
- **Selection Manager**: Centralized selection logic that enforces visibility and edit mode restrictions
- **Interaction Handlers**: Unified system for handling clicks, drags, and radius editing

### File Structure

The Map Viewer reads and writes to these files:

- `mapgrouppos.xml` - Group marker positions (read-only visualization)
- `mapgroupproto.xml` - Group prototypes (read-only, for matching with positions)
- `cfgeventspawns.xml` - Event spawn markers (read/write)
- `cfgeffectareas.json` - Effect area definitions (read/write)
- `cfgplayerspawnpoints.xml` - Player spawn point positions (read/write)
- `env/*.xml` - Territory zone definitions (read/write)

### API Endpoints

**Map Viewer API:**

- `GET /api/groups` - Load group markers from `mapgrouppos.xml`
- `GET /api/event-spawns` - Load event spawns from `cfgeventspawns.xml`
- `POST /api/event-spawns/save` - Save event spawns to `cfgeventspawns.xml`
- `GET /api/territories` - Load territories from `env/*.xml` files
- `GET /api/effect-areas` - Load effect areas from `cfgeffectareas.json`
- `GET /api/player-spawn-points` - Load player spawn points from `cfgplayerspawnpoints.xml`
- `POST /api/effect-areas/save` - Save effect areas to `cfgeffectareas.json`
- `POST /api/player-spawn-points/save` - Save player spawn points to `cfgplayerspawnpoints.xml`
- `POST /api/territories/save` - Save territory zones to `env/*.xml` files
- `POST /api/upload-background-image` - Upload background image
- `GET /api/background-image/<image_id>` - Retrieve background image
- `DELETE /api/delete-background-image/<image_id>` - Delete background image

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
│   │   ├── map_viewer.css     # Map Viewer styles (Nord theme)
│   │   └── launcher.css       # Launcher styles (Nord theme)
│   └── js/
│       ├── economy_editor.js  # Economy Editor frontend logic
│       ├── map_viewer.js       # Map Viewer frontend logic (6500+ lines)
│       └── launcher.js         # Launcher frontend logic
├── templates/
│   ├── economy_editor.html    # Economy Editor UI
│   ├── map_viewer.html        # Map Viewer UI
│   └── launcher.html          # Launcher UI
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

### Markers Not Loading
- Verify mission directory path is correct
- Check that required XML/JSON files exist in the mission directory
- Check browser console for error messages
- Verify file permissions (read access required)

### Edit Mode Not Working
- Ensure **"Marker editing"** is enabled and you selected a marker type from the dropdown
- Check that markers are visible (not filtered out)
- Verify you have write permissions to the mission directory
- Check browser console for error messages

### Changes Not Saving
- Verify write permissions to mission directory
- Check that XML/JSON files are not locked by another process
- Review server console for error messages
- Ensure mission directory path is correct

## Stopping Applications

Press `Ctrl+C` in each terminal window to stop the applications, or simply close the terminal windows.

## License

See `LICENSE` file for details.

## Support

For detailed setup instructions, see `SETUP_INSTRUCTIONS.md`.

For distribution instructions, see `DISTRIBUTION.md`.
