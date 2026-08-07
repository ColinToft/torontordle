import { useEffect, useRef, type CSSProperties } from 'react'

// A dependency-free confetti burst for a correct diagnosis. Two angled cannons
// fire from the lower corners; paper rectangles tumble under gravity and drag,
// flutter as they spin, and fade as they fall. The canvas is a pointer-events:
// none overlay, so it never intercepts a click.

const PARTICLES_PER_CANNON = 90
const GRAVITY = 0.3 // px per frame² at 60fps
const DRAG = 0.992
const FADE_START = 0.72 // fraction of life after which a piece starts fading

// Design tokens, read from :root so the confetti stays in sync with the palette.
const TOKEN_COLORS = ['--correct', '--uoft-navy', '--partial', '--ttc-red', '--uoft-bone']
const FALLBACK_COLORS = ['#2d6a4f', '#1e3a5f', '#c08a2e', '#da291c', '#f4f4f1']

function paletteFromTokens(): string[] {
  const root = getComputedStyle(document.documentElement)
  return TOKEN_COLORS.map((token, i) => root.getPropertyValue(token).trim() || FALLBACK_COLORS[i])
}

export type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  spin: number
  w: number
  h: number
  color: string
  life: number // frames elapsed
  maxLife: number
}

// One cannon: `dir` is -1 for the left corner (firing right), +1 for the right.
export function spawnCannon(dir: -1 | 1, width: number, height: number, palette: string[]): Particle[] {
  const originX = dir === -1 ? width * 0.08 : width * 0.92
  const originY = height * 0.98
  return Array.from({ length: PARTICLES_PER_CANNON }, () => {
    // Aim inward and up, spread over ~50°, with a wide speed range so the
    // burst arrives as a spray rather than a single front.
    const spread = (Math.random() - 0.5) * 1.1
    const angle = -Math.PI / 2 + spread + dir * -0.55
    const speed = 19 + Math.random() * 17
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 5,
      h: 9 + Math.random() * 6,
      color: palette[Math.floor(Math.random() * palette.length)],
      life: 0,
      maxLife: 130 + Math.random() * 60,
    }
  })
}

// Advances one piece by `dt` 60fps-equivalent frames. Mutates in place — this
// runs on a few hundred particles per frame.
export function advance(p: Particle, dt: number): void {
  p.life += dt
  p.vy += GRAVITY * dt
  p.vx *= DRAG ** dt
  p.vy *= DRAG ** dt
  p.x += p.vx * dt
  p.y += p.vy * dt
  p.angle += p.spin * dt
}

// Opacity for a piece: fully opaque until FADE_START of its life, then a
// linear fade to zero at the end.
export function alphaFor(p: Particle): number {
  const t = p.life / p.maxLife
  return t < FADE_START ? 1 : Math.max(0, 1 - (t - FADE_START) / (1 - FADE_START))
}

// A piece is done once it has outlived its span or fallen past the bottom.
export function isAlive(p: Particle, viewportHeight: number): boolean {
  return p.life < p.maxLife && p.y < viewportHeight + 40
}

/**
 * Renders nothing until `fire` changes to a non-zero value; each new value
 * launches one burst. Honours `prefers-reduced-motion` by never animating.
 */
export function Confetti({ fire }: { fire: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    if (fire === 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return // no 2d context (very old or headless browser) — skip silently

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const { innerWidth: w, innerHeight: h } = window
    const palette = paletteFromTokens()
    let particles = [...spawnCannon(-1, w, h, palette), ...spawnCannon(1, w, h, palette)]

    let last: number | null = null
    const step = (now: number) => {
      // Normalise to 60fps steps so the burst runs at the same speed on any
      // refresh rate; clamp so a backgrounded tab doesn't teleport everything.
      const dt = last === null ? 1 : Math.min((now - last) / 16.667, 3)
      last = now

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      particles = particles.filter((p) => isAlive(p, window.innerHeight))

      for (const p of particles) {
        advance(p, dt)
        ctx.globalAlpha = alphaFor(p)
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        // Squashing width by the spin phase reads as a paper flutter.
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w * Math.abs(Math.cos(p.angle)), p.h)
        ctx.restore()
      }
      ctx.globalAlpha = 1

      if (particles.length > 0) {
        frameRef.current = requestAnimationFrame(step)
      } else {
        frameRef.current = null
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      }
    }
    frameRef.current = requestAnimationFrame(step)

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      window.removeEventListener('resize', resize)
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    }
  }, [fire])

  if (fire === 0) return null
  return <canvas ref={canvasRef} aria-hidden style={confettiCanvas} />
}

const confettiCanvas: CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: 60,
}
