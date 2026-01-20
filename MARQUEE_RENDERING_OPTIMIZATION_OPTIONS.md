# Marquee Selection Rendering Optimization Options

## Current Performance Issues

### Problem Analysis
1. **Full Canvas Redraw on Every Mouse Move**: During marquee selection, `requestDraw()` is called on every `mousemove` event, which triggers a complete redraw of the entire canvas including:
   - Background image (potentially expensive WebGL operations)
   - Grid (hundreds of lines)
   - All markers (could be thousands)
   - All territories/zones (could be hundreds)
   - All event spawns
   - All effect areas
   - All player spawn points
   - Marquee rectangle (simple overlay)

2. **Throttling Limitations**: While `requestDraw()` uses `requestAnimationFrame` for throttling, it still redraws everything, which can be expensive with many markers.

3. **No Layer Separation**: The marquee overlay is drawn on the same canvas as all the markers, requiring a full redraw to update it.

## Optimization Options

### Option 1: Separate Overlay Canvas (RECOMMENDED - Best Performance)
**Approach**: Create a separate canvas layer for overlays (marquee, tooltip) that sits above the main canvas.

**Benefits**:
- Marquee updates only redraw the overlay canvas (very fast)
- Main canvas only redraws when actual data changes
- Tooltip can also use overlay canvas
- Minimal code changes needed

**Implementation**:
```javascript
// Add overlay canvas in HTML (or create dynamically)
<canvas id="overlayCanvas" style="position: absolute; top: 0; left: 0; z-index: 3; pointer-events: none;"></canvas>

// In initCanvas()
overlayCanvas = document.getElementById('overlayCanvas');
overlayCtx = overlayCanvas.getContext('2d');
// Match size with main canvas
overlayCanvas.width = canvasWidth;
overlayCanvas.height = canvasHeight;

// Modified drawMarquee() - draws only on overlay canvas
function drawMarquee() {
    if (!isMarqueeSelecting) {
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        return;
    }
    
    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    // ... draw marquee on overlayCtx
}

// Modified mousemove handler
else if (isMarqueeSelecting) {
    marqueeCurrentX = x;
    marqueeCurrentY = y;
    drawMarquee(); // Direct call, no full redraw
}
```

**Performance Gain**: ~90-95% reduction in redraw cost during marquee (only overlay redraws)

**Complexity**: Low - minimal changes

---

### Option 2: Conditional Drawing During Marquee
**Approach**: Skip expensive drawing operations when only marquee is updating.

**Benefits**:
- No HTML changes needed
- Can skip background, grid, and marker drawing during marquee
- Still redraws marquee area

**Implementation**:
```javascript
function draw() {
    // Cancel any pending animation frame
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    needsRedraw = false;
    
    // Fast path for marquee-only updates
    if (isMarqueeSelecting && !needsFullRedraw) {
        // Only redraw marquee overlay area
        const rectX = Math.min(marqueeStartX, marqueeCurrentX);
        const rectY = Math.min(marqueeStartY, marqueeCurrentY);
        const rectWidth = Math.abs(marqueeCurrentX - marqueeStartX);
        const rectHeight = Math.abs(marqueeCurrentY - marqueeStartY);
        
        // Clear previous marquee area (with some padding)
        ctx.clearRect(rectX - 1, rectY - 1, rectWidth + 2, rectHeight + 2);
        drawMarquee();
        return;
    }
    
    // Full redraw path
    for (const item of DRAW_ORDER) {
        if (item.condition && item.condition()) {
            item.draw();
        }
    }
}

// Track if full redraw is needed
let needsFullRedraw = false;

// Set needsFullRedraw = true when markers/data changes
```

**Performance Gain**: ~70-80% reduction (still redraws some areas)

**Complexity**: Medium - requires tracking what needs redraw

---

### Option 3: Viewport Culling (Skip Off-Screen Markers)
**Approach**: Only draw markers that are visible in the current viewport.

**Benefits**:
- Reduces drawing operations significantly when zoomed in
- Works for all drawing operations, not just marquee
- Can combine with other optimizations

**Implementation**:
```javascript
// Calculate visible bounds
function getVisibleBounds() {
    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(canvasWidth, canvasHeight);
    return {
        minX: Math.min(topLeft.x, bottomRight.x),
        maxX: Math.max(topLeft.x, bottomRight.x),
        minZ: Math.min(topLeft.z, bottomRight.z),
        maxZ: Math.max(topLeft.z, bottomRight.z)
    };
}

// In drawMarkerType() and drawMarkers()
const bounds = getVisibleBounds();
markers.forEach((marker, index) => {
    // Skip if marker is outside viewport
    if (marker.x < bounds.minX || marker.x > bounds.maxX ||
        marker.z < bounds.minZ || marker.z > bounds.maxZ) {
        return;
    }
    // ... draw marker
});
```

**Performance Gain**: ~50-70% reduction (depends on zoom level and marker density)

**Complexity**: Medium - need to add bounds checking everywhere

---

### Option 4: Request Throttling with Debouncing
**Approach**: Throttle marquee updates more aggressively.

**Benefits**:
- Simple to implement
- Reduces number of redraws

**Implementation**:
```javascript
let marqueeUpdateTimeout = null;
const MARQUEE_UPDATE_THROTTLE = 16; // ~60fps

else if (isMarqueeSelecting) {
    marqueeCurrentX = x;
    marqueeCurrentY = y;
    
    // Throttle updates
    if (!marqueeUpdateTimeout) {
        marqueeUpdateTimeout = setTimeout(() => {
            requestDraw();
            marqueeUpdateTimeout = null;
        }, MARQUEE_UPDATE_THROTTLE);
    }
}
```

**Performance Gain**: ~30-40% reduction (fewer redraws, but each still expensive)

**Complexity**: Low

---

### Option 5: Canvas Layering with Compositing
**Approach**: Use multiple canvas layers with different update frequencies.

**Benefits**:
- Static layers (background, grid) update rarely
- Dynamic layers (markers) update on data changes
- Overlay layer (marquee) updates frequently

**Implementation**:
- Background canvas (already exists) - updates on image/zoom change
- Main canvas - updates on marker/data changes
- Overlay canvas - updates on marquee/hover

**Performance Gain**: ~85-90% reduction (similar to Option 1)

**Complexity**: Medium - requires restructuring drawing code

---

### Option 6: Dirty Rectangle Updates
**Approach**: Only redraw the area that changed (marquee rectangle).

**Benefits**:
- Very efficient for small updates
- Works with existing canvas

**Implementation**:
```javascript
let lastMarqueeRect = null;

function drawMarquee() {
    if (!isMarqueeSelecting) {
        if (lastMarqueeRect) {
            // Restore area under previous marquee
            ctx.putImageData(lastMarqueeRect.imageData, lastMarqueeRect.x, lastMarqueeRect.y);
            lastMarqueeRect = null;
        }
        return;
    }
    
    const rectX = Math.min(marqueeStartX, marqueeCurrentX);
    const rectY = Math.min(marqueeStartY, marqueeCurrentY);
    const rectWidth = Math.abs(marqueeCurrentX - marqueeStartX);
    const rectHeight = Math.abs(marqueeCurrentY - marqueeStartY);
    
    // Save area under new marquee
    if (lastMarqueeRect) {
        // Restore old area
        ctx.putImageData(lastMarqueeRect.imageData, lastMarqueeRect.x, lastMarqueeRect.y);
    }
    
    // Save new area
    const imageData = ctx.getImageData(rectX, rectY, rectWidth, rectHeight);
    lastMarqueeRect = { x: rectX, y: rectY, imageData };
    
    // Draw marquee
    // ... draw marquee rectangle
}
```

**Performance Gain**: ~80-85% reduction

**Complexity**: Medium-High - requires careful state management

---

## Recommended Approach: Option 1 (Separate Overlay Canvas)

**Why**: 
- Best performance improvement (~90-95%)
- Clean separation of concerns
- Easy to implement
- Also benefits tooltip rendering
- Minimal risk of breaking existing functionality

**Implementation Steps**:
1. Add overlay canvas to HTML (or create dynamically)
2. Initialize overlay canvas in `initCanvas()`
3. Modify `drawMarquee()` to use overlay canvas
4. Update mousemove handler to call `drawMarquee()` directly during marquee
5. Keep full `draw()` for when marquee ends or other updates needed

**Additional Benefits**:
- Tooltip can also use overlay canvas (faster hover updates)
- Future overlays (selection highlights, etc.) can use same canvas
- Main canvas can be optimized separately

---

## Performance Comparison

| Option | Performance Gain | Complexity | Risk |
|--------|------------------|------------|------|
| Option 1: Separate Overlay | 90-95% | Low | Low |
| Option 2: Conditional Drawing | 70-80% | Medium | Medium |
| Option 3: Viewport Culling | 50-70% | Medium | Low |
| Option 4: Throttling | 30-40% | Low | Low |
| Option 5: Canvas Layering | 85-90% | Medium | Medium |
| Option 6: Dirty Rectangles | 80-85% | Medium-High | Medium |

---

## Combined Approach (Maximum Performance)

For best results, combine:
1. **Option 1** (Separate Overlay Canvas) - for marquee/tooltip
2. **Option 3** (Viewport Culling) - for marker drawing
3. **Option 4** (Throttling) - as safety net

This combination would provide:
- ~95% reduction during marquee (overlay only)
- ~60-70% reduction in normal drawing (viewport culling)
- Smooth 60fps marquee updates
- Better performance overall

