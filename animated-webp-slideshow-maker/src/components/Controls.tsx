import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { clamp } from '../model.ts'

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} className={`icon-button ${className}`} {...props}>{children}</button>
}

export function Field({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return <label className="field">
    <span>{label}</span>
    {children}
    {note && <small>{note}</small>}
  </label>
}

export function NumberField({ label, value, min, max, step = 1, unit, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  function commit() {
    const parsed = draft.trim() ? Number(draft) : NaN
    const decimals = step < 1 ? 1 : 0
    const next = Number.isFinite(parsed) ? clamp(Number((Math.round(parsed / step) * step).toFixed(decimals)), min, max) : value
    setDraft(String(next))
    if (next !== value) onChange(next)
  }
  return <Field label={label}>
    <div className="input-unit">
      <input type="number" min={min} max={max} step={step} value={draft}
        onChange={event => setDraft(event.target.value)} onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      {unit && <span>{unit}</span>}
    </div>
  </Field>
}
