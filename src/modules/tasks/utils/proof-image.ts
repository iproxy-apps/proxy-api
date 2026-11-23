import { Logger } from '@nestjs/common'
import { fromBuffer } from 'file-type'
import heicConvert from 'heic-convert'
import sharp from 'sharp'
import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'

export const PROOF_MAX_EDGE = 1600
export const PROOF_JPEG_QUALITY = 82
export const ACCEPTED_PROOF_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export type NormalizedProof = {
  buffer: Buffer
  contentType: 'image/jpeg'
  extension: '.jpg'
}

const logger = new Logger('ProofImage')

const HEIC_MIMES: readonly string[] = ['image/heic', 'image/heif']

export async function normalizeProofImage(
  input: Buffer,
): Promise<NormalizedProof> {
  const type = await fromBuffer(input).catch(() => undefined)
  if (
    !type ||
    !(ACCEPTED_PROOF_MIMES as readonly string[]).includes(type.mime)
  ) {
    throw new AppException(errorDictionary.file.formatNotSupported)
  }

  try {
    let source = input
    if (HEIC_MIMES.includes(type.mime)) {
      source = Buffer.from(
        await heicConvert({ buffer: input, format: 'JPEG', quality: 0.9 }),
      )
    }

    const buffer = await sharp(source)
      .rotate()
      .resize({
        width: PROOF_MAX_EDGE,
        height: PROOF_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: PROOF_JPEG_QUALITY, mozjpeg: true })
      .toBuffer()

    return { buffer, contentType: 'image/jpeg', extension: '.jpg' }
  } catch (error) {
    logger.warn(
      `Proof image processing failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
    )
    throw new AppException(errorDictionary.file.formatNotSupported)
  }
}
