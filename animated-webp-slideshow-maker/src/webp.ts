// RFC 9649 RIFF container. The codec supplies VP8/VP8L bitstreams.
function fourCC(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4))
}

function writeCC(bytes: Uint8Array, offset: number, value: string) {
  for (let i = 0; i < 4; i++) bytes[offset + i] = value.charCodeAt(i)
}

function read24(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function write24(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value
  bytes[offset + 1] = value >>> 8
  bytes[offset + 2] = value >>> 16
}

function header(type: string, size: number) {
  const bytes = new Uint8Array(8)
  writeCC(bytes, 0, type)
  new DataView(bytes.buffer).setUint32(4, size, true)
  return bytes
}

function* readChunks(bytes: Uint8Array, offset = 12, limit = bytes.byteLength) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  while (offset < limit) {
    if (offset + 8 > limit) throw new Error('WebP 청크 헤더가 잘렸습니다.')
    const length = view.getUint32(offset + 4, true)
    const end = offset + 8 + length + (length % 2)
    if (end > limit) throw new Error('WebP 청크 크기가 잘못되었습니다.')
    yield { type: fourCC(bytes, offset), offset, length, end }
    offset = end
  }
}

function assertRiff(bytes: Uint8Array) {
  if (bytes.length < 12 || fourCC(bytes, 0) !== 'RIFF' || fourCC(bytes, 8) !== 'WEBP' ||
      new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true) !== bytes.length - 8) {
    throw new Error('유효한 WebP 컨테이너를 생성하지 못했습니다.')
  }
}

function validatePayload(bytes: Uint8Array, offset: number, end: number) {
  const chunks = [...readChunks(bytes, offset, end)]
  if (chunks.length !== 1 || !['VP8 ', 'VP8L'].includes(chunks[0].type) || !chunks[0].length) {
    throw new Error('WebP 프레임 비트스트림이 잘못되었습니다.')
  }
}

export class AnimatedWebP {
  private readonly parts: Uint8Array<ArrayBuffer>[] = []
  private size = 0
  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly loops: number,
    private readonly background: string,
  ) {}

  append(bitstream: ArrayBuffer, duration: number) {
    const bytes = new Uint8Array(bitstream)
    assertRiff(bytes)
    const image = [...readChunks(bytes)].find(({ type }) => type === 'VP8 ' || type === 'VP8L')
    if (!image?.length) throw new Error('WASM 인코더가 이미지 데이터를 반환하지 않았습니다.')
    const data = bytes.subarray(image.offset, image.end)
    const meta = new Uint8Array(16)
    write24(meta, 6, this.width - 1)
    write24(meta, 9, this.height - 1)
    write24(meta, 12, duration)
    meta[15] = 0b10 // The opaque frame replaces the previous canvas.
    this.size += 8 + meta.byteLength + data.byteLength
    if (this.size > 192 * 1024 * 1024) throw new Error('출력이 192MB를 넘었습니다. 해상도나 품질을 낮춰 주세요.')
    this.parts.push(header('ANMF', meta.byteLength + data.byteLength), meta, data)
  }

  assemble() {
    if (!this.parts.length) throw new Error('내보낼 프레임이 없습니다.')
    const extended = new Uint8Array(10)
    extended[0] = 0b10
    write24(extended, 4, this.width - 1)
    write24(extended, 7, this.height - 1)
    const anim = new Uint8Array(6)
    const color = Number.parseInt(this.background.slice(1), 16)
    const view = new DataView(anim.buffer)
    view.setUint32(0, 0xff000000 | color, true)
    view.setUint16(4, this.loops, true)

    const riff = header('RIFF', 4 + 18 + 14 + this.size)
    return new Blob([riff, 'WEBP', header('VP8X', 10), extended, header('ANIM', 6), anim, ...this.parts], { type: 'image/webp' })
  }
}

export function inspectAnimation(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  assertRiff(bytes)
  let width = 0
  let height = 0
  let loops = -1
  const durations: number[] = []
  for (const chunk of readChunks(bytes)) {
    const start = chunk.offset + 8
    if (chunk.type === 'VP8X' && chunk.length === 10 && (bytes[start] & 0b10)) {
      width = read24(bytes, start + 4) + 1
      height = read24(bytes, start + 7) + 1
    }
    if (chunk.type === 'ANIM' && chunk.length === 6) {
      loops = new DataView(buffer).getUint16(start + 4, true)
    }
    if (chunk.type === 'ANMF' && chunk.length >= 24) {
      const duration = read24(bytes, start + 12)
      if (duration < 1 || read24(bytes, start + 6) + 1 !== width || read24(bytes, start + 9) + 1 !== height) {
        throw new Error('Animated WebP 프레임의 크기 또는 재생 시간이 올바르지 않습니다.')
      }
      validatePayload(bytes, start + 16, chunk.end)
      durations.push(duration)
    }
  }
  if (!width || !height || loops < 0 || !durations.length) throw new Error('Animated WebP 형식 검증에 실패했습니다.')
  return { width, height, loops, durations }
}
