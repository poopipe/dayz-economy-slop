#!/usr/bin/env python3
"""
Startup script that runs Flask app with file watcher for live updates.
"""

import threading
from pathlib import Path
from app import app, DATA_DIR
from file_watcher import start_file_watcher


def on_file_change(file_path):
    """
    Callback when XML files change.
    This can be extended to notify connected clients via WebSockets or SSE.
    
    Args:
        file_path: Path to changed file
    """
    print(f"File changed detected: {file_path}")
    # In a production app, you might want to use WebSockets or Server-Sent Events
    # to push updates to connected clients


if __name__ == '__main__':
    # Start file watcher in background thread
    watcher = start_file_watcher(DATA_DIR, on_file_change)
    
    try:
        print(f"XML Data Viewer starting...")
        print(f"Data directory: {DATA_DIR}")
        print(f"Watching for XML file changes...")
        print(f"Open your browser to http://localhost:5000")
        print(f"Press Ctrl+C to stop")
        print()
        
        # Run Flask app
        app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False)
    except KeyboardInterrupt:
        print("\nShutting down...")
        watcher.stop()
        print("Stopped.")

