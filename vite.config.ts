import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed at colintoft.com/torontordle/ via GitHub Pages project repo.
export default defineConfig({
  plugins: [react()],
  base: '/torontordle/',
})
