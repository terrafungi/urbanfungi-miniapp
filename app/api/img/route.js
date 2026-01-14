export const dynamic = "force-dynamic";

export async function GET(req) {
  const u = new URL(req.url);
  const target = u.searchParams.get("u");
  if (!target) return new Response("Missing u", { status: 400 });

  const r = await fetch(target, { cache: "no-store" });
  const buf = await r.arrayBuffer();

  return new Response(buf, {
    status: r.status,
    headers: {
      "content-type": r.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=3600",
    },
  });
}
