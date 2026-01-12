"use client";

import { useEffect, useMemo, useState } from "react";
import products from "./products.json";

/**
 * Env vars:
 * - NEXT_PUBLIC_API_URL = "https://urbanfungi-api.onrender.com"
 *   (ou NEXT_PUBLIC_API_BASE, on accepte les 2)
 * - NEXT_PUBLIC_DEBUG = "1" pour afficher le panneau debug
 */
const RAW_API =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "1";

function normalizeBaseUrl(url) {
  if (!url) return "";
  return url.replace(/\/+$/, ""); // enlève les "/" finaux
}

const API_BASE = normalizeBaseUrl(RAW_API);

// Telegram WebApp helper
function getWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

function euro(n) {
  const v = Number(n || 0);
  return v.toFixed(2);
}

export default function Page() {
  const [cat, setCat] = useState("Tous");
  const [cart, setCart] = useState([]); // [{id, nom, prix, qty, photo, categorie}]
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Init Telegram WebApp (une seule fois)
  useEffect(() => {
    const w = getWebApp();
    if (!w) return;
    try {
      w.ready();
      w.expand();
    } catch (e) {
      console.warn("Telegram WebApp init failed:", e);
    }
  }, []);

  // Telegram context
  const webapp = getWebApp();
  const user = webapp?.initDataUnsafe?.user;
  const initDataLen = (webapp?.initData || "").length;

  // Categories
  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.categorie));
    return ["Tous", ...Array.from(set)];
  }, []);

  // Products filtered
  const filtered = useMemo(() => {
    return cat === "Tous" ? products : products.filter((p) => p.categorie === cat);
  }, [cat]);

  // Total
  const total = useMemo(() => {
    return cart.reduce((sum, i) => sum + Number(i.prix || 0) * Number(i.qty || 0), 0);
  }, [cart]);

  // Cart actions
  function add(p) {
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, { ...p, qty: 1 }];
    });
  }

  function dec(id) {
    setCart((prev) =>
      prev
        .map((x) => (x.id === id ? { ...x, qty: x.qty - 1 } : x))
        .filter((x) => x.qty > 0)
    );
  }

  // Safe JSON read
  async function safeJson(res) {
    const text = await res.text().catch(() => "");
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { _raw: text };
    }
  }

  // Checkout
  async function checkout() {
    if (!API_BASE) return alert("API_URL manquante (NEXT_PUBLIC_API_URL).");
    if (!user?.id || initDataLen === 0) {
      return alert("Ouvrez la boutique via Telegram (Mini App), pas via le navigateur.");
    }
    if (cart.length === 0) return alert("Panier vide.");
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const items = cart.map((i) => ({
        id: i.id,
        nom: i.nom,
        prix: Number(i.prix),
        qty: Number(i.qty),
      }));

      const totalEur = Number(total);

      const res = await fetch(`${API_BASE}/api/create-order`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user: { id: user.id, username: user.username || "" },
          items,
          totalEur,
          // (optionnel) initData si tu veux vérifier côté serveur:
          // initData: webapp?.initData || ""
        }),
      });

      const data = await safeJson(res);

      if (!res.ok || !data?.ok) {
        console.error("Order error:", res.status, data);
        const msg =
          data?.error ||
          data?.message ||
          `Erreur commande (${res.status}). Vérifiez les logs de urbanfungi-api.`;
        return alert(msg);
      }

      alert(`✅ Commande ${data.orderCode} envoyée.\n\nPaiement BTC (manuel) :\n${data.btcAddress}`);
      setCart([]);
    } catch (e) {
      console.error(e);
      alert("Erreur réseau. Réessayez.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <h2 style={styles.h2}>🍄 UrbanFungi — Boutique</h2>
        <div style={styles.totalTop}>{euro(total)} €</div>
      </header>

      {/* Debug */}
      {DEBUG && (
        <div style={styles.debug}>
          <b>Debug</b>
          <div>Telegram.WebApp: {webapp ? "OK" : "ABSENT"}</div>
          <div>initData length: {initDataLen}</div>
          <div>user.id: {String(user?.id ?? "undefined")}</div>
          <div>API_BASE: {API_BASE || "(vide)"}</div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            👉 Si initData length = 0, ce n’est pas une vraie Mini App.
          </div>
        </div>
      )}

      {/* Catégories */}
      <div style={styles.catsRow}>
        {categories.map((c) => {
          const active = c === cat;
          return (
            <button
              key={c}
              onClick={() => setCat(c)}
              style={{
                ...styles.catBtn,
                ...(active ? styles.catBtnActive : {}),
              }}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* Produits */}
      <div style={styles.grid}>
        {filtered.map((p) => (
          <div key={p.id} style={styles.card}>
            <img src={p.photo} alt={p.nom} style={styles.img} />
            <div style={styles.cardBody}>
              <div style={styles.name}>{p.nom}</div>
              <div style={styles.meta}>{p.categorie}</div>
              <div style={styles.price}>{p.prix} €</div>

              <button onClick={() => add(p)} style={styles.addBtn}>
                ➕ Ajouter
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Panier sticky */}
      <div style={styles.sticky}>
        <div style={styles.stickyInner}>
          <div style={styles.cartTop}>
            <span>🛒 Panier</span>
            <span>{euro(total)} €</span>
          </div>

          {cart.length === 0 ? (
            <div style={styles.empty}>Ajoutez un produit pour commander.</div>
          ) : (
            <div style={{ marginTop: 8 }}>
              {cart.map((i) => (
                <div key={i.id} style={styles.cartRow}>
                  <div style={styles.cartLeft}>
                    <div style={styles.cartName}>{i.nom}</div>
                    <div style={styles.cartPrice}>{i.prix} €</div>
                  </div>

                  <div style={styles.qty}>
                    <button onClick={() => dec(i.id)} style={styles.qtyBtn}>
                      −
                    </button>
                    <div style={styles.qtyNum}>{i.qty}</div>
                    <button onClick={() => add(i)} style={styles.qtyBtn}>
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={checkout}
            disabled={cart.length === 0 || isSubmitting}
            style={{
              ...styles.checkout,
              ...(cart.length === 0 || isSubmitting ? styles.checkoutDisabled : {}),
            }}
          >
            {isSubmitting ? "⏳ Envoi…" : "✅ Commander (BTC manuel)"}
          </button>
        </div>
      </div>

      {/* Responsive mini CSS inline */}
      <style>{`
        @media (max-width: 520px) {
          .uf-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const styles = {
  wrap: { fontFamily: "system-ui", padding: 14, maxWidth: 980, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 },
  h2: { margin: 0 },
  totalTop: { fontWeight: 900 },

  debug: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    border: "1px solid #f3c",
    background: "#fff0f6",
    lineHeight: 1.35,
  },

  catsRow: { display: "flex", gap: 8, overflowX: "auto", padding: "10px 0 8px" },
  catBtn: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: "#fff",
    color: "#111",
    whiteSpace: "nowrap",
    fontWeight: 800,
  },
  catBtnActive: { background: "#111", color: "#fff" },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  card: { border: "1px solid #e5e5e5", borderRadius: 14, overflow: "hidden", background: "#fff" },
  img: { width: "100%", height: 140, objectFit: "cover", display: "block" },
  cardBody: { padding: 10 },
  name: { fontWeight: 900 },
  meta: { opacity: 0.7, marginTop: 2 },
  price: { marginTop: 6, fontWeight: 900 },
  addBtn: {
    marginTop: 8,
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "none",
    background: "#111",
    color: "#fff",
    fontWeight: 900,
  },

  sticky: {
    position: "sticky",
    bottom: 0,
    background: "rgba(255,255,255,0.96)",
    paddingTop: 10,
    marginTop: 14,
    backdropFilter: "blur(6px)",
  },
  stickyInner: { borderTop: "1px solid #eee", paddingTop: 10 },
  cartTop: { display: "flex", justifyContent: "space-between", fontWeight: 900 },
  empty: { opacity: 0.65, marginTop: 6 },

  cartRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    gap: 10,
  },
  cartLeft: { maxWidth: "65%" },
  cartName: { fontWeight: 900 },
  cartPrice: { opacity: 0.7 },

  qty: { display: "flex", gap: 8, alignItems: "center" },
  qtyBtn: { padding: "6px 10px" },
  qtyNum: { minWidth: 18, textAlign: "center", fontWeight: 900 },

  checkout: {
    marginTop: 10,
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "none",
    background: "#22c55e",
    color: "#071a0e",
    fontWeight: 900,
  },
  checkoutDisabled: { background: "#b7f0c7", opacity: 0.9 },
};
