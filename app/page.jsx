"use client";

import { useEffect, useMemo, useState } from "react";
import fallbackRaw from "./products.json";

/**
 * ✅ URL API (PHP) qui renvoie {categories, products}
 * - mettez votre URL dans Render/Next: NEXT_PUBLIC_CATALOG_URL
 * - sinon fallback sur urb fgi.fun
 */
const CATALOG_URL =
  process.env.NEXT_PUBLIC_CATALOG_URL || "https://urbfgi.fun/api/catalog.php";

function getWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

function euro(n) {
  return Number(n || 0).toFixed(2);
}

/** Fallback local: accepte soit [{...}] soit {products:[...]} */
function normalizeFallback(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.products)) return raw.products;
  return [];
}

/** Sécurise les URLs d'images (Telegram peut être chiant avec certaines URLs) */
function safeImageUrl(url) {
  if (!url) return "";
  const s = String(url).trim();
  if (!s) return "";

  // Si URL absolue -> ok
  if (s.startsWith("http://") || s.startsWith("https://")) return s;

  // Si URL relative -> on la rattache au domaine urbfgi.fun (adapté à ton setup)
  // Exemple: "/api/uploads/xxx.png"
  if (s.startsWith("/")) return `https://urbfgi.fun${s}`;

  // Sinon -> on tente pareil (cas rare)
  return `https://urbfgi.fun/${s}`;
}

/** Convertit l'API (PHP) vers le format UI */
function mapApiToUi(api) {
  const cats = Array.isArray(api?.categories) ? api.categories : [];
  const catById = new Map(cats.map((c) => [String(c.id), c]));
  const products = Array.isArray(api?.products) ? api.products : [];

  const out = [];

  for (const p of products) {
    if (!p || p.active === false) continue;

    const catName =
      p.category || catById.get(String(p.categoryId))?.name || "Autres";

    const basePhoto = safeImageUrl(p.image || "");

    // ✅ Si variantes actives -> on crée une option "select"
    if (Array.isArray(p.variants) && p.variants.length) {
      const vars = p.variants.filter((v) => v?.active !== false);
      if (vars.length) {
        const prices = vars.map((v) => Number(v.salePrice ?? v.price ?? 0));
        const minPrice = Math.min(...prices);

        out.push({
          id: String(p.id),
          nom: p.title || "Produit",
          photo: basePhoto,
          categorie: catName,
          prix: Number(minPrice.toFixed(2)),
          poids: p.weight || "",
          options: [
            {
              name: "variante",
              label: "Choix",
              type: "select",
              required: true,
              choices: vars.map((v) => {
                const price = Number(v.salePrice ?? v.price ?? 0);
                return {
                  label: v.label || v.weight || "Option",
                  priceDelta: Number((price - minPrice).toFixed(2)),
                  variantId: String(v.id),
                };
              }),
            },
          ],
        });
        continue;
      }
    }

    // ✅ Produit simple
    out.push({
      id: String(p.id),
      nom: p.title || "Produit",
      photo: basePhoto,
      categorie: catName,
      prix: Number(Number(p.salePrice ?? p.price ?? 0).toFixed(2)),
      poids: p.weight || "",
      options: Array.isArray(p.options) ? p.options : [],
    });
  }

  return out;
}

/** Calcule le prix en ajoutant les priceDelta des options select */
function calcPrice(product, selected) {
  let price = Number(product?.prix || 0);
  const opts = Array.isArray(product?.options) ? product.options : [];

  for (const opt of opts) {
    const v = selected?.[opt.name];
    if (!v) continue;

    if (opt.type === "select") {
      const c = opt.choices?.find((x) => x.label === v);
      price += Number(c?.priceDelta || 0);
    }
  }
  return Number(price.toFixed(2));
}

function variantKey(productId, selected) {
  return `${productId}::${JSON.stringify(selected || {})}`;
}

/** Image component ultra safe */
function ProductImage({ src, alt }) {
  const [ok, setOk] = useState(true);
  const safe = safeImageUrl(src);

  if (!safe || !ok) return null;

  return (
    <img
      className="img"
      src={safe}
      alt={alt}
      loading="lazy"
      decoding="async"
      // Telegram Android aime bien ça:
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      onError={() => setOk(false)}
    />
  );
}

export default function Page() {
  // 1) Fallback immédiat (utile si API down / cache)
  const initialFallback = useMemo(() => normalizeFallback(fallbackRaw), []);
  const [products, setProducts] = useState(initialFallback);

  // UI states
  const [cat, setCat] = useState("Tous");
  const [cart, setCart] = useState([]);
  const [openProduct, setOpenProduct] = useState(null);
  const [selected, setSelected] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✅ Telegram init (ne bloque pas)
  useEffect(() => {
    const w = getWebApp();
    if (!w) return;
    try {
      w.ready();
      w.expand();
    } catch {}
  }, []);

  // ✅ Load API catalog (anti-cache)
  useEffect(() => {
    const ctrl = new AbortController();
    const url = `${CATALOG_URL}?v=${Date.now()}`;

    fetch(url, { cache: "no-store", signal: ctrl.signal })
      .then((r) => r.json())
      .then((api) => {
        const mapped = mapApiToUi(api);
        if (Array.isArray(mapped) && mapped.length) setProducts(mapped);
      })
      .catch(() => {});

    return () => ctrl.abort();
  }, []);

  const categories = useMemo(() => {
    const arr = Array.isArray(products) ? products : [];
    const set = new Set(arr.map((p) => p?.categorie).filter(Boolean));
    return ["Tous", ...Array.from(set)];
  }, [products]);

  const filtered = useMemo(() => {
    const arr = Array.isArray(products) ? products : [];
    const list = arr.filter((p) => p?.nom);
    return cat === "Tous" ? list : list.filter((p) => p.categorie === cat);
  }, [cat, products]);

  const total = useMemo(() => {
    return cart.reduce(
      (sum, i) => sum + Number(i.unitPrice) * Number(i.qty),
      0
    );
  }, [cart]);

  function openOptions(p) {
    const opts = Array.isArray(p?.options) ? p.options : [];
    const init = {};
    for (const opt of opts) {
      if (opt.type === "select" && opt.required && opt.choices?.[0]?.label) {
        init[opt.name] = opt.choices[0].label;
      }
    }
    setSelected(init);
    setOpenProduct(p);
  }

  function addToCart(product, sel) {
    const unitPrice = calcPrice(product, sel);
    const key = variantKey(product.id, sel);

    setCart((prev) => {
      const idx = prev.findIndex((x) => x.key === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...
