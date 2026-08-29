/**
 * Cloudflare Worker + Cron Trigger
 * Every 3 minutes: POST Supabase Edge Function sync-aws-current
 *
 * Secrets (Workers → Settings → Variables):
 *   SYNC_URL     = https://vssqnwomevifyqlyqpsb.supabase.co/functions/v1/sync-aws-current
 *   SYNC_BEARER  = Supabase anon or service_role JWT (eyJ...)
 *   CRON_SECRET  = optional, same as Supabase secret CRON_SECRET
 */

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSync(env));
  },

  async fetch(request, env) {
    // Manual test in browser / curl
    const result = await runSync(env);
    return new Response(JSON.stringify(result, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  },
};

async function runSync(env) {
  const url = env.SYNC_URL;
  const bearer = env.SYNC_BEARER;
  if (!url || !bearer) {
    return { ok: false, error: "Missing SYNC_URL or SYNC_BEARER secret" };
  }

  const headers = {
    Authorization: `Bearer ${bearer}`,
    "Content-Type": "application/json",
  };
  if (env.CRON_SECRET) {
    headers["x-cron-secret"] = env.CRON_SECRET;
  }

  try {
    const res = await fetch(url, { method: "POST", headers });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
