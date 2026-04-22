#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENV_PATH = resolve(process.cwd(), '.env')
const KEY = 'STRIPE_WEBHOOK_SECRET'

let secret
try {
  secret = execSync('stripe listen --print-secret', {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .toString()
    .trim()
} catch (error) {
  console.error(
    '✖ Failed to fetch the Stripe webhook secret. Is the Stripe CLI installed and `stripe login` done?',
  )
  console.error(error.stderr?.toString() ?? error.message)
  process.exit(1)
}

if (!secret.startsWith('whsec_')) {
  console.error(`✖ Unexpected output from stripe listen --print-secret: ${secret}`)
  process.exit(1)
}

const currentEnv = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : ''
const lines = currentEnv.split('\n')

let found = false
const updated = lines.map((line) => {
  if (line.startsWith(`${KEY}=`)) {
    found = true
    return `${KEY}=${secret}`
  }
  return line
})

if (!found) updated.push(`${KEY}=${secret}`)

writeFileSync(ENV_PATH, updated.join('\n'))
console.log(`✔ ${KEY} synced to .env`)
