// Fully client-side, offline analysis pipeline. Replaces the former Python
// /api/analyze endpoint. PDF is rendered with pdf.js (WASM-free canvas render),
// images are rasterized on a canvas, and measure geometry + timing are computed
// in the browser. Nothing here needs a server or network.

import { detectMeasureRegions, toInkMask, type Region } from './detect';
import { buildMeasures, totalDurationOf } from './timing';
import type { Score, ScorePage } from '../types';

const MAX_FILES = 30;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;
const MAX_PDF_PAGES = 30;
const RENDER_MAX_WIDTH = 1600; // Cap raster size so tablets stay responsive.

export interface AnalyzeOptions {
  bpm: number;
  timeSignature?: string;
  onProgress?: (message: string) => void;
}

interface RasterPage {
  name: string;
  canvas: HTMLCanvasElement;
}

function assertBrowserEnvironment(): void {
  if (typeof document === 'undefined') {
    throw new Error('브라우저 환경에서만 분석할 수 있습니다.');
  }
}

async function loadPdfLibrary() {
  const pdfjs = await import('pdfjs-dist');
  // Vite resolves the worker as a URL; this keeps everything offline once cached.
  const worker = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
  pdfjs.GlobalWorkerOptions.workerPort = worker;
  return pdfjs;
}

function scaledCanvas(sourceWidth: number, sourceHeight: number): { canvas: HTMLCanvasElement; scale: number } {
  const scale = sourceWidth > RENDER_MAX_WIDTH ? RENDER_MAX_WIDTH / sourceWidth : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  return { canvas, scale };
}

async function rasterizeImage(file: File): Promise<RasterPage> {
  const bitmap = await createImageBitmap(file);
  const { canvas } = scaledCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D 컨텍스트를 사용할 수 없습니다.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return { name: file.name, canvas };
}

async function rasterizePdf(file: File, onProgress?: (message: string) => void): Promise<RasterPage[]> {
  const pdfjs = await loadPdfLibrary();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  if (pdf.numPages > MAX_PDF_PAGES) {
    await pdf.destroy();
    throw new Error(`PDF는 최대 ${MAX_PDF_PAGES}페이지까지 분석할 수 있습니다.`);
  }
  const pages: RasterPage[] = [];
  const stem = file.name.replace(/\.pdf$/i, '');
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress?.(`PDF ${pageNumber}/${pdf.numPages}페이지 렌더링 중…`);
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, RENDER_MAX_WIDTH / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D 컨텍스트를 사용할 수 없습니다.');
    await page.render({ canvasContext: context, viewport }).promise;
    page.cleanup();
    pages.push({ name: `${stem}-${pageNumber}.jpg`, canvas });
  }
  await pdf.destroy();
  return pages;
}

function pageToDataUrl(canvas: HTMLCanvasElement): { dataUrl: string; width: number; height: number } {
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: canvas.width, height: canvas.height };
}

function regionsForCanvas(canvas: HTMLCanvasElement, pageIndex: number): Region[] {
  const context = canvas.getContext('2d');
  if (!context) return [];
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const image = toInkMask(data, canvas.width, canvas.height);
  return detectMeasureRegions(image, pageIndex);
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function isSupportedImage(file: File): boolean {
  return file.type === 'image/jpeg' || file.type === 'image/png' || /\.(jpe?g|png)$/i.test(file.name);
}

/** Analyze one or more uploaded score files entirely in the browser. */
export async function analyzeScore(files: File[], options: AnalyzeOptions): Promise<Score> {
  assertBrowserEnvironment();
  const bpm = Math.min(300, Math.max(20, options.bpm));
  const timeSignature = options.timeSignature ?? '4/4';
  if (!files.length || files.length > MAX_FILES) {
    throw new Error(`1개 이상, 최대 ${MAX_FILES}개 파일을 선택해 주세요.`);
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error('전체 업로드 크기는 80MB 이하여야 합니다.');
  }

  const warnings: string[] = [];
  const rasterPages: RasterPage[] = [];
  for (const file of files) {
    if (isPdf(file)) {
      rasterPages.push(...await rasterizePdf(file, options.onProgress));
    } else if (isSupportedImage(file)) {
      options.onProgress?.(`${file.name} 이미지 처리 중…`);
      rasterPages.push(await rasterizeImage(file));
    } else {
      throw new Error('JPG, PNG 또는 PDF 파일만 업로드할 수 있습니다.');
    }
  }
  if (!rasterPages.length) throw new Error('변환 가능한 악보 페이지가 없습니다.');

  options.onProgress?.('마디와 보표 위치 분석 중…');
  const regions: Region[] = [];
  rasterPages.forEach((page, index) => regions.push(...regionsForCanvas(page.canvas, index)));

  const confident = regions.filter((region) => region.confidence >= 0.5).length;
  if (confident < regions.length) {
    warnings.push('마디선을 완전히 인식하지 못한 구간이 있어 기본 박자표로 계산했습니다. 보정 화면에서 마디 시간과 위치를 수정할 수 있습니다.');
  }
  warnings.push('완전 오프라인 브라우저 분석 모드입니다. 음표 길이·인쇄된 템포는 자동 인식하지 않으므로, 필요하면 BPM과 박자표를 조정하세요.');

  const measures = buildMeasures(regions, bpm, timeSignature, 'client-detect');
  const pages: ScorePage[] = rasterPages.map((page, index) => {
    const { dataUrl, width, height } = pageToDataUrl(page.canvas);
    return { id: `page-${index + 1}`, name: page.name, mime: 'image/jpeg', dataUrl, width, height };
  });

  const title = (files[0].name || '새 악보').replace(/\.[^.]+$/, '');
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: new Date().toISOString(),
    bpm,
    timeSignature,
    analysisMode: 'client-detect',
    pages,
    measures,
    totalDuration: totalDurationOf(measures),
    warnings: Array.from(new Set(warnings)),
  };
}
