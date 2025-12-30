#!/usr/bin/env python3
"""Run script for Database Manager v2 application."""

from db_manager_v2_app import app

if __name__ == '__main__':
    print("Database Manager v2 starting...")
    print("Open your browser to http://localhost:5005")
    app.run(debug=True, host='0.0.0.0', port=5005)

