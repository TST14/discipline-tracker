/**
 * ScoreBadge — colour-coded earned/max display used across the app.
 *
 *   <ScoreBadge earned={45.5} max={80} />
 */
export default function ScoreBadge({ earned, max }) {
  if (earned == null || max == null) return <span className="text-gray-500">—</span>
  // max=0 means uncapped (e.g. time_multiplier with no cap) — show raw earned pts
  if (max === 0) {
    if (!earned || earned <= 0) return <span className="text-gray-500">—</span>
    return (
      <span className="font-semibold tabular-nums text-emerald-400">
        {earned.toFixed(1)}<span className="text-gray-500 font-normal text-xs"> pts</span>
      </span>
    )
  }
  const pct = max > 0 ? Math.round((earned / max) * 100) : 0
  const color =
    pct === 100 ? 'text-emerald-400' :
    pct >= 75   ? 'text-yellow-400'  :
    pct >= 50   ? 'text-orange-400'  :
    pct > 0     ? 'text-red-400'     :
                  'text-gray-500'
  return (
    <span className={`font-semibold tabular-nums ${color}`}>
      {earned.toFixed(1)}
      <span className="text-gray-500 font-normal text-xs">/{max}</span>
    </span>
  )
}
