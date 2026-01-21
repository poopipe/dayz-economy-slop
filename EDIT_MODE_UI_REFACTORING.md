# Edit Mode UI Refactoring Recommendations

## Current State Analysis

### Issues Identified

1. **Inconsistent UI Structure**
   - Each marker type has hardcoded HTML in `map_viewer.html` (lines 58-123)
   - Similar structure but slight variations (some have discard buttons, some don't)
   - Territory zones have a territory type selector
   - Zombie territory zones have parameter controls (list boxes)
   - No consistent pattern for adding new marker types

2. **Tight Coupling**
   - JavaScript code directly references hardcoded element IDs (`getEditControlsId()`, `getEditCheckboxId()`)
   - UI structure is defined in HTML template, but behavior is in JavaScript
   - Special cases (zombie parameter controls) are not part of the standard pattern

3. **Mixed Responsibilities**
   - `handleEditingToggle()` (line 4624) handles UI visibility but structure is in HTML
   - Save/discard button handlers are registered separately for each type (lines 6370-6465)
   - No unified system for managing edit control UI

4. **Difficult to Extend**
   - Adding a new marker type requires:
     - Adding HTML structure to template
     - Adding JavaScript handlers for save/discard buttons
     - Ensuring IDs match between HTML and JavaScript
     - Handling special cases manually

5. **Inconsistent Features**
   - Some types have discard buttons, others don't
   - Territory zones have a dropdown selector
   - Zombie territory zones have dynamic parameter controls
   - No standard way to add custom controls

## Recommended Refactoring Approach

### 1. Create a Unified Edit Controls UI System

**Goal**: Generate edit controls dynamically from configuration, eliminating hardcoded HTML.

**Implementation**:

```javascript
// New class: EditControlsManager
class EditControlsManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.activeControls = new Map(); // Map<markerType, HTMLElement>
    }
    
    // Create edit controls for a marker type
    createControls(markerType, config) {
        const typeConfig = markerTypes[markerType];
        if (!typeConfig) return null;
        
        // Create wrapper div
        const wrapper = document.createElement('div');
        wrapper.id = typeConfig.getEditControlsId();
        wrapper.className = 'edit-controls';
        wrapper.style.display = 'none';
        
        // Add instructions (standardized)
        const instructions = this.createInstructions(config.instructions);
        wrapper.appendChild(instructions);
        
        // Add custom controls (if any)
        if (config.customControls) {
            const customContainer = document.createElement('div');
            customContainer.className = 'custom-controls';
            config.customControls.forEach(control => {
                customContainer.appendChild(this.createCustomControl(control));
            });
            wrapper.appendChild(customContainer);
        }
        
        // Add action buttons
        const buttonContainer = this.createButtonContainer(markerType, config);
        wrapper.appendChild(buttonContainer);
        
        return wrapper;
    }
    
    createInstructions(instructions) {
        const p = document.createElement('p');
        p.className = 'edit-instructions';
        p.style.fontSize = '11px';
        p.style.color = 'var(--nord4)';
        p.style.marginTop = '5px';
        p.style.marginBottom = '5px';
        
        const lines = instructions.map(instruction => {
            const strong = document.createElement('strong');
            strong.textContent = `${instruction.label}: `;
            return [strong, document.createTextNode(instruction.text)];
        }).flat();
        
        lines.forEach((node, i) => {
            if (i > 0 && i % 2 === 0) {
                p.appendChild(document.createElement('br'));
            }
            p.appendChild(node);
        });
        
        return p;
    }
    
    createCustomControl(controlConfig) {
        switch (controlConfig.type) {
            case 'select':
                return this.createSelectControl(controlConfig);
            case 'listboxes':
                return this.createListBoxesControl(controlConfig);
            default:
                return document.createTextNode('');
        }
    }
    
    createSelectControl(config) {
        const container = document.createElement('div');
        
        const label = document.createElement('label');
        label.style.fontSize = '11px';
        label.style.color = 'var(--nord4)';
        label.style.display = 'block';
        label.style.marginBottom = '5px';
        
        const strong = document.createElement('strong');
        strong.textContent = config.label;
        label.appendChild(strong);
        container.appendChild(label);
        
        const select = document.createElement('select');
        select.id = config.id;
        select.style.width = '100%';
        select.style.padding = '4px';
        select.style.marginBottom = '8px';
        select.style.fontSize = '11px';
        select.style.background = 'var(--nord1)';
        select.style.color = 'var(--nord4)';
        select.style.border = '1px solid var(--nord3)';
        select.style.borderRadius = '4px';
        
        // Populate options
        if (config.options) {
            config.options.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.label;
                select.appendChild(opt);
            });
        }
        
        // Register change handler if provided
        if (config.onChange) {
            select.addEventListener('change', config.onChange);
        }
        
        container.appendChild(select);
        return container;
    }
    
    createListBoxesControl(config) {
        const container = document.createElement('div');
        container.id = config.containerId;
        container.style.marginTop = '10px';
        
        const label = document.createElement('p');
        label.style.fontSize = '11px';
        label.style.color = 'var(--nord4)';
        label.style.marginBottom = '8px';
        
        const strong = document.createElement('strong');
        strong.textContent = config.label;
        label.appendChild(strong);
        container.appendChild(label);
        
        const listBoxesContainer = document.createElement('div');
        listBoxesContainer.id = config.listBoxesId;
        container.appendChild(listBoxesContainer);
        
        return container;
    }
    
    createButtonContainer(markerType, config) {
        const container = document.createElement('div');
        container.className = 'edit-buttons';
        container.style.marginTop = '8px';
        
        // Save button (always present)
        const saveBtn = document.createElement('button');
        saveBtn.id = `save${this.capitalize(markerType)}Btn`;
        saveBtn.textContent = 'Save Changes';
        saveBtn.style.padding = '6px 12px';
        saveBtn.style.background = 'var(--nord10)';
        saveBtn.style.color = 'white';
        saveBtn.style.border = 'none';
        saveBtn.style.borderRadius = '4px';
        saveBtn.style.cursor = 'pointer';
        saveBtn.addEventListener('click', async () => {
            const result = await saveMarkerChanges(markerType);
            if (result.success) {
                updateStatus(result.message);
                markerTypes[markerType].selected.clear();
                updateSelectedCount();
                draw();
            } else {
                updateStatus(`Error: ${result.error}`, 'error');
            }
        });
        container.appendChild(saveBtn);
        
        // Discard button (if configured)
        if (config.showDiscardButton) {
            const discardBtn = document.createElement('button');
            discardBtn.id = `discard${this.capitalize(markerType)}Btn`;
            discardBtn.textContent = 'Discard Changes';
            discardBtn.style.marginLeft = '8px';
            discardBtn.style.padding = '6px 12px';
            discardBtn.style.background = 'var(--nord3)';
            discardBtn.style.color = 'white';
            discardBtn.style.border = 'none';
            discardBtn.style.borderRadius = '4px';
            discardBtn.style.cursor = 'pointer';
            discardBtn.addEventListener('click', () => {
                restoreMarkerPositions(markerType);
                updateSelectedCount();
                draw();
            });
            container.appendChild(discardBtn);
        }
        
        return container;
    }
    
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1).replace(/([A-Z])/g, '$1');
    }
    
    showControls(markerType) {
        const controls = this.activeControls.get(markerType);
        if (controls) {
            controls.style.display = 'block';
        }
    }
    
    hideControls(markerType) {
        const controls = this.activeControls.get(markerType);
        if (controls) {
            controls.style.display = 'none';
        }
    }
    
    // Initialize all controls on page load
    initialize() {
        Object.keys(markerTypes).forEach(markerType => {
            const typeConfig = markerTypes[markerType];
            const config = this.getUIConfig(markerType);
            const controls = this.createControls(markerType, config);
            if (controls) {
                this.container.appendChild(controls);
                this.activeControls.set(markerType, controls);
            }
        });
    }
    
    // Get UI configuration for a marker type
    getUIConfig(markerType) {
        const typeConfig = markerTypes[markerType];
        
        // Base configuration
        const config = {
            instructions: this.getDefaultInstructions(markerType),
            showDiscardButton: false,
            customControls: []
        };
        
        // Type-specific customizations
        switch (markerType) {
            case 'playerSpawnPoints':
                // No special controls
                break;
                
            case 'effectAreas':
                // No special controls
                break;
                
            case 'territoryZones':
                config.customControls.push({
                    type: 'select',
                    id: 'territoryTypeSelect',
                    label: 'Territory Type for New Zones:',
                    options: [], // Will be populated dynamically
                    onChange: (e) => {
                        // Handle territory type change if needed
                    }
                });
                break;
                
            case 'zombieTerritoryZones':
                config.showDiscardButton = true;
                config.customControls.push({
                    type: 'listboxes',
                    containerId: 'zombieZoneParameterControls',
                    listBoxesId: 'zombieZoneParameterListBoxes',
                    label: 'Zone Parameters (for selected zones):'
                });
                break;
        }
        
        return config;
    }
    
    getDefaultInstructions(markerType) {
        const typeConfig = markerTypes[markerType];
        const canEditRadius = typeConfig.canEditRadius;
        const canEditDimensions = typeConfig.canEditDimensions;
        
        const instructions = [
            { label: 'Add', text: 'Ctrl+Click (Cmd+Click on Mac) to add marker at cursor' }
        ];
        
        if (canEditRadius) {
            instructions.push(
                { label: 'Move', text: 'Click and drag center of circle' },
                { label: 'Resize', text: 'Click and drag edge or handle (white dot) to change radius' }
            );
        } else if (canEditDimensions) {
            instructions.push(
                { label: 'Move', text: 'Click and drag to move marker' },
                { label: 'Resize', text: 'Drag corners to resize rectangle' }
            );
        } else {
            instructions.push(
                { label: 'Move', text: 'Click and drag to move marker' }
            );
        }
        
        instructions.push(
            { label: 'Delete', text: 'Select markers and press Delete/Backspace' }
        );
        
        return instructions;
    }
}
```

### 2. Extend Marker Type Configuration

**Add UI configuration to `markerTypes`**:

```javascript
const markerTypes = {
    playerSpawnPoints: {
        // ... existing config ...
        
        // New: UI configuration
        uiConfig: {
            showDiscardButton: false,
            customControls: []
        }
    },
    
    territoryZones: {
        // ... existing config ...
        
        uiConfig: {
            showDiscardButton: false,
            customControls: [
                {
                    type: 'select',
                    id: 'territoryTypeSelect',
                    label: 'Territory Type for New Zones:',
                    getOptions: () => getAllTerritoryTypeNames().map(name => ({ value: name, label: name })),
                    onChange: (e) => {
                        // Handle change if needed
                    }
                }
            ]
        }
    },
    
    zombieTerritoryZones: {
        // ... existing config ...
        
        uiConfig: {
            showDiscardButton: true,
            customControls: [
                {
                    type: 'listboxes',
                    containerId: 'zombieZoneParameterControls',
                    listBoxesId: 'zombieZoneParameterListBoxes',
                    label: 'Zone Parameters (for selected zones):',
                    createListBoxes: () => {
                        // Function to create list boxes dynamically
                        // This can be called when selection changes
                    }
                }
            ]
        }
    }
};
```

### 3. Simplify HTML Template

**Replace hardcoded edit controls section** with a single container:

```html
<div class="control-group">
    <h3 style="margin: 0 0 10px 0; color: var(--nord9); font-size: 16px;">Edit Markers</h3>
    
    <!-- Dynamically generated checkboxes and controls -->
    <div id="editMarkersContainer">
        <!-- Will be populated by JavaScript -->
    </div>
</div>
```

### 4. Update `handleEditingToggle` Function

**Simplify to use the new system**:

```javascript
async function handleEditingToggle(markerType, enabled) {
    const typeConfig = markerTypes[markerType];
    if (!typeConfig) return;
    
    editingEnabled[markerType] = enabled;
    
    // When enabling editing, clear selections for other types
    if (enabled) {
        for (const otherType of Object.keys(markerTypes)) {
            if (otherType !== markerType) {
                selectionManager.clearSelectionsForType(otherType);
            }
        }
        selectionManager.clearSelectionsForType('regular');
    } else {
        selectionManager.clearSelectionsForType(markerType);
    }
    
    // Use EditControlsManager to show/hide controls
    if (enabled) {
        editControlsManager.showControls(markerType);
    } else {
        editControlsManager.hideControls(markerType);
    }
    
    // Update canvas cursor style
    const anyEditingEnabled = Object.values(editingEnabled).some(v => v === true);
    if (anyEditingEnabled) {
        canvas.classList.add('editing-enabled');
    } else {
        canvas.classList.remove('editing-enabled');
    }
    
    // Handle unsaved changes (existing logic)
    if (!enabled) {
        const hasChanges = typeConfig.originalPositions.size > 0 || 
                          typeConfig.deleted.size > 0 || 
                          typeConfig.new.size > 0;
        
        if (hasChanges) {
            const discard = confirm('You have unsaved changes. Discard them?');
            if (discard) {
                restoreMarkerPositions(markerType);
                selectionManager.clearSelectionsForType(markerType);
            } else {
                editingEnabled[markerType] = true;
                const checkboxId = typeConfig.getEditCheckboxId();
                const checkbox = document.getElementById(checkboxId);
                if (checkbox) checkbox.checked = true;
                canvas.classList.add('editing-enabled');
                editControlsManager.showControls(markerType);
                return;
            }
        } else {
            selectionManager.clearSelectionsForType(markerType);
        }
        
        updateSelectedCount();
        draw();
    }
}
```

### 5. Remove Hardcoded Button Handlers

**All button handlers are now created automatically** by `EditControlsManager`, eliminating the need for separate registration code (lines 6370-6465).

## Benefits of This Refactoring

1. **Consistent UI**: All edit modes use the same structure and styling
2. **Easy to Extend**: Adding a new marker type only requires:
   - Adding configuration to `markerTypes`
   - Optionally defining `uiConfig` for custom controls
   - No HTML changes needed
3. **Separation of Concerns**: 
   - UI structure is defined in JavaScript configuration
   - HTML template is minimal and generic
   - Behavior is centralized in `EditControlsManager`
4. **Type Safety**: Configuration-driven approach reduces errors from mismatched IDs
5. **Maintainability**: Changes to UI structure only need to be made in one place
6. **Flexibility**: Custom controls can be added through configuration without modifying core code

## Migration Path

1. **Phase 1**: Create `EditControlsManager` class alongside existing code
2. **Phase 2**: Update `markerTypes` to include `uiConfig` for each type
3. **Phase 3**: Update HTML template to use container div
4. **Phase 4**: Initialize `EditControlsManager` on page load
5. **Phase 5**: Update `handleEditingToggle` to use new system
6. **Phase 6**: Remove hardcoded button handlers
7. **Phase 7**: Remove old HTML edit controls section
8. **Phase 8**: Test all marker types thoroughly

## Special Cases Handling

### Territory Type Selector
- Handled through `customControls` configuration
- Options populated dynamically from `getAllTerritoryTypeNames()`
- Change handler can be registered in configuration

### Zombie Territory Zone Parameter Controls
- Handled through `listboxes` custom control type
- Container created by `EditControlsManager`
- List boxes can be populated/updated when selection changes via event listeners

### Dynamic Control Updates
- `EditControlsManager` can expose methods to update custom controls
- Selection change events can trigger updates to parameter controls
- Territory type selector can be updated when territories are loaded

## Example: Adding a New Marker Type

**Before** (required HTML + JavaScript changes):
1. Add HTML structure to template
2. Add checkbox and controls div
3. Add save/discard button handlers
4. Ensure IDs match

**After** (only configuration):
```javascript
const markerTypes = {
    newMarkerType: {
        // ... standard config ...
        uiConfig: {
            showDiscardButton: true,
            customControls: [
                {
                    type: 'select',
                    id: 'newTypeSelect',
                    label: 'Type:',
                    getOptions: () => [...]
                }
            ]
        }
    }
};
```

That's it! The UI is automatically generated.

