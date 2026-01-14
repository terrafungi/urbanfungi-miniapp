// app/catalogSource.js

export const CATALOG_URL = (
  process.env.NEXT_PUBLIC_CATALOG_URL || "https://urbfgi.fun/api/catalog.php"
).trim();

function getOriginFromCatalogUrl() {
  try {
    return new URL(CATALOG_URL).origin; // => https://urbfgi.fun
  } catch {
    return "https://urbfgi.fun";
  }
}

export function normalizeImageUrl(value) {
  const origin = getOriginFromCatalogUrl();
  if (!value) return "";

  const v = String(value).trim();

  // déjà absolu
  if (/^https?:\/\//i.test(v)) return v;

  // //urbfgi.fun/...
  if (v.startsWith("//")) return "https:" + v;

  // /uploads/xxx.jpg
  if (v.startsWith("/")) return origin + v;

  // uploads/xxx.jpg ou juste nom de fichier
  // si ton PHP stocke déjà "uploads/xxx.jpg" on le garde tel quel
  if (v.startsWith("uploads/")) return `${origin}/${v}`;

  // sinon on suppose que c'est dans /uploads/
  return `${origin}/uploads/${v}`;
}

export async function fetchCatalog() {
  const url = `${CATALOG_URL}${CATALOG_URL.includes("?") ? "&" : "?"}t=${Date.now()}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Catalog HTTP ${res.status}`);

  return res.json();
}
