// Editor v2 JavaScript

let currentMissionDir = '';
let tableData = [];
let tableColumns = [];
let sortColumn = null;
let sortDirection = 'asc'; // 'asc' or 'desc'
let columnVisibility = {}; // Map of column key -> boolean (visible)
let allAvailableColumns = []; // All columns that exist in the data

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateStatus('Ready');
    setupEventListeners();
    loadMissionDir();
});

function setupEventListeners() {
    document.getElementById('loadDataBtn').addEventListener('click', loadXMLData);
    document.getElementById('exportBtn').addEventListener('click', exportToXML);
    document.getElementById('columnVisibilityBtn').addEventListener('click', openColumnVisibilityModal);
    document.getElementById('applyColumnVisibilityBtn').addEventListener('click', applyColumnVisibility);
    document.getElementById('cancelColumnVisibilityBtn').addEventListener('click', closeColumnVisibilityModal);
    document.getElementById('showAllColumnsBtn').addEventListener('click', showAllColumns);
    document.getElementById('hideAllColumnsBtn').addEventListener('click', hideAllColumns);
    
    const missionDirInput = document.getElementById('missionDir');
    missionDirInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadXMLData();
        }
    });
    
    // Close modal handlers
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.closest('#columnVisibilityModal')) {
                closeColumnVisibilityModal();
            }
        });
    });
    
    document.getElementById('columnVisibilityModal').addEventListener('click', (e) => {
        if (e.target.id === 'columnVisibilityModal') {
            closeColumnVisibilityModal();
        }
    });
}

function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

function loadMissionDir() {
    const saved = localStorage.getItem('editorV2MissionDir');
    if (saved) {
        currentMissionDir = saved;
        document.getElementById('missionDir').value = saved;
    }
    
    // Load column visibility settings
    const savedVisibility = localStorage.getItem('editorV2ColumnVisibility');
    if (savedVisibility) {
        try {
            columnVisibility = JSON.parse(savedVisibility);
        } catch (e) {
            columnVisibility = {};
        }
    }
}

async function loadXMLData() {
    const missionDirInput = document.getElementById('missionDir');
    const missionDir = missionDirInput.value.trim();
    
    if (!missionDir) {
        alert('Please enter a mission directory path');
        return;
    }
    
    currentMissionDir = missionDir;
    localStorage.setItem('editorV2MissionDir', missionDir);
    updateStatus('Loading XML data into database...');
    
    try {
        const response = await fetch('/api/load', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mission_dir: missionDir,
                element_type: 'type'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateStatus(`Loaded ${data.element_count} elements from ${data.file_count} files`);
            loadElements();
        } else {
            throw new Error(data.error || 'Failed to load data');
        }
    } catch (error) {
        updateStatus('Error loading XML data');
        console.error('Error loading XML data:', error);
        alert(`Error loading XML data: ${error.message}`);
    }
}

async function loadElements() {
    try {
        const url = `/api/elements?mission_dir=${encodeURIComponent(currentMissionDir || '')}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            tableData = data.elements || [];
            
            // Extract columns from data
            if (tableData.length > 0) {
                const allColumns = new Set();
                tableData.forEach(item => {
                    Object.keys(item).forEach(key => {
                        if (!key.startsWith('_')) {
                            allColumns.add(key);
                        }
                    });
                });
                tableColumns = Array.from(allColumns).sort();
            }
            
            displayTable();
        } else {
            throw new Error(data.error || 'Failed to load elements');
        }
    } catch (error) {
        updateStatus('Error loading elements');
        console.error('Error loading elements:', error);
        alert(`Error loading elements: ${error.message}`);
    }
}

function getSortValue(record, key) {
    const value = record[key];
    
    if (value === null || value === undefined) {
        return '';
    } else if (Array.isArray(value)) {
        // For arrays, use the joined string for sorting
        return value.length > 0 ? value.join(', ') : '';
    } else if (typeof value === 'object') {
        // For objects, try to extract meaningful values
        if (Array.isArray(value)) {
            return value.map(v => {
                if (typeof v === 'object' && v.name) {
                    return v.name;
                }
                return String(v);
            }).join(', ');
        } else {
            return JSON.stringify(value);
        }
    } else {
        return String(value);
    }
}

function isNumeric(str) {
    if (str === '' || str === null || str === undefined) {
        return false;
    }
    // Check if it's a number (including decimals and negative)
    return !isNaN(str) && !isNaN(parseFloat(str)) && isFinite(str);
}

function sortData(data, columnKey, direction) {
    const sorted = [...data];
    
    sorted.sort((a, b) => {
        const aVal = getSortValue(a, columnKey);
        const bVal = getSortValue(b, columnKey);
        
        // Handle empty values - always put them at the end
        if (aVal === '' && bVal === '') return 0;
        if (aVal === '') return 1;
        if (bVal === '') return -1;
        
        // Try numeric comparison first
        if (isNumeric(aVal) && isNumeric(bVal)) {
            const numA = parseFloat(aVal);
            const numB = parseFloat(bVal);
            const result = numA - numB;
            return direction === 'asc' ? result : -result;
        }
        
        // String comparison (case-insensitive)
        const strA = String(aVal).toLowerCase();
        const strB = String(bVal).toLowerCase();
        const result = strA.localeCompare(strB);
        return direction === 'asc' ? result : -result;
    });
    
    return sorted;
}

function handleColumnSort(columnKey) {
    // Toggle sort direction if clicking the same column, otherwise start with ascending
    if (sortColumn === columnKey) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = columnKey;
        sortDirection = 'asc';
    }
    
    displayTable();
}

function getColumnLabel(key) {
    // Convert column keys to readable labels
    const labelMap = {
        'name': 'Name',
        '_category_names': 'Categories',
        '_tag_names': 'Tags',
        '_usageflag_names': 'Usage Flags',
        '_valueflag_names': 'Value Flags',
        '_flag_names': 'Flags',
        '_flags': 'Flags (Full)',
        '_categories': 'Categories (Full)',
        '_tags': 'Tags (Full)',
        '_usageflags': 'Usage Flags (Full)',
        '_valueflags': 'Value Flags (Full)',
        '_itemclass_name': 'Itemclass',
        '_itemclass_id': 'Itemclass ID',
        '_itemtag_names': 'Itemtags',
        '_itemtags': 'Itemtags (Full)',
        '_element_key': 'Element Key',
        '_source_file': 'Source File',
        '_source_folder': 'Source Folder',
        'source': 'Source'
    };
    
    if (labelMap[key]) {
        return labelMap[key];
    }
    
    // Convert snake_case or camelCase to Title Case
    return key
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

function displayTable() {
    const container = document.getElementById('tableContainer');
    
    if (tableData.length === 0) {
        container.innerHTML = '<p class="no-data">No data available</p>';
        return;
    }
    
    // Extract all columns from the data
    const allColumnsSet = new Set();
    tableData.forEach(record => {
        Object.keys(record).forEach(key => {
            allColumnsSet.add(key);
        });
    });
    
    // Define priority columns (these appear first)
    // Always include these columns even if they don't exist in all records
    const priorityColumns = [
        'name',
        '_itemclass_name',
        '_itemtag_names',
        '_category_names',
        '_tag_names',
        '_usageflag_names',
        '_valueflag_names',
        '_flag_names',
        'source'
    ];
    
    // Always ensure priority columns are in the set
    priorityColumns.forEach(col => {
        allColumnsSet.add(col);
    });
    
    // Build display columns list: priority columns first, then rest alphabetically
    const displayColumns = [];
    const remainingColumns = [];
    
    // Store all available columns for visibility control
    allAvailableColumns = [];
    
    priorityColumns.forEach(key => {
        if (allColumnsSet.has(key)) {
            allAvailableColumns.push({ key, label: getColumnLabel(key) });
            allColumnsSet.delete(key);
        }
    });
    
    // Add remaining columns alphabetically
    Array.from(allColumnsSet).sort().forEach(key => {
        allAvailableColumns.push({ key, label: getColumnLabel(key) });
    });
    
    // Filter columns based on visibility settings
    // If no visibility settings exist, show all columns by default
    const hasVisibilitySettings = Object.keys(columnVisibility).length > 0;
    
    allAvailableColumns.forEach(col => {
        if (hasVisibilitySettings) {
            // Use saved visibility setting, default to visible if not set
            const isVisible = columnVisibility[col.key] !== false;
            if (isVisible) {
                displayColumns.push(col);
            }
        } else {
            // No saved settings - show all columns
            displayColumns.push(col);
        }
    });
    
    // Sort data if a sort column is selected
    let dataToDisplay = tableData;
    if (sortColumn) {
        dataToDisplay = sortData(tableData, sortColumn, sortDirection);
    }
    
    // Build table
    let html = '<table class="data-table"><thead><tr>';
    
    displayColumns.forEach(col => {
        const isSorted = sortColumn === col.key;
        const sortIndicator = isSorted 
            ? (sortDirection === 'asc' ? ' <span class="sort-indicator">▲</span>' : ' <span class="sort-indicator">▼</span>')
            : ' <span class="sort-indicator sort-inactive">⇅</span>';
        
        html += `<th class="sortable" data-column="${col.key}">${escapeHtml(col.label)}${sortIndicator}</th>`;
    });
    
    html += '</tr></thead><tbody>';
    
    dataToDisplay.forEach((record, rowIndex) => {
        html += '<tr>';
        
        displayColumns.forEach(col => {
            const value = record[col.key];
            const isEditable = ['nominal', 'lifetime', 'restock', 'min'].includes(col.key);
            let displayValue = '';
            
            if (value === null || value === undefined) {
                displayValue = '';
            } else if (Array.isArray(value)) {
                // Check if array contains objects
                if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                    // Array of objects - format based on column type
                    if (col.key === '_categories' || col.key === '_tags' || col.key === '_usageflags' || 
                        col.key === '_valueflags' || col.key === '_itemtags') {
                        // For full objects, show "id: name" format
                        displayValue = value.map(v => {
                            if (v.name !== undefined && v.id !== undefined) {
                                return `${v.id}: ${v.name}`;
                            } else if (v.name !== undefined) {
                                return v.name;
                            }
                            return JSON.stringify(v);
                        }).join(', ');
                    } else {
                        // For other arrays of objects, try to extract names
                        displayValue = value.map(v => {
                            if (typeof v === 'object' && v.name) {
                                return v.name;
                            }
                            return JSON.stringify(v);
                        }).join(', ');
                    }
                } else {
                    // Array of primitives - join directly
                    displayValue = value.length > 0 ? value.join(', ') : '';
                }
            } else if (typeof value === 'object') {
                // Check if this is a flags field (object with attributes that are 1 or 0)
                if (col.key === 'flags' || col.key.toLowerCase().includes('flag')) {
                    // Format flags: show all flags with their values
                    const flagEntries = Object.entries(value).filter(([k]) => k !== '_text');
                    if (flagEntries.length > 0) {
                        displayValue = flagEntries
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(', ');
                    } else {
                        displayValue = '';
                    }
                } else if (value.name !== undefined) {
                    // Single object with name - show name
                    displayValue = value.name;
                } else {
                    // Other object - check if all values are 1 or 0 (might be flags)
                    const entries = Object.entries(value).filter(([k]) => k !== '_text');
                    const allBinary = entries.length > 0 && entries.every(([k, v]) => 
                        v === '1' || v === '0' || v === 1 || v === 0
                    );
                    
                    if (allBinary) {
                        // Format as flags - show all with values
                        displayValue = entries
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(', ');
                    } else {
                        // Regular object - show as JSON
                        displayValue = JSON.stringify(value, null, 2);
                    }
                }
            } else {
                displayValue = String(value);
            }
            
            // Make editable fields clickable
            if (isEditable) {
                html += `<td class="editable-cell" data-element-key="${escapeHtml(record._element_key || '')}" data-field-name="${escapeHtml(col.key)}" data-row-index="${rowIndex}">${escapeHtml(displayValue)}</td>`;
            } else {
                html += `<td>${escapeHtml(displayValue)}</td>`;
            }
        });
        
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    // Add click handlers to sortable headers
    const sortableHeaders = container.querySelectorAll('.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const columnKey = header.getAttribute('data-column');
            handleColumnSort(columnKey);
        });
    });
    
    // Add click handlers to editable cells
    const editableCells = container.querySelectorAll('.editable-cell');
    editableCells.forEach(cell => {
        cell.addEventListener('dblclick', () => {
            makeCellEditable(cell);
        });
        cell.style.cursor = 'pointer';
        cell.title = 'Double-click to edit';
    });
    
    const sortedColumn = displayColumns.find(c => c.key === sortColumn);
    updateStatus(`Displaying ${dataToDisplay.length} elements${sortColumn && sortedColumn ? ` (sorted by ${sortedColumn.label} ${sortDirection})` : ''} - ${displayColumns.length} of ${allAvailableColumns.length} columns`);
}

function openColumnVisibilityModal() {
    const modal = document.getElementById('columnVisibilityModal');
    const checkboxesContainer = document.getElementById('columnCheckboxes');
    
    if (allAvailableColumns.length === 0) {
        alert('Please load data first');
        return;
    }
    
    checkboxesContainer.innerHTML = '';
    
    allAvailableColumns.forEach(col => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'column-checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `col_${col.key}`;
        checkbox.value = col.key;
        // Check current visibility state, default to true if not set
        const hasSettings = Object.keys(columnVisibility).length > 0;
        checkbox.checked = hasSettings ? (columnVisibility[col.key] !== false) : true;
        
        const label = document.createElement('label');
        label.htmlFor = `col_${col.key}`;
        label.textContent = col.label;
        
        checkboxDiv.appendChild(checkbox);
        checkboxDiv.appendChild(label);
        checkboxesContainer.appendChild(checkboxDiv);
    });
    
    modal.style.display = 'block';
}

function closeColumnVisibilityModal() {
    document.getElementById('columnVisibilityModal').style.display = 'none';
}

function showAllColumns() {
    document.querySelectorAll('#columnCheckboxes input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
    });
}

function hideAllColumns() {
    document.querySelectorAll('#columnCheckboxes input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
}

function applyColumnVisibility() {
    // Update visibility state from checkboxes
    document.querySelectorAll('#columnCheckboxes input[type="checkbox"]').forEach(cb => {
        columnVisibility[cb.value] = cb.checked;
    });
    
    // Save to localStorage
    localStorage.setItem('editorV2ColumnVisibility', JSON.stringify(columnVisibility));
    
    // Close modal and refresh display
    closeColumnVisibilityModal();
    displayTable();
}

function makeCellEditable(cell) {
    const elementKey = cell.getAttribute('data-element-key');
    const fieldName = cell.getAttribute('data-field-name');
    const currentValue = cell.textContent.trim();
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.className = 'cell-input';
    input.style.width = '100%';
    input.style.padding = '4px';
    input.style.border = '2px solid #667eea';
    input.style.borderRadius = '3px';
    
    // Replace cell content with input
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();
    
    // Handle save on Enter or blur
    const saveEdit = async () => {
        const newValue = input.value.trim();
        
        if (newValue === currentValue) {
            // No change, just restore
            cell.textContent = currentValue;
            return;
        }
        
        try {
            const response = await fetch(`/api/elements/${encodeURIComponent(elementKey)}/field/${fieldName}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    value: newValue,
                    mission_dir: currentMissionDir || ''
                })
            });
            
            const data = await response.json();
            if (data.success) {
                // Update the cell display
                cell.textContent = newValue;
                
                // Update the data in memory
                const elementKey = cell.getAttribute('data-element-key');
                const record = tableData.find(r => r._element_key === elementKey);
                if (record) {
                    record[fieldName] = newValue;
                }
                
                // Update the cell display (already done above, but ensure it's set)
                cell.textContent = newValue;
                
                updateStatus('Field updated successfully');
            } else {
                throw new Error(data.error || 'Failed to update field');
            }
        } catch (error) {
            console.error('Error updating field:', error);
            alert(`Error updating field: ${error.message}`);
            cell.textContent = currentValue; // Restore original value
        }
    };
    
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cell.textContent = currentValue;
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function exportToXML() {
    const exportByItemclass = document.getElementById('exportByItemclass')?.checked || false;
    const exportSubfolder = document.getElementById('exportSubfolder')?.value || 'exported-types';
    
    let confirmMsg = 'This will export data from the database to XML files.';
    if (exportByItemclass) {
        confirmMsg = `This will export elements grouped by itemclass to the "${exportSubfolder}" subfolder.\n\nContinue?`;
    } else {
        confirmMsg += ' Continue?';
    }
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    updateStatus('Exporting to XML files...');
    
    try {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mission_dir: currentMissionDir || '',
                export_by_itemclass: exportByItemclass,
                export_subfolder: exportSubfolder
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            let statusMsg = `Exported ${data.exported_count} file(s) successfully`;
            if (data.cfgeconomycore_updated) {
                statusMsg += ' (cfgeconomycore.xml updated)';
            }
            if (data.error_count > 0) {
                statusMsg += ` (${data.error_count} error(s))`;
            }
            updateStatus(statusMsg);
            alert(`Export complete!\nExported: ${data.exported_count} file(s)`);
        } else {
            updateStatus('Export failed');
            alert(data.error || 'Failed to export to XML files');
        }
    } catch (error) {
        updateStatus('Export failed');
        console.error('Error exporting to XML:', error);
        alert(`Error exporting to XML: ${error.message}`);
    }
}

