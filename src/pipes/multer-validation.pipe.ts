import { memoryStorage } from 'multer'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'

export const multerOptions = {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },

  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    // HEIC/HEIF is Apple's default camera format since iOS 11 — accepting it
    // means iPhone users don't need any client-side conversion. React Native's
    // <Image /> renders it natively on iOS.
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ]

    if (!allowed.includes(file.mimetype)) {
      return cb(new AppException(errorDictionary.file.formatNotSupported), false) // prettier-ignore
    }

    cb(null, true)
  },

  storage: memoryStorage(),
} as const
