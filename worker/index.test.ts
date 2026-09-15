import {describe,expect,it} from 'vitest'
import app from './index'

const env={DB:{} as D1Database}

describe('Worker contract',()=>{
  it('reports service health',async()=>{
    const response=await app.request('/api/health',{},env)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({status:'ok',service:'cell-ministry-api'})
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
  it('protects private endpoints',async()=>{
    const response=await app.request('/api/dashboard',{},env)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({error:'Authentication required'})
  })
  it('returns a JSON 404 contract',async()=>{
    const response=await app.request('/api/does-not-exist',{},env)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({error:'Not found'})
  })
})
