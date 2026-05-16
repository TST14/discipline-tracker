import { useEffect, useState } from 'react'
import { getTodos, createTodo, updateTodo, deleteTodo } from '../api/client'

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  color: 'bg-yellow-900 text-yellow-300', dot: 'bg-yellow-400' },
  done:     { label: 'Done',     color: 'bg-emerald-900 text-emerald-300', dot: 'bg-emerald-400' },
  skipped:  { label: 'Skipped', color: 'bg-gray-800 text-gray-500', dot: 'bg-gray-600' },
}

const FILTERS = ['all', 'pending', 'done', 'skipped']

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

      <input
        type="text"
        placeholder="Task title"
        value={form.title}
        onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500"
      />
      <textarea
        placeholder="Description (optional)"
        value={form.description}
        onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
        rows={2}
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500 resize-none"
      />
      <div>
        <label className="block text-xs text-gray-500 mb-1">Max Points (0 = untracked)</label>
        <input
          type="number"
          min="0"
          value={form.max_points}
          onChange={e => setForm(p => ({ ...p, max_points: parseInt(e.target.value, 10) || 0 }))}
          className="w-32 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="px-4 py-2 text-sm bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Add Task'}
        </button>
      </div>
    </div>
  )
}

export default function TodoList() {
  const [todos, setTodos] = useState([])
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    try {
      setError(null)
      const data = await getTodos(filter === 'all' ? null : filter)
      setTodos(data)
    } catch {
      setError('Could not connect to backend.')
    }
  }

  useEffect(() => { load() }, [filter])

  const handleCreate = async (form) => {
    await createTodo(form)
    setShowForm(false)
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

  const counts = todos.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Tasks</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 text-sm bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors"
        >
          + New Task
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {showForm && <AddTodoForm onSave={handleCreate} onCancel={() => setShowForm(false)} />}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
              filter === f ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'
            }`}
          >
            {f}
            {f !== 'all' && counts[f] ? (
              <span className="ml-1.5 opacity-70">{counts[f]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Todo list */}
      <div className="bg-gray-900 rounded-xl overflow-hidden">
        {todos.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">
            {filter === 'all'
              ? 'No tasks yet. Click + New Task to add one.'
              : `No ${filter} tasks.`}
          </div>
        ) : (
          todos.map(todo => {
            const cfg = STATUS_CONFIG[todo.status] || STATUS_CONFIG.pending
            return (
              <div
                key={todo.id}
                className={`flex items-start gap-3 px-4 py-3 border-b border-gray-800/50 last:border-0 ${
                  todo.status === 'skipped' ? 'opacity-50' : ''
                }`}
              >
                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cfg.dot}`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${todo.status === 'done' ? 'line-through text-gray-500' : 'text-white'}`}>
                    {todo.title}
                  </p>
                  {todo.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{todo.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    {todo.max_points > 0 && (
                      <span className="text-xs text-gray-600">{todo.max_points} pts</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {todo.status !== 'done' && (
                    <button
                      onClick={() => handleStatus(todo, 'done')}
                      title="Mark done"
                      className="px-2 py-1 text-xs text-gray-400 hover:text-emerald-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      ✓
                    </button>
                  )}
                  {todo.status !== 'pending' && (
                    <button
                      onClick={() => handleStatus(todo, 'pending')}
                      title="Move back to pending"
                      className="px-2 py-1 text-xs text-gray-400 hover:text-yellow-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      ↩
                    </button>
                  )}
                  {todo.status === 'pending' && (
                    <button
                      onClick={() => handleStatus(todo, 'skipped')}
                      title="Skip"
                      className="px-2 py-1 text-xs text-gray-400 hover:text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      –
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(todo)}
                    className="px-2 py-1 text-xs text-gray-600 hover:text-red-400 bg-gray-800 hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
