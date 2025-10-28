import React, { useState, useRef } from 'react';
import { PodcastScript } from '../types';
import { generatePodcastScript, generateMultiSpeakerSpeech } from '../services/geminiService';
import { LoaderIcon } from './icons';
import { decode, pcmToWav } from '../utils/audio';

const PodcastGenerator: React.FC = () => {
    const [transcript, setTranscript] = useState('');
    const [language, setLanguage] = useState<'english' | 'hindi'>('hindi');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [generatedScript, setGeneratedScript] = useState<PodcastScript | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    const handleGenerate = async () => {
        if (!transcript.trim()) {
            setError('Please enter a lecture transcript.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedScript(null);
        setAudioUrl(null);

        try {
            setLoadingMessage('Generating podcast script...');
            const scriptData = await generatePodcastScript(transcript, language);
            setGeneratedScript(scriptData);

            setLoadingMessage('Generating multi-speaker audio...');
            const base64Audio = await generateMultiSpeakerSpeech(scriptData);
            
            const pcmData = decode(base64Audio);
            // The Gemini TTS API returns audio as 24kHz, 1-channel, 16-bit PCM.
            const audioBlob = pcmToWav(pcmData, 24000, 1, 16);
            const url = URL.createObjectURL(audioBlob);
            setAudioUrl(url);

        } catch (err: any) {
            setError(err.message || 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div>
                    <label htmlFor="language" className="block text-sm font-medium text-gray-300 mb-2">
                        Podcast Language
                    </label>
                    <select
                        id="language"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value as 'english' | 'hindi')}
                        className="w-full bg-base-300 border border-gray-600 rounded-md shadow-sm p-3 text-content focus:ring-brand-secondary focus:border-brand-secondary transition"
                        disabled={isLoading}
                    >
                        <option value="hindi">Hindi</option>
                        <option value="english">English</option>
                    </select>
                </div>
            </div>

            <div>
                <label htmlFor="transcript" className="block text-sm font-medium text-gray-300 mb-2">
                    Lecture Transcript
                </label>
                <textarea
                    id="transcript"
                    rows={10}
                    className="w-full bg-base-300 border border-gray-600 rounded-md shadow-sm p-3 text-content focus:ring-brand-secondary focus:border-brand-secondary transition"
                    placeholder="Paste your lecture transcript here..."
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    disabled={isLoading}
                />
            </div>

            <div className="flex justify-center">
                <button
                    onClick={handleGenerate}
                    disabled={isLoading || !transcript.trim()}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 bg-brand-secondary text-white font-bold rounded-md shadow-lg hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-base-200 focus:ring-brand-secondary disabled:bg-gray-500 disabled:cursor-not-allowed transition-transform transform hover:scale-105"
                >
                    {isLoading ? <LoaderIcon className="w-5 h-5" /> : 'Generate Podcast'}
                </button>
            </div>
            
            {isLoading && <p className="text-center text-brand-light">{loadingMessage}</p>}
            {error && <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-md text-center">{error}</div>}

            {generatedScript && (
                <div className="space-y-6 bg-base-100 p-6 rounded-lg">
                    <h2 className="text-2xl font-bold text-brand-light text-center">{generatedScript.title}</h2>
                    
                    {audioUrl && (
                        <div className="flex flex-col items-center">
                           <audio ref={audioRef} controls src={audioUrl} className="w-full max-w-md">
                                Your browser does not support the audio element.
                            </audio>
                        </div>
                    )}
                    
                    <div className="max-h-96 overflow-y-auto p-4 bg-base-300 rounded-md space-y-4">
                         <h3 className="text-xl font-semibold mb-2 sticky top-0 bg-base-300 py-2">Script</h3>
                        {generatedScript.script.map((line, index) => (
                           <div key={index} className="flex flex-col">
                               <p className="font-bold text-brand-light">{line.speaker}:</p>
                               <p className="pl-4 text-gray-300">{line.line}</p>
                           </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PodcastGenerator;