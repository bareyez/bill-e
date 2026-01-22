import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    base: '/bill-e/', 
    plugins: [react()],
    build: {
      outDir: 'dist',
    }
  })