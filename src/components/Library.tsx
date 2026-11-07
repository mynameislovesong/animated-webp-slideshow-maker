import { ArrowDown, ArrowUp, GripVertical, Image, Images, Plus, Trash2 } from 'lucide-react'
import type { DragEvent } from 'react'
import { seconds, type Clip } from '../model.ts'
import { IconButton } from './Controls.tsx'

export const clipMime = 'application/x-webp-studio-clip'
export type Reorder = (source: string, target: string, after: boolean) => void

export function clipDrag(id: string, event: DragEvent<HTMLElement>) {
  event.dataTransfer.setData(clipMime, id)
  event.dataTransfer.effectAllowed = 'move'
}

export function allowReorder(event: DragEvent<HTMLElement>) {
  if (event.dataTransfer.types.includes(clipMime)) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }
}

export function dropClip(event: DragEvent<HTMLElement>, id: string, horizontal: boolean, reorder: Reorder) {
  const source = event.dataTransfer.getData(clipMime)
  if (!source) return
  event.preventDefault()
  event.stopPropagation()
  const bounds = event.currentTarget.getBoundingClientRect()
  const after = horizontal ? event.clientX > bounds.left + bounds.width / 2 : event.clientY > bounds.top + bounds.height / 2
  reorder(source, id, after)
}

export function Library({ clips, selectedId, busy, onSelect, onRemove, onAdd, onReorder }: {
  clips: Clip[]; selectedId: string | null; busy: boolean
  onSelect: (id: string) => void; onRemove: (id: string) => void; onAdd: () => void; onReorder: Reorder
}) {
  return <aside className="panel library" aria-label="이미지 목록">
    <div className="panel-heading">
      <div className="flex items-center gap-2"><Images size={16} /><h2>이미지</h2><span className="badge">{clips.length}</span></div>
      <IconButton label="이미지 더 추가" onClick={onAdd}><Plus size={17} /></IconButton>
    </div>
    <div className="library-scroll">
      {clips.length ? <ol className="library-list">{clips.map((clip, index) => (
        <li key={clip.id} className={clip.id === selectedId ? 'selected' : ''} draggable
          onDragStart={event => clipDrag(clip.id, event)} onDragOver={allowReorder}
          onDrop={event => dropClip(event, clip.id, false, onReorder)}>
          <GripVertical size={14} className="handle" aria-hidden="true" />
          <button type="button" className="library-select" onClick={() => onSelect(clip.id)} aria-pressed={clip.id === selectedId} title={clip.name}>
            <img src={clip.url} alt="" draggable={false} />
            <span className="min-w-0"><strong>{clip.name}</strong><small>{clip.bitmap.width} × {clip.bitmap.height} · {seconds(clip.duration)}초</small></span>
          </button>
          <IconButton label={`${clip.name} 삭제`} className="remove" onClick={() => onRemove(clip.id)}><Trash2 size={14} /></IconButton>
          {selectedId === clip.id && <div className="order-buttons">
            <IconButton label="위로 이동" disabled={index === 0} onClick={() => onReorder(clip.id, clips[index - 1].id, false)}><ArrowUp size={13} /></IconButton>
            <IconButton label="아래로 이동" disabled={index === clips.length - 1} onClick={() => onReorder(clip.id, clips[index + 1].id, true)}><ArrowDown size={13} /></IconButton>
          </div>}
        </li>
      ))}</ol> : <div className="library-empty">
        <div className="small-illustration"><Image size={21} /></div>
        <p>추가된 이미지가 없어요</p>
        <small>파일을 추가하면 이곳에서<br />순서를 편집할 수 있어요.</small>
      </div>}
      {busy && <p className="library-loading" role="status">이미지 불러오는 중…</p>}
    </div>
    <div className="library-footer"><button type="button" className="button secondary w-full" onClick={onAdd}><Plus size={15} /> 이미지 추가</button></div>
  </aside>
}
