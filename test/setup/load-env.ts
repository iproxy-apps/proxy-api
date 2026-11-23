import { config } from 'dotenv'
import { resolve } from 'node:path'

// Values already in process.env win (global-setup exports the per-run ones),
// so overlapping runs never read each other's database or keys.
if (process.env.PROXY_TEST_ENV_FILE) {
  config({ path: process.env.PROXY_TEST_ENV_FILE })
}
config({ path: resolve(__dirname, '..', '.env.test') })
