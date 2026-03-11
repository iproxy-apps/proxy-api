import { memoryStorage } from 'multer'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'

export function imageExtensionFromMime(mime: string) {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/webp':
      return '.webp'
    default:
      return null
  }
}

export const multerOptions = {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },

  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']

    if (!allowed.includes(file.mimetype)) {
      return cb(new AppException(errorDictionary.file.formatNotSupported), false) // prettier-ignore
    }

    cb(null, true)
  },

  storage: memoryStorage(),
} as const
