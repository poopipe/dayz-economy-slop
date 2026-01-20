# Refactoring Recommendations for Marker Editing, Selection, and Display

## Executive Summary

The current codebase has a good foundation with the `markerTypes` configuration system, but there are opportunities to improve extensibility, reduce duplication, and make it easier to add new marker types. This document outlines specific recommendations for refactoring.

## Current Architecture Analysis

### Strengths
1. **Generic markerTypes system**: The `markerTypes` object provides a good abstraction for different marker types
2. **Consistent API**: Most marker types follow similar patterns (getArray, getMarker, isDeleted, etc.)
3. **Separation of concerns**: Editing state is managed separately from display state

### Issues Identified

1. **Code Duplication**: Drawing functions (`drawEffectAreas`, `drawTerritories`, `drawZombieTerritories`, `drawPlayerSpawnPoints`) have significant duplication
2. **Special-case Handling**: Hard-coded checks for specific marker types scattered throughout the codebase
3. **Tight Coupling**: Territory zone handling is tightly coupled to specific types (`territoryZones`, `zombieTerritoryZones`)
4. **Mixed Responsibilities**: Drawing, editing, and selection logic are intermingled
5. **Complex State Management**: Multiple global variables for drag state, radius editing, etc.
6. **Inconsistent Patterns**: Some marker types have special handling that breaks the generic pattern
7. **Hard-coded Drawing Order**: The `draw()` function has a hard-coded sequence of drawing calls

## Refactoring Recommendations

### 1. Create a Marker Renderer System

**Problem**: Drawing functions are duplicated and have special cases for each marker type.

**Solution**: Create a unified rendering system that uses the `markerTypes` configuration.

```javascript
// Proposed structure
class MarkerRenderer {
    constructor(typeConfig, ctx) {
        this.typeConfig = typeConfig;
        this.ctx = ctx;
    }
    
    render(marker, index, renderState) {
        // renderState contains: isSelected, isHovered, isEditing, isDragging, etc.
        // Use typeConfig to determine rendering style
    }
}

// In markerTypes configuration, add:
renderer: {
    getStyle: (marker, state) => ({ fillColor, strokeColor, lineWidth, alpha }),
    drawShape: (ctx, marker, screenPos, style) => { /* draw circle/rect/etc */ },
    drawHandles: (ctx, marker, screenPos, style) => { /* draw editing handles */ }
}
```

**Benefits**:
- Eliminates duplication in drawing functions
- Makes it easy to add new marker types with custom rendering
- Centralizes rendering logic
- Allows for consistent styling across marker types

### 2. Extract Marker Interaction System

**Problem**: Selection, dragging, and radius editing logic is scattered and has special cases.

**Solution**: Create a unified interaction handler system.

```javascript
class MarkerInteractionHandler {
    constructor(typeConfig) {
        this.typeConfig = typeConfig;
    }
    
    handleClick(screenX, screenY, modifiers) { /* unified click handling */ }
    handleDragStart(screenX, screenY) { /* unified drag start */ }
    handleDrag(screenX, screenY) { /* unified drag update */ }
    handleDragEnd() { /* unified drag end */ }
    handleRadiusEdit(screenX, screenY) { /* unified radius editing */ }
    handleDelete(indices) { /* unified deletion */ }
}
```

**Benefits**:
- Removes special-case handling from event handlers
- Makes interaction behavior consistent
- Easier to add new interaction types (e.g., rotation, scaling)

### 3. Abstract Territory Zone Handling

**Problem**: Territory zones have special mapping logic (`zoneToTerritoryMap`, `zombieZoneToTerritoryMap`) that's tightly coupled.

**Solution**: Create a generic "nested marker" system.

```javascript
// In markerTypes configuration:
nestedStructure: {
    // For simple markers: null
    // For territory zones:
    getParentArray: () => territories,
    getParentKey: (marker) => marker.territoryType,
    getNestedArray: (parent) => parent.zones,
    createParent: (key) => ({ territory_type: key, zones: [] }),
    syncToParent: (marker, index, parent, nestedIndex) => { /* sync logic */ }
}
```

**Benefits**:
- Removes need for separate `territoryZones` and `zombieTerritoryZones` types
- Makes it easy to add other nested marker types
- Centralizes sync logic

### 4. Create a Marker State Manager

**Problem**: State management is scattered across multiple global variables and the `markerTypes` object.

**Solution**: Create a centralized state manager.

```javascript
class MarkerStateManager {
    constructor() {
        this.editingEnabled = new Map();
        this.selections = new Map(); // Map<markerType, Set<index>>
        this.deleted = new Map();
        this.new = new Map();
        this.originalPositions = new Map();
        this.dragState = null;
        this.radiusEditState = null;
    }
    
    isEditingEnabled(markerType) { /* ... */ }
    getSelected(markerType) { /* ... */ }
    // ... other state accessors
}
```

**Benefits**:
- Centralizes all state management
- Makes state transitions explicit
- Easier to debug and test
- Can add undo/redo functionality more easily

### 5. Implement a Plugin/Extension System

**Problem**: Adding new marker types requires modifying multiple parts of the codebase.

**Solution**: Create a registration system for marker types.

```javascript
class MarkerTypeRegistry {
    constructor() {
        this.types = new Map();
    }
    
    register(typeName, config) {
        // Validate config
        // Set up default values
        // Register with state manager
        this.types.set(typeName, config);
    }
    
    getType(typeName) {
        return this.types.get(typeName);
    }
    
    getAllTypes() {
        return Array.from(this.types.keys());
    }
}

// Usage:
registry.register('customMarker', {
    getArray: () => customMarkers,
    // ... other config
});
```

**Benefits**:
- New marker types can be added without modifying core code
- Configuration is validated at registration time
- Makes the system truly extensible

### 6. Separate Display from Logic

**Problem**: Drawing functions contain business logic (e.g., checking if marker is deleted, visible, etc.).

**Solution**: Create a display pipeline.

```javascript
class DisplayPipeline {
    constructor() {
        this.stages = [];
    }
    
    addStage(stage) {
        this.stages.push(stage);
    }
    
    render(ctx, markerType, renderState) {
        const markers = this.getVisibleMarkers(markerType);
        for (const stage of this.stages) {
            stage.render(ctx, markers, renderState);
        }
    }
}

// Stages:
// - BackgroundStage (grid, background image)
// - MarkerStage (markers, territories, etc.)
// - OverlayStage (selection highlights, handles)
// - TooltipStage (tooltips)
```

**Benefits**:
- Clear separation of concerns
- Easy to reorder or disable stages
- Can add new stages (e.g., animation, effects) easily

### 7. Create Marker Type Factories

**Problem**: Marker creation logic is embedded in `createNew` functions with special cases.

**Solution**: Use factory pattern with configuration.

```javascript
class MarkerFactory {
    static create(typeName, worldPos, options = {}) {
        const typeConfig = markerTypeRegistry.getType(typeName);
        const factory = typeConfig.factory || DefaultMarkerFactory;
        return factory.create(typeConfig, worldPos, options);
    }
}

// In markerTypes config:
factory: {
    getDefaultRadius: () => 50.0,
    getDefaultDimensions: () => ({ width: 100, height: 100 }),
    createMarker: (worldPos, defaults) => { /* create marker object */ }
}
```

**Benefits**:
- Consistent marker creation
- Easy to customize creation logic per type
- Can add validation at creation time

### 8. Abstract Tooltip Generation

**Problem**: Tooltip logic has special cases for zombie territories and other types.

**Solution**: Make tooltip generation part of the marker type configuration.

```javascript
// In markerTypes config:
tooltip: {
    getLines: (marker) => [
        marker.name || '(Unnamed)',
        '',
        `X: ${marker.x.toFixed(2)} m`,
        `Y: ${marker.y.toFixed(2)} m`,
        `Z: ${marker.z.toFixed(2)} m`,
        marker.radius ? `Radius: ${marker.radius.toFixed(2)} m` : null
    ].filter(Boolean)
}
```

**Benefits**:
- Each marker type controls its own tooltip
- No special cases in tooltip rendering code
- Easy to customize tooltip per type

### 9. Create Event System for Marker Changes

**Problem**: Changes to markers trigger updates in multiple places, making it hard to track.

**Solution**: Implement an event system.

```javascript
class MarkerEventEmitter {
    constructor() {
        this.listeners = new Map();
    }
    
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    emit(event, data) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(cb => cb(data));
    }
}

// Events:
// - 'marker:created'
// - 'marker:deleted'
// - 'marker:moved'
// - 'marker:selected'
// - 'marker:deselected'
```

**Benefits**:
- Decouples components
- Makes it easy to add new behaviors (e.g., logging, analytics)
- Clearer data flow

### 10. Refactor Drawing Order to be Configuration-Driven

**Problem**: Drawing order is hard-coded in the `draw()` function.

**Solution**: Make drawing order configurable.

```javascript
const DRAW_ORDER = [
    { type: 'background', stage: 'background' },
    { type: 'grid', stage: 'background' },
    { type: 'markers', stage: 'markers' },
    { type: 'territories', stage: 'markers' },
    { type: 'effectAreas', stage: 'markers' },
    { type: 'overlays', stage: 'overlay' },
    { type: 'tooltip', stage: 'overlay' }
];

function draw() {
    for (const item of DRAW_ORDER) {
        if (item.type === 'markers') {
            // Draw all marker types
        } else {
            drawFunctionMap[item.type]();
        }
    }
}
```

**Benefits**:
- Easy to reorder or disable drawing stages
- Can add new drawing stages without modifying core code
- Makes z-ordering explicit

## Implementation Strategy

### Phase 1: Foundation (Low Risk)
1. Extract tooltip generation to marker type config
2. Create marker state manager
3. Abstract drawing order

### Phase 2: Rendering (Medium Risk)
1. Create marker renderer system
2. Refactor drawing functions to use renderer
3. Test thoroughly with existing marker types

### Phase 3: Interaction (Medium Risk)
1. Create interaction handler system
2. Refactor event handlers to use interaction handlers
3. Test all interaction scenarios

### Phase 4: Advanced Features (Higher Risk)
1. Abstract territory zone handling
2. Implement plugin system
3. Add event system

## Migration Path

To minimize risk, implement these changes incrementally:

1. **Start with new marker types**: Add new marker types using the new system alongside the old system
2. **Gradually migrate**: Migrate one marker type at a time to the new system
3. **Keep old code**: Keep old code paths until all types are migrated
4. **Remove old code**: Once all types are migrated and tested, remove old code paths

## Testing Strategy

1. **Unit tests**: Test each component (renderer, interaction handler, state manager) in isolation
2. **Integration tests**: Test marker types end-to-end
3. **Visual regression tests**: Ensure rendering looks correct
4. **Interaction tests**: Ensure all interactions work correctly

## Code Examples

### Before (Current):
```javascript
function drawEffectAreas() {
    effectAreas.forEach((area, index) => {
        if (typeConfig.isDeleted(index)) return;
        const screenPos = worldToScreen(area.x, area.z);
        const screenRadius = area.radius * viewScale;
        // ... 50+ lines of drawing code
    });
}
```

### After (Proposed):
```javascript
function drawMarkerType(markerType) {
    const typeConfig = markerTypes[markerType];
    const renderer = new MarkerRenderer(typeConfig, ctx);
    const array = typeConfig.getArray();
    
    array.forEach((marker, index) => {
        if (typeConfig.isDeleted(index)) return;
        if (!isMarkerVisible(markerType, index)) return;
        
        const renderState = {
            isSelected: typeConfig.selected.has(index),
            isHovered: hoveredMarkerIndex === getMarkerIndex(markerType, index),
            isEditing: editingEnabled[markerType],
            // ... other state
        };
        
        renderer.render(marker, index, renderState);
    });
}
```

## Benefits Summary

1. **Extensibility**: New marker types can be added with minimal code changes
2. **Maintainability**: Less duplication, clearer structure
3. **Testability**: Components can be tested in isolation
4. **Consistency**: All marker types follow the same patterns
5. **Performance**: Can optimize rendering/interaction per type
6. **Flexibility**: Easy to customize behavior per marker type

## Risks and Mitigation

1. **Risk**: Breaking existing functionality
   - **Mitigation**: Implement incrementally, keep old code paths during migration

2. **Risk**: Performance degradation
   - **Mitigation**: Profile before and after, optimize hot paths

3. **Risk**: Increased complexity
   - **Mitigation**: Document architecture, provide examples, code reviews

## Conclusion

These refactoring recommendations will make the codebase more extensible, maintainable, and easier to work with. The key is to implement them incrementally, testing thoroughly at each step, and maintaining backward compatibility during the migration.

