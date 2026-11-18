/* Site-wide settings. Everything a non-developer may need to change lives here. */

/** Public URL of the product (the care platform). Used for "open the demo clinic" links. */
export const APP_URL = 'https://shifora.vercel.app'

/** Contact email shown in the footer and used by the demo-request form when no endpoint is set. */
export const CONTACT_EMAIL = 'salom@shifora.uz'

/** Optional Telegram handle (without @). Leave empty to hide. */
export const TELEGRAM = ''

/**
 * Optional form endpoint (e.g. Formspree, Basin, your own API). When set, the demo-request
 * form POSTs JSON here. When empty, the form falls back to composing an email.
 */
export const FORM_ENDPOINT = ''

/** Organisation name used in structured data. */
export const ORG_NAME = 'Shifora'
