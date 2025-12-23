import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // To sprawi, że serwer będzie dostępny w sieci (nie tylko localhost)
    host: true, 
    
    // TUTAJ dodajemy Twój adres z Tailscale
    allowedHosts: [
      'rafal.tail692f2a.ts.net'
    ]
    
    // Alternatywnie, jeśli nie chcesz wpisywać adresu za każdym razem:
    // allowedHosts: true,
  },
})