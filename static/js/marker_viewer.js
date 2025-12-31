// Marker Viewer JavaScript

let canvas;
let ctx;
let markers = [];
let selectedMarkers = new Set();
let visibleMarkers = new Set(); // For filtering (future use)
let backgroundImage = null;
let imageWidth = 1000; // metres
let imageHeight = 1000; // metres
let showGrid = true;
let showMarkers = true;
let missionDir = '';
let viewOffsetX = 0;
let viewOffsetY = 0;
let viewScale = 1.0;
let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
let canvasWidth = 0;
let canvasHeight = 0;
let hoveredMarkerIndex = -1;
let tooltipX = 0;
let tooltipY = 0;

// Initialize canvas
function initCanvas() {
    canvas = document.getElementById('markerCanvas');
    ctx = canvas.getContext('2d');
    
    // Set canvas size
    resizeCanvas();
    
    // Pan with middle mouse button or space + drag
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panStartOffsetX = 0;
    let panStartOffsetY = 0;
    
    // Event listeners
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            // Pan mode
            isPanning = true;
            panStartX = x;
            panStartY = y;
            panStartOffsetX = viewOffsetX;
            panStartOffsetY = viewOffsetY;
            e.preventDefault();
        } else if (e.button === 0) {
            // Single click selection
            selectAtPoint(x, y, e.shiftKey);
        }
    });
    
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        tooltipX = x;
        tooltipY = y;
        
        if (isPanning) {
            viewOffsetX = panStartOffsetX + (x - panStartX);
            viewOffsetY = panStartOffsetY + (y - panStartY);
            hoveredMarkerIndex = -1; // Clear hover when panning
            draw();
        } else {
            // Check for hover
            updateHoveredMarker(x, y);
        }
    });
    
    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            isPanning = false;
        }
    });
    
    // Clear hover when mouse leaves canvas
    canvas.addEventListener('mouseleave', () => {
        hoveredMarkerIndex = -1;
        draw();
    });
    
    canvas.addEventListener('wheel', handleWheel);
    
    // Prevent context menu on right click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    window.addEventListener('resize', () => {
        resizeCanvas();
        draw();
    });
    
    draw();
}

function resizeCanvas() {
    const container = canvas.parentElement;
    canvasWidth = container.clientWidth;
    canvasHeight = container.clientHeight;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
}

// Convert world coordinates (metres) to screen coordinates
function worldToScreen(worldX, worldZ) {
    // Reverse z coordinate so origin is at lower left
    // In world space: z increases upward, but we want it to increase downward on screen
    const reversedZ = maxZ - worldZ;
    
    // Apply scale and offset
    const screenX = (worldX - minX) * viewScale + viewOffsetX;
    // For reversed Z, we need to calculate relative to the reversed coordinate system
    const reversedMinZ = 0; // After reversal, minZ becomes maxZ - maxZ = 0
    const screenY = reversedZ * viewScale + viewOffsetY;
    
    return { x: screenX, y: screenY };
}

// Convert screen coordinates to world coordinates
function screenToWorld(screenX, screenY) {
    const worldX = (screenX - viewOffsetX) / viewScale + minX;
    // Reverse the z coordinate transformation
    const reversedZ = (screenY - viewOffsetY) / viewScale;
    const worldZ = maxZ - reversedZ;
    
    return { x: worldX, z: worldZ };
}

// Update view to fit all markers
function fitToView() {
    if (markers.length === 0) {
        viewScale = 1.0;
        viewOffsetX = 0;
        viewOffsetY = 0;
        return;
    }
    
    // Calculate bounds
    minX = Math.min(...markers.map(m => m.x));
    maxX = Math.max(...markers.map(m => m.x));
    minZ = Math.min(...markers.map(m => m.z));
    maxZ = Math.max(...markers.map(m => m.z));
    
    // Add padding
    const padding = 50;
    const worldWidth = maxX - minX;
    const worldHeight = maxZ - minZ;
    
    // Calculate scale to fit
    const scaleX = (canvasWidth - padding * 2) / worldWidth;
    const scaleZ = (canvasHeight - padding * 2) / worldHeight;
    viewScale = Math.min(scaleX, scaleZ, 1.0); // Don't zoom in too much
    
    // Center the view
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const reversedCenterZ = maxZ - centerZ;
    
    viewOffsetX = canvasWidth / 2 - centerX * viewScale;
    viewOffsetY = canvasHeight / 2 - reversedCenterZ * viewScale;
}

// Draw grid
function drawGrid() {
    if (!showGrid) return;
    
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    
    // Calculate grid bounds in world coordinates from all four corners
    const topLeft = screenToWorld(0, 0);
    const topRight = screenToWorld(canvasWidth, 0);
    const bottomLeft = screenToWorld(0, canvasHeight);
    const bottomRight = screenToWorld(canvasWidth, canvasHeight);
    
    // Find the full range of visible world coordinates
    const minX = Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const minZ = Math.min(topLeft.z, topRight.z, bottomLeft.z, bottomRight.z);
    const maxZ = Math.max(topLeft.z, topRight.z, bottomLeft.z, bottomRight.z);
    
    // Round to nearest 100m
    const startX = Math.floor(minX / 100) * 100;
    const endX = Math.ceil(maxX / 100) * 100;
    const startZ = Math.floor(minZ / 100) * 100;
    const endZ = Math.ceil(maxZ / 100) * 100;
    
    // Draw vertical lines (constant x, varying z)
    // These appear as vertical lines on screen - draw from top to bottom of visible area
    for (let x = startX; x <= endX; x += 100) {
        // Draw line from top of visible area to bottom
        const topPoint = worldToScreen(x, maxZ);
        const bottomPoint = worldToScreen(x, minZ);
        
        // Extend lines slightly beyond visible area to ensure they cover the canvas
        const lineTopY = Math.max(0, topPoint.y);
        const lineBottomY = Math.min(canvasHeight, bottomPoint.y);
        
        ctx.beginPath();
        ctx.moveTo(topPoint.x, lineTopY);
        ctx.lineTo(bottomPoint.x, lineBottomY);
        ctx.stroke();
    }
    
    // Draw horizontal lines (constant z, varying x)
    // These appear as horizontal lines on screen - draw from left to right of visible area
    for (let z = startZ; z <= endZ; z += 100) {
        // Draw line from left to right of visible area
        const leftPoint = worldToScreen(minX, z);
        const rightPoint = worldToScreen(maxX, z);
        
        // Extend lines slightly beyond visible area to ensure they cover the canvas
        const lineLeftX = Math.max(0, leftPoint.x);
        const lineRightX = Math.min(canvasWidth, rightPoint.x);
        
        ctx.beginPath();
        ctx.moveTo(lineLeftX, leftPoint.y);
        ctx.lineTo(lineRightX, rightPoint.y);
        ctx.stroke();
    }
}

// Draw background image
function drawBackgroundImage() {
    if (!backgroundImage) return;
    
    // Calculate image position and size
    const imageScreenWidth = imageWidth * viewScale;
    const imageScreenHeight = imageHeight * viewScale;
    const imagePos = worldToScreen(0, imageHeight); // Bottom left corner
    
    ctx.drawImage(
        backgroundImage,
        imagePos.x,
        imagePos.y,
        imageScreenWidth,
        -imageScreenHeight // Negative height to flip vertically
    );
}

// Draw markers
function drawMarkers() {
    if (!showMarkers) return;
    
    markers.forEach((marker, index) => {
        if (!visibleMarkers.has(index) && visibleMarkers.size > 0) {
            return; // Skip hidden markers
        }
        
        const screenPos = worldToScreen(marker.x, marker.z);
        const isSelected = selectedMarkers.has(index);
        const isHovered = hoveredMarkerIndex === index;
        
        // Draw marker
        ctx.fillStyle = isSelected ? '#ff0000' : (isHovered ? '#00ff00' : '#0066ff');
        ctx.strokeStyle = isSelected ? '#cc0000' : (isHovered ? '#00cc00' : '#0044cc');
        ctx.lineWidth = isSelected ? 3 : (isHovered ? 3 : 2);
        
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, isSelected ? 6 : (isHovered ? 6 : 4), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
}

// Draw tooltip
function drawTooltip() {
    if (hoveredMarkerIndex < 0 || hoveredMarkerIndex >= markers.length) {
        return;
    }
    
    const marker = markers[hoveredMarkerIndex];
    const padding = 8;
    const lineHeight = 18;
    const fontSize = 12;
    
    // Build tooltip content
    const lines = [];
    if (marker.name) lines.push(`Name: ${marker.name}`);
    lines.push(`X: ${marker.x.toFixed(2)} m`);
    lines.push(`Y: ${marker.y.toFixed(2)} m`);
    lines.push(`Z: ${marker.z.toFixed(2)} m`);
    if (marker.usage) lines.push(`Usage: ${marker.usage}`);
    
    // Add any other attributes
    for (const [key, value] of Object.entries(marker)) {
        if (!['id', 'name', 'x', 'y', 'z', 'usage'].includes(key) && value !== null && value !== undefined && value !== '') {
            lines.push(`${key}: ${value}`);
        }
    }
    
    if (lines.length === 0) return;
    
    // Calculate tooltip dimensions
    ctx.font = `${fontSize}px Arial`;
    const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    const tooltipWidth = maxWidth + padding * 2;
    const tooltipHeight = lines.length * lineHeight + padding * 2;
    
    // Position tooltip (offset from mouse, but keep it on screen)
    let tooltipXPos = tooltipX + 15;
    let tooltipYPos = tooltipY - tooltipHeight - 15;
    
    // Keep tooltip on screen
    if (tooltipXPos + tooltipWidth > canvasWidth) {
        tooltipXPos = tooltipX - tooltipWidth - 15;
    }
    if (tooltipYPos < 0) {
        tooltipYPos = tooltipY + 15;
    }
    
    // Draw tooltip background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(tooltipXPos, tooltipYPos, tooltipWidth, tooltipHeight);
    
    // Draw tooltip border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(tooltipXPos, tooltipYPos, tooltipWidth, tooltipHeight);
    
    // Draw tooltip text
    ctx.fillStyle = '#ffffff';
    ctx.font = `${fontSize}px Arial`;
    lines.forEach((line, i) => {
        ctx.fillText(line, tooltipXPos + padding, tooltipYPos + padding + (i + 1) * lineHeight - 4);
    });
}

// Main draw function
function draw() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw in order: background image, grid, markers, tooltip
    drawBackgroundImage();
    drawGrid();
    drawMarkers();
    drawTooltip();
}

// Handle mouse down
function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (e.button === 0) { // Left click
        // Single click selection
        selectAtPoint(x, y, e.shiftKey);
    }
}

// Handle mouse move
function handleMouseMove(e) {
    // This function is not used but kept for potential future use
}

// Handle mouse up
function handleMouseUp(e) {
    // This function is not used but kept for potential future use
}

// Handle wheel (zoom)
function handleWheel(e) {
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Get world coordinates at mouse position before zoom
    const worldPoint = screenToWorld(mouseX, mouseY);
    
    // Store old scale
    const oldScale = viewScale;
    
    // Adjust scale
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    viewScale *= zoomFactor;
    viewScale = Math.max(0.1, Math.min(10, viewScale)); // Limit zoom
    
    // Calculate what the screen position of the world point would be with new scale
    const newScreenPos = worldToScreen(worldPoint.x, worldPoint.z);
    
    // Adjust offset so the world point stays at the cursor position
    viewOffsetX += mouseX - newScreenPos.x;
    viewOffsetY += mouseY - newScreenPos.y;
    
    draw();
}

// Select marker at point
function selectAtPoint(screenX, screenY, shiftKey = false) {
    const worldPos = screenToWorld(screenX, screenY);
    const threshold = 10 / viewScale; // 10 pixels in world coordinates
    
    let found = false;
    markers.forEach((marker, index) => {
        const dx = marker.x - worldPos.x;
        const dz = marker.z - worldPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < threshold) {
            if (selectedMarkers.has(index)) {
                selectedMarkers.delete(index);
            } else {
                selectedMarkers.add(index);
            }
            found = true;
        }
    });
    
    if (!found && !shiftKey) {
        // Deselect all if clicking on empty space
        selectedMarkers.clear();
    }
    
    updateSelectedCount();
    draw();
}

// Update hovered marker
function updateHoveredMarker(screenX, screenY) {
    const worldPos = screenToWorld(screenX, screenY);
    const threshold = 10 / viewScale; // 10 pixels in world coordinates
    
    let newHoveredIndex = -1;
    let minDistance = Infinity;
    
    markers.forEach((marker, index) => {
        if (!visibleMarkers.has(index) && visibleMarkers.size > 0) {
            return; // Skip hidden markers
        }
        
        const dx = marker.x - worldPos.x;
        const dz = marker.z - worldPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < threshold && distance < minDistance) {
            minDistance = distance;
            newHoveredIndex = index;
        }
    });
    
    if (hoveredMarkerIndex !== newHoveredIndex) {
        hoveredMarkerIndex = newHoveredIndex;
        draw();
    }
}

// Update selected count display
function updateSelectedCount() {
    document.getElementById('selectedCount').textContent = `Selected: ${selectedMarkers.size}`;
}

// Update status message
function updateStatus(message, isError = false) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = isError ? 'status error' : 'status';
}

// Load groups from API
async function loadGroups() {
    const dir = document.getElementById('missionDir').value.trim();
    
    if (!dir) {
        updateStatus('Please enter a mission directory path', true);
        return;
    }
    
    missionDir = dir;
    updateStatus('Loading markers...');
    
    try {
        const response = await fetch(`/api/groups?mission_dir=${encodeURIComponent(missionDir)}`);
        const data = await response.json();
        
        if (!data.success) {
            updateStatus(`Error loading markers: ${data.error}`, true);
            console.error('API Error:', data);
            return;
        }
        
        markers = data.groups || [];
        selectedMarkers.clear();
        visibleMarkers.clear(); // Show all by default
        
        if (markers.length > 0) {
            fitToView();
            updateStatus(`Loaded ${data.count} markers`);
        } else {
            const warning = data.warning || '';
            updateStatus(`No markers found${warning ? ': ' + warning : ''}`, true);
            console.warn('No markers loaded:', data);
        }
        
        updateSelectedCount();
        draw();
    } catch (error) {
        updateStatus(`Error loading markers: ${error.message}`, true);
        console.error('Error loading markers:', error);
    }
}

// Load background image
function loadBackgroundImage() {
    const input = document.getElementById('backgroundImage');
    input.click();
}

// Handle background image file selection
document.getElementById('backgroundImage').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            backgroundImage = img;
            // Set default dimensions based on image size (1 pixel per metre)
            imageWidth = img.width;
            imageHeight = img.height;
            document.getElementById('imageWidth').value = imageWidth;
            document.getElementById('imageHeight').value = imageHeight;
            document.getElementById('imageDimensionsGroup').style.display = 'flex';
            draw();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// Apply image dimensions
function applyImageDimensions() {
    imageWidth = parseFloat(document.getElementById('imageWidth').value) || 1000;
    imageHeight = parseFloat(document.getElementById('imageHeight').value) || 1000;
    draw();
}

// Clear background image
function clearBackgroundImage() {
    backgroundImage = null;
    document.getElementById('backgroundImage').value = '';
    document.getElementById('imageDimensionsGroup').style.display = 'none';
    draw();
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    
    document.getElementById('loadDataBtn').addEventListener('click', loadGroups);
    document.getElementById('showGrid').addEventListener('change', (e) => {
        showGrid = e.target.checked;
        draw();
    });
    document.getElementById('showMarkers').addEventListener('change', (e) => {
        showMarkers = e.target.checked;
        draw();
    });
    document.getElementById('loadImageBtn').addEventListener('click', loadBackgroundImage);
    document.getElementById('clearImageBtn').addEventListener('click', clearBackgroundImage);
    document.getElementById('applyDimensionsBtn').addEventListener('click', applyImageDimensions);
    
    // Allow Enter key to trigger load
    document.getElementById('missionDir').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadGroups();
        }
    });
});

