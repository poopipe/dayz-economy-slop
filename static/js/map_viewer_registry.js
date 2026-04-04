// Map Viewer marker type registry and contract helpers.
(function initMapViewerRegistry(globalObj) {
    'use strict';

    const REQUIRED_KEYS = [
        'getArray',
        'setArray',
        'getShowFlag',
        'getDisplayName',
        'getMarker',
        'isDeleted',
        'getScreenPos',
        'isPointOnMarker',
        'createNew',
        'getOriginalData',
        'restoreOriginal',
        'prepareSaveData'
    ];

    function hasRequiredKeys(markerType, config) {
        const missing = REQUIRED_KEYS.filter((key) => typeof config[key] !== 'function');
        return { valid: missing.length === 0, missing };
    }

    function withMarkerTypeDefaults(config) {
        return {
            canEditRadius: false,
            canEditDimensions: false,
            hiddenFromMarkerEditDropdown: false,
            belongsToMarkersCategory: true,
            selected: new Set(),
            deleted: new Set(),
            new: new Set(),
            originalPositions: new Map(),
            uiConfig: {
                showDiscardButton: true,
                customControls: []
            },
            ...config
        };
    }

    function createMarkerTypeRegistry() {
        const entries = new Map();

        return {
            register(markerType, config) {
                if (!markerType || typeof markerType !== 'string') {
                    throw new Error('Marker type key must be a non-empty string.');
                }
                if (!config || typeof config !== 'object') {
                    throw new Error(`Marker type '${markerType}' configuration must be an object.`);
                }
                const enriched = withMarkerTypeDefaults(config);
                const check = hasRequiredKeys(markerType, enriched);
                if (!check.valid) {
                    throw new Error(
                        `Marker type '${markerType}' missing required contract keys: ${check.missing.join(', ')}`
                    );
                }
                entries.set(markerType, enriched);
                return enriched;
            },
            unregister(markerType) {
                entries.delete(markerType);
            },
            get(markerType) {
                return entries.get(markerType) || null;
            },
            keys() {
                return Array.from(entries.keys());
            },
            entries() {
                return Array.from(entries.entries());
            },
            has(markerType) {
                return entries.has(markerType);
            },
            clear() {
                entries.clear();
            }
        };
    }

    if (!globalObj.MapViewerCore) {
        globalObj.MapViewerCore = {};
    }
    globalObj.MapViewerCore.markerTypeRegistry = createMarkerTypeRegistry();
    globalObj.MapViewerCore.withMarkerTypeDefaults = withMarkerTypeDefaults;
})(window);
