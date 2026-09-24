export function advancePlayback(base: number, elapsedMilliseconds: number, speed: number, total: number): number {
  return Math.min(total, Math.max(0, base + elapsedMilliseconds / 1000 * speed));
}

export function interpolatedScrollTarget(
  currentPosition: number,
  nextPosition: number,
  measureProgress: number,
  viewportHeight: number,
  offset: number,
): number {
  const progress = Math.min(1, Math.max(0, measureProgress));
  const scorePosition = currentPosition + (nextPosition - currentPosition) * progress;
  return Math.max(0, scorePosition - viewportHeight * 0.38 + offset);
}
