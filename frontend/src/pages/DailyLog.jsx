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
import { getScreenTime, addScreenTime, updateScreenTime, deleteScreenTime, screenTimePenaltyPts } from '../api/screenTime'
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

// ─── gap detection ───────────────────────────────────────────────────────────
// Finds unutilized time: gaps BETWEEN consecutive logged activities.
// Trailing time after the last activity is NOT counted.
// Rules for inclusion on the timeline:
//   • Any activity with start + end OR start + duration_minutes > 0 (has a real span)
//   • time_of_day / time_of_day_linear entries with only start_time (explicit clock anchor)
// Excluded: boolean "done" markers — their start_time is just the click timestamp.
// no_rule entries ARE included when they have a real end_time or duration.
function computeGaps(entries, taskEntries, habits) {
  const intervals = []

  const habitMap = Object.fromEntries(habits.map(h => [h.id, h]))

  Object.values(entries).forEach(e => {
    if (!e.start_time) return
    const scoringType = habitMap[e.habit_id]?.scoring_type ?? ''
    if (scoringType === 'boolean') return
    const start = timeToMinutes(e.start_time)
    let end = null
    if (e.end_time) end = timeToMinutes(e.end_time)
    else if (e.duration_minutes > 0) end = start + e.duration_minutes

    if (end !== null) {
      // Has a real span — always include
      intervals.push({ start, end: Math.max(start, end) })
    } else if (scoringType === 'time_of_day' || scoringType === 'time_of_day_linear') {
      // Explicit clock anchor (point event)
      intervals.push({ start, end: start })
    }
    // boolean / incomplete duration → skip
  })

  taskEntries.forEach(te => {
    if (!te.start_time) return
    const scoringType = te.todo_scoring_type ?? ''
    if (scoringType === 'boolean') return
    const start = timeToMinutes(te.start_time)
    let end = null
    if (te.end_time) end = timeToMinutes(te.end_time)
    else if (te.duration_minutes > 0) end = start + te.duration_minutes

    if (end !== null) {
      intervals.push({ start, end: Math.max(start, end) })
    } else if (scoringType === 'time_of_day' || scoringType === 'time_of_day_linear') {
      intervals.push({ start, end: start })
    }
    // boolean / incomplete no_rule (no end/duration yet) → skip
  })

  if (intervals.length < 2) return []

  intervals.sort((a, b) => a.start - b.start)

  // Merge overlapping / touching intervals
  const merged = [{ ...intervals[0] }]
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1]
    if (intervals[i].start <= last.end) {
      last.end = Math.max(last.end, intervals[i].end)
    } else {
      merged.push({ ...intervals[i] })
    }
  }

  const gaps = []
  for (let i = 1; i < merged.length; i++) {
    const gapStart = merged[i - 1].end
    const gapEnd   = merged[i].start
    if (gapEnd > gapStart) {
      gaps.push({ start: minutesToTime(gapStart), end: minutesToTime(gapEnd), minutes: gapEnd - gapStart })
    }
  }
  return gaps
}
// Returns the latest end-time (HH:mm) across all logged habit + task entries.
// Used by quick-register to pre-fill a new entry's start_time.
function getLatestEndTime(entries, taskEntries, screenEntries = []) {
  let maxMins = null

  Object.values(entries).forEach(e => {
    if (!e.start_time) return
    let endMins = null
    if (e.end_time) endMins = timeToMinutes(e.end_time)
    else if (e.duration_minutes > 0) endMins = timeToMinutes(e.start_time) + e.duration_minutes
    if (endMins !== null && (maxMins === null || endMins > maxMins)) maxMins = endMins
  })

  taskEntries.forEach(te => {
    if (!te.start_time) return
    let endMins = null
    if (te.end_time) endMins = timeToMinutes(te.end_time)
    else if (te.duration_minutes > 0) endMins = timeToMinutes(te.start_time) + te.duration_minutes
    if (endMins !== null && (maxMins === null || endMins > maxMins)) maxMins = endMins
  })

  screenEntries.forEach(se => {
    const endMins = timeToMinutes(se.end_time.slice(0, 5))
    if (endMins !== null && (maxMins === null || endMins > maxMins)) maxMins = endMins
  })

  return maxMins !== null ? minutesToTime(maxMins) : null
}
// ─── component ──────────────────────────────────────────────────────────────

export default function DailyLog({ date = dayjs().format('YYYY-MM-DD'), setDate }) {
  const [habits, setHabits] = useState([])
  const [entries, setEntries] = useState({})        // { habitId: entryObj }
  const [taskEntries, setTaskEntries] = useState([]) // DailyTaskEntry[]
  const [pendingTodos, setPendingTodos] = useState([])
  const [showTaskPicker, setShowTaskPicker] = useState(false)
  const [summary, setSummary] = useState(null)
  const [saving, setSaving] = useState({})
  const [savingTask, setSavingTask] = useState({})
  const [error, setError] = useState(null)
  const [screenEntries, setScreenEntries] = useState([])
  const [screenForm, setScreenForm] = useState({ start_time: '', end_time: '', note: '' })
  const [screenSaving, setScreenSaving] = useState(false)
  const [editingScreen, setEditingScreen] = useState({ id: null, start_time: '', end_time: '', note: '' })

  const load = useCallback(async () => {
    try {
      setError(null)
      const [h, e, s, te, pt, se] = await Promise.all([
        getHabits(),
        getEntries(date),
        getDailySummary(date),
        getTaskEntries(date),
        getTodos('pending'),
        getScreenTime(date),
      ])
      setHabits(h)
      const map = {}
      e.forEach(en => { map[en.habit_id] = en })
      setEntries(map)
      setSummary(s)
      setTaskEntries(te)
      setPendingTodos(pt)  // show all pending todos — tasks can have multiple entries per day
      setScreenEntries(se)
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
      if (field === 'duration_minutes' && value) {
        const dur = parseInt(value, 10)
        if (!isNaN(dur) && dur > 0) {
          if (!current.start_time && !current.end_time) {
            // All 3 fields were empty — auto-fill start from latest end-time
            const latestEnd = getLatestEndTime(entries, taskEntries, screenEntries)
            if (latestEnd) {
              updated.start_time = latestEnd
              updated.end_time = minutesToTime(timeToMinutes(latestEnd) + dur)
            }
          } else if (updated.start_time) {
            updated.end_time = minutesToTime(timeToMinutes(updated.start_time) + dur)
          }
        }
      }
    }

    setEntries(prev => ({ ...prev, [habitId]: updated }))
    setSaving(prev => ({ ...prev, [habitId]: true }))
    try {
      const saved = await upsertEntry(updated)
      // When editing duration_minutes the backend may recalculate it from
      // start/end times, which would overwrite the field while the user is
      // still typing. Preserve the value we sent so the input stays stable.
      const merged = field === 'duration_minutes'
        ? { ...saved, duration_minutes: updated.duration_minutes }
        : saved
      setEntries(prev => ({ ...prev, [habitId]: merged }))
      setSummary(await getDailySummary(date))
    } catch {
      setError('Failed to save entry.')
      if (current.id) {
        setEntries(prev => ({ ...prev, [habitId]: current }))
      } else {
        setEntries(prev => {
          const n = { ...prev }
          delete n[habitId]
          return n
        })
      }
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
      if (field === 'duration_minutes' && value) {
        const dur = parseInt(value, 10)
        if (!isNaN(dur) && dur > 0) {
          if (!taskEntry.start_time && !taskEntry.end_time) {
            // All 3 fields were empty — auto-fill start from latest end-time
            const latestEnd = getLatestEndTime(entries, taskEntries, screenEntries)
            if (latestEnd) {
              updated.start_time = latestEnd
              updated.end_time = minutesToTime(timeToMinutes(latestEnd) + dur)
            }
          } else if (updated.start_time) {
            updated.end_time = minutesToTime(timeToMinutes(updated.start_time) + dur)
          }
        }
      }
    }

    setTaskEntries(prev => prev.map(t => t.id === taskEntry.id ? updated : t))
    setSavingTask(prev => ({ ...prev, [taskEntry.id]: true }))
    try {
      const saved = await upsertTaskEntry({
        id: taskEntry.id,
        todo_id: taskEntry.todo_id,
        entry_date: date,
        start_time: updated.start_time || null,
        end_time: updated.end_time || null,
        duration_minutes: updated.duration_minutes || null,
      })
      // Same as habit entries: preserve the sent duration_minutes so the
      // backend's recalculation from start/end doesn't overwrite mid-edit.
      const merged = field === 'duration_minutes'
        ? { ...saved, duration_minutes: updated.duration_minutes }
        : saved
      setTaskEntries(prev => prev.map(t => t.id === taskEntry.id ? merged : t))
      setSummary(await getDailySummary(date))
    } catch {
      setError('Failed to save task entry.')
      setTaskEntries(prev => prev.map(t => t.id === taskEntry.id ? taskEntry : t))
    } finally {
      setSavingTask(prev => ({ ...prev, [taskEntry.id]: false }))
    }
  }

  const handleClearEntry = async (habitId) => {
    const entry = entries[habitId]
    if (!entry?.id) return
    const originalEntry = entries[habitId]
    setEntries(prev => { const n = { ...prev }; delete n[habitId]; return n })
    setSaving(prev => ({ ...prev, [habitId]: true }))
    try {
      await deleteEntry(entry.id)
      setSummary(await getDailySummary(date))
    } catch {
      setError('Failed to clear entry.')
      setEntries(prev => ({ ...prev, [habitId]: originalEntry }))
    } finally {
      setSaving(prev => ({ ...prev, [habitId]: false }))
    }
  }

  const pickTodo = async (todo) => {
    const tempId = `temp-${Date.now()}`
    const tempEntry = {
      id: tempId,
      todo_id: todo.id,
      todo_title: todo.title,
      todo_max_points: todo.max_points,
      todo_scoring_type: todo.scoring_type,
      entry_date: date,
      start_time: null,
      end_time: null,
      duration_minutes: null,
      earned_points: 0,
    }
    setTaskEntries(prev => [...prev, tempEntry])
    setShowTaskPicker(false)
    try {
      const saved = await upsertTaskEntry({ todo_id: todo.id, entry_date: date })
      setTaskEntries(prev => prev.map(t => t.id === tempId ? saved : t))
      setSummary(await getDailySummary(date))
    } catch {
      setError('Failed to add task.')
      setTaskEntries(prev => prev.filter(t => t.id !== tempId))
    }
  }

  const removeTaskEntry = async (taskEntry) => {
    const originalTaskEntries = [...taskEntries]
    setTaskEntries(prev => prev.filter(t => t.id !== taskEntry.id))
    try {
      await deleteTaskEntry(taskEntry.id)
      setSummary(await getDailySummary(date))
    } catch {
      setError('Failed to remove task.')
      setTaskEntries(originalTaskEntries)
    }
  }

  // Shared save logic for screen time (used by auto-save and quick-register).
  const saveScreenTime = async (start_time, end_time, note) => {
    const tempId = `temp-${Date.now()}`
    const tempEntry = {
      id: tempId,
      entry_date: date,
      start_time,
      end_time,
      note: note || '',
      minutes: timeToMinutes(end_time) - timeToMinutes(start_time),
    }
    setScreenEntries(prev => [...prev, tempEntry])
    setScreenSaving(true)
    try {
      const saved = await addScreenTime({ entry_date: date, start_time, end_time, note: note || null })
      setScreenEntries(prev => prev.map(e => e.id === tempId ? saved : e))
    } catch {
      setError('Failed to log screen time.')
      setScreenEntries(prev => prev.filter(e => e.id !== tempId))
    } finally {
      setScreenSaving(false)
    }
  }

  // Auto-save when focus leaves the entire row (lets user fill note before triggering).
  const handleScreenRowBlur = async (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    const { start_time, end_time, note } = screenForm
    if (start_time && end_time && timeToMinutes(end_time) > timeToMinutes(start_time)) {
      await saveScreenTime(start_time, end_time, note)
      setScreenForm({ start_time: '', end_time: '', note: '' })
    }
  }

  const handleDeleteScreenTime = async (id) => {
    const originalScreenEntries = [...screenEntries]
    setScreenEntries(prev => prev.filter(e => e.id !== id))
    try {
      await deleteScreenTime(id)
    } catch {
      setError('Failed to delete screen time entry.')
      setScreenEntries(originalScreenEntries)
    }
  }

  const startEditScreen = (se) => {
    setEditingScreen({
      id: se.id,
      start_time: se.start_time.slice(0, 5),
      end_time: se.end_time.slice(0, 5),
      note: se.note || '',
    })
  }

  const cancelEditScreen = () => setEditingScreen({ id: null, start_time: '', end_time: '', note: '' })

  const handleEditScreenBlur = async (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    const { id, start_time, end_time, note } = editingScreen
    if (!id) return
    if (start_time && end_time && timeToMinutes(end_time) > timeToMinutes(start_time)) {
      const originalScreenEntries = [...screenEntries]
      const updatedTemp = {
        id,
        entry_date: date,
        start_time,
        end_time,
        note: note || '',
        minutes: timeToMinutes(end_time) - timeToMinutes(start_time),
      }
      setScreenEntries(prev => prev.map(e => e.id === id ? updatedTemp : e))
      cancelEditScreen()
      try {
        const updated = await updateScreenTime(id, { entry_date: date, start_time, end_time, note: note || null })
        setScreenEntries(prev => prev.map(e => e.id === id ? updated : e))
      } catch {
        setError('Failed to update screen time entry.')
        setScreenEntries(originalScreenEntries)
      }
    } else {
      cancelEditScreen()
    }
  }

  // ⚡ Quick-register: start = latest end across habits, tasks AND screen time → end = now.
  const handleQuickRegisterScreenTime = async () => {
    const now = dayjs().format('HH:mm')
    const start = getLatestEndTime(entries, taskEntries, screenEntries) || now
    if (timeToMinutes(now) <= timeToMinutes(start)) return
    await saveScreenTime(start, now, screenForm.note)
    setScreenForm(prev => ({ ...prev, note: '' }))
  }

  // ⚡ Quick-register a habit: start = latest end-time of any entry, end = now.
  // Second session: keeps original start_time, accumulates duration_minutes.
  const handleQuickRegister = async (habitId) => {
    const latestEnd = getLatestEndTime(entries, taskEntries, screenEntries)
    const now = dayjs().format('HH:mm')
    const endTime = now
    const sessionStart = latestEnd || now
    const newDur = timeToMinutes(endTime) > timeToMinutes(sessionStart)
      ? timeToMinutes(endTime) - timeToMinutes(sessionStart)
      : 0

    const current = entries[habitId] || {}
    const isSecondSession = !!(current.start_time || current.duration_minutes)
    const startTime    = isSecondSession ? current.start_time : sessionStart
    const totalDur     = isSecondSession ? (current.duration_minutes || 0) + newDur : (newDur || null)
    const updated = { ...current, habit_id: habitId, entry_date: date, start_time: startTime, end_time: endTime, duration_minutes: totalDur }
    setEntries(prev => ({ ...prev, [habitId]: updated }))
    setSaving(prev => ({ ...prev, [habitId]: true }))
    try {
      const saved = await upsertEntry(updated)
      setEntries(prev => ({ ...prev, [habitId]: saved }))
      setSummary(await getDailySummary(date))
    } catch {
      setError('Failed to save entry.')
      if (current.id) {
        setEntries(prev => ({ ...prev, [habitId]: current }))
      } else {
        setEntries(prev => {
          const n = { ...prev }
          delete n[habitId]
          return n
        })
      }
    } finally {
      setSaving(prev => ({ ...prev, [habitId]: false }))
    }
  }

  // ⚡ Quick-register a task entry: same logic as habits.
  // Second session: keeps original start_time, accumulates duration_minutes.
  const handleQuickRegisterTask = async (taskEntry) => {
    const latestEnd = getLatestEndTime(entries, taskEntries, screenEntries)
    const now = dayjs().format('HH:mm')
    const endTime = now
    const sessionStart = latestEnd || now
    const newDur = timeToMinutes(endTime) > timeToMinutes(sessionStart)
      ? timeToMinutes(endTime) - timeToMinutes(sessionStart)
      : 0

    const isSecondSession = !!(taskEntry.start_time || taskEntry.duration_minutes)
    const startTime = isSecondSession ? taskEntry.start_time : sessionStart
    const totalDur  = isSecondSession ? (taskEntry.duration_minutes || 0) + newDur : (newDur || null)
    const updated = { ...taskEntry, start_time: startTime, end_time: endTime, duration_minutes: totalDur }
    setTaskEntries(prev => prev.map(t => t.id === taskEntry.id ? updated : t))
    setSavingTask(prev => ({ ...prev, [taskEntry.id]: true }))
    try {
      const saved = await upsertTaskEntry({
        id: taskEntry.id,
        todo_id: taskEntry.todo_id,
        entry_date: date,
        start_time: updated.start_time,
        end_time: updated.end_time,
        duration_minutes: updated.duration_minutes,
      })
      setTaskEntries(prev => prev.map(t => t.id === taskEntry.id ? saved : t))
      setSummary(await getDailySummary(date))
    } catch {
      setError('Failed to save task entry.')
      setTaskEntries(prev => prev.map(t => t.id === taskEntry.id ? taskEntry : t))
    } finally {
      setSavingTask(prev => ({ ...prev, [taskEntry.id]: false }))
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

  const gaps            = computeGaps(entries, taskEntries, habits)
  const totalGapMinutes = gaps.reduce((sum, g) => sum + g.minutes, 0)
  const totalScreenMins = screenEntries.reduce((sum, e) => sum + e.minutes, 0)
  const totalScreenPenalty = screenTimePenaltyPts(totalScreenMins)
  const rawScore        = summary ? summary.total_earned - totalGapMinutes - totalScreenPenalty : 0
  const adjustedEarned  = rawScore  // may be negative
  const adjustedPct     = summary?.total_max > 0 ? Math.max(0, (rawScore / summary.total_max) * 100) : 0

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
          <div>
            <span className="text-sm lg:text-base text-gray-300">Total Score</span>
            {(totalGapMinutes > 0 || totalScreenPenalty > 0) && (
              <div className="text-xs text-red-400 mt-1 space-y-0.5">
                {totalGapMinutes > 0 && (
                  <div>{summary.total_earned.toFixed(1)} earned − {totalGapMinutes} min unutilized</div>
                )}
                {totalScreenPenalty > 0 && (
                  <div>− {totalScreenPenalty} pts screen time penalty</div>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            <span className={`text-2xl lg:text-4xl font-bold tabular-nums ${adjustedEarned < 0 ? 'text-red-400' : 'text-white'}`}>{adjustedEarned.toFixed(1)}</span>
            <span className="text-gray-500 text-sm lg:text-base"> / {summary.total_max}</span>
            <div className="text-xs lg:text-sm text-gray-400 mt-0.5">{adjustedPct.toFixed(0)}% of max</div>
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
                onQuickRegister={() => handleQuickRegister(habit.id)}
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
            {(() => {
              // Boolean tasks may only appear once per day — exclude them once added.
              // Duration/time/no_rule tasks remain pickable for multiple time blocks.
              const addedBooleanIds = new Set(
                taskEntries
                  .filter(te => (te.todo_scoring_type || 'boolean') === 'boolean')
                  .map(te => te.todo_id)
              )
              const pickerTodos = pendingTodos.filter(todo =>
                todo.scoring_type !== 'boolean' || !addedBooleanIds.has(todo.id)
              )
              return pickerTodos.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-2">
                  No pending tasks. Add some in the <strong>Tasks</strong> tab.
                </p>
              ) : (
                pickerTodos.map(todo => (
                  <button key={todo.id} onClick={() => pickTodo(todo)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors text-left">
                    <span className="text-sm text-white">{todo.title}</span>
                    {todo.max_points > 0
                      ? <span className="text-xs text-gray-500 ml-2">{todo.max_points} pts</span>
                      : todo.scoring_type === 'time_multiplier' && todo.multiplier != null
                        ? <span className="text-xs text-gray-500 ml-2">{todo.multiplier / 100}×</span>
                        : null}
                  </button>
                ))
              )
            })()}
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
                const isDuration  = scoringType === 'duration'    || scoringType === 'duration_linear' || scoringType === 'no_rule' || scoringType === 'time_multiplier'
                const isBoolean   = !isTimeOnly && !isDuration
                const isDone      = te.start_time != null || te.duration_minutes != null
                const isTemp      = typeof te.id === 'string' && te.id.startsWith('temp-')
                const INPUT_CLS   = 'bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500'

                return (
                <div key={te.id}
                  className="px-4 py-3 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">

                  {/* ── Boolean ── toggle button */}
                  {isBoolean && (
                    <div className="flex items-center gap-3">
                      <div className="flex flex-1 items-center gap-2 min-w-0">
                        <span className="text-sm lg:text-base font-medium text-white truncate">{te.todo_title}</span>
                        {(savingTask[te.id] || isTemp) && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                      </div>
                      <button
                        onClick={() => handleTaskFieldChange(te, 'start_time', isDone ? '' : dayjs().format('HH:mm'))}
                        disabled={isTemp}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                          isDone
                            ? 'bg-emerald-900 text-emerald-300 hover:bg-emerald-800'
                            : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white border border-dashed border-gray-700'
                        } ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {isDone ? '✓ Done' : 'Mark done'}
                      </button>
                      <div className="text-sm flex-shrink-0"><ScoreBadge earned={te.earned_points} max={te.todo_max_points} /></div>
                      <button onClick={() => removeTaskEntry(te)} disabled={isTemp}
                        className={`text-gray-600 hover:text-red-400 transition-colors text-sm font-bold flex-shrink-0 ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`} title="Remove from today">✕</button>
                    </div>
                  )}

                  {/* ── Time of day ── single time input */}
                  {isTimeOnly && (
                    <div className="flex items-center gap-3">
                      <div className="flex flex-1 items-center gap-2 min-w-0">
                        <span className="text-sm lg:text-base font-medium text-white truncate">{te.todo_title}</span>
                        {(savingTask[te.id] || isTemp) && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                      </div>
                      <span className="text-xs text-gray-500 flex-shrink-0">Time</span>
                      <input type="time" value={te.start_time || ''}
                        disabled={isTemp}
                        onChange={e => handleTaskFieldChange(te, 'start_time', e.target.value)}
                        className={`${INPUT_CLS} w-[90px] lg:w-[110px] flex-shrink-0 ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`} />
                      <div className="text-sm flex-shrink-0"><ScoreBadge earned={te.earned_points} max={te.todo_max_points} /></div>
                      <button onClick={() => removeTaskEntry(te)} disabled={isTemp}
                        className={`text-gray-600 hover:text-red-400 transition-colors text-sm font-bold flex-shrink-0 ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`} title="Remove from today">✕</button>
                    </div>
                  )}

                  {/* ── Duration ── start / end / mins */}
                  {isDuration && (
                    <>
                      {/* Mobile: name + score top row, inputs bottom row */}
                      <div className="flex items-center justify-between mb-2 sm:hidden">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm lg:text-base font-medium text-white truncate">{te.todo_title}</span>
                          {(savingTask[te.id] || isTemp) && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <div className="text-sm"><ScoreBadge earned={te.earned_points} max={te.todo_max_points} /></div>
                          <button onClick={() => handleQuickRegisterTask(te)} disabled={isTemp}
                            className={`text-gray-500 hover:text-yellow-400 transition-colors text-sm flex-shrink-0 ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`} title="Quick register: prev end → now">⚡</button>
                          <button onClick={() => removeTaskEntry(te)} disabled={isTemp}
                            className={`text-gray-600 hover:text-red-400 transition-colors text-sm font-bold ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`} title="Remove from today">✕</button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="hidden sm:flex flex-1 items-center gap-2 min-w-0">
                          <span className="text-sm lg:text-base font-medium text-white truncate">{te.todo_title}</span>
                          {(savingTask[te.id] || isTemp) && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                        </div>
                        <input type="time" value={te.start_time || ''}
                          disabled={isTemp}
                          onChange={e => handleTaskFieldChange(te, 'start_time', e.target.value)}
                          className={`${INPUT_CLS} flex-1 sm:flex-none sm:w-[90px] lg:w-[110px] ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`} />
                        <input type="time" value={te.end_time || ''}
                          disabled={isTemp}
                          onChange={e => handleTaskFieldChange(te, 'end_time', e.target.value)}
                          className={`${INPUT_CLS} flex-1 sm:flex-none sm:w-[90px] lg:w-[110px] ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`} />
                        <input type="number" min="0" value={te.duration_minutes ?? ''}
                          disabled={isTemp}
                          onChange={e => handleTaskFieldChange(te, 'duration_minutes', e.target.value)}
                          onBlur={e => {
                            if (!e.target.value && te.start_time && te.end_time) {
                              const diff = timeToMinutes(te.end_time) - timeToMinutes(te.start_time)
                              if (diff > 0) handleTaskFieldChange(te, 'duration_minutes', String(diff))
                            }
                          }}
                          placeholder="mins" className={`${INPUT_CLS} w-16 lg:w-24 text-center ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`} />
                        <div className="hidden sm:block text-sm flex-shrink-0"><ScoreBadge earned={te.earned_points} max={te.todo_max_points} /></div>
                        <button onClick={() => handleQuickRegisterTask(te)} disabled={isTemp}
                          className={`hidden sm:block text-gray-500 hover:text-yellow-400 transition-colors text-sm flex-shrink-0 ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`} title="Quick register: prev end → now">⚡</button>
                        <button onClick={() => removeTaskEntry(te)} disabled={isTemp}
                          className={`hidden sm:block text-gray-600 hover:text-red-400 transition-colors text-sm font-bold flex-shrink-0 ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`} title="Remove from today">✕</button>
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

      {/* Unutilized Time */}
      {gaps.length > 0 && (
        <div>
          <h3 className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
            Unutilized Time
          </h3>
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            {gaps.map((gap, i) => (
              <div key={i} className="px-4 py-3 border-b border-gray-800/50 last:border-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white tabular-nums">{gap.start} → {gap.end}</span>
                  <span className="text-xs text-gray-500">{gap.minutes} min</span>
                </div>
                <span className="text-sm font-medium text-red-400 tabular-nums">−{gap.minutes} pts</span>
              </div>
            ))}
            {gaps.length > 1 && (
              <div className="px-4 py-3 flex items-center justify-between bg-gray-800/40 border-t border-gray-800">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Total deduction</span>
                <span className="text-sm font-semibold text-red-400 tabular-nums">−{totalGapMinutes} pts</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Screen Time */}
      <div>
        <h3 className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Screen Time</h3>
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          {screenEntries.length === 0 ? (
            <div className="px-4 py-4 text-center text-gray-600 text-xs">No screen time logged today</div>
          ) : (
            <>
              {screenEntries.map(se => (
                editingScreen.id === se.id ? (
                  /* ── inline edit row ── */
                  <div key={se.id} onBlur={handleEditScreenBlur}
                    className="px-4 py-3 border-b border-gray-800/50 last:border-0 flex items-center gap-2 flex-wrap">
                    <input type="time" value={editingScreen.start_time}
                      onChange={e => setEditingScreen(prev => ({ ...prev, start_time: e.target.value }))}
                      className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 w-[90px]" />
                    <span className="text-xs text-gray-600">→</span>
                    <input type="time" value={editingScreen.end_time}
                      onChange={e => setEditingScreen(prev => ({ ...prev, end_time: e.target.value }))}
                      className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 w-[90px]" />
                    <input type="text" value={editingScreen.note}
                      onChange={e => setEditingScreen(prev => ({ ...prev, note: e.target.value }))}
                      placeholder="note (optional)" maxLength={200}
                      className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 flex-1 min-w-[80px]" />
                    <button onClick={cancelEditScreen}
                      className="text-gray-600 hover:text-gray-300 transition-colors text-sm font-bold flex-shrink-0" title="Cancel">✕</button>
                  </div>
                ) : (
                  /* ── read-only row ── */
                  <div key={se.id} className="px-4 py-3 border-b border-gray-800/50 last:border-0 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm text-white tabular-nums flex-shrink-0">
                        {se.start_time.slice(0,5)} → {se.end_time.slice(0,5)}
                      </span>
                      <span className="text-xs text-gray-500 flex-shrink-0">{se.minutes} min</span>
                      {se.note && <span className="text-xs text-gray-500 truncate">{se.note}</span>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-medium text-red-400 tabular-nums">−{screenTimePenaltyPts(se.minutes)} pts</span>
                      <button onClick={() => startEditScreen(se)}
                        className="text-gray-600 hover:text-orange-400 transition-colors text-xs" title="Edit">✎</button>
                      <button onClick={() => handleDeleteScreenTime(se.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors text-sm font-bold" title="Remove">✕</button>
                    </div>
                  </div>
                )
              ))}
              {screenEntries.length > 0 && (
                <div className="px-4 py-3 flex items-center justify-between bg-gray-800/40 border-t border-gray-800">
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Total penalty</span>
                  <span className="text-sm font-semibold text-red-400 tabular-nums">−{totalScreenPenalty} pts</span>
                </div>
              )}
            </>
          )}

          {/* Manual entry row — saves when focus leaves the row (so note can be filled first) */}
          <div onBlur={handleScreenRowBlur}
            className="px-4 py-3 border-t border-gray-800/60 flex items-center gap-2 flex-wrap">
            <input
              type="time"
              value={screenForm.start_time}
              onChange={e => setScreenForm(prev => ({ ...prev, start_time: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500 w-[90px]"
            />
            <span className="text-xs text-gray-600">→</span>
            <input
              type="time"
              value={screenForm.end_time}
              onChange={e => setScreenForm(prev => ({ ...prev, end_time: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500 w-[90px]"
            />
            <input
              type="text"
              value={screenForm.note}
              onChange={e => setScreenForm(prev => ({ ...prev, note: e.target.value }))}
              placeholder="note (optional)"
              maxLength={200}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500 flex-1 min-w-[80px]"
            />
            <button onClick={handleQuickRegisterScreenTime}
              className="text-gray-500 hover:text-yellow-400 transition-colors text-sm flex-shrink-0" title="Quick register: prev end → now">⚡</button>
            {screenSaving && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />}
          </div>
        </div>
      </div>

    </div>
  )
}
