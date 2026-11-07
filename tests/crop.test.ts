import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { constrainCrop, cropRect, defaultCrop, zoomCrop, type CropGeometry } from '../src/crop.ts'

const square: CropGeometry = { image: { width: 300, height: 300 }, frame: { width: 200, height: 200 }, fit: 'contain' }

test('zoom keeps the point beneath the cursor in place until the pan bounds are reached', () => {
  const cursor = { x: 0.7, y: 0.25 }
  const crop = zoomCrop(square, defaultCrop, 1.5, cursor)
  const rect = cropRect(square, crop)
  assert.ok(Math.abs((cursor.x - rect.x) / rect.width - cursor.x) < 1e-10)
  assert.ok(Math.abs((cursor.y - rect.y) / rect.height - cursor.y) < 1e-10)
})

test('panning limits keep existing margins centered unless gaps are allowed', () => {
  const wide: CropGeometry = { ...square, image: { width: 600, height: 300 } }
  const crop = { ...defaultCrop, scale: 1.5, offsetX: 0.8, offsetY: -0.8 }
  assert.deepEqual(constrainCrop(wide, crop), { ...crop, offsetX: 0.25, offsetY: 0 })
  assert.deepEqual(constrainCrop(wide, { ...crop, allowGaps: true }), { ...crop, allowGaps: true })
  assert.equal(constrainCrop(wide, { ...crop, scale: 0.5 }).scale, 1)
  assert.equal(constrainCrop(wide, { ...crop, scale: 0.5, allowGaps: true }).scale, 0.5)
})

test('crop proportions stay fixed across resolution changes and preserve image aspect under Stretch', () => {
  const geometry: CropGeometry = { ...square, image: { width: 300, height: 150 }, fit: 'stretch' }
  const crop = { ...defaultCrop, scale: 2, offsetX: 0.2 }
  const rect = cropRect(geometry, crop)
  assert.equal(rect.width * geometry.frame.width / (rect.height * geometry.frame.height), 2)
  assert.deepEqual(cropRect({ ...geometry, frame: { width: 1024, height: 1024 } }, crop), rect)
})
