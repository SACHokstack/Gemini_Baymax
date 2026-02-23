'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PipecatClient } from '@pipecat-ai/client-js';
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { VideoConsultation } from '@/components/VideoConsultation';
import { TranscriptPanel, TranscriptMessage } from '@/components/TranscriptPanel';
import { ControlBar } from '@/components/ControlBar';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export default function Home() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>('disconnected');
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [needsAudioGesture, setNeedsAudioGesture] = useState(false);
  
  const clientRef = useRef<PipecatClient | null>(null);
  const transportRef = useRef<SmallWebRTCTransport | null>(null);
  const botAudioRef = useRef<HTMLAudioElement | null>(null);
  const startEndpoint =
    process.env.NEXT_PUBLIC_PIPECAT_START_ENDPOINT ?? 'http://localhost:7860/start';

  // Add message to transcript
  const addMessage = useCallback((speaker: 'user' | 'bot', text: string) => {
    const newMessage: TranscriptMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      speaker,
      text,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  const attachBotAudioTrack = useCallback((track: MediaStreamTrack) => {
    if (!botAudioRef.current) return;
    if (track.kind !== 'audio') return;

    const stream = new MediaStream([track]);
    botAudioRef.current.srcObject = stream;

    botAudioRef.current
      .play()
      .then(() => setNeedsAudioGesture(false))
      .catch(() => setNeedsAudioGesture(true));
  }, []);

  // Initialize media
  const initMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      return null;
    }
  };

  // Start session
  const startSession = async () => {
    if (connectionStatus === 'connected' || connectionStatus === 'connecting') return;

    setConnectionStatus('connecting');

    try {
      // Initialize media
      await initMedia();
      
      // Use SmallWebRTC transport with explicit audio configuration
      const transport = new SmallWebRTCTransport({
        waitForICEGathering: false,
      });
      transportRef.current = transport;
      
      clientRef.current = new PipecatClient({
        transport,
        enableMic: micEnabled,
        enableCam: cameraEnabled,
        callbacks: {
          onBotReady: () => {
            console.log('Bot ready');
            setConnectionStatus('connected');
          },
          onUserTranscript: (data: { text: string }) => {
            if (data.text) {
              addMessage('user', data.text);
            }
          },
          onBotOutput: (data: { text?: string }) => {
            if (data.text) {
              addMessage('bot', data.text);
            }
          },
          onBotStartedSpeaking: () => {
            console.log('Bot started speaking');
          },
          onBotStoppedSpeaking: () => {
            console.log('Bot stopped speaking');
          },
          onTransportStateChanged: (state: string) => {
            console.log('Transport state:', state);
            if (state === 'connected') {
              setConnectionStatus('connected');
            } else if (state === 'disconnected') {
              setConnectionStatus('disconnected');
            }
          },
          onTrackStarted: (track: MediaStreamTrack, participant?: { local: boolean }) => {
            if (participant?.local === true) return;
            attachBotAudioTrack(track);
          },
          onError: (error) => {
            console.error('Error:', error);
            setConnectionStatus('error');
          },
        },
      });

      await clientRef.current.startBotAndConnect({ endpoint: startEndpoint });
      
    } catch (error) {
      console.error('Failed to start session:', error);
      setConnectionStatus('error');
    }
  };

  // Stop session
  const stopSession = async () => {
    if (clientRef.current) {
      await clientRef.current.disconnect();
      clientRef.current = null;
    }
    
    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    setConnectionStatus('disconnected');
    setScreenSharing(false);
    setMessages([]);
  };

  // Toggle microphone
  const toggleMic = async () => {
    if (!clientRef.current) return;
    
    try {
      if (micEnabled) {
        await clientRef.current.enableMic(false);
      } else {
        await clientRef.current.enableMic(true);
      }
      setMicEnabled(!micEnabled);
    } catch (error) {
      console.error('Error toggling mic:', error);
    }
  };

  // Toggle camera
  const toggleCamera = async () => {
    if (!clientRef.current) return;
    
    try {
      if (cameraEnabled) {
        await clientRef.current.enableCam(false);
      } else {
        await clientRef.current.enableCam(true);
      }
      setCameraEnabled(!cameraEnabled);
    } catch (error) {
      console.error('Error toggling camera:', error);
    }
  };

  // Toggle screen share
  const toggleScreenShare = async () => {
    if (!clientRef.current) return;
    
    try {
      if (screenSharing) {
        await clientRef.current.enableScreenShare(false);
      } else {
        await clientRef.current.enableScreenShare(true);
      }
      setScreenSharing(!screenSharing);
    } catch (error) {
      console.error('Error toggling screen share:', error);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white pb-24">
      {/* Bot audio output */}
      <audio ref={botAudioRef} autoPlay playsInline className="hidden" />
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-teal-100/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo + Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div>
                <span className="text-xl font-semibold text-teal-900">Medical Brain</span>
                <span className="hidden sm:inline text-teal-500 text-sm ml-2">| TB Diagnosis Assistant</span>
              </div>
            </div>
            
            {/* Status Indicator */}
            <ConnectionStatus status={connectionStatus} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Video Consultation Area */}
          <VideoConsultation 
            localStream={localStream}
            remoteStream={null}
            isConnected={connectionStatus === 'connected'}
          />
          
          {/* Transcript Panel */}
          <TranscriptPanel messages={messages} />

          {/* Start Button (when not connected) */}
          {connectionStatus === 'disconnected' && (
            <div className="mt-8 text-center">
              <button
                onClick={startSession}
                className="px-8 py-4 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-full font-semibold text-lg transition-all duration-200 shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 flex items-center gap-3 mx-auto"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Start Consultation
              </button>
              <p className="mt-4 text-sm text-slate-500">
                Connect with Dr. AI for TB symptom assessment
              </p>
            </div>
          )}

          {needsAudioGesture && (
            <div className="mt-4 text-center">
              <button
                onClick={() => {
                  botAudioRef.current?.play().then(() => setNeedsAudioGesture(false));
                }}
                className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm"
              >
                Enable Audio
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Control Bar */}
      <ControlBar
        micEnabled={micEnabled}
        cameraEnabled={cameraEnabled}
        screenSharing={screenSharing}
        isConnected={connectionStatus === 'connected'}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onEndCall={stopSession}
      />
    </div>
  );
}
