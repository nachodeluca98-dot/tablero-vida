"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Montos from "@/components/finanzas/Montos";
import { fmtPct } from "@/lib/finanzas/dinero";
import { nombreMes } from "@/lib/finanzas/fechas";
import type { DatosInicio, ProximoPaso } from "@/lib/finanzas/inicio";

const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// ─── Tu próximo paso ────────────────────────────────────────────

// keepalive: el pedido sigue aunque se navegue a otra pantalla (acción de una guía)
const postGuia = (body: object) =>
  fetch("/api/finanzas/guias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => null);

function CargarTipoCambio({ paso, onGuardado }: { paso: Extract<ProximoPaso, { tipo: "tipo_cambio" }>; onGuardado: () => void }) {
  const [tc, setTc] = useState(paso.sugerido ? String(paso.sugerido).replace(".", ",") : "");
  const [fuente, setFuente] = useState(paso.fuenteSugerida || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const res = await fetch(`/api/finanzas/meses/${paso.anioMes}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipoCambio: tc, fuenteTc: fuente }),
    });
    setGuardando(false);
    if (!res.ok) return setError((await res.json().catch(() => null))?.error || "No se pudo guardar. Probá de nuevo.");
    onGuardado();
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <label>
          <span style={{ fontSize: 12, color: "var(--tx3)" }}>Pesos por 1 USD</span>
          <input className="fin-input" type="text" inputMode="decimal" value={tc} onChange={(e) => setTc(e.target.value)} placeholder="Ej.: 1.450" autoComplete="off" />
        </label>
        <label>
          <span style={{ fontSize: 12, color: "var(--tx3)" }}>Fuente (opcional)</span>
          <input className="fin-input" type="text" value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder="MEP, oficial…" />
        </label>
      </div>
      {error && <div style={{ color: "var(--amb-t)", marginBottom: 8 }}>{error}</div>}
      <button type="submit" className="fin-btn primario" disabled={guardando || !tc.trim()}>
        {guardando ? "Guardando…" : paso.sugerido ? "Usar este" : "Guardar"}
      </button>
    </form>
  );
}

function TarjetaProximoPaso({ paso, anioMes, onCambio, onRecargar }: { paso: ProximoPaso; anioMes: string; onCambio: (aviso: string) => void; onRecargar: () => void }) {
  const mesNombre = nombreMes(anioMes);
  let etiqueta = "Tu próximo paso";
  let titulo: string;
  let texto: string;
  let accion: React.ReactNode = null;

  switch (paso.tipo) {
    case "onboarding":
      titulo = paso.retomar ? "Sigamos armando tu presupuesto" : "Armemos tu primer presupuesto";
      texto = "Son unos 5 minutos: tus gastos fijos, un estimado de los variables y cuánto querés ahorrar.";
      accion = <Link href="/finanzas/onboarding" className="fin-btn primario">{paso.retomar ? "Retomar" : "Empezar"}</Link>;
      break;
    case "revision": {
      const cierre = paso.revision === "cierre";
      titulo = cierre ? (paso.anioMes === anioMes ? "Cerremos el mes" : `Cerremos ${nombreMes(paso.anioMes)}`) : paso.primera ? "Tu primera revisión" : "Es día de revisión";
      texto = cierre
        ? "Confirmás fijos y saldos, y dejamos listo el mes que viene. Unos 7 minutos."
        : "Tildás los fijos, dictás los variables y ves cómo vas. Menos de 5 minutos.";
      if (paso.primera) etiqueta = "Guía";
      accion = <Link href={paso.ruta} className="fin-btn primario">{paso.retomar ? "Retomar" : "Empezar"}</Link>;
      break;
    }
    case "tipo_cambio":
      titulo = `Tipo de cambio de ${mesNombre}`;
      texto = paso.sugerido
        ? "Te dejamos el del mes pasado. Usá el que te sirva de referencia: lo podés cambiar cuando quieras."
        : "Usá el que te sirva de referencia: MEP, oficial o el de tu cobro. Lo podés cambiar cuando quieras.";
      accion = <CargarTipoCambio paso={paso} onGuardado={() => onCambio("Tipo de cambio guardado")} />;
      break;
    case "clasificar":
      titulo = paso.cantidad === 1 ? "Tenés 1 movimiento sin categoría" : `Tenés ${paso.cantidad} movimientos sin categoría`;
      texto = "Un toque por movimiento y listo.";
      accion = <Link href="/finanzas/clasificar" className="fin-btn primario">Clasificar ({paso.cantidad})</Link>;
      break;
    case "guia": {
      const g = paso.guia;
      etiqueta = "Guía";
      titulo = g.titulo;
      texto = g.texto;
      const responder = async (respuesta: "completar" | "ahora_no" | "no_mostrar") => {
        await postGuia({ guia: g.id, respuesta });
        onRecargar();
      };
      accion = (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {g.accion ? (
            <Link href={g.accion.ruta} className="fin-btn primario" onClick={() => { postGuia({ guia: g.id, respuesta: "completar" }); }}>{g.accion.etiqueta}</Link>
          ) : (
            <button type="button" className="fin-btn primario" onClick={() => responder("completar")}>{g.id === "racha" ? "👏 ¡Vamos!" : "Entendido"}</button>
          )}
          {g.accion && <button type="button" className="fin-link fin-guia-btn" onClick={() => responder("ahora_no")}>Ahora no</button>}
          {g.id !== "racha" && <button type="button" className="fin-link fin-guia-btn" onClick={() => responder("no_mostrar")}>No mostrar más</button>}
        </div>
      );
      break;
    }
    case "al_dia":
      etiqueta = "Todo al día";
      titulo = "Vas bárbaro 🙌";
      texto = paso.proximaRevision ? `Próxima revisión: ${fechaCorta(paso.proximaRevision)}.` : "No tenés nada pendiente.";
      break;
  }

  return (
    <section className="fin-paso" aria-live="polite">
      <div className="fin-paso-etiqueta">{etiqueta}</div>
      <div className="fin-paso-titulo">{titulo}</div>
      <div className="fin-paso-texto">{texto}</div>
      {accion}
    </section>
  );
}

// ─── Hitos y racha (spec §7.3) ──────────────────────────────────

function Hito({ hito, onListo }: { hito: NonNullable<DatosInicio["hito"]>; onListo: () => void }) {
  const [cerrando, setCerrando] = useState(false);
  return (
    <section className="fin-hito fin-celebrar" role="status">
      <span className="fin-hito-icono" aria-hidden>{hito.icono}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: "block" }}>{hito.titulo}</strong>
        <span style={{ color: "var(--tx2)", fontSize: 13 }}>{hito.texto}</span>
      </div>
      <button
        type="button"
        className="fin-icono-btn"
        aria-label="Listo"
        disabled={cerrando}
        onClick={async () => { setCerrando(true); await postGuia({ hito: hito.id, anteriores: hito.anteriores }); onListo(); }}
      >
        👏
      </button>
    </section>
  );
}

// Discreta: solo aparece desde 2 seguidas, y si se corta simplemente no se muestra (no es un fracaso)
function Racha({ n }: { n: number }) {
  if (n < 2) return null;
  return <div className="fin-racha">🔥 {n} revisiones seguidas</div>;
}

// ─── Resumen del mes ────────────────────────────────────────────

function Kpi({ label, ars, usd, href }: { label: string; ars: number | null; usd: number | null; href: string }) {
  return (
    <Link href={href} className="fin-kpi">
      <div className="fin-kpi-label">{label}</div>
      <Montos ars={ars} usd={usd} tamano={15} />
    </Link>
  );
}

function ResumenMes({ d }: { d: DatosInicio }) {
  const r = d.resumen;
  const mes = d.mes.anioMes;
  const usado = r.presupuestoUsado;
  return (
    <section className="fin-seccion">
      <div className="fin-seccion-head"><h2>{d.mes.nombre}</h2></div>
      <div className="fin-kpis">
        <Kpi label="Ingresos" ars={r.ingresos.ars} usd={r.ingresos.usd} href={`/finanzas/movimientos?mes=${mes}&tipo=ingreso`} />
        <Kpi label="Gastos" ars={r.gastos.ars} usd={r.gastos.usd} href={`/finanzas/movimientos?mes=${mes}&tipo=gasto`} />
        <Kpi label="Ahorro" ars={r.ahorro.ars} usd={r.ahorro.usd} href={`/finanzas/movimientos?mes=${mes}&tipo=ahorro`} />
        <Kpi label="Saldo libre" ars={r.saldoLibre.ars} usd={r.saldoLibre.usd} href={`/finanzas/presupuesto?mes=${mes}`} />
      </div>

      <Link href={`/finanzas/estadisticas?mes=${mes}`} className="fin-kpi" style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="fin-kpi-label">Tasa de ahorro</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{fmtPct(r.tasaAhorro)}</div>
        </div>
        <div style={{ color: "var(--tx3)", fontSize: 12, textAlign: "right", maxWidth: 180 }}>
          {r.tasaAhorro == null ? "Aparece cuando cargues tus ingresos del mes" : "de lo que entró, separado para ahorro"}
        </div>
      </Link>

      {usado != null ? (
        <Link href={`/finanzas/presupuesto?mes=${mes}`} className="fin-kpi" style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
            <span>Usaste <strong>{fmtPct(usado)}</strong> del presupuesto</span>
            <span style={{ color: "var(--tx3)" }}>pasó {fmtPct(r.mesTranscurrido)} del mes</span>
          </div>
          <div className="fin-barra" role="img" aria-label={`Presupuesto usado ${fmtPct(usado)}, mes transcurrido ${fmtPct(r.mesTranscurrido)}`}>
            <div className="fin-barra-relleno" style={{ width: `${Math.min(100, usado * 100)}%` }} />
            <div className="fin-barra-marca" style={{ left: `calc(${Math.min(100, r.mesTranscurrido * 100)}% - 1px)` }} />
          </div>
        </Link>
      ) : null}

      {r.incompleto && (
        <div style={{ color: "var(--tx3)", fontSize: 12, marginTop: 6 }}>
          Algunos montos están en una sola moneda hasta que cargues el tipo de cambio del mes.
        </div>
      )}
    </section>
  );
}

function Categorias({ d }: { d: DatosInicio }) {
  const cats = d.resumen.categorias;
  return (
    <section className="fin-seccion">
      <div className="fin-seccion-head">
        <h2>Categorías del mes</h2>
        {cats.length > 0 && <Link href={`/finanzas/presupuesto?mes=${d.mes.anioMes}`} className="fin-link">Ver todas</Link>}
      </div>
      {cats.length === 0 ? (
        <div className="fin-vacio">
          <strong>Acá vas a ver en qué se va la plata</strong>
          Cada categoría muestra lo que planeaste y lo que llevás gastado, para que sepas cómo venís sin hacer cuentas.
        </div>
      ) : (
        <div className="fin-lista">
          {cats.map((c) => {
            const pct = c.presupuesto.ars ? (c.real.ars ?? 0) / c.presupuesto.ars : null;
            return (
              <Link key={c.id} href={`/finanzas/movimientos?mes=${d.mes.anioMes}&categoria=${c.id}`} className="fin-fila" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span aria-hidden style={{ fontSize: 18 }}>{c.icono}</span>
                  <span style={{ flex: 1 }}>{c.nombre}</span>
                  <Montos ars={c.real.ars} usd={c.real.usd} />
                </div>
                {pct != null ? (
                  <>
                    <div className="fin-barra"><div className="fin-barra-relleno" style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>
                    <div style={{ fontSize: 12, color: "var(--tx3)" }}>
                      {fmtPct(pct)} de {Math.round(c.presupuesto.ars ?? 0).toLocaleString("es-AR")} previstos
                      {pct > 1 && " · podés cubrirlo desde otra categoría"}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--tx3)" }}>Sin presupuesto este mes</div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Metas({ d }: { d: DatosInicio }) {
  return (
    <section className="fin-seccion">
      <div className="fin-seccion-head">
        <h2>Metas</h2>
        {d.metas.length > 0 && <Link href="/finanzas/metas" className="fin-link">Ver todas</Link>}
      </div>
      {d.metas.length === 0 ? (
        <div className="fin-vacio">
          <strong>Todavía no tenés metas</strong>
          Una buena primera meta es un fondo de emergencia: entre 3 y 6 meses de tus gastos esenciales.
          <div style={{ marginTop: 10 }}>
            <Link href="/finanzas/metas?nueva=fondo_emergencia" className="fin-btn secundario">Crearlo</Link>
          </div>
        </div>
      ) : (
        <div className="fin-metas">
          {d.metas.map((m) => (
            <Link key={m.id} href={`/finanzas/metas?id=${m.id}`} className="fin-kpi">
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span aria-hidden>{m.icono || (m.tipo === "fondo_emergencia" ? "🛟" : "🎯")}</span>
                <strong style={{ fontSize: 13 }}>{m.nombre}</strong>
              </div>
              <Montos ars={m.aportado.ars} usd={m.aportado.usd} />
              {m.tipo === "fondo_emergencia" ? (
                <>
                  <div className="fin-casilleros" role="img" aria-label={`${m.mesesCubiertos?.toFixed(1) ?? 0} de ${m.mesesCobertura} meses cubiertos`}>
                    {Array.from({ length: m.mesesCobertura ?? 6 }, (_, i) => (
                      <div key={i} className={`fin-casillero ${(m.mesesCubiertos ?? 0) >= i + 1 ? "lleno" : ""}`} />
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 4 }}>
                    {m.mesesCubiertos == null
                      ? "Los meses cubiertos aparecen al cerrar tu primer mes"
                      : `${m.mesesCubiertos.toLocaleString("es-AR", { maximumFractionDigits: 1 })} de ${m.mesesCobertura} meses cubiertos`}
                  </div>
                </>
              ) : m.progreso != null ? (
                <>
                  <div className="fin-barra" style={{ marginTop: 8 }}><div className="fin-barra-relleno" style={{ width: `${Math.min(100, m.progreso * 100)}%`, background: "var(--sal)" }} /></div>
                  <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 4 }}>{fmtPct(m.progreso)} del objetivo</div>
                </>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function UltimosMovimientos({ d }: { d: DatosInicio }) {
  return (
    <section className="fin-seccion">
      <div className="fin-seccion-head">
        <h2>Últimos movimientos</h2>
        {d.ultimos.length > 0 && <Link href="/finanzas/movimientos" className="fin-link">Ver todos</Link>}
      </div>
      {d.ultimos.length === 0 ? (
        <div className="fin-vacio">
          <strong>Acá aparece lo que vayas cargando</strong>
          Tocá <b>＋ Cargar</b> abajo y dictá algo como &quot;súper 180 lucas, delivery 25 con la visa&quot;.
        </div>
      ) : (
        <div className="fin-lista">
          {d.ultimos.map((r) => (
            <Link key={r.id} href={`/finanzas/movimientos?id=${r.id}`} className="fin-fila">
              <div className="fin-icono" aria-hidden>{r.categoria?.icono || "❔"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.descripcion || r.categoria?.nombre || "Sin descripción"}
                  {r.esAproximado && <span className="fin-marca" title="Aproximado">≈</span>}
                  {r.compartido && <span className="fin-marca" title="Compartido">👥</span>}
                  {r.cuotaNumero != null && <span className="fin-marca">cuota {r.cuotaNumero}</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--tx3)" }}>
                  {fechaCorta(r.fecha)} · {r.categoria?.nombre || "Sin clasificar"}
                </div>
              </div>
              <Montos ars={r.montoArs} usd={r.montoUsd} original={r.monedaOriginal} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Página ─────────────────────────────────────────────────────

export default function InicioFinanzas() {
  const [d, setD] = useState<DatosInicio | null>(null);
  const [error, setError] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/finanzas/inicio", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setD(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3000);
    return () => clearTimeout(t);
  }, [aviso]);

  if (error && !d) {
    return (
      <div className="fin-vacio">
        <strong>No pudimos cargar tus finanzas</strong>
        Revisá la conexión y probá de nuevo.
        <div style={{ marginTop: 10 }}><button className="fin-btn secundario" onClick={cargar}>Reintentar</button></div>
      </div>
    );
  }
  if (!d) return <div style={{ color: "var(--tx3)" }}>Cargando…</div>;

  return (
    <>
      <h1>Finanzas</h1>
      {d.hito && <Hito hito={d.hito} onListo={cargar} />}
      <TarjetaProximoPaso paso={d.proximoPaso} anioMes={d.mes.anioMes} onCambio={(a) => { setAviso(a); cargar(); }} onRecargar={cargar} />
      <Racha n={d.racha} />
      <ResumenMes d={d} />
      <Categorias d={d} />
      <Metas d={d} />
      <UltimosMovimientos d={d} />
      {aviso && <div className="fin-toast" role="status">{aviso}</div>}
    </>
  );
}
