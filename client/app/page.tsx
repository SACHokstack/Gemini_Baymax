'use client';

import { useState, useEffect, useRef } from 'react';
import { PipecatClient } from '@pipecat-ai/client-js';
import { DailyTransport } from '@pipecat-ai/daily-transport';

interface RoomData {
  url: string;
  token: string;
}

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState('Ready to start');
  const [transcript, setTranscript] = useState<string[]>([]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  const clientRef = useRef<PipecatClient | null>(null);

  const addTranscript = (text: string) => {
    setTranscript(prev => [...prev, text]);
  };

  const startSession = async () => {
    if (isConnected || isConnecting) return;
    
    setIsConnecting(true);
    setStatus('Creating room...');
    setTranscript([]);

    try {
      const roomResponse = await fetch('http://localhost:8000/create-room', {
        method: 'POST',
      });
      
      if (!roomResponse.ok) {
        throw new Error('Failed to create room');
      }
      
      const roomData: RoomData = await roomResponse.json();
      setStatus('Room created, connecting...');

      await fetch('http://localhost:8000/start-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          room_url: roomData.url, 
          token: roomData.token 
        }),
      });

      const transport = new DailyTransport();
      clientRef.current = new PipecatClient({
        transport,
        enableMic: true,
        enableCam: false,
        callbacks: {
          onBotReady: () => {
            setIsConnected(true);
            setIsConnecting(false);
            setStatus('Connected - Talk to the AI!');
            addTranscript('🤖: Hello! I\'m your medical assistant. How can I help you today?');
          },
          onUserTranscript: (data: { text: string }) => {
            if (data.text) {
              addTranscript(`👤: ${data.text}`);
            }
          },
          onBotTranscript: (data: { text: string }) => {
            if (data.text) {
              addTranscript(`🤖: ${data.text}`);
            }
          },
          onError: (error: Error) => {
            setStatus(`Error: ${error.message}`);
            setIsConnecting(false);
          },
        },
      });

      await clientRef.current.connect({ url: roomData.url });
      
    } catch (error) {
      console.error('Failed to start session:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsConnecting(false);
    }
  };

  const stopSession = async () => {
    if (clientRef.current) {
      await clientRef.current.disconnect();
      clientRef.current = null;
    }
    setIsConnected(false);
    setIsScreenSharing(false);
    setStatus('Ready to start');
  };

  const toggleScreenShare = async () => {
    if (!clientRef.current) return;
    
    try {
      if (isScreenSharing) {
        await clientRef.current.enableScreenShare(false);
        setIsScreenSharing(false);
        setStatus('Screen share stopped');
      } else {
        await clientRef.current.enableScreenShare(true);
        setIsScreenSharing(true);
        setStatus('Screen sharing...');
      }
    } catch (error) {
      console.error('Screen share error:', error);
    }
  };

  return (
    <main className="container">
      <div className="card">
        <div className="header">
          <h1>Medical Brain</h1>
          <p>AI Diagnostic Assistant powered by Gemini Live</p>
        </div>

        <div className="status-bar">
          <span style={{ fontWeight: 500 }}>Status:</span>
          <span className={`status ${isConnected ? 'connected' : isConnecting ? 'connecting' : 'ready'}`}>
            {status}
          </span>
        </div>

        <div className="transcript">
          {transcript.length === 0 ? (
            <p className="transcript-empty">Transcript will appear here...</p>
          ) : (
            transcript.map((msg, i) => (
              <p key={i}>{msg}</p>
            ))
          )}
        </div>

        <div className="controls">
          {!isConnected ? (
            <button
              onClick={startSession}
              disabled={isConnecting}
              className={`btn btn-primary`}
              style={{ opacity: isConnecting ? 0.6 : 1 }}
            >
              {isConnecting ? 'Connecting...' : 'Start Diagnosis'}
            </button>
          ) : (
            <>
              <button
                onClick={toggleScreenShare}
                className={`btn ${isScreenSharing ? 'btn-danger' : 'btn-secondary'}`}
              >
                {isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
              </button>
              <button
                onClick={stopSession}
                className="btn btn-danger"
              >
                Stop
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
