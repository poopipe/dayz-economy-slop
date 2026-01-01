// Launcher JavaScript

const ECONOMY_EDITOR_URL = 'http://localhost:5004';
const MAP_VIEWER_URL = 'http://localhost:5003';

let currentApp = 'economy-editor';
const loadedApps = new Set();

/**
 * Load an app's iframe (lazy loading)
 */
function loadApp(appName) {
    if (loadedApps.has(appName)) {
        return; // Already loaded
    }
    
    const iframe = document.getElementById(`${appName}-iframe`);
    const loadingEl = document.getElementById(`${appName}-loading`);
    const errorEl = document.getElementById(`${appName}-error`);
    
    if (!iframe) {
        return;
    }
    
    // Get the URL from data-src attribute
    const url = iframe.getAttribute('data-src');
    if (!url) {
        return;
    }
    
    // Show loading indicator
    if (loadingEl) {
        loadingEl.style.display = 'flex';
    }
    if (errorEl) {
        errorEl.style.display = 'none';
    }
    
    // Set timeout to detect if iframe fails to load
    const loadTimeout = setTimeout(() => {
        // Check if iframe actually loaded
        try {
            iframe.contentWindow.location;
            // Same origin - check if still loading
            if (loadingEl && loadingEl.style.display !== 'none') {
                showError(appName);
            }
        } catch (e) {
            // Cross-origin error typically means the iframe loaded successfully
            // Only show error if loading indicator is still visible after timeout
            if (loadingEl && loadingEl.style.display !== 'none') {
                // Try to check if the iframe actually loaded by checking its readyState
                // For cross-origin, we can't check directly, so assume it loaded if timeout passed
                // The error will be shown by the error event handler if it truly failed
            }
        }
    }, 15000); // 15 second timeout (increased for slower connections)
    
    // Set the src to actually load the iframe
    iframe.src = url;
    
    // Mark as loaded (will be set to true when load event fires)
    iframe.addEventListener('load', () => {
        clearTimeout(loadTimeout);
        // Small delay to ensure content is actually rendered
        setTimeout(() => {
            if (loadingEl) {
                loadingEl.style.display = 'none';
            }
            if (errorEl) {
                errorEl.style.display = 'none';
            }
            loadedApps.add(appName);
            updateStatus(`${appName === 'economy-editor' ? 'economy' : 'map'}-status`, 'online');
        }, 100);
    }, { once: true });
    
    iframe.addEventListener('error', () => {
        clearTimeout(loadTimeout);
        console.error(`Failed to load ${appName} from ${url}`);
        showError(appName);
    }, { once: true });
}

/**
 * Show error state for an app
 */
function showError(appName) {
    const loadingEl = document.getElementById(`${appName}-loading`);
    const errorEl = document.getElementById(`${appName}-error`);
    
    if (loadingEl) {
        loadingEl.style.display = 'none';
    }
    if (errorEl) {
        errorEl.style.display = 'flex';
    }
    
    updateStatus(`${appName === 'economy-editor' ? 'economy' : 'map'}-status`, 'offline');
    loadedApps.delete(appName); // Allow retry
}

/**
 * Reload an app
 */
function reloadApp(appName) {
    const iframe = document.getElementById(`${appName}-iframe`);
    if (iframe) {
        loadedApps.delete(appName);
        iframe.src = '';
        setTimeout(() => {
            loadApp(appName);
        }, 100);
    }
}

/**
 * Switch between applications
 */
function switchApp(appName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-app="${appName}"]`).classList.add('active');
    
    // Update app frames
    document.querySelectorAll('.app-frame').forEach(frame => {
        frame.classList.remove('active');
    });
    const targetFrame = document.getElementById(`${appName}-frame`);
    targetFrame.classList.add('active');
    
    currentApp = appName;
    
    // Load the app if not already loaded
    loadApp(appName);
}

/**
 * Check if an application is online by checking iframe state
 */
function checkAppStatus(url, statusId) {
    const appName = statusId === 'economy-status' ? 'economy-editor' : 'map-viewer';
    const iframe = document.getElementById(`${appName}-iframe`);
    
    if (!iframe) {
        updateStatus(statusId, 'offline');
        return;
    }
    
    // Check if iframe has loaded content
    try {
        // Try to access iframe - if it throws, it might be cross-origin (which means it loaded)
        iframe.contentWindow.location;
        // If we get here, same origin and we can check
        updateStatus(statusId, 'online');
    } catch (e) {
        // Cross-origin error typically means the iframe loaded successfully
        // Check if iframe has been loading for too long
        const loadingEl = document.getElementById(`${appName}-loading`);
        if (loadingEl && !loadingEl.classList.contains('hidden')) {
            // Still loading, keep checking status
            updateStatus(statusId, 'checking');
        } else {
            // Loading indicator is hidden, assume it loaded
            updateStatus(statusId, 'online');
        }
    }
}

/**
 * Update status indicator
 */
function updateStatus(statusId, status) {
    const statusEl = document.getElementById(statusId);
    if (statusEl) {
        statusEl.className = `status-indicator ${status}`;
        statusEl.textContent = status === 'online' ? 'Online' : 
                              status === 'offline' ? 'Offline' : 'Checking...';
    }
}

/**
 * Handle iframe load events
 */
function setupIframeHandlers() {
    // Handlers are now set up in loadApp function
    // This function is kept for compatibility but loadApp handles everything
}

/**
 * Periodically check app status
 */
function startStatusChecks() {
    // Initial check after a delay to allow iframes to start loading
    setTimeout(() => {
        checkAppStatus(ECONOMY_EDITOR_URL, 'economy-status');
        checkAppStatus(MAP_VIEWER_URL, 'map-status');
    }, 2000);
    
    // Check every 15 seconds
    setInterval(() => {
        checkAppStatus(ECONOMY_EDITOR_URL, 'economy-status');
        checkAppStatus(MAP_VIEWER_URL, 'map-status');
    }, 15000);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    setupIframeHandlers();
    startStatusChecks();
    
    // Set initial status
    updateStatus('economy-status', 'checking');
    updateStatus('map-status', 'checking');
    
    // Load the initially active app (economy-editor)
    loadApp('economy-editor');
});

