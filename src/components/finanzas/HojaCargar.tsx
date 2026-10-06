"use client";
// Hoja inferior de "＋ Cargar" (spec §6.2): Dictar (principal), Rápido y los 4 atajos más usados.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DatosCarga } from "@/lib/finanzas/carga";

export function rutaAtajo(a: { descripcion: string; categoriaId: string }) {
  return `/finanzas/cargar?modo=rapido&categoria=${encodeURIComponent(a.categoriaId)}&desc=${encodeURIComponent(a.descripcion)}`;
}

export function OpcionesCarga({ atajos, categorias, onElegir }: {
  atajos: DatosCarga["atajos"];
  categorias: DatosCarga["categorias"];
  onElegir?: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Link href="/finanzas/cargar?modo=voz" className="fin-opcion-grande principal" onClick={onElegir}>
        <span className="ico" aria-hidden>🎙</span>
        <span>Dictar<small>Decí uno o varios gastos de una</small></span>
      </Link>
      <Link href="/finanzas/cargar?modo=rapido" className="fin-opcion-grande secundaria" onClick={onElegir}>
        <span className="ico" aria-hidden>⌨️</span>
        <span>Rápido<small>Monto y categoría, nada más</small></span>
      </Link>
      {atajos.length > 0 && (
        <div className="fin-chips" style={{ marginTop: 4 }} aria-label="Atajos">
          {atajos.map((a) => {
            const c = categorias.find((x) => x.id === a.categoriaId);
            return (
              <Link key={a.descripcion + a.categoriaId} href={rutaAtajo(a)} className="fin-chip" onClick={onElegir}>
                {c?.icono} {a.descripcion}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HojaCargar({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const [datos, setDatos] = useState<DatosCarga | null>(null);

  useEffect(() => {
    if (!abierta) return;
    fetch("/api/finanzas/carga", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setDatos).catch(() => {});
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierta, onCerrar]);

  if (!abierta) return null;
  return (
    <>
      <div className="fin-hoja-fondo" onClick={onCerrar} />
      <div className="fin-hoja" role="dialog" aria-modal="true" aria-label="Cargar">
        <div className="fin-hoja-asa" />
        <OpcionesCarga atajos={datos?.atajos ?? []} categorias={datos?.categorias ?? []} onElegir={onCerrar} />
        <button type="button" className="fin-btn secundario" style={{ width: "100%", marginTop: 10 }} onClick={onCerrar}>Cancelar</button>
      </div>
    </>
  );
}
