import { state } from "./state.js";

// ===========================
// FPS COUNTER
// ===========================
export function updateFPS() {
    const now = Date.now();
    const elapsed = now - state.lastFpsTime;
    const fps = Math.round((state.frameCount * 1000) / elapsed);

    const bufferMs = state.pcmPlayer ?
        Math.floor(state.pcmPlayer.buffer.length / state.audioFormat.sampleRate / state.audioFormat.channels * 1000) : 0;

    const counter = document.getElementById("fpsCounter");
    if (counter) {
        counter.textContent = `FPS: ${fps} | Packets: ${state.dataReceived} | Buf: ${bufferMs}ms`;
    }

    state.frameCount = 0;
    state.lastFpsTime = now;
}
