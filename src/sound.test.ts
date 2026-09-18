import { describe, expect, it } from 'vitest'
import { sound } from './sound'

describe('Sound Engine Tactile Feedback', () => {
  it('allows toggling audio feedback', () => {
    expect(typeof sound.isEnabled()).toBe('boolean')
    sound.setEnabled(false)
    expect(sound.isEnabled()).toBe(false)
    sound.setEnabled(true)
    expect(sound.isEnabled()).toBe(true)
  })

  it('invokes sound methods without throwing in headless environments', () => {
    expect(() => {
      sound.click()
      sound.pop()
      sound.success()
    }).not.toThrow()
  })
})
