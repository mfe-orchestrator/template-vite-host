import { defineConfig } from 'vite'
import federation from '@originjs/vite-plugin-federation'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'app',
      // A host is consumable as a remote too: the orchestrator serves this file
      // at assets/remoteEntry.js, which is what the catalogue entry declares.
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.jsx'
      },
      remotes: {
        
      },
      shared: ['react','react-dom']
    })
  ],
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false
  }
})
