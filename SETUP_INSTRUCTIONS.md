# Setup Instructions

Welcome! This guide will help you set up the XML Data Viewer applications on your computer.

## Prerequisites

Before you begin, make sure you have:
- **Python 3.13 or higher** installed
  - Download from: https://www.python.org/downloads/
  - During installation, check "Add Python to PATH"
- **Windows 10 or 11** (for batch scripts)
- An internet connection (for downloading packages)

## Quick Start

### Step 1: Extract the Files
Extract the ZIP file to a location of your choice, for example:
```
C:\Users\YourName\Documents\xml-data-viewer
```

### Step 2: Open Command Prompt
1. Navigate to the extracted folder
2. Right-click in the folder and select "Open in Terminal" or "Open PowerShell window here"
   - Or open Command Prompt and use `cd` to navigate to the folder

### Step 3: Create Virtual Environment
In the command prompt, type:
```cmd
python -m venv venv
```
This creates a virtual environment folder called `venv`.

### Step 4: Activate Virtual Environment
```cmd
venv\Scripts\activate
```
You should see `(venv)` appear at the beginning of your command prompt.

### Step 5: Install Dependencies
```cmd
pip install -r requirements.txt
```
This will download and install Flask and other required packages.

### Step 6: Run the Applications

**Option A: Use the Startup Script (Recommended)**
```cmd
start_all_apps.bat
```
This will start all three applications in Windows Terminal tabs (or separate windows).

**Option B: Run Manually**
Open three separate command prompts, activate the venv in each, and run:
```cmd
# Terminal 1
python run_economy_editor.py

# Terminal 2
python run_map_viewer.py

# Terminal 3
python run_launcher.py
```

### Step 7: Open in Browser
Once the applications are running, open your web browser and go to:
```
http://localhost:5000
```

You should see the launcher page with tabs for Economy Editor and Map Viewer.

## Using the Applications

### Economy Editor
- Access via launcher tab or directly at `http://localhost:5004`
- Used for managing XML type elements with a database
- First, select a mission directory containing your XML files

### Map Viewer
- Access via launcher tab or directly at `http://localhost:5003`
- Used for visualizing group positions from `mapgrouppos.xml`
- Load a mission directory to view markers on a 2D map

### Launcher
- Main entry point at `http://localhost:5000`
- Provides tabs to switch between Economy Editor and Map Viewer
- Shows status of both applications

## Troubleshooting

### "Python is not recognized"
- Python is not installed or not in PATH
- Reinstall Python and check "Add Python to PATH" during installation
- Or manually add Python to your system PATH

### "Port already in use"
- Another application is using ports 5000, 5003, or 5004
- Close other applications using these ports
- Or modify the port numbers in the run scripts

### "Module not found"
- Virtual environment is not activated
- Run `venv\Scripts\activate` first
- Or dependencies are not installed - run `pip install -r requirements.txt`

### Applications won't load in launcher
- Make sure all three applications are running
- Check the status indicators at the bottom of the launcher page
- Try accessing the applications directly:
  - Economy Editor: `http://localhost:5004`
  - Map Viewer: `http://localhost:5003`

### Can't find mission directory
- The default paths in the applications may not match your setup
- Use the UI to browse and select your mission directory
- Default paths can be changed in the application files if needed

## Stopping the Applications

To stop the applications:
1. Go to each command prompt window
2. Press `Ctrl+C` to stop each application
3. Close the command prompt windows

## Next Steps

- Read the `README.md` for more detailed information about features
- Check the application UIs for help and tooltips
- Customize default paths in the application files if needed

## Getting Help

If you encounter issues:
1. Check the troubleshooting section above
2. Verify all prerequisites are met
3. Ensure you followed all setup steps
4. Check that ports 5000, 5003, and 5004 are not in use by other applications

