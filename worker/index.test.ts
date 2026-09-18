import { describe, expect, it } from 'vitest'
import app from './index'

const env = { DB: {} as D1Database }

describe('Worker API contract & Security', () => {
  it('reports service health with security headers', async () => {
    const response = await app.request('/api/health', {}, env)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok', service: 'cell-ministry-api' })
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-request-id')).toBeTruthy()
  })

  it('protects private endpoints without auth cookie', async () => {
    const endpoints = [
      '/api/dashboard',
      '/api/cells',
      '/api/people',
      '/api/classes',
      '/api/follow-ups',
      '/api/meetings',
      '/api/reports',
      '/api/map',
      '/api/calendar',
      '/api/transfers',
      '/api/leadership-assignments',
      '/api/multiplications',
      '/api/insights',
      '/api/resources',
      '/api/notifications',
      '/api/users',
      '/api/standards',
    ]

    for (const endpoint of endpoints) {
      const response = await app.request(endpoint, {}, env)
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({ error: 'Authentication required' })
    }
  })

  it('rejects invalid login payloads', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'short' }),
    }, env)
    expect(res.status).toBe(400)
  })

  it('returns structured JSON 404 for unknown endpoints', async () => {
    const response = await app.request('/api/does-not-exist', {}, env)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })
})


