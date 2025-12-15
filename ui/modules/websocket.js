import { state } from "./state.js";
import { getWebSocketUrl } from "./utils.js";

// ===========================
// WEBSOCKET
// ===========================

// ===========================
export function updateStatus(status) {
    const el = document.getElementById("status");
    if (!el) return;
    el.className = 'control-item ' + status;
    el.textContent = status === 'connected' ? '● Connected' :
        status === 'connecting' ? '● Connecting' : '● Disconnected';
}

export function connectWebSocket() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) return;

    const wsUrl = getWebSocketUrl();

    if (!state.forceConnected) updateStatus('connecting');
    console.log('[WS] Connecting to:', wsUrl);

    try {
        state.ws = new WebSocket(wsUrl);
        state.ws.binaryType = 'arraybuffer';

        // Clear any existing timeout
        if (state.wsConnectTimeout) {
            clearTimeout(state.wsConnectTimeout);
            state.wsConnectTimeout = null;
        }

        // Set connection timeout
        state.wsConnectTimeout = setTimeout(() => {
            if (state.ws && state.ws.readyState === WebSocket.CONNECTING) {
                console.warn('[WS] Connection timeout');
                if (!state.forceConnected) updateStatus('disconnected');
                try { state.ws.close(); } catch (e) { }
            }
        }, 8000);

        state.ws.onopen = () => {
            if (state.wsConnectTimeout) {
                clearTimeout(state.wsConnectTimeout);
                state.wsConnectTimeout = null;
            }
            console.log('[WS] Connected');
            updateStatus('connected');
            state.forceConnected = false;
            if (state.reconnectTimer) {
                clearTimeout(state.reconnectTimer);
                state.reconnectTimer = null;
            }
        };

        state.ws.onmessage = (event) => {
            try {
                if (typeof event.data === 'string') {
                    const data = JSON.parse(event.data);
                    if (data.type === 'settings') {
                        console.log('[WS] Received settings update');
                        if (window.applyServerSettings) window.applyServerSettings(data.data);
                    } else if (data.type === 'format') {
                        state.audioFormat = {
                            sampleRate: data.sampleRate,
                            channels: data.channels,
                            bitsPerSample: data.bitsPerSample
                        };
                        console.log('[WS] Format:', state.audioFormat);
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
                    if (state.pcmPlayer) {
                        state.pcmPlayer.feed(new Uint8Array(event.data));
                        state.dataReceived++;
                        state.frameCount++;
                    }
                }
            } catch (e) {
                console.error('[WS] Message error:', e);
            }
        };

        state.ws.onerror = (err) => {
            if (state.wsConnectTimeout) {
                clearTimeout(state.wsConnectTimeout);
                state.wsConnectTimeout = null;
            }
            console.error('[WS] Error:', err);
            if (!state.forceConnected) updateStatus('disconnected');
        };

        state.ws.onclose = () => {
            if (state.wsConnectTimeout) {
                clearTimeout(state.wsConnectTimeout);
                state.wsConnectTimeout = null;
            }
            console.log('[WS] Closed');
            if (!state.forceConnected) updateStatus('disconnected');
            state.ws = null;
            if (!state.reconnectTimer) {
                state.reconnectTimer = setTimeout(() => connectWebSocket(), 3000);
            }
        };

    } catch (e) {
        if (state.wsConnectTimeout) {
            clearTimeout(state.wsConnectTimeout);
            state.wsConnectTimeout = null;
        }
        console.error('[WS] Connection error:', e);
        if (!state.forceConnected) updateStatus('disconnected');
        if (!state.reconnectTimer) {
            state.reconnectTimer = setTimeout(() => connectWebSocket(), 5000);
        }
    }
}

export function reconnectWebSocket() {
    if (state.ws) state.ws.close();
    if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
    }
    setTimeout(() => connectWebSocket(), 100);
}

