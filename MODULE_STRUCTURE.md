# Module Dependency Graph

## Overview
This document shows the dependency relationships between the refactored modules.

## Module Dependency Tree

```
spectrum.js (Main Orchestrator - 158 lines)
├── state.js (36 lines) [No dependencies]
├── constants.js (141 lines) [No dependencies]
├── utils.js (95 lines)
│   └── → state.js
├── pcmPlayer.js (64 lines) [No dependencies]
├── fps.js (21 lines)
│   └── → state.js
├── presets.js (371 lines)
│   ├── → constants.js
│   └── → utils.js (getSelectedRadio, setRadioValue, updateValueDisplay, updateFreqRange)
├── importExport.js (37 lines)
│   └── → presets.js (getCurrentSettings, applyPreset)
├── ui.js (458 lines)
│   ├── → state.js
│   ├── → constants.js (gradients, builtInPresets)
│   ├── → utils.js (updateValueDisplay, updateValueDisplays, updateFreqRange)
│   ├── → presets.js (loadUserPresets)
│   └── → background.js (updateBackgroundControls, applyBackground, updateBackgroundDim, updateBackgroundFit)
├── background.js (271 lines)
│   └── → state.js
├── websocket.js (137 lines)
│   ├── → state.js
│   └── → utils.js (getWebSocketUrl)
├── audio.js (78 lines)
│   ├── → state.js
│   ├── → pcmPlayer.js (PCMPlayer class)
│   └── → volumio.js (fetchVolumioState)
├── volumio.js (603 lines)
│   ├── → state.js
│   ├── → utils.js (getVolumioUrl, formatTime)
│   └── → background.js (updateCoverBackground)
└── audioMotion.js (528 lines)
    ├── → state.js
    ├── → utils.js (getSettingsApiUrl, setRadioValue, updateValueDisplay, updateFreqRange)
    ├── → background.js (refreshBackgroundFiles)
    ├── → websocket.js (connectWebSocket)
    └── → fps.js (updateFPS)
```

## Module Categories

### Foundation Layer (No External Dependencies)
- **state.js** - Pure state container
- **constants.js** - Static configuration data
- **pcmPlayer.js** - Self-contained audio processing class

### Utility Layer (Minimal Dependencies)
- **utils.js** - Helper functions (depends on state.js only)
- **fps.js** - Performance monitoring (depends on state.js only)

### Core Functionality Layer
- **presets.js** - Preset management
- **background.js** - Background handling
- **websocket.js** - Network communication

### Integration Layer
- **ui.js** - User interface (depends on multiple modules)
- **volumio.js** - External service integration
- **audio.js** - Audio system initialization

### Coordination Layer
- **audioMotion.js** - Main visualization setup (depends on most modules)
- **importExport.js** - Data persistence

### Orchestration Layer
- **spectrum.js** - Main entry point, imports and exposes all modules

## Data Flow

```
User Interaction (HTML)
    ↓
spectrum.js (Global function exposure)
    ↓
ui.js (Event handlers)
    ↓
state.js (State updates)
    ↓
audioMotion.js / volumio.js / websocket.js (Processing)
    ↓
DOM Updates / Audio Output
```

## Key Design Principles

1. **Single Responsibility**: Each module handles one specific area
2. **Loose Coupling**: Modules communicate through well-defined interfaces
3. **High Cohesion**: Related functionality grouped together
4. **Unidirectional Dependencies**: No circular dependencies
5. **State Centralization**: All shared state in state.js

## Module Size Distribution

| Size Range | Modules | Percentage |
|------------|---------|------------|
| < 100 lines | 5 (state, fps, importExport, utils, pcmPlayer) | 38% |
| 100-300 lines | 3 (constants, websocket, background) | 23% |
| 300-500 lines | 2 (presets, ui) | 15% |
| 500+ lines | 2 (volumio, audioMotion) | 15% |
| Main | 1 (spectrum) | 8% |

Average module size: ~213 lines (excluding main)
Median module size: ~141 lines

## Benefits of This Structure

1. **Maintainability**: Easy to find and modify specific functionality
2. **Testability**: Each module can be tested in isolation
3. **Scalability**: New features can be added as new modules
4. **Readability**: No more scrolling through 2,855 lines
5. **Collaboration**: Multiple developers can work on different modules
6. **Performance**: Browser can cache individual modules
7. **Debugging**: Easier to isolate issues to specific modules

## Migration Path for Developers

### Before (Monolithic)
```javascript
// Edit line 1500 of spectrum.js
// Hard to find, easy to break other things
```

### After (Modular)
```javascript
// Edit volumio.js
// Clear context, isolated changes
```

### Finding Code
- **Need to change presets?** → `presets.js`
- **Need to fix WebSocket?** → `websocket.js`
- **Need to update UI?** → `ui.js`
- **Need to modify Volumio integration?** → `volumio.js`
- **Need to adjust background?** → `background.js`

## Future Considerations

### Potential Further Refactoring
- Split `volumio.js` (603 lines) into:
  - `volumio-playback.js` (controls)
  - `volumio-queue.js` (queue management)
  - `volumio-browser.js` (library browsing)

- Split `ui.js` (458 lines) into:
  - `ui-init.js` (initialization)
  - `ui-events.js` (event listeners)
  - `ui-tabs.js` (tab management)

- Split `audioMotion.js` (528 lines) into:
  - `audioMotion-init.js` (initialization)
  - `audioMotion-settings.js` (settings API)
  - `audioMotion-sync.js` (UI synchronization)

### Testing Strategy
1. Unit tests for each module
2. Integration tests for module interactions
3. E2E tests for complete user flows
4. Mock state.js for isolated testing

### Build Optimization
- Consider bundling for production (e.g., with Rollup)
- Tree-shaking to remove unused code
- Code splitting for lazy loading
- Minification and compression
