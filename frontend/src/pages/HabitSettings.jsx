/**
 * HabitSettings.jsx — "Configure" tab
 *
 * Manages habits (CRUD) and their scoring rules.
 */
import { useEffect, useState, useRef } from 'react'
import {
  getHabits, createHabit, updateHabit, deleteHabit, reorderHabits,
  getScoringRules, setScoringRules,
} from '../api/habits'

const SCORING_TYPES = [
  { value: 'boolean',            label: 'Boolean (done / not done)' },
  { value: 'no_rule',            label: 'No Rule (always 100%)' },
  { value: 'duration',           label: 'Duration (step rules)' },
  { value: 'duration_linear',    label: 'Duration (linear — smooth per minute)' },
  { value: 'time_of_day',        label: 'Time of Day (step rules)' },
  { value: 'time_of_day_linear', label: 'Time of Day (linear — smooth per minute)' },
  { value: 'time_multiplier',    label: 'Time Multiplier (×mins spent)' },
]

const CONDITION_LABELS = {
  lte: '≤ (at most)',
  gte: '≥ (at least)',
  lt:  '< (less than)',
  gt:  '> (more than)',
  eq:  '= (exactly)',
}

const SCORING_TYPE_BADGE = {
  boolean:            { label: 'Boolean',          color: 'bg-blue-900 text-blue-300' },
  no_rule:            { label: 'No Rule',           color: 'bg-teal-900 text-teal-300' },
  duration:           { label: 'Duration (step)',   color: 'bg-purple-900 text-purple-300' },
  duration_linear:    { label: 'Duration (linear)', color: 'bg-violet-900 text-violet-300' },
  time_of_day:        { label: 'Time (step)',       color: 'bg-amber-900 text-amber-300' },
  time_of_day_linear: { label: 'Time (linear)',     color: 'bg-orange-900 text-orange-300' },
  time_multiplier:    { label: 'Time ×Mult',        color: 'bg-cyan-900 text-cyan-300' },
}

// ─── RulesEditor ─────────────────────────────────────────────────────────────

function RulesEditor({ habit, onClose }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getScoringRules(habit.id)
      .then(r => {
        if (r.length === 0 && habit.scoring_type === 'time_multiplier') {
          setRules([{ id: null, habit_id: habit.id, condition: 'gte', value: '1', percentage: 100, rule_order: 0 }])
        } else {
          setRules(r)
        }
        setLoading(false)
      })
      .catch(() => { setError('Failed to load rules'); setLoading(false) })
  }, [habit.id])

  const containerRef = useRef(null)
  const scrolledRef = useRef(false)
  useEffect(() => {
    // Wait until the rules have loaded — containerRef is null during the
    // loading early-return, so scrolling before that is a no-op on Vercel.
    if (loading || scrolledRef.current) return
    scrolledRef.current = true
    const t = setTimeout(() => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - Math.max(0, (window.innerHeight - rect.height) / 2)), behavior: 'smooth' })
    }, 50)
    return () => clearTimeout(t)
  }, [loading])
  useEffect(() => {
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('click', handleOutside)
    return () => {
      document.removeEventListener('click', handleOutside)
    }
  }, [onClose])

  const updateRule = (idx, field, val) =>
    setRules(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r))

  const removeRule = (idx) =>
    setRules(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, rule_order: i })))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await setScoringRules(habit.id, rules.map((r, i) => ({ ...r, rule_order: i, percentage: parseInt(r.percentage, 10) || 0 })))
      onClose()
    } catch {
      setError('Failed to save rules.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-4 text-center text-gray-500 text-sm">Loading…</div>

  const isLinear = habit.scoring_type === 'time_of_day_linear' || habit.scoring_type === 'duration_linear'
  const isDurationLinear = habit.scoring_type === 'duration_linear'

  return (
    <div ref={containerRef} className="mt-4 bg-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">
          Scoring Rules — <span className="text-gray-400 font-normal">{habit.name}</span>
        </h3>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-sm">✕</button>
      </div>

      {habit.scoring_type === 'boolean' && (
        <p className="text-xs text-gray-500 italic">
          Boolean habits don't need rules — full points are awarded if any time or duration is logged.
        </p>
      )}

      {habit.scoring_type === 'no_rule' && (
        <p className="text-xs text-gray-500 italic">
          No Rule habits don't need rules — full points are always awarded whenever this habit is logged, regardless of duration or time.
        </p>
      )}

      {isLinear && (
        <>
          <p className="text-xs text-gray-500">
            Define breakpoints with a score % at each point.
            Points between breakpoints are <strong className="text-gray-300">linearly interpolated</strong>.
            {isDurationLinear ? ' Values are in minutes.' : ' Times are in HH:MM (24h).'}
            {' '}Values outside the range clamp to the nearest breakpoint.
          </p>
          <div className="grid grid-cols-[120px_100px_32px] gap-2 text-xs text-gray-500 font-medium px-1">
            <span>{isDurationLinear ? 'Minutes' : 'Time'}</span><span>Score %</span><span />
          </div>
          {rules.map((rule, idx) => (
            <div key={idx} className="grid grid-cols-[120px_100px_32px] gap-2 items-center">
              <input
                type={isDurationLinear ? 'text' : 'time'}
                inputMode={isDurationLinear ? 'numeric' : undefined}
                pattern={isDurationLinear ? '[0-9]*' : undefined}
                value={rule.value}
                onChange={e => updateRule(idx, 'value', e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
              <div className="relative">
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  value={rule.percentage}
                  onChange={e => updateRule(idx, 'percentage', e.target.value.replace(/[^0-9]/g, ''))}
                  className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500 w-full pr-5"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
              </div>
              <button onClick={() => removeRule(idx)} className="text-gray-400 hover:text-red-400 transition-colors text-sm font-bold">✕</button>
            </div>
          ))}
          <button
            onClick={() => setRules(prev => [...prev, { id: null, habit_id: habit.id, condition: 'bp', value: isDurationLinear ? '30' : '06:00', percentage: 50, rule_order: prev.length }])}
            className="text-xs text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 w-full transition-colors"
          >
            + Add Breakpoint
          </button>
        </>
      )}

      {!isLinear && habit.scoring_type !== 'boolean' && habit.scoring_type !== 'no_rule' && habit.scoring_type !== 'time_multiplier' && (
        <>
          <p className="text-xs text-gray-500">
            Rules are evaluated top-to-bottom. The first matching rule determines the score %.
            {habit.scoring_type === 'time_of_day' && ' Values are in HH:MM (24h).'}
            {habit.scoring_type === 'duration' && ' Values are in minutes.'}
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 font-medium px-1 sm:grid-cols-[1fr_1fr_80px_32px]">
            <span>Condition</span>
            <span>{habit.scoring_type === 'duration' ? 'Minutes' : 'Time (HH:MM)'}</span>
            <span>Score %</span>
            <span />
          </div>
          {rules.map((rule, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-2 items-center sm:grid-cols-[1fr_1fr_80px_32px]">
              <select value={rule.condition} onChange={e => updateRule(idx, 'condition', e.target.value)}
                className="min-w-0 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500">
                {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input
                type={habit.scoring_type === 'time_of_day' ? 'time' : 'text'}
                inputMode={habit.scoring_type === 'time_of_day' ? undefined : 'numeric'}
                pattern={habit.scoring_type === 'time_of_day' ? undefined : '[0-9]*'}
                value={rule.value}
                onChange={e => updateRule(idx, 'value', e.target.value)}
                className="min-w-0 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
              <div className="relative">
                <input type="text" inputMode="numeric" pattern="[0-9]*" value={rule.percentage}
                  onChange={e => updateRule(idx, 'percentage', e.target.value.replace(/[^0-9]/g, ''))}
                  className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500 w-full pr-5" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
              </div>
              <button onClick={() => removeRule(idx)} className="text-gray-400 hover:text-red-400 transition-colors text-sm font-bold">✕</button>
            </div>
          ))}
          <button
            onClick={() => setRules(prev => [...prev, { id: null, habit_id: habit.id, condition: 'lte', value: habit.scoring_type === 'time_of_day' ? '04:00' : '30', percentage: 100, rule_order: prev.length }])}
            className="text-xs text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 w-full transition-colors"
          >
            + Add Rule
          </button>
        </>
      )}

      {habit.scoring_type === 'time_multiplier' && (
        <>
          <p className="text-xs text-gray-500">
            Points = multiplier × minutes logged.
            {' '}Set Max Points {'>'} 0 to cap the score, or 0 for no cap.
          </p>
          <div className="flex items-center gap-3 py-1">
            <span className="text-xs text-gray-400 flex-shrink-0">Multiplier</span>
            <select
              value={rules[0]?.percentage ?? 100}
              onChange={e => {
                const pct = Number(e.target.value)
                if (rules.length === 0) {
                  setRules([{ id: null, habit_id: habit.id, condition: 'gte', value: '1', percentage: pct, rule_order: 0 }])
                } else {
                  updateRule(0, 'percentage', pct)
                }
              }}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500"
            >
              <option value={50}>0.5×</option>
              <option value={100}>1×</option>
              <option value={150}>1.5×</option>
              <option value={200}>2×</option>
              <option value={300}>3×</option>
            </select>
            <span className="text-xs text-gray-500">× minutes spent</span>
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        {habit.scoring_type === 'boolean' || habit.scoring_type === 'no_rule' ? (
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Close</button>
        ) : (
          <>
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
            <button onClick={save} disabled={saving}
              className="px-4 py-2 text-sm bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Rules'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── HabitForm ───────────────────────────────────────────────────────────────

function HabitForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(
    initial
      ? { ...initial, max_points: String(initial.max_points) }
      : { name: '', max_points: '10', scoring_type: 'boolean', display_order: 0, is_active: true }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const formRef = useRef(null)

  useEffect(() => {
    if (!initial) return  // new-habit form is already visible at top — no scroll needed
    const t = setTimeout(() => {
      const el = formRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - Math.max(0, (window.innerHeight - rect.height) / 2)), behavior: 'smooth' })
    }, 150)
    return () => clearTimeout(t)
  }, [])

  const submit = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave({ ...form, max_points: parseInt(form.max_points, 10) || 0 })
    } catch {
      setError('Failed to save habit.')
      setSaving(false)
    }
  }

  return (
    // draggable={false} + onDragStart stop prevents the parent draggable row from
    // intercepting touch-taps inside inputs on mobile, which would block cursor placement.
    <div
      ref={formRef}
      className="bg-gray-800 rounded-xl p-4 space-y-3"
      draggable={false}
      onDragStart={e => e.stopPropagation()}
    >
      <h3 className="text-sm font-semibold text-white">{initial ? 'Edit Habit' : 'New Habit'}</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-gray-400 mb-1">Name</label>
          <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Meditation"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Max Points (0 = untracked)</label>
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={form.max_points}
            onChange={e => {
              const raw = e.target.value.replace(/[^0-9]/g, '')
              setForm(p => ({ ...p, max_points: raw === '' ? '' : String(parseInt(raw, 10)) }))
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Scoring Type</label>
          <select value={form.scoring_type} onChange={e => setForm(p => ({ ...p, scoring_type: e.target.value }))}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500">
            {SCORING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
        <button onClick={submit} disabled={saving}
          className="px-4 py-2 text-sm bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : (initial ? 'Update' : 'Add Habit')}
        </button>
      </div>
    </div>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function HabitSettings() {
  const [habits, setHabits] = useState([])
  const [editingHabit, setEditingHabit] = useState(null)  // habit | 'new' | null
  const [newHabitFormState, setNewHabitFormState] = useState(null)
  const [rulesHabit, setRulesHabit] = useState(null)
  const [error, setError] = useState(null)
  const [scrollToId, setScrollToId] = useState(null)
  const newItemRef = useRef(null)

  const load = async () => {
    try {
      setError(null)
      setHabits(await getHabits(false))  // load ALL habits including inactive
    } catch {
      setError('Could not connect to backend.')
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!scrollToId) return
    const t = setTimeout(() => {
      const el = newItemRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - Math.max(0, (window.innerHeight - rect.height) / 2)), behavior: 'smooth' })
      }
      setScrollToId(null)
    }, 150)
    return () => clearTimeout(t)
  }, [scrollToId])

  const handleSave = async (form) => {
    const originalHabits = [...habits]
    const isNew = editingHabit === 'new'
    const tempId = `temp-${Date.now()}`
    
    if (isNew) {
      const tempHabit = {
        id: tempId,
        name: form.name,
        max_points: parseInt(form.max_points, 10) || 0,
        scoring_type: form.scoring_type || 'boolean',
        is_active: true,
        display_order: habits.length,
      }
      setHabits(prev => [...prev, tempHabit])
      setNewHabitFormState(form)
    } else {
      setHabits(prev => prev.map(h => h.id === editingHabit.id ? { ...h, ...form } : h))
    }
    
    const originalEditingHabit = editingHabit
    setEditingHabit(null)
    
    try {
      const saved = isNew
        ? await createHabit({ ...form, display_order: habits.length })
        : await updateHabit(originalEditingHabit.id, form)
      
      if (isNew) {
        setHabits(prev => prev.map(h => h.id === tempId ? saved : h))
        setNewHabitFormState(null)
      } else {
        setHabits(prev => prev.map(h => h.id === originalEditingHabit.id ? saved : h))
      }
      
      if (saved.scoring_type !== 'boolean' && saved.scoring_type !== 'no_rule') {
        setRulesHabit(saved)
      } else if (isNew) {
        setScrollToId(saved.id)
      }
      load()
    } catch {
      setError('Failed to save habit.')
      setHabits(originalHabits)
      setEditingHabit(originalEditingHabit)
    }
  }

  const handleDelete = async (habit) => {
    if (habit.is_active) return  // guard: must be disabled first
    if (!window.confirm(`Delete "${habit.name}"? All entries for this habit will also be deleted.`)) return
    const originalHabits = [...habits]
    setHabits(prev => prev.filter(h => h.id !== habit.id))
    try {
      await deleteHabit(habit.id)
      load()
    } catch {
      setError('Failed to delete habit.')
      setHabits(originalHabits)
    }
  }

  const toggleActive = async (habit) => {
    const originalHabits = [...habits]
    setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, is_active: !h.is_active } : h))
    try {
      await updateHabit(habit.id, { ...habit, is_active: !habit.is_active })
      load()
    } catch {
      setError('Failed to update habit.')
      setHabits(originalHabits)
    }
  }

  const moveHabit = async (idx, direction) => {
    const swapped = [...habits]
    const target = idx + direction
    if (target < 0 || target >= swapped.length) return
    ;[swapped[idx], swapped[target]] = [swapped[target], swapped[idx]]
    setHabits(swapped)
    try {
      await reorderHabits(swapped.map(h => h.id))
    } catch {
      setError('Failed to reorder habits.')
      await load()
    }
  }

  // ── drag-and-drop reorder ─────────────────────────────────────────────────
  // Mouse DnD: handlers on the whole row (draggable attribute).
  // Touch DnD:  handlers scoped to the ⠿ drag handle only — keeps the rest of
  //             the row scrollable on mobile (see touch handlers on the span).
  const dragIdx        = useRef(null)
  const touchTargetIdx = useRef(null)  // drop target row index for touch DnD
  const [dragOverIdx, setDragOverIdx] = useState(null)

  const handleDragStart = (e, idx) => {
    dragIdx.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e, idx) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragIdx.current !== idx) setDragOverIdx(idx)
  }
  const handleDrop = async (e, idx) => {
    e.preventDefault()
    const from = dragIdx.current
    dragIdx.current = null
    setDragOverIdx(null)
    if (from === null || from === idx) return
    const reordered = [...habits]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(idx, 0, moved)
    setHabits(reordered)
    try {
      await reorderHabits(reordered.map(h => h.id))
    } catch {
      setError('Failed to reorder habits.')
      await load()
    }
  }
  const handleDragEnd = () => {
    dragIdx.current = null
    setDragOverIdx(null)
  }

  // ── touch drag-and-drop (mobile, handle-only) ─────────────────────────────
  // These handlers are attached only to the ⠿ span, NOT the row, so that a
  // normal swipe anywhere else on the row scrolls the page as expected.
  const touchStartPos = useRef(null)  // {x, y} recorded at touchstart
  const isDragging    = useRef(false)  // true once finger exceeds movement threshold

  const handleTouchStart = (e, idx) => {
    dragIdx.current   = idx
    isDragging.current = false
    touchTargetIdx.current = null
    touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const handleTouchMove = (e) => {
    if (dragIdx.current === null) return
    const touch = e.touches[0]
    // Only activate drag mode once the finger moves more than 10 px.
    // Prevents an accidental short press on the handle from triggering a reorder.
    if (!isDragging.current) {
      const dx = Math.abs(touch.clientX - touchStartPos.current.x)
      const dy = Math.abs(touch.clientY - touchStartPos.current.y)
      if (dx < 10 && dy < 10) return
      isDragging.current = true
    }
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const draggableEl = el?.closest('[data-drag-idx]')
    if (draggableEl) {
      const overIdx = Number(draggableEl.dataset.dragIdx)
      touchTargetIdx.current = overIdx
      if (overIdx !== dragIdx.current) setDragOverIdx(overIdx)
    }
  }
  const handleTouchEnd = async () => {
    const from       = dragIdx.current
    const to         = touchTargetIdx.current
    const wasDragging = isDragging.current
    dragIdx.current = null
    touchTargetIdx.current = null
    isDragging.current = false
    touchStartPos.current = null
    setDragOverIdx(null)
    if (!wasDragging || from === null || to === null || from === to) return
    const reordered = [...habits]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    setHabits(reordered)
    try {
      await reorderHabits(reordered.map(h => h.id))
    } catch {
      setError('Failed to reorder habits.')
      await load()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base lg:text-xl font-semibold text-white">Habits</h2>
        <button onClick={() => setEditingHabit('new')}
          className="px-3 py-1.5 text-sm bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors">
          + Add Habit
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {editingHabit === 'new' && (
        <HabitForm
          initial={newHabitFormState}
          onSave={handleSave}
          onCancel={() => {
            setEditingHabit(null)
            setNewHabitFormState(null)
          }}
        />
      )}

      <div className="bg-gray-900 rounded-xl overflow-hidden">
        {habits.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">
            No habits yet. Click <strong>+ Add Habit</strong> to get started.
          </div>
        ) : (
          habits.map((habit, idx) => {
            const badge = SCORING_TYPE_BADGE[habit.scoring_type] || SCORING_TYPE_BADGE.boolean
            const isDropTarget = dragOverIdx === idx
            // Disable drag on the row while it has an open edit form or rules panel —
            // a draggable parent intercepts touch-taps in child inputs on mobile,
            // preventing cursor placement inside text fields.
            const isExpanded = (editingHabit && editingHabit !== 'new' && editingHabit.id === habit.id)
                             || rulesHabit?.id === habit.id
            const isTemp = typeof habit.id === 'string' && habit.id.startsWith('temp-')
            const actionButtons = (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setRulesHabit(rulesHabit?.id === habit.id ? null : habit)}
                  disabled={isTemp}
                  className={`px-2.5 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  Rules
                </button>
                <button
                  onClick={() => setEditingHabit(habit)}
                  disabled={isTemp}
                  className={`px-2.5 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(habit)}
                  disabled={habit.is_active || isTemp}
                  title={habit.is_active ? 'Disable the habit first to delete it' : 'Delete habit'}
                  className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                    habit.is_active || isTemp
                      ? 'text-gray-700 bg-gray-800 cursor-not-allowed'
                      : 'text-gray-400 hover:text-red-400 bg-gray-800 hover:bg-gray-700'
                  }`}>
                  Delete
                </button>
              </div>
            )
            return (
              <div
                key={habit.id}
                ref={scrollToId === habit.id ? newItemRef : null}
                data-drag-idx={idx}
                draggable={!isExpanded}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e)  => handleDragOver(e, idx)}
                onDrop={(e)      => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                className={`transition-colors
                  ${isDropTarget
                    ? 'border-t-2 border-t-blue-500 bg-blue-950/20'
                    : 'border-b border-gray-800/50 last:border-0'
                  }
                  ${!habit.is_active ? 'opacity-50' : ''}
                `}
              >
                <div className="flex items-center gap-3 px-4 lg:px-6 py-3 lg:py-4">

                  {/* Drag handle + reorder buttons */}
                  <div className="flex flex-col items-center gap-0.5 flex-shrink-0 select-none">
                    {/*
                      Touch handlers live here (not on the row) so the rest of
                      the row remains scrollable on mobile. touchAction:'none' is
                      required on this element to let the browser hand touch
                      events to React instead of treating them as scroll gestures.
                    */}
                    <span
                      title="Drag to reorder"
                      onTouchStart={(e) => handleTouchStart(e, idx)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      style={{ touchAction: 'none' }}
                      className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing text-base leading-none mb-0.5"
                    >
                      ⠿
                    </span>
                    <button
                      onClick={() => moveHabit(idx, -1)}
                      disabled={idx === 0}
                      title="Move up"
                      className="text-gray-600 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed leading-none text-xs transition-colors">
                      ▲
                    </button>
                    <button
                      onClick={() => moveHabit(idx, 1)}
                      disabled={idx === habits.length - 1}
                      title="Move down"
                      className="text-gray-600 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed leading-none text-xs transition-colors">
                      ▼
                    </button>
                  </div>

                  {/* Active toggle */}
                  <button
                    onClick={() => toggleActive(habit)}
                    disabled={isTemp}
                    className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${habit.is_active ? 'bg-emerald-500' : 'bg-gray-700'} ${isTemp ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title={habit.is_active ? 'Active — click to disable' : 'Disabled — click to enable'}
                  >
                    <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${habit.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>

                  {/* Name + badge + mobile actions */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm lg:text-base font-medium text-white truncate">{habit.name}</span>
                      {isTemp && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${badge.color}`}>{badge.label}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {habit.max_points > 0
                        ? `Max ${habit.max_points} pts`
                        : habit.scoring_type === 'time_multiplier' && habit.multiplier != null
                          ? `${habit.multiplier / 100}\u00d7`
                          : null}
                    </div>
                    {/* Actions shown below name on mobile */}
                    <div className="sm:hidden mt-2">{actionButtons}</div>
                  </div>

                  {/* Actions — desktop only (sm+) */}
                  <div className="hidden sm:block">{actionButtons}</div>
                </div>

                {editingHabit && editingHabit !== 'new' && editingHabit.id === habit.id && (
                  <div className="px-4 pb-4">
                    <HabitForm initial={editingHabit} onSave={handleSave} onCancel={() => setEditingHabit(null)} />
                  </div>
                )}

                {rulesHabit?.id === habit.id && (
                  <div className="px-4 pb-4">
                    <RulesEditor habit={habit} onClose={() => setRulesHabit(null)} />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
