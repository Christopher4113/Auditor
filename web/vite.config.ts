import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '..', // VITE_CONVEX_URL lives in the root .env.local written by `convex dev`
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
