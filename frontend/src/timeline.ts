import type { Measure, Score } from './types';

export function rebuildTimeline(score: Score, measures = score.measures): Score {
  let elapsed = 0;
  const rebuilt = measures.map((measure, index) => {
    const next = {
      ...measure,
      index,
      duration: Math.max(0.1, Number(measure.duration) || 0.1),
      startTime: elapsed,
    };
    elapsed += next.duration;
    return next;
  });
  return { ...score, measures: rebuilt, totalDuration: elapsed };
}

export function applyTempo(score: Score, bpm: number): Score {
  const safeBpm = Math.min(300, Math.max(20, bpm));
  return rebuildTimeline({
    ...score,
    bpm: safeBpm,
    measures: score.measures.map((measure) => ({
      ...measure,
      bpm: safeBpm,
      duration: measure.beats * 60 / safeBpm,
      source: measure.source === 'manual' ? 'manual' : `${measure.source}+tempo`,
    })),
  });
}

export function updateMeasure(score: Score, id: string, patch: Partial<Measure>): Score {
  const measures = score.measures.map((measure) => {
    if (measure.id !== id) return measure;
    const updated = { ...measure, ...patch, source: 'manual' };
    if (patch.bpm !== undefined && patch.duration === undefined) {
      updated.duration = updated.beats * 60 / Math.max(20, updated.bpm);
    }
    return updated;
  });
  return rebuildTimeline(score, measures);
}

export function moveMeasure(score: Score, index: number, direction: -1 | 1): Score {
  const target = index + direction;
  if (target < 0 || target >= score.measures.length) return score;
  const measures = [...score.measures];
  [measures[index], measures[target]] = [measures[target], measures[index]];
  return rebuildTimeline(score, measures);
}

export function measureAtTime(measures: Measure[], time: number): number {
  if (!measures.length) return -1;
  let low = 0;
  let high = measures.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const item = measures[middle];
    if (time < item.startTime) high = middle - 1;
    else if (time >= item.startTime + item.duration) low = middle + 1;
    else return middle;
  }
  return Math.min(measures.length - 1, Math.max(0, low));
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
