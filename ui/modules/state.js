// ===========================
// STATE MANAGEMENT
// ===========================

// Global state
export const state = {
    audioMotion: null,
    ws: null,
    pcmPlayer: null,
    reconnectTimer: null,
    sharedAudioContext: null,
    volumioStateInterval: null,
    progressInterval: null,
    queuePanelVisible: false,
    wsConnectTimeout: null,
    frameCount: 0,
    dataReceived: 0,
    lastFpsTime: Date.now(),
    audioFormat: { sampleRate: 44100, channels: 2, bitsPerSample: 16 },
    audioStarted: false,
    settingsPanelVisible: false,
    backgroundFiles: { images: [], videos: [] },
    currentBackground: null,
    bgVideo: null,
    browsePanelVisible: false,
    browseHistory: [],
    currentBrowsePath: null,
    initializationStarted: false,
    forceConnected: false,
    currentBrowseItems: []
};

// Make state accessible globally for compatibility
if (typeof window !== 'undefined') {
    window.appState = state;
}
