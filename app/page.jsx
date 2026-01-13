"use client";

import { useEffect, useMemo, useState } from "react";
import fallbackProductsRaw from "./products.json";

const CATALOG_URL =
  process.env.NEXT_PUBLIC_CATALOG_URL || "https://urbfgi.fun/api/catalog.php";

function getWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

function euro(n) {
  return Number(n || 0).toFixed(2);
}

/**
 * Normalise fallbackProducts (au cas où products.json est un objet et pas un array)
 */
function normalizeFallback(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.products)) return raw.products;
  return [];
}

/**
 * API PHP -> format UI
 * - p.variants[] devient option select (variante)
 */
function mapApiToLegacy(api) {
  const cats = Array.isArray(api?.categories) ? api.categories : [];
  const catById = new Map(cats.map((c) => [String(c.id), c]));

  const out = [];
  const products = Array.isArray(api?.products) ? api.products : [];

  for (const p of products) {
    if (!p) continue;
    if (p.active === false) continue;

    const catName =
      p.category ||
      catById.get(String(p.categoryId))?.name ||
      "Autres";

    const baseWeight = p.weight || "";
    const currency = p.currency || "EUR";

    // Variantes -> select
    if (Array.isArray(p.variants) && p.variants.length > 0) {
      const activeVars = p.variants.filter((v) => v?.active !== false);
      if (activeVars.length > 0) {
        const prices = activeVars.map((v) =>
          Number(v.salePrice ?? v.price ?? Infinity)
        );
        const minPrice = Math.min(...prices);

        const choices = activeVars.map((v) => {
          const price = Number(v.salePrice ?? v.price ?? 0);
          return {
            label: v.label || v.weight || "Option",
            priceDelta: Number((price - minPrice).toFixed(2)),
            variantId: v.id,
            weight: v.weight || null,
          };
        });

        out.push({
          id: p.id,
          nom: p.title || "Produit",
          photo: p.image || "",
          categorie: catName,
          prix: Number(minPrice.toFixed(2)),
          currency,
          poids: baseWeight,
          description: p.shortDesc || p.longDesc || "",
          link: p.link || "",
          options: [
            {
              name: "variante",
              label: "Choix",
              type: "select",
              required: true,
              choices,
            },
          ],
        });
        continue;
      }
    }

    // Sans variantes
    const basePrice = Number(p.salePrice ?? p.price ?? 0);

    out.push({
      id: p.id,
      nom: p.title || "Produit",
      photo: p.image || "",
      categorie: catName,
      prix: Number(basePrice.toFixed(2)),
      currency,
      poids: baseWeight,
      description: p.shortDesc || p.longDesc || "",
      link: p.link || "",
      options: Array.isArray(p.options) ? p.options : [],
    });
  }

  return out;
}

function calcVariantPrice(product, selected) {
  let price = Number(product?.prix || 0);
  const opts = Array.isArray(product?.options) ? product.options : [];

  for (const opt of opts) {
    const v = selected?.[opt.name];
    if (!v) continue;

    if (opt.type === "select") {
      const c = opt.choices?.find((x) => x.label === v);
      price += Number(c?.priceDelta || 0);
    }

    if (opt.type === "toggle") {
      const arr = Array.isArray(v) ? v : [];
      for (const lab of arr) {
        const c = opt.choices?.find((x) => x.label === lab);
        price += Number(c?.priceDelta || 0);
      }
    }
  }

  return price;
}

function variantKey(productId, selected) {
  return `${productId}::${JSON.stringify(selected || {})}`;
}

export default function Page() {
  const initialFallback = useMemo(
    () => normalizeFallback(fallbackProductsRaw),
    []
  );

  const [cat, setCat] = useState("Tous");
  const [cart, setCart] = useState([]); // [{key, id, nom, qty, unitPrice, selected, photo}]
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [products, setProducts] = useState(initialFallback);

  const [openProduct, setOpenProduct] = useState(null);
  const [selected, setSelected] = useState({});

  // Telegram init
  useEffect(() => {
    const w = getWebApp();
    if (!w) return;
    try {
      w.ready();
      w.expand();
      document.documentElement.style.background =
        w.themeParams?.bg_color || "#0b0b0f";
    } catch {}
  }, []);

  // Charger le catalogue PHP
  useEffect(() => {
    const url = `${CATALOG_URL}?v=${Date.now()}`;
    fetch(url, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((api) => {
        const mapped = mapApiToLegacy(api);
        if (Array.isArray(mapped) && mapped.length) setProducts(mapped);
      })
      .catch(() => {
        // fallback si API down
      });
  }, []);

  const categories = useMemo(() => {
    const arr = Array.isArray(products) ? products : [];
    const set = new Set(arr.map((p) => p?.categorie).filter(Boolean));
    return ["Tous", ...Array.from(set)];
