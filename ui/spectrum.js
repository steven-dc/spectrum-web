// ===========================
// MAIN SPECTRUM MODULE
// ===========================
// This file imports and orchestrates all spectrum analyzer modules

// Import state
import { state } from './modules/state.js';

// Import constants
import { gradients, builtInPresets } from './modules/constants.js';

// Import utilities
import { getVolumioUrl } from './modules/utils.js';

// Import core modules
import { PCMPlayer } from './modules/pcmPlayer.js';
import { initializeUI, switchTab } from './modules/ui.js';
import { applySelectedPreset, savePreset } from './modules/presets.js';
import { exportSettings, importSettings } from './modules/importExport.js';
import { refreshBackgroundFiles, uploadBackground } from './modules/background.js';
import {
    toggleQueue,
    toggleBrowse,
    openVolumioMusic,
    volumioTogglePlay,
    volumioPrevious,
    volumioNext,
    testVolumioConnection,
    fetchVolumioState
} from './modules/volumio.js';
import { connectWebSocket } from './modules/websocket.js';
import { startAudio } from './modules/audio.js';
import { initAudioMotion, uploadSettings } from './modules/audioMotion.js';
import { updateFPS } from './modules/fps.js';

// Import toggle function
import { toggleSettings } from './modules/ui.js';

// ===========================
// EXPOSE GLOBAL FUNCTIONS
// ===========================
// Make functions available to HTML onclick handlers
if (typeof window !== 'undefined') {
    window.toggleSettings = toggleSettings;
    window.switchTab = switchTab;
    window.applySelectedPreset = applySelectedPreset;
    window.savePreset = savePreset;
    window.exportSettings = exportSettings;
    window.importSettings = importSettings;
    window.uploadBackground = uploadBackground;
    window.refreshBackgroundFiles = refreshBackgroundFiles;
    window.toggleQueue = toggleQueue;
    window.toggleBrowse = toggleBrowse;
    window.openVolumioMusic = openVolumioMusic;
    window.volumioTogglePlay = volumioTogglePlay;
    window.volumioPrevious = volumioPrevious;
    window.volumioNext = volumioNext;
    window.testVolumioConnection = testVolumioConnection;
    window.uploadSettings = uploadSettings;
    
    // Expose state for debugging
    window.appState = state;
    
    // Expose classes
    window.PCMPlayer = PCMPlayer;
}

// ===========================
// PROGRESS BAR CLICK HANDLER
// ===========================
window.addEventListener('DOMContentLoaded', () => {
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
        progressBar.addEventListener('click', async (e) => {
            const rect = progressBar.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = clickX / rect.width;

            try {
                const stateResponse = await fetch(`${getVolumioUrl()}/api/v1/getState`);
                if (stateResponse.ok) {
                    const volumioState = await stateResponse.json();
                    if (volumioState.duration) {
                        const seekPosition = Math.floor(percentage * volumioState.duration);
                        const response = await fetch(`${getVolumioUrl()}/api/v1/commands/?cmd=seek&position=${seekPosition}`);
                        if (response.ok) {
                            console.log('[Progress] Seek to:', seekPosition);
                            setTimeout(() => fetchVolumioState(), 100);
                        }
                    }
                }
            } catch (e) {
                console.error('[Progress] Seek error:', e);
            }
        });
    }
});

// ===========================
// STARTUP
// ===========================
window.addEventListener("DOMContentLoaded", () => {
    // Prevent duplicate initialization
    if (state.initializationStarted) {
        console.warn('[App] Skipping duplicate initialization');
        return;
    }
    state.initializationStarted = true;

    console.log('[App] DOM loaded');
    console.log('[Init] Starting on hostname:', window.location.hostname || 'localhost');

    state.forceConnected = true;
    const statusEl = document.getElementById("status");
    if (statusEl) {
        statusEl.className = 'control-item connected';
        statusEl.textContent = '● Connected';
    }

    initializeUI();

    // Set auto-detected URLs in input fields
    const wsUrlInput = document.getElementById('wsUrl');
    const volumioUrlInput = document.getElementById('volumioUrl');

    if (wsUrlInput && !wsUrlInput.value.includes(window.location.hostname || 'localhost')) {
        wsUrlInput.value = `ws://${window.location.hostname || 'localhost'}:9001`;
        console.log('[Init] Set WebSocket URL to:', wsUrlInput.value);
    }
    if (volumioUrlInput && !volumioUrlInput.value.includes(window.location.hostname || 'localhost')) {
        volumioUrlInput.value = `http://${window.location.hostname || 'localhost'}:3000`;
        console.log('[Init] Set Volumio URL to:', volumioUrlInput.value);
    }

    // Initialize AudioMotion (without audio playback)
    setTimeout(() => {
        initAudioMotion().catch(e => {
            console.error('initAudioMotion error:', e);
        });
    }, 100);

    // Auto-start audio after a short delay
    setTimeout(() => {
        startAudio().catch(e => {
            console.warn('[Audio] Auto-start failed:', e);
        });
    }, 500);

    setTimeout(() => { state.forceConnected = false; }, 5000);
});

window.addEventListener("beforeunload", () => {
    if (state.ws) state.ws.close();
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    if (state.volumioStateInterval) clearInterval(state.volumioStateInterval);
    if (state.progressInterval) clearInterval(state.progressInterval);
    if (state.sharedAudioContext) state.sharedAudioContext.close();
});
