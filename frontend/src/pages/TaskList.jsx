/**
 * TaskList.jsx — "Tasks" tab
 *
 * Manage to-do items: add, filter by status, mark done/skip/reopen, delete.
 */
import { useEffect, useState, useRef } from 'react'
import { getTodos, createTodo, updateTodo, deleteTodo, reorderTodos } from '../api/todos'

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-yellow-900 text-yellow-300',   dot: 'bg-yellow-400' },
  done:    { label: 'Done',    color: 'bg-emerald-900 text-emerald-300', dot: 'bg-emerald-400' },
  skipped: { label: 'Skipped', color: 'bg-gray-800 text-gray-500',       dot: 'bg-gray-600' },
}

const FILTERS = ['all', 'pending', 'done', 'skipped']

function EditTodoForm({ todo, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: todo.title,
    description: todo.description || '',
    max_points: todo.max_points,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    try {
      await onSave(todo.id, form)
    } catch {
      setError('Failed to save.')
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">Edit Task</h3>
      <input type="text" placeholder="Task title" value={form.title}
        onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500" />
      <textarea placeholder="Description (optional)" value={form.description}
        onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
        rows={2}
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500 resize-none" />
      <div>
        <label className="block text-xs text-gray-400 mb-1">Max Points (0 = untracked)</label>
        <input type="number" min="0" value={form.max_points}
          onChange={e => setForm(p => ({ ...p, max_points: parseInt(e.target.value, 10) || 0 }))}
          className="w-32 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500" />
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
  const [form, setForm] = useState({ title: '', description: '', max_points: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    try {
      await onSave(form)
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
      <div>
        <label className="block text-xs text-gray-400 mb-1">Max Points (0 = untracked)</label>
        <input type="number" min="0" value={form.max_points}
          onChange={e => setForm(p => ({ ...p, max_points: parseInt(e.target.value, 10) || 0 }))}
          className="w-32 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500" />
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
  const [error, setError] = useState(null)

  // drag-and-drop
  const dragIdx        = useRef(null)
  const touchTargetIdx = useRef(null)  // drop target index for touch DnD
  const [dragOverIdx, setDragOverIdx] = useState(null)

  const load = async () => {
    try {
      setError(null)
      setTodos(await getTodos())  // always load all — filter client-side
    } catch {
      setError('Could not connect to backend.')
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (form) => {
    await createTodo(form)
    setShowForm(false)
    await load()
  }

  const handleEdit = async (id, form) => {
    await updateTodo(id, form)
    setEditingTodo(null)
    await load()
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

  const moveTodo = async (idx, direction) => {
    const swapped = [...todos]
    const target = idx + direction
    if (target < 0 || target >= swapped.length) return
    ;[swapped[idx], swapped[target]] = [swapped[target], swapped[idx]]
    setTodos(swapped)
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
    const reordered = [...todos]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(idx, 0, moved)
    setTodos(reordered)
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
  const touchStartPos = useRef(null)  // {x, y} at touchstart
  const isDragging    = useRef(false)  // true once finger moves > threshold

  const handleTouchStart = (e, idx) => {
    dragIdx.current = idx
    isDragging.current = false
    touchTargetIdx.current = null
    touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const handleTouchMove = (e) => {
    if (dragIdx.current === null) return
    const touch = e.touches[0]
    // Only activate drag mode once finger moves more than 10 px
    // — this lets button taps complete without triggering a reorder.
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
    const reordered = [...todos]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    setTodos(reordered)
    try {
      await reorderTodos(reordered.map(t => t.id))
    } catch {
      setError('Failed to reorder tasks.')
      await load()
    }
  }

  const filteredTodos = filter === 'all' ? todos : todos.filter(t => t.status === filter)
  const counts = todos.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc }, {})

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

      {/* Task list */}
      <div className="bg-gray-900 rounded-xl overflow-hidden">
        {filteredTodos.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">
            {filter === 'all' ? 'No tasks yet. Click + New Task to add one.' : `No ${filter} tasks.`}
          </div>
        ) : (
          filteredTodos.map((todo, idx) => {
            const cfg = STATUS_CONFIG[todo.status] || STATUS_CONFIG.pending
            const showReorder = filter === 'all'
            const isDropTarget = showReorder && dragOverIdx === idx
            const isEditing = editingTodo?.id === todo.id
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
                data-drag-idx={idx}
                draggable={showReorder}
                onDragStart={showReorder ? (e) => handleDragStart(e, idx) : undefined}
                onDragOver={showReorder  ? (e) => handleDragOver(e, idx)  : undefined}
                onDrop={showReorder      ? (e) => handleDrop(e, idx)      : undefined}
                onDragEnd={showReorder   ? handleDragEnd                  : undefined}
                onTouchStart={showReorder ? (e) => handleTouchStart(e, idx) : undefined}
                onTouchMove={showReorder  ? handleTouchMove                 : undefined}
                onTouchEnd={showReorder   ? handleTouchEnd                  : undefined}
                style={showReorder ? { touchAction: 'none' } : undefined}
                className={`flex items-start gap-3 px-4 lg:px-6 py-3 lg:py-4 transition-colors
                  ${isDropTarget
                    ? 'border-t-2 border-t-blue-500 bg-blue-950/20'
                    : 'border-b border-gray-800/50 last:border-0'
                  }
                  ${todo.status === 'skipped' ? 'opacity-50' : ''}
                `}>

                {/* Drag handle + reorder buttons — only in 'all' view */}
                {showReorder && (
                  <div className="flex flex-col items-center gap-0.5 flex-shrink-0 select-none mt-0.5">
                    <span title="Drag to reorder"
                      className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing text-base leading-none mb-0.5">
                      ⠿
                    </span>
                    <button onClick={() => moveTodo(idx, -1)} disabled={idx === 0}
                      title="Move up"
                      className="text-gray-600 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed leading-none text-xs transition-colors">▲</button>
                    <button onClick={() => moveTodo(idx, 1)} disabled={idx === todos.length - 1}
                      title="Move down"
                      className="text-gray-600 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed leading-none text-xs transition-colors">▼</button>
                  </div>
                )}

                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${todo.status === 'done' ? 'line-through text-gray-500' : 'text-white'}`}>
                    {todo.title}
                  </p>
                  {todo.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{todo.description}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.color}`}>{cfg.label}</span>
                    {todo.max_points > 0 && <span className="text-xs text-gray-400">{todo.max_points} pts</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
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
                  <button onClick={() => setEditingTodo(todo)} title="Edit task"
                    className="px-2 py-1 text-xs text-gray-400 hover:text-blue-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-9 9A2 2 0 016 16H4a1 1 0 01-1-1v-2a2 2 0 01.586-1.414l9-9z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(todo)}
                    className="px-2 py-1 text-xs text-gray-400 hover:text-red-400 bg-gray-800 hover:bg-gray-800 rounded-lg transition-colors">✕</button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
