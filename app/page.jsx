"use client";

import { useEffect, useMemo, useState } from "react";
import fallbackRaw from "./products.json";

const CATALOG_URL =
  process.env.NEXT_PUBLIC_CATALOG_URL || "https://urbfgi.fun/api/catalog.php";

function getWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

function euro(n) {
  return Number(n || 0).toFixed(2);
}

// Proxy image via ton domaine Next.js (évite blocages Telegram)
function proxifyImage(url) {
  if (!url || typeof url !== "string") return "";
  if (!url.startsWith("http")) return url;
  return `/api/img?u=${encodeURIComponent(url)}`;
}

function mapApiToUi(api) {
  const cats = Array.isArray(api?.categories) ? api.categories : [];
  const catById = new Map(cats.map((c) => [String(c.id), c]));
  const products = Array.isArray(api?.products) ? api.products : [];

  const out = [];
  for (const p of products) {
    if (!p || p.active === false) continue;

    const catName =
      p.category || catById.get(String(p.categoryId))?.name || "Autres";

    const description = String(p.longDesc || p.shortDesc || "").trim();

    // variantes => option select
    if (Array.isArray(p.variants) && p.variants.length) {
      const vars = p.variants.filter((v) => v?.active !== false);
      if (vars.length) {
        const prices = vars.map((v) => Number(v.salePrice ?? v.price ?? 0));
        const minPrice = Math.min(...prices);

        out.push({
          id: String(p.id),
          nom: p.title || "Produit",
          photo: proxifyImage(p.image || ""),
          rawPhoto: p.image || "",
          categorie: catName,
          prix: Number(minPrice.toFixed(2)),
          poids: p.weight || "",
          description,
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
                  variantId: v.id,
                };
              }),
            },
          ],
        });
        continue;
      }
    }

    // sans variantes
    out.push({
      id: String(p.id),
      nom: p.title || "Produit",
      photo: proxifyImage(p.image || ""),
      rawPhoto: p.image || "",
      categorie: catName,
      prix: Number(Number(p.salePrice ?? p.price ?? 0).toFixed(2)),
      poids: p.weight || "",
      description,
      options: Array.isArray(p.options) ? p.options : [],
    });
  }
  return out;
}

// Fallback robuste : accepte array UI ou JSON API (categories/products)
function normalizeFallback(raw) {
  if (Array.isArray(raw)) return raw; // déjà mappé UI
  if (raw && Array.isArray(raw.products)) return mapApiToUi(raw);
  return [];
}

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

export default function Page() {
  const initialFallback = useMemo(() => normalizeFallback(fallbackRaw), []);
  const [products, setProducts] = useState(initialFallback);

  const [cat, setCat] = useState("Tous");
  const [cart, setCart] = useState([]);
  const [openProduct, setOpenProduct] = useState(null);
  const [selected, setSelected] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // cache-buster stable
  const [imgBust, setImgBust] = useState(Date.now());

  // Telegram init
  useEffect(() => {
    const w = getWebApp();
    if (!w) return;
    try {
      w.ready();
      w.expand();
    } catch {}
  }, []);

  // Bloquer le scroll derrière la modal (important sur mobile)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    if (openProduct) {
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
    } else {
      html.style.overflow = "";
      body.style.overflow = "";
      body.style.touchAction = "";
    }

    return () => {
      html.style.overflow = "";
      body.style.overflow = "";
      body.style.touchAction = "";
    };
  }, [openProduct]);

  // Load catalog
  useEffect(() => {
    const url = `${CATALOG_URL}?v=${Date.now()}`;
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((api) => {
        const mapped = mapApiToUi(api);
        if (Array.isArray(mapped) && mapped.length) {
          setProducts(mapped);
          setImgBust(Date.now());
        }
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
    return cart.reduce((sum, i) => sum + Number(i.unitPrice) * Number(i.qty), 0);
  }, [cart]);

  function openInfos(p) {
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

  function quickAddOrOpen(product) {
    if (product?.options?.length) {
      openInfos(product);
      return;
    }
    addToCart(product, {});
  }

  function addToCart(product, sel) {
    const unitPrice = calcPrice(product, sel);
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

  function sendOrderToBot() {
    const w = getWebApp();

    if (!w) {
      alert("Mini-App Telegram non détectée. Ouvrez depuis le bot.");
      return;
    }

    if (!cart.length || isSubmitting) return;

    setIsSubmitting(true);

    const payload = {
      type: "ORDER",
      totalEur: Number(total.toFixed(2)),
      items: cart.map((i) => ({
        id: i.id,
        nom: i.nom,
        qty: Number(i.qty),
        unitPrice: Number(i.unitPrice),
        options: i.selected || {},
      })),
    };

    try {
      w.sendData(JSON.stringify(payload));

      w.showAlert("✅ Commande envoyée au bot. Retour au chat…", () => {
        try {
          w.close();
        } catch {}
      });

      setCart([]);
    } catch (e) {
      console.error(e);
      alert("Erreur envoi au bot.");
    } finally {
      setTimeout(() => setIsSubmitting(false), 600);
    }
  }

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
            {p.photo ? (
              <button className="imgBtn" onClick={() => openInfos(p)}>
                <img
                  className="img"
                  src={`${p.photo}${p.photo.includes("?") ? "&" : "?"}v=${imgBust}`}
                  alt={p.nom}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </button>
            ) : (
              <button className="imgBtn placeholder" onClick={() => openInfos(p)}>
                <div className="ph">🍄</div>
              </button>
            )}

            <div className="cardBody">
              <div className="name">{p.nom}</div>
              <div className="meta">
                {p.categorie}
                {p.poids ? ` • ${p.poids}` : ""}
              </div>

              <div className="row">
                <div className="price">{euro(p.prix)} €</div>

                <div className="actions">
                  <button className="btn ghost" onClick={() => openInfos(p)}>
                    ℹ️ Infos
                  </button>

                  <button className="btn" onClick={() => quickAddOrOpen(p)}>
                    ➕ Ajouter
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

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
                          {k}: {String(v)}
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
          onClick={sendOrderToBot}
        >
          {isSubmitting ? "⏳ Envoi…" : "✅ Commander (Bitcoin / Transcash)"}
        </button>
      </div>

      {openProduct && (
        <div className="modalBack" onClick={() => setOpenProduct(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <div className="modalTitle">{openProduct.nom}</div>
                <div className="muted">
                  {openProduct.categorie}
                  {openProduct.poids ? ` • ${openProduct.poids}` : ""}
                </div>
              </div>
              <button className="close" onClick={() => setOpenProduct(null)}>
                ✕
              </button>
            </div>

            {openProduct.photo ? (
              <div className="modalImgWrap">
                <img
                  className="modalImg"
                  src={`${openProduct.photo}${
                    openProduct.photo.includes("?") ? "&" : "?"
                  }v=${imgBust}`}
                  alt={openProduct.nom}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <a
                  className="openLink"
                  href={openProduct.photo}
                  target="_blank"
                  rel="noreferrer"
                >
                  🔗 Ouvrir la photo
                </a>
              </div>
            ) : null}

            {openProduct.description ? (
              <div className="desc">
                <div className="descTitle">📄 Description</div>
                <div className="descText">{openProduct.description}</div>
              </div>
            ) : null}

            {(openProduct.options || []).length ? (
              <div className="optArea">
                <div className="optAreaTitle">⚙️ Options</div>

                {(openProduct.options || []).map((opt) => (
                  <div key={opt.name} className="optBlock">
                    <div className="optName">{opt.label || opt.name}</div>

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
                  </div>
                ))}
              </div>
            ) : null}

            <div className="modalFoot">
              <div className="finalPrice">
                Prix: <b>{euro(calcPrice(openProduct, selected))} €</b>
              </div>
              <button className="cta" onClick={() => addToCart(openProduct, selected)}>
                ➕ Ajouter au panier
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        :root{
          --bg:#0b0b0f;
          --card:#12121a;
          --stroke:rgba(255,255,255,.08);
          --txt:#fff;
          --ok:#22c55e;
        }
        html,body{
          background:var(--bg);
          color:var(--txt);
          margin:0;
          font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
        }
        .wrap{padding:14px;padding-bottom:120px;}
        .topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;}
        .brand{display:flex;align-items:center;gap:10px;}
        .logo{
          width:38px;height:38px;border-radius:12px;
          background:var(--card);
          display:grid;place-items:center;
          border:1px solid var(--stroke);
        }
        .title{font-weight:900;line-height:1.1;}
        .subtitle{opacity:.7;font-size:12px;}
        .totalPill{
          background:var(--card);
          border:1px solid var(--stroke);
          border-radius:14px;
          padding:8px 10px;
          min-width:120px;
          text-align:right;
        }
        .muted{opacity:.7;font-size:12px;}
        .big{font-weight:900;}

        .cats{display:flex;gap:8px;overflow:auto;padding-bottom:8px;margin-bottom:10px;}
        .chip{
          border:1px solid var(--stroke);
          background:transparent;color:var(--txt);
          padding:8px 10px;border-radius:999px;
          white-space:nowrap;
        }
        .chip.active{background:rgba(255,255,255,.12);}

        .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
        @media (min-width:900px){.grid{grid-template-columns:repeat(4,minmax(0,1fr));}}

        .card{
          background:var(--card);
          border:1px solid var(--stroke);
          border-radius:16px;
          overflow:hidden;
        }

        .imgBtn{
          padding:0;border:0;background:transparent;
          width:100%;
          cursor:pointer;
          display:block;
        }
        .imgBtn.placeholder{
          height:170px;
          display:grid;
          place-items:center;
          background:rgba(255,255,255,.04);
        }
        .ph{font-size:34px;opacity:.85;}

        .img{
          width:100%;
          height:170px;
          object-fit:cover;
          display:block;
        }

        .cardBody{padding:10px;}
        .name{font-weight:900;margin-bottom:6px;}
        .meta{opacity:.75;font-size:12px;margin-bottom:10px;}
        .row{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;}
        .price{font-weight:900;font-size:18px;}

        /* Anti-tronquage boutons */
        .actions{
          display:flex;
          gap:8px;
          align-items:center;
          flex-wrap:wrap;
          justify-content:flex-end;
          min-width:0;
        }
        .btn{
          border:1px solid var(--stroke);
          background:rgba(255,255,255,.06);
          color:var(--txt);
          padding:8px 10px;
          border-radius:12px;
          font-weight:800;
          cursor:pointer;
          white-space:nowrap;
          min-width:0;
          flex:1 1 120px;
        }
        .btn.ghost{background:transparent;}
        @media (max-width: 380px){
          .actions{
            flex-direction:column;
            align-items:stretch;
          }
          .btn{
            width:100%;
            flex: 1 1 auto;
          }
        }

        .cart{
          position:fixed;left:0;right:0;bottom:0;
          background:rgba(11,11,15,.85);
          backdrop-filter:blur(10px);
          border-top:1px solid var(--stroke);
          padding:12px 14px;
          padding-bottom: calc(12px + env(safe-area-inset-bottom));
        }
        .cartTop{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
        .cartTitle,.cartTotal{font-weight:900;}
        .empty{opacity:.7;font-size:13px;padding:6px 0 10px;}
        .cartList{max-height:180px;overflow:auto;padding-right:6px;margin-bottom:10px;}
        .cartRow{
          display:flex;justify-content:space-between;gap:10px;
          border:1px solid var(--stroke);
          border-radius:14px;
          padding:10px;
          margin-bottom:8px;
          background:rgba(255,255,255,.04);
        }
        .cartName{font-weight:900;margin-bottom:4px;}
        .opts{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;}
        .optTag{font-size:11px;border:1px solid var(--stroke);border-radius:999px;padding:3px 8px;opacity:.85;}
        .qty{display:flex;align-items:center;gap:8px;}
        .qbtn{
          width:34px;height:34px;border-radius:12px;
          border:1px solid var(--stroke);
          background:rgba(255,255,255,.06);
          color:var(--txt);
          font-size:18px;font-weight:900;
        }
        .qnum{min-width:18px;text-align:center;font-weight:900;}

        .checkout{
          width:100%;
          border:none;
          background:var(--ok);
          color:#0b0b0f;
          font-weight:900;
          padding:12px 14px;
          border-radius:14px;
          cursor:pointer;
        }
        .checkout:disabled{opacity:.5;cursor:not-allowed;}

        /* ✅ MODAL SCROLLABLE (bottom-sheet) */
        .modalBack{
          position:fixed;
          inset:0;
          background:rgba(0,0,0,.6);

          display:flex;
          justify-content:center;
          align-items:flex-end;

          overflow:auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;

          padding:14px;
          padding-bottom: calc(14px + env(safe-area-inset-bottom));
        }
        .modal{
          width:min(560px,100%);
          background:var(--card);
          border:1px solid var(--stroke);
          border-radius:18px;

          max-height: calc(100vh - 28px - env(safe-area-inset-bottom));
          overflow:auto;
          -webkit-overflow-scrolling: touch;
        }
        .modalHead{
          position: sticky;
          top: 0;
          z-index: 5;

          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          padding:12px;
          border-bottom:1px solid var(--stroke);
          gap:10px;

          background: var(--card);
        }
        .modalTitle{font-weight:900;margin-bottom:4px;}
        .close{
          border:1px solid var(--stroke);
          background:rgba(255,255,255,.06);
          color:var(--txt);
          border-radius:12px;
          padding:8px 10px;
          cursor:pointer;
        }

        .modalImgWrap{position:relative;}
        .modalImg{
          width:100%;
          height: min(320px, 35vh);
          object-fit:cover;
          display:block;
          background:rgba(255,255,255,.04);
        }
        .openLink{
          position:absolute;
          right:10px;
          bottom:10px;
          font-weight:900;
          text-decoration:none;
          color:var(--txt);
          background:rgba(0,0,0,.45);
          border:1px solid var(--stroke);
          padding:8px 10px;
          border-radius:12px;
          backdrop-filter:blur(6px);
        }

        .desc{padding:12px;border-bottom:1px solid var(--stroke);}
        .descTitle{font-weight:900;margin-bottom:8px;}
        .descText{
          white-space:pre-wrap;
          opacity:.92;
          line-height:1.35;
          font-size:14px;
        }

        .optArea{padding:12px;border-bottom:1px solid var(--stroke);}
        .optAreaTitle{font-weight:900;margin-bottom:10px;}
        .optBlock{margin-bottom:10px;}
        .optName{font-weight:900;margin-bottom:8px;}
        .choices{display:flex;flex-wrap:wrap;gap:8px;}
        .choice{
          border:1px solid var(--stroke);
          background:rgba(255,255,255,.05);
          color:var(--txt);
          padding:10px 12px;
          border-radius:14px;
          font-weight:900;
          display:flex;
          align-items:center;
          gap:8px;
          cursor:pointer;
        }
        .choice.active{
          background:rgba(34,197,94,.22);
          border-color:rgba(34,197,94,.5);
        }
        .delta{opacity:.85;font-size:12px;}

        .modalFoot{
          position: sticky;
          bottom: 0;
          z-index: 5;

          padding:12px;
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;

          background: var(--card);
          border-top: 1px solid var(--stroke);
        }
        .finalPrice{font-weight:900;}
        .cta{
          border:none;
          background:var(--ok);
          color:#0b0b0f;
          font-weight:900;
          padding:10px 12px;
          border-radius:14px;
          cursor:pointer;
        }
      `}</style>
    </div>
  );
}
