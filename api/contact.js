// Serverless function: receives a contact form submission and writes it to the
// Supabase `signups` table. Credentials come from the environment (injected by
// Doppler locally and by the Doppler integration on Vercel) — never hard-coded.
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  // Only accept POST.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment.');
    return res.status(500).json({ ok: false, error: 'Server is not configured.' });
  }

  // Vercel parses JSON bodies automatically, but guard against a string body too.
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: 'Invalid JSON body.' });
    }
  }
  body = body || {};

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  // name and email are required; message is optional.
  if (!name || !email) {
    return res.status(400).json({ ok: false, error: 'Name and email are required.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data, error } = await supabase
    .from('signups')
    .insert({ name, email, message: message || null })
    .select('id')
    .single();

  if (error) {
    console.error('Supabase insert failed:', error);
    return res.status(500).json({ ok: false, error: 'Could not save your submission.' });
  }

  return res.status(200).json({ ok: true, id: data.id });
};
