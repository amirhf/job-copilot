import { NextResponse } from 'next/server';
import {
  db,
  eq,
  desc,
  applicationPackages,
} from '@job-copilot/db';

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const url = new URL(request.url);
  const docType = url.searchParams.get('type') === 'cover-letter' ? 'cover-letter' : 'resume';

  const pkg = await db.query.applicationPackages.findFirst({
    where: eq(applicationPackages.jobPostingId, jobId),
    orderBy: [desc(applicationPackages.version)],
  });

  if (!pkg) {
    return NextResponse.json({ error: 'Application package not found' }, { status: 404 });
  }

  const base64Data =
    docType === 'cover-letter'
      ? pkg.compiledCoverLetterPdfBase64
      : pkg.compiledResumePdfBase64;

  if (!base64Data) {
    return NextResponse.json({ error: 'Compiled PDF not available' }, { status: 404 });
  }

  const pdfBuffer = Buffer.from(base64Data, 'base64');
  const filename =
    docType === 'cover-letter'
      ? `CoverLetter_${jobId}_v${pkg.version}.pdf`
      : `Resume_${jobId}_v${pkg.version}.pdf`;

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
