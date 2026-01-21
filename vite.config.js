import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    base: '/bill-e/', // Critical for assets to load correctly
    plugins: [react()],
  })