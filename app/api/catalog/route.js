export const dynamic = "force-dynamic";

export async function GET() {
  const url = "https://urbfgi.fun/api/catalog.php";
  const r = await fetch(url, { cache: "no-store" });
  const txt = await r.text();

  return new Response(txt, {
    status: r.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
