import { NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set(["urbfgi.fun"]);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const u = searchParams.get("u");
    if (!u) return new NextResponse("Missing u", { status: 400 });

    const target = new URL(u);

    if (!ALLOWED_HOSTS.has(target.hostname)) {
      return new NextResponse("Host not allowed", { status: 403 });
    }

    const r = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });

    if (!r.ok) return new NextResponse("Upstream error", { status: 502 });

    const buf = await r.arrayBuffer();
    const type = r.headers.get("content-type") || "image/jpeg";

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Proxy error", { status: 500 });
  }
}
