//@ts-check

'use strict';

require('esbuild').build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node12.16',
  external: ['vscode'],
});
