"use client";

import { useEffect, useMemo, useState } from "react";
import fallbackProductsRaw from "./products.json";

const CATALOG_URL =
  process.env.NEXT_PUBLIC_CATALOG_URL || "https://urbfgi.fun/api/catalog.php";

function euro(n) {
  return Number(n || 0).toFixed(2);
}

function getWebAppSafe() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
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
      p.category || catById.get(String(p.categoryId))?.name || "Autres";

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

  const [webapp, setWebapp] = useState(null);

  const [cat, setCat] = useState("Tous");
  const [cart, setCart] = useState([]); // [{key, id, nom, qty, unitPrice, selected, photo}]
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [products, setProducts] = useState(initialFallback);

  const [openProduct, setOpenProduct] = useState(null);
  const [selected, setSelected] = useState({});

  // Telegram init
  useEffect(() => {
    const w = getWebAppSafe();
    setWebapp(w);

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
      .catch(() => {});
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
      (sum, i) => sum + Number(i.unitPrice || 0) * Number(i.qty || 0),
      0
    );
  }, [cart]);

  function openOptions(p) {
    const opts = Array.isArray(p?.options) ? p.options : [];
    const init = {};
    for (const opt of opts) {
      if (opt.type === "select") {
        if (opt.required && opt.choices?.[0]?.label) {
          init[opt.name] = opt.choices[0].label;
        }
      }
      if (opt.type === "toggle") init[opt.name] = [];
    }
    setSelected(init);
    setOpenProduct(p);
  }

  function addToCart(product, sel) {
    const unitPrice = calcVariantPrice(product, sel);
    const key = variantKey(product.id, sel);

    setCart((prev) => {
      const idx = prev.findIndex((x) => x.key === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          key,
          id: product.id,
          nom: product.nom,
          photo: product.photo,
          unitPrice,
          selected: sel,
          qty: 1,
        },
      ];
    });

    setOpenProduct(null);
  }

  function dec(key) {
    setCart((prev) =>
      prev
        .map((x) => (x.key === key ? { ...x, qty: x.qty - 1 } : x))
        .filter((x) => x.qty > 0)
    );
  }

  function inc(key) {
    setCart((prev) =>
      prev.map((x) => (x.key === key ? { ...x, qty: x.qty + 1 } : x))
    );
  }

  /**
   * ✅ ENVOI COMMANDE AU BOT (le truc clé)
   * - payload ultra léger
   * - showAlert debug (tu vois si ça part)
   * - close avec délai confortable
   */
  function checkout() {
    const w = webapp || getWebAppSafe();

    if (!w || !w.initDataUnsafe?.user?.id) {
      alert("❌ Ouvrez la boutique depuis Telegram (via le bouton du bot).");
      return;
    }
    if (!cart.length) {
      alert("Panier vide.");
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);

    const items = cart.map((i) => ({
      id: i.id,
      nom: i.nom, // optionnel mais pratique côté bot
      qty: Number(i.qty || 1),
      options: i.selected || {},
    }));

    const payload = {
      type: "ORDER",
      totalEur: Number(total || 0),
      items,
    };

    const json = JSON.stringify(payload);

    try {
      // Debug visible (important pour confirmer)
      w.showAlert?.("✅ Commande envoyée au bot. Retour au chat…");

      // Envoi Telegram -> bot (web_app_data)
      w.sendData(json);

      // Délai plus long = plus fiable
      setTimeout(() => {
        try {
          w.close();
        } catch {}
      }, 800);
    } catch (e) {
      console.error(e);
      alert("❌ Erreur sendData. Réessayez.");
    } finally {
      setTimeout(() => setIsSubmitting(false), 900);
    }
  }

  // MainButton Telegram (optionnel mais cool)
  useEffect(() => {
    const w = webapp;
    if (!w) return;

    const handler = () => checkout();

    try {
      if (cart.length) {
        w.MainButton.setText(`✅ Commander • ${euro(total)}€`);
        w.MainButton.show();
        w.onEvent("mainButtonClicked", handler);
      } else {
        w.MainButton.hide();
      }
    } catch {}

    return () => {
      try {
        w.offEvent("mainButtonClicked", handler);
      } catch {}
    };
  }, [webapp, cart.length, total]); // ⚠️ pas isSubmitting ici (évite double binding)

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">
          <div className="logo">🍄</div>
          <div>
            <div className="title">UrbanFungi</div>
            <div className="subtitle">Boutique • Mini App</div>
          </div>
        </div>

        <div className="totalPill">
          <div className="muted">Total</div>
          <div className="big">{euro(total)} €</div>
        </div>
      </div>

      <div className="cats">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`chip ${c === cat ? "active" : ""}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid">
        {filtered.map((p) => (
          <div key={p.id} className="card">
            {p.photo ? <img className="img" src={p.photo} alt={p.nom} /> : null}
            <div className="cardBody">
              <div className="name">{p.nom}</div>
              <div className="meta">
                {p.categorie}
                {p.poids ? ` • ${p.poids}` : ""}
              </div>

              <div className="row">
                <div className="price">{euro(p.prix)} €</div>
                {p.options?.length ? (
                  <button className="btn" onClick={() => openOptions(p)}>
                    ⚙️ Options
                  </button>
                ) : (
                  <button className="btn" onClick={() => addToCart(p, {})}>
                    ➕ Ajouter
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Cart */}
      <div className="cart">
        <div className="cartTop">
          <div className="cartTitle">🛒 Panier</div>
          <div className="cartTotal">{euro(total)} €</div>
        </div>

        {cart.length === 0 ? (
          <div className="empty">Ajoutez un produit pour commander.</div>
        ) : (
          <div className="cartList">
            {cart.map((i) => (
              <div className="cartRow" key={i.key}>
                <div className="left">
                  <div className="cartName">{i.nom}</div>
                  {i.selected && Object.keys(i.selected).length > 0 && (
                    <div className="opts">
                      {Object.entries(i.selected).map(([k, v]) => (
                        <span key={k} className="optTag">
                          {k}: {Array.isArray(v) ? v.join(", ") : v}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="muted">{euro(i.unitPrice)} € / unité</div>
                </div>

                <div className="qty">
                  <button className="qbtn" onClick={() => dec(i.key)}>
                    −
                  </button>
                  <div className="qnum">{i.qty}</div>
                  <button className="qbtn" onClick={() => inc(i.key)}>
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          className="checkout"
          disabled={!cart.length || isSubmitting}
          onClick={checkout}
        >
          {isSubmitting ? "⏳ Envoi…" : "✅ Commander (Bitcoin / Transcash)"}
        </button>
      </div>

      {/* Modal options */}
      {openProduct && (
        <div className="modalBack" onClick={() => setOpenProduct(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <div className="modalTitle">{openProduct.nom}</div>
                <div className="muted">Choisissez vos options</div>
              </div>
              <button className="close" onClick={() => setOpenProduct(null)}>
                ✕
              </button>
            </div>

            {(openProduct.options || []).map((opt) => (
              <div key={opt.name} className="optBlock">
                <div className="optName">
                  {opt.label || opt.name}{" "}
                  {opt.required ? (
                    <span className="req">• obligatoire</span>
                  ) : null}
                </div>

                {opt.type === "select" && (
                  <div className="choices">
                    {opt.choices.map((c) => {
                      const active = selected?.[opt.name] === c.label;
                      return (
                        <button
                          key={c.label}
                          className={`choice ${active ? "active" : ""}`}
                          onClick={() =>
                            setSelected((s) => ({ ...s, [opt.name]: c.label }))
                          }
                        >
                          {c.label}
                          {Number(c.priceDelta || 0) !== 0 && (
                            <span className="delta">
                              {c.priceDelta > 0
                                ? `+${euro(c.priceDelta)}`
                                : euro(c.priceDelta)}
                              €
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {opt.type === "toggle" && (
                  <div className="choices">
                    {opt.choices.map((c) => {
                      const arr = Array.isArray(selected?.[opt.name])
                        ? selected[opt.name]
                        : [];
                      const active = arr.includes(c.label);
                      return (
                        <button
                          key={c.label}
                          className={`choice ${active ? "active" : ""}`}
                          onClick={() => {
                            setSelected((s) => {
                              const cur = Array.isArray(s[opt.name])
                                ? s[opt.name]
                                : [];
                              const next = active
                                ? cur.filter((x) => x !== c.label)
                                : [...cur, c.label];
                              return { ...s, [opt.name]: next };
                            });
                          }}
                        >
                          {active ? "✅ " : ""}
                          {c.label}
                          {Number(c.priceDelta || 0) !== 0 && (
                            <span className="delta">+{euro(c.priceDelta)}€</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            <div className="modalFoot">
              <div className="finalPrice">
                Prix: <b>{euro(calcVariantPrice(openProduct, selected))} €</b>
              </div>
              <button
                className="cta"
                onClick={() => addToCart(openProduct, selected)}
              >
                ➕ Ajouter au panier
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        :root {
          --bg: #0b0b0f;
          --card: #12121a;
          --stroke: rgba(255, 255, 255, 0.08);
          --txt: #ffffff;
        }
        html,
        body {
          background: var(--bg);
          color: var(--txt);
          margin: 0;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
        }
        .wrap {
          padding: 14px;
          padding-bottom: 120px;
        }
        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .logo {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: var(--card);
          display: grid;
          place-items: center;
          border: 1px solid var(--stroke);
        }
        .title {
          font-weight: 800;
          line-height: 1.1;
        }
        .subtitle {
          opacity: 0.7;
          font-size: 12px;
        }
        .totalPill {
          background: var(--card);
          border: 1px solid var(--stroke);
          border-radius: 14px;
          padding: 8px 10px;
          min-width: 120px;
          text-align: right;
        }
        .muted {
          opacity: 0.7;
          font-size: 12px;
        }
        .big {
          font-weight: 900;
        }
        .cats {
          display: flex;
          gap: 8px;
          overflow: auto;
          padding-bottom: 8px;
          margin-bottom: 10px;
        }
        .chip {
          border: 1px solid var(--stroke);
          background: transparent;
          color: var(--txt);
          padding: 8px 10px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .chip.active {
          background: rgba(255, 255, 255, 0.12);
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        @media (min-width: 900px) {
          .grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
        .card {
          background: var(--card);
          border: 1px solid var(--stroke);
          border-radius: 16px;
          overflow: hidden;
        }
        .img {
          width: 100%;
          height: 140px;
          object-fit: cover;
          display: block;
        }
        .cardBody {
          padding: 10px;
        }
        .name {
          font-weight: 800;
          margin-bottom: 6px;
        }
        .meta {
          opacity: 0.75;
          font-size: 12px;
          margin-bottom: 10px;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .price {
          font-weight: 900;
        }
        .btn {
          border: 1px solid var(--stroke);
          background: rgba(255, 255, 255, 0.06);
          color: var(--txt);
          padding: 8px 10px;
          border-radius: 12px;
          font-weight: 700;
        }
        .cart {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(11, 11, 15, 0.85);
          backdrop-filter: blur(10px);
          border-top: 1px solid var(--stroke);
          padding: 12px 14px;
        }
        .cartTop {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .cartTitle {
          font-weight: 900;
        }
        .cartTotal {
          font-weight: 900;
        }
        .empty {
          opacity: 0.7;
          font-size: 13px;
          padding: 6px 0 10px;
        }
        .cartList {
          max-height: 180px;
          overflow: auto;
          padding-right: 6px;
          margin-bottom: 10px;
        }
        .cartRow {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          border: 1px solid var(--stroke);
          border-radius: 14px;
          padding: 10px;
          margin-bottom: 8px;
          background: rgba(255, 255, 255, 0.04);
        }
        .left {
          min-width: 0;
        }
        .cartName {
          font-weight: 900;
          margin-bottom: 4px;
        }
        .opts {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 6px;
        }
        .optTag {
          font-size: 11px;
          border: 1px solid var(--stroke);
          border-radius: 999px;
          padding: 3px 8px;
          opacity: 0.85;
        }
        .qty {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .qbtn {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          border: 1px solid var(--stroke);
          background: rgba(255, 255, 255, 0.06);
          color: var(--txt);
          font-size: 18px;
          font-weight: 900;
        }
        .qnum {
          min-width: 18px;
          text-align: center;
          font-weight: 900;
        }
        .checkout {
          width: 100%;
          border: none;
          background: #22c55e;
          color: #0b0b0f;
          font-weight: 900;
          padding: 12px 14px;
          border-radius: 14px;
          cursor: pointer;
        }
        .checkout:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .modalBack {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: grid;
          place-items: center;
          padding: 14px;
        }
        .modal {
          width: min(520px, 100%);
          background: var(--card);
          border: 1px solid var(--stroke);
          border-radius: 18px;
          overflow: hidden;
        }
        .modalHead {
          display: flex;
          justify-content: space-between;
          align-items: start;
          padding: 12px 12px 10px;
          border-bottom: 1px solid var(--stroke);
        }
        .modalTitle {
          font-weight: 900;
          margin-bottom: 4px;
        }
        .close {
          border: 1px solid var(--stroke);
          background: rgba(255, 255, 255, 0.06);
          color: var(--txt);
          border-radius: 12px;
          padding: 8px 10px;
        }
        .optBlock {
          padding: 12px;
          border-bottom: 1px solid var(--stroke);
        }
        .optName {
          font-weight: 900;
          margin-bottom: 8px;
        }
        .req {
          opacity: 0.7;
          font-weight: 700;
          font-size: 12px;
        }
        .choices {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .choice {
          border: 1px solid var(--stroke);
          background: rgba(255, 255, 255, 0.05);
          color: var(--txt);
          padding: 10px 12px;
          border-radius: 14px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .choice.active {
          background: rgba(34, 197, 94, 0.22);
          border-color: rgba(34, 197, 94, 0.5);
        }
        .delta {
          opacity: 0.85;
          font-size: 12px;
        }
        .modalFoot {
          padding: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .finalPrice {
          font-weight: 900;
        }
        .cta {
          border: none;
          background: #22c55e;
          color: #0b0b0f;
          font-weight: 900;
          padding: 10px 12px;
          border-radius: 14px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
