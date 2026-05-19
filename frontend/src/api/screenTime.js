/**
 * api/screenTime.js — screen-time penalty entries.
 *
 * Penalty rate: -2 pts per wasted minute (double the gap penalty).
 * Each entry requires start_time + end_time; minutes is server-derived.
 */
import { api } from './base'

/** Fetch all screen-time entries for a given date (YYYY-MM-DD). */
export const getScreenTime = (date) => api.get(`/screen-time/${date}`).then(r => r.data)

/** Log a new wasted screen-time session.
 *  data: { entry_date, start_time, end_time, note? } */
export const addScreenTime = (data) => api.post('/screen-time', data).then(r => r.data)

/** Update an existing screen-time entry.
 *  data: { entry_date, start_time, end_time, note? } */
export const updateScreenTime = (id, data) => api.put(`/screen-time/${id}`, data).then(r => r.data)

/** Delete a screen-time entry by id. */
export const deleteScreenTime = (id) => api.delete(`/screen-time/${id}`).then(r => r.data)

/** Penalty points for a given number of minutes (2 × minutes). */
export const screenTimePenaltyPts = (minutes) => minutes * 2
