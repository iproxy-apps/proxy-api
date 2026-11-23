import { isLocalDatabase, isTestHooksEnabled } from './test-hooks.guard'

describe('isTestHooksEnabled', () => {
  it('is true only for LOOP_TEST_HOOKS=1 outside production', () => {
    expect(
      isTestHooksEnabled({ LOOP_TEST_HOOKS: '1', NODE_ENV: 'development' }),
    ).toBe(true)
    expect(isTestHooksEnabled({ LOOP_TEST_HOOKS: '1', NODE_ENV: 'test' })).toBe(
      true,
    )
    expect(
      isTestHooksEnabled({ LOOP_TEST_HOOKS: '1', NODE_ENV: 'production' }),
    ).toBe(false)
    expect(
      isTestHooksEnabled({ LOOP_TEST_HOOKS: '0', NODE_ENV: 'development' }),
    ).toBe(false)
    expect(isTestHooksEnabled({})).toBe(false)
  })
})

describe('isLocalDatabase', () => {
  it('accepts loopback hosts and rejects everything else', () => {
    expect(
      isLocalDatabase(
        'postgresql://postgres:docker@localhost:5432/proxy?schema=public',
      ),
    ).toBe(true)
    expect(isLocalDatabase('postgresql://u:p@127.0.0.1:5432/proxy')).toBe(true)
    expect(
      isLocalDatabase('postgresql://u:p@db.railway.internal:5432/proxy'),
    ).toBe(false)
    expect(isLocalDatabase('not a url')).toBe(false)
  })
})
