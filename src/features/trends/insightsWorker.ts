/// <reference lib="webworker" />
import { discoverInsightCatalogs } from '../../analytics/insights/insightFeed.ts'
import { groupRelationshipFamilies } from '../../analytics/insights/insightFamilies.ts'
import type { TrendsData } from '../../analytics/AnalyticsProvider.ts'

self.onmessage = (event: MessageEvent<TrendsData>) => {
  try { const catalogs = discoverInsightCatalogs(event.data); self.postMessage({ catalogs, families: groupRelationshipFamilies(catalogs, event.data) }) }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Discovery failed' }) }
}
