/**
 * Analytics.jsx — "Progress" tab
 *
 * Shows weekly and monthly progress views:
 *   - Weekly: habit heatmap grid (Mon–Sun) with summary cards
 *   - Monthly: calendar with daily score % and summary cards
 *
 * Colour scale:  ≥80% → emerald  |  ≥50% → yellow  |  >0% → orange  |  0% → gray
 */
import { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import { getWeeklyAnalytics, getMonthlyAnalytics } from '../api/analytics'

// ─── constants ───────────────────────────────────────────────────────────────

const DAY_LABELS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Returns Tailwind bg+text class pair based on percentage 0–100. */
function pctColor(pct) {
  if (pct >= 80) return 'bg-emerald-900 text-emerald-300'
  if (pct >= 50) return 'bg-yellow-900  text-yellow-300'
  if (pct > 0)   return 'bg-orange-900  text-orange-300'
  return 'bg-gray-800 text-gray-400'
}

// ─── shared sub-components ───────────────────────────────────────────────────

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-gray-900 rounded-xl p-3 sm:p-4 lg:p-5 flex-1 min-w-0">
      <div className="text-xs sm:text-sm text-gray-400 mb-1">{label}</div>
      <div className="text-lg sm:text-xl lg:text-2xl font-bold text-white truncate">{value}</div>
      {sub && <div className="text-xs sm:text-sm text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function LoadingState() {
  return <div className="text-center text-gray-500 py-16 text-sm">Loading…</div>
}

function ErrorState({ message }) {
  return <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{message}</div>
}

// ─── WeeklyView ──────────────────────────────────────────────────────────────

function WeeklyView() {
  const today = dayjs().format('YYYY-MM-DD')
  const [weekDate, setWeekDate] = useState(today)
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getWeeklyAnalytics(weekDate)
      .then(d  => { setData(d); setLoading(false) })
      .catch(() => { setError('Failed to load weekly data.'); setLoading(false) })
  }, [weekDate])

  const prevWeek = () => setWeekDate(dayjs(weekDate).subtract(7, 'day').format('YYYY-MM-DD'))
  const nextWeek = () => setWeekDate(dayjs(weekDate).add(7, 'day').format('YYYY-MM-DD'))

  if (loading) return <LoadingState />
  if (error)   return <ErrorState message={error} />
  if (!data)   return null

  const { days, habits, todos = [], summary } = data

  return (
    <div className="space-y-5">

      {/* Week navigator */}
      <div className="flex items-center gap-3">
        <button onClick={prevWeek}
          className="p-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors text-lg leading-none">‹</button>
        <span className="text-sm font-medium text-white">
          {dayjs(data.start_date).format('MMM D')} – {dayjs(data.end_date).format('MMM D, YYYY')}
        </span>
        <button onClick={nextWeek}
          className="p-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors text-lg leading-none">›</button>
        <button onClick={() => setWeekDate(today)}
          className="ml-auto text-xs text-gray-500 hover:text-white transition-colors">This week</button>
      </div>

      {/* Summary cards */}
      <div className="flex gap-3">
        <SummaryCard
          label="Weekly Average"
          value={`${summary.avg_percentage}%`}
          sub={`${summary.total_earned} / ${summary.total_max} pts`}
        />
        <SummaryCard
          label="Goals Hit"
          value={`${summary.days_above_80} / 7`}
          sub="days ≥ 80%"
        />
        <SummaryCard
          label="Best Day"
          value={summary.best_day ? dayjs(summary.best_day).format('ddd D') : '—'}
          sub={summary.best_day ? `${summary.best_day_pct}%` : ''}
        />
        {summary.total_gap_minutes > 0 && (
          <SummaryCard
            label="Unutilized Time"
            value={`${summary.total_gap_minutes} min`}
            sub={`${summary.days_with_gaps} day${summary.days_with_gaps === 1 ? '' : 's'} with gaps`}
          />
        )}
      </div>

      {/* Habit × Day heatmap grid */}
      <div className="bg-gray-900 rounded-xl overflow-x-auto">
        <table className="w-full text-xs lg:text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 lg:px-6 py-3 lg:py-4 text-gray-400 font-medium w-36 lg:w-48">Habits</th>
              {days.map((d, i) => (
                <th key={i}
                  className={`px-2 py-3 text-center font-medium ${d.date === today ? 'text-white' : 'text-gray-300'}`}>
                  <div>{DAY_LABELS[i]}</div>
                  <div className={`text-xs mt-0.5 ${d.date === today ? 'text-blue-400' : 'text-gray-400'}`}>
                    {dayjs(d.date).format('D')}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {habits.map(habit => (
              <tr key={habit.id} className="border-b border-gray-800/40 last:border-0">
                <td className="px-4 lg:px-6 py-2.5 lg:py-3 text-gray-300 font-medium max-w-[140px] lg:max-w-[200px] truncate">{habit.name}</td>
                {days.map((d, i) => {
                  const hs  = d.habit_scores.find(s => s.habit_id === habit.id)
                  const pct = hs?.pct ?? 0
                  return (
                    <td key={i} className="px-2 py-2.5 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium min-w-[42px] ${pctColor(pct)}`}>
                        {hs?.done ? `${hs.earned}pt` : '—'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}

            {/* Tasks section separator + rows */}
            {todos.length > 0 && (
              <>
                <tr className="border-t-2 border-gray-700">
                  <td colSpan={8} className="px-4 lg:px-6 py-2 text-xs font-semibold text-gray-500 tracking-wider bg-gray-800/30">
                    Tasks
                  </td>
                </tr>
                {todos.map(todo => (
                  <tr key={todo.id} className="border-b border-gray-800/40 last:border-0">
                    <td className="px-4 lg:px-6 py-2.5 lg:py-3 text-gray-300 font-medium max-w-[140px] lg:max-w-[200px] truncate">{todo.title}</td>
                    {days.map((d, i) => {
                      const ts  = d.task_scores?.find(s => s.todo_id === todo.id)
                      const pct = ts?.pct ?? 0
                      return (
                        <td key={i} className="px-2 py-2.5 text-center">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium min-w-[42px] ${ts?.done ? pctColor(pct) : 'bg-gray-800 text-gray-500'}`}>
                            {ts?.done ? `${ts.earned}pt` : '—'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </>
            )}

            {/* Unutilized row */}
            <tr className="border-t border-gray-700">
              <td className="px-4 lg:px-6 py-2 text-red-400 font-semibold text-xs uppercase tracking-wider">Unutilized</td>
              {days.map((d, i) => (
                <td key={i} className="px-2 py-2 text-center">
                  {d.gap_minutes > 0 ? (
                    <span className="inline-block px-2 py-1 rounded text-xs font-medium min-w-[42px] bg-red-950 text-red-400">
                      −{d.gap_minutes}m
                    </span>
                  ) : (
                    <span className="text-xs text-gray-700">—</span>
                  )}
                </td>
              ))}
            </tr>

            {/* Net Points row */}
            <tr className="border-t border-gray-700/50">
              <td className="px-4 lg:px-6 py-2 text-gray-400 font-semibold text-xs uppercase tracking-wider">Net Points</td>
              {days.map((d, i) => (
                <td key={i} className="px-2 py-2 text-center">
                  {d.total_max > 0 ? (
                    <span className="text-xs font-medium text-white">{Math.round(d.adjusted_earned)} pts</span>
                  ) : (
                    <span className="text-xs text-gray-700">—</span>
                  )}
                </td>
              ))}
            </tr>

            {/* Max Points row */}
            <tr className="border-t border-gray-700/50">
              <td className="px-4 lg:px-6 py-2 text-gray-400 font-semibold text-xs uppercase tracking-wider">Max Points</td>
              {days.map((d, i) => (
                <td key={i} className="px-2 py-2 text-center">
                  {d.total_max > 0 ? (
                    <span className="text-xs font-medium text-gray-300">{Math.round(d.total_max)} pts</span>
                  ) : (
                    <span className="text-xs text-gray-700">—</span>
                  )}
                </td>
              ))}
            </tr>

            {/* Net % row */}
            <tr className="border-t border-gray-700/50 bg-gray-800/50">
              <td className="px-4 lg:px-6 py-2.5 text-gray-300 font-bold text-xs lg:text-sm uppercase tracking-wider">Net %</td>
              {days.map((d, i) => (
                <td key={i} className="px-2 py-2.5 text-center">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-bold min-w-[42px] ${d.total_max > 0 ? pctColor(d.adjusted_percentage) : 'bg-gray-800 text-gray-600'}`}>
                    {d.total_max > 0 ? `${d.adjusted_percentage}%` : '—'}
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Missed habits legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-emerald-900" />≥ 80% — goal hit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-yellow-900" />≥ 50% — partial
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-orange-900" />any points
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-gray-800" />— missed / not logged
        </span>
      </div>
    </div>
  )
}

// ─── MonthlyView ─────────────────────────────────────────────────────────────

function MonthlyView() {
  const today = dayjs()
  const [year, setYear]       = useState(today.year())
  const [month, setMonth]     = useState(today.month() + 1)
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getMonthlyAnalytics(year, month)
      .then(d  => { setData(d); setLoading(false) })
      .catch(() => { setError('Failed to load monthly data.'); setLoading(false) })
  }, [year, month])

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  if (loading) return <LoadingState />
  if (error)   return <ErrorState message={error} />
  if (!data)   return null

  const { days, summary } = data
  // Offset: dayjs().day() returns 0=Sun…6=Sat; convert so Mon=0
  const firstDay    = dayjs(`${year}-${String(month).padStart(2, '0')}-01`)
  const startOffset = (firstDay.day() + 6) % 7

  return (
    <div className="space-y-5">

      {/* Month navigator */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth}
          className="p-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors text-lg leading-none">‹</button>
        <span className="text-sm font-medium text-white">{MONTH_NAMES[month - 1]} {year}</span>
        <button onClick={nextMonth}
          className="p-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors text-lg leading-none">›</button>
        <button onClick={() => { setYear(today.year()); setMonth(today.month() + 1) }}
          className="ml-auto text-xs text-gray-500 hover:text-white transition-colors">This month</button>
      </div>

      {/* Summary cards */}
      <div className="flex gap-3">
        <SummaryCard
          label="Monthly Average"
          value={`${summary.avg_percentage}%`}
          sub={`${summary.total_earned} / ${summary.total_max} pts`}
        />
        <SummaryCard
          label="Goals Hit"
          value={`${summary.days_above_80} / ${days.length}`}
          sub="days ≥ 80%"
        />
        <SummaryCard
          label="Best Day"
          value={summary.best_day ? dayjs(summary.best_day).format('MMM D') : '—'}
          sub={summary.best_day ? `${summary.best_day_pct}%` : ''}
        />
        {summary.total_gap_minutes > 0 && (
          <SummaryCard
            label="Unutilized Time"
            value={`${summary.total_gap_minutes} min`}
            sub={`${summary.days_with_gaps} day${summary.days_with_gaps === 1 ? '' : 's'} with gaps`}
          />
        )}
      </div>

      {/* Calendar */}
      <div className="bg-gray-900 rounded-xl p-4">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {/* Empty leading cells */}
          {Array.from({ length: startOffset }).map((_, i) => <div key={`blank-${i}`} />)}

          {days.map(d => {
            const dayNum  = dayjs(d.date).date()
            const isToday = d.date === today.format('YYYY-MM-DD')
            const hasPts  = d.total_max > 0

            return (
              <div
                key={d.date}
                className={`rounded-md sm:rounded-lg p-1 sm:p-2 text-center select-none ${
                  hasPts ? pctColor(d.adjusted_percentage) : 'bg-gray-800/40 text-gray-500'
                } ${isToday ? 'ring-2 ring-blue-500' : ''}`}
              >
                <div className={`text-xs font-semibold leading-tight ${isToday ? 'text-blue-300' : ''}`}>
                  {dayNum}
                </div>
                {hasPts && (
                  <>
                    <div className="text-[10px] sm:text-xs mt-0.5 opacity-90 leading-tight">{Math.round(d.adjusted_earned)}pt</div>
                    <div className="text-[9px] sm:text-[10px] mt-0.5 opacity-80 leading-tight">{d.adjusted_percentage}%</div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Per-habit monthly breakdown */}
      {data.habits.length > 0 && (
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Habit Breakdown</span>
          </div>
          {data.habits.map(habit => {
            const daysLogged  = days.filter(d => d.habit_scores.find(s => s.habit_id === habit.id && s.done)).length
            const daysHit     = days.filter(d => {
              const s = d.habit_scores.find(s => s.habit_id === habit.id)
              return s && s.pct >= 80
            }).length
            const totalEarned = days.reduce((sum, d) => {
              const s = d.habit_scores.find(s => s.habit_id === habit.id)
              return sum + (s?.earned ?? 0)
            }, 0)
            const pct = habit.max > 0 ? Math.round(totalEarned / (habit.max * days.length) * 100) : 0

            return (
              <div key={habit.id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 px-4 py-3 border-b border-gray-800/50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm lg:text-base font-medium text-white truncate">{habit.name}</div>
                  <div className="text-xs lg:text-sm text-gray-500 mt-0.5">
                    Logged {daysLogged}/{days.length} days · {daysHit} days ≥ 80%
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full sm:w-32 flex-shrink-0">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{totalEarned.toFixed(0)} pts</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-yellow-500' : pct > 0 ? 'bg-orange-500' : 'bg-gray-700'
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Per-todo monthly breakdown */}
      {data.todos && data.todos.length > 0 && (
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Task Breakdown</span>
          </div>
          {data.todos.map(todo => {
            const daysLogged  = days.filter(d => d.task_scores?.find(s => s.todo_id === todo.id && s.done)).length
            const totalEarned = days.reduce((sum, d) => {
              const s = d.task_scores?.find(s => s.todo_id === todo.id)
              return sum + (s?.earned ?? 0)
            }, 0)
            const totalMax = daysLogged * todo.max
            const pct = totalMax > 0 ? Math.round(totalEarned / totalMax * 100) : 0

            return (
              <div key={todo.id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 px-4 py-3 border-b border-gray-800/50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm lg:text-base font-medium text-white truncate">{todo.title}</div>
                  <div className="text-xs lg:text-sm text-gray-500 mt-0.5">
                    Logged {daysLogged} day{daysLogged !== 1 ? 's' : ''}
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full sm:w-32 flex-shrink-0">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{totalEarned.toFixed(0)} pts</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-yellow-500' : pct > 0 ? 'bg-orange-500' : 'bg-gray-700'
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function Analytics() {
  const [view, setView] = useState('weekly')

  return (
    <div className="space-y-4">
      {/* Header + view toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Progress</h2>
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
          {['weekly', 'monthly'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                view === v ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'weekly'  && <WeeklyView  />}
      {view === 'monthly' && <MonthlyView />}
    </div>
  )
}
