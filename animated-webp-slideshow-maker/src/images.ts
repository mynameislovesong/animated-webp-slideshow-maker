import type { Clip, Settings } from './model.ts'
import { resizeToFit } from './model.ts'

const supported = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function readClip(file: File, settings: Settings): Promise<Clip> {
  if (!supported.has(file.type) && !(file.type === '' && /\.(png|jpe?g|webp)$/i.test(file.name))) {
    throw new Error('PNG, JPG, JPEG, WebP 형식만 사용할 수 있습니다.')
  }
  if (file.size > 60 * 1024 * 1024) throw new Error('이미지 한 장은 60MB 이하여야 합니다.')
  const bitmap = await createImageBitmap(file)
  try {
    const size = resizeToFit(bitmap.width, bitmap.height, 240)
    const thumb = document.createElement('canvas')
    Object.assign(thumb, size)
    const ctx = thumb.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    const thumbnail = await new Promise<Blob>((resolve, reject) => {
      thumb.toBlob(blob => blob ? resolve(blob) : reject(new Error('썸네일을 생성할 수 없습니다.')))
    })
    return {
      id: crypto.randomUUID(), name: file.name || '붙여넣은 이미지', file, bitmap,
      url: URL.createObjectURL(thumbnail), duration: settings.defaultDuration, transition: { ...settings.defaultTransition },
    }
  } catch (error) {
    bitmap.close()
    throw error
  }
}

export function releaseClip(clip: Clip) {
  clip.bitmap.close()
  URL.revokeObjectURL(clip.url)
}
