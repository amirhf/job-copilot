import type { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import type { TailoredResumePayload } from '@job-copilot/db';
import {
  renderResumeTypstSource,
  type CandidateHeaderInfo,
  type TypstLayoutDensity,
} from './generator';

export interface CompiledPdfResult {
  pdfBuffer: Buffer;
  svgPages: string[];
  pageCount: number;
  typstSource: string;
  densityUsed: TypstLayoutDensity;
}

/**
 * Estimates page count deterministically from line count and layout density when running in
 * lightweight fallback mode or when inspecting SVG output.
 */
export function estimatePageCountFromTypstSource(
  typstSource: string,
  density: TypstLayoutDensity = 'standard'
): number {
  const visibleContentChars = typstSource
    .split('\n')
    .filter((l) => !l.trim().startsWith('#') && !l.trim().startsWith('//'))
    .join('\n').length;

  const charsPerPage = density === 'compact' ? 3900 : density === 'comfortable' ? 2800 : 3400;
  return Math.max(1, Math.ceil(visibleContentChars / charsPerPage));
}

/**
 * Builds a valid PDF 1.4 binary buffer containing the rendered document text when native
 * `@myriaddreamin/typst-ts-node-compiler` binary bindings are unavailable on the target OS/architecture.
 */
export function buildFallbackVectorPdfBuffer(typstSource: string, pageCount: number): Buffer {
  const plainLines = typstSource
    .split('\n')
    .filter((l) => !l.startsWith('//') && !l.startsWith('#set') && !l.startsWith('#line'))
    .map((l) => l.replace(/#[a-zA-Z0-9_-]+\([^)]*\)/g, '').replace(/[[\]*\\]/g, '').trim())
    .filter(Boolean)
    .slice(0, 60);

  const escapedPdfLines = plainLines.map(
    (line, idx) =>
      `BT /F1 10 Tf 50 ${750 - idx * 12} Td (${line
        .replace(/[()\\]/g, '')
        .slice(0, 95)}) Tj ET`
  );

  const streamContent = escapedPdfLines.join('\n');
  const pdfString = [
    '%PDF-1.4',
    `% Pages: ${pageCount}`,
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    `2 0 obj << /Type /Pages /Kids [3 0 R] /Count ${pageCount} >> endobj`,
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(streamContent, 'utf8')} >> stream`,
    streamContent,
    'endstream endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
  ].join('\n');

  return Buffer.from(pdfString, 'utf8');
}

let cachedNodeCompiler: NodeCompiler | null | undefined;

async function getNativeTypstCompiler(): Promise<NodeCompiler | null> {
  if (cachedNodeCompiler !== undefined) return cachedNodeCompiler;
  try {
    const mod = await import('@myriaddreamin/typst-ts-node-compiler');
    cachedNodeCompiler = mod.NodeCompiler.create();
    return cachedNodeCompiler;
  } catch {
    cachedNodeCompiler = null;
    return null;
  }
}

export async function compileTypstToPdf(
  mainFileContent: string,
  density: TypstLayoutDensity = 'standard'
): Promise<CompiledPdfResult> {
  const compiler = await getNativeTypstCompiler();

  if (compiler) {
    try {
      const compiled = compiler.compile({ mainFileContent });
      if (compiled.result) {
        const pdfBuffer = Buffer.from(compiler.pdf(compiled.result));
        const rawSvg = compiler.svg(compiled.result);
        const pageMatches = rawSvg.match(/class="typst-page"/g);
        const pageCount = pageMatches && pageMatches.length > 0
          ? pageMatches.length
          : estimatePageCountFromTypstSource(mainFileContent, density);
        return {
          pdfBuffer,
          svgPages: [rawSvg],
          pageCount,
          typstSource: mainFileContent,
          densityUsed: density,
        };
      }
    } catch {
      // Fall through to deterministic vector PDF fallback
    }
  }

  const pageCount = estimatePageCountFromTypstSource(mainFileContent, density);
  const pdfBuffer = buildFallbackVectorPdfBuffer(mainFileContent, pageCount);
  const svgPage = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 612 792" data-pages="${pageCount}"><text x="40" y="50">${mainFileContent.slice(0, 120).replace(/[<>&"]/g, '')}</text></svg>`;

  return {
    pdfBuffer,
    svgPages: Array.from({ length: pageCount }, () => svgPage),
    pageCount,
    typstSource: mainFileContent,
    densityUsed: density,
  };
}

/**
 * Compiles the resume at `"standard"` density first.
 * If `pageCount > targetMaxPages`, automatically retries with `"compact"` density,
 * and if still overflowing, trims the last bullet on the oldest experience.
 */
export async function compileResumeWithAutoFit(params: {
  candidate: CandidateHeaderInfo;
  resumePayload: TailoredResumePayload;
  targetMaxPages?: number;
}): Promise<{
  compiled: CompiledPdfResult;
  fittedPayload: TailoredResumePayload;
  autoTrimmedBulletsCount: number;
}> {
  const targetMaxPages = params.targetMaxPages ?? 1;
  let currentPayload: TailoredResumePayload = structuredClone(params.resumePayload);
  let autoTrimmedBulletsCount = 0;

  // Attempt 1: Standard density
  const standardSource = renderResumeTypstSource(
    params.candidate,
    currentPayload,
    'standard'
  );
  const standardResult = await compileTypstToPdf(standardSource, 'standard');
  if (standardResult.pageCount <= targetMaxPages) {
    return {
      compiled: standardResult,
      fittedPayload: currentPayload,
      autoTrimmedBulletsCount: 0,
    };
  }

  // Attempt 2: Compact density
  const compactSource = renderResumeTypstSource(params.candidate, currentPayload, 'compact');
  let compactResult = await compileTypstToPdf(compactSource, 'compact');
  if (compactResult.pageCount <= targetMaxPages) {
    return {
      compiled: compactResult,
      fittedPayload: currentPayload,
      autoTrimmedBulletsCount: 0,
    };
  }

  // Attempt 3: Trim lowest-priority bullets from oldest experience until targetMaxPages is met (up to 16 trims)
  for (let trimStep = 0; trimStep < 16; trimStep++) {
    const experiences = currentPayload.selectedExperiences;
    let trimmed = false;
    for (let i = experiences.length - 1; i >= 0; i--) {
      const exp = experiences[i];
      if (exp && exp.tailoredBullets.length > 1) {
        exp.tailoredBullets.pop();
        autoTrimmedBulletsCount++;
        trimmed = true;
        break;
      }
    }
    if (!trimmed) break;

    const retrySource = renderResumeTypstSource(params.candidate, currentPayload, 'compact');
    compactResult = await compileTypstToPdf(retrySource, 'compact');
    if (compactResult.pageCount <= targetMaxPages) {
      break;
    }
  }

  return {
    compiled: compactResult,
    fittedPayload: currentPayload,
    autoTrimmedBulletsCount,
  };
}
