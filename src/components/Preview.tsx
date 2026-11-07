import { ImagePlus, Maximize2, Minimize2, Pause, Play, Repeat2, SkipBack } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { resizeToFit, timestamp, type Clip, type Settings } from '../model.ts'
import { Renderer } from '../renderer.ts'
import { frameAt, type Segment } from '../timeline.ts'
import { IconButton } from './Controls.tsx'
import { CropEditor, type CropUpdate } from './CropEditor.tsx'

export function Preview({ clips, segments, total, time, playing, repeat, settings, dimensions, editingClip, onCrop, onCropDone, onAdd, onSeek, onToggle, onRepeat }: {
  clips: Clip[]; segments: Segment[]; total: number; time: number; playing: boolean; repeat: boolean
  settings: Settings; dimensions: { width: number; height: number }
  editingClip?: Clip; onCrop: (update: CropUpdate) => void; onCropDone: () => void
  onAdd: () => void; onSeek: (time: number) => void; onToggle: () => void; onRepeat: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const panel = useRef<HTMLElement>(null)
  const renderer = useRef<Renderer | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState('')
  const hasClips = clips.length > 0
  const hasPreview = hasClips && !editingClip
  const preview = resizeToFit(dimensions.width, dimensions.height, 1280)
  const frame = frameAt(segments, time, settings.fps)
  const frameStart = frame?.start
  const latestFrame = useRef(frame)
  latestFrame.current = frame

  useEffect(() => {
    if (!canvas.current) return
    try {
      const engine = new Renderer(canvas.current, { width: dimensions.width, height: dimensions.height })
      renderer.current = engine
      setError('')
      return () => { engine.dispose(); renderer.current = null }
    } catch {
      setError('미리보기를 초기화할 수 없습니다.')
    }
  }, [hasPreview, preview.width, preview.height, dimensions.width, dimensions.height])

  useEffect(() => {
    const current = latestFrame.current
    if (!current || !renderer.current) return
    try {
      renderer.current.draw(clips, current, settings)
      setError('')
    } catch {
      setError('미리보기 이미지를 그릴 수 없습니다.')
    }
  }, [hasPreview, clips, frameStart, segments, preview.width, preview.height, dimensions.width, dimensions.height, settings])

  useEffect(() => {
    const update = () => setExpanded(document.fullscreenElement === panel.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await panel.current?.requestFullscreen()
    } catch {
      setExpanded(false)
    }
  }

  return <section className="panel preview" ref={panel} aria-label="미리보기">
    <div className="panel-heading">
      <div className="flex items-center gap-2"><span className="preview-indicator" /><h2>{editingClip ? '이미지 편집' : '미리보기'}</h2></div>
      <div className="flex items-center gap-2">
        <span className="badge dim">{hasClips ? `${dimensions.width} × ${dimensions.height}` : '캔버스'}</span>
        <IconButton label={expanded ? '전체 화면 닫기' : '전체 화면'} onClick={fullscreen}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</IconButton>
      </div>
    </div>
    {editingClip ? <CropEditor key={editingClip.id} clip={editingClip} dimensions={dimensions} settings={settings} onChange={onCrop} onDone={onCropDone} /> : <>
    <div className="preview-stage">
      {hasClips ? <>
        <canvas ref={canvas} width={preview.width} height={preview.height} aria-label="슬라이드쇼 프레임" />
        {error && <span className="preview-error" role="alert">{error}</span>}
      </> : <div className="empty-stage">
        <div className="upload-art" aria-hidden="true"><div /><div /><span><ImagePlus size={32} strokeWidth={1.6} /></span></div>
        <h1>이미지로 슬라이드쇼 만들기</h1>
        <p>이미지를 여기에 놓거나 파일을 선택하세요.</p>
        <button type="button" className="button primary" onClick={onAdd}><ImagePlus size={16} /> 이미지 선택</button>
        <small>PNG, JPG, JPEG, WebP <span>·</span> <kbd>Ctrl</kbd> + <kbd>V</kbd>로 붙여넣기</small>
      </div>}
    </div>
    <div className="transport">
      <div className="transport-buttons">
        <IconButton label="처음으로 이동" onClick={() => onSeek(0)} disabled={!total}><SkipBack size={16} /></IconButton>
        <IconButton label={playing ? '일시정지' : '재생'} className="play-button" onClick={onToggle} disabled={!total}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</IconButton>
        <IconButton label="미리보기 반복 재생" aria-pressed={repeat} className={repeat ? 'is-active' : ''} onClick={onRepeat}><Repeat2 size={17} /></IconButton>
      </div>
      <input className="scrubber" aria-label="재생 위치" type="range" min={0} max={total || 1} step={1} value={time}
        onChange={event => onSeek(Number(event.target.value))} disabled={!total} />
      <div className="time"><b>{timestamp(time)}</b><span> / </span>{timestamp(total)}</div>
    </div>
    </>}
  </section>
}
