import { api } from './base'

export const getHabits = (activeOnly = true) =>
  api.get('/habits', { params: { active_only: activeOnly } }).then(r => r.data)

export const createHabit = (data) =>
  api.post('/habits', data).then(r => r.data)

export const updateHabit = (id, data) =>
  api.put(`/habits/${id}`, data).then(r => r.data)

export const deleteHabit = (id) =>
  api.delete(`/habits/${id}`).then(r => r.data)

export const reorderHabits = (orderedIds) =>
  api.put('/habits/reorder', { ordered_ids: orderedIds }).then(r => r.data)

export const getScoringRules = (habitId) =>
  api.get(`/habits/${habitId}/rules`).then(r => r.data)

export const setScoringRules = (habitId, rules) =>
  api.put(`/habits/${habitId}/rules`, rules).then(r => r.data)
