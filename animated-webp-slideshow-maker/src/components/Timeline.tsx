import { Diamond, Film, MousePointer2 } from 'lucide-react'
import { effects, seconds, timestamp, type Clip } from '../model.ts'
import type { Segment } from '../timeline.ts'
import { allowReorder, clipDrag, dropClip, type Reorder } from './Library.tsx'

export function Timeline({ clips, segments, total, time, selectedId, onSelect, onTransition, onSeek, onReorder }: {
  clips: Clip[]; segments: Segment[]; total: number; time: number; selectedId: string | null
  onSelect: (id: string, time?: number) => void; onTransition: (id: string) => void; onSeek: (time: number) => void; onReorder: Reorder
}) {
  // Minimum chip widths keep brief frames editable. The ruler and playhead use the same mapping.
  const widths = segments.map(segment => Math.max(segment.kind === 'hold' ? 88 : 42, segment.duration * 0.11))
  let trackWidth = 0
  const offsets = widths.map(width => {
    const offset = trackWidth
    trackWidth += width
    return offset
  })
  const trackPosition = (value: number) => {
    const index = segments.findIndex(segment => value < segment.start + segment.duration)
    return index < 0 ? trackWidth : offsets[index] + widths[index] * (value - segments[index].start) / segments[index].duration
  }
  function seekFromOffset(offset: number) {
    const index = offsets.findIndex((start, i) => offset < start + widths[i])
    if (index < 0) return onSeek(total)
    const segment = segments[index]
    onSeek(segment.start + Math.round(segment.duration * Math.max(0, offset - offsets[index]) / widths[index]))
  }

  return <section className="panel timeline" aria-label="타임라인">
    <div className="panel-heading">
      <div className="flex items-center gap-2"><Film size={16} /><h2>타임라인</h2><span className="badge">{clips.length}개 클립</span></div>
      <span className="timeline-total">전체 길이 <b>{seconds(total)}초</b></span>
    </div>
    {total ? <div className="timeline-scroll">
      <div className="timeline-inner" style={{ width: trackWidth + 28 }}>
        <div className="ruler" aria-hidden="true" onClick={event => seekFromOffset(event.clientX - event.currentTarget.getBoundingClientRect().left)}>
          {segments.map((segment, index) => <span key={segment.start} style={{ left: offsets[index] }}>{timestamp(segment.start).slice(0, -2)}</span>)}
        </div>
        <div className="track">
          {segments.map((segment, index) => {
            const clip = clips[segment.index]
            const width = widths[index]
            if (segment.kind === 'transition') {
              const effect = effects.find(item => item.id === segment.transition.effect)
              return <button type="button" key={`effect-${clip.id}`} style={{ width }} className="transition-marker"
                aria-label={`${segment.index + 1}번 전환 ${effect?.name} 미리보기`} title={`${effect?.name} · ${seconds(segment.duration)}초`}
                onClick={() => onTransition(clip.id)}><Diamond size={13} fill="currentColor" /></button>
            }
            return <button type="button" key={clip.id} style={{ width }} className={`timeline-clip ${clip.id === selectedId ? 'selected' : ''}`}
              aria-pressed={clip.id === selectedId} aria-label={`클립 ${segment.index + 1} ${clip.name}`} draggable
              onDragStart={event => clipDrag(clip.id, event)} onDragOver={allowReorder}
              onDrop={event => dropClip(event, clip.id, true, onReorder)}
              onClick={event => {
                const bounds = event.currentTarget.getBoundingClientRect()
                const offset = event.detail ? Math.max(0, Math.min(0.999, (event.clientX - bounds.left) / width)) : 0
                onSelect(clip.id, segment.start + Math.floor(segment.duration * offset))
              }}>
              <img src={clip.url} alt="" draggable={false} />
              <span>{String(segment.index + 1).padStart(2, '0')}</span><b>{seconds(segment.duration)}초</b>
            </button>
          })}
        </div>
        <div className="playhead" style={{ left: 14 + trackPosition(time) }} aria-hidden="true" />
      </div>
    </div> : <div className="timeline-empty"><MousePointer2 size={17} /><span>이미지를 추가하면 타임라인에 클립이 표시됩니다.</span></div>}
  </section>
}
