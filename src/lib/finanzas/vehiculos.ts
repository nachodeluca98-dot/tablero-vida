// Integración con Vehículos (spec §12): cada gasto cargado en Vehículos (nafta, service, seguro, patente…)
// genera un registro en Finanzas con origen "modulo_vehiculos", categoría Auto y origen_ref_id
// ("carga:<id>" / "mant:<id>"). Si ya estaba cargado a mano en Finanzas, se vincula en vez de duplicarlo.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TIPO_LABEL } from "@/lib/vehiculos/core";
import { nuevaKey, type Borrador } from "./borrador";
import { guardarBorradores } from "./carga";
import { equivalentes } from "./dinero";
import { anioMesActual, fechaDB, isoDeFechaDB, mesImputacion, TZ } from "./fechas";
import { obtenerMes, tcVigente } from "./meses";

const CATEGORIA = "fincat_auto";

// Conceptos que coinciden con la plantilla del presupuesto ("Seguro auto", "Patente", "Nafta"),
// así el registro queda vinculado a su ítem y la revisión no lo vuelve a pedir.
const DESCRIPCION: Record<string, string> = { seguro: "Seguro auto", patente: "Patente", vtv: "VTV" };

type Gasto = { ref: string; fecha: string; monto: number | null; descripcion: string; incluye: string | null };

const fechaISO = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const juntar = (...p: (string | null | undefined)[]) => p.filter((x) => x && x.trim()).join(" · ") || null;

async function gastoDeCarga(id: string): Promise<Gasto | null> {
  const c = await prisma.cargaCombustible.findUnique({ where: { id }, include: { vehiculo: { select: { alias: true } } } });
  if (!c) return null;
  const litros = `${c.litros.toLocaleString("es-AR", { maximumFractionDigits: 2 })} L`;
  return { ref: `carga:${id}`, fecha: fechaISO(c.fecha), monto: c.montoTotal, descripcion: "Nafta", incluye: juntar(litros, c.estacion, c.vehiculo.alias) };
}

async function gastoDeMantenimiento(id: string): Promise<Gasto | null> {
  const m = await prisma.mantenimiento.findUnique({ where: { id }, include: { vehiculo: { select: { alias: true } } } });
  if (!m) return null;
  // Las descripciones automáticas ("Marcado como hecho…", "Cuota mensual…") no aportan en Finanzas
  const desc = m.descripcion && !/^(marcado|registrado|cargado|cuota mensual)/i.test(m.descripcion) ? m.descripcion : null;
  return {
    ref: `mant:${id}`,
    fecha: fechaISO(m.fecha),
    monto: m.monto,
    descripcion: DESCRIPCION[m.tipo] ?? TIPO_LABEL[m.tipo] ?? "Auto",
    incluye: juntar(m.taller, desc, m.vehiculo.alias),
  };
}

// Un registro cargado a mano en Finanzas que ya es este gasto: Auto, mismo monto, ±3 días, sin vínculo
async function yaCargadoAMano(g: Gasto) {
  const f = fechaDB(g.fecha);
  return prisma.finRegistro.findFirst({
    where: {
      tipo: "gasto", categoriaId: CATEGORIA, origenRefId: null, monedaOriginal: "ARS",
      montoOriginal: new Prisma.Decimal(g.monto!),
      fecha: { gte: new Date(f.getTime() - 3 * 864e5), lte: new Date(f.getTime() + 3 * 864e5) },
    },
    select: { id: true },
  });
}

async function sincronizar(g: Gasto) {
  const existente = await prisma.finRegistro.findFirst({ where: { origenRefId: g.ref } });

  if (!g.monto || g.monto <= 0) {
    if (existente) await quitarPorRef(g.ref);
    return;
  }

  if (existente) {
    // Se actualizan monto y fecha (ej.: cambió la cuota del seguro); categoría y demás ediciones del usuario se respetan
    const montoIgual = existente.montoOriginal.toNumber() === g.monto && existente.monedaOriginal === "ARS";
    if (montoIgual && isoDeFechaDB(existente.fecha) === g.fecha) return;
    const anioMes = mesImputacion(g.fecha, existente.medioPago, null);
    const mes = await obtenerMes(anioMes);
    const tc = existente.tcPropio?.toNumber() ?? (await tcVigente(anioMes));
    const eq = equivalentes(g.monto, "ARS", tc);
    await prisma.finRegistro.update({
      where: { id: existente.id },
      data: {
        fecha: fechaDB(g.fecha), mesId: mes.id,
        montoOriginal: new Prisma.Decimal(g.monto), monedaOriginal: "ARS",
        montoArs: eq.ars == null ? null : new Prisma.Decimal(eq.ars),
        montoUsd: eq.usd == null ? null : new Prisma.Decimal(eq.usd),
      },
    });
    return;
  }

  const aMano = await yaCargadoAMano(g);
  if (aMano) {
    await prisma.finRegistro.update({ where: { id: aMano.id }, data: { origenRefId: g.ref } });
    return;
  }

  const b: Borrador = {
    key: nuevaKey(), tipo: "gasto", descripcion: g.descripcion, incluye: g.incluye, monto: g.monto, moneda: "ARS",
    esAproximado: false, categoriaId: CATEGORIA, presupuestoItemId: null, medioPago: null, tarjetaId: null, cuotasTotal: null,
    compartido: false, notaCompartido: null, metaId: null, fecha: g.fecha, mesImputacion: g.fecha.slice(0, 7), mesImputacionManual: false,
  };
  const { ids } = await guardarBorradores([b], "modulo_vehiculos");
  if (ids[0]) await prisma.finRegistro.update({ where: { id: ids[0] }, data: { origenRefId: g.ref } });
}

async function quitarPorRef(ref: string) {
  const r = await prisma.finRegistro.findFirst({ where: { origenRefId: ref }, select: { id: true, origen: true } });
  if (!r) return;
  // Si lo había cargado el usuario en Finanzas, solo se desvincula: el gasto existió igual
  if (r.origen === "modulo_vehiculos") await prisma.finRegistro.delete({ where: { id: r.id } });
  else await prisma.finRegistro.update({ where: { id: r.id }, data: { origenRefId: null } });
}

// La integración nunca debe romper la carga en Vehículos: los errores se registran y se sigue
async function seguro(fn: () => Promise<void>, que: string) {
  try {
    await fn();
  } catch (e) {
    console.error(`Finanzas: no se pudo sincronizar ${que}`, e);
  }
}

export const sincronizarCarga = (id: string) => seguro(async () => { const g = await gastoDeCarga(id); if (g) await sincronizar(g); }, `carga ${id}`);
export const sincronizarMantenimiento = (id: string) => seguro(async () => { const g = await gastoDeMantenimiento(id); if (g) await sincronizar(g); }, `mantenimiento ${id}`);
export const quitarCarga = (id: string) => seguro(() => quitarPorRef(`carga:${id}`), `carga ${id}`);
export const quitarMantenimiento = (id: string) => seguro(() => quitarPorRef(`mant:${id}`), `mantenimiento ${id}`);

// Importación inicial (una sola vez): los gastos de Vehículos desde el primer mes abierto de Finanzas.
// Los meses ya cerrados no se tocan, y tampoco se llenan de movimientos los meses anteriores al módulo.
export async function importarGastosVehiculos() {
  const prefs = await prisma.finPreferencias.findUnique({ where: { id: "user" } });
  if (!prefs || prefs.vehiculosImportadoAt || prefs.onboardingPaso !== -1) return 0;
  const tomado = await prisma.finPreferencias.updateMany({ where: { id: "user", vehiculosImportadoAt: null }, data: { vehiculosImportadoAt: new Date() } });
  if (!tomado.count) return 0; // otro pedido ya la está haciendo

  const actual = anioMesActual();
  const primerAbierto = await prisma.finMes.findFirst({ where: { estado: "abierto", anioMes: { lte: actual } }, orderBy: { anioMes: "asc" }, select: { anioMes: true } });
  const desde = new Date(`${primerAbierto?.anioMes ?? actual}-01T00:00:00Z`);
  const [cargas, mants] = await Promise.all([
    prisma.cargaCombustible.findMany({ where: { fecha: { gte: desde }, montoTotal: { gt: 0 } }, select: { id: true } }),
    prisma.mantenimiento.findMany({ where: { fecha: { gte: desde }, monto: { gt: 0 } }, select: { id: true } }),
  ]);
  for (const c of cargas) await sincronizarCarga(c.id);
  for (const m of mants) await sincronizarMantenimiento(m.id);
  return cargas.length + mants.length;
}
