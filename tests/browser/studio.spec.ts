import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { inspectAnimation } from '../../src/webp.ts'

const base = '/animated-webp-slideshow-maker/'
const colors = ['#db303a', '#32c963', '#3155e0']
const fixtureNames = ['red.png', 'green.png', 'blue.png']

async function fixtures(page: Page) {
  const pngs = await page.evaluate((colors) => colors.map((color, i) => {
    const canvas = document.createElement('canvas')
    canvas.width = i === 1 ? 160 : 112
    canvas.height = 80
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = color
    ctx.fillRect(0, 0, canvas.width, 80)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillRect(4 + i * 12, 14 + i * 10, 30, 12)
    return canvas.toDataURL('image/png').split(',')[1]
  }), colors)
  return pngs.map((png, i) => ({ name: fixtureNames[i], mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }))
}

async function numberField(page: Page, name: string, value: string) {
  const input = page.getByRole('spinbutton', { name, exact: false })
  await input.fill(value)
  await input.press('Enter')
}

async function exportWebP(page: Page) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'WebP 내보내기', exact: true }).click()
  const download = await pending
  expect(await download.failure()).toBeNull()
  const bytes = await readFile((await download.path())!)
  return { bytes, filename: download.suggestedFilename() }
}

async function decodeFrames(page: Page, bytes: Buffer) {
  return page.evaluate(async data => {
    const decoder = new ImageDecoder({ data: Uint8Array.from(data), type: 'image/webp', preferAnimation: true })
    await decoder.tracks.ready
    const track = decoder.tracks.selectedTrack!
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const frames: { pixel: number[]; duration: number | null; image: string }[] = []
    for (let i = 0; i < track.frameCount; i++) {
      const { image } = await decoder.decode({ frameIndex: i })
      canvas.width = image.displayWidth
      canvas.height = image.displayHeight
      ctx.drawImage(image, 0, 0)
      frames.push({
        pixel: Array.from(ctx.getImageData(55, 65, 1, 1).data),
        duration: image.duration,
        image: btoa(String.fromCharCode(...ctx.getImageData(0, 0, canvas.width, canvas.height).data)),
      })
      image.close()
    }
    decoder.close()
    return frames
  }, Array.from(bytes))
}

async function previewPixels(canvas: Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data
    return btoa(String.fromCharCode(...data))
  })
}

test('production subpath exports ordered, decodable RGB Split and Digital Glitch frames', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base)
  await page.reload()
  await page.getByLabel('이미지 파일').setInputFiles(await fixtures(page))
  await expect(page.locator('.timeline-clip')).toHaveCount(3)
  await expect(page.getByText('160 × 80 · 1.0초')).toBeVisible()

  await page.getByRole('button', { name: '클립 1 red.png' }).click()
  await numberField(page, '표시 시간', '0.4')
  await page.getByRole('button', { name: '전환 효과 선택' }).click()
  await expect(page.locator('.effect-card')).toHaveCount(16)
  await page.getByRole('button', { name: /RGB Split/ }).click()
  await numberField(page, '전환 지속 시간', '0.1')
  await page.getByRole('button', { name: '클립 2 green.png' }).click()
  await numberField(page, '표시 시간', '0.7')
  await page.getByRole('button', { name: '전환 효과 선택' }).click()
  await page.getByRole('button', { name: /Digital Glitch/ }).click()
  await numberField(page, '전환 지속 시간', '0.2')
  await page.getByRole('button', { name: '클립 3 blue.png' }).click()
  await numberField(page, '표시 시간', '1.1')
  await expect(page.locator('.timeline-total')).toContainText('2.5초')

  await page.getByRole('button', { name: '출력', exact: true }).click()
  await page.getByLabel('프레임 속도').selectOption('5')
  await page.getByRole('switch', { name: '무손실 인코딩' }).check()
  await page.getByLabel('반복', { exact: true }).selectOption('finite')
  await numberField(page, '반복 횟수', '3')
  await page.getByLabel('파일 이름').fill('glitch-test.webp')

  const canvas = page.locator('.preview-stage canvas')
  await page.getByRole('button', { name: '1번 전환 RGB Split 미리보기' }).click()
  const rgbPreview = await previewPixels(canvas)
  await page.getByRole('button', { name: '2번 전환 Digital Glitch 미리보기' }).click()
  const glitchPreview = await previewPixels(canvas)
  expect(rgbPreview).not.toBe(glitchPreview)
  await page.getByRole('button', { name: '1번 전환 RGB Split 미리보기' }).click()
  expect(await previewPixels(canvas)).toBe(rgbPreview)
  const { bytes, filename } = await exportWebP(page)
  expect(filename).toBe('glitch-test.webp')
  const expectedDurations = [400, 33, 34, 33, 700, 67, 66, 67, 1100]
  expect(inspectAnimation(Uint8Array.from(bytes).buffer)).toEqual({
    width: 112, height: 80, loops: 3, durations: expectedDurations,
  })
  const decoded = await decodeFrames(page, bytes)
  expect(decoded.map(frame => frame.duration)).toEqual(expectedDurations.map(duration => duration * 1000))
  expect(decoded[0].pixel).toEqual([219, 48, 58, 255])
  expect(decoded[4].pixel).toEqual([50, 201, 99, 255])
  expect(decoded[8].pixel).toEqual([49, 85, 224, 255])
  expect(decoded[2].image).toBe(rgbPreview)
  expect(decoded[6].image).toBe(glitchPreview)
  await expect(page.getByRole('status')).toContainText('9프레임')
  expect(errors).toEqual([])
})

test('exports a 150% crop and mouse pan only on the edited image, including its transition', async ({ page }) => {
  await page.goto(base)
  const images = await fixtures(page)
  await page.getByLabel('이미지 파일').setInputFiles(images)
  await expect(page.locator('.timeline-clip')).toHaveCount(3)
  const canvas = page.getByLabel('슬라이드쇼 프레임')
  const originals: string[] = []
  for (let i = 0; i < fixtureNames.length; i++) {
    await page.getByRole('button', { name: `클립 ${i + 1} ${fixtureNames[i]}` }).click()
    originals.push(await previewPixels(canvas))
  }

  await page.getByRole('button', { name: '클립 1 red.png' }).click()
  await page.getByRole('button', { name: '이미지 편집' }).click()
  const viewport = page.getByRole('region', { name: '이미지 크롭 영역' })
  const zoom = page.getByRole('slider', { name: '확대 배율' })
  const bounds = (await viewport.boundingBox())!
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x + 20, y)
  await page.mouse.wheel(0, -150)
  await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(100)
  await page.getByRole('button', { name: '원본으로 초기화' }).click()
  await expect(zoom).toHaveValue('100')
  await zoom.fill('150')
  await expect(zoom).toHaveAttribute('aria-valuetext', '150%')
  await page.mouse.move(x, y)
  await page.mouse.down()
  await expect(viewport).toHaveCSS('cursor', 'grabbing')
  await page.mouse.move(x + bounds.width * 0.35, y, { steps: 6 })
  await page.mouse.up()
  await page.getByRole('button', { name: '편집 완료' }).click()
  const cropped = await previewPixels(canvas)
  expect(cropped === originals[0]).toBe(false)
  const expected = await page.evaluate(async data => {
    const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    canvas.width = 112
    canvas.height = 80
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, -20, 168, 120)
    bitmap.close()
    return btoa(String.fromCharCode(...ctx.getImageData(0, 0, 112, 80).data))
  }, images[0].buffer.toString('base64'))
  expect(cropped === expected).toBe(true)

  await page.getByRole('button', { name: '아래로 이동' }).click()
  await expect(page.getByRole('button', { name: '클립 2 red.png' })).toBeVisible()
  await page.getByRole('button', { name: '이미지 편집' }).click()
  await expect(zoom).toHaveValue('150')
  await page.getByRole('button', { name: '편집 완료' }).click()
  await page.getByRole('button', { name: '위로 이동' }).click()
  expect(await previewPixels(canvas) === cropped).toBe(true)

  await page.getByRole('button', { name: '전환 효과 선택' }).click()
  await page.getByRole('button', { name: /RGB Split/ }).click()
  await numberField(page, '전환 지속 시간', '0.1')
  await page.getByRole('button', { name: '1번 전환 RGB Split 미리보기' }).click()
  const transition = await previewPixels(canvas)
  await page.getByRole('button', { name: '출력', exact: true }).click()
  await page.getByRole('switch', { name: '무손실 인코딩' }).check()

  const { bytes } = await exportWebP(page)
  expect(inspectAnimation(Uint8Array.from(bytes).buffer)).toEqual({
    width: 112, height: 80, loops: 0, durations: [1000, 33, 34, 33, 1000, 1000],
  })
  const decoded = await decodeFrames(page, bytes)
  expect(decoded[0].image === cropped).toBe(true)
  expect(decoded[2].image === transition).toBe(true)
  expect(decoded[4].image === originals[1]).toBe(true)
  expect(decoded[5].image === originals[2]).toBe(true)
})

test.describe('crop touch gestures', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  test('pinches to zoom and drags the enlarged image on a mobile viewport', async ({ page }) => {
    await page.goto(base)
    await page.getByLabel('이미지 파일').setInputFiles((await fixtures(page))[0])
    const edit = page.getByRole('button', { name: '이미지 편집' })
    await edit.tap()
    const viewport = page.getByRole('region', { name: '이미지 크롭 영역' })
    const zoom = page.getByRole('slider', { name: '확대 배율' })
    const bounds = (await viewport.boundingBox())!
    const x = Math.round(bounds.x + bounds.width / 2)
    const y = Math.round(bounds.y + bounds.height / 2)
    const touch = await page.context().newCDPSession(page)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 50, y, id: 1 }, { x: x + 50, y, id: 2 }] })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(150)
    await page.getByRole('button', { name: '가운데 정렬' }).tap()
    const editorCanvas = viewport.locator('canvas')
    const centered = await editorCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    for (const offset of [12, 24, 34, 40, 42]) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + offset, y, id: 1 }] })
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await touch.detach()
    await expect.poll(async () => (await editorCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())) !== centered).toBe(true)
    await page.getByRole('button', { name: '원본으로 초기화' }).tap()
    await expect(zoom).toHaveValue('100')
    await page.getByRole('button', { name: '편집 완료' }).tap()
    await expect(page.getByLabel('슬라이드쇼 프레임')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })
})

test('single image, invalid image, reordering, and mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(base)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const images = await fixtures(page)
  await page.getByLabel('이미지 파일').setInputFiles([
    { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid') }, images[0], images[1],
  ])
  await expect(page.getByRole('alert')).toContainText('broken.png')
  await expect(page.locator('.timeline-clip')).toHaveCount(2)
  await page.getByRole('button', { name: '아래로 이동' }).click()
  await expect(page.locator('.timeline-clip').first()).toHaveAttribute('aria-label', '클립 1 green.png')
  await page.getByRole('button', { name: 'green.png 삭제' }).click()
  const { bytes } = await exportWebP(page)
  expect(inspectAnimation(Uint8Array.from(bytes).buffer)).toEqual({ width: 112, height: 80, loops: 0, durations: [1000] })
  const decoded = await decodeFrames(page, bytes)
  expect(decoded).toHaveLength(1)
  expect(decoded[0].pixel[0]).toBeGreaterThan(180)
  await page.getByRole('button', { name: '초기화' }).click()
  await expect(page.getByRole('heading', { name: '이미지로 슬라이드쇼 만들기' })).toBeVisible()
})

test('paste, drop, cancel during WASM startup, and retry', async ({ page }) => {
  await page.goto(base)
  await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#a34a8a'
    ctx.fillRect(0, 0, 64, 64)
    const data = Uint8Array.from(atob(canvas.toDataURL().split(',')[1]), character => character.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([data], 'clipboard.png', { type: 'image/png' }))
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer }))
    document.querySelector('main')!.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
  })
  await expect(page.locator('.timeline-clip')).toHaveCount(2)
  let downloads = 0
  page.on('download', () => { downloads++ })
  let release = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/*.wasm', async route => {
    await gate
    await route.abort().catch(() => undefined)
  })
  await page.getByRole('button', { name: 'WebP 내보내기', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '취소', exact: true }).click()
  release()
  await page.unroute('**/*.wasm')
  await expect(page.getByRole('alert')).toContainText('내보내기를 취소했습니다.')
  expect(downloads).toBe(0)
  const { bytes } = await exportWebP(page)
  expect(inspectAnimation(Uint8Array.from(bytes).buffer).durations).toEqual([1000, 1000])
  expect(downloads).toBe(1)
})
