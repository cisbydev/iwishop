import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The manifest is deliberately maintained as a static public file.
      manifest: false,
      // Registration will be added only in a later, explicitly approved step.
      injectRegister: false,
      registerType: 'prompt',
      devOptions: {
        enabled: false,
      },
      workbox: {
        // Precache only immutable frontend build/public assets.
        globPatterns: ['**/*.{html,js,css,svg,png,webp,woff2,webmanifest}'],
        globIgnores: ['**/sw.js', '**/workbox-*.js', '**/*.map'],
        // Never cache API, authenticated, user-uploaded, or runtime responses.
        runtimeCaching: [],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        // An update must wait for an explicit user-approved registration step.
        clientsClaim: false,
        skipWaiting: false,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
  },
})
