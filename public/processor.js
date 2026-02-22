// PCM Audio Processor for AudioWorklet
// This runs in a separate thread to avoid blocking the main thread

class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.chunkSize = 4096; // Match the previous buffer size
        this.buffer = [];
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];

        if (input.length > 0) {
            const channelData = input[0]; // Float32Array

            // Send the audio data to the main thread
            // We send a copy since the buffer gets reused
            const audioChunk = new Float32Array(channelData);
            this.port.postMessage({
                type: 'audio',
                data: audioChunk
            });
        }

        return true; // Keep the processor alive
    }
}

registerProcessor('pcm-processor', PCMProcessor);
