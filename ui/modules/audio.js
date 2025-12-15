import { state } from "./state.js";
import { PCMPlayer } from "./pcmPlayer.js";
import { fetchVolumioState } from "./volumio.js";

// ===========================
// AUDIO START
// ===========================

// ===========================
export async function startAudio() {
    if (state.audioStarted) {
        console.log('[Audio] Already started');
        return;
    }
    console.log('[Audio] Starting...');
    try {
        if (!state.sharedAudioContext) {
            state.sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: audioFormat.sampleRate || 44100
            });
        }

        if (state.sharedAudioContext.state === 'suspended') {
            await state.sharedAudioContext.resume();
        }

        if (state.sharedAudioContext.state !== 'running') {
            throw new Error('AudioContext not running');
        }
        state.pcmPlayer = new PCMPlayer(state.audioFormat, state.sharedAudioContext);
        window.state.pcmPlayer = pcmPlayer;
        if (state.audioMotion && pcmPlayer) {
            state.audioMotion.connectInput(state.pcmPlayer.getSourceNode());
        }
        state.audioStarted = true;

        // Hide click prompt
        const prompt = document.getElementById('clickPrompt');
        if (prompt) {
            prompt.classList.add('hidden');
        }
        // Start Volumio state polling
        fetchVolumioState();
        if (state.volumioStateInterval) clearInterval(state.volumioStateInterval);
        state.volumioStateInterval = setInterval(fetchVolumioState, 2000);

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
// function setupUserInteractionHandler() {
//     const handleUserInteraction = async () => {
//         try {
//             await startAudio();
//         } catch (e) {
//             console.error('[Audio] Failed to start after user interaction:', e);
//         }
//     };

//     // Listen for click on the prompt button
//     const promptButton = document.getElementById('startAudioBtn');
//     if (promptButton) {
//         promptButton.addEventListener('click', handleUserInteraction);
//         console.log('[Audio] User interaction handler ready');
//     }
// }


