import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// En développement, l'API et le serveur MCP sont servis par Spring Boot (port 8080).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/actuator': 'http://127.0.0.1:8080',
    },
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
