require('dotenv').config({ path: '../.env' });
const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

// WebSocket server for client connections
const wss = new WebSocketServer({ server });

// Gemini Live API configuration
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY;
// Supported models for Live API: gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash-live-001
const GEMINI_MODEL = 'gemini-2.0-flash-live-001';

wss.on('connection', (ws) => {
    console.log('New client connected');

    let geminiSocket = null;
    let isConnected = false;

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Received message type:', message.type);

            switch (message.type) {
                case 'start':
                    // Connect to Gemini Live API
                    try {
                        geminiSocket = await connectToGemini(ws, message.model || GEMINI_MODEL);
                        isConnected = true;

                        ws.send(JSON.stringify({
                            type: 'status',
                            status: 'connected',
                            message: 'Connected to Gemini Live API'
                        }));
                    } catch (error) {
                        console.error('Failed to start Gemini session:', error);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Failed to connect to Gemini: ' + error.message
                        }));
                    }
                    break;

                case 'audio':
                    // Send audio chunk to Gemini
                    if (geminiSocket && geminiSocket.readyState === 1) { // WebSocket.OPEN
                        const audioMessage = {
                            realtime_input: {
                                media_chunks: [{
                                    data: message.data,
                                    mime_type: 'audio/pcm;rate=16000'
                                }]
                            }
                        };
                        geminiWsSend(geminiSocket, audioMessage);
                    }
                    break;

                case 'text':
                    // Send text message to Gemini
                    if (geminiSocket && geminiSocket.readyState === 1) {
                        const textMessage = {
                            realtime_input: {
                                media_chunks: [{
                                    data: btoa(message.text),
                                    mime_type: 'text/plain'
                                }]
                            }
                        };
                        geminiWsSend(geminiSocket, textMessage);
                    }
                    break;

                case 'stop':
                    // End the session
                    if (geminiSocket) {
                        geminiSocket.close();
                        geminiSocket = null;
                        isConnected = false;
                        console.log('Gemini session ended');
                        ws.send(JSON.stringify({
                            type: 'status',
                            status: 'disconnected',
                            message: 'Session ended'
                        }));
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: error.message
            }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (geminiSocket) {
            geminiSocket.close();
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Helper function to send to Gemini with logging
function geminiWsSend(ws, message) {
    const jsonStr = JSON.stringify(message);
    console.log('Sending to Gemini, message type:', message.realtime_input?.media_chunks?.[0]?.mime_type || 'unknown');
    ws.send(jsonStr);
}

// Function to connect to Gemini Live API
function connectToGemini(clientWs, model) {
    return new Promise((resolve, reject) => {
        const WebSocket = require('ws');

        const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

        console.log('Connecting to Gemini Live API...');

        const geminiWs = new WebSocket(url, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        geminiWs.on('open', () => {
            console.log('WebSocket opened to Gemini Live API');

            // Send setup message
            const setupMessage = {
                setup: {
                    model: `models/${model}`,
                    generation_config: {
                        response_modalities: ['AUDIO', 'TEXT']
                    }
                }
            };

            console.log('Sending setup message for model:', model);
            geminiWs.send(JSON.stringify(setupMessage));
            resolve(geminiWs);
        });

        geminiWs.on('message', (data) => {
            try {
                const response = JSON.parse(data.toString());
                console.log('Received from Gemini, keys:', Object.keys(response).join(', '));

                // Handle setup complete
                if (response.setupComplete) {
                    console.log('Gemini setup complete - ready for audio');
                    clientWs.send(JSON.stringify({
                        type: 'status',
                        status: 'ready',
                        message: 'Ready for audio input'
                    }));
                    return;
                }

                // Handle server content (transcription and audio)
                if (response.serverContent) {
                    const content = response.serverContent;
                    console.log('Server content received, keys:', Object.keys(content).join(', '));

                    // Handle model turn with parts
                    if (content.modelTurn && content.modelTurn.parts) {
                        console.log('Model turn parts:', content.modelTurn.parts.length);
                        for (const part of content.modelTurn.parts) {
                            // Text response
                            if (part.text) {
                                console.log('Text response:', part.text.substring(0, 100));
                                clientWs.send(JSON.stringify({
                                    type: 'transcription',
                                    text: part.text,
                                    timestamp: new Date().toISOString(),
                                    source: 'ai'
                                }));
                            }

                            // Audio response
                            if (part.inlineData) {
                                console.log('Audio response received, mime:', part.inlineData.mimeType);
                                clientWs.send(JSON.stringify({
                                    type: 'audio',
                                    data: part.inlineData.data,
                                    mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                                    timestamp: new Date().toISOString()
                                }));
                            }
                        }
                    }

                    // Handle transcription from input
                    if (content.inputTranscription) {
                        console.log('Input transcription:', content.inputTranscription.text);
                        clientWs.send(JSON.stringify({
                            type: 'transcription',
                            text: content.inputTranscription.text,
                            timestamp: new Date().toISOString(),
                            source: 'user'
                        }));
                    }

                    // Check for turn complete
                    if (content.turnComplete !== undefined) {
                        console.log('Turn complete:', content.turnComplete);
                    }
                }

                // Handle usage metadata
                if (response.usageMetadata) {
                    console.log('Usage:', JSON.stringify(response.usageMetadata));
                }

                // Log any errors
                if (response.error) {
                    console.error('Gemini error:', response.error);
                    clientWs.send(JSON.stringify({
                        type: 'error',
                        message: response.error.message || JSON.stringify(response.error)
                    }));
                }

            } catch (error) {
                console.error('Error parsing Gemini response:', error);
                console.log('Raw response:', data.toString().substring(0, 500));
            }
        });

        geminiWs.on('error', (error) => {
            console.error('Gemini WebSocket error:', error);
            reject(error);
        });

        geminiWs.on('close', (code, reason) => {
            console.log('Gemini connection closed, code:', code, 'reason:', reason?.toString());
        });
    });
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
