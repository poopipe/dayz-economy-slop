#!/usr/bin/env python3
"""Run script for Marker Viewer application."""

from marker_viewer_app import app

if __name__ == '__main__':
    print("Marker Viewer starting...")
    print("Open your browser to http://localhost:5003")
    app.run(debug=True, host='0.0.0.0', port=5003)

