import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = 'http://127.0.0.1:4000';

function proxyApiErrorHandler(proxy, _options) {
  proxy.on('error', (err, _req, res) => {
    if (!res || typeof res.writeHead !== 'function' || res.writableEnded || res.headersSent) return;
    try {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error:
            'API server is not running or closed the connection. In a second terminal run: cd server && npm run dev',
        })
      );
    } catch {
      /* ignore */
    }
    // Avoid noisy stack for common dev mistake (backend down)
    if (err.code !== 'ECONNREFUSED' && err.code !== 'ECONNRESET') {
      console.error('[vite proxy]', err.message);
    }
  });
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        configure: proxyApiErrorHandler,
      },
      '/uploads': {
        target: API_TARGET,
        changeOrigin: true,
        configure: proxyApiErrorHandler,
      },
    },
  },
});
