// Exposes the *public* Supabase config to the browser so client-side pages can
// use the Supabase JS client without hard-coding anything. Values come from the
// environment (injected by Doppler locally and by the Doppler→Vercel integration)
// — never hard-coded and never read from a committed .env file.
//
// Only the URL and the ANON key are returned. The anon key is designed to be
// public and is safe in the browser; do NOT ever return service-role secrets here.
module.exports = function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment.');
    return res.status(500).json({ ok: false, error: 'Server is not configured.' });
  }
  // Small cache — config rarely changes and this avoids a round-trip per page load.
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({
    ok: true,
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
  });
};
