"use client";
// Estadísticas (spec §10): selector de período fijo arriba que aplica a todo; montos en ARS | USD;
// tocar cualquier número o barra lleva a Movimientos filtrado por ese período y esa dimensión.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { BarraPartida, BarrasH, CATEGORICO, Columnas, compacto, ConTabla, Linea, mesCorto, SERIE, TablaDatos } from "@/components/finanzas/Graficos";
import Montos from "@/components/finanzas/Montos";
import { fmtArs, fmtPct, fmtUsd, type Montos as M } from "@/lib/finanzas/dinero";
import type { DatosEstadisticas } from "@/lib/finanzas/estadisticas";
import { anioMesActual, nombreMes, sumarMeses } from "@/lib/finanzas/fechas";

type Periodo = "mes" | "trimestre" | "anio" | "personalizado";
const mayus = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// Rango [desde, hasta] del período que contiene `ref`
function rango(p: Periodo, ref: string, desde?: string | null): [string, string] {
  const [a, m] = ref.split("-").map(Number);
  if (p === "trimestre") {
    const ini = `${a}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}`;
    return [ini, sumarMeses(ini, 2)];
  }
  if (p === "anio") return [`${a}-01`, `${a}-12`];
  if (p === "personalizado" && desde && desde <= ref) return [desde, ref];
  return [ref, ref];
}

function etiquetaPeriodo(p: Periodo, d: string, h: string) {
  if (p === "mes") return `${mayus(nombreMes(d))} ${d.slice(0, 4)}`;
  if (p === "trimestre") return `${Math.ceil(Number(d.slice(5, 7)) / 3)}.º trimestre ${d.slice(0, 4)}`;
  if (p === "anio") return d.slice(0, 4);
  return `${mesCorto(d)} ${d.slice(0, 4)} – ${mesCorto(h)} ${h.slice(0, 4)}`;
}

function Widget({ titulo, children, accion }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <section className="fin-seccion">
      <div className="fin-seccion-head"><h2>{titulo}</h2>{accion}</div>
      <div className="fin-kpi" style={{ padding: 14 }}>{children}</div>
    </section>
  );
}

function Vacio({ titulo, texto, accion }: { titulo: string; texto: string; accion?: React.ReactNode }) {
  return (
    <div style={{ color: "var(--tx2)", lineHeight: 1.45 }}>
      <strong style={{ display: "block", color: "var(--tx)", marginBottom: 4 }}>{titulo}</strong>
      {texto}
      {accion && <div style={{ marginTop: 10 }}>{accion}</div>}
    </div>
  );
}

// Variación vs. el período anterior: flecha + texto; color según si el cambio es bueno
function Delta({ actual, previo, subirEsBueno, puntos }: { actual: number | null; previo: number | null; subirEsBueno: boolean; puntos?: boolean }) {
  if (actual == null || previo == null || (!puntos && !previo)) return <span style={{ fontSize: 11, color: "var(--tx3)" }}>sin período anterior</span>;
  const dif = puntos ? (actual - previo) * 100 : ((actual - previo) / Math.abs(previo)) * 100;
  if (Math.abs(dif) < 0.5) return <span style={{ fontSize: 11, color: "var(--tx3)" }}>= igual que antes</span>;
  const sube = dif > 0;
  const bueno = sube === subirEsBueno;
  return (
    <span style={{ fontSize: 11, color: bueno ? "var(--sal-t)" : "var(--amb-t)" }}>
      {sube ? "▲" : "▼"} {Math.abs(Math.round(dif))}{puntos ? " pts" : "%"} vs. anterior
    </span>
  );
}

function Estadisticas() {
  const router = useRouter();
  const sp = useSearchParams();
  const periodo = (["mes", "trimestre", "anio", "personalizado"].includes(sp.get("periodo") ?? "") ? sp.get("periodo") : "mes") as Periodo;
  const ref = /^\d{4}-\d{2}$/.test(sp.get("mes") ?? "") ? sp.get("mes")! : anioMesActual();
  const [desde, hastaPeriodo] = rango(periodo, ref, sp.get("desde"));
  // El período en curso llega hasta hoy: sin meses futuros vacíos
  const hasta = desde <= anioMesActual() && hastaPeriodo > anioMesActual() ? anioMesActual() : hastaPeriodo;
  const [d, setD] = useState<DatosEstadisticas | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setD(null);
    fetch(`/api/finanzas/estadisticas?desde=${desde}&hasta=${hasta}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setError(true));
  }, [desde, hasta]);

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.replace(`/finanzas/estadisticas?${p.toString()}`, { scroll: false });
  };
  const largo = periodo === "mes" ? 1 : periodo === "trimestre" ? 3 : periodo === "anio" ? 12 : Math.max(1, d?.meses.length ?? 1);
  const mover = (n: number) => ir({ mes: sumarMeses(ref, n * largo), desde: periodo === "personalizado" ? sumarMeses(desde, n * largo) : null });
  const mov = (extra: string) => `/finanzas/movimientos?desde=${desde}&hasta=${hasta}${extra}`;

  const metasConAporte = useMemo(() => (d?.metas ?? []).filter((m) => m.porMes.some((x) => x.usd > 0)), [d]);
  const fondo = d?.metas.find((m) => m.tipo === "fondo_emergencia");

  return (
    <>
      <h1>Estadísticas</h1>

      {/* Selector de período fijo arriba (spec §10) */}
      <div className="fin-fijo-arriba">
        <div className="fin-chips">
          {([["mes", "Mes"], ["trimestre", "Trimestre"], ["anio", "Año"], ["personalizado", "Personalizado"]] as const).map(([p, l]) => (
            <button key={p} type="button" className={`fin-chip ${periodo === p ? "activo" : ""}`} onClick={() => ir({ periodo: p, desde: p === "personalizado" ? sumarMeses(ref, -5) : null })}>{l}</button>
          ))}
        </div>
        {periodo === "personalizado" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <input className="fin-input" type="month" value={desde} max={hasta} onChange={(e) => e.target.value && ir({ desde: e.target.value })} aria-label="Desde" />
            <span style={{ color: "var(--tx3)" }}>a</span>
            <input className="fin-input" type="month" value={hasta} min={desde} onChange={(e) => e.target.value && ir({ mes: e.target.value })} aria-label="Hasta" />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
            <button type="button" className="fin-icono-btn" aria-label="Período anterior" onClick={() => mover(-1)}>‹</button>
            <strong style={{ flex: 1, textAlign: "center" }}>{etiquetaPeriodo(periodo, desde, hastaPeriodo)}</strong>
            <button type="button" className="fin-icono-btn" aria-label="Período siguiente" onClick={() => mover(1)}>›</button>
          </div>
        )}
      </div>

      {error && !d && <div className="fin-vacio">No pudimos cargar las estadísticas. Revisá la conexión.</div>}
      {!d && !error && <div style={{ color: "var(--tx3)" }}>Cargando…</div>}

      {d && (
        <>
          {/* 1. KPIs */}
          <div className="fin-kpis">
            {([["Ingresos", d.kpis.ingresos, d.kpisPrevios.ingresos, true, "&tipo=ingreso"], ["Gastos", d.kpis.gastos, d.kpisPrevios.gastos, false, "&tipo=gasto"], ["Ahorro", d.kpis.ahorro, d.kpisPrevios.ahorro, true, "&tipo=ahorro"]] as [string, M, M, boolean, string][]).map(([l, a, p, bueno, q]) => (
              <Link key={l} href={mov(q)} className="fin-kpi">
                <div className="fin-kpi-label">{l}</div>
                <Montos ars={a.ars} usd={a.usd} tamano={15} />
                {/* La variación se mide en USD: en pesos la inflación la distorsiona */}
                <div><Delta actual={a.usd} previo={d.kpisPrevios.hayDatos ? p.usd : null} subirEsBueno={bueno} /></div>
              </Link>
            ))}
            <div className="fin-kpi">
              <div className="fin-kpi-label">Tasa de ahorro</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtPct(d.kpis.tasa)}</div>
              <Delta actual={d.kpis.tasa} previo={d.kpisPrevios.hayDatos ? d.kpisPrevios.tasa : null} subirEsBueno puntos />
            </div>
          </div>

          {/* 2. Resumen IA (spec §9) */}
          <Widget titulo="Resumen del período">
            <Vacio titulo="El resumen con IA llega pronto" texto="Lo principal, desvíos, gastos hormiga, suscripciones a revisar y una recomendación concreta, para este mismo período." />
          </Widget>

          {/* 3. Gastos por categoría */}
          <Widget titulo="Gastos por categoría">
            {d.categorias.length === 0 ? (
              <Vacio titulo="Todavía no hay gastos en este período" texto="Cuando cargues gastos vas a ver en qué se va la plata, de mayor a menor." accion={<Link href="/finanzas/cargar?modo=voz" className="fin-btn secundario">🎙 Cargar un gasto</Link>} />
            ) : (
              <ConTabla tabla={<TablaDatos columnas={["Categoría", "ARS", "USD"]} filas={d.categorias.map((c) => [`${c.icono ?? ""} ${c.nombre}`, fmtArs(c.total.ars), fmtUsd(c.total.usd)])} />}>
                <BarrasH
                  filas={d.categorias.map((c) => ({
                    clave: c.id ?? "sin", etiqueta: c.nombre, icono: c.icono, valor: c.total.ars ?? 0,
                    texto: fmtArs(c.total.ars), secundario: fmtUsd(c.total.usd),
                    href: mov(c.id ? `&categoria=${c.id}` : "&sinClasificar=1"),
                  }))}
                />
              </ConTabla>
            )}
          </Widget>

          {/* 4. Evolución mensual (en USD) */}
          <Widget titulo="Evolución mensual">
            {d.evolucion.every((e) => !e.ingresos.usd && !e.gastos.usd && !e.ahorro.usd) ? (
              <Vacio titulo="Sin datos todavía" texto="Mes a mes vas a ver cuánto entró, cuánto gastaste y cuánto ahorraste, en dólares para que la inflación no distorsione." />
            ) : (
              <ConTabla tabla={<TablaDatos columnas={["Mes", "Ingresos", "Gastos", "Ahorro"]} filas={d.evolucion.map((e) => [mesCorto(e.anioMes), fmtUsd(e.ingresos.usd), fmtUsd(e.gastos.usd), fmtUsd(e.ahorro.usd)])} />}>
                <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 6 }}>En dólares: en pesos la inflación distorsiona la comparación. Tocá un mes para ver sus movimientos.</div>
                <Columnas
                  etiquetas={d.evolucion.map((e) => mesCorto(e.anioMes))}
                  series={[
                    { nombre: "Ingresos", color: SERIE.ingresos, valores: d.evolucion.map((e) => e.ingresos.usd ?? 0) },
                    { nombre: "Gastos", color: SERIE.gastos, valores: d.evolucion.map((e) => e.gastos.usd ?? 0) },
                    { nombre: "Ahorro", color: SERIE.ahorro, valores: d.evolucion.map((e) => e.ahorro.usd ?? 0) },
                  ]}
                  formato={(n) => compacto(n, "US$ ")} formatoDetalle={fmtUsd}
                  detalle={(i) => [`En pesos: gastos ${fmtArs(d.evolucion[i].gastos.ars)}`]}
                  onTocar={(i) => router.push(`/finanzas/movimientos?mes=${d.evolucion[i].anioMes}`)}
                />
              </ConTabla>
            )}
          </Widget>

          {/* 5. Presupuesto vs. real */}
          <Widget titulo="Presupuesto vs. real">
            {d.presupuestoVsReal.length === 0 ? (
              <Vacio titulo="Sin presupuesto en este período" texto="Armá el presupuesto del mes para comparar lo previsto con lo real." accion={<Link href="/finanzas/presupuesto" className="fin-btn secundario">Ir al presupuesto</Link>} />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {d.presupuestoVsReal.map((c) => {
                  const pct = c.previsto.ars ? (c.real.ars ?? 0) / c.previsto.ars : 0;
                  return (
                    <Link key={c.id} href={mov(`&categoria=${c.id}`)} style={{ color: "inherit", textDecoration: "none", minHeight: 44, display: "block" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                        <span>{c.icono} {c.nombre}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtArs(c.real.ars)} <span style={{ color: "var(--tx3)" }}>/ {fmtArs(c.previsto.ars)}</span></span>
                      </div>
                      <div className="fin-barra" role="img" aria-label={`${c.nombre}: ${fmtPct(pct)} de lo previsto`}>
                        <div className="fin-barra-relleno" style={{ width: `${Math.min(100, pct * 100)}%`, background: SERIE.gastos }} />
                      </div>
                      <div style={{ fontSize: 11, color: pct > 1 ? "var(--amb-t)" : "var(--tx3)", marginTop: 2 }}>{fmtPct(pct)} de lo previsto{pct > 1 ? " · se pasó" : ""}</div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Widget>

          {/* 6. Fijo vs. variable · esencial vs. discrecional */}
          <Widget titulo="Cómo se reparte el gasto">
            {!(d.kpis.gastos.ars ?? 0) ? (
              <Vacio titulo="Sin gastos en este período" texto="Acá vas a ver qué parte es fija y qué parte podés mover." />
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                <BarraPartida partes={[
                  { nombre: "Fijo", valor: d.fijoVariable.fijo.ars ?? 0, color: CATEGORICO[0], texto: fmtArs(d.fijoVariable.fijo.ars) },
                  { nombre: "Variable", valor: d.fijoVariable.variable.ars ?? 0, color: CATEGORICO[1], texto: fmtArs(d.fijoVariable.variable.ars) },
                ]} />
                <BarraPartida partes={[
                  { nombre: "Esencial", valor: d.naturaleza.esencial.ars ?? 0, color: CATEGORICO[0], texto: fmtArs(d.naturaleza.esencial.ars) },
                  { nombre: "Discrecional", valor: d.naturaleza.discrecional.ars ?? 0, color: CATEGORICO[1], texto: fmtArs(d.naturaleza.discrecional.ars) },
                ]} />
              </div>
            )}
          </Widget>

          {/* 7. Deuda en cuotas */}
          <Widget titulo="Cuotas por pagar">
            {d.cuotas.calendario.length === 0 ? (
              <Vacio titulo="No tenés cuotas pendientes" texto="Cuando compres en cuotas vas a ver cuánto queda comprometido y en qué mes se libera." />
            ) : (
              <>
                <div style={{ marginBottom: 10 }}>
                  <div className="fin-kpi-label">Comprometido</div>
                  <Montos ars={d.cuotas.total.ars} usd={d.cuotas.total.usd} tamano={18} />
                  <div style={{ fontSize: 12, color: "var(--tx3)" }}>
                    {d.cuotas.planes === 1 ? "1 compra" : `${d.cuotas.planes} compras`} · se libera todo en {nombreMes(d.cuotas.calendario[d.cuotas.calendario.length - 1].anioMes)} {d.cuotas.calendario[d.cuotas.calendario.length - 1].anioMes.slice(0, 4)}
                  </div>
                </div>
                <ConTabla tabla={<TablaDatos columnas={["Mes", "ARS", "USD"]} filas={d.cuotas.calendario.map((c) => [mesCorto(c.anioMes), fmtArs(c.total.ars), fmtUsd(c.total.usd)])} />}>
                  <Columnas
                    etiquetas={d.cuotas.calendario.map((c) => mesCorto(c.anioMes))}
                    series={[{ nombre: "Cuotas", color: SERIE.gastos, valores: d.cuotas.calendario.map((c) => c.total.ars ?? 0) }]}
                    formato={(n) => compacto(n, "$ ")} formatoDetalle={fmtArs}
                    alto={160}
                  />
                </ConTabla>
              </>
            )}
          </Widget>

          {/* 8. Metas */}
          <Widget titulo="Metas" accion={<Link href="/finanzas/metas" className="fin-link">Ver metas</Link>}>
            {d.metas.length === 0 ? (
              <Vacio titulo="Todavía no tenés metas" texto="Una buena primera meta es un fondo de emergencia: entre 3 y 6 meses de tus gastos esenciales." accion={<Link href="/finanzas/metas?nueva=fondo_emergencia" className="fin-btn secundario">🛟 Crearlo</Link>} />
            ) : (
              <>
                <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                  {d.metas.map((m) => (
                    <Link key={m.id} href={`/finanzas/metas?id=${m.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                        <span>{m.icono} {m.nombre}</span>
                        <span>{m.moneda === "USD" ? fmtUsd(m.aportadoMoneda) : fmtArs(m.aportadoMoneda)}{m.objetivo ? <span style={{ color: "var(--tx3)" }}> / {m.moneda === "USD" ? fmtUsd(m.objetivo) : fmtArs(m.objetivo)}</span> : null}</span>
                      </div>
                      <div className="fin-barra"><div className="fin-barra-relleno" style={{ width: `${(m.progreso ?? 0) * 100}%`, background: SERIE.ahorro }} /></div>
                    </Link>
                  ))}
                </div>
                {metasConAporte.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: "var(--tx2)", marginBottom: 6 }}>Aportes por mes (en dólares)</div>
                    <Columnas
                      apilado
                      etiquetas={metasConAporte[0].porMes.map((x) => mesCorto(x.anioMes))}
                      series={metasConAporte.slice(0, 8).map((m, i) => ({ nombre: m.nombre, color: CATEGORICO[i], valores: m.porMes.map((x) => Math.max(0, x.usd)) }))}
                      formato={(n) => compacto(n, "US$ ")} formatoDetalle={fmtUsd}
                      alto={170}
                    />
                  </>
                )}
              </>
            )}
          </Widget>

          {/* 9. Fondo de emergencia */}
          {fondo && (
            <Widget titulo="Fondo de emergencia">
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 28, fontWeight: 700 }}>{fondo.mesesCubiertos == null ? "—" : fondo.mesesCubiertos.toLocaleString("es-AR", { maximumFractionDigits: 1 })}</span>
                <span style={{ color: "var(--tx2)" }}>de {fondo.mesesCobertura} meses cubiertos</span>
              </div>
              <div className="fin-casilleros" role="img" aria-label={`${fondo.mesesCubiertos?.toFixed(1) ?? 0} de ${fondo.mesesCobertura} meses cubiertos`}>
                {Array.from({ length: fondo.mesesCobertura ?? 6 }, (_, i) => <div key={i} className={`fin-casillero ${(fondo.mesesCubiertos ?? 0) >= i + 1 ? "lleno" : ""}`} />)}
              </div>
              <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 8 }}>
                {fondo.gastoEsencialMensual
                  ? `Tus gastos esenciales promedian ${fmtUsd(fondo.gastoEsencialMensual)} por mes (últimos 3 meses cerrados).`
                  : "El objetivo se calcula con tus gastos esenciales de los últimos meses cerrados: aparece al cerrar tu primer mes."}
              </div>
              {fondo.porMes.some((x) => x.monto > 0) && (
                <div style={{ marginTop: 10 }}>
                  <Columnas etiquetas={fondo.porMes.map((x) => mesCorto(x.anioMes))} series={[{ nombre: "Aportes", color: SERIE.ahorro, valores: fondo.porMes.map((x) => Math.max(0, x.monto)) }]} formato={(n) => compacto(n, fondo.moneda === "USD" ? "US$ " : "$ ")} formatoDetalle={(n) => (fondo.moneda === "USD" ? fmtUsd(n) : fmtArs(n))} alto={150} />
                </div>
              )}
            </Widget>
          )}

          {/* 10. Patrimonio */}
          <Widget titulo="Patrimonio" accion={<Link href="/finanzas/patrimonio" className="fin-link">Ver cuentas</Link>}>
            {d.patrimonio.meses.length === 0 ? (
              <Vacio titulo="Todavía no cargaste tus cuentas" texto="Anotá cuánto tenés en cada cuenta al cerrar el mes y vas a ver cómo crece tu patrimonio." accion={<Link href="/finanzas/patrimonio?nueva=1" className="fin-btn secundario">Agregar cuentas</Link>} />
            ) : (
              <ConTabla tabla={<TablaDatos columnas={["Mes", "USD", "ARS"]} filas={d.patrimonio.meses.map((m) => [mesCorto(m.anioMes), fmtUsd(m.total.usd), fmtArs(m.total.ars)])} />}>
                <div style={{ marginBottom: 8 }}>
                  <Montos ars={d.patrimonio.meses[d.patrimonio.meses.length - 1].total.ars} usd={d.patrimonio.meses[d.patrimonio.meses.length - 1].total.usd} original="USD" tamano={18} />
                </div>
                <Linea
                  etiquetas={d.patrimonio.meses.map((m) => mesCorto(m.anioMes))}
                  valores={d.patrimonio.meses.map((m) => m.total.usd ?? 0)}
                  formato={(n) => compacto(n, "US$ ")} formatoDetalle={fmtUsd}
                  detalle={(i) => [`En pesos: ${fmtArs(d.patrimonio.meses[i].total.ars)}`]}
                />
              </ConTabla>
            )}
          </Widget>
        </>
      )}
    </>
  );
}

export default function PaginaEstadisticas() {
  return (
    <Suspense fallback={<div style={{ color: "var(--tx3)" }}>Cargando…</div>}>
      <Estadisticas />
    </Suspense>
  );
}
