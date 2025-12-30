// XML Data Viewer JavaScript

let autoRefreshInterval = null;
let currentFile = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateStatus('Ready');
    loadXMLData();
    
    // Setup refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadXMLData();
    });
    
    // Setup auto-refresh
    document.getElementById('autoRefresh').addEventListener('change', (e) => {
        if (e.target.checked) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });
    
    // Setup refresh interval
    document.getElementById('refreshInterval').addEventListener('change', (e) => {
        if (document.getElementById('autoRefresh').checked) {
            stopAutoRefresh();
            startAutoRefresh();
        }
    });
    
    startAutoRefresh();
});

function updateStatus(message) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = 'status';
}

function startAutoRefresh() {
    stopAutoRefresh();
    const interval = parseInt(document.getElementById('refreshInterval').value) * 1000;
    autoRefreshInterval = setInterval(() => {
        loadXMLData(false); // Silent refresh
    }, interval);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

async function loadXMLData(showStatus = true) {
    if (showStatus) {
        updateStatus('Loading XML data...');
    }
    
    try {
        const response = await fetch('/api/xml');
        const data = await response.json();
        
        displayFileList(data);
        
        if (showStatus) {
            updateStatus(`Loaded ${Object.keys(data).length} file(s)`);
        }
    } catch (error) {
        updateStatus('Error loading data');
        console.error('Error loading XML data:', error);
        document.getElementById('fileList').innerHTML = 
            `<div class="error">Error loading XML data: ${error.message}</div>`;
    }
}

function displayFileList(files) {
    const fileListEl = document.getElementById('fileList');
    
    if (Object.keys(files).length === 0) {
        fileListEl.innerHTML = '<p>No XML files found. Place XML files in the data/ directory.</p>';
        return;
    }
    
    let html = '';
    for (const [filename, fileData] of Object.entries(files)) {
        const hasError = fileData.error !== undefined;
        html += `
            <div class="file-item ${currentFile === filename ? 'active' : ''}" 
                 onclick="selectFile('${filename}')">
                <h3>${filename}</h3>
                <p>${hasError ? `<span class="error">${fileData.error}</span>` : 'Click to view'}</p>
            </div>
        `;
    }
    
    fileListEl.innerHTML = html;
}

async function selectFile(filename) {
    currentFile = filename;
    updateStatus(`Loading ${filename}...`);
    
    try {
        const response = await fetch(`/api/xml/${filename}`);
        const data = await response.json();
        
        if (data.error) {
            displayError(data.error);
        } else {
            displayXML(data.data);
            updateStatus(`Displaying ${filename}`);
        }
        
        // Update active file in list
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('active');
        });
        event.currentTarget.classList.add('active');
    } catch (error) {
        displayError(`Error loading file: ${error.message}`);
        updateStatus('Error loading file');
    }
}

function displayXML(data) {
    const viewerEl = document.getElementById('xmlViewer');
    viewerEl.innerHTML = '<div class="xml-tree">' + renderXMLNode(data) + '</div>';
}

function renderXMLNode(node, indent = 0) {
    let html = '';
    const indentStr = '  '.repeat(indent);
    
    // Opening tag
    html += `${indentStr}<span class="xml-tag">&lt;${node.tag}</span>`;
    
    // Attributes
    if (node.attributes && Object.keys(node.attributes).length > 0) {
        for (const [key, value] of Object.entries(node.attributes)) {
            html += ` <span class="xml-attr">${key}="${value}"</span>`;
        }
    }
    
    html += `<span class="xml-tag">&gt;</span>`;
    
    // Text content
    if (node.text) {
        html += `<span class="xml-text">${escapeHtml(node.text)}</span>`;
    }
    
    // Children
    if (node.children && node.children.length > 0) {
        html += '\n';
        for (const child of node.children) {
            html += renderXMLNode(child, indent + 1) + '\n';
        }
        html += indentStr;
    }
    
    // Closing tag
    html += `<span class="xml-tag">&lt;/${node.tag}&gt;</span>`;
    
    return html;
}

function displayError(message) {
    const viewerEl = document.getElementById('xmlViewer');
    viewerEl.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

