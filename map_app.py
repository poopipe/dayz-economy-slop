#!/usr/bin/env python3
"""
Flask application for displaying map with markers from mapgrouppos.xml and related data.
"""

import os
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from flask import Flask, render_template, jsonify, request
from collections import defaultdict

app = Flask(__name__)

# Default mission directory
DEFAULT_MISSION_DIR = ""


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


def load_proto_data(proto_file_path):
    """
    Load data from mapgroupproto.xml.
    Returns dict mapping name to usages, categories, and containers.
    """
    if not proto_file_path or not Path(proto_file_path).exists():
        return {}
    
    try:
        tree = ET.parse(proto_file_path)
        root = tree.getroot()
        
        proto_data = {}
        
        for proto in root.findall('.//proto'):
            name = proto.get('name')
            if not name:
                continue
            
            # Extract usages
            usages = []
            for usage_elem in proto.findall('.//usage'):
                usage_text = usage_elem.text
                if usage_text:
                    usages.append(usage_text.strip())
            
            # Extract categories
            categories = []
            for category_elem in proto.findall('.//category'):
                category_text = category_elem.text
                if category_text:
                    categories.append(category_text.strip())
            
            # Extract containers with point counts
            containers = []
            for container_elem in proto.findall('.//container'):
                container_name = container_elem.get('name', '')
                point_count = len(container_elem.findall('.//point'))
                containers.append({
                    'name': container_name,
                    'point_count': point_count
                })
            
            proto_data[name] = {
                'usages': usages,
                'categories': categories,
                'containers': containers
            }
        
        return proto_data
    except Exception as e:
        print(f"Error loading proto data: {e}")
        return {}


def load_groups_from_xml(xml_file_path, proto_file_path=None):
    """
    Load group data from mapgrouppos.xml.
    Returns list of group dictionaries with position and other data.
    """
    if not xml_file_path or not Path(xml_file_path).exists():
        return []
    
    try:
        tree = ET.parse(xml_file_path)
        root = tree.getroot()
        
        # Load proto data if available
        proto_data = {}
        if proto_file_path:
            proto_data = load_proto_data(proto_file_path)
        
        groups = []
        
        for group in root.findall('.//group'):
            name = group.get('name', '')
            pos_elem = group.find('pos')
            
            if pos_elem is None or pos_elem.text is None:
                continue
            
            x, y, z = parse_group_pos(pos_elem.text)
            
            # Get usage from group
            usage_elem = group.find('usage')
            usage = usage_elem.text.strip() if usage_elem is not None and usage_elem.text else ''
            
            # Get proto data for this item
            proto_info = proto_data.get(name, {})
            
            group_data = {
                'name': name,
                'x': x,
                'y': y,
                'z': z,
                'usage': usage,
                'categories': proto_info.get('categories', []),
                'containers': proto_info.get('containers', [])
            }
            
            groups.append(group_data)
        
        return groups
    except Exception as e:
        print(f"Error loading groups: {e}")
        return []


@app.route('/')
def index():
    """Main page."""
    return render_template('map.html')


@app.route('/api/groups')
def get_groups():
    """Get group data from mapgrouppos.xml."""
    try:
        mission_dir = request.args.get('mission_dir', DEFAULT_MISSION_DIR)
        
        if not mission_dir:
            return jsonify({'error': 'No mission directory specified'}), 400
        
        mission_path = Path(mission_dir)
        if not mission_path.exists():
            return jsonify({'error': 'Mission directory does not exist'}), 404
        
        # Look for mapgrouppos.xml
        mapgrouppos_file = mission_path / 'mapgrouppos.xml'
        if not mapgrouppos_file.exists():
            return jsonify({'error': 'mapgrouppos.xml not found'}), 404
        
        # Look for mapgroupproto.xml
        mapgroupproto_file = mission_path / 'mapgroupproto.xml'
        proto_path = str(mapgroupproto_file) if mapgroupproto_file.exists() else None
        
        groups = load_groups_from_xml(str(mapgrouppos_file), proto_path)
        
        return jsonify({
            'success': True,
            'groups': groups,
            'count': len(groups)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/underground-triggers')
def get_underground_triggers():
    """Get underground triggers from cfgundergroundtriggers.json."""
    try:
        mission_dir = request.args.get('mission_dir', DEFAULT_MISSION_DIR)
        
        if not mission_dir:
            return jsonify({'error': 'No mission directory specified'}), 400
        
        mission_path = Path(mission_dir)
        if not mission_path.exists():
            return jsonify({'error': 'Mission directory does not exist'}), 404
        
        # Look for cfgundergroundtriggers.json
        triggers_file = mission_path / 'cfgundergroundtriggers.json'
        if not triggers_file.exists():
            return jsonify({'error': 'cfgundergroundtriggers.json not found'}), 404
        
        with open(triggers_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        triggers = []
        
        # Handle various JSON structures
        items = None
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            # Try common keys
            for key in ['triggers', 'data', 'items', 'cubes', 'Cubes', 'Triggers', 'UndergroundTriggers']:
                if key in data and isinstance(data[key], list):
                    items = data[key]
                    break
            
            # If still not found, check if dict has numeric keys (array-like)
            if items is None:
                try:
                    # Check if all keys are numeric
                    if all(str(k).isdigit() for k in data.keys()):
                        items = list(data.values())
                except:
                    pass
        
        if items is None:
            return jsonify({'error': 'No triggers found in JSON file. Expected an array or an object with a triggers/data/items key.'}), 400
        
        for item in items:
            if not isinstance(item, dict):
                continue
            
            # Look for position and size data
            pos = item.get('Pos') or item.get('pos') or item.get('Position') or item.get('position')
            size = item.get('Size') or item.get('size') or item.get('Dimensions') or item.get('dimensions')
            orientation = item.get('Orientation') or item.get('orientation') or item.get('Rot') or item.get('rot')
            
            if pos and size:
                # Handle different position formats
                if isinstance(pos, list) and len(pos) >= 2:
                    x = float(pos[0]) if len(pos) > 0 else 0.0
                    z = float(pos[2]) if len(pos) > 2 else float(pos[1]) if len(pos) > 1 else 0.0
                elif isinstance(pos, dict):
                    x = float(pos.get('x', pos.get('X', 0.0)))
                    z = float(pos.get('z', pos.get('Z', pos.get('y', pos.get('Y', 0.0)))))
                else:
                    continue
                
                # Handle different size formats
                if isinstance(size, list) and len(size) >= 2:
                    width = float(size[0])
                    height = float(size[2]) if len(size) > 2 else float(size[1])
                elif isinstance(size, dict):
                    width = float(size.get('x', size.get('X', size.get('width', size.get('Width', 1.0)))))
                    height = float(size.get('z', size.get('Z', size.get('height', size.get('Height', size.get('y', size.get('Y', 1.0))))))
                else:
                    continue
                
                # Get orientation (x-axis rotation)
                rotation = 0.0
                if orientation:
                    if isinstance(orientation, list) and len(orientation) > 0:
                        rotation = float(orientation[0])
                    elif isinstance(orientation, dict):
                        rotation = float(orientation.get('x', orientation.get('X', orientation.get('pitch', 0.0))))
                    else:
                        rotation = float(orientation)
                
                triggers.append({
                    'x': x,
                    'z': z,
                    'width': width,
                    'height': height,
                    'rotation': rotation
                })
        
        return jsonify({
            'success': True,
            'triggers': triggers,
            'count': len(triggers)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/effect-areas')
def get_effect_areas():
    """Get effect areas from cfgeffectarea.json."""
    try:
        mission_dir = request.args.get('mission_dir', DEFAULT_MISSION_DIR)
        
        if not mission_dir:
            return jsonify({'error': 'No mission directory specified'}), 400
        
        mission_path = Path(mission_dir)
        if not mission_path.exists():
            return jsonify({'error': 'Mission directory does not exist'}), 404
        
        # Look for cfgeffectarea.json
        areas_file = mission_path / 'cfgeffectarea.json'
        if not areas_file.exists():
            return jsonify({'error': 'cfgeffectarea.json not found'}), 404
        
        with open(areas_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        areas = []
        
        # Look for Areas key (capital A)
        areas_list = None
        if isinstance(data, list):
            areas_list = data
        elif isinstance(data, dict):
            # Try "Areas" first (capital A)
            if 'Areas' in data and isinstance(data['Areas'], list):
                areas_list = data['Areas']
            elif 'areas' in data and isinstance(data['areas'], list):
                areas_list = data['areas']
        
        if areas_list is None:
            return jsonify({'error': 'No areas found in JSON file. Expected an array or an object with an "Areas" key.'}), 400
        
        for area in areas_list:
            if not isinstance(area, dict):
                continue
            
            # Look for Data.Pos and Data.Radius
            data_obj = area.get('Data') or area.get('data')
            if not data_obj or not isinstance(data_obj, dict):
                continue
            
            pos = data_obj.get('Pos') or data_obj.get('pos') or data_obj.get('Position') or data_obj.get('position')
            radius = data_obj.get('Radius') or data_obj.get('radius') or data_obj.get('r')
            
            if pos and radius is not None:
                # Handle different position formats
                if isinstance(pos, list) and len(pos) >= 2:
                    x = float(pos[0]) if len(pos) > 0 else 0.0
                    z = float(pos[2]) if len(pos) > 2 else float(pos[1]) if len(pos) > 1 else 0.0
                elif isinstance(pos, dict):
                    x = float(pos.get('x', pos.get('X', 0.0)))
                    z = float(pos.get('z', pos.get('Z', pos.get('y', pos.get('Y', 0.0)))))
                else:
                    continue
                
                radius_val = float(radius)
                
                areas.append({
                    'x': x,
                    'z': z,
                    'radius': radius_val,
                    'name': area.get('AreaName', area.get('areaName', ''))
                })
        
        return jsonify({
            'success': True,
            'areas': areas,
            'count': len(areas)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print(f"Map Viewer starting...")
    print(f"Default mission directory: {DEFAULT_MISSION_DIR}")
    print(f"Open your browser to http://localhost:5002")
    app.run(debug=True, host='0.0.0.0', port=5002)

