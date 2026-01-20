# Selection Handling Refactoring Recommendations

## Current State Analysis

### Issues Identified

1. **Inconsistent Selection Logic**
   - Selection code is scattered across multiple functions (`selectAtPoint`, `selectAtPointForType`, `selectMarkersInRectangle`, `handleMouseDown`)
   - Duplication between regular markers (`selectedMarkers`) and editable markers (`typeConfig.selected`)
   - No unified selection manager

2. **Editing Mode Restrictions Not Fully Enforced**
   - When editing is enabled, selection should be restricted to ONLY the currently active editing type
   - Currently, `selectMarkersInRectangle` clears selections for ALL editable types, but should only work with the active type
   - `selectAtPoint` checks all editable types, but should prioritize/restrict to active editing type

3. **Visibility Checks**
   - Visibility checks are implemented but scattered (`isMarkerVisible` is called in multiple places)
   - `cleanupHiddenSelections()` exists but may not be called consistently
   - Need to ensure visibility is checked BEFORE selection, not just during cleanup

4. **Visual Updates During Drag**
   - `requestDraw()` is called during drag, which should work, but needs verification
   - Marker positions are updated in `handleDrag` but drawing may not reflect changes immediately

## Recommended Refactoring

### 1. Create a Unified Selection Manager

**New Class: `SelectionManager`**

```javascript
class SelectionManager {
    constructor() {
        this.activeEditingType = null; // Only one type can be actively edited at a time
    }
    
    // Get the currently active editing type (only one should be active)
    getActiveEditingType() {
        for (const markerType of Object.keys(markerTypes)) {
            if (editingEnabled[markerType] && markerTypes[markerType].getShowFlag()) {
                return markerType;
            }
        }
        return null;
    }
    
    // Check if a marker can be selected (visible and of correct type)
    canSelectMarker(markerType, index) {
        // Must be visible
        if (!isMarkerVisible(markerType, index)) {
            return false;
        }
        
        // If editing mode is active, only allow selection of active type
        const activeType = this.getActiveEditingType();
        if (activeType !== null && markerType !== activeType) {
            return false;
        }
        
        return true;
    }
    
    // Select a marker (with visibility and type checks)
    selectMarker(markerType, index, options = {}) {
        const { altKey = false, clearOthers = true } = options;
        
        if (!this.canSelectMarker(markerType, index)) {
            return false;
        }
        
        const typeConfig = markerTypes[markerType];
        if (!typeConfig) return false;
        
        if (altKey) {
            // Toggle selection
            if (typeConfig.selected.has(index)) {
                typeConfig.selected.delete(index);
            } else {
                typeConfig.selected.add(index);
            }
        } else {
            // Replace selection
            if (clearOthers) {
                this.clearAllSelections();
            }
            typeConfig.selected.add(index);
        }
        
        return true;
    }
    
    // Clear all selections
    clearAllSelections() {
        // Clear regular markers
        selectedMarkers.clear();
        
        // Clear all editable marker types
        for (const markerType of Object.keys(markerTypes)) {
            markerTypes[markerType].selected.clear();
        }
    }
    
    // Clear selections for a specific type
    clearSelectionsForType(markerType) {
        if (markerType === 'regular') {
            selectedMarkers.clear();
        } else {
            const typeConfig = markerTypes[markerType];
            if (typeConfig) {
                typeConfig.selected.clear();
            }
        }
    }
    
    // Clean up hidden markers from selections
    cleanupHiddenSelections() {
        // Regular markers
        const visibleSelected = new Set();
        selectedMarkers.forEach(index => {
            if (visibleMarkers.size === 0 || visibleMarkers.has(index)) {
                visibleSelected.add(index);
            }
        });
        selectedMarkers = visibleSelected;
        
        // Editable marker types
        for (const markerType of Object.keys(markerTypes)) {
            const typeConfig = markerTypes[markerType];
            const visibleSelected = new Set();
            typeConfig.selected.forEach(index => {
                if (isMarkerVisible(markerType, index)) {
                    visibleSelected.add(index);
                }
            });
            typeConfig.selected = visibleSelected;
        }
    }
    
    // Select markers in rectangle
    selectInRectangle(rectX, rectY, rectWidth, rectHeight, options = {}) {
        const { altKey = false } = options;
        const addToSelection = !altKey;
        
        // Convert rectangle to world coordinates
        const topLeft = screenToWorld(rectX, rectY);
        const bottomRight = screenToWorld(rectX + rectWidth, rectY + rectHeight);
        const minX = Math.min(topLeft.x, bottomRight.x);
        const maxX = Math.max(topLeft.x, bottomRight.x);
        const minZ = Math.min(topLeft.z, bottomRight.z);
        const maxZ = Math.max(topLeft.z, bottomRight.z);
        
        const activeType = this.getActiveEditingType();
        
        // If in editing mode, only work with active type
        if (activeType !== null) {
            // Clear selection for active type if replacing
            if (addToSelection) {
                this.clearSelectionsForType(activeType);
            }
            
            const typeConfig = markerTypes[activeType];
            const array = typeConfig.getArray();
            
            array.forEach((marker, index) => {
                if (typeConfig.isDeleted(index)) return;
                if (!this.canSelectMarker(activeType, index)) return;
                
                // Check if marker is within rectangle
                if (marker.x >= minX && marker.x <= maxX &&
                    marker.z >= minZ && marker.z <= maxZ) {
                    if (addToSelection) {
                        typeConfig.selected.add(index);
                    } else {
                        typeConfig.selected.delete(index);
                    }
                }
            });
        } else {
            // Not in editing mode - work with regular markers
            if (addToSelection) {
                selectedMarkers.clear();
            }
            
            markers.forEach((marker, index) => {
                if (!this.canSelectMarker('regular', index)) return;
                
                if (marker.x >= minX && marker.x <= maxX &&
                    marker.z >= minZ && marker.z <= maxZ) {
                    if (addToSelection) {
                        selectedMarkers.add(index);
                    } else {
                        selectedMarkers.delete(index);
                    }
                }
            });
        }
        
        this.cleanupHiddenSelections();
    }
    
    // Select marker at point
    selectAtPoint(screenX, screenY, options = {}) {
        const { altKey = false } = options;
        const activeType = this.getActiveEditingType();
        
        // If in editing mode, only check active type
        if (activeType !== null) {
            const typeConfig = markerTypes[activeType];
            const array = typeConfig.getArray();
            
            for (let index = 0; index < array.length; index++) {
                if (typeConfig.isDeleted(index)) continue;
                if (!this.canSelectMarker(activeType, index)) continue;
                
                const marker = typeConfig.getMarker(index);
                const screenPos = typeConfig.getScreenPos(marker);
                
                if (typeConfig.isPointOnMarker(marker, screenX, screenY, screenPos)) {
                    this.selectMarker(activeType, index, { altKey, clearOthers: !altKey });
                    return true;
                }
            }
        } else {
            // Not in editing mode - check regular markers
            markers.forEach((marker, index) => {
                if (!this.canSelectMarker('regular', index)) return;
                
                const screenPos = worldToScreen(marker.x, marker.z);
                const dx = screenPos.x - screenX;
                const dy = screenPos.y - screenY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < MARKER_INTERACTION_THRESHOLD) {
                    if (altKey) {
                        selectedMarkers.delete(index);
                    } else {
                        this.clearAllSelections();
                        selectedMarkers.add(index);
                    }
                    return true;
                }
            });
        }
        
        return false;
    }
}
```

### 2. Refactor Mouse Event Handlers

**Simplified `handleMouseDown`:**
```javascript
function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    if (e.button === 0) { // Left click
        // Check for marker click first
        if (selectionManager.selectAtPoint(x, y, { altKey: e.altKey })) {
            // Marker was selected
            updateSelectedCount();
            requestDraw();
        } else {
            // Empty space - start marquee
            isMarqueeSelecting = true;
            marqueeStartX = x;
            marqueeStartY = y;
            marqueeCurrentX = x;
            marqueeCurrentY = y;
            requestDraw();
        }
    }
}
```

**Simplified `handleMouseUp`:**
```javascript
function handleMouseUp(e) {
    if (e.button === 0 && isMarqueeSelecting) {
        const rectX = Math.min(marqueeStartX, marqueeCurrentX);
        const rectY = Math.min(marqueeStartY, marqueeCurrentY);
        const rectWidth = Math.abs(marqueeCurrentX - marqueeStartX);
        const rectHeight = Math.abs(marqueeCurrentY - marqueeStartY);
        
        if (rectWidth > 5 && rectHeight > 5) {
            // Valid marquee - select markers
            selectionManager.selectInRectangle(rectX, rectY, rectWidth, rectHeight, {
                altKey: e.altKey
            });
        } else {
            // Small rectangle - treat as empty click
            selectionManager.clearAllSelections();
        }
        
        isMarqueeSelecting = false;
        updateSelectedCount();
        draw();
    }
}
```

### 3. Ensure Visual Updates During Drag

**Enhance `handleDrag` to ensure immediate visual feedback:**
```javascript
function handleDrag(screenX, screenY) {
    // ... existing drag logic ...
    
    // Force immediate redraw after position update
    requestDraw();
    // Also call draw() directly for immediate feedback during drag
    draw();
}
```

**Or use `requestAnimationFrame` for smoother updates:**
```javascript
function handleDrag(screenX, screenY) {
    // ... existing drag logic ...
    
    // Use requestAnimationFrame for smooth updates
    if (!dragAnimationFrame) {
        dragAnimationFrame = requestAnimationFrame(() => {
            draw();
            dragAnimationFrame = null;
        });
    }
}
```

### 4. Update Editing Toggle to Use Selection Manager

**When enabling editing:**
```javascript
function handleEditingToggle(markerType, enabled) {
    // ... existing code ...
    
    // When enabling editing, clear selections for other types
    if (enabled) {
        // Clear selections for all other types
        for (const otherType of Object.keys(markerTypes)) {
            if (otherType !== markerType) {
                selectionManager.clearSelectionsForType(otherType);
            }
        }
        // Also clear regular markers
        selectionManager.clearSelectionsForType('regular');
    }
    
    // ... rest of existing code ...
}
```

### 5. Key Points for Implementation

1. **Single Source of Truth**: All selection logic goes through `SelectionManager`
2. **Visibility First**: Always check visibility before allowing selection
3. **Type Restriction**: When editing, only the active editing type can be selected
4. **Consistent Behavior**: Same selection behavior whether clicking or marquee selecting
5. **Immediate Feedback**: Ensure visual updates happen during drag operations

### 6. Migration Strategy

1. Create `SelectionManager` class
2. Replace all selection calls with `selectionManager` methods
3. Remove duplicate selection logic from individual functions
4. Test thoroughly with all marker types
5. Ensure backward compatibility with existing key/mouse combinations

### 7. Testing Checklist

- [ ] Single click selects marker (replaces previous selection)
- [ ] Alt+Click toggles selection (adds/removes from selection)
- [ ] Marquee selection works in non-editing mode
- [ ] Marquee selection works in editing mode (only active type)
- [ ] Only visible markers can be selected
- [ ] Hidden markers are removed from selection automatically
- [ ] Dragging updates marker positions visually in real-time
- [ ] Multiple markers can be selected and dragged together
- [ ] Selection is cleared when switching editing modes
- [ ] Empty click clears selection (when not Alt+Click)

## Benefits

1. **Consistency**: All selection logic in one place
2. **Maintainability**: Easier to modify selection behavior
3. **Correctness**: Guaranteed visibility and type restrictions
4. **Performance**: Centralized cleanup and validation
5. **Extensibility**: Easy to add new selection features

