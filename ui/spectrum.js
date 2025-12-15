// ===========================
// GLOBALS
// ===========================
let audioMotion = null;
let ws = null;
let pcmPlayer = null;
let reconnectTimer = null;
let sharedAudioContext = null;
let volumioStateInterval = null;
let progressInterval = null;
let queuePanelVisible = false;
let wsConnectTimeout = null;
let frameCount = 0;
let dataReceived = 0;
let lastFpsTime = Date.now();

let audioFormat = { sampleRate: 44100, channels: 2, bitsPerSample: 16 };
let audioStarted = false;
let settingsPanelVisible = false;

// Background
let backgroundFiles = { images: [], videos: [] };
let currentBackground = null;
let bgVideo = null;

// ===========================
// GRADIENTS & PRESETS
// ===========================
const gradients = [
    'apple', 'aurora', 'borealis', 'candy', 'classic', 'cool',
    'dusk', 'miami', 'orient', 'outrun', 'pacific', 'prism',
    'rainbow', 'shahabi', 'summer', 'sunset', 'tiedye'
];

const builtInPresets = {
    "outline": {
        name: "Outline Spectrum",
        options: {
            "mode": 4,
            "gradient": "prism",
            "gradientRight": "prism",
            "colorMode": "gradient",
            "sensitivity": 1,
            "alphaBars": false,
            "lumiBars": false,
            "ledBars": false,
            "outlineBars": true,
            "radial": false,
            "roundBars": false,
            "reflexRatio": "0",
            "showScaleX": "1",
            "showScaleY": "0",
            "channelLayout": "single",
            "mirror": "0",
            "freqScale": "log",
            "minFreq": 20,
            "maxFreq": 22000,
            "barSpace": 0,
            "fillAlpha": 0.05,
            "lineWidth": 2.5,
            "radius": 0.3,
            "spinSpeed": 0,
            "fftSize": 8192,
            "smoothing": 0.7,
            "ansiBands": "0",
            "linearAmplitude": "1",
            "weightingFilter": "",
            "gravity": 3.8,
            "peakFade": 750,
            "peakHold": 500,
            "maxFPS": 60,
            "linkGrads": false,
            "splitGrad": false,
            "showFPS": false,
            "loRes": false
        }
    },
    "ledbars": {
        name: "Classic LED bars",
        options: {
            alphaBars: false,
            barSpace: 0.2,
            channelLayout: "single",
            colorMode: "gradient",
            gradient: "classic",
            ledBars: true,
            lumiBars: false,
            outlineBars: false,
            mode: 10,
            radial: false,
            reflexRatio: 0,
            roundBars: false,
            showPeaks: true,
            splitGrad: false
        }
    },
    "dual": {
        name: "Dual-channel Graph",
        options: {
            channelLayout: "dual-combined",
            fillAlpha: 0.3,
            gradient: "cool",
            gradientRight: "dusk",
            lineWidth: 1,
            mode: 10,
            radial: false,
            reflexRatio: 0,
            showPeaks: false,
            splitGrad: false
        }
    },
    "bands": {
        name: "Octave Bands + Reflex",
        options: {
            alphaBars: false,
            channelLayout: "single",
            colorMode: "gradient",
            gradient: "rainbow",
            ledBars: false,
            lumiBars: false,
            mode: 10,
            outlineBars: false,
            radial: false,
            reflexRatio: 0.25,
            reflexAlpha: 0.2,
            roundBars: false,
            showPeaks: true,
            showScaleX: true,
            splitGrad: false
        }
    },
    "radial": {
        name: "Radial Color by Level",
        options: {
            alphaBars: true,
            channelLayout: "single",
            colorMode: "bar-level",
            gradient: "prism",
            ledBars: false,
            lumiBars: false,
            mirror: 0,
            mode: 10,
            outlineBars: false,
            radial: true,
            showPeaks: true,
            splitGrad: false
        }
    },
    "round": {
        name: "Round Bars by Index",
        options: {
            alphaBars: false,
            channelLayout: "single",
            colorMode: "bar-index",
            gradient: "apple",
            ledBars: false,
            lumiBars: false,
            mirror: 0,
            mode: 10,
            outlineBars: false,
            radial: false,
            reflexRatio: 0,
            roundBars: true,
            showPeaks: false,
            splitGrad: false
        }
    }
};

// ===========================
// PCM PLAYER CLASS
// ===========================
class PCMPlayer {
    constructor(format, audioContext) {
        this.format = format;
        this.audioContext = audioContext;
        this.scriptNode = this.audioContext.createScriptProcessor(4096, 0, format.channels);
        this.analyzerGain = this.audioContext.createGain();
        this.analyzerGain.gain.value = 1.0;
        
        // Kết nối đơn giản: scriptNode -> analyzerGain (không connect đến destination)
        this.scriptNode.connect(this.analyzerGain);
        
        this.buffer = new Float32Array(0);
        this.samplesPlayed = 0;
        this.isFirstChunk = true;
        this.scriptNode.onaudioprocess = (e) => this.processAudio(e);
        console.log('[PCM] Initialized - Audio will go through AudioMotion');
    }
    
    feed(chunk) {
        const samples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2);
        const floatSamples = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
            floatSamples[i] = samples[i] / 32768.0;
        }
        const newBuffer = new Float32Array(this.buffer.length + floatSamples.length);
        newBuffer.set(this.buffer);
        newBuffer.set(floatSamples, this.buffer.length);
        this.buffer = newBuffer;

        if (this.isFirstChunk && floatSamples.length > 0) {
            this.isFirstChunk = false;
            console.log('[PCM] Audio data flowing');
        }
    }

    processAudio(e) {
        const outputBuffer = e.outputBuffer;
        const bufferSize = outputBuffer.length;
        const samplesNeeded = bufferSize * this.format.channels;

        if (this.buffer.length >= samplesNeeded) {
            for (let ch = 0; ch < outputBuffer.numberOfChannels; ch++) {
                const output = outputBuffer.getChannelData(ch);
                for (let i = 0; i < bufferSize; i++) {
                    const idx = i * this.format.channels + Math.min(ch, this.format.channels - 1);
                    output[i] = this.buffer[idx];
                }
            }
            this.buffer = this.buffer.slice(samplesNeeded);
            this.samplesPlayed += samplesNeeded;
        } else {
            for (let ch = 0; ch < outputBuffer.numberOfChannels; ch++) {
                outputBuffer.getChannelData(ch).fill(0);
            }
        }
    }
    
    getSourceNode() {
        return this.analyzerGain;
    }
}

// Initialize when ready
if (window.pcmPlayer) {
    const volumeContainer = document.getElementById('volumeControlContainer');
    if (volumeContainer) {
        const volumeControl = createVolumeControl(window.pcmPlayer);
        volumeContainer.appendChild(volumeControl);
        console.log('[Volume Control] Initialized immediately');
    }
} else {
    let attempts = 0;
    const checkPCM = setInterval(() => {
        attempts++;
        if (window.pcmPlayer) {
            clearInterval(checkPCM);
            const volumeContainer = document.getElementById('volumeControlContainer');
            if (volumeContainer) {
                const volumeControl = createVolumeControl(window.pcmPlayer);
                volumeContainer.appendChild(volumeControl);
                console.log('[Volume Control] Initialized after waiting');
            }
        }
        if (attempts > 50) {
            clearInterval(checkPCM);
            console.error('[Volume Control] PCM Player not found');
        }
    }, 100);
}

// ===========================
// UI FUNCTIONS
// ===========================
function getBaseUrl() {
    return window.location.hostname || 'localhost';
}

function getWebSocketUrl() {
    const wsUrlEl = document.getElementById("wsUrl");
    if (wsUrlEl && wsUrlEl.value) return wsUrlEl.value;
    return `ws://${getBaseUrl()}:9001`;
}

function getVolumioApiUrl() {
    const el = document.getElementById("volumioUrl");
    if (el && el.value) return el.value;
    return `http://${getBaseUrl()}:3000`;
}

function getSettingsApiUrl() {
    return `http://${getBaseUrl()}:8090`;
}

function toggleSettings() {
    settingsPanelVisible = !settingsPanelVisible;
    const panel = document.getElementById('settingsPanel');
    const canvas = document.getElementById('canvasContainer');
    const controlBar = document.getElementById('controlBar');
    const nowPlaying = document.getElementById('nowPlaying');
    const showControlBarCheckbox = document.getElementById('showControlBar');

    // Check if controlBar should be visible
    const controlBarVisible = !showControlBarCheckbox || showControlBarCheckbox.checked;

    if (settingsPanelVisible) {
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

function switchTab(tabName) {
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

function initializeUI() {
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

function setupEventListeners() {
    const addListener = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    };




    // Mode Select
    const modeSelect = document.getElementById('modeSelect');
    if (modeSelect) {
        modeSelect.addEventListener('change', function (e) {
            const mode = parseInt(e.target.value);
            if (audioMotion) {
                audioMotion.mode = mode;
                console.log('[Settings] Mode:', mode);
            }
        });
    }

    // Gradients
    addListener("gradient", "change", function () {
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
                audioMotion.gradient = mainGrad;
                audioMotion.gradientRight = mainGrad;
                gradientRight.value = mainGrad;
            }
        }
    });

    addListener("splitGrad", "click", function () {
        const active = this.dataset.active === '1';
        this.dataset.active = active ? '0' : '1';
        if (audioMotion) {
            audioMotion.splitGradient = !active;
        }
    });

    // Color Mode
    const colorModeSelect = document.getElementById('colorModeSelect');
    if (colorModeSelect) {
        colorModeSelect.addEventListener('change', function (e) {
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
                audioMotion.minDecibels = min;
                audioMotion.maxDecibels = max;
                audioMotion.linearBoost = boost;
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
            if (audioMotion) {
                switch (value) {
                    case '3':
                        audioMotion.reflexRatio = 0.25;
                        audioMotion.reflexAlpha = 0.2;
                        break;
                    case '1':
                        audioMotion.reflexRatio = 0.4;
                        audioMotion.reflexAlpha = 0.2;
                        break;
                    case '2':
                        audioMotion.reflexRatio = 0.5;
                        audioMotion.reflexAlpha = 1;
                        break;
                    default:
                        audioMotion.reflexRatio = 0;
                }
            }
        });
    }

    // Scale Labels
    const scaleXSelect = document.getElementById('scaleXSelect');
    if (scaleXSelect) {
        scaleXSelect.addEventListener('change', function (e) {
            const value = parseInt(e.target.value);
            if (audioMotion) {
                audioMotion.showScaleX = value !== 0;
                audioMotion.noteLabels = value === 2;
            }
        });
    }

    const scaleYSelect = document.getElementById('scaleYSelect');
    if (scaleYSelect) {
        scaleYSelect.addEventListener('change', function (e) {
            if (audioMotion) {
                audioMotion.showScaleY = parseInt(e.target.value);
            }
        });
    }

    // Channel Layout
    addListener("channelLayout", "change", function () {
        if (audioMotion) audioMotion.channelLayout = this.value;
    });

    // Mirror
    const mirrorSelect = document.getElementById('mirrorSelect');
    if (mirrorSelect) {
        mirrorSelect.addEventListener('change', function (e) {
            if (audioMotion) audioMotion.mirror = parseInt(e.target.value);
        });
    }

    // Frequency Scale
    const freqScaleSelect = document.getElementById('freqScaleSelect');
    if (freqScaleSelect) {
        freqScaleSelect.addEventListener('change', function (e) {
            if (audioMotion) audioMotion.frequencyScale = e.target.value;
        });
    }

    // Frequency Range
    addListener("minFreq", "change", updateFreqRange);
    addListener("maxFreq", "change", updateFreqRange);

    // Bar Adjustments
    addListener("barSpace", "input", function () {
        updateValueDisplay('barSpace', 'barSpaceValue');
        if (audioMotion) audioMotion.barSpace = parseFloat(this.value);
    });

    addListener("fillAlpha", "input", function () {
        updateValueDisplay('fillAlpha', 'fillAlphaValue');
        if (audioMotion) audioMotion.fillAlpha = parseFloat(this.value);
    });

    addListener("volume", "input", function () {
        updateValueDisplay('volume', 'volumeValue');
        if (audioMotion) audioMotion.volume = parseFloat(this.value);
    });

    addListener("lineWidth", "input", function () {
        updateValueDisplay('lineWidth', 'lineWidthValue');
        if (audioMotion) audioMotion.lineWidth = parseFloat(this.value);
    });

    // Radial
    addListener("radius", "input", function () {
        updateValueDisplay('radius', 'radiusValue');
        if (audioMotion) audioMotion.radius = parseFloat(this.value);
    });

    addListener("spinSpeed", "input", function () {
        updateValueDisplay('spinSpeed', 'spinSpeedValue');
        if (audioMotion) audioMotion.spinSpeed = parseFloat(this.value);
    });

    // FFT
    addListener("fftSize", "change", function () {
        if (audioMotion) audioMotion.fftSize = parseInt(this.value);
    });

    addListener("smoothing", "input", function () {
        updateValueDisplay('smoothing', 'smoothingValue');
        if (audioMotion) audioMotion.smoothing = parseFloat(this.value);
    });

    const ansiBandsSelect = document.getElementById('ansiBandsSelect');
    if (ansiBandsSelect) {
        ansiBandsSelect.addEventListener('change', function (e) {
            if (audioMotion) audioMotion.ansiBands = parseInt(e.target.value);
        });
    }

    const linearAmplitudeSelect = document.getElementById('linearAmplitudeSelect');
    if (linearAmplitudeSelect) {
        linearAmplitudeSelect.addEventListener('change', function (e) {
            if (audioMotion) audioMotion.linearAmplitude = parseInt(e.target.value);
        });
    }

    addListener("weightingFilter", "change", function () {
        if (audioMotion) audioMotion.weightingFilter = this.value;
    });

    // Peak Settings
    addListener("gravity", "input", function () {
        updateValueDisplay('gravity', 'gravityValue');
        if (audioMotion) audioMotion.gravity = parseFloat(this.value);
    });

    addListener("peakFade", "input", function () {
        updateValueDisplay('peakFade', 'peakFadeValue');
        if (audioMotion) audioMotion.peakFadeTime = parseInt(this.value);
    });

    addListener("peakHold", "input", function () {
        updateValueDisplay('peakHold', 'peakHoldValue');
        if (audioMotion) audioMotion.peakHoldTime = parseInt(this.value);
    });

    // Display
    addListener("showFPS", "click", function () {
        const active = this.dataset.active === '1';
        this.dataset.active = active ? '0' : '1';
        if (audioMotion) audioMotion.showFPS = !active;
    });

    addListener("loRes", "click", function () {
        const active = this.dataset.active === '1';
        this.dataset.active = active ? '0' : '1';
        if (audioMotion) audioMotion.loRes = !active;
    });

    // General
    addListener("maxFPS", "change", function () {
        if (audioMotion) audioMotion.maxFPS = parseInt(this.value);
    });

    addListener("fsHeight", "input", function () {
        const val = parseInt(this.value);
        const display = document.getElementById('fsHeightValue');
        if (display) display.textContent = val + '%';
    });

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

// ===========================
// PRESET FUNCTIONS
// ===========================
function applySelectedPreset() {
    const presetSelect = document.getElementById('presetSelect');
    if (!presetSelect || !presetSelect.value) {
        alert('Please select a preset first');
        return;
    }

    const presetKey = presetSelect.value;
    let preset = null;

    if (builtInPresets[presetKey]) {
        preset = builtInPresets[presetKey].options;
    } else {
        const userPresets = JSON.parse(localStorage.getItem('spectrum_presets') || '{}');
        if (userPresets[presetKey]) {
            preset = userPresets[presetKey];
        }
    }

    if (preset) {
        applyPreset(preset);
        alert(`Preset "${builtInPresets[presetKey]?.name || presetKey}" applied!`);
    }
}

function savePreset() {
    const name = prompt('Enter a name for this preset:');
    if (!name || !name.trim()) return;

    const trimmedName = name.trim();
    const preset = getCurrentSettings();

    const userPresets = JSON.parse(localStorage.getItem('spectrum_presets') || '{}');
    userPresets[trimmedName] = preset;
    localStorage.setItem('spectrum_presets', JSON.stringify(userPresets));

    const presetSelect = document.getElementById('presetSelect');
    if (presetSelect) {
        let optionExists = false;
        for (let i = 0; i < presetSelect.options.length; i++) {
            if (presetSelect.options[i].value === trimmedName) {
                optionExists = true;
                break;
            }
        }

        if (!optionExists) {
            const option = document.createElement('option');
            option.value = trimmedName;
            option.textContent = '📌 ' + trimmedName;
            presetSelect.appendChild(option);
        }
    }

    alert(`Preset "${trimmedName}" saved!`);
}

function getCurrentSettings() {
    return {
        mode: parseInt(getSelectedRadio('mode') || 10),
        gradient: document.getElementById('gradient')?.value || 'prism',
        gradientRight: document.getElementById('gradientRight')?.value || 'prism',
        colorMode: getSelectedRadio('colorModeSelect') || 'gradient',
        sensitivity: parseInt(getSelectedRadio('sensitivitySelect') || 1),
        alphaBars: document.getElementById('alphaBars')?.dataset.active === '1',
        lumiBars: document.getElementById('lumiBars')?.dataset.active === '1',
        ledBars: document.getElementById('ledBars')?.dataset.active === '1',
        outlineBars: document.getElementById('outlineBars')?.dataset.active === '1',
        radial: document.getElementById('radial')?.dataset.active === '1',
        roundBars: document.getElementById('roundBars')?.dataset.active === '1',
        reflexRatio: getSelectedRadio('reflexSelect') || '0',
        showScaleX: getSelectedRadio('scaleXSelect') || '1',
        showScaleY: getSelectedRadio('scaleYSelect') || '0',
        channelLayout: document.getElementById('channelLayout')?.value || 'single',
        mirror: getSelectedRadio('mirrorSelect') || '0',
        freqScale: getSelectedRadio('freqScaleSelect') || 'log',
        minFreq: parseInt(document.getElementById('minFreq')?.value || 20),
        maxFreq: parseInt(document.getElementById('maxFreq')?.value || 22000),
        barSpace: parseFloat(document.getElementById('barSpace')?.value || 0.1),
        fillAlpha: parseFloat(document.getElementById('fillAlpha')?.value || 0.3),
        volume: parseFloat(document.getElementById('volume')?.value || 0),
        lineWidth: parseFloat(document.getElementById('lineWidth')?.value || 0),
        radius: parseFloat(document.getElementById('radius')?.value || 0.3),
        spinSpeed: parseFloat(document.getElementById('spinSpeed')?.value || 0),
        fftSize: parseInt(document.getElementById('fftSize')?.value || 8192),
        smoothing: parseFloat(document.getElementById('smoothing')?.value || 0.7),
        ansiBands: getSelectedRadio('ansiBandsSelect') || '0',
        linearAmplitude: getSelectedRadio('linearAmplitudeSelect') || '1',
        weightingFilter: document.getElementById('weightingFilter')?.value || '',
        gravity: parseFloat(document.getElementById('gravity')?.value || 3.8),
        peakFade: parseInt(document.getElementById('peakFade')?.value || 750),
        peakHold: parseInt(document.getElementById('peakHold')?.value || 500),
        maxFPS: parseInt(document.getElementById('maxFPS')?.value || 60),
        linkGrads: document.getElementById('linkGrads')?.dataset.active === '1',
        splitGrad: document.getElementById('splitGrad')?.dataset.active === '1',
        showFPS: document.getElementById('showFPS')?.dataset.active === '1',
        loRes: document.getElementById('loRes')?.dataset.active === '1'
    };
}

function applyPreset(preset) {
    if (!preset || !audioMotion) return;

    console.log('[Preset] Applying:', preset);

    if (preset.mode !== undefined) {
        audioMotion.mode = parseInt(preset.mode);
        setRadioValue('modeSelect', preset.mode.toString());
    }

    if (preset.gradient) {
        audioMotion.gradient = preset.gradient;
        const gradSelect = document.getElementById('gradient');
        if (gradSelect) gradSelect.value = preset.gradient;
    }

    if (preset.gradientRight) {
        audioMotion.gradientRight = preset.gradientRight;
        const gradRight = document.getElementById('gradientRight');
        if (gradRight) gradRight.value = preset.gradientRight;
    }

    if (preset.colorMode) {
        audioMotion.colorMode = preset.colorMode;
        setRadioValue('colorModeSelect', preset.colorMode);
    }

    if (preset.sensitivity !== undefined) {
        const sensitivityPresets = [
            { min: -70, max: -20, boost: 1 },
            { min: -85, max: -25, boost: 1.6 },
            { min: -100, max: -30, boost: 2.4 }
        ];
        const sens = parseInt(preset.sensitivity);
        if (sensitivityPresets[sens]) {
            const { min, max, boost } = sensitivityPresets[sens];
            audioMotion.minDecibels = min;
            audioMotion.maxDecibels = max;
            audioMotion.linearBoost = boost;
            setRadioValue('sensitivitySelect', sens.toString());
        }
    }

    const effects = ['alphaBars', 'lumiBars', 'ledBars', 'outlineBars', 'radial', 'roundBars'];
    effects.forEach(effect => {
        if (preset[effect] !== undefined) {
            audioMotion[effect] = preset[effect];
            const el = document.getElementById(effect);
            if (el) el.dataset.active = preset[effect] ? '1' : '0';
        }
    });

    if (preset.reflexRatio !== undefined) {
        if (preset.reflexRatio === 0.25) {
            audioMotion.reflexRatio = 0.25;
            audioMotion.reflexAlpha = 0.2;
            setRadioValue('reflexSelect', '3');
        } else if (preset.reflexRatio === 0.4) {
            audioMotion.reflexRatio = 0.4;
            audioMotion.reflexAlpha = 0.2;
            setRadioValue('reflexSelect', '1');
        } else if (preset.reflexRatio === 0.5) {
            audioMotion.reflexRatio = 0.5;
            audioMotion.reflexAlpha = 1;
            setRadioValue('reflexSelect', '2');
        } else {
            audioMotion.reflexRatio = 0;
            setRadioValue('reflexSelect', '0');
        }
    }

    if (preset.showScaleX !== undefined) {
        const val = preset.showScaleX.toString();
        audioMotion.showScaleX = preset.showScaleX !== '0';
        audioMotion.noteLabels = preset.showScaleX === '2';
        setRadioValue('scaleXSelect', val);
    }

    if (preset.showScaleY !== undefined) {
        audioMotion.showScaleY = parseInt(preset.showScaleY);
        setRadioValue('scaleYSelect', preset.showScaleY.toString());
    }

    if (preset.channelLayout) {
        audioMotion.channelLayout = preset.channelLayout;
        const channelSelect = document.getElementById('channelLayout');
        if (channelSelect) channelSelect.value = preset.channelLayout;
    }

    if (preset.mirror !== undefined) {
        audioMotion.mirror = parseInt(preset.mirror);
        setRadioValue('mirrorSelect', preset.mirror.toString());
    }

    if (preset.freqScale) {
        audioMotion.frequencyScale = preset.freqScale;
        setRadioValue('freqScaleSelect', preset.freqScale);
    }

    if (preset.minFreq) {
        audioMotion.minFreq = preset.minFreq;
        const minFreqInput = document.getElementById('minFreq');
        if (minFreqInput) minFreqInput.value = preset.minFreq;
    }

    if (preset.maxFreq) {
        audioMotion.maxFreq = preset.maxFreq;
        const maxFreqInput = document.getElementById('maxFreq');
        if (maxFreqInput) maxFreqInput.value = preset.maxFreq;
    }

    updateFreqRange();

    if (preset.barSpace !== undefined) {
        audioMotion.barSpace = preset.barSpace;
        const barSpaceInput = document.getElementById('barSpace');
        if (barSpaceInput) {
            barSpaceInput.value = preset.barSpace;
            updateValueDisplay('barSpace', 'barSpaceValue');
        }
    }

    if (preset.fillAlpha !== undefined) {
        audioMotion.fillAlpha = preset.fillAlpha;
        const fillAlphaInput = document.getElementById('fillAlpha');
        if (fillAlphaInput) {
            fillAlphaInput.value = preset.fillAlpha;
            updateValueDisplay('fillAlpha', 'fillAlphaValue');
        }
    }

    if (preset.lineWidth !== undefined) {
        audioMotion.lineWidth = preset.lineWidth;
        const lineWidthInput = document.getElementById('lineWidth');
        if (lineWidthInput) {
            lineWidthInput.value = preset.lineWidth;
            updateValueDisplay('lineWidth', 'lineWidthValue');
        }
    }

    if (preset.radius !== undefined) {
        audioMotion.radius = preset.radius;
        const radiusInput = document.getElementById('radius');
        if (radiusInput) {
            radiusInput.value = preset.radius;
            updateValueDisplay('radius', 'radiusValue');
        }
    }

    if (preset.spinSpeed !== undefined) {
        audioMotion.spinSpeed = preset.spinSpeed;
        const spinInput = document.getElementById('spinSpeed');
        if (spinInput) {
            spinInput.value = preset.spinSpeed;
            updateValueDisplay('spinSpeed', 'spinSpeedValue');
        }
    }

    if (preset.fftSize) {
        audioMotion.fftSize = preset.fftSize;
        const fftSelect = document.getElementById('fftSize');
        if (fftSelect) fftSelect.value = preset.fftSize;
    }

    if (preset.smoothing !== undefined) {
        audioMotion.smoothing = preset.smoothing;
        const smoothInput = document.getElementById('smoothing');
        if (smoothInput) {
            smoothInput.value = preset.smoothing;
            updateValueDisplay('smoothing', 'smoothingValue');
        }
    }

    if (preset.ansiBands !== undefined) {
        audioMotion.ansiBands = parseInt(preset.ansiBands);
        setRadioValue('ansiBandsSelect', preset.ansiBands.toString());
    }

    if (preset.linearAmplitude !== undefined) {
        audioMotion.linearAmplitude = parseInt(preset.linearAmplitude);
        setRadioValue('linearAmplitudeSelect', preset.linearAmplitude.toString());
    }

    if (preset.weightingFilter !== undefined) {
        audioMotion.weightingFilter = preset.weightingFilter;
        const weightSelect = document.getElementById('weightingFilter');
        if (weightSelect) weightSelect.value = preset.weightingFilter;
    }

    if (preset.gravity !== undefined) {
        audioMotion.gravity = preset.gravity;
        const gravityInput = document.getElementById('gravity');
        if (gravityInput) {
            gravityInput.value = preset.gravity;
            updateValueDisplay('gravity', 'gravityValue');
        }
    }

    if (preset.peakFade !== undefined) {
        audioMotion.peakFadeTime = preset.peakFade;
        const peakFadeInput = document.getElementById('peakFade');
        if (peakFadeInput) {
            peakFadeInput.value = preset.peakFade;
            updateValueDisplay('peakFade', 'peakFadeValue');
        }
    }

    if (preset.peakHold !== undefined) {
        audioMotion.peakHoldTime = preset.peakHold;
        const peakHoldInput = document.getElementById('peakHold');
        if (peakHoldInput) {
            peakHoldInput.value = preset.peakHold;
            updateValueDisplay('peakHold', 'peakHoldValue');
        }
    }

    if (preset.maxFPS !== undefined) {
        audioMotion.maxFPS = preset.maxFPS;
        const maxFPSSelect = document.getElementById('maxFPS');
        if (maxFPSSelect) maxFPSSelect.value = preset.maxFPS;
    }

    if (preset.showFPS !== undefined) {
        audioMotion.showFPS = preset.showFPS;
        const showFPSEl = document.getElementById('showFPS');
        if (showFPSEl) showFPSEl.dataset.active = preset.showFPS ? '1' : '0';
    }

    if (preset.loRes !== undefined) {
        audioMotion.loRes = preset.loRes;
        const loResEl = document.getElementById('loRes');
        if (loResEl) loResEl.dataset.active = preset.loRes ? '1' : '0';
    }

    if (preset.linkGrads !== undefined) {
        const linkEl = document.getElementById('linkGrads');
        if (linkEl) linkEl.dataset.active = preset.linkGrads ? '1' : '0';
    }

    if (preset.splitGrad !== undefined) {
        audioMotion.splitGradient = preset.splitGrad;
        const splitEl = document.getElementById('splitGrad');
        if (splitEl) splitEl.dataset.active = preset.splitGrad ? '1' : '0';
    }

    console.log('[Preset] Applied successfully');
}

// ===========================
// HELPER FUNCTIONS
// ===========================
function getSelectedRadio(formId) {
    const form = document.getElementById(formId);
    if (!form) return null;
    const selected = form.querySelector('input[type="radio"]:checked');
    return selected ? selected.value : null;
}

function setRadioValue(formId, value) {
    const form = document.getElementById(formId);
    if (!form) return;
    const radio = form.querySelector(`input[value="${value}"]`);
    if (radio) radio.checked = true;
}

function updateValueDisplay(inputId, displayId) {
    const input = document.getElementById(inputId);
    const display = document.getElementById(displayId);
    if (!input || !display) return;

    const value = parseFloat(input.value);

    if (inputId === 'spinSpeed') {
        if (value === 0) {
            display.textContent = 'OFF';
        } else {
            display.textContent = `${Math.abs(value)} RPM ${value < 0 ? '(CCW)' : ''}`;
        }
    } else if (inputId.includes('peak') || inputId === 'peakFade' || inputId === 'peakHold') {
        display.textContent = `${value}ms`;
    } else {
        display.textContent = value.toFixed(2);
    }
}

function updateValueDisplays() {
    const displays = [
        'barSpace', 'fillAlpha', 'lineWidth', 'radius', 'spinSpeed',
        'smoothing', 'gravity', 'peakFade', 'peakHold', 'volume'
    ];

    displays.forEach(id => {
        const displayId = id + 'Value';
        updateValueDisplay(id, displayId);
    });
}

function updateFreqRange() {
    const minFreq = parseInt(document.getElementById("minFreq")?.value) || 20;
    const maxFreq = parseInt(document.getElementById("maxFreq")?.value) || 22000;
    const display = document.getElementById("freqRangeValue");
    if (display) {
        display.textContent = `${minFreq}Hz - ${(maxFreq / 1000).toFixed(1)}kHz`;
    }

    if (audioMotion) {
        audioMotion.minFreq = minFreq;
        audioMotion.maxFreq = maxFreq;
    }
}

function loadUserPresets() {
    const userPresets = JSON.parse(localStorage.getItem('spectrum_presets') || '{}');
    const presetSelect = document.getElementById('presetSelect');

    if (presetSelect && Object.keys(userPresets).length > 0) {
        Object.keys(userPresets).forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = `📌 ${name}`;
            presetSelect.appendChild(option);
        });
    }
}

// ===========================
// BACKGROUND MANAGEMENT
// ===========================
function updateBackgroundControls() {
    const bgType = document.getElementById("bgType");
    if (!bgType) return;

    const imageLabel = document.getElementById("bgImageLabel");
    const imageSelect = document.getElementById("bgImage");

    // hide everything first
    if (imageLabel) imageLabel.style.display = "none";
    if (imageSelect) imageSelect.style.display = "none";

    // New behavior: "Background Image" is used for both images and videos (Select Media)
    if (bgType.value === "image") {
        if (imageLabel) imageLabel.style.display = "block";
        if (imageSelect) imageSelect.style.display = "block";
    }
}

async function refreshBackgroundFiles() {
    try {
        const response = await fetch('/api/backgrounds');
        if (!response.ok) {
            console.warn('[BG] Cannot load background files');
            backgroundFiles.images = [];
            backgroundFiles.videos = [];
        } else {
            const files = await response.json();
            backgroundFiles.images = files.images || [];
            backgroundFiles.videos = files.videos || [];
        }

        console.log('[BG] Found:', {
            images: backgroundFiles.images.length,
            videos: backgroundFiles.videos.length
        });

        populateBackgroundSelects();

    } catch (e) {
        console.error('[BG] Error loading background files:', e);
        backgroundFiles.images = [];
        backgroundFiles.videos = [];
        populateBackgroundSelects();
    }
}

function populateBackgroundSelects() {
    const fileSelect = document.getElementById("bgFile");
    if (!fileSelect) return;

    fileSelect.innerHTML = '<option value="">-- Select File --</option>';

    const combined = [
        ...backgroundFiles.images.map(f => ({ file: f, type: 'image' })),
        ...backgroundFiles.videos.map(f => ({ file: f, type: 'video' }))
    ];

    if (combined.length > 0) {
        fileSelect.innerHTML += '<option value="random">🎲 Random</option>';
    }

    combined.forEach(item => {
        const option = document.createElement('option');
        option.value = item.file;
        option.dataset.type = item.type;
        option.textContent = `${item.type === 'video' ? '📹 ' : ''}${decodeURIComponent(item.file)}`;
        fileSelect.appendChild(option);
    });

    console.log("[BG] Populate:", combined);
}

function applyBackground() {
    const bgType = document.getElementById("bgType");
    if (!bgType) return;

    const bgLayer = document.getElementById("backgroundLayer");
    if (!bgLayer) return;

    if (bgVideo && bgVideo.parentNode) {
        bgVideo.pause();
        bgVideo.src = '';
        bgVideo.parentNode.removeChild(bgVideo);
        bgVideo = null;
    }

    bgLayer.style.backgroundImage = '';
    bgLayer.style.backgroundColor = '#0a0e14';

    if (bgType.value === "none") {
        console.log('[BG] Applied: None');
    } else if (bgType.value === "cover") {
        updateCoverBackground();
    } else if (bgType.value === "file") {
        // Note: "image" now means "media" (images + videos)
        const mediaSelect = document.getElementById("bgFile");
        if (!mediaSelect) return;

        const selected = mediaSelect.value;
        if (!selected) return;

        // build combined list for random selection
        const combined = [...backgroundFiles.images.map(f => ({ file: f, type: 'image' })), ...backgroundFiles.videos.map(f => ({ file: f, type: 'video' }))];

        let chosen = null;
        if (selected === "random") {
            if (combined.length === 0) return;
            const idx = Math.floor(Math.random() * combined.length);
            chosen = combined[idx];
        } else {
            // find whether it's an image or video (option.dataset.type may be present)
            const opt = mediaSelect.selectedOptions[0];
            const type = opt?.dataset?.type || (backgroundFiles.videos.includes(selected) ? 'video' : 'image');
            chosen = { file: selected, type };
        }

        if (!chosen) return;

        if (chosen.type === 'video') {
            const videoFile = chosen.file;
            bgVideo = document.createElement('video');
            bgVideo.loop = true;
            bgVideo.muted = true;
            bgVideo.autoplay = true;
            bgVideo.playsInline = true;
            bgVideo.style.position = 'absolute';
            bgVideo.style.top = '0';
            bgVideo.style.left = '0';
            bgVideo.style.width = '100%';
            bgVideo.style.height = '100%';
            bgVideo.style.objectFit = document.getElementById("bgFit")?.value || 'cover';
            bgVideo.style.zIndex = '0';
            bgVideo.style.pointerEvents = 'none';

            bgLayer.appendChild(bgVideo);

            bgVideo.src = `backgrounds/${encodeURIComponent(videoFile)}`;
            bgVideo.play()
                .then(() => console.log('[BG] Video playing:', videoFile))
                .catch(e => console.error('[BG] Video play error:', e));

            currentBackground = bgVideo;
        } else {
            const imageFile = chosen.file;
            const imageUrl = `backgrounds/${encodeURIComponent(imageFile)}`;
            bgLayer.style.backgroundImage = `url('${imageUrl}')`;
            bgLayer.style.backgroundSize = document.getElementById("bgFit")?.value || 'cover';
            bgLayer.style.backgroundPosition = 'center';
            bgLayer.style.backgroundRepeat = 'no-repeat';
            currentBackground = imageFile;
            console.log('[BG] Applied image:', imageFile);
        }
    }

    const bgDim = document.getElementById("bgDim");
    if (bgDim) {
        updateBackgroundDim(parseFloat(bgDim.value));
    }
}


function updateCoverBackground() {
    const bgType = document.getElementById("bgType");
    if (!bgType || bgType.value !== "cover") return;

    const artImg = document.getElementById('trackArt');
    const bgLayer = document.getElementById("backgroundLayer");

    if (bgLayer && artImg && artImg.src && artImg.src !== window.location.href) {
        bgLayer.style.backgroundImage = `url('${artImg.src}')`;
        bgLayer.style.backgroundSize = document.getElementById("bgFit")?.value || 'cover';
        bgLayer.style.backgroundPosition = 'center';
        bgLayer.style.backgroundRepeat = 'no-repeat';
        console.log('[BG] Applied album cover');
    }
}

function updateBackgroundDim(value) {
    const bgLayer = document.getElementById("backgroundLayer");
    if (bgLayer) {
        bgLayer.style.filter = `brightness(${value})`;
    }
}

function updateBackgroundFit(fit) {
    const bgLayer = document.getElementById("backgroundLayer");
    if (bgLayer) {
        bgLayer.style.backgroundSize = fit;
    }

    if (bgVideo) {
        bgVideo.style.objectFit = fit;
    }

    console.log('[BG] Fit changed to:', fit);
}

// ===========================
// IMPORT/EXPORT
// ===========================
function exportSettings() {
    const settings = getCurrentSettings();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "spectrum-settings.json");
    downloadAnchor.click();
    console.log('[Export] Settings exported');
}

function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const settings = JSON.parse(e.target.result);
            applyPreset(settings);
            alert('Settings imported successfully!');
            console.log('[Import] Settings imported');
        } catch (error) {
            alert('Error importing settings: ' + error.message);
            console.error('[Import] Error:', error);
        }
    };
    reader.readAsText(file);
}

// ===========================
// VOLUMIO INTEGRATION
// ===========================
function getVolumioUrl() {
    return getVolumioApiUrl();
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateProgressBar() {
    const progressFill = document.getElementById("progressFill");
    const currentTimeEl = document.getElementById("currentTime");

    if (!progressFill || !currentTimeEl) return;

    fetchVolumioState(true);
}

async function fetchVolumioState(progressOnly = false) {
    try {
        const response = await fetch(`${getVolumioUrl()}/api/v1/getState`);
        if (!response.ok) throw new Error('Failed to fetch state');

        const state = await response.json();

        if (progressOnly) {
            updateProgress(state);
        } else {
            updateNowPlaying(state);
        }
    } catch (e) {
        console.warn('[Volumio] Failed to fetch state:', e.message);
    }
}

function updateProgress(state) {
    const progressFill = document.getElementById("progressFill");
    const currentTimeEl = document.getElementById("currentTime");
    const durationEl = document.getElementById("duration");

    if (!progressFill || !currentTimeEl || !durationEl) return;

    if (state && state.duration) {
        const current = state.seek ? state.seek / 1000 : 0;
        const duration = state.duration || 0;
        const percentage = duration > 0 ? (current / duration) * 100 : 0;

        progressFill.style.width = percentage + '%';
        currentTimeEl.textContent = formatTime(current);
        durationEl.textContent = formatTime(duration);
    } else {
        progressFill.style.width = '0%';
        currentTimeEl.textContent = '0:00';
        durationEl.textContent = '0:00';
    }
}

function updateNowPlaying(state) {
    const nowPlaying = document.getElementById('nowPlaying');
    const playPauseBtn = document.getElementById('playPauseBtn');

    if (!nowPlaying) return;

    if (state && (state.status === 'play' || state.status === 'pause')) {
        const setTextContent = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        setTextContent('trackTitle', state.title || 'Unknown Title');
        setTextContent('trackArtist', state.artist || 'Unknown Artist');
        setTextContent('trackAlbum', state.album || 'Unknown Album');

        const artImg = document.getElementById('trackArt');
        if (artImg && state.albumart) {
            artImg.src = state.albumart.startsWith('http') ? state.albumart :
                `${getVolumioUrl()}${state.albumart}`;
        }

        setTimeout(() => updateCoverBackground(), 100);
        updateProgress(state);

        if (state.status === 'play') {
            if (!progressInterval) {
                progressInterval = setInterval(updateProgressBar, 1000);
            }
        } else {
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
        }

        if (playPauseBtn) {
            if (state.status === 'play') {
                playPauseBtn.innerHTML = '⏸';
                playPauseBtn.title = 'Pause';
            } else {
                playPauseBtn.innerHTML = '▶';
                playPauseBtn.title = 'Play';
            }
        }

        nowPlaying.classList.remove('hidden');
        nowPlaying.classList.add('show');
    } else {
        // THÊM DÒNG NÀY
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
        // KẾT THÚC THÊM
        nowPlaying.classList.remove('show');
        setTimeout(() => nowPlaying.classList.add('hidden'), 300);
    }
}

// ===========================
// QUEUE MANAGEMENT
// ===========================
function toggleQueue() {
    queuePanelVisible = !queuePanelVisible;
    const panel = document.getElementById('queuePanel');
    const controlBar = document.getElementById('controlBar');

    if (queuePanelVisible) {
        panel.classList.add('show');
        if (controlBar) {
            controlBar.classList.add('with-queue');
        }
        fetchQueue();
    } else {
        panel.classList.remove('show');
        if (controlBar) {
            controlBar.classList.remove('with-queue');
        }
    }
}

async function fetchQueue() {
    try {
        const volumioUrl = getVolumioUrl();
        console.log('[Queue] Fetching from:', `${volumioUrl}/api/v1/getQueue`);
        const response = await fetch(`${volumioUrl}/api/v1/getQueue`);
        if (!response.ok) throw new Error(`API returned ${response.status}`);

        const data = await response.json();
        console.log('[Queue] Response:', data);

        // Volumio returns { queue: [...] } structure or direct array
        const queue = Array.isArray(data) ? data : (data.queue || []);
        console.log('[Queue] Parsed queue length:', queue.length);
        displayQueue(queue);
    } catch (e) {
        console.error('[Queue] Failed to fetch:', e);
        const queueList = document.getElementById('queueList');
        if (queueList) {
            queueList.innerHTML = `<div style="padding: 20px; text-align: center; color: #f87171;">Error: ${e.message}</div>`;
        }
    }
}

async function displayQueue(queue) {
    const queueList = document.getElementById('queueList');
    if (!queueList) return;

    if (!Array.isArray(queue)) {
        console.error('[Queue] Queue is not an array:', queue);
        queueList.innerHTML = '<div style="padding: 20px; text-align: center; color: #f87171;">Invalid queue format</div>';
        return;
    }

    let currentPosition = -1;
    try {
        const stateResponse = await fetch(`${getVolumioUrl()}/api/v1/getState`);
        if (stateResponse.ok) {
            const state = await stateResponse.json();
            currentPosition = state.position !== undefined ? state.position : -1;
            console.log('[Queue] Current position:', currentPosition);
        }
    } catch (e) {
        console.warn('[Queue] Could not get current position:', e);
    }

    if (queue.length === 0) {
        queueList.innerHTML = '<div style="padding: 20px; text-align: center; color: #8b9dc3;">Queue is empty</div>';
        return;
    }

    queueList.innerHTML = '';
    console.log('[Queue] Displaying', queue.length, 'tracks');

    queue.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'queue-item';
        if (index === currentPosition) {
            item.classList.add('playing');
        }

        // Extract title and artist with fallbacks
        const title = track.name || track.title || 'Unknown Track';
        const artist = track.artist || (track.artists ? track.artists.join(', ') : 'Unknown Artist');

        // Handle album art from various possible locations
        let albumart = '';
        if (track.albumart) {
            albumart = track.albumart.startsWith('http') ? track.albumart : `${getVolumioUrl()}${track.albumart}`;
        } else if (track.image) {
            albumart = track.image.startsWith('http') ? track.image : `${getVolumioUrl()}${track.image}`;
        }

        item.innerHTML = `
            <div class="queue-item-index">${index + 1}</div>
            <div class="queue-item-art">
                ${albumart ? `<img src="${albumart}" alt="" onerror="this.style.display='none'">` : ''}
            </div>
            <div class="queue-item-info">
                <div class="queue-item-title">${title}</div>
                <div class="queue-item-artist">${artist}</div>
            </div>
        `;

        item.onclick = () => playQueueItem(index);
        queueList.appendChild(item);
    });
}

async function playQueueItem(position) {
    try {
        const volumioUrl = getVolumioUrl();
        // Volumio API: play specific queue index
        const url = `${volumioUrl}/api/v1/commands/?cmd=play&N=${position}`;
        console.log('[Queue] Playing position:', position, 'URL:', url);
        const response = await fetch(url);
        if (response.ok) {
            console.log('[Queue] Playing item at position:', position);
            setTimeout(() => {
                fetchVolumioState();
                fetchQueue();
            }, 200);
        } else {
            console.error('[Queue] Play failed:', response.status);
        }
    } catch (e) {
        console.error('[Queue] Play error:', e);
    }
}

async function volumioTogglePlay() {
    try {
        const response = await fetch(`${getVolumioUrl()}/api/v1/commands/?cmd=toggle`);
        if (response.ok) {
            console.log('[Volumio] Toggle play/pause');
            setTimeout(() => fetchVolumioState(), 200);
        }
    } catch (e) {
        console.error('[Volumio] Toggle error:', e);
    }
}

async function volumioPrevious() {
    try {
        const response = await fetch(`${getVolumioUrl()}/api/v1/commands/?cmd=prev`);
        if (response.ok) {
            console.log('[Volumio] Previous track');
            setTimeout(() => fetchVolumioState(), 200);
        }
    } catch (e) {
        console.error('[Volumio] Previous error:', e);
    }
}

async function volumioNext() {
    try {
        const response = await fetch(`${getVolumioUrl()}/api/v1/commands/?cmd=next`);
        if (response.ok) {
            console.log('[Volumio] Next track');
            setTimeout(() => fetchVolumioState(), 200);
        }
    } catch (e) {
        console.error('[Volumio] Next error:', e);
    }
}

async function testVolumioConnection() {
    try {
        const response = await fetch(`${getVolumioUrl()}/api/v1/getState`);
        if (response.ok) {
            alert('✓ Connected to Volumio successfully!');
            fetchVolumioState();
        } else {
            alert('✗ Failed to connect to Volumio');
        }
    } catch (e) {
        alert('✗ Connection error: ' + e.message);
    }
}

// ===========================
// WEBSOCKET
// ===========================
function updateStatus(status) {
    const el = document.getElementById("status");
    if (!el) return;
    el.className = 'control-item ' + status;
    el.textContent = status === 'connected' ? '● Connected' :
        status === 'connecting' ? '● Connecting' : '● Disconnected';
}

function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    const wsUrl = getWebSocketUrl();

    if (!forceConnected) updateStatus('connecting');
    console.log('[WS] Connecting to:', wsUrl);

    try {
        ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        // Clear any existing timeout
        if (wsConnectTimeout) {
            clearTimeout(wsConnectTimeout);
            wsConnectTimeout = null;
        }

        // Set connection timeout
        wsConnectTimeout = setTimeout(() => {
            if (ws && ws.readyState === WebSocket.CONNECTING) {
                console.warn('[WS] Connection timeout');
                if (!forceConnected) updateStatus('disconnected');
                try { ws.close(); } catch (e) { }
            }
        }, 8000);

        ws.onopen = () => {
            if (wsConnectTimeout) {
                clearTimeout(wsConnectTimeout);
                wsConnectTimeout = null;
            }
            console.log('[WS] Connected');
            updateStatus('connected');
            forceConnected = false;
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        };

        ws.onmessage = (event) => {
            try {
                if (typeof event.data === 'string') {
                    const data = JSON.parse(event.data);
                    if (data.type === 'settings') {
                        console.log('[WS] Received settings update');
                        applyServerSettings(data.data);
                    } else if (data.type === 'format') {
                        audioFormat = {
                            sampleRate: data.sampleRate,
                            channels: data.channels,
                            bitsPerSample: data.bitsPerSample
                        };
                        console.log('[WS] Format:', audioFormat);
                        console.log('[WS] Ready for audio. Show prompt for user to start.');

                        // Show prompt for user to start audio (requires user gesture)
                        const prompt = document.getElementById('clickPrompt');
                        if (prompt) {
                            prompt.classList.remove('hidden');
                        }
                    }
                } else {
                    // Feed audio data to PCM player and AudioMotion analyzer
                    // This enables visualization even if audio hasn't been explicitly started
                    if (pcmPlayer) {
                        pcmPlayer.feed(new Uint8Array(event.data));
                        dataReceived++;
                        frameCount++;
                    }
                }
            } catch (e) {
                console.error('[WS] Message error:', e);
            }
        };

        ws.onerror = (err) => {
            if (wsConnectTimeout) {
                clearTimeout(wsConnectTimeout);
                wsConnectTimeout = null;
            }
            console.error('[WS] Error:', err);
            if (!forceConnected) updateStatus('disconnected');
        };

        ws.onclose = () => {
            if (wsConnectTimeout) {
                clearTimeout(wsConnectTimeout);
                wsConnectTimeout = null;
            }
            console.log('[WS] Closed');
            if (!forceConnected) updateStatus('disconnected');
            ws = null;
            if (!reconnectTimer) {
                reconnectTimer = setTimeout(() => connectWebSocket(), 3000);
            }
        };

    } catch (e) {
        if (wsConnectTimeout) {
            clearTimeout(wsConnectTimeout);
            wsConnectTimeout = null;
        }
        console.error('[WS] Connection error:', e);
        if (!forceConnected) updateStatus('disconnected');
        if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => connectWebSocket(), 5000);
        }
    }
}

function reconnectWebSocket() {
    if (ws) ws.close();
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    setTimeout(() => connectWebSocket(), 100);
}

// ===========================
// AUDIO START
// ===========================
async function startAudio() {
    if (audioStarted) {
        console.log('[Audio] Already started');
        return;
    }
    console.log('[Audio] Starting...');
    try {
        if (!sharedAudioContext) {
            sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: audioFormat.sampleRate || 44100
            });
        }

        if (sharedAudioContext.state === 'suspended') {
            await sharedAudioContext.resume();
        }

        if (sharedAudioContext.state !== 'running') {
            throw new Error('AudioContext not running');
        }
        pcmPlayer = new PCMPlayer(audioFormat, sharedAudioContext);
        window.pcmPlayer = pcmPlayer;
        if (audioMotion && pcmPlayer) {
            audioMotion.connectInput(pcmPlayer.getSourceNode());
        }
        audioStarted = true;

        // Hide click prompt
        const prompt = document.getElementById('clickPrompt');
        if (prompt) {
            prompt.classList.add('hidden');
        }
        // Start Volumio state polling
        fetchVolumioState();
        if (volumioStateInterval) clearInterval(volumioStateInterval);
        volumioStateInterval = setInterval(fetchVolumioState, 2000);

        console.log('[Audio] ✓ Started successfully');
        
    } catch (e) {
        console.warn('[Audio] Start failed:', e.message);
        const prompt = document.getElementById('clickPrompt');
        if (prompt) {
            prompt.classList.remove('hidden');
        }
    }
}



// Setup global click handler to enable audio on user interaction
function setupUserInteractionHandler() {
    const handleUserInteraction = async () => {
        try {
            await startAudio();
        } catch (e) {
            console.error('[Audio] Failed to start after user interaction:', e);
        }
    };

    // Listen for click on the prompt button
    const promptButton = document.getElementById('startAudioBtn');
    if (promptButton) {
        promptButton.addEventListener('click', handleUserInteraction);
        console.log('[Audio] User interaction handler ready');
    }
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
                    const state = await stateResponse.json();
                    if (state.duration) {
                        const seekPosition = Math.floor(percentage * state.duration);
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
// FPS COUNTER
// ===========================
function updateFPS() {
    const now = Date.now();
    const elapsed = now - lastFpsTime;
    const fps = Math.round((frameCount * 1000) / elapsed);

    const bufferMs = pcmPlayer ?
        Math.floor(pcmPlayer.buffer.length / audioFormat.sampleRate / audioFormat.channels * 1000) : 0;

    const counter = document.getElementById("fpsCounter");
    if (counter) {
        counter.textContent = `FPS: ${fps} | Packets: ${dataReceived} | Buf: ${bufferMs}ms`;
    }

    frameCount = 0;
    lastFpsTime = now;
}

// ===========================
// AUDIOMOTION INIT
// ===========================
async function initAudioMotion() {
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

        sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 44100
        });

        console.log('[AM] Created shared audio context, state:', sharedAudioContext.state);

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
            audioCtx: sharedAudioContext,
            ...defaultConfig,
            ...serverSettings
        };

        console.log('[AM] Config:', serverSettings ? '✓ From server' : 'ℹ Using defaults');
        console.log('[AM] Full config:', config);

        audioMotion = new AudioMotionAnalyzer(container, config);

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
async function fetchServerSettings() {
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
function applyServerSettings(settings) {
    if (!audioMotion) {
        console.warn('[AM] AudioMotion not initialized yet');
        return;
    }

    console.log('[AM] Applying settings update...');

    try {
        // Apply each setting
        for (let key in settings) {
            if (settings.hasOwnProperty(key) && audioMotion.hasOwnProperty(key)) {
                audioMotion[key] = settings[key];
                console.log('[AM] Updated:', key, '=', settings[key]);
            }
        }

        console.log('[AM] ✓ Settings applied successfully');
    } catch (error) {
        console.error('[AM] Error applying settings:', error);
    }
}


async function uploadSettings() {
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
                if (i.checked) settings[i.name] = i.value;
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
function syncUIWithSettings(settings) {
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
            setRadioValue('scaleYSelect', settings.showScaleY.toString());
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

        // Max FPS
        if (settings.maxFPS !== undefined) {
            const select = document.getElementById('maxFPS');
            if (select) select.value = settings.maxFPS;
        }

        // Show FPS
        if (settings.showFPS !== undefined) {
            const el = document.getElementById('showFPS');
            if (el) el.dataset.active = settings.showFPS ? '1' : '0';
        }

        // Lo Res
        if (settings.loRes !== undefined) {
            const el = document.getElementById('loRes');
            if (el) el.dataset.active = settings.loRes ? '1' : '0';
        }

        console.log('[AM] ✓ UI elements synced with server settings');
    } catch (error) {
        console.error('[AM] Error syncing UI:', error);
    }
}

// ===========================
// STARTUP
// ===========================
let initializationStarted = false;

window.addEventListener("DOMContentLoaded", () => {
    // Prevent duplicate initialization
    if (initializationStarted) {
        console.warn('[App] Skipping duplicate initialization');
        return;
    }
    initializationStarted = true;

    console.log('[App] DOM loaded');
    console.log('[Init] Starting on hostname:', getBaseUrl());

    forceConnected = true;
    updateStatus('connected');

    initializeUI();

    // Set auto-detected URLs in input fields
    const wsUrlInput = document.getElementById('wsUrl');
    const volumioUrlInput = document.getElementById('volumioUrl');

    if (wsUrlInput && !wsUrlInput.value.includes(getBaseUrl())) {
        wsUrlInput.value = getWebSocketUrl();
        console.log('[Init] Set WebSocket URL to:', wsUrlInput.value);
    }
    if (volumioUrlInput && !volumioUrlInput.value.includes(getBaseUrl())) {
        volumioUrlInput.value = getVolumioApiUrl();
        console.log('[Init] Set Volumio URL to:', volumioUrlInput.value);
    }

    // Setup user interaction handler for audio
    setupUserInteractionHandler();

    // Initialize AudioMotion (without audio playback)
    setTimeout(() => {
        initAudioMotion().catch(e => {
            console.error('initAudioMotion error:', e);
        });
    }, 100);

    setTimeout(() => { forceConnected = false; }, 5000);
});

window.addEventListener("beforeunload", () => {
    if (ws) ws.close();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (volumioStateInterval) clearInterval(volumioStateInterval);
    if (progressInterval) clearInterval(progressInterval);
    if (sharedAudioContext) sharedAudioContext.close();
});
