# Testing Checklist for Refactoring Changes

## Overview
This checklist covers testing of the refactored marker editing, selection, and display system. Test each item thoroughly and note any issues.

---

## 1. Tooltip Display Tests

### 1.1 Player Spawn Points
- [ ] Hover over a player spawn point (when not editing)
  - [ ] Tooltip shows "Player Spawn Point" as first line
  - [ ] Tooltip shows X, Y, Z coordinates
  - [ ] Tooltip shows rectangle width and height
  - [ ] Tooltip appears in correct position (doesn't go off screen)
- [ ] Hover over a player spawn point (when editing)
  - [ ] Same as above, tooltip still works correctly

### 1.2 Effect Areas
- [ ] Hover over an effect area (when not editing)
  - [ ] Tooltip shows effect area name (or "(Unnamed)")
  - [ ] Tooltip shows X, Y, Z coordinates
  - [ ] Tooltip shows radius
  - [ ] Tooltip shows usage information if available
  - [ ] Tooltip appears in correct position
- [ ] Hover over an effect area (when editing)
  - [ ] Same as above, tooltip still works correctly

### 1.3 Territory Zones (Non-Zombie)
- [ ] Hover over a territory zone (when not editing)
  - [ ] Tooltip shows zone name (or "(Unnamed)")
  - [ ] Tooltip shows X, Y, Z coordinates
  - [ ] Tooltip shows radius
  - [ ] Tooltip shows territory name and territory type
  - [ ] Tooltip appears in correct position
- [ ] Hover over a territory zone (when editing)
  - [ ] Same as above, tooltip still works correctly

### 1.4 Zombie Territory Zones
- [ ] Hover over a zombie territory zone (when not editing)
  - [ ] Tooltip shows zone name (or "(Unnamed)")
  - [ ] Tooltip shows X, Y, Z coordinates
  - [ ] Tooltip shows radius
  - [ ] Tooltip does NOT show territory info (simplified tooltip)
  - [ ] Tooltip appears in correct position
- [ ] Hover over a zombie territory zone (when editing)
  - [ ] Same as above, tooltip still works correctly

### 1.5 Regular Markers (Non-editable)
- [ ] Hover over a regular marker
  - [ ] Tooltip shows marker name
  - [ ] Tooltip shows coordinates
  - [ ] Tooltip shows usage if available
  - [ ] Tooltip shows containers if available

### 1.6 Event Spawns
- [ ] Hover over an event spawn
  - [ ] Tooltip shows spawn name
  - [ ] Tooltip shows coordinates
  - [ ] Tooltip shows categories if available

---

## 2. Marker Display Tests

### 2.1 Effect Areas Display
- [ ] Effect areas are visible when `showEffectAreas` is enabled
- [ ] Effect areas are hidden when `showEffectAreas` is disabled
- [ ] Effect areas render as circles with correct radius
- [ ] Effect areas have orange color (#ff8800) when not editing
- [ ] Effect areas show correct colors when editing:
  - [ ] Selected: Yellow/Orange (#ff8800)
  - [ ] New: Green (#00ff00)
  - [ ] Unsaved changes: Yellow/Orange (#ffaa00)
  - [ ] Being dragged: Yellow (#ffff00)
- [ ] Effect areas show radius handle when selected and editing
- [ ] Effect areas have correct opacity (0.3 base, adjusts with zoom)

### 2.2 Player Spawn Points Display
- [ ] Player spawn points are visible when `showPlayerSpawnPoints` is enabled
- [ ] Player spawn points show as rectangles with center marker
- [ ] Rectangles have correct width and height
- [ ] Center marker is visible and correctly positioned
- [ ] Colors change correctly when editing (selected, new, unsaved, dragging)

### 2.3 Territory Zones Display
- [ ] Territory zones are visible when `showTerritories` is enabled
- [ ] Non-zombie territory zones render correctly
- [ ] Zombie territory zones render correctly
- [ ] Zones show correct colors based on territory type
- [ ] Zones show radius handles when selected and editing

### 2.4 Drawing Order
- [ ] Background image draws first (if enabled)
- [ ] Grid draws correctly
- [ ] Markers draw in correct order:
  - [ ] Regular markers
  - [ ] Event spawns
  - [ ] Territories
  - [ ] Zombie territories
  - [ ] Player spawn points
  - [ ] Effect areas (on top)
- [ ] Marquee selection rectangle draws correctly
- [ ] Tooltip draws on top of everything

---

## 3. Marker Selection Tests

### 3.1 Single Selection
- [ ] Click on an effect area selects it
- [ ] Click on a player spawn point selects it
- [ ] Click on a territory zone selects it
- [ ] Click on a zombie territory zone selects it
- [ ] Selected markers are highlighted correctly
- [ ] Clicking empty space clears selection (when editing)

### 3.2 Multi-Selection (Alt+Click)
- [ ] Alt+Click adds marker to selection
- [ ] Alt+Click on selected marker removes it from selection
- [ ] Multiple markers can be selected simultaneously
- [ ] All selected markers are highlighted

### 3.3 Marquee Selection
- [ ] Drag to create selection rectangle
- [ ] Markers within rectangle are selected
- [ ] Only visible markers are selected
- [ ] Only markers of the active editing type are selected

### 3.4 Selection Clearing
- [ ] Clicking empty space clears selection
- [ ] Disabling editing clears selection
- [ ] Switching editing types clears previous type's selection

---

## 4. Marker Editing Tests

### 4.1 Dragging Markers
- [ ] Drag single selected marker moves it
- [ ] Drag multiple selected markers moves all together
- [ ] Marker position updates in real-time during drag
- [ ] Marker position is correct after drag ends
- [ ] Dragged markers show yellow color while dragging
- [ ] Original position is saved for undo/restore

### 4.2 Radius Editing
- [ ] Click and drag radius handle resizes circle
- [ ] Radius updates in real-time
- [ ] Minimum radius is enforced (1.0)
- [ ] Radius handle is visible when marker is selected
- [ ] Works for effect areas
- [ ] Works for territory zones
- [ ] Works for zombie territory zones

### 4.3 Adding New Markers
- [ ] Right-click adds new marker at cursor position
- [ ] New markers are marked as "new" (green color)
- [ ] New markers are automatically selected
- [ ] New player spawn points have default width/height
- [ ] New effect areas have default radius
- [ ] New territory zones use selected territory type
- [ ] New zombie territory zones are created correctly

### 4.4 Deleting Markers
- [ ] Delete key removes selected markers
- [ ] New markers are immediately removed from array
- [ ] Existing markers are marked as deleted (not removed until save)
- [ ] Deleted markers are not visible
- [ ] Deleted markers are not selectable
- [ ] Multiple markers can be deleted at once

### 4.5 Saving Changes
- [ ] "Save Changes" button saves to backend
- [ ] Only changed markers are sent to backend
- [ ] New markers are saved correctly
- [ ] Deleted markers are removed from files
- [ ] Modified markers update correctly
- [ ] Success message appears after save
- [ ] Local state updates after save (no reload needed)

### 4.6 Discarding Changes
- [ ] "Discard Changes" button restores original positions
- [ ] New markers are removed
- [ ] Deleted markers are restored
- [ ] Modified markers return to original positions
- [ ] Selection is cleared
- [ ] Display updates immediately

---

## 5. Visibility and Filtering Tests

### 5.1 Marker Visibility
- [ ] Only visible markers can be selected
- [ ] Only visible markers can be dragged
- [ ] Only visible markers can be deleted
- [ ] Only visible markers show tooltips
- [ ] Hidden markers don't interfere with interactions

### 5.2 Filtering
- [ ] Filtered markers are not visible
- [ ] Filtered markers are not selectable
- [ ] Filtered markers don't show tooltips
- [ ] Clearing filters restores visibility

---

## 6. Territory-Specific Tests

### 6.1 Territory Zone Editing
- [ ] Territory zones can be added to existing territories
- [ ] Territory zones can be added to new territory types
- [ ] Territory type selector works correctly
- [ ] New zones are added to correct territory
- [ ] Zone changes sync to territories array
- [ ] Only changed territory files are modified on save

### 6.2 Zombie Territory Zone Editing
- [ ] Zombie territory zones have separate editing toggle
- [ ] Zombie territory zones can be added
- [ ] Zombie territory zones can be moved
- [ ] Zombie territory zones can be resized
- [ ] Zombie territory zones can be deleted
- [ ] Changes sync to territories array correctly

---

## 7. Edge Cases and Error Handling

### 7.1 Empty States
- [ ] No markers: No errors, empty display
- [ ] No territories: Can still add new zones
- [ ] All markers filtered: No errors

### 7.2 Boundary Conditions
- [ ] Markers at map edges render correctly
- [ ] Tooltips stay on screen at edges
- [ ] Dragging markers to map edges works
- [ ] Very small radius values handled correctly
- [ ] Very large radius values handled correctly

### 7.3 State Consistency
- [ ] Enabling/disabling editing maintains state correctly
- [ ] Switching between editing types maintains state
- [ ] Page refresh restores state correctly
- [ ] Multiple rapid clicks don't cause issues
- [ ] Rapid drag operations work smoothly

### 7.4 Concurrent Operations
- [ ] Can drag while another type is being edited
- [ ] Can select different types (with Alt)
- [ ] Tooltip updates correctly during interactions

---

## 8. Performance Tests

### 8.1 Rendering Performance
- [ ] Smooth rendering with many markers (100+)
- [ ] No lag when dragging markers
- [ ] No lag when resizing radius
- [ ] Smooth zoom operations
- [ ] Smooth pan operations

### 8.2 Interaction Responsiveness
- [ ] Immediate response to clicks
- [ ] Smooth drag operations
- [ ] No delay in selection updates
- [ ] Tooltip appears/disappears quickly

---

## 9. Integration Tests

### 9.1 Backend Integration
- [ ] Save operations complete successfully
- [ ] Error messages display if save fails
- [ ] File modifications are correct
- [ ] XML formatting is preserved

### 9.2 UI Integration
- [ ] Edit checkboxes enable/disable correctly
- [ ] Save/Discard buttons work correctly
- [ ] Status messages display correctly
- [ ] Selected count updates correctly

---

## 10. Regression Tests

### 10.1 Previously Working Features
- [ ] All existing functionality still works
- [ ] No new errors in console
- [ ] No visual regressions
- [ ] Performance hasn't degraded

### 10.2 Known Issues (from previous fixes)
- [ ] Markers can be deleted (Delete key works)
- [ ] Territory markers can be moved
- [ ] Changes are saved to source files
- [ ] Markers aren't restored after saving
- [ ] Only changed files are modified
- [ ] Editing restricted to visible markers
- [ ] Territories can be added
- [ ] Zombie territories work correctly
- [ ] Highlight/selection logic works correctly
- [ ] Deleted markers don't remain visible
- [ ] Discard changes updates display correctly

---

## Testing Notes

### How to Test
1. Open the map viewer in a browser
2. Load a mission folder with various marker types
3. Go through each test item systematically
4. Note any failures or unexpected behavior
5. Test with different mission folders if possible

### What to Look For
- **Visual**: Markers render correctly, colors are right, positions are accurate
- **Functional**: Interactions work, state is maintained, changes persist
- **Performance**: Smooth operations, no lag, responsive UI
- **Errors**: Check browser console for JavaScript errors

### Priority Issues
If you find issues, prioritize:
1. **Critical**: Functionality broken, crashes, data loss
2. **High**: Visual issues, incorrect behavior, performance problems
3. **Medium**: Minor UI issues, edge cases
4. **Low**: Cosmetic issues, minor improvements

---

## Test Results Template

```
Test Date: ___________
Tester: ___________
Browser: ___________
Mission Folder: ___________

### Summary
- Total Tests: ___
- Passed: ___
- Failed: ___
- Skipped: ___

### Critical Issues Found
1. 
2. 
3. 

### High Priority Issues
1. 
2. 
3. 

### Notes
[Any additional observations or comments]
```


