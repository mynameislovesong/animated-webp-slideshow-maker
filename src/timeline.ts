import type { TimelineClip, Transition } from './model.ts'

export type Segment =
  | { kind: 'hold'; start: number; duration: number; index: number }
  | { kind: 'transition'; start: number; duration: number; index: number; transition: Transition; seed: number }

export type Frame = { segment: Segment; start: number; duration: number; progress: number; tick: number }

function hash(text: string) {
  let value = 2166136261
  for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 16777619)
  return value >>> 0
}

export function makeTimeline(clips: TimelineClip[]) {
  const segments: Segment[] = []
  let total = 0
  clips.forEach((clip, index) => {
    segments.push({ kind: 'hold', index, start: total, duration: clip.duration })
    total += clip.duration
    if (index < clips.length - 1 && clip.transition.effect !== 'none') {
      const { duration } = clip.transition
      segments.push({ kind: 'transition', index, start: total, duration, transition: clip.transition, seed: hash(clip.id) })
      total += duration
    }
  })
  return { segments, total }
}

export function framesIn(segment: Segment, fps: number) {
  return segment.kind === 'hold' ? 1 : Math.max(3, Math.ceil(segment.duration * fps / 1000))
}

function makeFrame(segment: Segment, count: number, tick: number): Frame {
  const offset = Math.round(segment.duration * tick / count)
  return {
    segment, start: segment.start + offset, tick,
    duration: Math.round(segment.duration * (tick + 1) / count) - offset,
    progress: (tick + 0.5) / count,
  }
}

export function frameAt(segments: Segment[], time: number, fps: number) {
  if (!segments.length) return null
  const last = segments[segments.length - 1]
  const clamped = Math.max(0, Math.min(time, last.start + last.duration - 1))
  const segment = segments.find(item => clamped < item.start + item.duration) ?? last
  const count = framesIn(segment, fps)
  const offset = clamped - segment.start
  let tick = Math.floor(offset * count / segment.duration)
  while (tick + 1 < count && Math.round(segment.duration * (tick + 1) / count) <= offset) tick++
  while (tick > 0 && Math.round(segment.duration * tick / count) > offset) tick--
  return makeFrame(segment, count, tick)
}

export function* timelineFrames(segments: Segment[], fps: number) {
  for (const segment of segments) {
    const count = framesIn(segment, fps)
    for (let tick = 0; tick < count; tick++) yield makeFrame(segment, count, tick)
  }
}
