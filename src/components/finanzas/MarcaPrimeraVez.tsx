"use client";
// Marca de primera vez (spec §7.1): un globo que señala el elemento de abajo la primera vez que se entra
// a una pantalla. Uno por pantalla, se cierra con un toque y no vuelve.
import { useEffect, useState } from "react";
import type { MarcaId } from "@/lib/finanzas/adopcion";

export default function MarcaPrimeraVez({ id }: { id: MarcaId }) {
  const [texto, setTexto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/finanzas/guias?marca=${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => vivo && j?.texto && setTexto(j.texto))
      .catch(() => null);
    return () => { vivo = false; };
  }, [id]);

  if (!texto) return null;
  const cerrar = () => {
    setTexto(null);
    fetch("/api/finanzas/guias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marca: id }), keepalive: true }).catch(() => null);
  };
  return (
    <div className="fin-marca-guia fin-celebrar" role="note" onClick={cerrar}>
      <span aria-hidden>👇</span>
      <span style={{ flex: 1 }}>{texto}</span>
      <button type="button" className="fin-link" style={{ minHeight: 32, fontSize: 13 }} onClick={(e) => { e.stopPropagation(); cerrar(); }}>Entendido</button>
    </div>
  );
}
