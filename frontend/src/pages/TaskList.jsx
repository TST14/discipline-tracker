/**
 * TaskList.jsx — "Tasks" tab
 *
 * Manage to-do items: add, filter by status, mark done/skip/reopen, delete.
 */
import { useEffect, useState, useRef } from 'react'
import { getTodos, createTodo, updateTodo, deleteTodo, reorderTodos, getTodoScoringRules, setTodoScoringRules } from '../api/todos'

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

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-yellow-900 text-yellow-300',   dot: 'bg-yellow-400' },
  done:    { label: 'Done',    color: 'bg-emerald-900 text-emerald-300', dot: 'bg-emerald-400' },
  skipped: { label: 'Skipped', color: 'bg-gray-800 text-gray-500',       dot: 'bg-gray-600' },
}

const FILTERS = ['all', 'pending', 'done', 'skipped']

const STATUS_ORDER = { pending: 0, done: 1, skipped: 2 }

// Format "2026-05-16" → "16 May" (same year) or "16 May 2026" (different year)
function formatDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const label = `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}`
  return new Date().getFullYear() === y ? label : `${label} ${y}`
}

// ─── TodoRulesEditor ──────────────────────────────────────────────────────────

function TodoRulesEditor({ todo, onClose }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getTodoScoringRules(todo.id)
      .then(r => {
        if (r.length === 0 && todo.scoring_type === 'time_multiplier') {
          setRules([{ id: null, todo_id: todo.id, condition: 'gte', value: '1', percentage: 100, rule_order: 0 }])
        } else {
          setRules(r)
        }
        setLoading(false)
      })
      .catch(() => { setError('Failed to load rules'); setLoading(false) })
  }, [todo.id])

  const containerRef = useRef(null)
  useEffect(() => {
    const t = setTimeout(() => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - Math.max(0, (window.innerHeight - rect.height) / 2)), behavior: 'smooth' })
    }, 150)
    return () => clearTimeout(t)
  }, [])
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
      await setTodoScoringRules(todo.id, rules.map((r, i) => ({ ...r, rule_order: i, percentage: parseInt(r.percentage, 10) || 0 })))
      onClose()
    } catch {
      setError('Failed to save rules.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-4 text-center text-gray-500 text-sm">Loading…</div>

  const isLinear = todo.scoring_type === 'time_of_day_linear' || todo.scoring_type === 'duration_linear'
  const isDurationLinear = todo.scoring_type === 'duration_linear'

  return (
    <div ref={containerRef} className="mt-4 bg-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">
          Scoring Rules — <span className="text-gray-400 font-normal">{todo.title}</span>
        </h3>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-sm">✕</button>
      </div>

      {todo.scoring_type === 'boolean' && (
        <p className="text-xs text-gray-500 italic">
          Boolean tasks don't need rules — full points are awarded if any time or duration is logged.
        </p>
      )}

      {todo.scoring_type === 'no_rule' && (
        <p className="text-xs text-gray-500 italic">
          No Rule tasks don't need rules — full points are always awarded whenever this task is logged, regardless of duration or time.
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
            onClick={() => setRules(prev => [...prev, { id: null, todo_id: todo.id, condition: 'bp', value: isDurationLinear ? '30' : '06:00', percentage: 50, rule_order: prev.length }])}
            className="text-xs text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 w-full transition-colors"
          >
            + Add Breakpoint
          </button>
        </>
      )}

      {!isLinear && todo.scoring_type !== 'boolean' && todo.scoring_type !== 'no_rule' && todo.scoring_type !== 'time_multiplier' && (
        <>
          <p className="text-xs text-gray-500">
            Rules are evaluated top-to-bottom. The first matching rule determines the score %.
            {todo.scoring_type === 'time_of_day' && ' Values are in HH:MM (24h).'}
            {todo.scoring_type === 'duration' && ' Values are in minutes.'}
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 font-medium px-1 sm:grid-cols-[1fr_1fr_80px_32px]">
            <span>Condition</span>
            <span>{todo.scoring_type === 'duration' ? 'Minutes' : 'Time (HH:MM)'}</span>
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
                type={todo.scoring_type === 'time_of_day' ? 'time' : 'text'}
                inputMode={todo.scoring_type === 'time_of_day' ? undefined : 'numeric'}
                pattern={todo.scoring_type === 'time_of_day' ? undefined : '[0-9]*'}
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
            onClick={() => setRules(prev => [...prev, { id: null, todo_id: todo.id, condition: 'lte', value: todo.scoring_type === 'time_of_day' ? '04:00' : '30', percentage: 100, rule_order: prev.length }])}
            className="text-xs text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 w-full transition-colors"
          >
            + Add Rule
          </button>
        </>
      )}

      {todo.scoring_type === 'time_multiplier' && (
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
                  setRules([{ id: null, todo_id: todo.id, condition: 'gte', value: '1', percentage: pct, rule_order: 0 }])
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
        {todo.scoring_type === 'boolean' || todo.scoring_type === 'no_rule' ? (
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

function EditTodoForm({ todo, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: todo.title,
    description: todo.description || '',
    max_points: String(todo.max_points),
    scoring_type: todo.scoring_type || 'boolean',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const formRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => {
      const el = formRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - Math.max(0, (window.innerHeight - rect.height) / 2)), behavior: 'smooth' })
    }, 150)
    return () => clearTimeout(t)
  }, [])

  const submit = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    try {
      await onSave(todo.id, { ...form, max_points: parseInt(form.max_points, 10) || 0 })
    } catch {
      setError('Failed to save.')
      setSaving(false)
    }
  }

  return (
    <div ref={formRef} className="bg-gray-800 border border-gray-600 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">Edit Task</h3>
      <input type="text" placeholder="Task title" value={form.title}
        onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500" />
      <textarea placeholder="Description (optional)" value={form.description}
        onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
        rows={2}
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500 resize-none" />
      <div className="grid grid-cols-2 gap-3">
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
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

function AddTodoForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ title: '', description: '', max_points: '0', scoring_type: 'boolean' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    try {
      await onSave({ ...form, max_points: parseInt(form.max_points, 10) || 0 })
    } catch {
      setError('Failed to save.')
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">New Task</h3>
      <input type="text" placeholder="Task title" value={form.title}
        onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500" />
      <textarea placeholder="Description (optional)" value={form.description}
        onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
        rows={2}
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500 resize-none" />
      <div className="grid grid-cols-2 gap-3">
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
          {saving ? 'Saving…' : 'Add Task'}
        </button>
      </div>
    </div>
  )
}

export default function TaskList() {
  const [todos, setTodos] = useState([])   // full list, always unfiltered
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingTodo, setEditingTodo] = useState(null)
  const [rulesTodo, setRulesTodo] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState(null)
  const [scrollToId, setScrollToId] = useState(null)
  const newItemRef = useRef(null)

  // today's date string YYYY-MM-DD in LOCAL time — must match Python's date.today() on the server
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  // active  = pending (any date) + done/skipped closed TODAY
  // history = done/skipped closed on a PREVIOUS day
  const isActive = (t) =>
    t.status === 'pending' || t.status_changed_date === today
  const getActive    = () => todos.filter(t =>  isActive(t))
  const getHistorical = () => todos.filter(t => !isActive(t))

  // drag-and-drop
  const dragIdx        = useRef(null)
  const touchTargetIdx = useRef(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  const load = async () => {
    try {
      setError(null)
      setTodos(await getTodos())
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

  const handleCreate = async (form) => {
    try {
      const saved = await createTodo(form)
      setShowForm(false)
      await load()
      if (saved.scoring_type !== 'boolean' && saved.scoring_type !== 'no_rule') {
        setRulesTodo(saved)
      } else {
        setScrollToId(saved.id)
      }
    } catch {
      setError('Failed to create task.')
    }
  }

  const handleEdit = async (id, form) => {
    try {
      const saved = await updateTodo(id, form)
      setEditingTodo(null)
      await load()
      if (saved.scoring_type !== 'boolean' && saved.scoring_type !== 'no_rule') setRulesTodo(saved)
    } catch {
      setError('Failed to update task.')
    }
  }

  const handleStatus = async (todo, status) => {
    try {
      await updateTodo(todo.id, { status })
      await load()
    } catch {
      setError('Failed to update status.')
    }
  }

  const handleDelete = async (todo) => {
    if (!window.confirm(`Delete "${todo.title}"?`)) return
    try {
      await deleteTodo(todo.id)
      await load()
    } catch {
      setError('Failed to delete.')
    }
  }

  // Reorder operates only on the active list; historical todos are unaffected.
  const moveTodo = async (idx, direction) => {
    const target = idx + direction
    if (target < 0 || target >= filteredTodos.length) return
    const swapped = [...filteredTodos]
    ;[swapped[idx], swapped[target]] = [swapped[target], swapped[idx]]
    setTodos([...swapped, ...getHistorical()])
    try {
      await reorderTodos(swapped.map(t => t.id))
    } catch {
      setError('Failed to reorder tasks.')
      await load()
    }
  }

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
    const reordered = [...filteredTodos]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(idx, 0, moved)
    setTodos([...reordered, ...getHistorical()])
    try {
      await reorderTodos(reordered.map(t => t.id))
    } catch {
      setError('Failed to reorder tasks.')
      await load()
    }
  }
  const handleDragEnd = () => {
    dragIdx.current = null
    setDragOverIdx(null)
  }

  // ── touch drag-and-drop (mobile) ──────────────────────────────────────────
  const touchStartPos = useRef(null)
  const isDragging    = useRef(false)

  const handleTouchStart = (e, idx) => {
    dragIdx.current = idx
    isDragging.current = false
    touchTargetIdx.current = null
    touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const handleTouchMove = (e) => {
    if (dragIdx.current === null) return
    const touch = e.touches[0]
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
    const from        = dragIdx.current
    const to          = touchTargetIdx.current
    const wasDragging = isDragging.current
    dragIdx.current = null
    touchTargetIdx.current = null
    isDragging.current = false
    touchStartPos.current = null
    setDragOverIdx(null)
    if (!wasDragging || from === null || to === null || from === to) return
    const reordered = [...filteredTodos]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    setTodos([...reordered, ...getHistorical()])
    try {
      await reorderTodos(reordered.map(t => t.id))
    } catch {
      setError('Failed to reorder tasks.')
      await load()
    }
  }

  const activeTodos     = getActive()
  const historicalTodos = getHistorical()
  const filteredTodos   = filter === 'all'
    ? [...activeTodos].sort((a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0))
    : activeTodos.filter(t => t.status === filter)
  const counts = activeTodos.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc }, {})

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base lg:text-xl font-semibold text-white">Tasks</h2>
        <button onClick={() => setShowForm(true)}
          className="px-3 py-1.5 text-sm bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors">
          + New Task
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {showForm && <AddTodoForm onSave={handleCreate} onCancel={() => setShowForm(false)} />}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
              filter === f ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'
            }`}>
            {f}
            {f !== 'all' && counts[f] ? <span className="ml-1.5 opacity-70">{counts[f]}</span> : null}
          </button>
        ))}
      </div>

      {/* Today's task list */}
      <div className="bg-gray-900 rounded-xl overflow-hidden">
        {filteredTodos.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">
            {filter === 'all' ? 'No tasks yet. Click + New Task to add one.' : `No ${filter} tasks today.`}
          </div>
        ) : (
          filteredTodos.map((todo, idx) => {
            const cfg = STATUS_CONFIG[todo.status] || STATUS_CONFIG.pending
            const scoringBadge = SCORING_TYPE_BADGE[todo.scoring_type] || SCORING_TYPE_BADGE.boolean
            const showReorder = filter === 'all'
            const isDropTarget = showReorder && dragOverIdx === idx
            const isEditing = editingTodo?.id === todo.id
            const showRules = rulesTodo?.id === todo.id
            const isExpanded = isEditing || showRules
            if (isEditing) return (
              <div key={todo.id} className="border-b border-gray-800/50 last:border-0 px-4 lg:px-6 py-3">
                <EditTodoForm
                  todo={editingTodo}
                  onSave={handleEdit}
                  onCancel={() => setEditingTodo(null)}
                />
              </div>
            )
            return (
              <div key={todo.id}
                ref={scrollToId === todo.id ? newItemRef : null}
                data-drag-idx={idx}
                draggable={showReorder && !isExpanded}
                onDragStart={showReorder ? (e) => handleDragStart(e, idx) : undefined}
                onDragOver={showReorder  ? (e) => handleDragOver(e, idx)  : undefined}
                onDrop={showReorder      ? (e) => handleDrop(e, idx)      : undefined}
                onDragEnd={showReorder   ? handleDragEnd                  : undefined}
                onTouchMove={showReorder  ? handleTouchMove                 : undefined}
                onTouchEnd={showReorder   ? handleTouchEnd                  : undefined}
                className={`transition-colors
                  ${isDropTarget
                    ? 'border-t-2 border-t-blue-500 bg-blue-950/20'
                    : 'border-b border-gray-800/50 last:border-0'
                  }
                  ${todo.status === 'skipped' ? 'opacity-50' : ''}
                `}>

                <div className="px-4 lg:px-6 py-3 lg:py-4">
                  {/* Top row: drag handle + dot + content (+ desktop-only buttons) */}
                  <div className="flex items-start gap-3">
                    {showReorder && (
                      <div
                        className="flex flex-col items-center gap-0.5 flex-shrink-0 select-none mt-0.5"
                        onTouchStart={(e) => handleTouchStart(e, idx)}
                        style={{ touchAction: 'none' }}
                      >
                        <span title="Drag to reorder"
                          className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing text-base leading-none mb-0.5">
                          ⠿
                        </span>
                        <button onClick={() => moveTodo(idx, -1)} disabled={idx === 0}
                          title="Move up"
                          className="text-gray-600 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed leading-none text-xs transition-colors">▲</button>
                        <button onClick={() => moveTodo(idx, 1)} disabled={idx === filteredTodos.length - 1}
                          title="Move down"
                          className="text-gray-600 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed leading-none text-xs transition-colors">▼</button>
                      </div>
                    )}

                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm lg:text-base font-medium ${todo.status === 'done' ? 'line-through text-gray-400' : todo.status === 'skipped' ? 'line-through text-gray-400' : 'text-white'}`}>
                        {todo.title}
                      </p>
                      {todo.description && <p className="text-xs lg:text-sm text-gray-400 mt-0.5 truncate">{todo.description}</p>}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${scoringBadge.color}`}>{scoringBadge.label}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.color}`}>{cfg.label}</span>
                        {todo.max_points > 0
                          ? <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">{todo.max_points} pts</span>
                          : todo.scoring_type === 'time_multiplier' && todo.multiplier != null
                            ? <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-900 text-cyan-300">{todo.multiplier / 100}×</span>
                            : null}
                      </div>
                    </div>

                    {/* Desktop-only: compact icon buttons on the right */}
                    <div className="hidden lg:flex items-center gap-1 flex-shrink-0">
                      {todo.status !== 'done' && (
                        <button onClick={() => handleStatus(todo, 'done')} title="Mark done"
                          className="px-2 py-1 text-xs text-gray-400 hover:text-emerald-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">✓</button>
                      )}
                      {todo.status !== 'pending' && (
                        <button onClick={() => handleStatus(todo, 'pending')} title="Move back to pending"
                          className="px-2 py-1 text-xs text-gray-400 hover:text-yellow-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">↩</button>
                      )}
                      {todo.status === 'pending' && (
                        <button onClick={() => handleStatus(todo, 'skipped')} title="Skip"
                          className="px-2 py-1 text-xs text-gray-400 hover:text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">–</button>
                      )}
                      <button
                        onClick={() => setRulesTodo(showRules ? null : todo)}
                        title="Scoring rules"
                        className={`px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors ${showRules ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
                        Rules
                      </button>
                      <button onClick={() => setEditingTodo(todo)} title="Edit task"
                        className="px-2 py-1 text-xs text-gray-400 hover:text-blue-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-9 9A2 2 0 016 16H4a1 1 0 01-1-1v-2a2 2 0 01.586-1.414l9-9z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(todo)}
                        className="px-2 py-1 text-xs text-gray-400 hover:text-red-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">✕</button>
                    </div>
                  </div>

                  {/* Mobile-only: full-width labelled action strip */}
                  <div className="flex lg:hidden items-center gap-1.5 mt-2.5 pt-2 border-t border-gray-800/60">
                    {todo.status !== 'done' && (
                      <button onClick={() => handleStatus(todo, 'done')}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium text-emerald-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                        <span>✓</span><span>Done</span>
                      </button>
                    )}
                    {todo.status !== 'pending' && (
                      <button onClick={() => handleStatus(todo, 'pending')}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium text-yellow-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                        <span>↩</span><span>Reopen</span>
                      </button>
                    )}
                    {todo.status === 'pending' && (
                      <button onClick={() => handleStatus(todo, 'skipped')}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                        <span>–</span><span>Skip</span>
                      </button>
                    )}
                    <button
                      onClick={() => setRulesTodo(showRules ? null : todo)}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors ${showRules ? 'text-white font-medium' : 'text-gray-400'}`}>
                      <span>⚙</span><span>Rules</span>
                    </button>
                    <button onClick={() => setEditingTodo(todo)}
                      className="flex-1 flex items-center justify-center py-1.5 text-xs text-gray-400 hover:text-blue-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-9 9A2 2 0 016 16H4a1 1 0 01-1-1v-2a2 2 0 01.586-1.414l9-9z" />
                      </svg>
                    </button>
                    <button onClick={() => handleDelete(todo)}
                      className="flex items-center justify-center px-3 py-1.5 text-xs text-gray-400 hover:text-red-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                      ✕
                    </button>
                  </div>
                </div>

                {showRules && (
                  <div className="px-4 lg:px-6 pb-4">
                    <TodoRulesEditor todo={todo} onClose={() => setRulesTodo(null)} />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Previous days archive */}
      {historicalTodos.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full text-left py-1">
            <span className={`transition-transform ${showHistory ? 'rotate-90' : ''}`}>▶</span>
            Previous days
            <span className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded text-xs">{historicalTodos.length}</span>
          </button>

          {showHistory && (
            <div className="bg-gray-900 rounded-xl overflow-hidden mt-2">
              {historicalTodos.map(todo => {
                const cfg = STATUS_CONFIG[todo.status] || STATUS_CONFIG.pending
                const isEditing = editingTodo?.id === todo.id
                const showRules = rulesTodo?.id === todo.id
                if (isEditing) return (
                  <div key={todo.id} className="border-b border-gray-800/50 last:border-0 px-4 lg:px-6 py-3">
                    <EditTodoForm todo={editingTodo} onSave={handleEdit} onCancel={() => setEditingTodo(null)} />
                  </div>
                )
                return (
                  <div key={todo.id} className="border-b border-gray-800/40 last:border-0 hover:bg-gray-800/20 transition-colors">
                    <div className="flex items-start gap-3 px-4 lg:px-6 py-3">
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 opacity-40 ${cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm lg:text-base font-medium text-gray-400 line-through">{todo.title}</p>
                        {todo.description && <p className="text-xs lg:text-sm text-gray-500 mt-0.5 truncate">{todo.description}</p>}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium opacity-60 ${cfg.color}`}>{cfg.label}</span>
                          {todo.max_points > 0
                            ? <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">{todo.max_points} pts</span>
                            : todo.scoring_type === 'time_multiplier' && todo.multiplier != null
                              ? <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-900 text-cyan-300 opacity-60">{todo.multiplier / 100}×</span>
                              : null}
                          {todo.status_changed_date && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 flex items-center gap-1">
                              📅 {formatDate(todo.status_changed_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => handleStatus(todo, 'pending')} title="Re-open as pending"
                          className="px-2 py-1 text-xs text-gray-500 hover:text-yellow-400 bg-gray-800/60 hover:bg-gray-700 rounded-lg transition-colors">↩</button>
                        <button onClick={() => setEditingTodo(todo)} title="Edit task"
                          className="px-2 py-1 text-xs text-gray-500 hover:text-blue-400 bg-gray-800/60 hover:bg-gray-700 rounded-lg transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-9 9A2 2 0 016 16H4a1 1 0 01-1-1v-2a2 2 0 01.586-1.414l9-9z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(todo)}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-red-400 bg-gray-800/60 hover:bg-gray-700 rounded-lg transition-colors">✕</button>
                      </div>
                    </div>
                    {showRules && (
                      <div className="px-4 lg:px-6 pb-4">
                        <TodoRulesEditor todo={todo} onClose={() => setRulesTodo(null)} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
