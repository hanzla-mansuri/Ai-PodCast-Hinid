
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveSession, Modality, Blob, LiveServerMessage } from '@google/genai';
import { getAi, LIVE_MODEL } from '../services/geminiService';
// FIX: The 'decode' function was not imported, causing an error when processing audio data.
import { decode, decodeAudioData, encode } from '../utils/audio';
import { MicIcon, StopIcon, LoaderIcon, UserIcon, BotIcon } from './icons';
import { TranscriptionEntry } from '../types';

const LiveConversation: React.FC = () => {
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [transcriptionHistory, setTranscriptionHistory] = useState<TranscriptionEntry[]>([]);
    
    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');
    const nextStartTimeRef = useRef(0);
    const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    const cleanup = useCallback(() => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if(mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
            mediaStreamSourceRef.current = null;
        }
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            inputAudioContextRef.current.close();
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            outputAudioContextRef.current.close();
        }

        audioSourcesRef.current.forEach(source => source.stop());
        audioSourcesRef.current.clear();
        nextStartTimeRef.current = 0;
    }, []);

    const stopSession = useCallback(async () => {
        setIsSessionActive(false);
        setStatus('idle');
        
        if (sessionPromiseRef.current) {
            try {
                const session = await sessionPromiseRef.current;
                session.close();
            } catch (e) {
                console.error("Error closing session:", e);
            }
            sessionPromiseRef.current = null;
        }
        cleanup();
    }, [cleanup]);

    useEffect(() => {
        return () => {
            stopSession();
        };
    }, [stopSession]);
    
    const handleStartSession = async () => {
        if (isSessionActive) return;
        setStatus('connecting');
        setErrorMessage('');
        setTranscriptionHistory([]);
        currentInputTranscriptionRef.current = '';
        currentOutputTranscriptionRef.current = '';

        try {
            mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            const ai = getAi();
            sessionPromiseRef.current = ai.live.connect({
                model: LIVE_MODEL,
                callbacks: {
                    onopen: () => {
                        // FIX: Cast window to `any` to access the vendor-prefixed `webkitAudioContext` for cross-browser compatibility, resolving a TypeScript error.
                        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                        // FIX: Cast window to `any` to access the vendor-prefixed `webkitAudioContext` for cross-browser compatibility, resolving a TypeScript error.
                        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                        
                        if (!mediaStreamRef.current || !inputAudioContextRef.current) return;
                        
                        mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
                        scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                        
                        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob: Blob = {
                                data: encode(new Uint8Array(new Int16Array(inputData.map(f => f * 32768)).buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then((session) => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            }
                        };
                        
                        mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);

                        setIsSessionActive(true);
                        setStatus('listening');
                    },
                    onmessage: async (message: LiveServerMessage) => {
                         if (message.serverContent?.outputTranscription) {
                            currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                        }
                        if (message.serverContent?.inputTranscription) {
                            currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                        }

                        if (message.serverContent?.turnComplete) {
                            const fullInput = currentInputTranscriptionRef.current.trim();
                            const fullOutput = currentOutputTranscriptionRef.current.trim();
                            
                            setTranscriptionHistory(prev => {
                                const newHistory = [...prev];
                                if (fullInput) newHistory.push({ id: Date.now(), speaker: 'user', text: fullInput });
                                if (fullOutput) newHistory.push({ id: Date.now() + 1, speaker: 'model', text: fullOutput });
                                return newHistory;
                            });
                            
                            currentInputTranscriptionRef.current = '';
                            currentOutputTranscriptionRef.current = '';
                        }

                        const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (audioData && outputAudioContextRef.current) {
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
                            const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContextRef.current, 24000, 1);
                            
                            const source = outputAudioContextRef.current.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioContextRef.current.destination);
                            
                            source.addEventListener('ended', () => {
                                audioSourcesRef.current.delete(source);
                            });
                            
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            audioSourcesRef.current.add(source);
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error("Live session error:", e);
                        setErrorMessage("A connection error occurred. Please try again.");
                        setStatus('error');
                        stopSession();
                    },
                    onclose: (e: CloseEvent) => {
                        console.log("Live session closed.");
                        stopSession();
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                },
            });

        } catch (error) {
            console.error("Failed to start session:", error);
            setErrorMessage("Could not access microphone. Please grant permission and try again.");
            setStatus('error');
            cleanup();
        }
    };
    
    return (
        <div className="flex flex-col gap-6 items-center">
            <p className="text-center text-gray-400">
                Talk with Gemini in real-time. Start the session and begin speaking.
            </p>

            <div className="flex justify-center items-center h-24">
                {!isSessionActive ? (
                    <button
                        onClick={handleStartSession}
                        disabled={status === 'connecting'}
                        className="flex items-center gap-3 px-8 py-4 bg-brand-secondary text-white font-bold rounded-full shadow-lg hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-base-200 focus:ring-brand-secondary disabled:bg-gray-500 disabled:cursor-not-allowed transition-transform transform hover:scale-105"
                    >
                        {status === 'connecting' ? <LoaderIcon className="w-6 h-6" /> : <MicIcon className="w-6 h-6" />}
                        {status === 'connecting' ? 'Connecting...' : 'Start Conversation'}
                    </button>
                ) : (
                    <button
                        onClick={stopSession}
                        className="flex items-center gap-3 px-8 py-4 bg-red-600 text-white font-bold rounded-full shadow-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-base-200 focus:ring-red-500 transition-transform transform hover:scale-105"
                    >
                        <StopIcon className="w-6 h-6" />
                        <span>Stop Session</span>
                    </button>
                )}
            </div>

            {errorMessage && <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-md text-center">{errorMessage}</div>}
            
            <div className="w-full h-96 bg-base-100 rounded-lg p-4 overflow-y-auto flex flex-col gap-4">
                {transcriptionHistory.length === 0 && (
                     <div className="flex-grow flex items-center justify-center text-gray-500">
                        {status === 'listening' ? "Listening..." : "Conversation will appear here..."}
                     </div>
                )}
                {transcriptionHistory.map((entry) => (
                    <div key={entry.id} className={`flex gap-3 items-start ${entry.speaker === 'user' ? 'justify-end' : ''}`}>
                        {entry.speaker === 'model' && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center text-white"><BotIcon className="w-5 h-5"/></div>}
                        <div className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg ${entry.speaker === 'user' ? 'bg-brand-secondary text-white rounded-br-none' : 'bg-base-300 text-content rounded-bl-none'}`}>
                            <p>{entry.text}</p>
                        </div>
                        {entry.speaker === 'user' && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-white"><UserIcon className="w-5 h-5"/></div>}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LiveConversation;
