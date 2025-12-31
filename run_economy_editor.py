#!/usr/bin/env python3
"""Run script for Economy Editor application."""

from economy_editor_app import app

if __name__ == '__main__':
    print("Economy Editor starting...")
    print("Open your browser to http://localhost:5004")
    app.run(debug=True, host='0.0.0.0', port=5004)


