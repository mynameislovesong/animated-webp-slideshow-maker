import { AlertTriangle, Check, Download, Film, ImagePlus, LockKeyhole, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Inspector } from './components/Inspector.tsx'
import { Library } from './components/Library.tsx'
import { Preview } from './components/Preview.tsx'
import { Timeline } from './components/Timeline.tsx'
import { IconButton } from './components/Controls.tsx'
import { readClip, releaseClip } from './images.ts'
import { clamp, defaults, loadSettings, maxClips, maxDimension, maxOutputPixels, moveClip, outputDimensions, presets, seconds, storageKey, type Clip, type Settings, type Transition } from './model.ts'
import { framesIn, makeTimeline } from './timeline.ts'
import type { ExportMessage, ExportRequest } from './export-protocol.ts'

type Job = { progress: number; stage: string }
type Result = { url: string; name: string; size: number; frames: number; duration: number }

const maxSourcePixels = 96_000_000
const fileDrag = (event: DragEvent<HTMLElement>) => event.dataTransfer.types.includes('Files')
const formatBytes = (value: number) => value >= 1024 * 1024 ? `${(value / (1024 * 1024)).toFixed(2)} MB` : `${(value / 1024).toFixed(1)} KB`

function download(url: string, name: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
}

export default function App() {
  const [clips, setClips] = useState<Clip[]>([])
  const [settings, setSettings] = useState(loadSettings)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [repeat, setRepeat] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [notice, setNotice] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  const input = useRef<HTMLInputElement>(null)
  const activeClips = useRef<Clip[]>([])
  const uploadQueue = useRef(Promise.resolve())
  const epoch = useRef(0)
  const dragDepth = useRef(0)
  const clock = useRef(0)
  const previewStop = useRef<number | null>(null)
  const worker = useRef<Worker | null>(null)
  const startupTimer = useRef(0)
  const resultUrl = useRef<string | null>(null)
  const { segments, total } = useMemo(() => makeTimeline(clips), [clips])
  const dimensions = useMemo(() => outputDimensions(settings, clips[0]?.bitmap), [settings, clips])
  const index = clips.findIndex(clip => clip.id === selectedId)
  const selected = clips[index]
  const time = Math.min(position, total)
  const frameCount = useMemo(() => segments.reduce((sum, segment) => sum + framesIn(segment, settings.fps), 0), [segments, settings.fps])
  const pixels = dimensions.width * dimensions.height
  const oversized = Math.max(dimensions.width, dimensions.height) > maxDimension || pixels > maxOutputPixels
  const heavy = clips.length > 0 && (pixels > 4_000_000 || total > 30_000 || frameCount * pixels > 160_000_000)

  function updateClips(next: Clip[]) {
    activeClips.current = next
    setClips(next)
  }

  const seek = useCallback((ms: number) => {
    clock.current = clamp(ms, 0, total)
    previewStop.current = null
    setPosition(clock.current)
    setPlaying(false)
  }, [total])

  const togglePlayback = useCallback(() => {
    if (!total) return
    if (clock.current >= total) {
      clock.current = 0
      setPosition(0)
    }
    previewStop.current = null
    setPlaying(value => !value)
  }, [total])

  useEffect(() => {
    if (!playing || !total) return
    let raf = 0
    let previous = performance.now()
    const tick = (now: number) => {
      clock.current += Math.max(0, now - previous)
      previous = now
      const stop = previewStop.current ?? total
      if (clock.current >= stop) {
        if (repeat && previewStop.current === null) clock.current %= total
        else {
          clock.current = stop
          previewStop.current = null
          setPosition(stop)
          setPlaying(false)
          return
        }
      }
      setPosition(Math.floor(clock.current))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, repeat, total])

  useEffect(() => {
    clock.current = Math.min(clock.current, total)
    if (!total) setPlaying(false)
  }, [total])

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(settings)) } catch { /* Private browsing can disable storage. */ }
  }, [settings])

  useEffect(() => () => {
    epoch.current++
    for (const clip of activeClips.current) releaseClip(clip)
    worker.current?.terminate()
    window.clearTimeout(startupTimer.current)
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current)
  }, [])

  const addFiles = useCallback((files: File[]) => {
    if (!files.length) return
    const requestEpoch = epoch.current
    setUploading(value => value + 1)
    setNotice('')
    uploadQueue.current = uploadQueue.current.then(async () => {
      const errors: string[] = []
      let firstNew: string | null = null
      try {
        for (const file of files) {
          if (epoch.current !== requestEpoch) return
          if (activeClips.current.length >= maxClips) {
            errors.push(`이미지는 최대 ${maxClips}장까지 추가할 수 있습니다.`)
            break
          }
          try {
            const clip = await readClip(file, settings)
            if (epoch.current !== requestEpoch) {
              releaseClip(clip)
              return
            }
            const usedPixels = activeClips.current.reduce((sum, item) => sum + item.bitmap.width * item.bitmap.height, 0)
            if (usedPixels + clip.bitmap.width * clip.bitmap.height > maxSourcePixels) {
              releaseClip(clip)
              throw new Error('원본 이미지 메모리 한도를 초과했습니다.')
            }
            firstNew ??= clip.id
            updateClips([...activeClips.current, clip])
          } catch (error) {
            const reason = error instanceof Error && /[가-힣]/.test(error.message) ? error.message : '파일을 읽을 수 없습니다.'
            errors.push(`${file.name || '붙여넣은 이미지'} · ${reason}`)
          }
        }
        if (firstNew) setSelectedId(value => value ?? firstNew)
        if (errors.length) setNotice(errors.slice(0, 3).join(' / ') + (errors.length > 3 ? ` 외 ${errors.length - 3}건` : ''))
      } finally {
        if (epoch.current === requestEpoch) setUploading(value => value - 1)
      }
    })
  }, [settings])

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (worker.current) return
      const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'))
      if (files.length) {
        event.preventDefault()
        addFiles(files)
      }
    }
    const key = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || document.querySelector('dialog[open]') ||
          !(event.target instanceof HTMLElement) || event.target.closest('input, textarea, button, select, [contenteditable]')) return
      if (total) { event.preventDefault(); togglePlayback() }
    }
    window.addEventListener('paste', paste)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('paste', paste); window.removeEventListener('keydown', key) }
  }, [addFiles, togglePlayback, total])

  const chooseFiles = () => input.current?.click()
  const patchSettings = (patch: Partial<Settings>) => setSettings(value => ({ ...value, ...patch }))

  function select(id: string, target?: number) {
    setSelectedId(id)
    seek(target ?? segments.find(segment => segment.kind === 'hold' && clips[segment.index].id === id)?.start ?? 0)
  }

  function showTransition(id: string, play = true) {
    setSelectedId(id)
    const segment = segments.find(item => item.kind === 'transition' && clips[item.index].id === id)
    if (!segment) return
    if (play) {
      clock.current = segment.start
      previewStop.current = segment.start + segment.duration
      setPosition(segment.start)
      setPlaying(true)
    } else {
      seek(segment.start + Math.floor(segment.duration / 2))
    }
  }

  function reorder(source: string, target: string, after: boolean) {
    const next = moveClip(activeClips.current, source, target, after)
    if (next === activeClips.current) return
    updateClips(next)
    setSelectedId(source)
    seek(makeTimeline(next).segments.find(segment => segment.kind === 'hold' && next[segment.index].id === source)?.start ?? 0)
  }

  function remove(id: string) {
    const old = activeClips.current
    const removed = old.find(clip => clip.id === id)
    if (!removed) return
    const next = old.filter(clip => clip.id !== id)
    updateClips(next)
    releaseClip(removed)
    const nextId = selectedId === id ? next[Math.min(old.indexOf(removed), next.length - 1)]?.id ?? null : selectedId
    setSelectedId(nextId)
    seek(makeTimeline(next).segments.find(segment => segment.kind === 'hold' && next[segment.index].id === nextId)?.start ?? 0)
  }

  function changeDuration(duration: number) {
    patchSettings({ defaultDuration: duration })
    if (selected) updateClips(clips.map(clip => clip.id === selectedId ? { ...clip, duration } : clip))
  }

  function changeTransition(patch: Partial<Transition>) {
    const transition = { ...(selected?.transition ?? settings.defaultTransition), ...patch }
    patchSettings({ defaultTransition: transition })
    if (!selected) return
    const next = clips.map(clip => clip.id === selectedId ? { ...clip, transition } : clip)
    updateClips(next)
    const nextTimeline = makeTimeline(next)
    const segment = nextTimeline.segments.find(item => item.kind === 'transition' && item.index === index)
    if (!segment) {
      seek(nextTimeline.segments.find(item => item.kind === 'hold' && item.index === index)?.start ?? 0)
      return
    }
    clock.current = segment.start + Math.floor(segment.duration / 2)
    previewStop.current = null
    setPosition(clock.current)
    setPlaying(false)
  }

  function applyPreset(presetIndex: number) {
    const preset = presets[presetIndex]
    if (!preset) return
    patchSettings({ defaultDuration: preset.hold, defaultTransition: preset.transition })
    updateClips(clips.map(clip => ({ ...clip, duration: preset.hold, transition: { ...preset.transition } })))
    seek(0)
  }

  function clearResult() {
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current)
    resultUrl.current = null
    setResult(null)
  }

  function stopWorker() {
    worker.current?.terminate()
    worker.current = null
    window.clearTimeout(startupTimer.current)
    setJob(null)
  }

  function reset() {
    epoch.current++
    for (const clip of activeClips.current) releaseClip(clip)
    updateClips([])
    setSettings(defaults)
    setUploading(0)
    setSelectedId(null)
    setNotice('')
    setRepeat(true)
    setCollapsed(false)
    seek(0)
    clearResult()
  }

  function startExport() {
    if (worker.current || uploading || !clips.length) return
    if (oversized) {
      setNotice(`출력 크기는 각 변 ${maxDimension}px, 총 1,677만 픽셀 이하여야 합니다. 출력 탭에서 해상도를 낮춰 주세요.`)
      return
    }
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof WebAssembly === 'undefined') {
      setNotice('이 브라우저는 Web Worker, OffscreenCanvas 또는 WebAssembly를 지원하지 않습니다.')
      return
    }
    const filename = settings.filename.trim().replace(/\.webp$/i, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'slideshow'
    const request: ExportRequest = {
      clips: clips.map(({ id, duration, transition, file }) => ({ id, duration, transition, file })),
      settings, ...dimensions,
    }
    setPlaying(false)
    setNotice('')
    setJob({ progress: 0, stage: '내보내기 준비 중' })
    try {
      const instance = new Worker(new URL('./encode.worker.ts', import.meta.url), { type: 'module' })
      worker.current = instance
      startupTimer.current = window.setTimeout(() => {
        stopWorker()
        setNotice('WebAssembly 인코더를 시작하는 데 시간이 너무 오래 걸립니다. 페이지를 새로고침해 주세요.')
      }, 45_000)
      instance.onmessage = ({ data }: MessageEvent<ExportMessage>) => {
        if (worker.current !== instance) return
        if (data.type === 'progress') {
          if (data.progress > 0) window.clearTimeout(startupTimer.current)
          setJob(data)
          return
        }
        stopWorker()
        if (data.type === 'error') {
          setNotice(data.message)
          return
        }
        clearResult()
        const url = URL.createObjectURL(data.blob)
        const name = `${filename}.webp`
        resultUrl.current = url
        setResult({ url, name, size: data.blob.size, frames: data.frames, duration: data.duration })
        download(url, name)
      }
      instance.onerror = () => {
        if (worker.current !== instance) return
        stopWorker()
        setNotice('인코딩 작업이 중단되었습니다. 해상도를 낮추거나 페이지를 새로고침해 주세요.')
      }
      instance.postMessage(request)
    } catch {
      stopWorker()
      setNotice('내보내기 작업을 시작할 수 없습니다.')
    }
  }

  return <main className="studio" onDragEnter={event => {
    if (fileDrag(event) && !job) { dragDepth.current++; setHovering(true) }
  }} onDragLeave={event => {
    if (fileDrag(event) && --dragDepth.current <= 0) { dragDepth.current = 0; setHovering(false) }
  }} onDragOver={event => {
    if (fileDrag(event)) { event.preventDefault(); event.dataTransfer.dropEffect = job ? 'none' : 'copy' }
  }} onDrop={event => {
    if (!fileDrag(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setHovering(false)
    if (!job) addFiles(Array.from(event.dataTransfer.files))
  }}>
    <input ref={input} type="file" multiple accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" aria-label="이미지 파일" className="sr-only" tabIndex={-1}
      onChange={event => { addFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    <header className="app-header">
      <div className="brand"><div className="logo"><Film size={22} strokeWidth={1.8} /></div>
        <div><div className="brand-name">WebP Studio</div><div className="brand-subtitle">Animated WebP Slideshow Maker</div></div>
      </div>
      <div className="header-actions">
        <button type="button" className="button quiet" onClick={reset} aria-label="초기화"><RotateCcw size={15} /><span>초기화</span></button>
        <button type="button" className="button secondary" onClick={chooseFiles} aria-label="이미지 추가"><ImagePlus size={16} /><span>이미지 추가</span></button>
        <button type="button" className="button primary" onClick={startExport} disabled={!clips.length || uploading > 0 || !!job}><Download size={16} /> WebP 내보내기</button>
      </div>
    </header>

    <div className={`workspace ${collapsed ? 'inspector-collapsed' : ''}`}>
      <Library clips={clips} selectedId={selectedId} busy={uploading > 0} onSelect={select} onRemove={remove} onAdd={chooseFiles} onReorder={reorder} />
      <Preview clips={clips} segments={segments} total={total} time={time} playing={playing} repeat={repeat} settings={settings} dimensions={dimensions}
        onAdd={chooseFiles} onSeek={seek} onToggle={togglePlayback} onRepeat={() => setRepeat(value => !value)} />
      <Inspector clip={selected} index={index} count={clips.length} settings={settings} dimensions={dimensions} collapsed={collapsed}
        onCollapse={() => setCollapsed(value => !value)} onDuration={changeDuration} onTransition={changeTransition}
        onPreview={() => { if (selected) showTransition(selected.id) }}
        onApplyDuration={() => {
          const duration = selected?.duration ?? settings.defaultDuration
          updateClips(clips.map(clip => ({ ...clip, duration })))
          seek(0)
        }}
        onApplyEffect={() => {
          const transition = selected?.transition ?? settings.defaultTransition
          updateClips(clips.map(clip => ({ ...clip, transition: { ...transition } })))
          seek(0)
        }}
        onPreset={applyPreset} onSettings={patchSettings} />
      <Timeline clips={clips} segments={segments} total={total} time={time} selectedId={selectedId}
        onSelect={select} onTransition={id => showTransition(id, false)} onSeek={seek} onReorder={reorder} />
    </div>

    <footer className="status-bar">
      <span><LockKeyhole size={13} /> 이미지는 브라우저에서만 처리됩니다.</span>
      {oversized && clips.length > 0 ? <span className="warning"><AlertTriangle size={14} /> 출력 한도 초과</span>
        : heavy ? <span className="warning"><AlertTriangle size={14} /> 큰 프로젝트 · 내보내기에 시간이 걸릴 수 있어요.</span>
          : <span>{settings.fps} FPS <i /> {clips.length ? `${frameCount}개 출력 프레임` : 'Animated WebP'}</span>}
    </footer>
    {hovering && <div className="drop-overlay" aria-hidden="true"><div><ImagePlus size={35} /><strong>이미지를 놓아 추가</strong></div></div>}
    {(notice || result) && <div className="toast-stack">
      {notice && <div className="toast toast-error" role="alert"><AlertTriangle size={20} /><p>{notice}</p><IconButton label="알림 닫기" onClick={() => setNotice('')}><X size={15} /></IconButton></div>}
      {result && <div className="toast" role="status">
        <Check size={20} className="success" /><div><strong>내보내기 완료</strong><p>{result.name} · {formatBytes(result.size)} · {seconds(result.duration)}초 · {result.frames}프레임</p></div>
        <IconButton label="다시 다운로드" onClick={() => download(result.url, result.name)}><Download size={16} /></IconButton>
        <IconButton label="내보내기 결과 닫기" onClick={clearResult}><X size={15} /></IconButton>
      </div>}
    </div>}
    {job && <ExportDialog job={job} onCancel={() => { stopWorker(); setNotice('내보내기를 취소했습니다.') }} />}
  </main>
}

function ExportDialog({ job, onCancel }: { job: Job; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog className="dialog export-dialog" ref={dialog} aria-labelledby="export-title" onCancel={event => { event.preventDefault(); onCancel() }}>
    <div className="dialog-content">
      <div className="dialog-heading"><div><h2 id="export-title">Animated WebP 내보내기</h2><p aria-live="polite">{job.stage}</p></div><span className="export-percent">{Math.floor(job.progress)}%</span></div>
      <progress max={100} value={job.progress} aria-label="인코딩 진행률" />
      <div className="dialog-footer"><button type="button" className="button secondary" onClick={onCancel}>취소</button></div>
    </div>
  </dialog>
}
