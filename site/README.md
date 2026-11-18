# Shifora — marketing site

The public website that presents Shifora to medical centres. Built with [Astro](https://astro.build)
as a fully static site: no server, no framework runtime in the browser, three languages
(Uzbek default, Russian, English).

```bash
cd site
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
```

## Where things live

| Path | What |
| --- | --- |
| `src/config.ts` | **Change these first:** product URL for the demo links, contact email, Telegram, optional form endpoint |
| `astro.config.mjs` | `SITE_URL` — the public domain, used for canonical URLs, hreflang and the sitemap |
| `src/i18n/uz.ts`, `ru.ts`, `en.ts` | Every piece of copy, one file per language, identical shape |
| `src/components/home/*` | Landing-page sections in order: Hero, Facts, Story, Gap, Flow, Platform, Safety, Compare, Capacity, Pilot, Faq, Cta |
| `src/components/pages/*` | Secondary pages: Platform, Safety, Pilot |
| `src/pages/[...slug].astro` | Generates all routes for all languages |
| `src/assets/screens/*.png` | Real screenshots of the product (demo clinic); Astro resizes and converts them at build time |
| `src/styles/global.css` | Design tokens (palette, type scale, spacing) and shared primitives |
| `public/og-*.png` | Social preview images per language |

## Routes

| Page | UZ | RU | EN |
| --- | --- | --- | --- |
| Landing | `/` | `/ru` | `/en` |
| Platform | `/platforma` | `/ru/platforma` | `/en/platform` |
| Safety | `/xavfsizlik` | `/ru/bezopasnost` | `/en/safety` |
| Pilot | `/pilot` | `/ru/pilot` | `/en/pilot` |

## Demo-request form

By default the form composes an email to `CONTACT_EMAIL` (opens the visitor's mail app).
Set `FORM_ENDPOINT` in `src/config.ts` to a form service URL (Formspree, Basin, or your own
API accepting JSON) and the form will POST there instead and show an inline confirmation.

## Deploying on Vercel

Create a separate Vercel project for this folder: *Root Directory* = `site`, framework preset
*Astro* (auto-detected). No environment variables are required. Update `SITE_URL` and
`public/robots.txt` with the real domain before the first production deploy.

## Evidence

Every statistic on the site is footnoted; the sources are listed in `sources` inside each
language file and rendered in the footer. Do not add numbers without a source.
