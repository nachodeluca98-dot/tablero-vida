"use client";
// Cierre de mes y apertura del siguiente (spec §6.4), en un solo asistente retomable.
// Pasos 1-2 se comparten con la revisión quincenal; 3-5 cierran el mes; 6-10 abren el siguiente.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Montos from "./Montos";
import { api, PasoFijos, PasoVariables, vibrar } from "./PasosRevision";
import ResumenIa from "./ResumenIa";
import { formatearTexto, montoDeTexto, textoDeMonto } from "./Teclado";
import type { DatosCarga } from "@/lib/finanzas/carga";
import type { DatosCierre } from "@/lib/finanzas/cierre";
import { fmtArs, fmtPct, fmtUsd, type Moneda } from "@/lib/finanzas/dinero";
import { nombreMes } from "@/lib/finanzas/fechas";
import type { DatosPresupuesto } from "@/lib/finanzas/presupuesto";
import type { DatosRevision } from "@/lib/finanzas/revision";

const aMonto = (t: string) => montoDeTexto(t.replace(/\./g, "").trim());
const fmt = (n: number | null | undefined, m: Moneda) => (m === "USD" ? fmtUsd(n) : fmtArs(n));
const mayus = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function Pie({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div style={{ height: 80 }} />
      <div className="fin-barra-accion">{children}</div>
    </>
  );
}

function CampoMonto({ valor, onChange, moneda, etiqueta, onConfirmar }: {
  valor: string; onChange: (v: string) => void; moneda: Moneda; etiqueta: string;
  onConfirmar?: (n: number | null) => void; // al salir del campo
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: "var(--tx3)" }}>{moneda === "USD" ? "US$" : "$"}</span>
      <input
        className="inline"
        inputMode="decimal"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const n = aMonto(e.target.value);
          onChange(n != null ? formatearTexto(textoDeMonto(n)) : e.target.value.trim() === "0" ? "0" : "");
          onConfirmar?.(n);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-label={etiqueta}
        style={{ width: 120, textAlign: "right", fontWeight: 600, background: "transparent", border: "none", borderBottom: "1px dashed var(--bd)", borderRadius: 0, padding: "6px 0" }}
      />
    </span>
  );
}

// ─── 3. Patrimonio ──────────────────────────────────────────────

function PasoPatrimonio({ c, accion, onSiguiente }: { c: DatosCierre; accion: (b: object) => Promise<DatosCierre | null>; onSiguiente: () => void }) {
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(c.cuentas.map((x) => [x.id, textoDeMonto(x.saldoActual ?? x.saldoAnterior) ? formatearTexto(textoDeMonto(x.saldoActual ?? x.saldoAnterior)) : ""]))
  );
  const [nueva, setNueva] = useState({ nombre: "", tipo: "banco", moneda: "ARS" as Moneda });
  const [agregando, setAgregando] = useState(c.cuentas.length === 0);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    // Cuentas nuevas aparecen prellenadas vacías
    setValores((v) => ({ ...Object.fromEntries(c.cuentas.map((x) => [x.id, ""])), ...v }));
  }, [c.cuentas]);

  async function agregar() {
    if (!nueva.nombre.trim()) return;
    const r = await accion({ accion: "cuenta", cuenta: nueva });
    if (r) { setNueva({ nombre: "", tipo: "banco", moneda: "ARS" }); setAgregando(false); }
  }
  async function guardar() {
    setGuardando(true);
    const saldos = c.cuentas.flatMap((x) => {
      const n = valores[x.id] === "0" ? 0 : aMonto(valores[x.id] ?? "");
      return n == null ? [] : [{ cuentaId: x.id, saldo: n }];
    });
    if (saldos.length) await accion({ accion: "patrimonio", saldos });
    setGuardando(false);
    onSiguiente();
  }

  return (
    <>
      <h1 style={{ fontSize: 22 }}>Tu patrimonio</h1>
      <p style={{ color: "var(--tx2)", marginTop: 0 }}>
        {c.cuentas.length ? "Te dejamos el saldo del cierre anterior. Cambiá solo lo que se movió." : "Anotá cuánto tenés en cada cuenta para ver cómo crece mes a mes. Es opcional."}
      </p>
      {c.cuentas.length > 0 && (
        <div className="fin-lista">
          {c.cuentas.map((x) => (
            <div key={x.id} className="fin-fila">
              <span className="fin-icono" aria-hidden>{x.icono || { banco: "🏦", billetera: "📱", efectivo: "💵", broker: "📈", cripto: "🪙", otro: "📦" }[x.tipo]}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {x.nombre}
                <span style={{ display: "block", fontSize: 11, color: "var(--tx3)" }}>
                  {x.saldoAnterior != null ? `Antes: ${fmt(x.saldoAnterior, x.moneda)}` : "Primer cierre"}
                </span>
              </span>
              <CampoMonto valor={valores[x.id] ?? ""} onChange={(v) => setValores({ ...valores, [x.id]: v })} moneda={x.moneda} etiqueta={`Saldo de ${x.nombre}`} />
            </div>
          ))}
        </div>
      )}
      {agregando ? (
        <div className="fin-selector" style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <input className="fin-input" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Nombre: Galicia, Mercado Pago, Efectivo…" aria-label="Nombre de la cuenta" />
          <div className="fin-chips">
            {([["banco", "🏦 Banco"], ["billetera", "📱 Billetera"], ["efectivo", "💵 Efectivo"], ["broker", "📈 Broker"], ["cripto", "🪙 Cripto"]] as const).map(([t, l]) => (
              <button key={t} type="button" className={`fin-chip ${nueva.tipo === t ? "activo" : ""}`} onClick={() => setNueva({ ...nueva, tipo: t })}>{l}</button>
            ))}
            {(["ARS", "USD"] as const).map((m) => (
              <button key={m} type="button" className={`fin-chip ${nueva.moneda === m ? "activo" : ""}`} onClick={() => setNueva({ ...nueva, moneda: m })}>{m}</button>
            ))}
          </div>
          <button type="button" className="fin-btn secundario" disabled={!nueva.nombre.trim()} onClick={agregar}>Agregar cuenta</button>
        </div>
      ) : (
        <button type="button" className="fin-link" onClick={() => setAgregando(true)}>+ Agregar cuenta</button>
      )}
      {c.cuentas.length > 0 && (
        <div style={{ fontSize: 13, color: "var(--tx2)", marginTop: 10 }}>
          Total del cierre anterior: <Montos ars={c.patrimonio.anterior.ars} usd={c.patrimonio.anterior.usd} />
        </div>
      )}
      <Pie>
        {c.cuentas.length === 0 ? (
          <button type="button" className="fin-btn secundario" onClick={onSiguiente}>Saltear</button>
        ) : (
          <button type="button" className="fin-btn primario" disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Listo, siguiente"}</button>
        )}
      </Pie>
    </>
  );
}

// ─── 4. Aportes a metas ─────────────────────────────────────────

function PasoAportes({ c, accion, onSiguiente }: { c: DatosCierre; accion: (b: object) => Promise<DatosCierre | null>; onSiguiente: () => void }) {
  const inicial = (m: DatosCierre["metas"][number]) => {
    const n = m.aportadoMes > 0 ? m.aportadoMes : m.asignado && m.asignado.moneda === m.moneda ? m.asignado.monto : 0;
    return n ? formatearTexto(textoDeMonto(n)) : "";
  };
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(c.metas.map((m) => [m.id, inicial(m)])));
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setValores((v) => ({ ...Object.fromEntries(c.metas.map((m) => [m.id, inicial(m)])), ...v })); }, [c.metas]);

  async function confirmar() {
    setGuardando(true);
    const aportes = c.metas.map((m) => ({ metaId: m.id, monto: aMonto(valores[m.id] ?? "") ?? 0, moneda: m.moneda }));
    await accion({ accion: "aportes", aportes });
    setGuardando(false);
    onSiguiente();
  }

  return (
    <>
      <h1 style={{ fontSize: 22 }}>Aportes a tus metas</h1>
      {c.metas.length === 0 ? (
        <div className="fin-vacio">
          <strong>Todavía no tenés metas</strong>
          Una buena primera meta es un fondo de emergencia: entre 3 y 6 meses de tus gastos esenciales.
          <div style={{ marginTop: 10 }}><button type="button" className="fin-btn secundario" onClick={() => accion({ accion: "fondo" })}>🛟 Crearlo</button></div>
        </div>
      ) : (
        <>
          <p style={{ color: "var(--tx2)", marginTop: 0 }}>¿Cuánto fue a cada meta en {nombreMes(c.anioMes)}? Te dejamos lo que habías planeado.</p>
          <div className="fin-lista">
            {c.metas.map((m) => (
              <div key={m.id} className="fin-fila">
                <span className="fin-icono" aria-hidden>{m.icono || (m.tipo === "fondo_emergencia" ? "🛟" : "🎯")}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {m.nombre}
                  <span style={{ display: "block", fontSize: 11, color: "var(--tx3)" }}>
                    {m.aportadoMes > 0 ? `Ya registrado: ${fmt(m.aportadoMes, m.moneda)}` : m.asignado ? "Lo planeado en la apertura" : "Sin aporte planeado"}
                  </span>
                </span>
                <CampoMonto valor={valores[m.id] ?? ""} onChange={(v) => setValores({ ...valores, [m.id]: v })} moneda={m.moneda} etiqueta={`Aporte a ${m.nombre}`} />
              </div>
            ))}
          </div>
          {((c.ahorroSinMeta.ars ?? 0) > 0) && (
            <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 8 }}>
              Tenés {fmtArs(c.ahorroSinMeta.ars)} ahorrados este mes sin meta: se asignan primero a lo que confirmes.
            </div>
          )}
        </>
      )}
      <Pie>
        {c.metas.length === 0 ? (
          <button type="button" className="fin-btn secundario" onClick={onSiguiente}>Saltear</button>
        ) : (
          <button type="button" className="fin-btn primario" disabled={guardando} onClick={confirmar}>{guardando ? "Guardando…" : "Confirmar"}</button>
        )}
      </Pie>
    </>
  );
}

// ─── 5. El mes en una mirada ────────────────────────────────────

function PasoMirada({ c, accion, onSiguiente }: { c: DatosCierre; accion: (b: object) => Promise<DatosCierre | null>; onSiguiente: () => void }) {
  const r = c.resumen.resumen;
  const tasa = r.ingresos.real.ars ? (r.ahorro.real.ars ?? 0) / r.ingresos.real.ars : null;
  const dif = { ars: (c.patrimonio.actual.ars ?? 0) - (c.patrimonio.anterior.ars ?? 0), usd: (c.patrimonio.actual.usd ?? 0) - (c.patrimonio.anterior.usd ?? 0) };
  const hayPatrimonio = (c.patrimonio.actual.ars ?? 0) !== 0 || (c.patrimonio.actual.usd ?? 0) !== 0;
  const [cerrando, setCerrando] = useState(false);
  const bajoPresupuesto = r.gastos.previsto.ars ? (r.gastos.real.ars ?? 0) <= r.gastos.previsto.ars : null;

  async function cerrar() {
    setCerrando(true);
    if (c.estado !== "cerrado") await accion({ accion: "cerrar" });
    vibrar(30);
    setCerrando(false);
    onSiguiente();
  }

  return (
    <div className="fin-celebrar">
      <h1 style={{ fontSize: 22 }}>{mayus(nombreMes(c.anioMes))} en una mirada</h1>
      <div className="fin-kpis">
        <div className="fin-kpi"><div className="fin-kpi-label">Ingresos</div><Montos ars={r.ingresos.real.ars} usd={r.ingresos.real.usd} /></div>
        <div className="fin-kpi"><div className="fin-kpi-label">Gastos</div><Montos ars={r.gastos.real.ars} usd={r.gastos.real.usd} /></div>
        <div className="fin-kpi"><div className="fin-kpi-label">Ahorro</div><Montos ars={r.ahorro.real.ars} usd={r.ahorro.real.usd} /></div>
        <div className="fin-kpi"><div className="fin-kpi-label">Tasa de ahorro</div><div style={{ fontSize: 22, fontWeight: 700 }}>{fmtPct(tasa)}</div></div>
      </div>
      <div className="fin-lista" style={{ marginTop: 10 }}>
        {bajoPresupuesto != null && (
          <div className="fin-fila">{bajoPresupuesto ? "✅ Gastaste dentro del presupuesto" : `📊 Te pasaste ${fmtArs((r.gastos.real.ars ?? 0) - (r.gastos.previsto.ars ?? 0))} del presupuesto; el mes que viene lo ajustamos`}</div>
        )}
        {hayPatrimonio && (
          <div className="fin-fila" style={{ flexWrap: "wrap" }}>
            <span style={{ flex: 1 }}>Patrimonio {dif.usd >= 0 ? "📈" : "📉"}</span>
            <Montos ars={c.patrimonio.actual.ars} usd={c.patrimonio.actual.usd} original="USD" />
            {(c.patrimonio.anterior.usd ?? 0) !== 0 && (
              <span style={{ width: "100%", fontSize: 12, color: "var(--tx3)" }}>
                {dif.usd >= 0 ? "Creció" : "Bajó"} {fmtUsd(Math.abs(dif.usd))} en dólares respecto del cierre anterior
              </span>
            )}
          </div>
        )}
        {c.metas.filter((m) => m.aportadoMes > 0).map((m) => (
          <div key={m.id} className="fin-fila"><span style={{ flex: 1 }}>{m.icono || "🎯"} {m.nombre}</span><span>+{fmt(m.aportadoMes, m.moneda)}</span></div>
        ))}
      </div>
      <div style={{ marginTop: 14, textAlign: "left" }}>
        <ResumenIa desde={c.anioMes} hasta={c.anioMes} autoGenerar />
      </div>
      <Pie>
        <button type="button" className="fin-btn primario" disabled={cerrando} onClick={cerrar}>
          {c.estado === "cerrado" ? "Seguir con " + nombreMes(c.siguiente) : cerrando ? "Cerrando…" : `Cerrar ${nombreMes(c.anioMes)}`}
        </button>
      </Pie>
    </div>
  );
}

// ─── 6. Tipo de cambio ──────────────────────────────────────────

function PasoTc({ c, accion, onSiguiente }: { c: DatosCierre; accion: (b: object) => Promise<DatosCierre | null>; onSiguiente: () => void }) {
  const [tc, setTc] = useState(c.apertura.tcSugerido ? formatearTexto(textoDeMonto(c.apertura.tcSugerido)) : "");
  const [editando, setEditando] = useState(!c.apertura.tcSugerido);
  async function guardar() {
    const n = aMonto(tc);
    if (n) await accion({ accion: "abrir", tipoCambio: n, fuenteTc: c.apertura.fuenteTc });
    onSiguiente();
  }
  return (
    <>
      <div style={{ fontSize: 12, color: "var(--amb-t)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600 }}>Apertura de {nombreMes(c.siguiente)}</div>
      <h1 style={{ fontSize: 22, marginTop: 4 }}>Tipo de cambio</h1>
      <p style={{ color: "var(--tx2)", marginTop: 0 }}>{c.apertura.tcSugerido ? "Te dejamos el del mes que cerraste." : "Usá el que te sirva de referencia: MEP, oficial o el de tu cobro."}</p>
      {editando ? (
        <input className="fin-input" style={{ width: "100%", fontSize: 24 }} inputMode="decimal" value={tc} onChange={(e) => setTc(e.target.value)} placeholder="Pesos por 1 dólar" aria-label="Tipo de cambio" autoFocus />
      ) : (
        <button type="button" className="fin-kpi" style={{ width: "100%", textAlign: "left" }} onClick={() => setEditando(true)}>
          <div className="fin-kpi-label">{c.apertura.fuenteTc || "Pesos por 1 dólar"}</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>$ {tc}</div>
          <div style={{ fontSize: 12, color: "var(--tx3)" }}>Tocá para cambiarlo</div>
        </button>
      )}
      <Pie>
        <button type="button" className="fin-btn primario" disabled={!aMonto(tc)} onClick={guardar}>{editando ? "Guardar" : "Mantener"}</button>
      </Pie>
    </>
  );
}

// ─── 7. Ajuste por inflación ────────────────────────────────────

function PasoInflacion({ c, accion, onSiguiente }: { c: DatosCierre; accion: (b: object) => Promise<DatosCierre | null>; onSiguiente: () => void }) {
  const [pct, setPct] = useState(String(c.apertura.ajusteSugerido || 0).replace(".", ","));
  const [guardando, setGuardando] = useState(false);
  const n = Number(pct.replace(",", ".")) || 0;
  const despues = c.apertura.fijosArs * (1 + n / 100);

  async function aplicar(p: number) {
    setGuardando(true);
    await accion({ accion: "abrir", ajustePct: p });
    setGuardando(false);
    onSiguiente();
  }

  if (c.apertura.yaClonado || c.apertura.tieneItems) {
    return (
      <>
        <h1 style={{ fontSize: 22 }}>Presupuesto de {nombreMes(c.siguiente)}</h1>
        <div className="fin-vacio"><strong>Ya está armado</strong>{mayus(nombreMes(c.siguiente))} ya tiene presupuesto, así que no hace falta copiarlo. Revisalo en el paso siguiente.</div>
        <Pie><button type="button" className="fin-btn primario" onClick={onSiguiente}>Siguiente</button></Pie>
      </>
    );
  }
  return (
    <>
      <h1 style={{ fontSize: 22 }}>¿Actualizamos los montos en pesos?</h1>
      <p style={{ color: "var(--tx2)", marginTop: 0 }}>El presupuesto de {nombreMes(c.siguiente)} se arma con el de {nombreMes(c.anioMes)}. Podés subir los montos en pesos por la inflación; los de dólares quedan igual.</p>
      <div className="fin-chips">
        {[0, 2, 3, 4, 5].map((p) => (
          <button key={p} type="button" className={`fin-chip ${n === p ? "activo" : ""}`} onClick={() => setPct(String(p))}>{p === 0 ? "Sin ajuste" : `${p}%`}</button>
        ))}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input className="fin-input" style={{ width: 70 }} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} aria-label="Porcentaje de ajuste" />%
        </label>
      </div>
      {c.apertura.fijosArs > 0 && (
        <div className="fin-kpi" style={{ marginTop: 12 }}>
          Tus fijos en pesos pasan de <strong>{fmtArs(c.apertura.fijosArs)}</strong> a <strong>{fmtArs(despues)}</strong>
        </div>
      )}
      <Pie>
        <button type="button" className="fin-btn secundario" disabled={guardando} onClick={() => aplicar(0)}>No ajustar</button>
        <button type="button" className="fin-btn primario" disabled={guardando || !n} onClick={() => aplicar(n)}>{guardando ? "Armando…" : `Aplicar ${n ? fmtPct(n / 100) : ""}`}</button>
      </Pie>
    </>
  );
}

// ─── 8. Revisar presupuesto ─────────────────────────────────────

function PasoRevisarPresupuesto({ c, datos, onSiguiente }: { c: DatosCierre; datos: DatosCarga; onSiguiente: () => void }) {
  const [p, setP] = useState<DatosPresupuesto | null>(null);
  const [nuevo, setNuevo] = useState({ concepto: "", monto: "", categoriaId: "" });
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/finanzas/presupuesto?mes=${c.siguiente}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r) setP(r);
  }, [c.siguiente]);
  useEffect(() => { cargar(); }, [cargar]);

  async function item(id: string, cambios: object) {
    vibrar(8);
    await api(`/api/finanzas/presupuesto/items/${id}`, "PATCH", cambios).catch(() => {});
    cargar();
  }
  async function agregar() {
    const monto = aMonto(nuevo.monto);
    if (!nuevo.concepto.trim() || !monto || !nuevo.categoriaId) return;
    await api("/api/finanzas/presupuesto/items", "POST", { anioMes: c.siguiente, concepto: nuevo.concepto, categoriaId: nuevo.categoriaId, monto }).catch(() => {});
    setNuevo({ concepto: "", monto: "", categoriaId: "" });
    cargar();
  }

  if (!p) return <div style={{ color: "var(--tx3)" }}>Cargando…</div>;
  const quitados = new Set(p.quitados.map((i) => i.id));
  return (
    <>
      <h1 style={{ fontSize: 22 }}>Revisá {nombreMes(c.siguiente)}</h1>
      <p style={{ color: "var(--tx2)", marginTop: 0 }}>Tocá un monto para cambiarlo. Quitá lo que no va este mes.</p>
      {p.grupos.length === 0 && <div className="fin-vacio">Todavía no hay ítems. Agregá los que esperás para {nombreMes(c.siguiente)}.</div>}
      {p.grupos.map((g) => (
        <div key={g.id} className="fin-lista" style={{ marginBottom: 8 }}>
          <div style={{ padding: "10px 12px 4px", fontWeight: 600 }}>{g.icono} {g.nombre}</div>
          {[...g.items, ...p.quitados.filter((q) => q.categoriaId === g.id)].filter((i) => i.origen !== "reasignacion").map((i) => {
            const fuera = quitados.has(i.id);
            const cuota = i.origen === "cuotas";
            return (
              <div key={i.id} className="fin-fila" style={{ opacity: fuera ? 0.45 : 1 }}>
                <span style={{ flex: 1, minWidth: 0, textDecoration: fuera ? "line-through" : undefined }}>
                  {i.concepto}
                  <span style={{ display: "block", fontSize: 11, color: "var(--tx3)" }}>{cuota ? "Cuota · informativa" : i.fijoVariable === "fijo" ? "Fijo" : "Variable"}</span>
                </span>
                {cuota || fuera ? (
                  <span style={{ fontWeight: 600, color: "var(--tx3)" }}>{fmt(i.monto, i.moneda)}</span>
                ) : (
                  <CampoEditable valor={i.monto} moneda={i.moneda} etiqueta={`Monto de ${i.concepto}`} onGuardar={(m) => item(i.id, { monto: m })} />
                )}
                {!cuota && (
                  <button type="button" className="fin-chip" onClick={() => item(i.id, { activo: fuera })} aria-label={fuera ? `Volver a agregar ${i.concepto}` : `Quitar ${i.concepto}`}>
                    {fuera ? "Mantener" : "Quitar"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {/* Quitados de categorías que quedaron sin ítems activos: siguen a mano para volver a agregarlos */}
      {(() => {
        const huerfanos = p.quitados.filter((q) => !p.grupos.some((g) => g.id === q.categoriaId));
        if (!huerfanos.length) return null;
        return (
          <div className="fin-lista" style={{ marginBottom: 8 }}>
            <div style={{ padding: "10px 12px 4px", fontWeight: 600, color: "var(--tx3)" }}>Quitados</div>
            {huerfanos.map((i) => (
              <div key={i.id} className="fin-fila" style={{ opacity: 0.6 }}>
                <span style={{ flex: 1, textDecoration: "line-through" }}>{i.concepto}</span>
                <span style={{ color: "var(--tx3)" }}>{fmt(i.monto, i.moneda)}</span>
                <button type="button" className="fin-chip" onClick={() => item(i.id, { activo: true })} aria-label={`Volver a agregar ${i.concepto}`}>Mantener</button>
              </div>
            ))}
          </div>
        );
      })()}
      <div className="fin-selector" style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <strong style={{ fontSize: 13 }}>➕ Agregar ítem</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="fin-input" style={{ flex: 1 }} value={nuevo.concepto} onChange={(e) => setNuevo({ ...nuevo, concepto: e.target.value })} placeholder="Nombre" aria-label="Nombre del ítem" />
          <input className="fin-input" style={{ width: 110 }} inputMode="decimal" value={nuevo.monto} onChange={(e) => setNuevo({ ...nuevo, monto: e.target.value })} placeholder="Monto" aria-label="Monto del ítem" />
        </div>
        <select className="fin-input" value={nuevo.categoriaId} onChange={(e) => setNuevo({ ...nuevo, categoriaId: e.target.value })} aria-label="Categoría">
          <option value="">Categoría…</option>
          {datos.categorias.map((cat) => <option key={cat.id} value={cat.id}>{cat.icono} {cat.nombre}</option>)}
        </select>
        <button type="button" className="fin-btn secundario" disabled={!nuevo.concepto.trim() || !aMonto(nuevo.monto) || !nuevo.categoriaId} onClick={agregar}>Agregar</button>
      </div>
      <Pie>
        <button type="button" className="fin-btn primario" onClick={onSiguiente}>Dejar todo como está</button>
      </Pie>
    </>
  );
}

function CampoEditable({ valor, moneda, etiqueta, onGuardar }: { valor: number; moneda: Moneda; etiqueta: string; onGuardar: (m: number) => void }) {
  const [t, setT] = useState(formatearTexto(textoDeMonto(valor)));
  useEffect(() => setT(formatearTexto(textoDeMonto(valor))), [valor]);
  return <CampoMonto valor={t} moneda={moneda} etiqueta={etiqueta} onChange={setT} onConfirmar={(n) => n && n !== valor && onGuardar(n)} />;
}

// ─── 9. Ahorro primero ──────────────────────────────────────────

function PasoAhorro({ c, accion, onSiguiente }: { c: DatosCierre; accion: (b: object) => Promise<DatosCierre | null>; onSiguiente: () => void }) {
  const [p, setP] = useState<DatosPresupuesto | null>(null);
  const [valor, setValor] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [metaId, setMetaId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch(`/api/finanzas/presupuesto?mes=${c.siguiente}`, { cache: "no-store" }).then((x) => x.json()).then((r: DatosPresupuesto) => {
      setP(r);
      const it = r.grupos.find((g) => g.tipo === "ahorro")?.items[0];
      if (it) { setValor(formatearTexto(textoDeMonto(it.monto))); setMoneda(it.moneda); }
      const m = c.metas.find((x) => it?.concepto.includes(x.nombre)) ?? c.metas[0];
      setMetaId(m?.id ?? null);
    }).catch(() => {});
  }, [c.siguiente, c.metas]);

  async function guardar() {
    setGuardando(true);
    await accion({ accion: "ahorro", monto: aMonto(valor) ?? 0, moneda, metaId });
    setGuardando(false);
    onSiguiente();
  }

  const libre = p?.saldoLibrePrevisto;
  return (
    <>
      <h1 style={{ fontSize: 22 }}>Ahorro primero</h1>
      <p style={{ color: "var(--tx2)", marginTop: 0 }}>
        ¿Cuánto separás apenas cobres en {nombreMes(c.siguiente)}?
        {libre && (libre.ars ?? 0) > 0 && <> Con lo previsto te quedan libres <strong>{fmtArs(libre.ars)}</strong> después del ahorro planeado.</>}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input className="fin-input" style={{ flex: 1, fontSize: 24 }} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0" aria-label="Monto a ahorrar" />
        {(["ARS", "USD"] as const).map((m) => (
          <button key={m} type="button" className={`fin-chip ${moneda === m ? "activo" : ""}`} onClick={() => setMoneda(m)}>{m}</button>
        ))}
      </div>
      {c.metas.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: "var(--tx3)", margin: "12px 0 6px" }}>¿A qué meta va?</div>
          <div className="fin-chips">
            {c.metas.map((m) => (
              <button key={m.id} type="button" className={`fin-chip ${metaId === m.id ? "activo" : ""}`} onClick={() => setMetaId(m.id)}>{m.icono || "🎯"} {m.nombre}</button>
            ))}
            <button type="button" className={`fin-chip ${metaId === null ? "activo" : ""}`} onClick={() => setMetaId(null)}>Sin meta</button>
          </div>
        </>
      )}
      <Pie>
        <button type="button" className="fin-btn primario" disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Siguiente"}</button>
      </Pie>
    </>
  );
}

// ─── 10. Listo ──────────────────────────────────────────────────

function PasoListo({ c, onTerminar, terminando }: { c: DatosCierre; onTerminar: () => void; terminando: boolean }) {
  const [p, setP] = useState<DatosPresupuesto | null>(null);
  useEffect(() => {
    fetch(`/api/finanzas/presupuesto?mes=${c.siguiente}`, { cache: "no-store" }).then((x) => x.json()).then(setP).catch(() => {});
  }, [c.siguiente]);
  const r = p?.resumen;
  return (
    <div className="fin-celebrar" style={{ paddingTop: 8 }}>
      <div style={{ fontSize: 52, textAlign: "center" }} aria-hidden>🎉</div>
      <h1 style={{ fontSize: 22, textAlign: "center" }}>{mayus(nombreMes(c.anioMes))} cerrado, {nombreMes(c.siguiente)} listo</h1>
      {r && (
        <div className="fin-lista">
          <div className="fin-fila"><span style={{ flex: 1 }}>Ingresos previstos</span><Montos ars={r.ingresos.previsto.ars} usd={r.ingresos.previsto.usd} /></div>
          <div className="fin-fila"><span style={{ flex: 1 }}>Gastos previstos</span><Montos ars={r.gastos.previsto.ars} usd={r.gastos.previsto.usd} /></div>
          <div className="fin-fila"><span style={{ flex: 1 }}>Ahorro</span><Montos ars={r.ahorro.previsto.ars} usd={r.ahorro.previsto.usd} /></div>
          <div className="fin-fila" style={{ background: "var(--bg3)" }}><strong style={{ flex: 1 }}>Saldo libre previsto</strong><Montos ars={p!.saldoLibrePrevisto.ars} usd={p!.saldoLibrePrevisto.usd} /></div>
        </div>
      )}
      <Pie>
        <button type="button" className="fin-btn primario" disabled={terminando} onClick={onTerminar}>{terminando ? "Guardando…" : "Ir a Inicio"}</button>
      </Pie>
    </div>
  );
}

// ─── Asistente ──────────────────────────────────────────────────

const TITULOS = ["Fijos", "Variables", "Patrimonio", "Metas", "Resumen", "Tipo de cambio", "Inflación", "Presupuesto", "Ahorro", "Listo"];

export default function AsistenteCierre({ d, datos, onRecargar, irAPaso, onTerminado }: {
  d: DatosRevision;
  datos: DatosCarga | null;
  onRecargar: () => void;
  irAPaso: (paso: number) => void;
  onTerminado: () => void;
}) {
  const anioMes = d.revision.anioMes;
  const [c, setC] = useState<DatosCierre | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terminando, setTerminando] = useState(false);
  const paso = Math.max(1, Math.min(10, d.revision.paso));

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/finanzas/cierre?mes=${anioMes}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r) setC(r);
  }, [anioMes]);
  useEffect(() => { cargar(); }, [cargar, paso]);

  const accion = useCallback(async (b: object) => {
    try {
      const r: DatosCierre = await api("/api/finanzas/cierre", "POST", { mes: anioMes, ...b });
      setC(r);
      setError(null);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      return null;
    }
  }, [anioMes]);

  const siguiente = () => irAPaso(paso + 1);

  async function terminar() {
    setTerminando(true);
    await api("/api/finanzas/cierre", "POST", { mes: anioMes, accion: "finalizar", revisionId: d.revision.id }).catch(() => null);
    vibrar(30);
    onTerminado();
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Link href="/finanzas" className="fin-icono-btn" aria-label="Salir (se guarda dónde quedaste)" style={{ textDecoration: "none" }}>✕</Link>
        {paso > 1 && <button type="button" className="fin-icono-btn" aria-label="Atrás" onClick={() => irAPaso(paso - 1)}>‹</button>}
        <div className="fin-barra" style={{ flex: 1 }} role="progressbar" aria-valuenow={paso} aria-valuemax={10} aria-label="Progreso">
          <div className="fin-barra-relleno" style={{ width: `${(paso / 10) * 100}%` }} />
        </div>
        <span style={{ fontSize: 12, color: "var(--tx3)", minWidth: 70, textAlign: "right" }}>{TITULOS[paso - 1]}</span>
      </div>
      {paso <= 5 && <div style={{ fontSize: 12, color: "var(--amb-t)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600 }}>Cierre de {nombreMes(anioMes)}</div>}
      {error && <div className="fin-aviso-dup" role="alert" style={{ margin: "8px 0" }}>{error}</div>}

      {paso === 1 && <PasoFijos key={`f-${d.revision.id}`} d={d} onSiguiente={siguiente} />}
      {paso === 2 && datos && <PasoVariables d={d} datos={datos} onRecargar={onRecargar} onSiguiente={siguiente} />}
      {paso >= 3 && !c && <div style={{ color: "var(--tx3)" }}>Cargando…</div>}
      {paso === 3 && c && <PasoPatrimonio c={c} accion={accion} onSiguiente={siguiente} />}
      {paso === 4 && c && <PasoAportes c={c} accion={accion} onSiguiente={siguiente} />}
      {paso === 5 && c && <PasoMirada c={c} accion={accion} onSiguiente={siguiente} />}
      {paso === 6 && c && <PasoTc c={c} accion={accion} onSiguiente={siguiente} />}
      {paso === 7 && c && <PasoInflacion c={c} accion={accion} onSiguiente={siguiente} />}
      {paso === 8 && c && datos && <PasoRevisarPresupuesto c={c} datos={datos} onSiguiente={siguiente} />}
      {paso === 9 && c && <PasoAhorro c={c} accion={accion} onSiguiente={siguiente} />}
      {paso === 10 && c && <PasoListo c={c} onTerminar={terminar} terminando={terminando} />}
    </>
  );
}
