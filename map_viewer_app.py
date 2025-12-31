#!/usr/bin/env python3
"""
Flask application for displaying markers in 2D space from mapgrouppos.xml.
"""

import os
import json
import xml.etree.ElementTree as ET
import uuid
import shutil
from pathlib import Path
from flask import Flask, render_template, jsonify, request, send_file
from werkzeug.utils import secure_filename

app = Flask(__name__)

# Default mission directory
DEFAULT_MISSION_DIR = r"E:\DayZ_Servers\Nyheim_Server\mpmissions\dayzOffline.nyheim"

# Directory to store uploaded background images
UPLOAD_FOLDER = Path('uploads/background_images')
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}

def allowed_file(filename):
    """Check if file extension is allowed."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


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


def load_proto_groups(proto_file_path):
    """
    Load group prototypes from mapgroupproto.xml.
    Returns a dictionary mapping group names to their data (XML string and parsed attributes).
    """
    proto_groups = {}
    
    if not proto_file_path or not Path(proto_file_path).exists():
        print(f"Proto XML file does not exist: {proto_file_path}")
        return proto_groups
    
    try:
        tree = ET.parse(proto_file_path)
        root = tree.getroot()
        
        # Try different XPath expressions to find groups
        group_elements = root.findall('.//group')
        if len(group_elements) == 0:
            group_elements = root.findall('//group')
        if len(group_elements) == 0:
            group_elements = root.findall('group')
        
        print(f"Found {len(group_elements)} group prototypes in mapgroupproto.xml")
        
        for group in group_elements:
            name = group.get('name', '')
            if name:
                # Store the original XML element as a string
                xml_string = ET.tostring(group, encoding='unicode')
                xml_string = xml_string.strip()
                
                # Extract all attributes for searching
                attributes = dict(group.attrib)
                
                # Extract all child element data for searching
                child_data = {}
                for child in group:
                    tag = child.tag
                    # For container elements, prefer name attribute, fallback to text
                    name_attr = child.get('name', '')
                    text = child.text.strip() if child.text else ''
                    value = name_attr if name_attr else text
                    
                    # Store as list if multiple children with same tag
                    if tag in child_data:
                        if not isinstance(child_data[tag], list):
                            child_data[tag] = [child_data[tag]]
                        child_data[tag].append(value)
                    else:
                        child_data[tag] = value
                
                # Create searchable data structure
                proto_groups[name] = {
                    'xml': xml_string,
                    'attributes': attributes,
                    'children': child_data
                }
        
        print(f"Successfully loaded {len(proto_groups)} group prototypes")
    except Exception as e:
        import traceback
        print(f"Error loading proto groups: {e}")
        traceback.print_exc()
    
    return proto_groups


def load_groups_from_xml(xml_file_path, proto_file_path=None):
    """
    Load group data from mapgrouppos.xml and optionally match with mapgroupproto.xml.
    Returns list of group dictionaries with position data.
    Note: z coordinate will be reversed in the frontend to place origin at lower left.
    """
    if not xml_file_path or not Path(xml_file_path).exists():
        print(f"XML file does not exist: {xml_file_path}")
        return []
    
    # Load proto groups if proto file path is provided
    proto_groups = {}
    if proto_file_path:
        proto_groups = load_proto_groups(proto_file_path)
    
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
            
            # Store the original XML element as a string
            xml_string = ET.tostring(group, encoding='unicode')
            xml_string = xml_string.strip()
            
            group_data = {
                'id': len(groups),  # Simple ID for now
                'name': name,
                'x': x,
                'y': y,
                'z': z,  # Frontend will reverse this
                'usage': usage,
                'xml': xml_string  # Store original XML element from mapgrouppos.xml
            }
            
            # Try to find matching proto group and store its data
            if name in proto_groups:
                proto_data = proto_groups[name]
                group_data['proto_xml'] = proto_data['xml']
                group_data['proto_attributes'] = proto_data['attributes']
                group_data['proto_children'] = proto_data['children']
                print(f"Found matching proto for group '{name}'")
            else:
                group_data['proto_xml'] = None
                group_data['proto_attributes'] = {}
                group_data['proto_children'] = {}
            
            groups.append(group_data)
        
        print(f"Successfully loaded {len(groups)} groups")
        matched_count = sum(1 for g in groups if g.get('proto_xml') is not None)
        print(f"Matched {matched_count} groups with prototypes")
        return groups
    except Exception as e:
        import traceback
        print(f"Error loading groups: {e}")
        traceback.print_exc()
        return []


@app.route('/')
def index():
    """Main page."""
    return render_template('map_viewer.html')


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
        
        # Look for mapgroupproto.xml (optional)
        mapgroupproto_file = mission_path / 'mapgroupproto.xml'
        proto_file_path = str(mapgroupproto_file) if mapgroupproto_file.exists() else None
        
        if proto_file_path:
            print(f"Found mapgroupproto.xml, will match groups by name")
        else:
            print(f"mapgroupproto.xml not found, loading groups without proto matching")
        
        print(f"Loading groups from: {mapgrouppos_file}")
        groups = load_groups_from_xml(str(mapgrouppos_file), proto_file_path)
        
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


@app.route('/api/upload-background-image', methods=['POST'])
def upload_background_image():
    """Upload and save background image to server."""
    try:
        if 'image' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No image file provided'
            }), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400
        
        if not allowed_file(file.filename):
            return jsonify({
                'success': False,
                'error': f'File type not allowed. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400
        
        # Generate unique filename
        file_ext = file.filename.rsplit('.', 1)[1].lower()
        unique_filename = f"{uuid.uuid4().hex}.{file_ext}"
        file_path = UPLOAD_FOLDER / unique_filename
        
        # Save file
        file.save(file_path)
        
        print(f"Background image saved: {file_path}")
        
        return jsonify({
            'success': True,
            'image_id': unique_filename,
            'message': 'Image uploaded successfully'
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/background-image/<image_id>')
def get_background_image(image_id):
    """Retrieve background image from server."""
    try:
        # Sanitize filename to prevent directory traversal
        image_id = secure_filename(image_id)
        file_path = UPLOAD_FOLDER / image_id
        
        if not file_path.exists():
            return jsonify({
                'success': False,
                'error': 'Image not found'
            }), 404
        
        # Check if file is within upload folder (security check)
        upload_folder_resolved = str(UPLOAD_FOLDER.resolve())
        file_path_resolved = str(file_path.resolve())
        if not file_path_resolved.startswith(upload_folder_resolved):
            return jsonify({
                'success': False,
                'error': 'Invalid image path'
            }), 403
        
        return send_file(file_path)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/delete-background-image/<image_id>', methods=['DELETE'])
def delete_background_image(image_id):
    """Delete background image from server."""
    try:
        # Sanitize filename to prevent directory traversal
        image_id = secure_filename(image_id)
        file_path = UPLOAD_FOLDER / image_id
        
        if not file_path.exists():
            return jsonify({
                'success': False,
                'error': 'Image not found'
            }), 404
        
        # Check if file is within upload folder (security check)
        upload_folder_resolved = str(UPLOAD_FOLDER.resolve())
        file_path_resolved = str(file_path.resolve())
        if not file_path_resolved.startswith(upload_folder_resolved):
            return jsonify({
                'success': False,
                'error': 'Invalid image path'
            }), 403
        
        file_path.unlink()
        print(f"Background image deleted: {file_path}")
        
        return jsonify({
            'success': True,
            'message': 'Image deleted successfully'
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    print(f"Map Viewer starting...")
    print(f"Default mission directory: {DEFAULT_MISSION_DIR}")
    print(f"Open your browser to http://localhost:5003")
    app.run(debug=True, host='0.0.0.0', port=5003)

