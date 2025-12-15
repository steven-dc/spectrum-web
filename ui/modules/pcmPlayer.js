// ===========================
// PCM PLAYER CLASS
// ===========================
export class PCMPlayer {
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
