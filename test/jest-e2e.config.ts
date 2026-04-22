import type { Config } from 'jest'

const config: Config = {
  rootDir: '..',
  testRegex: '.*\\.e2e-spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          target: 'es2024',
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: true,
          strictNullChecks: true,
          noImplicitAny: false,
          skipLibCheck: true,
          baseUrl: '.',
          paths: { 'src/*': ['src/*'] },
        },
      },
    ],
  },
  setupFiles: ['<rootDir>/test/setup/load-env.ts'],
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
  testTimeout: 30000,
  maxWorkers: 1,
  clearMocks: true,
}

export default config
