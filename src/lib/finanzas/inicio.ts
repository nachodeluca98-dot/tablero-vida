// Datos de la pantalla Inicio (spec §5.2): "Tu próximo paso" + cómo voy en el mes.
import { prisma } from "@/lib/prisma";
import { Montos, sumarMontos } from "./dinero";
import { anioMesActual, diaReal, diasDelMes, hoyISO, isoDeFechaDB, fechaDB, nombreMes, sumarMeses } from "./fechas";
import { obtenerMes, ultimoTipoCambio } from "./meses";

const num = (d: { toNumber(): number } | null | undefined) => (d == null ? null : d.toNumber());

export type ProximoPaso =
  | { tipo: "onboarding"; retomar: boolean }
  | { tipo: "revision"; revision: "quincenal" | "cierre"; anioMes: string; retomar: boolean; ruta: string }
  | { tipo: "tipo_cambio"; anioMes: string; sugerido: number | null; fuenteSugerida: string | null }
  | { tipo: "clasificar"; cantidad: number }
  | { tipo: "al_dia"; proximaRevision: string | null };

// ─── Revisiones ─────────────────────────────────────────────────

type RevisionDebida = { revision: "quincenal" | "cierre"; anioMes: string; retomar: boolean };

async function revisionDebida(anioMes: string, hoy: string, diasRevision: number[]): Promise<RevisionDebida | null> {
  // Una revisión empezada siempre se ofrece para retomar
  const enCurso = await prisma.finRevision.findFirst({ where: { estado: "en_curso" }, orderBy: { fecha: "desc" } });
  if (enCurso && enCurso.tipo !== "apertura") {
    return { revision: enCurso.tipo, anioMes: isoDeFechaDB(enCurso.fecha).slice(0, 7), retomar: true };
  }

  // Mes anterior sin cerrar (con datos): el cierre queda pendiente hasta que se haga
  const anterior = await prisma.finMes.findUnique({
    where: { anioMes: sumarMeses(anioMes, -1) },
    include: { _count: { select: { registros: true, items: true } } },
  });
  if (anterior && anterior.estado === "abierto" && anterior._count.registros + anterior._count.items > 0) {
    return { revision: "cierre", anioMes: anterior.anioMes, retomar: false };
  }

  // Revisiones del mes en curso cuyo día ya llegó
  const diaHoy = Number(hoy.slice(8, 10));
  const hechas = await prisma.finRevision.findMany({
    where: {
      fecha: { gte: fechaDB(`${anioMes}-01`), lte: fechaDB(`${anioMes}-${diasDelMes(anioMes)}`) },
      estado: { in: ["completa", "salteada"] },
    },
    select: { tipo: true, fecha: true },
  });
  const debidas = Array.from(new Set(diasRevision.map((d) => diaReal(anioMes, d)))).sort((a, b) => b - a);
  for (const dia of debidas) {
    if (dia > diaHoy) continue;
    const revision = dia === diasDelMes(anioMes) ? "cierre" : "quincenal";
    const fechaDia = `${anioMes}-${String(dia).padStart(2, "0")}`;
    const hecha = hechas.some((h) => h.tipo === revision && isoDeFechaDB(h.fecha) >= fechaDia);
    if (!hecha) return { revision, anioMes, retomar: false };
    return null; // la más reciente ya está hecha: las anteriores no se reclaman
  }
  return null;
}

function proximaRevision(anioMes: string, hoy: string, diasRevision: number[]): string | null {
  if (!diasRevision.length) return null;
  const diaHoy = Number(hoy.slice(8, 10));
  for (const am of [anioMes, sumarMeses(anioMes, 1)]) {
    const dias = Array.from(new Set(diasRevision.map((d) => diaReal(am, d)))).sort((a, b) => a - b);
    const prox = dias.find((d) => am !== anioMes || d > diaHoy);
    if (prox) return `${am}-${String(prox).padStart(2, "0")}`;
  }
  return null;
}

export function rutaRevision(revision: "quincenal" | "cierre", anioMes: string) {
  return `/finanzas/revision?tipo=${revision}&mes=${anioMes}`;
}

// ─── Próximo paso ───────────────────────────────────────────────

async function calcularProximoPaso(anioMes: string, hoy: string): Promise<ProximoPaso> {
  const prefs = await prisma.finPreferencias.upsert({ where: { id: "user" }, update: {}, create: { id: "user" } });

  if (prefs.onboardingPaso !== -1) return { tipo: "onboarding", retomar: prefs.onboardingPaso > 0 };

  const rev = await revisionDebida(anioMes, hoy, prefs.diasRevision);
  if (rev) return { tipo: "revision", ...rev, ruta: rutaRevision(rev.revision, rev.anioMes) };

  const mes = await obtenerMes(anioMes);
  if (mes.tipoCambio == null) {
    const ultimo = await ultimoTipoCambio(anioMes);
    return { tipo: "tipo_cambio", anioMes, sugerido: num(ultimo?.tipoCambio), fuenteSugerida: ultimo?.fuenteTc ?? null };
  }

  const sinClasificar = await prisma.finRegistro.count({ where: { categoriaId: null } });
  if (sinClasificar > 0) return { tipo: "clasificar", cantidad: sinClasificar };

  // 4. Guía contextual sugerida: la agrega el motor de guías (spec §15, paso 12)

  return { tipo: "al_dia", proximaRevision: proximaRevision(anioMes, hoy, prefs.diasRevision) };
}

// ─── Resumen del mes ────────────────────────────────────────────

const montos = (r: { montoArs: { toNumber(): number } | null; montoUsd: { toNumber(): number } | null }): Montos => ({
  ars: num(r.montoArs),
  usd: num(r.montoUsd),
});

// Monto mensual de un ítem: si la frecuencia no es mensual, se prorratea (spec §2.1.3)
function montosItemMensual(i: {
  montoOriginal: { toNumber(): number };
  montoPrevistoMensual: { toNumber(): number } | null;
  montoArs: { toNumber(): number } | null;
  montoUsd: { toNumber(): number } | null;
}): Montos {
  const orig = i.montoOriginal.toNumber();
  const factor = i.montoPrevistoMensual && orig ? i.montoPrevistoMensual.toNumber() / orig : 1;
  const m = montos(i);
  return { ars: m.ars == null ? null : m.ars * factor, usd: m.usd == null ? null : m.usd * factor };
}

function tasa(ahorro: Montos, ingresos: Montos): number | null {
  if (ingresos.ars) return (ahorro.ars ?? 0) / ingresos.ars;
  if (ingresos.usd) return (ahorro.usd ?? 0) / ingresos.usd;
  return null;
}

async function resumenMes(mesId: string, anioMes: string, hoy: string) {
  const [registros, items] = await Promise.all([
    prisma.finRegistro.findMany({ where: { mesId }, select: { tipo: true, categoriaId: true, montoArs: true, montoUsd: true } }),
    prisma.finPresupuestoItem.findMany({
      where: { mesId, activo: true },
      select: {
        categoriaId: true, montoOriginal: true, montoPrevistoMensual: true, montoArs: true, montoUsd: true,
        categoria: { select: { tipo: true } },
      },
    }),
  ]);

  const porTipo = (t: string) => sumarMontos(registros.filter((r) => r.tipo === t).map(montos));
  const ingresos = porTipo("ingreso");
  const gastos = porTipo("gasto");
  const ahorro = porTipo("ahorro");
  const saldoLibre: Montos = {
    ars: (ingresos.ars ?? 0) - (gastos.ars ?? 0) - (ahorro.ars ?? 0),
    usd: (ingresos.usd ?? 0) - (gastos.usd ?? 0) - (ahorro.usd ?? 0),
  };

  const itemsGasto = items.filter((i) => i.categoria.tipo === "gasto");
  const presupuestoGastos = sumarMontos(itemsGasto.map(montosItemMensual));
  const usado =
    presupuestoGastos.ars ? (gastos.ars ?? 0) / presupuestoGastos.ars
    : presupuestoGastos.usd ? (gastos.usd ?? 0) / presupuestoGastos.usd
    : null;
  const mesPasado = hoy.slice(0, 7) === anioMes ? Number(hoy.slice(8, 10)) / diasDelMes(anioMes) : 1;

  // Categorías de gasto: las 5 con más movimiento, con presupuesto vs. real
  const ids = new Set<string>();
  registros.forEach((r) => r.tipo === "gasto" && r.categoriaId && ids.add(r.categoriaId));
  itemsGasto.forEach((i) => ids.add(i.categoriaId));
  const cats = await prisma.finCategoria.findMany({ where: { id: { in: Array.from(ids) } }, select: { id: true, nombre: true, icono: true, color: true } });
  const categorias = cats
    .map((c) => ({
      ...c,
      real: sumarMontos(registros.filter((r) => r.tipo === "gasto" && r.categoriaId === c.id).map(montos)),
      presupuesto: sumarMontos(itemsGasto.filter((i) => i.categoriaId === c.id).map(montosItemMensual)),
    }))
    .sort((a, b) => (b.real.ars ?? 0) - (a.real.ars ?? 0) || (b.presupuesto.ars ?? 0) - (a.presupuesto.ars ?? 0))
    .slice(0, 5);

  return {
    ingresos, gastos, ahorro, saldoLibre,
    tasaAhorro: tasa(ahorro, ingresos),
    presupuestoGastos,
    presupuestoUsado: usado,
    mesTranscurrido: mesPasado,
    incompleto: ingresos.incompleto || gastos.incompleto || ahorro.incompleto,
    categorias,
    totalCategorias: ids.size,
  };
}

// ─── Metas ──────────────────────────────────────────────────────

// Promedio mensual de gastos esenciales de los últimos 3 meses cerrados (objetivo dinámico del fondo, spec §4)
async function promedioEsencial(): Promise<Montos | null> {
  const cerrados = await prisma.finMes.findMany({ where: { estado: "cerrado" }, orderBy: { anioMes: "desc" }, take: 3, select: { id: true } });
  if (!cerrados.length) return null;
  const regs = await prisma.finRegistro.findMany({
    where: { mesId: { in: cerrados.map((m) => m.id) }, tipo: "gasto" },
    select: { montoArs: true, montoUsd: true, naturaleza: true, categoria: { select: { naturalezaDefault: true } } },
  });
  const esenciales = regs.filter((r) => (r.naturaleza ?? r.categoria?.naturalezaDefault) === "esencial");
  const total = sumarMontos(esenciales.map(montos));
  return { ars: (total.ars ?? 0) / cerrados.length, usd: (total.usd ?? 0) / cerrados.length };
}

async function resumenMetas() {
  const metas = await prisma.finMeta.findMany({
    where: { activa: true },
    orderBy: [{ tipo: "asc" }, { createdAt: "asc" }],
    include: { aportes: { select: { montoOriginal: true, monedaOriginal: true, montoArs: true, montoUsd: true } } },
  });
  if (!metas.length) return [];
  const promedio = metas.some((m) => m.tipo === "fondo_emergencia") ? await promedioEsencial() : null;

  return metas.map((m) => {
    const aportado = sumarMontos(m.aportes.map(montos));
    if (m.tipo === "fondo_emergencia") {
      // En USD si se puede: en pesos la inflación distorsiona la comparación entre meses
      const mesesCubiertos =
        promedio?.usd && !aportado.incompleto ? (aportado.usd ?? 0) / promedio.usd
        : promedio?.ars ? (aportado.ars ?? 0) / promedio.ars
        : null;
      return { id: m.id, nombre: m.nombre, icono: m.icono, tipo: m.tipo, aportado, mesesCobertura: m.mesesCobertura ?? 6, mesesCubiertos, progreso: null };
    }
    const objetivo = num(m.montoObjetivo);
    const enMoneda = m.moneda === "USD" ? aportado.usd : aportado.ars;
    return {
      id: m.id, nombre: m.nombre, icono: m.icono, tipo: m.tipo, aportado,
      objetivo, moneda: m.moneda,
      progreso: objetivo ? Math.max(0, (enMoneda ?? 0) / objetivo) : null,
      mesesCobertura: null, mesesCubiertos: null,
    };
  });
}

// ─── Inicio ─────────────────────────────────────────────────────

export async function datosInicio() {
  const hoy = hoyISO();
  const anioMes = anioMesActual();
  const mes = await obtenerMes(anioMes);

  const [proximoPaso, resumen, metas, ultimos] = await Promise.all([
    calcularProximoPaso(anioMes, hoy),
    resumenMes(mes.id, anioMes, hoy),
    resumenMetas(),
    prisma.finRegistro.findMany({
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true, fecha: true, tipo: true, descripcion: true, montoOriginal: true, monedaOriginal: true,
        montoArs: true, montoUsd: true, esAproximado: true, compartido: true, cuotaNumero: true,
        categoria: { select: { nombre: true, icono: true } },
      },
    }),
  ]);

  return {
    hoy,
    mes: { anioMes, nombre: nombreMes(anioMes), tipoCambio: num(mes.tipoCambio), fuenteTc: mes.fuenteTc, estado: mes.estado },
    proximoPaso,
    resumen,
    metas,
    ultimos: ultimos.map((r) => ({
      ...r,
      fecha: isoDeFechaDB(r.fecha),
      montoOriginal: r.montoOriginal.toNumber(),
      montoArs: num(r.montoArs),
      montoUsd: num(r.montoUsd),
    })),
  };
}

export type DatosInicio = Awaited<ReturnType<typeof datosInicio>>;
