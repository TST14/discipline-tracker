/**
 * DailyLog.jsx — "Today" tab
 *
 * Displays all active habits for the selected date with auto-saving
 * input fields, plus a task picker for today's to-do items.
 */
import { useEffect, useState, useCallback } from 'react'
import dayjs from 'dayjs'
import { getEntries, upsertEntry, deleteEntry, getDailySummary } from '../api/entries'
import { getHabits } from '../api/habits'
import { getTodos, getTaskEntries, upsertTaskEntry, deleteTaskEntry } from '../api/todos'
import HabitRow from '../components/HabitRow'
import ScoreBadge from '../components/ScoreBadge'

// ─── helpers ────────────────────────────────────────────────────────────────

function timeToMinutes(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(mins) {
  if (mins == null || mins < 0) return ''
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ─── component ──────────────────────────────────────────────────────────────

export default function DailyLog() {
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [habits, setHabits] = useState([])
  const [entries, setEntries] = useState({})        // { habitId: entryObj }
  const [taskEntries, setTaskEntries] = useState([]) // DailyTaskEntry[]
  const [pendingTodos, setPendingTodos] = useState([])
  const [showTaskPicker, setShowTaskPicker] = useState(false)
  const [summary, setSummary] = useState(null)
  const [saving, setSaving] = useState({})
  const [savingTask, setSavingTask] = useState({})
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const [h, e, s, te, pt] = await Promise.all([
        getHabits(),
        getEntries(date),
        getDailySummary(date),
        getTaskEntries(date),
        getTodos('pending'),
      ])
      setHabits(h)
      const map = {}
      e.forEach(en => { map[en.habit_id] = en })
      setEntries(map)
      setSummary(s)
      setTaskEntries(te)
      const addedIds = new Set(te.map(t => t.todo_id))
      setPendingTodos(pt.filter(t => !addedIds.has(t.id)))
    } catch {
      setError('Could not connect to backend. Make sure the API server is running.')
    }
  }, [date])

  useEffect(() => { load() }, [load])

  const handleFieldChange = async (habitId, field, value) => {
    const habit = habits.find(h => h.id === habitId)
    const isTimeEvent = habit?.scoring_type === 'time_of_day' || habit?.scoring_type === 'time_of_day_linear'
    const current = entries[habitId] || {}
    const updated = { ...current, habit_id: habitId, entry_date: date, [field]: value || null }

    if (isTimeEvent) {
      updated.end_time = null
      updated.duration_minutes = null
    } else {
      if (field === 'end_time' && updated.start_time && value) {
        const diff = timeToMinutes(value) - timeToMinutes(updated.start_time)
        if (diff > 0) updated.duration_minutes = diff
      }
      if (field === 'start_time' && updated.end_time && value) {
        const diff = timeToMinutes(updated.end_time) - timeToMinutes(value)
        if (diff > 0) updated.duration_minutes = diff
      }
      if (field === 'duration_minutes' && updated.start_time && value) {
        const dur = parseInt(value, 10)
        if (!isNaN(dur) && dur > 0) updated.end_time = minutesToTime(timeToMinutes(updated.start_time) + dur)
      }
    }

    setEntries(prev => ({ ...prev, [habitId]: updated }))
    setSaving(prev => ({ ...prev, [habitId]: true }))
    try {
      const saved = await upsertEntry(updated)
      setEntries(prev => ({ ...prev, [habitId]: saved }))
      setSummary(await getDailySummary(date))
    } catch {
      setError('Failed to save entry.')
    } finally {
      setSaving(prev => ({ ...prev, [habitId]: false }))
    }
  }

  const handleTaskFieldChange = async (taskEntry, field, value) => {
    const scoringType = taskEntry.todo_scoring_type || 'boolean'
    const isTimeEvent = scoringType === 'time_of_day' || scoringType === 'time_of_day_linear'
    const updated = { ...taskEntry, [field]: value || null }

    if (isTimeEvent) {
      // Time-of-day: only start_time matters — clear everything else
      updated.end_time = null
      updated.duration_minutes = null
    } else {
      // Duration: auto-compute the third field when two are known
      if (field === 'end_time' && updated.start_time && value) {
        const diff = timeToMinutes(value) - timeToMinutes(updated.start_time)
        if (diff > 0) updated.duration_minutes = diff
      }
      if (field === 'start_time' && updated.end_time && value) {
        const diff = timeToMinutes(updated.end_time) - timeToMinutes(value)
        if (diff > 0) updated.duration_minutes = diff
      }
      if (field === 'duration_minutes' && updated.start_time && value) {
        const dur = parseInt(value, 10)
        if (!isNaN(dur) && dur > 0) updated.end_time = minutesToTime(timeToMinutes(updated.start_time) + dur)
      }
    }

    setTaskEntries(prev => prev.map(t => t.id === taskEntry.id ? updated : t))
    setSavingTask(prev => ({ ...prev, [taskEntry.id]: true }))
    try {
      const saved = await upsertTaskEntry({
        todo_id: taskEntry.todo_id,
        entry_date: date,
        start_time: updated.start_time || null,
        end_time: updated.end_time || null,
        duration_minutes: updated.duration_minutes || null,
      })
      setTaskEntries(prev => prev.map(t => t.id === taskEntry.id ? saved : t))
      setSummary(await getDailySummary(date))
    } catch {
      setError('Failed to save task entry.')
    } finally {
      setSavingTask(prev => ({ ...prev, [taskEntry.id]: false }))
    }
  }

  const handleClearEntry = async (habitId) => {
    const entry = entries[habitId]
    if (!entry?.id) return
    setSaving(prev => ({ ...prev, [habitId]: true }))
    try {
      await deleteEntry(entry.id)
      setEntries(prev => { const n = { ...prev }; delete n[habitId]; return n })
      setSummary(await getDailySummary(date))
    } catch {
      setError('Failed to clear entry.')
    } finally {
      setSaving(prev => ({ ...prev, [habitId]: false }))
    }
  }

  const pickTodo = async (todo) => {
    try {
      const saved = await upsertTaskEntry({ todo_id: todo.id, entry_date: date })
      setTaskEntries(prev => [...prev, saved])
      setPendingTodos(prev => prev.filter(t => t.id !== todo.id))
      setShowTaskPicker(false)
      setSummary(await getDailySummary(date))
    } catch {
      setError('Failed to add task.')
    }
  }

  const removeTaskEntry = async (taskEntry) => {
    try {
      await deleteTaskEntry(taskEntry.id)
      await load()
    } catch {
      setError('Failed to remove task.')
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  // Habits with a start_time logged today → sorted by that time (ascending).
  // Habits without a start_time → keep configure order, shown after timed ones.
  const sortedHabits = [...habits].sort((a, b) => {
    const aTime = entries[a.id]?.start_time
    const bTime = entries[b.id]?.start_time
    if (aTime && bTime) return aTime.localeCompare(bTime)
    if (aTime) return -1
    if (bTime) return 1
    return 0  // both untimed: preserve original display_order from backend
  })

  // Same logic for task entries: sort by start_time if logged, else by todo's display_order.
  const sortedTaskEntries = [...taskEntries].sort((a, b) => {
    const aTime = a.start_time
    const bTime = b.start_time
    if (aTime && bTime) return aTime.localeCompare(bTime)
    if (aTime) return -1
    if (bTime) return 1
    return (a.todo_display_order ?? 0) - (b.todo_display_order ?? 0)
  })

  return (
    <div className="space-y-6">

      {/* Date navigator */}
      <div className="flex items-center gap-3">
        <button onClick={() => setDate(dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))}
          className="p-3 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">‹</button>
        <input
          type="date" value={date} onChange={e => setDate(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-600"
        />
        <button onClick={() => setDate(dayjs(date).add(1, 'day').format('YYYY-MM-DD'))}
          className="p-3 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">›</button>
        <button onClick={() => setDate(dayjs().format('YYYY-MM-DD'))}
          className="ml-auto text-xs text-gray-500 hover:text-white transition-colors">Today</button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {/* Score summary */}
      {summary && (
        <div className="bg-gray-900 rounded-xl p-4 lg:p-6 flex items-center justify-between">
          <span className="text-sm lg:text-base text-gray-300">Total Score</span>
          <div className="text-right">
            <span className="text-2xl lg:text-4xl font-bold text-white tabular-nums">{summary.total_earned.toFixed(1)}</span>
            <span className="text-gray-500 text-sm lg:text-base"> / {summary.total_max}</span>
            <div className="text-xs lg:text-sm text-gray-400 mt-0.5">{summary.percentage.toFixed(0)}% of max</div>
          </div>
        </div>
      )}

      {/* Daily Habits */}
      <div>
        <h3 className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Daily Habits</h3>
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          {habits.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500 text-sm">
              No habits configured. Go to <strong>Configure</strong> to add your first habit.
            </div>
          ) : (
            sortedHabits.map(habit => (
              <HabitRow
                key={habit.id} habit={habit}
                entry={entries[habit.id] || {}}
                isSaving={!!saving[habit.id]}
                onChange={(field, value) => handleFieldChange(habit.id, field, value)}
                onClear={entries[habit.id]?.id ? () => handleClearEntry(habit.id) : undefined}
              />
            ))
          )}
        </div>
      </div>

      {/* Today's Tasks */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wider">Today's Tasks</h3>
          <button onClick={() => setShowTaskPicker(p => !p)}
            className="text-xs text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1 transition-colors">
            + Add from To-Do
          </button>
        </div>

        {showTaskPicker && (
          <div className="bg-gray-800 rounded-xl p-3 mb-3 space-y-1">
            {pendingTodos.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-2">
                No pending tasks. Add some in the <strong>Tasks</strong> tab.
              </p>
            ) : (
              pendingTodos.map(todo => (
                <button key={todo.id} onClick={() => pickTodo(todo)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors text-left">
                  <span className="text-sm text-white">{todo.title}</span>
                  {todo.max_points > 0 && <span className="text-xs text-gray-500 ml-2">{todo.max_points} pts</span>}
                </button>
              ))
            )}
          </div>
        )}

        <div className="bg-gray-900 rounded-xl overflow-hidden">
          {taskEntries.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500 text-sm">
              No tasks added for today. Click <strong>+ Add from To-Do</strong> above.
            </div>
          ) : (
            <>
              {sortedTaskEntries.map(te => {
                const scoringType = te.todo_scoring_type || 'boolean'
                const isTimeOnly  = scoringType === 'time_of_day' || scoringType === 'time_of_day_linear'
                const isDuration  = scoringType === 'duration'    || scoringType === 'duration_linear'
                const isBoolean   = !isTimeOnly && !isDuration
                const isDone      = te.start_time != null || te.duration_minutes != null
                const INPUT_CLS   = 'bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500'

                return (
                <div key={te.id}
                  className="px-4 py-3 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">

                  {/* ── Boolean ── toggle button */}
                  {isBoolean && (
                    <div className="flex items-center gap-3">
                      <div className="flex flex-1 items-center gap-2 min-w-0">
                        <span className="text-sm lg:text-base font-medium text-white truncate">{te.todo_title}</span>
                        {savingTask[te.id] && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                      </div>
                      <button
                        onClick={() => handleTaskFieldChange(te, 'start_time', isDone ? '' : dayjs().format('HH:mm'))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                          isDone
                            ? 'bg-emerald-900 text-emerald-300 hover:bg-emerald-800'
                            : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white border border-dashed border-gray-700'
                        }`}
                      >
                        {isDone ? '✓ Done' : 'Mark done'}
                      </button>
                      <div className="text-sm flex-shrink-0"><ScoreBadge earned={te.earned_points} max={te.todo_max_points} /></div>
                      <button onClick={() => removeTaskEntry(te)}
                        className="text-gray-600 hover:text-red-400 transition-colors text-sm font-bold flex-shrink-0" title="Remove from today">✕</button>
                    </div>
                  )}

                  {/* ── Time of day ── single time input */}
                  {isTimeOnly && (
                    <div className="flex items-center gap-3">
                      <div className="flex flex-1 items-center gap-2 min-w-0">
                        <span className="text-sm lg:text-base font-medium text-white truncate">{te.todo_title}</span>
                        {savingTask[te.id] && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                      </div>
                      <span className="text-xs text-gray-500 flex-shrink-0">Time</span>
                      <input type="time" value={te.start_time || ''}
                        onChange={e => handleTaskFieldChange(te, 'start_time', e.target.value)}
                        className={`${INPUT_CLS} w-[90px] lg:w-[110px] flex-shrink-0`} />
                      <div className="text-sm flex-shrink-0"><ScoreBadge earned={te.earned_points} max={te.todo_max_points} /></div>
                      <button onClick={() => removeTaskEntry(te)}
                        className="text-gray-600 hover:text-red-400 transition-colors text-sm font-bold flex-shrink-0" title="Remove from today">✕</button>
                    </div>
                  )}

                  {/* ── Duration ── start / end / mins */}
                  {isDuration && (
                    <>
                      {/* Mobile: name + score top row, inputs bottom row */}
                      <div className="flex items-center justify-between mb-2 sm:hidden">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm lg:text-base font-medium text-white truncate">{te.todo_title}</span>
                          {savingTask[te.id] && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <div className="text-sm"><ScoreBadge earned={te.earned_points} max={te.todo_max_points} /></div>
                          <button onClick={() => removeTaskEntry(te)}
                            className="text-gray-600 hover:text-red-400 transition-colors text-sm font-bold" title="Remove from today">✕</button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="hidden sm:flex flex-1 items-center gap-2 min-w-0">
                          <span className="text-sm lg:text-base font-medium text-white truncate">{te.todo_title}</span>
                          {savingTask[te.id] && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                        </div>
                        <input type="time" value={te.start_time || ''}
                          onChange={e => handleTaskFieldChange(te, 'start_time', e.target.value)}
                          className={`${INPUT_CLS} flex-1 sm:flex-none sm:w-[90px] lg:w-[110px]`} />
                        <input type="time" value={te.end_time || ''}
                          onChange={e => handleTaskFieldChange(te, 'end_time', e.target.value)}
                          className={`${INPUT_CLS} flex-1 sm:flex-none sm:w-[90px] lg:w-[110px]`} />
                        <input type="number" min="0" value={te.duration_minutes ?? ''}
                          onChange={e => handleTaskFieldChange(te, 'duration_minutes', e.target.value)}
                          placeholder="mins" className={`${INPUT_CLS} w-14 lg:w-20 text-center`} />
                        <div className="hidden sm:block text-sm flex-shrink-0"><ScoreBadge earned={te.earned_points} max={te.todo_max_points} /></div>
                        <button onClick={() => removeTaskEntry(te)}
                          className="hidden sm:block text-gray-600 hover:text-red-400 transition-colors text-sm font-bold flex-shrink-0" title="Remove from today">✕</button>
                      </div>
                    </>
                  )}

                </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
