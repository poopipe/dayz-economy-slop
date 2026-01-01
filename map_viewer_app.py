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

# Allow iframe embedding for launcher (remove X-Frame-Options if set)
@app.after_request
def set_frame_options(response):
    # Remove X-Frame-Options to allow embedding from launcher
    response.headers.pop('X-Frame-Options', None)
    return response

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


def load_effect_areas(effect_area_file_path):
    """
    Load effect areas from cfgeffectarea.json.
    Returns list of area dictionaries with position and radius data.
    """
    if not effect_area_file_path or not Path(effect_area_file_path).exists():
        print(f"Effect area JSON file does not exist: {effect_area_file_path}")
        return []
    
    try:
        with open(effect_area_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        areas = []
        
        # Look for "Areas" list in the JSON
        areas_list = data.get('Areas') or data.get('areas')
        
        if areas_list and isinstance(areas_list, list):
            print(f"Found Areas list with {len(areas_list)} entries")
            for idx, area_data in enumerate(areas_list):
                if not isinstance(area_data, dict):
                    print(f"Skipping area at index {idx}: not a dict")
                    continue
                
                # Get area name
                area_name = area_data.get('AreaName') or area_data.get('areaName') or area_data.get('Name') or area_data.get('name') or f"Area_{idx}"
                
                # Get Data object which contains Pos and Radius
                data_obj = area_data.get('Data') or area_data.get('data')
                if not data_obj or not isinstance(data_obj, dict):
                    print(f"Area '{area_name}' (index {idx}): No Data object found. Keys: {list(area_data.keys())}")
                    continue
                
                # Get position from Data.Pos - expecting [x, y, z] array
                pos = data_obj.get('Pos') or data_obj.get('pos')
                
                if pos is None:
                    print(f"Area '{area_name}': No Pos found in Data. Data keys: {list(data_obj.keys())}")
                    continue
                
                # Parse position - handle array [x, y, z]
                if isinstance(pos, list):
                    if len(pos) >= 3:
                        x = float(pos[0]) if pos[0] is not None else 0.0
                        y = float(pos[1]) if pos[1] is not None else 0.0
                        z = float(pos[2]) if pos[2] is not None else 0.0
                    else:
                        print(f"Area '{area_name}': Pos array too short: {pos}")
                        continue
                elif isinstance(pos, dict):
                    x = float(pos.get('x', 0)) if pos.get('x') is not None else 0.0
                    y = float(pos.get('y', 0)) if pos.get('y') is not None else 0.0
                    z = float(pos.get('z', 0)) if pos.get('z') is not None else 0.0
                else:
                    print(f"Area '{area_name}': invalid Pos format (type: {type(pos)}): {pos}")
                    continue
                
                # Get radius from Data.Radius
                radius = data_obj.get('Radius') or data_obj.get('radius')
                if radius is None:
                    print(f"Area '{area_name}': No Radius found in Data. Data keys: {list(data_obj.keys())}")
                    continue
                
                try:
                    radius = float(radius)
                except (ValueError, TypeError) as e:
                    print(f"Area '{area_name}': invalid Radius '{radius}' (type: {type(radius)}): {e}")
                    continue
                
                area_info = {
                    'name': area_name,
                    'x': x,
                    'y': y,
                    'z': z,
                    'radius': radius
                }
                print(f"Added effect area: {area_info}")
                areas.append(area_info)
        else:
            print(f"Areas not found or not a list. Type: {type(areas_list)}")
        
        print(f"Successfully loaded {len(areas)} effect areas")
        return areas
    except Exception as e:
        import traceback
        print(f"Error loading effect areas: {e}")
        traceback.print_exc()
        return []


@app.route('/api/effect-areas')
def get_effect_areas():
    """Get effect area data from cfgeffectarea.json."""
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
        
        # Look for cfgeffectarea.json
        effect_area_file = mission_path / 'cfgeffectarea.json'
        if not effect_area_file.exists():
            return jsonify({
                'success': True,
                'areas': [],
                'count': 0,
                'message': f'cfgeffectarea.json not found at: {effect_area_file}'
            })
        
        print(f"Loading effect areas from: {effect_area_file}")
        areas = load_effect_areas(str(effect_area_file))
        
        return jsonify({
            'success': True,
            'areas': areas,
            'count': len(areas)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def load_type_categories(economycore_file_path):
    """
    Load type categories from cfgeconomycore.xml.
    Returns a dictionary mapping type names to their categories.
    """
    type_categories = {}
    
    if not economycore_file_path or not Path(economycore_file_path).exists():
        print(f"Economy core XML file does not exist: {economycore_file_path}")
        return type_categories
    
    try:
        tree = ET.parse(economycore_file_path)
        root = tree.getroot()
        
        # Find all type files referenced in ce elements
        mission_path = Path(economycore_file_path).parent
        
        for ce_element in root.findall('.//ce'):
            ce_folder_attr = ce_element.get('folder')
            if not ce_folder_attr:
                continue
            
            ce_folder_attr = ce_folder_attr.replace('\\', '/').strip('/')
            ce_folder_path = mission_path / ce_folder_attr
            
            for file_element in ce_element.findall('.//file'):
                file_type = file_element.get('type')
                file_name = file_element.get('name')
                if file_type == 'types' and file_name:
                    full_file_path = ce_folder_path / file_name
                    if full_file_path.exists():
                        try:
                            type_tree = ET.parse(full_file_path)
                            type_root = type_tree.getroot()
                            
                            # Find all type elements
                            for type_elem in type_root.findall('.//type'):
                                type_name = type_elem.get('name')
                                if not type_name:
                                    continue
                                
                                # Find category elements
                                categories = []
                                for cat_elem in type_elem.findall('category'):
                                    cat_name = cat_elem.get('name')
                                    if cat_name:
                                        categories.append(cat_name)
                                
                                if categories:
                                    type_categories[type_name] = categories
                        except Exception as e:
                            print(f"Error parsing type file {full_file_path}: {e}")
                            continue
        
        print(f"Loaded categories for {len(type_categories)} types")
    except Exception as e:
        import traceback
        print(f"Error loading type categories: {e}")
        traceback.print_exc()
    
    return type_categories


def load_event_spawns(event_spawns_file_path, economycore_file_path):
    """
    Load event spawns from cfgeventspawns.xml and match with categories from cfgeconomycore.xml.
    Returns list of event spawn dictionaries with position and category data.
    """
    if not event_spawns_file_path or not Path(event_spawns_file_path).exists():
        print(f"Event spawns XML file does not exist: {event_spawns_file_path}")
        return []
    
    # Load type categories
    type_categories = load_type_categories(economycore_file_path)
    
    try:
        tree = ET.parse(event_spawns_file_path)
        root = tree.getroot()
        
        print(f"Root element: {root.tag}")
        print(f"Root attributes: {root.attrib}")
        print(f"Root children: {[child.tag for child in root]}")
        
        event_spawns = []
        
        # Find all event elements - try multiple approaches
        event_elements = root.findall('.//event')
        if len(event_elements) == 0:
            event_elements = root.findall('//event')
        if len(event_elements) == 0:
            event_elements = root.findall('event')
        if len(event_elements) == 0:
            # Try case-insensitive search
            for elem in root.iter():
                if elem.tag.lower() == 'event':
                    event_elements.append(elem)
        
        print(f"Found {len(event_elements)} event elements")
        
        # If still no events found, print all element tags for debugging
        if len(event_elements) == 0:
            print("No event elements found. All element tags in file:")
            for elem in root.iter():
                print(f"  - {elem.tag} (attributes: {elem.attrib})")
        
        for event in event_elements:
            event_name = event.get('name', '')
            if not event_name:
                print(f"Skipping event: no name attribute")
                continue
            
            # Match event name with type name to get category (do this once per event)
            categories = type_categories.get(event_name, [])
            
            # Find ALL pos elements for this event - each pos is a separate spawn location
            all_pos_elems = event.findall('pos')
            
            if len(all_pos_elems) == 0:
                print(f"Event '{event_name}': no pos elements found")
                continue
            
            # Process each pos element as a separate spawn location
            for pos_idx, pos_elem in enumerate(all_pos_elems):
                # Valid pos elements have x, z, and a attributes (no text content)
                x_attr = pos_elem.get('x')
                z_attr = pos_elem.get('z')
                a_attr = pos_elem.get('a')  # Angle attribute (not used for position, but part of valid format)
                
                # Skip if required attributes are missing
                if x_attr is None or z_attr is None:
                    print(f"Event '{event_name}' pos[{pos_idx}]: missing required x or z attribute, skipping")
                    continue
                
                try:
                    x = float(x_attr)
                    z = float(z_attr)
                    y = 0.0  # Y coordinate is not provided in pos elements, default to 0
                except (ValueError, TypeError):
                    print(f"Event '{event_name}' pos[{pos_idx}]: invalid x or z value (x='{x_attr}', z='{z_attr}'), skipping")
                    continue
                
                # Skip if position is invalid (all zeros)
                if x == 0.0 and z == 0.0:
                    print(f"Event '{event_name}' pos[{pos_idx}]: invalid position (x and z are both zero), skipping")
                    continue
                
                # Store the pos element XML (not the entire event) for this specific location
                pos_xml_string = ET.tostring(pos_elem, encoding='unicode')
                pos_xml_string = pos_xml_string.strip()
                
                event_data = {
                    'id': len(event_spawns),
                    'name': event_name,
                    'x': x,
                    'y': y,
                    'z': z,  # Frontend will reverse this
                    'categories': categories,
                    'xml': pos_xml_string  # Store just the pos element XML
                }
                
                event_spawns.append(event_data)
        
        print(f"Successfully loaded {len(event_spawns)} event spawns")
        matched_count = sum(1 for e in event_spawns if e.get('categories'))
        print(f"Matched {matched_count} event spawns with categories")
        return event_spawns
    except Exception as e:
        import traceback
        print(f"Error loading event spawns: {e}")
        traceback.print_exc()
        return []


@app.route('/api/event-spawns')
def get_event_spawns():
    """Get event spawn data from cfgeventspawns.xml."""
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
        
        # Look for cfgeventspawns.xml
        event_spawns_file = mission_path / 'cfgeventspawns.xml'
        if not event_spawns_file.exists():
            return jsonify({
                'success': True,
                'event_spawns': [],
                'count': 0,
                'message': f'cfgeventspawns.xml not found at: {event_spawns_file}'
            })
        
        # Look for cfgeconomycore.xml for category matching
        economycore_file = mission_path / 'cfgeconomycore.xml'
        economycore_file_path = str(economycore_file) if economycore_file.exists() else None
        
        print(f"Loading event spawns from: {event_spawns_file}")
        event_spawns = load_event_spawns(str(event_spawns_file), economycore_file_path)
        
        # Add diagnostic information
        diagnostic = {
            'file_path': str(event_spawns_file),
            'file_exists': event_spawns_file.exists(),
            'economycore_file_path': economycore_file_path,
            'economycore_exists': economycore_file.exists() if economycore_file else False,
            'event_spawns_count': len(event_spawns)
        }
        
        return jsonify({
            'success': True,
            'event_spawns': event_spawns,
            'count': len(event_spawns),
            'diagnostic': diagnostic
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def make_circle_from_points(points):
    """
    Create the smallest circle that passes through 2 or 3 points.
    Returns (center_x, center_z, radius) or None if points are collinear/invalid.
    """
    if len(points) == 0:
        return None
    if len(points) == 1:
        return (points[0][0], points[0][2], 0.0)
    if len(points) == 2:
        # Circle with two points: center is midpoint, radius is half the distance
        p1, p2 = points[0], points[1]
        center_x = (p1[0] + p2[0]) / 2.0
        center_z = (p1[2] + p2[2]) / 2.0
        dx = p1[0] - p2[0]
        dz = p1[2] - p2[2]
        radius = ((dx * dx + dz * dz) ** 0.5) / 2.0
        return (center_x, center_z, radius)
    
    # Three points: solve for circle center
    p1, p2, p3 = points[0], points[1], points[2]
    x1, z1 = p1[0], p1[2]
    x2, z2 = p2[0], p2[2]
    x3, z3 = p3[0], p3[2]
    
    # Check if points are collinear
    if abs((z2 - z1) * (x3 - x1) - (z3 - z1) * (x2 - x1)) < 1e-10:
        # Collinear, use two-point circle
        return make_circle_from_points([p1, p2])
    
    # Solve for circle center using perpendicular bisectors
    # Midpoints
    mx1, mz1 = (x1 + x2) / 2.0, (z1 + z2) / 2.0
    mx2, mz2 = (x2 + x3) / 2.0, (z2 + z3) / 2.0
    
    # Slopes of perpendicular bisectors
    if abs(z2 - z1) < 1e-10:
        # First line is horizontal
        center_x = mx1
        if abs(z3 - z2) < 1e-10:
            return make_circle_from_points([p1, p2])
        center_z = mz2
    elif abs(z3 - z2) < 1e-10:
        # Second line is horizontal
        center_x = mx2
        center_z = mz1
    else:
        # General case
        slope1 = -(x2 - x1) / (z2 - z1)
        slope2 = -(x3 - x2) / (z3 - z2)
        
        if abs(slope1 - slope2) < 1e-10:
            return make_circle_from_points([p1, p2])
        
        # Intersection of perpendicular bisectors
        center_x = (mz2 - mz1 + slope1 * mx1 - slope2 * mx2) / (slope1 - slope2)
        center_z = mz1 + slope1 * (center_x - mx1)
    
    # Calculate radius
    dx = x1 - center_x
    dz = z1 - center_z
    radius = (dx * dx + dz * dz) ** 0.5
    
    return (center_x, center_z, radius)


def is_point_in_circle(point, center_x, center_z, radius):
    """Check if a point is inside or on the circle."""
    dx = point[0] - center_x
    dz = point[2] - center_z
    distance = (dx * dx + dz * dz) ** 0.5
    return distance <= radius + 1e-10  # Small epsilon for floating point


def calculate_bounding_circle(zone_positions):
    """
    Calculate the smallest circle that encompasses all zone positions.
    Uses Welzl's algorithm approach: find the minimal enclosing circle.
    Returns (center_x, center_z, radius)
    """
    if not zone_positions:
        return (0.0, 0.0, 0.0)
    
    if len(zone_positions) == 1:
        # Single point - return a small circle around it
        return (zone_positions[0][0], zone_positions[0][2], 10.0)
    
    # Simplified Welzl's algorithm: try all combinations of 2-3 points
    # and find the smallest circle that contains all points
    
    best_circle = None
    best_radius = float('inf')
    
    # Try all pairs of points
    for i in range(len(zone_positions)):
        for j in range(i + 1, len(zone_positions)):
            circle = make_circle_from_points([zone_positions[i], zone_positions[j]])
            if circle is None:
                continue
            
            center_x, center_z, radius = circle
            
            # Check if all points are within this circle
            all_inside = True
            for pos in zone_positions:
                if not is_point_in_circle(pos, center_x, center_z, radius):
                    all_inside = False
                    break
            
            if all_inside and radius < best_radius:
                best_radius = radius
                best_circle = circle
    
    # Try all triplets of points
    for i in range(len(zone_positions)):
        for j in range(i + 1, len(zone_positions)):
            for k in range(j + 1, len(zone_positions)):
                circle = make_circle_from_points([zone_positions[i], zone_positions[j], zone_positions[k]])
                if circle is None:
                    continue
                
                center_x, center_z, radius = circle
                
                # Check if all points are within this circle
                all_inside = True
                for pos in zone_positions:
                    if not is_point_in_circle(pos, center_x, center_z, radius):
                        all_inside = False
                        break
                
                if all_inside and radius < best_radius:
                    best_radius = radius
                    best_circle = circle
    
    if best_circle is not None:
        return best_circle
    
    # Fallback: if no circle found (shouldn't happen), use bounding box
    min_x = min(pos[0] for pos in zone_positions)
    max_x = max(pos[0] for pos in zone_positions)
    min_z = min(pos[2] for pos in zone_positions)
    max_z = max(pos[2] for pos in zone_positions)
    
    center_x = (min_x + max_x) / 2.0
    center_z = (min_z + max_z) / 2.0
    
    max_radius = 0.0
    for pos in zone_positions:
        dx = pos[0] - center_x
        dz = pos[2] - center_z
        distance = (dx * dx + dz * dz) ** 0.5
        if distance > max_radius:
            max_radius = distance
    
    return (center_x, center_z, max_radius)


def load_territories(mission_dir):
    """
    Load territory data from XML files in mpmissions/env directory.
    Returns list of territory data with zones and bounding circles.
    """
    mission_path = Path(mission_dir)
    env_dir = mission_path / 'env'
    
    if not env_dir.exists():
        print(f"Environment directory does not exist: {env_dir}")
        return []
    
    territories = []
    territory_files = list(env_dir.glob('*.xml'))
    
    print(f"Found {len(territory_files)} XML files in {env_dir}")
    if len(territory_files) == 0:
        print(f"No XML files found in {env_dir}. Looking for files matching pattern: *.xml")
    
    # Color palette for different territory types (files)
    colors = [
        '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
        '#FF8800', '#8800FF', '#00FF88', '#FF0088', '#88FF00', '#0088FF',
        '#FF4444', '#44FF44', '#4444FF', '#FFFF44', '#FF44FF', '#44FFFF'
    ]
    
    for file_idx, territory_file in enumerate(territory_files):
        territory_type = territory_file.stem  # Filename without extension
        color = colors[file_idx % len(colors)]
        
        try:
            tree = ET.parse(territory_file)
            root = tree.getroot()
            
            # Find all territory elements (they are children of territory-type root)
            territory_elements = root.findall('.//territory')
            if len(territory_elements) == 0:
                territory_elements = root.findall('territory')
            
            print(f"Found {len(territory_elements)} territories in {territory_file.name}")
            
            for territory_idx, territory in enumerate(territory_elements):
                # Name territories as: filename_index (e.g., "infected_0", "infected_1")
                territory_name = f"{territory_type}_{territory_idx}"
                
                # Find all zone elements within this territory
                zone_elements = territory.findall('zone')
                if len(zone_elements) == 0:
                    zone_elements = territory.findall('.//zone')
                
                if len(zone_elements) == 0:
                    print(f"Territory {territory_idx} has no zones, skipping")
                    continue
                
                zone_positions = []
                zones = []
                
                for zone_idx, zone in enumerate(zone_elements):
                    # Zones have x, z attributes directly on the zone element
                    x_attr = zone.get('x')
                    z_attr = zone.get('z')
                    
                    if x_attr is None or z_attr is None:
                        print(f"Zone {zone_idx} missing x or z attribute, skipping")
                        continue
                    
                    try:
                        x = float(x_attr)
                        z = float(z_attr)
                        y = 0.0
                        
                        # Skip if position is invalid (both zeros)
                        if x == 0.0 and z == 0.0:
                            print(f"Zone {zone_idx} has invalid position (0, 0), skipping")
                            continue
                        
                        pos = (x, y, z)
                        zone_positions.append(pos)
                        
                        # Store zone data
                        zone_xml = ET.tostring(zone, encoding='unicode').strip()
                        zone_name = zone.get('name', f'Zone_{zone_idx}')
                        zones.append({
                            'id': len(zones),
                            'name': zone_name,
                            'x': x,
                            'y': y,
                            'z': z,
                            'xml': zone_xml
                        })
                    except (ValueError, TypeError) as e:
                        print(f"Invalid position in zone {zone_idx}: x='{x_attr}', z='{z_attr}', error: {e}")
                        continue
                
                if not zone_positions:
                    print(f"Territory {territory_idx} has no valid zone positions, skipping")
                    continue
                
                # Calculate bounding circle
                center_x, center_z, radius = calculate_bounding_circle(zone_positions)
                
                # Store territory XML
                territory_xml = ET.tostring(territory, encoding='unicode').strip()
                
                territory_data = {
                    'id': len(territories),
                    'name': territory_name,
                    'territory_type': territory_type,
                    'color': color,
                    'center_x': center_x,
                    'center_z': center_z,
                    'radius': radius,
                    'zones': zones,
                    'xml': territory_xml
                }
                
                territories.append(territory_data)
        
        except Exception as e:
            import traceback
            print(f"Error loading territory file {territory_file}: {e}")
            traceback.print_exc()
            continue
    
    print(f"Successfully loaded {len(territories)} territories from {len(territory_files)} files")
    if len(territories) == 0 and len(territory_files) > 0:
        print(f"Warning: Found {len(territory_files)} XML files but no territories were parsed. Check XML structure.")
    return territories


@app.route('/api/territories')
def get_territories():
    """Get territory data from XML files in mpmissions/env directory."""
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
        
        print(f"Loading territories from: {mission_path / 'env'}")
        territories = load_territories(mission_dir)
        
        env_dir = mission_path / 'env'
        diagnostic = {
            'env_dir_exists': env_dir.exists(),
            'env_dir_path': str(env_dir),
            'xml_files_found': len(list(env_dir.glob('*.xml'))) if env_dir.exists() else 0,
            'territories_loaded': len(territories)
        }
        
        return jsonify({
            'success': True,
            'territories': territories,
            'count': len(territories),
            'diagnostic': diagnostic
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

