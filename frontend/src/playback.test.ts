import { describe, expect, it } from 'vitest';
import { advancePlayback, interpolatedScrollTarget } from './playback';

describe('playback clock and scrolling', () => {
  it('advances by speed and preserves time while paused', () => {
    expect(advancePlayback(4, 2000, 1.5, 20)).toBe(7);
    const pausedAt = advancePlayback(4, 0, 1.5, 20);
    expect(pausedAt).toBe(4);
    expect(advancePlayback(pausedAt, 1000, 1, 20)).toBe(5);
  });
  it('interpolates smoothly toward the next score region', () => {
    expect(interpolatedScrollTarget(500, 900, 0.5, 600, 20)).toBe(492);
    expect(interpolatedScrollTarget(10, 20, 0, 600, -30)).toBe(0);
  });
});
