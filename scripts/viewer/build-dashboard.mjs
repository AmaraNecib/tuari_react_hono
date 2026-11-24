import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
let pending;
// Resolve pinned workspace tools without downloading packages or starting a server.
export function buildDashboard() {
  pending ??= compile();
  return pending;
}
async function compile() {
  const root = process.env.VIEWER_DEPENDENCY_ROOT ?? fileURLToPath(new URL('../../apps/web/', import.meta.url));
  const require = createRequire(resolve(root, 'package.json'));
  const { build } = await import(pathToFileURL(require.resolve('vite')).href);
  const result = await build({
    configFile: false, logLevel: 'error',
    resolve: { alias: [
      { find: /^react-dom\/client$/, replacement: require.resolve('react-dom/client') },
      { find: /^react-dom$/, replacement: require.resolve('react-dom') },
      { find: /^react$/, replacement: require.resolve('react') },
    ] },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { write: false, minify: true, cssCodeSplit: false, lib: { entry: fileURLToPath(new URL('./dashboard.jsx', import.meta.url)), formats: ['iife'], name: 'DiagnosticsReport' } },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
  return { js: outputs.find(item => item.type === 'chunk').code, css: outputs.find(item => item.fileName.endsWith('.css')).source };
}
