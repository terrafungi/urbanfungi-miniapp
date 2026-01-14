// app/api/img/route.js

export const runtime = "nodejs"; // important sur Render

function isAllowed(url) {
  try {
    const u = new URL(url);
    // ✅ Autoriser uniquement vos domaines (sécurité + évite SSRF)
    return (
      u.protocol === "https:" &&
      (u.hostname === "urbfgi.fun" || u.hostname.endsWith(".urbfgi.fun"))
    );
  } catch {
    return false;
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("u");

  if (!target || !isAllowed(target)) {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    const r = await fetch(target, {
      headers: {
        // ✅ certains serveurs renvoient mieux avec un UA
        "User-Agent": "Mozilla/5.0 UrbanFungiProxy",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      cache: "no-store",
      redirect: "follow",
    });

    if (!r.ok) {
      return new Response(`Upstream error: ${r.status}`, { status: 502 });
    }

    const contentType = r.headers.get("content-type") || "image/jpeg";
    const data = await r.arrayBuffer();

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // ✅ surtout PAS attachment (sinon ça ne s’affiche pas en <img>)
        "Content-Disposition": "inline",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response("Proxy error", { status: 500 });
  }
}
