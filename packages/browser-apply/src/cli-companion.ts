import http from 'node:http';
import type { AssistedApplyPayload } from './types';
import {
  runStagehandAssistedApply,
  type RunAssistedApplyOptions,
} from './runner';

export const DEFAULT_COMPANION_PORT = 43110;

export async function handleCompanionRequest(
  input: {
    method: string;
    url: string;
    bodyText?: string;
  },
  options: RunAssistedApplyOptions = {}
): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (input.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: {} };
  }

  if (input.method === 'GET' && input.url === '/health') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: {
        ok: true,
        service: 'job-copilot-stagehand-companion',
        port: DEFAULT_COMPANION_PORT,
      },
    };
  }

  if (input.method === 'POST' && input.url === '/apply') {
    try {
      const payload = JSON.parse(input.bodyText ?? '{}') as AssistedApplyPayload;
      const result = await runStagehandAssistedApply(
        {
          ...payload,
          executionMode: 'local-bridge',
        },
        options
      );

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: result as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: {
          ok: false,
          error: err instanceof Error ? err.message : 'Companion apply error',
        },
      };
    }
  }

  return {
    statusCode: 404,
    headers: corsHeaders,
    body: { error: 'Not Found' },
  };
}

export function createCompanionHttpServer(
  options: RunAssistedApplyOptions = {}
): http.Server {
  return http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    if (req.method === 'POST') {
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');

    const response = await handleCompanionRequest(
      {
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        bodyText: rawBody,
      },
      options
    );

    for (const [key, val] of Object.entries(response.headers)) {
      res.setHeader(key, val);
    }
    res.writeHead(response.statusCode);
    res.end(response.statusCode === 204 ? undefined : JSON.stringify(response.body));
  });
}

// Start standalone CLI companion when executed directly
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('cli-companion.ts')
) {
  const port = Number(process.env.STAGEHAND_COMPANION_PORT ?? DEFAULT_COMPANION_PORT);
  const server = createCompanionHttpServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(
      `[Job Copilot Companion] Listening on http://127.0.0.1:${port} (Headed Stagehand v4 Bridge Ready)`
    );
  });
}
