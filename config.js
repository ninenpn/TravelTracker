/* App configuration.
 * googleClientId: OAuth Web client ID (public, not a secret) so people can sign in with Google and edit the sheet.
 * Create it once at console.cloud.google.com (see the in-app guide: Menu -> Google account -> Client ID). */
window.TT_CONFIG = {
  googleClientId: '',
  // Supabase (read-only data source). The publishable key is public by design; data is protected by row-level security.
  // NEVER put the secret key (sb_secret_...) here or anywhere in this repo.
  supabase: { url: 'https://vqelnacauxxprredxjda.supabase.co', key: 'sb_publishable_r5o_W0BafIaL9vbBZBUFAA_MXd-Djbm' }
};
