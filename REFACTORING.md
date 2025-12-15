# Spectrum.js Modular Refactoring

## Overview
The `ui/spectrum.js` file has been refactored from a single 2,855-line file into a modular structure for better maintainability and organization.

## Directory Structure

```
ui/
├── spectrum.js              # Main orchestration file (imports and exposes modules)
├── spectrum-original.js     # Backup of original monolithic file
├── index.html              # Updated to use ES6 modules
└── modules/
    ├── state.js            # Global state management
    ├── constants.js        # Gradients and built-in presets
    ├── utils.js            # Utility/helper functions
    ├── pcmPlayer.js        # PCMPlayer class for audio processing
    ├── presets.js          # Preset management functions
    ├── ui.js               # UI initialization and event listeners
    ├── background.js       # Background management (images/videos)
    ├── importExport.js     # Settings import/export
    ├── volumio.js          # Volumio integration and queue management
    ├── websocket.js        # WebSocket communication
    ├── audio.js            # Audio initialization
    ├── audioMotion.js      # AudioMotion analyzer initialization
    └── fps.js              # FPS counter
```

## Modules Description

### Core Modules

#### `state.js`
- Manages all global application state
- Exports a single `state` object containing all shared variables
- Accessible globally via `window.appState` for debugging

#### `constants.js`
- Contains static data: gradients array and built-in presets
- No dependencies on other modules
- Pure data export

#### `utils.js`
- Helper functions used across multiple modules
- URL builders (WebSocket, Volumio API, Settings API)
- UI update helpers (value displays, radio buttons, frequency range)
- No state modification, only reads

### Functionality Modules

#### `pcmPlayer.js`
- PCMPlayer class for handling PCM audio streams
- Converts Int16 audio data to Float32 for Web Audio API
- Manages audio buffering and processing

#### `presets.js`
- Preset management (apply, save, load, export current settings)
- User preset storage in localStorage
- Applies preset configurations to AudioMotion and UI

#### `ui.js`
- UI initialization and event listener setup
- Handles all user interactions with settings panel
- Mode selection, gradients, effects, etc.
- Tab switching and settings panel toggle

#### `background.js`
- Background image/video management
- File upload, selection, and application
- Album cover art integration
- Background dimming and fit modes

#### `importExport.js`
- Settings export to JSON file
- Settings import from JSON file
- Uses preset functions for applying imported settings

#### `volumio.js`
- Complete Volumio music player integration
- Now Playing display and updates
- Playback controls (play/pause, next, previous)
- Queue management and display
- Music library browsing
- Progress bar updates

#### `websocket.js`
- WebSocket connection management
- PCM audio data receiving
- Settings updates from server
- Auto-reconnection logic

#### `audio.js`
- Audio system initialization
- AudioContext creation and management
- PCMPlayer instantiation
- Connection to AudioMotion analyzer

#### `audioMotion.js`
- AudioMotion Analyzer initialization
- Settings API communication
- Server settings synchronization
- UI-to-settings mapping

#### `fps.js`
- FPS counter and statistics display
- Frame counting and packet monitoring
- Buffer status reporting

### Main File: `spectrum.js`

The main file now serves as an orchestration layer:
1. Imports all required modules
2. Exposes functions globally for HTML onclick handlers
3. Sets up DOMContentLoaded event listeners
4. Handles application startup sequence
5. Manages cleanup on beforeunload

## Changes from Original

### Benefits
- **Modularity**: Each module has a single, clear responsibility
- **Maintainability**: Easier to locate and modify specific functionality
- **Testability**: Modules can be tested independently
- **Reusability**: Modules can be reused in other projects
- **Readability**: Smaller files are easier to understand
- **Collaboration**: Multiple developers can work on different modules simultaneously

### HTML Changes
- Changed `<script src="spectrum.js">` to `<script type="module" src="spectrum.js">`
- ES6 module system now required (supported in all modern browsers)

### State Management
- All global variables moved to `state.js`
- Accessed via `state.variableName` throughout modules
- Single source of truth for application state

### Function Exports
- All functions used by HTML onclick handlers are exposed globally via `window` object
- Internal functions remain module-scoped for encapsulation

## Usage

The refactored code maintains 100% backward compatibility with the original interface. All HTML onclick handlers continue to work without modification.

### For Development
1. Edit the appropriate module file for your changes
2. The changes will be automatically reflected when the page reloads
3. No build step required - native ES6 modules are used

### For Debugging
- Access application state via `window.appState` in browser console
- Each module's functions are separately accessible for testing
- Enable source maps in devtools to see original module structure

## Migration Notes

- The original file is preserved as `spectrum-original.js`
- To revert to the original, restore references in `index.html`
- All functionality remains identical to the original implementation

## Future Enhancements

Potential improvements enabled by this refactoring:
- Unit tests for individual modules
- Module bundling for production (e.g., with Rollup or Webpack)
- TypeScript conversion for type safety
- Further splitting of large modules (ui.js, volumio.js)
- Addition of new features without affecting existing code
