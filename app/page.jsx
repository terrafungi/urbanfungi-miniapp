"use client";

import { useMemo, useState } from "react";
import products from "./products.json";

const API_URL = process.env.NEXT_PUBLIC_API_URL; // Render API url

function tg() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp || null;
}

export default function Page() {
  const categories = useMemo(() => {
    const set = new Set(products.map(p => p.categorie));
    return ["Tous", ...Array.from(set)];
  }, []);

  const [cat, setCat] = useState("Tous");
  const [cart, setCart] = useState([]); // [{id, nom, prix, qty, photo}]

  const filtered = useMemo(() => {
    return cat === "Tous" ? products : products.filter(p => p.categorie === cat);
  }, [cat]);

  const total = useMemo(() => cart.reduce((s, i) => s + i.prix * i.qty, 0), [cart]);

  function add(p) {
    setCart(prev => {
      const found = prev.find(x => x.id === p.id);
      if (found) return prev.map(x => x.id === p.id ? { ...x, qty: x.qty + 1 } : x);
      return [...prev, { ...p, qty: 1 }];
    });
  }

  function dec(id) {
    setCart(prev => prev
      .map(x => x.id === id ? { ...x, qty: x.qty - 1 } : x)
      .filter(x => x.qty > 0)
    );
  }

  async function checkout() {
    const webapp = tg();
    const user = webapp?.initDataUnsafe?.user;

    if (!API_URL) return alert("API_URL manquante (NEXT_PUBLIC_API_URL).");
    if (!user?.id) return alert("Ouvre la boutique depuis Telegram (pas navigateur).");
    if (cart.length === 0) return alert("Panier vide.");

    const items = cart.map(i => ({ id: i.id, nom: i.nom, prix: i.prix, qty: i.qty }));
    const totalEur = Number(total);

    const res = await fetch(`${API_URL}/api/create-order`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user: { id: user.id, username: user.username }, items, totalEur })
    });

    const data = await res.json();
    if (!data.ok) return alert("Erreur commande. Regarde les logs API Render.");

    alert(`✅ Commande ${data.orderCode} envoyée.\n\nPaiement BTC (manuel) :\n${data.btcAddress}`);
    setCart([]);
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 14, maxWidth: 980, margin: "0 auto" }}>
      <h2>🍄 UrbanFungi — Boutique</h2>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
        {categories.map(c => (
          <button key={c}
            onClick={() => setCat(c)}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid #ddd",
              background: c === cat ? "#111" : "#fff",
              color: c === cat ? "#fff" : "#111",
              whiteSpace: "nowrap"
            }}>
            {c}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        {filtered.map(p => (
          <div key={p.id} style={{ border: "1px solid #e5e5e5", borderRadius: 14, overflow: "hidden" }}>
            <img src={p.photo} alt={p.nom} style={{ width: "100%", height: 140, objectFit: "cover" }} />
            <div style={{ padding: 10 }}>
              <div style={{ fontWeight: 700 }}>{p.nom}</div>
              <div style={{ opacity: 0.7 }}>{p.categorie}</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>{p.prix} €</div>
              <button onClick={() => add(p)}
                style={{ marginTop: 8, width: "100%", padding: 10, borderRadius: 10, border: "none", background: "#111", color: "#fff" }}>
                ➕ Ajouter
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: "sticky", bottom: 0, background: "rgba(255,255,255,0.95)", paddingTop: 10, marginTop: 14 }}>
        <div style={{ borderTop: "1px solid #eee", paddingTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
            <span>🛒 Panier</span>
            <span>{total.toFixed(2)} €</span>
          </div>

          {cart.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {cart.map(i => (
                <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                  <div style={{ maxWidth: "65%" }}>
                    <div style={{ fontWeight: 600 }}>{i.nom}</div>
                    <div style={{ opacity: 0.7 }}>{i.prix} €</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={() => dec(i.id)} style={{ padding: "6px 10px" }}>−</button>
                    <div style={{ minWidth: 18, textAlign: "center" }}>{i.qty}</div>
                    <button onClick={() => add(i)} style={{ padding: "6px 10px" }}>+</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button onClick={checkout}
            style={{ marginTop: 10, width: "100%", padding: 12, borderRadius: 12, border: "none", background: "#22c55e", color: "#071a0e", fontWeight: 900 }}>
            ✅ Commander (BTC manuel)
          </button>
        </div>
      </div>
    </div>
  );
}
