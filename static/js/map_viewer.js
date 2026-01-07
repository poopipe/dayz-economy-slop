// Map Viewer JavaScript

let canvas;
let ctx;
let markers = [];
let selectedMarkers = new Set();
let selectedPlayerSpawnPoints = new Set(); // Selected player spawn points (when editing)
let visibleMarkers = new Set(); // For filtering
let activeFilters = []; // Array of filter objects: { type: 'usage'|'groupName', criteria: 'isOneOf', values: ['name1', 'name2'] }
let effectAreas = []; // Effect areas from cfgeffectareas.json
let eventSpawns = []; // Event spawns from cfgeventspawns.xml
let visibleEventSpawns = new Set(); // For filtering event spawns
let playerSpawnPoints = []; // Player spawn points from cfgplayerspawnpoints.xml
let showPlayerSpawnPoints = true;
let backgroundImage = null;
let imageWidth = 1000; // metres
let imageHeight = 1000; // metres
let showGrid = true;
let showMarkers = true;
let showEventSpawns = true;
let showEffectAreas = true;
let showBackgroundImage = true;
let backgroundImageOpacity = 1.0; // Opacity for background image (0.0 to 1.0)
let activeEventSpawnFilters = []; // Separate filters for event spawns
let territories = []; // Territories from env/*.xml files
let visibleTerritories = new Set(); // For filtering territories
let activeTerritoryFilters = []; // Separate filters for territories
let showTerritories = true;
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

// Consistent threshold for marker interaction (in screen pixels)
const MARKER_INTERACTION_THRESHOLD = 5; // pixels, slightly larger than marker radius (4px)
let isMarqueeSelecting = false;
let marqueeStartX = 0;
let marqueeStartY = 0;
let marqueeCurrentX = 0;
let marqueeCurrentY = 0;
let backgroundCanvas = null;
let backgroundCtx = null;
let backgroundCacheValid = false;
let animationFrameId = null;
let isPanning = false;
let isZooming = false;
let needsRedraw = false;

// Marker editing state
let editingEnabled = {
    playerSpawnPoints: false,
    // Add other marker types here as needed
};
let originalPositions = {
    playerSpawnPoints: new Map(), // Map<index, {x, y, z}>
    // Add other marker types here as needed
};
let isDragging = false;
let draggedMarkerType = null;
let draggedMarkerIndex = -1;
let dragStartX = 0;
let dragStartY = 0;
let dragStartWorldX = 0;
let dragStartWorldZ = 0;
let draggedSelectedSpawnPoints = new Map(); // Map<index, {offsetX, offsetZ}> for multi-marker drag

// WebGL for background image rendering
let gl = null;
let glProgram = null;
let backgroundTexture = null;
let backgroundVBO = null;
let backgroundVAO = null;
let useWebGL = false;

// Request a draw using requestAnimationFrame (throttled)
function requestDraw() {
    if (!needsRedraw) {
        needsRedraw = true;
        if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(() => {
                animationFrameId = null;
                needsRedraw = false;
                draw();
            });
        }
    }
}

// Initialize canvas
function initCanvas() {
    canvas = document.getElementById('markerCanvas');
    ctx = canvas.getContext('2d');
    
    // Get or create background canvas
    backgroundCanvas = document.getElementById('backgroundCanvas');
    if (backgroundCanvas) {
        // Set pointer-events to none so mouse events pass through to marker canvas
        backgroundCanvas.style.pointerEvents = 'none';
        
        // Try to get WebGL context first
        gl = backgroundCanvas.getContext('webgl') || backgroundCanvas.getContext('experimental-webgl');
        if (gl) {
            useWebGL = true;
            initWebGL();
        } else {
            // Fallback to 2D context
            backgroundCtx = backgroundCanvas.getContext('2d');
            useWebGL = false;
        }
    }
    
    // Set canvas size
    resizeCanvas();
    
    // Pan with middle mouse button or space + drag
    let panStartX = 0;
    let panStartY = 0;
    let panStartOffsetX = 0;
    let panStartOffsetY = 0;
    
    // Event listeners
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        // Account for CSS scaling - convert CSS coordinates to canvas pixel coordinates
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        if (e.button === 2) {
            // Right click - copy location
            handleRightClick(x, y);
            e.preventDefault();
        } else if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            // Pan mode
            isPanning = true;
            panStartX = x;
            panStartY = y;
            panStartOffsetX = viewOffsetX;
            panStartOffsetY = viewOffsetY;
            e.preventDefault();
        } else if (e.button === 0) {
            // In edit mode, check for selection/drag first
            if (editingEnabled.playerSpawnPoints) {
                // Check if clicking on a selected spawn point to drag
                if (tryStartDrag(x, y)) {
                    e.preventDefault();
                    return;
                }
                // Check if clicking on a marker to select it
                let clickedOnMarker = false;
                for (let index = 0; index < playerSpawnPoints.length; index++) {
                    const spawnPoint = playerSpawnPoints[index];
                    const screenPos = worldToScreen(spawnPoint.x, spawnPoint.z);
                    const dx = screenPos.x - x;
                    const dy = screenPos.y - y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < MARKER_INTERACTION_THRESHOLD) {
                        clickedOnMarker = true;
                        break;
                    }
                }
                
                if (clickedOnMarker) {
                    // Clicked on a marker - select it
                    selectAtPoint(x, y, e.altKey);
                    e.preventDefault();
                    return;
                }
                // No marker clicked - allow marquee selection to start
                // Don't prevent default, let handleMouseDown handle it
            } else {
                // Not in edit mode - check if we should start dragging a marker
                if (tryStartDrag(x, y)) {
                    e.preventDefault();
                    return;
                }
            }
            // Call handleMouseDown for selection/marquee logic
            handleMouseDown(e);
        }
    });
    
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        // Account for CSS scaling - convert CSS coordinates to canvas pixel coordinates
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        tooltipX = x;
        tooltipY = y;
        
        if (isDragging) {
            // Update marker position during drag
            handleDrag(x, y);
            e.preventDefault();
        } else if (isPanning) {
            viewOffsetX = panStartOffsetX + (x - panStartX);
            viewOffsetY = panStartOffsetY + (y - panStartY);
            hoveredMarkerIndex = -1; // Clear hover when panning
            requestDraw();
        } else if (isMarqueeSelecting) {
            // Update marquee rectangle
            marqueeCurrentX = x;
            marqueeCurrentY = y;
            requestDraw();
        } else {
            // Check for hover
            updateHoveredMarker(x, y);
        }
    });
    
    canvas.addEventListener('mouseup', (e) => {
        if (isDragging && e.button === 0) {
            // End drag on left mouse button release
            handleDragEnd();
            e.preventDefault();
            return;
        } else if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            isPanning = false;
            // Force a full redraw after panning ends
            draw();
        }
        handleMouseUp(e);
    });
    
    // Also handle mouseup on window to catch cases where mouse leaves canvas during drag
    window.addEventListener('mouseup', (e) => {
        if (isDragging && e.button === 0) {
            handleDragEnd();
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
    
    // Resize background canvas if it exists
    if (backgroundCanvas) {
        backgroundCanvas.width = canvasWidth;
        backgroundCanvas.height = canvasHeight;
    }
    
    // Update WebGL viewport if using WebGL
    if (gl && useWebGL) {
        gl.viewport(0, 0, canvasWidth, canvasHeight);
    }
}

// Initialize WebGL for background rendering
function initWebGL() {
    if (!gl) return;
    
    // Vertex shader - simple pass-through
    const vertexShaderSource = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        uniform vec2 u_resolution;
        
        void main() {
            vec2 clipSpace = ((a_position / u_resolution) * 2.0) - 1.0;
            gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
            v_texCoord = a_texCoord;
        }
    `;
    
    // Fragment shader - texture sampling with opacity
    const fragmentShaderSource = `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform float u_opacity;
        varying vec2 v_texCoord;
        
        void main() {
            vec4 texColor = texture2D(u_texture, v_texCoord);
            gl_FragColor = vec4(texColor.rgb, texColor.a * u_opacity);
        }
    `;
    
    // Compile shaders
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (!vertexShader || !fragmentShader) {
        useWebGL = false;
        return;
    }
    
    // Create program
    glProgram = gl.createProgram();
    gl.attachShader(glProgram, vertexShader);
    gl.attachShader(glProgram, fragmentShader);
    gl.linkProgram(glProgram);
    
    if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
        console.error('WebGL program link error:', gl.getProgramInfoLog(glProgram));
        useWebGL = false;
        return;
    }
    
    // Create texture
    backgroundTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

// Compile WebGL shader
function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    
    return shader;
}

// Upload background image to WebGL texture
function uploadBackgroundToWebGL() {
    if (!gl || !backgroundImage || !backgroundTexture) {
        return;
    }
    
    gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, backgroundImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    // Force a redraw after texture upload
    requestDraw();
}

// Draw background using WebGL (much faster)
function drawBackgroundImageWebGL() {
    if (!gl || !backgroundImage || !backgroundTexture || !glProgram) return;
    
    // Calculate visible bounds
    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(canvasWidth, canvasHeight);
    const topRight = screenToWorld(canvasWidth, 0);
    const bottomLeft = screenToWorld(0, canvasHeight);
    
    const visibleMinX = Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const visibleMaxX = Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const visibleMinZ = Math.min(topLeft.z, topRight.z, bottomLeft.z, bottomRight.z);
    const visibleMaxZ = Math.max(topLeft.z, topRight.z, bottomLeft.z, bottomRight.z);
    
    // Clamp to image bounds
    const drawMinX = Math.max(visibleMinX, 0);
    const drawMaxX = Math.min(visibleMaxX, imageWidth);
    const drawMinZ = Math.max(visibleMinZ, 0);
    const drawMaxZ = Math.min(visibleMaxZ, imageHeight);
    
    if (drawMinX >= drawMaxX || drawMinZ >= drawMaxZ) return;
    
    // Calculate texture coordinates
    const texMinX = drawMinX / imageWidth;
    const texMaxX = drawMaxX / imageWidth;
    const texMinY = 1.0 - (drawMaxZ / imageHeight); // Flip Y
    const texMaxY = 1.0 - (drawMinZ / imageHeight);
    
    // Calculate screen coordinates
    const destTopLeft = worldToScreen(drawMinX, drawMaxZ);
    const destBottomRight = worldToScreen(drawMaxX, drawMinZ);
    
    // Create quad vertices
    const x1 = destTopLeft.x;
    const y1 = destTopLeft.y;
    const x2 = destBottomRight.x;
    const y2 = destBottomRight.y;
    
    // Setup WebGL state
    gl.useProgram(glProgram);
    
    // Create and bind vertex buffer
    const positions = new Float32Array([
        x1, y1,  // Top-left
        x2, y1,  // Top-right
        x1, y2,  // Bottom-left
        x2, y2   // Bottom-right
    ]);
    
    const texCoords = new Float32Array([
        texMinX, texMinY,  // Top-left
        texMaxX, texMinY,  // Top-right
        texMinX, texMaxY,  // Bottom-left
        texMaxX, texMaxY   // Bottom-right
    ]);
    
    // Create position buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    
    const positionLocation = gl.getAttribLocation(glProgram, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    // Create texture coordinate buffer
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    
    const texCoordLocation = gl.getAttribLocation(glProgram, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
    
    // Set uniforms
    const resolutionLocation = gl.getUniformLocation(glProgram, 'u_resolution');
    gl.uniform2f(resolutionLocation, canvasWidth, canvasHeight);
    
    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);
    const textureLocation = gl.getUniformLocation(glProgram, 'u_texture');
    gl.uniform1i(textureLocation, 0);
    
    // Set opacity uniform
    const opacityLocation = gl.getUniformLocation(glProgram, 'u_opacity');
    gl.uniform1f(opacityLocation, backgroundImageOpacity);
    
    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    // Cleanup
    gl.deleteBuffer(positionBuffer);
    gl.deleteBuffer(texCoordBuffer);
    gl.disable(gl.BLEND);
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
        // Check if this is a 1km line (divisible by 1000)
        const isKilometerLine = x % 1000 === 0;
        // Use full opacity for 1km lines, half opacity for regular 100m lines
        ctx.strokeStyle = isKilometerLine ? 'rgba(204, 204, 204, 0.6)' : 'rgba(204, 204, 204, 0.3)';
        
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
        // Check if this is a 1km line (divisible by 1000)
        const isKilometerLine = z % 1000 === 0;
        // Use full opacity for 1km lines, half opacity for regular 100m lines
        ctx.strokeStyle = isKilometerLine ? 'rgba(204, 204, 204, 0.6)' : 'rgba(204, 204, 204, 0.3)';
        
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
        backgroundCanvas = document.getElementById('backgroundCanvas');
        if (!backgroundCanvas) {
            backgroundCanvas = document.createElement('canvas');
            backgroundCanvas.id = 'backgroundCanvas';
            backgroundCanvas.style.position = 'absolute';
            backgroundCanvas.style.top = '0';
            backgroundCanvas.style.left = '0';
            backgroundCanvas.style.zIndex = '0';
            backgroundCanvas.style.pointerEvents = 'none'; // Allow mouse events to pass through
            // Insert before marker canvas
            const container = canvas.parentElement;
            container.insertBefore(backgroundCanvas, canvas);
        }
        // Ensure pointer-events is set
        backgroundCanvas.style.pointerEvents = 'none';
        if (!backgroundCtx && !useWebGL) {
            backgroundCtx = backgroundCanvas.getContext('2d');
        }
    }
    backgroundCacheValid = false;
}

// Draw background image - uses WebGL if available for better performance
function drawBackgroundImage() {
    if (!backgroundImage) return;
    
    // Use WebGL if available (much faster)
    if (useWebGL && gl && backgroundTexture) {
        drawBackgroundImageWebGL();
        return;
    }
    
    // Fallback to 2D canvas rendering
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
    
    // Draw directly to main canvas with opacity
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = backgroundImageOpacity;
    ctx.drawImage(
        backgroundImage,
        sourceX, sourceY, sourceWidth, sourceHeight, // Source rectangle
        destX, destY, destWidth, destHeight // Destination rectangle
    );
    ctx.restore();
}

// Draw effect area circles
function drawEffectAreas() {
    if (!showEffectAreas) {
        return;
    }
    
    if (effectAreas.length === 0) {
        return;
    }
    
    effectAreas.forEach(area => {
        // Convert world coordinates to screen coordinates
        // Note: z coordinate needs to be reversed since origin is in lower left
        const screenPos = worldToScreen(area.x, area.z);
        
        // Convert radius from world units (metres) to screen pixels
        const screenRadius = area.radius * viewScale;
        
        // Skip if position is invalid or radius is too small
        if (!isFinite(screenPos.x) || !isFinite(screenPos.y) || !isFinite(screenRadius) || screenRadius < 1) {
            return;
        }
        
        // Increase visibility when zoomed out - adjust opacity
        // When zoomed out (viewScale < 1), make circles more visible
        const baseAlpha = 0.3;
        const zoomedOutAlpha = Math.min(0.6, baseAlpha + (1.0 - viewScale) * 0.3);
        const alpha = viewScale < 1.0 ? zoomedOutAlpha : baseAlpha;
        
        // Draw circle with orange color and transparency
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ff8800'; // Orange
        ctx.strokeStyle = '#ff6600'; // Slightly darker orange for border
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.restore();
    });
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

// Draw event spawn markers
function drawEventSpawns() {
    if (!showEventSpawns || eventSpawns.length === 0) {
        return;
    }
    
    eventSpawns.forEach((spawn, index) => {
        // If filters are active (visibleEventSpawns has items), only show items in the set
        // If no filters (visibleEventSpawns is empty), show all items
        if (visibleEventSpawns.size > 0 && !visibleEventSpawns.has(index)) {
            return; // Skip hidden event spawns
        }
        
        const screenPos = worldToScreen(spawn.x, spawn.z);
        
        // Skip if position is invalid
        if (!isFinite(screenPos.x) || !isFinite(screenPos.y)) {
            return;
        }
        
        const isHovered = hoveredMarkerIndex === index + markers.length; // Offset by markers length
        
        // Draw event spawn marker in purple color to distinguish from regular markers
        ctx.fillStyle = isHovered ? '#ff00ff' : '#9900cc';
        ctx.strokeStyle = isHovered ? '#cc00cc' : '#7700aa';
        ctx.lineWidth = isHovered ? 3 : 2;
        
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, isHovered ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
}

// Draw territory circles and zone markers
function drawTerritories() {
    if (!showTerritories) {
        return;
    }
    
    if (territories.length === 0) {
        return;
    }
    
    let drawnTerritories = 0;
    let drawnZones = 0;
    let zoneIndexOffset = markers.length + eventSpawns.length;
    
    territories.forEach((territory, territoryIndex) => {
        // Check if territory is visible (filtered)
        if (visibleTerritories.size > 0 && !visibleTerritories.has(territoryIndex)) {
            return; // Skip hidden territories
        }
        
        // Draw territory bounding circle (transparent)
        const centerScreenPos = worldToScreen(territory.center_x, territory.center_z);
        const screenRadius = territory.radius * viewScale;
        
        if (isFinite(centerScreenPos.x) && isFinite(centerScreenPos.y) && isFinite(screenRadius) && screenRadius > 1) {
            ctx.save();
            ctx.globalAlpha = 0.2; // Quite transparent
            ctx.fillStyle = territory.color;
            ctx.strokeStyle = territory.color;
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.arc(centerScreenPos.x, centerScreenPos.y, screenRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            ctx.restore();
            drawnTerritories++;
        }
        
        // Draw zone markers within territory
        territory.zones.forEach((zone, zoneIndex) => {
            const zoneScreenPos = worldToScreen(zone.x, zone.z);
            
            if (!isFinite(zoneScreenPos.x) || !isFinite(zoneScreenPos.y)) {
                return;
            }
            
            // Calculate offset for hover detection (markers + event spawns + previous zones)
            const zoneMarkerIndex = zoneIndexOffset + zoneIndex;
            const isHovered = hoveredMarkerIndex === zoneMarkerIndex;
            
            // Draw zone marker using territory color
            ctx.fillStyle = territory.color;
            ctx.strokeStyle = isHovered ? '#ffffff' : territory.color;
            ctx.lineWidth = isHovered ? 3 : 2;
            
            ctx.beginPath();
            ctx.arc(zoneScreenPos.x, zoneScreenPos.y, isHovered ? 6 : 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            drawnZones++;
        });
        
        zoneIndexOffset += territory.zones.length;
    });
}

// Draw player spawn point markers and rectangles
function drawPlayerSpawnPoints() {
    if (!showPlayerSpawnPoints || playerSpawnPoints.length === 0) {
        return;
    }
    
    // Calculate offset for hover detection
    const spawnPointOffset = markers.length + eventSpawns.length + 
        territories.reduce((sum, t) => sum + t.zones.length, 0);
    
    const isEditing = editingEnabled.playerSpawnPoints;
    const isDraggingThisType = isDragging && draggedMarkerType === 'playerSpawnPoints';
    
    playerSpawnPoints.forEach((spawnPoint, index) => {
        const screenPos = worldToScreen(spawnPoint.x, spawnPoint.z);
        
        // Skip if position is invalid
        if (!isFinite(screenPos.x) || !isFinite(screenPos.y)) {
            return;
        }
        
        const isHovered = hoveredMarkerIndex === spawnPointOffset + index;
        const isBeingDragged = isDraggingThisType && (draggedMarkerIndex === index || draggedSelectedSpawnPoints.has(index));
        const isSelected = selectedPlayerSpawnPoints.has(index);
        const hasUnsavedChanges = originalPositions.playerSpawnPoints.has(index);
        
        // Draw rectangle (more transparent)
        const screenWidth = spawnPoint.width * viewScale;
        const screenHeight = spawnPoint.height * viewScale;
        
        ctx.save();
        ctx.globalAlpha = 0.15; // More transparent
        ctx.fillStyle = '#00ffff'; // Cyan color
        ctx.strokeStyle = isHovered ? '#00ffff' : '#00aaaa';
        ctx.lineWidth = isHovered ? 2 : 1;
        
        // Draw rectangle centered on the spawn point
        const rectX = screenPos.x - screenWidth / 2;
        const rectY = screenPos.y - screenHeight / 2;
        
        ctx.fillRect(rectX, rectY, screenWidth, screenHeight);
        ctx.strokeRect(rectX, rectY, screenWidth, screenHeight);
        
        ctx.restore();
        
        // Draw marker (more visible)
        // Use different color if editing and has unsaved changes or if selected
        if (isEditing && (hasUnsavedChanges || isSelected)) {
            if (isSelected) {
                ctx.fillStyle = isBeingDragged ? '#ffff00' : '#ff8800'; // Yellow/Orange for selected
                ctx.strokeStyle = isBeingDragged ? '#ffffff' : '#ff6600';
            } else {
                ctx.fillStyle = isBeingDragged ? '#ffff00' : '#ffaa00'; // Yellow/Orange for unsaved
                ctx.strokeStyle = isBeingDragged ? '#ffffff' : '#ff8800';
            }
        } else {
            ctx.fillStyle = isHovered ? '#00ffff' : '#00aaaa';
            ctx.strokeStyle = isHovered ? '#ffffff' : '#008888';
        }
        ctx.lineWidth = isHovered || isBeingDragged || isSelected ? 3 : 2;
        
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, isHovered || isBeingDragged ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
}

// Format a value for tooltip display (handles arrays/lists)
function formatTooltipValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    
    // Handle arrays/lists
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '';
        }
        // Return array items, one per line (indented)
        return value.map(item => `  • ${item}`).join('\n');
    }
    
    // Handle objects (for future use)
    if (typeof value === 'object') {
        // Convert object to key-value pairs
        const pairs = [];
        for (const [key, val] of Object.entries(value)) {
            if (val !== null && val !== undefined && val !== '') {
                pairs.push(`  ${key}: ${val}`);
            }
        }
        return pairs.length > 0 ? pairs.join('\n') : '';
    }
    
    // Handle simple values
    return String(value);
}

// Draw tooltip
function drawTooltip() {
    if (hoveredMarkerIndex < 0) {
        return;
    }
    
    // Determine what type of marker we're hovering over
    let marker, isEventSpawn, isZone, isPlayerSpawnPoint;
    const eventSpawnOffset = markers.length;
    const zoneOffset = eventSpawnOffset + eventSpawns.length;
    const playerSpawnPointOffset = zoneOffset + territories.reduce((sum, t) => sum + t.zones.length, 0);
    
    if (hoveredMarkerIndex < eventSpawnOffset) {
        // Regular marker
        // Check if markers are enabled and marker is visible
        if (!showMarkers) {
            return; // Don't show tooltip if markers are hidden
        }
        if (visibleMarkers.size > 0 && !visibleMarkers.has(hoveredMarkerIndex)) {
            return; // Don't show tooltip for hidden markers
        }
        marker = markers[hoveredMarkerIndex];
        isEventSpawn = false;
        isZone = false;
        isPlayerSpawnPoint = false;
    } else if (hoveredMarkerIndex < zoneOffset) {
        // Event spawn
        // Check if event spawns are enabled
        if (!showEventSpawns) {
            return; // Don't show tooltip if event spawns are hidden
        }
        const eventSpawnIndex = hoveredMarkerIndex - eventSpawnOffset;
        if (eventSpawnIndex >= eventSpawns.length) {
            return;
        }
        // Check if event spawn is visible
        if (visibleEventSpawns.size > 0 && !visibleEventSpawns.has(eventSpawnIndex)) {
            return; // Don't show tooltip for hidden event spawns
        }
        marker = eventSpawns[eventSpawnIndex];
        isEventSpawn = true;
        isZone = false;
        isPlayerSpawnPoint = false;
    } else if (hoveredMarkerIndex < playerSpawnPointOffset) {
        // Zone marker
        // Check if territories are enabled
        if (!showTerritories) {
            return; // Don't show tooltip if territories are hidden
        }
        let zoneIndex = hoveredMarkerIndex - zoneOffset;
        let found = false;
        for (const territory of territories) {
            if (visibleTerritories.size > 0 && !visibleTerritories.has(territories.indexOf(territory))) {
                continue; // Skip hidden territories
            }
            if (zoneIndex < territory.zones.length) {
                marker = territory.zones[zoneIndex];
                found = true;
                break;
            }
            zoneIndex -= territory.zones.length;
        }
        if (!found) {
            return;
        }
        isEventSpawn = false;
        isZone = true;
        isPlayerSpawnPoint = false;
    } else {
        // Player spawn point
        // Check if player spawn points are enabled
        if (!showPlayerSpawnPoints) {
            return; // Don't show tooltip if player spawn points are hidden
        }
        const spawnPointIndex = hoveredMarkerIndex - playerSpawnPointOffset;
        if (spawnPointIndex >= playerSpawnPoints.length) {
            return;
        }
        marker = playerSpawnPoints[spawnPointIndex];
        isEventSpawn = false;
        isZone = false;
        isPlayerSpawnPoint = true;
    }
    const padding = 8;
    const lineHeight = 18;
    const fontSize = 12;
    
    // Build tooltip content - initially only name and coordinates
    const lines = [];
    
    // Name on first line
    if (isPlayerSpawnPoint) {
        lines.push('Player Spawn Point');
    } else if (marker.name) {
        lines.push(marker.name);
    } else {
        lines.push('(Unnamed)');
    }
    
    // Empty line separator
    lines.push('');
    
    // Coordinates on separate lines
    lines.push(`X: ${marker.x.toFixed(2)} m`);
    lines.push(`Y: ${marker.y.toFixed(2)} m`);
    lines.push(`Z: ${marker.z.toFixed(2)} m`);
    
    // Display rectangle dimensions for player spawn points
    if (isPlayerSpawnPoint) {
        lines.push('');
        lines.push(`Rectangle Width: ${marker.width.toFixed(2)} m`);
        lines.push(`Rectangle Height: ${marker.height.toFixed(2)} m`);
    }
    
    // Display usage if available
    // Usage can be a string, array, or in proto_children
    const usageNames = [];
    
    // Check direct usage property (from mapgrouppos.xml)
    if (marker.usage) {
        if (Array.isArray(marker.usage)) {
            marker.usage.forEach(u => {
                if (typeof u === 'object' && u.name) {
                    usageNames.push(u.name);
                } else if (typeof u === 'string' && u.trim()) {
                    usageNames.push(u.trim());
                }
            });
        } else if (typeof marker.usage === 'object' && marker.usage.name) {
            usageNames.push(marker.usage.name);
        } else if (typeof marker.usage === 'string' && marker.usage.trim()) {
            usageNames.push(marker.usage.trim());
        }
    }
    
    // Check proto_children for usage (from mapgroupproto.xml)
    if (marker.proto_children && typeof marker.proto_children === 'object') {
        if (marker.proto_children.usage) {
            const usage = marker.proto_children.usage;
            if (Array.isArray(usage)) {
                usage.forEach(u => {
                    if (typeof u === 'object' && u.name) {
                        usageNames.push(u.name);
                    } else if (typeof u === 'string' && u.trim()) {
                        usageNames.push(u.trim());
                    }
                });
            } else if (typeof usage === 'object' && usage.name) {
                usageNames.push(usage.name);
            } else if (typeof usage === 'string' && usage.trim()) {
                usageNames.push(usage.trim());
            }
        }
    }
    
    // Remove duplicates and display usage names if found
    const uniqueUsageNames = [...new Set(usageNames)];
    if (uniqueUsageNames.length > 0) {
        lines.push('');
        lines.push('Usage:');
        uniqueUsageNames.forEach(name => {
            lines.push(`  • ${name}`);
        });
    }
    
    // Display categories for event spawns
    if (isEventSpawn && marker.categories && Array.isArray(marker.categories) && marker.categories.length > 0) {
        lines.push('');
        lines.push('Category:');
        marker.categories.forEach(cat => {
            lines.push(`  • ${cat}`);
        });
    }
    
    // Display territory info for zones
    if (isZone) {
        // Find which territory this zone belongs to
        for (const territory of territories) {
            if (territory.zones.some(z => z === marker)) {
                lines.push('');
                lines.push(`Territory: ${territory.name}`);
                lines.push(`Territory Type: ${territory.territory_type}`);
                break;
            }
        }
    }
    
    // Display container elements by name
    const containerNames = [];
    
    // Check proto_children for container elements
    if (marker.proto_children && typeof marker.proto_children === 'object') {
        // Look for container or containers in proto_children
        if (marker.proto_children.container) {
            const container = marker.proto_children.container;
            if (Array.isArray(container)) {
                container.forEach(c => {
                    if (typeof c === 'object' && c.name) {
                        containerNames.push(c.name);
                    } else if (typeof c === 'string' && c) {
                        containerNames.push(c);
                    }
                });
            } else if (typeof container === 'object' && container.name) {
                containerNames.push(container.name);
            } else if (typeof container === 'string' && container) {
                containerNames.push(container);
            }
        }
        if (marker.proto_children.containers) {
            const containers = marker.proto_children.containers;
            if (Array.isArray(containers)) {
                containers.forEach(c => {
                    if (typeof c === 'object' && c.name) {
                        containerNames.push(c.name);
                    } else if (typeof c === 'string' && c) {
                        containerNames.push(c);
                    }
                });
            }
        }
    }
    
    // Also check if container is a direct property
    if (marker.container) {
        if (Array.isArray(marker.container)) {
            marker.container.forEach(c => {
                if (typeof c === 'object' && c.name) {
                    containerNames.push(c.name);
                } else if (typeof c === 'string' && c) {
                    containerNames.push(c);
                }
            });
        } else if (typeof marker.container === 'object' && marker.container.name) {
            containerNames.push(marker.container.name);
        } else if (typeof marker.container === 'string' && marker.container) {
            containerNames.push(marker.container);
        }
    }
    
    // Display container names if found
    if (containerNames.length > 0) {
        lines.push('');
        lines.push('Containers:');
        containerNames.forEach(name => {
            lines.push(`  • ${name}`);
        });
    }
    
    if (lines.length === 0) return;
    
    // Calculate tooltip dimensions (accounting for multi-line values)
    ctx.font = `${fontSize}px Arial`;
    let maxWidth = 0;
    let totalHeight = 0;
    
    lines.forEach(line => {
        const width = ctx.measureText(line).width;
        if (width > maxWidth) {
            maxWidth = width;
        }
        totalHeight += lineHeight;
    });
    
    const tooltipWidth = maxWidth + padding * 2;
    const tooltipHeight = totalHeight + padding * 2;
    
    // Position tooltip relative to cursor center (tooltipX, tooltipY)
    // This ensures tooltip aligns with where the user is pointing
    const offsetX = 15;
    const offsetY = 15;
    
    // Position tooltip to the right and above the cursor by default
    let tooltipXPos = tooltipX + offsetX;
    let tooltipYPos = tooltipY - tooltipHeight - offsetY;
    
    // Keep tooltip on screen - adjust if it goes off the right edge
    if (tooltipXPos + tooltipWidth > canvasWidth) {
        // Position to the left of the cursor instead
        tooltipXPos = tooltipX - tooltipWidth - offsetX;
    }
    
    // Keep tooltip on screen - adjust if it goes off the top edge
    if (tooltipYPos < 0) {
        // Position below the cursor instead
        tooltipYPos = tooltipY + offsetY;
    }
    
    // Also check bottom edge
    if (tooltipYPos + tooltipHeight > canvasHeight) {
        tooltipYPos = canvasHeight - tooltipHeight - padding;
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
    let currentY = tooltipYPos + padding + lineHeight;
    
    lines.forEach((line, i) => {
        ctx.fillText(line, tooltipXPos + padding, currentY - 4);
        currentY += lineHeight;
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
    needsRedraw = false;
    
    // Draw background image to background canvas (only if showBackgroundImage is true)
    if (showBackgroundImage) {
        if (useWebGL && gl && backgroundCanvas && backgroundImage) {
            // Clear and draw background on WebGL canvas
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvasWidth, canvasHeight);
            gl.clearColor(0.18, 0.20, 0.25, 1.0); // nord0: #2E3440 (background when no image)
            gl.clear(gl.COLOR_BUFFER_BIT);
            drawBackgroundImageWebGL(); // Draw background on WebGL canvas
        } else if (backgroundCtx && backgroundCanvas && backgroundImage) {
            // Clear and draw background on 2D canvas
            backgroundCtx.clearRect(0, 0, canvasWidth, canvasHeight);
            // Fill with nord0 background first
            backgroundCtx.fillStyle = '#2E3440'; // nord0
            backgroundCtx.fillRect(0, 0, canvasWidth, canvasHeight);
            const oldCtx = ctx;
            ctx = backgroundCtx; // Temporarily use background context
            drawBackgroundImage();
            ctx = oldCtx; // Restore main context
        }
    } else {
        // Hide background image by clearing the background canvas
        if (useWebGL && gl && backgroundCanvas) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvasWidth, canvasHeight);
            gl.clearColor(0.18, 0.20, 0.25, 1.0); // nord0: #2E3440
            gl.clear(gl.COLOR_BUFFER_BIT);
        } else if (backgroundCtx && backgroundCanvas) {
            backgroundCtx.clearRect(0, 0, canvasWidth, canvasHeight);
            backgroundCtx.fillStyle = '#2E3440'; // nord0
            backgroundCtx.fillRect(0, 0, canvasWidth, canvasHeight);
        }
    }
    
    // Clear main canvas (transparent - background image shows through from background canvas)
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw grid, markers, event spawns, territories, player spawn points, effect areas, marquee on main canvas
    drawGrid();
    drawMarkers();
    drawEventSpawns(); // Draw event spawn markers (after regular markers)
    drawTerritories(); // Draw territory circles and zone markers
    drawPlayerSpawnPoints(); // Draw player spawn point markers and rectangles
    drawEffectAreas(); // Draw effect area circles (after markers so they're on top)
    drawMarquee();
    drawTooltip();
}

// Handle mouse down
function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    // Account for CSS scaling - convert CSS coordinates to canvas pixel coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    if (e.button === 0) { // Left click
        // Check if clicking on a marker first
        // Use consistent threshold for marker interaction
        let clickedMarker = false;
        
        markers.forEach((marker, index) => {
            if (!visibleMarkers.has(index) && visibleMarkers.size > 0) {
                return; // Skip hidden markers
            }
            const screenPos = worldToScreen(marker.x, marker.z);
            const dx = screenPos.x - x;
            const dy = screenPos.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < MARKER_INTERACTION_THRESHOLD) {
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
            requestDraw();
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
    
    // Also select player spawn points if editing is enabled
    if (editingEnabled.playerSpawnPoints && showPlayerSpawnPoints) {
        playerSpawnPoints.forEach((spawnPoint, index) => {
            if (spawnPoint.x >= minX && spawnPoint.x <= maxX &&
                spawnPoint.z >= minZ && spawnPoint.z <= maxZ) {
                if (addToSelection) {
                    selectedPlayerSpawnPoints.add(index);
                } else {
                    selectedPlayerSpawnPoints.delete(index);
                }
            }
        });
    }
}

// Handle wheel (zoom)
function handleWheel(e) {
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    // Account for CSS scaling - convert CSS coordinates to canvas pixel coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    
    // Get world coordinates at mouse position before zoom
    const worldPoint = screenToWorld(mouseX, mouseY);
    
    // Adjust scale
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    viewScale *= zoomFactor;
    viewScale = Math.max(0.1, Math.min(10, viewScale)); // Limit zoom
    
    // Calculate what the screen position of the world point would be with new scale
    const newScreenPos = worldToScreen(worldPoint.x, worldPoint.z);
    
    // Adjust offset so the world point stays at the cursor position
    viewOffsetX += mouseX - newScreenPos.x;
    viewOffsetY += mouseY - newScreenPos.y;
    
    requestDraw();
}

// Select marker at point
function selectAtPoint(screenX, screenY, altKey = false) {
    // Use consistent threshold for marker interaction
    let found = false;
    
    // Check player spawn points first if editing is enabled
    if (editingEnabled.playerSpawnPoints && showPlayerSpawnPoints) {
        const spawnPointOffset = markers.length + eventSpawns.length + 
            territories.reduce((sum, t) => sum + t.zones.length, 0);
        
        for (let index = 0; index < playerSpawnPoints.length; index++) {
            const spawnPoint = playerSpawnPoints[index];
            const screenPos = worldToScreen(spawnPoint.x, spawnPoint.z);
            const dx = screenPos.x - screenX;
            const dy = screenPos.y - screenY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < MARKER_INTERACTION_THRESHOLD) {
                if (altKey) {
                    // Alt key pressed - deselect mode
                    selectedPlayerSpawnPoints.delete(index);
                } else {
                    // Normal mode - add to selection
                    selectedPlayerSpawnPoints.add(index);
                }
                found = true;
                break; // Only select one at a time
            }
        }
    }
    
    // Check regular markers if no spawn point was clicked
    if (!found) {
        markers.forEach((marker, index) => {
            if (!visibleMarkers.has(index) && visibleMarkers.size > 0) {
                return; // Skip hidden markers
            }
            
            const screenPos = worldToScreen(marker.x, marker.z);
            const dx = screenPos.x - screenX;
            const dy = screenPos.y - screenY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < MARKER_INTERACTION_THRESHOLD) {
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
    }
    
    // Don't clear selection on empty click - only deselect when Alt is pressed
    // Empty clicks do nothing by default
    
    updateSelectedCount();
    draw();
}

// Update hovered marker
function updateHoveredMarker(screenX, screenY) {
    // Use consistent threshold for marker interaction
    let newHoveredIndex = -1;
    let minDistance = Infinity;
    
    // Check regular markers (only if showMarkers is true)
    if (showMarkers) {
        markers.forEach((marker, index) => {
            if (!visibleMarkers.has(index) && visibleMarkers.size > 0) {
                return; // Skip hidden markers
            }
            
            const screenPos = worldToScreen(marker.x, marker.z);
            const dx = screenPos.x - screenX;
            const dy = screenPos.y - screenY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < MARKER_INTERACTION_THRESHOLD && distance < minDistance) {
                minDistance = distance;
                newHoveredIndex = index;
            }
        });
    }
    
    // Check event spawns (offset index by markers.length)
    if (showEventSpawns) {
        eventSpawns.forEach((spawn, index) => {
            if (!visibleEventSpawns.has(index) && visibleEventSpawns.size > 0) {
                return; // Skip hidden event spawns
            }
            
            const screenPos = worldToScreen(spawn.x, spawn.z);
            const dx = screenPos.x - screenX;
            const dy = screenPos.y - screenY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < MARKER_INTERACTION_THRESHOLD && distance < minDistance) {
                minDistance = distance;
                newHoveredIndex = index + markers.length; // Offset by markers length
            }
        });
    }
    
    // Check zone markers (offset by markers.length + eventSpawns.length)
    if (showTerritories) {
        let zoneIndexOffset = markers.length + eventSpawns.length;
        territories.forEach((territory, territoryIndex) => {
            if (!visibleTerritories.has(territoryIndex) && visibleTerritories.size > 0) {
                zoneIndexOffset += territory.zones.length; // Skip zones in hidden territories
                return;
            }
            
            territory.zones.forEach((zone, zoneIndex) => {
                const screenPos = worldToScreen(zone.x, zone.z);
                const dx = screenPos.x - screenX;
                const dy = screenPos.y - screenY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < MARKER_INTERACTION_THRESHOLD && distance < minDistance) {
                    minDistance = distance;
                    newHoveredIndex = zoneIndexOffset + zoneIndex;
                }
            });
            
            zoneIndexOffset += territory.zones.length;
        });
    }
    
    // Check player spawn points (offset by markers + event spawns + zones)
    // Only check if not currently dragging (to avoid hover conflicts during drag)
    if (showPlayerSpawnPoints && !isDragging) {
        const spawnPointOffset = markers.length + eventSpawns.length + 
            territories.reduce((sum, t) => sum + t.zones.length, 0);
        
        playerSpawnPoints.forEach((spawnPoint, index) => {
            const screenPos = worldToScreen(spawnPoint.x, spawnPoint.z);
            const dx = screenPos.x - screenX;
            const dy = screenPos.y - screenY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < MARKER_INTERACTION_THRESHOLD && distance < minDistance) {
                minDistance = distance;
                newHoveredIndex = spawnPointOffset + index;
            }
        });
    }
    
    if (hoveredMarkerIndex !== newHoveredIndex) {
        hoveredMarkerIndex = newHoveredIndex;
        draw();
    }
}

// Get location string for a marker or world coordinates
function getLocationString(markerOrCoords) {
    let x, y, z;
    
    if (markerOrCoords && typeof markerOrCoords === 'object') {
        // It's a marker object
        x = markerOrCoords.x;
        y = markerOrCoords.y !== undefined ? markerOrCoords.y : 0;
        z = markerOrCoords.z;
    } else if (markerOrCoords && typeof markerOrCoords === 'number') {
        // It's a single coordinate (shouldn't happen, but handle it)
        x = markerOrCoords;
        y = 0;
        z = 0;
    } else {
        // Fallback
        x = 0;
        y = 0;
        z = 0;
    }
    
    // Format as "x,y,z" with y defaulting to 0 if not available
    return `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
}

// Handle right click to copy location
async function handleRightClick(screenX, screenY) {
    let locationString = '';
    let locationSource = '';
    
    // Check if we're hovering over a marker
    if (hoveredMarkerIndex >= 0) {
        // Get the marker based on its index
        const eventSpawnOffset = markers.length;
        const zoneOffset = eventSpawnOffset + eventSpawns.length;
        const playerSpawnPointOffset = zoneOffset + territories.reduce((sum, t) => sum + t.zones.length, 0);
        
        let marker = null;
        
        if (hoveredMarkerIndex < eventSpawnOffset) {
            // Regular marker
            if (hoveredMarkerIndex < markers.length) {
                marker = markers[hoveredMarkerIndex];
                locationSource = 'marker';
            }
        } else if (hoveredMarkerIndex < zoneOffset) {
            // Event spawn
            const eventSpawnIndex = hoveredMarkerIndex - eventSpawnOffset;
            if (eventSpawnIndex < eventSpawns.length) {
                marker = eventSpawns[eventSpawnIndex];
                locationSource = 'event spawn';
            }
        } else if (hoveredMarkerIndex < playerSpawnPointOffset) {
            // Zone marker
            let zoneIndex = hoveredMarkerIndex - zoneOffset;
            for (const territory of territories) {
                if (zoneIndex < territory.zones.length) {
                    marker = territory.zones[zoneIndex];
                    locationSource = 'zone';
                    break;
                }
                zoneIndex -= territory.zones.length;
            }
        } else {
            // Player spawn point
            const spawnPointIndex = hoveredMarkerIndex - playerSpawnPointOffset;
            if (spawnPointIndex < playerSpawnPoints.length) {
                marker = playerSpawnPoints[spawnPointIndex];
                locationSource = 'spawn point';
            }
        }
        
        if (marker) {
            locationString = getLocationString(marker);
        }
    }
    
    // If no marker, use cursor position in world coordinates
    if (!locationString) {
        const worldCoords = screenToWorld(screenX, screenY);
        locationString = getLocationString({ x: worldCoords.x, y: 0, z: worldCoords.z });
        locationSource = 'cursor';
    }
    
    // Update the location field in the UI
    const locationField = document.getElementById('locationField');
    if (locationField) {
        locationField.value = locationString;
        // Select the text so user can easily copy it
        locationField.select();
    }
    
    // Try to copy to clipboard if permission is available (silently fail if not)
    try {
        // Try modern Clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(locationString);
            const sourceText = locationSource ? ` (${locationSource})` : '';
            updateStatus(`Copied location${sourceText} to clipboard`);
        } else {
            // Fallback: use execCommand for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = locationString;
            textarea.style.position = 'fixed';
            textarea.style.left = '-999999px';
            textarea.style.top = '-999999px';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);
            
            if (successful) {
                const sourceText = locationSource ? ` (${locationSource})` : '';
                updateStatus(`Copied location${sourceText} to clipboard`);
            }
        }
    } catch (error) {
        // Silently fail - the location is already in the text field
        // User can manually copy from there if clipboard access is blocked
    }
}

// Try to start dragging a marker
function tryStartDrag(screenX, screenY) {
    // Check if editing is enabled for any marker type
    if (!editingEnabled.playerSpawnPoints) {
        return false;
    }
    
    // Check if clicking on a player spawn point
    if (editingEnabled.playerSpawnPoints && showPlayerSpawnPoints) {
        const spawnPointOffset = markers.length + eventSpawns.length + 
            territories.reduce((sum, t) => sum + t.zones.length, 0);
        
        // Check if we have selected spawn points - if so, drag all selected ones
        if (selectedPlayerSpawnPoints.size > 0) {
            // Check if clicking on a selected spawn point
            for (const index of selectedPlayerSpawnPoints) {
                if (index >= playerSpawnPoints.length) continue;
                const spawnPoint = playerSpawnPoints[index];
                const screenPos = worldToScreen(spawnPoint.x, spawnPoint.z);
                const dx = screenPos.x - screenX;
                const dy = screenPos.y - screenY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < MARKER_INTERACTION_THRESHOLD) {
                    // Save original positions for all selected spawn points if not already saved
                    for (const selectedIndex of selectedPlayerSpawnPoints) {
                        if (!originalPositions.playerSpawnPoints.has(selectedIndex)) {
                            const sp = playerSpawnPoints[selectedIndex];
                            originalPositions.playerSpawnPoints.set(selectedIndex, {
                                x: sp.x,
                                y: sp.y,
                                z: sp.z
                            });
                        }
                    }
                    
                    // Store the relative positions of all selected markers
                    draggedSelectedSpawnPoints.clear();
                    const clickedWorld = screenToWorld(screenX, screenY);
                    for (const selectedIndex of selectedPlayerSpawnPoints) {
                        const sp = playerSpawnPoints[selectedIndex];
                        draggedSelectedSpawnPoints.set(selectedIndex, {
                            offsetX: sp.x - clickedWorld.x,
                            offsetZ: sp.z - clickedWorld.z
                        });
                    }
                    
                    isDragging = true;
                    draggedMarkerType = 'playerSpawnPoints';
                    draggedMarkerIndex = index; // The one that was clicked
                    dragStartX = screenX;
                    dragStartY = screenY;
                    dragStartWorldX = clickedWorld.x;
                    dragStartWorldZ = clickedWorld.z;
                    
                    return true;
                }
            }
        } else {
            // No selection - check if clicking on any spawn point
            for (let index = 0; index < playerSpawnPoints.length; index++) {
                const spawnPoint = playerSpawnPoints[index];
                const screenPos = worldToScreen(spawnPoint.x, spawnPoint.z);
                const dx = screenPos.x - screenX;
                const dy = screenPos.y - screenY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < MARKER_INTERACTION_THRESHOLD) {
                    // Save original position if not already saved
                    if (!originalPositions.playerSpawnPoints.has(index)) {
                        originalPositions.playerSpawnPoints.set(index, {
                            x: spawnPoint.x,
                            y: spawnPoint.y,
                            z: spawnPoint.z
                        });
                    }
                    
                    isDragging = true;
                    draggedMarkerType = 'playerSpawnPoints';
                    draggedMarkerIndex = index;
                    dragStartX = screenX;
                    dragStartY = screenY;
                    dragStartWorldX = spawnPoint.x;
                    dragStartWorldZ = spawnPoint.z;
                    
                    return true;
                }
            }
        }
    }
    
    return false;
}

// Handle drag update
function handleDrag(screenX, screenY) {
    if (!isDragging) return;
    
    // Calculate world position delta
    const startWorld = screenToWorld(dragStartX, dragStartY);
    const currentWorld = screenToWorld(screenX, screenY);
    
    const deltaX = currentWorld.x - startWorld.x;
    const deltaZ = currentWorld.z - startWorld.z;
    
    // Update marker position(s)
    if (draggedMarkerType === 'playerSpawnPoints') {
        if (draggedSelectedSpawnPoints.size > 0) {
            // Move all selected spawn points, maintaining relative positions
            const newCenterX = dragStartWorldX + deltaX;
            const newCenterZ = dragStartWorldZ + deltaZ;
            
            draggedSelectedSpawnPoints.forEach((offset, index) => {
                if (index < playerSpawnPoints.length) {
                    const spawnPoint = playerSpawnPoints[index];
                    spawnPoint.x = newCenterX + offset.offsetX;
                    spawnPoint.z = newCenterZ + offset.offsetZ;
                }
            });
        } else if (draggedMarkerIndex >= 0) {
            // Single marker drag
            const spawnPoint = playerSpawnPoints[draggedMarkerIndex];
            spawnPoint.x = dragStartWorldX + deltaX;
            spawnPoint.z = dragStartWorldZ + deltaZ;
        }
    }
    
    requestDraw();
}

// Handle drag end
function handleDragEnd() {
    if (!isDragging) return;
    
    // Round positions to 2 decimal places when placing the marker(s)
    if (draggedMarkerType === 'playerSpawnPoints') {
        if (draggedSelectedSpawnPoints.size > 0) {
            // Round all selected spawn points
            draggedSelectedSpawnPoints.forEach((offset, index) => {
                if (index < playerSpawnPoints.length) {
                    const spawnPoint = playerSpawnPoints[index];
                    spawnPoint.x = Math.round(spawnPoint.x * 100) / 100;
                    spawnPoint.y = Math.round(spawnPoint.y * 100) / 100;
                    spawnPoint.z = Math.round(spawnPoint.z * 100) / 100;
                }
            });
        } else if (draggedMarkerIndex >= 0) {
            // Single marker
            const spawnPoint = playerSpawnPoints[draggedMarkerIndex];
            spawnPoint.x = Math.round(spawnPoint.x * 100) / 100;
            spawnPoint.y = Math.round(spawnPoint.y * 100) / 100;
            spawnPoint.z = Math.round(spawnPoint.z * 100) / 100;
        }
    }
    
    isDragging = false;
    draggedMarkerType = null;
    draggedMarkerIndex = -1;
    draggedSelectedSpawnPoints.clear();
    requestDraw();
}

// Save marker changes to file
async function saveMarkerChanges(markerType) {
    if (markerType === 'playerSpawnPoints') {
        // Get all modified spawn points
        const modifiedSpawnPoints = [];
        for (let i = 0; i < playerSpawnPoints.length; i++) {
            if (originalPositions.playerSpawnPoints.has(i)) {
                const original = originalPositions.playerSpawnPoints.get(i);
                const current = playerSpawnPoints[i];
                
                // Check if position changed
                if (original.x !== current.x || original.y !== current.y || original.z !== current.z) {
                    modifiedSpawnPoints.push({
                        index: i,
                        original: original,
                        current: { x: current.x, y: current.y, z: current.z },
                        xml: current.xml
                    });
                }
            }
        }
        
        if (modifiedSpawnPoints.length === 0) {
            return { success: true, message: 'No changes to save' };
        }
        
        try {
            const response = await fetch('/api/player-spawn-points/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    mission_dir: missionDir,
                    spawn_points: playerSpawnPoints.map((sp, idx) => ({
                        index: idx,
                        x: sp.x,
                        y: sp.y,
                        z: sp.z,
                        width: sp.width,
                        height: sp.height,
                        xml: sp.xml
                    }))
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Clear original positions after successful save
                originalPositions.playerSpawnPoints.clear();
                return { success: true, message: `Saved ${modifiedSpawnPoints.length} spawn point(s)` };
            } else {
                return { success: false, message: data.error || 'Failed to save' };
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
    
    return { success: false, message: 'Unknown marker type' };
}

// Restore marker positions
function restoreMarkerPositions(markerType) {
    if (markerType === 'playerSpawnPoints') {
        originalPositions.playerSpawnPoints.forEach((original, index) => {
            if (index < playerSpawnPoints.length) {
                playerSpawnPoints[index].x = original.x;
                playerSpawnPoints[index].y = original.y;
                playerSpawnPoints[index].z = original.z;
            }
        });
        originalPositions.playerSpawnPoints.clear();
    }
    
    requestDraw();
}

// Handle editing toggle change
async function handleEditingToggle(markerType, enabled) {
    editingEnabled[markerType] = enabled;
    
    // Update canvas cursor style
    const anyEditingEnabled = Object.values(editingEnabled).some(v => v === true);
    if (anyEditingEnabled) {
        canvas.classList.add('editing-enabled');
    } else {
        canvas.classList.remove('editing-enabled');
    }
    
    if (!enabled) {
        // Check if there are unsaved changes
        let hasChanges = false;
        if (markerType === 'playerSpawnPoints') {
            hasChanges = originalPositions.playerSpawnPoints.size > 0;
        }
        
        if (hasChanges) {
            const save = confirm('You have unsaved changes. Do you want to save them?');
            if (save) {
                const result = await saveMarkerChanges(markerType);
                if (result.success) {
                    updateStatus(result.message);
                    // Clear selection after successful save
                    if (markerType === 'playerSpawnPoints') {
                        selectedPlayerSpawnPoints.clear();
                    }
                } else {
                    updateStatus(`Error saving: ${result.message}`, true);
                    // Don't disable editing if save failed
                    editingEnabled[markerType] = true;
                    const checkboxId = markerType === 'playerSpawnPoints' ? 'editPlayerSpawnPoints' : 
                        `edit${markerType.charAt(0).toUpperCase() + markerType.slice(1)}`;
                    const checkbox = document.getElementById(checkboxId);
                    if (checkbox) checkbox.checked = true;
                    // Re-add cursor class since we're keeping editing enabled
                    canvas.classList.add('editing-enabled');
                    return;
                }
            } else {
                // Restore original positions
                restoreMarkerPositions(markerType);
                // Clear selection after restore
                if (markerType === 'playerSpawnPoints') {
                    selectedPlayerSpawnPoints.clear();
                }
            }
        } else {
            // No changes, but clear selection when disabling editing
            if (markerType === 'playerSpawnPoints') {
                selectedPlayerSpawnPoints.clear();
            }
        }
        
        // Update display after clearing selection
        updateSelectedCount();
        draw();
    }
}

// Update selected count display
function updateSelectedCount() {
    document.getElementById('selectedCount').textContent = `Selected: ${selectedMarkers.size}`;
}

// Clear all selected markers
function clearSelection() {
    selectedMarkers.clear();
    updateSelectedCount();
    draw();
}

// Copy selected markers XML to clipboard
async function copySelectedXml() {
    if (selectedMarkers.size === 0) {
        updateStatus('No markers selected', true);
        return;
    }
    
    // Collect XML from selected markers only
    const xmlLines = [];
    const selectedIndices = Array.from(selectedMarkers); // Convert Set to Array for clarity
    
    // Verify we're only processing selected markers
    for (const index of selectedIndices) {
        // Validate index is within bounds
        if (index < 0 || index >= markers.length) {
            continue;
        }
        
        const marker = markers[index];
        if (!marker || !marker.xml) {
            continue;
        }
        
        xmlLines.push(marker.xml);
    }
    
    if (xmlLines.length === 0) {
        updateStatus('Selected markers have no XML data', true);
        return;
    }
    
    // Join all XML elements with newlines
    const xmlText = xmlLines.join('\n');
    
    try {
        await navigator.clipboard.writeText(xmlText);
        updateStatus(`Copied ${xmlLines.length} marker(s) XML to clipboard`);
    } catch (error) {
        updateStatus(`Error copying XML: ${error.message}`, true);
        console.error('Error copying XML:', error);
    }
}

// Update status message
function updateStatus(message, isError = false) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = isError ? 'status error' : 'status';
}

// Load effect areas from API
async function loadEffectAreas() {
    if (!missionDir) {
        return;
    }
    
    try {
        const response = await fetch(`/api/effect-areas?mission_dir=${encodeURIComponent(missionDir)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            effectAreas = data.areas || [];
            draw(); // Redraw to show effect areas
        } else {
            effectAreas = [];
        }
    } catch (error) {
        effectAreas = [];
    }
}

// Load territories from API
async function loadTerritories() {
    if (!missionDir) {
        return;
    }
    
    try {
        const response = await fetch(`/api/territories?mission_dir=${encodeURIComponent(missionDir)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            territories = data.territories || [];
            // Always show territory filter section (even if empty, so user knows it exists)
            const territoryFilterSection = document.getElementById('territoryFilterSection');
            if (territoryFilterSection) {
                territoryFilterSection.style.display = 'block';
                if (territories.length > 0) {
                    populateFilterTerritoryTypeDropdown();
                }
            }
            // Apply filters to territories
            applyFilters();
            draw(); // Redraw to show territories
        } else {
            territories = [];
            // Still show the filter section even on error
            const territoryFilterSection = document.getElementById('territoryFilterSection');
            if (territoryFilterSection) {
                territoryFilterSection.style.display = 'block';
            }
        }
    } catch (error) {
        territories = [];
    }
}

// Load event spawns from API
async function loadEventSpawns() {
    if (!missionDir) {
        return;
    }
    
    try {
        const response = await fetch(`/api/event-spawns?mission_dir=${encodeURIComponent(missionDir)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            eventSpawns = data.event_spawns || [];
            if (eventSpawns.length > 0) {
                // Show event spawn filter section and populate dropdown
                const eventSpawnFilterSection = document.getElementById('eventSpawnFilterSection');
                if (eventSpawnFilterSection) {
                    eventSpawnFilterSection.style.display = 'block';
                    populateFilterEventSpawnTypeDropdown();
                }
            }
            // Apply filters to event spawns
            applyFilters();
            draw(); // Redraw to show event spawns
        } else {
            eventSpawns = [];
        }
    } catch (error) {
        eventSpawns = [];
    }
}

// Load player spawn points from API
async function loadPlayerSpawnPoints() {
    if (!missionDir) {
        return;
    }
    
    try {
        const response = await fetch(`/api/player-spawn-points?mission_dir=${encodeURIComponent(missionDir)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            playerSpawnPoints = data.spawn_points || [];
            draw(); // Redraw to show player spawn points
        } else {
            playerSpawnPoints = [];
        }
    } catch (error) {
        playerSpawnPoints = [];
    }
}

// Load groups from API
async function loadGroups() {
    const dir = document.getElementById('missionDir').value.trim();
    
    if (!dir) {
        updateStatus('Please enter a mission directory path', true);
        return;
    }
    
    missionDir = dir;
    // Save to localStorage
    localStorage.setItem('map_viewer_missionDir', missionDir);
    
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
        
        // Load effect areas, event spawns, territories, and player spawn points after loading markers
        await loadEffectAreas();
        await loadEventSpawns();
        await loadTerritories();
        await loadPlayerSpawnPoints();
        
        // Show filter section and populate dropdowns
        const filterSection = document.getElementById('filterSection');
        if (filterSection && markers.length > 0) {
            filterSection.style.display = 'block';
            populateFilterUsageDropdown();
            populateFilterGroupNameDropdown();
            updateFilterTypeUI();
            applyFilters(); // Apply any existing filters (or show all if no filters)
        } else if (filterSection) {
            filterSection.style.display = 'none';
        }
        
        if (markers.length > 0) {
            fitToView();
            updateStatus(`Loaded ${data.count} markers`);
        } else {
            const warning = data.warning || '';
            updateStatus(`No markers found${warning ? ': ' + warning : ''}`, true);
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
function setupBackgroundImageHandler() {
    document.getElementById('backgroundImage').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        updateStatus('Uploading image to server...');
        
        try {
            // Upload image to server
            const formData = new FormData();
            formData.append('image', file);
            
            const response = await fetch('/api/upload-background-image', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (!data.success) {
                updateStatus(`Error uploading image: ${data.error}`, true);
                return;
            }
            
            const imageId = data.image_id;
            
            // Store image ID in localStorage (not the image data)
            localStorage.setItem('map_viewer_backgroundImageId', imageId);
            // Clear old localStorage image data if it exists
            localStorage.removeItem('map_viewer_backgroundImage');
            localStorage.removeItem('map_viewer_backgroundImageFileName');
            
            // Load image from server
            await loadBackgroundImageFromServer(imageId);
            
            updateStatus('Image uploaded and loaded successfully');
        } catch (error) {
            updateStatus(`Error uploading image: ${error.message}`, true);
            console.error('Error uploading image:', error);
        }
    });
}

// Load background image from server
async function loadBackgroundImageFromServer(imageId) {
    try {
        const img = new Image();
        
        img.onload = () => {
            backgroundImage = img;
            
            // Check for saved dimensions first, otherwise use image size as default (1 pixel per metre)
            const savedWidth = localStorage.getItem('map_viewer_imageWidth');
            const savedHeight = localStorage.getItem('map_viewer_imageHeight');
            
            if (savedWidth && savedHeight) {
                // Restore saved dimensions
                imageWidth = parseFloat(savedWidth);
                imageHeight = parseFloat(savedHeight);
            } else {
                // Use image size as default
                imageWidth = img.width;
                imageHeight = img.height;
                // Save default dimensions to localStorage
                localStorage.setItem('map_viewer_imageWidth', imageWidth.toString());
                localStorage.setItem('map_viewer_imageHeight', imageHeight.toString());
            }
            
            document.getElementById('imageWidth').value = imageWidth;
            document.getElementById('imageHeight').value = imageHeight;
            
            // Upload to WebGL texture if using WebGL
            if (useWebGL && gl) {
                uploadBackgroundToWebGL();
            }
            
            document.getElementById('imageDimensionsGroup').style.display = 'flex';
            const opacityGroup = document.getElementById('imageOpacityGroup');
            if (opacityGroup) {
                opacityGroup.style.display = 'flex';
            }
            initBackgroundCache();
            draw();
        };
        
        img.onerror = () => {
            updateStatus('Failed to load image from server', true);
            console.error('Failed to load image from server:', imageId);
        };
        
        // Load image from server endpoint
        img.src = `/api/background-image/${imageId}`;
    } catch (error) {
        updateStatus(`Error loading image: ${error.message}`, true);
        console.error('Error loading image from server:', error);
    }
}

// Apply image dimensions
function applyImageDimensions() {
    imageWidth = parseFloat(document.getElementById('imageWidth').value) || 1000;
    imageHeight = parseFloat(document.getElementById('imageHeight').value) || 1000;
    
    // Save to localStorage
    localStorage.setItem('map_viewer_imageWidth', imageWidth.toString());
    localStorage.setItem('map_viewer_imageHeight', imageHeight.toString());
    
    draw();
}

// Clear background image
async function clearBackgroundImage() {
    // Delete image from server if we have an image ID
    const imageId = localStorage.getItem('map_viewer_backgroundImageId');
    if (imageId) {
        try {
            await fetch(`/api/delete-background-image/${imageId}`, {
                method: 'DELETE'
            });
        } catch (error) {
            // Silently fail - image may already be deleted
        }
    }
    
    backgroundImage = null;
    backgroundCacheValid = false;
    document.getElementById('backgroundImage').value = '';
    document.getElementById('imageDimensionsGroup').style.display = 'none';
    const opacityGroup = document.getElementById('imageOpacityGroup');
    if (opacityGroup) {
        opacityGroup.style.display = 'none';
    }
    
    // Remove from localStorage
    localStorage.removeItem('map_viewer_backgroundImage');
    localStorage.removeItem('map_viewer_backgroundImageId');
    localStorage.removeItem('map_viewer_backgroundImageFileName');
    localStorage.removeItem('map_viewer_imageWidth');
    localStorage.removeItem('map_viewer_imageHeight');
    
    draw();
}

// Get all unique usage names from markers
function getAllUsageNames() {
    const usageNames = new Set();
    
    markers.forEach(marker => {
        // Check direct usage property (from mapgrouppos.xml)
        if (marker.usage) {
            if (Array.isArray(marker.usage)) {
                marker.usage.forEach(u => {
                    if (typeof u === 'object' && u.name) {
                        usageNames.add(u.name.trim());
                    } else if (typeof u === 'string' && u.trim()) {
                        usageNames.add(u.trim());
                    }
                });
            } else if (typeof marker.usage === 'object' && marker.usage.name) {
                usageNames.add(marker.usage.name.trim());
            } else if (typeof marker.usage === 'string' && marker.usage.trim()) {
                usageNames.add(marker.usage.trim());
            }
        }
        
        // Check proto_children for usage (from mapgroupproto.xml)
        if (marker.proto_children && typeof marker.proto_children === 'object') {
            if (marker.proto_children.usage) {
                const usage = marker.proto_children.usage;
                if (Array.isArray(usage)) {
                    usage.forEach(u => {
                        if (typeof u === 'object' && u.name) {
                            usageNames.add(u.name.trim());
                        } else if (typeof u === 'string' && u.trim()) {
                            usageNames.add(u.trim());
                        }
                    });
                } else if (typeof usage === 'object' && usage.name) {
                    usageNames.add(usage.name.trim());
                } else if (typeof usage === 'string' && usage.trim()) {
                    usageNames.add(usage.trim());
                }
            }
        }
    });
    
    return Array.from(usageNames).sort();
}

// Get usage names for a specific marker
function getMarkerUsageNames(marker) {
    const usageNames = [];
    
    // Check direct usage property (from mapgrouppos.xml)
    if (marker.usage) {
        if (Array.isArray(marker.usage)) {
            marker.usage.forEach(u => {
                if (typeof u === 'object' && u.name) {
                    usageNames.push(u.name.trim());
                } else if (typeof u === 'string' && u.trim()) {
                    usageNames.push(u.trim());
                }
            });
        } else if (typeof marker.usage === 'object' && marker.usage.name) {
            usageNames.push(marker.usage.name.trim());
        } else if (typeof marker.usage === 'string' && marker.usage.trim()) {
            usageNames.push(marker.usage.trim());
        }
    }
    
    // Check proto_children for usage (from mapgroupproto.xml)
    if (marker.proto_children && typeof marker.proto_children === 'object') {
        if (marker.proto_children.usage) {
            const usage = marker.proto_children.usage;
            if (Array.isArray(usage)) {
                usage.forEach(u => {
                    if (typeof u === 'object' && u.name) {
                        usageNames.push(u.name.trim());
                    } else if (typeof u === 'string' && u.trim()) {
                        usageNames.push(u.trim());
                    }
                });
            } else if (typeof usage === 'object' && usage.name) {
                usageNames.push(usage.name.trim());
            } else if (typeof usage === 'string' && usage.trim()) {
                usageNames.push(usage.trim());
            }
        }
    }
    
    return [...new Set(usageNames)]; // Remove duplicates
}

// Get all unique group names from markers
function getAllGroupNames() {
    const groupNames = new Set();
    
    markers.forEach(marker => {
        if (marker.name && marker.name.trim()) {
            groupNames.add(marker.name.trim());
        }
    });
    
    return Array.from(groupNames).sort();
}

// Populate filter usage dropdown
function populateFilterUsageDropdown() {
    const select = document.getElementById('filterUsageSelect');
    if (!select) return;
    
    select.innerHTML = '';
    const usageNames = getAllUsageNames();
    
    usageNames.forEach(usageName => {
        const option = document.createElement('option');
        option.value = usageName;
        option.textContent = usageName;
        select.appendChild(option);
    });
}

// Populate filter group name dropdown
function populateFilterGroupNameDropdown() {
    const select = document.getElementById('filterGroupNameSelect');
    if (!select) return;
    
    select.innerHTML = '';
    const groupNames = getAllGroupNames();
    
    groupNames.forEach(groupName => {
        const option = document.createElement('option');
        option.value = groupName;
        option.textContent = groupName;
        select.appendChild(option);
    });
}

// Get all unique event spawn type names
function getAllEventSpawnTypeNames() {
    const typeNames = new Set();
    eventSpawns.forEach(spawn => {
        if (spawn.name) {
            typeNames.add(spawn.name);
        }
    });
    return Array.from(typeNames).sort();
}

// Populate filter event spawn type dropdown
function populateFilterEventSpawnTypeDropdown() {
    const select = document.getElementById('eventSpawnFilterTypeSelect');
    if (!select) {
        return;
    }
    
    select.innerHTML = '';
    const typeNames = getAllEventSpawnTypeNames();
    
    typeNames.forEach(typeName => {
        const option = document.createElement('option');
        option.value = typeName;
        option.textContent = typeName;
        select.appendChild(option);
    });
}

// Get all unique territory type names (file names)
function getAllTerritoryTypeNames() {
    const typeNames = new Set();
    territories.forEach(territory => {
        if (territory.territory_type) {
            typeNames.add(territory.territory_type);
        }
    });
    return Array.from(typeNames).sort();
}

// Get all unique territory names
function getAllTerritoryNames() {
    const names = new Set();
    territories.forEach(territory => {
        if (territory.name) {
            names.add(territory.name);
        }
    });
    return Array.from(names).sort();
}

// Populate filter territory type dropdown
function populateFilterTerritoryTypeDropdown() {
    const typeSelect = document.getElementById('territoryFilterTypeSelect');
    const nameSelect = document.getElementById('territoryFilterNameSelect');
    
    if (typeSelect) {
        typeSelect.innerHTML = '';
        const typeNames = getAllTerritoryTypeNames();
        
        typeNames.forEach(typeName => {
            const option = document.createElement('option');
            option.value = typeName;
            option.textContent = typeName;
            typeSelect.appendChild(option);
        });
    }
    
    if (nameSelect) {
        nameSelect.innerHTML = '';
        const names = getAllTerritoryNames();
        
        names.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            nameSelect.appendChild(option);
        });
    }
}

// Filter group name dropdown based on search input
function filterGroupNameDropdown() {
    const input = document.getElementById('filterGroupNameInput');
    const select = document.getElementById('filterGroupNameSelect');
    if (!input || !select) return;
    
    const searchTerm = input.value.toLowerCase();
    const options = select.querySelectorAll('option');
    
    options.forEach(option => {
        const text = option.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            option.style.display = '';
        } else {
            option.style.display = 'none';
        }
    });
}

// Generic function to extract filterable values from an item based on filter type
function getFilterableValues(item, filterType) {
    if (filterType === 'usage') {
        // For usage, return array of usage names
        return getMarkerUsageNames(item);
    } else if (filterType === 'groupName') {
        // For groupName, return array with single name
        const name = item.name ? item.name.trim() : '';
        return name ? [name] : [];
    } else if (filterType === 'eventSpawnType') {
        // For eventSpawnType, return array with single name
        const name = item.name ? item.name.trim() : '';
        return name ? [name] : [];
    } else if (filterType === 'territoryType') {
        // For territoryType, return array with single type
        const type = item.territory_type ? item.territory_type.trim() : '';
        return type ? [type] : [];
    } else if (filterType === 'territoryName') {
        // For territoryName, return array with single name
        const name = item.name ? item.name.trim() : '';
        return name ? [name] : [];
    }
    return [];
}

// Generic function to check if an item matches a filter's values
function itemMatchesFilterValues(item, filter) {
    if (!filter.values || filter.values.length === 0) {
        // Empty filter values - matches nothing
        return false;
    }
    
    // Get the values to check from the item
    const itemValues = getFilterableValues(item, filter.type);
    
    // Normalize both filter values and item values for comparison
    const normalizedFilterValues = filter.values
        .filter(v => v)
        .map(v => String(v).toLowerCase().trim())
        .filter(v => v.length > 0);
    
    const normalizedItemValues = itemValues
        .filter(v => v)
        .map(v => String(v).toLowerCase().trim())
        .filter(v => v.length > 0);
    
    // Check if any filter value matches any item value
    return normalizedFilterValues.length > 0 && normalizedItemValues.length > 0 &&
        normalizedFilterValues.some(filterValue => 
            normalizedItemValues.includes(filterValue)
        );
}

// Generic function to apply filters to a collection
function applyFiltersToCollection(collection, filters, visibleSet) {
    if (filters.length === 0) {
        // No filters - show all items
        collection.forEach((_, index) => visibleSet.add(index));
        return;
    }
    
    // Separate display and hide filters
    const displayFilters = filters.filter(f => !f.inverted);
    const hideFilters = filters.filter(f => f.inverted);
    
    collection.forEach((item, index) => {
        let shouldDisplay = true;
        
        // If there are display filters, item must match at least one (OR logic)
        if (displayFilters.length > 0) {
            shouldDisplay = displayFilters.some(filter => itemMatchesFilterValues(item, filter));
        }
        
        // If there are hide filters, item must not match any (hide if matches any)
        if (shouldDisplay && hideFilters.length > 0) {
            const matchesHideFilter = hideFilters.some(filter => itemMatchesFilterValues(item, filter));
            if (matchesHideFilter) {
                shouldDisplay = false;
            }
        }
        
        if (shouldDisplay) {
            visibleSet.add(index);
        }
    });
}

// Apply filters to markers
function applyFilters() {
    visibleMarkers.clear();
    visibleEventSpawns.clear();
    visibleTerritories.clear();
    
    // Apply filters using the generic function
    applyFiltersToCollection(markers, activeFilters, visibleMarkers);
    applyFiltersToCollection(eventSpawns, activeEventSpawnFilters, visibleEventSpawns);
    applyFiltersToCollection(territories, activeTerritoryFilters, visibleTerritories);
    
    draw();
}

// Update filter UI based on filter type
function updateFilterTypeUI() {
    const filterType = document.getElementById('filterType').value;
    const usageSelect = document.getElementById('filterUsageSelect');
    const groupNameInput = document.getElementById('filterGroupNameInput');
    const groupNameSelect = document.getElementById('filterGroupNameSelect');
    const valueLabel = document.getElementById('filterValueLabel');
    
    if (!usageSelect || !groupNameInput || !groupNameSelect || !valueLabel) {
        return;
    }
    
    if (filterType === 'usage') {
        valueLabel.textContent = 'Usage:';
        usageSelect.style.display = 'block';
        groupNameInput.style.display = 'none';
        groupNameSelect.style.display = 'none';
    } else if (filterType === 'groupName') {
        valueLabel.textContent = 'Group Name:';
        usageSelect.style.display = 'none';
        groupNameInput.style.display = 'block';
        groupNameSelect.style.display = 'block';
    }
}

// Add filter
function addFilter() {
    const filterType = document.getElementById('filterType').value;
    
    let values = [];
    
    if (filterType === 'usage') {
        const select = document.getElementById('filterUsageSelect');
        const selectedOptions = Array.from(select.selectedOptions);
        if (selectedOptions.length === 0) {
            alert('Please select at least one usage');
            return;
        }
        values = selectedOptions.map(opt => opt.value);
        select.selectedIndex = -1;
    } else if (filterType === 'groupName') {
        const select = document.getElementById('filterGroupNameSelect');
        const selectedOptions = Array.from(select.selectedOptions);
        if (selectedOptions.length === 0) {
            alert('Please select at least one group name');
            return;
        }
        values = selectedOptions.map(opt => opt.value);
        select.selectedIndex = -1;
        document.getElementById('filterGroupNameInput').value = '';
        filterGroupNameDropdown(); // Reset filter
    }
    
    // Check if filter already exists
    const exists = activeFilters.some(f => {
        if (f.type !== filterType) return false;
        return f.values.length === values.length &&
               f.values.every(name => values.includes(name)) &&
               values.every(name => f.values.includes(name));
    });
    
    if (exists) {
        alert('This filter already exists');
        return;
    }
    
    // Add filter
    activeFilters.push({
        type: filterType,
        criteria: 'isOneOf',
        values: values,
        inverted: false
    });
    
    // Update UI and apply filters
    updateFilterUI();
    applyFilters();
    saveFilterAndDisplaySettings();
}

// Remove filter
function removeFilter(index) {
    activeFilters.splice(index, 1);
    updateFilterUI();
    applyFilters();
    saveFilterAndDisplaySettings();
}

// Clear all filters
function clearAllFilters() {
    activeFilters = [];
    updateFilterUI();
    applyFilters();
    saveFilterAndDisplaySettings();
}

// Toggle filter invert state
function toggleFilterInvert(index) {
    if (index >= 0 && index < activeFilters.length) {
        activeFilters[index].inverted = !activeFilters[index].inverted;
        updateFilterUI();
        applyFilters();
        saveFilterAndDisplaySettings();
    }
}

// Add event spawn filter
function addEventSpawnFilter() {
    const select = document.getElementById('eventSpawnFilterTypeSelect');
    const selectedOptions = Array.from(select.selectedOptions);
    if (selectedOptions.length === 0) {
        alert('Please select at least one event spawn type');
        return;
    }
    
    const values = selectedOptions.map(opt => opt.value);
    select.selectedIndex = -1;
    
    // Check if filter already exists
    const exists = activeEventSpawnFilters.some(f => {
        return f.values.length === values.length &&
               f.values.every(name => values.includes(name)) &&
               values.every(name => f.values.includes(name));
    });
    
    if (exists) {
        alert('This filter already exists');
        return;
    }
    
    // Add filter
    activeEventSpawnFilters.push({
        type: 'eventSpawnType',
        criteria: 'isOneOf',
        values: values,
        inverted: false
    });
    
    // Update UI and apply filters
    updateEventSpawnFilterUI();
    applyFilters();
    saveFilterAndDisplaySettings();
}

// Remove event spawn filter
function removeEventSpawnFilter(index) {
    activeEventSpawnFilters.splice(index, 1);
    updateEventSpawnFilterUI();
    applyFilters();
    saveFilterAndDisplaySettings();
}

// Clear all event spawn filters
function clearAllEventSpawnFilters() {
    activeEventSpawnFilters = [];
    updateEventSpawnFilterUI();
    applyFilters();
    saveFilterAndDisplaySettings();
}

// Toggle event spawn filter invert state
function toggleEventSpawnFilterInvert(index) {
    if (index >= 0 && index < activeEventSpawnFilters.length) {
        activeEventSpawnFilters[index].inverted = !activeEventSpawnFilters[index].inverted;
        updateEventSpawnFilterUI();
        applyFilters();
        saveFilterAndDisplaySettings();
    }
}

// Update event spawn filter UI
function updateEventSpawnFilterUI() {
    const filtersList = document.getElementById('activeEventSpawnFiltersList');
    if (!filtersList) return;
    
    filtersList.innerHTML = '';
    
    if (activeEventSpawnFilters.length === 0) {
        filtersList.innerHTML = '<p style="color: #666; font-size: 0.9em;">No active filters</p>';
        return;
    }
    
    activeEventSpawnFilters.forEach((filter, index) => {
        const filterDiv = document.createElement('div');
        filterDiv.className = 'active-filter-item';
        
        const criteriaText = filter.inverted ? 'Hide' : 'Display';
        const valuesText = filter.values.join(', ');
        
        filterDiv.innerHTML = `
            <span class="filter-text">Event Spawn Type ${criteriaText}: ${valuesText}</span>
            <label class="filter-invert-checkbox">
                <input type="checkbox" ${filter.inverted ? 'checked' : ''} 
                       onchange="toggleEventSpawnFilterInvert(${index})" 
                       title="Invert filter">
                <span>Invert</span>
            </label>
            <button class="btn-remove-filter" onclick="removeEventSpawnFilter(${index})" title="Remove filter">×</button>
        `;
        
        filtersList.appendChild(filterDiv);
    });
}

// Update territory filter UI based on filter type
function updateTerritoryFilterTypeUI() {
    const filterType = document.getElementById('territoryFilterType').value;
    const typeSelect = document.getElementById('territoryFilterTypeSelect');
    const nameInput = document.getElementById('territoryFilterNameInput');
    const nameSelect = document.getElementById('territoryFilterNameSelect');
    const valueLabel = document.getElementById('territoryFilterValueLabel');
    
    if (!typeSelect || !nameInput || !nameSelect || !valueLabel) {
        return;
    }
    
    if (filterType === 'territoryType') {
        valueLabel.textContent = 'Territory Type:';
        typeSelect.style.display = 'block';
        nameInput.style.display = 'none';
        nameSelect.style.display = 'none';
    } else if (filterType === 'territoryName') {
        valueLabel.textContent = 'Territory Name:';
        typeSelect.style.display = 'none';
        nameInput.style.display = 'block';
        nameSelect.style.display = 'block';
    }
}

// Add territory filter
function addTerritoryFilter() {
    const filterType = document.getElementById('territoryFilterType').value;
    
    let values = [];
    
    if (filterType === 'territoryType') {
        const select = document.getElementById('territoryFilterTypeSelect');
        const selectedOptions = Array.from(select.selectedOptions);
        if (selectedOptions.length === 0) {
            alert('Please select at least one territory type');
            return;
        }
        values = selectedOptions.map(opt => opt.value);
        select.selectedIndex = -1;
    } else if (filterType === 'territoryName') {
        const select = document.getElementById('territoryFilterNameSelect');
        const selectedOptions = Array.from(select.selectedOptions);
        if (selectedOptions.length === 0) {
            alert('Please select at least one territory name');
            return;
        }
        values = selectedOptions.map(opt => opt.value);
        select.selectedIndex = -1;
        document.getElementById('territoryFilterNameInput').value = '';
        filterTerritoryNameDropdown(); // Reset filter
    }
    
    // Check if filter already exists
    const exists = activeTerritoryFilters.some(f => {
        if (f.type !== filterType) return false;
        return f.values.length === values.length &&
               f.values.every(name => values.includes(name)) &&
               values.every(name => f.values.includes(name));
    });
    
    if (exists) {
        alert('This filter already exists');
        return;
    }
    
    // Add filter
    activeTerritoryFilters.push({
        type: filterType,
        criteria: 'isOneOf',
        values: values,
        inverted: false
    });
    
    // Update UI and apply filters
    updateTerritoryFilterUI();
    applyFilters();
    saveFilterAndDisplaySettings();
}

// Remove territory filter
function removeTerritoryFilter(index) {
    activeTerritoryFilters.splice(index, 1);
    updateTerritoryFilterUI();
    applyFilters();
    saveFilterAndDisplaySettings();
}

// Clear all territory filters
function clearAllTerritoryFilters() {
    activeTerritoryFilters = [];
    updateTerritoryFilterUI();
    applyFilters();
    saveFilterAndDisplaySettings();
}

// Toggle territory filter invert state
function toggleTerritoryFilterInvert(index) {
    if (index >= 0 && index < activeTerritoryFilters.length) {
        activeTerritoryFilters[index].inverted = !activeTerritoryFilters[index].inverted;
        updateTerritoryFilterUI();
        applyFilters();
        saveFilterAndDisplaySettings();
    }
}

// Update territory filter UI
function updateTerritoryFilterUI() {
    const filtersList = document.getElementById('activeTerritoryFiltersList');
    if (!filtersList) return;
    
    filtersList.innerHTML = '';
    
    if (activeTerritoryFilters.length === 0) {
        filtersList.innerHTML = '<p style="color: #666; font-size: 0.9em;">No active filters</p>';
        return;
    }
    
    activeTerritoryFilters.forEach((filter, index) => {
        const filterDiv = document.createElement('div');
        filterDiv.className = 'active-filter-item';
        
        const criteriaText = filter.inverted ? 'Hide' : 'Display';
        const typeText = filter.type === 'territoryType' ? 'Territory Type' : 'Territory Name';
        const valuesText = filter.values.join(', ');
        
        filterDiv.innerHTML = `
            <span class="filter-text">${typeText} ${criteriaText}: ${valuesText}</span>
            <label class="filter-invert-checkbox">
                <input type="checkbox" ${filter.inverted ? 'checked' : ''} 
                       onchange="toggleTerritoryFilterInvert(${index})" 
                       title="Invert filter">
                <span>Invert</span>
            </label>
            <button class="btn-remove-filter" onclick="removeTerritoryFilter(${index})" title="Remove filter">×</button>
        `;
        
        filtersList.appendChild(filterDiv);
    });
}

// Filter territory name dropdown based on search input
function filterTerritoryNameDropdown() {
    const input = document.getElementById('territoryFilterNameInput');
    const select = document.getElementById('territoryFilterNameSelect');
    if (!input || !select) return;
    
    const searchTerm = input.value.toLowerCase();
    const options = select.querySelectorAll('option');
    
    options.forEach(option => {
        const text = option.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            option.style.display = '';
        } else {
            option.style.display = 'none';
        }
    });
}

// Update filter UI
function updateFilterUI() {
    const activeFiltersList = document.getElementById('activeFiltersList');
    if (!activeFiltersList) return;
    
    activeFiltersList.innerHTML = '';
    
    if (activeFilters.length === 0) {
        activeFiltersList.innerHTML = '<p style="color: #666; font-size: 0.9em;">No active filters</p>';
        return;
    }
    
    activeFilters.forEach((filter, index) => {
        const filterItem = document.createElement('div');
        filterItem.className = 'active-filter-item';
        
        const criteriaText = filter.inverted ? 'Hide' : 'Display';
        const typeText = filter.type === 'usage' ? 'Usage' : 'Group Name';
        const valuesText = filter.values.join(', ');
        
        filterItem.innerHTML = `
            <span class="filter-text">${typeText} ${criteriaText}: ${valuesText}</span>
            <label class="filter-invert-checkbox">
                <input type="checkbox" ${filter.inverted ? 'checked' : ''} 
                       onchange="toggleFilterInvert(${index})" 
                       title="Invert filter">
                <span>Invert</span>
            </label>
            <button class="btn-remove-filter" onclick="removeFilter(${index})" title="Remove filter">×</button>
        `;
        
        activeFiltersList.appendChild(filterItem);
    });
}

// Save all filter and display settings to localStorage
function saveFilterAndDisplaySettings() {
    // Save display toggles
    localStorage.setItem('map_viewer_showGrid', showGrid.toString());
    localStorage.setItem('map_viewer_showMarkers', showMarkers.toString());
    localStorage.setItem('map_viewer_showEventSpawns', showEventSpawns.toString());
    localStorage.setItem('map_viewer_showTerritories', showTerritories.toString());
    localStorage.setItem('map_viewer_showEffectAreas', showEffectAreas.toString());
    localStorage.setItem('map_viewer_showPlayerSpawnPoints', showPlayerSpawnPoints.toString());
    localStorage.setItem('map_viewer_showBackgroundImage', showBackgroundImage.toString());
    localStorage.setItem('map_viewer_backgroundImageOpacity', backgroundImageOpacity.toString());
    
    // Save filters
    localStorage.setItem('map_viewer_activeFilters', JSON.stringify(activeFilters));
    localStorage.setItem('map_viewer_activeEventSpawnFilters', JSON.stringify(activeEventSpawnFilters));
    localStorage.setItem('map_viewer_activeTerritoryFilters', JSON.stringify(activeTerritoryFilters));
}

// Restore saved state from localStorage
async function restoreSavedState() {
    // Restore mission directory
    const savedMissionDir = localStorage.getItem('map_viewer_missionDir');
    if (savedMissionDir) {
        missionDir = savedMissionDir;
        document.getElementById('missionDir').value = savedMissionDir;
    }
    
    // Restore display toggles
    const savedShowGrid = localStorage.getItem('map_viewer_showGrid');
    if (savedShowGrid !== null) {
        showGrid = savedShowGrid === 'true';
        const checkbox = document.getElementById('showGrid');
        if (checkbox) checkbox.checked = showGrid;
    }
    
    const savedShowMarkers = localStorage.getItem('map_viewer_showMarkers');
    if (savedShowMarkers !== null) {
        showMarkers = savedShowMarkers === 'true';
        const checkbox = document.getElementById('showMarkers');
        if (checkbox) checkbox.checked = showMarkers;
    }
    
    const savedShowEventSpawns = localStorage.getItem('map_viewer_showEventSpawns');
    if (savedShowEventSpawns !== null) {
        showEventSpawns = savedShowEventSpawns === 'true';
        const checkbox = document.getElementById('showEventSpawns');
        if (checkbox) checkbox.checked = showEventSpawns;
    }
    
    const savedShowTerritories = localStorage.getItem('map_viewer_showTerritories');
    if (savedShowTerritories !== null) {
        showTerritories = savedShowTerritories === 'true';
        const checkbox = document.getElementById('showTerritories');
        if (checkbox) checkbox.checked = showTerritories;
    }
    
    const savedShowEffectAreas = localStorage.getItem('map_viewer_showEffectAreas');
    if (savedShowEffectAreas !== null) {
        showEffectAreas = savedShowEffectAreas === 'true';
        const checkbox = document.getElementById('showEffectAreas');
        if (checkbox) checkbox.checked = showEffectAreas;
    }
    
    const savedShowPlayerSpawnPoints = localStorage.getItem('map_viewer_showPlayerSpawnPoints');
    if (savedShowPlayerSpawnPoints !== null) {
        showPlayerSpawnPoints = savedShowPlayerSpawnPoints === 'true';
        const checkbox = document.getElementById('showPlayerSpawnPoints');
        if (checkbox) checkbox.checked = showPlayerSpawnPoints;
    }
    
    const savedShowBackgroundImage = localStorage.getItem('map_viewer_showBackgroundImage');
    if (savedShowBackgroundImage !== null) {
        showBackgroundImage = savedShowBackgroundImage === 'true';
        const checkbox = document.getElementById('showBackgroundImage');
        if (checkbox) checkbox.checked = showBackgroundImage;
    }
    
    const savedBackgroundImageOpacity = localStorage.getItem('map_viewer_backgroundImageOpacity');
    if (savedBackgroundImageOpacity !== null) {
        backgroundImageOpacity = parseFloat(savedBackgroundImageOpacity);
        const slider = document.getElementById('backgroundImageOpacity');
        const valueDisplay = document.getElementById('backgroundImageOpacityValue');
        if (slider) {
            slider.value = Math.round(backgroundImageOpacity * 100);
            if (valueDisplay) {
                valueDisplay.textContent = Math.round(backgroundImageOpacity * 100) + '%';
            }
        }
    }
    
    // Restore filters
    const savedActiveFilters = localStorage.getItem('map_viewer_activeFilters');
    if (savedActiveFilters) {
        try {
            activeFilters = JSON.parse(savedActiveFilters);
            // Ensure backward compatibility: add inverted property if missing
            activeFilters.forEach(filter => {
                if (filter.inverted === undefined) {
                    filter.inverted = false;
                }
            });
            updateFilterUI();
        } catch (e) {
            console.error('Error restoring active filters:', e);
        }
    }
    
    const savedActiveEventSpawnFilters = localStorage.getItem('map_viewer_activeEventSpawnFilters');
    if (savedActiveEventSpawnFilters) {
        try {
            activeEventSpawnFilters = JSON.parse(savedActiveEventSpawnFilters);
            // Ensure backward compatibility: add inverted property if missing
            activeEventSpawnFilters.forEach(filter => {
                if (filter.inverted === undefined) {
                    filter.inverted = false;
                }
            });
            updateEventSpawnFilterUI();
        } catch (e) {
            console.error('Error restoring event spawn filters:', e);
        }
    }
    
    const savedActiveTerritoryFilters = localStorage.getItem('map_viewer_activeTerritoryFilters');
    if (savedActiveTerritoryFilters) {
        try {
            activeTerritoryFilters = JSON.parse(savedActiveTerritoryFilters);
            // Ensure backward compatibility: add inverted property if missing
            activeTerritoryFilters.forEach(filter => {
                if (filter.inverted === undefined) {
                    filter.inverted = false;
                }
            });
            updateTerritoryFilterUI();
        } catch (e) {
            console.error('Error restoring territory filters:', e);
        }
    }
    
    // Restore background image - try server first, then fallback to localStorage
    const savedImageId = localStorage.getItem('map_viewer_backgroundImageId');
    const savedImageDataUrl = localStorage.getItem('map_viewer_backgroundImage');
    
    if (savedImageId) {
        // Try to load from server
        await loadBackgroundImageFromServer(savedImageId);
        
        // Restore dimensions if available
        const savedWidth = localStorage.getItem('map_viewer_imageWidth');
        const savedHeight = localStorage.getItem('map_viewer_imageHeight');
        
        if (savedWidth && savedHeight) {
            imageWidth = parseFloat(savedWidth);
            imageHeight = parseFloat(savedHeight);
            document.getElementById('imageWidth').value = imageWidth;
            document.getElementById('imageHeight').value = imageHeight;
        }
    } else if (savedImageDataUrl) {
        // Fallback: old localStorage cached image (for backward compatibility)
        const img = new Image();
        img.onload = () => {
            backgroundImage = img;
            
            // Upload to WebGL texture if using WebGL
            if (useWebGL && gl) {
                uploadBackgroundToWebGL();
            }
            
            // Restore dimensions
            const savedWidth = localStorage.getItem('map_viewer_imageWidth');
            const savedHeight = localStorage.getItem('map_viewer_imageHeight');
            
            if (savedWidth) {
                imageWidth = parseFloat(savedWidth);
                document.getElementById('imageWidth').value = imageWidth;
            } else {
                imageWidth = img.width;
                document.getElementById('imageWidth').value = imageWidth;
            }
            
            if (savedHeight) {
                imageHeight = parseFloat(savedHeight);
                document.getElementById('imageHeight').value = imageHeight;
            } else {
                imageHeight = img.height;
                document.getElementById('imageHeight').value = imageHeight;
            }
            
            document.getElementById('imageDimensionsGroup').style.display = 'flex';
            initBackgroundCache();
            draw();
        };
        img.onerror = () => {
            console.error('Failed to load cached background image');
            updateStatus('Failed to load cached background image', true);
        };
        img.src = savedImageDataUrl;
    }
    
    // Auto-load markers if mission directory is saved
    if (savedMissionDir) {
        loadGroups();
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    
    // Setup background image handler
    setupBackgroundImageHandler();
    
    // Restore saved state
    restoreSavedState();
    
    document.getElementById('loadDataBtn').addEventListener('click', loadGroups);
    document.getElementById('showGrid').addEventListener('change', (e) => {
        showGrid = e.target.checked;
        draw();
    });
    document.getElementById('showMarkers').addEventListener('change', (e) => {
        showMarkers = e.target.checked;
        draw();
    });
    
    document.getElementById('showEventSpawns').addEventListener('change', (e) => {
        showEventSpawns = e.target.checked;
        draw();
    });
    
    document.getElementById('showEffectAreas').addEventListener('change', (e) => {
        showEffectAreas = e.target.checked;
        draw();
        saveFilterAndDisplaySettings();
    });
    
    document.getElementById('showPlayerSpawnPoints').addEventListener('change', (e) => {
        showPlayerSpawnPoints = e.target.checked;
        draw();
        saveFilterAndDisplaySettings();
    });
    
    // Editing toggle
    const editPlayerSpawnPointsCheckbox = document.getElementById('editPlayerSpawnPoints');
    if (editPlayerSpawnPointsCheckbox) {
        editPlayerSpawnPointsCheckbox.addEventListener('change', async (e) => {
            await handleEditingToggle('playerSpawnPoints', e.target.checked);
            draw();
        });
    }
    
    const showTerritoriesCheckbox = document.getElementById('showTerritories');
    if (showTerritoriesCheckbox) {
        showTerritoriesCheckbox.addEventListener('change', (e) => {
            showTerritories = e.target.checked;
            draw();
        });
    }
    
    document.getElementById('showBackgroundImage').addEventListener('change', (e) => {
        showBackgroundImage = e.target.checked;
        draw();
    });
    
    const backgroundImageOpacitySlider = document.getElementById('backgroundImageOpacity');
    const backgroundImageOpacityValue = document.getElementById('backgroundImageOpacityValue');
    if (backgroundImageOpacitySlider && backgroundImageOpacityValue) {
        backgroundImageOpacitySlider.addEventListener('input', (e) => {
            backgroundImageOpacity = parseFloat(e.target.value) / 100;
            backgroundImageOpacityValue.textContent = Math.round(backgroundImageOpacity * 100) + '%';
            draw();
            saveFilterAndDisplaySettings();
        });
    }
    document.getElementById('clearSelectionBtn').addEventListener('click', clearSelection);
    document.getElementById('copySelectedXmlBtn').addEventListener('click', copySelectedXml);
    document.getElementById('loadImageBtn').addEventListener('click', loadBackgroundImage);
    document.getElementById('clearImageBtn').addEventListener('click', clearBackgroundImage);
    document.getElementById('applyDimensionsBtn').addEventListener('click', applyImageDimensions);
    
    // Filter event listeners
    document.getElementById('addFilterBtn').addEventListener('click', addFilter);
    document.getElementById('clearAllFiltersBtn').addEventListener('click', clearAllFilters);
    
    // Event spawn filter buttons
    document.getElementById('addEventSpawnFilterBtn').addEventListener('click', addEventSpawnFilter);
    document.getElementById('clearAllEventSpawnFiltersBtn').addEventListener('click', clearAllEventSpawnFilters);
    document.getElementById('filterType').addEventListener('change', updateFilterTypeUI);
    document.getElementById('filterGroupNameInput').addEventListener('input', filterGroupNameDropdown);
    
    // Territory filter buttons
    const addTerritoryFilterBtn = document.getElementById('addTerritoryFilterBtn');
    const clearAllTerritoryFiltersBtn = document.getElementById('clearAllTerritoryFiltersBtn');
    const territoryFilterType = document.getElementById('territoryFilterType');
    const territoryFilterNameInput = document.getElementById('territoryFilterNameInput');
    
    if (addTerritoryFilterBtn) {
        addTerritoryFilterBtn.addEventListener('click', addTerritoryFilter);
    }
    if (clearAllTerritoryFiltersBtn) {
        clearAllTerritoryFiltersBtn.addEventListener('click', clearAllTerritoryFilters);
    }
    if (territoryFilterType) {
        territoryFilterType.addEventListener('change', updateTerritoryFilterTypeUI);
    }
    if (territoryFilterNameInput) {
        territoryFilterNameInput.addEventListener('input', filterTerritoryNameDropdown);
    }
    
    // Allow Enter key to trigger load
    document.getElementById('missionDir').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadGroups();
        }
    });
});

