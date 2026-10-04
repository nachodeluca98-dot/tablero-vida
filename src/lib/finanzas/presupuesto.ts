// Presupuesto del mes (spec §6.7): previsto vs. real por categoría, edición en el lugar,
// agregar/quitar ítems y reasignar entre categorías.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { equivalentes, sumarMontos, type Moneda, type Montos } from "./dinero";
import { anioMesActual, diasDelMes, hoyISO, sumarMeses } from "./fechas";
import { obtenerMes, tcVigente } from "./meses";

const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : d.toNumber());

export const FRECUENCIAS = { mensual: 1, bimestral: 2, trimestral: 3, anual: 12 } as const;
export type Frecuencia = keyof typeof FRECUENCIAS;

// Monto mensual previsto de un ítem: si la frecuencia no es mensual, se prorratea (spec §2.1.3)
function mensual(i: { montoOriginal: Prisma.Decimal; montoPrevistoMensual: Prisma.Decimal | null; montoArs: Prisma.Decimal | null; montoUsd: Prisma.Decimal | null }): Montos {
  const orig = i.montoOriginal.toNumber();
  const f = i.montoPrevistoMensual && orig ? i.montoPrevistoMensual.toNumber() / orig : 1;
  return { ars: i.montoArs == null ? null : i.montoArs.toNumber() * f, usd: i.montoUsd == null ? null : i.montoUsd.toNumber() * f };
}

export async function datosPresupuesto(anioMes: string) {
  const mes = await obtenerMes(anioMes);
  const [items, registros, categorias, anterior] = await Promise.all([
    prisma.finPresupuestoItem.findMany({
      where: { mesId: mes.id },
      include: { categoria: { select: { tipo: true } }, planCuotas: { select: { cuotasTotal: true } }, tarjeta: { select: { nombre: true } } },
      orderBy: [{ fijoVariable: "asc" }, { createdAt: "asc" }],
    }),
    prisma.finRegistro.findMany({ where: { mesId: mes.id }, select: { tipo: true, categoriaId: true, presupuestoItemId: true, montoArs: true, montoUsd: true } }),
    prisma.finCategoria.findMany({ orderBy: [{ tipo: "asc" }, { orden: "asc" }] }),
    prisma.finMes.findUnique({ where: { anioMes: sumarMeses(anioMes, -1) }, include: { _count: { select: { items: { where: { activo: true } } } } } }),
  ]);

  const montosReg = (r: (typeof registros)[number]): Montos => ({ ars: num(r.montoArs), usd: num(r.montoUsd) });
  const activos = items.filter((i) => i.activo);

  const aItem = (i: (typeof items)[number]) => {
    const real = sumarMontos(registros.filter((r) => r.presupuestoItemId === i.id).map(montosReg));
    return {
      id: i.id,
      concepto: i.concepto,
      incluye: i.incluye,
      categoriaId: i.categoriaId,
      monto: i.montoOriginal.toNumber(),
      moneda: i.monedaOriginal as Moneda,
      montoArs: num(i.montoArs),
      montoUsd: num(i.montoUsd),
      mensual: mensual(i),
      frecuencia: i.frecuencia as Frecuencia,
      fijoVariable: i.fijoVariable,
      naturaleza: i.naturaleza,
      recurrente: i.recurrente,
      diaVencimiento: i.diaVencimiento,
      origen: i.origen,
      cuotas: i.planCuotas ? { total: i.planCuotas.cuotasTotal } : null,
      tarjeta: i.tarjeta?.nombre ?? null,
      activo: i.activo,
      real,
      pagado: (real.ars ?? 0) > 0 || (real.usd ?? 0) > 0,
    };
  };

  const grupos = categorias
    .map((c) => {
      const its = activos.filter((i) => i.categoriaId === c.id);
      const regs = registros.filter((r) => r.categoriaId === c.id && r.tipo === c.tipo);
      if (!its.length && !regs.length) return null;
      return {
        id: c.id,
        nombre: c.nombre,
        icono: c.icono,
        tipo: c.tipo,
        previsto: sumarMontos(its.map(mensual)),
        real: sumarMontos(regs.map(montosReg)),
        items: its.map(aItem),
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  // Gastos sin categoría: cuentan en el real pero no tienen presupuesto
  const sinCategoria = sumarMontos(registros.filter((r) => r.tipo === "gasto" && !r.categoriaId).map(montosReg));

  const total = (tipo: string, campo: "previsto" | "real") => sumarMontos(grupos.filter((g) => g.tipo === tipo).map((g) => g[campo]));
  const gastosReal = sumarMontos([total("gasto", "real"), sinCategoria]);
  const resumen = {
    ingresos: { previsto: total("ingreso", "previsto"), real: total("ingreso", "real") },
    gastos: { previsto: total("gasto", "previsto"), real: gastosReal },
    ahorro: { previsto: total("ahorro", "previsto"), real: total("ahorro", "real") },
  };
  const saldoLibrePrevisto = {
    ars: (resumen.ingresos.previsto.ars ?? 0) - (resumen.gastos.previsto.ars ?? 0) - (resumen.ahorro.previsto.ars ?? 0),
    usd: (resumen.ingresos.previsto.usd ?? 0) - (resumen.gastos.previsto.usd ?? 0) - (resumen.ahorro.previsto.usd ?? 0),
  };

  // Sugerencias de reasignación: cada categoría pasada se cubre desde la que más margen tiene (spec §2.1.4)
  const gastos = grupos.filter((g) => g.tipo === "gasto");
  const margen = (g: (typeof gastos)[number]) => (g.previsto.ars ?? 0) - (g.real.ars ?? 0);
  const sugerencias = gastos
    .filter((g) => (g.previsto.ars ?? 0) > 0 ? (g.real.ars ?? 0) > (g.previsto.ars ?? 0) : false)
    .map((g) => {
      const exceso = (g.real.ars ?? 0) - (g.previsto.ars ?? 0);
      const desde = gastos.filter((o) => o.id !== g.id && margen(o) > 0).sort((a, b) => margen(b) - margen(a))[0];
      return desde ? { destino: g.id, origen: desde.id, monto: Math.min(exceso, margen(desde)) } : null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const quitados = items.filter((i) => !i.activo && i.origen !== "reasignacion").map(aItem);

  return {
    anioMes,
    esActual: anioMes === anioMesActual(),
    mesTranscurrido: anioMes === anioMesActual() ? Number(hoyISO().slice(8, 10)) / diasDelMes(anioMes) : anioMes < anioMesActual() ? 1 : 0,
    estado: mes.estado,
    tipoCambio: num(mes.tipoCambio),
    grupos,
    sinCategoria,
    resumen,
    saldoLibrePrevisto,
    sugerencias,
    quitados,
    anteriorConItems: (anterior?._count.items ?? 0) > 0,
  };
}

export type DatosPresupuesto = Awaited<ReturnType<typeof datosPresupuesto>>;

// ─── Edición ────────────────────────────────────────────────────

export class ErrorPresupuesto extends Error {}

async function mesEditable(mesId: string) {
  const mes = await prisma.finMes.findUniqueOrThrow({ where: { id: mesId } });
  if (mes.estado === "cerrado") throw new ErrorPresupuesto("El mes está cerrado. Reabrilo para editarlo.");
  return mes;
}

function montosDe(monto: number, moneda: Moneda, frecuencia: Frecuencia, tc: number | null) {
  const eq = equivalentes(monto, moneda, tc);
  const meses = FRECUENCIAS[frecuencia];
  return {
    montoOriginal: new Prisma.Decimal(monto),
    monedaOriginal: moneda,
    montoArs: eq.ars == null ? null : new Prisma.Decimal(eq.ars),
    montoUsd: eq.usd == null ? null : new Prisma.Decimal(eq.usd),
    montoPrevistoMensual: meses > 1 ? new Prisma.Decimal(Math.round((monto / meses) * 100) / 100) : null,
  };
}

export type NuevoItem = {
  anioMes: string;
  concepto: string;
  categoriaId: string;
  monto: number;
  moneda?: Moneda;
  frecuencia?: Frecuencia;
  fijoVariable?: "fijo" | "variable";
  diaVencimiento?: number | null;
};

export async function crearItem(n: NuevoItem) {
  if (!n.concepto?.trim()) throw new ErrorPresupuesto("Poné un nombre");
  if (!(Number(n.monto) > 0)) throw new ErrorPresupuesto("El monto tiene que ser mayor a 0");
  const cat = await prisma.finCategoria.findUnique({ where: { id: n.categoriaId } });
  if (!cat) throw new ErrorPresupuesto("Elegí una categoría");
  const mes = await obtenerMes(n.anioMes);
  await mesEditable(mes.id);
  const frecuencia = n.frecuencia && n.frecuencia in FRECUENCIAS ? n.frecuencia : "mensual";
  const tc = await tcVigente(n.anioMes);
  return prisma.finPresupuestoItem.create({
    data: {
      mesId: mes.id,
      categoriaId: cat.id,
      concepto: n.concepto.trim().slice(0, 80),
      ...montosDe(Number(n.monto), n.moneda === "USD" ? "USD" : "ARS", frecuencia, tc),
      frecuencia,
      recurrente: true,
      fijoVariable: n.fijoVariable ?? cat.fijoVariableDefault,
      naturaleza: cat.naturalezaDefault,
      diaVencimiento: n.diaVencimiento && n.diaVencimiento >= 1 && n.diaVencimiento <= 31 ? n.diaVencimiento : null,
      origen: "manual",
    },
  });
}

export type CambiosItem = Partial<{
  concepto: string;
  monto: number;
  moneda: Moneda;
  frecuencia: Frecuencia;
  fijoVariable: "fijo" | "variable";
  naturaleza: "esencial" | "discrecional";
  recurrente: boolean;
  diaVencimiento: number | null;
  categoriaId: string;
  activo: boolean;
}>;

export async function editarItem(id: string, c: CambiosItem) {
  const it = await prisma.finPresupuestoItem.findUnique({ where: { id }, include: { mes: true } });
  if (!it) throw new ErrorPresupuesto("No encontré ese ítem");
  await mesEditable(it.mesId);
  // Las cuotas son informativas: se ven, pero no se editan ni se quitan (spec §6.4)
  if (it.origen === "cuotas") throw new ErrorPresupuesto("Las cuotas no se pueden cambiar desde el presupuesto");

  const data: Prisma.FinPresupuestoItemUncheckedUpdateInput = {};
  if (c.concepto !== undefined) {
    if (!c.concepto.trim()) throw new ErrorPresupuesto("Poné un nombre");
    data.concepto = c.concepto.trim().slice(0, 80);
  }
  if (c.fijoVariable) data.fijoVariable = c.fijoVariable;
  if (c.naturaleza) data.naturaleza = c.naturaleza;
  if (c.recurrente !== undefined) data.recurrente = !!c.recurrente;
  if (c.activo !== undefined) data.activo = !!c.activo;
  if (c.diaVencimiento !== undefined) data.diaVencimiento = c.diaVencimiento && c.diaVencimiento >= 1 && c.diaVencimiento <= 31 ? c.diaVencimiento : null;
  if (c.categoriaId) {
    if (!(await prisma.finCategoria.findUnique({ where: { id: c.categoriaId } }))) throw new ErrorPresupuesto("Categoría inválida");
    data.categoriaId = c.categoriaId;
  }
  if (c.monto !== undefined || c.moneda !== undefined || c.frecuencia !== undefined) {
    const monto = c.monto !== undefined ? Number(c.monto) : it.montoOriginal.toNumber();
    if (!(monto > 0) && it.origen !== "reasignacion") throw new ErrorPresupuesto("El monto tiene que ser mayor a 0");
    const frecuencia = c.frecuencia && c.frecuencia in FRECUENCIAS ? c.frecuencia : (it.frecuencia as Frecuencia);
    Object.assign(data, montosDe(monto, c.moneda ?? (it.monedaOriginal as Moneda), frecuencia, await tcVigente(it.mes.anioMes)));
    data.frecuencia = frecuencia;
  }
  return prisma.finPresupuestoItem.update({ where: { id }, data });
}

// Reasignar (spec §6.7): un par de ajustes, negativo en el origen y positivo en el destino
export async function reasignar(anioMes: string, origenId: string, destinoId: string, monto: number) {
  if (origenId === destinoId) throw new ErrorPresupuesto("Elegí dos categorías distintas");
  if (!(monto > 0)) throw new ErrorPresupuesto("El monto tiene que ser mayor a 0");
  const [origen, destino] = await Promise.all([
    prisma.finCategoria.findUnique({ where: { id: origenId } }),
    prisma.finCategoria.findUnique({ where: { id: destinoId } }),
  ]);
  if (!origen || !destino) throw new ErrorPresupuesto("Categoría inválida");
  const mes = await obtenerMes(anioMes);
  await mesEditable(mes.id);
  const tc = await tcVigente(anioMes);
  const base = { mesId: mes.id, recurrente: false, origen: "reasignacion" as const, fijoVariable: "variable" as const };
  const [a, b] = await prisma.$transaction([
    prisma.finPresupuestoItem.create({
      data: { ...base, categoriaId: origen.id, concepto: `Reasignado a ${destino.nombre}`, naturaleza: origen.naturalezaDefault, ...montosDe(-monto, "ARS", "mensual", tc) },
    }),
    prisma.finPresupuestoItem.create({
      data: { ...base, categoriaId: destino.id, concepto: `Reasignado desde ${origen.nombre}`, naturaleza: destino.naturalezaDefault, ...montosDe(monto, "ARS", "mensual", tc) },
    }),
  ]);
  return { ids: [a.id, b.id] };
}

export async function borrarReasignacion(ids: string[]) {
  const r = await prisma.finPresupuestoItem.deleteMany({ where: { id: { in: ids }, origen: "reasignacion" } });
  return r.count;
}

// Traer el presupuesto del mes anterior: ítems recurrentes activos, sin cuotas ni reasignaciones.
// La apertura de mes (spec §6.4) agrega el ajuste por inflación sobre esto.
export async function clonarDesdeAnterior(anioMes: string, ajusteInflacionPct = 0) {
  const mes = await obtenerMes(anioMes);
  await mesEditable(mes.id);
  const anterior = await prisma.finMes.findUnique({ where: { anioMes: sumarMeses(anioMes, -1) } });
  if (!anterior) throw new ErrorPresupuesto("No hay mes anterior para copiar");
  const ya = await prisma.finPresupuestoItem.count({ where: { mesId: mes.id, origen: "clon" } });
  if (ya) throw new ErrorPresupuesto("Este mes ya tiene el presupuesto copiado");
  const items = await prisma.finPresupuestoItem.findMany({
    where: { mesId: anterior.id, activo: true, recurrente: true, origen: { notIn: ["cuotas", "reasignacion"] } },
  });
  const tc = await tcVigente(anioMes);
  const factor = 1 + (ajusteInflacionPct || 0) / 100;
  await prisma.$transaction(
    items.map((i) => {
      // El ajuste por inflación solo aplica a montos en pesos
      const monto = i.monedaOriginal === "ARS" ? Math.round(i.montoOriginal.toNumber() * factor) : i.montoOriginal.toNumber();
      return prisma.finPresupuestoItem.create({
        data: {
          mesId: mes.id, categoriaId: i.categoriaId, concepto: i.concepto, incluye: i.incluye,
          ...montosDe(monto, i.monedaOriginal as Moneda, i.frecuencia as Frecuencia, tc),
          frecuencia: i.frecuencia, recurrente: true, fijoVariable: i.fijoVariable, naturaleza: i.naturaleza,
          diaVencimiento: i.diaVencimiento, medioPago: i.medioPago, tarjetaId: i.tarjetaId, metaId: i.metaId,
          origen: "clon", itemOrigenId: i.id,
        },
      });
    })
  );
  if (ajusteInflacionPct) await prisma.finMes.update({ where: { id: mes.id }, data: { ajusteInflacionPct: new Prisma.Decimal(ajusteInflacionPct) } });
  return items.length;
}

export async function reabrirMes(anioMes: string) {
  const mes = await obtenerMes(anioMes);
  return prisma.finMes.update({ where: { id: mes.id }, data: { estado: "abierto", cerradoAt: null } });
}
