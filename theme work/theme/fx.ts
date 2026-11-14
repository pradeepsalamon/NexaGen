import { clamp01, smoothstep } from './easing'
import { reveal } from './reveal'

export interface PlayOptions {
  x: number
  y: number
  maxR: number
  duration: number
  /** Eased reveal progress, 0..1. Called every frame. */
  getProgress: () => number
  /** Called every frame with the wavefront radius (used to drive the fallback veil). */
  onFrame?: (r: number) => void
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  size: number
  color: string
  drag: number
}

interface Streak {
  angle: number
  dist: number
  speed: number
  len: number
  age: number
  life: number
  width: number
}

const TAU = Math.PI * 2
const SPARK_COLORS = ['255,240,196', '255,224,146', '236,190,96', '214,160,60']
const MAX_PARTICLES = 420

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** Canvas-2D engine that paints the glowing ring, ripples, streaks and sparks. */
export class FxEngine {
  private ctx: CanvasRenderingContext2D
  private particles: Particle[] = []
  private streaks: Streak[] = []
  private raf = 0
  private w = 0
  private h = 0

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable')
    this.ctx = ctx
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = this.canvas.clientWidth
    this.h = this.canvas.clientHeight
    this.canvas.width = Math.round(this.w * dpr)
    this.canvas.height = Math.round(this.h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.ctx.clearRect(0, 0, this.w, this.h)
    this.particles.length = 0
    this.streaks.length = 0
  }

  /** Resolves when the reveal reaches 100%; leftover sparks keep fading afterwards. */
  play(o: PlayOptions): Promise<void> {
    this.stop()
    this.resize()
    this.spawnBurst(o.x, o.y)

    return new Promise((resolve) => {
      const t0 = performance.now()
      let last = t0
      let resolved = false

      const frame = (now: number) => {
        const dt = Math.min(48, now - last)
        last = now
        const p = clamp01(o.getProgress())
        const r = p * o.maxR
        const elapsed = now - t0

        if (!resolved) {
          reveal.r = r
          o.onFrame?.(r)
        }
        this.step(dt, o, p, r, elapsed)

        if (!resolved && (p >= 1 || elapsed > o.duration + 600)) {
          resolved = true
          reveal.r = o.maxR
          o.onFrame?.(o.maxR * 1.02 + 4)
          resolve()
        }
        if (resolved && this.particles.length === 0 && this.streaks.length === 0) {
          this.ctx.clearRect(0, 0, this.w, this.h)
          return
        }
        this.raf = requestAnimationFrame(frame)
      }
      this.raf = requestAnimationFrame(frame)
    })
  }

  /* ───────────────────────── spawning ───────────────────────── */

  private spawnBurst(x: number, y: number) {
    for (let i = 0; i < 64; i++) {
      const a = rand(0, TAU)
      const s = rand(70, 420)
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        age: 0,
        life: rand(550, 1150),
        size: rand(0.8, 2.6),
        color: SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0],
        drag: rand(1.6, 3.2),
      })
    }
    for (let i = 0; i < 16; i++) {
      this.streaks.push({
        angle: (i / 16) * TAU + rand(-0.12, 0.12),
        dist: rand(10, 26),
        speed: rand(520, 1100),
        len: rand(36, 130),
        age: 0,
        life: rand(420, 700),
        width: rand(1, 2.2),
      })
    }
  }

  private spawnRingSparks(x: number, y: number, r: number, count: number) {
    for (let n = 0; n < count && this.particles.length < MAX_PARTICLES; n++) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const a = rand(0, TAU)
        const px = x + Math.cos(a) * r
        const py = y + Math.sin(a) * r
        if (px < -20 || py < -20 || px > this.w + 20 || py > this.h + 20) continue
        const out = rand(10, 60)
        const tangent = rand(-30, 30)
        this.particles.push({
          x: px,
          y: py,
          vx: Math.cos(a) * out - Math.sin(a) * tangent,
          vy: Math.sin(a) * out + Math.cos(a) * tangent - rand(0, 24),
          age: 0,
          life: rand(380, 900),
          size: rand(0.7, 2.4),
          color: SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0],
          drag: rand(0.8, 1.8),
        })
        break
      }
    }
  }

  /* ───────────────────────── per-frame ───────────────────────── */

  private step(dt: number, o: PlayOptions, p: number, r: number, elapsed: number) {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.w, this.h)

    this.drawOriginFlash(o.x, o.y, elapsed)

    if (p < 0.985) {
      this.drawRipples(o.x, o.y, r, p)
      this.drawRing(o.x, o.y, r, p)
      if (p < 0.9) this.spawnRingSparks(o.x, o.y, r, Math.round((dt / 16) * (4 + 8 * (1 - p))))
    }

    this.updateAndDrawStreaks(dt, o.x, o.y)
    this.updateAndDrawParticles(dt)
  }

  private drawOriginFlash(x: number, y: number, elapsed: number) {
    const t = elapsed / 520
    if (t >= 1) return
    const ease = 1 - t
    const radius = 70 + 150 * (1 - ease * ease)
    const g = this.ctx.createRadialGradient(x, y, 0, x, y, radius)
    g.addColorStop(0, `rgba(255,244,205,${0.85 * ease})`)
    g.addColorStop(0.35, `rgba(240,196,102,${0.45 * ease})`)
    g.addColorStop(1, 'rgba(227,183,92,0)')
    this.ctx.fillStyle = g
    this.ctx.beginPath()
    this.ctx.arc(x, y, radius, 0, TAU)
    this.ctx.fill()
  }

  private drawRing(x: number, y: number, r: number, p: number) {
    if (r < 2) return
    const ctx = this.ctx
    const fade = 1 - smoothstep(0.55, 1, p)
    const band = Math.min(170, 26 + r * 0.17)
    const inner = Math.max(0, r - band)
    const outer = r + band * 0.45
    const g = ctx.createRadialGradient(x, y, inner, x, y, outer)
    const hot = (r - inner) / (outer - inner)
    g.addColorStop(0, 'rgba(227,183,92,0)')
    g.addColorStop(Math.max(0.01, hot * 0.55), `rgba(232,186,90,${0.16 * fade})`)
    g.addColorStop(Math.max(0.02, hot * 0.93), `rgba(244,208,120,${0.55 * fade})`)
    g.addColorStop(hot, `rgba(255,238,184,${0.95 * fade})`)
    g.addColorStop(Math.min(0.99, hot + (1 - hot) * 0.35), `rgba(240,196,102,${0.3 * fade})`)
    g.addColorStop(1, 'rgba(227,183,92,0)')

    ctx.beginPath()
    ctx.arc(x, y, (inner + outer) / 2, 0, TAU)
    ctx.lineWidth = outer - inner
    ctx.strokeStyle = g
    ctx.stroke()

    // crisp inner filament
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.lineWidth = 1.4
    ctx.strokeStyle = `rgba(255,246,214,${0.85 * fade})`
    ctx.stroke()
  }

  private drawRipples(x: number, y: number, r: number, p: number) {
    const ctx = this.ctx
    const fade = 1 - smoothstep(0.5, 1, p)
    ;[0.84, 0.68, 0.52].forEach((k, i) => {
      const rr = r * k
      if (rr < 8) return
      ctx.beginPath()
      ctx.arc(x, y, rr, 0, TAU)
      ctx.lineWidth = 1.2 - i * 0.25
      ctx.strokeStyle = `rgba(232,186,90,${(0.3 - i * 0.08) * fade})`
      ctx.stroke()
    })
  }

  private updateAndDrawStreaks(dt: number, ox: number, oy: number) {
    const ctx = this.ctx
    ctx.lineCap = 'round'
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i]
      s.age += dt
      if (s.age >= s.life) {
        this.streaks.splice(i, 1)
        continue
      }
      const t = s.age / s.life
      s.dist += s.speed * (1 - t) * (dt / 1000)
      const alpha = (1 - t) * (1 - t)
      const head = s.dist
      const tail = Math.max(0, head - s.len * (1 - t * 0.5))
      const cos = Math.cos(s.angle)
      const sin = Math.sin(s.angle)
      const g = ctx.createLinearGradient(ox + cos * tail, oy + sin * tail, ox + cos * head, oy + sin * head)
      g.addColorStop(0, 'rgba(240,196,102,0)')
      g.addColorStop(1, `rgba(255,236,176,${0.9 * alpha})`)
      ctx.strokeStyle = g
      ctx.lineWidth = s.width
      ctx.beginPath()
      ctx.moveTo(ox + cos * tail, oy + sin * tail)
      ctx.lineTo(ox + cos * head, oy + sin * head)
      ctx.stroke()
    }
  }

  private updateAndDrawParticles(dt: number) {
    const ctx = this.ctx
    const sec = dt / 1000
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i]
      q.age += dt
      if (q.age >= q.life) {
        this.particles.splice(i, 1)
        continue
      }
      const damp = Math.exp(-q.drag * sec)
      q.vx *= damp
      q.vy *= damp
      q.x += q.vx * sec
      q.y += q.vy * sec
      const t = q.age / q.life
      const alpha = (1 - t) * (1 - t)
      const twinkle = 0.75 + 0.25 * Math.sin(q.age * 0.03 + q.x)
      // soft halo + bright core
      ctx.fillStyle = `rgba(${q.color},${0.22 * alpha * twinkle})`
      ctx.beginPath()
      ctx.arc(q.x, q.y, q.size * 3.2, 0, TAU)
      ctx.fill()
      ctx.fillStyle = `rgba(${q.color},${0.95 * alpha * twinkle})`
      ctx.beginPath()
      ctx.arc(q.x, q.y, q.size, 0, TAU)
      ctx.fill()
    }
  }
}
