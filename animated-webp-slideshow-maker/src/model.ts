export const effects = [
  { id: 'none', name: 'None', label: '즉시 전환', directional: false },
  { id: 'fade', name: 'Fade', label: '배경을 거쳐 페이드', directional: false },
  { id: 'crossfade', name: 'Crossfade', label: '부드러운 교차', directional: false },
  { id: 'flash', name: 'Flash', label: '흰색 플래시', directional: false },
  { id: 'blackFlash', name: 'Black Flash', label: '검은색 플래시', directional: false },
  { id: 'slide', name: 'Slide', label: '화면 밀기', directional: true },
  { id: 'zoom', name: 'Zoom', label: '확대 · 축소', directional: true },
  { id: 'blur', name: 'Blur', label: '초점 흐리기', directional: false },
  { id: 'rgb', name: 'RGB Split', label: 'RGB 채널 분리', directional: true },
  { id: 'digital', name: 'Digital Glitch', label: '수평 조각 왜곡', directional: true },
  { id: 'vhs', name: 'VHS Glitch', label: '테이프 화면 왜곡', directional: false },
  { id: 'scanline', name: 'Scanline', label: '주사선과 흔들림', directional: false },
  { id: 'pixel', name: 'Pixel Glitch', label: '픽셀 블록 깨짐', directional: false },
  { id: 'chromatic', name: 'Chromatic Aberration', label: '가장자리 색수차', directional: false },
  { id: 'noise', name: 'Static Noise', label: '디지털 잡음', directional: false },
  { id: 'datamosh', name: 'Datamosh Style', label: '이전 화면 잔상', directional: false },
] as const

export type Effect = typeof effects[number]['id']
export type Direction = 'left' | 'right' | 'up' | 'down' | 'in' | 'out'
export type Transition = { effect: Effect; duration: number; strength: number; direction: Direction }
export type Clip = { id: string; name: string; file: Blob; bitmap: ImageBitmap; url: string; duration: number; transition: Transition }
export type TimelineClip = Pick<Clip, 'id' | 'duration' | 'transition'>
export type Fit = 'contain' | 'cover' | 'stretch'
export const fpsOptions = [5, 10, 15, 20, 24, 30] as const
export const resolutionOptions = ['original', '512', '768', '1024', '1536', 'custom'] as const
export type Settings = {
  resolution: typeof resolutionOptions[number]
  width: number
  height: number
  fit: Fit
  background: string
  fps: typeof fpsOptions[number]
  quality: number
  lossless: boolean
  loops: number
  filename: string
  defaultDuration: number
  defaultTransition: Transition
}
export const defaultTransition: Transition = { effect: 'none', duration: 300, strength: 65, direction: 'left' }
export const defaults: Settings = {
  resolution: 'original', width: 1280, height: 720, fit: 'contain', background: '#171721',
  fps: 20, quality: 85, lossless: false, loops: 0, filename: 'slideshow',
  defaultDuration: 500, defaultTransition,
}
export const storageKey = 'webp-studio-settings-v1'
export const maxDimension = 8192
export const maxOutputPixels = 16_777_216
export const maxClips = 100
export const durationLimits = { clip: 60_000, transition: 5_000 }
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
export const seconds = (ms: number) => (ms / 1000).toFixed(1)
export const timestamp = (ms: number) => {
  const minutes = Math.floor(ms / 60_000)
  const sec = Math.floor(ms / 1000) % 60
  return `${String(minutes).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(Math.floor(ms % 1000)).padStart(3, '0')}`
}
export const directions = ['left', 'right', 'up', 'down', 'in', 'out'] as const
export const directionFor = (effect: Effect, direction: Direction): Direction =>
  effect === 'zoom' ? (direction === 'out' ? 'out' : 'in') : (direction === 'in' || direction === 'out' ? 'left' : direction)

export function loadSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '{}')
    const t = value.defaultTransition ?? {}
    const int = (v: unknown, fallback: number, min: number, max: number) =>
      typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), min, max) : fallback
    const effect = effects.some(item => item.id === t.effect) ? t.effect as Effect : 'none'
    return {
      resolution: resolutionOptions.includes(value.resolution) ? value.resolution : defaults.resolution,
      width: int(value.width, defaults.width, 1, maxDimension),
      height: int(value.height, defaults.height, 1, maxDimension),
      fit: ['contain', 'cover', 'stretch'].includes(value.fit) ? value.fit : defaults.fit,
      background: typeof value.background === 'string' && /^#[0-9a-f]{6}$/i.test(value.background) ? value.background : defaults.background,
      fps: fpsOptions.includes(value.fps) ? value.fps : defaults.fps,
      quality: int(value.quality, defaults.quality, 1, 100),
      lossless: value.lossless === true,
      loops: int(value.loops, defaults.loops, 0, 65_535),
      filename: typeof value.filename === 'string' ? value.filename.slice(0, 100) : defaults.filename,
      defaultDuration: int(value.defaultDuration, defaults.defaultDuration, 100, durationLimits.clip),
      defaultTransition: {
        effect, duration: int(t.duration, defaultTransition.duration, 100, durationLimits.transition),
        strength: int(t.strength, defaultTransition.strength, 0, 100),
        direction: directionFor(effect, directions.includes(t.direction) ? t.direction : 'left'),
      },
    }
  } catch {
    return defaults
  }
}

export const presets: { name: string; hold: number; transition: Transition }[] = [
  { name: '빠른 깜빡임', hold: 200, transition: { effect: 'flash', duration: 100, strength: 90, direction: 'left' } },
  { name: '부드러운 슬라이드쇼', hold: 1200, transition: { effect: 'crossfade', duration: 500, strength: 50, direction: 'left' } },
  { name: 'RGB 글리치', hold: 500, transition: { effect: 'rgb', duration: 300, strength: 75, direction: 'right' } },
  { name: 'VHS 전환', hold: 700, transition: { effect: 'vhs', duration: 400, strength: 65, direction: 'left' } },
  { name: '강한 디지털 글리치', hold: 400, transition: { effect: 'digital', duration: 300, strength: 95, direction: 'left' } },
]

export function outputDimensions(settings: Settings, first?: { width: number; height: number }) {
  if (settings.resolution === 'custom') return { width: settings.width, height: settings.height }
  const { width, height } = first ?? { width: 1280, height: 720 }
  if (settings.resolution === 'original') return { width, height }
  const scale = Number(settings.resolution) / Math.max(width, height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export function resizeToFit(width: number, height: number, limit: number) {
  const scale = Math.min(1, limit / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export function moveClip<T extends { id: string }>(clips: T[], source: string, target: string, after: boolean): T[] {
  if (source === target) return clips
  const item = clips.find(clip => clip.id === source)
  if (!item) return clips
  const result = clips.filter(clip => clip.id !== source)
  const index = result.findIndex(clip => clip.id === target)
  if (index < 0) return clips
  result.splice(index + Number(after), 0, item)
  return result
}
