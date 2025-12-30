#!/usr/bin/env python3
"""
Flask application for XML data viewer with live updates.
"""

import os
import json
from pathlib import Path
from flask import Flask, render_template, jsonify

app = Flask(__name__)

# Configuration
DATA_DIR = Path(__file__).parent / 'data'
DATA_DIR.mkdir(exist_ok=True)


def parse_xml_to_dict(element):
    """
    Recursively convert XML element to dictionary.
    
    Args:
        element: XML element
        
    Returns:
        Dictionary representation
    """
    result = {
        'tag': element.tag,
        'text': element.text.strip() if element.text and element.text.strip() else None,
        'attributes': dict(element.attrib),
        'children': []
    }
    
    for child in element:
        result['children'].append(parse_xml_to_dict(child))
    
    return result


def load_xml_files():
    """
    Load all XML files from data directory.
    
    Returns:
        Dictionary mapping filenames to parsed XML data
    """
    xml_data = {}
    
    if not DATA_DIR.exists():
        return xml_data
    
    for xml_file in DATA_DIR.glob('*.xml'):
        try:
            tree = ET.parse(xml_file)
            root = tree.getroot()
            xml_data[xml_file.name] = {
                'filename': xml_file.name,
                'path': str(xml_file),
                'data': parse_xml_to_dict(root)
            }
        except ET.ParseError as e:
            xml_data[xml_file.name] = {
                'filename': xml_file.name,
                'path': str(xml_file),
                'error': f'Parse error: {str(e)}'
            }
        except Exception as e:
            xml_data[xml_file.name] = {
                'filename': xml_file.name,
                'path': str(xml_file),
                'error': f'Error loading file: {str(e)}'
            }
    
    return xml_data


@app.route('/')
def index():
    """Main page."""
    return render_template('index.html')


@app.route('/api/xml')
def get_xml_data():
    """API endpoint to get XML data."""
    return jsonify(load_xml_files())


@app.route('/api/xml/<filename>')
def get_xml_file(filename):
    """API endpoint to get specific XML file."""
    xml_file = DATA_DIR / filename
    
    if not xml_file.exists():
        return jsonify({'error': 'File not found'}), 404
    
    try:
        tree = ET.parse(xml_file)
        root = tree.getroot()
        return jsonify({
            'filename': filename,
            'path': str(xml_file),
            'data': parse_xml_to_dict(root)
        })
    except ET.ParseError as e:
        return jsonify({'error': f'Parse error: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Error: {str(e)}'}), 500


if __name__ == '__main__':
    import xml.etree.ElementTree as ET
    print(f"XML Data Viewer starting...")
    print(f"Data directory: {DATA_DIR}")
    print(f"Open your browser to http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)

