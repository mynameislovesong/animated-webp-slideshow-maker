import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { defaultTransition, defaults, moveClip, outputDimensions } from '../src/model.ts'
import type { TimelineClip } from '../src/model.ts'
import { frameAt, makeTimeline, timelineFrames } from '../src/timeline.ts'

const clips: TimelineClip[] = [
  { id: 'one', duration: 400, transition: { ...defaultTransition, effect: 'rgb', duration: 100 } },
  { id: 'two', duration: 700, transition: { ...defaultTransition, effect: 'digital', duration: 200 } },
  { id: 'three', duration: 1100, transition: { ...defaultTransition, effect: 'slide', duration: 500 } },
]

test('hold lengths stay intact, with transitions only between neighbors', () => {
  const { segments, total } = makeTimeline(clips)
  assert.equal(total, 2500)
  assert.deepEqual(segments.map(({ kind, start, duration, index }) => [kind, start, duration, index]), [
    ['hold', 0, 400, 0], ['transition', 400, 100, 0], ['hold', 500, 700, 1],
    ['transition', 1200, 200, 1], ['hold', 1400, 1100, 2],
  ])
})

test('all FPS values preserve short effects and exact integer-millisecond frame boundaries', () => {
  const { segments, total } = makeTimeline(clips)
  for (const fps of [5, 10, 15, 20, 24, 30]) {
    const frames = Array.from(timelineFrames(segments, fps))
    assert.ok(frames.filter(frame => frame.segment.kind === 'transition' && frame.segment.index === 0).length >= 3)
    assert.equal(frames.reduce((sum, frame) => sum + frame.duration, 0), total)
    for (const frame of frames) {
      assert.deepEqual(frameAt(segments, frame.start, fps), frame)
      assert.deepEqual(frameAt(segments, frame.start + frame.duration - 1, fps), frame)
    }
  }
})

test('one image and empty project lengths are well defined', () => {
  assert.equal(makeTimeline([]).total, 0)
  assert.equal(frameAt([], 0, 20), null)
  const { total, segments } = makeTimeline(clips.slice(0, 1))
  assert.equal(total, 400)
  assert.equal(Array.from(timelineFrames(segments, 20)).length, 1)
})

test('reordering keeps each clip’s outgoing effect and duration', () => {
  const next = moveClip(clips, 'three', 'one', false)
  assert.deepEqual(next.map(clip => clip.id), ['three', 'one', 'two'])
  assert.equal(makeTimeline(next).total, 2800)
  assert.equal(moveClip(clips, 'one', 'absent', true), clips)
})

test('original and sized output use the first image aspect ratio', () => {
  const first = { width: 600, height: 1200 }
  assert.deepEqual(outputDimensions(defaults, first), first)
  assert.deepEqual(outputDimensions({ ...defaults, resolution: '512' }, first), { width: 256, height: 512 })
  assert.deepEqual(outputDimensions({ ...defaults, resolution: 'custom', width: 320, height: 240 }, first), { width: 320, height: 240 })
})
