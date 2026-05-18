/**
 * api/base.js — Axios instance shared by all API modules.
 *
 * Base URL is read from VITE_API_URL env var (defaults to http://localhost:8000).
 * The response interceptor unwraps FastAPI error payloads so every rejected
 * promise rejects with a plain Error whose .message is human-readable.
 */
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach stored JWT to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('dt_token')
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// Unwrap FastAPI validation/error messages from the response body so callers
// always get a plain Error with a human-readable message string.
// Also clear the token and reload on 401 so the login screen appears.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('dt_token')
      window.location.reload()
      return new Promise(() => {}) // suspend the chain while reloading
    }
    const detail = error.response?.data?.detail
    let message
    if (Array.isArray(detail)) {
      // Pydantic validation errors: [{loc, msg, type}, ...]
      message = detail.map((e) => e.msg).join('; ')
    } else if (typeof detail === 'string') {
      message = detail
    } else {
      message = error.message || 'Request failed'
    }
    return Promise.reject(new Error(message))
  }
)
