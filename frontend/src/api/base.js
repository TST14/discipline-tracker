import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Unwrap FastAPI validation/error messages from the response body so callers
// always get a plain Error with a human-readable message string.
api.interceptors.response.use(
  (response) => response,
  (error) => {
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
