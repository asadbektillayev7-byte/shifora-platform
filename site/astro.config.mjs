import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

// Public URL of the marketing site. Change this when the production domain is known.
export const SITE_URL = 'https://shifora.uz'

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  i18n: {
    defaultLocale: 'uz',
    locales: ['uz', 'ru', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  build: { inlineStylesheets: 'auto' },
})
