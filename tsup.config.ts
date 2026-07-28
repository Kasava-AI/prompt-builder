import { defineConfig } from 'tsup'

export default defineConfig({
  // Three entry points so the core stays zero-dependency: `/zod` is the only one
  // that imports zod, and `/presets` carries the domain-shaped generators.
  entry: ['src/index.ts', 'src/presets.ts', 'src/zod.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  // zod is an optional peer — never bundle it.
  external: ['zod'],
})
