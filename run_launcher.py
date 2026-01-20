#!/usr/bin/env python3
"""Run script for Launcher application."""

from launcher_app import app

if __name__ == '__main__':
    print("=" * 60)
    print("XML Data Viewer Launcher")
    print("=" * 60)
    print("Launcher: http://localhost:5000")
    print("Economy Editor: http://localhost:5004")
    print("Map Viewer: http://localhost:5003")
    print("=" * 60)
    print("\n⚠️  IMPORTANT: Make sure both apps are running!")
    print("   Run 'python run_economy_editor.py' in one terminal")
    print("   Run 'python run_map_viewer.py' in another terminal")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5000)






