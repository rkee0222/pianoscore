import { describe, expect, it } from 'vitest';
import {
  clusterIndices,
  detectBarlines,
  detectMeasureRegions,
  detectStaffLines,
  groupSystems,
  rowInkProfile,
  toInkMask,
  type InkImage,
} from './detect';

/** Build a synthetic grand-staff page (two 5-line staves + barlines) as an ink mask. */
function syntheticScore(width = 400, height = 600): InkImage {
  const ink = new Uint8Array(width * height);
  const setRow = (y: number) => { for (let x = 20; x < width - 20; x += 1) ink[y * width + x] = 1; };
  const setCol = (x: number, top: number, bottom: number) => { for (let y = top; y < bottom; y += 1) ink[y * width + x] = 1; };
  const staffTops = [120, 200, 380, 460];
  for (const top of staffTops) for (let line = 0; line < 5; line += 1) setRow(top + line * 12);
  // Barlines spanning each grand-staff system.
  for (const x of [24, 140, 260, 376]) {
    setCol(x, 118, 260);
    setCol(x, 378, 520);
  }
  return { ink, width, height };
}

describe('score geometry detection', () => {
  it('clusters adjacent indices with a max gap', () => {
    expect(clusterIndices([1, 2, 3, 8, 9, 20], 2)).toEqual([[1, 2, 3], [8, 9], [20]]);
    expect(clusterIndices([], 2)).toEqual([]);
  });

  it('builds an ink mask from RGBA using a luminance threshold', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const mask = toInkMask(rgba, 2, 1);
    expect(Array.from(mask.ink)).toEqual([1, 0]);
  });

  it('finds five-line staves and pairs them into grand-staff systems', () => {
    const image = syntheticScore();
    const lines = detectStaffLines(rowInkProfile(image), image.height);
    expect(lines.length).toBeGreaterThanOrEqual(20);
    const systems = groupSystems(lines, image.height);
    expect(systems).toHaveLength(2);
    expect(systems[0][0]).toBeLessThan(systems[1][0]);
  });

  it('detects interior barlines as confident measure divisions', () => {
    const image = syntheticScore();
    const { bars, confident } = detectBarlines(image, 118, 260);
    expect(confident).toBe(true);
    expect(bars.length).toBeGreaterThanOrEqual(4);
  });

  it('produces ordered normalized regions across the page', () => {
    const regions = detectMeasureRegions(syntheticScore(), 0);
    expect(regions.length).toBeGreaterThanOrEqual(6);
    expect(regions.every((r) => r.x >= 0 && r.x <= 1 && r.y >= 0 && r.y <= 1)).toBe(true);
    expect(regions[0].y).toBeLessThan(regions[regions.length - 1].y);
    expect(regions.every((r) => r.page === 0)).toBe(true);
  });

  it('falls back to four sections when no staff is found', () => {
    const blank: InkImage = { ink: new Uint8Array(100 * 100), width: 100, height: 100 };
    const regions = detectMeasureRegions(blank, 2);
    expect(regions).toHaveLength(4);
    expect(regions.every((r) => r.page === 2 && r.confidence < 0.2)).toBe(true);
  });
});
