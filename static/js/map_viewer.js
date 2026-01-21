// Map Viewer JavaScript

let canvas;
let ctx;
let markers = [];
let selectedMarkers = new Set();
// Legacy variable removed - now using markerTypes[type].selected
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
let territoryZones = []; // Flattened array of all zones for editing (legacy - kept for compatibility)
let zoneToTerritoryMap = new Map(); // Map<flattenedZoneIndex, {territoryIndex, zoneIndex}>
let selectedTerritoryType = ''; // Selected territory type for new zones

// Store previous visibility state when filtering to single marker type
let previousVisibilityState = {
    showMarkers: true,
    showEventSpawns: true,
    showTerritories: true,
    showEffectAreas: true,
    showPlayerSpawnPoints: true,
    activeTerritoryFilters: []
};
let isFilteredToSingleType = false;
let filteredMarkerType = null; // Track which marker type is currently filtered
let filterCheckboxEnabled = false; // Track if the filter checkbox is checked (persists across type switches)
let zombieTerritoryZones = []; // Flattened array of zombie territory zones for editing (legacy - kept for compatibility)
let zombieZoneToTerritoryMap = new Map(); // Map<flattenedZoneIndex, {territoryIndex, zoneIndex}>

// Territory type-specific editing system
let territoryTypeZones = {}; // Map<territoryType, zoneArray>
let territoryTypeZoneMaps = {}; // Map<territoryType, Map<flattenedZoneIndex, {territoryIndex, zoneIndex}>>
let territoryTypeMarkerTypes = {}; // Map<territoryType, markerTypeConfig> - dynamically created marker types
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
let overlayCanvas = null;
let overlayCtx = null;
let animationFrameId = null;
let isPanning = false;
let isZooming = false;
let needsRedraw = false;

// Radius editing state (for effect areas and similar)
let isEditingRadius = false;
let radiusEditMarkerType = null;
let radiusEditIndex = -1;
let radiusEditStartRadius = 0;
let radiusEditSelectedMarkers = new Set(); // Store all selected markers for multi-marker radius editing

// Generic marker editing system
const markerTypes = {
    playerSpawnPoints: {
        getArray: () => playerSpawnPoints,
        setArray: (arr) => { playerSpawnPoints = arr; },
        getShowFlag: () => showPlayerSpawnPoints,
        canEditRadius: false,
        canEditDimensions: true,
        saveEndpoint: '/api/player-spawn-points/save',
        getDisplayName: () => 'Player Spawn Points',
        getEditControlsId: () => 'spawnPointEditControls',
        getEditCheckboxId: () => 'editPlayerSpawnPoints',
        // Helper to get marker at index
        getMarker: (index) => playerSpawnPoints[index],
        // Helper to check if marker is deleted
        isDeleted: (index) => markerTypes.playerSpawnPoints.deleted.has(index),
        // Helper to get screen position
        getScreenPos: (marker) => worldToScreen(marker.x, marker.z),
        // Helper to check if point is on marker
        isPointOnMarker: (marker, screenX, screenY, screenPos) => {
            const dx = screenPos.x - screenX;
            const dy = screenPos.y - screenY;
            return Math.sqrt(dx * dx + dy * dy) < MARKER_INTERACTION_THRESHOLD;
        },
        // Helper to create new marker
        createNew: (x, y, z) => {
            const width = playerSpawnPoints.length > 0 ? playerSpawnPoints[0].width : 100.0;
            const height = playerSpawnPoints.length > 0 ? playerSpawnPoints[0].height : 100.0;
            return {
                id: playerSpawnPoints.length,
                x: x,
                y: y,
                z: z,
                width: width,
                height: height,
                xml: `<pos x="${x}" z="${z}"/>`
            };
        },
        // Helper to get original position data
        getOriginalData: (marker) => ({ x: marker.x, y: marker.y, z: marker.z }),
        // Helper to restore original data
        restoreOriginal: (marker, original) => {
            marker.x = original.x;
            marker.y = original.y;
            marker.z = original.z;
        },
        // Helper to prepare save data
        prepareSaveData: (marker, index) => ({
            index: index,
            x: marker.x != null ? marker.x : 0,
            y: marker.y != null ? marker.y : 0,
            z: marker.z != null ? marker.z : 0,
            width: marker.width != null ? marker.width : 100,
            height: marker.height != null ? marker.height : 100,
            xml: marker.xml || `<pos x="${marker.x != null ? marker.x : 0}" z="${marker.z != null ? marker.z : 0}"/>`,
            isNew: markerTypes.playerSpawnPoints.new.has(index),
            isDeleted: markerTypes.playerSpawnPoints.deleted.has(index)
        }),
        // Tooltip generation
        getTooltipLines: (marker) => {
            const lines = [];
            lines.push('Player Spawn Point');
            lines.push('');
            if (marker.x !== undefined && marker.y !== undefined && marker.z !== undefined) {
                lines.push(`X: ${marker.x.toFixed(2)} m`);
                lines.push(`Y: ${marker.y.toFixed(2)} m`);
                lines.push(`Z: ${marker.z.toFixed(2)} m`);
            }
            if (marker.width !== undefined && marker.height !== undefined) {
                lines.push('');
                lines.push(`Rectangle Width: ${marker.width.toFixed(2)} m`);
                lines.push(`Rectangle Height: ${marker.height.toFixed(2)} m`);
            }
            return lines;
        },
        // State
        selected: new Set(),
        deleted: new Set(),
        new: new Set(),
        originalPositions: new Map(),
        // UI configuration
        uiConfig: {
            showDiscardButton: true,
            customControls: []
        }
    },
    effectAreas: {
        getArray: () => effectAreas,
        setArray: (arr) => { effectAreas = arr; },
        getShowFlag: () => showEffectAreas,
        canEditRadius: true,
        canEditDimensions: false,
        saveEndpoint: '/api/effect-areas/save',
        getDisplayName: () => 'Effect Areas',
        getEditControlsId: () => 'effectAreaEditControls',
        getEditCheckboxId: () => 'editEffectAreas',
        getMarker: (index) => effectAreas[index],
        isDeleted: (index) => markerTypes.effectAreas.deleted.has(index),
        getScreenPos: (marker) => worldToScreen(marker.x, marker.z),
        isPointOnMarker: (marker, screenX, screenY, screenPos) => {
            const screenRadius = marker.radius * viewScale;
            const dx = screenPos.x - screenX;
            const dy = screenPos.y - screenY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= screenRadius + MARKER_INTERACTION_THRESHOLD;
        },
        createNew: (x, y, z) => {
            const defaultRadius = effectAreas.length > 0 ? effectAreas[0].radius : 50.0;
            return {
                id: effectAreas.length,
                name: `Area_${effectAreas.length}`,
                x: x,
                y: y,
                z: z,
                radius: defaultRadius
            };
        },
        getOriginalData: (marker) => ({ x: marker.x, y: marker.y, z: marker.z, radius: marker.radius }),
        restoreOriginal: (marker, original) => {
            marker.x = original.x;
            marker.y = original.y;
            marker.z = original.z;
            marker.radius = original.radius;
        },
        prepareSaveData: (marker, index) => ({
            index: index,
            name: marker.name || `Area_${index}`,
            x: marker.x != null ? marker.x : 0,
            y: marker.y != null ? marker.y : 0,
            z: marker.z != null ? marker.z : 0,
            radius: marker.radius != null ? marker.radius : 50,
            isNew: markerTypes.effectAreas.new.has(index),
            isDeleted: markerTypes.effectAreas.deleted.has(index)
        }),
        // Tooltip generation
        getTooltipLines: (marker) => {
            const lines = [];
            lines.push(marker.name || '(Unnamed)');
            lines.push('');
            if (marker.x !== undefined && marker.y !== undefined && marker.z !== undefined) {
                lines.push(`X: ${marker.x.toFixed(2)} m`);
                lines.push(`Y: ${marker.y.toFixed(2)} m`);
                lines.push(`Z: ${marker.z.toFixed(2)} m`);
            }
            if (marker.radius !== undefined) {
                lines.push('');
                lines.push(`Radius: ${marker.radius.toFixed(2)} m`);
            }
            // Add usage information
            const usageNames = [];
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
            if (marker.proto_children && typeof marker.proto_children === 'object' && marker.proto_children.usage) {
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
            const uniqueUsageNames = [...new Set(usageNames)];
            if (uniqueUsageNames.length > 0) {
                lines.push('');
                lines.push('Usage:');
                uniqueUsageNames.forEach(name => {
                    lines.push(`  • ${name}`);
                });
            }
            return lines;
        },
        selected: new Set(),
        deleted: new Set(),
        new: new Set(),
        originalPositions: new Map(),
        // UI configuration
        uiConfig: {
            showDiscardButton: true,
            customControls: []
        }
    },
    territoryZones: {
        getArray: () => territoryZones,
        setArray: (arr) => { 
            territoryZones = arr;
            // Update territories from flattened zones
            updateTerritoriesFromZones();
        },
        getShowFlag: () => showTerritories,
        canEditRadius: true,
        canEditDimensions: false,
        saveEndpoint: '/api/territories/save',
        getDisplayName: () => 'Territory Zones',
        getEditControlsId: () => 'territoryZoneEditControls',
        getEditCheckboxId: () => 'editTerritoryZones',
        getMarker: (index) => territoryZones[index],
        isDeleted: (index) => markerTypes.territoryZones.deleted.has(index),
        getScreenPos: (marker) => worldToScreen(marker.x, marker.z),
        isPointOnMarker: (marker, screenX, screenY, screenPos) => {
            const screenRadius = (marker.radius || 50.0) * viewScale;
            const dx = screenPos.x - screenX;
            const dy = screenPos.y - screenY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= screenRadius + MARKER_INTERACTION_THRESHOLD;
        },
        createNew: (x, y, z) => {
            // Get selected territory type from dropdown
            const territoryTypeSelect = document.getElementById('territoryTypeSelect');
            const selectedType = territoryTypeSelect ? territoryTypeSelect.value : '';
            
            if (!selectedType) {
                // No type selected - use first available or default
                const typeNames = getAllTerritoryTypeNames();
                if (typeNames.length > 0) {
                    // Use first type and update dropdown
                    if (territoryTypeSelect) {
                        territoryTypeSelect.value = typeNames[0];
                    }
                    return markerTypes.territoryZones.createNew(x, y, z); // Recursive call with type now set
                }
            }
            
            // Find territory of the selected type
            let defaultRadius = 50.0;
            let territoryType = selectedType || 'unknown';
            let territoryColor = '#FF0000';
            let territoryIndex = -1;
            
            // Find first territory of the selected type
            for (let i = 0; i < territories.length; i++) {
                if (territories[i].territory_type === selectedType) {
                    territoryIndex = i;
                    territoryColor = territories[i].color;
                    if (territories[i].zones.length > 0) {
                        defaultRadius = territories[i].zones[0].radius || 50.0;
                    }
                    break;
                }
            }
            
            // If no territory of this type exists, we'll create one when saving
            // For now, use index 0 as placeholder (will be handled in save)
            if (territoryIndex < 0) {
                territoryIndex = 0; // Placeholder - will be created on save
                // Try to get color from another territory of same type or use default
                const typeNames = getAllTerritoryTypeNames();
                const typeIndex = typeNames.indexOf(selectedType);
                const colors = [
                    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
                    '#FF8800', '#8800FF', '#00FF88', '#FF0088', '#88FF00', '#0088FF',
                    '#FF4444', '#44FF44', '#4444FF', '#FFFF44', '#FF44FF', '#44FFFF'
                ];
                territoryColor = colors[typeIndex % colors.length];
            }
            
            // Create new zone
            const newZone = {
                id: territoryZones.length,
                name: `Zone_${territoryZones.length}`,
                x: x,
                y: y,
                z: z,
                radius: defaultRadius,
                territoryIndex: territoryIndex,
                zoneIndex: -1, // Will be set when added to territory
                territoryType: territoryType,
                color: territoryColor,
                xml: `<zone x="${x}" z="${z}" r="${defaultRadius}"/>`
            };
            
            // Note: Mapping will be set in addMarkerAt after the zone is added to array
            // This ensures the correct flattened index is used
            
            return newZone;
        },
        getOriginalData: (marker) => ({ 
            x: marker.x, 
            y: marker.y, 
            z: marker.z, 
            radius: marker.radius || 50.0 
        }),
        restoreOriginal: (marker, original) => {
            marker.x = original.x;
            marker.y = original.y;
            marker.z = original.z;
            marker.radius = original.radius;
        },
        prepareSaveData: (marker, index) => {
            const mapEntry = zoneToTerritoryMap.get(index);
            return {
                index: index,
                territoryType: marker.territoryType, // Include territory type for backend
                territoryIndex: mapEntry ? mapEntry.territoryIndex : marker.territoryIndex,
                zoneIndex: mapEntry ? mapEntry.zoneIndex : marker.zoneIndex,
                name: marker.name || `Zone_${index}`,
                x: marker.x != null ? marker.x : 0,
                y: marker.y != null ? marker.y : 0,
                z: marker.z != null ? marker.z : 0,
                radius: marker.radius != null ? marker.radius : 50.0,
                isNew: markerTypes.territoryZones.new.has(index),
                isDeleted: markerTypes.territoryZones.deleted.has(index)
            };
        },
        // Tooltip generation
        getTooltipLines: (marker) => {
            const lines = [];
            lines.push(marker.name || '(Unnamed)');
            lines.push('');
            if (marker.x !== undefined && marker.y !== undefined && marker.z !== undefined) {
                lines.push(`X: ${marker.x.toFixed(2)} m`);
                lines.push(`Y: ${marker.y.toFixed(2)} m`);
                lines.push(`Z: ${marker.z.toFixed(2)} m`);
            }
            if (marker.radius !== undefined) {
                lines.push('');
                lines.push(`Radius: ${marker.radius.toFixed(2)} m`);
            }
            // Find which territory this zone belongs to
            for (const territory of territories) {
                if (territory.zones.some(z => z === marker)) {
                    lines.push('');
                    lines.push(`Territory: ${territory.name}`);
                    lines.push(`Territory Type: ${territory.territory_type}`);
                    break;
                }
            }
            return lines;
        },
        selected: new Set(),
        deleted: new Set(),
        new: new Set(),
        originalPositions: new Map(),
        // UI configuration
        uiConfig: {
            showDiscardButton: true,
            customControls: [
                {
                    type: 'select',
                    id: 'territoryTypeSelect',
                    label: 'Territory Type for New Zones:',
                    getOptions: () => {
                        const typeNames = getAllTerritoryTypeNames();
                        return typeNames.map(name => ({ value: name, label: name }));
                    },
                    onChange: (e) => {
                        selectedTerritoryType = e.target.value;
                    }
                }
            ]
        }
    },
    zombieTerritoryZones: {
        getArray: () => zombieTerritoryZones,
        setArray: (arr) => { 
            zombieTerritoryZones = arr;
            // Update territories from flattened zones
            updateZombieTerritoriesFromZones();
        },
        getShowFlag: () => showTerritories,
        canEditRadius: true,
        canEditDimensions: false,
        saveEndpoint: '/api/territories/save',
        getDisplayName: () => 'Zombie Territory Zones',
        getEditControlsId: () => 'zombieTerritoryZoneEditControls',
        getEditCheckboxId: () => 'editZombieTerritoryZones',
        getMarker: (index) => zombieTerritoryZones[index],
        isDeleted: (index) => markerTypes.zombieTerritoryZones.deleted.has(index),
        getScreenPos: (marker) => worldToScreen(marker.x, marker.z),
        isPointOnMarker: (marker, screenX, screenY, screenPos) => {
            const screenRadius = (marker.radius || 50.0) * viewScale;
            const dx = screenPos.x - screenX;
            const dy = screenPos.y - screenY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= screenRadius + MARKER_INTERACTION_THRESHOLD;
        },
        createNew: (x, y, z) => {
            // Find zombie territory (typically "infected" type)
            let defaultRadius = 50.0;
            let territoryType = 'infected'; // Default zombie territory type
            let territoryColor = '#FF0000';
            let territoryIndex = -1;
            
            // Find first zombie territory
            for (let i = 0; i < territories.length; i++) {
                const t = territories[i];
                if (t.territory_type === 'infected' || t.territory_type === 'zombie' || 
                    t.territory_type.toLowerCase().includes('zombie') ||
                    t.territory_type.toLowerCase().includes('infected')) {
                    territoryIndex = i;
                    territoryType = t.territory_type;
                    territoryColor = t.color;
                    if (t.zones.length > 0) {
                        defaultRadius = t.zones[0].radius || 50.0;
                    }
                    break;
                }
            }
            
            // If no zombie territory exists, create placeholder
            if (territoryIndex < 0) {
                territoryIndex = 0; // Placeholder - will be created on save
                territoryColor = '#FF0000';
            }
            
            // Create new zone with default parameters
            const newZone = {
                id: zombieTerritoryZones.length,
                name: `Zone_${zombieTerritoryZones.length}`,
                x: x,
                y: y,
                z: z,
                radius: defaultRadius,
                territoryIndex: territoryIndex,
                zoneIndex: -1, // Will be set when added to territory
                territoryType: territoryType,
                color: territoryColor,
                // Additional parameters for zombie zones (to be configured via list boxes)
                // These will be populated from the UI list boxes
                xml: `<zone x="${x}" z="${z}" r="${defaultRadius}"/>`
            };
            
            return newZone;
        },
        getOriginalData: (marker) => ({ 
            x: marker.x, 
            y: marker.y, 
            z: marker.z, 
            radius: marker.radius || 50.0 
        }),
        restoreOriginal: (marker, original) => {
            marker.x = original.x;
            marker.y = original.y;
            marker.z = original.z;
            marker.radius = original.radius;
        },
        prepareSaveData: (marker, index) => {
            const mapEntry = zombieZoneToTerritoryMap.get(index);
            return {
                index: index,
                territoryType: marker.territoryType,
                territoryIndex: mapEntry ? mapEntry.territoryIndex : marker.territoryIndex,
                zoneIndex: mapEntry ? mapEntry.zoneIndex : marker.zoneIndex,
                name: marker.name || `Zone_${index}`,
                x: marker.x != null ? marker.x : 0,
                y: marker.y != null ? marker.y : 0,
                z: marker.z != null ? marker.z : 0,
                radius: marker.radius != null ? marker.radius : 50.0,
                isNew: markerTypes.zombieTerritoryZones.new.has(index),
                isDeleted: markerTypes.zombieTerritoryZones.deleted.has(index)
            };
        },
        // Tooltip generation - simplified for zombie territories
        getTooltipLines: (marker) => {
            const lines = [];
            lines.push(marker.name || '(Unnamed)');
            lines.push('');
            if (marker.x !== undefined && marker.y !== undefined && marker.z !== undefined) {
                lines.push(`X: ${marker.x.toFixed(2)} m`);
                lines.push(`Y: ${marker.y.toFixed(2)} m`);
                lines.push(`Z: ${marker.z.toFixed(2)} m`);
            }
            if (marker.radius !== undefined) {
                lines.push('');
                lines.push(`Radius: ${marker.radius.toFixed(2)} m`);
            }
            return lines;
        },
        selected: new Set(),
        deleted: new Set(),
        new: new Set(),
        originalPositions: new Map(),
        // UI configuration
        uiConfig: {
            showDiscardButton: true,
            customControls: [
                {
                    type: 'listboxes',
                    containerId: 'zombieZoneParameterControls',
                    listBoxesId: 'zombieZoneParameterListBoxes',
                    label: 'Zone Parameters (for selected zones):'
                }
            ]
        }
    }
};

// Marker State Manager - centralizes state management for all marker types
class MarkerStateManager {
    constructor() {
        this.editingEnabled = new Map();
        this.selections = new Map(); // Map<markerType, Set<index>>
        this.deleted = new Map(); // Map<markerType, Set<index>>
        this.new = new Map(); // Map<markerType, Set<index>>
        this.originalPositions = new Map(); // Map<markerType, Map<index, originalData>>
        
        // Initialize state for all marker types
        Object.keys(markerTypes).forEach(type => {
            this.editingEnabled.set(type, false);
            this.selections.set(type, new Set());
            this.deleted.set(type, new Set());
            this.new.set(type, new Set());
            this.originalPositions.set(type, new Map());
        });
    }
    
    isEditingEnabled(markerType) {
        return this.editingEnabled.get(markerType) || false;
    }
    
    setEditingEnabled(markerType, enabled) {
        this.editingEnabled.set(markerType, enabled);
    }
    
    getSelected(markerType) {
        return this.selections.get(markerType) || new Set();
    }
    
    isSelected(markerType, index) {
        return this.getSelected(markerType).has(index);
    }
    
    addSelection(markerType, index) {
        const selected = this.selections.get(markerType);
        if (selected) {
            selected.add(index);
        }
    }
    
    removeSelection(markerType, index) {
        const selected = this.selections.get(markerType);
        if (selected) {
            selected.delete(index);
        }
    }
    
    clearSelection(markerType) {
        const selected = this.selections.get(markerType);
        if (selected) {
            selected.clear();
        }
    }
    
    isDeleted(markerType, index) {
        const deleted = this.deleted.get(markerType);
        return deleted ? deleted.has(index) : false;
    }
    
    markDeleted(markerType, index) {
        const deleted = this.deleted.get(markerType);
        if (deleted) {
            deleted.add(index);
        }
    }
    
    unmarkDeleted(markerType, index) {
        const deleted = this.deleted.get(markerType);
        if (deleted) {
            deleted.delete(index);
        }
    }
    
    isNew(markerType, index) {
        const newSet = this.new.get(markerType);
        return newSet ? newSet.has(index) : false;
    }
    
    markNew(markerType, index) {
        const newSet = this.new.get(markerType);
        if (newSet) {
            newSet.add(index);
        }
    }
    
    unmarkNew(markerType, index) {
        const newSet = this.new.get(markerType);
        if (newSet) {
            newSet.delete(index);
        }
    }
    
    getOriginalPosition(markerType, index) {
        const positions = this.originalPositions.get(markerType);
        return positions ? positions.get(index) : null;
    }
    
    setOriginalPosition(markerType, index, data) {
        const positions = this.originalPositions.get(markerType);
        if (positions) {
            positions.set(index, data);
        }
    }
    
    clearOriginalPosition(markerType, index) {
        const positions = this.originalPositions.get(markerType);
        if (positions) {
            positions.delete(index);
        }
    }
}

// Create global state manager instance
const markerStateManager = new MarkerStateManager();

// Marker Event System - decouples components and enables extensibility
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
    
    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }
    
    emit(event, data) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(cb => {
            try {
                cb(data);
            } catch (error) {
                console.error(`Error in event listener for '${event}':`, error);
            }
        });
    }
    
    once(event, callback) {
        const wrapper = (data) => {
            callback(data);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    }
}

// Create global event emitter instance
const markerEvents = new MarkerEventEmitter();

// Event types:
// - 'marker:created' - { markerType, index, marker }
// - 'marker:deleted' - { markerType, index }
// - 'marker:moved' - { markerType, index, oldPos, newPos }
// - 'marker:resized' - { markerType, index, oldRadius, newRadius }
// - 'marker:selected' - { markerType, index }
// - 'marker:deselected' - { markerType, index }
// - 'marker:selection:cleared' - { markerType }
// - 'marker:changes:saved' - { markerType }
// - 'marker:changes:discarded' - { markerType }

// Marker Interaction Handler - unified interaction system for all marker types
class MarkerInteractionHandler {
    constructor(markerType) {
        this.markerType = markerType;
        this.typeConfig = markerTypes[markerType];
    }
    
    handleClick(screenX, screenY, modifiers) {
        if (!editingEnabled[this.markerType] || !this.typeConfig.getShowFlag()) {
            return false;
        }
        
        // Check if clicking on a marker
        const clicked = getMarkerAtPoint(this.markerType, screenX, screenY);
        if (clicked) {
            const { index, marker } = clicked;
            
            if (modifiers.altKey) {
                // Alt+Click - toggle selection
                if (this.typeConfig.selected.has(index)) {
                    this.typeConfig.selected.delete(index);
                } else {
                    this.typeConfig.selected.add(index);
                }
            } else {
                // Normal click - select this one (clear others)
                this.typeConfig.selected.clear();
                this.typeConfig.selected.add(index);
                // Clear selection for other marker types
                for (const otherType of Object.keys(markerTypes)) {
                    if (otherType !== this.markerType && editingEnabled[otherType]) {
                        markerTypes[otherType].selected.clear();
                    }
                }
            }
            updateSelectedCount();
            return true;
        }
        return false;
    }
    
    handleDragStart(screenX, screenY) {
        if (!editingEnabled[this.markerType] || !this.typeConfig.getShowFlag()) {
            return false;
        }
        
        const clicked = getMarkerAtPoint(this.markerType, screenX, screenY);
        if (!clicked) return false;
        
        const { index, marker } = clicked;
        const selected = this.typeConfig.selected;
        
        // Check if we have selected markers
        if (selected.size > 0 && selected.has(index)) {
            // Save original positions for all selected markers
            selected.forEach(selectedIndex => {
                if (!this.typeConfig.originalPositions.has(selectedIndex)) {
                    const m = this.typeConfig.getMarker(selectedIndex);
                    this.typeConfig.originalPositions.set(selectedIndex, this.typeConfig.getOriginalData(m));
                }
            });
            
            // Store relative positions relative to the marker being dragged (not the click position)
            if (!draggedSelectedMarkers.has(this.markerType)) {
                draggedSelectedMarkers.set(this.markerType, new Map());
            }
            const offsets = draggedSelectedMarkers.get(this.markerType);
            offsets.clear();
            // Use the actual marker position as the reference point, not the click position
            const draggedMarkerX = marker.x;
            const draggedMarkerZ = marker.z;
            selected.forEach(selectedIndex => {
                const m = this.typeConfig.getMarker(selectedIndex);
                offsets.set(selectedIndex, {
                    offsetX: m.x - draggedMarkerX,
                    offsetZ: m.z - draggedMarkerZ
                });
            });
            
            isDragging = true;
            draggedMarkerType = this.markerType;
            draggedMarkerIndex = index;
            dragStartX = screenX;
            dragStartY = screenY;
            // Store the actual marker position, not the click position
            dragStartWorldX = draggedMarkerX;
            dragStartWorldZ = draggedMarkerZ;
            return true;
        } else {
            // No selection - check if clicking on any marker
            if (clicked) {
                // Save original position
                if (!this.typeConfig.originalPositions.has(index)) {
                    this.typeConfig.originalPositions.set(index, this.typeConfig.getOriginalData(marker));
                }
                
                isDragging = true;
                draggedMarkerType = this.markerType;
                draggedMarkerIndex = index;
                dragStartX = screenX;
                dragStartY = screenY;
                dragStartWorldX = marker.x;
                dragStartWorldZ = marker.z;
                return true;
            }
        }
        return false;
    }
    
    handleRadiusEdit(screenX, screenY) {
        if (!editingEnabled[this.markerType] || !this.typeConfig.getShowFlag() || !this.typeConfig.canEditRadius) {
            return false;
        }
        
        const array = this.typeConfig.getArray();
        for (let index = 0; index < array.length; index++) {
            if (this.typeConfig.isDeleted(index)) continue;
            if (!this.typeConfig.selected.has(index)) continue;
            if (!isMarkerVisible(this.markerType, index)) continue;
            
            const marker = this.typeConfig.getMarker(index);
            if (!marker || marker.radius === undefined) continue;
            
            const screenPos = this.typeConfig.getScreenPos(marker);
            const screenRadius = marker.radius * viewScale;
            
            // Check if clicking on the radius handle
            const handleX = screenPos.x + screenRadius;
            const handleY = screenPos.y;
            const handleRadius = 6;
            
            const dx = handleX - screenX;
            const dy = handleY - screenY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < handleRadius + MARKER_INTERACTION_THRESHOLD) {
                isEditingRadius = true;
                radiusEditMarkerType = this.markerType;
                radiusEditIndex = index;
                radiusEditStartRadius = marker.radius;
                dragStartX = screenX;
                dragStartY = screenY;
                
                // Store all selected markers for multi-marker radius editing
                radiusEditSelectedMarkers.clear();
                if (this.typeConfig.selected.size > 0) {
                    // Store original positions for all selected markers
                    for (const selectedIndex of this.typeConfig.selected) {
                        if (selectedIndex < array.length && !this.typeConfig.isDeleted(selectedIndex)) {
                            radiusEditSelectedMarkers.add(selectedIndex);
                            if (!this.typeConfig.originalPositions.has(selectedIndex)) {
                                const m = this.typeConfig.getMarker(selectedIndex);
                                this.typeConfig.originalPositions.set(selectedIndex, this.typeConfig.getOriginalData(m));
                            }
                        }
                    }
                } else {
                    // No selection - just edit this one marker
                    radiusEditSelectedMarkers.add(index);
                    if (!this.typeConfig.originalPositions.has(index)) {
                        this.typeConfig.originalPositions.set(index, this.typeConfig.getOriginalData(marker));
                    }
                }
                
                return true;
            }
        }
        return false;
    }
    
    handleDelete(indices) {
        if (!indices || indices.length === 0) return;
        
        const array = this.typeConfig.getArray();
        const indicesToDelete = Array.from(indices).sort((a, b) => b - a);
        
        for (const index of indicesToDelete) {
            if (index < array.length) {
                if (this.typeConfig.new.has(index)) {
                    // Remove new marker
                    this.typeConfig.new.delete(index);
                    array.splice(index, 1);
                    // Update indices in sets
                    this.updateIndicesAfterDeletion(index);
                } else {
                    // Mark as deleted
                    this.typeConfig.deleted.add(index);
                    if (!this.typeConfig.originalPositions.has(index)) {
                        const marker = this.typeConfig.getMarker(index);
                        this.typeConfig.originalPositions.set(index, this.typeConfig.getOriginalData(marker));
                    }
                }
            }
        }
        
        this.typeConfig.selected.clear();
    }
    
    updateIndicesAfterDeletion(deletedIndex) {
        // Update indices in originalPositions, selected, and new sets
        const newOriginalPositions = new Map();
        this.typeConfig.originalPositions.forEach((pos, idx) => {
            if (idx < deletedIndex) {
                newOriginalPositions.set(idx, pos);
            } else if (idx > deletedIndex) {
                newOriginalPositions.set(idx - 1, pos);
            }
        });
        this.typeConfig.originalPositions = newOriginalPositions;
        
        const newSelected = new Set();
        this.typeConfig.selected.forEach(idx => {
            if (idx < deletedIndex) {
                newSelected.add(idx);
            } else if (idx > deletedIndex) {
                newSelected.add(idx - 1);
            }
        });
        this.typeConfig.selected = newSelected;
        
        const newNew = new Set();
        this.typeConfig.new.forEach(idx => {
            if (idx < deletedIndex) {
                newNew.add(idx);
            } else if (idx > deletedIndex) {
                newNew.add(idx - 1);
            }
        });
        this.typeConfig.new = newNew;
    }
}

// Create interaction handler instances for each marker type (after class definition)
const interactionHandlers = {};
for (const markerType of Object.keys(markerTypes)) {
    interactionHandlers[markerType] = new MarkerInteractionHandler(markerType, markerTypes[markerType]);
}

// Selection Manager - unified selection system for all marker types
class SelectionManager {
    constructor() {
        this.activeEditingType = null;
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
        if (markerType === 'regular') {
            // Check if markers are shown at all
            if (!showMarkers) {
                return false;
            }
            // Check visibility filter (if filters are active, marker must be in visibleMarkers set)
            if (visibleMarkers.size > 0 && !visibleMarkers.has(index)) {
                return false;
            }
        } else {
            if (!isMarkerVisible(markerType, index)) {
                return false;
            }
        }
        
        // If editing mode is active, only allow selection of active type
        const activeType = this.getActiveEditingType();
        if (activeType !== null && markerType !== activeType && markerType !== 'regular') {
            return false;
        }
        
        // If editing mode is active, don't allow selection of regular markers
        if (activeType !== null && markerType === 'regular') {
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
        
        if (markerType === 'regular') {
            if (altKey) {
                // Toggle selection
                if (selectedMarkers.has(index)) {
                    selectedMarkers.delete(index);
                } else {
                    selectedMarkers.add(index);
                }
            } else {
                // Replace selection
                if (clearOthers) {
                    this.clearAllSelections();
                }
                selectedMarkers.add(index);
            }
            return true;
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
                    // Clear other types when selecting (unless Alt is held)
                    if (!altKey) {
                        for (const otherType of Object.keys(markerTypes)) {
                            if (otherType !== activeType && editingEnabled[otherType]) {
                                this.clearSelectionsForType(otherType);
                            }
                        }
                    }
                    return true;
                }
            }
        } else {
            // Not in editing mode - check regular markers
            for (let index = 0; index < markers.length; index++) {
                if (!this.canSelectMarker('regular', index)) continue;
                
                const marker = markers[index];
                const screenPos = worldToScreen(marker.x, marker.z);
                const dx = screenPos.x - screenX;
                const dy = screenPos.y - screenY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < MARKER_INTERACTION_THRESHOLD) {
                    this.selectMarker('regular', index, { altKey, clearOthers: !altKey });
                    return true;
                }
            }
        }
        
        return false;
    }
}

// Create global selection manager instance
const selectionManager = new SelectionManager();

// Edit Controls Manager - unified UI system for edit mode controls
class EditControlsManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.activeControls = new Map(); // Map<markerType, HTMLElement>
        if (!this.container) {
            console.error(`EditControlsManager: Container ${containerId} not found`);
        }
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
        wrapper.style.marginTop = '10px';
        
        // Add custom controls first (if any) - they go before instructions
        if (config.customControls && config.customControls.length > 0) {
            const customContainer = document.createElement('div');
            customContainer.className = 'custom-controls';
            config.customControls.forEach(control => {
                const controlElement = this.createCustomControl(control);
                if (controlElement) {
                    customContainer.appendChild(controlElement);
                }
            });
            wrapper.appendChild(customContainer);
        }
        
        // Add "Show only this type" checkbox
        const filterCheckbox = this.createFilterCheckbox(markerType);
        wrapper.appendChild(filterCheckbox);
        
        // Add instructions
        const instructions = this.createInstructions(config.instructions);
        wrapper.appendChild(instructions);
        
        // Add action buttons
        const buttonContainer = this.createButtonContainer(markerType, config);
        wrapper.appendChild(buttonContainer);
        
        return wrapper;
    }
    
    createFilterCheckbox(markerType) {
        const container = document.createElement('div');
        container.style.marginBottom = '10px';
        
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.cursor = 'pointer';
        label.style.fontSize = '12px';
        label.style.color = 'var(--nord4)';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `filterToType_${markerType}`;
        checkbox.style.marginRight = '6px';
        checkbox.style.cursor = 'pointer';
        
        checkbox.addEventListener('change', (e) => {
            filterCheckboxEnabled = e.target.checked; // Update global preference
            handleFilterToSingleType(markerType, e.target.checked);
        });
        
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode('Show only this marker type'));
        
        container.appendChild(label);
        return container;
    }
    
    createInstructions(instructions) {
        const p = document.createElement('p');
        p.className = 'edit-instructions';
        p.style.fontSize = '11px';
        p.style.color = 'var(--nord4)';
        p.style.marginTop = '5px';
        p.style.marginBottom = '5px';
        
        instructions.forEach((instruction, index) => {
            if (index > 0) {
                p.appendChild(document.createElement('br'));
            }
            const strong = document.createElement('strong');
            strong.textContent = `${instruction.label}: `;
            p.appendChild(strong);
            p.appendChild(document.createTextNode(instruction.text));
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
                return null;
        }
    }
    
    createSelectControl(config) {
        const container = document.createElement('div');
        
        const label = document.createElement('label');
        label.setAttribute('for', config.id);
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
        if (config.getOptions) {
            try {
                const options = config.getOptions();
                if (options && options.length > 0) {
                    options.forEach(option => {
                        const opt = document.createElement('option');
                        opt.value = option.value;
                        opt.textContent = option.label;
                        select.appendChild(opt);
                    });
                } else {
                    // No options available yet - add placeholder
                    const opt = document.createElement('option');
                    opt.value = '';
                    opt.textContent = 'Loading...';
                    select.appendChild(opt);
                }
            } catch (error) {
                console.error('Error getting options for select:', error);
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'Loading...';
                select.appendChild(opt);
            }
        } else if (config.options) {
            config.options.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.label;
                select.appendChild(opt);
            });
        } else {
            // Placeholder option
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Loading...';
            select.appendChild(opt);
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
                updateStatus(`Error saving: ${result.message}`, true);
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
        // Convert camelCase to PascalCase for button IDs
        // e.g., "playerSpawnPoints" -> "PlayerSpawnPoints"
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    showControls(markerType) {
        const controls = this.activeControls.get(markerType);
        if (controls) {
            controls.style.display = 'block';
        }
    }
    
    // Show controls for a specific marker type and hide all others
    showControlsForType(markerType) {
        // Hide all controls first
        this.activeControls.forEach((controls, type) => {
            controls.style.display = 'none';
        });
        
        // Show controls for the specified type
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
    
    getControlsElement(markerType) {
        return this.activeControls.get(markerType);
    }
    
    // Initialize all controls on page load
    initialize() {
        if (!this.container) {
            console.error('EditControlsManager: Cannot initialize - container not found');
            return;
        }
        
        Object.keys(markerTypes).forEach(markerType => {
            const typeConfig = markerTypes[markerType];
            const config = this.getUIConfig(markerType);
            const controls = this.createControls(markerType, config);
            if (controls) {
                // Insert controls after the checkbox and description paragraph
                // We'll need to find the right place in the DOM
                this.container.appendChild(controls);
                this.activeControls.set(markerType, controls);
            }
        });
    }
    
    // Get UI configuration for a marker type
    getUIConfig(markerType) {
        const typeConfig = markerTypes[markerType];
        if (!typeConfig) {
            return { instructions: [], showDiscardButton: false, customControls: [] };
        }
        
        // Use uiConfig if defined, otherwise generate from typeConfig
        if (typeConfig.uiConfig) {
            const config = { ...typeConfig.uiConfig };
            // Ensure instructions are set
            if (!config.instructions) {
                config.instructions = this.getDefaultInstructions(markerType);
            }
            return config;
        }
        
        // Fallback: generate default config
        return {
            instructions: this.getDefaultInstructions(markerType),
            showDiscardButton: false,
            customControls: []
        };
    }
    
    getDefaultInstructions(markerType) {
        const typeConfig = markerTypes[markerType];
        if (!typeConfig) return [];
        
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

// Marker Renderer - unified rendering system for all marker types
class MarkerRenderer {
    constructor(typeConfig, ctx) {
        this.typeConfig = typeConfig;
        this.ctx = ctx;
    }
    
    getRenderStyle(marker, index, renderState, customColor = null) {
        const { isSelected, isHovered, isEditing, isDragging, isEditingRadius, isNew, hasUnsavedChanges } = renderState;
        
        // Default styles
        let fillColor = customColor || '#0066ff';
        let strokeColor = customColor ? this.darkenColor(customColor, 0.2) : '#0044cc';
        let lineWidth = 2;
        let alpha = 1.0;
        
        if (isEditing) {
            if (isSelected) {
                fillColor = isDragging ? '#ffff00' : '#ff8800';
                strokeColor = isDragging ? '#ffffff' : '#ff6600';
                lineWidth = 3;
            } else if (isNew) {
                fillColor = isDragging ? '#ffff00' : '#00ff00';
                strokeColor = isDragging ? '#ffffff' : '#00aa00';
                lineWidth = 3;
            } else if (hasUnsavedChanges) {
                fillColor = isDragging ? '#ffff00' : '#ffaa00';
                strokeColor = isDragging ? '#ffffff' : '#ff8800';
                lineWidth = 3;
            } else if (customColor) {
                // Use custom color but with editing indication
                fillColor = customColor;
                strokeColor = isDragging ? '#ffffff' : this.darkenColor(customColor, 0.2);
            }
        } else if (isHovered) {
            if (customColor) {
                fillColor = this.lightenColor(customColor, 0.3);
                strokeColor = '#ffffff';
            } else {
                fillColor = '#00ff00';
                strokeColor = '#00cc00';
            }
            lineWidth = 3;
        }
        
        if (isEditingRadius) {
            lineWidth = 3;
        }
        
        return { fillColor, strokeColor, lineWidth, alpha };
    }
    
    darkenColor(color, amount) {
        // Simple color darkening - convert hex to RGB, darken, convert back
        const hex = color.replace('#', '');
        const r = Math.max(0, parseInt(hex.substr(0, 2), 16) * (1 - amount));
        const g = Math.max(0, parseInt(hex.substr(2, 2), 16) * (1 - amount));
        const b = Math.max(0, parseInt(hex.substr(4, 2), 16) * (1 - amount));
        return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
    }
    
    lightenColor(color, amount) {
        // Simple color lightening
        const hex = color.replace('#', '');
        const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + (255 * amount));
        const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + (255 * amount));
        const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + (255 * amount));
        return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
    }
    
    drawCircle(marker, screenPos, style, screenRadius = null) {
        const radius = screenRadius !== null ? screenRadius : 4;
        
        this.ctx.save();
        this.ctx.globalAlpha = style.alpha !== undefined ? style.alpha : 1.0;
        this.ctx.fillStyle = style.fillColor;
        this.ctx.strokeStyle = style.strokeColor;
        this.ctx.lineWidth = style.lineWidth;
        
        this.ctx.beginPath();
        this.ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    drawCircleWithRadius(marker, screenPos, style, screenRadius, baseAlpha = 0.3) {
        // Adjust alpha based on zoom level
        const zoomedOutAlpha = Math.min(0.6, baseAlpha + (1.0 - viewScale) * 0.3);
        let alpha = viewScale < 1.0 ? zoomedOutAlpha : baseAlpha;
        
        // Adjust alpha for editing state
        if (style.isEditing && (style.hasUnsavedChanges || style.isSelected || style.isNew)) {
            alpha = Math.min(0.7, alpha + 0.2);
        }
        
        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        this.ctx.fillStyle = style.fillColor;
        this.ctx.strokeStyle = style.strokeColor;
        this.ctx.lineWidth = style.lineWidth;
        
        this.ctx.beginPath();
        this.ctx.arc(screenPos.x, screenPos.y, screenRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    drawRadiusHandle(screenPos, screenRadius) {
        this.ctx.save();
        this.ctx.globalAlpha = 1.0;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 2;
        
        const handleX = screenPos.x + screenRadius;
        const handleY = screenPos.y;
        const handleRadius = 6;
        
        this.ctx.beginPath();
        this.ctx.arc(handleX, handleY, handleRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    drawRectangle(marker, screenPos, style, screenWidth, screenHeight, baseAlpha = 0.15) {
        this.ctx.save();
        this.ctx.globalAlpha = baseAlpha;
        this.ctx.fillStyle = style.fillColor;
        this.ctx.strokeStyle = style.strokeColor;
        this.ctx.lineWidth = style.lineWidth;
        
        const rectX = screenPos.x - screenWidth / 2;
        const rectY = screenPos.y - screenHeight / 2;
        
        this.ctx.fillRect(rectX, rectY, screenWidth, screenHeight);
        this.ctx.strokeRect(rectX, rectY, screenWidth, screenHeight);
        this.ctx.restore();
    }
    
    render(marker, index, renderState, customColor = null) {
        const screenPos = this.typeConfig.getScreenPos(marker);
        
        if (!isFinite(screenPos.x) || !isFinite(screenPos.y)) {
            return;
        }
        
        const style = this.getRenderStyle(marker, index, renderState, customColor);
        
        // Determine marker shape and render accordingly
        if (this.typeConfig.canEditRadius && marker.radius !== undefined) {
            // Circle with radius
            const screenRadius = marker.radius * viewScale;
            if (screenRadius < 1) return;
            
            // Use custom alpha for territory zones if provided
            const baseAlpha = customColor ? 0.2 : 0.3;
            this.drawCircleWithRadius(marker, screenPos, { ...style, ...renderState }, screenRadius, baseAlpha);
            
            // Draw center point marker (for territory zones and effect areas)
            this.drawCircle(marker, screenPos, style, renderState.isHovered || renderState.isDragging || renderState.isSelected ? 6 : 4);
            
            // Draw radius handle when editing and selected
            if (renderState.isEditing && renderState.isSelected) {
                this.drawRadiusHandle(screenPos, screenRadius);
            }
        } else if (this.typeConfig.canEditDimensions && marker.width !== undefined && marker.height !== undefined) {
            // Rectangle (player spawn points)
            const screenWidth = marker.width * viewScale;
            const screenHeight = marker.height * viewScale;
            
            // Customize style for player spawn points (cyan color when not editing)
            if (!renderState.isEditing || !(renderState.hasUnsavedChanges || renderState.isSelected || renderState.isNew)) {
                style.fillColor = '#00ffff';
                style.strokeColor = renderState.isHovered ? '#00ffff' : '#00aaaa';
            }
            
            // Draw rectangle with custom alpha
            this.ctx.save();
            this.ctx.globalAlpha = 0.15;
            this.ctx.fillStyle = style.fillColor;
            this.ctx.strokeStyle = style.strokeColor;
            this.ctx.lineWidth = renderState.isHovered ? 2 : 1;
            
            const rectX = screenPos.x - screenWidth / 2;
            const rectY = screenPos.y - screenHeight / 2;
            
            this.ctx.fillRect(rectX, rectY, screenWidth, screenHeight);
            this.ctx.strokeRect(rectX, rectY, screenWidth, screenHeight);
            this.ctx.restore();
            
            // Draw center marker point
            this.drawCircle(marker, screenPos, style, renderState.isHovered || renderState.isDragging || renderState.isSelected ? 6 : 4);
        } else {
            // Simple point marker
            this.drawCircle(marker, screenPos, style, renderState.isHovered || renderState.isDragging || renderState.isSelected ? 6 : 4);
        }
    }
}

// Global editing state (kept for backward compatibility, now delegates to state manager)
let editingEnabled = {};
Object.keys(markerTypes).forEach(type => {
    editingEnabled[type] = false;
    // Sync with state manager
    markerStateManager.setEditingEnabled(type, false);
});

// Drag state
let isDragging = false;
let draggedMarkerType = null;
let draggedMarkerIndex = -1;
let dragStartX = 0;
let dragStartY = 0;
let dragStartWorldX = 0;
let dragStartWorldZ = 0;
let draggedSelectedMarkers = new Map(); // Map<markerType, Map<index, {offsetX, offsetZ}>>

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
    
    // Make canvas focusable so it can receive keyboard events
    canvas.setAttribute('tabindex', '0');
    canvas.style.outline = 'none'; // Remove focus outline
    
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
    
    // Get or create overlay canvas for marquee/tooltip
    overlayCanvas = document.getElementById('overlayCanvas');
    if (overlayCanvas) {
        // Set pointer-events to none so mouse events pass through to marker canvas
        overlayCanvas.style.pointerEvents = 'none';
        overlayCtx = overlayCanvas.getContext('2d');
    } else {
        // Create overlay canvas dynamically if not in HTML
        overlayCanvas = document.createElement('canvas');
        overlayCanvas.id = 'overlayCanvas';
        overlayCanvas.style.position = 'absolute';
        overlayCanvas.style.top = '0';
        overlayCanvas.style.left = '0';
        overlayCanvas.style.zIndex = '3';
        overlayCanvas.style.pointerEvents = 'none';
        overlayCanvas.style.width = '100%';
        overlayCanvas.style.height = '100%';
        canvas.parentElement.appendChild(overlayCanvas);
        overlayCtx = overlayCanvas.getContext('2d');
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
            // In edit mode, check for Ctrl+Click to add markers
            if ((e.ctrlKey || e.metaKey)) {
                // Check each editable type for Ctrl+Click add
                for (const markerType of Object.keys(markerTypes)) {
                    if (editingEnabled[markerType]) {
                        addMarkerAt(markerType, x, y);
                        e.preventDefault();
                        return;
                    }
                }
            }
            
            // In edit mode, check for radius editing interactions (for radius-editable types)
            if (tryStartRadiusEditAny(x, y)) {
                e.preventDefault();
                return;
            }
            
            // In edit mode, check for drag interactions
            // Check radius-editable types first (they have special center-click logic)
            for (const markerType of Object.keys(markerTypes)) {
                const typeConfig = markerTypes[markerType];
                if (editingEnabled[markerType] && typeConfig.canEditRadius) {
                    if (tryStartDragRadiusEditable(markerType, x, y)) {
                        e.preventDefault();
                        return;
                    }
                    // Check if clicking on marker to select it
                    const clickedMarker = getMarkerAtPoint(markerType, x, y);
                    if (clickedMarker !== null) {
                        const typeConfig = markerTypes[markerType];
                        if (e.altKey) {
                            // Alt+Click - toggle selection
                            if (typeConfig.selected.has(clickedMarker.index)) {
                                typeConfig.selected.delete(clickedMarker.index);
                            } else {
                                typeConfig.selected.add(clickedMarker.index);
                            }
                        } else {
                            // Normal click - select this one (clear others of same type and other types)
                            typeConfig.selected.clear();
                            typeConfig.selected.add(clickedMarker.index);
                            // Clear selection for other marker types
                            for (const otherType of Object.keys(markerTypes)) {
                                if (otherType !== markerType && editingEnabled[otherType]) {
                                    markerTypes[otherType].selected.clear();
                                }
                            }
                        }
                        updateSelectedCount();
                        requestDraw();
                        e.preventDefault();
                        return;
                    }
                }
            }
            
            // Check for drag on non-radius-editable types
            if (tryStartDrag(x, y)) {
                e.preventDefault();
                return;
            }
            
            // Selection is now handled by SelectionManager in handleMouseDown
            // This code path is no longer needed as handleMouseDown handles all selection logic
            // If we reach here, it means we didn't handle the click above, so delegate to handleMouseDown
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
        
        // Handle dragging or radius editing
        if (isDragging || isEditingRadius) {
            handleDrag(x, y);
        }
        
        if (isDragging || isEditingRadius) {
            // Update marker position or radius during drag
            handleDrag(x, y);
            e.preventDefault();
        } else if (isPanning) {
            viewOffsetX = panStartOffsetX + (x - panStartX);
            viewOffsetY = panStartOffsetY + (y - panStartY);
            hoveredMarkerIndex = -1; // Clear hover when panning
            requestDraw();
        } else if (isMarqueeSelecting) {
            // Update marquee rectangle - use overlay canvas for fast updates
            marqueeCurrentX = x;
            marqueeCurrentY = y;
            drawMarquee(); // Direct call to overlay canvas, no full redraw
        } else {
            // Check for hover
            updateHoveredMarker(x, y);
        }
    });
    
    canvas.addEventListener('mouseup', (e) => {
        if ((isDragging || isEditingRadius) && e.button === 0) {
            // End drag or radius edit on left mouse button release
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
        if ((isDragging || isEditingRadius) && e.button === 0) {
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
    
    // Keyboard handler for Delete key - attach to both canvas and document
    // Canvas handler (when canvas has focus)
    canvas.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            handleDeleteKey(e);
        }
    });
    
    // Document handler (fallback when canvas doesn't have focus)
    document.addEventListener('keydown', (e) => {
        // Only handle if target is not an input/textarea/select
        if ((e.key === 'Delete' || e.key === 'Backspace') && 
            e.target.tagName !== 'INPUT' && 
            e.target.tagName !== 'TEXTAREA' && 
            e.target.tagName !== 'SELECT') {
            handleDeleteKey(e);
        }
    });
    
    // Focus canvas on click to ensure keyboard events work
    canvas.addEventListener('mousedown', () => {
        canvas.focus();
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
    
    // Resize overlay canvas if it exists
    if (overlayCanvas) {
        overlayCanvas.width = canvasWidth;
        overlayCanvas.height = canvasHeight;
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
// Generic function to draw a marker type using the renderer
function drawMarkerType(markerType) {
    const typeConfig = markerTypes[markerType];
    if (!typeConfig || !typeConfig.getShowFlag()) {
        return;
    }
    
    const array = typeConfig.getArray();
    if (array.length === 0) {
        return;
    }
    
    const isEditing = editingEnabled[markerType];
    const isDraggingThisType = isDragging && draggedMarkerType === markerType;
    const renderer = new MarkerRenderer(typeConfig, ctx);
    
    // Calculate offset for hover detection
    const eventSpawnOffset = markers.length;
    const zoneOffset = eventSpawnOffset + eventSpawns.length;
    
    // Calculate territory zone counts - exclude zones that are being edited via territory type-specific marker types
    let regularTerritoryZoneCount = 0;
    let zombieTerritoryZoneCount = 0;
    
    // Count zones that are NOT being edited via territory type-specific marker types
    territories.forEach(territory => {
        const isZombie = isZombieTerritoryType(territory.territory_type);
        const territoryTypeKey = `territoryType_${territory.territory_type}`;
        const isBeingEditedByType = editingEnabled[territoryTypeKey];
        
        if (isZombie) {
            if (!editingEnabled.zombieTerritoryZones && !isBeingEditedByType) {
                zombieTerritoryZoneCount += territory.zones.length;
            }
        } else {
            if (!editingEnabled.territoryZones && !isBeingEditedByType) {
                regularTerritoryZoneCount += territory.zones.length;
            }
        }
    });
    
    const baseEditableOffset = zoneOffset + regularTerritoryZoneCount + zombieTerritoryZoneCount;
    
    // Calculate offset for this marker type
    let currentOffset = baseEditableOffset;
    for (const type of Object.keys(markerTypes)) {
        if (type === markerType) break;
        if (editingEnabled[type] && markerTypes[type].getShowFlag()) {
            currentOffset += markerTypes[type].getArray().length;
        }
    }
    
    array.forEach((marker, index) => {
        // Skip deleted markers
        if (typeConfig.isDeleted(index)) {
            return;
        }
        
        // Skip hidden markers
        if (!isMarkerVisible(markerType, index)) {
            return;
        }
        
        const screenPos = typeConfig.getScreenPos(marker);
        
        // Skip if position is invalid
        if (!isFinite(screenPos.x) || !isFinite(screenPos.y)) {
            return;
        }
        
        const isSelected = typeConfig.selected.has(index);
        const hasUnsavedChanges = typeConfig.originalPositions.has(index);
        const isNew = typeConfig.new.has(index);
        const isBeingDragged = isDraggingThisType && (draggedMarkerIndex === index || (draggedSelectedMarkers.get(markerType) && draggedSelectedMarkers.get(markerType).has(index)));
        const isEditingRadius = radiusEditMarkerType === markerType && radiusEditIndex === index;
        const isHovered = hoveredMarkerIndex === currentOffset + index;
        
        const renderState = {
            isSelected,
            isHovered,
            isEditing,
            isDragging: isBeingDragged,
            isEditingRadius,
            isNew,
            hasUnsavedChanges
        };
        
        // Customize style for effect areas (orange color)
        if (markerType === 'effectAreas') {
            const style = renderer.getRenderStyle(marker, index, renderState);
            if (!isEditing || !(hasUnsavedChanges || isSelected || isNew)) {
                style.fillColor = '#ff8800';
                style.strokeColor = '#ff6600';
            }
            renderer.drawCircleWithRadius(marker, screenPos, style, marker.radius * viewScale, 0.3);
            if (isEditing && isSelected) {
                renderer.drawRadiusHandle(screenPos, marker.radius * viewScale);
            }
        } else {
            // Check if marker has custom color (for territory zones)
            const customColor = marker.color || null;
            renderer.render(marker, index, renderState, customColor);
        }
    });
}

function drawEffectAreas() {
    if (!showEffectAreas) {
        return;
    }
    drawMarkerType('effectAreas');
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

// Draw zombie territory circles and zone markers
function drawZombieTerritories() {
    if (!showTerritories) {
        return;
    }
    
    if (territories.length === 0) {
        return;
    }
    
    const isEditing = editingEnabled.zombieTerritoryZones;
    const isDraggingThisType = isDragging && draggedMarkerType === 'zombieTerritoryZones';
    const typeConfig = markerTypes.zombieTerritoryZones;
    
    let drawnTerritories = 0;
    let drawnZones = 0;
    let zoneIndexOffset = markers.length + eventSpawns.length + 
        territories.reduce((sum, t) => sum + (isZombieTerritoryType(t.territory_type) ? 0 : t.zones.length), 0);
    
    territories.forEach((territory, territoryIndex) => {
        // Only draw zombie territories
        if (!isZombieTerritoryType(territory.territory_type)) {
            return;
        }
        
        // Check if territory is visible (filtered)
        if (visibleTerritories.size > 0 && !visibleTerritories.has(territoryIndex)) {
            return; // Skip hidden territories
        }
        
        // Draw zone markers and circles within territory
        territory.zones.forEach((zone, zoneIndex) => {
            // Find flattened index for this zone
            let flattenedIndex = -1;
            zombieZoneToTerritoryMap.forEach((value, key) => {
                if (value.territoryIndex === territoryIndex && value.zoneIndex === zoneIndex) {
                    flattenedIndex = key;
                }
            });
            
            // If mapping not found, try to find by matching zone data (for newly added zones)
            if (flattenedIndex < 0 && isEditing) {
                zombieTerritoryZones.forEach((tz, idx) => {
                    if (tz.x === zone.x && tz.z === zone.z && tz.radius === zone.radius &&
                        tz.territoryIndex === territoryIndex && tz.zoneIndex === zoneIndex) {
                        flattenedIndex = idx;
                    }
                });
            }
            
            // Skip deleted zones (check regardless of editing state if we have a flattened index)
            if (flattenedIndex >= 0 && typeConfig.isDeleted(flattenedIndex)) {
                return;
            }
            
            // If flattened index is still -1 and we're in editing mode, check if this zone exists in zombieTerritoryZones
            // This handles the case where a new zone was added and then deleted - it might still be in territory.zones
            if (flattenedIndex < 0 && isEditing) {
                // Check if this zone exists in the zombieTerritoryZones array
                const zoneExists = zombieTerritoryZones.some(tz => 
                    tz.x === zone.x && tz.z === zone.z && tz.radius === zone.radius &&
                    tz.territoryIndex === territoryIndex && tz.zoneIndex === zoneIndex
                );
                // If it doesn't exist in zombieTerritoryZones but is in territory.zones, it was likely deleted
                if (!zoneExists) {
                    return; // Skip drawing this zone
                }
            }
            
            const zoneScreenPos = worldToScreen(zone.x, zone.z);
            
            if (!isFinite(zoneScreenPos.x) || !isFinite(zoneScreenPos.y)) {
                return;
            }
            
            // Calculate offset for hover detection
            const zoneMarkerIndex = zoneIndexOffset + zoneIndex;
            const isHovered = hoveredMarkerIndex === zoneMarkerIndex;
            
            // Get zone radius
            const zoneRadius = zone.radius || 50.0;
            const screenRadius = zoneRadius * viewScale;
            
            // Check editing state if editing is enabled
            const isSelected = isEditing && flattenedIndex >= 0 && typeConfig.selected.has(flattenedIndex);
            const hasUnsavedChanges = isEditing && flattenedIndex >= 0 && typeConfig.originalPositions.has(flattenedIndex);
            const isNew = isEditing && flattenedIndex >= 0 && typeConfig.new.has(flattenedIndex);
            const isBeingDragged = isDraggingThisType && flattenedIndex >= 0 && (draggedMarkerIndex === flattenedIndex || (draggedSelectedMarkers.get('zombieTerritoryZones') && draggedSelectedMarkers.get('zombieTerritoryZones').has(flattenedIndex)));
            const isEditingRadius = radiusEditMarkerType === 'zombieTerritoryZones' && radiusEditIndex === flattenedIndex;
            
            // Use renderer to draw zone marker with custom territory color
            const renderer = new MarkerRenderer(typeConfig, ctx);
            const renderState = {
                isSelected,
                isHovered,
                isEditing,
                isDragging: isBeingDragged,
                isEditingRadius,
                isNew,
                hasUnsavedChanges
            };
            
            // Create a marker object with color for the renderer
            const markerWithColor = { ...zone, color: territory.color };
            renderer.render(markerWithColor, flattenedIndex >= 0 ? flattenedIndex : zoneIndex, renderState, territory.color);
            drawnZones++;
        });
        
        drawnTerritories++;
    });
}

// Draw territory circles and zone markers (non-zombie)
// Now uses territory type-specific marker types
function drawTerritories() {
    if (!showTerritories) {
        return;
    }
    
    if (territories.length === 0) {
        return;
    }
    
    // Draw each territory type using its marker type
    const typeNames = getAllTerritoryTypeNames();
    typeNames.forEach(territoryType => {
        // Skip zombie territories - they're drawn separately
        if (isZombieTerritoryType(territoryType)) {
            return;
        }
        
        const typeKey = `territoryType_${territoryType}`;
        if (markerTypes[typeKey]) {
            drawMarkerType(typeKey);
        }
    });
}

// Draw player spawn point markers and rectangles
function drawPlayerSpawnPoints() {
    if (!showPlayerSpawnPoints) {
        return;
    }
    drawMarkerType('playerSpawnPoints');
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
    let marker, isEventSpawn, isZone, isPlayerSpawnPoint, isZombieTerritory, hoveredMarkerType = null, hoveredMarkerIndexInType = -1;
    const eventSpawnOffset = markers.length;
    const zoneOffset = eventSpawnOffset + eventSpawns.length;
    // Calculate offsets for regular and zombie territories when not editing
    // Exclude zones that are being edited via territory type-specific marker types
    let regularTerritoryZoneCount = 0;
    let zombieTerritoryZoneCount = 0;
    territories.forEach(territory => {
        const isZombie = isZombieTerritoryType(territory.territory_type);
        const territoryTypeKey = `territoryType_${territory.territory_type}`;
        const isBeingEditedByType = editingEnabled[territoryTypeKey];
        
        if (isZombie) {
            if (!editingEnabled.zombieTerritoryZones && !isBeingEditedByType) {
                zombieTerritoryZoneCount += territory.zones.length;
            }
        } else {
            if (!editingEnabled.territoryZones && !isBeingEditedByType) {
                regularTerritoryZoneCount += territory.zones.length;
            }
        }
    });
    const regularTerritoryZoneOffset = zoneOffset;
    const zombieTerritoryZoneOffset = zoneOffset + regularTerritoryZoneCount;
    const baseEditableOffset = zoneOffset + regularTerritoryZoneCount + zombieTerritoryZoneCount;
    
    // Check editable marker types first (when editing is enabled)
    let foundInEditable = false;
    let currentOffset = baseEditableOffset;
    
    for (const markerType of Object.keys(markerTypes)) {
        const typeConfig = markerTypes[markerType];
        if (editingEnabled[markerType] && typeConfig.getShowFlag()) {
            const array = typeConfig.getArray();
            if (hoveredMarkerIndex >= currentOffset && hoveredMarkerIndex < currentOffset + array.length) {
                const index = hoveredMarkerIndex - currentOffset;
                if (!typeConfig.isDeleted(index)) {
                    marker = typeConfig.getMarker(index);
                    hoveredMarkerType = markerType;
                    hoveredMarkerIndexInType = index;
                    isEventSpawn = false;
                    isZone = (markerType === 'territoryZones' || markerType === 'zombieTerritoryZones' || markerType.startsWith('territoryType_'));
                    isZombieTerritory = (markerType === 'zombieTerritoryZones' || (markerType.startsWith('territoryType_') && isZombieTerritoryType(markerType.replace('territoryType_', ''))));
                    isPlayerSpawnPoint = (markerType === 'playerSpawnPoints');
                    foundInEditable = true;
                    break;
                }
            }
            currentOffset += array.length;
        }
    }
    
    if (!foundInEditable) {
        // Check non-editable markers
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
            isZombieTerritory = false;
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
            isZombieTerritory = false;
            isPlayerSpawnPoint = false;
        } else if (hoveredMarkerIndex >= regularTerritoryZoneOffset && hoveredMarkerIndex < zombieTerritoryZoneOffset) {
            // Regular territory zone marker (when not editing)
            // Check if territories are enabled
            if (!showTerritories) {
                return; // Don't show tooltip if territories are hidden
            }
            let zoneIndex = hoveredMarkerIndex - regularTerritoryZoneOffset;
            let found = false;
            for (const territory of territories) {
                // Skip zombie territories
                if (isZombieTerritoryType(territory.territory_type)) {
                    continue;
                }
                const territoryIndex = territories.indexOf(territory);
                if (visibleTerritories.size > 0 && !visibleTerritories.has(territoryIndex)) {
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
            isZombieTerritory = false;
            isPlayerSpawnPoint = false;
        } else if (hoveredMarkerIndex >= zombieTerritoryZoneOffset && hoveredMarkerIndex < baseEditableOffset) {
            // Zombie territory zone marker (when not editing)
            // Check if territories are enabled
            if (!showTerritories) {
                return; // Don't show tooltip if territories are hidden
            }
            let zoneIndex = hoveredMarkerIndex - zombieTerritoryZoneOffset;
            let found = false;
            for (const territory of territories) {
                // Only check zombie territories
                if (!isZombieTerritoryType(territory.territory_type)) {
                    continue;
                }
                const territoryIndex = territories.indexOf(territory);
                if (visibleTerritories.size > 0 && !visibleTerritories.has(territoryIndex)) {
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
            isZombieTerritory = true;
            isPlayerSpawnPoint = false;
        } else {
            // Check non-editable spawn points
            const spawnPointOffset = baseEditableOffset;
            if (hoveredMarkerIndex >= spawnPointOffset && hoveredMarkerIndex < spawnPointOffset + playerSpawnPoints.length) {
                const spawnPointIndex = hoveredMarkerIndex - spawnPointOffset;
                if (spawnPointIndex < playerSpawnPoints.length) {
                    marker = playerSpawnPoints[spawnPointIndex];
                    hoveredMarkerType = 'playerSpawnPoints';
                    hoveredMarkerIndexInType = spawnPointIndex;
                    isEventSpawn = false;
                    isZone = false;
                    isZombieTerritory = false;
                    isPlayerSpawnPoint = true;
                }
            }
        }
    }
    const padding = 8;
    const lineHeight = 18;
    const fontSize = 12;
    
    // Check if marker exists
    if (!marker) {
        return; // Don't draw tooltip if marker is undefined
    }
    
    // Build tooltip content using marker type configuration if available
    let lines = [];
    
    // If this is an editable marker type with tooltip configuration, use it
    if (hoveredMarkerType && markerTypes[hoveredMarkerType] && markerTypes[hoveredMarkerType].getTooltipLines) {
        lines = markerTypes[hoveredMarkerType].getTooltipLines(marker);
    } else {
        // Fallback to legacy tooltip generation for non-editable markers
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
        if (marker.x !== undefined && marker.y !== undefined && marker.z !== undefined) {
            lines.push(`X: ${marker.x.toFixed(2)} m`);
            lines.push(`Y: ${marker.y.toFixed(2)} m`);
            lines.push(`Z: ${marker.z.toFixed(2)} m`);
        }
        
        // Display rectangle dimensions for player spawn points
        if (isPlayerSpawnPoint && marker.width !== undefined && marker.height !== undefined) {
            lines.push('');
            lines.push(`Rectangle Width: ${marker.width.toFixed(2)} m`);
            lines.push(`Rectangle Height: ${marker.height.toFixed(2)} m`);
        }
        
        // Display radius for zones and effect areas
        if (isZone && marker.radius !== undefined) {
            lines.push('');
            lines.push(`Radius: ${marker.radius.toFixed(2)} m`);
        }
        
        // Display usage if available (for regular markers and event spawns)
        const usageNames = [];
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
        if (marker.proto_children && typeof marker.proto_children === 'object' && marker.proto_children.usage) {
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
        
        // Display territory info for zones (non-zombie, when not editing)
        if (isZone && !isZombieTerritory) {
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
        if (marker.proto_children && typeof marker.proto_children === 'object') {
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
        if (containerNames.length > 0) {
            lines.push('');
            lines.push('Containers:');
            containerNames.forEach(name => {
                lines.push(`  • ${name}`);
            });
        }
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

// Draw marquee selection rectangle on overlay canvas
function drawMarquee() {
    if (!overlayCtx) return;
    
    // Clear overlay canvas
    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    if (!isMarqueeSelecting) return;
    
    const rectX = Math.min(marqueeStartX, marqueeCurrentX);
    const rectY = Math.min(marqueeStartY, marqueeCurrentY);
    const rectWidth = Math.abs(marqueeCurrentX - marqueeStartX);
    const rectHeight = Math.abs(marqueeCurrentY - marqueeStartY);
    
    // Draw selection rectangle on overlay canvas
    overlayCtx.strokeStyle = '#0066ff';
    overlayCtx.lineWidth = 2;
    overlayCtx.setLineDash([5, 5]);
    overlayCtx.strokeRect(rectX, rectY, rectWidth, rectHeight);
    
    // Draw semi-transparent fill
    overlayCtx.fillStyle = 'rgba(0, 102, 255, 0.1)';
    overlayCtx.fillRect(rectX, rectY, rectWidth, rectHeight);
    
    // Reset line dash
    overlayCtx.setLineDash([]);
}

// Main draw function
// Drawing order configuration - defines the order and stages of drawing
const DRAW_ORDER = [
    { stage: 'background', type: 'background', condition: () => showBackgroundImage, draw: () => {
        if (useWebGL && gl && backgroundCanvas && backgroundImage) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvasWidth, canvasHeight);
            gl.clearColor(0.18, 0.20, 0.25, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            drawBackgroundImageWebGL();
        } else if (backgroundCtx && backgroundCanvas && backgroundImage) {
            backgroundCtx.clearRect(0, 0, canvasWidth, canvasHeight);
            backgroundCtx.fillStyle = '#2E3440';
            backgroundCtx.fillRect(0, 0, canvasWidth, canvasHeight);
            const oldCtx = ctx;
            ctx = backgroundCtx;
            drawBackgroundImage();
            ctx = oldCtx;
        }
    }},
    { stage: 'background', type: 'background-clear', condition: () => !showBackgroundImage, draw: () => {
        if (useWebGL && gl && backgroundCanvas) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvasWidth, canvasHeight);
            gl.clearColor(0.18, 0.20, 0.25, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        } else if (backgroundCtx && backgroundCanvas) {
            backgroundCtx.clearRect(0, 0, canvasWidth, canvasHeight);
            backgroundCtx.fillStyle = '#2E3440';
            backgroundCtx.fillRect(0, 0, canvasWidth, canvasHeight);
        }
    }},
    { stage: 'main', type: 'clear', condition: () => true, draw: () => {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    }},
    { stage: 'main', type: 'grid', condition: () => true, draw: drawGrid },
    { stage: 'main', type: 'markers', condition: () => true, draw: drawMarkers },
    { stage: 'main', type: 'event-spawns', condition: () => true, draw: drawEventSpawns },
    { stage: 'main', type: 'territories', condition: () => true, draw: drawTerritories },
    { stage: 'main', type: 'zombie-territories', condition: () => true, draw: drawZombieTerritories },
    { stage: 'main', type: 'player-spawn-points', condition: () => true, draw: drawPlayerSpawnPoints },
    { stage: 'main', type: 'effect-areas', condition: () => true, draw: drawEffectAreas },
    { stage: 'overlay', type: 'marquee', condition: () => true, draw: drawMarquee },
    { stage: 'overlay', type: 'tooltip', condition: () => true, draw: drawTooltip }
];

function draw() {
    // Cancel any pending animation frame
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    needsRedraw = false;
    
    // Execute drawing stages in configured order
    for (const item of DRAW_ORDER) {
        if (item.condition && item.condition()) {
            item.draw();
        }
    }
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
        // Check for marker click first using selection manager
        if (selectionManager.selectAtPoint(x, y, { altKey: e.altKey })) {
            // Marker was selected
            updateSelectedCount();
            requestDraw();
        } else {
            // Empty space - start marquee selection
            isMarqueeSelecting = true;
            marqueeStartX = x;
            marqueeStartY = y;
            marqueeCurrentX = x;
            marqueeCurrentY = y;
            drawMarquee(); // Draw initial marquee on overlay canvas
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
            // Valid marquee - select markers using selection manager
            selectionManager.selectInRectangle(rectX, rectY, rectWidth, rectHeight, {
                altKey: e.altKey
            });
        } else {
            // Small rectangle - treat as empty click
            selectionManager.clearAllSelections();
        }
        
        isMarqueeSelecting = false;
        // Clear overlay canvas when marquee ends
        if (overlayCtx) {
            overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        }
        updateSelectedCount();
        draw();
    }
}

// Clean up selections by removing hidden markers (delegates to SelectionManager)
function cleanupHiddenSelections() {
    selectionManager.cleanupHiddenSelections();
}

// Select markers within rectangle (delegates to SelectionManager)
function selectMarkersInRectangle(rectX, rectY, rectWidth, rectHeight, addToSelection = true) {
    selectionManager.selectInRectangle(rectX, rectY, rectWidth, rectHeight, {
        altKey: !addToSelection
    });
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

// Helper function to check if a marker is visible
function isMarkerVisible(markerType, index) {
    if (markerType === 'territoryZones') {
        // Check if the territory containing this zone is visible
        const mapEntry = zoneToTerritoryMap.get(index);
        if (!mapEntry) return true; // If no mapping, assume visible
        const territoryIndex = mapEntry.territoryIndex;
        // If filters are active, check visibility set
        if (visibleTerritories.size > 0) {
            return visibleTerritories.has(territoryIndex);
        }
        return true; // No filters = all visible
    } else if (markerType === 'zombieTerritoryZones') {
        // Check if the zombie territory containing this zone is visible
        const mapEntry = zombieZoneToTerritoryMap.get(index);
        if (!mapEntry) return true; // If no mapping, assume visible
        const territoryIndex = mapEntry.territoryIndex;
        // If filters are active, check visibility set
        if (visibleTerritories.size > 0) {
            return visibleTerritories.has(territoryIndex);
        }
        return true; // No filters = all visible
    } else if (markerType.startsWith('territoryType_')) {
        // Check if the territory containing this zone is visible (for territory type-specific marker types)
        const territoryType = markerType.replace('territoryType_', '');
        const mapEntry = territoryTypeZoneMaps[territoryType]?.get(index);
        if (!mapEntry) return true; // If no mapping, assume visible
        const territoryIndex = mapEntry.territoryIndex;
        // If filters are active, check visibility set
        if (visibleTerritories.size > 0) {
            return visibleTerritories.has(territoryIndex);
        }
        return true; // No filters = all visible
    }
    // For other types, check if the type is shown
    const typeConfig = markerTypes[markerType];
    return typeConfig.getShowFlag();
}

// Generic function to select marker at point for a specific type
function selectAtPointForType(markerType, screenX, screenY, altKey = false) {
    const typeConfig = markerTypes[markerType];
    if (!typeConfig || !editingEnabled[markerType] || !typeConfig.getShowFlag()) {
        return false;
    }
    
    const array = typeConfig.getArray();
    for (let index = 0; index < array.length; index++) {
        if (typeConfig.isDeleted(index)) continue;
        // CRITICAL: Only allow selection of visible markers
        if (!isMarkerVisible(markerType, index)) continue;
        
        const marker = typeConfig.getMarker(index);
        const screenPos = typeConfig.getScreenPos(marker);
        
        if (typeConfig.isPointOnMarker(marker, screenX, screenY, screenPos)) {
            if (altKey) {
                // Alt key pressed - toggle selection (only if visible)
                if (typeConfig.selected.has(index)) {
                    typeConfig.selected.delete(index);
                } else {
                    // Only add if still visible
                    if (isMarkerVisible(markerType, index)) {
                        typeConfig.selected.add(index);
                    }
                }
            } else {
                // Normal mode - select this one (clear others of same type and other types)
                typeConfig.selected.clear();
                // Only add if visible
                if (isMarkerVisible(markerType, index)) {
                    typeConfig.selected.add(index);
                }
                // Clear selection for other marker types
                for (const otherType of Object.keys(markerTypes)) {
                    if (otherType !== markerType && editingEnabled[otherType]) {
                        markerTypes[otherType].selected.clear();
                    }
                }
            }
            // Clean up any hidden markers from selection
            cleanupHiddenSelections();
            updateSelectedCount();
            return true;
        }
    }
    
    return false;
}

// Select marker at point (delegates to SelectionManager)
function selectAtPoint(screenX, screenY, altKey = false) {
    const found = selectionManager.selectAtPoint(screenX, screenY, { altKey });
    if (found) {
        updateSelectedCount();
        draw();
    }
    return found;
}

// Update hovered marker
function updateHoveredMarker(screenX, screenY) {
    // Use consistent threshold for marker interaction
    let newHoveredIndex = -1;
    let minDistance = Infinity;
    
    // If editing is enabled for a specific type, only check that type
    const isEditingAnyType = Object.values(editingEnabled).some(v => v === true);
    
    // Check regular markers (only if showMarkers is true and not editing)
    if (showMarkers && !isEditingAnyType) {
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
    
    // Check event spawns (offset index by markers.length) - skip if editing
    if (showEventSpawns && !isEditingAnyType) {
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
    
    // Check zone markers (offset by markers.length + eventSpawns.length) - skip if editing territory zones or territory type-specific zones
    if (showTerritories && !editingEnabled.territoryZones) {
        let zoneIndexOffset = markers.length + eventSpawns.length;
        territories.forEach((territory, territoryIndex) => {
            // Skip zones that are being edited via territory type-specific marker types
            const territoryTypeKey = `territoryType_${territory.territory_type}`;
            if (editingEnabled[territoryTypeKey]) {
                zoneIndexOffset += territory.zones.length; // Skip zones in territories being edited by type
                return;
            }
            
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
    
    // Check editable marker types for hover (including territory zones when editing)
    if (!isDragging && !isEditingRadius) {
        let offset = markers.length + eventSpawns.length;
        
        // If not editing territory zones, add zone offset (non-zombie, excluding zones being edited by type)
        if (!editingEnabled.territoryZones) {
            offset += territories.reduce((sum, t) => {
                const territoryTypeKey = `territoryType_${t.territory_type}`;
                if (isZombieTerritoryType(t.territory_type) || editingEnabled[territoryTypeKey]) {
                    return sum;
                }
                return sum + t.zones.length;
            }, 0);
        }
        // If not editing zombie territory zones, add zombie zone offset (excluding zones being edited by type)
        if (!editingEnabled.zombieTerritoryZones) {
            offset += territories.reduce((sum, t) => {
                if (!isZombieTerritoryType(t.territory_type)) {
                    return sum;
                }
                const territoryTypeKey = `territoryType_${t.territory_type}`;
                if (editingEnabled[territoryTypeKey]) {
                    return sum;
                }
                return sum + t.zones.length;
            }, 0);
        }
        
        for (const markerType of Object.keys(markerTypes)) {
            const typeConfig = markerTypes[markerType];
            // Skip territory zones if not editing (they're handled above)
            if (markerType === 'territoryZones' && !editingEnabled.territoryZones) {
                continue;
            }
            if (markerType === 'zombieTerritoryZones' && !editingEnabled.zombieTerritoryZones) {
                continue;
            }
            // Skip territory type-specific marker types if not editing
            if (markerType.startsWith('territoryType_') && !editingEnabled[markerType]) {
                continue;
            }
            
            if (typeConfig.getShowFlag() && (editingEnabled[markerType] || !isEditingAnyType)) {
                const array = typeConfig.getArray();
                array.forEach((marker, index) => {
                    if (typeConfig.isDeleted(index)) return;
                    if (!isMarkerVisible(markerType, index)) return; // Skip hidden markers
                    
                    const screenPos = typeConfig.getScreenPos(marker);
                    const dx = screenPos.x - screenX;
                    const dy = screenPos.y - screenY;
                    
                    let distance;
                    if (typeConfig.canEditRadius && marker.radius !== undefined) {
                        const screenRadius = (marker.radius || 50.0) * viewScale;
                        distance = Math.sqrt(dx * dx + dy * dy);
                        // Check if within circle
                        if (distance <= screenRadius + MARKER_INTERACTION_THRESHOLD && distance < minDistance) {
                            minDistance = distance;
                            newHoveredIndex = offset + index;
                        }
                    } else {
                        distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance < MARKER_INTERACTION_THRESHOLD && distance < minDistance) {
                            minDistance = distance;
                            newHoveredIndex = offset + index;
                        }
                    }
                });
                offset += array.length;
            }
        }
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
        const baseEditableOffset = zoneOffset + (editingEnabled.territoryZones ? 0 : territories.reduce((sum, t) => sum + t.zones.length, 0));
        
        let marker = null;
        
        // Check editable marker types first (when editing is enabled)
        let foundInEditable = false;
        let currentOffset = baseEditableOffset;
        
        for (const markerType of Object.keys(markerTypes)) {
            const typeConfig = markerTypes[markerType];
            if (editingEnabled[markerType] && typeConfig.getShowFlag()) {
                const array = typeConfig.getArray();
                if (hoveredMarkerIndex >= currentOffset && hoveredMarkerIndex < currentOffset + array.length) {
                    const index = hoveredMarkerIndex - currentOffset;
                    if (!typeConfig.isDeleted(index)) {
                        marker = typeConfig.getMarker(index);
                        if (markerType === 'territoryZones' || markerType.startsWith('territoryType_')) {
                            locationSource = 'zone';
                        } else if (markerType === 'zombieTerritoryZones') {
                            locationSource = 'zombie zone';
                        } else if (markerType === 'playerSpawnPoints') {
                            locationSource = 'spawn point';
                        } else if (markerType === 'effectAreas') {
                            locationSource = 'effect area';
                        }
                        foundInEditable = true;
                        break;
                    }
                }
                currentOffset += array.length;
            }
        }
        
        if (!foundInEditable) {
            // Check non-editable markers
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
            } else if (hoveredMarkerIndex < baseEditableOffset) {
                // Zone marker (when not editing)
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
                // Check non-editable spawn points
                const spawnPointOffset = baseEditableOffset;
                if (hoveredMarkerIndex >= spawnPointOffset && hoveredMarkerIndex < spawnPointOffset + playerSpawnPoints.length) {
                    const spawnPointIndex = hoveredMarkerIndex - spawnPointOffset;
                    if (spawnPointIndex < playerSpawnPoints.length) {
                        marker = playerSpawnPoints[spawnPointIndex];
                        locationSource = 'spawn point';
                    }
                }
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

// Generic function to try starting drag for a marker type
function tryStartDragForType(markerType, screenX, screenY) {
    const typeConfig = markerTypes[markerType];
    if (!typeConfig || !editingEnabled[markerType] || !typeConfig.getShowFlag()) {
        return false;
    }
    
    const array = typeConfig.getArray();
    const selected = typeConfig.selected;
    
    // Check if we have selected markers - if so, drag all selected ones
    if (selected.size > 0) {
        // Check if clicking on a selected marker
        for (const index of selected) {
            if (index >= array.length || typeConfig.isDeleted(index)) continue;
            if (!isMarkerVisible(markerType, index)) continue; // Skip hidden markers
            const marker = typeConfig.getMarker(index);
            const screenPos = typeConfig.getScreenPos(marker);
            
            if (typeConfig.isPointOnMarker(marker, screenX, screenY, screenPos)) {
                // Save original positions for all selected markers if not already saved
                for (const selectedIndex of selected) {
                    if (!typeConfig.originalPositions.has(selectedIndex)) {
                        const m = typeConfig.getMarker(selectedIndex);
                        typeConfig.originalPositions.set(selectedIndex, typeConfig.getOriginalData(m));
                    }
                }
                
                // Store the relative positions of all selected markers relative to the marker being dragged
                if (!draggedSelectedMarkers.has(markerType)) {
                    draggedSelectedMarkers.set(markerType, new Map());
                }
                const offsets = draggedSelectedMarkers.get(markerType);
                offsets.clear();
                // Use the actual marker position as the reference point, not the click position
                const draggedMarkerX = marker.x;
                const draggedMarkerZ = marker.z;
                for (const selectedIndex of selected) {
                    const m = typeConfig.getMarker(selectedIndex);
                    offsets.set(selectedIndex, {
                        offsetX: m.x - draggedMarkerX,
                        offsetZ: m.z - draggedMarkerZ
                    });
                }
                
                isDragging = true;
                draggedMarkerType = markerType;
                draggedMarkerIndex = index;
                dragStartX = screenX;
                dragStartY = screenY;
                // Store the actual marker position, not the click position
                dragStartWorldX = draggedMarkerX;
                dragStartWorldZ = draggedMarkerZ;
                
                return true;
            }
        }
    } else {
        // No selection - check if clicking on any marker
        for (let index = 0; index < array.length; index++) {
            if (typeConfig.isDeleted(index)) continue;
            if (!isMarkerVisible(markerType, index)) continue; // Skip hidden markers
            const marker = typeConfig.getMarker(index);
            const screenPos = typeConfig.getScreenPos(marker);
            
            if (typeConfig.isPointOnMarker(marker, screenX, screenY, screenPos)) {
                // Save original position if not already saved
                if (!typeConfig.originalPositions.has(index)) {
                    typeConfig.originalPositions.set(index, typeConfig.getOriginalData(marker));
                }
                
                isDragging = true;
                draggedMarkerType = markerType;
                draggedMarkerIndex = index;
                dragStartX = screenX;
                dragStartY = screenY;
                dragStartWorldX = marker.x;
                dragStartWorldZ = marker.z;
                
                return true;
            }
        }
    }
    
    return false;
}

// Try to start dragging a marker (checks all editable types)
function tryStartDrag(screenX, screenY) {
    // Check each editable marker type
    for (const markerType of Object.keys(markerTypes)) {
        if (tryStartDragForType(markerType, screenX, screenY)) {
            return true;
        }
    }
    return false;
}

// Handle drag update
function handleDrag(screenX, screenY) {
    if (isEditingRadius) {
        // Handle radius editing
        if (radiusEditMarkerType && radiusEditIndex >= 0) {
            const typeConfig = markerTypes[radiusEditMarkerType];
            if (typeConfig && typeConfig.canEditRadius) {
                const marker = typeConfig.getMarker(radiusEditIndex);
                if (marker) {
                    const screenPos = typeConfig.getScreenPos(marker);
                    
                    // Calculate new radius based on distance from center
                    const dx = screenX - screenPos.x;
                    const dy = screenY - screenPos.y;
                    const newScreenRadius = Math.sqrt(dx * dx + dy * dy);
                    
                    // Convert back to world units
                    const newRadius = newScreenRadius / viewScale;
                    
                    // Ensure minimum radius
                    if (newRadius > 1.0) {
                        // Apply the new radius to all selected markers
                        const oldRadius = marker.radius;
                        for (const selectedIndex of radiusEditSelectedMarkers) {
                            const selectedMarker = typeConfig.getMarker(selectedIndex);
                            if (selectedMarker && selectedMarker.radius !== undefined) {
                                const previousRadius = selectedMarker.radius;
                                selectedMarker.radius = newRadius;
                                
                                // Emit event for each marker
                                markerEvents.emit('marker:resized', {
                                    markerType: radiusEditMarkerType,
                                    index: selectedIndex,
                                    oldRadius: previousRadius,
                                    newRadius
                                });
                                
                                // For territory zones, sync radius change back to territories array
                                if (radiusEditMarkerType === 'territoryZones') {
                                    syncTerritoryZoneToTerritories(selectedIndex);
                                } else if (radiusEditMarkerType === 'zombieTerritoryZones') {
                                    syncZombieTerritoryZoneToTerritories(selectedIndex);
                                }
                            }
                        }
                    }
                }
            }
        }
        requestDraw();
        return;
    }
    
    if (!isDragging || !draggedMarkerType) return;
    
    const typeConfig = markerTypes[draggedMarkerType];
    if (!typeConfig) return;
    
    // Calculate world position delta
    const startWorld = screenToWorld(dragStartX, dragStartY);
    const currentWorld = screenToWorld(screenX, screenY);
    
    const deltaX = currentWorld.x - startWorld.x;
    const deltaZ = currentWorld.z - startWorld.z;
    
    // Update marker position(s)
    const offsets = draggedSelectedMarkers.get(draggedMarkerType);
    if (offsets && offsets.size > 0) {
        // Move all selected markers, maintaining relative positions
        const newCenterX = dragStartWorldX + deltaX;
        const newCenterZ = dragStartWorldZ + deltaZ;
        
        offsets.forEach((offset, index) => {
            const marker = typeConfig.getMarker(index);
            if (marker) {
                marker.x = newCenterX + offset.offsetX;
                marker.z = newCenterZ + offset.offsetZ;
                
                // For territory zones, sync changes back to territories array immediately
                if (draggedMarkerType === 'territoryZones') {
                    syncTerritoryZoneToTerritories(index);
                } else if (draggedMarkerType === 'zombieTerritoryZones') {
                    syncZombieTerritoryZoneToTerritories(index);
                }
            }
        });
    } else if (draggedMarkerIndex >= 0) {
        // Single marker drag
        const marker = typeConfig.getMarker(draggedMarkerIndex);
        if (marker) {
            marker.x = dragStartWorldX + deltaX;
            marker.z = dragStartWorldZ + deltaZ;
            
            // For territory zones, sync changes back to territories array immediately
            if (draggedMarkerType === 'territoryZones') {
                syncTerritoryZoneToTerritories(draggedMarkerIndex);
            } else if (draggedMarkerType === 'zombieTerritoryZones') {
                syncZombieTerritoryZoneToTerritories(draggedMarkerIndex);
            }
        }
    }
    
    // Force immediate redraw for smooth visual feedback during drag
    requestDraw();
    // Also call draw() directly for immediate feedback
    draw();
}

// Handle drag end
function handleDragEnd() {
    if (isEditingRadius) {
        // Round radius to 2 decimal places for all selected markers
        if (radiusEditMarkerType && radiusEditIndex >= 0) {
            const typeConfig = markerTypes[radiusEditMarkerType];
            if (typeConfig && typeConfig.canEditRadius) {
                // Round all selected markers' radii
                for (const selectedIndex of radiusEditSelectedMarkers) {
                    const marker = typeConfig.getMarker(selectedIndex);
                    if (marker && marker.radius !== undefined) {
                        marker.radius = Math.round(marker.radius * 100) / 100;
                        
                        // For territory zones, sync radius change back to territories array
                        if (radiusEditMarkerType === 'territoryZones') {
                            syncTerritoryZoneToTerritories(selectedIndex);
                        } else if (radiusEditMarkerType === 'zombieTerritoryZones') {
                            syncZombieTerritoryZoneToTerritories(selectedIndex);
                        }
                    }
                }
            }
        }
        isEditingRadius = false;
        radiusEditMarkerType = null;
        radiusEditIndex = -1;
        radiusEditSelectedMarkers.clear();
        requestDraw();
        return;
    }
    
    if (!isDragging || !draggedMarkerType) return;
    
    const typeConfig = markerTypes[draggedMarkerType];
    if (!typeConfig) return;
    
    // Round positions to 2 decimal places when placing the marker(s)
    const offsets = draggedSelectedMarkers.get(draggedMarkerType);
    if (offsets && offsets.size > 0) {
        // Round all selected markers and emit events
        offsets.forEach((offset, index) => {
            const marker = typeConfig.getMarker(index);
            if (marker) {
                const oldPos = { x: marker.x, y: marker.y, z: marker.z };
                marker.x = Math.round(marker.x * 100) / 100;
                if (marker.y !== undefined) marker.y = Math.round(marker.y * 100) / 100;
                marker.z = Math.round(marker.z * 100) / 100;
                
                // Emit move event
                markerEvents.emit('marker:moved', {
                    markerType: draggedMarkerType,
                    index,
                    oldPos,
                    newPos: { x: marker.x, y: marker.y, z: marker.z }
                });
            }
        });
    } else if (draggedMarkerIndex >= 0) {
        // Single marker
        const marker = typeConfig.getMarker(draggedMarkerIndex);
        if (marker) {
            const oldPos = { x: marker.x, y: marker.y, z: marker.z };
            marker.x = Math.round(marker.x * 100) / 100;
            if (marker.y !== undefined) marker.y = Math.round(marker.y * 100) / 100;
            marker.z = Math.round(marker.z * 100) / 100;
            
            // Emit move event
            markerEvents.emit('marker:moved', {
                markerType: draggedMarkerType,
                index: draggedMarkerIndex,
                oldPos,
                newPos: { x: marker.x, y: marker.y, z: marker.z }
            });
            
            // For territory zones, sync changes back to territories array
            if (draggedMarkerType === 'territoryZones') {
                syncTerritoryZoneToTerritories(draggedMarkerIndex);
            } else if (draggedMarkerType === 'zombieTerritoryZones') {
                syncZombieTerritoryZoneToTerritories(draggedMarkerIndex);
            }
        }
    }
    
    // For territory zones with multiple selected markers, sync all changes
    if (draggedMarkerType === 'territoryZones') {
        const offsets = draggedSelectedMarkers.get('territoryZones');
        if (offsets && offsets.size > 0) {
            offsets.forEach((offset, index) => {
                syncTerritoryZoneToTerritories(index);
            });
        }
    } else if (draggedMarkerType === 'zombieTerritoryZones') {
        const offsets = draggedSelectedMarkers.get('zombieTerritoryZones');
        if (offsets && offsets.size > 0) {
            offsets.forEach((offset, index) => {
                syncZombieTerritoryZoneToTerritories(index);
            });
        }
    }
    
    isDragging = false;
    draggedMarkerType = null;
    draggedMarkerIndex = -1;
    draggedSelectedMarkers.clear();
    requestDraw();
}

// Handle Delete/Backspace key press
function handleDeleteKey(e) {
    // Check each editable type for selected markers to delete
    for (const markerType of Object.keys(markerTypes)) {
        const typeConfig = markerTypes[markerType];
        if (editingEnabled[markerType] && typeConfig.selected.size > 0) {
            deleteSelectedMarkers(markerType);
            e.preventDefault();
            e.stopPropagation();
            return;
        }
    }
    
    // If no editable markers selected, don't prevent default (allow normal browser behavior)
}

// Generic function to delete selected markers
function deleteSelectedMarkers(markerType) {
    const typeConfig = markerTypes[markerType];
    if (!typeConfig || !editingEnabled[markerType] || typeConfig.selected.size === 0) {
        return;
    }
    
    const array = typeConfig.getArray();
    const indicesToDelete = Array.from(typeConfig.selected).sort((a, b) => b - a); // Sort descending for safe deletion
    
    for (const index of indicesToDelete) {
        if (index < array.length) {
            // If this marker was newly added, just remove it
            if (typeConfig.new.has(index)) {
                const marker = typeConfig.getMarker(index);
                
                // For zombie territory zones, also remove from territories array
                if (markerType === 'zombieTerritoryZones' && marker) {
                    const mapEntry = zombieZoneToTerritoryMap.get(index);
                    if (mapEntry) {
                        const { territoryIndex, zoneIndex } = mapEntry;
                        if (territoryIndex >= 0 && territoryIndex < territories.length &&
                            zoneIndex >= 0 && zoneIndex < territories[territoryIndex].zones.length) {
                            // Remove from territories array
                            territories[territoryIndex].zones.splice(zoneIndex, 1);
                        }
                        // Remove mapping
                        zombieZoneToTerritoryMap.delete(index);
                    }
                }
                
                // For regular territory zones, also remove from territories array
                if (markerType === 'territoryZones' && marker) {
                    const mapEntry = zoneToTerritoryMap.get(index);
                    if (mapEntry) {
                        const { territoryIndex, zoneIndex } = mapEntry;
                        if (territoryIndex >= 0 && territoryIndex < territories.length &&
                            zoneIndex >= 0 && zoneIndex < territories[territoryIndex].zones.length) {
                            // Remove from territories array
                            territories[territoryIndex].zones.splice(zoneIndex, 1);
                        }
                        // Remove mapping
                        zoneToTerritoryMap.delete(index);
                    }
                } else if (markerType.startsWith('territoryType_') && marker) {
                    // For territory type-specific marker types, remove from territories array
                    const territoryType = markerType.replace('territoryType_', '');
                    const mapEntry = territoryTypeZoneMaps[territoryType]?.get(index);
                    if (mapEntry) {
                        const { territoryIndex, zoneIndex } = mapEntry;
                        if (territoryIndex >= 0 && territoryIndex < territories.length &&
                            zoneIndex >= 0 && zoneIndex < territories[territoryIndex].zones.length) {
                            // Remove from territories array
                            territories[territoryIndex].zones.splice(zoneIndex, 1);
                        }
                        // Remove mapping
                        territoryTypeZoneMaps[territoryType].delete(index);
                    }
                }
                
                typeConfig.new.delete(index);
                array.splice(index, 1);
                
                // Update indices in originalPositions, selected, and new sets
                const newOriginalPositions = new Map();
                typeConfig.originalPositions.forEach((pos, idx) => {
                    if (idx < index) {
                        newOriginalPositions.set(idx, pos);
                    } else if (idx > index) {
                        newOriginalPositions.set(idx - 1, pos);
                    }
                });
                typeConfig.originalPositions = newOriginalPositions;
                
                const newSelected = new Set();
                typeConfig.selected.forEach(idx => {
                    if (idx < index) {
                        newSelected.add(idx);
                    } else if (idx > index) {
                        newSelected.add(idx - 1);
                    }
                });
                typeConfig.selected = newSelected;
                
                const newNew = new Set();
                typeConfig.new.forEach(idx => {
                    if (idx < index) {
                        newNew.add(idx);
                    } else if (idx > index) {
                        newNew.add(idx - 1);
                    }
                });
                typeConfig.new = newNew;
                
                // Update mappings for indices after the deleted one
                if (markerType === 'zombieTerritoryZones') {
                    const newMap = new Map();
                    zombieZoneToTerritoryMap.forEach((value, key) => {
                        if (key < index) {
                            newMap.set(key, value);
                        } else if (key > index) {
                            newMap.set(key - 1, value);
                        }
                    });
                    zombieZoneToTerritoryMap.clear();
                    newMap.forEach((value, key) => {
                        zombieZoneToTerritoryMap.set(key, value);
                    });
                } else if (markerType === 'territoryZones') {
                    const newMap = new Map();
                    zoneToTerritoryMap.forEach((value, key) => {
                        if (key < index) {
                            newMap.set(key, value);
                        } else if (key > index) {
                            newMap.set(key - 1, value);
                        }
                    });
                    zoneToTerritoryMap.clear();
                    newMap.forEach((value, key) => {
                        zoneToTerritoryMap.set(key, value);
                    });
                } else if (markerType.startsWith('territoryType_')) {
                    // Update mappings for territory type-specific marker types
                    const territoryType = markerType.replace('territoryType_', '');
                    const map = territoryTypeZoneMaps[territoryType];
                    if (map) {
                        const newMap = new Map();
                        map.forEach((value, key) => {
                            if (key < index) {
                                newMap.set(key, value);
                            } else if (key > index) {
                                newMap.set(key - 1, value);
                            }
                        });
                        territoryTypeZoneMaps[territoryType].clear();
                        newMap.forEach((value, key) => {
                            territoryTypeZoneMaps[territoryType].set(key, value);
                        });
                    }
                }
            } else {
                // Mark as deleted (don't remove from array yet, will be removed on save)
                const marker = typeConfig.getMarker(index);
                typeConfig.deleted.add(index);
                // Store original position for restore
                if (!typeConfig.originalPositions.has(index)) {
                    typeConfig.originalPositions.set(index, typeConfig.getOriginalData(marker));
                }
                // Emit event
                markerEvents.emit('marker:deleted', { markerType, index, marker });
            }
        }
    }
    
    // Clear selection
    typeConfig.selected.clear();
    updateSelectedCount();
    requestDraw();
}

// Generic function to add a new marker at cursor location
function addMarkerAt(markerType, screenX, screenY) {
    const typeConfig = markerTypes[markerType];
    if (!typeConfig || !editingEnabled[markerType]) {
        return;
    }
    
    const worldPos = screenToWorld(screenX, screenY);
    const x = Math.round(worldPos.x * 100) / 100;
    const y = Math.round(worldPos.y * 100) / 100;
    const z = Math.round(worldPos.z * 100) / 100;
    
    const array = typeConfig.getArray();
    const newIndex = array.length;
    
    // Create new marker using type-specific factory
    const newMarker = typeConfig.createNew(x, y, z);
    array.push(newMarker);
    
    // Mark as new
    typeConfig.new.add(newIndex);
    
    // Emit event
    markerEvents.emit('marker:created', { markerType, index: newIndex, marker: newMarker });
    
    // For zombie territory zones, ensure the zone is properly synced to territories
    if (markerType === 'zombieTerritoryZones') {
        // Find or create zombie territory
        const selectedType = newMarker.territoryType;
        let targetTerritoryIndex = -1;
        
        // First, try to find an existing zombie territory
        for (let i = 0; i < territories.length; i++) {
            if (isZombieTerritoryType(territories[i].territory_type)) {
                targetTerritoryIndex = i;
                break;
            }
        }
        
        // If no zombie territory exists, create placeholder
        if (targetTerritoryIndex < 0) {
            const newTerritory = {
                id: territories.length,
                name: `${selectedType}_0`,
                territory_type: selectedType,
                color: '#FF0000',
                zones: []
            };
            territories.push(newTerritory);
            targetTerritoryIndex = territories.length - 1;
        }
        
        // Add zone to the target territory
        const territory = territories[targetTerritoryIndex];
        const zoneIndex = territory.zones.length;
        newMarker.territoryIndex = targetTerritoryIndex;
        newMarker.zoneIndex = zoneIndex;
        
        // Add zone to territory
        territory.zones.push({
            id: zoneIndex,
            name: newMarker.name,
            x: newMarker.x,
            y: newMarker.y,
            z: newMarker.z,
            radius: newMarker.radius,
            xml: newMarker.xml
        });
        
        // Update zone color to match territory
        newMarker.color = territory.color;
        
        // Set mapping using the correct flattened index (newIndex)
        zombieZoneToTerritoryMap.set(newIndex, { territoryIndex: targetTerritoryIndex, zoneIndex: zoneIndex });
    } else if (markerType === 'territoryZones') {
        // Find or create territory of the selected type
        const selectedType = newMarker.territoryType;
        let targetTerritoryIndex = -1;
        
        // First, try to find an existing territory of this type
        for (let i = 0; i < territories.length; i++) {
            if (territories[i].territory_type === selectedType) {
                targetTerritoryIndex = i;
                break;
            }
        }
        
        // If no territory of this type exists, we'll need to create one
        // For now, add the zone to a placeholder territory (will be created on save)
        if (targetTerritoryIndex < 0) {
            // Create a placeholder territory entry
            const colors = [
                '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
                '#FF8800', '#8800FF', '#00FF88', '#FF0088', '#88FF00', '#0088FF',
                '#FF4444', '#44FF44', '#4444FF', '#FFFF44', '#FF44FF', '#44FFFF'
            ];
            const typeNames = getAllTerritoryTypeNames();
            const typeIndex = typeNames.indexOf(selectedType);
            const color = colors[typeIndex % colors.length];
            
            // Create new territory entry
            const newTerritory = {
                id: territories.length,
                name: `${selectedType}_0`,
                territory_type: selectedType,
                color: color,
                zones: []
            };
            territories.push(newTerritory);
            targetTerritoryIndex = territories.length - 1;
        }
        
        // Add zone to the target territory
        const territory = territories[targetTerritoryIndex];
        const zoneIndex = territory.zones.length;
        newMarker.territoryIndex = targetTerritoryIndex;
        newMarker.zoneIndex = zoneIndex;
        
        // Add zone to territory
        territory.zones.push({
            id: zoneIndex,
            name: newMarker.name,
            x: newMarker.x,
            y: newMarker.y,
            z: newMarker.z,
            radius: newMarker.radius,
            xml: newMarker.xml
        });
        
        // Update zone color to match territory
        newMarker.color = territory.color;
        
        // Set mapping using the correct flattened index (newIndex)
        if (markerType.startsWith('territoryType_')) {
            const territoryType = markerType.replace('territoryType_', '');
            if (!territoryTypeZoneMaps[territoryType]) {
                territoryTypeZoneMaps[territoryType] = new Map();
            }
            territoryTypeZoneMaps[territoryType].set(newIndex, { territoryIndex: targetTerritoryIndex, zoneIndex: zoneIndex });
        } else {
            zoneToTerritoryMap.set(newIndex, { territoryIndex: targetTerritoryIndex, zoneIndex: zoneIndex });
        }
    }
    
    // Select the newly added marker
    typeConfig.selected.clear();
    typeConfig.selected.add(newIndex);
    markerEvents.emit('marker:selected', { markerType, index: newIndex });
    updateSelectedCount();
    requestDraw();
}

// Generic function to get marker at a point
function getMarkerAtPoint(markerType, screenX, screenY) {
    const typeConfig = markerTypes[markerType];
    if (!typeConfig || !editingEnabled[markerType] || !typeConfig.getShowFlag()) {
        return null;
    }
    
    const array = typeConfig.getArray();
    for (let index = 0; index < array.length; index++) {
        if (typeConfig.isDeleted(index)) continue;
        if (!isMarkerVisible(markerType, index)) continue; // Skip hidden markers
        
        const marker = typeConfig.getMarker(index);
        const screenPos = typeConfig.getScreenPos(marker);
        
        if (typeConfig.isPointOnMarker(marker, screenX, screenY, screenPos)) {
            return { index, marker };
        }
    }
    
    return null;
}

// Legacy function for backward compatibility
function getEffectAreaAtPoint(screenX, screenY) {
    return getMarkerAtPoint('effectAreas', screenX, screenY);
}

// Generic function to try starting radius editing
function tryStartRadiusEdit(markerType, screenX, screenY) {
    const typeConfig = markerTypes[markerType];
    if (!typeConfig || !editingEnabled[markerType] || !typeConfig.getShowFlag() || !typeConfig.canEditRadius) {
        return false;
    }
    
    const array = typeConfig.getArray();
    for (let index = 0; index < array.length; index++) {
        if (typeConfig.isDeleted(index)) continue;
        if (!typeConfig.selected.has(index)) continue;
        if (!isMarkerVisible(markerType, index)) continue; // Skip hidden markers
        
        const marker = typeConfig.getMarker(index);
        if (!marker || marker.radius === undefined) continue;
        
        const screenPos = typeConfig.getScreenPos(marker);
        const screenRadius = marker.radius * viewScale;
        
        // Check if clicking on the radius handle (right side of circle)
        const handleX = screenPos.x + screenRadius;
        const handleY = screenPos.y;
        const handleRadius = 6;
        
        const dx = handleX - screenX;
        const dy = handleY - screenY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < handleRadius + MARKER_INTERACTION_THRESHOLD) {
            // Start radius editing
            isEditingRadius = true;
            radiusEditMarkerType = markerType;
            radiusEditIndex = index;
            radiusEditStartRadius = marker.radius;
            dragStartX = screenX;
            dragStartY = screenY;
            
            // Store all selected markers for multi-marker radius editing
            radiusEditSelectedMarkers.clear();
            if (typeConfig.selected.size > 0) {
                // Store original positions for all selected markers
                for (const selectedIndex of typeConfig.selected) {
                    if (selectedIndex < array.length && !typeConfig.isDeleted(selectedIndex)) {
                        radiusEditSelectedMarkers.add(selectedIndex);
                        if (!typeConfig.originalPositions.has(selectedIndex)) {
                            const m = typeConfig.getMarker(selectedIndex);
                            typeConfig.originalPositions.set(selectedIndex, typeConfig.getOriginalData(m));
                        }
                    }
                }
            } else {
                // No selection - just edit this one marker
                radiusEditSelectedMarkers.add(index);
                if (!typeConfig.originalPositions.has(index)) {
                    typeConfig.originalPositions.set(index, typeConfig.getOriginalData(marker));
                }
            }
            
            return true;
        }
        
        // Also check if clicking near the edge of the circle (for radius editing)
        const dx2 = screenPos.x - screenX;
        const dy2 = screenPos.y - screenY;
        const distanceFromCenter = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        const distanceFromEdge = Math.abs(distanceFromCenter - screenRadius);
        
        if (distanceFromEdge < MARKER_INTERACTION_THRESHOLD && distanceFromCenter > screenRadius * 0.5) {
            // Clicking near edge - start radius editing
            isEditingRadius = true;
            radiusEditMarkerType = markerType;
            radiusEditIndex = index;
            radiusEditStartRadius = marker.radius;
            dragStartX = screenX;
            dragStartY = screenY;
            
            // Store all selected markers for multi-marker radius editing
            radiusEditSelectedMarkers.clear();
            if (typeConfig.selected.size > 0) {
                // Store original positions for all selected markers
                for (const selectedIndex of typeConfig.selected) {
                    if (selectedIndex < array.length && !typeConfig.isDeleted(selectedIndex)) {
                        radiusEditSelectedMarkers.add(selectedIndex);
                        if (!typeConfig.originalPositions.has(selectedIndex)) {
                            const m = typeConfig.getMarker(selectedIndex);
                            typeConfig.originalPositions.set(selectedIndex, typeConfig.getOriginalData(m));
                        }
                    }
                }
            } else {
                // No selection - just edit this one marker
                radiusEditSelectedMarkers.add(index);
                if (!typeConfig.originalPositions.has(index)) {
                    typeConfig.originalPositions.set(index, typeConfig.getOriginalData(marker));
                }
            }
            
            return true;
        }
    }
    
    return false;
}

// Try radius editing for any editable type
function tryStartRadiusEditAny(screenX, screenY) {
    for (const markerType of Object.keys(markerTypes)) {
        if (tryStartRadiusEdit(markerType, screenX, screenY)) {
            return true;
        }
    }
    return false;
}

// Generic function to try starting drag for radius-editable markers (checks center, not edge)
function tryStartDragRadiusEditable(markerType, screenX, screenY) {
    const typeConfig = markerTypes[markerType];
    if (!typeConfig || !editingEnabled[markerType] || !typeConfig.getShowFlag() || !typeConfig.canEditRadius) {
        return false;
    }
    
    const array = typeConfig.getArray();
    
    // Check if clicking on a selected marker center to drag
    if (typeConfig.selected.size > 0) {
        for (const index of typeConfig.selected) {
            if (index >= array.length || typeConfig.isDeleted(index)) continue;
            if (!isMarkerVisible(markerType, index)) continue; // Skip hidden markers
            
            const marker = typeConfig.getMarker(index);
            if (!marker || marker.radius === undefined) continue;
            
            const screenPos = typeConfig.getScreenPos(marker);
            const screenRadius = marker.radius * viewScale;
            
            const dx = screenPos.x - screenX;
            const dy = screenPos.y - screenY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Check if clicking on center (within small radius, not on edge)
            if (distance < Math.min(screenRadius * 0.3, 20) && distance < screenRadius - MARKER_INTERACTION_THRESHOLD) {
                // Start dragging
                isDragging = true;
                draggedMarkerType = markerType;
                draggedMarkerIndex = index;
                dragStartX = screenX;
                dragStartY = screenY;
                
                // Store original positions for all selected markers
                for (const selectedIndex of typeConfig.selected) {
                    if (!typeConfig.originalPositions.has(selectedIndex)) {
                        const m = typeConfig.getMarker(selectedIndex);
                        typeConfig.originalPositions.set(selectedIndex, typeConfig.getOriginalData(m));
                    }
                }
                
                // Store relative positions relative to the marker being dragged
                if (!draggedSelectedMarkers.has(markerType)) {
                    draggedSelectedMarkers.set(markerType, new Map());
                }
                const offsets = draggedSelectedMarkers.get(markerType);
                offsets.clear();
                // Use the actual marker position as the reference point
                const draggedMarkerX = marker.x;
                const draggedMarkerZ = marker.z;
                for (const selectedIndex of typeConfig.selected) {
                    const m = typeConfig.getMarker(selectedIndex);
                    offsets.set(selectedIndex, {
                        offsetX: m.x - draggedMarkerX,
                        offsetZ: m.z - draggedMarkerZ
                    });
                }
                
                // Store the actual marker position, not the click position
                dragStartWorldX = draggedMarkerX;
                dragStartWorldZ = draggedMarkerZ;
                
                return true;
            }
        }
    }
    
    // Check if clicking on any marker center
    for (let index = 0; index < array.length; index++) {
        if (typeConfig.isDeleted(index)) continue;
        if (!isMarkerVisible(markerType, index)) continue; // Skip hidden markers
        
        const marker = typeConfig.getMarker(index);
        if (!marker || marker.radius === undefined) continue;
        
        const screenPos = typeConfig.getScreenPos(marker);
        const screenRadius = (marker.radius || 50.0) * viewScale;
        
        const dx = screenPos.x - screenX;
        const dy = screenPos.y - screenY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check if clicking on center (within small radius)
        if (distance < Math.min(screenRadius * 0.3, 20)) {
            // Start dragging
            isDragging = true;
            draggedMarkerType = markerType;
            draggedMarkerIndex = index;
            dragStartX = screenX;
            dragStartY = screenY;
            
            const clickedWorld = screenToWorld(screenX, screenY);
            dragStartWorldX = clickedWorld.x;
            dragStartWorldZ = clickedWorld.z;
            
            if (!typeConfig.originalPositions.has(index)) {
                typeConfig.originalPositions.set(index, typeConfig.getOriginalData(marker));
            }
            
            // Select this marker
            typeConfig.selected.clear();
            typeConfig.selected.add(index);
            updateSelectedCount();
            
            return true;
        }
    }
    
    return false;
}

// Legacy function for backward compatibility
function tryStartDragEffectArea(screenX, screenY) {
    return tryStartDragRadiusEditable('effectAreas', screenX, screenY);
}

// Legacy function names for backward compatibility
function addSpawnPointAt(screenX, screenY) {
    addMarkerAt('playerSpawnPoints', screenX, screenY);
}

function addEffectAreaAt(screenX, screenY) {
    addMarkerAt('effectAreas', screenX, screenY);
}

function deleteSelectedSpawnPoints() {
    deleteSelectedMarkers('playerSpawnPoints');
}

function deleteSelectedEffectAreas() {
    deleteSelectedMarkers('effectAreas');
}

// Generic function to save marker changes
async function saveMarkerChanges(markerType) {
    const typeConfig = markerTypes[markerType];
    if (!typeConfig) {
        return { success: false, message: 'Unknown marker type' };
    }
    
    // Check if there are any changes (modified, deleted, or new)
    const hasChanges = typeConfig.originalPositions.size > 0 || 
                      typeConfig.deleted.size > 0 || 
                      typeConfig.new.size > 0;
    
    if (!hasChanges) {
        return { success: true, message: 'No changes to save' };
    }
    
    try {
        const array = typeConfig.getArray();
        
        // Special handling for territory zones - need to update territories first
        const isTerritoryTypeMarker = markerType.startsWith('territoryType_');
        if (markerType === 'territoryZones') {
            // Update territories from flattened zones before saving
            updateTerritoriesFromZones();
        } else if (markerType === 'zombieTerritoryZones') {
            // Update zombie territories from flattened zones before saving
            updateZombieTerritoriesFromZones();
        } else if (isTerritoryTypeMarker) {
            // Update territories from zones for this specific territory type
            const territoryType = markerType.replace('territoryType_', '');
            updateTerritoriesFromZonesForType(territoryType);
        }
        
        // Prepare data for save - only include markers that have changes
        // For territory zones, we need to track which territories have changes
        const markerData = [];
        const deletedIndices = Array.from(typeConfig.deleted);
        const newIndices = Array.from(typeConfig.new);
        const modifiedIndices = Array.from(typeConfig.originalPositions.keys());
        
        if (markerType === 'territoryZones' || isTerritoryTypeMarker) {
            // Only include zones that are modified, deleted, or new
            const allChangedIndices = new Set([...deletedIndices, ...newIndices, ...modifiedIndices]);
            allChangedIndices.forEach(idx => {
                if (idx < array.length) {
                    markerData.push(typeConfig.prepareSaveData(array[idx], idx));
                }
            });
        } else {
            // For other types, include all markers (they handle filtering on backend)
            markerData.push(...array.map((marker, idx) => typeConfig.prepareSaveData(marker, idx)));
        }
        
        // Determine the data key name based on marker type
        let dataKey = 'markers';
        if (markerType === 'playerSpawnPoints') {
            dataKey = 'spawn_points';
        } else if (markerType === 'effectAreas') {
            dataKey = 'effect_areas';
        } else if (markerType === 'territoryZones' || isTerritoryTypeMarker) {
            dataKey = 'zones';
        }
        
        const requestBody = {
            mission_dir: missionDir,
            [dataKey]: markerData,
            deleted_indices: deletedIndices,
            new_indices: newIndices
        };
        
        // For territory zones, also send territories structure
        if (markerType === 'territoryZones' || isTerritoryTypeMarker) {
            requestBody.territories = territories.map(t => ({
                id: t.id,
                name: t.name,
                territory_type: t.territory_type,
                color: t.color
            }));
        }
        
        const response = await fetch(typeConfig.saveEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Remove deleted markers from array (they were already removed from file)
            const indicesToRemove = Array.from(typeConfig.deleted).sort((a, b) => b - a);
            for (const index of indicesToRemove) {
                array.splice(index, 1);
                // Also remove from zoneToTerritoryMap
                if (markerType === 'territoryZones') {
                    zoneToTerritoryMap.delete(index);
                    // Update remaining indices in map
                    const newMap = new Map();
                    zoneToTerritoryMap.forEach((value, key) => {
                        if (key < index) {
                            newMap.set(key, value);
                        } else if (key > index) {
                            newMap.set(key - 1, value);
                        }
                    });
                    zoneToTerritoryMap = newMap;
                }
            }
            
            // Clear all tracking after successful save
            typeConfig.originalPositions.clear();
            typeConfig.deleted.clear();
            typeConfig.new.clear();
            
            // Re-index markers
            array.forEach((marker, idx) => {
                marker.id = idx;
            });
            
            // For territory zones, update the local structure instead of reloading
            // (reloading would overwrite any unsaved changes in other marker types)
            if (markerType === 'territoryZones') {
                // Update territories from the current state of territoryZones
                updateTerritoriesFromZones();
                // Re-flatten to ensure consistency
                flattenTerritoryZones();
            } else if (isTerritoryTypeMarker) {
                // Update territories from zones for this specific territory type
                const territoryType = markerType.replace('territoryType_', '');
                updateTerritoriesFromZonesForType(territoryType);
                // Re-flatten to ensure consistency (this will update all territory type arrays)
                flattenTerritoryZones();
            }
            
            // Emit event
            markerEvents.emit('marker:changes:saved', { markerType });
            
            return { success: true, message: `Saved changes to ${typeConfig.getDisplayName()}` };
        } else {
            return { success: false, message: data.error || 'Failed to save' };
        }
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// Generic function to restore marker positions
function restoreMarkerPositions(markerType) {
    const typeConfig = markerTypes[markerType];
    if (!typeConfig) return;
    
    const array = typeConfig.getArray();
    
    // For territory zones, we need to handle the nested structure
    const isTerritoryTypeMarker = markerType.startsWith('territoryType_');
    if (markerType === 'territoryZones' || markerType === 'zombieTerritoryZones' || isTerritoryTypeMarker) {
        // Remove newly added markers from both flattened array and territories array
        const newIndices = Array.from(typeConfig.new).sort((a, b) => b - a);
        for (const index of newIndices) {
            const marker = typeConfig.getMarker(index);
            if (marker) {
                // Remove from territories array if it was added there
                const mapEntry = (markerType === 'territoryZones' ? zoneToTerritoryMap : zombieZoneToTerritoryMap).get(index);
                if (mapEntry) {
                    const { territoryIndex, zoneIndex } = mapEntry;
                    if (territoryIndex >= 0 && territoryIndex < territories.length &&
                        zoneIndex >= 0 && zoneIndex < territories[territoryIndex].zones.length) {
                        territories[territoryIndex].zones.splice(zoneIndex, 1);
                    }
                }
            }
            array.splice(index, 1);
        }
        
        // Restore positions of modified markers (including deleted ones)
        typeConfig.originalPositions.forEach((original, index) => {
            if (index < array.length) {
                const marker = typeConfig.getMarker(index);
                if (marker) {
                    typeConfig.restoreOriginal(marker, original);
                    // Sync back to territories array
                    if (markerType === 'territoryZones') {
                        syncTerritoryZoneToTerritories(index);
                    } else if (isTerritoryTypeMarker) {
                        const territoryType = markerType.replace('territoryType_', '');
                        const mapEntry = territoryTypeZoneMaps[territoryType]?.get(index);
                        if (mapEntry) {
                            const { territoryIndex, zoneIndex } = mapEntry;
                            if (territoryIndex >= 0 && territoryIndex < territories.length &&
                                zoneIndex >= 0 && zoneIndex < territories[territoryIndex].zones.length) {
                                const territoryZone = territories[territoryIndex].zones[zoneIndex];
                                territoryZone.x = marker.x;
                                territoryZone.y = marker.y;
                                territoryZone.z = marker.z;
                                territoryZone.radius = marker.radius;
                                territoryZone.xml = marker.xml || `<zone x="${marker.x}" z="${marker.z}" r="${marker.radius}"/>`;
                            }
                        }
                    } else {
                        syncZombieTerritoryZoneToTerritories(index);
                    }
                }
            }
        });
        
        // Rebuild mappings after removing new markers
        if (markerType === 'territoryZones' || isTerritoryTypeMarker) {
            flattenTerritoryZones();
        } else {
            // For zombie territories, we need to rebuild the flattened array
            zombieTerritoryZones = [];
            zombieZoneToTerritoryMap.clear();
            territories.forEach((territory, territoryIndex) => {
                if (isZombieTerritoryType(territory.territory_type)) {
                    territory.zones.forEach((zone, zoneIndex) => {
                        const flattenedIndex = zombieTerritoryZones.length;
                        const zoneCopy = {
                            ...zone,
                            territoryIndex: territoryIndex,
                            zoneIndex: zoneIndex,
                            territoryType: territory.territory_type,
                            color: territory.color,
                            territoryName: territory.name
                        };
                        zombieTerritoryZones.push(zoneCopy);
                        zombieZoneToTerritoryMap.set(flattenedIndex, { territoryIndex, zoneIndex });
                    });
                }
            });
        }
    } else {
        // For non-territory markers, restore normally
        // Restore positions of modified markers (including deleted ones)
        typeConfig.originalPositions.forEach((original, index) => {
            if (index < array.length) {
                const marker = typeConfig.getMarker(index);
                if (marker) {
                    typeConfig.restoreOriginal(marker, original);
                }
            }
        });
        
        // Remove newly added markers
        const newIndices = Array.from(typeConfig.new).sort((a, b) => b - a);
        for (const index of newIndices) {
            array.splice(index, 1);
        }
    }
    
    // Clear all tracking
    typeConfig.originalPositions.clear();
    typeConfig.deleted.clear();
    typeConfig.new.clear();
    typeConfig.selected.clear();
    
    // Re-index markers
    array.forEach((marker, idx) => {
        marker.id = idx;
    });
    
    // Emit event
    markerEvents.emit('marker:changes:discarded', { markerType });
    
    // Update UI
    updateSelectedCount();
    requestDraw();
    draw(); // Force immediate redraw
}

// Handle editing toggle change
async function handleEditingToggle(markerType, enabled) {
    const typeConfig = markerTypes[markerType];
    if (!typeConfig) return;
    
    // If enabling, first disable all other types
    if (enabled) {
        // Disable all other marker types
        for (const otherType of Object.keys(markerTypes)) {
            if (otherType !== markerType && editingEnabled[otherType]) {
                // Check for unsaved changes before disabling
                const otherTypeConfig = markerTypes[otherType];
                if (otherTypeConfig) {
                    const hasChanges = otherTypeConfig.originalPositions.size > 0 || 
                                      otherTypeConfig.deleted.size > 0 || 
                                      otherTypeConfig.new.size > 0;
                    if (hasChanges) {
                        const discard = confirm(`You have unsaved changes for ${otherTypeConfig.getDisplayName()}. Discard them?`);
                        if (discard) {
                            restoreMarkerPositions(otherType);
                            selectionManager.clearSelectionsForType(otherType);
                        } else {
                            // User wants to keep changes - don't enable new type
                            // Update dropdown to reflect current state
                            const select = document.getElementById('editMarkerTypeSelect');
                            if (select) {
                                select.value = otherType;
                            }
                            return;
                        }
                    }
                }
                editingEnabled[otherType] = false;
                selectionManager.clearSelectionsForType(otherType);
                if (editControlsManager) {
                    editControlsManager.hideControls(otherType);
                }
                // Don't disable the filter when switching types - just update checkbox state
                // The filter will be updated to the new type below
                const otherFilterCheckbox = document.getElementById(`filterToType_${otherType}`);
                if (otherFilterCheckbox) {
                    otherFilterCheckbox.checked = false;
                }
            }
        }
        // Also clear regular markers
        selectionManager.clearSelectionsForType('regular');
    }
    
    editingEnabled[markerType] = enabled;
    
    // When enabling editing, ensure the marker type is visible
    if (enabled) {
        // Unhide the marker type if it's currently hidden
        if (markerType === 'playerSpawnPoints' && !showPlayerSpawnPoints) {
            showPlayerSpawnPoints = true;
            updateVisibilityCheckboxes();
        } else if (markerType === 'effectAreas' && !showEffectAreas) {
            showEffectAreas = true;
            updateVisibilityCheckboxes();
        } else if ((markerType === 'zombieTerritoryZones' || markerType.startsWith('territoryType_')) && !showTerritories) {
            showTerritories = true;
            updateVisibilityCheckboxes();
        }
    }
    
    // When disabling editing, clear selection for this type
    if (!enabled) {
        selectionManager.clearSelectionsForType(markerType);
    }
    
    // Show/hide edit controls using EditControlsManager
    if (editControlsManager) {
        if (enabled) {
            // If filter is currently enabled for a different type, update it to this type
            if (filterCheckboxEnabled && isFilteredToSingleType && filteredMarkerType !== markerType) {
                // Update filter to new type without disabling it first
                handleFilterToSingleType(markerType, true);
            }
            
            // Show controls for this type and hide all others
            editControlsManager.showControlsForType(markerType);
            
            // Use setTimeout to ensure the controls are visible before accessing the checkbox
            setTimeout(() => {
                // Update filter checkbox state to reflect global preference
                const filterCheckbox = document.getElementById(`filterToType_${markerType}`);
                if (filterCheckbox) {
                    filterCheckbox.checked = filterCheckboxEnabled;
                    // If filter is enabled but not yet applied to this type, apply it
                    if (filterCheckboxEnabled && (!isFilteredToSingleType || filteredMarkerType !== markerType)) {
                        handleFilterToSingleType(markerType, true);
                    }
                }
            }, 0);
        } else {
            editControlsManager.hideControls(markerType);
            // Only disable filter if user explicitly disabled editing AND filter is not enabled globally
            // When switching types, we don't want to disable the filter
            if (filteredMarkerType === markerType && isFilteredToSingleType && !filterCheckboxEnabled) {
                // User explicitly unchecked the filter, so disable it
                handleFilterToSingleType(markerType, false);
            }
            // Update checkbox state (uncheck it)
            const filterCheckbox = document.getElementById(`filterToType_${markerType}`);
            if (filterCheckbox) {
                filterCheckbox.checked = false;
            }
        }
    }
    
    // Update canvas cursor style
    const anyEditingEnabled = Object.values(editingEnabled).some(v => v === true);
    if (anyEditingEnabled) {
        canvas.classList.add('editing-enabled');
    } else {
        canvas.classList.remove('editing-enabled');
    }
    
    // Update dropdown to reflect current state
    const select = document.getElementById('editMarkerTypeSelect');
    if (select) {
        if (enabled) {
            select.value = markerType;
        } else {
            // Check if any other type is enabled
            const anyOtherEnabled = Object.keys(markerTypes).some(type => 
                type !== markerType && editingEnabled[type]
            );
            if (!anyOtherEnabled) {
                select.value = '';
            }
        }
    }
    
    if (!enabled) {
        // Check if there are unsaved changes
        const hasChanges = typeConfig.originalPositions.size > 0 || 
                          typeConfig.deleted.size > 0 || 
                          typeConfig.new.size > 0;
        
        if (hasChanges) {
            const discard = confirm('You have unsaved changes. Discard them?');
            if (discard) {
                // Restore original positions
                restoreMarkerPositions(markerType);
                // Clear selection after restore
                selectionManager.clearSelectionsForType(markerType);
            } else {
                // User wants to keep changes - re-enable editing
                editingEnabled[markerType] = true;
                const select = document.getElementById('editMarkerTypeSelect');
                if (select) select.value = markerType;
                // Re-add cursor class since we're keeping editing enabled
                canvas.classList.add('editing-enabled');
                if (editControlsManager) {
                    editControlsManager.showControlsForType(markerType);
                }
                return;
            }
        } else {
            // No changes, but clear selection when disabling editing
            selectionManager.clearSelectionsForType(markerType);
        }
        
        // Update display after clearing selection
        updateSelectedCount();
        draw();
    }
}

// Handle filtering to show only a single marker type
function handleFilterToSingleType(markerType, enabled) {
    const typeConfig = markerTypes[markerType];
    if (!typeConfig) return;
    
    if (enabled) {
        // Only save visibility state if we're not already filtering (to preserve original state)
        // This allows us to switch between types while filtering without losing the original state
        if (!isFilteredToSingleType) {
            previousVisibilityState = {
                showMarkers: showMarkers,
                showEventSpawns: showEventSpawns,
                showTerritories: showTerritories,
                showEffectAreas: showEffectAreas,
                showPlayerSpawnPoints: showPlayerSpawnPoints,
                activeTerritoryFilters: JSON.parse(JSON.stringify(activeTerritoryFilters)) // Deep copy
            };
        }
        isFilteredToSingleType = true;
        filteredMarkerType = markerType;
        filterCheckboxEnabled = true; // Track that filter is enabled
        
        // Handle territory type-specific filtering
        if (markerType.startsWith('territoryType_')) {
            const territoryType = markerType.replace('territoryType_', '');
            // Clear existing territory filters
            activeTerritoryFilters = [];
            // Add filter for this specific territory type
            activeTerritoryFilters.push({
                type: 'territoryType',
                criteria: 'isOneOf',
                values: [territoryType],
                inverted: false
            });
            showTerritories = true;
            // Hide all other marker types
            showMarkers = false;
            showEventSpawns = false;
            showEffectAreas = false;
            showPlayerSpawnPoints = false;
        } else if (markerType === 'zombieTerritoryZones') {
            // For zombie territories, filter to show only zombie territory types
            activeTerritoryFilters = [];
            // Get all zombie territory types
            const zombieTypes = new Set();
            territories.forEach(territory => {
                if (isZombieTerritoryType(territory.territory_type)) {
                    zombieTypes.add(territory.territory_type);
                }
            });
            if (zombieTypes.size > 0) {
                activeTerritoryFilters.push({
                    type: 'territoryType',
                    criteria: 'isOneOf',
                    values: Array.from(zombieTypes),
                    inverted: false
                });
            }
            showTerritories = true;
            // Hide all other marker types
            showMarkers = false;
            showEventSpawns = false;
            showEffectAreas = false;
            showPlayerSpawnPoints = false;
        } else {
            // For non-territory marker types, use show flags
            // Determine which show flag to set based on marker type
            if (markerType === 'playerSpawnPoints') {
                showPlayerSpawnPoints = true;
            } else if (markerType === 'effectAreas') {
                showEffectAreas = true;
            }
            
            // Hide all other marker types
            showMarkers = false;
            showEventSpawns = false;
            showTerritories = false;
            
            // Hide other marker types based on what the current type is
            if (markerType !== 'playerSpawnPoints') {
                showPlayerSpawnPoints = false;
            }
            if (markerType !== 'effectAreas') {
                showEffectAreas = false;
            }
        }
        
        // Apply filters (this will update visibleTerritories for territory types)
        applyFilters();
        
        // Update UI checkboxes
        updateVisibilityCheckboxes();
        
        // Update territory filter UI
        updateTerritoryFilterUI();
        
        // Redraw
        draw();
    } else {
        // Restore previous visibility state only if we're actually disabling the filter
        // (not just switching types)
        showMarkers = previousVisibilityState.showMarkers;
        showEventSpawns = previousVisibilityState.showEventSpawns;
        showTerritories = previousVisibilityState.showTerritories;
        showEffectAreas = previousVisibilityState.showEffectAreas;
        showPlayerSpawnPoints = previousVisibilityState.showPlayerSpawnPoints;
        activeTerritoryFilters = JSON.parse(JSON.stringify(previousVisibilityState.activeTerritoryFilters)); // Deep copy
        isFilteredToSingleType = false;
        filteredMarkerType = null;
        filterCheckboxEnabled = false; // Track that filter is disabled
        
        // Apply filters to restore territory visibility
        applyFilters();
        
        // Update UI checkboxes
        updateVisibilityCheckboxes();
        
        // Update territory filter UI
        updateTerritoryFilterUI();
        
        // Redraw
        draw();
    }
}

// Update visibility checkboxes in the UI to reflect current state
function updateVisibilityCheckboxes() {
    const showMarkersCheckbox = document.getElementById('showMarkers');
    if (showMarkersCheckbox) {
        showMarkersCheckbox.checked = showMarkers;
    }
    
    const showEventSpawnsCheckbox = document.getElementById('showEventSpawns');
    if (showEventSpawnsCheckbox) {
        showEventSpawnsCheckbox.checked = showEventSpawns;
    }
    
    const showTerritoriesCheckbox = document.getElementById('showTerritories');
    if (showTerritoriesCheckbox) {
        showTerritoriesCheckbox.checked = showTerritories;
    }
    
    const showEffectAreasCheckbox = document.getElementById('showEffectAreas');
    if (showEffectAreasCheckbox) {
        showEffectAreasCheckbox.checked = showEffectAreas;
    }
    
    const showPlayerSpawnPointsCheckbox = document.getElementById('showPlayerSpawnPoints');
    if (showPlayerSpawnPointsCheckbox) {
        showPlayerSpawnPointsCheckbox.checked = showPlayerSpawnPoints;
    }
}

// Update selected count display
function updateSelectedCount() {
    // Clean up hidden selections before counting
    selectionManager.cleanupHiddenSelections();
    
    let count = selectedMarkers.size;
    // Add counts from all editable marker types
    for (const markerType of Object.keys(markerTypes)) {
        if (editingEnabled[markerType]) {
            count += markerTypes[markerType].selected.size;
        }
    }
    document.getElementById('selectedCount').textContent = `Selected: ${count}`;
}

// Clear all selected markers
function clearSelection() {
    selectionManager.clearAllSelections();
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

// Create marker type configuration for a specific territory type
function createTerritoryTypeMarkerType(territoryType) {
    const typeKey = `territoryType_${territoryType}`;
    
    // Initialize arrays if they don't exist
    if (!territoryTypeZones[territoryType]) {
        territoryTypeZones[territoryType] = [];
    }
    if (!territoryTypeZoneMaps[territoryType]) {
        territoryTypeZoneMaps[territoryType] = new Map();
    }
    
    // Create marker type configuration
    const markerType = {
        getArray: () => territoryTypeZones[territoryType],
        setArray: (arr) => { 
            territoryTypeZones[territoryType] = arr;
            // Update territories from flattened zones for this type
            updateTerritoriesFromZonesForType(territoryType);
        },
        getShowFlag: () => showTerritories,
        canEditRadius: true,
        canEditDimensions: false,
        saveEndpoint: '/api/territories/save',
        getDisplayName: () => `Territory Zones (${territoryType})`,
        getEditControlsId: () => `territoryType_${territoryType}_EditControls`,
        getEditCheckboxId: () => `editTerritoryType_${territoryType}`,
        getMarker: (index) => territoryTypeZones[territoryType][index],
        isDeleted: (index) => markerType.deleted.has(index),
        getScreenPos: (marker) => worldToScreen(marker.x, marker.z),
        isPointOnMarker: (marker, screenX, screenY, screenPos) => {
            const screenRadius = (marker.radius || 50.0) * viewScale;
            const dx = screenPos.x - screenX;
            const dy = screenPos.y - screenY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= screenRadius + MARKER_INTERACTION_THRESHOLD;
        },
        createNew: (x, y, z) => {
            // Find territory of this type
            let defaultRadius = 50.0;
            let territoryColor = '#FF0000';
            let territoryIndex = -1;
            
            // Find first territory of this type
            for (let i = 0; i < territories.length; i++) {
                if (territories[i].territory_type === territoryType) {
                    territoryIndex = i;
                    territoryColor = territories[i].color;
                    if (territories[i].zones.length > 0) {
                        defaultRadius = territories[i].zones[0].radius || 50.0;
                    }
                    break;
                }
            }
            
            // If no territory of this type exists, we'll create one when saving
            if (territoryIndex < 0) {
                territoryIndex = 0; // Placeholder - will be created on save
                const typeNames = getAllTerritoryTypeNames();
                const typeIndex = typeNames.indexOf(territoryType);
                const colors = [
                    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
                    '#FF8800', '#8800FF', '#00FF88', '#FF0088', '#88FF00', '#0088FF',
                    '#FF4444', '#44FF44', '#4444FF', '#FFFF44', '#FF44FF', '#44FFFF'
                ];
                territoryColor = colors[typeIndex % colors.length];
            }
            
            // Create new zone
            const newZone = {
                id: territoryTypeZones[territoryType].length,
                name: `Zone_${territoryTypeZones[territoryType].length}`,
                x: x,
                y: y,
                z: z,
                radius: defaultRadius,
                territoryIndex: territoryIndex,
                zoneIndex: -1, // Will be set when added to territory
                territoryType: territoryType,
                color: territoryColor,
                xml: `<zone x="${x}" z="${z}" r="${defaultRadius}"/>`
            };
            
            return newZone;
        },
        getOriginalData: (marker) => ({ 
            x: marker.x, 
            y: marker.y, 
            z: marker.z, 
            radius: marker.radius || 50.0 
        }),
        restoreOriginal: (marker, original) => {
            marker.x = original.x;
            marker.y = original.y;
            marker.z = original.z;
            marker.radius = original.radius;
        },
        prepareSaveData: (marker, index) => {
            const mapEntry = territoryTypeZoneMaps[territoryType].get(index);
            return {
                index: index,
                territoryType: marker.territoryType,
                territoryIndex: mapEntry ? mapEntry.territoryIndex : marker.territoryIndex,
                zoneIndex: mapEntry ? mapEntry.zoneIndex : marker.zoneIndex,
                name: marker.name || `Zone_${index}`,
                x: marker.x != null ? marker.x : 0,
                y: marker.y != null ? marker.y : 0,
                z: marker.z != null ? marker.z : 0,
                radius: marker.radius != null ? marker.radius : 50.0,
                isNew: markerType.new.has(index),
                isDeleted: markerType.deleted.has(index)
            };
        },
        getTooltipLines: (marker) => {
            const lines = [];
            lines.push(marker.name || '(Unnamed)');
            lines.push('');
            if (marker.x !== undefined && marker.y !== undefined && marker.z !== undefined) {
                lines.push(`X: ${marker.x.toFixed(2)} m`);
                lines.push(`Y: ${marker.y.toFixed(2)} m`);
                lines.push(`Z: ${marker.z.toFixed(2)} m`);
            }
            if (marker.radius !== undefined) {
                lines.push('');
                lines.push(`Radius: ${marker.radius.toFixed(2)} m`);
            }
            lines.push('');
            lines.push(`Territory Type: ${territoryType}`);
            return lines;
        },
        selected: new Set(),
        deleted: new Set(),
        new: new Set(),
        originalPositions: new Map(),
        uiConfig: {
            showDiscardButton: true,
            customControls: []
        }
    };
    
    return markerType;
}

// Update territories from zones for a specific territory type
function updateTerritoriesFromZonesForType(territoryType) {
    // Rebuild territories from flattened zones for this type
    const territoryMap = new Map(); // Map<territoryIndex, {territory, zones}>
    
    territoryTypeZones[territoryType].forEach((zone, flattenedIndex) => {
        if (markerTypes[`territoryType_${territoryType}`].deleted.has(flattenedIndex)) {
            return; // Skip deleted zones
        }
        
        const mapEntry = territoryTypeZoneMaps[territoryType].get(flattenedIndex);
        const territoryIndex = mapEntry ? mapEntry.territoryIndex : zone.territoryIndex;
        
        if (!territoryMap.has(territoryIndex)) {
            if (territoryIndex < territories.length) {
                const originalTerritory = territories[territoryIndex];
                territoryMap.set(territoryIndex, {
                    territory: { ...originalTerritory },
                    zones: []
                });
            }
        }
        
        const entry = territoryMap.get(territoryIndex);
        if (entry) {
            const zoneCopy = {
                id: entry.zones.length,
                name: zone.name,
                x: zone.x,
                y: zone.y,
                z: zone.z,
                radius: zone.radius,
                xml: zone.xml || `<zone x="${zone.x}" z="${zone.z}" r="${zone.radius}"/>`
            };
            entry.zones.push(zoneCopy);
        }
    });
    
    // Update territories array
    territoryMap.forEach((entry, territoryIndex) => {
        if (territoryIndex < territories.length && territories[territoryIndex].territory_type === territoryType) {
            territories[territoryIndex].zones = entry.zones;
        }
    });
}

// Flatten zones from territories into arrays per territory type
function flattenTerritoryZones() {
    // Clear all existing arrays
    territoryZones = [];
    zoneToTerritoryMap.clear();
    zombieTerritoryZones = [];
    zombieZoneToTerritoryMap.clear();
    territoryTypeZones = {};
    territoryTypeZoneMaps = {};
    territoryTypeMarkerTypes = {};
    
    // Get all unique territory types
    const typeNames = getAllTerritoryTypeNames();
    
    // Initialize arrays and create marker types for each territory type
    typeNames.forEach(territoryType => {
        territoryTypeZones[territoryType] = [];
        territoryTypeZoneMaps[territoryType] = new Map();
        
        // Create marker type for this territory type
        const markerType = createTerritoryTypeMarkerType(territoryType);
        const typeKey = `territoryType_${territoryType}`;
        territoryTypeMarkerTypes[territoryType] = markerType;
        markerTypes[typeKey] = markerType;
    });
    
    // Populate arrays by territory type
    territories.forEach((territory, territoryIndex) => {
        const isZombieTerritory = isZombieTerritoryType(territory.territory_type);
        const territoryType = territory.territory_type;
        
        territory.zones.forEach((zone, zoneIndex) => {
            // Create a copy of the zone with territory metadata
            const zoneCopy = {
                ...zone,
                territoryIndex: territoryIndex,
                zoneIndex: zoneIndex,
                territoryType: territoryType,
                color: territory.color,
                territoryName: territory.name
            };
            
            // Add to territory type-specific array
            if (territoryTypeZones[territoryType]) {
                const flattenedIndex = territoryTypeZones[territoryType].length;
                territoryTypeZones[territoryType].push(zoneCopy);
                territoryTypeZoneMaps[territoryType].set(flattenedIndex, { territoryIndex, zoneIndex });
            }
            
            // Also maintain legacy arrays for compatibility
            const flattenedIndex = isZombieTerritory ? zombieTerritoryZones.length : territoryZones.length;
            if (isZombieTerritory) {
                zombieTerritoryZones.push(zoneCopy);
                zombieZoneToTerritoryMap.set(flattenedIndex, { territoryIndex, zoneIndex });
            } else {
                territoryZones.push(zoneCopy);
                zoneToTerritoryMap.set(flattenedIndex, { territoryIndex, zoneIndex });
            }
        });
    });
}

// Check if a territory type is a zombie territory
function isZombieTerritoryType(territoryType) {
    if (!territoryType) return false;
    const typeLower = territoryType.toLowerCase();
    return typeLower === 'infected' || typeLower === 'zombie' || 
           typeLower.includes('zombie') || typeLower.includes('infected');
}

// Sync a single territory zone back to territories array
function syncTerritoryZoneToTerritories(flattenedIndex) {
    if (flattenedIndex < 0 || flattenedIndex >= territoryZones.length) {
        return;
    }
    
    const zone = territoryZones[flattenedIndex];
    const mapEntry = zoneToTerritoryMap.get(flattenedIndex);
    
    if (!mapEntry) {
        return;
    }
    
    const { territoryIndex, zoneIndex } = mapEntry;
    
    if (territoryIndex >= 0 && territoryIndex < territories.length &&
        zoneIndex >= 0 && zoneIndex < territories[territoryIndex].zones.length) {
        // Update the zone in the territories array
        const territoryZone = territories[territoryIndex].zones[zoneIndex];
        territoryZone.x = zone.x;
        territoryZone.y = zone.y;
        territoryZone.z = zone.z;
        territoryZone.radius = zone.radius;
        territoryZone.xml = zone.xml || `<zone x="${zone.x}" z="${zone.z}" r="${zone.radius}"/>`;
    }
}

// Sync a single zombie territory zone back to territories array
function syncZombieTerritoryZoneToTerritories(flattenedIndex) {
    if (flattenedIndex < 0 || flattenedIndex >= zombieTerritoryZones.length) {
        return;
    }
    
    const zone = zombieTerritoryZones[flattenedIndex];
    const mapEntry = zombieZoneToTerritoryMap.get(flattenedIndex);
    
    if (!mapEntry) {
        return;
    }
    
    const { territoryIndex, zoneIndex } = mapEntry;
    
    if (territoryIndex >= 0 && territoryIndex < territories.length &&
        zoneIndex >= 0 && zoneIndex < territories[territoryIndex].zones.length) {
        // Update the zone in the territories array
        const territoryZone = territories[territoryIndex].zones[zoneIndex];
        territoryZone.x = zone.x;
        territoryZone.y = zone.y;
        territoryZone.z = zone.z;
        territoryZone.radius = zone.radius;
        territoryZone.xml = zone.xml || `<zone x="${zone.x}" z="${zone.z}" r="${zone.radius}"/>`;
    }
}

// Update territories from flattened zones (after editing)
function updateTerritoriesFromZones() {
    // Rebuild territories from flattened zones
    const territoryMap = new Map(); // Map<territoryIndex, {territory, zones}>
    
    territoryZones.forEach((zone, flattenedIndex) => {
        if (markerTypes.territoryZones.deleted.has(flattenedIndex)) {
            return; // Skip deleted zones
        }
        
        const mapEntry = zoneToTerritoryMap.get(flattenedIndex);
        const territoryIndex = mapEntry ? mapEntry.territoryIndex : zone.territoryIndex;
        
        if (!territoryMap.has(territoryIndex)) {
            // Get original territory structure
            if (territoryIndex < territories.length) {
                const originalTerritory = territories[territoryIndex];
                territoryMap.set(territoryIndex, {
                    territory: { ...originalTerritory },
                    zones: []
                });
            }
        }
        
        const entry = territoryMap.get(territoryIndex);
        if (entry) {
            // Create zone copy without metadata
            const zoneCopy = {
                id: entry.zones.length,
                name: zone.name,
                x: zone.x,
                y: zone.y,
                z: zone.z,
                radius: zone.radius,
                xml: zone.xml || `<zone x="${zone.x}" z="${zone.z}" r="${zone.radius}"/>`
            };
            entry.zones.push(zoneCopy);
        }
    });
    
    // Update territories array
    territoryMap.forEach((entry, territoryIndex) => {
        if (territoryIndex < territories.length) {
            territories[territoryIndex].zones = entry.zones;
        }
    });
}

// Update zombie territories from flattened zones (after editing)
function updateZombieTerritoriesFromZones() {
    // Rebuild zombie territories from flattened zones
    const territoryMap = new Map(); // Map<territoryIndex, {territory, zones}>
    
    zombieTerritoryZones.forEach((zone, flattenedIndex) => {
        if (markerTypes.zombieTerritoryZones.deleted.has(flattenedIndex)) {
            return; // Skip deleted zones
        }
        
        const mapEntry = zombieZoneToTerritoryMap.get(flattenedIndex);
        const territoryIndex = mapEntry ? mapEntry.territoryIndex : zone.territoryIndex;
        
        if (!territoryMap.has(territoryIndex)) {
            // Get original territory structure
            if (territoryIndex < territories.length) {
                const originalTerritory = territories[territoryIndex];
                territoryMap.set(territoryIndex, {
                    territory: { ...originalTerritory },
                    zones: []
                });
            }
        }
        
        const entry = territoryMap.get(territoryIndex);
        if (entry) {
            // Create zone copy without metadata
            const zoneCopy = {
                id: entry.zones.length,
                name: zone.name,
                x: zone.x,
                y: zone.y,
                z: zone.z,
                radius: zone.radius,
                xml: zone.xml || `<zone x="${zone.x}" z="${zone.z}" r="${zone.radius}"/>`
            };
            entry.zones.push(zoneCopy);
        }
    });
    
    // Update territories array
    territoryMap.forEach((entry, territoryIndex) => {
        if (territoryIndex < territories.length) {
            territories[territoryIndex].zones = entry.zones;
        }
    });
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
            // Flatten zones for editing (creates territory type-specific arrays)
            flattenTerritoryZones();
            // Update UI to include territory type-specific edit checkboxes
            updateTerritoryTypeEditUI();
            // Populate territory type selector for editing (legacy - for old territoryZones)
            populateTerritoryTypeSelector();
            // Also update the selector in EditControlsManager if it exists
            updateTerritoryTypeSelectorOptions();
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
            territoryZones = [];
            zoneToTerritoryMap.clear();
            // Still show the filter section even on error
            const territoryFilterSection = document.getElementById('territoryFilterSection');
            if (territoryFilterSection) {
                territoryFilterSection.style.display = 'block';
            }
        }
    } catch (error) {
        territories = [];
        territoryZones = [];
        zoneToTerritoryMap.clear();
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
            console.warn('Failed to load event spawns:', data.error || 'Unknown error');
        }
    } catch (error) {
        eventSpawns = [];
        console.warn('Error loading event spawns:', error.message);
        // Continue execution - event spawns are optional
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
    if (!input) {
        console.error('Background image input element not found');
        return;
    }
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

// Populate territory type selector for editing
function populateTerritoryTypeSelector() {
    const typeSelect = document.getElementById('territoryTypeSelect');
    if (!typeSelect) return;
    
    typeSelect.innerHTML = '';
    const typeNames = getAllTerritoryTypeNames();
    
    if (typeNames.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No territory types available';
        typeSelect.appendChild(option);
        return;
    }
    
    typeNames.forEach(typeName => {
        const option = document.createElement('option');
        option.value = typeName;
        option.textContent = typeName;
        typeSelect.appendChild(option);
    });
    
    // Set default selection to first type if nothing selected
    if (!selectedTerritoryType || !typeNames.includes(selectedTerritoryType)) {
        selectedTerritoryType = typeNames[0];
        typeSelect.value = selectedTerritoryType;
    } else {
        typeSelect.value = selectedTerritoryType;
    }
}

// Update territory type selector options dynamically (for EditControlsManager)
function updateTerritoryTypeSelectorOptions() {
    const typeSelect = document.getElementById('territoryTypeSelect');
    if (!typeSelect) return;
    
    // Clear existing options
    typeSelect.innerHTML = '';
    
    const typeNames = getAllTerritoryTypeNames();
    
    if (typeNames.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No territory types available';
        typeSelect.appendChild(option);
        return;
    }
    
    typeNames.forEach(typeName => {
        const option = document.createElement('option');
        option.value = typeName;
        option.textContent = typeName;
        typeSelect.appendChild(option);
    });
    
    // Set default selection to first type if nothing selected
    if (!selectedTerritoryType || !typeNames.includes(selectedTerritoryType)) {
        selectedTerritoryType = typeNames[0];
        typeSelect.value = selectedTerritoryType;
    } else {
        typeSelect.value = selectedTerritoryType;
    }
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

// Get all available marker types for editing (including territory types)
function getAllEditableMarkerTypes() {
    const types = [];
    
    // Add standard marker types (excluding old territoryZones)
    Object.keys(markerTypes).forEach(markerType => {
        if (markerType !== 'territoryZones') {
            types.push({
                key: markerType,
                displayName: markerTypes[markerType].getDisplayName(),
                typeConfig: markerTypes[markerType]
            });
        }
    });
    
    // Add territory type-specific marker types
    Object.keys(territoryTypeMarkerTypes).forEach(territoryType => {
        const typeKey = `territoryType_${territoryType}`;
        if (markerTypes[typeKey]) {
            types.push({
                key: typeKey,
                displayName: markerTypes[typeKey].getDisplayName(),
                typeConfig: markerTypes[typeKey]
            });
        }
    });
    
    // Sort by display name
    types.sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    return types;
}

// Initialize edit markers UI (dropdown selector and controls)
function initializeEditMarkersUI() {
    const container = document.getElementById('editMarkersContainer');
    if (!container) {
        console.error('editMarkersContainer not found');
        return;
    }
    
    // Create dropdown label
    const label = document.createElement('label');
    label.setAttribute('for', 'editMarkerTypeSelect');
    label.style.display = 'block';
    label.style.marginBottom = '8px';
    label.style.fontSize = '12px';
    label.style.color = 'var(--nord4)';
    label.textContent = 'Select marker type to edit:';
    container.appendChild(label);
    
    // Create dropdown select
    const select = document.createElement('select');
    select.id = 'editMarkerTypeSelect';
    select.style.width = '100%';
    select.style.padding = '6px';
    select.style.fontSize = '12px';
    select.style.background = 'var(--nord1)';
    select.style.color = 'var(--nord4)';
    select.style.border = '1px solid var(--nord3)';
    select.style.borderRadius = '4px';
    select.style.marginBottom = '10px';
    
    // Add "None" option
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = 'None (view only)';
    select.appendChild(noneOption);
    
    // Populate with marker types (will be updated when territories are loaded)
    updateEditMarkerTypeDropdown();
    
    // Add change event listener
    select.addEventListener('change', async (e) => {
        const selectedType = e.target.value;
        
        // Disable all editing
        for (const markerType of Object.keys(markerTypes)) {
            if (editingEnabled[markerType]) {
                await handleEditingToggle(markerType, false);
            }
        }
        
        // Enable selected type if not "None"
        if (selectedType) {
            await handleEditingToggle(selectedType, true);
        }
        
        draw();
    });
    
    container.appendChild(select);
    
    // Create container for edit controls (will be populated by EditControlsManager)
    const controlsContainer = document.createElement('div');
    controlsContainer.id = 'editControlsContainer';
    container.appendChild(controlsContainer);
    
    // Initialize EditControlsManager
    editControlsManager = new EditControlsManager('editControlsContainer');
    editControlsManager.initialize();
}

// Update the edit marker type dropdown with current marker types
function updateEditMarkerTypeDropdown() {
    const select = document.getElementById('editMarkerTypeSelect');
    if (!select) return;
    
    // Get currently selected value
    const currentValue = select.value;
    
    // Clear existing options except "None"
    while (select.children.length > 1) {
        select.removeChild(select.lastChild);
    }
    
    // Get all available marker types
    const types = getAllEditableMarkerTypes();
    
    // Add options for each marker type
    types.forEach(type => {
        const option = document.createElement('option');
        option.value = type.key;
        option.textContent = type.displayName;
        select.appendChild(option);
    });
    
    // Restore selection if it still exists
    if (currentValue && types.some(t => t.key === currentValue)) {
        select.value = currentValue;
    } else {
        select.value = '';
    }
}

// Update edit markers UI to include territory type-specific options in dropdown
function updateTerritoryTypeEditUI() {
    // Update the dropdown to include new territory types
    updateEditMarkerTypeDropdown();
    
    // Re-initialize EditControlsManager to include new territory type controls
    if (editControlsManager) {
        const controlsContainer = document.getElementById('editControlsContainer');
        if (!controlsContainer) return;
        
        // Remove old controls for territory types
        Object.keys(territoryTypeMarkerTypes).forEach(territoryType => {
            const typeKey = `territoryType_${territoryType}`;
            const oldControls = editControlsManager.getControlsElement(typeKey);
            if (oldControls) {
                oldControls.remove();
                editControlsManager.activeControls.delete(typeKey);
            }
        });
        
        // Create new controls for each territory type
        Object.keys(territoryTypeMarkerTypes).forEach(territoryType => {
            const typeKey = `territoryType_${territoryType}`;
            const typeConfig = markerTypes[typeKey];
            if (!typeConfig) return;
            
            const config = editControlsManager.getUIConfig(typeKey);
            const controls = editControlsManager.createControls(typeKey, config);
            if (controls) {
                controlsContainer.appendChild(controls);
                editControlsManager.activeControls.set(typeKey, controls);
            }
        });
    }
}

// Global EditControlsManager instance
let editControlsManager = null;

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    
    // Setup background image handler
    setupBackgroundImageHandler();
    
    // Initialize edit markers UI
    initializeEditMarkersUI();
    
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
    
    // Note: Edit controls and button handlers are now created dynamically by EditControlsManager
    // Checkboxes are created by initializeEditMarkersUI()
    
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

