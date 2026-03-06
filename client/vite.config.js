import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5174,
        proxy: {
            '/api': 'http://localhost:5173',
            '/screenshots': 'http://localhost:5173',
            '/socket.io': {
                target: 'http://localhost:5173',
                ws: true
            }
        }
    }
})
