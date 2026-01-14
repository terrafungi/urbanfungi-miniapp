// app/api/img/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg, code = 400) {
  return new Response(msg, {
    status: code,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const u = searchParams.get("u");
    if (!u) return bad("Missing ?u=", 400);

    let target;
    try {
      target = new URL(u);
    } catch {
      return bad("Bad URL", 400);
    }

    if (!["http:", "https:"].includes(target.protocol)) {
      return bad("Bad protocol", 400);
    }

    const upstream = await fetch(target.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://urbfgi.fun/",
        Origin: "https://urbfgi.fun",
      },
      cache: "no-store",
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return bad(
        `Upstream error: ${upstream.status}\n${text.slice(0, 200)}`,
        upstream.status
      );
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const buf = await upstream.arrayBuffer();

    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400",
      },
    });
  } catch {
    return bad("Proxy error", 500);
  }
}
