const SUPABASE_URL = "https://ozdkphtsipnspiqkppnp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_q8Oj_7dkOzHEU1ofgZkWQQ_lF2sfo6k";
const CRON_SCHEDULE = "0 1 * * *";

export const dynamic = "force-dynamic";

function isAuthorizedCronRequest(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const bearerToken = request.headers.get("authorization");
  const hasValidSecret = Boolean(
    configuredSecret && bearerToken === `Bearer ${configuredSecret}`,
  );

  const isVercelCron =
    request.headers.get("user-agent") === "vercel-cron/1.0" &&
    request.headers.get("x-vercel-cron-schedule") === CRON_SCHEDULE;

  return hasValidSecret || isVercelCron;
}

async function pingSupabase() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/keepalive_ping`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      "content-type": "application/json",
    },
    body: "{}",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Supabase keep-alive failed with status ${response.status}`);
  }
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await pingSupabase();
    }

    return Response.json({
      ok: true,
      queries: 3,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Supabase keep-alive failed", error);
    return Response.json(
      { ok: false, error: "Supabase keep-alive failed" },
      { status: 502 },
    );
  }
}
