"use client";

import { useEffect, useMemo, useState } from "react";
import products from "./products.json";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Helper Telegram WebApp
function getWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp || null;
}

export default function Page() {
  // Init Telegram WebApp (si ouvert en vrai WebApp)
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

  // --- State
  const [cat, setCat] = useState("Tous");
  const [cart, setCart] = useState([]); // [{id, nom, prix, qty, photo, categorie}]
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Telegram context (calculé une seule fois par render)
  const webapp = getWebApp();
  const user = webapp?.initDataUnsafe?.user;
  const initDataLen = (webapp?.initData || "").length;

  // --- Data
  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.categorie));
    return ["Tous", ...Array.from(set)];
  }, []);

  const filtered = useMemo(() => {
    return cat === "Tous" ? products : products.filter((p) => p.categorie === cat);
  }, [cat]);

  const total = useMemo(() => {
    return cart.reduce(
      (sum, i) => sum + Number(i.prix || 0) * Number(i.qty || 0),
      0
    );
  }, [cart]);

  // --- Cart actions
  function add(p) {
    setCart((prev) => {
      const found = prev.find((x) => x.id === p.id);
      if (found) {
        return prev.map((x) => (x.id === p.id ? { ...x, qty: x.qty + 1 } : x));
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

  // --- Checkout
  async function checkout() {
    if (!API_URL) return alert("API_URL manquante (NEXT_PUBLIC_API_URL).");
    if (!user?.id) return alert("Ouvre la boutique depuis Telegram (pas navigateur).");
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

      const res = await fetch(`${API_URL}/api/create-order`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user: { id: user.id, username: user.username },
          items,
          totalEur,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        console.error("Order error:", data);
        return alert("Erreur commande. Vérifie les logs API Render.");
      }

      alert(`✅ Commande ${data.orderCode} envoyée.\n\nPaiement BTC (manuel) :\n${data.btcAddress}`);
      setCart([]);
    } catch (e) {
      console.error(e);
      alert("Erreur réseau. Réessaie.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 14, maxWidth: 980, margin: "0 auto" }}>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <h2 style={{ margin: 0 }}>🍄 UrbanFungi — Boutique</h2>
        <div style={{ fontWeight: 900 }}>{total.toFixed(2)} €</div>
      </header>

      {/* Debug non-WebApp */}
      {!user?.id && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 12,
            border: "1px solid #f3c",
            background: "#fff0f6",
            lineHeight: 1.35,
          }}
        >
          <b>⚠️ Mode non-WebApp</b>
          <div>Telegram.WebApp: {webapp ? "OK" : "ABSENT"}</div>
          <div>initData length: {initDataLen}</div>
          <div>user.id: {String(user?.id || "undefined")}</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            👉 Si <b>initData length = 0</b>, ton bouton ouvre en URL (pas WebApp).
          </div>
        </div>
      )}

      {/* Catégories */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 0 8px" }}>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid #ddd",
              background: c === cat ? "#111" : "#fff",
              color: c === cat ? "#fff" : "#111",
              whiteSpace: "nowrap",
              fontWeight: 800,
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Produits */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        {filtered.map((p) => (
          <div
            key={p.id}
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 14,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <img
              src={p.photo}
              alt={p.nom}
              style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
            />
            <div style={{ padding: 10 }}>
              <div style={{ fontWeight: 900 }}>{p.nom}</div>
              <div style={{ opacity: 0.7, marginTop: 2 }}>{p.categorie}</div>
              <div style={{ marginTop: 6, fontWeight: 900 }}>{p.prix} €</div>

              <button
                onClick={() => add(p)}
                style={{
                  marginTop: 8,
                  width: "100%",
                  padding: 10,
                  borderRadius: 10,
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                }}
              >
                ➕ Ajouter
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Panier sticky */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "rgba(255,255,255,0.96)",
          paddingTop: 10,
          marginTop: 14,
          backdropFilter: "blur(6px)",
        }}
      >
        <div style={{ borderTop: "1px solid #eee", paddingTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900 }}>
            <span>🛒 Panier</span>
            <span>{total.toFixed(2)} €</span>
          </div>

          {cart.length === 0 ? (
            <div style={{ opacity: 0.65, marginTop: 6 }}>Ajoutez un produit pour commander.</div>
          ) : (
            <div style={{ marginTop: 8 }}>
              {cart.map((i) => (
                <div
                  key={i.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 0",
                    gap: 10,
                  }}
                >
                  <div style={{ maxWidth: "65%" }}>
                    <div style={{ fontWeight: 900 }}>{i.nom}</div>
                    <div style={{ opacity: 0.7 }}>{i.prix} €</div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={() => dec(i.id)} style={{ padding: "6px 10px" }}>
                      −
                    </button>
                    <div style={{ minWidth: 18, textAlign: "center", fontWeight: 900 }}>
                      {i.qty}
                    </div>
                    <button onClick={() => add(i)} style={{ padding: "6px 10px" }}>
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
              marginTop: 10,
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "none",
              background: cart.length === 0 || isSubmitting ? "#b7f0c7" : "#22c55e",
              color: "#071a0e",
              fontWeight: 900,
              opacity: isSubmitting ? 0.8 : 1,
            }}
          >
            {isSubmitting ? "⏳ Envoi…" : "✅ Commander (BTC manuel)"}
          </button>
        </div>
      </div>
    </div>
  );
}
