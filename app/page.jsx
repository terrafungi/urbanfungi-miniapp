"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = "https://urbfgi.fun/api/catalog.php";

export default function Page() {
  const [catalog, setCatalog] = useState(null);
  const [activeCat, setActiveCat] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    const url = `${API_BASE}?v=${Date.now()}`; // anti-cache Telegram/GitHub
    fetch(url, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setCatalog(data))
      .catch((e) => setError(String(e?.message || e)));
  }, []);

  const categories = catalog?.categories ?? [];
  const products = catalog?.products ?? [];

  const filtered = useMemo(() => {
    const list = products.filter((p) => p?.active);
    if (activeCat === "all") return list;
    return list.filter(
      (p) => p.category === activeCat || String(p.categoryId) === String(activeCat)
    );
  }, [products, activeCat]);

  if (error) return <div style={{ padding: 16 }}>Erreur catalogue : {error}</div>;
  if (!catalog) return <div style={{ padding: 16 }}>Chargement du catalogue…</div>;

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <h2 style={{ marginBottom: 12 }}>Catalogue</h2>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={() => setActiveCat("all")}>Toutes</button>
        {categories.map((c) => (
          <button key={c.id} onClick={() => setActiveCat(c.slug)}>
            {c.name}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {filtered.map((p) => (
          <div key={p.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            {p.image ? (
              <img src={p.image} alt={p.title} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 10 }} />
            ) : null}

            <div style={{ fontWeight: 700, marginTop: 8 }}>{p.title}</div>

            {/* Affichage prix: si variantes -> "à partir de", sinon prix base */}
            <div style={{ marginTop: 6 }}>
              {Array.isArray(p.variants) && p.variants.length > 0 ? (
                <>
                  À partir de{" "}
                  {Math.min(...p.variants.filter(v => v.active).map((v) => Number(v.price) || Infinity))}{" "}
                  {p.currency || "EUR"}
                </>
              ) : (
                <>
                  {p.price} {p.currency || "EUR"} {p.weight ? `• ${p.weight}` : ""}
                </>
              )}
            </div>

            {/* Variantes */}
            {Array.isArray(p.variants) && p.variants.length > 0 ? (
              <select style={{ width: "100%", marginTop: 10 }}>
                {p.variants
                  .filter((v) => v.active)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label} — {v.price} {p.currency || "EUR"}
                    </option>
                  ))}
              </select>
            ) : null}

            {p.link ? (
              <a href={p.link} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10 }}>
                Voir
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
