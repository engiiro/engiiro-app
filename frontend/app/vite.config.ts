import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // backendをローカルで直接起動している間は、別オリジンでもここを経由すれば
    // CORSを意識せず叩ける。VITE_API_BASE_URLを明示的に指定した場合はそちらを使う
    // （src/data/apiClient.ts参照）ため、その場合proxyは使われない。
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_ORIGIN ?? 'http://localhost:8010',
        changeOrigin: true,
      },
    },
  },
})
