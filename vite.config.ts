import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const LAN_IP = '192.168.150.100'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,         // or "0.0.0.0" – listen on all interfaces
    port: 5173,
    strictPort: true,
    hmr: {
      host: LAN_IP,     // what clients should connect back to
      port: 5173,
      clientPort: 5173, // mobile browsers sometimes need this explicit
    },
    proxy: {
      "/daily-registry": {
        target: "http://localhost:4000",
        changeOrigin: false,
      },
    },    
  },
})