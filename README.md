# XML Data Viewer

A web-based XML data viewer with live updates when source XML files change.

## Features

- Web browser-based interface
- Python backend (Flask)
- Live file watching and automatic updates
- Virtual environment setup
- Real-time XML data display with auto-refresh

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

3. Run the server with file watching:
   ```cmd
   python run.py
   ```
   
   Or run the app directly (without file watcher):
   ```cmd
   python app.py
   ```

4. Open your browser to `http://localhost:5000`

## Project Structure

```
.
├── app.py                 # Main Flask application
├── run.py                 # Startup script with file watcher
├── file_watcher.py        # File watching service
├── static/                # Static files (CSS, JS)
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
├── templates/             # HTML templates
│   └── index.html
├── data/                  # XML data files to watch
│   └── sample.xml
├── requirements.txt       # Python dependencies
├── activate_venv.bat      # Virtual environment activation script
└── venv/                  # Virtual environment (created automatically)

```

## Usage

1. Place XML files in the `data/` directory
2. The viewer will automatically detect changes and update the display
3. The web interface auto-refreshes every 2 seconds (configurable)
4. Click on any XML file in the list to view its contents
5. The file watcher will log changes to the console

## Features

- **Auto-refresh**: The web interface automatically polls for updates
- **File watching**: Backend monitors the data directory for file changes
- **Multiple files**: View any XML file in the data directory
- **Error handling**: Displays parse errors gracefully
- **Responsive design**: Modern, clean interface

## Development

The application uses:
- **Flask**: Web framework
- **watchdog**: File system monitoring
- **ElementTree**: XML parsing (Python standard library)
