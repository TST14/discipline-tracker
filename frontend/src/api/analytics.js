/**
 * api/analytics.js — Weekly and monthly analytics endpoints.
 *
 * getWeeklyAnalytics(date)          — GET /analytics/weekly?date=
 *   7-day breakdown for the Mon–Sun week containing `date`.
 *
 * getMonthlyAnalytics(year, month)  — GET /analytics/monthly?year=&month=
 *   Full-month breakdown.
 *
 * Both return: { days[], habits[], todos[], summary }
 * Each day includes: total_earned, total_max, percentage, gap_minutes,
 *                    adjusted_earned, adjusted_percentage,
 *                    habit_scores[], task_scores[]
 */
import { api } from './base'

export const getWeeklyAnalytics = (date) =>
  api.get('/analytics/weekly', { params: { date } }).then(r => r.data)

export const getMonthlyAnalytics = (year, month) =>
  api.get('/analytics/monthly', { params: { year, month } }).then(r => r.data)
