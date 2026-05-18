/**
 * api/todos.js — Todo CRUD, scoring-rule, and daily task-entry endpoints.
 *
 * getTodos(status?)            — GET  /todos  (optionally filter by status)
 * createTodo(data)             — POST /todos
 * updateTodo(id, data)         — PUT  /todos/:id  (partial update)
 * deleteTodo(id)               — DELETE /todos/:id
 * reorderTodos(orderedIds)     — PUT  /todos/reorder
 * getTodoScoringRules(todoId)  — GET  /todos/:id/rules
 * setTodoScoringRules(id, [])  — PUT  /todos/:id/rules  (full replace)
 * getTaskEntries(date)         — GET  /todos/entries?date=
 * upsertTaskEntry(data)        — POST /todos/entries
 * deleteTaskEntry(id)          — DELETE /todos/entries/:id
 */
import { api } from './base'

export const getTodos = (status) =>
  api.get('/todos', { params: status ? { status } : {} }).then(r => r.data)

export const createTodo = (data) =>
  api.post('/todos', data).then(r => r.data)

export const updateTodo = (id, data) =>
  api.put(`/todos/${id}`, data).then(r => r.data)

export const deleteTodo = (id) =>
  api.delete(`/todos/${id}`).then(r => r.data)

export const reorderTodos = (orderedIds) =>
  api.put('/todos/reorder', { ordered_ids: orderedIds }).then(r => r.data)

export const getTodoScoringRules = (todoId) =>
  api.get(`/todos/${todoId}/rules`).then(r => r.data)

export const setTodoScoringRules = (todoId, rules) =>
  api.put(`/todos/${todoId}/rules`, rules).then(r => r.data)

export const getTaskEntries = (date) =>
  api.get('/todos/entries', { params: { date } }).then(r => r.data)

export const upsertTaskEntry = (data) =>
  api.post('/todos/entries', data).then(r => r.data)

export const deleteTaskEntry = (id) =>
  api.delete(`/todos/entries/${id}`).then(r => r.data)
