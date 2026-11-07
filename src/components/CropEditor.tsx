import { Check, LocateFixed, RotateCcw } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { constrainCrop, cropRect, defaultCrop, maxCropScale, minCropScale, zoomCrop, type Crop, type Point, type Size } from '../crop.ts'
import type { Clip, Settings } from '../model.ts'

export type CropUpdate = (crop: Crop) => Crop | undefined

function outputFrame(viewport: Size, output: Size) {
  const scale = 0.8 * Math.min(viewport.width / output.width, viewport.height / output.height)
  const width = output.width * scale
  const height = output.height * scale
  return { x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, width, height }
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const center: Point = { x: 0.5, y: 0.5 }

export function CropEditor({ clip, dimensions, settings, onChange, onDone }: {
  clip: Clip; dimensions: Size; settings: Settings; onChange: (update: CropUpdate) => void; onDone: () => void
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const [view, setView] = useState<Size>({ width: 0, height: 0 })
  const [dragging, setDragging] = useState(false)
  const { fit, background } = settings
  const geometry = useMemo(() => ({ image: clip.bitmap, frame: dimensions, fit }), [clip.bitmap, dimensions, fit])
  const crop = constrainCrop(geometry, clip.crop ?? defaultCrop)

  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const measure = () => {
      const { width, height } = element.getBoundingClientRect()
      setView({ width, height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    element.focus({ preventScroll: true })
    element.closest('.preview')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (!canvas.current || !view.width || !view.height) return
    const frame = outputFrame(view, dimensions)
    const rect = cropRect(geometry, clip.crop ?? defaultCrop)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const width = Math.ceil(view.width * dpr)
    const height = Math.ceil(view.height * dpr)
    if (canvas.current.width !== width) canvas.current.width = width
    if (canvas.current.height !== height) canvas.current.height = height
    const ctx = canvas.current.getContext('2d')
    if (!ctx) return
    ctx.setTransform(width / view.width, 0, 0, height / view.height, 0, 0)
    ctx.clearRect(0, 0, view.width, view.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = background
    ctx.fillRect(frame.x, frame.y, frame.width, frame.height)
    ctx.drawImage(clip.bitmap, frame.x + rect.x * frame.width, frame.y + rect.y * frame.height,
      rect.width * frame.width, rect.height * frame.height)

    ctx.beginPath()
    ctx.rect(0, 0, view.width, view.height)
    ctx.rect(frame.x, frame.y, frame.width, frame.height)
    ctx.fillStyle = 'rgba(8, 7, 16, 0.65)'
    ctx.fill('evenodd')
    ctx.strokeStyle = '#c4a9ff'
    ctx.lineWidth = 1.5
    ctx.strokeRect(frame.x, frame.y, frame.width, frame.height)
  }, [view, dimensions, geometry, clip.bitmap, clip.crop, background])

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY) return
      const bounds = element.getBoundingClientRect()
      const frame = outputFrame(bounds, dimensions)
      if (!frame.width || !frame.height) return
      event.preventDefault()
      const point = { x: (event.clientX - bounds.left - frame.x) / frame.width, y: (event.clientY - bounds.top - frame.y) / frame.height }
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1)
      const factor = Math.exp(-Math.max(-300, Math.min(300, pixels)) * 0.002)
      onChange(value => zoomCrop(geometry, value, value.scale * factor, point))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [dimensions, geometry, onChange])

  function move(event: PointerEvent<HTMLDivElement>) {
    const active = pointers.current
    if (!active.has(event.pointerId)) return
    const before = [...active.values()]
    active.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const after = [...active.values()]
    const bounds = event.currentTarget.getBoundingClientRect()
    const frame = outputFrame(bounds, dimensions)
    if (!frame.width || !frame.height) return
    const normalize = (p: Point) => ({ x: (p.x - bounds.left - frame.x) / frame.width, y: (p.y - bounds.top - frame.y) / frame.height })
    if (after.length === 2) {
      const from = normalize(midpoint(before[0], before[1]))
      const to = normalize(midpoint(after[0], after[1]))
      const previous = distance(before[0], before[1])
      const factor = previous > 1 ? distance(after[0], after[1]) / previous : 1
      onChange(value => zoomCrop(geometry, value, value.scale * factor, from, to))
      return
    }
    const from = normalize(before[0])
    const to = normalize(after[0])
    onChange(value => zoomCrop(geometry, value, value.scale, from, to))
  }

  function release(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    setDragging(pointers.current.size > 0)
  }

  return <>
    <div className="preview-stage">
      <div ref={viewport} className={`crop-viewport ${dragging ? 'dragging' : ''}`} tabIndex={0} role="region" aria-label="이미지 크롭 영역"
        aria-describedby="crop-help"
        onPointerDown={event => {
          if (event.button !== 0 || pointers.current.size === 2) return
          event.currentTarget.setPointerCapture(event.pointerId)
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
          setDragging(true)
        }}
        onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
        onKeyDown={event => {
          if (event.key === 'Escape') { onDone(); return }
          const x = Number(event.key === 'ArrowRight') - Number(event.key === 'ArrowLeft')
          const y = Number(event.key === 'ArrowDown') - Number(event.key === 'ArrowUp')
          if (!x && !y) return
          event.preventDefault()
          const step = event.shiftKey ? 0.05 : 0.01
          onChange(value => zoomCrop(geometry, value, value.scale, center, { x: center.x + x * step, y: center.y + y * step }))
        }}>
        <canvas ref={canvas} aria-hidden="true" />
      </div>
    </div>
    <div className="crop-controls">
      <label className="crop-zoom">
        <span>확대 배율</span>
        <input type="range" aria-label="확대 배율" aria-valuetext={`${Math.round(crop.scale * 100)}%`}
          min={minCropScale(crop) * 100} max={maxCropScale * 100} step={1} value={Math.round(crop.scale * 100)}
          onChange={event => {
            const scale = Number(event.target.value) / 100
            onChange(value => zoomCrop(geometry, value, scale, center))
          }} />
        <output>{Math.round(crop.scale * 100)}%</output>
      </label>
      <label className="crop-gaps"><input type="checkbox" checked={crop.allowGaps}
        onChange={event => {
          const allowGaps = event.target.checked
          onChange(value => constrainCrop(geometry, { ...value, allowGaps }))
        }} /> 여백 허용</label>
      <div className="crop-actions">
        <button type="button" className="button secondary" onClick={() => onChange(value => ({ ...value, offsetX: 0, offsetY: 0 }))}><LocateFixed size={14} /> 가운데 정렬</button>
        <button type="button" className="button secondary" onClick={() => onChange(() => undefined)}><RotateCcw size={14} /> 원본으로 초기화</button>
        <button type="button" className="button primary" onClick={onDone}><Check size={14} /> 편집 완료</button>
      </div>
      <p id="crop-help">드래그 또는 방향키로 이동하고, 휠이나 두 손가락으로 확대하세요.{fit === 'stretch' ? ' 편집한 이미지는 원본 비율을 유지합니다.' : ''}</p>
    </div>
  </>
}
