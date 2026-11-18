import type { ImageMetadata } from 'astro'

const modules = import.meta.glob<ImageMetadata>('../assets/screens/*.png', { eager: true, import: 'default' })

/** Product screenshots keyed by file name without extension, e.g. `dashboard`, `m-patient-home`. */
export const screens: Record<string, ImageMetadata> = Object.fromEntries(
  Object.entries(modules).map(([path, img]) => [path.split('/').pop()!.replace(/\.png$/, ''), img]),
)

export function screen(key: string): ImageMetadata {
  const img = screens[key]
  if (!img) throw new Error(`Unknown screen "${key}"`)
  return img
}
