import type { Direction, Settings } from './model.ts'
import type { Frame } from './timeline.ts'

type Surface = HTMLCanvasElement | OffscreenCanvas
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type Source = CanvasImageSource & { width: number; height: number }
type Appearance = Pick<Settings, 'background' | 'fit'>

function context(canvas: Surface): Context {
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true }) as Context | null
  if (!ctx) throw new Error('이 브라우저에서 Canvas 2D를 사용할 수 없습니다.')
  ctx.imageSmoothingQuality = 'high'
  return ctx
}

function surface(width: number, height: number): Surface {
  if (typeof document === 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function randomFrom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function vector(direction: Direction): [number, number] {
  if (direction === 'right') return [1, 0]
  if (direction === 'up') return [0, -1]
  if (direction === 'down') return [0, 1]
  return [-1, 0]
}

function compose(ctx: Context, image: Source, { background, fit }: Appearance) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  if (fit === 'stretch') {
    ctx.drawImage(image, 0, 0, width, height)
    return
  }
  const scale = Math[fit === 'cover' ? 'max' : 'min'](width / image.width, height / image.height)
  const w = image.width * scale
  const h = image.height * scale
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h)
}

export class Renderer {
  private readonly ctx: Context
  private readonly layers: Context[]
  private cached = new Map<Context, { image: Source; background: string; fit: string }>()
  constructor(canvas: Surface) {
    this.ctx = context(canvas)
    const { width, height } = canvas
    this.layers = Array.from({ length: 3 }, () => context(surface(width, height)))
  }

  dispose() {
    this.cached.clear()
    for (const { canvas } of this.layers) {
      canvas.width = 1
      canvas.height = 1
    }
  }

  private layer(index: number, image: Source, appearance: Appearance) {
    const ctx = this.layers[index]
    const cache = this.cached.get(ctx)
    if (!cache || cache.image !== image || cache.background !== appearance.background || cache.fit !== appearance.fit) {
      compose(ctx, image, appearance)
      this.cached.set(ctx, { image, ...appearance })
    }
    return ctx.canvas
  }

  draw(images: Source[], frame: Frame, appearance: Appearance) {
    const { segment, progress: p, tick } = frame
    const ctx = this.ctx
    const { width: w, height: h } = ctx.canvas
    if (segment.kind === 'hold') {
      ctx.drawImage(this.layer(0, images[segment.index], appearance), 0, 0)
      return
    }
    const { effect, strength, direction } = segment.transition
    const a = this.layer(0, images[segment.index], appearance)
    const b = this.layer(1, images[segment.index + 1], appearance)
    const s = strength / 100
    const envelope = Math.sin(Math.PI * p) * s
    const smooth = p * p * (3 - 2 * p)
    const blend = (alpha = p) => {
      ctx.drawImage(a, 0, 0)
      ctx.globalAlpha = alpha
      ctx.drawImage(b, 0, 0)
      ctx.globalAlpha = 1
    }
    if (s === 0) {
      blend()
      return
    }

    const base = p < 0.5 ? a : b
    const alternate = p < 0.5 ? b : a
    const scratch = this.layers[2]
    const random = randomFrom(segment.seed ^ Math.imul(tick + 1, 0x85ebca6b))
    const [dx, dy] = vector(direction)
    const wash = (color: string, opacity: number) => {
      ctx.fillStyle = color
      ctx.globalAlpha = opacity
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1
    }
    const stripe = (source: Surface, y: number, height: number, offset: number, yOffset = 0) => {
      if (height > 0) ctx.drawImage(source, 0, y, w, height, offset, y + yOffset, w, height)
    }

    ctx.save()
    try {
      switch (effect) {
        case 'none':
          ctx.drawImage(b, 0, 0)
          break
        case 'fade':
          blend()
          wash(appearance.background, envelope)
          break
        case 'crossfade':
          blend(p + (smooth - p) * s)
          break
        case 'flash':
        case 'blackFlash':
          ctx.drawImage(base, 0, 0)
          wash(effect === 'flash' ? '#ffffff' : '#000000', s * Math.pow(Math.sin(Math.PI * p), 3))
          break
        case 'slide': {
          blend()
          ctx.globalAlpha = s
          ctx.drawImage(a, dx * smooth * w, dy * smooth * h)
          ctx.drawImage(b, dx * (smooth - 1) * w, dy * (smooth - 1) * h)
          break
        }
        case 'zoom': {
          blend()
          const scale = 1 + (direction === 'out' ? -0.45 : 0.65) * envelope
          ctx.globalAlpha = Math.min(1, envelope * 1.5)
          ctx.drawImage(base, w * (1 - scale) / 2, h * (1 - scale) / 2, w * scale, h * scale)
          break
        }
        case 'blur': {
          blend()
          const blurScale = 1 / (1 + envelope * 35)
          const bw = Math.max(1, Math.round(w * blurScale))
          const bh = Math.max(1, Math.round(h * blurScale))
          scratch.drawImage(ctx.canvas, 0, 0, bw, bh)
          ctx.drawImage(scratch.canvas, 0, 0, bw, bh, 0, 0, w, h)
          break
        }
        case 'rgb':
        case 'chromatic': {
          const offset = envelope * (effect === 'rgb' ? 0.065 : 0.036)
          wash('#000000', 1)
          ctx.globalCompositeOperation = 'lighter'
          // Separate the composite into three channel masks and add them at different positions.
          for (const [tint, shift] of [['#ff0000', 1], ['#00ff00', 0], ['#0000ff', -1]] as const) {
            scratch.drawImage(a, 0, 0)
            scratch.globalAlpha = smooth
            scratch.drawImage(b, 0, 0)
            scratch.globalAlpha = 1
            scratch.globalCompositeOperation = 'multiply'
            scratch.fillStyle = tint
            scratch.fillRect(0, 0, w, h)
            scratch.globalCompositeOperation = 'source-over'
            if (effect === 'rgb') {
              ctx.drawImage(scratch.canvas, shift * dx * offset * w, shift * dy * offset * h)
            } else {
              const zoom = (shift + 1) * offset
              ctx.drawImage(scratch.canvas, -w * zoom / 2, -h * zoom / 2, w * (1 + zoom), h * (1 + zoom))
            }
          }
          break
        }
        case 'digital':
        case 'vhs':
        case 'scanline': {
          const vhs = effect === 'vhs'
          const scanline = effect === 'scanline'
          ctx.drawImage(base, 0, 0)
          ctx.drawImage(base, (random() - 0.5) * w * envelope * (scanline ? 0.035 : 0.07), 0)
          const bands = scanline ? 4 : 14
          for (let i = 0; i < bands; i++) {
            const y = Math.floor(random() * h)
            const height = Math.min(h - y, (0.009 + random() * 0.085) * h)
            const offset = (random() - 0.5) * envelope
            ctx.globalAlpha = 0.35 + envelope * 0.65
            stripe(i % 3 ? base : alternate, y, height, w * offset * (vhs ? 0.12 : 0.3) * (dy ? 0 : -dx), dy * h * offset * 0.25)
          }
          if (vhs || scanline) {
            ctx.globalAlpha = 1
            if (vhs) wash('#6d377d', envelope * 0.2)
            ctx.fillStyle = 'rgba(0,0,0,0.45)'
            ctx.globalAlpha = envelope
            for (let i = 0; i < 90; i++) ctx.fillRect(0, i * h / 90, w, Math.max(1, h / 210))
            if (vhs) {
              ctx.fillStyle = '#d8e5f6'
              for (let i = 0; i < 40; i++) ctx.fillRect(random() * w, random() * h, random() * w * 0.06, Math.max(1, h / 200))
            }
          }
          break
        }
        case 'pixel':
        case 'datamosh': {
          blend(smooth)
          const mosh = effect === 'datamosh'
          const columns = mosh ? 11 : 18
          const rows = mosh ? 8 : 13
          const bw = w / columns
          const bh = h / rows
          for (let i = 0; i < Math.round(70 * envelope); i++) {
            const x = Math.floor(random() * columns) * bw
            const y = Math.floor(random() * rows) * bh
            const size = Math.min(w - x, bw * (mosh ? 3 : 1))
            ctx.globalAlpha = mosh ? envelope : 0.3 + envelope * 0.65
            ctx.drawImage(mosh ? a : alternate, x, y, size, bh, x + (random() - 0.5) * bw * 2, y, size, bh)
            if (!mosh && i % 5 === 0) {
              ctx.fillStyle = i % 2 ? '#d83a82' : '#36d5e4'
              ctx.fillRect(x, y, size, bh)
            }
          }
          break
        }
        case 'noise': {
          blend(smooth)
          ctx.globalAlpha = envelope * 0.8
          for (let i = 0; i < 1600; i++) {
            ctx.fillStyle = random() > 0.5 ? '#ffffff' : '#000000'
            ctx.fillRect(random() * w, random() * h, Math.max(1, w / 120), Math.max(1, h / 90))
          }
          break
        }
      }
    } finally {
      ctx.restore()
    }
  }
}
