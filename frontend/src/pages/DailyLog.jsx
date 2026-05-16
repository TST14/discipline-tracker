/**
 * DailyLog.jsx — "Today" tab
 *
 * Displays all active habits for the selected date with auto-saving
 * input fields, plus a task picker for today's to-do items.
 */
import { useEffect, useState, useCallback } from 'react'
import dayjs from 'dayjs'
import { getEntries, upsertEntry, getDailySummary } from '../api/entries'
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
    const updated = { ...taskEntry, [field]: value || null }

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
            habits.map(habit => (
              <HabitRow
                key={habit.id} habit={habit}
                entry={entries[habit.id] || {}}
                isSaving={!!saving[habit.id]}
                onChange={(field, value) => handleFieldChange(habit.id, field, value)}
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
              {/* Column headers — only visible on sm+ */}
              <div className="hidden sm:grid grid-cols-[1fr_90px_90px_70px_80px_32px] gap-2 px-4 py-3 border-b border-gray-800 text-xs font-medium text-gray-400 uppercase tracking-wider">
                <div>Task</div><div>Start</div><div>End</div><div>Mins</div>
                <div className="text-right">Points</div><div />
              </div>

              {taskEntries.map(te => (
                <div key={te.id}
                  className="px-4 py-3 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">

                  {/* ── Mobile card layout ── */}
                  <div className="sm:hidden space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-white truncate">{te.todo_title}</span>
                        {savingTask[te.id] && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <div className="text-sm"><ScoreBadge earned={te.earned_points} max={te.todo_max_points} /></div>
                        <button onClick={() => removeTaskEntry(te)}
                          className="text-gray-600 hover:text-red-400 transition-colors text-sm font-bold" title="Remove from today">✕</button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input type="time" value={te.start_time || ''} onChange={e => handleTaskFieldChange(te, 'start_time', e.target.value)}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500" />
                      <input type="time" value={te.end_time || ''} onChange={e => handleTaskFieldChange(te, 'end_time', e.target.value)}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500" />
                      <input type="number" min="0" value={te.duration_minutes ?? ''} onChange={e => handleTaskFieldChange(te, 'duration_minutes', e.target.value)}
                        placeholder="mins" className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500 text-center" />
                    </div>
                  </div>

                  {/* ── Desktop grid layout ── */}
                  <div className="hidden sm:grid grid-cols-[1fr_90px_90px_70px_80px_32px] gap-2 items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{te.todo_title}</span>
                      {savingTask[te.id] && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                    </div>
                    <input type="time" value={te.start_time || ''} onChange={e => handleTaskFieldChange(te, 'start_time', e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500 w-full" />
                    <input type="time" value={te.end_time || ''} onChange={e => handleTaskFieldChange(te, 'end_time', e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500 w-full" />
                    <input type="number" min="0" value={te.duration_minutes ?? ''} onChange={e => handleTaskFieldChange(te, 'duration_minutes', e.target.value)}
                      placeholder="—" className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500 w-full text-center" />
                    <div className="text-right text-sm">
                      <ScoreBadge earned={te.earned_points} max={te.todo_max_points} />
                    </div>
                    <button onClick={() => removeTaskEntry(te)}
                      className="text-gray-700 hover:text-red-400 transition-colors text-sm font-bold" title="Remove from today">✕</button>
                  </div>

                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
