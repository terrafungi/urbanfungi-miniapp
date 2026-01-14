export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("u");

  if (!target || !target.startsWith("http")) {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/*",
      },
    });

    if (!res.ok) {
      return new Response("Upstream error", { status: res.status });
    }

    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    return new Response("Proxy error", { status: 500 });
  }
}
