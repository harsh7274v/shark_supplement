import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Empty REACT_APP_BACKEND_URL = the frontend calls its own origin (`/api`),
  // exactly like production, where the Pages function proxies `/api` to the
  // worker. Cookies then stay first-party and no CORS is involved.
  const backendUrl = env.REACT_APP_BACKEND_URL || '';
  // The dev proxy forwards those same-origin `/api` calls to the local worker.
  const proxyTarget = backendUrl || 'http://localhost:8787';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      open: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    define: {
      'process.env.REACT_APP_BACKEND_URL': JSON.stringify(backendUrl),
      'process.env.REACT_APP_GOOGLE_ENABLED': JSON.stringify(env.REACT_APP_GOOGLE_ENABLED ?? 'false'),
    },
  };
});

