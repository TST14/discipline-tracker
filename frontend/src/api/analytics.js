import { api } from './base'

export const getWeeklyAnalytics = (date) =>
  api.get('/analytics/weekly', { params: { date } }).then(r => r.data)

export const getMonthlyAnalytics = (year, month) =>
  api.get('/analytics/monthly', { params: { year, month } }).then(r => r.data)
