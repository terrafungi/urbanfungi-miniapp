"use client";

import { useEffect, useMemo, useState } from "react";
import products from "./products.json";

const RAW_API =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "";

function normalizeBaseUrl(url) {
  if (!url) return "";
  return url.replace(/\/+$/, "");
}
const API_BASE = normalizeBaseUrl(RAW_API);

function getWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

function euro(n) {
  return Number(n || 0).toFixed(2);
}

function calcVariantPrice(product, selected) {
  let price = Number(product.prix || 0);
  const opts = product.options || [];
  for (const opt of opts) {
    const v = selected?.[opt.name];
    if (!v) continue;

    if (opt.type === "select") {
      const c = opt.choices?.find((x) => x.label === v);
      price += Number(c?.priceDelta || 0);
    }
    if (opt.type === "toggle") {
      // v = array de labels cochés
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
  // clé unique pour différencier 2 variantes dans le panier
  return `${productId}::${JSON.stringify(selected || {})}`;
}

async function safeJson(res) {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

export default function Page() {
  const [cat, setCat] = useState("Tous");
  const [cart, setCart] = useState([]); // [{key, id, nom, qty, unitPrice, selected, photo}]
  const [isSubmitting, setIsSubmitting] = useState(false);

  // modal options
  const [openProduct, setOpenProduct] = useState(null);
  const [selected, setSelected] = useState({}); // options selected for modal

  // Telegram init
  useEffect(() => {
    const w = getWebApp();
    if (!w) return;
    try {
      w.ready();
      w.expand();
      // thème Telegram (optionnel)
      document.documentElement.style.background = w.themeParams?.bg_color || "#0b0b0f";
    } catch {}
  }, []);

  const webapp = getWebApp();
  const user = webapp?.initDataUnsafe?.user;
  const initDataLen = (webapp?.initData || "").length;

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.categorie));
    return ["Tous", ...Array.from(set)];
  }, []);

  const filtered = useMemo(() => {
    return cat === "Tous" ? products : products.filter((p) => p.categorie === cat);
  }, [cat]);

  const total = useMemo(() => {
    return cart.reduce((sum, i) => sum + Number(i.unitPrice || 0) * Number(i.qty || 0), 0);
  }, [cart]);

  // ouvrir modal options
  function openOptions(p) {
    const opts = p.options || [];
    const init = {};
    for (const opt of opts) {
      if (opt.type === "select") {
        // si required: 1er choix par défaut
        if (opt.required && opt.choices?.[0]?.label) init[opt.name] = opt.choices[0].label;
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

  // checkout
  async function checkout() {
    if (!API_BASE) return alert("API_URL manquante (NEXT_PUBLIC_API_URL).");
    if (!user?.id || initDataLen === 0) return alert("Ouvrez via Telegram (Mini App), pas navigateur.");
    if (cart.length === 0) return alert("Panier vide.");
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const items = cart.map((i) => ({
        id: i.id,
        nom: i.nom,
        prix: Number(i.unitPrice),
        qty: Number(i.qty),
        options: i.selected, // ✅ on envoie les options aussi
      }));

      const totalEur = Number(total);

      const res = await fetch(`${API_BASE}/api/create-order`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user: { id: user.id, username: user.username || "" },
          items,
          totalEur,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        const msg = data?.error || data?.message || `Erreur commande (${res.status})`;
        return alert(msg);
      }

      alert(`✅ Commande ${data.orderCode} envoyée.\n\nBTC :\n${data.btcAddress}`);
      setCart([]);
    } catch (e) {
      console.error(e);
      alert("Erreur réseau. Réessayez.");
    } finally {
      setIsSubmitting(false);
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
            <img className="img" src={p.photo} alt={p.nom} />
            <div className="cardBody">
              <div className="name">{p.nom}</div>
              <div className="meta">{p.categorie}</div>
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
                  <button className="qbtn" onClick={() => dec(i.key)}>−</button>
                  <div className="qnum">{i.qty}</div>
                  <button className="qbtn" onClick={() => inc(i.key)}>+</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="checkout" disabled={!cart.length || isSubmitting} onClick={checkout}>
          {isSubmitting ? "⏳ Envoi…" : "✅ Commander"}
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
              <button className="close" onClick={() => setOpenProduct(null)}>✕</button>
            </div>

            {(openProduct.options || []).map((opt) => (
              <div key={opt.name} className="optBlock">
                <div className="optName">
                  {opt.name} {opt.required ? <span className="req">• obligatoire</span> : null}
                </div>

                {opt.type === "select" && (
                  <div className="choices">
                    {opt.choices.map((c) => {
                      const active = selected?.[opt.name] === c.label;
                      return (
                        <button
                          key={c.label}
                          className={`choice ${active ? "active" : ""}`}
                          onClick={() => setSelected((s) => ({ ...s, [opt.name]: c.label }))}
                        >
                          {c.label}
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

                {opt.type === "toggle" && (
                  <div className="choices">
                    {opt.choices.map((c) => {
                      const arr = Array.isArray(selected?.[opt.name]) ? selected[opt.name] : [];
                      const active = arr.includes(c.label);
                      return (
                        <button
                          key={c.label}
                          className={`choice ${active ? "active" : ""}`}
                          onClick={() => {
                            setSelected((s) => {
                              const cur = Array.isArray(s[opt.name]) ? s[opt.name] : [];
                              const next = active ? cur.filter((x) => x !== c.label) : [...cur, c.label];
                              return { ...s, [opt.name]: next };
                            });
                          }}
                        >
                          {active ? "✅ " : ""}{c.label}
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
              <button className="cta" onClick={() => addToCart(openProduct, selected)}>
                ➕ Ajouter au panier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styles */}
      <style>{`
        :root{
          --bg:#0b0b0f;
          --card:#12121a;
          --stroke:rgba(255,255,255,.08);
          --txt:#ffffff;
          --muted:rgba(255,255,255,.65);
          --accent:#22c55e;
          --accent2:#16a34a;
        }
        body{background:var(--bg); color:var(--txt);}
        .wrap{max-width:980px;margin:0 auto;padding:14px;font-family:system-ui;}
        .topbar{display:flex;justify-content:space-between;gap:12;align-items:center;margin-bottom:10px}
        .brand{display:flex;gap:10px;align-items:center}
        .logo{width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,#22c55e,#16a34a);
          display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 10px 30px rgba(34,197,94,.25)}
        .title{font-weight:900;font-size:18px;line-height:1}
        .subtitle{color:var(--muted);font-size:12px;margin-top:3px}
        .totalPill{background:rgba(255,255,255,.06);border:1px solid var(--stroke);border-radius:16px;padding:10px 12px;text-align:right}
        .big{font-weight:900;font-size:16px}
        .muted{color:var(--muted);font-size:12px}

        .cats{display:flex;gap:8px;overflow:auto;padding:8px 0 12px}
        .chip{border:1px solid var(--stroke);background:rgba(255,255,255,.04);color:#fff;border-radius:999px;
          padding:8px 12px;font-weight:800;white-space:nowrap}
        .chip.active{background:#fff;color:#000;border-color:#fff}

        .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        @media (max-width:520px){ .grid{grid-template-columns:1fr} }

        .card{background:var(--card);border:1px solid var(--stroke);border-radius:18px;overflow:hidden}
        .img{width:100%;height:160px;object-fit:cover;display:block}
        .cardBody{padding:12px}
        .name{font-weight:900}
        .meta{color:var(--muted);font-size:12px;margin-top:2px}
        .row{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:10px}
        .price{font-weight:900}
        .btn{border:none;background:rgba(255,255,255,.08);color:#fff;padding:10px 12px;border-radius:12px;font-weight:900}

        .cart{position:sticky;bottom:0;margin-top:14px;background:rgba(11,11,15,.85);backdrop-filter:blur(10px);
          border:1px solid var(--stroke);border-radius:18px;padding:12px}
        .cartTop{display:flex;justify-content:space-between;align-items:center}
        .cartTitle{font-weight:900}
        .cartTotal{font-weight:900}
        .empty{color:var(--muted);margin-top:8px}
        .cartList{margin-top:10px;display:flex;flex-direction:column;gap:10px}
        .cartRow{display:flex;justify-content:space-between;gap:10px;border-top:1px solid var(--stroke);padding-top:10px}
        .left{max-width:70%}
        .cartName{font-weight:900}
        .opts{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
        .optTag{font-size:11px;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid var(--stroke)}
        .qty{display:flex;gap:8px;align-items:center}
        .qbtn{width:36px;height:36px;border-radius:12px;border:1px solid var(--stroke);background:rgba(255,255,255,.04);color:#fff;font-size:18px}
        .qnum{min-width:20px;text-align:center;font-weight:900}
        .checkout{margin-top:12px;width:100%;border:none;border-radius:16px;padding:14px;font-weight:900;
          background:linear-gradient(135deg,var(--accent),var(--accent2));color:#071a0e}
        .checkout:disabled{opacity:.55}

        .modalBack{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;padding:12px}
        .modal{width:100%;max-width:720px;background:var(--card);border:1px solid var(--stroke);border-radius:22px;padding:14px}
        .modalHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
        .modalTitle{font-weight:900;font-size:16px}
        .close{border:none;background:rgba(255,255,255,.08);color:#fff;border-radius:12px;padding:8px 10px;font-weight:900}
        .optBlock{padding:10px 0;border-top:1px solid var(--stroke)}
        .optName{font-weight:900}
        .req{color:var(--muted);font-weight:700;font-size:12px;margin-left:6px}
        .choices{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
        .choice{border:1px solid var(--stroke);background:rgba(255,255,255,.04);color:#fff;border-radius:14px;padding:10px 12px;font-weight:900}
        .choice.active{background:#fff;color:#000;border-color:#fff}
        .delta{margin-left:8px;font-size:12px;opacity:.85}
        .modalFoot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px}
        .finalPrice{color:var(--muted)}
        .cta{border:none;border-radius:16px;padding:12px 14px;font-weight:900;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#071a0e}
      `}</style>
    </div>
  );
}
