import { describe, expect, it } from 'vitest'
import { advance, alphaFor, isAlive, spawnCannon, type Particle } from './Confetti'

const W = 1000
const H = 800
const PALETTE = ['#a', '#b', '#c']

function spawn(dir: -1 | 1) {
  return spawnCannon(dir, W, H, PALETTE)
}

describe('spawnCannon', () => {
  it('fires a full load of particles', () => {
    expect(spawn(-1)).toHaveLength(90)
    expect(spawn(1)).toHaveLength(90)
  })

  it('starts every piece near its corner at the bottom of the viewport', () => {
    for (const p of spawn(-1)) {
      expect(p.x).toBeCloseTo(W * 0.08)
      expect(p.y).toBeCloseTo(H * 0.98)
    }
    for (const p of spawn(1)) {
      expect(p.x).toBeCloseTo(W * 0.92)
    }
  })

  it('launches everything upward', () => {
    for (const p of [...spawn(-1), ...spawn(1)]) expect(p.vy).toBeLessThan(0)
  })

  it('aims each cannon inward on average', () => {
    const mean = (ps: Particle[]) => ps.reduce((s, p) => s + p.vx, 0) / ps.length
    expect(mean(spawn(-1))).toBeGreaterThan(0) // left cannon fires right
    expect(mean(spawn(1))).toBeLessThan(0) // right cannon fires left
  })

  it('draws only from the supplied palette', () => {
    for (const p of spawn(-1)) expect(PALETTE).toContain(p.color)
  })

  it('gives every piece a positive size and lifespan', () => {
    for (const p of spawn(1)) {
      expect(p.w).toBeGreaterThan(0)
      expect(p.h).toBeGreaterThan(0)
      expect(p.maxLife).toBeGreaterThan(0)
      expect(p.life).toBe(0)
    }
  })

  it('varies speed and spin across the spray', () => {
    const ps = spawn(-1)
    expect(new Set(ps.map((p) => p.vx)).size).toBeGreaterThan(1)
    expect(new Set(ps.map((p) => p.spin)).size).toBeGreaterThan(1)
  })
})

function piece(over: Partial<Particle> = {}): Particle {
  return {
    x: 0, y: 0, vx: 10, vy: -10, angle: 0, spin: 0.1,
    w: 8, h: 12, color: '#a', life: 0, maxLife: 100,
    ...over,
  }
}

describe('advance', () => {
  it('pulls a piece down over time', () => {
    const p = piece({ vy: 0 })
    advance(p, 1)
    expect(p.vy).toBeGreaterThan(0)
    expect(p.y).toBeGreaterThan(0)
  })

  it('turns an upward launch into a fall', () => {
    const p = piece({ vy: -10 })
    for (let i = 0; i < 200; i++) advance(p, 1)
    expect(p.vy).toBeGreaterThan(0)
  })

  it('bleeds off horizontal speed via drag', () => {
    const p = piece({ vx: 10 })
    advance(p, 1)
    expect(p.vx).toBeLessThan(10)
    expect(p.vx).toBeGreaterThan(0) // drag slows, never reverses
  })

  it('ages by exactly the elapsed frames', () => {
    const p = piece()
    advance(p, 2.5)
    expect(p.life).toBeCloseTo(2.5)
  })

  it('spins by the elapsed frames', () => {
    const p = piece({ spin: 0.2, angle: 0 })
    advance(p, 3)
    expect(p.angle).toBeCloseTo(0.6)
  })

  it('is frame-rate independent: two half-steps ≈ one whole step', () => {
    const whole = piece()
    const halves = piece()
    advance(whole, 1)
    advance(halves, 0.5)
    advance(halves, 0.5)
    expect(halves.x).toBeCloseTo(whole.x, 0)
    expect(halves.y).toBeCloseTo(whole.y, 0)
    expect(halves.life).toBeCloseTo(whole.life)
  })

  it('leaves a piece unmoved on a zero-length step', () => {
    const p = piece()
    advance(p, 0)
    expect(p).toEqual(piece())
  })
})

describe('alphaFor', () => {
  it('is fully opaque early in life', () => {
    expect(alphaFor(piece({ life: 0 }))).toBe(1)
    expect(alphaFor(piece({ life: 50 }))).toBe(1)
  })

  it('fades to nothing by the end of life', () => {
    expect(alphaFor(piece({ life: 100 }))).toBeCloseTo(0)
  })

  it('decreases monotonically once fading starts', () => {
    const at = (life: number) => alphaFor(piece({ life }))
    expect(at(80)).toBeLessThan(1)
    expect(at(90)).toBeLessThan(at(80))
    expect(at(99)).toBeLessThan(at(90))
  })

  it('never goes negative past the end of life', () => {
    expect(alphaFor(piece({ life: 500 }))).toBe(0)
  })
})

describe('isAlive', () => {
  it('keeps a young piece on screen', () => {
    expect(isAlive(piece({ life: 1, y: 100 }), H)).toBe(true)
  })

  it('retires a piece that outlived its span', () => {
    expect(isAlive(piece({ life: 100, y: 0 }), H)).toBe(false)
  })

  it('retires a piece that fell past the bottom', () => {
    expect(isAlive(piece({ life: 1, y: H + 41 }), H)).toBe(false)
  })

  it('keeps a piece just below the fold, so it exits smoothly', () => {
    expect(isAlive(piece({ life: 1, y: H + 10 }), H)).toBe(true)
  })

  it('keeps a piece launched above the viewport', () => {
    expect(isAlive(piece({ life: 1, y: -200 }), H)).toBe(true)
  })

  it('empties a full burst within a few seconds of frames', () => {
    let ps = spawn(-1)
    for (let f = 0; f < 400 && ps.length > 0; f++) {
      ps.forEach((p) => advance(p, 1))
      ps = ps.filter((p) => isAlive(p, H))
    }
    expect(ps).toHaveLength(0)
  })
})
