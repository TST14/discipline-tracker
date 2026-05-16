import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ── Habits ──────────────────────────────────────────────────────────────────
export const getHabits = (activeOnly = true) => api.get('/habits', { params: { active_only: activeOnly } }).then(r => r.data)
export const createHabit = (data) => api.post('/habits', data).then(r => r.data)
export const updateHabit = (id, data) => api.put(`/habits/${id}`, data).then(r => r.data)
export const deleteHabit = (id) => api.delete(`/habits/${id}`).then(r => r.data)
export const reorderHabits = (orderedIds) => api.put('/habits/reorder', { ordered_ids: orderedIds }).then(r => r.data)

// ── Scoring Rules ────────────────────────────────────────────────────────────
export const getScoringRules = (habitId) => api.get(`/habits/${habitId}/rules`).then(r => r.data)
export const setScoringRules = (habitId, rules) => api.put(`/habits/${habitId}/rules`, rules).then(r => r.data)

// ── Daily Entries ─────────────────────────────────────────────────────────────
export const getEntries = (date) => api.get('/entries', { params: { date } }).then(r => r.data)
export const upsertEntry = (data) => api.post('/entries', data).then(r => r.data)
export const deleteEntry = (id) => api.delete(`/entries/${id}`).then(r => r.data)
export const getDailySummary = (date) => api.get('/entries/summary', { params: { date } }).then(r => r.data)

// ── Todos ─────────────────────────────────────────────────────────────────────
export const getTodos = (status) => api.get('/todos', { params: status ? { status } : {} }).then(r => r.data)
export const createTodo = (data) => api.post('/todos', data).then(r => r.data)
export const updateTodo = (id, data) => api.put(`/todos/${id}`, data).then(r => r.data)
export const deleteTodo = (id) => api.delete(`/todos/${id}`).then(r => r.data)

// ── Daily Task Entries ────────────────────────────────────────────────────────
export const getTaskEntries = (date) => api.get('/todos/entries', { params: { date } }).then(r => r.data)
export const upsertTaskEntry = (data) => api.post('/todos/entries', data).then(r => r.data)
export const deleteTaskEntry = (id) => api.delete(`/todos/entries/${id}`).then(r => r.data)
