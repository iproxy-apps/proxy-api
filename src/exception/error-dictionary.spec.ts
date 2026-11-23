import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

import { errorDictionary } from './error-dictionary'

const SRC_DIR = join(__dirname, '..')
const DICTIONARY_FILE = join(__dirname, 'error-dictionary.ts')

const flatten = (node: object, prefix = ''): string[] =>
  Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    const isGroup =
      typeof value === 'object' && value !== null && !('errorCode' in value)
    return isGroup ? flatten(value, path) : [path]
  })

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

describe('errorDictionary', () => {
  it('has no dead entries: every path is referenced under src/', () => {
    const sources = walk(SRC_DIR)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => file !== DICTIONARY_FILE && !file.endsWith('.spec.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')

    const dead = flatten(errorDictionary).filter(
      (path) => !sources.includes(`errorDictionary.${path}`),
    )

    expect(dead).toEqual([])
  })
})
