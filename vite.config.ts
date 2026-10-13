import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {readFileSync} from 'node:fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appVersion = (JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as {version: string}).version;

export default defineConfig(() => {
  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
