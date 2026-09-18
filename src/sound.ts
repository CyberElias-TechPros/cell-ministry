// Elegant synthesized sound engine using Web Audio API for tactile agency feedback
class SoundEngine {
  private ctx: AudioContext | null = null
  private enabled = true

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nexus_sound_enabled')
      if (stored !== null) this.enabled = stored === 'true'
    }
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null
    try {
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (AudioCtx) this.ctx = new AudioCtx()
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => undefined)
      }
      return this.ctx
    } catch {
      return null
    }
  }

  public isEnabled(): boolean {
    return this.enabled
  }

  public setEnabled(val: boolean) {
    this.enabled = val
    if (typeof window !== 'undefined') {
      localStorage.setItem('nexus_sound_enabled', String(val))
    }
  }

  // Soft tactile click for switches and tabs
  public click() {
    const ctx = this.getContext()
    if (!ctx) return
    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(800, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + 0.04)
      gain.gain.setValueAtTime(0.04, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.05)
    } catch {
      // ignore
    }
  }

  // Harmonic chord chime for celebrations (cell created, multiplied, report approved)
  public success() {
    const ctx = this.getContext()
    if (!ctx) return
    try {
      const notes = [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.04)
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.04)
        gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + i * 0.04 + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.04 + 0.35)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(ctx.currentTime + i * 0.04)
        osc.stop(ctx.currentTime + i * 0.04 + 0.4)
      })
    } catch {
      // ignore
    }
  }

  // Warm chime for navigation or drawer open
  public pop() {
    const ctx = this.getContext()
    if (!ctx) return
    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08)
      gain.gain.setValueAtTime(0.03, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.09)
    } catch {
      // ignore
    }
  }
}

export const sound = new SoundEngine()
