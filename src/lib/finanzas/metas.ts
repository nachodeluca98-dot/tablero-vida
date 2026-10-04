// Metas y fondo de emergencia (spec §4 fin_metas / fin_aportes_meta y §6.8).
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Borrador } from "./borrador";
import { guardarBorradores } from "./carga";
import { equivalentes, sumarMontos, type Moneda, type Montos } from "./dinero";
import { anioMesActual, hoyISO, sumarMeses } from "./fechas";
import { obtenerMes, tcVigente } from "./meses";

const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : d.toNumber());

// Promedio mensual de gastos esenciales de los últimos 3 meses cerrados (objetivo dinámico del fondo, spec §4)
export async function promedioEsencial(): Promise<Montos | null> {
  const cerrados = await prisma.finMes.findMany({ where: { estado: "cerrado" }, orderBy: { anioMes: "desc" }, take: 3, select: { id: true } });
  if (!cerrados.length) return null;
  const regs = await prisma.finRegistro.findMany({
    where: { mesId: { in: cerrados.map((m) => m.id) }, tipo: "gasto" },
    select: { montoArs: true, montoUsd: true, naturaleza: true, categoria: { select: { naturalezaDefault: true } } },
  });
  const esenciales = regs.filter((r) => (r.naturaleza ?? r.categoria?.naturalezaDefault) === "esencial");
  const total = sumarMontos(esenciales.map((r) => ({ ars: num(r.montoArs), usd: num(r.montoUsd) })));
  return { ars: (total.ars ?? 0) / cerrados.length, usd: (total.usd ?? 0) / cerrados.length };
}

// Todas las metas activas con progreso, aportes por mes y fecha estimada al ritmo actual (spec §6.8)
export async function listarMetas(meses = 12) {
  const hasta = anioMesActual();
  const desde = sumarMeses(hasta, -(meses - 1));
  const [metas, promedio] = await Promise.all([
    prisma.finMeta.findMany({
      where: { activa: true },
      orderBy: [{ tipo: "asc" }, { createdAt: "asc" }],
      include: { aportes: { include: { mes: { select: { anioMes: true } }, registro: { select: { descripcion: true, fecha: true } } }, orderBy: { createdAt: "desc" } } },
    }),
    promedioEsencial(),
  ]);

  return metas.map((m) => {
    const fondo = m.tipo === "fondo_emergencia";
    // Moneda de la meta: la elegida; el fondo se mide en USD (en pesos la inflación distorsiona)
    const moneda: Moneda = (m.moneda as Moneda | null) ?? (fondo ? "USD" : "ARS");
    const enMoneda = (a: { montoArs: Prisma.Decimal | null; montoUsd: Prisma.Decimal | null }) => (moneda === "USD" ? num(a.montoUsd) : num(a.montoArs)) ?? 0;
    const aportado = sumarMontos(m.aportes.map((a) => ({ ars: num(a.montoArs), usd: num(a.montoUsd) })));
    const aportadoMoneda = m.aportes.reduce((t, a) => t + enMoneda(a), 0);

    // Aportes por mes (últimos N meses), en la moneda de la meta y en USD (para apilar metas de distinta moneda)
    const porMes: { anioMes: string; monto: number; usd: number }[] = [];
    for (let i = 0; i < meses; i++) {
      const am = sumarMeses(desde, i);
      const del = m.aportes.filter((a) => a.mes.anioMes === am);
      porMes.push({ anioMes: am, monto: del.reduce((t, a) => t + enMoneda(a), 0), usd: del.reduce((t, a) => t + (num(a.montoUsd) ?? 0), 0) });
    }
    // Ritmo: promedio de los últimos 3 meses con aportes
    const conAporte = porMes.filter((x) => x.monto > 0).slice(-3);
    const ritmo = conAporte.length ? conAporte.reduce((t, x) => t + x.monto, 0) / conAporte.length : 0;

    const mesesCobertura = m.mesesCobertura ?? 6;
    const promedioMoneda = promedio ? (moneda === "USD" ? promedio.usd : promedio.ars) : null;
    const objetivo = fondo ? (promedioMoneda ? promedioMoneda * mesesCobertura : null) : num(m.montoObjetivo);
    const falta = objetivo != null ? Math.max(0, objetivo - aportadoMoneda) : null;
    const mesesParaLlegar = falta != null && falta > 0 && ritmo > 0 ? Math.ceil(falta / ritmo) : falta === 0 ? 0 : null;

    return {
      id: m.id,
      nombre: m.nombre,
      icono: m.icono || (fondo ? "🛟" : "🎯"),
      tipo: m.tipo,
      moneda,
      aportado,
      aportadoMoneda,
      objetivo,
      progreso: objetivo ? Math.min(1, aportadoMoneda / objetivo) : null,
      mesesCobertura: fondo ? mesesCobertura : null,
      mesesCubiertos: fondo && promedioMoneda ? aportadoMoneda / promedioMoneda : null,
      gastoEsencialMensual: fondo ? promedioMoneda : null,
      fechaObjetivo: m.fechaObjetivo ? m.fechaObjetivo.toISOString().slice(0, 10) : null,
      ritmo,
      llegaEn: mesesParaLlegar != null ? sumarMeses(hasta, mesesParaLlegar) : null,
      porMes,
      historial: m.aportes.slice(0, 30).map((a) => ({
        id: a.id,
        anioMes: a.mes.anioMes,
        monto: enMoneda(a),
        descripcion: a.registro?.descripcion ?? (enMoneda(a) < 0 ? "Retiro" : "Ajuste de cierre"),
      })),
    };
  });
}

export type MetaDetalle = Awaited<ReturnType<typeof listarMetas>>[number];

export class ErrorMeta extends Error {}

export async function crearMeta(c: { nombre?: string; tipo?: string; montoObjetivo?: number | null; moneda?: Moneda; mesesCobertura?: number | null; fechaObjetivo?: string | null; icono?: string | null }) {
  const fondo = c.tipo === "fondo_emergencia";
  if (fondo) {
    const ya = await prisma.finMeta.findFirst({ where: { tipo: "fondo_emergencia", activa: true } });
    if (ya) return ya;
  }
  const nombre = (c.nombre ?? "").trim() || (fondo ? "Fondo de emergencia" : "");
  if (!nombre) throw new ErrorMeta("Poné un nombre para la meta");
  if (!fondo && !(Number(c.montoObjetivo) > 0)) throw new ErrorMeta("Poné cuánto querés juntar");
  return prisma.finMeta.create({
    data: {
      nombre: nombre.slice(0, 50),
      tipo: fondo ? "fondo_emergencia" : "meta",
      icono: c.icono || (fondo ? "🛟" : "🎯"),
      moneda: c.moneda === "ARS" ? "ARS" : "USD",
      montoObjetivo: fondo ? null : new Prisma.Decimal(Number(c.montoObjetivo)),
      mesesCobertura: fondo ? Math.max(1, Math.min(24, Math.round(Number(c.mesesCobertura) || 6))) : null,
      fechaObjetivo: c.fechaObjetivo && /^\d{4}-\d{2}-\d{2}$/.test(c.fechaObjetivo) ? new Date(`${c.fechaObjetivo}T00:00:00Z`) : null,
    },
  });
}

export async function editarMeta(id: string, c: { nombre?: string; montoObjetivo?: number; mesesCobertura?: number; fechaObjetivo?: string | null; activa?: boolean; icono?: string }) {
  const data: Prisma.FinMetaUpdateInput = {};
  if (c.nombre?.trim()) data.nombre = c.nombre.trim().slice(0, 50);
  if (c.icono) data.icono = c.icono.slice(0, 8);
  if (c.montoObjetivo !== undefined && Number(c.montoObjetivo) > 0) data.montoObjetivo = new Prisma.Decimal(Number(c.montoObjetivo));
  if (c.mesesCobertura !== undefined) data.mesesCobertura = Math.max(1, Math.min(24, Math.round(Number(c.mesesCobertura) || 6)));
  if (c.fechaObjetivo !== undefined) data.fechaObjetivo = c.fechaObjetivo ? new Date(`${c.fechaObjetivo}T00:00:00Z`) : null;
  if (c.activa === false) data.activa = false;
  return prisma.finMeta.update({ where: { id }, data });
}

// Aportar = un registro de ahorro con la meta (cuenta en la tasa de ahorro). Retirar = aporte negativo.
export async function aportar(metaId: string, monto: number, moneda: Moneda) {
  const meta = await prisma.finMeta.findUnique({ where: { id: metaId } });
  if (!meta) throw new ErrorMeta("No encontré la meta");
  if (!monto || !isFinite(monto)) throw new ErrorMeta("Poné un monto");
  const anioMes = anioMesActual();
  if (monto > 0) {
    const b: Borrador = {
      key: "aporte", tipo: "ahorro", descripcion: `Aporte a ${meta.nombre}`, incluye: null, monto, moneda, esAproximado: false,
      categoriaId: "fincat_ahorro", presupuestoItemId: null, medioPago: null, tarjetaId: null, cuotasTotal: null, compartido: false,
      notaCompartido: null, metaId, fecha: hoyISO(), mesImputacion: anioMes, mesImputacionManual: true,
    };
    return guardarBorradores([b], "app_formulario");
  }
  const mes = await obtenerMes(anioMes);
  const eq = equivalentes(monto, moneda, await tcVigente(anioMes));
  const a = await prisma.finAporteMeta.create({
    data: {
      metaId, mesId: mes.id, montoOriginal: new Prisma.Decimal(monto), monedaOriginal: moneda,
      montoArs: eq.ars == null ? null : new Prisma.Decimal(eq.ars), montoUsd: eq.usd == null ? null : new Prisma.Decimal(eq.usd),
    },
  });
  return { ids: [] as string[], aporteId: a.id, planes: [] };
}
