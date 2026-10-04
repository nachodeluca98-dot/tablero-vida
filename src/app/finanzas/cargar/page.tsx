"use client";
// Carga de movimientos (spec §6.2): por voz con tarjetas editables, modo Rápido y atajos.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { Borrador } from "@/lib/finanzas/borrador";
import type { DatosCarga } from "@/lib/finanzas/carga";
import { equivalentes, fmtArs, fmtUsd } from "@/lib/finanzas/dinero";
import CargaVoz, { AvisoDeshacer, borradorVacio, guardar, vibrar, type Guardado } from "@/components/finanzas/CargaVoz";
import GrillaCategorias from "@/components/finanzas/GrillaCategorias";
import { OpcionesCarga } from "@/components/finanzas/HojaCargar";
import TarjetaBorrador from "@/components/finanzas/TarjetaBorrador";
import Teclado, { formatearTexto, montoDeTexto } from "@/components/finanzas/Teclado";

// ─── Modo rápido ────────────────────────────────────────────────

function ModoRapido({ datos, atajo, descripcion }: { datos: DatosCarga; atajo: { categoriaId: string; descripcion: string } | null; descripcion?: string | null }) {
  const [valor, setValor] = useState("");
  const [b, setB] = useState<Borrador>(() =>
    borradorVacio(datos, atajo ? { categoriaId: atajo.categoriaId, descripcion: atajo.descripcion } : { descripcion: descripcion || null })
  );
  // Si viene una descripción sin categoría (p. ej. un dictado que no se pudo interpretar), se muestran los detalles
  const [detalles, setDetalles] = useState(!atajo && !!descripcion);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<Guardado | null>(null);

  const monto = montoDeTexto(valor);
  const eq = monto ? equivalentes(monto, b.moneda, datos.tipoCambio) : null;

  async function guardarCon(categoriaId: string | null) {
    if (!monto || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const final = { ...b, monto, categoriaId };
      const r = await guardar([final], "app_rapida", { chequearDuplicados: true });
      vibrar();
      const cat = datos.categorias.find((c) => c.id === categoriaId);
      const plan = r.planes[0]?.texto;
      setGuardado({
        ids: r.ids,
        texto: `${b.moneda === "USD" ? fmtUsd(monto) : fmtArs(monto)} en ${cat?.nombre ?? "Sin clasificar"}${plan ? ` · ${plan}` : ""}`,
        avisos: r.avisos,
      });
      setValor("");
      setB(borradorVacio(datos));
      setDetalles(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
        {(["ARS", "USD"] as const).map((m) => (
          <button key={m} type="button" className={`fin-chip ${b.moneda === m ? "activo" : ""}`} onClick={() => setB({ ...b, moneda: m })}>{m}</button>
        ))}
      </div>
      <div className="fin-monto-display" aria-live="polite">
        {valor ? <>{b.moneda === "USD" ? "US$ " : "$ "}{formatearTexto(valor)}</> : <span className="vacio">{b.moneda === "USD" ? "US$ 0" : "$ 0"}</span>}
      </div>
      <div className="fin-monto-conv">{eq ? (b.moneda === "ARS" ? fmtUsd(eq.usd) : fmtArs(eq.ars)) : ""}</div>
      <Teclado valor={valor} onChange={setValor} />

      {atajo ? (
        <button type="button" className="fin-btn primario" style={{ width: "100%", marginTop: 12, minHeight: 52 }} disabled={!monto || guardando} onClick={() => guardarCon(b.categoriaId)}>
          Guardar {b.descripcion}
        </button>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 6 }}>
            {monto ? "Tocá la categoría y listo" : "Escribí el monto y tocá la categoría"}
          </div>
          <GrillaCategorias categorias={datos.categorias} tipo={b.tipo} sugerida={b.categoriaId} onElegir={(id) => guardarCon(id)} />
          <button type="button" className="fin-chip vacio" style={{ marginTop: 8 }} disabled={!monto || guardando} onClick={() => guardarCon(null)}>
            Guardar sin categoría
          </button>
        </div>
      )}

      {error && <div style={{ color: "var(--amb-t)", marginTop: 10 }}>{error}</div>}

      <button type="button" className="fin-link" style={{ marginTop: 8 }} onClick={() => setDetalles((d) => !d)} aria-expanded={detalles}>
        {detalles ? "Menos detalles" : "Más detalles"}
      </button>
      {detalles && (
        <TarjetaBorrador b={b} datos={datos} onChange={setB} ocultarMonto ocultarCategoria={!atajo} />
      )}

      {guardado && (
        <AvisoDeshacer
          guardado={guardado}
          onCerrar={() => setGuardado(null)}
          onDeshecho={() => { setGuardado(null); vibrar(); }}
        />
      )}
    </>
  );
}

// ─── Página ─────────────────────────────────────────────────────

function Cargar() {
  const sp = useSearchParams();
  const modo = sp.get("modo");
  const [datos, setDatos] = useState<DatosCarga | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/finanzas/carga", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDatos)
      .catch(() => setError(true));
  }, []);

  const titulo = modo === "voz" ? "Dictar" : modo === "rapido" ? "Carga rápida" : "Cargar";
  const categoria = sp.get("categoria");
  const desc = sp.get("desc");

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{titulo}</h1>
        <Link href="/finanzas" className="fin-link">Cerrar</Link>
      </div>
      <div style={{ marginTop: 12 }}>
        {error && <div className="fin-vacio">No pudimos cargar tus categorías. Revisá la conexión y probá de nuevo.</div>}
        {!datos && !error && <div style={{ color: "var(--tx3)" }}>Cargando…</div>}
        {datos && modo === "voz" && <CargaVoz datos={datos} />}
        {datos && modo === "rapido" && (
          <ModoRapido
            key={`${categoria}-${desc}`}
            datos={datos}
            atajo={categoria && datos.categorias.some((c) => c.id === categoria) ? { categoriaId: categoria, descripcion: desc || "" } : null}
            descripcion={desc}
          />
        )}
        {datos && !modo && <OpcionesCarga atajos={datos.atajos} categorias={datos.categorias} />}
      </div>
    </>
  );
}

export default function PaginaCargar() {
  return (
    <Suspense fallback={<div style={{ color: "var(--tx3)" }}>Cargando…</div>}>
      <Cargar />
    </Suspense>
  );
}
