import { describe, expect, it } from 'vitest';
import { applyTempo, measureAtTime, moveMeasure, rebuildTimeline } from './timeline';
import type { Score } from './types';

const score: Score = {
  id: 'test', title: 'Test', createdAt: '2026-01-01', bpm: 120, timeSignature: '4/4',
  analysisMode: 'manual', pages: [], warnings: [], totalDuration: 4,
  measures: [
    { id: 'a', index: 0, number: '1', page: 0, x: 0, y: 0, width: 1, height: .2, beats: 4, bpm: 120, duration: 2, startTime: 0, confidence: 1, source: 'manual' },
    { id: 'b', index: 1, number: '2', page: 0, x: 0, y: .2, width: 1, height: .2, beats: 4, bpm: 120, duration: 2, startTime: 2, confidence: 1, source: 'manual' },
  ],
};

describe('performance timeline', () => {
  it('recalculates measure starts after duration correction', () => {
    const rebuilt = rebuildTimeline(score, [{ ...score.measures[0], duration: 3 }, score.measures[1]]);
    expect(rebuilt.measures[1].startTime).toBe(3);
    expect(rebuilt.totalDuration).toBe(5);
    expect(measureAtTime(rebuilt.measures, 3.2)).toBe(1);
  });
  it('applies global BPM from recognized quarter beats', () => {
    const changed = applyTempo(score, 60);
    expect(changed.measures.map((measure) => measure.duration)).toEqual([4, 4]);
    expect(changed.totalDuration).toBe(8);
  });
  it('supports manual performance order', () => {
    expect(moveMeasure(score, 0, 1).measures.map((measure) => measure.id)).toEqual(['b', 'a']);
  });
});
