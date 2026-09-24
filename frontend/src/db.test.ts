import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteScore, listScores, saveScore } from './db';
import type { Score } from './types';

const score: Score = {
  id: 'offline-score', title: 'Offline Etude', createdAt: '2026-09-23T00:00:00Z', bpm: 100,
  timeSignature: '4/4', analysisMode: 'manual', pages: [{ id: 'p1', name: 'page', mime: 'image/png', dataUrl: 'data:image/png;base64,AA==', width: 10, height: 10 }],
  measures: [], totalDuration: 0, warnings: [],
};

beforeEach(async () => {
  for (const item of await listScores()) await deleteScore(item.id);
});

describe('offline score persistence', () => {
  it('reopens an analyzed score including its image and corrections', async () => {
    await saveScore(score);
    const reopened = await listScores();
    expect(reopened).toHaveLength(1);
    expect(reopened[0].title).toBe('Offline Etude');
    expect(reopened[0].pages[0].dataUrl).toBe(score.pages[0].dataUrl);
    await deleteScore(score.id);
    expect(await listScores()).toEqual([]);
  });
});
