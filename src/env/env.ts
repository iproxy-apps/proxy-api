import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.string(),
  PORT: z.coerce.number().optional().default(3333),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  JWT_PRIVATE_KEY: z.string(),
  JWT_PUBLIC_KEY: z.string(),
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_PUBLIC_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string(),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
  DEV_CALLBACK_URL: z.string(),
  PROD_CALLBACK_URL: z.string(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  AWS_SES_FROM_EMAIL: z.string(),
  LOOP_TEST_HOOKS: z.enum(['0', '1']).default('0'),
})

export type Env = z.infer<typeof envSchema>
