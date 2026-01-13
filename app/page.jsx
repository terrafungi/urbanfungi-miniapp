"use client";

import { useEffect, useMemo, useState } from "react";
import fallbackData from "./products.json";

/**
 * Catalogue PHP (ton admin génère ça)
 * ✅ ton URL
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

function mapApiToLegacy(api) {
  const cats = Array.isArray(api?.categories) ? api.categories : [];
  const catById = new Map(cats.map((c) => [String(c.id), c]));

  const out = [];
  for (const p of api?.products || []) {
    if (!p || p?.active === false) continue;

    const catName =
      p.category || catById.get(String(p.categoryId))?.name || "Autres";

    const baseWeight = p.weight || "";
    const currency = p.currency || "EUR";

    // Variantes -> options select (minPrice + delta)
    if (Array.isArray(p.variants) && p.variants.length > 0) {
      const activeVars = p.variants.filter((v) => v && v?.active !== false);
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
          nom: p.title || "",
          photo: p.image || "",
          categorie: catName,
          prix: Number(minPrice.toFixed(2)),
          currency,
          poids: baseWeight,
          description: p.shortDesc || p.longDesc || "",
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

    out.push({
      id: p.id,
      nom: p.title || "",
      photo: p.image || "",
      categorie: catName,
      prix: Number(p.salePrice ?? p.price ?? 0),
      currency,
      poids: baseWeight,
      description: p.shortDesc || p.longDesc || "",
      options: Array.isArray(p.options) ? p.options : [],
    });
  }

  return out;
}

// ✅ fix build : fallbackData peut être tableau OU objet {products:[...]}
function normalizeFallback(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.products)) return mapApiToLegacy(data);
  return [];
}

function calcVariantPrice(product, selected) {
  let price = Number(product?.prix || 0);
  const opts = Array.isArray(product?.options) ? product.options : [];

  for (const opt of opts) {
    const v = selected?.[opt?.name];
    if (!v) continue;

    if (opt.type === "select") {
      const choices = Array.isArray(opt.choices) ? opt.choices : [];
      const c = choices.find((x) => x?.label === v);
      price += Number(c?.priceDelta || 0);
    }

    if (opt.type === "toggle") {
      const arr = Array.isArray(v) ? v : [];
      const choices = Array.isArray(opt.choices) ? opt.choices : [];
      for (const lab of arr) {
        const c = choices.find((x) => x?.label === lab);
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
  const [cat, setCat] = useState("Tous");
  const [cart, setCart] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [products, setProducts] = useState(() => normalizeFallback(fallbackData));

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

  // Charger catalogue depuis API PHP
  useEffect(() => {
    const url = `${CATALOG_URL}?v=${Date.now()}`;
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((api) => {
        const mapped = mapApiToLegacy(api);
        if (Array.isArray(mapped) && mapped.length) setProducts(mapped);
      })
      .catch(() => {});
  }, []);

  const categories = useMemo(() => {
    const list = Array.isArray(products) ? products : [];
    const set = new Set(list.map((p) => p?.categorie).filter(Boolean));
    return ["Tous", ...Array.from(set)];
  }, [products]);

  const filtered = useMemo(() => {
    const list = (Array.isArray(products) ? products : []).filter((p) => p?.nom);
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
      if (!opt?.name) continue;
      if (opt.type === "select") {
        const choices = Array.isArray(opt.choices) ? opt.choices : [];
        if (opt.required && choices?.[0]?.label) init[opt.name] = choices[0].label;
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

  // ✅ ENVOI AU BOT (comme avant)
  async function checkout() {
    const webapp = getWebApp();
    const user = webapp?.initDataUnsafe?.user;
    const initDataLen = (webapp?.initData || "").length;

    if (!user?.id || initDataLen === 0) {
      return alert("Ouvrez via Telegram (Mini App), pas navigateur.");
    }
    if (cart.length === 0) return alert("Panier vide.");
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const items = cart.map((i) => ({
        id: i.id,
        nom: i.nom,
        prix: Number(i.unitPrice),
        qty: Number(i.qty),
        options: i.selected,
      }));

      const payload = {
        type: "ORDER",
        totalEur: Number(total),
        items,
        ts: Date.now(),
      };

      // Envoi au bot (message.web_app_data)
      webapp.sendData(JSON.stringify(payload));

      alert("✅ Commande envoyée. Retournez au chat pour payer (BTC/Transcash).");
      setCart([]);
      try { webapp.close(); } catch {}
    } catch (e) {
      console.error(e);
      alert("Erreur. Réessayez.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
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
            <div key={p.id ?? p.nom} className="card">
              {p.photo ? (
                <img className="img" src={p.photo} alt={p.nom} />
              ) : (
                <div className="img ph">🍄</div>
              )}

              <div className="cardBody">
                <div className="name">{p.nom}</div>
                <div className="meta">
                  {p.categorie}
                  {p.poids ? ` • ${p.poids}` : ""}
                </div>

                <div className="row">
                  <div className="price">{euro(p.prix)} €</div>
                  {Array.isArray(p.options) && p.options.length ? (
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
          <div className="cartInner">
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
                              {k}: {Array.isArray(v) ? v.join(", ") : String(v)}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="muted">{euro(i.unitPrice)} € / unité</div>
                    </div>

                    <div className="qty">
                      <button className="qbtn" onClick={() => dec(i.key)}>−</button>
                      <div className="qnum">{i.qty}</div>
                      <button className="qbtn" onClick={() => inc(i.key)}>+</button>
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
              {isSubmitting ? "⏳ Envoi…" : "✅ Commander"}
            </button>
          </div>
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

              {(Array.isArray(openProduct.options) ? openProduct.options : []).map(
                (opt) => (
                  <div key={opt.name} className="optBlock">
                    <div className="optName">
                      {opt.label || opt.name}{" "}
                      {opt.required ? <span className="req">• obligatoire</span> : null}
                    </div>

                    {opt.type === "select" && (
                      <div className="choices">
                        {(Array.isArray(opt.choices) ? opt.choices : []).map((c) => {
                          const active = selected?.[opt.name] === c.label;
                          return (
                            <button
                              key={c.label}
                              className={`choice ${active ? "active" : ""}`}
                              onClick={() =>
                                setSelected((s) => ({ ...s, [opt.name]: c.label }))
                              }
                            >
                              <span>{c.label}</span>
                              {Number(c.priceDelta || 0) !== 0 && (
                                <span className="delta">
                                  {c.priceDelta > 0 ? `+${euro(c.priceDelta)}` : euro(c.priceDelta)}€
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )
              )}

              <div className="modalFoot">
                <div className="finalPrice">
                  Prix: <b>{euro(calcVariantPrice(openProduct, selected))} €</b>
                </div>
                <button className="cta" onClick={() => addToCart(openProduct, selected)}>
                  ➕ Ajouter au panier
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Styles (propre) */}
      <style jsx global>{`
        :root{
          --bg:#0b0b0f;
          --card:#12121a;
          --stroke: rgba(255,255,255,.08);
          --txt:#ffffff;
          --muted: rgba(255,255,255,.72);
          --chip: rgba(255,255,255,.06);
          --chip2: rgba(255,255,255,.10);
        }
        html, body { background: var(--bg); color: var(--txt); margin:0; padding:0;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        }
        *{ box-sizing:border-box; }
        .wrap{ max-width:980px; margin:0 auto; padding:16px 16px 220px; }
        .muted{ color: var(--muted); }
        .topbar{ display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; }
        .brand{ display:flex; align-items:center; gap:10px; }
        .logo{ width:44px; height:44px; border-radius:14px; background:var(--card); border:1px solid var(--stroke);
          display:flex; align-items:center; justify-content:center; box-shadow:0 10px 30px rgba(0,0,0,.25);
        }
        .title{ font-weight:900; letter-spacing:.2px; }
        .subtitle{ font-size:12px; color:var(--muted); }
        .totalPill{ background:var(--card); border:1px solid var(--stroke); border-radius:16px; padding:10px 12px;
          min-width:140px; text-align:right;
        }
        .big{ font-size:18px; font-weight:900; }
        .cats{ display:flex; gap:8px; overflow:auto; padding-bottom:6px; margin-bottom:12px; }
        .chip{ border:1px solid var(--stroke); background:var(--chip); color:var(--txt); border-radius:999px;
          padding:8px 12px; cursor:pointer; white-space:nowrap; transition:.15s;
        }
        .chip:hover{ background:var(--chip2); }
        .chip.active{ box-shadow:0 0 0 3px rgba(255,255,255,.08); }

        .grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:12px; }
        .card{ background:var(--card); border:1px solid var(--stroke); border-radius:18px; overflow:hidden;
          box-shadow:0 12px 40px rgba(0,0,0,.25);
        }
        .img{ width:100%; height:150px; object-fit:cover; display:block; background:#000; }
        .img.ph{ display:flex; align-items:center; justify-content:center; font-size:44px; color:rgba(255,255,255,.7);
          background:rgba(255,255,255,.03);
        }
        .cardBody{ padding:12px; display:flex; flex-direction:column; gap:8px; }
        .name{ font-weight:850; }
        .meta{ font-size:12px; color:var(--muted); }
        .row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .price{ font-weight:900; font-size:16px; }
        .btn{ border:1px solid var(--stroke); background:rgba(255,255,255,.06); color:var(--txt);
          border-radius:14px; padding:8px 10px; cursor:pointer;
        }
        .btn:hover{ background:rgba(255,255,255,.10); }

        .cart{ position:fixed; left:0; right:0; bottom:0; background:rgba(11,11,15,.82); backdrop-filter: blur(10px);
          border-top:1px solid var(--stroke); padding:12px; z-index:40;
        }
        .cartInner{ max-width:980px; margin:0 auto; }
        .cartTop{ display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
        .cartTitle{ font-weight:900; }
        .cartTotal{ font-weight:900; }
        .empty{ color:var(--muted); padding:8px 0; }
        .cartList{ max-height:170px; overflow:auto; border:1px solid var(--stroke); border-radius:14px;
          background:rgba(255,255,255,.03); padding:8px; margin-bottom:10px;
        }
        .cartRow{ display:flex; justify-content:space-between; gap:12px; padding:10px; border-radius:12px; }
        .cartRow + .cartRow{ border-top:1px solid rgba(255,255,255,.06); }
        .left{ flex:1; min-width:0; }
        .cartName{ font-weight:850; }
        .opts{ display:flex; flex-wrap:wrap; gap:6px; margin:6px 0; }
        .optTag{ font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid rgba(255,255,255,.10);
          background:rgba(255,255,255,.05); color:var(--muted);
        }
        .qty{ display:flex; align-items:center; gap:10px; }
        .qbtn{ width:34px; height:34px; border-radius:12px; border:1px solid var(--stroke);
          background:rgba(255,255,255,.06); color:var(--txt); cursor:pointer; font-size:18px; line-height:1;
        }
        .qbtn:hover{ background:rgba(255,255,255,.10); }
        .qnum{ min-width:22px; text-align:center; font-weight:900; }
        .checkout{ width:100%; border:0; border-radius:16px; padding:12px 14px; font-weight:900; cursor:pointer;
          background: rgba(255,255,255,.14); color:white;
        }
        .checkout:disabled{ opacity:.55; cursor:not-allowed; }

        .modalBack{ position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center;
          z-index:60; padding:16px;
        }
        .modal{ width:min(620px, 100%); background:var(--card); border:1px solid var(--stroke); border-radius:18px;
          box-shadow:0 20px 80px rgba(0,0,0,.45); overflow:hidden;
        }
        .modalHead{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:14px;
          border-bottom:1px solid rgba(255,255,255,.06);
        }
        .modalTitle{ font-weight:950; font-size:18px; }
        .close{ border:1px solid var(--stroke); background:rgba(255,255,255,.06); color:var(--txt);
          border-radius:12px; padding:8px 10px; cursor:pointer;
        }
        .optBlock{ padding:12px 14px; }
        .optName{ font-weight:850; margin-bottom:8px; }
        .req{ color: rgba(255,255,255,.6); font-size:12px; margin-left:6px; }
        .choices{ display:flex; flex-wrap:wrap; gap:10px; }
        .choice{ display:flex; align-items:center; justify-content:space-between; gap:10px; min-width:160px;
          border:1px solid rgba(255,255,255,.10); background:rgba(255,255,255,.05); color:var(--txt);
          border-radius:14px; padding:10px 12px; cursor:pointer;
        }
        .choice.active{ box-shadow:0 0 0 3px rgba(255,255,255,.08); }
        .delta{ color: rgba(255,255,255,.75); font-weight:800; }

        .modalFoot{ display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px;
          border-top:1px solid rgba(255,255,255,.06);
        }
        .finalPrice{ font-weight:850; }
        .cta{ border:0; border-radius:16px; padding:10px 14px; font-weight:900; cursor:pointer;
          background: rgba(255,255,255,.10); color:var(--txt); border:1px solid rgba(255,255,255,.12);
        }
      `}</style>
    </>
  );
}
