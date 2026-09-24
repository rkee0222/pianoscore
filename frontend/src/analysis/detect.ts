// Pure, DOM-free score-geometry detection ported from the former Python
// projection-profile backend. Timing accuracy is the priority: the goal is to
// find correct measure boundaries (systems + barlines), not to read notes.

export interface Region {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface InkImage {
  /** Row-major boolean ink mask (true = dark pixel). */
  ink: Uint8Array;
  width: number;
  height: number;
}

/** Convert RGBA pixels to a boolean ink mask using a luminance threshold. */
export function toInkMask(rgba: Uint8ClampedArray, width: number, height: number, threshold = 165): InkImage {
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const luminance = (r * 299 + g * 587 + b * 114) / 1000;
    ink[i] = luminance < threshold ? 1 : 0;
  }
  return { ink, width, height };
}

/** Mean ink fraction of each row (horizontal projection profile). */
export function rowInkProfile({ ink, width, height }: InkImage): Float64Array {
  const profile = new Float64Array(height);
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    const base = y * width;
    for (let x = 0; x < width; x += 1) sum += ink[base + x];
    profile[y] = sum / width;
  }
  return profile;
}

/** Group adjacent indices whose gap is within maxGap. */
export function clusterIndices(indices: number[], maxGap = 2): number[][] {
  if (indices.length === 0) return [];
  const groups: number[][] = [[indices[0]]];
  for (let i = 1; i < indices.length; i += 1) {
    const group = groups[groups.length - 1];
    if (indices[i] - group[group.length - 1] <= maxGap) group.push(indices[i]);
    else groups.push([indices[i]]);
  }
  return groups;
}

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

/** Detect staff-line centers from the row projection. */
export function detectStaffLines(profile: Float64Array, height: number, rowThreshold = 0.28): number[] {
  const candidates: number[] = [];
  for (let y = 0; y < profile.length; y += 1) if (profile[y] > rowThreshold) candidates.push(y);
  const maxThickness = Math.max(8, Math.floor(height / 100));
  return clusterIndices(candidates, 2)
    .filter((group) => group.length <= maxThickness)
    .map((group) => Math.round(mean(group)));
}

/** Group 5 evenly spaced lines into staves, then pair staves into systems. */
export function groupSystems(lineCenters: number[], height: number): Array<[number, number]> {
  const staves: number[][] = [];
  let cursor = 0;
  while (cursor + 4 < lineCenters.length) {
    const candidate = lineCenters.slice(cursor, cursor + 5);
    const gaps = candidate.slice(1).map((value, index) => value - candidate[index]);
    const minGap = Math.min(...gaps);
    const maxGap = Math.max(...gaps);
    if (gaps.length === 4 && maxGap <= Math.max(20, minGap * 2.2)) {
      staves.push(candidate);
      cursor += 5;
    } else {
      cursor += 1;
    }
  }

  const pad = 18;
  const systems: Array<[number, number]> = [];
  if (staves.length >= 2) {
    for (let i = 0; i + 1 < staves.length; i += 2) {
      const top = Math.max(0, staves[i][0] - pad);
      const bottom = Math.min(height, staves[i + 1][staves[i + 1].length - 1] + pad);
      systems.push([top, bottom]);
    }
  } else if (staves.length === 1) {
    const staff = staves[0];
    systems.push([Math.max(0, staff[0] - pad), Math.min(height, staff[staff.length - 1] + pad)]);
  }
  return systems;
}

/** Column ink fraction within a horizontal band (vertical projection profile). */
function columnProfile({ ink, width }: InkImage, top: number, bottom: number): Float64Array {
  const profile = new Float64Array(width);
  const rows = Math.max(1, bottom - top);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = top; y < bottom; y += 1) sum += ink[y * width + x];
    profile[x] = sum / rows;
  }
  return profile;
}

/** Detect barline x-positions within a system band. Returns whether detection was confident. */
export function detectBarlines(image: InkImage, top: number, bottom: number): { bars: number[]; confident: boolean } {
  const { width } = image;
  const profile = columnProfile(image, top, bottom);
  const candidates: number[] = [];
  for (let x = 0; x < width; x += 1) if (profile[x] > 0.42) candidates.push(x);
  let bars = clusterIndices(candidates, 3)
    .map((group) => Math.round(mean(group)))
    .filter((x) => x > width * 0.025 && x < width * 0.975);

  const detectedCount = bars.length;
  if (bars.length === 0 || bars[0] > width * 0.12) bars.unshift(Math.round(width * 0.06));
  if (bars[bars.length - 1] < width * 0.88) bars.push(Math.round(width * 0.94));

  // Discard bars closer than 7.5% of the width (removes note-stem false positives).
  const clean = [bars[0]];
  for (let i = 1; i < bars.length; i += 1) {
    if (bars[i] - clean[clean.length - 1] >= width * 0.075) clean.push(bars[i]);
  }
  if (clean.length < 3) {
    return { bars: [0.06, 0.28, 0.5, 0.72, 0.94].map((f) => Math.round(width * f)), confident: false };
  }
  return { bars: clean, confident: detectedCount >= 3 };
}

/** Produce normalized measure regions for one page image. */
export function detectMeasureRegions(image: InkImage, pageIndex: number): Region[] {
  const { width, height } = image;
  const lineCenters = detectStaffLines(rowInkProfile(image), height);
  const systems = groupSystems(lineCenters, height);

  const regions: Region[] = [];
  for (const [top, bottom] of systems) {
    const { bars, confident } = detectBarlines(image, top, bottom);
    for (let i = 0; i + 1 < bars.length; i += 1) {
      const left = bars[i];
      const right = bars[i + 1];
      regions.push({
        page: pageIndex,
        x: left / width,
        y: top / height,
        width: (right - left) / width,
        height: (bottom - top) / height,
        confidence: confident ? 0.68 : 0.38,
      });
    }
  }

  if (regions.length === 0) {
    // Guaranteed non-fatal fallback: four evenly stacked performance sections.
    for (let section = 0; section < 4; section += 1) {
      regions.push({ page: pageIndex, x: 0.05, y: section / 4, width: 0.9, height: 0.25, confidence: 0.18 });
    }
  }
  return regions;
}
