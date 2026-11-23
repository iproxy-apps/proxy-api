import { z } from 'zod'

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email())

export const passwordSchema = z.string().min(8).max(72)
