// XML Data Editor JavaScript - Basic initialization

let currentMissionDir = '';
let currentElementType = 'type';
let tableData = [];
let tableColumns = [];
let selectedColumns = new Set();
let sortColumn = null;
let sortDirection = null;
let displayLimit = 100;
let currentPage = 1;
let activeFilters = [];
let selectedItemclassFilters = new Set();
let excludedItemclassFilters = new Set();
let selectedItemtagFilters = new Set();
let excludedItemtagFilters = new Set();
let itemclasses = [];
let itemtags = [];
let currentEditElement = null;
let currentEditField = null;
let selectedRows = new Set();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateStatus('Ready');
    loadSettings();
    loadMissionDir();
    setupEventListeners();
    loadItemclasses();
    loadItemtags();
    loadElements();
    startFileWatcher();
});

function setupEventListeners() {
    // Load data button
    document.getElementById('loadDataBtn').addEventListener('click', () => {
        loadXMLData();
    });
    
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadElements();
    });
    
    // Export button
    document.getElementById('exportBtn').addEventListener('click', () => {
        exportToXML();
    });
    
    // Element type input
    document.getElementById('elementType').addEventListener('change', (e) => {
        currentElementType = e.target.value || 'type';
        saveSettings();
    });
    
    // Mission directory management
    const updateMissionDirBtn = document.getElementById('updateMissionDirBtn');
    const missionDirInput = document.getElementById('missionDir');
    
    if (updateMissionDirBtn) {
        updateMissionDirBtn.addEventListener('click', () => {
            updateMissionDir();
        });
    }
    
    if (missionDirInput) {
        missionDirInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                updateMissionDir();
            }
        });
        
        missionDirInput.addEventListener('change', () => {
            updateMissionDir();
        });
    }
    
    // Export by itemclass checkbox
    const exportByItemclassCheckbox = document.getElementById('exportByItemclass');
    const exportSubfolderGroup = document.getElementById('exportSubfolderGroup');
    if (exportByItemclassCheckbox) {
        exportByItemclassCheckbox.addEventListener('change', (e) => {
            if (exportSubfolderGroup) {
                exportSubfolderGroup.style.display = e.target.checked ? 'block' : 'none';
            }
            saveSettings();
        });
    }
    
    // Load export settings
    const savedExportByItemclass = localStorage.getItem('exportByItemclass') === 'true';
    const savedExportSubfolder = localStorage.getItem('exportSubfolder') || 'exported-types';
    if (exportByItemclassCheckbox) {
        exportByItemclassCheckbox.checked = savedExportByItemclass;
        if (exportSubfolderGroup) {
            exportSubfolderGroup.style.display = savedExportByItemclass ? 'block' : 'none';
        }
    }
    const exportSubfolderInput = document.getElementById('exportSubfolder');
    if (exportSubfolderInput) {
        exportSubfolderInput.value = savedExportSubfolder;
        exportSubfolderInput.addEventListener('change', () => {
            saveSettings();
        });
    }
    
    // Create backup
    const createBackupBtn = document.getElementById('createBackupBtn');
    if (createBackupBtn) {
        createBackupBtn.addEventListener('click', createBackup);
    }
    
    // Restore backup
    const restoreBackupBtn = document.getElementById('restoreBackupBtn');
    if (restoreBackupBtn) {
        restoreBackupBtn.addEventListener('click', restoreFromBackup);
    }
    
    // Merge XML file
    const mergeXmlBtn = document.getElementById('mergeXmlBtn');
    if (mergeXmlBtn) {
        mergeXmlBtn.addEventListener('click', mergeXmlFile);
    }
    
    // Import from database
    const importDbBtn = document.getElementById('importDbBtn');
    if (importDbBtn) {
        importDbBtn.addEventListener('click', importFromDatabase);
    }
    
    
    // Load backup info on startup
    loadBackupInfo();
}

function updateStatus(message) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

function loadSettings() {
    // Load settings from localStorage
    try {
        const saved = localStorage.getItem('xmlEditorSettings');
        if (saved) {
            const settings = JSON.parse(saved);
            currentMissionDir = settings.mission_dir || '';
            currentElementType = settings.elementType || 'type';
            
            // Load selected columns if saved
            if (settings.selectedColumns && Array.isArray(settings.selectedColumns)) {
                selectedColumns = new Set(settings.selectedColumns);
            }
        }
    } catch (e) {
        console.error('Error loading settings:', e);
    }
}

function loadMissionDir() {
    if (!currentMissionDir) {
        currentMissionDir = "";
    }
    displayMissionDir();
}

function displayMissionDir() {
    const input = document.getElementById('missionDir');
    if (input) {
        input.value = currentMissionDir;
    }
}

async function loadXMLData(showStatus = true) {
    if (showStatus) {
        updateStatus('Loading XML data into database...');
    }
    
    try {
        const response = await fetch('/api/load', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mission_dir: currentMissionDir,
                element_type: currentElementType
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (showStatus) {
                updateStatus(`Loaded ${data.element_count} elements from ${data.file_count} files`);
            }
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
                
                // Add internal columns
                tableColumns.push('_element_key', '_source_file', '_source_folder', '_itemclass_id', '_itemclass_name', '_itemtags', '_itemtag_names');
            } else {
                tableColumns = [];
            }
            
            // Initialize selected columns if empty
            if (selectedColumns.size === 0 && tableColumns.length > 0) {
                // Default columns: name, source, nominal, usage, value, category, itemclass, itemtags
                const defaultColumns = ['name', 'source', 'nominal', 'usage', 'value', 'category', '_itemclass_name', '_itemtag_names'];
                defaultColumns.forEach(col => {
                    if (tableColumns.includes(col)) {
                        selectedColumns.add(col);
                    }
                });
                if (selectedColumns.size === 0) {
                    // If no default columns, select first 10
                    tableColumns.slice(0, 10).forEach(col => selectedColumns.add(col));
                }
            }
            
            displayColumnSelector();
            displayTable();
            saveSettings();
            
            updateStatus(`Loaded ${data.total} elements`);
        } else {
            throw new Error(data.error || 'Failed to load elements');
        }
    } catch (error) {
        updateStatus('Error loading elements');
        console.error('Error loading elements:', error);
    }
}

async function loadItemclasses() {
    try {
        const url = `/api/itemclasses${currentMissionDir ? '?mission_dir=' + encodeURIComponent(currentMissionDir) : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        itemclasses = data.itemclasses || [];
        displayItemclasses();
        displayItemclassFilters();
        updateBulkOperationControls();
    } catch (error) {
        console.error('Error loading itemclasses:', error);
    }
}

function displayItemclasses() {
    const itemclassesListEl = document.getElementById('itemclassesList');
    if (!itemclassesListEl) return;
    itemclassesListEl.innerHTML = '';
    
    if (itemclasses.length === 0) {
        itemclassesListEl.innerHTML = '<p class="no-itemclasses">No itemclasses created</p>';
        return;
    }
    
    itemclasses.forEach(itemclass => {
        const itemclassItem = document.createElement('div');
        itemclassItem.className = 'itemclass-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'itemclass-name';
        nameSpan.textContent = itemclass.name;
        nameSpan.title = 'Double-click to rename';
        nameSpan.contentEditable = 'false';
        
        nameSpan.addEventListener('dblclick', () => {
            nameSpan.contentEditable = 'true';
            nameSpan.focus();
        });
        
        nameSpan.addEventListener('blur', async () => {
            nameSpan.contentEditable = 'false';
            const newName = nameSpan.textContent.trim();
            if (newName && newName !== itemclass.name) {
                await renameItemclass(itemclass.id, newName);
            } else {
                nameSpan.textContent = itemclass.name;
            }
        });
        
        nameSpan.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                nameSpan.blur();
            }
        });
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-small btn-delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Delete itemclass "${itemclass.name}"?`)) {
                deleteItemclass(itemclass.id);
            }
        });
        
        itemclassItem.appendChild(nameSpan);
        itemclassItem.appendChild(deleteBtn);
        itemclassesListEl.appendChild(itemclassItem);
    });
}

async function loadItemtags() {
    try {
        const url = `/api/itemtags${currentMissionDir ? '?mission_dir=' + encodeURIComponent(currentMissionDir) : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        itemtags = data.itemtags || [];
        displayItemtags();
        displayItemtagFilters();
        updateBulkOperationControls();
    } catch (error) {
        console.error('Error loading itemtags:', error);
    }
}

function displayItemtags() {
    const itemtagsListEl = document.getElementById('itemtagsList');
    if (!itemtagsListEl) return;
    itemtagsListEl.innerHTML = '';
    
    if (itemtags.length === 0) {
        itemtagsListEl.innerHTML = '<p class="no-itemtags">No itemtags created</p>';
        return;
    }
    
    itemtags.forEach(itemtag => {
        const itemtagItem = document.createElement('div');
        itemtagItem.className = 'itemtag-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'itemtag-name';
        nameSpan.textContent = itemtag.name;
        nameSpan.title = 'Double-click to rename';
        nameSpan.contentEditable = 'false';
        
        nameSpan.addEventListener('dblclick', () => {
            nameSpan.contentEditable = 'true';
            nameSpan.focus();
        });
        
        nameSpan.addEventListener('blur', async () => {
            nameSpan.contentEditable = 'false';
            const newName = nameSpan.textContent.trim();
            if (newName && newName !== itemtag.name) {
                await renameItemtag(itemtag.id, newName);
            } else {
                nameSpan.textContent = itemtag.name;
            }
        });
        
        nameSpan.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                nameSpan.blur();
            }
        });
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-small btn-delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Delete itemtag "${itemtag.name}"?`)) {
                deleteItemtag(itemtag.id);
            }
        });
        
        itemtagItem.appendChild(nameSpan);
        itemtagItem.appendChild(deleteBtn);
        itemtagsListEl.appendChild(itemtagItem);
    });
}

function displayColumnSelector() {
    const checkboxesEl = document.getElementById('columnCheckboxes');
    const filterSelectEl = document.getElementById('filterColumn');
    
    if (!checkboxesEl || !filterSelectEl) return;
    
    checkboxesEl.innerHTML = '';
    filterSelectEl.innerHTML = '<option value="">-- Select Column --</option>';
    
    const priorityColumns = ['type', 'name', 'source', 'nominal', 'lifetime', 'restock', 'usage', 'value', 'flags', 'category', 'tag', 'cost', 'min', 'quantmin', 'quantmax'];
    const internalPriorityColumns = ['_itemclass_name', '_itemtag_names'];
    const otherColumns = tableColumns.filter(col => !priorityColumns.includes(col) && !col.startsWith('_'));
    const otherInternalColumns = tableColumns.filter(col => col.startsWith('_') && !internalPriorityColumns.includes(col));
    const orderedColumns = [
        ...priorityColumns.filter(col => tableColumns.includes(col)),
        ...internalPriorityColumns.filter(col => tableColumns.includes(col)),
        ...otherColumns,
        ...otherInternalColumns
    ];
    
    orderedColumns.forEach(col => {
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '5px';
        label.style.cursor = 'pointer';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = col;
        checkbox.checked = selectedColumns.has(col);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedColumns.add(col);
            } else {
                selectedColumns.delete(col);
            }
            saveSettings();
            displayTable();
        });
        
        // Display user-friendly column names
        let displayName = col;
        if (col === '_itemclass_name') {
            displayName = 'Itemclass';
        } else if (col === '_itemtag_names') {
            displayName = 'Itemtags';
        } else if (col.startsWith('_')) {
            displayName = col.substring(1).replace(/_/g, ' ');
        }
        
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(' ' + displayName));
        checkboxesEl.appendChild(label);
        
        const option = document.createElement('option');
        option.value = col;
        option.textContent = displayName;
        filterSelectEl.appendChild(option);
    });
}

function displayTable() {
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    
    if (!tableHead || !tableBody) return;
    
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';
    
    if (tableData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="100%" class="no-data">No data loaded. Click "Load XML Data" to load data from your mission directory.</td></tr>';
        return;
    }
    
    // Get filtered and sorted data
    const displayData = getFilteredAndSortedData();
    const startIndex = (currentPage - 1) * displayLimit;
    const endIndex = startIndex + displayLimit;
    const pageData = displayData.slice(startIndex, endIndex);
    
    // Get selected columns in priority order
    const priorityColumns = ['type', 'name', 'source', 'nominal', 'lifetime', 'restock', 'usage', 'value', 'flags', 'category', 'tag', 'cost', 'min', 'quantmin', 'quantmax'];
    const internalPriorityColumns = ['_itemclass_name', '_itemtag_names'];
    const selectedColsArray = Array.from(selectedColumns);
    const prioritySelected = priorityColumns.filter(col => selectedColsArray.includes(col));
    const internalPrioritySelected = internalPriorityColumns.filter(col => selectedColsArray.includes(col));
    const otherSelected = selectedColsArray.filter(col => !priorityColumns.includes(col) && !col.startsWith('_'));
    const otherInternalSelected = selectedColsArray.filter(col => col.startsWith('_') && !internalPriorityColumns.includes(col));
    const orderedColumns = [...prioritySelected, ...internalPrioritySelected, ...otherSelected, ...otherInternalSelected];
    
    if (orderedColumns.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="100%" class="no-data">No columns selected</td></tr>';
        return;
    }
    
    // Create header row with checkbox
    const headerRow = document.createElement('tr');
    const checkboxTh = document.createElement('th');
    const selectAllCheckbox = document.createElement('input');
    selectAllCheckbox.type = 'checkbox';
    selectAllCheckbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        pageData.forEach(item => {
            const elementKey = item._element_key;
            if (checked) {
                selectedRows.add(elementKey);
            } else {
                selectedRows.delete(elementKey);
            }
        });
        updateBulkSelectionInfo();
        displayTable();
    });
    checkboxTh.appendChild(selectAllCheckbox);
    headerRow.appendChild(checkboxTh);
    
    orderedColumns.forEach(col => {
        const th = document.createElement('th');
        // Display user-friendly column names
        let displayName = col;
        if (col === '_itemclass_name') {
            displayName = 'Itemclass';
        } else if (col === '_itemtag_names') {
            displayName = 'Itemtags';
        } else if (col.startsWith('_')) {
            displayName = col.substring(1).replace(/_/g, ' ');
        }
        th.textContent = displayName;
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            if (sortColumn === col) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = col;
                sortDirection = 'asc';
            }
            saveSettings();
            displayTable();
        });
        
        if (sortColumn === col) {
            th.textContent += sortDirection === 'asc' ? ' ▲' : ' ▼';
        }
        
        headerRow.appendChild(th);
    });
    tableHead.appendChild(headerRow);
    
    // Create data rows
    pageData.forEach(record => {
        const row = document.createElement('tr');
        const elementKey = record._element_key;
        
        // Checkbox column
        const checkboxTd = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedRows.has(elementKey);
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedRows.add(elementKey);
            } else {
                selectedRows.delete(elementKey);
            }
            updateBulkSelectionInfo();
        });
        checkboxTd.appendChild(checkbox);
        row.appendChild(checkboxTd);
        
        orderedColumns.forEach(col => {
            const td = document.createElement('td');
            const isSourceColumn = col === 'source';
            
            if (!isSourceColumn) {
                td.className = 'editable-cell';
                td.dataset.elementKey = elementKey;
                td.dataset.fieldName = col;
            } else {
                td.className = 'readonly-cell';
            }
            
            const value = record[col];
            
            // Fields that should display a single value (not arrays)
            const singleValueFields = ['name', 'nominal', 'lifetime', 'restock', 'cost', 'min', 'quantmin', 'quantmax'];
            
            // Special handling for itemclass and itemtag columns
            if (col === '_itemclass_name') {
                td.textContent = value || '';
                td.className += ' itemclass-cell editable-cell';
                td.dataset.elementKey = elementKey;
                td.dataset.itemclassId = record._itemclass_id || '';
                td.title = 'Double-click to edit itemclass';
                td.addEventListener('dblclick', () => {
                    openItemclassEditor(elementKey, record._itemclass_id, value);
                });
            } else if (col === '_itemtag_names') {
                if (Array.isArray(value)) {
                    td.textContent = value.join(', ');
                } else if (value) {
                    td.textContent = String(value);
                } else {
                    td.textContent = '';
                }
                td.className += ' itemtag-cell';
                if (!isSourceColumn) {
                    td.className += ' readonly-cell';
                }
            } else if (col === 'category' || col === 'usage') {
                // Extract only the 'name' attribute value
                if (value === undefined || value === null) {
                    td.textContent = '';
                    td.className += ' empty-cell';
                } else if (Array.isArray(value)) {
                    const names = value.map(v => {
                        if (typeof v === 'object' && v !== null) {
                            return v.name || v._text || '';
                        }
                        return String(v);
                    }).filter(n => n);
                    td.textContent = names.join(', ');
                    td.className += ' array-cell';
                } else if (typeof value === 'object') {
                    td.textContent = value.name || value._text || '';
                    td.className += ' object-cell';
                } else {
                    td.textContent = String(value);
                }
            } else if (value === undefined || value === null) {
                td.textContent = '';
                td.className += ' empty-cell';
            } else if (Array.isArray(value)) {
                // For single-value fields, deduplicate and take first unique value
                if (singleValueFields.includes(col)) {
                    const uniqueValues = [...new Set(value.map(v => {
                        if (typeof v === 'object' && v !== null) {
                            if (v._text) {
                                return v._text;
                            } else if (Object.keys(v).length > 0) {
                                return Object.values(v)[0];
                            }
                        }
                        return String(v);
                    }))];
                    td.textContent = uniqueValues.length > 0 ? uniqueValues[0] : '';
                    td.className += ' array-cell';
                } else {
                    const displayValues = value.map(v => {
                        if (typeof v === 'object' && v !== null) {
                            if (v._text) {
                                const parts = [v._text];
                                Object.keys(v).filter(k => k !== '_text').forEach(k => {
                                    parts.push(`${k}="${v[k]}"`);
                                });
                                return parts.join(', ');
                            } else {
                                return Object.entries(v).map(([k, v]) => `${k}="${v}"`).join(', ');
                            }
                        }
                        return String(v);
                    });
                    td.textContent = displayValues.join('; ');
                    td.className += ' array-cell';
                }
            } else if (typeof value === 'object') {
                if (value._text) {
                    const parts = [value._text];
                    Object.keys(value).filter(k => k !== '_text').forEach(k => {
                        parts.push(`${k}="${value[k]}"`);
                    });
                    td.textContent = parts.join(', ');
                } else {
                    td.textContent = Object.entries(value).map(([k, v]) => `${k}="${v}"`).join(', ');
                }
                td.className += ' object-cell';
            } else {
                td.textContent = String(value);
            }
            
            if (!isSourceColumn) {
                td.addEventListener('dblclick', () => {
                    openEditModal(elementKey, col, value);
                });
                td.title = 'Double-click to edit';
            }
            
            row.appendChild(td);
        });
        
        tableBody.appendChild(row);
    });
    
    // Update pagination
    updatePagination(displayData.length);
    updateBulkSelectionInfo();
}

function getFilteredAndSortedData() {
    let filtered = [...tableData];
    
    // Apply filters
    if (activeFilters.length > 0 || selectedItemclassFilters.size > 0 || excludedItemclassFilters.size > 0 || 
        selectedItemtagFilters.size > 0 || excludedItemtagFilters.size > 0) {
        filtered = filtered.filter(item => {
            // Itemclass filters
            if (selectedItemclassFilters.size > 0) {
                const itemclassId = item._itemclass_id;
                if (!itemclassId || !selectedItemclassFilters.has(itemclassId)) {
                    return false;
                }
            }
            if (excludedItemclassFilters.size > 0) {
                const itemclassId = item._itemclass_id;
                if (itemclassId && excludedItemclassFilters.has(itemclassId)) {
                    return false;
                }
            }
            
            // Itemtag filters
            if (selectedItemtagFilters.size > 0) {
                const itemtagIds = (item._itemtags || []).map(t => t.id);
                const hasAny = Array.from(selectedItemtagFilters).some(id => itemtagIds.includes(id));
                if (!hasAny) {
                    return false;
                }
            }
            if (excludedItemtagFilters.size > 0) {
                const itemtagIds = (item._itemtags || []).map(t => t.id);
                const hasAny = Array.from(excludedItemtagFilters).some(id => itemtagIds.includes(id));
                if (hasAny) {
                    return false;
                }
            }
            
            // Text filters
            for (const filter of activeFilters) {
                const value = item[filter.column];
                const itemValue = value !== undefined && value !== null ? String(value).toLowerCase() : '';
                const filterValue = filter.value.toLowerCase();
                const matches = itemValue.includes(filterValue);
                if (filter.not ? matches : !matches) {
                    return false;
                }
            }
            
            return true;
        });
    }
    
    // Apply sorting
    if (sortColumn) {
        filtered.sort((a, b) => {
            const aVal = a[sortColumn];
            const bVal = b[sortColumn];
            
            if (aVal === undefined || aVal === null) return 1;
            if (bVal === undefined || bVal === null) return -1;
            
            const comparison = String(aVal).localeCompare(String(bVal));
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }
    
    return filtered;
}

function updatePagination(totalItems) {
    const totalPages = Math.max(1, Math.ceil(totalItems / displayLimit));
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const limitInfo = document.getElementById('limitInfo');
    
    if (pageInfo) {
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }
    
    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
    }
    
    if (limitInfo) {
        limitInfo.textContent = `(${totalItems} total items)`;
    }
}

function updateBulkSelectionInfo() {
    const infoEl = document.getElementById('bulkSelectionInfo');
    if (infoEl) {
        infoEl.textContent = `${selectedRows.size} row(s) selected`;
    }
}

function updateBulkOperationControls() {
    const bulkItemclassSelect = document.getElementById('bulkItemclass');
    const bulkItemtagsCheckboxes = document.getElementById('bulkItemtagsCheckboxes');
    
    if (bulkItemclassSelect) {
        bulkItemclassSelect.innerHTML = '<option value="">-- No Itemclass --</option>';
        itemclasses.forEach(ic => {
            const option = document.createElement('option');
            option.value = ic.id;
            option.textContent = ic.name;
            bulkItemclassSelect.appendChild(option);
        });
    }
    
    if (bulkItemtagsCheckboxes) {
        bulkItemtagsCheckboxes.innerHTML = '';
        itemtags.forEach(it => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '5px';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = it.id;
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(it.name));
            bulkItemtagsCheckboxes.appendChild(label);
        });
    }
}

function displayItemclassFilters() {
    const container = document.getElementById('itemclassFilterCheckboxes');
    if (!container) return;
    
    container.innerHTML = '';
    itemclasses.forEach(itemclass => {
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '5px';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = itemclass.id;
        checkbox.checked = selectedItemclassFilters.has(itemclass.id);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedItemclassFilters.add(itemclass.id);
                excludedItemclassFilters.delete(itemclass.id);
            } else {
                selectedItemclassFilters.delete(itemclass.id);
            }
            saveSettings();
            displayTable();
        });
        
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(itemclass.name));
        container.appendChild(label);
    });
}

function displayItemtagFilters() {
    const container = document.getElementById('itemtagFilterCheckboxes');
    if (!container) return;
    
    container.innerHTML = '';
    itemtags.forEach(itemtag => {
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '5px';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = itemtag.id;
        checkbox.checked = selectedItemtagFilters.has(itemtag.id);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedItemtagFilters.add(itemtag.id);
                excludedItemtagFilters.delete(itemtag.id);
            } else {
                selectedItemtagFilters.delete(itemtag.id);
            }
            saveSettings();
            displayTable();
        });
        
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(itemtag.name));
        container.appendChild(label);
    });
}

function updateMissionDir() {
    const input = document.getElementById('missionDir');
    if (input) {
        const newMissionDir = input.value.trim();
        if (newMissionDir !== currentMissionDir) {
            currentMissionDir = newMissionDir;
            tableData = [];
            tableColumns = [];
            displayTable();
            loadItemclasses();
            loadItemtags();
            loadElements();
            loadBackupInfo();
        }
        saveSettings();
    }
}

async function renameItemclass(itemclassId, newName) {
    try {
        const response = await fetch(`/api/itemclasses/${itemclassId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: newName,
                mission_dir: currentMissionDir
            })
        });
        
        const data = await response.json();
        if (data.success) {
            await loadItemclasses();
            loadElements();
        } else {
            alert(data.error || 'Failed to rename itemclass');
            await loadItemclasses();
        }
    } catch (error) {
        console.error('Error renaming itemclass:', error);
        await loadItemclasses();
    }
}

async function deleteItemclass(itemclassId) {
    try {
        const response = await fetch(`/api/itemclasses/${itemclassId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mission_dir: currentMissionDir
            })
        });
        
        const data = await response.json();
        if (data.success) {
            await loadItemclasses();
            loadElements();
        }
    } catch (error) {
        console.error('Error deleting itemclass:', error);
    }
}

async function renameItemtag(itemtagId, newName) {
    try {
        const response = await fetch(`/api/itemtags/${itemtagId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: newName,
                mission_dir: currentMissionDir
            })
        });
        
        const data = await response.json();
        if (data.success) {
            await loadItemtags();
            loadElements();
        } else {
            alert(data.error || 'Failed to rename itemtag');
            await loadItemtags();
        }
    } catch (error) {
        console.error('Error renaming itemtag:', error);
        await loadItemtags();
    }
}

async function deleteItemtag(itemtagId) {
    try {
        const response = await fetch(`/api/itemtags/${itemtagId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mission_dir: currentMissionDir
            })
        });
        
        const data = await response.json();
        if (data.success) {
            await loadItemtags();
            loadElements();
        }
    } catch (error) {
        console.error('Error deleting itemtag:', error);
    }
}

function openItemclassEditor(elementKey, currentItemclassId, currentItemclassName) {
    currentEditElement = elementKey;
    currentEditField = '_itemclass';
    
    const modal = document.getElementById('editModal');
    const label = document.getElementById('editFieldLabel');
    const input = document.getElementById('editFieldValue');
    
    if (modal && label && input) {
        label.textContent = 'Edit Itemclass:';
        
        // Remove any existing select dropdown first
        const existingSelect = document.getElementById('editItemclassSelect');
        if (existingSelect) {
            existingSelect.remove();
        }
        
        // Replace input with dropdown
        const select = document.createElement('select');
        select.id = 'editItemclassSelect';
        select.className = 'edit-input';
        
        // Add "No Itemclass" option
        const noOption = document.createElement('option');
        noOption.value = '';
        noOption.textContent = '-- No Itemclass --';
        if (!currentItemclassId) {
            noOption.selected = true;
        }
        select.appendChild(noOption);
        
        // Add all itemclasses, filtering out duplicates by name and ID
        const seenNames = new Set();
        const seenIds = new Set();
        console.log(`Building itemclass dropdown with ${itemclasses.length} itemclasses`);
        itemclasses.forEach(itemclass => {
            // Skip if we've already seen this ID
            if (seenIds.has(itemclass.id)) {
                console.warn(`Duplicate itemclass ID detected: ${itemclass.id} (Name: ${itemclass.name})`);
                return;
            }
            seenIds.add(itemclass.id);
            
            // Skip if we've already seen this name (case-insensitive check)
            const nameLower = itemclass.name.toLowerCase();
            if (seenNames.has(nameLower)) {
                console.warn(`Duplicate itemclass name detected: ${itemclass.name} (ID: ${itemclass.id})`);
                return;
            }
            seenNames.add(nameLower);
            
            const option = document.createElement('option');
            option.value = itemclass.id;
            option.textContent = itemclass.name;
            if (itemclass.id === currentItemclassId) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        console.log(`Dropdown created with ${select.options.length - 1} itemclass options (excluding 'No Itemclass')`);
        
        // Replace input with select
        const form = input.parentElement;
        input.style.display = 'none';
        form.insertBefore(select, input);
        
        // Store reference to select for save function
        window.currentItemclassSelect = select;
        
        modal.style.display = 'block';
        select.focus();
    }
}

function openEditModal(elementKey, fieldName, currentValue) {
    // Don't open modal for itemclass - use special editor
    if (fieldName === '_itemclass_name' || fieldName === '_itemclass') {
        const record = tableData.find(r => r._element_key === elementKey);
        openItemclassEditor(elementKey, record?._itemclass_id, record?._itemclass_name);
        return;
    }
    
    currentEditElement = elementKey;
    currentEditField = fieldName;
    
    const modal = document.getElementById('editModal');
    const label = document.getElementById('editFieldLabel');
    const input = document.getElementById('editFieldValue');
    
    if (modal && label && input) {
        // Remove any existing select dropdown
        const existingSelect = document.getElementById('editItemclassSelect');
        if (existingSelect) {
            existingSelect.remove();
            input.style.display = 'block';
        }
        
        label.textContent = `Edit ${fieldName}:`;
        
        if (currentValue === null || currentValue === undefined) {
            input.value = '';
        } else if (typeof currentValue === 'object') {
            input.value = JSON.stringify(currentValue);
        } else {
            input.value = String(currentValue);
        }
        
        modal.style.display = 'block';
        input.focus();
        input.select();
    }
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Clean up itemclass select if it exists
    const select = document.getElementById('editItemclassSelect');
    const input = document.getElementById('editFieldValue');
    if (select && input) {
        select.remove();
        input.style.display = 'block';
    }
    window.currentItemclassSelect = null;
    
    currentEditElement = null;
    currentEditField = null;
}

async function saveEdit() {
    if (!currentEditElement || !currentEditField) return;
    
    // Handle itemclass editing specially
    if (currentEditField === '_itemclass') {
        const select = window.currentItemclassSelect || document.getElementById('editItemclassSelect');
        if (!select) return;
        
        const itemclassId = select.value ? parseInt(select.value) : null;
        
        try {
            const response = await fetch(`/api/elements/${encodeURIComponent(currentEditElement)}/itemclass`, {
                method: itemclassId ? 'PUT' : 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    itemclass_id: itemclassId,
                    mission_dir: currentMissionDir
                })
            });
            
            const data = await response.json();
            if (data.success) {
                closeEditModal();
                loadElements();
                saveSettings();
            } else {
                alert(data.error || 'Failed to save itemclass');
            }
        } catch (error) {
            console.error('Error saving itemclass:', error);
            alert(`Error saving itemclass: ${error.message}`);
        }
        return;
    }
    
    const input = document.getElementById('editFieldValue');
    if (!input) return;
    
    let newValue = input.value;
    
    // Try to parse as JSON if it looks like JSON
    if (newValue.trim().startsWith('{') || newValue.trim().startsWith('[')) {
        try {
            newValue = JSON.parse(newValue);
        } catch (e) {
            // Not valid JSON, use as string
        }
    }
    
    try {
        const response = await fetch(`/api/elements/${encodeURIComponent(currentEditElement)}/field/${currentEditField}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                value: newValue,
                mission_dir: currentMissionDir
            })
        });
        
        const data = await response.json();
        if (data.success) {
            closeEditModal();
            loadElements();
            saveSettings();
        } else {
            alert(data.error || 'Failed to save edit');
        }
    } catch (error) {
        console.error('Error saving edit:', error);
        alert(`Error saving edit: ${error.message}`);
    }
}

async function undoEdit() {
    if (!currentEditElement) return;
    
    try {
        const response = await fetch(`/api/elements/${encodeURIComponent(currentEditElement)}/undo`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mission_dir: currentMissionDir
            })
        });
        
        const data = await response.json();
        if (data.success) {
            closeEditModal();
            loadElements();
            saveSettings();
        } else {
            alert(data.error || 'Failed to undo edit');
        }
    } catch (error) {
        console.error('Error undoing edit:', error);
        alert(`Error undoing edit: ${error.message}`);
    }
}

async function exportToXML() {
    const exportByItemclass = document.getElementById('exportByItemclass')?.checked || false;
    const exportSubfolder = document.getElementById('exportSubfolder')?.value || 'exported-types';
    
    let confirmMsg = 'This will overwrite the original XML files with data from the database.';
    if (exportByItemclass) {
        confirmMsg = `This will export elements grouped by itemclass to the "${exportSubfolder}" subfolder.\n\n` +
                    `One XML file will be created per itemclass, and cfgeconomycore.xml will be updated.\n\n` +
                    `Existing <ce> elements in cfgeconomycore.xml will be commented out.\n\nContinue?`;
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
            
            if (data.error_count > 0 && data.errors && data.errors.length > 0) {
                let errorMsg = `Export complete!\n\nExported: ${data.exported_count} file(s)`;
                if (data.cfgeconomycore_updated) {
                    errorMsg += '\ncfgeconomycore.xml updated';
                }
                errorMsg += `\nErrors: ${data.error_count} file(s)\n\nError details:\n`;
                data.errors.forEach((err, idx) => {
                    errorMsg += `\n${idx + 1}. ${err.file}\n   ${err.error}`;
                });
                alert(errorMsg);
            } else {
                let successMsg = `Export complete!\nExported: ${data.exported_count} file(s)`;
                if (data.cfgeconomycore_updated) {
                    successMsg += '\ncfgeconomycore.xml has been updated with the new <ce> section';
                }
                alert(successMsg);
            }
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

async function createBackup() {
    updateStatus('Creating backup...');
    
    try {
        const response = await fetch('/api/create-backup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                mission_dir: currentMissionDir || ''
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateStatus('Backup created successfully');
            alert(`Backup created successfully!\n\nBackup file: ${data.backup_name}\nLocation: ${data.backup_path}`);
            loadBackupInfo();
        } else {
            updateStatus('Backup failed');
            alert(data.error || 'Failed to create backup');
        }
    } catch (error) {
        updateStatus('Backup failed');
        console.error('Error creating backup:', error);
        alert(`Error creating backup: ${error.message}`);
    }
}

async function restoreFromBackup() {
    if (!confirm('This will restore the database from the most recent backup.\n\nAll changes made after the backup was created will be lost.\n\nContinue?')) {
        return;
    }
    
    updateStatus('Restoring from backup...');
    
    try {
        const response = await fetch('/api/restore-backup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                mission_dir: currentMissionDir || '',
                backup_name: null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateStatus('Database restored successfully');
            alert('Database restored successfully from backup');
            loadElements();
            loadBackupInfo();
        } else {
            updateStatus('Restore failed');
            alert(data.error || 'Failed to restore from backup');
        }
    } catch (error) {
        updateStatus('Restore failed');
        console.error('Error restoring from backup:', error);
        alert(`Error restoring from backup: ${error.message}`);
    }
}

async function loadBackupInfo() {
    try {
        const response = await fetch(`/api/get-backup-info?mission_dir=${encodeURIComponent(currentMissionDir || '')}`);
        const data = await response.json();
        
        const backupInfoEl = document.getElementById('backupInfo');
        const restoreBtn = document.getElementById('restoreBackupBtn');
        
        if (data.success && data.backup_name) {
            if (backupInfoEl) {
                const backupTime = data.backup_time ? new Date(data.backup_time).toLocaleString() : 'Unknown';
                backupInfoEl.innerHTML = `<p><strong>Latest Backup:</strong><br>${data.backup_name}<br><small>${backupTime}</small></p>`;
            }
            if (restoreBtn) {
                restoreBtn.disabled = false;
            }
        } else {
            if (backupInfoEl) {
                backupInfoEl.innerHTML = '<p>No backup available</p>';
            }
            if (restoreBtn) {
                restoreBtn.disabled = true;
            }
        }
    } catch (error) {
        console.error('Error loading backup info:', error);
    }
}

async function mergeXmlFile() {
    const fileInput = document.getElementById('mergeXmlFile');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert('Please select an XML file to merge');
        return;
    }
    
    const file = fileInput.files[0];
    if (!file.name.endsWith('.xml')) {
        alert('Please select a valid XML file');
        return;
    }
    
    if (!confirm(`This will merge "${file.name}" into the database.\n\nExisting elements with the same name will be skipped (not overwritten).\n\nA backup will be created automatically. Continue?`)) {
        return;
    }
    
    updateStatus('Merging XML file...');
    const mergeStatusEl = document.getElementById('mergeStatus');
    if (mergeStatusEl) {
        mergeStatusEl.style.display = 'block';
        mergeStatusEl.textContent = 'Uploading and merging...';
        mergeStatusEl.className = 'merge-status merging';
    }
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mission_dir', currentMissionDir || '');
        formData.append('element_type', currentElementType || 'type');
        
        const response = await fetch('/api/merge-xml', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateStatus(`Merge complete: ${data.added_count} added, ${data.skipped_count} skipped`);
            
            if (mergeStatusEl) {
                mergeStatusEl.className = 'merge-status success';
                let statusText = `Merge complete!\n`;
                statusText += `Added: ${data.added_count} element(s)\n`;
                statusText += `Skipped: ${data.skipped_count} element(s) (already exist)\n`;
                statusText += `Total in file: ${data.total_in_file || 0}`;
                if (data.errors && data.errors.length > 0) {
                    statusText += `\nErrors: ${data.errors.length}`;
                }
                mergeStatusEl.textContent = statusText;
            }
            
            loadElements();
            loadBackupInfo();
            fileInput.value = '';
        } else {
            updateStatus('Merge failed');
            if (mergeStatusEl) {
                mergeStatusEl.className = 'merge-status error';
                mergeStatusEl.textContent = `Error: ${data.error || 'Unknown error'}`;
            }
            alert(data.error || 'Failed to merge XML file');
        }
    } catch (error) {
        updateStatus('Merge failed');
        if (mergeStatusEl) {
            mergeStatusEl.className = 'merge-status error';
            mergeStatusEl.textContent = `Error: ${error.message}`;
        }
        console.error('Error merging XML file:', error);
        alert(`Error merging XML file: ${error.message}`);
    }
}

async function importFromDatabase() {
    const sourceDbPathInput = document.getElementById('sourceDbPath');
    if (!sourceDbPathInput) {
        return;
    }
    
    const sourceDbPath = sourceDbPathInput.value.trim();
    if (!sourceDbPath) {
        alert('Please enter a source database path');
        return;
    }
    
    if (!confirm(`This will import data from:\n${sourceDbPath}\n\ninto the current mission database.\n\nExisting elements with the same name will be skipped (not overwritten).\n\nA backup will be created automatically. Continue?`)) {
        return;
    }
    
    updateStatus('Importing from database...');
    const importStatusEl = document.getElementById('importStatus');
    if (importStatusEl) {
        importStatusEl.style.display = 'block';
        importStatusEl.textContent = 'Importing...';
        importStatusEl.className = 'import-status importing';
    }
    
    try {
        const response = await fetch('/api/import-database', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mission_dir: currentMissionDir || '',
                source_db_path: sourceDbPath
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateStatus(`Import complete: ${data.imported_count} imported, ${data.skipped_count} skipped`);
            
            if (importStatusEl) {
                importStatusEl.className = 'import-status success';
                let statusText = `Import complete!\n`;
                statusText += `Imported: ${data.imported_count} element(s)\n`;
                statusText += `Skipped: ${data.skipped_count} element(s) (already exist)`;
                if (data.backup_name) {
                    statusText += `\n\nBackup created: ${data.backup_name}`;
                }
                importStatusEl.textContent = statusText;
            }
            
            // Reload data to show imported items
            loadItemclasses();
            loadItemtags();
            loadElements();
            loadBackupInfo();
        } else {
            updateStatus('Import failed');
            if (importStatusEl) {
                importStatusEl.className = 'import-status error';
                importStatusEl.textContent = `Error: ${data.error || 'Unknown error'}`;
            }
            alert(data.error || 'Failed to import from database');
        }
    } catch (error) {
        updateStatus('Import failed');
        if (importStatusEl) {
            importStatusEl.className = 'import-status error';
            importStatusEl.textContent = `Error: ${error.message}`;
        }
        console.error('Error importing from database:', error);
        alert(`Error importing from database: ${error.message}`);
    }
}

// Add event listeners for modal
document.addEventListener('DOMContentLoaded', () => {
    const saveEditBtn = document.getElementById('saveEditBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const undoEditBtn = document.getElementById('undoEditBtn');
    const closeModal = document.querySelector('.close-modal');
    
    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', saveEdit);
    }
    
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', closeEditModal);
    }
    
    if (undoEditBtn) {
        undoEditBtn.addEventListener('click', undoEdit);
    }
    
    if (closeModal) {
        closeModal.addEventListener('click', closeEditModal);
    }
    
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'editModal') {
                closeEditModal();
            }
        });
    }
    
    // Bulk operations
    const bulkSetItemclassBtn = document.getElementById('bulkSetItemclassBtn');
    if (bulkSetItemclassBtn) {
        bulkSetItemclassBtn.addEventListener('click', bulkSetItemclass);
    }
    
    const bulkSetItemtagsBtn = document.getElementById('bulkSetItemtagsBtn');
    if (bulkSetItemtagsBtn) {
        bulkSetItemtagsBtn.addEventListener('click', bulkSetItemtags);
    }
    
    const bulkClearSelectionBtn = document.getElementById('bulkClearSelectionBtn');
    if (bulkClearSelectionBtn) {
        bulkClearSelectionBtn.addEventListener('click', () => {
            selectedRows.clear();
            updateBulkSelectionInfo();
            displayTable();
        });
    }
    
    // Add itemclass
    const addItemclassBtn = document.getElementById('addItemclassBtn');
    if (addItemclassBtn) {
        addItemclassBtn.addEventListener('click', addItemclass);
    }
    
    // Add itemtag
    const addItemtagBtn = document.getElementById('addItemtagBtn');
    if (addItemtagBtn) {
        addItemtagBtn.addEventListener('click', addItemtag);
    }
    
    // Pagination
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const displayLimitInput = document.getElementById('displayLimit');
    
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                saveSettings();
                displayTable();
            }
        });
    }
    
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            const allFilteredData = getFilteredAndSortedData();
            const totalPages = Math.max(1, Math.ceil(allFilteredData.length / displayLimit));
            if (currentPage < totalPages) {
                currentPage++;
                saveSettings();
                displayTable();
            }
        });
    }
    
    if (displayLimitInput) {
        displayLimitInput.addEventListener('change', (e) => {
            const limit = parseInt(e.target.value) || 100;
            displayLimit = Math.max(1, Math.min(10000, limit));
            currentPage = 1;
            saveSettings();
            displayTable();
        });
    }
    
    // Column selector
    const selectAllColumns = document.getElementById('selectAllColumns');
    const deselectAllColumns = document.getElementById('deselectAllColumns');
    
    if (selectAllColumns) {
        selectAllColumns.addEventListener('click', () => {
            tableColumns.forEach(col => selectedColumns.add(col));
            saveSettings();
            displayColumnSelector();
            displayTable();
        });
    }
    
    if (deselectAllColumns) {
        deselectAllColumns.addEventListener('click', () => {
            selectedColumns.clear();
            saveSettings();
            displayColumnSelector();
            displayTable();
        });
    }
});

async function addItemclass() {
    const input = document.getElementById('newItemclassName');
    if (!input) return;
    
    const name = input.value.trim();
    if (!name) {
        alert('Please enter an itemclass name');
        return;
    }
    
    try {
        const response = await fetch('/api/itemclasses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                mission_dir: currentMissionDir
            })
        });
        
        const data = await response.json();
        if (data.success) {
            input.value = '';
            await loadItemclasses();
            loadElements();
        } else {
            alert(data.error || 'Failed to create itemclass');
        }
    } catch (error) {
        console.error('Error adding itemclass:', error);
        alert(`Error adding itemclass: ${error.message}`);
    }
}

async function addItemtag() {
    const input = document.getElementById('newItemtagName');
    if (!input) return;
    
    const name = input.value.trim();
    if (!name) {
        alert('Please enter an itemtag name');
        return;
    }
    
    try {
        const response = await fetch('/api/itemtags', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                mission_dir: currentMissionDir
            })
        });
        
        const data = await response.json();
        if (data.success) {
            input.value = '';
            await loadItemtags();
            loadElements();
        } else {
            alert(data.error || 'Failed to create itemtag');
        }
    } catch (error) {
        console.error('Error adding itemtag:', error);
        alert(`Error adding itemtag: ${error.message}`);
    }
}

async function bulkSetItemclass() {
    const select = document.getElementById('bulkItemclass');
    if (!select) return;
    
    const itemclassId = select.value ? parseInt(select.value) : null;
    
    if (selectedRows.size === 0) {
        alert('Please select at least one row');
        return;
    }
    
    try {
        for (const elementKey of selectedRows) {
            const response = await fetch(`/api/elements/${encodeURIComponent(elementKey)}/itemclass`, {
                method: itemclassId ? 'PUT' : 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    itemclass_id: itemclassId,
                    mission_dir: currentMissionDir
                })
            });
            
            const data = await response.json();
            if (!data.success) {
                console.error(`Failed to set itemclass for ${elementKey}`);
            }
        }
        
        selectedRows.clear();
        updateBulkSelectionInfo();
        await loadElements();
        saveSettings();
    } catch (error) {
        console.error('Error in bulk set itemclass:', error);
        alert(`Error setting itemclass: ${error.message}`);
    }
}

async function bulkSetItemtags() {
    const checkboxes = document.querySelectorAll('#bulkItemtagsCheckboxes input[type="checkbox"]');
    const selectedItemtagIds = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value));
    
    if (selectedRows.size === 0) {
        alert('Please select at least one row');
        return;
    }
    
    try {
        for (const elementKey of selectedRows) {
            const response = await fetch(`/api/elements/${encodeURIComponent(elementKey)}/itemtags`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    itemtag_ids: selectedItemtagIds,
                    mission_dir: currentMissionDir
                })
            });
            
            const data = await response.json();
            if (!data.success) {
                console.error(`Failed to set itemtags for ${elementKey}`);
            }
        }
        
        selectedRows.clear();
        updateBulkSelectionInfo();
        await loadElements();
        saveSettings();
    } catch (error) {
        console.error('Error in bulk set itemtags:', error);
        alert(`Error setting itemtags: ${error.message}`);
    }
}

function startFileWatcher() {
    // Placeholder - would start file watcher
    const statusEl = document.getElementById('fileWatcherStatus');
    if (statusEl) {
        statusEl.textContent = '📁 Watching files';
    }
}

function saveSettings() {
    // Save settings to localStorage
    try {
        const settings = {
            mission_dir: currentMissionDir,
            elementType: currentElementType,
            selectedColumns: Array.from(selectedColumns)
        };
        localStorage.setItem('xmlEditorSettings', JSON.stringify(settings));
    } catch (e) {
        console.error('Error saving settings:', e);
    }
}

