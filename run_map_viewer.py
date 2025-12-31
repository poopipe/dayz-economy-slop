#!/usr/bin/env python3
"""Run script for Map Viewer application."""

from map_viewer_app import app

if __name__ == '__main__':
    print("Map Viewer starting...")
    print("Open your browser to http://localhost:5003")
    app.run(debug=True, host='0.0.0.0', port=5003)

