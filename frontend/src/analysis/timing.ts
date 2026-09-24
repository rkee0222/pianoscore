// Pure timing model shared by the analyzer. Timing accuracy is the priority,
// so this mirrors the former backend formula: duration = quarterBeats * 60 / bpm.

import type { Region } from './detect';
import type { Measure } from '../types';

export interface TimeSignature {
  beats: number;
  beatType: number;
}

/** Quarter-note beats implied by a time signature (e.g. 6/8 -> 3.0 quarter beats). */
export function quarterBeatsFor(signature: TimeSignature): number {
  return signature.beats * 4 / signature.beatType;
}

export function parseTimeSignature(input: string): TimeSignature {
  const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(input);
  if (!match) return { beats: 4, beatType: 4 };
  const beats = Math.min(32, Math.max(1, Number(match[1])));
  const beatType = [1, 2, 4, 8, 16, 32].includes(Number(match[2])) ? Number(match[2]) : 4;
  return { beats, beatType };
}

/**
 * Build ordered, time-contiguous measures from detected regions.
 * Every region becomes one measure using the given signature and BPM,
 * which keeps scroll transitions aligned to real barlines.
 */
export function buildMeasures(regions: Region[], bpm: number, timeSignature: string, source: string): Measure[] {
  const signature = parseTimeSignature(timeSignature);
  const quarterBeats = quarterBeatsFor(signature);
  const safeBpm = Math.min(300, Math.max(20, bpm));
  const duration = quarterBeats * 60 / safeBpm;
  let elapsed = 0;
  return regions.map((region, index) => {
    const measure: Measure = {
      id: `measure-${index + 1}`,
      index,
      number: String(index + 1),
      page: region.page,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      beats: Number(quarterBeats.toFixed(3)),
      bpm: Number(safeBpm.toFixed(2)),
      duration: Number(duration.toFixed(3)),
      startTime: Number(elapsed.toFixed(3)),
      confidence: Number(region.confidence.toFixed(2)),
      source,
    };
    elapsed += duration;
    return measure;
  });
}

export function totalDurationOf(measures: Measure[]): number {
  return Number(measures.reduce((sum, measure) => sum + measure.duration, 0).toFixed(3));
}
