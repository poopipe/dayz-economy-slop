// Database Manager JavaScript

let currentMissionDir = '';
let currentTable = null;
let currentPage = 1;
let perPage = 100;
let tableColumns = [];
let currentRowId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateStatus('Ready');
    setupEventListeners();
    loadMissionDir();
});

function setupEventListeners() {
    // Load database button
    document.getElementById('loadDbBtn').addEventListener('click', loadDatabase);
    
    // Mission directory input
    const missionDirInput = document.getElementById('missionDir');
    missionDirInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadDatabase();
        }
    });
    
    // Table actions
    document.getElementById('refreshTableBtn').addEventListener('click', () => {
        if (currentTable) {
            loadTableData(currentTable);
        }
    });
    
    document.getElementById('findDuplicatesBtn').addEventListener('click', findDuplicates);
    document.getElementById('deduplicateBtn').addEventListener('click', deduplicateTable);
    document.getElementById('deleteAllBtn').addEventListener('click', deleteAllRows);
    
    // Pagination
    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            if (currentTable) {
                loadTableData(currentTable);
            }
        }
    });
    
    document.getElementById('nextPageBtn').addEventListener('click', () => {
        currentPage++;
        if (currentTable) {
            loadTableData(currentTable);
        }
    });
    
    document.getElementById('perPage').addEventListener('change', (e) => {
        perPage = parseInt(e.target.value) || 100;
        currentPage = 1;
        if (currentTable) {
            loadTableData(currentTable);
        }
    });
    
    // Modal
    document.querySelector('.close-modal').addEventListener('click', closeEditModal);
    document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
    document.getElementById('saveRowBtn').addEventListener('click', saveRow);
    document.getElementById('deleteRowBtn').addEventListener('click', deleteRow);
    
    // Close modal on outside click
    document.getElementById('editModal').addEventListener('click', (e) => {
        if (e.target.id === 'editModal') {
            closeEditModal();
        }
    });
    
    document.getElementById('duplicatesModal').addEventListener('click', (e) => {
        if (e.target.id === 'duplicatesModal') {
            closeDuplicatesModal();
        }
    });
}

function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

function loadMissionDir() {
    const saved = localStorage.getItem('dbManagerMissionDir');
    if (saved) {
        currentMissionDir = saved;
        document.getElementById('missionDir').value = saved;
    }
}

function loadDatabase() {
    const missionDirInput = document.getElementById('missionDir');
    const missionDir = missionDirInput.value.trim();
    
    if (!missionDir) {
        alert('Please enter a mission directory path');
        return;
    }
    
    currentMissionDir = missionDir;
    localStorage.setItem('dbManagerMissionDir', missionDir);
    updateStatus('Loading database...');
    
    loadTables();
}

async function loadTables() {
    try {
        const response = await fetch(`/api/tables?mission_dir=${encodeURIComponent(currentMissionDir)}`);
        const data = await response.json();
        
        if (data.success) {
            displayTables(data.tables);
            updateStatus(`Loaded ${data.tables.length} tables`);
        } else {
            throw new Error(data.error || 'Failed to load tables');
        }
    } catch (error) {
        updateStatus('Error loading database');
        alert(`Error loading database: ${error.message}`);
        console.error('Error loading tables:', error);
    }
}

function displayTables(tables) {
    const tablesList = document.getElementById('tablesList');
    tablesList.innerHTML = '';
    
    if (tables.length === 0) {
        tablesList.innerHTML = '<p>No tables found</p>';
        return;
    }
    
    tables.forEach(table => {
        const tableItem = document.createElement('div');
        tableItem.className = 'table-item';
        tableItem.textContent = table;
        tableItem.addEventListener('click', () => {
            // Remove active class from all items
            document.querySelectorAll('.table-item').forEach(item => {
                item.classList.remove('active');
            });
            tableItem.classList.add('active');
            currentTable = table;
            currentPage = 1;
            loadTableData(table);
        });
        tablesList.appendChild(tableItem);
    });
}

async function loadTableData(tableName) {
    try {
        updateStatus(`Loading ${tableName}...`);
        document.getElementById('currentTableName').textContent = `Table: ${tableName}`;
        
        const response = await fetch(
            `/api/table/${tableName}?mission_dir=${encodeURIComponent(currentMissionDir)}&page=${currentPage}&per_page=${perPage}`
        );
        const data = await response.json();
        
        if (data.success) {
            tableColumns = data.columns;
            displayTableData(data.data, data.columns, data.total, data.page, data.total_pages);
            updateStatus(`Loaded ${data.total} rows from ${tableName}`);
        } else {
            throw new Error(data.error || 'Failed to load table data');
        }
    } catch (error) {
        updateStatus('Error loading table data');
        alert(`Error loading table data: ${error.message}`);
        console.error('Error loading table data:', error);
    }
}

function displayTableData(rows, columns, total, page, totalPages) {
    const container = document.getElementById('tableContainer');
    
    if (rows.length === 0) {
        container.innerHTML = '<p class="no-data">No data in this table</p>';
        return;
    }
    
    let html = '<table class="data-table"><thead><tr>';
    
    // Add rowid column
    html += '<th>Row ID</th>';
    
    columns.forEach(col => {
        html += `<th>${col}</th>`;
    });
    
    html += '</tr></thead><tbody>';
    
    rows.forEach((row, index) => {
        // Get rowid - try different methods
        const rowid = row.rowid || row.id || index;
        
        html += `<tr data-rowid="${rowid}">`;
        html += `<td>${rowid}</td>`;
        
        columns.forEach(col => {
            const value = row[col];
            let displayValue = '';
            
            if (value === null || value === undefined) {
                displayValue = '<em>NULL</em>';
            } else if (typeof value === 'object') {
                displayValue = JSON.stringify(value, null, 2);
            } else {
                displayValue = String(value);
            }
            
            html += `<td class="editable-cell" data-column="${col}" data-rowid="${rowid}">${escapeHtml(displayValue)}</td>`;
        });
        
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    // Add click handlers for editing
    document.querySelectorAll('.editable-cell').forEach(cell => {
        cell.addEventListener('dblclick', () => {
            const rowid = parseInt(cell.dataset.rowid);
            const column = cell.dataset.column;
            openEditModal(rowid, column);
        });
    });
    
    // Update pagination
    document.getElementById('pageInfo').textContent = `Page ${page} of ${totalPages} (${total} total)`;
    document.getElementById('prevPageBtn').disabled = page <= 1;
    document.getElementById('nextPageBtn').disabled = page >= totalPages;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function openEditModal(rowid, column = null) {
    currentRowId = rowid;
    
    try {
        const response = await fetch(
            `/api/table/${currentTable}/row/${rowid}?mission_dir=${encodeURIComponent(currentMissionDir)}`
        );
        const data = await response.json();
        
        if (data.success) {
            const form = document.getElementById('editForm');
            form.innerHTML = '';
            
            tableColumns.forEach(col => {
                const field = document.createElement('div');
                field.className = 'form-field';
                
                const label = document.createElement('label');
                label.textContent = col;
                field.appendChild(label);
                
                const value = data.data[col];
                let input;
                
                if (typeof value === 'object' && value !== null) {
                    input = document.createElement('textarea');
                    input.value = JSON.stringify(value, null, 2);
                    input.rows = 5;
                } else {
                    input = document.createElement('input');
                    input.type = 'text';
                    input.value = value !== null && value !== undefined ? String(value) : '';
                }
                
                input.id = `edit_${col}`;
                input.dataset.column = col;
                field.appendChild(input);
                form.appendChild(field);
            });
            
            document.getElementById('editModal').style.display = 'block';
        } else {
            throw new Error(data.error || 'Failed to load row data');
        }
    } catch (error) {
        alert(`Error loading row: ${error.message}`);
        console.error('Error loading row:', error);
    }
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    currentRowId = null;
}

function closeDuplicatesModal() {
    document.getElementById('duplicatesModal').style.display = 'none';
}

async function saveRow() {
    if (!currentRowId || !currentTable) return;
    
    const updates = {};
    tableColumns.forEach(col => {
        const input = document.getElementById(`edit_${col}`);
        if (input) {
            let value = input.value;
            
            // Try to parse as JSON if it looks like JSON
            if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    // Keep as string if parsing fails
                }
            }
            
            updates[col] = value;
        }
    });
    
    try {
        const response = await fetch(`/api/table/${currentTable}/row/${currentRowId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mission_dir: currentMissionDir,
                updates: updates
            })
        });
        
        const data = await response.json();
        if (data.success) {
            closeEditModal();
            loadTableData(currentTable);
            updateStatus('Row updated successfully');
        } else {
            alert(data.error || 'Failed to update row');
        }
    } catch (error) {
        alert(`Error updating row: ${error.message}`);
        console.error('Error updating row:', error);
    }
}

async function deleteRow() {
    if (!currentRowId || !currentTable) return;
    
    if (!confirm(`Are you sure you want to delete this row (ID: ${currentRowId})?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/table/${currentTable}/row/${currentRowId}`, {
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
            closeEditModal();
            loadTableData(currentTable);
            updateStatus('Row deleted successfully');
        } else {
            alert(data.error || 'Failed to delete row');
        }
    } catch (error) {
        alert(`Error deleting row: ${error.message}`);
        console.error('Error deleting row:', error);
    }
}

async function findDuplicates() {
    if (!currentTable) {
        alert('Please select a table first');
        return;
    }
    
    const column = prompt('Enter column name to check for duplicates:', 'name');
    if (!column) return;
    
    try {
        updateStatus('Finding duplicates...');
        const response = await fetch(
            `/api/table/${currentTable}/duplicates?mission_dir=${encodeURIComponent(currentMissionDir)}&column=${encodeURIComponent(column)}`
        );
        const data = await response.json();
        
        if (data.success) {
            displayDuplicates(data.duplicates, column);
            updateStatus(`Found ${data.duplicates.length} duplicate groups`);
        } else {
            throw new Error(data.error || 'Failed to find duplicates');
        }
    } catch (error) {
        alert(`Error finding duplicates: ${error.message}`);
        console.error('Error finding duplicates:', error);
    }
}

function displayDuplicates(duplicates, column) {
    const list = document.getElementById('duplicatesList');
    list.innerHTML = '';
    
    if (duplicates.length === 0) {
        list.innerHTML = '<p>No duplicates found</p>';
    } else {
        duplicates.forEach(dup => {
            const item = document.createElement('div');
            item.className = 'duplicate-item';
            item.innerHTML = `
                <h4>${escapeHtml(String(dup.value))} <span class="count">(${dup.count} occurrences)</span></h4>
                <div class="rowids">Row IDs: ${dup.rowids.join(', ')}</div>
            `;
            list.appendChild(item);
        });
    }
    
    document.getElementById('duplicatesModal').style.display = 'block';
}

async function deduplicateTable() {
    if (!currentTable) {
        alert('Please select a table first');
        return;
    }
    
    const column = prompt('Enter column name to deduplicate by:', 'name');
    if (!column) return;
    
    if (!confirm(`This will remove duplicate entries in column "${column}", keeping the first occurrence.\n\nContinue?`)) {
        return;
    }
    
    try {
        updateStatus('Deduplicating...');
        const response = await fetch(`/api/table/${currentTable}/deduplicate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mission_dir: currentMissionDir,
                column: column,
                keep_first: true
            })
        });
        
        const data = await response.json();
        if (data.success) {
            alert(`Deduplication complete!\n\nDeleted ${data.deleted_count} duplicate entries.`);
            loadTableData(currentTable);
            updateStatus(`Deduplicated: ${data.deleted_count} entries removed`);
        } else {
            throw new Error(data.error || 'Failed to deduplicate');
        }
    } catch (error) {
        alert(`Error deduplicating: ${error.message}`);
        console.error('Error deduplicating:', error);
    }
}

async function deleteAllRows() {
    if (!currentTable) {
        alert('Please select a table first');
        return;
    }
    
    if (!confirm(`WARNING: This will delete ALL rows from table "${currentTable}"!\n\nThis action cannot be undone!\n\nType "DELETE ALL" to confirm:`)) {
        return;
    }
    
    const confirmText = prompt('Type "DELETE ALL" to confirm:');
    if (confirmText !== 'DELETE ALL') {
        alert('Confirmation text does not match. Operation cancelled.');
        return;
    }
    
    try {
        updateStatus('Deleting all rows...');
        const response = await fetch(`/api/table/${currentTable}/delete-all`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mission_dir: currentMissionDir,
                confirm: true
            })
        });
        
        const data = await response.json();
        if (data.success) {
            alert(`Deleted ${data.deleted_count} rows from table "${currentTable}"`);
            loadTableData(currentTable);
            updateStatus(`Deleted ${data.deleted_count} rows`);
        } else {
            throw new Error(data.error || 'Failed to delete rows');
        }
    } catch (error) {
        alert(`Error deleting rows: ${error.message}`);
        console.error('Error deleting rows:', error);
    }
}



