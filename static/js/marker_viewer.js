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
let isMarqueeSelecting = false;
let marqueeStartX = 0;
let marqueeStartY = 0;
let marqueeCurrentX = 0;
let marqueeCurrentY = 0;
let backgroundCanvas = null;
let backgroundCtx = null;
let backgroundCacheValid = false;
let animationFrameId = null;

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
            // Call handleMouseDown for selection/marquee logic
            handleMouseDown(e);
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
        } else if (isMarqueeSelecting) {
            // Update marquee rectangle
            marqueeCurrentX = x;
            marqueeCurrentY = y;
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
        handleMouseUp(e);
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
    
    // Use a slightly transparent color so background image shows through
    ctx.strokeStyle = 'rgba(204, 204, 204, 0.6)';
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

// Initialize background cache canvas
function initBackgroundCache() {
    if (!backgroundCanvas) {
        backgroundCanvas = document.createElement('canvas');
        backgroundCtx = backgroundCanvas.getContext('2d');
    }
    backgroundCacheValid = false;
}

// Draw background image with optimization
function drawBackgroundImage() {
    if (!backgroundImage) return;
    
    // Calculate visible bounds in world coordinates
    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(canvasWidth, canvasHeight);
    const topRight = screenToWorld(canvasWidth, 0);
    const bottomLeft = screenToWorld(0, canvasHeight);
    
    // Find the visible world bounds
    const visibleMinX = Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const visibleMaxX = Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const visibleMinZ = Math.min(topLeft.z, topRight.z, bottomLeft.z, bottomRight.z);
    const visibleMaxZ = Math.max(topLeft.z, topRight.z, bottomLeft.z, bottomRight.z);
    
    // Calculate the intersection of visible area with image bounds
    const imageMinX = 0;
    const imageMaxX = imageWidth;
    const imageMinZ = 0;
    const imageMaxZ = imageHeight;
    
    // Clamp to image bounds
    const drawMinX = Math.max(visibleMinX, imageMinX);
    const drawMaxX = Math.min(visibleMaxX, imageMaxX);
    const drawMinZ = Math.max(visibleMinZ, imageMinZ);
    const drawMaxZ = Math.min(visibleMaxZ, imageMaxZ);
    
    // If no intersection, don't draw
    if (drawMinX >= drawMaxX || drawMinZ >= drawMaxZ) {
        return;
    }
    
    // Calculate source rectangle in image coordinates (pixels)
    const sourceX = ((drawMinX - imageMinX) / imageWidth) * backgroundImage.width;
    const sourceY = ((imageMaxZ - drawMaxZ) / imageHeight) * backgroundImage.height; // Flip Y
    const sourceWidth = ((drawMaxX - drawMinX) / imageWidth) * backgroundImage.width;
    const sourceHeight = ((drawMaxZ - drawMinZ) / imageHeight) * backgroundImage.height;
    
    // Calculate destination rectangle in screen coordinates
    const destTopLeft = worldToScreen(drawMinX, drawMaxZ);
    const destBottomRight = worldToScreen(drawMaxX, drawMinZ);
    
    const destX = destTopLeft.x;
    const destY = destTopLeft.y;
    const destWidth = destBottomRight.x - destTopLeft.x;
    const destHeight = destBottomRight.y - destTopLeft.y;
    
    // Only draw the visible portion of the image
    ctx.drawImage(
        backgroundImage,
        sourceX, sourceY, sourceWidth, sourceHeight, // Source rectangle
        destX, destY, destWidth, destHeight // Destination rectangle
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
        
        // Draw marker - same radius for all markers
        ctx.fillStyle = isSelected ? '#ff0000' : (isHovered ? '#00ff00' : '#0066ff');
        ctx.strokeStyle = isSelected ? '#cc0000' : (isHovered ? '#00cc00' : '#0044cc');
        ctx.lineWidth = isSelected ? 3 : (isHovered ? 3 : 2);
        
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, isHovered ? 6 : 4, 0, Math.PI * 2);
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

// Draw marquee selection rectangle
function drawMarquee() {
    if (!isMarqueeSelecting) return;
    
    const rectX = Math.min(marqueeStartX, marqueeCurrentX);
    const rectY = Math.min(marqueeStartY, marqueeCurrentY);
    const rectWidth = Math.abs(marqueeCurrentX - marqueeStartX);
    const rectHeight = Math.abs(marqueeCurrentY - marqueeStartY);
    
    // Draw selection rectangle
    ctx.strokeStyle = '#0066ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
    
    // Draw semi-transparent fill
    ctx.fillStyle = 'rgba(0, 102, 255, 0.1)';
    ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
    
    // Reset line dash
    ctx.setLineDash([]);
}

// Main draw function
function draw() {
    // Cancel any pending animation frame
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    // For immediate feedback during pan/zoom, draw synchronously
    // The clipping optimization in drawBackgroundImage handles performance
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw in order: background image, grid, markers, marquee, tooltip
    drawBackgroundImage();
    drawGrid();
    drawMarkers();
    drawMarquee();
    drawTooltip();
}

// Handle mouse down
function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (e.button === 0) { // Left click
        // Check if clicking on a marker first
        // Use screen-space threshold to match marker visual size (4px radius)
        const screenThreshold = 5; // pixels in screen space
        let clickedMarker = false;
        
        markers.forEach((marker, index) => {
            if (!visibleMarkers.has(index) && visibleMarkers.size > 0) {
                return; // Skip hidden markers
            }
            const screenPos = worldToScreen(marker.x, marker.z);
            const dx = screenPos.x - x;
            const dy = screenPos.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < screenThreshold) {
                clickedMarker = true;
            }
        });
        
        if (clickedMarker) {
            // Single click selection on marker
            selectAtPoint(x, y, e.altKey);
        } else {
            // Start marquee selection
            // Don't clear selection here - deselection only happens for markers in the marquee
            isMarqueeSelecting = true;
            marqueeStartX = x;
            marqueeStartY = y;
            marqueeCurrentX = x;
            marqueeCurrentY = y;
            draw();
        }
    }
}

// Handle mouse move
function handleMouseMove(e) {
    // This function is not used but kept for potential future use
}

// Handle mouse up
function handleMouseUp(e) {
    if (e.button === 0 && isMarqueeSelecting) {
        // Finalize marquee selection
        const rectX = Math.min(marqueeStartX, marqueeCurrentX);
        const rectY = Math.min(marqueeStartY, marqueeCurrentY);
        const rectWidth = Math.abs(marqueeCurrentX - marqueeStartX);
        const rectHeight = Math.abs(marqueeCurrentY - marqueeStartY);
        
        // Only select if rectangle is large enough (avoid accidental selection on click)
        if (rectWidth > 5 && rectHeight > 5) {
            // Alt key means deselect mode, otherwise add to selection
            selectMarkersInRectangle(rectX, rectY, rectWidth, rectHeight, !e.altKey);
        }
        
        isMarqueeSelecting = false;
        updateSelectedCount();
        draw();
    }
}

// Select markers within rectangle
function selectMarkersInRectangle(rectX, rectY, rectWidth, rectHeight, addToSelection = true) {
    // Only clear selection if not adding to selection (deselect mode)
    if (!addToSelection) {
        // In deselect mode, we'll remove markers from selection instead of clearing all
        // Don't clear here - we'll deselect markers in the rectangle
    }
    
    // Convert rectangle bounds to world coordinates
    const topLeft = screenToWorld(rectX, rectY);
    const bottomRight = screenToWorld(rectX + rectWidth, rectY + rectHeight);
    
    // Get rectangle bounds in world space
    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minZ = Math.min(topLeft.z, bottomRight.z);
    const maxZ = Math.max(topLeft.z, bottomRight.z);
    
    // Select or deselect markers within the rectangle
    markers.forEach((marker, index) => {
        if (!visibleMarkers.has(index) && visibleMarkers.size > 0) {
            return; // Skip hidden markers
        }
        
        if (marker.x >= minX && marker.x <= maxX &&
            marker.z >= minZ && marker.z <= maxZ) {
            if (addToSelection) {
                // Add to selection
                selectedMarkers.add(index);
            } else {
                // Remove from selection (deselect mode)
                selectedMarkers.delete(index);
            }
        }
    });
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
function selectAtPoint(screenX, screenY, altKey = false) {
    // Use screen-space threshold to match marker visual size (4px radius)
    const screenThreshold = 5; // pixels in screen space, slightly larger than marker radius (4px)
    
    let found = false;
    markers.forEach((marker, index) => {
        if (!visibleMarkers.has(index) && visibleMarkers.size > 0) {
            return; // Skip hidden markers
        }
        
        const screenPos = worldToScreen(marker.x, marker.z);
        const dx = screenPos.x - screenX;
        const dy = screenPos.y - screenY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < screenThreshold) {
            if (altKey) {
                // Alt key pressed - deselect mode
                selectedMarkers.delete(index);
            } else {
                // Normal mode - add to selection
                selectedMarkers.add(index);
            }
            found = true;
        }
    });
    
    // Don't clear selection on empty click - only deselect when Alt is pressed
    // Empty clicks do nothing by default
    
    updateSelectedCount();
    draw();
}

// Update hovered marker
function updateHoveredMarker(screenX, screenY) {
    // Use screen-space threshold to match marker visual size (4px radius)
    const screenThreshold = 5; // pixels in screen space, slightly larger than marker radius (4px)
    
    let newHoveredIndex = -1;
    let minDistance = Infinity;
    
    markers.forEach((marker, index) => {
        if (!visibleMarkers.has(index) && visibleMarkers.size > 0) {
            return; // Skip hidden markers
        }
        
        const screenPos = worldToScreen(marker.x, marker.z);
        const dx = screenPos.x - screenX;
        const dy = screenPos.y - screenY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < screenThreshold && distance < minDistance) {
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
            initBackgroundCache();
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
    backgroundCacheValid = false;
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

