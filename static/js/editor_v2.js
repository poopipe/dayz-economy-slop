// Editor v2 JavaScript

let currentMissionDir = '';
let currentDbFilePath = ''; // Direct database file path
let tableData = [];
let tableColumns = [];
let sortColumn = null;
let sortDirection = 'asc'; // 'asc' or 'desc'
let columnVisibility = {}; // Map of column key -> boolean (visible)
let allAvailableColumns = []; // All columns that exist in the data
let availableValueflags = []; // List of all available valueflags
let availableUsageflags = []; // List of all available usageflags
let availableFlags = []; // List of all available flags
let availableCategories = []; // List of all available categories
let availableTags = []; // List of all available tags
let availableItemclasses = []; // List of all available itemclasses
let availableItemtags = []; // List of all available itemtags
let filters = {}; // Map of column key -> {values: [...], invert: boolean, op: '=', value: '...'} 
let selectedRows = new Set(); // Set of selected element keys for bulk operations
let filterPanelVisible = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateStatus('Ready');
    loadFilters();
    loadDbFilePath();
    setupEventListeners();
    loadMissionDir();
    
    // Auto-load database if path is remembered
    if (currentDbFilePath) {
        loadDatabase();
    } else {
        // Build filter panel if filters exist
        if (Object.keys(filters).length > 0) {
            showFilterPanel();
        }
    }
});

function setupEventListeners() {
    document.getElementById('loadDataBtn').addEventListener('click', loadXMLData);
    document.getElementById('exportBtn').addEventListener('click', exportToXML);
    document.getElementById('columnVisibilityBtn').addEventListener('click', openColumnVisibilityModal);
    document.getElementById('manageItemclassesBtn').addEventListener('click', openItemclassesModal);
    document.getElementById('manageItemtagsBtn').addEventListener('click', openItemtagsModal);
    document.getElementById('loadDatabaseBtn').addEventListener('click', loadDatabase);
    document.getElementById('backupDatabaseBtn').addEventListener('click', backupDatabase);
    
    const showFilterBtn = document.getElementById('showFilterPanelBtn');
    if (showFilterBtn) {
        showFilterBtn.addEventListener('click', showFilterPanel);
    } else {
        console.error('Show filter button not found');
    }
    
    const toggleFilterBtn = document.getElementById('toggleFilterPanelBtn');
    if (toggleFilterBtn) {
        toggleFilterBtn.addEventListener('click', toggleFilterPanel);
    }
    
    const clearFiltersBtn = document.getElementById('clearAllFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearAllFilters);
    }
    
    const dbFilePathInput = document.getElementById('dbFilePath');
    dbFilePathInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadDatabase();
        }
    });
    document.getElementById('addItemclassBtn').addEventListener('click', addItemclass);
    document.getElementById('addItemtagBtn').addEventListener('click', addItemtag);
    document.getElementById('closeItemclassesBtn').addEventListener('click', closeItemclassesModal);
    document.getElementById('closeItemtagsBtn').addEventListener('click', closeItemtagsModal);
    document.getElementById('applyColumnVisibilityBtn').addEventListener('click', applyColumnVisibility);
    document.getElementById('cancelColumnVisibilityBtn').addEventListener('click', closeColumnVisibilityModal);
    document.getElementById('showAllColumnsBtn').addEventListener('click', showAllColumns);
    document.getElementById('hideAllColumnsBtn').addEventListener('click', hideAllColumns);
    document.getElementById('saveValueflagsBtn').addEventListener('click', saveValueflags);
    document.getElementById('cancelValueflagsBtn').addEventListener('click', closeValueflagsModal);
    document.getElementById('saveUsageflagsBtn').addEventListener('click', saveUsageflags);
    document.getElementById('cancelUsageflagsBtn').addEventListener('click', closeUsageflagsModal);
    document.getElementById('saveFlagsBtn').addEventListener('click', saveFlags);
    document.getElementById('cancelFlagsBtn').addEventListener('click', closeFlagsModal);
    document.getElementById('saveCategoriesBtn').addEventListener('click', saveCategories);
    document.getElementById('cancelCategoriesBtn').addEventListener('click', closeCategoriesModal);
    document.getElementById('saveItemclassBtn').addEventListener('click', saveItemclass);
    document.getElementById('cancelItemclassBtn').addEventListener('click', closeItemclassEditorModal);
    document.getElementById('saveItemtagsBtn').addEventListener('click', saveItemtags);
    document.getElementById('cancelItemtagsBtn').addEventListener('click', closeItemtagsEditorModal);
    
    // Itemclasses/Itemtags management
    const itemclassesCloseBtn = document.querySelector('#itemclassesModal .close-modal');
    if (itemclassesCloseBtn) {
        itemclassesCloseBtn.addEventListener('click', closeItemclassesModal);
    }
    
    const itemtagsCloseBtn = document.querySelector('#itemtagsModal .close-modal');
    if (itemtagsCloseBtn) {
        itemtagsCloseBtn.addEventListener('click', closeItemtagsModal);
    }
    
    document.getElementById('itemclassesModal').addEventListener('click', (e) => {
        if (e.target.id === 'itemclassesModal') {
            closeItemclassesModal();
        }
    });
    
    document.getElementById('itemtagsModal').addEventListener('click', (e) => {
        if (e.target.id === 'itemtagsModal') {
            closeItemtagsModal();
        }
    });
    
    // Enter key handlers for adding items
    document.getElementById('newItemclassName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addItemclass();
        }
    });
    
    document.getElementById('newItemtagName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addItemtag();
        }
    });
    
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
    
    document.getElementById('valueflagsModal').addEventListener('click', (e) => {
        if (e.target.id === 'valueflagsModal') {
            closeValueflagsModal();
        }
    });
    
    // Close modal handlers
    const valueflagsCloseBtn = document.querySelector('#valueflagsModal .close-modal');
    if (valueflagsCloseBtn) {
        valueflagsCloseBtn.addEventListener('click', closeValueflagsModal);
    }
    
    const usageflagsCloseBtn = document.querySelector('#usageflagsModal .close-modal');
    if (usageflagsCloseBtn) {
        usageflagsCloseBtn.addEventListener('click', closeUsageflagsModal);
    }
    
    const flagsCloseBtn = document.querySelector('#flagsModal .close-modal');
    if (flagsCloseBtn) {
        flagsCloseBtn.addEventListener('click', closeFlagsModal);
    }
    
    const categoriesCloseBtn = document.querySelector('#categoriesModal .close-modal');
    if (categoriesCloseBtn) {
        categoriesCloseBtn.addEventListener('click', closeCategoriesModal);
    }
    
    const itemclassEditorCloseBtn = document.querySelector('#itemclassEditorModal .close-modal');
    if (itemclassEditorCloseBtn) {
        itemclassEditorCloseBtn.addEventListener('click', closeItemclassEditorModal);
    }
    
    const itemtagsEditorCloseBtn = document.querySelector('#itemtagsEditorModal .close-modal');
    if (itemtagsEditorCloseBtn) {
        itemtagsEditorCloseBtn.addEventListener('click', closeItemtagsEditorModal);
    }
    
    document.getElementById('usageflagsModal').addEventListener('click', (e) => {
        if (e.target.id === 'usageflagsModal') {
            closeUsageflagsModal();
        }
    });
    
    document.getElementById('flagsModal').addEventListener('click', (e) => {
        if (e.target.id === 'flagsModal') {
            closeFlagsModal();
        }
    });
    
    document.getElementById('categoriesModal').addEventListener('click', (e) => {
        if (e.target.id === 'categoriesModal') {
            closeCategoriesModal();
        }
    });
    
    document.getElementById('itemclassEditorModal').addEventListener('click', (e) => {
        if (e.target.id === 'itemclassEditorModal') {
            closeItemclassEditorModal();
        }
    });
    
    document.getElementById('itemtagsEditorModal').addEventListener('click', (e) => {
        if (e.target.id === 'itemtagsEditorModal') {
            closeItemtagsEditorModal();
        }
    });
    
    // Filter event listeners - use event delegation for dynamically created filters
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('filter-select') || e.target.classList.contains('filter-input') || e.target.classList.contains('filter-op')) {
            handleFilterChange(e.target);
        }
    });
    
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('filter-input') && !e.target.classList.contains('numeric-filter-input')) {
            // Debounce text input filters
            clearTimeout(e.target.filterTimeout);
            e.target.filterTimeout = setTimeout(() => {
                handleFilterChange(e.target);
            }, 300);
        }
    });
}

function handleFilterChange(element) {
    const columnKey = element.getAttribute('data-column');
    if (!columnKey) return;
    
    const columnType = getColumnType(columnKey);
    
    if (element.classList.contains('filter-select')) {
        // Multi-select dropdown
        const selectedOptions = Array.from(element.selectedOptions)
            .map(opt => opt.value)
            .filter(val => val !== ''); // Remove "All" option
        
        if (selectedOptions.length === 0) {
            delete filters[columnKey];
        } else {
            filters[columnKey] = selectedOptions.map(id => parseInt(id));
        }
    } else if (element.classList.contains('filter-op')) {
        // Numeric filter operator changed
        const input = element.parentElement.querySelector('.numeric-filter-input');
        const currentFilter = filters[columnKey] || {};
        filters[columnKey] = {
            op: element.value,
            value: input ? input.value : (currentFilter.value || '')
        };
        if (!filters[columnKey].value) {
            delete filters[columnKey];
        }
    } else if (element.classList.contains('numeric-filter-input')) {
        // Numeric filter value changed
        const opSelect = element.parentElement.querySelector('.filter-op');
        const op = opSelect ? opSelect.value : '=';
        const value = element.value;
        
        if (value === '') {
            delete filters[columnKey];
        } else {
            filters[columnKey] = {
                op: op,
                value: value
            };
        }
    } else {
        // Text filter
        const value = element.value.trim();
        if (value === '') {
            delete filters[columnKey];
        } else {
            filters[columnKey] = value;
        }
    }
    
    // Save filters to localStorage
    saveFilters();
    
    // Reset selection when filters change
    selectedRows.clear();
    
    // Refresh display
    displayTable();
}

function saveFilters() {
    try {
        localStorage.setItem('editorV2Filters', JSON.stringify(filters));
    } catch (e) {
        console.error('Error saving filters:', e);
    }
}

function loadFilters() {
    try {
        const saved = localStorage.getItem('editorV2Filters');
        if (saved) {
            const loaded = JSON.parse(saved);
            // Migrate old filter format to new format if needed
            filters = {};
            for (const [key, value] of Object.entries(loaded)) {
                if (typeof value === 'object' && !Array.isArray(value) && (value.invert !== undefined || value.values !== undefined || value.value !== undefined)) {
                    // Already in new format
                    filters[key] = value;
                } else if (Array.isArray(value)) {
                    // Old array format - convert to new format
                    filters[key] = { values: value, invert: false };
                } else {
                    // Old string/number format - convert to new format
                    filters[key] = { value: value, invert: false };
                }
            }
        }
    } catch (e) {
        console.error('Error loading filters:', e);
        filters = {};
    }
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

function loadDbFilePath() {
    const saved = localStorage.getItem('editorV2DbFilePath');
    if (saved) {
        currentDbFilePath = saved;
        document.getElementById('dbFilePath').value = saved;
    }
}

function saveDbFilePath() {
    if (currentDbFilePath) {
        localStorage.setItem('editorV2DbFilePath', currentDbFilePath);
    } else {
        localStorage.removeItem('editorV2DbFilePath');
    }
}

async function loadDatabase() {
    const dbFilePathInput = document.getElementById('dbFilePath');
    const dbFilePath = dbFilePathInput.value.trim();
    
    if (!dbFilePath) {
        alert('Please enter a database file path');
        return;
    }
    
    try {
        updateStatus('Loading database...');
        
        const response = await fetch('/api/load-database', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                db_file_path: dbFilePath
            })
        });
        
        const data = await response.json();
        if (data.success) {
            currentDbFilePath = dbFilePath;
            saveDbFilePath();
            
            // Load elements and reference data
            await loadReferenceData();
            await loadElements();
            
            updateStatus('Database loaded successfully');
        } else {
            throw new Error(data.error || 'Failed to load database');
        }
    } catch (error) {
        console.error('Error loading database:', error);
        alert(`Error loading database: ${error.message}`);
        updateStatus('Failed to load database');
    }
}

async function backupDatabase() {
    if (!currentDbFilePath) {
        alert('Please load a database first');
        return;
    }
    
    try {
        updateStatus('Creating backup...');
        
        const response = await fetch('/api/backup-database', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                db_file_path: currentDbFilePath
            })
        });
        
        const data = await response.json();
        if (data.success) {
            updateStatus(`Backup created: ${data.backup_path}`);
            alert(`Backup created successfully!\n\nLocation: ${data.backup_path}`);
        } else {
            throw new Error(data.error || 'Failed to create backup');
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        alert(`Error creating backup: ${error.message}`);
        updateStatus('Failed to create backup');
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
            loadReferenceData();
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

async function loadReferenceData() {
    try {
        let url;
        if (currentDbFilePath) {
            url = `/api/reference-data?db_file_path=${encodeURIComponent(currentDbFilePath)}`;
        } else {
            url = `/api/reference-data?mission_dir=${encodeURIComponent(currentMissionDir || '')}`;
        }
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            availableValueflags = data.valueflags || [];
            availableUsageflags = data.usageflags || [];
            availableFlags = data.flags || [];
            availableCategories = data.categories || [];
            availableTags = data.tags || [];
            availableItemclasses = data.itemclasses || [];
            availableItemtags = data.itemtags || [];
        }
    } catch (error) {
        console.error('Error loading reference data:', error);
    }
}

async function loadElements() {
    try {
        let url;
        if (currentDbFilePath) {
            url = `/api/elements?db_file_path=${encodeURIComponent(currentDbFilePath)}`;
        } else {
            url = `/api/elements?mission_dir=${encodeURIComponent(currentMissionDir || '')}`;
        }
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
            // Build filter panel after data is loaded
            if (filterPanelVisible) {
                buildFilterPanel();
            }
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
    
    // Apply filters
    let filteredData = applyFilters(tableData);
    
    // Sort data if a sort column is selected
    let dataToDisplay = filteredData;
    if (sortColumn) {
        dataToDisplay = sortData(filteredData, sortColumn, sortDirection);
    }
    
    // Build table
    let html = '<table class="data-table"><thead><tr>';
    
    // Add checkbox column header
    const allSelected = dataToDisplay.length > 0 && dataToDisplay.every(r => selectedRows.has(r._element_key));
    html += `<th class="checkbox-header"><input type="checkbox" id="selectAllCheckbox" ${allSelected ? 'checked' : ''}></th>`;
    
    displayColumns.forEach(col => {
        const isSorted = sortColumn === col.key;
        const sortIndicator = isSorted 
            ? (sortDirection === 'asc' ? ' <span class="sort-indicator">▲</span>' : ' <span class="sort-indicator">▼</span>')
            : ' <span class="sort-indicator sort-inactive">⇅</span>';
        
        const isEditable = ['nominal', 'lifetime', 'restock', 'min'].includes(col.key);
        const isValueflags = col.key === '_valueflag_names' || col.key === '_valueflags';
        const isUsageflags = col.key === '_usageflag_names' || col.key === '_usageflags';
        const isFlags = col.key === '_flag_names' || col.key === '_flags';
        const isCategories = col.key === '_category_names' || col.key === '_categories';
        const isItemclass = col.key === '_itemclass_name' || col.key === '_itemclass_id';
        const isItemtags = col.key === '_itemtag_names' || col.key === '_itemtags';
        const editableClass = (isEditable || isValueflags || isUsageflags || isFlags || isCategories || isItemclass || isItemtags) ? ' editable-column-header' : '';
        
        html += `<th class="sortable${editableClass}" data-column="${col.key}">${escapeHtml(col.label)}${sortIndicator}</th>`;
    });
    
    html += '</tr></thead><tbody>';
    
    dataToDisplay.forEach((record, rowIndex) => {
        const elementKey = record._element_key || '';
        const isSelected = selectedRows.has(elementKey);
        html += `<tr ${isSelected ? 'class="selected-row"' : ''}>`;
        
        // Add checkbox cell
        html += `<td class="checkbox-cell"><input type="checkbox" class="row-checkbox" data-element-key="${escapeHtml(elementKey)}" ${isSelected ? 'checked' : ''}></td>`;
        
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
            const isValueflags = col.key === '_valueflag_names' || col.key === '_valueflags';
            const isUsageflags = col.key === '_usageflag_names' || col.key === '_usageflags';
            const isFlags = col.key === '_flag_names' || col.key === '_flags';
            const isCategories = col.key === '_category_names' || col.key === '_categories';
            const isItemclass = col.key === '_itemclass_name' || col.key === '_itemclass_id';
            const isItemtags = col.key === '_itemtag_names' || col.key === '_itemtags';
            
            if (isEditable) {
                html += `<td class="editable-cell" data-element-key="${escapeHtml(record._element_key || '')}" data-field-name="${escapeHtml(col.key)}" data-row-index="${rowIndex}">${escapeHtml(displayValue)}</td>`;
            } else if (isValueflags) {
                html += `<td class="editable-cell valueflags-cell" data-element-key="${escapeHtml(record._element_key || '')}" data-field-name="valueflags">${escapeHtml(displayValue)}</td>`;
            } else if (isUsageflags) {
                html += `<td class="editable-cell usageflags-cell" data-element-key="${escapeHtml(record._element_key || '')}" data-field-name="usageflags">${escapeHtml(displayValue)}</td>`;
            } else if (isFlags) {
                html += `<td class="editable-cell flags-cell" data-element-key="${escapeHtml(record._element_key || '')}" data-field-name="flags">${escapeHtml(displayValue)}</td>`;
            } else if (isCategories) {
                html += `<td class="editable-cell categories-cell" data-element-key="${escapeHtml(record._element_key || '')}" data-field-name="categories">${escapeHtml(displayValue)}</td>`;
            } else if (isItemclass) {
                html += `<td class="editable-cell itemclass-cell" data-element-key="${escapeHtml(record._element_key || '')}" data-field-name="itemclass">${escapeHtml(displayValue)}</td>`;
            } else if (isItemtags) {
                html += `<td class="editable-cell itemtags-cell" data-element-key="${escapeHtml(record._element_key || '')}" data-field-name="itemtags">${escapeHtml(displayValue)}</td>`;
            } else {
                html += `<td>${escapeHtml(displayValue)}</td>`;
            }
        });
        
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    // Add select-all checkbox handler
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const checked = e.target.checked;
            dataToDisplay.forEach(record => {
                const elementKey = record._element_key;
                if (elementKey) {
                    if (checked) {
                        selectedRows.add(elementKey);
                    } else {
                        selectedRows.delete(elementKey);
                    }
                }
            });
            // Update individual checkboxes
            container.querySelectorAll('.row-checkbox').forEach(cb => {
                cb.checked = checked;
            });
            // Update row highlighting
            container.querySelectorAll('tbody tr').forEach(row => {
                const checkbox = row.querySelector('.row-checkbox');
                if (checkbox) {
                    if (checked) {
                        row.classList.add('selected-row');
                    } else {
                        row.classList.remove('selected-row');
                    }
                }
            });
        });
    }
    
    // Add row checkbox handlers
    container.querySelectorAll('.row-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const elementKey = e.target.getAttribute('data-element-key');
            if (elementKey) {
                if (e.target.checked) {
                    selectedRows.add(elementKey);
                    e.target.closest('tr').classList.add('selected-row');
                } else {
                    selectedRows.delete(elementKey);
                    e.target.closest('tr').classList.remove('selected-row');
                }
                // Update select-all checkbox
                updateSelectAllCheckbox(container, dataToDisplay);
            }
        });
    });
    
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
            if (cell.classList.contains('valueflags-cell')) {
                openValueflagsEditor(cell);
            } else if (cell.classList.contains('usageflags-cell')) {
                openUsageflagsEditor(cell);
            } else if (cell.classList.contains('flags-cell')) {
                openFlagsEditor(cell);
            } else if (cell.classList.contains('categories-cell')) {
                openCategoriesEditor(cell);
            } else if (cell.classList.contains('itemclass-cell')) {
                openItemclassEditor(cell);
            } else if (cell.classList.contains('itemtags-cell')) {
                openItemtagsEditor(cell);
            } else {
                makeCellEditable(cell);
            }
        });
        cell.style.cursor = 'pointer';
        cell.title = 'Double-click to edit';
    });
    
    const sortedColumn = displayColumns.find(c => c.key === sortColumn);
    const filterCount = Object.keys(filters).filter(k => filters[k] !== null && filters[k] !== '' && (!Array.isArray(filters[k]) || filters[k].length > 0)).length;
    const filterText = filterCount > 0 ? ` (${filterCount} filter${filterCount > 1 ? 's' : ''} active)` : '';
    const selectedCount = selectedRows.size;
    const selectedText = selectedCount > 0 ? ` - ${selectedCount} selected` : '';
    updateStatus(`Displaying ${dataToDisplay.length} of ${tableData.length} elements${filterText}${sortColumn && sortedColumn ? ` (sorted by ${sortedColumn.label} ${sortDirection})` : ''} - ${displayColumns.length} of ${allAvailableColumns.length} columns${selectedText}`);
}

function updateSelectAllCheckbox(container, dataToDisplay) {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox && dataToDisplay.length > 0) {
        const allSelected = dataToDisplay.every(r => selectedRows.has(r._element_key));
        selectAllCheckbox.checked = allSelected;
    }
}

function getSelectedElementKeys() {
    // Get currently visible/filtered element keys that are selected
    let filteredData = applyFilters(tableData);
    if (sortColumn) {
        filteredData = sortData(filteredData, sortColumn, sortDirection);
    }
    return filteredData.filter(r => selectedRows.has(r._element_key)).map(r => r._element_key);
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

let currentValueflagsElementKey = null;

function openValueflagsEditor(cell) {
    const elementKey = cell.getAttribute('data-element-key');
    if (!elementKey) {
        alert('Element key not found');
        return;
    }
    
    // Check if we should do bulk edit
    const selectedKeys = getSelectedElementKeys();
    const isBulkEdit = selectedKeys.length > 0 && selectedKeys.includes(elementKey);
    
    if (isBulkEdit) {
        currentValueflagsElementKey = selectedKeys; // Store array for bulk edit
    } else {
        currentValueflagsElementKey = elementKey;
    }
    
    // Get current valueflags - for bulk edit, show intersection of all selected
    let currentValueflagIds = [];
    if (isBulkEdit) {
        // Find common valueflags across all selected elements
        const allValueflagIds = selectedKeys.map(key => {
            const record = tableData.find(r => r._element_key === key);
            return record?._valueflags?.map(v => v.id) || [];
        });
        if (allValueflagIds.length > 0) {
            // Start with first element's valueflags
            currentValueflagIds = allValueflagIds[0];
            // Keep only those present in all elements
            for (let i = 1; i < allValueflagIds.length; i++) {
                currentValueflagIds = currentValueflagIds.filter(id => allValueflagIds[i].includes(id));
            }
        }
    } else {
        const record = tableData.find(r => r._element_key === elementKey);
        currentValueflagIds = record?._valueflags?.map(v => v.id) || [];
    }
    
    const modal = document.getElementById('valueflagsModal');
    const checkboxesContainer = document.getElementById('valueflagsCheckboxes');
    const modalTitle = modal.querySelector('h2');
    if (modalTitle) {
        modalTitle.textContent = isBulkEdit ? `Edit Valueflags (${selectedKeys.length} selected)` : 'Edit Valueflags';
    }
    
    if (availableValueflags.length === 0) {
        alert('No valueflags available. Please load data first.');
        return;
    }
    
    checkboxesContainer.innerHTML = '';
    
    availableValueflags.forEach(valueflag => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'valueflag-checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `valueflag_${valueflag.id}`;
        checkbox.value = valueflag.id;
        checkbox.checked = currentValueflagIds.includes(valueflag.id);
        
        const label = document.createElement('label');
        label.htmlFor = `valueflag_${valueflag.id}`;
        label.textContent = valueflag.name;
        
        checkboxDiv.appendChild(checkbox);
        checkboxDiv.appendChild(label);
        checkboxesContainer.appendChild(checkboxDiv);
    });
    
    modal.style.display = 'block';
}

function closeValueflagsModal() {
    document.getElementById('valueflagsModal').style.display = 'none';
    currentValueflagsElementKey = null;
}

async function saveValueflags() {
    if (!currentValueflagsElementKey) return;
    
    const checkboxes = document.querySelectorAll('#valueflagsCheckboxes input[type="checkbox"]:checked');
    const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    // Check if bulk edit
    const isBulkEdit = Array.isArray(currentValueflagsElementKey);
    const elementKeys = isBulkEdit ? currentValueflagsElementKey : [currentValueflagsElementKey];
    
    try {
        // Apply to all selected elements
        const promises = elementKeys.map(elementKey => 
            fetch(`/api/elements/${encodeURIComponent(elementKey)}/valueflags`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    valueflag_ids: selectedIds,
                    mission_dir: currentMissionDir || '',
                    db_file_path: currentDbFilePath || ''
                })
            })
        );
        
        const responses = await Promise.all(promises);
        const results = await Promise.all(responses.map(r => r.json()));
        
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            throw new Error(failed[0].error || 'Failed to update some valueflags');
        }
        
        closeValueflagsModal();
        
        // Reload elements to get updated data
        await loadElements();
        
        updateStatus(`Valueflags updated successfully${isBulkEdit ? ` (${elementKeys.length} elements)` : ''}`);
    } catch (error) {
        console.error('Error updating valueflags:', error);
        alert(`Error updating valueflags: ${error.message}`);
    }
}

let currentUsageflagsElementKey = null;

function openUsageflagsEditor(cell) {
    const elementKey = cell.getAttribute('data-element-key');
    if (!elementKey) {
        alert('Element key not found');
        return;
    }
    
    // Check if we should do bulk edit
    const selectedKeys = getSelectedElementKeys();
    const isBulkEdit = selectedKeys.length > 0 && selectedKeys.includes(elementKey);
    
    if (isBulkEdit) {
        currentUsageflagsElementKey = selectedKeys; // Store array for bulk edit
    } else {
        currentUsageflagsElementKey = elementKey;
    }
    
    // Get current usageflags - for bulk edit, show intersection of all selected
    let currentUsageflagIds = [];
    if (isBulkEdit) {
        const allUsageflagIds = selectedKeys.map(key => {
            const record = tableData.find(r => r._element_key === key);
            return record?._usageflags?.map(u => u.id) || [];
        });
        if (allUsageflagIds.length > 0) {
            currentUsageflagIds = allUsageflagIds[0];
            for (let i = 1; i < allUsageflagIds.length; i++) {
                currentUsageflagIds = currentUsageflagIds.filter(id => allUsageflagIds[i].includes(id));
            }
        }
    } else {
        const record = tableData.find(r => r._element_key === elementKey);
        currentUsageflagIds = record?._usageflags?.map(u => u.id) || [];
    }
    
    const modal = document.getElementById('usageflagsModal');
    const checkboxesContainer = document.getElementById('usageflagsCheckboxes');
    const modalTitle = modal.querySelector('h2');
    if (modalTitle) {
        modalTitle.textContent = isBulkEdit ? `Edit Usageflags (${selectedKeys.length} selected)` : 'Edit Usageflags';
    }
    
    if (availableUsageflags.length === 0) {
        alert('No usageflags available. Please load data first.');
        return;
    }
    
    checkboxesContainer.innerHTML = '';
    
    availableUsageflags.forEach(usageflag => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'usageflag-checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `usageflag_${usageflag.id}`;
        checkbox.value = usageflag.id;
        checkbox.checked = currentUsageflagIds.includes(usageflag.id);
        
        const label = document.createElement('label');
        label.htmlFor = `usageflag_${usageflag.id}`;
        label.textContent = usageflag.name;
        
        checkboxDiv.appendChild(checkbox);
        checkboxDiv.appendChild(label);
        checkboxesContainer.appendChild(checkboxDiv);
    });
    
    modal.style.display = 'block';
}

function closeUsageflagsModal() {
    document.getElementById('usageflagsModal').style.display = 'none';
    currentUsageflagsElementKey = null;
}

async function saveUsageflags() {
    if (!currentUsageflagsElementKey) return;
    
    const checkboxes = document.querySelectorAll('#usageflagsCheckboxes input[type="checkbox"]:checked');
    const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    // Check if bulk edit
    const isBulkEdit = Array.isArray(currentUsageflagsElementKey);
    const elementKeys = isBulkEdit ? currentUsageflagsElementKey : [currentUsageflagsElementKey];
    
    try {
        // Apply to all selected elements
        const promises = elementKeys.map(elementKey => 
            fetch(`/api/elements/${encodeURIComponent(elementKey)}/usageflags`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    usageflag_ids: selectedIds,
                    mission_dir: currentMissionDir || '',
                    db_file_path: currentDbFilePath || ''
                })
            })
        );
        
        const responses = await Promise.all(promises);
        const results = await Promise.all(responses.map(r => r.json()));
        
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            throw new Error(failed[0].error || 'Failed to update some usageflags');
        }
        
        closeUsageflagsModal();
        
        // Reload elements to get updated data
        await loadElements();
        
        updateStatus(`Usageflags updated successfully${isBulkEdit ? ` (${elementKeys.length} elements)` : ''}`);
    } catch (error) {
        console.error('Error updating usageflags:', error);
        alert(`Error updating usageflags: ${error.message}`);
    }
}

let currentFlagsElementKey = null;

function openFlagsEditor(cell) {
    const elementKey = cell.getAttribute('data-element-key');
    if (!elementKey) {
        alert('Element key not found');
        return;
    }
    
    // Check if we should do bulk edit
    const selectedKeys = getSelectedElementKeys();
    const isBulkEdit = selectedKeys.length > 0 && selectedKeys.includes(elementKey);
    
    if (isBulkEdit) {
        currentFlagsElementKey = selectedKeys; // Store array for bulk edit
    } else {
        currentFlagsElementKey = elementKey;
    }
    
    // Get current flags - for bulk edit, show intersection of all selected
    let currentFlagIds = [];
    if (isBulkEdit) {
        const allFlagIds = selectedKeys.map(key => {
            const record = tableData.find(r => r._element_key === key);
            return record?._flags?.map(f => f.id) || [];
        });
        if (allFlagIds.length > 0) {
            currentFlagIds = allFlagIds[0];
            for (let i = 1; i < allFlagIds.length; i++) {
                currentFlagIds = currentFlagIds.filter(id => allFlagIds[i].includes(id));
            }
        }
    } else {
        const record = tableData.find(r => r._element_key === elementKey);
        currentFlagIds = record?._flags?.map(f => f.id) || [];
    }
    
    const modal = document.getElementById('flagsModal');
    const checkboxesContainer = document.getElementById('flagsCheckboxes');
    
    if (availableFlags.length === 0) {
        alert('No flags available. Please load data first.');
        return;
    }
    
    checkboxesContainer.innerHTML = '';
    
    availableFlags.forEach(flag => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'flag-checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `flag_${flag.id}`;
        checkbox.value = flag.id;
        checkbox.checked = currentFlagIds.includes(flag.id);
        
        const label = document.createElement('label');
        label.htmlFor = `flag_${flag.id}`;
        label.textContent = flag.name;
        
        checkboxDiv.appendChild(checkbox);
        checkboxDiv.appendChild(label);
        checkboxesContainer.appendChild(checkboxDiv);
    });
    
    modal.style.display = 'block';
}

function closeFlagsModal() {
    document.getElementById('flagsModal').style.display = 'none';
    currentFlagsElementKey = null;
}

async function saveFlags() {
    if (!currentFlagsElementKey) return;
    
    const checkboxes = document.querySelectorAll('#flagsCheckboxes input[type="checkbox"]:checked');
    const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    // Check if bulk edit
    const isBulkEdit = Array.isArray(currentFlagsElementKey);
    const elementKeys = isBulkEdit ? currentFlagsElementKey : [currentFlagsElementKey];
    
    try {
        // Apply to all selected elements
        const promises = elementKeys.map(elementKey => 
            fetch(`/api/elements/${encodeURIComponent(elementKey)}/flags`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    flag_ids: selectedIds,
                    mission_dir: currentMissionDir || '',
                    db_file_path: currentDbFilePath || ''
                })
            })
        );
        
        const responses = await Promise.all(promises);
        const results = await Promise.all(responses.map(r => r.json()));
        
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            throw new Error(failed[0].error || 'Failed to update some flags');
        }
        
        closeFlagsModal();
        
        // Reload elements to get updated data
        await loadElements();
        
        updateStatus(`Flags updated successfully${isBulkEdit ? ` (${elementKeys.length} elements)` : ''}`);
    } catch (error) {
        console.error('Error updating flags:', error);
        alert(`Error updating flags: ${error.message}`);
    }
}

let currentCategoriesElementKey = null;

function openCategoriesEditor(cell) {
    const elementKey = cell.getAttribute('data-element-key');
    if (!elementKey) {
        alert('Element key not found');
        return;
    }
    
    // Check if we should do bulk edit
    const selectedKeys = getSelectedElementKeys();
    const isBulkEdit = selectedKeys.length > 0 && selectedKeys.includes(elementKey);
    
    if (isBulkEdit) {
        currentCategoriesElementKey = selectedKeys; // Store array for bulk edit
    } else {
        currentCategoriesElementKey = elementKey;
    }
    
    // Get current categories - for bulk edit, show intersection of all selected
    let currentCategoryIds = [];
    if (isBulkEdit) {
        const allCategoryIds = selectedKeys.map(key => {
            const record = tableData.find(r => r._element_key === key);
            return record?._categories?.map(c => c.id) || [];
        });
        if (allCategoryIds.length > 0) {
            currentCategoryIds = allCategoryIds[0];
            for (let i = 1; i < allCategoryIds.length; i++) {
                currentCategoryIds = currentCategoryIds.filter(id => allCategoryIds[i].includes(id));
            }
        }
    } else {
        const record = tableData.find(r => r._element_key === elementKey);
        currentCategoryIds = record?._categories?.map(c => c.id) || [];
    }
    
    const modal = document.getElementById('categoriesModal');
    const checkboxesContainer = document.getElementById('categoriesCheckboxes');
    const modalTitle = modal.querySelector('h2');
    if (modalTitle) {
        modalTitle.textContent = isBulkEdit ? `Edit Categories (${selectedKeys.length} selected)` : 'Edit Categories';
    }
    
    if (availableCategories.length === 0) {
        alert('No categories available. Please load data first.');
        return;
    }
    
    checkboxesContainer.innerHTML = '';
    
    availableCategories.forEach(category => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'category-checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `category_${category.id}`;
        checkbox.value = category.id;
        checkbox.checked = currentCategoryIds.includes(category.id);
        
        const label = document.createElement('label');
        label.htmlFor = `category_${category.id}`;
        label.textContent = category.name;
        
        checkboxDiv.appendChild(checkbox);
        checkboxDiv.appendChild(label);
        checkboxesContainer.appendChild(checkboxDiv);
    });
    
    modal.style.display = 'block';
}

function closeCategoriesModal() {
    document.getElementById('categoriesModal').style.display = 'none';
    currentCategoriesElementKey = null;
}

async function saveCategories() {
    if (!currentCategoriesElementKey) return;
    
    const checkboxes = document.querySelectorAll('#categoriesCheckboxes input[type="checkbox"]:checked');
    const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    // Check if bulk edit
    const isBulkEdit = Array.isArray(currentCategoriesElementKey);
    const elementKeys = isBulkEdit ? currentCategoriesElementKey : [currentCategoriesElementKey];
    
    try {
        // Apply to all selected elements
        const promises = elementKeys.map(elementKey => 
            fetch(`/api/elements/${encodeURIComponent(elementKey)}/categories`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    category_ids: selectedIds,
                    mission_dir: currentMissionDir || '',
                    db_file_path: currentDbFilePath || ''
                })
            })
        );
        
        const responses = await Promise.all(promises);
        const results = await Promise.all(responses.map(r => r.json()));
        
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            throw new Error(failed[0].error || 'Failed to update some categories');
        }
        
        closeCategoriesModal();
        
        // Reload elements to get updated data
        await loadElements();
        
        updateStatus(`Categories updated successfully${isBulkEdit ? ` (${elementKeys.length} elements)` : ''}`);
    } catch (error) {
        console.error('Error updating categories:', error);
        alert(`Error updating categories: ${error.message}`);
    }
}

let currentItemclassElementKey = null;

function openItemclassEditor(cell) {
    const elementKey = cell.getAttribute('data-element-key');
    if (!elementKey) {
        alert('Element key not found');
        return;
    }
    
    // Check if we should do bulk edit
    const selectedKeys = getSelectedElementKeys();
    const isBulkEdit = selectedKeys.length > 0 && selectedKeys.includes(elementKey);
    
    if (isBulkEdit) {
        currentItemclassElementKey = selectedKeys; // Store array for bulk edit
    } else {
        currentItemclassElementKey = elementKey;
    }
    
    // Get current itemclass - for bulk edit, show common itemclass if all have the same
    let currentItemclassId = null;
    if (isBulkEdit) {
        const allItemclassIds = selectedKeys.map(key => {
            const record = tableData.find(r => r._element_key === key);
            return record?._itemclass_id || null;
        });
        // Check if all have the same itemclass
        const firstId = allItemclassIds[0];
        if (allItemclassIds.every(id => id === firstId)) {
            currentItemclassId = firstId;
        }
    } else {
        const record = tableData.find(r => r._element_key === elementKey);
        currentItemclassId = record?._itemclass_id || null;
    }
    
    const modal = document.getElementById('itemclassEditorModal');
    const select = document.getElementById('itemclassSelect');
    const modalTitle = modal.querySelector('h2');
    if (modalTitle) {
        modalTitle.textContent = isBulkEdit ? `Edit Itemclass (${selectedKeys.length} selected)` : 'Edit Itemclass';
    }
    
    if (availableItemclasses.length === 0) {
        alert('No itemclasses available. Please add itemclasses first.');
        return;
    }
    
    select.innerHTML = '<option value="">-- None --</option>';
    availableItemclasses.forEach(itemclass => {
        const option = document.createElement('option');
        option.value = itemclass.id;
        option.textContent = itemclass.name;
        if (itemclass.id === currentItemclassId) {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
    modal.style.display = 'block';
}

function closeItemclassEditorModal() {
    document.getElementById('itemclassEditorModal').style.display = 'none';
    currentItemclassElementKey = null;
}

async function saveItemclass() {
    if (!currentItemclassElementKey) return;
    
    const select = document.getElementById('itemclassSelect');
    const itemclassId = select.value ? parseInt(select.value) : null;
    
    // Check if bulk edit
    const isBulkEdit = Array.isArray(currentItemclassElementKey);
    const elementKeys = isBulkEdit ? currentItemclassElementKey : [currentItemclassElementKey];
    
    try {
        // Apply to all selected elements
        const promises = elementKeys.map(elementKey => 
            fetch(`/api/elements/${encodeURIComponent(elementKey)}/itemclass`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    itemclass_id: itemclassId,
                    mission_dir: currentMissionDir || '',
                    db_file_path: currentDbFilePath || ''
                })
            })
        );
        
        const responses = await Promise.all(promises);
        const results = await Promise.all(responses.map(r => r.json()));
        
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            throw new Error(failed[0].error || 'Failed to update some itemclasses');
        }
        
        closeItemclassEditorModal();
        
        // Reload elements to get updated data
        await loadElements();
        
        updateStatus(`Itemclass updated successfully${isBulkEdit ? ` (${elementKeys.length} elements)` : ''}`);
    } catch (error) {
        console.error('Error updating itemclass:', error);
        alert(`Error updating itemclass: ${error.message}`);
    }
}

let currentItemtagsElementKey = null;

function openItemtagsEditor(cell) {
    const elementKey = cell.getAttribute('data-element-key');
    if (!elementKey) {
        alert('Element key not found');
        return;
    }
    
    // Check if we should do bulk edit
    const selectedKeys = getSelectedElementKeys();
    const isBulkEdit = selectedKeys.length > 0 && selectedKeys.includes(elementKey);
    
    if (isBulkEdit) {
        currentItemtagsElementKey = selectedKeys; // Store array for bulk edit
    } else {
        currentItemtagsElementKey = elementKey;
    }
    
    // Get current itemtags - for bulk edit, show intersection of all selected
    let currentItemtagIds = [];
    if (isBulkEdit) {
        const allItemtagIds = selectedKeys.map(key => {
            const record = tableData.find(r => r._element_key === key);
            return record?._itemtags?.map(it => it.id) || [];
        });
        if (allItemtagIds.length > 0) {
            currentItemtagIds = allItemtagIds[0];
            for (let i = 1; i < allItemtagIds.length; i++) {
                currentItemtagIds = currentItemtagIds.filter(id => allItemtagIds[i].includes(id));
            }
        }
    } else {
        const record = tableData.find(r => r._element_key === elementKey);
        currentItemtagIds = record?._itemtags?.map(it => it.id) || [];
    }
    
    const modal = document.getElementById('itemtagsEditorModal');
    const checkboxesContainer = document.getElementById('itemtagsEditorCheckboxes');
    const modalTitle = modal.querySelector('h2');
    if (modalTitle) {
        modalTitle.textContent = isBulkEdit ? `Edit Itemtags (${selectedKeys.length} selected)` : 'Edit Itemtags';
    }
    
    if (availableItemtags.length === 0) {
        alert('No itemtags available. Please add itemtags first.');
        return;
    }
    
    checkboxesContainer.innerHTML = '';
    
    availableItemtags.forEach(itemtag => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'itemtag-checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `itemtag_editor_${itemtag.id}`;
        checkbox.value = itemtag.id;
        checkbox.checked = currentItemtagIds.includes(itemtag.id);
        
        const label = document.createElement('label');
        label.htmlFor = `itemtag_editor_${itemtag.id}`;
        label.textContent = itemtag.name;
        
        checkboxDiv.appendChild(checkbox);
        checkboxDiv.appendChild(label);
        checkboxesContainer.appendChild(checkboxDiv);
    });
    
    modal.style.display = 'block';
}

function closeItemtagsEditorModal() {
    document.getElementById('itemtagsEditorModal').style.display = 'none';
    currentItemtagsElementKey = null;
}

async function saveItemtags() {
    if (!currentItemtagsElementKey) return;
    
    const checkboxes = document.querySelectorAll('#itemtagsEditorCheckboxes input[type="checkbox"]:checked');
    const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    // Check if bulk edit
    const isBulkEdit = Array.isArray(currentItemtagsElementKey);
    const elementKeys = isBulkEdit ? currentItemtagsElementKey : [currentItemtagsElementKey];
    
    try {
        // Apply to all selected elements
        const promises = elementKeys.map(elementKey => 
            fetch(`/api/elements/${encodeURIComponent(elementKey)}/itemtags`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    itemtag_ids: selectedIds,
                    mission_dir: currentMissionDir || '',
                    db_file_path: currentDbFilePath || ''
                })
            })
        );
        
        const responses = await Promise.all(promises);
        const results = await Promise.all(responses.map(r => r.json()));
        
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            throw new Error(failed[0].error || 'Failed to update some itemtags');
        }
        
        closeItemtagsEditorModal();
        
        // Reload elements to get updated data
        await loadElements();
        
        updateStatus(`Itemtags updated successfully${isBulkEdit ? ` (${elementKeys.length} elements)` : ''}`);
    } catch (error) {
        console.error('Error updating itemtags:', error);
        alert(`Error updating itemtags: ${error.message}`);
    }
}

function getColumnType(columnKey) {
    // Check for fixed list columns
    if (columnKey === '_valueflag_names' || columnKey === '_valueflags') {
        return 'valueflags';
    }
    if (columnKey === '_usageflag_names' || columnKey === '_usageflags') {
        return 'usageflags';
    }
    if (columnKey === '_flag_names' || columnKey === '_flags') {
        return 'flags';
    }
    if (columnKey === '_category_names' || columnKey === '_categories') {
        return 'categories';
    }
    if (columnKey === '_tag_names' || columnKey === '_tags') {
        return 'tags';
    }
    if (columnKey === '_itemclass_name' || columnKey === '_itemclass_id') {
        return 'itemclasses';
    }
    if (columnKey === '_itemtag_names' || columnKey === '_itemtags') {
        return 'itemtags';
    }
    
    // Check for numeric columns
    const numericColumns = ['nominal', 'lifetime', 'restock', 'min', 'quantmin', 'quantmax', 'cost'];
    if (numericColumns.includes(columnKey)) {
        return 'numeric';
    }
    
    // Default to text
    return 'text';
}

function getOptionsForColumnType(columnType) {
    switch (columnType) {
        case 'valueflags':
            return availableValueflags;
        case 'usageflags':
            return availableUsageflags;
        case 'flags':
            return availableFlags;
        case 'categories':
            return availableCategories;
        case 'tags':
            return availableTags;
        case 'itemclasses':
            return availableItemclasses;
        case 'itemtags':
            return availableItemtags;
        default:
            return [];
    }
}


function buildFilterPanel() {
    const filterControls = document.getElementById('filterControls');
    if (!filterControls) return;
    
    filterControls.innerHTML = '';
    
    if (allAvailableColumns.length === 0) {
        filterControls.innerHTML = '<p class="no-filters">Load data to see available filters</p>';
        return;
    }
    
    allAvailableColumns.forEach(col => {
        const filterItem = document.createElement('div');
        filterItem.className = 'filter-item';
        filterItem.setAttribute('data-column', col.key);
        
        const columnType = getColumnType(col.key);
        const currentFilter = filters[col.key] || null;
        const filterId = `filter_${col.key.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const invertId = `invert_${col.key.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // Get current filter values and invert flag
        let filterValues = null;
        let invert = false;
        if (currentFilter) {
            if (typeof currentFilter === 'object' && !Array.isArray(currentFilter)) {
                filterValues = currentFilter.values !== undefined ? currentFilter.values : currentFilter.value || null;
                invert = currentFilter.invert || false;
            } else if (Array.isArray(currentFilter)) {
                filterValues = currentFilter;
                invert = false;
            } else {
                filterValues = currentFilter;
                invert = false;
            }
        }
        
        filterItem.innerHTML = `
            <div class="filter-item-header">
                <label class="filter-label">${escapeHtml(col.label)}</label>
                <label class="invert-label">
                    <input type="checkbox" id="${invertId}" class="invert-checkbox" data-column="${col.key}" ${invert ? 'checked' : ''}>
                    Invert
                </label>
            </div>
            <div class="filter-item-control">
                ${getFilterControlHTML(col.key, columnType, filterId, filterValues, currentFilter)}
            </div>
        `;
        
        filterControls.appendChild(filterItem);
    });
    
    // Add event listeners
    setupFilterEventListeners();
}

function getFilterControlHTML(columnKey, columnType, filterId, filterValues, currentFilter) {
    if (columnType === 'valueflags' || columnType === 'usageflags' || columnType === 'flags' || 
        columnType === 'categories' || columnType === 'tags' || columnType === 'itemclasses' || columnType === 'itemtags') {
        // Multi-select dropdown for fixed lists
        const options = getOptionsForColumnType(columnType);
        const selectedIds = Array.isArray(filterValues) ? filterValues : [];
        
        let html = `<select id="${filterId}" class="filter-select" multiple data-column="${columnKey}" style="width: 100%; min-height: 60px;">`;
        options.forEach(option => {
            const selected = selectedIds.includes(option.id) ? 'selected' : '';
            html += `<option value="${option.id}" ${selected}>${escapeHtml(option.name)}</option>`;
        });
        html += '</select>';
        return html;
    } else if (columnType === 'numeric') {
        // Numeric input with comparison operator
        const filterValue = typeof currentFilter === 'object' && currentFilter.value !== undefined ? currentFilter.value : (filterValues || '');
        const filterOp = typeof currentFilter === 'object' && currentFilter.op ? currentFilter.op : '=';
        
        let html = `<div class="numeric-filter">`;
        html += `<select class="filter-op" data-column="${columnKey}" style="width: 60px; margin-right: 5px;">`;
        html += `<option value="=" ${filterOp === '=' ? 'selected' : ''}>=</option>`;
        html += `<option value=">" ${filterOp === '>' ? 'selected' : ''}>&gt;</option>`;
        html += `<option value="<" ${filterOp === '<' ? 'selected' : ''}>&lt;</option>`;
        html += `<option value=">=" ${filterOp === '>=' ? 'selected' : ''}>&gt;=</option>`;
        html += `<option value="<=" ${filterOp === '<=' ? 'selected' : ''}>&lt;=</option>`;
        html += `</select>`;
        html += `<input type="number" id="${filterId}" class="filter-input numeric-filter-input" data-column="${columnKey}" value="${escapeHtml(filterValue)}" placeholder="Value" style="width: calc(100% - 70px);">`;
        html += `</div>`;
        return html;
    } else {
        // Text input
        const filterValue = typeof filterValues === 'string' ? filterValues : '';
        return `<input type="text" id="${filterId}" class="filter-input" data-column="${columnKey}" value="${escapeHtml(filterValue)}" placeholder="Filter...">`;
    }
}

function setupFilterEventListeners() {
    // Multi-select dropdowns
    document.querySelectorAll('.filter-select').forEach(select => {
        select.addEventListener('change', () => {
            handleFilterChange(select);
        });
    });
    
    // Numeric filter operators
    document.querySelectorAll('.filter-op').forEach(op => {
        op.addEventListener('change', () => {
            handleFilterChange(op);
        });
    });
    
    // Text and numeric inputs
    document.querySelectorAll('.filter-input').forEach(input => {
        if (input.classList.contains('numeric-filter-input')) {
            input.addEventListener('input', () => {
                handleFilterChange(input);
            });
        } else {
            // Debounce text inputs
            input.addEventListener('input', () => {
                clearTimeout(input.filterTimeout);
                input.filterTimeout = setTimeout(() => {
                    handleFilterChange(input);
                }, 300);
            });
        }
    });
    
    // Invert checkboxes
    document.querySelectorAll('.invert-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            handleFilterInvertChange(checkbox);
        });
    });
}

function handleFilterInvertChange(checkbox) {
    const columnKey = checkbox.getAttribute('data-column');
    const invert = checkbox.checked;
    
    if (filters[columnKey]) {
        if (typeof filters[columnKey] === 'object' && !Array.isArray(filters[columnKey])) {
            filters[columnKey].invert = invert;
        } else {
            // Convert to object format
            const oldValue = filters[columnKey];
            filters[columnKey] = {
                values: Array.isArray(oldValue) ? oldValue : oldValue,
                invert: invert
            };
        }
    } else {
        // Create new filter with invert
        filters[columnKey] = { values: null, invert: invert };
    }
    
    saveFilters();
    selectedRows.clear();
    displayTable();
}

function showFilterPanel() {
    const panel = document.getElementById('filterPanel');
    if (!panel) {
        console.error('Filter panel element not found');
        return;
    }
    
    panel.style.display = 'block';
    const showBtn = document.getElementById('showFilterPanelBtn');
    if (showBtn) {
        showBtn.style.display = 'none';
    }
    buildFilterPanel();
    filterPanelVisible = true;
}

function toggleFilterPanel() {
    const panel = document.getElementById('filterPanel');
    const showBtn = document.getElementById('showFilterPanelBtn');
    if (panel && showBtn) {
        if (filterPanelVisible) {
            panel.style.display = 'none';
            showBtn.style.display = 'block';
            filterPanelVisible = false;
        } else {
            panel.style.display = 'block';
            showBtn.style.display = 'none';
            filterPanelVisible = true;
            buildFilterPanel();
        }
    }
}

function clearAllFilters() {
    filters = {};
    saveFilters();
    selectedRows.clear();
    buildFilterPanel();
    displayTable();
}

function applyFilters(data) {
    if (Object.keys(filters).length === 0) {
        return data;
    }
    
    return data.filter(record => {
        return Object.keys(filters).every(columnKey => {
            const filter = filters[columnKey];
            
            // Skip empty filters
            if (filter === null || filter === undefined || filter === '') {
                return true;
            }
            
            // Extract filter values and invert flag
            let filterValues = null;
            let invert = false;
            
            if (typeof filter === 'object' && !Array.isArray(filter)) {
                filterValues = filter.values !== undefined ? filter.values : filter.value;
                invert = filter.invert || false;
            } else if (Array.isArray(filter)) {
                filterValues = filter;
                invert = false;
            } else {
                filterValues = filter;
                invert = false;
            }
            
            // Skip if no filter values
            if (filterValues === null || filterValues === undefined || filterValues === '') {
                if (Array.isArray(filterValues) && filterValues.length === 0 && !invert) {
                    return true;
                }
            }
            
            let matches = false;
            const columnType = getColumnType(columnKey);
            
            // Handle array filters (multi-select)
            if (Array.isArray(filterValues)) {
                if (filterValues.length === 0) {
                    matches = invert; // Empty array with invert means "match everything"
                    return invert ? !matches : matches;
                }
                
                if (columnType === 'valueflags' || columnKey === '_valueflags' || columnKey === '_valueflag_names') {
                    const recordIds = (record._valueflags || []).map(v => v.id);
                    matches = filterValues.some(id => recordIds.includes(id));
                } else if (columnType === 'usageflags' || columnKey === '_usageflags' || columnKey === '_usageflag_names') {
                    const recordIds = (record._usageflags || []).map(u => u.id);
                    matches = filterValues.some(id => recordIds.includes(id));
                } else if (columnType === 'flags' || columnKey === '_flags' || columnKey === '_flag_names') {
                    const recordIds = (record._flags || []).map(f => f.id);
                    matches = filterValues.some(id => recordIds.includes(id));
                } else if (columnType === 'categories' || columnKey === '_categories' || columnKey === '_category_names') {
                    const recordIds = (record._categories || []).map(c => c.id);
                    matches = filterValues.some(id => recordIds.includes(id));
                } else if (columnType === 'tags' || columnKey === '_tags' || columnKey === '_tag_names') {
                    const recordIds = (record._tags || []).map(t => t.id);
                    matches = filterValues.some(id => recordIds.includes(id));
                } else if (columnType === 'itemclasses' || columnKey === '_itemclass_id' || columnKey === '_itemclass_name') {
                    matches = filterValues.includes(record._itemclass_id);
                } else if (columnType === 'itemtags' || columnKey === '_itemtags' || columnKey === '_itemtag_names') {
                    const recordIds = (record._itemtags || []).map(it => it.id);
                    matches = filterValues.some(id => recordIds.includes(id));
                } else {
                    matches = true;
                }
            } else if (columnType === 'numeric' && typeof filter === 'object') {
                // Handle numeric filters
                const recordValue = parseFloat(record[columnKey]);
                const filterValue = parseFloat(filter.value);
                const op = filter.op || '=';
                
                if (isNaN(recordValue) || isNaN(filterValue)) {
                    matches = false;
                } else {
                    switch (op) {
                        case '=':
                            matches = recordValue === filterValue;
                            break;
                        case '>':
                            matches = recordValue > filterValue;
                            break;
                        case '<':
                            matches = recordValue < filterValue;
                            break;
                        case '>=':
                            matches = recordValue >= filterValue;
                            break;
                        case '<=':
                            matches = recordValue <= filterValue;
                            break;
                        default:
                            matches = true;
                    }
                }
                invert = filter.invert || false;
            } else {
                // Handle text filters
                const recordValue = String(record[columnKey] || '').toLowerCase();
                const filterValue = String(filterValues || '').toLowerCase();
                matches = recordValue.includes(filterValue);
                invert = typeof filter === 'object' ? (filter.invert || false) : false;
            }
            
            // Apply inversion
            return invert ? !matches : matches;
        });
    });
}

function makeCellEditable(cell) {
    const elementKey = cell.getAttribute('data-element-key');
    const fieldName = cell.getAttribute('data-field-name');
    const currentValue = cell.textContent.trim();
    
    // Check if we should do bulk edit
    const selectedKeys = getSelectedElementKeys();
    const isBulkEdit = selectedKeys.length > 0 && selectedKeys.includes(elementKey);
    const elementKeys = isBulkEdit ? selectedKeys : [elementKey];
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.className = 'cell-input';
    input.style.width = '100%';
    input.style.padding = '4px';
    input.style.border = '2px solid #667eea';
    input.style.borderRadius = '3px';
    if (isBulkEdit) {
        input.placeholder = `Bulk edit (${elementKeys.length} selected)`;
    }
    
    // Replace cell content with input
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();
    
    // Handle save on Enter or blur
    const saveEdit = async () => {
        const newValue = input.value.trim();
        
        if (newValue === currentValue && !isBulkEdit) {
            // No change, just restore
            cell.textContent = currentValue;
            return;
        }
        
        try {
            // Apply to all selected elements
            const promises = elementKeys.map(key => 
                fetch(`/api/elements/${encodeURIComponent(key)}/field/${fieldName}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        value: newValue,
                        mission_dir: currentMissionDir || '',
                        db_file_path: currentDbFilePath || ''
                    })
                })
            );
            
            const responses = await Promise.all(promises);
            const results = await Promise.all(responses.map(r => r.json()));
            
            const failed = results.filter(r => !r.success);
            if (failed.length > 0) {
                throw new Error(failed[0].error || 'Failed to update some fields');
            }
            
            // Update the cell display
            cell.textContent = newValue;
            
            // Update the data in memory for all affected elements
            elementKeys.forEach(key => {
                const record = tableData.find(r => r._element_key === key);
                if (record) {
                    record[fieldName] = newValue;
                }
            });
            
            updateStatus(`Field updated successfully${isBulkEdit ? ` (${elementKeys.length} elements)` : ''}`);
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
                db_file_path: currentDbFilePath || '',
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

function openItemclassesModal() {
    const modal = document.getElementById('itemclassesModal');
    loadItemclasses();
    modal.style.display = 'block';
}

function closeItemclassesModal() {
    document.getElementById('itemclassesModal').style.display = 'none';
    document.getElementById('newItemclassName').value = '';
}

async function loadItemclasses() {
    try {
        let url;
        if (currentDbFilePath) {
            url = `/api/itemclasses?db_file_path=${encodeURIComponent(currentDbFilePath)}`;
        } else {
            url = `/api/itemclasses?mission_dir=${encodeURIComponent(currentMissionDir || '')}`;
        }
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            availableItemclasses = data.itemclasses || [];
            displayItemclasses();
        } else {
            console.error('Failed to load itemclasses:', data);
            alert(data.error || 'Failed to load itemclasses');
        }
    } catch (error) {
        console.error('Error loading itemclasses:', error);
        alert(`Error loading itemclasses: ${error.message}`);
    }
}

function displayItemclasses() {
    const listContainer = document.getElementById('itemclassesList');
    listContainer.innerHTML = '';
    
    if (availableItemclasses.length === 0) {
        listContainer.innerHTML = '<p class="no-items">No itemclasses defined</p>';
        return;
    }
    
    availableItemclasses.forEach(itemclass => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item-row';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'item-name';
        nameSpan.textContent = itemclass.name;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-small btn-danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteItemclass(itemclass.id));
        
        itemDiv.appendChild(nameSpan);
        itemDiv.appendChild(deleteBtn);
        listContainer.appendChild(itemDiv);
    });
}

async function addItemclass() {
    const nameInput = document.getElementById('newItemclassName');
    const name = nameInput.value.trim();
    
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
                mission_dir: currentMissionDir || '',
                db_file_path: currentDbFilePath || ''
            })
        });
        
        const data = await response.json();
        if (data.success) {
            nameInput.value = '';
            await loadItemclasses();
            await loadReferenceData(); // Refresh reference data
            updateStatus('Itemclass added successfully');
        } else {
            throw new Error(data.error || 'Failed to add itemclass');
        }
    } catch (error) {
        console.error('Error adding itemclass:', error);
        alert(`Error adding itemclass: ${error.message}`);
    }
}

async function deleteItemclass(itemclassId) {
    if (!confirm('Are you sure you want to delete this itemclass? This will remove it from all elements that use it.')) {
        return;
    }
    
    try {
        let url;
        if (currentDbFilePath) {
            url = `/api/itemclasses/${itemclassId}?db_file_path=${encodeURIComponent(currentDbFilePath)}`;
        } else {
            url = `/api/itemclasses/${itemclassId}?mission_dir=${encodeURIComponent(currentMissionDir || '')}`;
        }
        const response = await fetch(url, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        if (data.success) {
            await loadItemclasses();
            await loadReferenceData(); // Refresh reference data
            await loadElements(); // Refresh elements to reflect changes
            updateStatus('Itemclass deleted successfully');
        } else {
            throw new Error(data.error || 'Failed to delete itemclass');
        }
    } catch (error) {
        console.error('Error deleting itemclass:', error);
        alert(`Error deleting itemclass: ${error.message}`);
    }
}

function openItemtagsModal() {
    const modal = document.getElementById('itemtagsModal');
    loadItemtags();
    modal.style.display = 'block';
}

function closeItemtagsModal() {
    document.getElementById('itemtagsModal').style.display = 'none';
    document.getElementById('newItemtagName').value = '';
}

async function loadItemtags() {
    try {
        let url;
        if (currentDbFilePath) {
            url = `/api/itemtags?db_file_path=${encodeURIComponent(currentDbFilePath)}`;
        } else {
            url = `/api/itemtags?mission_dir=${encodeURIComponent(currentMissionDir || '')}`;
        }
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            availableItemtags = data.itemtags || [];
            displayItemtags();
        } else {
            console.error('Failed to load itemtags:', data);
            alert(data.error || 'Failed to load itemtags');
        }
    } catch (error) {
        console.error('Error loading itemtags:', error);
        alert(`Error loading itemtags: ${error.message}`);
    }
}

function displayItemtags() {
    const listContainer = document.getElementById('itemtagsList');
    listContainer.innerHTML = '';
    
    if (availableItemtags.length === 0) {
        listContainer.innerHTML = '<p class="no-items">No itemtags defined</p>';
        return;
    }
    
    availableItemtags.forEach(itemtag => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item-row';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'item-name';
        nameSpan.textContent = itemtag.name;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-small btn-danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteItemtag(itemtag.id));
        
        itemDiv.appendChild(nameSpan);
        itemDiv.appendChild(deleteBtn);
        listContainer.appendChild(itemDiv);
    });
}

async function addItemtag() {
    const nameInput = document.getElementById('newItemtagName');
    const name = nameInput.value.trim();
    
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
                mission_dir: currentMissionDir || '',
                db_file_path: currentDbFilePath || ''
            })
        });
        
        const data = await response.json();
        if (data.success) {
            nameInput.value = '';
            await loadItemtags();
            await loadReferenceData(); // Refresh reference data
            updateStatus('Itemtag added successfully');
        } else {
            throw new Error(data.error || 'Failed to add itemtag');
        }
    } catch (error) {
        console.error('Error adding itemtag:', error);
        alert(`Error adding itemtag: ${error.message}`);
    }
}

async function deleteItemtag(itemtagId) {
    if (!confirm('Are you sure you want to delete this itemtag? This will remove it from all elements that use it.')) {
        return;
    }
    
    try {
        let url;
        if (currentDbFilePath) {
            url = `/api/itemtags/${itemtagId}?db_file_path=${encodeURIComponent(currentDbFilePath)}`;
        } else {
            url = `/api/itemtags/${itemtagId}?mission_dir=${encodeURIComponent(currentMissionDir || '')}`;
        }
        const response = await fetch(url, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        if (data.success) {
            await loadItemtags();
            await loadReferenceData(); // Refresh reference data
            await loadElements(); // Refresh elements to reflect changes
            updateStatus('Itemtag deleted successfully');
        } else {
            throw new Error(data.error || 'Failed to delete itemtag');
        }
    } catch (error) {
        console.error('Error deleting itemtag:', error);
        alert(`Error deleting itemtag: ${error.message}`);
    }
}

