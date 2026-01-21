# Plugin/Extension System for Marker Type Registration

## Benefits of Implementing a Plugin/Extension System

### 1. **Separation of Concerns**
**Current State**: All marker types are defined in a single global `markerTypes` object, mixed with core application logic.

**With Plugin System**: Marker type definitions are isolated from core code. Each marker type can be defined in its own module or configuration file, making the codebase more modular.

**Benefit**: Easier to understand, maintain, and test individual marker types without affecting others.

### 2. **No Core Code Modifications**
**Current State**: To add a new marker type, you must:
- Modify `markerTypes` object in `map_viewer.js`
- Ensure all functions handle the new type
- Risk breaking existing functionality

**With Plugin System**: New marker types are added by registering them, without touching core code.

**Benefit**: Reduces risk of introducing bugs, makes code reviews easier, and allows non-core developers to add types.

### 3. **Configuration Validation**
**Current State**: Errors in marker type configuration are discovered at runtime when the code tries to use missing properties.

**With Plugin System**: Configuration is validated at registration time, catching errors immediately with clear messages.

**Benefit**: Faster development cycle, better error messages, prevents runtime crashes.

### 4. **Dynamic Registration**
**Current State**: Marker types are hardcoded at application startup.

**With Plugin System**: Marker types can be registered:
- At application startup (from config files)
- Dynamically (from user actions)
- Conditionally (based on loaded data)
- From external plugins/modules

**Benefit**: More flexible architecture, supports feature flags, allows third-party extensions.

### 5. **Better Testing**
**Current State**: Testing marker types requires testing the entire application or mocking global state.

**With Plugin System**: Each marker type can be tested in isolation by creating a test registration.

**Benefit**: Unit tests are easier to write, faster to run, and more reliable.

### 6. **Documentation and Discoverability**
**Current State**: To understand available marker types, you must read through the `markerTypes` object.

**With Plugin System**: Registered types can be queried, listed, and documented automatically.

**Benefit**: Self-documenting system, easier for new developers to understand available types.

### 7. **Versioning and Compatibility**
**Current State**: All marker types must be compatible with the current codebase version.

**With Plugin System**: Each marker type can specify version requirements, and the system can handle compatibility checks.

**Benefit**: Supports gradual migration, backward compatibility, and deprecation warnings.

### 8. **Conditional Features**
**Current State**: All marker types are always available.

**With Plugin System**: Marker types can be registered conditionally based on:
- Loaded mission data
- User permissions
- Feature flags
- Available backend endpoints

**Benefit**: Supports different mission types, user roles, and feature sets.

### 9. **Third-Party Extensions**
**Current State**: Adding custom marker types requires modifying the main codebase.

**With Plugin System**: External developers or mods can create their own marker types and register them.

**Benefit**: Enables community contributions, mod support, and extensibility.

### 10. **Easier Refactoring**
**Current State**: Changing marker type structure requires updating all type definitions manually.

**With Plugin System**: The registration system can handle migrations, provide default values, and validate structure changes.

**Benefit**: Safer refactoring, automatic migration support, better change management.

---

## Current Process for Adding a New Marker Type

### Step-by-Step (Current System)

1. **Open `map_viewer.js`** and locate the `markerTypes` object (around line 61)

2. **Add new entry to `markerTypes` object**:
   ```javascript
   myNewMarkerType: {
       getArray: () => myNewMarkers,
       setArray: (arr) => { myNewMarkers = arr; },
       getShowFlag: () => showMyNewMarkers,
       canEditRadius: true,
       canEditDimensions: false,
       saveEndpoint: '/api/my-new-markers/save',
       getDisplayName: () => 'My New Markers',
       getEditControlsId: () => 'myNewMarkerEditControls',
       getEditCheckboxId: () => 'editMyNewMarkers',
       getMarker: (index) => myNewMarkers[index],
       isDeleted: (index) => markerTypes.myNewMarkerType.deleted.has(index),
       getScreenPos: (marker) => worldToScreen(marker.x, marker.z),
       isPointOnMarker: (marker, screenX, screenY, screenPos) => {
           // Custom hit detection logic
       },
       createNew: (x, y, z) => {
           // Factory function for new markers
       },
       getOriginalData: (marker) => ({ /* ... */ }),
       restoreOriginal: (marker, original) => { /* ... */ },
       prepareSaveData: (marker, index) => ({ /* ... */ }),
       getTooltipLines: (marker) => [ /* ... */ ],
       selected: new Set(),
       deleted: new Set(),
       new: new Set(),
       originalPositions: new Map()
   }
   ```

3. **Add global variable** for the marker array:
   ```javascript
   let myNewMarkers = [];
   let showMyNewMarkers = true;
   ```

4. **Initialize editing state** (already handled by existing code, but need to ensure it's in the loop)

5. **Add UI elements** in `map_viewer.html`:
   - Checkbox for showing/hiding
   - Edit controls section
   - Save/Discard buttons

6. **Add backend endpoint** in `map_viewer_app.py`:
   - Load function
   - Save function

7. **Add drawing function** (or use `drawMarkerType()` if compatible)

8. **Update drawing order** in `DRAW_ORDER` array

9. **Test thoroughly** to ensure nothing broke

**Problems with Current Process**:
- ❌ Must modify core files
- ❌ Easy to make mistakes (typos, missing properties)
- ❌ No validation until runtime
- ❌ Risk of breaking existing functionality
- ❌ Hard to test in isolation
- ❌ Difficult to share marker types between projects

---

## Proposed Process with Plugin System

### Step-by-Step (With Plugin System)

1. **Create marker type configuration file** (e.g., `marker_types/my_custom_marker.js`):
   ```javascript
   export const myCustomMarkerType = {
       name: 'myCustomMarkers',
       displayName: 'My Custom Markers',
       canEditRadius: true,
       canEditDimensions: false,
       defaultColor: '#00ff00',
       saveEndpoint: '/api/my-custom-markers/save',
       
       // Data management
       getArray: () => myCustomMarkers,
       setArray: (arr) => { myCustomMarkers = arr; },
       getShowFlag: () => showMyCustomMarkers,
       
       // UI configuration
       editControlsId: 'myCustomMarkerEditControls',
       editCheckboxId: 'editMyCustomMarkers',
       
       // Marker operations
       getMarker: (index) => myCustomMarkers[index],
       createNew: (x, y, z) => ({
           id: myCustomMarkers.length,
           name: `Custom_${myCustomMarkers.length}`,
           x, y, z,
           radius: 50.0
       }),
       
       // State management
       isDeleted: (index) => markerStateManager.isDeleted('myCustomMarkers', index),
       
       // Rendering
       getScreenPos: (marker) => worldToScreen(marker.x, marker.z),
       isPointOnMarker: (marker, screenX, screenY, screenPos) => {
           const screenRadius = marker.radius * viewScale;
           const dx = screenPos.x - screenX;
           const dy = screenPos.y - screenY;
           return Math.sqrt(dx * dx + dy * dy) <= screenRadius + MARKER_INTERACTION_THRESHOLD;
       },
       
       // Data persistence
       getOriginalData: (marker) => ({ x: marker.x, y: marker.y, z: marker.z, radius: marker.radius }),
       restoreOriginal: (marker, original) => {
           marker.x = original.x;
           marker.y = original.y;
           marker.z = original.z;
           marker.radius = original.radius;
       },
       prepareSaveData: (marker, index) => ({
           index,
           name: marker.name || `Custom_${index}`,
           x: marker.x ?? 0,
           y: marker.y ?? 0,
           z: marker.z ?? 0,
           radius: marker.radius ?? 50,
           isNew: markerStateManager.isNew('myCustomMarkers', index),
           isDeleted: markerStateManager.isDeleted('myCustomMarkers', index)
       }),
       
       // Tooltip
       getTooltipLines: (marker) => [
           marker.name || '(Unnamed)',
           '',
           `X: ${marker.x.toFixed(2)} m`,
           `Y: ${marker.y.toFixed(2)} m`,
           `Z: ${marker.z.toFixed(2)} m`,
           marker.radius ? `Radius: ${marker.radius.toFixed(2)} m` : null
       ].filter(Boolean)
   };
   ```

2. **Register the marker type** (in initialization code):
   ```javascript
   import { myCustomMarkerType } from './marker_types/my_custom_marker.js';
   
   markerTypeRegistry.register('myCustomMarkers', myCustomMarkerType);
   ```

3. **Add backend endpoint** (separate file or in existing structure):
   ```python
   # In map_viewer_app.py or separate module
   @app.route('/api/my-custom-markers/load', methods=['GET'])
   def load_my_custom_markers():
       # Load logic
       pass
   
   @app.route('/api/my-custom-markers/save', methods=['POST'])
   def save_my_custom_markers():
       # Save logic
       pass
   ```

4. **Add UI elements** (in HTML template or dynamically):
   ```html
   <!-- Can be added dynamically or in template -->
   <div id="myCustomMarkerEditControls" class="edit-controls">
       <!-- Edit UI -->
   </div>
   ```

5. **Done!** The system automatically:
   - Validates the configuration
   - Sets up state management
   - Integrates with rendering system
   - Adds to drawing order
   - Enables all interactions

**Benefits of Plugin System Process**:
- ✅ No core code modifications
- ✅ Configuration validated at registration
- ✅ Isolated, testable code
- ✅ Can be shared between projects
- ✅ Clear error messages if misconfigured
- ✅ Automatic integration with existing systems

---

## Example: Complete Marker Type Registration

### Marker Type Definition File
```javascript
// marker_types/vehicle_spawns.js
export const vehicleSpawnType = {
    name: 'vehicleSpawns',
    displayName: 'Vehicle Spawn Points',
    version: '1.0.0',
    
    // Capabilities
    canEditRadius: false,
    canEditDimensions: true,
    canEditRotation: true,  // New capability!
    
    // Data
    getArray: () => vehicleSpawns,
    setArray: (arr) => { vehicleSpawns = arr; },
    getShowFlag: () => showVehicleSpawns,
    
    // UI
    editControlsId: 'vehicleSpawnEditControls',
    editCheckboxId: 'editVehicleSpawns',
    
    // Operations
    getMarker: (index) => vehicleSpawns[index],
    createNew: (x, y, z) => ({
        id: vehicleSpawns.length,
        name: `Vehicle_${vehicleSpawns.length}`,
        x, y, z,
        width: 200,
        height: 100,
        rotation: 0,
        vehicleType: 'car'
    }),
    
    // State
    isDeleted: (index) => markerStateManager.isDeleted('vehicleSpawns', index),
    
    // Rendering
    getScreenPos: (marker) => worldToScreen(marker.x, marker.z),
    isPointOnMarker: (marker, screenX, screenY, screenPos) => {
        // Custom hit detection for rotated rectangle
        // ... rotation-aware hit detection
    },
    
    // Data persistence
    getOriginalData: (marker) => ({
        x: marker.x, y: marker.y, z: marker.z,
        width: marker.width, height: marker.height, rotation: marker.rotation
    }),
    restoreOriginal: (marker, original) => {
        Object.assign(marker, original);
    },
    prepareSaveData: (marker, index) => ({
        index,
        name: marker.name,
        x: marker.x, y: marker.y, z: marker.z,
        width: marker.width,
        height: marker.height,
        rotation: marker.rotation,
        vehicleType: marker.vehicleType,
        isNew: markerStateManager.isNew('vehicleSpawns', index),
        isDeleted: markerStateManager.isDeleted('vehicleSpawns', index)
    }),
    
    // Tooltip
    getTooltipLines: (marker) => [
        marker.name || '(Unnamed Vehicle)',
        '',
        `X: ${marker.x.toFixed(2)} m`,
        `Y: ${marker.y.toFixed(2)} m`,
        `Z: ${marker.z.toFixed(2)} m`,
        `Width: ${marker.width.toFixed(2)} m`,
        `Height: ${marker.height.toFixed(2)} m`,
        `Rotation: ${marker.rotation.toFixed(1)}°`,
        `Type: ${marker.vehicleType}`
    ],
    
    // Custom rendering (optional - falls back to default if not provided)
    render: (ctx, marker, screenPos, renderState) => {
        // Custom rendering for rotated vehicle spawn rectangle
        // ... custom rendering logic
    }
};
```

### Registration
```javascript
// In initialization code
import { vehicleSpawnType } from './marker_types/vehicle_spawns.js';

// Register the type
markerTypeRegistry.register('vehicleSpawns', vehicleSpawnType);

// The system automatically:
// - Validates all required properties
// - Sets up state management
// - Integrates with renderer (or uses custom renderer)
// - Adds to drawing order
// - Enables all interactions
```

### Validation Example
```javascript
// Inside markerTypeRegistry.register()
const requiredProperties = [
    'name', 'displayName', 'getArray', 'setArray', 'getShowFlag',
    'getMarker', 'createNew', 'getScreenPos', 'isPointOnMarker',
    'getOriginalData', 'restoreOriginal', 'prepareSaveData',
    'getTooltipLines'
];

for (const prop of requiredProperties) {
    if (!config[prop]) {
        throw new Error(`Marker type '${config.name}' missing required property: ${prop}`);
    }
}

// Type checking
if (typeof config.getArray !== 'function') {
    throw new Error(`Marker type '${config.name}': getArray must be a function`);
}
// ... more validation
```

---

## Comparison: Current vs Plugin System

### Adding a New Marker Type

| Aspect | Current System | Plugin System |
|--------|----------------|---------------|
| **Files Modified** | 3-5 core files | 1 new file + registration |
| **Risk of Breaking** | High (touches core) | Low (isolated) |
| **Validation** | Runtime errors | Registration-time errors |
| **Testing** | Full app test | Isolated unit test |
| **Reusability** | Copy-paste code | Import and register |
| **Documentation** | Manual | Self-documenting |
| **Error Messages** | Cryptic runtime errors | Clear validation errors |
| **Time to Add** | 30-60 minutes | 10-20 minutes |

---

## Implementation Complexity

### What Needs to Be Built

1. **MarkerTypeRegistry Class** (~200 lines)
   - Registration method with validation
   - Type querying methods
   - Configuration validation
   - Default value application

2. **Registration API** (~50 lines)
   - Simple `register()` function
   - Validation helpers
   - Error reporting

3. **Integration Points** (~100 lines)
   - Auto-registration from config files
   - Dynamic UI generation (optional)
   - Backend endpoint discovery (optional)

**Total**: ~350 lines of code for a system that makes adding new marker types 3x faster and much safer.

---

## Real-World Use Cases

### Use Case 1: Mission-Specific Marker Types
Different DayZ missions might need different marker types. With the plugin system:
- Mission A registers: spawn points, loot zones, safe zones
- Mission B registers: spawn points, vehicle spawns, base locations
- No code changes needed - just different registration files

### Use Case 2: Community Mods
A community member creates a "trading post" marker type:
- Creates `trading_post_marker.js`
- Shares it with the community
- Others can import and register it
- No need to modify main codebase

### Use Case 3: Feature Flags
Enable/disable marker types based on features:
```javascript
if (features.vehicleSpawning) {
    markerTypeRegistry.register('vehicleSpawns', vehicleSpawnType);
}
```

### Use Case 4: Gradual Migration
Migrate existing marker types to plugin system one at a time:
- Start with new types as plugins
- Gradually migrate existing types
- No big-bang rewrite needed

---

## Conclusion

The plugin/extension system transforms marker type management from a **modification-based** approach to a **registration-based** approach. This provides:

- **Safety**: No core code modifications
- **Speed**: Faster to add new types
- **Quality**: Better validation and error messages
- **Flexibility**: Dynamic, conditional registration
- **Maintainability**: Isolated, testable code
- **Extensibility**: Third-party contributions possible

The investment of ~350 lines of code pays off immediately with the first new marker type and continues to provide value as the system grows.


