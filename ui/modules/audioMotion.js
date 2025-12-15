import { state } from "./state.js";
import { getSettingsApiUrl } from "./utils.js";
import { setRadioValue, updateValueDisplay, updateFreqRange } from "./utils.js";
import { refreshBackgroundFiles } from "./background.js";
import { connectWebSocket } from "./websocket.js";
import { updateFPS } from "./fps.js";

// ===========================
// AUDIOMOTION INIT & SETTINGS
// ===========================

if (typeof window !== "undefined") { window.applyServerSettings = null; }

// ===========================
export async function initAudioMotion() {
    try {
        if (typeof AudioMotionAnalyzer === 'undefined') {
            console.error('[AM] Not loaded, retrying...');
            setTimeout(initAudioMotion, 500);
            return;
        }

        console.log('[AM] Initializing...');

        const container = document.getElementById("canvasContainer");
        if (!container) {
            console.error('[AM] Canvas container not found');
            return;
        }

        state.sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 44100
        });

        console.log('[AM] Created shared audio context, state:', state.sharedAudioContext.state);

        // Fetch settings from server
        let serverSettings = await fetchServerSettings();

        // Default config
        const defaultConfig = {
            mode: 4,
            fftSize: 8192,
            smoothing: 0.7,
            gradient: 'prism',
            minDecibels: -85,
            maxDecibels: -25,
            showPeaks: true,
            showScaleX: true,
            showScaleY: false,
            lumiBars: false,
            outlineBars: true,
            roundBars: false,
            ledBars: false,
            alphaBars: false,
            reflexRatio: 0,
            radial: false,
            channelLayout: 'single',
            showBgColor: false,
            overlay: true,
            bgAlpha: 0,
            linearBoost: 1.6,
            minFreq: 20,
            maxFreq: 22000
        };

        // Merge configs (server settings override defaults)
        const config = {
            audioCtx: state.sharedAudioContext,
            ...defaultConfig,
            ...serverSettings
        };

        console.log('[AM] Config:', serverSettings ? '✓ From server' : 'ℹ Using defaults');
        console.log('[AM] Full config:', config);

        state.audioMotion = new AudioMotionAnalyzer(container, config);

        console.log('[AM] ✓ Initialized successfully');

        // Debug canvas visibility
        const canvas = container.querySelector('canvas');
        if (canvas) {
            console.log('[AM] Canvas found:', {
                width: canvas.width,
                height: canvas.height,
                clientWidth: canvas.clientWidth,
                clientHeight: canvas.clientHeight,
                display: window.getComputedStyle(canvas).display,
                zIndex: window.getComputedStyle(canvas).zIndex,
                visibility: window.getComputedStyle(canvas).visibility
            });
        } else {
            console.warn('[AM] Canvas not found in container!');
        }

        // Debug container
        console.log('[AM] Container:', {
            width: container.clientWidth,
            height: container.clientHeight,
            display: window.getComputedStyle(container).display
        });

        // If settings were loaded from server, update UI elements to match
        if (serverSettings) {
            console.log('[AM] Syncing UI elements with server settings...');
            // Use a small delay to ensure UI is ready
            setTimeout(() => syncUIWithSettings(serverSettings), 100);
        }

        refreshBackgroundFiles();
        connectWebSocket();
        setInterval(updateFPS, 1000);

    } catch (e) {
        console.error('[AM] Init error:', e);
        alert('Failed to initialize: ' + e.message);
    }
}

// ===========================
// UPDATE Settings API Fetch
// ===========================
export async function fetchServerSettings() {
    try {
        const settingsUrl = `${getSettingsApiUrl()}/api/settings`;
        console.log('[AM] Fetching settings from', settingsUrl);

        const response = await fetch(settingsUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-cache'
        });

        if (response.ok) {
            const settings = await response.json();
            console.log('[AM] ✓ Settings loaded:', settings);
            return settings;
        } else {
            console.warn('[AM] Settings API returned status:', response.status);
            return null;
        }
    } catch (error) {
        console.warn('[AM] Failed to fetch settings:', error.message);
        return null;
    }
}

// Apply settings to running AudioMotion instance
export function applyServerSettings(settings) {
    if (typeof window !== "undefined") window.applyServerSettings = applyServerSettings;
    if (!state.audioMotion) {
        console.warn('[AM] AudioMotion not initialized yet');
        return;
    }

    console.log('[AM] Applying settings update...');

    try {
        // Apply each setting
        for (let key in settings) {
            if (settings.hasOwnProperty(key) && state.audioMotion.hasOwnProperty(key)) {
                audioMotion[key] = settings[key];
                console.log('[AM] Updated:', key, '=', settings[key]);
            }
        }

        console.log('[AM] ✓ Settings applied successfully');
    } catch (error) {
        console.error('[AM] Error applying settings:', error);
    }
}


export async function uploadSettings() {
    const btn = document.getElementById('uploadSettingsBtn');
    if (!btn) return;
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Uploading...';

    try {
        const settings = {};

        // Collect selects
        document.querySelectorAll('#settingsPanel select').forEach(s => {
            if (s.id) settings[s.id] = s.value;
        });

        // Collect inputs
        document.querySelectorAll('#settingsPanel input').forEach(i => {
            if (i.type === 'radio') {
                if (i.checked) {
                    // For showScaleY, use the form's ID and convert to boolean
                    const formId = i.closest('form')?.id;
                    if (formId === 'showScaleY') {
                        settings[formId] = i.value === 'true';
                    } else if (i.name) {
                        settings[i.name] = i.value;
                    }
                }
            } else if (i.type === 'checkbox') {
                if (i.id) settings[i.id] = i.checked;
            } else {
                if (i.id) settings[i.id] = i.value;
            }
        });

        // Also include Now Playing layout explicitly for clarity
        const npX = document.getElementById('npX');
        const npY = document.getElementById('npY');
        const npW = document.getElementById('npW');
        const npH = document.getElementById('npH');
        if (npX) settings.npX = npX.value;
        if (npY) settings.npY = npY.value;
        if (npW) settings.npW = npW.value;
        if (npH) settings.npH = npH.value || 'auto';

        // Collect custom switches (data-active)
        document.querySelectorAll('#settingsPanel .switch').forEach(sw => {
            if (sw.id) settings[sw.id] = sw.getAttribute('data-active') === '1';
        });
        console.log("POST body:", JSON.stringify(settings));
        // POST to server
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(txt || res.statusText);
        }

        alert('Settings uploaded to server');
    } catch (err) {
        alert('Failed to upload settings: ' + (err.message || err));
    } finally {
        btn.disabled = false;
        btn.textContent = origText;
    }
}

// Sync UI elements with loaded settings
export function syncUIWithSettings(settings) {
    if (!settings || typeof settings !== 'object') return;

    try {
        // Apply Now Playing layout if present
        const npBox = document.getElementById('nowPlaying');
        if (npBox) {
            if (settings.npX !== undefined) {
                npBox.style.left = parseInt(settings.npX) + 'px';
                const npX = document.getElementById('npX');
                if (npX) npX.value = parseInt(settings.npX);
            }
            if (settings.npY !== undefined) {
                npBox.style.top = parseInt(settings.npY) + 'px';
                const npY = document.getElementById('npY');
                if (npY) npY.value = parseInt(settings.npY);
            }
            if (settings.npW !== undefined) {
                npBox.style.width = parseInt(settings.npW) + 'px';
                const npW = document.getElementById('npW');
                if (npW) npW.value = parseInt(settings.npW);
            }
            if (settings.npH !== undefined) {
                if (settings.npH === 'auto') {
                    npBox.style.height = '';
                } else {
                    npBox.style.height = parseInt(settings.npH) + 'px';
                }
                const npH = document.getElementById('npH');
                if (npH) npH.value = settings.npH;
            }
            npBox.style.right = 'auto';
            npBox.style.bottom = 'auto';
        }

        // Mode (this is a SELECT, not radio buttons)
        if (settings.mode !== undefined) {
            const mode = document.querySelector('select#mode');
            if (mode) {
                const modeValue = settings.mode.toString();
                console.log('[UI Sync] Setting mode to:', modeValue);
                mode.value = modeValue;
                console.log('[UI Sync] Mode select value is now:', mode.value);

                // Verify it was set
                if (mode.value !== modeValue) {
                    console.warn('[UI Sync] Mode value mismatch. Expected:', modeValue, 'Got:', mode.value);
                }
            } else {
                console.warn('[UI Sync] Mode select element not found');
            }
        }

        // Gradients
        if (settings.gradient) {
            const gradSelect = document.getElementById('gradient');
            if (gradSelect) gradSelect.value = settings.gradient;
        }
        if (settings.gradientRight) {
            const gradRight = document.getElementById('gradientRight');
            if (gradRight) gradRight.value = settings.gradientRight;
        }

        // Color Mode
        if (settings.colorMode) {
            setRadioValue('colorModeSelect', settings.colorMode);
        }

        // Effects (buttons with data-active)
        const effectsList = ['alphaBars', 'lumiBars', 'ledBars', 'outlineBars', 'radial', 'roundBars'];
        effectsList.forEach(effectName => {
            if (settings[effectName] !== undefined) {
                const el = document.getElementById(effectName);
                if (el) {
                    el.dataset.active = settings[effectName] ? '1' : '0';
                }
            }
        });

        // Split Grad
        if (settings.splitGradient !== undefined) {
            const el = document.getElementById('splitGrad');
            if (el) el.dataset.active = settings.splitGradient ? '1' : '0';
        }

        // Link Grads
        if (settings.linkGrads !== undefined) {
            const el = document.getElementById('linkGrads');
            if (el) el.dataset.active = settings.linkGrads ? '1' : '0';
        }

        // Channel Layout
        if (settings.channelLayout) {
            const select = document.getElementById('channelLayout');
            if (select) select.value = settings.channelLayout;
        }

        // Frequency Scale
        if (settings.frequencyScale) {
            setRadioValue('freqScaleSelect', settings.frequencyScale);
        }

        // Frequency Range
        if (settings.minFreq !== undefined) {
            const input = document.getElementById('minFreq');
            if (input) input.value = settings.minFreq;
        }
        if (settings.maxFreq !== undefined) {
            const input = document.getElementById('maxFreq');
            if (input) input.value = settings.maxFreq;
        }
        updateFreqRange();

        // Reflex
        if (settings.reflexRatio !== undefined) {
            if (settings.reflexRatio === 0.25) {
                setRadioValue('reflexSelect', '3');
            } else if (settings.reflexRatio === 0.4) {
                setRadioValue('reflexSelect', '1');
            } else if (settings.reflexRatio === 0.5) {
                setRadioValue('reflexSelect', '2');
            } else {
                setRadioValue('reflexSelect', '0');
            }
        }

        // Scale X
        if (settings.showScaleX !== undefined || settings.noteLabels !== undefined) {
            let scaleXValue = '1';
            if (settings.noteLabels === true) {
                scaleXValue = '2';
            } else if (settings.showScaleX === false) {
                scaleXValue = '0';
            }
            setRadioValue('scaleXSelect', scaleXValue);
        }

        // Scale Y
        if (settings.showScaleY !== undefined) {
            const scaleYValue = (settings.showScaleY === true || settings.showScaleY === 'true') ? 'true' : 'false';
            setRadioValue('showScaleY', scaleYValue);
        }

        // Mirror
        if (settings.mirror !== undefined) {
            setRadioValue('mirrorSelect', settings.mirror.toString());
        }

        // Bar Space
        if (settings.barSpace !== undefined) {
            const input = document.getElementById('barSpace');
            if (input) {
                input.value = settings.barSpace;
                updateValueDisplay('barSpace', 'barSpaceValue');
            }
        }

        // Fill Alpha
        if (settings.fillAlpha !== undefined) {
            const input = document.getElementById('fillAlpha');
            if (input) {
                input.value = settings.fillAlpha;
                updateValueDisplay('fillAlpha', 'fillAlphaValue');
            }
        }

        if (settings.volume !== undefined) {
            const input = document.getElementById('volume');
            if (input) {
                input.value = settings.volume;
                updateValueDisplay('volume', 'volumeValue');
            }
        }

        // Line Width
        if (settings.lineWidth !== undefined) {
            const input = document.getElementById('lineWidth');
            if (input) {
                input.value = settings.lineWidth;
                updateValueDisplay('lineWidth', 'lineWidthValue');
            }
        }

        // Radius
        if (settings.radius !== undefined) {
            const input = document.getElementById('radius');
            if (input) {
                input.value = settings.radius;
                updateValueDisplay('radius', 'radiusValue');
            }
        }

        // Spin Speed
        if (settings.spinSpeed !== undefined) {
            const input = document.getElementById('spinSpeed');
            if (input) {
                input.value = settings.spinSpeed;
                updateValueDisplay('spinSpeed', 'spinSpeedValue');
            }
        }

        // FFT Size
        if (settings.fftSize !== undefined) {
            const select = document.getElementById('fftSize');
            if (select) select.value = settings.fftSize;
        }

        // Smoothing
        if (settings.smoothing !== undefined) {
            const input = document.getElementById('smoothing');
            if (input) {
                input.value = settings.smoothing;
                updateValueDisplay('smoothing', 'smoothingValue');
            }
        }

        // ANSI Bands
        if (settings.ansiBands !== undefined) {
            setRadioValue('ansiBandsSelect', settings.ansiBands.toString());
        }

        // Linear Amplitude
        if (settings.linearAmplitude !== undefined) {
            setRadioValue('linearAmplitudeSelect', settings.linearAmplitude.toString());
        }

        // Weighting Filter
        if (settings.weightingFilter) {
            const select = document.getElementById('weightingFilter');
            if (select) select.value = settings.weightingFilter;
        }

        // Gravity
        if (settings.gravity !== undefined) {
            const input = document.getElementById('gravity');
            if (input) {
                input.value = settings.gravity;
                updateValueDisplay('gravity', 'gravityValue');
            }
        }

        // Peak Fade
        if (settings.peakFadeTime !== undefined) {
            const input = document.getElementById('peakFade');
            if (input) {
                input.value = settings.peakFadeTime;
                updateValueDisplay('peakFade', 'peakFadeValue');
            }
        }

        // Peak Hold
        if (settings.peakHoldTime !== undefined) {
            const input = document.getElementById('peakHold');
            if (input) {
                input.value = settings.peakHoldTime;
                updateValueDisplay('peakHold', 'peakHoldValue');
            }
        }

        // // Max FPS
        // if (settings.maxFPS !== undefined) {
        //     const select = document.getElementById('maxFPS');
        //     if (select) select.value = settings.maxFPS;
        // }

        // // Show FPS
        // if (settings.showFPS !== undefined) {
        //     const el = document.getElementById('showFPS');
        //     if (el) el.dataset.active = settings.showFPS ? '1' : '0';
        // }

        // // Lo Res
        // if (settings.loRes !== undefined) {
        //     const el = document.getElementById('loRes');
        //     if (el) el.dataset.active = settings.loRes ? '1' : '0';
        // }

        console.log('[AM] ✓ UI elements synced with server settings');
    } catch (error) {
        console.error('[AM] Error syncing UI:', error);
    }
}

