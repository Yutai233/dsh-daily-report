/** Optional local-only bili statistics; never added to provider billing totals. */
const nonnegative = (v) => Number.isFinite(v) && v >= 0 ? v : null
const count = (v) => Number.isSafeInteger(v) && v >= 0 ? v : null

/** Unknown values stay null. A window reduction is NOT cumulative net savings. */
export function normalizeBili(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const compressionCount = count(value.compressionCount)
  const reclaimedTokens = nonnegative(value.reclaimedTokens)
  const inputTokens = nonnegative(value.inputTokens)
  const cachedTokens = nonnegative(value.cachedTokens)
  const netSavedTokens = Number.isFinite(value.netSavedTokens) ? value.netSavedTokens : null
  let cacheHitRate = Number.isFinite(value.cacheHitRate) && value.cacheHitRate >= 0 && value.cacheHitRate <= 1 ? value.cacheHitRate : null
  if (inputTokens !== null && inputTokens > 0 && cachedTokens !== null) cacheHitRate = cachedTokens <= inputTokens ? cachedTokens / inputTokens : null
  // A confirmed active adapter may have no date-matched history yet: keep its
  // explicit coverage reason visible instead of making it look uninstalled.
  const pendingSource = value.source === 'billion-context' && value.status === 'unknown' && typeof value.coverage === 'string' && value.coverage.trim()
  if ([compressionCount, reclaimedTokens, cacheHitRate, netSavedTokens].every((v) => v === null) && !pendingSource) return null
  const anomalies = Array.isArray(value.anomalies) ? value.anomalies.filter((x) => typeof x === 'string' && x.trim()).slice(0, 8).map((x) => x.slice(0, 240)) : []
  if (netSavedTokens !== null && netSavedTokens < 0 && !anomalies.length) anomalies.push('本期压缩尚未回本')
  const status = value.status === 'warning' || (netSavedTokens !== null && netSavedTokens < 0) ? 'warning' : value.status === 'unknown' ? 'unknown' : anomalies.length ? 'warning' : value.status === 'ok' ? 'ok' : 'unknown'
  return {
    source: 'billion-context',
    date: typeof value.date === 'string' ? value.date : null,
    compressionCount, reclaimedTokens, inputTokens, cachedTokens, cacheHitRate, netSavedTokens, status, anomalies,
    ...(typeof value.coverage === 'string' ? { coverage: value.coverage.slice(0, 240) } : {}),
    ...(typeof value.estimated === 'boolean' ? { estimated: value.estimated } : {}),
  }
}
