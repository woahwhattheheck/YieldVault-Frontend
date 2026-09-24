import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildSecurityHeaders } from './security/policy.mjs';

/**
 * Attach production security headers to vite preview (and optionally custom
 * middleware). Dev HMR needs eval/inline for transforms, so we do not apply
 * the restrictive CSP to `vite dev` — use `vite preview` for parity checks.
 */
function securityHeadersPlugin() {
  const headers = buildSecurityHeaders();
  return {
    name: 'yieldvault-security-headers',
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        for (const [name, value] of Object.entries(headers)) {
          res.setHeader(name, value);
        }
        next();
      });
    },
  };
}

// Vite configuration for the YieldVault frontend.
export default defineConfig({
  plugins: [react(), securityHeadersPlugin()],
  server: {
    port: 5173,
    open: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './test/setup.ts',
    exclude: ['test/lib/**', 'node_modules', 'dist', '.idea', '.git', '.cache'],
  },
});
