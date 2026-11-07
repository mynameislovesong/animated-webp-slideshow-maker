import { ChevronDown, ChevronLeft, ChevronRight, Diamond, Image, Play, Settings2, SlidersHorizontal, WandSparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { directionFor, durationLimits, effects, fpsOptions, maxDimension, presets, resolutionOptions, type Clip, type Direction, type Effect, type Settings, type Transition } from '../model.ts'
import { Renderer } from '../renderer.ts'
import { Field, IconButton, NumberField } from './Controls.tsx'

const labels: Record<Direction, string> = { left: '왼쪽', right: '오른쪽', up: '위쪽', down: '아래쪽', in: '확대', out: '축소' }
const resolutionNames = ['원본 해상도', '512 px', '768 px', '1024 px', '1536 px', '사용자 지정']
const fitNames = { contain: '전체 표시', cover: '영역 채우기', stretch: '늘리기' } as const

function sampleImage(variant: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 108
  canvas.height = 52
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 108, 52)
  gradient.addColorStop(0, variant ? '#0b4953' : '#39265d')
  gradient.addColorStop(1, variant ? '#191f43' : '#12182a')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 108, 52)
  ctx.fillStyle = variant ? '#55d6bd' : '#a58af7'
  ctx.beginPath()
  ctx.arc(variant ? 75 : 28, 16, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = variant ? '#38888c' : '#805ac8'
  ctx.beginPath()
  ctx.moveTo(0, 52)
  ctx.lineTo(34, variant ? 28 : 34)
  ctx.lineTo(47, 43)
  ctx.lineTo(70, variant ? 34 : 19)
  ctx.lineTo(108, 52)
  ctx.fill()
  return canvas
}

function EffectCard({ effect, active, onSelect }: { effect: typeof effects[number]; active: boolean; onSelect: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!canvas.current) return
    const renderer = new Renderer(canvas.current)
    const transition: Transition = { effect: effect.id, duration: 300, strength: 80, direction: directionFor(effect.id, 'left') }
    renderer.draw([{ bitmap: sampleImage(0) }, { bitmap: sampleImage(1) }], {
      segment: { kind: 'transition', start: 0, duration: 300, index: 0, seed: 2893, transition },
      start: 100, duration: 100, tick: 2, progress: 0.5,
    }, { fit: 'contain', background: '#13121c' })
    return () => renderer.dispose()
  }, [effect.id])
  return <button type="button" className={`effect-card ${active ? 'selected' : ''}`} onClick={onSelect} aria-pressed={active}>
    <canvas width={108} height={52} ref={canvas} aria-hidden="true" />
    <strong>{effect.name}</strong><small>{effect.label}</small>
  </button>
}

function EffectPicker({ value, onSelect, onClose }: { value: Effect; onSelect: (id: Effect) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="dialog effect-dialog" aria-labelledby="effects-title"
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dialog-content">
      <div className="dialog-heading">
        <div><h2 id="effects-title">전환 효과</h2><p>카드를 선택하면 미리보기에 바로 적용됩니다.</p></div>
        <IconButton label="효과 선택 닫기" onClick={onClose}><X size={19} /></IconButton>
      </div>
      <div className="effect-scroll">
        {[effects.slice(0, 8), effects.slice(8)].map((group, index) => <section key={index}>
          <h3>{index ? '글리치 효과' : '기본 효과'}</h3>
          <div className="effect-grid">{group.map(effect => <EffectCard key={effect.id} effect={effect} active={value === effect.id}
            onSelect={() => { onSelect(effect.id); onClose() }} />)}</div>
        </section>)}
      </div>
    </div>
  </dialog>
}

export function Inspector({ clip, index, count, settings, dimensions, collapsed, onCollapse, onDuration, onTransition, onPreview, onApplyDuration, onApplyEffect, onPreset, onSettings }: {
  clip?: Clip; index: number; count: number; settings: Settings; dimensions: { width: number; height: number }; collapsed: boolean
  onCollapse: () => void; onDuration: (value: number) => void; onTransition: (patch: Partial<Transition>) => void
  onPreview: () => void; onApplyDuration: () => void; onApplyEffect: () => void
  onPreset: (index: number) => void; onSettings: (patch: Partial<Settings>) => void
}) {
  const [tab, setTab] = useState<'clip' | 'output'>('clip')
  const [choosing, setChoosing] = useState(false)
  const transition = clip?.transition ?? settings.defaultTransition
  const effect = effects.find(item => item.id === transition.effect)!
  const isLast = !!clip && index === count - 1
  const enabled = transition.effect !== 'none'
  const directionOptions = transition.effect === 'zoom' ? ['in', 'out'] as const : ['left', 'right', 'up', 'down'] as const

  return <aside className={`panel inspector ${collapsed ? 'collapsed' : ''}`} aria-label="설정">
    <div className="panel-heading">
      <div className="flex items-center gap-2"><SlidersHorizontal size={16} /><h2>설정</h2></div>
      <IconButton label={collapsed ? '설정 펼치기' : '설정 접기'} onClick={onCollapse} aria-expanded={!collapsed}>
        {collapsed ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
      </IconButton>
    </div>
    {!collapsed && <>
      <div className="inspector-tabs" aria-label="설정 종류">
        <button type="button" className={tab === 'clip' ? 'active' : ''} aria-pressed={tab === 'clip'} onClick={() => setTab('clip')}><Image size={15} /> 클립</button>
        <button type="button" className={tab === 'output' ? 'active' : ''} aria-pressed={tab === 'output'} onClick={() => setTab('output')}><Settings2 size={15} /> 출력</button>
      </div>
      <div className="inspector-scroll">
        {tab === 'clip' ? <>
          <section className="inspector-section">
            <h3><Image size={15} /> {clip ? `클립 ${String(index + 1).padStart(2, '0')}` : '기본 클립 설정'}</h3>
            {clip && <p className="clip-caption" title={clip.name}>{clip.name} · {clip.bitmap.width} × {clip.bitmap.height}</p>}
            <NumberField key={clip?.id} label="표시 시간" value={(clip?.duration ?? settings.defaultDuration) / 1000}
              min={0.1} max={durationLimits.clip / 1000} step={0.1} unit="초" onChange={value => onDuration(Math.round(value * 1000))} />
            <button type="button" className="text-button" disabled={!count} onClick={onApplyDuration}>모든 클립에 시간 적용</button>
          </section>
          <section className="inspector-section">
            <h3><Diamond size={15} /> 다음 이미지로 전환</h3>
            {isLast && <p className="clip-caption">마지막 클립 뒤에는 전환 구간이 없습니다.</p>}
            <div className="field">
              <span>효과</span>
              <button type="button" className="effect-trigger" onClick={() => setChoosing(true)} aria-label="전환 효과 선택">
                <span className="effect-symbol"><Diamond size={13} /></span>
                <span><strong>{effect.name}</strong><small>{effect.label}</small></span><ChevronDown size={15} />
              </button>
            </div>
            {enabled && <>
              <Field label={`효과 강도 · ${transition.strength}`}>
                <input type="range" aria-label="효과 강도" value={transition.strength} min={0} max={100}
                  onChange={event => onTransition({ strength: Number(event.target.value) })} />
              </Field>
              <NumberField key={`transition-${clip?.id}`} label="전환 지속 시간" value={transition.duration / 1000}
                min={0.1} max={durationLimits.transition / 1000} step={0.1} unit="초" onChange={value => onTransition({ duration: Math.round(value * 1000) })} />
              {effect.directional && <Field label="방향">
                <select value={directionFor(effect.id, transition.direction)} onChange={event => onTransition({ direction: event.target.value as Direction })}>
                  {directionOptions.map(direction => <option value={direction} key={direction}>{labels[direction]}</option>)}
                </select>
              </Field>}
            </>}
            <div className="section-actions">
              <button type="button" className="text-button" disabled={count < 2} onClick={onApplyEffect}>모든 전환에 적용</button>
              <button type="button" className="text-button" disabled={!clip || isLast || !enabled} onClick={onPreview}><Play size={13} /> 효과 재생</button>
            </div>
          </section>
          <section className="inspector-section">
            <h3><WandSparkles size={15} /> 프리셋</h3>
            <Field label="시간과 전환을 한 번에 적용">
              <select value="" onChange={event => onPreset(Number(event.target.value))}>
                <option value="" disabled>프리셋 선택</option>
                {presets.map(({ name }, index) => <option key={name} value={index}>{name}</option>)}
              </select>
            </Field>
          </section>
        </> : <>
          <section className="inspector-section">
            <h3><Image size={15} /> 캔버스</h3>
            <Field label="해상도" note={`출력 크기 ${dimensions.width} × ${dimensions.height} px`}>
              <select value={settings.resolution} onChange={event => onSettings({ resolution: event.target.value as Settings['resolution'] })}>
                {resolutionOptions.map((item, index) => <option value={item} key={item}>{resolutionNames[index]}</option>)}
              </select>
            </Field>
            {settings.resolution === 'custom' && <div className="two-fields">
              <NumberField label="너비" value={settings.width} min={1} max={maxDimension} unit="px" onChange={width => onSettings({ width })} />
              <NumberField label="높이" value={settings.height} min={1} max={maxDimension} unit="px" onChange={height => onSettings({ height })} />
            </div>}
            <Field label="비율 처리">
              <select value={settings.fit} onChange={event => onSettings({ fit: event.target.value as Settings['fit'] })}>
                {Object.entries(fitNames).map(([fit, label]) => <option value={fit} key={fit}>{fit[0].toUpperCase() + fit.slice(1)} · {label}</option>)}
              </select>
            </Field>
            <Field label="배경색"><div className="color-control"><input type="color" value={settings.background} onChange={event => onSettings({ background: event.target.value })} /><span>{settings.background.toUpperCase()}</span></div></Field>
          </section>
          <section className="inspector-section">
            <h3><Settings2 size={15} /> 애니메이션</h3>
            <Field label="프레임 속도">
              <select value={settings.fps} onChange={event => onSettings({ fps: Number(event.target.value) as Settings['fps'] })}>
                {fpsOptions.map(fps => <option key={fps} value={fps}>{fps} FPS</option>)}
              </select>
            </Field>
            <label className="switch-field"><span>무손실 인코딩</span><input type="checkbox" role="switch" checked={settings.lossless} onChange={event => onSettings({ lossless: event.target.checked })} /></label>
            <Field label={`품질 · ${settings.quality}`} note={settings.lossless ? '무손실 모드에서는 품질 값이 압축 노력에 영향을 줍니다.' : undefined}>
              <input type="range" aria-label="품질" min={1} max={100} value={settings.quality} onChange={event => onSettings({ quality: Number(event.target.value) })} />
            </Field>
            <Field label="반복">
              <select aria-label="반복" value={settings.loops ? 'finite' : 'infinite'} onChange={event => onSettings({ loops: event.target.value === 'finite' ? 1 : 0 })}>
                <option value="infinite">무한 반복</option><option value="finite">반복 횟수 지정</option>
              </select>
            </Field>
            {settings.loops > 0 && <NumberField label="반복 횟수" value={settings.loops} min={1} max={65535} unit="회" onChange={loops => onSettings({ loops })} />}
            <Field label="파일 이름"><div className="input-unit"><input type="text" maxLength={100} value={settings.filename}
              onChange={event => onSettings({ filename: event.target.value })}
              onBlur={event => onSettings({ filename: event.target.value.trim().replace(/\.webp$/i, '') })} /><span>.webp</span></div></Field>
          </section>
        </>}
      </div>
    </>}
    {choosing && <EffectPicker value={effect.id} onClose={() => setChoosing(false)}
      onSelect={id => onTransition({ effect: id, direction: directionFor(id, transition.direction) })} />}
  </aside>
}
