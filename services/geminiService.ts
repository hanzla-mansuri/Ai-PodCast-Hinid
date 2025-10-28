import { GoogleGenAI, Type, Modality } from '@google/genai';
import { PodcastScript } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SCRIPT_GENERATION_MODEL = 'gemini-2.5-pro';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
export const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';

const podcastSchema = {
    type: Type.OBJECT,
    properties: {
        title: {
            type: Type.STRING,
            description: "A catchy title for the podcast episode.",
        },
        speakers: {
            type: Type.ARRAY,
            description: "A list of exactly 2 unique speaker names (e.g., 'Host', 'Expert A').",
            items: { type: Type.STRING },
        },
        script: {
            type: Type.ARRAY,
            description: "The full podcast script as an array of objects.",
            items: {
                type: Type.OBJECT,
                properties: {
                    speaker: {
                        type: Type.STRING,
                        description: "The name of the speaker for this line. Must be one of the names from the 'speakers' list.",
                    },
                    line: {
                        type: Type.STRING,
                        description: "The dialogue for the speaker."
                    },
                },
                required: ['speaker', 'line'],
            },
        },
    },
    required: ['title', 'speakers', 'script'],
};

export const generatePodcastScript = async (transcript: string, language: 'english' | 'hindi'): Promise<PodcastScript> => {
    try {
        const prompt = `Based on the following lecture transcript, create a detailed podcast script in the ${language} language for a discussion between exactly 2 people (e.g., a Host and an Expert). The podcast should break down the key concepts from the transcript, offer different perspectives, and make the content engaging for a general audience. Ensure the generated script strictly follows the provided JSON schema. Transcript: "${transcript}"`;
        
        const response = await ai.models.generateContent({
            model: SCRIPT_GENERATION_MODEL,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: podcastSchema,
            },
        });
        const jsonText = response.text;
        const podcastData = JSON.parse(jsonText) as PodcastScript;

        // Enforce exactly 2 speakers for TTS compatibility
        if (podcastData.speakers.length > 2) {
            podcastData.speakers = podcastData.speakers.slice(0, 2);
            const allowedSpeakers = new Set(podcastData.speakers);
            podcastData.script = podcastData.script.filter(line => allowedSpeakers.has(line.speaker));
        } else if (podcastData.speakers.length < 2) {
            throw new Error("Generated script has fewer than 2 speakers, which is required for multi-speaker TTS.");
        }
        
        return podcastData;
    } catch (error) {
        console.error("Error generating podcast script:", error);
        throw new Error("Failed to generate podcast script. Please check the console for details.");
    }
};

export const generateMultiSpeakerSpeech = async (scriptData: PodcastScript): Promise<string> => {
    // Using two distinct voices to create a male/female dynamic.
    const availableVoices = ['Kore', 'Puck'];
    
    if (scriptData.speakers.length !== 2) {
        throw new Error("This TTS implementation supports exactly 2 unique speakers.");
    }

    const speakerVoiceMap = new Map<string, string>();
    scriptData.speakers.forEach((speaker, index) => {
        speakerVoiceMap.set(speaker, availableVoices[index]);
    });

    const fullTranscriptForTTS = scriptData.script
        .map(line => `${line.speaker}: ${line.line}`)
        .join('\n');

    const ttsPrompt = `TTS the following conversation: \n${fullTranscriptForTTS}`;

    const speakerVoiceConfigs = scriptData.speakers.map(speaker => ({
        speaker: speaker,
        voiceConfig: {
            prebuiltVoiceConfig: { voiceName: speakerVoiceMap.get(speaker) as string }
        }
    }));

    try {
        const response = await ai.models.generateContent({
            model: TTS_MODEL,
            contents: [{ parts: [{ text: ttsPrompt }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    multiSpeakerVoiceConfig: {
                        speakerVoiceConfigs: speakerVoiceConfigs,
                    }
                }
            }
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("No audio data received from TTS API.");
        }
        return base64Audio;
    } catch (error) {
        console.error("Error generating speech:", error);
        throw new Error("Failed to generate speech. Please check the console for details.");
    }
};

export const getAi = () => ai;