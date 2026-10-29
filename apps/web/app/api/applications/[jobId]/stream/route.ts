import {
  db,
  eq,
  desc,
  applicationPackages,
} from '@job-copilot/db';
import {
  getBufferedStreamEvents,
  type WatchableGenerationEvent,
} from '@job-copilot/agents';

export function formatAgUiSseFrame(event: WatchableGenerationEvent): string {
  return [
    `id: ${event.seq}`,
    `event: ${event.type}`,
    `data: ${JSON.stringify({
      seq: event.seq,
      eventType: event.type,
      payload: event,
      createdAt: new Date().toISOString(),
    })}`,
    '',
    '',
  ].join('\n');
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const url = new URL(request.url);
  const lastEventIdHeader = request.headers.get('last-event-id');
  const afterSeqParam = url.searchParams.get('afterSeq') ?? lastEventIdHeader ?? '0';
  const initialAfterSeq = Math.max(0, Number.parseInt(afterSeqParam, 10) || 0);
  const singleReplayOnly = url.searchParams.get('replayOnly') === '1';

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let cursorSeq = initialAfterSeq;
      const streamChannelId = `job-gen:${jobId}`;

      try {
        const latestPkg = await db.query.applicationPackages.findFirst({
          where: eq(applicationPackages.jobPostingId, jobId),
          orderBy: [desc(applicationPackages.version)],
        });
        const resolvedChannelId = latestPkg?.streamChannelId ?? streamChannelId;

        const maxPolls = singleReplayOnly ? 1 : 25;
        for (let pollIdx = 0; pollIdx < maxPolls; pollIdx++) {
          if (request.signal.aborted) break;

          const events = await getBufferedStreamEvents(
            resolvedChannelId,
            cursorSeq,
            { useDb: true }
          );

          let reachedTerminalEvent = false;
          for (const evt of events) {
            controller.enqueue(encoder.encode(formatAgUiSseFrame(evt)));
            cursorSeq = Math.max(cursorSeq, evt.seq);
            if (
              evt.type === 'RUN_FINISHED' ||
              evt.type === 'WORKFLOW_SUSPENDED_ON_GAP'
            ) {
              reachedTerminalEvent = true;
            }
          }

          if (reachedTerminalEvent || singleReplayOnly) {
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 650));
        }
      } catch (err) {
        const errorFrame = [
          'event: RUN_ERROR',
          `data: ${JSON.stringify({
            error: err instanceof Error ? err.message : 'Stream replay failed',
          })}`,
          '',
          '',
        ].join('\n');
        controller.enqueue(encoder.encode(errorFrame));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
