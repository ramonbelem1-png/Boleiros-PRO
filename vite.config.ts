import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const buildVersion = mode === 'production' ? String(Date.now()) : 'dev';

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'emit-version-json',
        closeBundle() {
          if (mode === 'production') {
            const distDir = path.resolve(__dirname, 'dist');
            if (fs.existsSync(distDir)) {
              fs.writeFileSync(
                path.join(distDir, 'version.json'),
                JSON.stringify({ version: buildVersion })
              );
            }
          }
        },
      },
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      '__APP_VERSION__': JSON.stringify(buildVersion),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: ['es2020', 'safari14', 'chrome87', 'firefox78'],
      cssTarget: 'safari14',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/xlsx')) {
              return 'vendor-xlsx';
            }
            if (id.includes('node_modules/firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/motion') || id.includes('node_modules/lucide-react')) {
              return 'vendor-ui';
            }
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react';
            }
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
