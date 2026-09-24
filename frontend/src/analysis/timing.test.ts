import { describe, expect, it } from 'vitest';
import { buildMeasures, parseTimeSignature, quarterBeatsFor, totalDurationOf } from './timing';
import type { Region } from './detect';

const regions: Region[] = [
  { page: 0, x: 0.05, y: 0.1, width: 0.4, height: 0.2, confidence: 0.68 },
  { page: 0, x: 0.45, y: 0.1, width: 0.4, height: 0.2, confidence: 0.68 },
  { page: 1, x: 0.05, y: 0.1, width: 0.4, height: 0.2, confidence: 0.38 },
];

describe('timing model', () => {
  it('parses time signatures and computes quarter beats', () => {
    expect(parseTimeSignature('3/4')).toEqual({ beats: 3, beatType: 4 });
    expect(quarterBeatsFor(parseTimeSignature('6/8'))).toBe(3);
    expect(parseTimeSignature('bogus')).toEqual({ beats: 4, beatType: 4 });
  });

  it('builds ordered, time-contiguous measures at the given tempo', () => {
    const measures = buildMeasures(regions, 120, '4/4', 'client-detect');
    expect(measures).toHaveLength(3);
    expect(measures[0].duration).toBe(2); // 4 quarter beats @ 120 bpm
    expect(measures[1].startTime).toBe(2);
    expect(measures[2].startTime).toBe(4);
    expect(measures[2].page).toBe(1);
    expect(totalDurationOf(measures)).toBe(6);
  });

  it('reflects meter in duration', () => {
    const measures = buildMeasures(regions.slice(0, 1), 90, '3/4', 'client-detect');
    expect(measures[0].beats).toBe(3);
    expect(measures[0].duration).toBe(2); // 3 quarter beats @ 90 bpm
  });
});
