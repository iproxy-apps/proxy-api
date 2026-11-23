import { z } from 'zod'

export const envSchema = z
  .object({
    DATABASE_URL: z.string(),
    PORT: z.coerce.number().optional().default(3333),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    NODE_ENV: z.enum(['development', 'production', 'test']),
    JWT_PRIVATE_KEY: z.string(),
    JWT_PUBLIC_KEY: z.string(),
    STRIPE_SECRET_KEY: z.string(),
    STRIPE_WEBHOOK_SECRET: z.string(),
    STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_CONNECT_RETURN_URL: z.url(),
    AWS_REGION: z.string().default('us-east-1'),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),
    AWS_SES_FROM_EMAIL: z.string(),
    LOOP_TEST_HOOKS: z.enum(['0', '1']).default('0'),
    // proof storage: S3-compatible (Cloudflare R2) when S3_BUCKET is set, else local disk
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    PROOF_DIR: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      !env.STRIPE_CONNECT_RETURN_URL.startsWith('https://')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_CONNECT_RETURN_URL'],
        message: 'must be https in production',
      })
    }
  })

export type Env = z.infer<typeof envSchema>
