import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = {
    '/api': { target: env.BACKEND_URL || 'http://127.0.0.1:5000', changeOrigin: true },
  }
  return {
    server: { proxy },
    preview: { proxy },
    plugins: [
      react(),
      tailwindcss()
    ]
  }
})
