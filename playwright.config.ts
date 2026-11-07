import { defineConfig } from '@playwright/test'

const base = '/animated-webp-slideshow-maker/'
const port = Number(process.env.PLAYWRIGHT_PORT || 4175)
const origin = `http://127.0.0.1:${port}`
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: origin,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1366, height: 880 },
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin + base,
    env: { VITE_BASE_PATH: base },
  },
})
