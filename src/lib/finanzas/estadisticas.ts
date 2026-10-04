// Estadísticas (spec §10): todo para un período de meses de imputación [desde, hasta].
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sumarMontos, type Montos } from "./dinero";
import { anioMesActual, sumarMeses } from "./fechas";
import { listarMetas } from "./metas";
import { evolucionPatrimonio } from "./patrimonio";

const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : d.toNumber());

export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let am = desde; am <= hasta && out.length < 120; am = sumarMeses(am, 1)) out.push(am);
  return out;
}

async function registrosDe(desde: string, hasta: string) {
  return prisma.finRegistro.findMany({
    where: { mes: { anioMes: { gte: desde, lte: hasta } } },
    select: {
      tipo: true, categoriaId: true, montoArs: true, montoUsd: true, fijoVariable: true, naturaleza: true,
      mes: { select: { anioMes: true } },
      categoria: { select: { nombre: true, icono: true, fijoVariableDefault: true, naturalezaDefault: true } },
    },
  });
}

type Reg = Awaited<ReturnType<typeof registrosDe>>[number];
const m = (r: { montoArs: Prisma.Decimal | null; montoUsd: Prisma.Decimal | null }): Montos => ({ ars: num(r.montoArs), usd: num(r.montoUsd) });

function kpis(regs: Reg[]) {
  const t = (tipo: string) => sumarMontos(regs.filter((r) => r.tipo === tipo).map(m));
  const ingresos = t("ingreso"), gastos = t("gasto"), ahorro = t("ahorro");
  const tasa = ingresos.ars ? (ahorro.ars ?? 0) / ingresos.ars : ingresos.usd ? (ahorro.usd ?? 0) / ingresos.usd : null;
  return { ingresos, gastos, ahorro, tasa };
}

export async function datosEstadisticas(desde: string, hasta: string) {
  const meses = mesesEntre(desde, hasta);
  const largo = meses.length;
  const prevHasta = sumarMeses(desde, -1);
  const prevDesde = sumarMeses(desde, -largo);
  // La evolución muestra al menos 6 meses aunque el período sea uno solo
  const evolDesde = largo >= 6 ? desde : sumarMeses(hasta, -5);

  const [regs, regsPrev, regsEvol, items, cuotasFuturas, metas, patrimonio] = await Promise.all([
    registrosDe(desde, hasta),
    registrosDe(prevDesde, prevHasta),
    registrosDe(evolDesde, hasta),
    prisma.finPresupuestoItem.findMany({
      where: { activo: true, mes: { anioMes: { gte: desde, lte: hasta } }, categoria: { tipo: "gasto" } },
      select: { categoriaId: true, montoOriginal: true, montoPrevistoMensual: true, montoArs: true, montoUsd: true, categoria: { select: { nombre: true, icono: true } } },
    }),
    // Deuda en cuotas comprometida: cuotas de meses futuros que todavía no se pagaron
    prisma.finPresupuestoItem.findMany({
      where: { origen: "cuotas", activo: true, registros: { none: {} }, mes: { anioMes: { gt: anioMesActual() } } },
      select: { montoArs: true, montoUsd: true, mes: { select: { anioMes: true } }, planCuotas: { select: { descripcion: true } } },
    }),
    listarMetas(Math.max(largo, 6)),
    evolucionPatrimonio(hasta, Math.max(largo, 12)),
  ]);

  const gastos = regs.filter((r) => r.tipo === "gasto");

  // Gastos por categoría, de mayor a menor
  const porCat = new Map<string, { id: string | null; nombre: string; icono: string | null; montos: Montos[] }>();
  for (const r of gastos) {
    const k = r.categoriaId ?? "sin";
    const e = porCat.get(k) ?? { id: r.categoriaId, nombre: r.categoria?.nombre ?? "Sin clasificar", icono: r.categoria?.icono ?? "❔", montos: [] };
    e.montos.push(m(r));
    porCat.set(k, e);
  }
  const categorias = Array.from(porCat.values())
    .map((c) => ({ id: c.id, nombre: c.nombre, icono: c.icono, total: sumarMontos(c.montos) }))
    .sort((a, b) => (b.total.ars ?? 0) - (a.total.ars ?? 0));

  // Evolución mensual (USD como medida principal: en pesos la inflación distorsiona, spec §9)
  const evolucionCompleta = mesesEntre(evolDesde, hasta).map((am) => {
    const del = regsEvol.filter((r) => r.mes.anioMes === am);
    const k = kpis(del);
    return { anioMes: am, ingresos: k.ingresos, gastos: k.gastos, ahorro: k.ahorro };
  });
  // Sin meses vacíos al principio (antes de empezar a usar el módulo)
  const primero = evolucionCompleta.findIndex((e) => e.ingresos.usd || e.gastos.usd || e.ahorro.usd || e.ingresos.ars || e.gastos.ars);
  const evolucion = primero > 0 ? evolucionCompleta.slice(primero) : evolucionCompleta;

  // Presupuesto vs. real por categoría (prorrateo mensual de los ítems)
  const prevCat = new Map<string, { nombre: string; icono: string | null; previsto: Montos[] }>();
  for (const i of items) {
    const orig = i.montoOriginal.toNumber();
    const f = i.montoPrevistoMensual && orig ? i.montoPrevistoMensual.toNumber() / orig : 1;
    const e = prevCat.get(i.categoriaId) ?? { nombre: i.categoria.nombre, icono: i.categoria.icono, previsto: [] };
    e.previsto.push({ ars: i.montoArs == null ? null : i.montoArs.toNumber() * f, usd: i.montoUsd == null ? null : i.montoUsd.toNumber() * f });
    prevCat.set(i.categoriaId, e);
  }
  const presupuestoVsReal = Array.from(prevCat.entries())
    .map(([id, e]) => ({ id, nombre: e.nombre, icono: e.icono, previsto: sumarMontos(e.previsto), real: categorias.find((c) => c.id === id)?.total ?? { ars: 0, usd: 0 } }))
    .sort((a, b) => (b.previsto.ars ?? 0) - (a.previsto.ars ?? 0));

  // Fijo vs. variable y esencial vs. discrecional
  const parte = (fn: (r: Reg) => boolean) => sumarMontos(gastos.filter(fn).map(m));
  const fv = (r: Reg) => r.fijoVariable ?? r.categoria?.fijoVariableDefault ?? "variable";
  const nat = (r: Reg) => r.naturaleza ?? r.categoria?.naturalezaDefault ?? "discrecional";

  // Calendario de liberación de cuotas
  const porMesCuotas = new Map<string, Montos[]>();
  for (const c of cuotasFuturas) porMesCuotas.set(c.mes.anioMes, [...(porMesCuotas.get(c.mes.anioMes) ?? []), m(c)]);
  const calendarioCuotas = Array.from(porMesCuotas.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([anioMes, ms]) => ({ anioMes, total: sumarMontos(ms) }));

  return {
    desde, hasta, meses,
    kpis: kpis(regs),
    kpisPrevios: { ...kpis(regsPrev), desde: prevDesde, hasta: prevHasta, hayDatos: regsPrev.length > 0 },
    categorias,
    evolucion,
    presupuestoVsReal,
    fijoVariable: { fijo: parte((r) => fv(r) === "fijo"), variable: parte((r) => fv(r) === "variable") },
    naturaleza: { esencial: parte((r) => nat(r) === "esencial"), discrecional: parte((r) => nat(r) === "discrecional") },
    cuotas: { total: sumarMontos(cuotasFuturas.map(m)), calendario: calendarioCuotas, planes: new Set(cuotasFuturas.map((c) => c.planCuotas?.descripcion)).size },
    metas,
    patrimonio,
  };
}

export type DatosEstadisticas = Awaited<ReturnType<typeof datosEstadisticas>>;
