import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
<<<<<<< HEAD
=======
    host: true,
    port: 5173,
>>>>>>> dd13e359edf8315579d074f38944983b2ae3d396
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
<<<<<<< HEAD
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      }
    }
  }
=======
      },
    },
  },
>>>>>>> dd13e359edf8315579d074f38944983b2ae3d396
})
