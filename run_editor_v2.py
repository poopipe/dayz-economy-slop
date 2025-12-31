#!/usr/bin/env python3
"""Run script for Editor v2 application."""

from editor_v2_app import app

if __name__ == '__main__':
    print("Editor v2 starting...")
    print("Open your browser to http://localhost:5004")
    app.run(debug=True, host='0.0.0.0', port=5004)


