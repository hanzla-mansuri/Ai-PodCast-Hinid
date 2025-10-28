
export interface ScriptLine {
  speaker: string;
  line: string;
}

export interface PodcastScript {
  title: string;
  speakers: string[];
  script: ScriptLine[];
}

export interface TranscriptionEntry {
  id: number;
  speaker: 'user' | 'model';
  text: string;
}
