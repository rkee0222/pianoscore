export type AnalysisMode = 'client-detect' | 'manual';

export interface ScorePage {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface Measure {
  id: string;
  index: number;
  number: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  beats: number;
  bpm: number;
  duration: number;
  startTime: number;
  confidence: number;
  source: string;
}

export interface Score {
  id: string;
  title: string;
  createdAt: string;
  bpm: number;
  timeSignature: string;
  analysisMode: AnalysisMode;
  pages: ScorePage[];
  measures: Measure[];
  totalDuration: number;
  warnings: string[];
}
