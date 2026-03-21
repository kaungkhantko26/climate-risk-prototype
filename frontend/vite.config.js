import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildId = process.env.VITE_APP_BUILD_ID || new Date().toISOString()

const buildVersionPlugin = () => ({
  name: 'climate-monitor-build-version',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify(
        {
          build_id: buildId,
          generated_at: new Date().toISOString(),
        },
        null,
        2,
      ),
    })
  },
})

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [react(), buildVersionPlugin()],
  server: {
    port: 5173,
  },
})
