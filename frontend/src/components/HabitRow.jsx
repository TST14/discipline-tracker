import dayjs from 'dayjs'
import ScoreBadge from './ScoreBadge'

const INPUT_CLS =
  'bg-gray-800 border border-gray-700 rounded-lg px-2 lg:px-3 py-1.5 lg:py-2 text-sm text-white ' +
  'focus:outline-none focus:ring-1 focus:ring-gray-500'

/**
 * HabitRow — renders the correct input layout based on habit.scoring_type.
 *
 * Props:
 *   habit       — habit object (id, name, scoring_type, max_points)
 *   entry       — current entry values for that habit
 *   isSaving    — boolean, shows pulsing dot while saving
 *   onChange    — (field, value) => void
 */
export default function HabitRow({ habit, entry, isSaving, onChange, onClear, onQuickRegister }) {
  const type = habit.scoring_type

  // ── Time-of-day (single time input) ──────────────────────────────
  if (type === 'time_of_day' || type === 'time_of_day_linear') {
    return (
      <div className="flex items-center gap-3 px-4 lg:px-6 py-3 lg:py-4 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-sm lg:text-base font-medium text-white truncate">{habit.name}</span>
          {isSaving && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Time</span>
          <input
            type="time"
            value={entry.start_time || ''}
            onChange={e => onChange('start_time', e.target.value)}
            className={`${INPUT_CLS} w-[90px] lg:w-[110px]`}
          />
        </div>
        <div className="w-16 text-right text-sm flex-shrink-0">
          <ScoreBadge earned={entry.earned_points} max={habit.max_points} />
        </div>
        {entry.start_time && onClear && (
          <button onClick={onClear} title="Clear entry"
            className="text-gray-600 hover:text-red-400 transition-colors text-sm font-bold flex-shrink-0">✕</button>
        )}
      </div>
    )
  }

  // ── Boolean (done / not-done toggle) ─────────────────────────────
  if (type === 'boolean') {
    const done = entry.start_time != null || entry.duration_minutes != null
    return (
      <div className="flex items-center gap-3 px-4 lg:px-6 py-3 lg:py-4 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-sm lg:text-base font-medium text-white truncate">{habit.name}</span>
          {isSaving && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
        </div>
        <button
          onClick={() => onChange('start_time', done ? '' : dayjs().format('HH:mm'))}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            done
              ? 'bg-emerald-900 text-emerald-300 hover:bg-emerald-800'
              : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white border border-dashed border-gray-700'
          }`}
        >
          {done ? '✓ Done' : 'Mark done'}
        </button>
        <div className="w-16 text-right text-sm flex-shrink-0">
          <ScoreBadge earned={entry.earned_points} max={habit.max_points} />
        </div>
      </div>
    )
  }

  // ── Duration (start / end / mins) ────────────────────────────────
  // Mobile: name + score on top row, three inputs on bottom row.
  // sm+: everything in one horizontal row (original layout).
  const hasData = !!(entry.start_time || entry.end_time || entry.duration_minutes)
  return (
    <div className="px-4 lg:px-6 py-3 lg:py-4 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
      {/* Mobile-only top row: habit name + score badge */}
      <div className="flex items-center justify-between mb-2 sm:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-white truncate">{habit.name}</span>
          {isSaving && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <div className="text-sm"><ScoreBadge earned={entry.earned_points} max={habit.max_points} /></div>
          {onQuickRegister && (
            <button onClick={onQuickRegister} title="Quick register: prev end → now"
              className="text-gray-500 hover:text-yellow-400 transition-colors text-sm">⚡</button>
          )}
          {hasData && onClear && (
            <button onClick={onClear} title="Clear entry"
              className="text-gray-600 hover:text-red-400 transition-colors text-sm font-bold">✕</button>
          )}
        </div>
      </div>

      {/* Input row — on mobile: just the 3 inputs; on sm+: full inline row */}
      <div className="flex items-center gap-2">
        {/* Name + indicator — hidden on mobile (shown above), visible on sm+ */}
        <div className="hidden sm:flex flex-1 items-center gap-2 min-w-0">
          <span className="text-sm lg:text-base font-medium text-white truncate">{habit.name}</span>
          {isSaving && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
        </div>
        <input type="time" value={entry.start_time || ''} onChange={e => onChange('start_time', e.target.value)} className={`${INPUT_CLS} flex-1 sm:flex-none sm:w-[90px] lg:w-[110px]`} />
        <input type="time" value={entry.end_time || ''} onChange={e => onChange('end_time', e.target.value)} className={`${INPUT_CLS} flex-1 sm:flex-none sm:w-[90px] lg:w-[110px]`} />
        <input type="number" min="0" value={entry.duration_minutes ?? ''} onChange={e => onChange('duration_minutes', e.target.value)} placeholder="mins" className={`${INPUT_CLS} w-16 lg:w-24 text-center`} />
        {/* Score + clear — hidden on mobile (shown above), visible on sm+ */}
        <div className="hidden sm:block w-16 text-right text-sm flex-shrink-0">
          <ScoreBadge earned={entry.earned_points} max={habit.max_points} />
        </div>
        {onQuickRegister && (
          <button onClick={onQuickRegister} title="Quick register: prev end → now"
            className="hidden sm:block text-gray-500 hover:text-yellow-400 transition-colors text-sm flex-shrink-0">⚡</button>
        )}
        {hasData && onClear && (
          <button onClick={onClear} title="Clear entry"
            className="hidden sm:block text-gray-600 hover:text-red-400 transition-colors text-sm font-bold flex-shrink-0">✕</button>
        )}
      </div>
    </div>
  )
}
