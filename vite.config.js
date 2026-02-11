import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './server/vite-plugin.js'

export default defineConfig({
  plugins: [react(), apiPlugin()],
})
