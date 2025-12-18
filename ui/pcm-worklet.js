class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = 2;
    this.buffer = new Float32Array(0);
    this.maxBufferSamples = Math.floor(sampleRate * this.channels * 0.5); // ~500ms

    this.port.onmessage = (e) => {
      const data = e.data || {};
      if (data.type === 'config') {
        this.channels = Math.max(1, data.channels || 2);
        this.maxBufferSamples = Math.floor(sampleRate * this.channels * 0.5);
      } else if (data.type === 'samples' && data.samples) {
        const incoming = data.samples;
        const newBuf = new Float32Array(this.buffer.length + incoming.length);
        newBuf.set(this.buffer);
        newBuf.set(incoming, this.buffer.length);
        this.buffer = newBuf;
        if (this.buffer.length > this.maxBufferSamples) {
          const trimmed = new Float32Array(this.maxBufferSamples);
          trimmed.set(this.buffer.subarray(this.buffer.length - this.maxBufferSamples));
          this.buffer = trimmed;
        }
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const frames = output[0].length;
    const need = frames * this.channels;

    if (this.buffer.length >= need) {
      for (let ch = 0; ch < output.length; ch++) {
        const out = output[ch];
        for (let i = 0; i < frames; i++) {
          const idx = i * this.channels + Math.min(ch, this.channels - 1);
          out[i] = this.buffer[idx];
        }
      }
      this.buffer = this.buffer.slice(need);
    } else {
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
    }

    // Notify main thread about processing step (for FPS/diagnostics)
    this.port.postMessage({ type: 'processed', frames });
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
