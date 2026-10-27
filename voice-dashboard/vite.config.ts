import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: './', // <-- Tambahkan ini agar path asset menjadi relative
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})