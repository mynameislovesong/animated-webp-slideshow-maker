import { clamp, type Fit } from './model.ts'

export type Size = { width: number; height: number }
export type Point = { x: number; y: number }
export type Crop = { scale: number; offsetX: number; offsetY: number; allowGaps: boolean }
export type CropGeometry = { image: Size; frame: Size; fit: Fit }

export const defaultCrop: Crop = { scale: 1, offsetX: 0, offsetY: 0, allowGaps: false }
export const maxCropScale = 8
export const minCropScale = (crop: Crop) => crop.allowGaps ? 0.25 : 1

function fittedSize({ image, frame, fit }: CropGeometry): Size {
  // An edited image uses a uniform fit even when the project's unedited mode is Stretch.
  const fitScale = Math[fit === 'cover' ? 'max' : 'min'](frame.width / image.width, frame.height / image.height)
  return { width: image.width * fitScale / frame.width, height: image.height * fitScale / frame.height }
}

export function constrainCrop(geometry: CropGeometry, crop: Crop): Crop {
  const base = fittedSize(geometry)
  const scale = clamp(crop.scale, minCropScale(crop), maxCropScale)
  const width = base.width * scale
  const height = base.height * scale
  // Keep existing Contain margins centered. Allow gaps explicitly to move past an edge.
  const limitX = Math.max(0, crop.allowGaps ? (width + 1) / 2 : (width - 1) / 2)
  const limitY = Math.max(0, crop.allowGaps ? (height + 1) / 2 : (height - 1) / 2)
  return {
    ...crop, scale,
    offsetX: limitX ? clamp(crop.offsetX, -limitX, limitX) : 0,
    offsetY: limitY ? clamp(crop.offsetY, -limitY, limitY) : 0,
  }
}

export function cropRect(geometry: CropGeometry, crop: Crop) {
  const base = fittedSize(geometry)
  const { scale, offsetX, offsetY } = constrainCrop(geometry, crop)
  const width = base.width * scale
  const height = base.height * scale
  return { x: 0.5 + offsetX - width / 2, y: 0.5 + offsetY - height / 2, width, height }
}

export function zoomCrop(geometry: CropGeometry, crop: Crop, scale: number, from: Point, to = from): Crop {
  const current = constrainCrop(geometry, crop)
  const nextScale = clamp(scale, minCropScale(current), maxCropScale)
  const factor = nextScale / current.scale
  return constrainCrop(geometry, {
    ...current,
    scale: nextScale,
    offsetX: to.x - 0.5 + (0.5 + current.offsetX - from.x) * factor,
    offsetY: to.y - 0.5 + (0.5 + current.offsetY - from.y) * factor,
  })
}
