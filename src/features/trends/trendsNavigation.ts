export function trendsMappingEditPath(trackableId: string, sourceVersion: number): string {
  return `/trackables/edit/${encodeURIComponent(trackableId)}?section=analysis&mapping=${sourceVersion}`
}
