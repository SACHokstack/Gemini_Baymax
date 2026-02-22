// Gemini Live Transcription - Frontend Application

class GeminiLiveTranscription {
    constructor() {
        // State
        this.ws = null;
        this.isConnected = false;
        this.isRecording = false;
        this.audioContext = null;
        this.mediaStream = null;
        this.audioWorklet = null;
        this.audioQueue = [];
        this.transcriptionEntries = [];
        this.currentPartialText = '';
        this.audioMuted = false;
        this.audioPlayer = null;

        // DOM Elements
        this.elements = {
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            clearBtn: document.getElementById('clearBtn'),
            exportTxtBtn: document.getElementById('exportTxtBtn'),
            exportJsonBtn: document.getElementById('exportJsonBtn'),
            muteAudioBtn: document.getElementById('muteAudioBtn'),
            statusDot: document.getElementById('statusDot'),
            statusText: document.getElementById('statusText'),
            modelSelect: document.getElementById('modelSelect'),
            transcriptionContainer: document.getElementById('transcriptionContainer'),
            placeholder: document.getElementById('placeholder'),
            voiceIndicator: document.getElementById('voiceIndicator'),
            voiceStatus: document.getElementById('voiceStatus'),
            waveContainer: document.querySelector('.wave-container'),
            responseSection: document.getElementById('responseSection'),
            responseContainer: document.getElementById('responseContainer'),
            errorModal: document.getElementById('errorModal'),
            errorMessage: document.getElementById('errorMessage'),
            closeErrorModal: document.getElementById('closeErrorModal'),
            errorModalOk: document.getElementById('errorModalOk'),
            permissionModal: document.getElementById('permissionModal'),
            permissionModalOk: document.getElementById('permissionModalOk')
        };

        this.init();
    }

    init() {
        this.bindEvents();
        this.initAudioPlayer();
    }

    bindEvents() {
        this.elements.startBtn.addEventListener('click', () => this.startRecording());
        this.elements.stopBtn.addEventListener('click', () => this.stopRecording());
        this.elements.clearBtn.addEventListener('click', () => this.clearTranscription());
        this.elements.exportTxtBtn.addEventListener('click', () => this.exportTxt());
        this.elements.exportJsonBtn.addEventListener('click', () => this.exportJson());
        this.elements.muteAudioBtn.addEventListener('click', () => this.toggleMute());

        // Modal events
        this.elements.closeErrorModal.addEventListener('click', () => this.hideError());
        this.elements.errorModalOk.addEventListener('click', () => this.hideError());
        this.elements.permissionModalOk.addEventListener('click', () => this.hidePermissionModal());

        // Close modal on outside click
        this.elements.errorModal.addEventListener('click', (e) => {
            if (e.target === this.elements.errorModal) this.hideError();
        });
    }

    initAudioPlayer() {
        // Initialize audio context for playing responses
        this.audioPlayer = {
            context: null,
            queue: [],
            isPlaying: false
        };
    }

    async startRecording() {
        try {
            // Show permission modal first
            this.showPermissionModal();

            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000
                }
            });

            this.hidePermissionModal();

            // Initialize audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });

            // Connect to WebSocket
            await this.connectWebSocket();

            // Start audio processing
            await this.startAudioProcessing();

            // Update UI
            this.isRecording = true;
            this.updateUI();

        } catch (error) {
            console.error('Error starting recording:', error);
            this.hidePermissionModal();

            if (error.name === 'NotAllowedError') {
                this.showError('Microphone access denied. Please allow microphone access and try again.');
            } else if (error.name === 'NotFoundError') {
                this.showError('No microphone found. Please connect a microphone and try again.');
            } else {
                this.showError('Failed to start recording: ' + error.message);
            }
        }
    }

    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');

                // Send start message
                this.ws.send(JSON.stringify({
                    type: 'start',
                    model: this.elements.modelSelect.value
                }));

                resolve();
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(new Error('WebSocket connection failed'));
            };

            this.ws.onclose = () => {
                console.log('WebSocket closed');
                this.isConnected = false;
                this.updateStatus('disconnected', 'Disconnected');

                if (this.isRecording) {
                    this.stopRecording();
                }
            };
        });
    }

    async startAudioProcessing() {
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);

        let chunkCount = 0;

        try {
            // Load the AudioWorklet processor
            await this.audioContext.audioWorklet.addModule('processor.js');

            // Create AudioWorkletNode
            const workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

            // Handle audio data from the worklet
            workletNode.port.onmessage = (event) => {
                if (!this.isRecording || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

                if (event.data.type === 'audio') {
                    const float32Data = event.data.data;

                    // Convert to 16-bit PCM
                    const pcmData = this.floatTo16BitPCM(float32Data);

                    // Convert to base64
                    const base64Audio = this.arrayBufferToBase64(pcmData);

                    // Send to server
                    this.ws.send(JSON.stringify({
                        type: 'audio',
                        data: base64Audio
                    }));

                    chunkCount++;

                    // Log every 50 chunks (roughly every 0.5 seconds)
                    if (chunkCount % 50 === 0) {
                        console.log(`Sent ${chunkCount} audio chunks, base64 length: ${base64Audio.length}`);
                    }

                    // Update voice indicator
                    this.updateVoiceIndicator(float32Data);
                }
            };

            source.connect(workletNode);
            workletNode.connect(this.audioContext.destination);

            this.audioWorklet = workletNode;
            this.audioSource = source;

            console.log('AudioWorklet processing started, sample rate:', this.audioContext.sampleRate);

        } catch (error) {
            console.error('Failed to initialize AudioWorklet, falling back to ScriptProcessor:', error);

            // Fallback to deprecated ScriptProcessor if AudioWorklet fails
            const bufferSize = 4096;
            const processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

            processor.onaudioprocess = (event) => {
                if (!this.isRecording || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

                const inputData = event.inputBuffer.getChannelData(0);
                const pcmData = this.floatTo16BitPCM(inputData);
                const base64Audio = this.arrayBufferToBase64(pcmData);

                this.ws.send(JSON.stringify({
                    type: 'audio',
                    data: base64Audio
                }));

                chunkCount++;
                if (chunkCount % 50 === 0) {
                    console.log(`Sent ${chunkCount} audio chunks, base64 length: ${base64Audio.length}`);
                }

                this.updateVoiceIndicator(inputData);
            };

            source.connect(processor);
            processor.connect(this.audioContext.destination);

            this.audioProcessor = processor;
            this.audioSource = source;

            console.log('ScriptProcessor fallback started, sample rate:', this.audioContext.sampleRate);
        }

        // Start voice indicator animation
        this.elements.waveContainer.classList.add('active');
        this.updateVoiceStatus('listening');
    }

    floatTo16BitPCM(float32Array) {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);

        for (let i = 0; i < float32Array.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        return buffer;
    }

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    updateVoiceIndicator(audioData) {
        // Calculate RMS (root mean square) for volume level
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        const rms = Math.sqrt(sum / audioData.length);

        // Update wave bars based on volume
        const bars = this.elements.waveContainer.querySelectorAll('.wave-bar');
        const normalizedVolume = Math.min(1, rms * 10);

        bars.forEach((bar, index) => {
            const height = 8 + normalizedVolume * 24 * Math.random();
            bar.style.height = `${height}px`;
        });
    }

    handleMessage(message) {
        switch (message.type) {
            case 'status':
                this.handleStatus(message);
                break;
            case 'transcription':
                this.handleTranscription(message);
                break;
            case 'audio':
                this.handleAudio(message);
                break;
            case 'error':
                this.showError(message.message);
                break;
        }
    }

    handleStatus(message) {
        switch (message.status) {
            case 'connected':
                this.isConnected = true;
                this.updateStatus('connected', 'Connected');
                break;
            case 'disconnected':
                this.isConnected = false;
                this.updateStatus('disconnected', 'Disconnected');
                break;
        }
    }

    handleTranscription(message) {
        // Hide placeholder
        if (this.elements.placeholder) {
            this.elements.placeholder.style.display = 'none';
        }

        // Add transcription entry
        const entry = {
            text: message.text,
            timestamp: message.timestamp || new Date().toISOString(),
            type: 'user'
        };

        this.transcriptionEntries.push(entry);
        this.renderTranscriptionEntry(entry);

        // Enable export buttons
        this.elements.exportTxtBtn.disabled = false;
        this.elements.exportJsonBtn.disabled = false;
    }

    renderTranscriptionEntry(entry) {
        const div = document.createElement('div');
        div.className = `transcription-entry ${entry.type}`;

        const time = new Date(entry.timestamp).toLocaleTimeString();

        div.innerHTML = `
      <div class="timestamp">${time}</div>
      <div class="text">${this.escapeHtml(entry.text)}</div>
    `;

        this.elements.transcriptionContainer.appendChild(div);

        // Auto-scroll to bottom
        this.elements.transcriptionContainer.scrollTop = this.elements.transcriptionContainer.scrollHeight;
    }

    async handleAudio(message) {
        if (this.audioMuted) return;

        try {
            // Decode base64 audio
            const binaryString = atob(message.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Play audio
            await this.playAudio(bytes.buffer, message.mimeType);

            // Show response section
            this.elements.responseSection.classList.add('visible');

        } catch (error) {
            console.error('Error handling audio:', error);
        }
    }

    async playAudio(audioBuffer, mimeType) {
        if (!this.audioPlayer.context) {
            this.audioPlayer.context = new (window.AudioContext || window.webkitAudioContext)();
        }

        try {
            const audioBuffer = await this.audioPlayer.context.decodeAudioData(audioBuffer);
            const source = this.audioPlayer.context.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioPlayer.context.destination);
            source.start(0);
        } catch (error) {
            console.error('Error playing audio:', error);
        }
    }

    async stopRecording() {
        this.isRecording = false;

        // Stop audio worklet
        if (this.audioWorklet) {
            this.audioWorklet.disconnect();
            this.audioWorklet = null;
        }

        // Stop audio processor (fallback)
        if (this.audioProcessor) {
            this.audioProcessor.disconnect();
            this.audioProcessor = null;
        }

        if (this.audioSource) {
            this.audioSource.disconnect();
            this.audioSource = null;
        }

        // Stop media stream
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        // Close audio context
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }

        // Send stop message and close WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'stop' }));
            this.ws.close();
        }

        // Update UI
        this.elements.waveContainer.classList.remove('active');
        this.updateVoiceStatus('idle');
        this.updateUI();
    }

    updateUI() {
        this.elements.startBtn.disabled = this.isRecording;
        this.elements.stopBtn.disabled = !this.isRecording;

        if (this.isRecording) {
            this.elements.startBtn.classList.add('recording');
            this.elements.startBtn.querySelector('.btn-text').textContent = 'Recording...';
        } else {
            this.elements.startBtn.classList.remove('recording');
            this.elements.startBtn.querySelector('.btn-text').textContent = 'Start Recording';
        }
    }

    updateStatus(status, text) {
        this.elements.statusDot.className = 'status-dot ' + status;
        this.elements.statusText.textContent = text;
    }

    updateVoiceStatus(status) {
        this.elements.voiceStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        this.elements.voiceStatus.className = 'voice-status ' + (status === 'listening' ? 'active' : '');
    }

    clearTranscription() {
        this.transcriptionEntries = [];
        this.elements.transcriptionContainer.innerHTML = `
      <div class="placeholder" id="placeholder">
        <p>Click "Start Recording" to begin transcription...</p>
        <p class="hint">Your speech will appear here in real-time</p>
      </div>
    `;
        this.elements.placeholder = document.getElementById('placeholder');

        // Disable export buttons
        this.elements.exportTxtBtn.disabled = true;
        this.elements.exportJsonBtn.disabled = true;

        // Hide response section
        this.elements.responseSection.classList.remove('visible');
    }

    toggleMute() {
        this.audioMuted = !this.audioMuted;
        this.elements.muteAudioBtn.textContent = this.audioMuted ? '🔇 Audio OFF' : '🔊 Audio ON';
    }

    exportTxt() {
        if (this.transcriptionEntries.length === 0) return;

        let content = 'Gemini Live Transcription\n';
        content += '='.repeat(50) + '\n\n';

        this.transcriptionEntries.forEach(entry => {
            const time = new Date(entry.timestamp).toLocaleString();
            content += `[${time}]\n${entry.text}\n\n`;
        });

        this.downloadFile(content, 'transcription.txt', 'text/plain');
    }

    exportJson() {
        if (this.transcriptionEntries.length === 0) return;

        const data = {
            title: 'Gemini Live Transcription',
            exportDate: new Date().toISOString(),
            entries: this.transcriptionEntries
        };

        this.downloadFile(JSON.stringify(data, null, 2), 'transcription.json', 'application/json');
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorModal.classList.add('visible');
    }

    hideError() {
        this.elements.errorModal.classList.remove('visible');
    }

    showPermissionModal() {
        this.elements.permissionModal.classList.add('visible');
    }

    hidePermissionModal() {
        this.elements.permissionModal.classList.remove('visible');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GeminiLiveTranscription();
});
