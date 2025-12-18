// ===========================
// GLOBALS
// ===========================
let audioMotion = null;
let ws = null;
let pcmPlayer = null;
let mpdPlayer = null;
let currentAudioSource = 'websocket'; // 'websocket' or 'mpd'
let reconnectTimer = null;
let sharedAudioContext = null;
let volumioStateInterval = null;
let volumioSocket = null;
let intentionalDisconnect = false;
let progressInterval = null;
let queuePanelVisible = false;
let wsConnectTimeout = null;
let frameCount = 0;
let dataReceived = 0;
let lastFpsTime = Date.now();
let fpsInterval = null;

// ===========================
// VOLUMIO SOCKET.IO (PUSH UPDATES)
// ===========================
function connectVolumioSocket() {
    if (typeof io === 'undefined') {
        console.warn('[Volumio Socket] Socket.IO client not available; using HTTP polling');
        return;
    }
    try {
        const base = getVolumioUrl(); // e.g., http://host:3000
        console.log('[Volumio Socket] Connecting to', base);
        volumioSocket = io(base, { transports: ['websocket'], path: '/socket.io' });

        volumioSocket.on('connect', () => {
            console.log('[Volumio Socket] Connected');
            // Stop polling if active
            if (volumioStateInterval) {
                clearInterval(volumioStateInterval);
                volumioStateInterval = null;
            }
            // Request initial state/queue
            try { volumioSocket.emit('getState'); } catch (_) {}
            try { volumioSocket.emit('getQueue'); } catch (_) {}
        });

        volumioSocket.on('disconnect', () => {
            console.warn('[Volumio Socket] Disconnected; fallback to polling');
            // Resume polling
            if (!volumioStateInterval) {
                volumioStateInterval = setInterval(fetchVolumioState, 2000);
            }
        });

        volumioSocket.on('pushState', (state) => {
            // console.log('[Volumio Socket] pushState', state);
            updateNowPlaying(state);
        });

        volumioSocket.on('pushQueue', (queue) => {
            // console.log('[Volumio Socket] pushQueue', queue);
            displayQueue(Array.isArray(queue) ? queue : (queue && queue.queue) || []);
        });

    } catch (e) {
        console.warn('[Volumio Socket] Error:', e.message);
    }
}

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
            "linkGrads": false,
            "splitGrad": false,
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
            mode: 6,
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
            mode: 8,
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
        this.analyzerGain = this.audioContext.createGain();
        this.analyzerGain.gain.value = 1.0;
        this.sinkGain = this.audioContext.createGain();
        this.sinkGain.gain.value = 0.0; // silent sink to keep graph pulling
        this.analyzerGain.connect(this.sinkGain);
        this.sinkGain.connect(this.audioContext.destination);

        this.workletReady = false;
        this.useWorklet = !!this.audioContext.audioWorklet;
        this.node = null;

        // Fallback (ScriptProcessor)
        this.scriptNode = null;
        this.buffer = new Float32Array(0);
        this.samplesPlayed = 0;
        this.isFirstChunk = true;

        this.pendingChunks = [];
        console.log('[PCM] Initializing (AudioWorklet preferred)');
    }

    async init() {
        if (this.useWorklet) {
            try {
                await this.audioContext.audioWorklet.addModule('pcm-worklet.js');
                this.node = new AudioWorkletNode(this.audioContext, 'pcm-processor', {
                    numberOfInputs: 0,
                    numberOfOutputs: 1,
                    outputChannelCount: [this.format.channels],
                    channelCount: this.format.channels,
                    channelCountMode: 'explicit',
                    channelInterpretation: 'speakers'
                });
                this.node.connect(this.analyzerGain);
                this.node.port.postMessage({ type: 'config', channels: this.format.channels });
                this.node.port.onmessage = (e) => {
                    const msg = e.data || {};
                    if (msg.type === 'processed') {
                        frameCount++;
                    }
                };
                this.workletReady = true;
                // Drain any queued samples
                if (this.pendingChunks.length) {
                    this.pendingChunks.forEach(arr => this._postSamples(arr));
                    this.pendingChunks = [];
                }
                console.log('[PCM] AudioWorklet ready');
                return;
            } catch (e) {
                console.warn('[PCM] Worklet init failed, falling back:', e.message);
                this.useWorklet = false;
            }
        }

        // Fallback path: ScriptProcessor
        this.scriptNode = this.audioContext.createScriptProcessor(4096, 0, this.format.channels);
        this.scriptNode.onaudioprocess = (e) => this.processAudio(e);
        this.scriptNode.connect(this.analyzerGain);
        const MAX_BUFFER_MS = 500;
        this.maxBufferSamples = Math.max(
            this.format.channels,
            Math.floor((this.audioContext.sampleRate || this.format.sampleRate) * this.format.channels * (MAX_BUFFER_MS / 1000))
        );
        console.log('[PCM] Fallback ScriptProcessor ready');
    }

    _postSamples(floatSamples) {
        if (!this.node) return;
        try {
            this.node.port.postMessage({ type: 'samples', samples: floatSamples }, [floatSamples.buffer]);
        } catch (_) {
            // structured clone fallback if transfer fails
            this.node.port.postMessage({ type: 'samples', samples: floatSamples });
        }
    }

    feed(chunk) {
        const samples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2);
        const floatSamples = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
            floatSamples[i] = samples[i] / 32768.0;
        }

        if (this.useWorklet) {
            if (this.workletReady) this._postSamples(floatSamples);
            else this.pendingChunks.push(floatSamples);
        } else {
            const newBuffer = new Float32Array(this.buffer.length + floatSamples.length);
            newBuffer.set(this.buffer);
            newBuffer.set(floatSamples, this.buffer.length);
            this.buffer = newBuffer;
            if (this.buffer.length > this.maxBufferSamples) {
                const trimmed = new Float32Array(this.maxBufferSamples);
                trimmed.set(this.buffer.subarray(this.buffer.length - this.maxBufferSamples));
                this.buffer = trimmed;
            }
        }

        if (this.isFirstChunk && floatSamples.length > 0) {
            this.isFirstChunk = false;
            console.log('[PCM] Audio data flowing');
        }
    }

    processAudio(e) {
        if (!this.scriptNode) return;
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
            frameCount++;
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

// ===========================
// MPD PLAYER CLASS
// ===========================
class MPDPlayer {
    constructor(audioContext, url = getMpdHtmlUrl()) {
        this.audioContext = audioContext;
        this.url = url;
        this.audio = null;
        this.analyzerGain = null;
        this.mediaSource = null;
        this.isPlaying = false;
        this.isFirstPlay = true;
        
        console.log('[MPD] Initializing with URL:', url);
    }

    async start() {
        try {
            if (this.audio) {
                console.log('[MPD] Already initialized');
                return;
            }

            // Create audio element
            this.audio = new Audio();
            this.audio.crossOrigin = 'anonymous';
            this.audio.src = this.url;
            this.audio.preload = 'auto';
            
            // Create audio nodes
            this.mediaSource = this.audioContext.createMediaElementSource(this.audio);
            this.analyzerGain = this.audioContext.createGain();
            this.analyzerGain.gain.value = 1.0;
            
            // Connect: mediaSource -> analyzerGain (không connect đến destination để tránh phát 2 lần)
            this.mediaSource.connect(this.analyzerGain);
            
            // Setup event listeners
            this.audio.addEventListener('canplay', () => {
                if (this.isFirstPlay) {
                    console.log('[MPD] Audio ready, starting playback...');
                    this.isFirstPlay = false;
                }
            });
            
            this.audio.addEventListener('playing', () => {
                this.isPlaying = true;
                console.log('[MPD] Audio playing');
            });
            
            this.audio.addEventListener('pause', () => {
                this.isPlaying = false;
                console.log('[MPD] Audio paused');
            });
            
            this.audio.addEventListener('error', (e) => {
                console.error('[MPD] Audio error:', e);
                this.isPlaying = false;
            });
            
            this.audio.addEventListener('stalled', () => {
                console.warn('[MPD] Audio stalled, attempting to recover...');
            });
            
            // Start playback
            await this.audio.play();
            console.log('[MPD] ✓ Started successfully');
            
        } catch (e) {
            console.error('[MPD] Start failed:', e);
            throw e;
        }
    }

    stop() {
        try {
            if (this.audio) {
                this.audio.pause();
                this.audio.src = '';
                this.audio = null;
            }
            
            if (this.mediaSource) {
                this.mediaSource.disconnect();
                this.mediaSource = null;
            }
            
            if (this.analyzerGain) {
                this.analyzerGain.disconnect();
                this.analyzerGain = null;
            }
            
            this.isPlaying = false;
            console.log('[MPD] Stopped');
        } catch (e) {
            console.error('[MPD] Stop error:', e);
        }
    }

    getSourceNode() {
        return this.analyzerGain;
    }

    setUrl(url) {
        const wasPlaying = this.isPlaying;
        this.stop();
        this.url = url;
        if (wasPlaying) {
            this.start();
        }
    }

    getStatus() {
        return {
            isPlaying: this.isPlaying,
            url: this.url,
            readyState: this.audio ? this.audio.readyState : 0,
            networkState: this.audio ? this.audio.networkState : 0
        };
    }
}

// ===========================
// AUDIO SOURCE MANAGER
// ===========================
async function switchAudioSource(source, mpdUrl = null) {
    console.log(`[Audio Source] Switching to: ${source}`);
    
    try {
        // Update source first
        currentAudioSource = source;
        
        // Stop current audio source
        await stopCurrentAudioSource();
        
        // Start new audio source
        if (source === 'mpd') {
            await startMPDAudio(mpdUrl || getMpdHtmlUrl());
        } else {
            await startWebSocketSource();
        }
        
        console.log(`[Audio Source] ✓ Switched to ${source}`);
        return { success: true };
        
    } catch (e) {
        console.error('[Audio Source] Switch failed:', e);
        return { success: false, error: e.message };
    }
}

async function stopCurrentAudioSource() {
    console.log('[Audio Source] Stopping current source...');
    console.log('[Audio Source] MPD player active:', !!mpdPlayer);
    console.log('[Audio Source] PCM player active:', !!pcmPlayer);
    console.log('[Audio Source] WebSocket active:', ws ? ws.readyState : 'null');
    
    // Stop MPD player if active
    if (mpdPlayer) {
        console.log('[Audio Source] Stopping MPD player...');
        mpdPlayer.stop();
        if (audioMotion && mpdPlayer.getSourceNode()) {
            try {
                audioMotion.disconnectInput(mpdPlayer.getSourceNode());
                console.log('[Audio Source] ✓ MPD disconnected from AudioMotion');
            } catch (e) {
                console.warn('[Audio Source] Could not disconnect MPD:', e);
            }
        }
        mpdPlayer = null;
    }
    
    // Stop WebSocket/PCM player if active
    if (pcmPlayer) {
        console.log('[Audio Source] Stopping PCM player...');
        if (audioMotion && pcmPlayer.getSourceNode()) {
            try {
                audioMotion.disconnectInput(pcmPlayer.getSourceNode());
                console.log('[Audio Source] ✓ PCM disconnected from AudioMotion');
            } catch (e) {
                console.warn('[Audio Source] Could not disconnect PCM:', e);
            }
        }
        pcmPlayer = null;
    }
    
    // Close WebSocket if active
    if (ws) {
        console.log('[Audio Source] Closing WebSocket (state:', ws.readyState, ')');
        intentionalDisconnect = true; // Prevent auto-reconnect
        try {
            ws.close();
            console.log('[Audio Source] ✓ WebSocket close() called');
        } catch (e) {
            console.warn('[Audio Source] WebSocket close error:', e);
        }
        ws = null;
    }
    
    // Clear reconnect timer if any
    if (reconnectTimer) {
        console.log('[Audio Source] Clearing reconnect timer');
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    
    audioStarted = false;
    console.log('[Audio Source] ✓ Current source stopped');
}

async function startMPDAudio(url) {
    console.log('[Audio Source] Starting MPD audio from:', url);
    
    if (!sharedAudioContext) {
        console.log('[MPD] Creating new AudioContext...');
        const ctx = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 44100
        });
        sharedAudioContext = ctx;
        console.log('[MPD] AudioContext created, state:', ctx.state);
    }
    
    if (sharedAudioContext.state === 'suspended') {
        console.log('[MPD] Resuming suspended AudioContext...');
        await sharedAudioContext.resume();
        console.log('[MPD] AudioContext resumed, state:', sharedAudioContext.state);
    }
    
    console.log('[MPD] Creating MPDPlayer instance...');
    mpdPlayer = new MPDPlayer(sharedAudioContext, url);
    
    console.log('[MPD] Starting MPDPlayer...');
    await mpdPlayer.start();
    console.log('[MPD] ✓ MPDPlayer started');
    
    if (audioMotion && mpdPlayer.getSourceNode()) {
        console.log('[MPD] Connecting to AudioMotion...');
        audioMotion.connectInput(mpdPlayer.getSourceNode());
        console.log('[Audio Source] ✓ MPD connected to AudioMotion');
    } else {
        console.warn('[MPD] Cannot connect to AudioMotion:', { audioMotion: !!audioMotion, sourceNode: !!mpdPlayer.getSourceNode() });
    }
    
    audioStarted = true;
    
    // Hide click prompt if visible
    const prompt = document.getElementById('clickPrompt');
    if (prompt) {
        prompt.classList.add('hidden');
    }
    
    // Start Volumio state updates (prefer socket, fallback to polling)
    if (!(volumioSocket && volumioSocket.connected) && window.fetchVolumioState) {
        window.fetchVolumioState();
        volumioStateInterval = setInterval(window.fetchVolumioState, 2000);
    }
    
    console.log('[MPD] ✓ MPD audio source fully initialized');
}

async function startWebSocketSource() {
    console.log('[Audio Source] Starting WebSocket audio');
    
    connectWebSocket();
    
    // Wait a bit for WebSocket to connect
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // The actual audio will start when user clicks
    const prompt = document.getElementById('clickPrompt');
    if (prompt) {
        prompt.classList.remove('hidden');
    }
}

function getAudioSourceStatus() {
    const source = currentAudioSource;
    
    if (source === 'mpd') {
        if (mpdPlayer) {
            return {
                source: 'mpd',
                status: mpdPlayer.getStatus()
            };
        }
        return { source: 'mpd', status: 'not initialized' };
    } else {
        return {
            source: 'websocket',
            connected: ws && ws.readyState === WebSocket.OPEN,
            audioStarted: audioStarted
        };
    }
}

// Make functions available globally
window.switchAudioSource = switchAudioSource;
window.getAudioSourceStatus = getAudioSourceStatus;
window.MPDPlayer = MPDPlayer;

// Initialize when ready
// if (window.pcmPlayer) {
//     const volumeContainer = document.getElementById('volumeControlContainer');
//     if (volumeContainer) {
//         const volumeControl = createVolumeControl(window.pcmPlayer);
//         volumeContainer.appendChild(volumeControl);
//         console.log('[Volume Control] Initialized immediately');
//     }
// } else {
//     let attempts = 0;
//     const checkPCM = setInterval(() => {
//         attempts++;
//         if (window.pcmPlayer) {
//             clearInterval(checkPCM);
//             const volumeContainer = document.getElementById('volumeControlContainer');
//             if (volumeContainer) {
//                 const volumeControl = createVolumeControl(window.pcmPlayer);
//                 volumeContainer.appendChild(volumeControl);
//                 console.log('[Volume Control] Initialized after waiting');
//             }
//         }
//         if (attempts > 50) {
//             clearInterval(checkPCM);
//             console.error('[Volume Control] PCM Player not found');
//         }
//     }, 100);
// }

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
function getMpdHtmlUrl() {
    return `http://${getBaseUrl()}:8001`;
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

    const scaleYSelect = document.getElementById('showScaleY');
    if (scaleYSelect) {
        scaleYSelect.addEventListener('change', function (e) {
            if (audioMotion) {
                audioMotion.showScaleY = e.target.value === 'true';
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
        const wasActive = this.dataset.active === '1';
        const nowActive = !wasActive;
        this.dataset.active = nowActive ? '1' : '0';
        if (audioMotion) audioMotion.showFPS = nowActive;
        ensureFpsCounterTimer();
    });

    addListener("loRes", "click", function () {
        const wasActive = this.dataset.active === '1';
        const nowActive = !wasActive;
        this.dataset.active = nowActive ? '1' : '0';
        applyLoRes(nowActive);
    });

    // General
    // addListener("maxFPS", "change", function () {
    //     if (audioMotion) audioMotion.maxFPS = parseInt(this.value);
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
        mode: parseInt(document.getElementById('mode')?.value || 10),
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
        showScaleY: getSelectedRadio('showScaleY') === 'true',
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
        linkGrads: document.getElementById('linkGrads')?.dataset.active === '1',
        splitGrad: document.getElementById('splitGrad')?.dataset.active === '1',
        // maxFPS: parseInt(document.getElementById('maxFPS')?.value || 60),
        showFPS: document.getElementById('showFPS')?.dataset.active === '1',
        loRes: document.getElementById('loRes')?.dataset.active === '1'
    };
}

function applyPreset(preset) {
    if (!preset || !audioMotion) return;

    console.log('[Preset] Applying:', preset);

    if (preset.mode !== undefined) {
        audioMotion.mode = parseInt(preset.mode);
        const modeSelect = document.getElementById('mode');
        if (modeSelect) modeSelect.value = preset.mode.toString();
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
        audioMotion.showScaleY = preset.showScaleY === true || preset.showScaleY === 'true';
        setRadioValue('showScaleY', preset.showScaleY ? 'true' : 'false');
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

    // if (preset.maxFPS !== undefined) {
    //     audioMotion.maxFPS = preset.maxFPS;
    //     const maxFPSSelect = document.getElementById('maxFPS');
    //     if (maxFPSSelect) maxFPSSelect.value = preset.maxFPS;
    // }

    if (preset.showFPS !== undefined) {
        audioMotion.showFPS = preset.showFPS;
        const showFPSEl = document.getElementById('showFPS');
        if (showFPSEl) showFPSEl.dataset.active = preset.showFPS ? '1' : '0';
        ensureFpsCounterTimer();
    }

    if (preset.loRes !== undefined) {
        const loResEl = document.getElementById('loRes');
        if (loResEl) loResEl.dataset.active = preset.loRes ? '1' : '0';
        applyLoRes(!!preset.loRes);
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

    const fileLabel = document.getElementById("bgFileLabel");
    const fileSelect = document.getElementById("bgFile");

    // hide everything first
    if (fileLabel) fileLabel.style.display = "none";
    if (fileSelect) fileSelect.style.display = "none";

    // New behavior: "Background File" is used for both images and videos (Select Media)
    // Align with applyBackground() which expects value "file"
    if (bgType.value === "file") {
        if (fileLabel) fileLabel.style.display = "block";
        if (fileSelect) fileSelect.style.display = "block";
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
                .catch(e => {
                    if (e && e.name === 'AbortError') {
                        // Benign when play() is interrupted by a quick pause/source change
                        console.debug('[BG] Video play aborted (benign)');
                    } else {
                        console.error('[BG] Video play error:', e);
                    }
                });

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

async function uploadBackground(input) {
    const file = input.files[0];
    if (!file) return;

    const statusEl = document.getElementById('uploadStatus');
    if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.textContent = 'Uploading...';
        statusEl.style.color = '#8b9dc3';
    }

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/backgrounds', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        const result = await response.json();
        console.log('[BG] Upload successful:', result);

        if (statusEl) {
            statusEl.textContent = `✓ Uploaded: ${result.filename}`;
            statusEl.style.color = '#4ade80';
        }

        // Refresh the background files list
        await refreshBackgroundFiles();

        // Auto-select the uploaded file
        setTimeout(() => {
            const bgFileSelect = document.getElementById('bgFile');
            if (bgFileSelect) {
                bgFileSelect.value = result.filename;
                const bgType = document.getElementById('bgType');
                if (bgType && bgType.value !== 'file') {
                    bgType.value = 'file';
                    updateBackgroundControls();
                }
                applyBackground();
            }
        }, 100);

        // Clear status after 3 seconds
        setTimeout(() => {
            if (statusEl) statusEl.style.display = 'none';
        }, 3000);

    } catch (error) {
        console.error('[BG] Upload error:', error);
        if (statusEl) {
            statusEl.textContent = `✗ Error: ${error.message}`;
            statusEl.style.color = '#f87171';
        }
    }

    // Clear the input
    input.value = '';
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

    // Fetch latest state to check if still playing
    fetch(`${getVolumioUrl()}/api/v1/getState`)
        .then(res => res.json())
        .then(state => {
            if (state.status === 'play') {
                updateProgress(state);
            } else {
                // Stop interval if not playing anymore
                if (progressInterval) {
                    clearInterval(progressInterval);
                    progressInterval = null;
                }
            }
        })
        .catch(e => {
            console.warn('[Progress] Update failed:', e);
        });
}

async function fetchVolumioState(progressOnly = false) {
    try {
        // If socket is connected, skip HTTP polling
        if (volumioSocket && volumioSocket.connected) return;
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

    if (state) {
        const setTextContent = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        setTextContent('trackTitle', state.title || 'No Track');
        setTextContent('trackArtist', state.artist || 'No Artist');
        setTextContent('trackAlbum', state.album || 'No Album');

        const artImg = document.getElementById('trackArt');
        if (artImg && state.albumart) {
            artImg.src = state.albumart.startsWith('http') ? state.albumart :
                `${getVolumioUrl()}${state.albumart}`;
        } else if (artImg) {
            artImg.src = '/albumart';
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
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
        nowPlaying.classList.remove('show');
        setTimeout(() => nowPlaying.classList.add('hidden'), 300);
    }
}

// ===========================
// QUEUE MANAGEMENT
// ===========================
let browsePanelVisible = false;
let browseHistory = [];
let currentBrowsePath = null;

function openVolumioMusic() {
    toggleBrowse();
}

function toggleBrowse() {
    browsePanelVisible = !browsePanelVisible;
    const panel = document.getElementById('browsePanel');
    const controlBar = document.getElementById('controlBar');

    if (browsePanelVisible) {
        panel.classList.add('show');
        if (controlBar) {
            controlBar.classList.add('with-queue');
        }
        // Start from root if no history
        if (browseHistory.length === 0) {
            browseMusicLibrary();
        }
    } else {
        panel.classList.remove('show');
        if (controlBar) {
            controlBar.classList.remove('with-queue');
        }
    }
}

async function browseMusicLibrary(uri = null) {
    try {
        const volumioUrl = getVolumioUrl();
        let url = `${volumioUrl}/api/v1/browse`;
        
        if (uri) {
            url += `?uri=${encodeURIComponent(uri)}`;
        }

        console.log('[Browse] Fetching:', url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API returned ${response.status}`);

        const data = await response.json();
        console.log('[Browse] Response:', data);

        // Update history
        if (uri) {
            browseHistory.push(currentBrowsePath);
        }
        currentBrowsePath = { uri: uri, title: data.title || 'Music Library' };

        displayBrowseItems(data);
    } catch (e) {
        console.error('[Browse] Failed:', e);
        const browseList = document.getElementById('browseList');
        if (browseList) {
            browseList.innerHTML = `<div style="padding: 20px; text-align: center; color: #f87171;">Error: ${e.message}</div>`;
        }
    }
}

function displayBrowseItems(data) {
    const browseList = document.getElementById('browseList');
    const browsePath = document.getElementById('browsePath');
    const browseTitle = document.getElementById('browseTitle');
    
    if (!browseList) return;

    // Update title and path
    if (browseTitle) {
        browseTitle.textContent = data.title || '🎶 Music Library';
    }
    
    if (browsePath) {
        let pathText = '';
        if (browseHistory.length > 0) {
            pathText = `<span style="cursor: pointer; color: #60a5fa;" onclick="browseGoBack()">← Back</span>`;
        }
        browsePath.innerHTML = pathText;
    }

    // Volumio API returns items in different structures:
    // 1. Root browse: data.navigation.lists = array of items
    // 2. Folder browse: data.navigation.lists[0].items = array of items
    let items = [];
    
    if (data.navigation && data.navigation.lists) {
        if (Array.isArray(data.navigation.lists) && data.navigation.lists.length > 0) {
            // Check if first element has 'items' property (folder structure)
            if (data.navigation.lists[0].items) {
                items = data.navigation.lists[0].items;
            } else {
                // Root structure - lists itself is the items array
                items = data.navigation.lists;
            }
        }
    }

    console.log('[Browse] Displaying', items.length, 'items');

    if (!items || items.length === 0) {
        browseList.innerHTML = '<div style="padding: 20px; text-align: center; color: #8b9dc3;">No items found</div>';
        return;
    }

    browseList.innerHTML = '';
    console.log('[Browse] Displaying', items.length, 'items');

    items.forEach((item, index) => {
        const element = document.createElement('div');
        element.className = 'queue-item'; // Reuse queue-item styling
        
        // Determine icon based on type
        let icon = '📁'; // folder
        if (item.type === 'song' || item.type === 'webradio') {
            icon = '🎵';
        } else if (item.type === 'playlist') {
            icon = '📋';
        } else if (item.type === 'album') {
            icon = '💿';
        } else if (item.type === 'artist') {
            icon = '🎤';
        }

        // Get album art if available
        let albumart = '';
        if (item.albumart) {
            albumart = item.albumart.startsWith('http') ? item.albumart : `${getVolumioUrl()}${item.albumart}`;
        }

        const title = item.title || item.name || 'Unknown';
        const service = item.service || '';

        element.innerHTML = `
            <div class="queue-item-index">${icon}</div>
            <div class="queue-item-art">
                ${albumart ? `<img src="${albumart}" alt="" onerror="this.style.display='none'">` : ''}
            </div>
            <div class="queue-item-info">
                <div class="queue-item-title">${title}</div>
                <div class="queue-item-artist">${service}</div>
            </div>
            <div class="browse-item-menu" onclick="event.stopPropagation(); showBrowseMenu(event, ${index});">⋮</div>
        `;

        element.onclick = () => handleBrowseItemClick(item);
        element.dataset.itemIndex = index;
        browseList.appendChild(element);
    });

    // Store items for menu actions
    window.currentBrowseItems = items;
}

function handleBrowseItemClick(item) {
    console.log('[Browse] Item clicked:', item);
    
    // If it's a song/track, play it
    if (item.type === 'song' || item.type === 'webradio') {
        playBrowseItem(item);
    } else {
        // Otherwise, browse into it
        browseMusicLibrary(item.uri);
    }
}

async function playBrowseItem(item) {
    try {
        const volumioUrl = getVolumioUrl();
        
        // Use replaceAndPlay endpoint to play the item
        const response = await fetch(`${volumioUrl}/api/v1/replaceAndPlay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ item: item })
        });
        
        if (response.ok) {
            console.log('[Browse] Playing:', item.title || item.name);
            setTimeout(() => fetchVolumioState(), 500);
        } else {
            const error = await response.text();
            console.error('[Browse] Play failed:', response.status, error);
        }
    } catch (e) {
        console.error('[Browse] Play error:', e);
    }
}

function showBrowseMenu(event, itemIndex) {
    const existingMenu = document.getElementById('browseContextMenu');
    if (existingMenu) existingMenu.remove();

    const item = window.currentBrowseItems[itemIndex];
    if (!item) return;

    const menu = document.createElement('div');
    menu.id = 'browseContextMenu';
    menu.className = 'context-menu';

    const actions = [
        { label: '▶ Play Now', action: () => playBrowseItem(item) },
        { label: '⏭ Play Next', action: () => addBrowseItemToQueue(item, 'next') },
        { label: '➕ Add to Queue', action: () => addBrowseItemToQueue(item, 'end') },
        { label: '📋 Add to Playlist', action: () => addBrowseItemToPlaylist(item) }
    ];

    actions.forEach(action => {
        const option = document.createElement('div');
        option.className = 'context-menu-item';
        option.textContent = action.label;
        option.onclick = () => {
            action.action();
            menu.remove();
        };
        menu.appendChild(option);
    });

    document.body.appendChild(menu);

    const rect = event.target.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.left = `${rect.left - menu.offsetWidth + 30}px`;

    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        });
    }, 0);
}

async function addBrowseItemToQueue(item, position = 'end') {
    try {
        const volumioUrl = getVolumioUrl();
        const response = await fetch(`${volumioUrl}/api/v1/addToQueue`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(item)
        });
        
        if (response.ok) {
            console.log('[Browse] Added to queue:', item.title || item.name);
            setTimeout(() => fetchQueue(), 300);
        } else {
            const error = await response.text();
            console.error('[Browse] Add to queue failed:', response.status, error);
        }
    } catch (e) {
        console.error('[Browse] Add to queue error:', e);
    }
}

async function addBrowseItemToPlaylist(item) {
    const playlistName = prompt('Enter playlist name:');
    if (!playlistName) return;

    try {
        console.log('[Browse] Add to playlist:', playlistName, item);
        alert('Playlist functionality requires additional API implementation');
    } catch (e) {
        console.error('[Browse] Add to playlist error:', e);
    }
}

function browseGoBack() {
    if (browseHistory.length > 0) {
        const previousPath = browseHistory.pop();
        currentBrowsePath = previousPath;
        browseMusicLibrary(previousPath?.uri);
    }
}

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

    if (!intentionalDisconnect) updateStatus('connecting');
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
            intentionalDisconnect = false;
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
                        try { syncUIWithSettings(data.data); } catch (e) { /* no-op */ }
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
            if (!intentionalDisconnect) updateStatus('disconnected');
        };

        ws.onclose = () => {
            if (wsConnectTimeout) {
                clearTimeout(wsConnectTimeout);
                wsConnectTimeout = null;
            }
            console.log('[WS] Closed');
            if (!intentionalDisconnect) updateStatus('disconnected');
            ws = null;
            // Only auto-reconnect if we're using websocket source and disconnect wasn't intentional
            if (!intentionalDisconnect && currentAudioSource === 'websocket' && !reconnectTimer) {
                reconnectTimer = setTimeout(() => connectWebSocket(), 3000);
            }
            intentionalDisconnect = false; // Reset flag
        };

    } catch (e) {
        if (wsConnectTimeout) {
            clearTimeout(wsConnectTimeout);
            wsConnectTimeout = null;
        }
        console.error('[WS] Connection error:', e);
        if (!intentionalDisconnect) updateStatus('disconnected');
        // Only auto-reconnect if using websocket source
        if (currentAudioSource === 'websocket' && !reconnectTimer) {
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
        if (pcmPlayer.init) {
            await pcmPlayer.init();
        }
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
        // Start Volumio state updates (prefer socket, fallback to polling)
        if (!(volumioSocket && volumioSocket.connected)) {
            fetchVolumioState();
            if (volumioStateInterval) clearInterval(volumioStateInterval);
            volumioStateInterval = setInterval(fetchVolumioState, 2000);
        }

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
    let armed = true;
    const handleUserInteraction = async () => {
        if (!armed) return;
        armed = false;
        try {
            await startAudio();
        } catch (e) {
            console.error('[Audio] Failed to start after user interaction:', e);
        } finally {
            // Hide prompt if visible
            const prompt = document.getElementById('clickPrompt');
            if (prompt) prompt.classList.add('hidden');
            // Remove listeners
            window.removeEventListener('click', handleUserInteraction);
            window.removeEventListener('touchstart', handleUserInteraction, { passive: true });
            window.removeEventListener('keydown', handleUserInteraction);
        }
    };

    // Listen for click on the prompt button
    const promptButton = document.getElementById('startAudioBtn');
    if (promptButton) {
        promptButton.addEventListener('click', handleUserInteraction);
    }
    // Also arm global unlock on first user gesture anywhere
    window.addEventListener('click', handleUserInteraction);
    window.addEventListener('touchstart', handleUserInteraction, { passive: true });
    window.addEventListener('keydown', handleUserInteraction);
    console.log('[Audio] User interaction handler ready');
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

// Ensure FPS timer and UI reflect current setting
function ensureFpsCounterTimer() {
    const showFpsActive = document.getElementById('showFPS')?.dataset.active === '1';
    const counter = document.getElementById('fpsCounter');
    if (counter) counter.style.display = showFpsActive ? '' : 'none';

    if (showFpsActive && !fpsInterval) {
        fpsInterval = setInterval(updateFPS, 1000);
    } else if (!showFpsActive && fpsInterval) {
        clearInterval(fpsInterval);
        fpsInterval = null;
    }
}

// Apply low-resolution rendering hint to canvas and analyzer
function applyLoRes(active) {
    const canvas = document.getElementById('canvasContainer')?.querySelector('canvas');
    if (canvas) {
        // Visual cue for lower fidelity rendering
        canvas.style.imageRendering = active ? 'pixelated' : '';
    }
    if (audioMotion) {
        // Preserve flag for server sync
        audioMotion.loRes = active;
        // Optionally lower fftSize when in lo-res for performance
        try {
            if (active && audioMotion.fftSize > 4096) audioMotion.fftSize = 4096;
        } catch (e) { /* no-op */ }
    }
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
            setTimeout(() => {
                syncUIWithSettings(serverSettings);
                // Ensure background is applied based on synced UI
                updateBackgroundControls();
                applyBackground();
            }, 100);
        }

        // Load available background files and apply current background selection
        refreshBackgroundFiles().then(() => {
            updateBackgroundControls();
            applyBackground();
        });
        
        // Only connect WebSocket if it's the current audio source
        if (currentAudioSource === 'websocket') {
            connectWebSocket();
        }
        
        ensureFpsCounterTimer();

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
        // Normalize to server schema and proper types
        const payload = normalizeSettingsForServer(settings);
        console.log("POST body:", JSON.stringify(payload));
        // POST to server
        const res = await fetch(`${getSettingsApiUrl()}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(txt || res.statusText);
        }

        // Apply locally right away
        try {
            applyServerSettings(payload);
            syncUIWithSettings(payload);
        } catch (_) {}
        alert('Settings uploaded to server');
    } catch (err) {
        alert('Failed to upload settings: ' + (err.message || err));
    } finally {
        btn.disabled = false;
        btn.textContent = origText;
    }
}

// Convert UI-collected settings to server schema with correct types and aliases
function normalizeSettingsForServer(src) {
    const out = { ...src };

    // Numeric conversions
    const intKeys = ['mode','fftSize','minFreq','maxFreq','ansiBands','linearAmplitude','peakFade','peakHold','npX','npY','npW'];
    intKeys.forEach(k => { if (k in out) out[k] = parseInt(out[k], 10); });
    const floatKeys = ['gravity','barSpace','lineWidth','fillAlpha','smoothing','radius','spinSpeed','bgDim','volume'];
    floatKeys.forEach(k => { if (k in out) out[k] = parseFloat(out[k]); });

    // Frequency scale alias
    out.frequencyScale = out.freqScale || out.frequencyScale || 'log';

    // Scale X/Y mapping
    const scaleX = (out.scaleX ?? '1').toString();
    out.showScaleX = scaleX; // server seems to store as string "0|1|2"
    out.scaleY = out.showScaleY ? '1' : '0';
    if (scaleX === '2') out.noteLabels = true; else if (scaleX === '0') out.noteLabels = false;

    // Reflex mapping (ratio)
    const reflex = (out.reflex ?? '0').toString();
    const ratio = reflex === '3' ? 0.25 : reflex === '1' ? 0.4 : reflex === '2' ? 0.5 : 0;
    out.reflexRatio = ratio;

    // Mirror ensure string for server but number in analyzer will be handled elsewhere
    if (out.mirror != null) out.mirror = out.mirror.toString();

    // Color/gradients
    if (!out.gradientRight && out.gradient) out.gradientRight = out.gradient;

    // FPS flags
    if (typeof out.showFPS === 'undefined') out.showFPS = false;

    // Booleans already collected for switches and checkboxes

    // Background defaults
    out.bgFit = out.bgFit || 'cover';
    out.bgType = out.bgType || 'none';

    // Preserve URLs if present in DOM (not always collected automatically)
    const wsUrl = document.getElementById('wsUrl')?.value;
    const volumioUrl = document.getElementById('volumioUrl')?.value;
    if (wsUrl) out.wsUrl = wsUrl;
    if (volumioUrl) out.volumioUrl = volumioUrl;

    return out;
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

        // Split Grad (support both splitGrad and splitGradient keys)
        if (settings.splitGrad !== undefined || settings.splitGradient !== undefined) {
            const val = settings.splitGrad !== undefined ? settings.splitGrad : settings.splitGradient;
            const el = document.getElementById('splitGrad');
            if (el) el.dataset.active = val ? '1' : '0';
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
        } else if (settings.freqScale) {
            setRadioValue('freqScaleSelect', settings.freqScale);
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

        // Scale X (support string '0|1|2' or booleans/noteLabels)
        if (settings.showScaleX !== undefined || settings.noteLabels !== undefined) {
            let scaleXValue = '1';
            const sx = settings.showScaleX;
            if (sx === '0' || sx === 0 || sx === false) scaleXValue = '0';
            else if (sx === '2' || sx === 2 || settings.noteLabels === true) scaleXValue = '2';
            else if (sx === '1' || sx === 1 || sx === true) scaleXValue = '1';
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

        // Show FPS
        if (settings.showFPS !== undefined) {
            const el = document.getElementById('showFPS');
            if (el) el.dataset.active = settings.showFPS ? '1' : '0';
            ensureFpsCounterTimer();
        }

        // Lo Res
        if (settings.loRes !== undefined) {
            const el = document.getElementById('loRes');
            if (el) el.dataset.active = settings.loRes ? '1' : '0';
            applyLoRes(!!settings.loRes);
        }

        // Sensitivity radio
        if (settings.sensitivity !== undefined) {
            const sens = settings.sensitivity.toString();
            setRadioValue('sensitivitySelect', sens);
        }

        // Control bar and Now Playing checkboxes
        const showCtrl = document.getElementById('showControlBar');
        if (showCtrl && settings.showControlBar !== undefined) {
            showCtrl.checked = !!settings.showControlBar;
            showCtrl.dispatchEvent(new Event('change'));
        }
        const showNP = document.getElementById('showNowPlaying');
        if (showNP && settings.showNowPlaying !== undefined) {
            showNP.checked = !!settings.showNowPlaying;
            showNP.dispatchEvent(new Event('change'));
        }

        // Audio Source + MPD URL
        const audioSourceSelect = document.getElementById('audioSource');
        const mpdUrlInput = document.getElementById('mpdUrl');
        const mpdUrlLabel = document.getElementById('mpdUrlLabel');
        if (audioSourceSelect && settings.audioSource) {
            audioSourceSelect.value = settings.audioSource;
            const isMpd = settings.audioSource === 'mpd';
            if (mpdUrlInput) mpdUrlInput.style.display = isMpd ? 'block' : 'none';
            if (mpdUrlLabel) mpdUrlLabel.style.display = isMpd ? 'block' : 'none';
        }
        if (mpdUrlInput && settings.mpdUrl) {
            mpdUrlInput.value = settings.mpdUrl;
        }

        console.log('[AM] ✓ UI elements synced with server settings');

        // Apply Background-related settings if present
        const bgTypeSel = document.getElementById('bgType');
        if (bgTypeSel && settings.bgType) {
            bgTypeSel.value = settings.bgType;
        }

        // Populate background files may be async; set value if option exists
        const bgFileSel = document.getElementById('bgFile');
        if (bgFileSel && settings.bgFile) {
            // Try to select matching option by text or value
            const target = settings.bgFile;
            // Prefer exact value match
            const opt = Array.from(bgFileSel.options).find(o => o.value === target || o.text === target);
            if (opt) bgFileSel.value = opt.value;
        }

        const bgFitSel = document.getElementById('bgFit');
        if (bgFitSel && settings.bgFit) {
            bgFitSel.value = settings.bgFit;
            updateBackgroundFit(settings.bgFit);
        }

        const bgDimInput = document.getElementById('bgDim');
        if (bgDimInput && settings.bgDim !== undefined) {
            bgDimInput.value = parseFloat(settings.bgDim);
            updateBackgroundDim(parseFloat(settings.bgDim));
        }

        // Apply URLs if provided
        const wsUrlInput = document.getElementById('wsUrl');
        if (wsUrlInput && settings.wsUrl) wsUrlInput.value = settings.wsUrl;
        const volumioUrlInput = document.getElementById('volumioUrl');
        if (volumioUrlInput && settings.volumioUrl) volumioUrlInput.value = settings.volumioUrl;

        // Finally ensure background gets applied according to synced settings
        updateBackgroundControls();
        applyBackground();
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
    // setupUserInteractionHandler();

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

    setTimeout(() => { forceConnected = false; }, 5000);

    // Connect to Volumio via Socket.IO for push state
    setTimeout(connectVolumioSocket, 200);
});

window.addEventListener("beforeunload", () => {
    if (ws) ws.close();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (volumioStateInterval) clearInterval(volumioStateInterval);
    if (progressInterval) clearInterval(progressInterval);
    if (sharedAudioContext) sharedAudioContext.close();
});

// ===========================
// RANDOM SETTINGS LOGIC
// ===========================
(function () {
    let randomIntervalTimer = null;
    let lastRandomTime = null;
    let nextRandomTime = null;

    // Randomize now
    window.randomizeNow = function () {
        const options = {
            mode: document.getElementById('randomMode')?.checked,
            gradient: document.getElementById('randomGradient')?.checked,
            gradientRight: document.getElementById('randomGradientRight')?.checked,
            colorMode: document.getElementById('randomColorMode')?.checked,
            barSpace: document.getElementById('randomBarSpace')?.checked,
            fillAlpha: document.getElementById('randomFillAlpha')?.checked,
            lineWidth: document.getElementById('randomLineWidth')?.checked,
            sensitivity: document.getElementById('randomSensitivity')?.checked,
            mirror: document.getElementById('randomMirror')?.checked,
            alphaBars: document.getElementById('randomAlphaBars')?.checked,
            lumiBars: document.getElementById('randomLumiBars')?.checked,
            ledBars: document.getElementById('randomLedBars')?.checked,
            outlineBars: document.getElementById('randomOutlineBars')?.checked,
            radial: document.getElementById('randomRadial')?.checked,
            roundBars: document.getElementById('randomRoundBars')?.checked,
            bgType: document.getElementById('randomBgType')?.checked,
            bgFile: document.getElementById('randomBgFile')?.checked,
            bgFit: document.getElementById('randomBgFit')?.checked
        };

        applyRandomization(options);
        updateRandomStatus();
    };

    function applyRandomization(options) {
        // Mode
        if (options.mode) {
            const modeSelect = document.getElementById('mode');
            const modeOptions = Array.from(modeSelect.options);
            const randomMode = modeOptions[Math.floor(Math.random() * modeOptions.length)];
            modeSelect.value = randomMode.value;
            modeSelect.dispatchEvent(new Event('change'));
        }

        // Gradient
        if (options.gradient) {
            const gradSelect = document.getElementById('gradient');
            const gradOptions = Array.from(gradSelect.options);
            const randomGrad = gradOptions[Math.floor(Math.random() * gradOptions.length)];
            gradSelect.value = randomGrad.value;
            gradSelect.dispatchEvent(new Event('change'));
        }

        // Gradient Right
        if (options.gradientRight) {
            const gradRightSelect = document.getElementById('gradientRight');
            const gradRightOptions = Array.from(gradRightSelect.options);
            const randomGradRight = gradRightOptions[Math.floor(Math.random() * gradRightOptions.length)];
            gradRightSelect.value = randomGradRight.value;
            gradRightSelect.dispatchEvent(new Event('change'));
        }

        // Color Mode
        if (options.colorMode) {
            const colorModes = ['gradient', 'bar-index', 'bar-level'];
            const randomColorMode = colorModes[Math.floor(Math.random() * colorModes.length)];
            document.getElementById(`color-${randomColorMode}`)?.click();
        }

        // Bar Space (0 to 1)
        if (options.barSpace) {
            const barSpaceSlider = document.getElementById('barSpace');
            barSpaceSlider.value = (Math.random()).toFixed(2);
            barSpaceSlider.dispatchEvent(new Event('input'));
        }

        // Fill Alpha (0 to 1)
        if (options.fillAlpha) {
            const fillAlphaSlider = document.getElementById('fillAlpha');
            fillAlphaSlider.value = (Math.random()).toFixed(2);
            fillAlphaSlider.dispatchEvent(new Event('input'));
        }

        // Line Width (0 to 3)
        if (options.lineWidth) {
            const lineWidthSlider = document.getElementById('lineWidth');
            const randomWidth = (Math.random() * 3).toFixed(1);
            lineWidthSlider.value = randomWidth;
            lineWidthSlider.dispatchEvent(new Event('input'));
        }

        // Sensitivity
        if (options.sensitivity) {
            const sensLevels = ['0', '1', '2'];
            const randomSens = sensLevels[Math.floor(Math.random() * sensLevels.length)];
            document.getElementById(`sens-${randomSens === '0' ? 'low' : randomSens === '1' ? 'med' : 'high'}`)?.click();
        }

        // Mirror
        if (options.mirror) {
            const mirrorValues = ['-1', '0', '1'];
            const randomMirror = mirrorValues[Math.floor(Math.random() * mirrorValues.length)];
            document.getElementById(`mirror-${randomMirror === '-1' ? 'left' : randomMirror === '0' ? 'off' : 'right'}`)?.click();
        }

        // Toggle switches
        const toggles = [
            { option: 'alphaBars', id: 'alphaBars' },
            { option: 'lumiBars', id: 'lumiBars' },
            { option: 'ledBars', id: 'ledBars' },
            { option: 'outlineBars', id: 'outlineBars' },
            { option: 'radial', id: 'radial' },
            { option: 'roundBars', id: 'roundBars' }
        ];

        toggles.forEach(toggle => {
            if (options[toggle.option]) {
                const element = document.getElementById(toggle.id);
                const randomState = Math.random() > 0.5;
                element.setAttribute('data-active', randomState ? '1' : '0');
                element.dispatchEvent(new Event('click'));
            }
        });

        // Background Type
        if (options.bgType) {
            const bgTypeSelect = document.getElementById('bgType');
            const bgTypeOptions = Array.from(bgTypeSelect.options);
            const randomBgType = bgTypeOptions[Math.floor(Math.random() * bgTypeOptions.length)];
            bgTypeSelect.value = randomBgType.value;
            bgTypeSelect.dispatchEvent(new Event('change'));
        }

        // Background File
        if (options.bgFile) {
            const bgFileSelect = document.getElementById('bgFile');
            const bgFileOptions = Array.from(bgFileSelect.options).filter(opt => opt.value !== '');
            if (bgFileOptions.length > 0) {
                const randomBgFile = bgFileOptions[Math.floor(Math.random() * bgFileOptions.length)];
                bgFileSelect.value = randomBgFile.value;
                bgFileSelect.dispatchEvent(new Event('change'));
            }
        }

        // Background Fit
        if (options.bgFit) {
            const bgFitSelect = document.getElementById('bgFit');
            const bgFitOptions = Array.from(bgFitSelect.options);
            const randomBgFit = bgFitOptions[Math.floor(Math.random() * bgFitOptions.length)];
            bgFitSelect.value = randomBgFit.value;
            bgFitSelect.dispatchEvent(new Event('change'));
        }

        lastRandomTime = new Date();
    }

    function updateRandomStatus() {
        const lastTimeEl = document.getElementById('randomLastTime');
        const nextTimeEl = document.getElementById('randomNextTime');

        if (lastRandomTime) {
            lastTimeEl.textContent = lastRandomTime.toLocaleTimeString();
        }

        if (nextRandomTime) {
            nextTimeEl.textContent = nextRandomTime.toLocaleTimeString();
        } else {
            nextTimeEl.textContent = '-';
        }
    }

    function startRandomInterval() {
        stopRandomInterval();

        const intervalCheckbox = document.getElementById('randomOnInterval');
        const intervalInput = document.getElementById('randomInterval');

        if (intervalCheckbox?.checked) {
            const seconds = parseInt(intervalInput.value || '30');
            nextRandomTime = new Date(Date.now() + seconds * 1000);
            updateRandomStatus();

            randomIntervalTimer = setInterval(() => {
                randomizeNow();
                nextRandomTime = new Date(Date.now() + seconds * 1000);
                updateRandomStatus();
            }, seconds * 1000);
        }
    }

    function stopRandomInterval() {
        if (randomIntervalTimer) {
            clearInterval(randomIntervalTimer);
            randomIntervalTimer = null;
            nextRandomTime = null;
            updateRandomStatus();
        }
    }

    // Select/Deselect all
    window.selectAllRandom = function () {
        document.querySelectorAll('#random-tab input[type="checkbox"]').forEach(cb => {
            if (!cb.id.startsWith('randomOn')) {
                cb.checked = true;
            }
        });
    };

    window.deselectAllRandom = function () {
        document.querySelectorAll('#random-tab input[type="checkbox"]').forEach(cb => {
            if (!cb.id.startsWith('randomOn')) {
                cb.checked = false;
            }
        });
    };

    // Setup event listeners
    document.getElementById('randomOnInterval')?.addEventListener('change', function () {
        if (this.checked) {
            startRandomInterval();
        } else {
            stopRandomInterval();
        }
    });

    document.getElementById('randomInterval')?.addEventListener('change', function () {
        if (document.getElementById('randomOnInterval')?.checked) {
            startRandomInterval();
        }
    });

    // Hook into track change (you'll need to call this from your main spectrum.js)
    window.onTrackChange = function () {
        if (document.getElementById('randomOnTrackChange')?.checked) {
            randomizeNow();
        }
    };

    // Update status every second
    setInterval(updateRandomStatus, 1000);
})();

// ===========================
// NOW PLAYING DRAG & VISIBILITY MANAGEMENT
// ===========================
(function () {
    const box = document.getElementById("nowPlaying");
    if (!box) return;

    // Drag functionality
    let dragging = false;
    let pos = { x: 0, y: 0 };
    let mouse = { x: 0, y: 0 };

    function onMouseDown(e) {
        if (e.target.closest(".control-btn") || e.target.classList.contains('resize-handle')) return;
        dragging = true;
        box.classList.add("dragging");
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        const rect = box.getBoundingClientRect();
        pos.x = rect.left;
        pos.y = rect.top;
        e.preventDefault();
    }

    function onMouseMove(e) {
        if (!dragging) return;
        const dx = e.clientX - mouse.x;
        const dy = e.clientY - mouse.y;
        box.style.left = pos.x + dx + "px";
        box.style.top = pos.y + dy + "px";
        box.style.right = "auto";
        box.style.bottom = "auto";
        // update inputs
        const npX = document.getElementById('npX');
        const npY = document.getElementById('npY');
        if (npX) npX.value = Math.round(pos.x + dx);
        if (npY) npY.value = Math.round(pos.y + dy);
    }

    function onMouseUp() {
        if (!dragging) return;
        dragging = false;
        box.classList.remove("dragging");
    }

    box.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    // Visibility control: respect showNowPlaying checkbox
    const showCheckbox = document.getElementById('showNowPlaying');
    if (showCheckbox) {
        showCheckbox.addEventListener('change', () => {
            if (showCheckbox.checked) {
                box.classList.remove('hidden-by-css');
            } else {
                box.classList.add('hidden-by-css');
            }
        });
    }

    // Resize functionality
    let resizing = false;
    let resizeStart = { x: 0, y: 0, w: 0, h: 0, left: 0, top: 0 };
    let resizeMode = null; // tl, tr, bl, br

    function onResizeDown(e) {
        const handle = e.target;
        if (!handle.classList.contains('resize-handle')) return;
        resizing = true;
        resizeMode = handle.classList.contains('resize-tl') ? 'tl'
            : handle.classList.contains('resize-tr') ? 'tr'
                : handle.classList.contains('resize-bl') ? 'bl' : 'br';
        const rect = box.getBoundingClientRect();
        resizeStart = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height, left: rect.left, top: rect.top };
        e.preventDefault();
        e.stopPropagation();
    }

    function onResizeMove(e) {
        if (!resizing) return;
        const dx = e.clientX - resizeStart.x;
        const dy = e.clientY - resizeStart.y;
        let newW = resizeStart.w;
        let newH = resizeStart.h;
        let newLeft = resizeStart.left;
        let newTop = resizeStart.top;

        if (resizeMode === 'br') { newW += dx; newH += dy; }
        else if (resizeMode === 'bl') { newW -= dx; newH += dy; newLeft += dx; }
        else if (resizeMode === 'tr') { newW += dx; newH -= dy; newTop += dy; }
        else if (resizeMode === 'tl') { newW -= dx; newH -= dy; newLeft += dx; newTop += dy; }

        // constraints
        newW = Math.max(320, Math.min(newW, window.innerWidth - 32));
        newH = Math.max(100, Math.min(newH, window.innerHeight - 32));
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - newW));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - newH));

        box.style.width = newW + 'px';
        box.style.height = newH + 'px';
        box.style.left = newLeft + 'px';
        box.style.top = newTop + 'px';
        box.style.right = 'auto';
        box.style.bottom = 'auto';

        const npX = document.getElementById('npX');
        const npY = document.getElementById('npY');
        const npW = document.getElementById('npW');
        const npH = document.getElementById('npH');
        if (npX) npX.value = Math.round(newLeft);
        if (npY) npY.value = Math.round(newTop);
        if (npW) npW.value = Math.round(newW);
        if (npH) npH.value = Math.round(newH);
    }

    function onResizeUp() {
        if (!resizing) return;
        resizing = false;
    }

    box.addEventListener('mousedown', onResizeDown);
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeUp);

    // Apply/reset from settings inputs
    const applyBtn = document.getElementById('applyNowPlayingLayoutBtn');
    const resetBtn = document.getElementById('resetNowPlayingLayoutBtn');
    function applyFromInputs() {
        const npX = document.getElementById('npX');
        const npY = document.getElementById('npY');
        const npW = document.getElementById('npW');
        const npH = document.getElementById('npH');
        if (!npX || !npY || !npW || !npH) return;
        const x = parseInt(npX.value || '16');
        const y = parseInt(npY.value || '16');
        const w = parseInt(npW.value || '600');
        const hVal = npH.value;
        box.style.left = x + 'px';
        box.style.top = y + 'px';
        box.style.width = w + 'px';
        if (hVal && hVal !== 'auto') {
            const h = parseInt(hVal);
            box.style.height = h + 'px';
        } else {
            box.style.height = '';
        }
        box.style.right = 'auto';
        box.style.bottom = 'auto';
    }
    if (applyBtn) applyBtn.addEventListener('click', applyFromInputs);
    if (resetBtn) resetBtn.addEventListener('click', () => {
        document.getElementById('npX').value = 16;
        document.getElementById('npY').value = 16;
        document.getElementById('npW').value = 600;
        document.getElementById('npH').value = 'auto';
        applyFromInputs();
    });
})();


// ===========================
// BACKGROUND FILE VISIBILITY TOGGLE
// ===========================
(function () {
    const bgTypeSelect = document.getElementById('bgType');
    const bgFileLabel = document.getElementById('bgFileLabel');
    const bgFileSelect = document.getElementById('bgFile');

    function updateFileVisibility() {
        const isFileSelected = bgTypeSelect.value === 'file';
        bgFileLabel.style.display = isFileSelected ? 'block' : 'none';
        bgFileSelect.style.display = isFileSelected ? 'block' : 'none';
    }

    bgTypeSelect.addEventListener('change', updateFileVisibility);
    updateFileVisibility();
})();

// ===========================
// AUDIO SOURCE SETTINGS
// ===========================
(function () {
    const audioSourceSelect = document.getElementById('audioSource');
    const mpdUrlInput = document.getElementById('mpdUrl');
    const mpdUrlLabel = document.getElementById('mpdUrlLabel');
    
    console.log('[Audio Source UI] Elements found:', {
        audioSourceSelect: !!audioSourceSelect,
        mpdUrlInput: !!mpdUrlInput,
        mpdUrlLabel: !!mpdUrlLabel
    });
    
    if (audioSourceSelect) {
        audioSourceSelect.addEventListener('change', function() {
            const isMpd = this.value === 'mpd';
            console.log('[Audio Source UI] Source changed to:', this.value);
            if (mpdUrlInput) mpdUrlInput.style.display = isMpd ? 'block' : 'none';
            if (mpdUrlLabel) mpdUrlLabel.style.display = isMpd ? 'block' : 'none';
        });
    }
    
    const applyAudioSourceBtn = document.getElementById('applyAudioSourceBtn');
    console.log('[Audio Source UI] Apply button found:', !!applyAudioSourceBtn);
    
    if (applyAudioSourceBtn) {
        console.log('[Audio Source UI] ✓ Registering click handler for Apply button');
        applyAudioSourceBtn.addEventListener('click', async function() {
            console.log('[Audio Source UI] Apply button clicked!');
            const source = audioSourceSelect ? audioSourceSelect.value : 'websocket';
            const mpdUrl = mpdUrlInput ? mpdUrlInput.value : 'http://192.168.1.63:8001';
            const statusDiv = document.getElementById('audioSourceStatus');
            
            console.log('[Audio Source UI] Selected source:', source);
            console.log('[Audio Source UI] MPD URL:', mpdUrl);
            
            if (statusDiv) {
                statusDiv.style.display = 'block';
                statusDiv.textContent = `Switching to ${source}...`;
                statusDiv.style.color = '#8b9dc3';
            }
            
            try {
                console.log('[Audio Source UI] Calling switchAudioSource...');
                const result = await switchAudioSource(source, mpdUrl);
                console.log('[Audio Source UI] Switch result:', result);
                
                if (statusDiv) {
                    if (result.success) {
                        statusDiv.textContent = `✓ Successfully switched to ${source}`;
                        statusDiv.style.color = '#4ade80';
                    } else {
                        statusDiv.textContent = `✗ Failed: ${result.error}`;
                        statusDiv.style.color = '#f87171';
                    }
                    setTimeout(() => {
                        statusDiv.style.display = 'none';
                    }, 5000);
                }
            } catch (e) {
                console.error('[Audio Source UI] Error:', e);
                if (statusDiv) {
                    statusDiv.textContent = `✗ Error: ${e.message}`;
                    statusDiv.style.color = '#f87171';
                }
            }
        });
    } else {
        console.error('[Audio Source UI] ✗ Apply button NOT found! Cannot register event listener.');
    }
})();