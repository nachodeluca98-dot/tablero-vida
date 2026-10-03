"use client";
// Presupuesto del mes (spec §6.7): ítems por categoría con previsto vs. real, edición en el lugar,
// agregar, quitar (con Deshacer) y reasignar entre categorías. Selector de mes arriba.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import GrillaCategorias from "@/components/finanzas/GrillaCategorias";
import Montos from "@/components/finanzas/Montos";
import { formatearTexto, montoDeTexto, textoDeMonto } from "@/components/finanzas/Teclado";
import type { DatosCarga } from "@/lib/finanzas/carga";
import { fmtArs, fmtPct, fmtUsd, type Moneda } from "@/lib/finanzas/dinero";
import { anioMesActual, nombreMes, sumarMeses } from "@/lib/finanzas/fechas";
import type { DatosPresupuesto, Frecuencia } from "@/lib/finanzas/presupuesto";

type Grupo = DatosPresupuesto["grupos"][number];
type Item = Grupo["items"][number];
type Aviso = { texto: string; deshacer?: () => Promise<void> };

const FREC: Record<Frecuencia, string> = { mensual: "Mensual", bimestral: "Bimestral", trimestral: "Trimestral", anual: "Anual" };
const SECCIONES: [string, string][] = [["ingreso", "Ingresos"], ["gasto", "Gastos"], ["ahorro", "Ahorro"]];

async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No se pudo guardar. Probá de nuevo.");
  return j;
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const textoAMonto = (t: string) => montoDeTexto(t.replace(/\./g, "").trim());

// ─── Monto editable en el lugar ─────────────────────────────────

function MontoEditable({ item, onGuardar, deshabilitado }: { item: Item; onGuardar: (monto: number) => void; deshabilitado: boolean }) {
  const [editando, setEditando] = useState(false);
  const simbolo = item.moneda === "USD" ? "US$" : "$";
  if (editando) {
    return (
      <input
        className="inline"
        autoFocus
        inputMode="decimal"
        defaultValue={textoDeMonto(item.monto)}
        aria-label={`Monto de ${item.concepto}`}
        style={{ width: 120, textAlign: "right", fontWeight: 600, background: "transparent", border: "none", borderBottom: "1px dashed var(--acc)", borderRadius: 0, padding: "6px 0" }}
        onBlur={(e) => {
          setEditando(false);
          const n = textoAMonto(e.target.value);
          if (n && n !== item.monto) onGuardar(n);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={deshabilitado}
      onClick={() => setEditando(true)}
      aria-label={`Editar monto de ${item.concepto}`}
      style={{ background: "transparent", border: "none", padding: "6px 0", minHeight: 44, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: item.monto < 0 ? "var(--tx3)" : "var(--tx)" }}
    >
      {item.monto < 0 ? "−" : ""}{simbolo} {formatearTexto(textoDeMonto(Math.abs(item.monto)))}
    </button>
  );
}

// ─── Ítem ───────────────────────────────────────────────────────

function FilaItem({ item, editable, onCambiar, onQuitar }: {
  item: Item; editable: boolean; onCambiar: (c: Record<string, unknown>) => void; onQuitar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const esCuota = item.origen === "cuotas";
  const esAjuste = item.origen === "reasignacion";
  const fijo = editable && !esCuota;
  return (
    <div style={{ borderTop: "1px solid var(--bd)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 12px" }}>
        <button
          type="button"
          onClick={() => !esCuota && !esAjuste && setAbierto(!abierto)}
          aria-expanded={abierto}
          style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", padding: "8px 0", minHeight: 44 }}
        >
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: esAjuste ? "var(--tx3)" : "var(--tx)" }}>
            {item.pagado && item.fijoVariable === "fijo" && <span title="Pagado" aria-label="Pagado">✓ </span>}
            {item.concepto}
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)" }}>
            {esCuota ? `Cuota · ${item.tarjeta ? `💳 ${item.tarjeta}` : "tarjeta"}` : esAjuste ? "Reasignación" : item.fijoVariable === "fijo" ? "Fijo" : "Variable"}
            {item.frecuencia !== "mensual" && ` · ${FREC[item.frecuencia]} (${fmtArs(item.mensual.ars)}/mes)`}
            {item.diaVencimiento && ` · vence el ${item.diaVencimiento}`}
            {!item.recurrente && !esCuota && !esAjuste && " · solo este mes"}
            {(item.real.ars ?? 0) > 0 && ` · real ${fmtArs(item.real.ars)}`}
          </div>
        </button>
        {esAjuste || esCuota ? (
          <span style={{ fontWeight: 600, color: "var(--tx3)", fontVariantNumeric: "tabular-nums" }}>
            {item.monto < 0 ? "−" : ""}{item.moneda === "USD" ? fmtUsd(Math.abs(item.monto)) : fmtArs(Math.abs(item.monto))}
          </span>
        ) : (
          <MontoEditable item={item} deshabilitado={!fijo} onGuardar={(monto) => onCambiar({ monto })} />
        )}
        {editable && !esCuota && (
          <button type="button" className="fin-icono-btn" onClick={onQuitar} aria-label={`Quitar ${item.concepto} de este mes`}>✕</button>
        )}
      </div>
      {abierto && fijo && (
        <div className="fin-selector" style={{ margin: "0 12px 10px", display: "grid", gap: 10 }}>
          <div className="fin-chips" aria-label="Frecuencia">
            {(Object.keys(FREC) as Frecuencia[]).map((f) => (
              <button key={f} type="button" className={`fin-chip ${item.frecuencia === f ? "activo" : ""}`} onClick={() => onCambiar({ frecuencia: f })}>{FREC[f]}</button>
            ))}
          </div>
          {item.frecuencia !== "mensual" && (
            <div style={{ fontSize: 12, color: "var(--tx3)" }}>
              Pagás {item.moneda === "USD" ? fmtUsd(item.monto) : fmtArs(item.monto)} cada {item.frecuencia === "anual" ? "año" : item.frecuencia === "bimestral" ? "2 meses" : "3 meses"}: se prevén {fmtArs(item.mensual.ars)} por mes para que no te sorprenda.
            </div>
          )}
          <div className="fin-chips">
            {(["fijo", "variable"] as const).map((v) => (
              <button key={v} type="button" className={`fin-chip ${item.fijoVariable === v ? "activo" : ""}`} onClick={() => onCambiar({ fijoVariable: v })}>{v === "fijo" ? "Fijo" : "Variable"}</button>
            ))}
            {(["esencial", "discrecional"] as const).map((v) => (
              <button key={v} type="button" className={`fin-chip ${item.naturaleza === v ? "activo" : ""}`} onClick={() => onCambiar({ naturaleza: v })}>{v === "esencial" ? "Esencial" : "Discrecional"}</button>
            ))}
            {(["ARS", "USD"] as const).map((m) => (
              <button key={m} type="button" className={`fin-chip ${item.moneda === m ? "activo" : ""}`} onClick={() => onCambiar({ moneda: m })}>{m}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              Vence el día
              <input
                className="fin-input"
                style={{ width: 70 }}
                inputMode="numeric"
                defaultValue={item.diaVencimiento ?? ""}
                placeholder="—"
                onBlur={(e) => {
                  const d = e.target.value ? Number(e.target.value) : null;
                  if (d !== item.diaVencimiento) onCambiar({ diaVencimiento: d });
                }}
              />
            </label>
            <button type="button" className={`fin-chip ${item.recurrente ? "activo" : ""}`} aria-pressed={item.recurrente} onClick={() => onCambiar({ recurrente: !item.recurrente })}>
              {item.recurrente ? "✓ Se repite el mes que viene" : "Solo este mes"}
            </button>
          </div>
          <input
            className="fin-input"
            defaultValue={item.concepto}
            aria-label="Nombre"
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== item.concepto && onCambiar({ concepto: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// ─── Categoría ──────────────────────────────────────────────────

function TarjetaCategoria({ g, anioMes, editable, mesTranscurrido, onCambiarItem, onQuitarItem, onCubrir }: {
  g: Grupo; anioMes: string; editable: boolean; mesTranscurrido: number;
  onCambiarItem: (id: string, c: Record<string, unknown>) => void;
  onQuitarItem: (it: Item) => void;
  onCubrir: (() => void) | null;
}) {
  const prev = g.previsto.ars ?? 0;
  const real = g.real.ars ?? 0;
  const pct = prev > 0 ? real / prev : null;
  const restante = prev - real;
  const esGasto = g.tipo === "gasto";
  return (
    <div className="fin-lista" style={{ marginBottom: 8 }}>
      <div style={{ padding: "12px 12px 8px" }}>
        {/* Tocar la categoría lleva a sus movimientos del mes (spec §5.2) */}
        <Link href={`/finanzas/movimientos?mes=${anioMes}&categoria=${g.id}`} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none", minHeight: 32 }}>
          <span aria-hidden style={{ fontSize: 18 }}>{g.icono}</span>
          <strong style={{ flex: 1 }}>{g.nombre}</strong>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {fmtArs(real)} <span style={{ color: "var(--tx3)" }}>/ {fmtArs(prev)}</span>
          </span>
        </Link>
        {pct != null && (
          <div className="fin-barra" style={{ marginTop: 8 }} role="img" aria-label={`${fmtPct(pct)} usado`}>
            <div className="fin-barra-relleno" style={{ width: `${Math.min(100, pct * 100)}%`, background: pct > 1 ? "var(--amb)" : g.tipo === "ahorro" || g.tipo === "ingreso" ? "var(--sal)" : "var(--acc)" }} />
            {esGasto && <div className="fin-barra-marca" style={{ left: `calc(${Math.min(100, mesTranscurrido * 100)}% - 1px)` }} />}
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {prev === 0 ? (
            <span>Sin presupuesto este mes</span>
          ) : esGasto ? (
            restante >= 0 ? <span>Te quedan {fmtArs(restante)} · {fmtUsd(g.previsto.usd != null && g.real.usd != null ? g.previsto.usd - g.real.usd : null)}</span>
            : <span style={{ color: "var(--amb-t)" }}>Te pasaste {fmtArs(-restante)}</span>
          ) : (
            <span>{fmtPct(pct)} de lo previsto</span>
          )}
          {onCubrir && <button type="button" className="fin-chip activo" onClick={onCubrir}>Cubrirlo</button>}
        </div>
      </div>
      {g.items.map((it) => (
        <FilaItem key={it.id} item={it} editable={editable} onCambiar={(c) => onCambiarItem(it.id, c)} onQuitar={() => onQuitarItem(it)} />
      ))}
    </div>
  );
}

// ─── Reasignar (hoja inferior) ──────────────────────────────────

function HojaReasignar({ d, inicial, onCerrar, onHecho }: {
  d: DatosPresupuesto;
  inicial: { origen?: string | null; destino?: string | null; monto?: number | null };
  onCerrar: () => void;
  onHecho: (aviso: Aviso) => void;
}) {
  const gastos = d.grupos.filter((g) => g.tipo === "gasto");
  const margen = (id: string | null | undefined) => {
    const g = gastos.find((x) => x.id === id);
    return g ? Math.max(0, (g.previsto.ars ?? 0) - (g.real.ars ?? 0)) : 0;
  };
  // Lo que le falta al destino, sin pasar lo que sobra en el origen
  const exceso = (id: string | null | undefined) => {
    const g = gastos.find((x) => x.id === id);
    return g ? Math.max(0, (g.real.ars ?? 0) - (g.previsto.ars ?? 0)) : 0;
  };
  const sugerido = (dest: string | null | undefined, orig: string | null | undefined) => {
    const libre = margen(orig);
    const falta = exceso(dest);
    return Math.round(falta > 0 ? (libre > 0 ? Math.min(falta, libre) : falta) : Math.min(libre, 10000));
  };
  const [destino, setDestino] = useState<string | null>(inicial.destino ?? null);
  const [origen, setOrigen] = useState<string | null>(inicial.origen ?? null);
  const max = Math.max(1000, Math.ceil(Math.max(margen(origen), (gastos.find((g) => g.id === origen)?.previsto.ars ?? 0)) / 1000) * 1000);
  const [monto, setMonto] = useState<number>(Math.round(inicial.monto ?? sugerido(inicial.destino, inicial.origen)));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const nombre = (id: string | null) => gastos.find((g) => g.id === id)?.nombre ?? "";

  async function confirmar() {
    if (!origen || !destino || !(monto > 0)) return;
    setGuardando(true);
    try {
      const r = await api("/api/finanzas/presupuesto/reasignar", "POST", { anioMes: d.anioMes, origen, destino, monto });
      onHecho({ texto: `Moviste ${fmtArs(monto)} de ${nombre(origen)} a ${nombre(destino)}`, deshacer: () => api("/api/finanzas/presupuesto/reasignar", "DELETE", { ids: r.ids }) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo");
      setGuardando(false);
    }
  }

  const Chips = ({ valor, set, excluir }: { valor: string | null; set: (v: string) => void; excluir: string | null }) => (
    <div className="fin-chips">
      {gastos.filter((g) => g.id !== excluir).map((g) => (
        <button key={g.id} type="button" className={`fin-chip ${valor === g.id ? "activo" : ""}`} onClick={() => set(g.id)}>
          {g.icono} {g.nombre}
          <span style={{ fontSize: 11, color: "var(--tx3)" }}>{margen(g.id) > 0 ? ` · libre ${fmtArs(margen(g.id))}` : ""}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="fin-hoja-fondo" onClick={onCerrar} />
      <div className="fin-hoja" role="dialog" aria-modal="true" aria-label="Reasignar" style={{ maxHeight: "88vh", overflowY: "auto" }}>
        <div className="fin-hoja-asa" />
        <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Mover plata entre categorías</h2>
        <p style={{ color: "var(--tx3)", marginTop: 0, fontSize: 13 }}>El presupuesto es flexible: si una se pasa, la cubrís con lo que sobra de otra.</p>
        <div style={{ fontSize: 12, color: "var(--tx3)", margin: "10px 0 6px" }}>¿A cuál le falta?</div>
        <Chips valor={destino} set={(v) => { setDestino(v); if (origen) setMonto(sugerido(v, origen)); }} excluir={origen} />
        <div style={{ fontSize: 12, color: "var(--tx3)", margin: "14px 0 6px" }}>¿De dónde sale?</div>
        <Chips valor={origen} set={(v) => { setOrigen(v); setMonto(sugerido(destino, v)); }} excluir={destino} />
        {origen && destino && (
          <>
            <div className="fin-monto-display" style={{ fontSize: 30, minHeight: 0, marginTop: 14 }}>{fmtArs(monto)}</div>
            <input
              type="range"
              min={0}
              max={max}
              step={max > 100000 ? 5000 : 1000}
              value={Math.min(monto, max)}
              onChange={(e) => setMonto(Number(e.target.value))}
              aria-label="Monto a mover"
              style={{ width: "100%", accentColor: "var(--acc)", minHeight: 44 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--tx3)" }}>
              <span>$ 0</span>
              <span>{margen(origen) > 0 ? `Libre en ${nombre(origen)}: ${fmtArs(margen(origen))}` : ""}</span>
              <span>{fmtArs(max)}</span>
            </div>
          </>
        )}
        {error && <div className="fin-aviso-dup" role="alert" style={{ marginTop: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" className="fin-btn secundario" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="fin-btn primario" style={{ flex: 1 }} disabled={!origen || !destino || !(monto > 0) || guardando} onClick={confirmar}>
            {guardando ? "Moviendo…" : "Mover"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Agregar ítem (hoja inferior) ───────────────────────────────

function HojaAgregar({ d, datos, onCerrar, onHecho }: { d: DatosPresupuesto; datos: DatosCarga; onCerrar: () => void; onHecho: (a: Aviso) => void }) {
  const [tipo, setTipo] = useState<"gasto" | "ingreso" | "ahorro">("gasto");
  const [concepto, setConcepto] = useState("");
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [frecuencia, setFrecuencia] = useState<Frecuencia>("mensual");
  const [fijoVariable, setFijoVariable] = useState<"fijo" | "variable">("fijo");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const n = textoAMonto(monto);
  const anual = /seguro|patente|vtv|anual|abl|inmobiliario/i.test(concepto);

  async function guardar() {
    setGuardando(true);
    try {
      const it = await api("/api/finanzas/presupuesto/items", "POST", { anioMes: d.anioMes, concepto, categoriaId, monto: n, moneda, frecuencia, fijoVariable });
      onHecho({ texto: `${concepto} agregado`, deshacer: () => api(`/api/finanzas/presupuesto/items/${it.id}`, "PATCH", { activo: false }) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo");
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="fin-hoja-fondo" onClick={onCerrar} />
      <div className="fin-hoja" role="dialog" aria-modal="true" aria-label="Agregar ítem" style={{ maxHeight: "88vh", overflowY: "auto" }}>
        <div className="fin-hoja-asa" />
        <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>Agregar al presupuesto de {nombreMes(d.anioMes)}</h2>
        <div className="fin-chips" style={{ marginBottom: 10 }}>
          {([["gasto", "Gasto"], ["ingreso", "Ingreso"], ["ahorro", "Ahorro"]] as const).map(([t, l]) => (
            <button key={t} type="button" className={`fin-chip ${tipo === t ? "activo" : ""}`} onClick={() => { setTipo(t); setCategoriaId(t === "ahorro" ? "fincat_ahorro" : null); }}>{l}</button>
          ))}
        </div>
        <input className="fin-input" style={{ width: "100%" }} value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Nombre: Luz, Seguro del auto, Gimnasio…" aria-label="Nombre" autoFocus />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input className="fin-input" style={{ flex: 1 }} inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Monto" aria-label="Monto" />
          {(["ARS", "USD"] as const).map((m) => (
            <button key={m} type="button" className={`fin-chip ${moneda === m ? "activo" : ""}`} onClick={() => setMoneda(m)}>{m}</button>
          ))}
        </div>
        <div className="fin-chips" style={{ marginTop: 10 }}>
          {(Object.keys(FREC) as Frecuencia[]).map((f) => (
            <button key={f} type="button" className={`fin-chip ${frecuencia === f ? "activo" : ""}`} onClick={() => setFrecuencia(f)}>{FREC[f]}</button>
          ))}
          {tipo === "gasto" && (["fijo", "variable"] as const).map((v) => (
            <button key={v} type="button" className={`fin-chip ${fijoVariable === v ? "activo" : ""}`} onClick={() => setFijoVariable(v)}>{v === "fijo" ? "Fijo" : "Variable"}</button>
          ))}
        </div>
        {/* Gastos anuales: se explica el prorrateo cuando aparece uno (guía "Gastos anuales", spec §7.2) */}
        {(frecuencia !== "mensual" || anual) && (
          <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 8 }}>
            {frecuencia === "mensual"
              ? "¿Lo pagás una vez por año? Elegí Anual y se prevé un poquito cada mes, así no te sorprende."
              : n ? `Se prevén ${fmtArs(n / { mensual: 1, bimestral: 2, trimestral: 3, anual: 12 }[frecuencia])} por mes.` : "Se reparte en cuotas mensuales para que no te sorprenda."}
          </div>
        )}
        {tipo !== "ahorro" && (
          <div style={{ marginTop: 12 }}>
            <GrillaCategorias categorias={datos.categorias} tipo={tipo} sugerida={categoriaId} onElegir={setCategoriaId} />
          </div>
        )}
        {error && <div className="fin-aviso-dup" role="alert" style={{ marginTop: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" className="fin-btn secundario" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="fin-btn primario" style={{ flex: 1 }} disabled={!concepto.trim() || !n || !categoriaId || guardando} onClick={guardar}>
            {guardando ? "Guardando…" : "Agregar"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Página ─────────────────────────────────────────────────────

function Presupuesto() {
  const router = useRouter();
  const sp = useSearchParams();
  const anioMes = sp.get("mes") && /^\d{4}-\d{2}$/.test(sp.get("mes")!) ? sp.get("mes")! : anioMesActual();
  const [d, setD] = useState<DatosPresupuesto | null>(null);
  const [datos, setDatos] = useState<DatosCarga | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [hoja, setHoja] = useState<null | "agregar" | { origen?: string | null; destino?: string | null; monto?: number | null }>(
    sp.get("reasignar") ? { destino: sp.get("categoria") } : null
  );
  const [verQuitados, setVerQuitados] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/finanzas/presupuesto?mes=${anioMes}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      setD(await r.json());
      setError(null);
    } catch {
      setError("No pudimos cargar el presupuesto. Revisá la conexión.");
    }
  }, [anioMes]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    fetch("/api/finanzas/carga", { cache: "no-store" }).then((r) => r.json()).then(setDatos).catch(() => {});
  }, []);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  const irA = (am: string) => router.replace(`/finanzas/presupuesto?mes=${am}`, { scroll: false });

  async function accion(fn: () => Promise<unknown>, nuevoAviso?: Aviso) {
    try {
      await fn();
      if (nuevoAviso) setAviso(nuevoAviso);
      try { navigator.vibrate?.(10); } catch {}
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : "No se pudo" });
    }
    cargar();
  }

  const cambiarItem = (id: string, c: Record<string, unknown>) => accion(() => api(`/api/finanzas/presupuesto/items/${id}`, "PATCH", c));
  const quitarItem = (it: Item) =>
    it.origen === "reasignacion"
      ? accion(() => api("/api/finanzas/presupuesto/reasignar", "DELETE", { ids: [it.id] }), { texto: "Reasignación quitada" })
      : accion(() => api(`/api/finanzas/presupuesto/items/${it.id}`, "PATCH", { activo: false }), {
          texto: `${it.concepto} quitado de este mes`,
          deshacer: () => api(`/api/finanzas/presupuesto/items/${it.id}`, "PATCH", { activo: true }),
        });

  const sugerenciaPara = useMemo(() => new Map((d?.sugerencias ?? []).map((s) => [s.destino, s])), [d]);

  if (!d) return <div style={{ color: "var(--tx3)" }}>{error ?? "Cargando…"}</div>;
  const editable = d.estado === "abierto";
  const vacio = d.grupos.length === 0;
  const r = d.resumen;
  const usado = r.gastos.previsto.ars ? (r.gastos.real.ars ?? 0) / r.gastos.previsto.ars : null;
  const nombreG = (id: string) => d.grupos.find((g) => g.id === id)?.nombre ?? "";

  return (
    <>
      {/* Selector de mes */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <button type="button" className="fin-icono-btn" aria-label="Mes anterior" onClick={() => irA(sumarMeses(anioMes, -1))}>‹</button>
        <h1 style={{ margin: 0, flex: 1, textAlign: "center", textTransform: "capitalize" }}>{nombreMes(anioMes)} {anioMes.slice(0, 4)}</h1>
        <button type="button" className="fin-icono-btn" aria-label="Mes siguiente" onClick={() => irA(sumarMeses(anioMes, 1))}>›</button>
      </div>

      {!editable && (
        <div className="fin-aviso-dup" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ flex: 1 }}>Este mes está cerrado. Para cambiar algo, reabrilo.</span>
          <button type="button" className="fin-btn secundario" onClick={() => accion(() => api(`/api/finanzas/meses/${anioMes}`, "PATCH", { reabrir: true }), { texto: "Mes reabierto" })}>Reabrir</button>
        </div>
      )}

      {vacio ? (
        <div className="fin-vacio">
          <strong>{mayuscula(nombreMes(anioMes))} todavía no tiene presupuesto</strong>
          {d.anteriorConItems
            ? `Podés traer el de ${nombreMes(sumarMeses(anioMes, -1))} y ajustarlo, o empezar de cero.`
            : "Agregá lo que esperás cobrar, tus gastos fijos y un estimado de los variables."}
          {editable && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {d.anteriorConItems && (
                <button type="button" className="fin-btn primario" onClick={() => accion(() => api("/api/finanzas/presupuesto/clonar", "POST", { anioMes }), { texto: `Presupuesto de ${nombreMes(sumarMeses(anioMes, -1))} copiado` })}>
                  Traer el de {nombreMes(sumarMeses(anioMes, -1))}
                </button>
              )}
              <button type="button" className="fin-btn secundario" onClick={() => setHoja("agregar")}>➕ Agregar ítem</button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="fin-kpis">
            <div className="fin-kpi"><div className="fin-kpi-label">Ingresos previstos</div><Montos ars={r.ingresos.previsto.ars} usd={r.ingresos.previsto.usd} /></div>
            <div className="fin-kpi"><div className="fin-kpi-label">Saldo libre previsto</div><Montos ars={d.saldoLibrePrevisto.ars} usd={d.saldoLibrePrevisto.usd} /></div>
          </div>
          {usado != null && (
            <div className="fin-kpi" style={{ marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                <span>Gastos: <strong>{fmtArs(r.gastos.real.ars)}</strong> de {fmtArs(r.gastos.previsto.ars)}</span>
                <span style={{ color: "var(--tx3)" }}>{fmtPct(usado)}</span>
              </div>
              <div className="fin-barra">
                <div className="fin-barra-relleno" style={{ width: `${Math.min(100, usado * 100)}%` }} />
                <div className="fin-barra-marca" style={{ left: `calc(${Math.min(100, d.mesTranscurrido * 100)}% - 1px)` }} />
              </div>
              {(d.sinCategoria.ars ?? 0) > 0 && (
                <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 6 }}>
                  Incluye {fmtArs(d.sinCategoria.ars)} sin clasificar · <Link href="/finanzas/clasificar" className="fin-link" style={{ minHeight: 0, display: "inline" }}>Clasificar</Link>
                </div>
              )}
            </div>
          )}

          {/* Sugerencias de reasignación, con un toque */}
          {editable && d.sugerencias.map((s) => (
            <div key={s.destino} className="fin-aviso-dup" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1 }}>{nombreG(s.destino)} se pasó. Podés cubrir {fmtArs(s.monto)} desde {nombreG(s.origen)}.</span>
              <button
                type="button"
                className="fin-btn secundario"
                onClick={() => accion(async () => {
                  const res = await api("/api/finanzas/presupuesto/reasignar", "POST", { anioMes, origen: s.origen, destino: s.destino, monto: s.monto });
                  setAviso({ texto: `Cubriste ${nombreG(s.destino)} desde ${nombreG(s.origen)}`, deshacer: () => api("/api/finanzas/presupuesto/reasignar", "DELETE", { ids: res.ids }) });
                })}
              >
                Cubrir
              </button>
            </div>
          ))}

          {editable && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="button" className="fin-btn secundario" style={{ flex: 1 }} onClick={() => setHoja({})}>↔ Reasignar</button>
              <button type="button" className="fin-btn secundario" style={{ flex: 1 }} onClick={() => setHoja("agregar")}>➕ Agregar ítem</button>
            </div>
          )}

          {SECCIONES.map(([tipo, titulo]) => {
            const gs = d.grupos.filter((g) => g.tipo === tipo);
            if (!gs.length) return null;
            return (
              <section key={tipo} className="fin-seccion">
                <div className="fin-seccion-head"><h2>{titulo}</h2></div>
                {gs.map((g) => {
                  const s = sugerenciaPara.get(g.id);
                  return (
                    <TarjetaCategoria
                      key={g.id}
                      g={g}
                      anioMes={anioMes}
                      editable={editable}
                      mesTranscurrido={d.mesTranscurrido}
                      onCambiarItem={cambiarItem}
                      onQuitarItem={quitarItem}
                      onCubrir={editable && s ? () => setHoja({ origen: s.origen, destino: s.destino, monto: s.monto }) : null}
                    />
                  );
                })}
              </section>
            );
          })}

          {d.quitados.length > 0 && (
            <section className="fin-seccion">
              <button type="button" className="fin-link" onClick={() => setVerQuitados(!verQuitados)} aria-expanded={verQuitados}>
                {verQuitados ? "Ocultar" : "Ver"} quitados este mes ({d.quitados.length})
              </button>
              {verQuitados && (
                <div className="fin-lista">
                  {d.quitados.map((it) => (
                    <div key={it.id} className="fin-fila">
                      <span style={{ flex: 1, color: "var(--tx3)" }}>{it.concepto}</span>
                      <span style={{ color: "var(--tx3)" }}>{it.moneda === "USD" ? fmtUsd(it.monto) : fmtArs(it.monto)}</span>
                      {editable && <button type="button" className="fin-chip" onClick={() => cambiarItem(it.id, { activo: true })}>Volver a agregar</button>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {hoja === "agregar" && datos && (
        <HojaAgregar d={d} datos={datos} onCerrar={() => setHoja(null)} onHecho={(a) => { setHoja(null); setAviso(a); cargar(); }} />
      )}
      {hoja && hoja !== "agregar" && (
        <HojaReasignar d={d} inicial={hoja} onCerrar={() => setHoja(null)} onHecho={(a) => { setHoja(null); setAviso(a); cargar(); }} />
      )}

      {aviso && (
        <div className="fin-toast" role="status">
          {aviso.texto}
          {aviso.deshacer && (
            <button type="button" className="accion" onClick={async () => { const f = aviso.deshacer!; setAviso(null); await f().catch(() => {}); cargar(); }}>
              Deshacer
            </button>
          )}
        </div>
      )}
    </>
  );
}

export default function PaginaPresupuesto() {
  return (
    <Suspense fallback={<div style={{ color: "var(--tx3)" }}>Cargando…</div>}>
      <Presupuesto />
    </Suspense>
  );
}
