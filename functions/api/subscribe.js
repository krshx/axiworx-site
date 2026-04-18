/**
 * POST /api/subscribe
 * Cloudflare Pages Function — mailing list subscription handler.
 *
 * Environment variables (set in CF Pages dashboard → Settings → Variables):
 *   RESEND_API_KEY   — Resend API key (re_xxxxxxxx)
 *   RESEND_AUDIENCE  — Resend Audience ID to add contacts to
 *
 * Falls back gracefully: if RESEND_API_KEY is not set, returns 200 so the
 * UI doesn't break during early dev/staging — but logs a warning.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // ── Parse body ─────────────────────────────────────────────────────────────
  let email;
  try {
    const body = await request.json();
    email = (body.email || '').trim().toLowerCase();
  } catch {
    return json({ ok: false, error: 'Invalid request body' }, 400);
  }

  if (!email || !isValidEmail(email)) {
    return json({ ok: false, error: 'Invalid email address' }, 422);
  }

  // ── Guard: no key in env (local dev / staging without secrets) ─────────────
  if (!env.RESEND_API_KEY) {
    console.warn('[subscribe] RESEND_API_KEY not set — skipping Resend call');
    return json({ ok: true, dev: true });
  }

  // ── Resend Contacts API ────────────────────────────────────────────────────
  // Docs: https://resend.com/docs/api-reference/contacts/create-contact
  const audienceId = env.RESEND_AUDIENCE || '';

  const payload = {
    email,
    unsubscribed: false,
  };

  const url = audienceId
    ? `https://api.resend.com/audiences/${audienceId}/contacts`
    : null;

  if (!url) {
    // No audience ID — just validate/record email in KV if available, then OK.
    console.warn('[subscribe] RESEND_AUDIENCE not set — storing email in KV only');
    if (env.SUBSCRIBERS_KV) {
      await env.SUBSCRIBERS_KV.put(`sub:${email}`, JSON.stringify({
        email,
        subscribed_at: new Date().toISOString(),
        source: request.headers.get('Referer') || 'direct',
      }));
    }
    return json({ ok: true });
  }

  const resendRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resendRes.ok) {
    const err = await resendRes.text();
    console.error('[subscribe] Resend error', resendRes.status, err);
    // 422 from Resend = contact already exists — treat as success
    if (resendRes.status === 422) {
      return json({ ok: true, already: true });
    }
    return json({ ok: false, error: 'Subscription service unavailable' }, 502);
  }

  // ── Optional: also persist to KV for your own records ─────────────────────
  if (env.SUBSCRIBERS_KV) {
    await env.SUBSCRIBERS_KV.put(`sub:${email}`, JSON.stringify({
      email,
      subscribed_at: new Date().toISOString(),
      source: request.headers.get('Referer') || 'direct',
    })).catch(() => {}); // non-fatal
  }

  return json({ ok: true });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
