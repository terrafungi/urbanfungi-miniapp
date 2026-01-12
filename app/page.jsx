"use client";

import { useEffect, useMemo, useState } from "react";
import fallbackProducts from "./products.json";

/**
 * ✅ Source catalogue (PHP)
 * Si un jour tu veux la changer sans toucher au code :
 * ajoute NEXT_PUBLIC_CATALOG_URL dans ton hébergeur (Render/Vercel/etc)
 */
const CATALOG_URL =
  process.env.NEXT_PUBLIC_CATALOG_URL || "https://urbfgi.fun/api/catalog.php";

/**
 * ✅ Base API pour envoyer la commande (si tu as déjà un endpoint create-order)
 * Mets NEXT_PUBLIC_API_BASE si besoin, sinon ça utilise urbfgi.fun
 */
const ORDER_API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_URL ||
    "https://urbfgi.fun").replace(/\/+$/, "");

function getWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

function euro(n) {
  return Number(n || 0).toFixed(2);
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

/**
 * ✅ Convertit ton API PHP -> format attendu par ton UI/panier actuel :
 * - nom, photo, categorie, prix, options...
 * Et convertit variants[] -> options(select) pour garder ton panier inchangé.
 */
function mapApiToLegacy(api) {
  const cats = Array.isArray(api?.categories) ? api.categories : [];
  const catById = new Map(cats.map((c) => [String(c.id), c]));

  const out = [];
  for (const p of api?.products || []) {
    if (p?.active === false) continue;

    const catName =
      p.category ||
      catById.get(String(p.categoryId))?.name ||
      "Autres";

    const baseWeight = p.weight || "";
    const currency = p.currency || "EUR";

    // --- Variantes -> options select ---
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
          nom: p.title,
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

    // --- Sans variantes ---
    const basePrice = Number(p.salePrice ?? p.price ?? 0);

    out.push({
      id: p.id,
      nom: p.title,
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
  const [cat, setCat] = useState("Tous");
  const [cart, setCart] = useState([]); // [{key, id, nom, qty, unitPrice, selected, photo}]
  const [isSubmitting, setIsSubmitting] = useState(false);

  // catalogue
  const [products, setProducts] = useState(fallbackProducts);

  // modal options
  const [openProduct, setOpenProduct] = useState(null);
  const [selected, setSelected] = useState({});

  // Telegram init (UI)
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

  // ✅ Charger le catalogue depuis ton API PHP (sinon fallbackProducts)
  useEffect(() => {
    const url = `${CATALOG_URL}?v=${Date.now()}`; // anti-cache Telegram/GitHub
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
        // on garde fallbackProducts si l'API échoue
      });
  }, []);

  const categories = useMemo(() => {
    const set = new Set((products || []).map((p) => p?.categorie).filter(Boolean));
    return ["Tous", ...Array.from(set)];
  }, [products]);

  const filtered = useMemo(() => {
    const list = (products || []).filter((p) => p?.nom); // garde les items valides
    return cat === "Tous" ? list : list.filter((p) => p.categorie === cat);
  }, [cat, products]);

  const total = useMemo(() => {
    return cart.reduce(
      (sum, i) => sum + Number(i.unitPrice || 0) * Number(i.qty || 0),
      0
    );
  }, [cart]);

  function openOptions(p) {
    const opts = p.options || [];
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

      const totalEur = Number(total);

      const res = await fetch(`${ORDER_API_BASE}/api/create-order`, {
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
        const msg =
          data?.error ||
          data?.message ||
          `Erreur commande (${res.status})`;
        return alert(msg);
      }

      alert(`✅ Commande ${data.orderCode} envoyée.`);
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
              <button className="close" onClick={() => setOpenProduct(null)}>
                ✕
              </button>
            </div>

            {(openProduct.options || []).map((opt) => (
              <div key={opt.name} className="optBlock">
                <div className="optName">
                  {opt.label || opt.name}{" "}
                  {opt.required ? <span className="req">• obligatoire</span> : null}
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
                              const cur = Array.isArray(s[opt.name]) ? s[opt.name] : [];
                              const next = active
                                ? cur.filter((x) => x !== c.label)
                                : [...cur, c.label];
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
{/* Styles */}
<style jsx global>{`
  :root{
    --bg:#0b0b0f;
    --card:#12121a;
    --stroke: rgba(255,255,255,.08);
    --txt:#ffffff;
  }
`}</style>

  );
}
