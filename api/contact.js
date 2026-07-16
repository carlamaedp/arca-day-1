// Serverless function: receives a contact form submission and writes it to the
// Supabase `signups` table. Credentials come from the environment (injected by
// Doppler locally and by the Doppler integration on Vercel) — never hard-coded.
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// Sends a friendly confirmation email in the Carma Studio voice. Best-effort:
// any failure is logged and swallowed so it never fails the form submission.
async function sendConfirmationEmail(name, email) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping confirmation email.');
    return false;
  }

  const resend = new Resend(apiKey);
  const firstName = name.split(/\s+/)[0] || name;

  const { error } = await resend.emails.send({
    // Swap for your verified domain sender once set up in Resend.
    from: 'Carma Studio <onboarding@resend.dev>',
    to: email,
    subject: `Thanks for reaching out, ${firstName}`,
    text:
      `Hi ${firstName},\n\n` +
      `Thank you for reaching out to Carma Studio — we're genuinely glad you did.\n\n` +
      `Your message has landed with us, and someone will be in touch soon. ` +
      `Everything we do starts from one belief: intentional, high-quality work ` +
      `naturally creates results that come back to you. We'll bring that same care ` +
      `to whatever you're building.\n\n` +
      `Talk soon,\n` +
      `The Carma Studio team`,
    html:
      `<div style="font-family:Georgia,'Times New Roman',serif;color:#142B52;line-height:1.6;font-size:16px;max-width:520px;margin:0 auto;">` +
      `<p>Hi ${firstName},</p>` +
      `<p>Thank you for reaching out to <strong>Carma Studio</strong> — we're genuinely glad you did.</p>` +
      `<p>Your message has landed with us, and someone will be in touch soon. Everything we do starts from one belief: ` +
      `<em style="color:#D4B06A;">intentional, high-quality work naturally creates results that come back to you.</em> ` +
      `We'll bring that same care to whatever you're building.</p>` +
      `<p style="margin-top:28px;">Talk soon,<br/>The Carma Studio team</p>` +
      `</div>`,
  });

  if (error) {
    console.error('Resend email failed:', error);
    return false;
  }
  return true;
}

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

  // Best-effort confirmation email. A failure here must NOT fail the submission,
  // so it's wrapped defensively and its outcome is only reported, never thrown.
  let emailed = false;
  try {
    emailed = await sendConfirmationEmail(name, email);
  } catch (err) {
    console.error('Unexpected error sending confirmation email:', err);
  }

  return res.status(200).json({ ok: true, id: data.id, emailed });
};
