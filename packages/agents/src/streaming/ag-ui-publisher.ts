import {
  db,
  eq,
  and,
  asc,
  sql,
  generationStreamEvents,
  type FlaggedSkillGap,
  type PdfCompilationAudit,
  type Database,
} from '@job-copilot/db';

export type GenerationStepName =
  | 'QUEUED'
  | 'ANALYZING_REQUIREMENTS'
  | 'SELECTING_CAREER_BLOCKS'
  | 'CHECKING_CRITICAL_GAPS'
  | 'PAUSED_ON_GAP'
  | 'SYNTHESIZING_RESUME'
  | 'SYNTHESIZING_COVER_LETTER_AND_QA'
  | 'COMPILING_AND_AUDITING_PDF'
  | 'COMPLETED'
  | 'FAILED';

export type WatchableGenerationEventPayload =
  | {
      type: 'STEP_STARTED';
      step: GenerationStepName;
      message: string;
      timestamp: string;
    }
  | {
      type: 'REASONING_DELTA';
      step: GenerationStepName;
      delta: string;
    }
  | {
      type: 'STATE_SNAPSHOT';
      step: GenerationStepName;
      payload: Record<string, unknown>;
    }
  | {
      type: 'TYPST_SOURCE_UPDATED';
      documentType: 'RESUME' | 'COVER_LETTER';
      typstSource: string;
    }
  | {
      type: 'QA_DRAFTED';
      questionId: string;
      questionLabel: string;
      draftedAnswer: string;
    }
  | {
      type: 'WORKFLOW_SUSPENDED_ON_GAP';
      jobPostingId: string;
      unresolvedCriticalGaps: FlaggedSkillGap[];
    }
  | {
      type: 'AUDIT_COMPLETED';
      audit: PdfCompilationAudit;
    }
  | {
      type: 'RUN_FINISHED';
      packageId: string;
      status: 'READY_TO_APPLY' | 'PAUSED_NEEDS_INPUT' | 'FAILED';
    };

export type WatchableGenerationEvent = WatchableGenerationEventPayload & {
  seq: number;
  streamChannelId: string;
};

type StreamSubscriber = (event: WatchableGenerationEvent) => void;

const channelSequenceCounters = new Map<string, number>();
const inMemoryEventBuffer = new Map<string, WatchableGenerationEvent[]>();
const channelSubscribers = new Map<string, Set<StreamSubscriber>>();

export function subscribeToGenerationChannel(
  streamChannelId: string,
  listener: StreamSubscriber
): () => void {
  let set = channelSubscribers.get(streamChannelId);
  if (!set) {
    set = new Set();
    channelSubscribers.set(streamChannelId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

export async function publishAgUiEvent(
  params: {
    packageId?: string;
    streamChannelId: string;
    event: WatchableGenerationEventPayload;
  },
  options?: {
    persistToDb?: boolean;
    database?: Database;
  }
): Promise<WatchableGenerationEvent> {
  const nextSeq = (channelSequenceCounters.get(params.streamChannelId) ?? 0) + 1;
  channelSequenceCounters.set(params.streamChannelId, nextSeq);

  const fullEvent: WatchableGenerationEvent = {
    ...params.event,
    seq: nextSeq,
    streamChannelId: params.streamChannelId,
  };

  // Buffer in memory for instant unit-test / local dev replay
  const existingBuffer = inMemoryEventBuffer.get(params.streamChannelId) ?? [];
  existingBuffer.push(fullEvent);
  inMemoryEventBuffer.set(params.streamChannelId, existingBuffer);

  // Persist to PostgreSQL `generation_stream_events` via standard pooled SQL insert when packageId is provided
  if (params.packageId && (options?.persistToDb ?? false)) {
    const database = options?.database ?? db;
    await database.insert(generationStreamEvents).values({
      packageId: params.packageId,
      streamChannelId: params.streamChannelId,
      seq: nextSeq,
      eventType: params.event.type,
      payload: fullEvent as unknown as Record<string, unknown>,
    });
  }

  // Notify live local subscribers
  const subscribers = channelSubscribers.get(params.streamChannelId);
  if (subscribers) {
    for (const sub of subscribers) {
      sub(fullEvent);
    }
  }

  return fullEvent;
}

/**
 * Replays buffered events with `seq > afterSeq` using standard pooled SQL queries (or in-memory buffer),
 * allowing browser tabs to detach and re-attach without stateful LISTEN/NOTIFY connections.
 */
export async function getBufferedStreamEvents(
  streamChannelId: string,
  afterSeq = 0,
  options?: {
    useDb?: boolean;
    database?: Database;
  }
): Promise<WatchableGenerationEvent[]> {
  if (options?.useDb) {
    const database = options.database ?? db;
    const rows = await database
      .select()
      .from(generationStreamEvents)
      .where(
        and(
          eq(generationStreamEvents.streamChannelId, streamChannelId),
          sql`${generationStreamEvents.seq} > ${afterSeq}`
        )
      )
      .orderBy(asc(generationStreamEvents.seq));

    return rows.map((r) => r.payload as unknown as WatchableGenerationEvent);
  }

  const memEvents = inMemoryEventBuffer.get(streamChannelId) ?? [];
  return memEvents.filter((e) => e.seq > afterSeq);
}

export function clearInMemoryStreamChannel(streamChannelId: string): void {
  channelSequenceCounters.delete(streamChannelId);
  inMemoryEventBuffer.delete(streamChannelId);
  channelSubscribers.delete(streamChannelId);
}
