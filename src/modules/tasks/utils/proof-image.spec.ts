import { fromBuffer } from 'file-type'
import heicConvert from 'heic-convert'
import sharp from 'sharp'
import { AppException } from 'src/exception/app.exception'
import { normalizeProofImage } from './proof-image'

jest.mock('heic-convert')

const base = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: '#ff0000' },
  })
const png = (w: number, h: number) => base(w, h).png().toBuffer()
const webp = (w: number, h: number) => base(w, h).webp().toBuffer()
const jpeg = (w: number, h: number) => base(w, h).jpeg().toBuffer()

describe('normalizeProofImage', () => {
  beforeEach(() => jest.clearAllMocks())

  it('downscales a 2000x1000 PNG to a 1600x800 JPEG', async () => {
    const out = await normalizeProofImage(await png(2000, 1000))
    expect(out.contentType).toBe('image/jpeg')
    expect(out.extension).toBe('.jpg')
    expect((await fromBuffer(out.buffer))?.mime).toBe('image/jpeg')
    const meta = await sharp(out.buffer).metadata()
    expect(meta.width).toBe(1600)
    expect(meta.height).toBe(800)
  })

  it('does not enlarge small images', async () => {
    const out = await normalizeProofImage(await png(300, 200))
    const meta = await sharp(out.buffer).metadata()
    expect(meta.width).toBe(300)
    expect(meta.height).toBe(200)
  })

  it('accepts WEBP and JPEG inputs', async () => {
    for (const input of [await webp(100, 100), await jpeg(100, 100)]) {
      const out = await normalizeProofImage(input)
      expect((await fromBuffer(out.buffer))?.mime).toBe('image/jpeg')
    }
  })

  it('rejects non-images by content even when the extension lies', async () => {
    await expect(
      normalizeProofImage(Buffer.from('%PDF-1.4 fake pdf body')),
    ).rejects.toMatchObject({ errorCode: 'FILE_FORMAT_NOT_SUPPORTED' })
    await expect(
      normalizeProofImage(Buffer.from('garbage')),
    ).rejects.toMatchObject({ errorCode: 'FILE_FORMAT_NOT_SUPPORTED' })
  })

  it('routes HEIC (ftyp heic) and HEIF (ftyp mif1) through heic-convert', async () => {
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypheic'),
      Buffer.alloc(16),
    ])
    const heif = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypmif1'),
      Buffer.alloc(16),
    ])
    ;(heicConvert as unknown as jest.Mock).mockResolvedValue(
      await jpeg(400, 300),
    )
    for (const input of [heic, heif]) {
      const out = await normalizeProofImage(input)
      expect((await fromBuffer(out.buffer))?.mime).toBe('image/jpeg')
    }
    expect(heicConvert).toHaveBeenCalledTimes(2)
    expect(heicConvert).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'JPEG' }),
    )
  })

  it('rejects a truncated PNG with a valid header', async () => {
    const truncated = (await png(100, 100)).subarray(0, 64)
    await expect(normalizeProofImage(truncated)).rejects.toMatchObject({
      errorCode: 'FILE_FORMAT_NOT_SUPPORTED',
    })
  })

  it('wraps heic-convert failures in an AppException', async () => {
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypheic'),
      Buffer.alloc(16),
    ])
    ;(heicConvert as unknown as jest.Mock).mockRejectedValue(
      new Error('libheif: boom'),
    )
    const result = normalizeProofImage(heic)
    await expect(result).rejects.toBeInstanceOf(AppException)
    await expect(result).rejects.toMatchObject({
      errorCode: 'FILE_FORMAT_NOT_SUPPORTED',
    })
  })

  it('rejects a truncated EBML header that makes file-type throw', async () => {
    await expect(
      normalizeProofImage(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x84])),
    ).rejects.toMatchObject({ errorCode: 'FILE_FORMAT_NOT_SUPPORTED' })
  })
})
