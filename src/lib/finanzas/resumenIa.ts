// Resumen con IA (spec §9): métricas agregadas de un período → tarjetas breves en rioplatense.
// Se genera al cerrar el mes y a pedido desde Estadísticas; queda cacheado por período en fin_resumenes_ia.
import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizar } from "./carga";
import { fmtArs, fmtPct, fmtUsd, sumarMontos, type Montos } from "./dinero";
import { datosEstadisticas, mesesEntre } from "./estadisticas";
import { fechaDB, sumarMeses } from "./fechas";
import { tcVigente } from "./meses";

const client = new Anthropic();
const MODELO = "claude-opus-5-5";

export class ErrorResumen extends Error {}

export function resumenDisponible() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : d.toNumber());
const dos = (m: Montos) => `${fmtArs(m.ars)} | ${fmtUsd(m.usd)}`;

// ─── Métricas de entrada ────────────────────────────────────────

// Gastos discrecionales chicos y frecuentes: agrupa por descripción (o categoría si no hay)
// y se queda con los grupos de montos bajos que se repiten.
function gastosHormiga(regs: { descripcion: string | null; montoArs: Prisma.Decimal | null; montoUsd: Prisma.Decimal | null; naturaleza: string | null; categoria: { nombre: string; naturalezaDefault: string } | null }[], meses: number) {
  const disc = regs.filter((r) => (r.naturaleza ?? r.categoria?.naturalezaDefault ?? "discrecional") === "discrecional" && num(r.montoArs) != null);
  if (disc.length < 4) return [];
  const montos = disc.map((r) => num(r.montoArs)!).sort((a, b) => a - b);
  const umbral = montos[Math.floor(montos.length / 2)]; // mediana de los gastos discrecionales
  const grupos = new Map<string, { nombre: string; categoria: string | null; montos: Montos[] }>();
  for (const r of disc) {
    if (num(r.montoArs)! > umbral) continue;
    const nombre = r.descripcion?.trim() || r.categoria?.nombre || "Sin descripción";
    const k = normalizar(nombre);
    const g = grupos.get(k) ?? { nombre, categoria: r.categoria?.nombre ?? null, montos: [] };
    g.montos.push({ ars: num(r.montoArs), usd: num(r.montoUsd) });
    grupos.set(k, g);
  }
  return Array.from(grupos.values())
    .filter((g) => g.montos.length >= Math.max(4, 2 * meses))
    .map((g) => ({ ...g, total: sumarMontos(g.montos) }))
    .sort((a, b) => (b.total.ars ?? 0) - (a.total.ars ?? 0))
    .slice(0, 5)
    .map((g) => ({ descripcion: g.nombre, categoria: g.categoria, veces: g.montos.length, total: dos(g.total), promedio_ars: fmtArs((g.total.ars ?? 0) / g.montos.length) }));
}

// Recurrentes sin cambios: mismo concepto y mismo monto en ≥ 3 meses distintos de los últimos 6
// (con presencia en el último mes del período).
async function recurrentesEstables(hasta: string) {
  const desde = sumarMeses(hasta, -5);
  const regs = await prisma.finRegistro.findMany({
    where: { tipo: "gasto", mes: { anioMes: { gte: desde, lte: hasta } }, descripcion: { not: null } },
    select: { descripcion: true, montoOriginal: true, monedaOriginal: true, montoArs: true, montoUsd: true, mes: { select: { anioMes: true } }, categoria: { select: { nombre: true } } },
  });
  const grupos = new Map<string, { descripcion: string; categoria: string | null; monto: number; moneda: string; meses: Set<string>; ultimo: Montos }>();
  for (const r of regs) {
    const k = `${normalizar(r.descripcion)}|${r.monedaOriginal}|${r.montoOriginal.toString()}`;
    const g = grupos.get(k) ?? { descripcion: r.descripcion!, categoria: r.categoria?.nombre ?? null, monto: r.montoOriginal.toNumber(), moneda: r.monedaOriginal, meses: new Set<string>(), ultimo: { ars: null, usd: null } };
    g.meses.add(r.mes.anioMes);
    g.ultimo = { ars: num(r.montoArs), usd: num(r.montoUsd) };
    grupos.set(k, g);
  }
  return Array.from(grupos.values())
    .filter((g) => g.meses.size >= 3 && g.meses.has(hasta))
    .sort((a, b) => (b.ultimo.ars ?? 0) - (a.ultimo.ars ?? 0))
    .slice(0, 8)
    .map((g) => ({ descripcion: g.descripcion, categoria: g.categoria, monto_mensual: g.moneda === "USD" ? fmtUsd(g.monto) : fmtArs(g.monto), equivalente: dos(g.ultimo), meses_igual: g.meses.size }));
}

export async function metricasResumen(desde: string, hasta: string) {
  const [e, regs, recurrentes, sinClasificar, tc] = await Promise.all([
    datosEstadisticas(desde, hasta),
    prisma.finRegistro.findMany({
      where: { tipo: "gasto", mes: { anioMes: { gte: desde, lte: hasta } } },
      select: { descripcion: true, montoArs: true, montoUsd: true, naturaleza: true, categoria: { select: { nombre: true, naturalezaDefault: true } } },
    }),
    recurrentesEstables(hasta),
    prisma.finRegistro.count({ where: { tipo: "gasto", categoriaId: null, mes: { anioMes: { gte: desde, lte: hasta } } } }),
    tcVigente(hasta),
  ]);
  const pat = e.patrimonio.meses;
  const patIni = pat.find((x) => x.anioMes >= desde) ?? null;
  const patFin = pat.length ? pat[pat.length - 1] : null;
  const k = e.kpis, p = e.kpisPrevios;

  return {
    periodo: { desde, hasta, meses: e.meses.length },
    tipo_cambio: tc,
    kpis: {
      ingresos: dos(k.ingresos), gastos: dos(k.gastos), ahorro: dos(k.ahorro), tasa_ahorro: fmtPct(k.tasa),
      periodo_anterior: p.hayDatos ? { desde: p.desde, hasta: p.hasta, ingresos: dos(p.ingresos), gastos: dos(p.gastos), ahorro: dos(p.ahorro), tasa_ahorro: fmtPct(p.tasa) } : null,
    },
    gastos_por_categoria: e.categorias.slice(0, 10).map((c) => ({ id: c.id, categoria: c.nombre, total: dos(c.total), pct_del_gasto: fmtPct(k.gastos.ars ? (c.total.ars ?? 0) / k.gastos.ars : null) })),
    presupuesto_vs_real: e.presupuestoVsReal.map((c) => ({
      id: c.id, categoria: c.nombre, previsto: dos(c.previsto), real: dos(c.real),
      desvio_pct: c.previsto.ars ? fmtPct(((c.real.ars ?? 0) - c.previsto.ars) / c.previsto.ars) : null,
    })),
    evolucion_mensual_usd: e.evolucion.map((x) => ({ mes: x.anioMes, ingresos: fmtUsd(x.ingresos.usd), gastos: fmtUsd(x.gastos.usd), ahorro: fmtUsd(x.ahorro.usd), gastos_ars: fmtArs(x.gastos.ars) })),
    fijo_vs_variable: { fijo: dos(e.fijoVariable.fijo), variable: dos(e.fijoVariable.variable) },
    esencial_vs_discrecional: { esencial: dos(e.naturaleza.esencial), discrecional: dos(e.naturaleza.discrecional) },
    gastos_hormiga: gastosHormiga(regs, e.meses.length),
    recurrentes_sin_cambios: recurrentes,
    metas: e.metas.map((m) => ({
      nombre: m.nombre, tipo: m.tipo, moneda: m.moneda,
      aportado: m.moneda === "USD" ? fmtUsd(m.aportadoMoneda) : fmtArs(m.aportadoMoneda),
      objetivo: m.objetivo == null ? null : m.moneda === "USD" ? fmtUsd(m.objetivo) : fmtArs(m.objetivo),
      progreso: fmtPct(m.progreso),
      aportado_en_el_periodo: (() => { const t = m.porMes.filter((x) => x.anioMes >= desde && x.anioMes <= hasta).reduce((s, x) => s + x.monto, 0); return m.moneda === "USD" ? fmtUsd(t) : fmtArs(t); })(),
      ...(m.tipo === "fondo_emergencia" ? { meses_cubiertos: m.mesesCubiertos == null ? null : Math.round(m.mesesCubiertos * 10) / 10, meses_objetivo: m.mesesCobertura } : {}),
      llega_en: m.llegaEn,
    })),
    patrimonio: patFin ? { al_cierre: dos(patFin.total), mes: patFin.anioMes, al_inicio: patIni && patIni !== patFin ? dos(patIni.total) : null } : null,
    deuda_en_cuotas: e.cuotas.total.ars || e.cuotas.total.usd ? { total: dos(e.cuotas.total), planes: e.cuotas.planes, proximos_meses: e.cuotas.calendario.slice(0, 6).map((c) => ({ mes: c.anioMes, total: dos(c.total) })) } : null,
    gastos_sin_clasificar: sinClasificar,
    hay_datos: e.categorias.length > 0 || !!k.ingresos.ars || !!k.ingresos.usd || !!k.ahorro.ars,
  };
}

// ─── Llamada al modelo ──────────────────────────────────────────

export const ACCIONES = ["revisar_suscripciones", "ver_categoria", "ajustar_presupuesto", "aportar_meta", "clasificar", "ninguna"] as const;
export type AccionResumen = (typeof ACCIONES)[number];

export type Tarjetas = {
  principal: string;
  desvios: string[];
  hormiga: string[];
  suscripciones: string[];
  metas: string[];
  recomendacion: { texto: string; accion: AccionResumen; categoria_id: string | null };
};

const SISTEMA = `Sos el asistente financiero personal de un usuario argentino. Recibís métricas agregadas
de un período (JSON) y devolvés un resumen corto en español rioplatense (voseo), directo y amable,
sin sermones ni moralina, sin frases genéricas tipo "es importante ahorrar".

Reglas:
- Usá solo los datos del JSON. No inventes cifras ni causas. Copiá los montos tal como vienen
  formateados ("$ 180.000", "US$ 120"). No hace falta poner siempre las dos monedas.
- Para comparar entre meses usá dólares: en pesos la inflación distorsiona.
- principal: 2 o 3 oraciones con lo más importante del período. Siempre incluí la tasa de ahorro
  (y si hay período anterior, cómo cambió).
- desvios: categorías donde lo real se apartó del presupuesto de forma relevante (más de ~15% o un
  monto que importe), primero los excesos. Una línea cada uno. Vacío si no hay presupuesto o no hay desvíos.
- hormiga: a partir de gastos_hormiga, los que sumen algo que valga la pena mirar ("12 cafés: $ 54.000").
  Vacío si no hay.
- suscripciones: de recurrentes_sin_cambios, los que parezcan suscripciones o servicios que conviene
  validar si se siguen usando (no alquiler, expensas ni impuestos). Vacío si no hay.
- metas: progreso de cada meta y meses cubiertos del fondo de emergencia. Vacío si no hay metas.
- recomendacion: UNA sola acción concreta y realizable este mes, la de más impacto. accion indica
  el botón que la acompaña: revisar_suscripciones, ver_categoria (con categoria_id del JSON),
  ajustar_presupuesto, aportar_meta, clasificar (si hay muchos gastos sin clasificar) o ninguna.
- Cada línea, máximo ~140 caracteres. Máximo 4 líneas por lista.`;

const LISTA = { type: "array", items: { type: "string" } };
const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["principal", "desvios", "hormiga", "suscripciones", "metas", "recomendacion"],
  properties: {
    principal: { type: "string" },
    desvios: LISTA,
    hormiga: LISTA,
    suscripciones: LISTA,
    metas: LISTA,
    recomendacion: {
      type: "object",
      additionalProperties: false,
      required: ["texto", "accion", "categoria_id"],
      properties: {
        texto: { type: "string" },
        accion: { type: "string", enum: [...ACCIONES] },
        categoria_id: { type: ["string", "null"] },
      },
    },
  },
};

async function pedirResumen(metricas: object): Promise<Tarjetas> {
  // Fallbacks del lado del servidor (ver parser.ts): el SDK instalado todavía no tipa `fallbacks`.
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming & { fallbacks: "default" } = {
    model: MODELO,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
    system: SISTEMA,
    messages: [{ role: "user", content: JSON.stringify(metricas) }],
  };
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create(params);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new ErrorResumen("Hay mucha demanda en este momento. Probá de nuevo en un ratito.");
    if (e instanceof Anthropic.APIError) throw new ErrorResumen(`No pude armar el resumen (error ${e.status ?? "de conexión"}).`);
    throw e;
  }
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new ErrorResumen("No pude armar el resumen. Probá de nuevo.");
  const raw = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    const t = JSON.parse(raw) as Tarjetas;
    const l = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, 4) : []);
    const acc = ACCIONES.includes(t.recomendacion?.accion) ? t.recomendacion.accion : "ninguna";
    return {
      principal: String(t.principal ?? ""),
      desvios: l(t.desvios), hormiga: l(t.hormiga), suscripciones: l(t.suscripciones), metas: l(t.metas),
      recomendacion: { texto: String(t.recomendacion?.texto ?? ""), accion: acc, categoria_id: t.recomendacion?.categoria_id ?? null },
    };
  } catch {
    throw new ErrorResumen("No pude armar el resumen. Probá de nuevo.");
  }
}

// ─── Cache por período ──────────────────────────────────────────

// Huella de los datos del período: si cambia (alta, edición o baja de registros o ítems), el resumen
// guardado queda desactualizado. Evita tener que marcarlo desde cada lugar que escribe registros.
async function huella(desde: string, hasta: string) {
  const where = { mes: { anioMes: { gte: desde, lte: hasta } } };
  const [r, i, m] = await Promise.all([
    prisma.finRegistro.aggregate({ where, _count: true, _max: { updatedAt: true } }),
    prisma.finPresupuestoItem.aggregate({ where, _count: true, _max: { updatedAt: true } }),
    // El cambio de tipo de cambio recalcula equivalentes por SQL (sin tocar updated_at de los registros)
    prisma.finMes.findMany({ where: { anioMes: { gte: desde, lte: hasta } }, select: { tipoCambio: true }, orderBy: { anioMes: "asc" } }),
  ]);
  const tcs = m.map((x) => x.tipoCambio?.toString() ?? "-").join(",");
  return `${r._count}:${r._max.updatedAt?.getTime() ?? 0}:${i._count}:${i._max.updatedAt?.getTime() ?? 0}:${tcs}`;
}

const periodoWhere = (desde: string, hasta: string) => ({ periodoDesde_periodoHasta: { periodoDesde: fechaDB(`${desde}-01`), periodoHasta: fechaDB(`${hasta}-01`) } });

export type ResumenGuardado = { tarjetas: Tarjetas; generadoAt: string; desactualizado: boolean; desde: string; hasta: string };

export async function obtenerResumen(desde: string, hasta: string): Promise<ResumenGuardado | null> {
  const r = await prisma.finResumenIa.findUnique({ where: periodoWhere(desde, hasta) });
  if (!r) return null;
  let desactualizado = r.desactualizado;
  if (!desactualizado) {
    const guardada = (r.metricasInput as { huella?: string } | null)?.huella;
    if (guardada !== (await huella(desde, hasta))) {
      desactualizado = true;
      await prisma.finResumenIa.update({ where: { id: r.id }, data: { desactualizado: true } });
    }
  }
  let tarjetas: Tarjetas;
  try {
    tarjetas = JSON.parse(r.contenido);
  } catch {
    return null;
  }
  return { tarjetas, generadoAt: r.generadoAt.toISOString(), desactualizado, desde, hasta };
}

export async function generarResumen(desde: string, hasta: string): Promise<ResumenGuardado> {
  if (!resumenDisponible()) throw new ErrorResumen("Falta configurar la clave de Anthropic para generar el resumen.");
  if (mesesEntre(desde, hasta).length > 36) throw new ErrorResumen("Elegí un período de hasta 3 años.");
  const [metricas, h] = await Promise.all([metricasResumen(desde, hasta), huella(desde, hasta)]);
  if (!metricas.hay_datos) throw new ErrorResumen("Todavía no hay movimientos en este período.");
  const tarjetas = await pedirResumen(metricas);
  const data = { contenido: JSON.stringify(tarjetas), metricasInput: { huella: h, metricas } as Prisma.InputJsonValue, generadoAt: new Date(), desactualizado: false };
  const w = periodoWhere(desde, hasta);
  const r = await prisma.finResumenIa.upsert({ where: w, update: data, create: { ...w.periodoDesde_periodoHasta, ...data } });
  return { tarjetas, generadoAt: r.generadoAt.toISOString(), desactualizado: false, desde, hasta };
}
