import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // Lets the cross-repo baseline suite import real consumer modules from
      // the sibling repos and have them resolve against local source rather
      // than whatever version is installed in their node_modules.
      '@kasava/prompt-builder': resolve(HERE, 'src/index.ts'),
    },
  },
  server: {
    fs: {
      // Sibling repos (monroe, kasava) live one level up from this one.
      allow: [resolve(HERE, '..')],
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    typecheck: {
      include: ['test/**/*.test-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // index.ts is a pure re-export barrel — no logic to cover.
      exclude: ['src/index.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
