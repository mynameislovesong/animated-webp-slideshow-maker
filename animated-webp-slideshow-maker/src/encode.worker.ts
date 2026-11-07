import encode, { init } from '@jsquash/webp/encode.js'
import { Renderer } from './renderer.ts'
import { framesIn, makeTimeline, timelineFrames } from './timeline.ts'
import { AnimatedWebP, inspectAnimation } from './webp.ts'
import type { ExportMessage, ExportRequest } from './export-protocol.ts'

const send = (message: ExportMessage) => self.postMessage(message)

async function run({ clips, width, height, settings }: ExportRequest) {
  const { segments, total } = makeTimeline(clips)
  const frameCount = segments.reduce((sum, segment) => sum + framesIn(segment, settings.fps), 0)
  send({ type: 'progress', stage: 'WebAssembly 인코더 불러오는 중', progress: 0 })
  try {
    await init()
  } catch {
    throw new Error('WebAssembly 인코더를 불러올 수 없습니다. 페이지를 새로고침해 주세요.')
  }

  const canvas = new OffscreenCanvas(width, height)
  const renderer = new Renderer(canvas)
  const ctx = canvas.getContext('2d')!
  const mux = new AnimatedWebP(width, height, settings.loops, settings.background)
  const images: ImageBitmap[] = []
  const opened = new Set<number>()
  const expected: number[] = []
  try {
    send({ type: 'progress', stage: '이미지 디코딩 및 프레임 인코딩 중', progress: 2 })
    for (const frame of timelineFrames(segments, settings.fps)) {
      const { index, kind } = frame.segment
      for (const slot of opened) {
        if (slot < index) {
          images[slot].close()
          opened.delete(slot)
          delete images[slot]
        }
      }
      const end = index + Number(kind === 'transition')
      for (let slot = index; slot <= end; slot++) {
        if (!opened.has(slot)) {
          images[slot] = await createImageBitmap(clips[slot].file)
          opened.add(slot)
        }
      }
      renderer.draw(images, frame, settings)
      const imageData = ctx.getImageData(0, 0, width, height)
      const encoded = await encode(imageData, { quality: settings.quality, lossless: Number(settings.lossless), method: 3, low_memory: 1 })
      mux.append(encoded, frame.duration)
      expected.push(frame.duration)
      if (expected.length % 4 === 0 || expected.length === frameCount) {
        send({ type: 'progress', stage: `프레임 인코딩 중 · ${expected.length}/${frameCount}`, progress: 2 + 95 * expected.length / frameCount })
      }
    }
    send({ type: 'progress', stage: 'Animated WebP 형식과 재생 시간 확인 중', progress: 98 })
    const blob = mux.assemble()
    const info = inspectAnimation(await blob.arrayBuffer())
    if (info.width !== width || info.height !== height || info.loops !== settings.loops ||
        info.durations.length !== expected.length || info.durations.some((duration, i) => duration !== expected[i])) {
      throw new Error('인코딩된 파일이 타임라인과 일치하지 않습니다.')
    }
    send({ type: 'result', blob, frames: frameCount, duration: total })
  } finally {
    for (const slot of opened) images[slot].close()
    renderer.dispose()
    canvas.width = 1
    canvas.height = 1
  }
}

self.onmessage = ({ data }: MessageEvent<ExportRequest>) => {
  run(data).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : ''
    const isMemory = error instanceof RangeError || /memory|alloc|out of bounds|canvas/i.test(message)
    send({
      type: 'error',
      message: isMemory
        ? '브라우저 메모리가 부족합니다. 해상도, 프레임 수 또는 이미지 수를 줄여 주세요.'
        : message && /[가-힣]/.test(message) ? message : 'WebP 인코딩에 실패했습니다. 이미지 형식과 해상도를 확인해 주세요.',
    })
  })
}
