import { build } from 'tsdown'

await build({
  clean: true,
  dts: true,
  entry: 'src/*.ts',
  fixedExtension: false,
  format: 'esm',
  outDir: 'dist',
  platform: 'node',
  root: 'src',
  sourcemap: false,
  treeshake: false,
  tsconfig: 'tsconfig.json',
  unbundle: true,
})
