/**
 * api/entries.js — Daily habit entry endpoints.
 *
 * getEntries(date)      — GET  /entries?date=
 * upsertEntry(data)     — POST /entries
 * deleteEntry(id)       — DELETE /entries/:id
 * getDailySummary(date) — GET  /entries/summary  (total earned/max/percentage)
 */
import { api } from './base'

export const getEntries = (date) =>
  api.get('/entries', { params: { date } }).then(r => r.data)

export const upsertEntry = (data) =>
  api.post('/entries', data).then(r => r.data)

export const deleteEntry = (id) =>
  api.delete(`/entries/${id}`).then(r => r.data)

export const getDailySummary = (date) =>
  api.get('/entries/summary', { params: { date } }).then(r => r.data)
