/**
 * Cloudflare Worker + Cron
 * 1) Every 3 min: POST sync-aws-current (table snapshot)
 * 2) Same run: POST sync-aws-graph-batch (up to 4 due stations)
 *
 * Secrets:
 *   SYNC_URL          = .../functions/v1/sync-aws-current
 *   GRAPH_BATCH_URL   = .../functions/v1/sync-aws-graph-batch
 *   SYNC_BEARER       = anon or service_role JWT
 *   CRON_SECRET       = optional
 */

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAll(env));
  },

  async fetch(request, env) {
    const result = await runAll(env);
    return new Response(JSON.stringify(result, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  },
};

async function runAll(env) {
  const bearer = env.SYNC_BEARER;
  if (!bearer) {
    return { ok: false, error: "Missing SYNC_BEARER" };
  }

  const headers = {
    Authorization: `Bearer ${bearer}`,
    "Content-Type": "application/json",
  };
  if (env.CRON_SECRET) headers["x-cron-secret"] = env.CRON_SECRET;

  const out = { ok: true, aws: null, graph: null };

  const awsUrl = env.SYNC_URL;
  if (awsUrl) {
    out.aws = await postJson(awsUrl, headers);
  } else {
    out.aws = { ok: false, error: "Missing SYNC_URL" };
  }

  const graphUrl =
    env.GRAPH_BATCH_URL ||
    (awsUrl
      ? awsUrl.replace(/sync-aws-current\/?$/, "sync-aws-graph-batch")
      : null);

  if (graphUrl) {
    out.graph = await postJson(graphUrl, headers);
  } else {
    out.graph = { ok: false, error: "Missing GRAPH_BATCH_URL" };
  }

  out.ok = !!(out.aws && out.aws.ok && out.graph && out.graph.ok);
  return out;
}

async function postJson(url, headers) {
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
