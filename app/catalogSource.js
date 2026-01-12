// app/catalogSource.js
const API_URL = "https://urbfgi.fun/api/catalog.php";

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ⚠️ Cette fonction renvoie un format “compatible ancien product.json”
// -> categories: [{name, slug}]
// -> products: [{id, title, category, price, weight, image, description...}]
export async function loadCatalog() {
  const url = `${API_URL}?v=${Date.now()}`; // anti-cache Telegram/GitHub
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Catalog HTTP ${r.status}`);
  const api = await r.json();

  const categories = (api.categories || []).map((c) => {
    if (typeof c === "string") return { name: c, slug: slugify(c) };
    return { name: c.name, slug: c.slug || slugify(c.name), id: c.id };
  });

  const products = [];
  for (const p of (api.products || [])) {
    if (p?.active === false) continue;

    // Si variantes: on “aplatit” pour que ton panier actuel marche sans refonte UI
    if (Array.isArray(p.variants) && p.variants.length > 0) {
      for (const v of p.variants) {
        if (v?.active === false) continue;
        products.push({
          id: `${p.id}-${v.id}`,                  // id unique
          parentId: p.id,
          variantId: v.id,
          title: `${p.title} — ${v.label}`,
          category: p.category || null,
          categoryId: p.categoryId || null,
          price: (v.salePrice ?? v.price) ?? p.price,
          weight: v.weight || v.label || p.weight || "",
          image: p.image || "",
          description: p.shortDesc || p.longDesc || "",
          link: p.link || "",
          currency: p.currency || "EUR",
        });
      }
    } else {
      products.push({
        id: String(p.id),
        title: p.title,
        category: p.category || null,
        categoryId: p.categoryId || null,
        price: (p.salePrice ?? p.price),
        weight: p.weight || "",
        image: p.image || "",
        description: p.shortDesc || p.longDesc || "",
        link: p.link || "",
        currency: p.currency || "EUR",
      });
    }
  }

  return { categories, products };
}
