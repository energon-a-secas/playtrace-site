// Public configuration only. Never put an operator token or secret here.
// apiBase must be pinned here, not taken from a URL or browser storage.
export const CONFIG = Object.freeze({
  apiBase: 'https://playtrace-api.neorgon.workers.dev/api/v1',
  accountsReady: true,
  featuredGameId: 'g_1x2q29h', // DROPZONE; only shown while present in the catalogue.
  turnstileSiteKey: '',
  removalContact: 'https://balise.neorgon.com/report/',
});
