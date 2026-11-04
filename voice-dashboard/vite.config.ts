import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const appPackage = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appPackage.version) },
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: './', // <-- Tambahkan ini agar path asset menjadi relative
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})