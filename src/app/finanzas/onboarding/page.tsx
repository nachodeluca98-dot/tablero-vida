"use client";
// Onboarding (spec §6.1): asistente a pantalla completa, de a un paso, con barra de progreso,
// "Saltear" en los pasos no esenciales y retomable (cada paso se guarda al confirmarlo).
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Montos from "@/components/finanzas/Montos";
import Teclado, { formatearTexto, montoDeTexto, textoDeMonto } from "@/components/finanzas/Teclado";
import { fmtArs, fmtUsd, type Moneda } from "@/lib/finanzas/dinero";
import { nombreMes } from "@/lib/finanzas/fechas";
import type { EstadoOnboarding, ItemOnboarding } from "@/lib/finanzas/onboarding";
import { FIJOS, PASOS_ONBOARDING, VARIABLES, type ItemPlantilla, type PasoOnboarding } from "@/lib/finanzas/plantillas";

type Fila = { concepto: string; categoriaId: string; icono: string; valor: string; moneda: Moneda; naturaleza?: "esencial" | "discrecional" };

const TOTAL = PASOS_ONBOARDING.length - 1;

function vibrar() {
  try { navigator.vibrate?.(15); } catch {}
}

// ─── Piezas comunes ─────────────────────────────────────────────

function Pie({ onSiguiente, onSaltear, textoSiguiente = "Siguiente", deshabilitado, guardando }: {
  onSiguiente: () => void; onSaltear?: () => void; textoSiguiente?: string; deshabilitado?: boolean; guardando: boolean;
}) {
  return (
    <div className="fin-barra-accion" style={{ bottom: 0, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
      {onSaltear && <button type="button" className="fin-btn secundario" style={{ flex: "0 0 auto" }} onClick={onSaltear} disabled={guardando}>Saltear</button>}
      <button type="button" className="fin-btn primario" onClick={onSiguiente} disabled={deshabilitado || guardando}>
        {guardando ? "Guardando…" : textoSiguiente}
      </button>
    </div>
  );
}

function Titulo({ titulo, texto }: { titulo: string; texto?: React.ReactNode }) {
  return (
    <>
      <h1 style={{ fontSize: 24, margin: "8px 0 6px" }}>{titulo}</h1>
      {texto && <p style={{ color: "var(--tx2)", lineHeight: 1.45, marginTop: 0 }}>{texto}</p>}
    </>
  );
}

function MontoGrande({ valor, moneda, activo, onClick, etiqueta }: { valor: string; moneda: Moneda; activo?: boolean; onClick?: () => void; etiqueta?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      style={{ width: "100%", background: "transparent", border: "none", borderBottom: `2px solid ${activo ? "var(--acc)" : "var(--bd)"}`, borderRadius: 0, padding: "4px 0 8px" }}
    >
      {etiqueta && <div style={{ fontSize: 12, color: "var(--tx3)", textAlign: "left" }}>{etiqueta}</div>}
      <div className="fin-monto-display" style={{ fontSize: 34, minHeight: 0, padding: 0 }}>
        {valor ? `${moneda === "USD" ? "US$ " : "$ "}${formatearTexto(valor)}` : <span className="vacio">{moneda === "USD" ? "US$ 0" : "$ 0"}</span>}
      </div>
    </button>
  );
}

// Lista de montos con teclado propio que salta al siguiente al confirmar (spec §6.1 paso 4)
function ListaMontos({ filas, setFilas }: { filas: Fila[]; setFilas: (f: Fila[]) => void }) {
  const [activa, setActiva] = useState(() => Math.max(0, filas.findIndex((f) => !f.valor)));
  const f = filas[activa];
  const cambiar = (cambios: Partial<Fila>) => setFilas(filas.map((x, i) => (i === activa ? { ...x, ...cambios } : x)));

  return (
    <>
      <div className="fin-lista">
        {filas.map((x, i) => (
          <button
            key={x.concepto + i}
            type="button"
            className="fin-fila"
            onClick={() => setActiva(i)}
            aria-current={i === activa}
            style={{ width: "100%", background: i === activa ? "var(--amb-b)" : "transparent", border: "none", borderRadius: 0, textAlign: "left" }}
          >
            <span className="fin-icono" aria-hidden>{x.icono}</span>
            <span style={{ flex: 1 }}>{x.concepto}</span>
            <span style={{ fontWeight: 600, color: x.valor ? "var(--tx)" : "var(--tx3)" }}>
              {x.valor ? `${x.moneda === "USD" ? "US$" : "$"} ${formatearTexto(x.valor)}` : "—"}
            </span>
          </button>
        ))}
      </div>
      {f && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ flex: 1 }}>{f.icono} {f.concepto}</strong>
            {(["ARS", "USD"] as const).map((m) => (
              <button key={m} type="button" className={`fin-chip ${f.moneda === m ? "activo" : ""}`} onClick={() => cambiar({ moneda: m })}>{m}</button>
            ))}
          </div>
          <MontoGrande valor={f.valor} moneda={f.moneda} activo />
          <Teclado valor={f.valor} onChange={(v) => cambiar({ valor: v })} />
          {activa < filas.length - 1 && (
            <button type="button" className="fin-btn secundario" style={{ width: "100%", marginTop: 8 }} onClick={() => { vibrar(); setActiva(activa + 1); }}>
              Siguiente: {filas[activa + 1].concepto} ›
            </button>
          )}
        </div>
      )}
    </>
  );
}

const aFila = (p: ItemPlantilla, guardado?: ItemOnboarding): Fila => ({
  concepto: p.concepto, categoriaId: p.categoriaId, icono: p.icono, naturaleza: p.naturaleza,
  valor: guardado ? textoDeMonto(guardado.monto) : "", moneda: guardado?.moneda ?? "ARS",
});

const aItems = (filas: Fila[]): ItemOnboarding[] =>
  filas.flatMap((f) => {
    const monto = montoDeTexto(f.valor);
    return monto ? [{ concepto: f.concepto, categoriaId: f.categoriaId, monto, moneda: f.moneda, naturaleza: f.naturaleza }] : [];
  });

// ─── Pasos ──────────────────────────────────────────────────────

function PasoIngreso({ e, guardar, guardando }: PasoProps) {
  const [moneda, setMoneda] = useState<Moneda | "ambas">(e.ingreso.moneda ?? "ARS");
  const [ars, setArs] = useState(textoDeMonto(e.ingreso.ars));
  const [usd, setUsd] = useState(textoDeMonto(e.ingreso.usd));
  const [activo, setActivo] = useState<Moneda>(moneda === "USD" ? "USD" : "ARS");
  const elegir = (m: Moneda | "ambas") => { setMoneda(m); setActivo(m === "USD" ? "USD" : "ARS"); };
  return (
    <>
      <Titulo titulo="¿En qué moneda cobrás?" texto="Y más o menos cuánto entra por mes. Si varía, poné un promedio." />
      <div className="fin-chips" style={{ marginBottom: 12 }}>
        {([["ARS", "Pesos"], ["USD", "Dólares"], ["ambas", "Ambas"]] as const).map(([m, l]) => (
          <button key={m} type="button" className={`fin-chip ${moneda === m ? "activo" : ""}`} onClick={() => elegir(m)}>{l}</button>
        ))}
      </div>
      {moneda !== "USD" && <MontoGrande valor={ars} moneda="ARS" activo={activo === "ARS"} onClick={() => setActivo("ARS")} etiqueta={moneda === "ambas" ? "En pesos" : undefined} />}
      {moneda !== "ARS" && <MontoGrande valor={usd} moneda="USD" activo={activo === "USD"} onClick={() => setActivo("USD")} etiqueta={moneda === "ambas" ? "En dólares" : undefined} />}
      <Teclado valor={activo === "USD" ? usd : ars} onChange={activo === "USD" ? setUsd : setArs} />
      <Pie
        guardando={guardando}
        onSaltear={() => guardar(null, true)}
        onSiguiente={() => guardar({ moneda, ars: montoDeTexto(ars), usd: montoDeTexto(usd) })}
        deshabilitado={!(montoDeTexto(ars) || montoDeTexto(usd))}
      />
    </>
  );
}

const FUENTES = ["MEP", "Oficial", "Blue", "El de mi cobro"];

function PasoTipoCambio({ e, guardar, guardando }: PasoProps) {
  const [tc, setTc] = useState(textoDeMonto(e.tipoCambio ?? e.tcSugerido));
  const [fuente, setFuente] = useState(e.fuenteTc ?? "MEP");
  return (
    <>
      <Titulo
        titulo="Tipo de cambio"
        texto={<>Usá el que te sirva de referencia: MEP, oficial o el de tu cobro. Lo podés cambiar cuando quieras. Sirve para ver todo en pesos y en dólares.</>}
      />
      <div className="fin-chips" style={{ marginBottom: 8 }}>
        {FUENTES.map((f) => <button key={f} type="button" className={`fin-chip ${fuente === f ? "activo" : ""}`} onClick={() => setFuente(f)}>{f}</button>)}
      </div>
      <MontoGrande valor={tc} moneda="ARS" activo etiqueta={`Pesos por 1 dólar · ${nombreMes(e.anioMes)}`} />
      <Teclado valor={tc} onChange={setTc} />
      <Pie
        guardando={guardando}
        onSaltear={() => guardar(null, true)}
        onSiguiente={() => guardar({ tipoCambio: montoDeTexto(tc), fuenteTc: fuente })}
        deshabilitado={!montoDeTexto(tc)}
      />
    </>
  );
}

function PasoFijos({ e, guardar, guardando }: PasoProps) {
  const [fase, setFase] = useState<"elegir" | "montos">("elegir");
  const extras = e.fijos.filter((g) => !FIJOS.some((p) => p.concepto === g.concepto));
  const [plantilla, setPlantilla] = useState<ItemPlantilla[]>([...FIJOS, ...extras.map((x) => ({ concepto: x.concepto, categoriaId: x.categoriaId, icono: "📌" }))]);
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(e.fijos.map((f) => f.concepto)));
  const [filas, setFilas] = useState<Fila[]>([]);
  const [otro, setOtro] = useState("");

  function aMontos() {
    const lista = plantilla.filter((p) => elegidos.has(p.concepto));
    setFilas(lista.map((p) => filas.find((f) => f.concepto === p.concepto) ?? aFila(p, e.fijos.find((g) => g.concepto === p.concepto))));
    setFase("montos");
  }
  function agregarOtro() {
    const c = otro.trim();
    if (!c || plantilla.some((p) => p.concepto.toLowerCase() === c.toLowerCase())) return;
    setPlantilla([...plantilla, { concepto: c, categoriaId: "fincat_varios", icono: "📌" }]);
    setElegidos(new Set(elegidos).add(c));
    setOtro("");
  }

  if (fase === "elegir") {
    return (
      <>
        <Titulo titulo="Tus gastos fijos" texto="Tocá los que pagás todos los meses. Después ponés cuánto es cada uno." />
        <div className="fin-chips">
          {plantilla.map((p) => {
            const on = elegidos.has(p.concepto);
            return (
              <button key={p.concepto} type="button" className={`fin-chip ${on ? "activo" : ""}`} aria-pressed={on}
                onClick={() => { const s = new Set(elegidos); if (on) s.delete(p.concepto); else s.add(p.concepto); setElegidos(s); }}>
                {p.icono} {p.concepto}
              </button>
            );
          })}
        </div>
        <form style={{ display: "flex", gap: 8, marginTop: 14 }} onSubmit={(ev) => { ev.preventDefault(); agregarOtro(); }}>
          <input className="fin-input" type="text" value={otro} onChange={(ev) => setOtro(ev.target.value)} placeholder="Agregar otro (ej.: Cuota del crédito)" />
          <button type="submit" className="fin-btn secundario" disabled={!otro.trim()}>Agregar</button>
        </form>
        <Pie guardando={guardando} onSaltear={() => guardar(null, true)} onSiguiente={aMontos} deshabilitado={elegidos.size === 0}
          textoSiguiente={elegidos.size ? `Poner montos (${elegidos.size})` : "Elegí al menos uno"} />
      </>
    );
  }
  const total = aItems(filas).reduce((s, i) => s + (i.moneda === "ARS" ? i.monto : 0), 0);
  return (
    <>
      <Titulo titulo="¿Cuánto es cada uno?" texto={<>Un estimado alcanza. Total en pesos: <strong>{fmtArs(total)}</strong></>} />
      <button type="button" className="fin-link" onClick={() => setFase("elegir")}>‹ Cambiar la lista</button>
      <ListaMontos filas={filas} setFilas={setFilas} />
      <div style={{ height: 70 }} />
      <Pie guardando={guardando} onSiguiente={() => guardar({ items: aItems(filas) })} deshabilitado={!aItems(filas).length} />
    </>
  );
}

function PasoVariables({ e, guardar, guardando }: PasoProps) {
  const [filas, setFilas] = useState<Fila[]>(() => VARIABLES.map((p) => aFila(p, e.variables.find((v) => v.concepto === p.concepto))));
  return (
    <>
      <Titulo titulo="Gastos que varían" texto="Un estimado por mes de lo que más se mueve. Dejá en blanco lo que no aplique: se va ajustando con el uso." />
      <ListaMontos filas={filas} setFilas={setFilas} />
      <div style={{ height: 70 }} />
      <Pie guardando={guardando} onSaltear={() => guardar(null, true)} onSiguiente={() => guardar({ items: aItems(filas) })} deshabilitado={!aItems(filas).length} />
    </>
  );
}

function PasoAhorro({ e, guardar, guardando }: PasoProps) {
  const r = e.resumen;
  // Saldo libre estimado (en pesos si hay TC; si no, en la moneda que se pueda)
  const enUsd = !e.tipoCambio && (r.ingresos.usd ?? 0) > 0 && !(r.ingresos.ars ?? 0);
  const libre = enUsd
    ? (r.ingresos.usd ?? 0) - (r.fijos.usd ?? 0) - (r.variables.usd ?? 0)
    : (r.ingresos.ars ?? 0) - (r.fijos.ars ?? 0) - (r.variables.ars ?? 0);
  const ingreso = enUsd ? r.ingresos.usd ?? 0 : r.ingresos.ars ?? 0;
  const sugerido = libre > 0 ? Math.round(Math.min(libre, ingreso * 0.2) / 1000) * 1000 || Math.round(libre) : 0;
  const [moneda, setMoneda] = useState<Moneda>(e.ahorro?.moneda ?? (enUsd ? "USD" : "ARS"));
  const [valor, setValor] = useState(textoDeMonto(e.ahorro?.monto ?? (sugerido || null)));
  const [fondo, setFondo] = useState(!e.tieneFondo);
  const fmt = enUsd ? fmtUsd : fmtArs;
  return (
    <>
      <Titulo
        titulo="Ahorro primero"
        texto={ingreso > 0
          ? <>Con lo que cargaste te quedan libres unos <strong>{fmt(libre)}</strong> por mes. ¿Cuánto querés separar apenas cobrás?</>
          : <>¿Cuánto querés separar por mes apenas cobrás? Lo que se aparta al principio no se gasta.</>}
      />
      <div className="fin-chips" style={{ marginBottom: 6 }}>
        {(["ARS", "USD"] as const).map((m) => <button key={m} type="button" className={`fin-chip ${moneda === m ? "activo" : ""}`} onClick={() => setMoneda(m)}>{m}</button>)}
      </div>
      <MontoGrande valor={valor} moneda={moneda} activo />
      {sugerido > 0 && <div className="fin-monto-conv">Sugerencia: {fmt(sugerido)} (hasta el 20% de lo que entra)</div>}
      <Teclado valor={valor} onChange={setValor} />
      {!e.tieneFondo && (
        <button type="button" className={`fin-chip ${fondo ? "activo" : ""}`} aria-pressed={fondo} style={{ marginTop: 12, width: "100%", justifyContent: "flex-start", minHeight: 48 }} onClick={() => setFondo(!fondo)}>
          {fondo ? "✓" : "○"} 🛟 Crear mi fondo de emergencia (6 meses de gastos esenciales)
        </button>
      )}
      <div style={{ height: 70 }} />
      <Pie
        guardando={guardando}
        onSaltear={() => guardar(null, true)}
        onSiguiente={() => guardar({ monto: montoDeTexto(valor), moneda, crearFondo: fondo })}
        deshabilitado={!montoDeTexto(valor) && !fondo}
      />
    </>
  );
}

function PasoTarjetas({ e, guardar, guardando }: PasoProps) {
  const [tarjetas, setTarjetas] = useState<{ nombre: string; diaCierre: string }[]>(
    e.tarjetas.length ? e.tarjetas.map((t) => ({ nombre: t.nombre, diaCierre: String(t.diaCierre) })) : [{ nombre: "", diaCierre: "" }]
  );
  const validas = tarjetas.filter((t) => t.nombre.trim() && Number(t.diaCierre) >= 1 && Number(t.diaCierre) <= 31);
  const set = (i: number, c: Partial<{ nombre: string; diaCierre: string }>) => setTarjetas(tarjetas.map((t, j) => (j === i ? { ...t, ...c } : t)));
  return (
    <>
      <Titulo titulo="Tarjetas de crédito" texto="Con el día de cierre sabemos en qué mes pagás cada compra. Opcional: lo podés hacer después." />
      {tarjetas.map((t, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8, marginBottom: 8 }}>
          <label>
            <span style={{ fontSize: 12, color: "var(--tx3)" }}>Nombre</span>
            <input className="fin-input" type="text" value={t.nombre} onChange={(ev) => set(i, { nombre: ev.target.value })} placeholder="Visa, Master…" />
          </label>
          <label>
            <span style={{ fontSize: 12, color: "var(--tx3)" }}>Día de cierre</span>
            <input className="fin-input" type="text" inputMode="numeric" value={t.diaCierre} onChange={(ev) => set(i, { diaCierre: ev.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="25" />
          </label>
        </div>
      ))}
      <button type="button" className="fin-link" onClick={() => setTarjetas([...tarjetas, { nombre: "", diaCierre: "" }])}>+ Agregar otra tarjeta</button>
      <Pie
        guardando={guardando}
        onSaltear={() => guardar(null, true)}
        onSiguiente={() => guardar({ tarjetas: validas.map((t) => ({ nombre: t.nombre, diaCierre: Number(t.diaCierre) })) })}
        deshabilitado={!validas.length}
      />
    </>
  );
}

function PasoListo({ e, guardar, guardando }: PasoProps) {
  const r = e.resumen;
  const libre = {
    ars: (r.ingresos.ars ?? 0) - (r.fijos.ars ?? 0) - (r.variables.ars ?? 0) - (r.ahorro.ars ?? 0),
    usd: (r.ingresos.usd ?? 0) - (r.fijos.usd ?? 0) - (r.variables.usd ?? 0) - (r.ahorro.usd ?? 0),
  };
  const filas: [string, { ars: number | null; usd: number | null }][] = [
    ["Ingresos", r.ingresos], ["Gastos fijos", r.fijos], ["Variables estimados", r.variables], ["Ahorro", r.ahorro],
  ];
  return (
    <div className="fin-celebrar">
      <div style={{ fontSize: 56, textAlign: "center", marginTop: 8 }} aria-hidden>🎉</div>
      <Titulo titulo={`Tu presupuesto de ${nombreMes(e.anioMes)} está listo`} texto="Cada mes se arma solo a partir del anterior. Vos solo lo revisás." />
      <div className="fin-lista">
        {filas.map(([l, m]) => (
          <div key={l} className="fin-fila"><span style={{ flex: 1 }}>{l}</span><Montos ars={m.ars} usd={m.usd} /></div>
        ))}
        <div className="fin-fila" style={{ background: "var(--bg3)" }}>
          <strong style={{ flex: 1 }}>Saldo libre previsto</strong><Montos ars={libre.ars} usd={libre.usd} />
        </div>
      </div>
      <p style={{ color: "var(--tx2)", marginTop: 14 }}>Ahora probá cargar un gasto: tocá <strong>＋ Cargar</strong> y dictalo.</p>
      <Pie guardando={guardando} textoSiguiente="Ir a Inicio" onSiguiente={() => guardar(null)} />
    </div>
  );
}

function PasoBienvenida({ guardar, guardando }: PasoProps) {
  return (
    <div style={{ paddingTop: 24 }}>
      <div style={{ fontSize: 56 }} aria-hidden>💸</div>
      <Titulo titulo="Tus finanzas, sin pereza" />
      <ul style={{ color: "var(--tx2)", lineHeight: 1.6, paddingLeft: 18 }}>
        <li>Armás un presupuesto una vez y cada mes se arma solo.</li>
        <li>Cargás gastos dictando, en segundos.</li>
        <li>Cada quince días, una revisión de menos de 5 minutos.</li>
      </ul>
      <p style={{ color: "var(--tx3)" }}>Armar todo lleva unos 5 minutos. Podés saltear lo que quieras y seguir después.</p>
      <Pie guardando={guardando} textoSiguiente="Empezar" onSiguiente={() => guardar(null)} />
    </div>
  );
}

type PasoProps = { e: EstadoOnboarding; guardar: (datos: unknown, saltear?: boolean) => void; guardando: boolean };

const COMPONENTES: Record<PasoOnboarding, (p: PasoProps) => JSX.Element> = {
  bienvenida: PasoBienvenida,
  ingreso: PasoIngreso,
  tipo_cambio: PasoTipoCambio,
  fijos: PasoFijos,
  variables: PasoVariables,
  ahorro: PasoAhorro,
  tarjetas: PasoTarjetas,
  listo: PasoListo,
};

// ─── Página ─────────────────────────────────────────────────────

export default function Onboarding() {
  const router = useRouter();
  const [e, setE] = useState<EstadoOnboarding | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/finanzas/onboarding", { cache: "no-store" }).then((r) => r.json()).then(setE).catch(() => setError("No pudimos cargar. Revisá la conexión."));
  }, []);

  const idx = useMemo(() => (e ? (e.paso < 0 ? TOTAL : Math.min(e.paso, TOTAL)) : 0), [e]);
  const paso = PASOS_ONBOARDING[idx];

  async function enviar(body: object) {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/finanzas/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      return j as EstadoOnboarding;
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "No se pudo guardar. Probá de nuevo.");
      return null;
    } finally {
      setGuardando(false);
    }
  }

  async function guardar(datos: unknown, saltear = false) {
    const nuevo = await enviar({ paso, datos, saltear });
    if (!nuevo) return;
    vibrar();
    if (paso === "listo") return router.push("/finanzas");
    setE(nuevo);
    window.scrollTo({ top: 0 });
  }

  async function atras() {
    if (idx <= 0) return router.push("/finanzas");
    const nuevo = await enviar({ volverA: PASOS_ONBOARDING[idx - 1] });
    if (nuevo) setE(nuevo);
  }

  if (!e) return <div style={{ color: "var(--tx3)" }}>{error ?? "Cargando…"}</div>;
  const Paso = COMPONENTES[paso];

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <button type="button" className="fin-icono-btn" onClick={atras} aria-label={idx === 0 ? "Cerrar" : "Atrás"}>{idx === 0 ? "✕" : "‹"}</button>
        <div className="fin-barra" style={{ flex: 1 }} role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={idx} aria-label="Progreso">
          <div className="fin-barra-relleno" style={{ width: `${(idx / TOTAL) * 100}%` }} />
        </div>
        <span style={{ fontSize: 12, color: "var(--tx3)", minWidth: 32, textAlign: "right" }}>{idx}/{TOTAL}</span>
      </div>
      {error && <div className="fin-aviso-dup" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
      <Paso key={paso} e={e} guardar={guardar} guardando={guardando} />
    </div>
  );
}
