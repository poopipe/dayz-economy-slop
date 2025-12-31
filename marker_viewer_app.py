#!/usr/bin/env python3
"""
Flask application for displaying markers in 2D space from mapgrouppos.xml.
"""

import os
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Default mission directory
DEFAULT_MISSION_DIR = r"E:\DayZ_Servers\Nyheim_Server\mpmissions\dayzOffline.nyheim"


def parse_group_pos(pos_str):
    """Parse position string like '1234.5 678.9 1011.12' into (x, y, z)."""
    try:
        parts = pos_str.strip().split()
        if len(parts) >= 3:
            return (float(parts[0]), float(parts[1]), float(parts[2]))
        elif len(parts) == 2:
            return (float(parts[0]), 0.0, float(parts[1]))
        else:
            return (0.0, 0.0, 0.0)
    except (ValueError, AttributeError):
        return (0.0, 0.0, 0.0)


def load_groups_from_xml(xml_file_path):
    """
    Load group data from mapgrouppos.xml.
    Returns list of group dictionaries with position data.
    Note: z coordinate will be reversed in the frontend to place origin at lower left.
    """
    if not xml_file_path or not Path(xml_file_path).exists():
        print(f"XML file does not exist: {xml_file_path}")
        return []
    
    try:
        tree = ET.parse(xml_file_path)
        root = tree.getroot()
        
        groups = []
        
        # Try both .//group and //group to find groups
        group_elements = root.findall('.//group')
        if len(group_elements) == 0:
            # Try without the dot
            group_elements = root.findall('//group')
        if len(group_elements) == 0:
            # Try direct children
            group_elements = root.findall('group')
        
        print(f"Found {len(group_elements)} group elements")
        
        for group in group_elements:
            name = group.get('name', '')
            
            # Try pos as child element first
            pos_elem = group.find('pos')
            pos_str = None
            
            if pos_elem is not None and pos_elem.text is not None:
                pos_str = pos_elem.text
            # Try pos as attribute
            elif group.get('pos') is not None:
                pos_str = group.get('pos')
            # Try position as attribute
            elif group.get('position') is not None:
                pos_str = group.get('position')
            
            if pos_str is None:
                print(f"Skipping group '{name}': no position found")
                continue
            
            x, y, z = parse_group_pos(pos_str)
            
            # Skip if position is invalid (all zeros)
            if x == 0.0 and y == 0.0 and z == 0.0:
                print(f"Skipping group '{name}': invalid position")
                continue
            
            # Get usage from group if available
            usage_elem = group.find('usage')
            usage = usage_elem.text.strip() if usage_elem is not None and usage_elem.text else ''
            
            group_data = {
                'id': len(groups),  # Simple ID for now
                'name': name,
                'x': x,
                'y': y,
                'z': z,  # Frontend will reverse this
                'usage': usage
            }
            
            groups.append(group_data)
        
        print(f"Successfully loaded {len(groups)} groups")
        return groups
    except Exception as e:
        import traceback
        print(f"Error loading groups: {e}")
        traceback.print_exc()
        return []


@app.route('/')
def index():
    """Main page."""
    return render_template('marker_viewer.html')


@app.route('/api/groups')
def get_groups():
    """Get group data from mapgrouppos.xml."""
    try:
        mission_dir = request.args.get('mission_dir', DEFAULT_MISSION_DIR)
        
        if not mission_dir:
            return jsonify({'error': 'No mission directory specified'}), 400
        
        mission_path = Path(mission_dir)
        if not mission_path.exists():
            return jsonify({
                'success': False,
                'error': f'Mission directory does not exist: {mission_dir}'
            }), 404
        
        # Look for mapgrouppos.xml
        mapgrouppos_file = mission_path / 'mapgrouppos.xml'
        if not mapgrouppos_file.exists():
            return jsonify({
                'success': False,
                'error': f'mapgrouppos.xml not found at: {mapgrouppos_file}'
            }), 404
        
        print(f"Loading groups from: {mapgrouppos_file}")
        groups = load_groups_from_xml(str(mapgrouppos_file))
        
        if len(groups) == 0:
            return jsonify({
                'success': True,
                'groups': [],
                'count': 0,
                'warning': 'No groups found in XML file. Check XML structure.'
            })
        
        return jsonify({
            'success': True,
            'groups': groups,
            'count': len(groups)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    print(f"Marker Viewer starting...")
    print(f"Default mission directory: {DEFAULT_MISSION_DIR}")
    print(f"Open your browser to http://localhost:5003")
    app.run(debug=True, host='0.0.0.0', port=5003)

