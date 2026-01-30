import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { resolve } from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const manifest = {
  manifest_version: 3,
  name: 'Orbit Wallet',
  version: '0.1.0',
  description: 'Privacy-first cryptocurrency wallet powered by RAILGUN',
  permissions: ['storage', 'activeTab', 'scripting', 'alarms'],
  host_permissions: ['https://*/*', 'http://localhost:*/*'],
  action: {
    default_popup: 'extension/popup/index.html',
    default_icon: {
      '16': 'icon16.png',
      '48': 'icon48.png',
      '128': 'icon128.png',
    },
  },
  background: {
    service_worker: 'extension/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['extension/content/inpage.ts'],
      run_at: 'document_start',
      all_frames: true,
    },
    {
      matches: ['<all_urls>'],
      js: ['extension/content/injector.ts'],
      run_at: 'document_start',
      all_frames: true,
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  web_accessible_resources: [
    {
      resources: ['extension/content/inpage.ts'],
      matches: ['<all_urls>'],
    },
  ],
  icons: {
    '16': 'icon16.png',
    '48': 'icon48.png',
    '128': 'icon128.png',
  },
}

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      process: true,
    }),
    crx({ manifest }),
  ],

  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'railgun-wallet': ['@railgun-community/wallet'],
          'railgun-models': ['@railgun-community/shared-models'],
          'ethers': ['ethers'],
          'wagmi': ['wagmi', 'viem'],
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },

  define: {
    __BROWSER__: 'true',
    __EXTENSION__: 'true',
  },
})
