import fs from 'node:fs/promises';
import path from 'node:path';

export type StorageProviderType = 'postgres' | 'r2' | 'local-fs';

export interface StoredPdfArtifacts {
  storageProvider: StorageProviderType;
  compiledResumePdfBase64: string;
  compiledCoverLetterPdfBase64: string;
  compiledResumePdfPath: string | null;
  compiledCoverLetterPdfPath: string | null;
}

/**
 * Stateless-first PDF storage adapter:
 * - Always encodes the 25-45KB vector PDF buffers to base64 so `application_packages` is 100% self-contained
 *   on serverless Postgres (Neon/Supabase) + Vercel without requiring shared volumes.
 * - Optionally writes local files when `STORAGE_PROVIDER=local-fs`.
 */
export async function persistCompiledPdfArtifacts(params: {
  jobPostingId: string;
  version: number;
  resumePdfBuffer: Buffer;
  coverLetterPdfBuffer: Buffer;
  provider?: StorageProviderType;
}): Promise<StoredPdfArtifacts> {
  const provider =
    params.provider ??
    ((process.env.STORAGE_PROVIDER ?? 'postgres') as StorageProviderType);

  const compiledResumePdfBase64 = params.resumePdfBuffer.toString('base64');
  const compiledCoverLetterPdfBase64 = params.coverLetterPdfBuffer.toString('base64');

  if (provider === 'local-fs') {
    const baseDir = path.resolve(
      process.cwd(),
      process.env.APPLICATION_STORAGE_DIR ?? './storage/applications',
      params.jobPostingId,
      `v${params.version}`
    );
    await fs.mkdir(baseDir, { recursive: true });
    const resumePath = path.join(baseDir, 'Resume.pdf');
    const coverLetterPath = path.join(baseDir, 'CoverLetter.pdf');
    await Promise.all([
      fs.writeFile(resumePath, params.resumePdfBuffer),
      fs.writeFile(coverLetterPath, params.coverLetterPdfBuffer),
    ]);

    return {
      storageProvider: 'local-fs',
      compiledResumePdfBase64,
      compiledCoverLetterPdfBase64,
      compiledResumePdfPath: resumePath,
      compiledCoverLetterPdfPath: coverLetterPath,
    };
  }

  return {
    storageProvider: provider,
    compiledResumePdfBase64,
    compiledCoverLetterPdfBase64,
    compiledResumePdfPath: null,
    compiledCoverLetterPdfPath: null,
  };
}
