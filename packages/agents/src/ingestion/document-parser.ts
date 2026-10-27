import { createHash } from 'node:crypto';
import { extractText } from 'unpdf';
import mammoth from 'mammoth';

export type SupportedDocumentFormat = 'pdf' | 'docx' | 'markdown' | 'html' | 'text';

export interface ParsedSourceDocument {
  title: string;
  format: SupportedDocumentFormat;
  cleanMarkdown: string;
  contentHash: string;
}

export function normalizeMarkdownWhitespace(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function computeContentHash(cleanMarkdown: string): string {
  return createHash('sha256').update(cleanMarkdown, 'utf8').digest('hex');
}

export function stripHtmlToMarkdown(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const withHeadingsAndLists = withoutScripts
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<(br|p|div|section|article|tr)[^>]*>/gi, '\n')
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '');

  return normalizeMarkdownWhitespace(
    withHeadingsAndLists
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  );
}

export function detectDocumentFormat(filenameOrUrl: string): SupportedDocumentFormat {
  const lower = filenameOrUrl.toLowerCase().trim();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.markdown')) {
    return 'markdown';
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  return 'text';
}

export async function parseCareerDocumentBuffer(params: {
  title: string;
  filename: string;
  buffer: Buffer | Uint8Array;
}): Promise<ParsedSourceDocument> {
  const format = detectDocumentFormat(params.filename);
  const uint8 =
    params.buffer instanceof Uint8Array ? params.buffer : new Uint8Array(params.buffer);

  let rawText = '';

  if (format === 'pdf') {
    const extracted = await extractText(uint8, { mergePages: true });
    rawText = Array.isArray(extracted.text) ? extracted.text.join('\n\n') : extracted.text;
  } else if (format === 'docx') {
    const nodeBuffer = Buffer.isBuffer(params.buffer)
      ? params.buffer
      : Buffer.from(params.buffer);
    const result = await mammoth.extractRawText({ buffer: nodeBuffer });
    rawText = result.value;
  } else if (format === 'html') {
    rawText = stripHtmlToMarkdown(Buffer.from(uint8).toString('utf8'));
  } else {
    rawText = Buffer.from(uint8).toString('utf8');
  }

  const cleanMarkdown = normalizeMarkdownWhitespace(rawText);
  if (!cleanMarkdown) {
    throw new Error(`Extracted document "${params.title}" produced empty content`);
  }

  return {
    title: params.title,
    format,
    cleanMarkdown,
    contentHash: computeContentHash(cleanMarkdown),
  };
}

export function parseCareerDocumentText(params: {
  title: string;
  rawTextOrMarkdown: string;
  isHtml?: boolean;
}): ParsedSourceDocument {
  const cleanMarkdown = params.isHtml
    ? stripHtmlToMarkdown(params.rawTextOrMarkdown)
    : normalizeMarkdownWhitespace(params.rawTextOrMarkdown);

  if (!cleanMarkdown) {
    throw new Error(`Document "${params.title}" is empty after normalization`);
  }

  return {
    title: params.title,
    format: params.isHtml ? 'html' : 'markdown',
    cleanMarkdown,
    contentHash: computeContentHash(cleanMarkdown),
  };
}
