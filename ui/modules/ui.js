import { state } from "./state.js";
import { gradients, builtInPresets } from "./constants.js";
import { updateValueDisplay, updateValueDisplays, updateFreqRange } from "./utils.js";
import { loadUserPresets } from "./presets.js";
import { updateBackgroundControls, applyBackground, updateBackgroundDim, updateBackgroundFit } from "./background.js";

// ===========================
// UI FUNCTIONS
// ===========================

// ===========================




export function toggleSettings() {
    state.settingsPanelVisible = !state.settingsPanelVisible;
    const panel = document.getElementById('settingsPanel');
    const canvas = document.getElementById('canvasContainer');
    const controlBar = document.getElementById('controlBar');
    const nowPlaying = document.getElementById('nowPlaying');
    const showControlBarCheckbox = document.getElementById('showControlBar');

    // Check if controlBar should be visible
    const controlBarVisible = !showControlBarCheckbox || showControlBarCheckbox.checked;

    if (state.settingsPanelVisible) {
        panel.classList.add('show');
        canvas.classList.add('with-panel');
        if (controlBarVisible) {
            controlBar.classList.add('with-panel');
        }
        if (nowPlaying) nowPlaying.classList.add('with-panel');
    } else {
        panel.classList.remove('show');
        canvas.classList.remove('with-panel');
        controlBar.classList.remove('with-panel');
        if (nowPlaying) nowPlaying.classList.remove('with-panel');
    }
}

export function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const tabElement = document.getElementById(`${tabName}-tab`);
    if (tabElement) {
        tabElement.classList.add('active');
    }

    event.target.classList.add('active');
}

export function initializeUI() {
    const gSel = document.getElementById("gradient");
    const gRight = document.getElementById("gradientRight");

    if (gSel && gRight) {
        gradients.forEach(g => {
            const o1 = document.createElement("option");
            o1.value = g;
            o1.textContent = g.charAt(0).toUpperCase() + g.slice(1);
            gSel.appendChild(o1);

            const o2 = document.createElement("option");
            o2.value = g;
            o2.textContent = g.charAt(0).toUpperCase() + g.slice(1);
            gRight.appendChild(o2);
        });
        gSel.value = "prism";
        gRight.value = "prism";
    }

    const pSel = document.getElementById("presetSelect");
    if (pSel) {
        Object.keys(builtInPresets).forEach(k => {
            const o = document.createElement("option");
            o.value = k;
            o.textContent = builtInPresets[k].name;
            pSel.appendChild(o);
        });
    }

    setupEventListeners();
    loadUserPresets();
    updateValueDisplays();
}

export function setupEventListeners() {
    const addListener = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    };

    // Mode Select
    const modeSelect = document.getElementById('modeSelect');
    if (modeSelect) {
        modeSelect.addEventListener('change', function (e) {
            const mode = parseInt(e.target.value);
            const audioMotion = state.audioMotion;
        if (audioMotion) {
                audioMotion.mode = mode;
                console.log('[Settings] Mode:', mode);
            }
        });
    }

    // Gradients
    addListener("gradient", "change", function () {
        const audioMotion = state.audioMotion;
        if (audioMotion) {
            audioMotion.gradient = this.value;
            const linkGrads = document.getElementById('linkGrads');
            if (linkGrads && linkGrads.dataset.active === '1') {
                audioMotion.gradientRight = this.value;
                const gradRight = document.getElementById('gradientRight');
                if (gradRight) gradRight.value = this.value;
            }
        }
    });

    addListener("gradientRight", "change", function () {
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.gradientRight = this.value;
    });

    addListener("linkGrads", "click", function () {
        const active = this.dataset.active === '1';
        this.dataset.active = active ? '0' : '1';

        const gradientRight = document.getElementById('gradientRight');
        if (gradientRight) {
            gradientRight.disabled = !active;
            if (!active && audioMotion) {
                const mainGrad = document.getElementById('gradient').value;
                state.audioMotion.gradient = mainGrad;
                state.audioMotion.gradientRight = mainGrad;
                gradientRight.value = mainGrad;
            }
        }
    });

    addListener("splitGrad", "click", function () {
        const active = this.dataset.active === '1';
        this.dataset.active = active ? '0' : '1';
        const audioMotion = state.audioMotion;
        if (audioMotion) {
            audioMotion.splitGradient = !active;
        }
    });

    // Color Mode
    const colorModeSelect = document.getElementById('colorModeSelect');
    if (colorModeSelect) {
        colorModeSelect.addEventListener('change', function (e) {
            const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.colorMode = e.target.value;
        });
    }

    // Sensitivity
    const sensitivitySelect = document.getElementById('sensitivitySelect');
    if (sensitivitySelect) {
        sensitivitySelect.addEventListener('change', function (e) {
            const preset = parseInt(e.target.value);
            const sensitivityPresets = [
                { min: -70, max: -20, boost: 1 },
                { min: -85, max: -25, boost: 1.6 },
                { min: -100, max: -30, boost: 2.4 }
            ];

            if (audioMotion && sensitivityPresets[preset]) {
                const { min, max, boost } = sensitivityPresets[preset];
                state.audioMotion.minDecibels = min;
                state.audioMotion.maxDecibels = max;
                state.audioMotion.linearBoost = boost;
                console.log('[Settings] Sensitivity:', preset);
            }
        });
    }

    // Effects
    const effectSwitches = ['alphaBars', 'lumiBars', 'ledBars', 'outlineBars', 'radial', 'roundBars'];
    effectSwitches.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', function () {
                const active = this.dataset.active === '1';
                this.dataset.active = active ? '0' : '1';
                const audioMotion = state.audioMotion;
        if (audioMotion) {
                    audioMotion[id] = !active;
                }
            });
        }
    });

    // Reflex
    const reflexSelect = document.getElementById('reflexSelect');
    if (reflexSelect) {
        reflexSelect.addEventListener('change', function (e) {
            const value = e.target.value;
            const audioMotion = state.audioMotion;
        if (audioMotion) {
                switch (value) {
                    case '3':
                        audioMotion.reflexRatio = 0.25;
                        audioMotion.reflexAlpha = 0.2;
                        break;
                    case '1':
                        state.audioMotion.reflexRatio = 0.4;
                        state.audioMotion.reflexAlpha = 0.2;
                        break;
                    case '2':
                        state.audioMotion.reflexRatio = 0.5;
                        state.audioMotion.reflexAlpha = 1;
                        break;
                    default:
                        state.audioMotion.reflexRatio = 0;
                }
            }
        });
    }

    // Scale Labels
    const scaleXSelect = document.getElementById('scaleXSelect');
    if (scaleXSelect) {
        scaleXSelect.addEventListener('change', function (e) {
            const value = parseInt(e.target.value);
            const audioMotion = state.audioMotion;
        if (audioMotion) {
                audioMotion.showScaleX = value !== 0;
                audioMotion.noteLabels = value === 2;
            }
        });
    }

    const scaleYSelect = document.getElementById('showScaleY');
    if (scaleYSelect) {
        scaleYSelect.addEventListener('change', function (e) {
            const audioMotion = state.audioMotion;
        if (audioMotion) {
                audioMotion.showScaleY = e.target.value === 'true';
            }
        });
    }

    // Channel Layout
    addListener("channelLayout", "change", function () {
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.channelLayout = this.value;
    });

    // Mirror
    const mirrorSelect = document.getElementById('mirrorSelect');
    if (mirrorSelect) {
        mirrorSelect.addEventListener('change', function (e) {
            const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.mirror = parseInt(e.target.value);
        });
    }

    // Frequency Scale
    const freqScaleSelect = document.getElementById('freqScaleSelect');
    if (freqScaleSelect) {
        freqScaleSelect.addEventListener('change', function (e) {
            const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.frequencyScale = e.target.value;
        });
    }

    // Frequency Range
    addListener("minFreq", "change", updateFreqRange);
    addListener("maxFreq", "change", updateFreqRange);

    // Bar Adjustments
    addListener("barSpace", "input", function () {
        updateValueDisplay('barSpace', 'barSpaceValue');
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.barSpace = parseFloat(this.value);
    });

    addListener("fillAlpha", "input", function () {
        updateValueDisplay('fillAlpha', 'fillAlphaValue');
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.fillAlpha = parseFloat(this.value);
    });

    addListener("volume", "input", function () {
        updateValueDisplay('volume', 'volumeValue');
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.volume = parseFloat(this.value);
    });

    addListener("lineWidth", "input", function () {
        updateValueDisplay('lineWidth', 'lineWidthValue');
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.lineWidth = parseFloat(this.value);
    });

    // Radial
    addListener("radius", "input", function () {
        updateValueDisplay('radius', 'radiusValue');
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.radius = parseFloat(this.value);
    });

    addListener("spinSpeed", "input", function () {
        updateValueDisplay('spinSpeed', 'spinSpeedValue');
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.spinSpeed = parseFloat(this.value);
    });

    // FFT
    addListener("fftSize", "change", function () {
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.fftSize = parseInt(this.value);
    });

    addListener("smoothing", "input", function () {
        updateValueDisplay('smoothing', 'smoothingValue');
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.smoothing = parseFloat(this.value);
    });

    const ansiBandsSelect = document.getElementById('ansiBandsSelect');
    if (ansiBandsSelect) {
        ansiBandsSelect.addEventListener('change', function (e) {
            const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.ansiBands = parseInt(e.target.value);
        });
    }

    const linearAmplitudeSelect = document.getElementById('linearAmplitudeSelect');
    if (linearAmplitudeSelect) {
        linearAmplitudeSelect.addEventListener('change', function (e) {
            const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.linearAmplitude = parseInt(e.target.value);
        });
    }

    addListener("weightingFilter", "change", function () {
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.weightingFilter = this.value;
    });

    // Peak Settings
    addListener("gravity", "input", function () {
        updateValueDisplay('gravity', 'gravityValue');
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.gravity = parseFloat(this.value);
    });

    addListener("peakFade", "input", function () {
        updateValueDisplay('peakFade', 'peakFadeValue');
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.peakFadeTime = parseInt(this.value);
    });

    addListener("peakHold", "input", function () {
        updateValueDisplay('peakHold', 'peakHoldValue');
        const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.peakHoldTime = parseInt(this.value);
    });

    // // Display
    // addListener("showFPS", "click", function () {
    //     const active = this.dataset.active === '1';
    //     this.dataset.active = active ? '0' : '1';
    //     const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.showFPS = !active;
    // });

    // addListener("loRes", "click", function () {
    //     const active = this.dataset.active === '1';
    //     this.dataset.active = active ? '0' : '1';
    //     const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.loRes = !active;
    // });

    // General
    // addListener("maxFPS", "change", function () {
    //     const audioMotion = state.audioMotion;
        if (audioMotion) audioMotion.maxFPS = parseInt(this.value);
    // });

    // addListener("fsHeight", "input", function () {
    //     const val = parseInt(this.value);
    //     const display = document.getElementById('fsHeightValue');
    //     if (display) display.textContent = val + '%';
    // });

    addListener("showControlBar", "change", function () {
        const fpsCounter = document.getElementById("fpsCounter");
        const status = document.getElementById("status");
        if (this.checked) {
            if (fpsCounter) fpsCounter.style.display = "";
            if (status) status.style.display = "";
        } else {
            if (fpsCounter) fpsCounter.style.display = "none";
            if (status) status.style.display = "none";
        }
    });

    addListener("showNowPlaying", "change", function () {
        const nowPlaying = document.getElementById("nowPlaying");
        if (nowPlaying) {
            nowPlaying.classList.toggle("hidden-by-css", !this.checked);
        }
    });

    // Now Playing Layout inputs apply
    const npApply = document.getElementById('applyNowPlayingLayoutBtn');
    if (npApply) {
        npApply.addEventListener('click', function () {
            const box = document.getElementById('nowPlaying');
            if (!box) return;
            const x = parseInt(document.getElementById('npX')?.value || '16');
            const y = parseInt(document.getElementById('npY')?.value || '16');
            const w = parseInt(document.getElementById('npW')?.value || '600');
            const hVal = document.getElementById('npH')?.value || 'auto';
            box.style.left = x + 'px';
            box.style.top = y + 'px';
            box.style.width = w + 'px';
            if (hVal && hVal !== 'auto') {
                box.style.height = parseInt(hVal) + 'px';
            } else {
                box.style.height = '';
            }
            box.style.right = 'auto';
            box.style.bottom = 'auto';
        });
    }

    // Background
    addListener("bgType", "change", function () {
        updateBackgroundControls();
        applyBackground();
    });

    addListener("bgFile", "change", applyBackground);

    addListener("bgDim", "input", function () {
        const val = parseFloat(this.value);
        const display = document.getElementById("bgDimValue");
        if (display) display.textContent = val.toFixed(1);
        updateBackgroundDim(val);
    });

    addListener("bgFit", "change", function () {
        updateBackgroundFit(this.value);
    });
}

