import type {
  ConnectorId,
  ConnectorSearchContext,
  JobIngestionConnector,
  RawDiscoveredJob,
} from './types';
import { SerpApiGoogleJobsConnector } from './serpapi-google-jobs';
import { RemotiveConnector } from './remotive';
import { AtsDirectSearchConnector } from './ats-search';
import { GmailAlertsConnector } from './gmail-alerts';

export function getDefaultConnectors(enabledIds?: ConnectorId[]): JobIngestionConnector[] {
  const all: JobIngestionConnector[] = [
    new SerpApiGoogleJobsConnector(),
    new RemotiveConnector(),
    new AtsDirectSearchConnector(),
    new GmailAlertsConnector(),
  ];

  if (!enabledIds || enabledIds.length === 0) {
    return all;
  }

  return all.filter((c) => enabledIds.includes(c.id));
}

export async function runAllConnectors(
  ctx: ConnectorSearchContext,
  enabledIds?: ConnectorId[],
  customConnectors?: JobIngestionConnector[]
): Promise<RawDiscoveredJob[]> {
  const connectors = customConnectors ?? getDefaultConnectors(enabledIds);
  const settled = await Promise.allSettled(connectors.map((c) => c.fetchJobs(ctx)));

  const results: RawDiscoveredJob[] = [];
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      results.push(...outcome.value);
    }
  }
  return results;
}
