import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed at https://torontordle.com via GitHub Pages (custom apex domain;
// see public/CNAME). Served at the domain root, so base is '/'.
export default defineConfig({
  plugins: [react()],
  base: '/',
})
