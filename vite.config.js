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
        // One entry per microfrontend this host consumes. Empty on purpose: a
        // freshly scaffolded host consumes nothing yet, you add the remotes you
        // need here.
        //
        // The key is the federation-safe name you import from ("exampleremote/Button").
        // The string passed to remoteUrl() is the *slug* of the microfrontend in the
        // orchestrator.
        //
        // Never write a URL here. The host does not choose the version it gets: the
        // backend resolves it and remoteUrl() returns that URL, already pinned, verbatim.
        //
        // exampleremote: {
        //   external: `import('@mfe-orchestrator-hub/client').then(m => m.remoteUrl('example-remote'))`,
        //   externalType: 'promise'
        // }
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
