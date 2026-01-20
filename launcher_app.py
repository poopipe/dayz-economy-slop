#!/usr/bin/env python3
"""
Launcher application for XML Data Viewer tools.
Provides a unified entry point to access both Economy Editor and Map Viewer.
"""

from flask import Flask, render_template

app = Flask(__name__)

# URLs for the two applications
ECONOMY_EDITOR_URL = "http://localhost:5004"
MAP_VIEWER_URL = "http://localhost:5003"


@app.route('/')
def index():
    """Main launcher page."""
    return render_template('launcher.html', 
                         economy_editor_url=ECONOMY_EDITOR_URL,
                         map_viewer_url=MAP_VIEWER_URL)


if __name__ == '__main__':
    print("=" * 60)
    print("XML Data Viewer Launcher")
    print("=" * 60)
    print(f"Launcher: http://localhost:5000")
    print(f"Economy Editor: {ECONOMY_EDITOR_URL}")
    print(f"Map Viewer: {MAP_VIEWER_URL}")
    print("=" * 60)
    print("\nMake sure both Economy Editor and Map Viewer are running!")
    print("Run 'python run_economy_editor.py' in one terminal")
    print("Run 'python run_map_viewer.py' in another terminal")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5000)






