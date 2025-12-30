#!/usr/bin/env python3
"""
Run script for Database Manager application.
"""

from db_manager_app import app

if __name__ == '__main__':
    print("Starting Database Manager...")
    print("Open your browser to http://localhost:5003")
    app.run(debug=True, host='0.0.0.0', port=5003)



