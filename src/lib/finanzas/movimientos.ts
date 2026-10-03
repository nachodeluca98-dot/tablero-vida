// Movimientos (spec §6.6) y Clasificar pendientes (spec §6.5).
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MEDIOS_PAGO, type MedioPago, type TipoMov } from "./borrador";
import { normalizar } from "./carga";
import { equivalentes, sumarMontos, type Moneda } from "./dinero";
import { fechaDB, hoyISO, isoDeFechaDB } from "./fechas";
import { obtenerMes, tcVigente } from "./meses";

const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : d.toNumber());

const SELECT = {
  id: true, fecha: true, tipo: true, descripcion: true, incluye: true,
  montoOriginal: true, monedaOriginal: true, montoArs: true, montoUsd: true, tcPropio: true,
  esAproximado: true, compartido: true, notaCompartido: true, medioPago: true, tarjetaId: true,
  categoriaId: true, presupuestoItemId: true, metaId: true, cuotaNumero: true, planCuotasId: true,
  origen: true, transcripcion: true, createdAt: true,
  mes: { select: { anioMes: true } },
  categoria: { select: { nombre: true, icono: true } },
  tarjeta: { select: { nombre: true } },
  planCuotas: { select: { cuotasTotal: true } },
} satisfies Prisma.FinRegistroSelect;

type Fila = Prisma.FinRegistroGetPayload<{ select: typeof SELECT }>;

function aMovimiento(r: Fila) {
  return {
    id: r.id,
    fecha: isoDeFechaDB(r.fecha),
    anioMes: r.mes.anioMes,
    tipo: r.tipo as TipoMov,
    descripcion: r.descripcion,
    incluye: r.incluye,
    monto: r.montoOriginal.toNumber(),
    moneda: r.monedaOriginal as Moneda,
    montoArs: num(r.montoArs),
    montoUsd: num(r.montoUsd),
    tcPropio: num(r.tcPropio),
    esAproximado: r.esAproximado,
    compartido: r.compartido,
    notaCompartido: r.notaCompartido,
    medioPago: r.medioPago as MedioPago | null,
    tarjetaId: r.tarjetaId,
    tarjeta: r.tarjeta?.nombre ?? null,
    categoriaId: r.categoriaId,
    categoria: r.categoria,
    metaId: r.metaId,
    cuotaNumero: r.cuotaNumero,
    cuotasTotal: r.planCuotas?.cuotasTotal ?? null,
    origen: r.origen,
    transcripcion: r.transcripcion,
  };
}

export type Movimiento = ReturnType<typeof aMovimiento>;

// ─── Listado con filtros ────────────────────────────────────────

export type Filtros = {
  mes?: string | null; // YYYY-MM (mes de imputación) o null = todo
  q?: string | null;
  categoria?: string | null;
  tipo?: string | null;
  medio?: string | null;
  tarjeta?: string | null;
  sinClasificar?: boolean;
  aprox?: boolean;
  compartido?: boolean;
};

export async function listarMovimientos(f: Filtros) {
  const where: Prisma.FinRegistroWhereInput = {};
  if (f.mes && /^\d{4}-\d{2}$/.test(f.mes)) where.mes = { anioMes: f.mes };
  if (f.categoria) where.categoriaId = f.categoria;
  if (f.sinClasificar) where.categoriaId = null;
  if (f.tipo && ["gasto", "ingreso", "ahorro"].includes(f.tipo)) where.tipo = f.tipo as TipoMov;
  if (f.medio && (MEDIOS_PAGO as readonly string[]).includes(f.medio)) where.medioPago = f.medio as MedioPago;
  if (f.tarjeta) where.tarjetaId = f.tarjeta;
  if (f.aprox) where.esAproximado = true;
  if (f.compartido) where.compartido = true;
  if (f.q?.trim()) {
    const q = f.q.trim();
    where.OR = [
      { descripcion: { contains: q, mode: "insensitive" } },
      { incluye: { contains: q, mode: "insensitive" } },
      { notaCompartido: { contains: q, mode: "insensitive" } },
      { categoria: { nombre: { contains: q, mode: "insensitive" } } },
    ];
  }

  const LIMITE = 500;
  const filas = await prisma.finRegistro.findMany({
    where,
    select: SELECT,
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    take: LIMITE + 1,
  });
  const movimientos = filas.slice(0, LIMITE).map(aMovimiento);
  const total = (t: string) => sumarMontos(movimientos.filter((m) => m.tipo === t).map((m) => ({ ars: m.montoArs, usd: m.montoUsd })));
  return {
    movimientos,
    hayMas: filas.length > LIMITE,
    totales: { gastos: total("gasto"), ingresos: total("ingreso"), ahorro: total("ahorro") },
  };
}

export async function obtenerMovimiento(id: string) {
  const r = await prisma.finRegistro.findUnique({ where: { id }, select: SELECT });
  return r ? aMovimiento(r) : null;
}

// ─── Edición en el lugar ────────────────────────────────────────

export type Cambios = Partial<{
  tipo: TipoMov;
  descripcion: string | null;
  incluye: string | null;
  monto: number;
  moneda: Moneda;
  categoriaId: string | null;
  fecha: string;
  medioPago: MedioPago | null;
  tarjetaId: string | null;
  anioMes: string; // mes de imputación
  tcPropio: number | null;
  esAproximado: boolean;
  compartido: boolean;
  notaCompartido: string | null;
  metaId: string | null;
}>;

export class ErrorEdicion extends Error {}

export async function editarMovimiento(id: string, c: Cambios) {
  const actual = await prisma.finRegistro.findUnique({ where: { id }, include: { mes: true } });
  if (!actual) throw new ErrorEdicion("No encontré ese movimiento");

  const data: Prisma.FinRegistroUncheckedUpdateInput = {};
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);

  if (c.tipo !== undefined) {
    if (!["gasto", "ingreso", "ahorro"].includes(c.tipo)) throw new ErrorEdicion("Tipo inválido");
    data.tipo = c.tipo;
    if (c.tipo !== actual.tipo && c.categoriaId === undefined) data.categoriaId = null; // la categoría era de otro tipo
    if (c.tipo !== "ahorro") data.metaId = null;
  }
  if (c.descripcion !== undefined) data.descripcion = texto(c.descripcion);
  if (c.incluye !== undefined) data.incluye = texto(c.incluye);
  if (c.notaCompartido !== undefined) data.notaCompartido = texto(c.notaCompartido);
  if (c.esAproximado !== undefined) data.esAproximado = !!c.esAproximado;
  if (c.compartido !== undefined) {
    data.compartido = !!c.compartido;
    if (!c.compartido) data.notaCompartido = null;
  }
  if (c.fecha !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha) || c.fecha > hoyISO()) throw new ErrorEdicion("Fecha inválida");
    data.fecha = fechaDB(c.fecha);
  }
  if (c.medioPago !== undefined) {
    if (c.medioPago !== null && !(MEDIOS_PAGO as readonly string[]).includes(c.medioPago)) throw new ErrorEdicion("Medio de pago inválido");
    data.medioPago = c.medioPago;
    if (c.medioPago !== "tarjeta_credito") data.tarjetaId = null;
  }
  if (c.tarjetaId !== undefined && (c.medioPago ?? actual.medioPago) === "tarjeta_credito") data.tarjetaId = c.tarjetaId;
  if (c.metaId !== undefined) data.metaId = c.metaId;

  if (c.categoriaId !== undefined && c.categoriaId !== actual.categoriaId) {
    data.categoriaId = c.categoriaId;
    if (c.categoriaId) {
      const cat = await prisma.finCategoria.findUnique({ where: { id: c.categoriaId } });
      if (!cat) throw new ErrorEdicion("Categoría inválida");
      // Hereda de la categoría, salvo que venga de un ítem del presupuesto de esa misma categoría
      data.fijoVariable = cat.fijoVariableDefault;
      data.naturaleza = cat.naturalezaDefault;
    }
    data.presupuestoItemId = null;
  }

  // Mes de imputación
  let mesId = actual.mesId;
  let anioMes = actual.mes.anioMes;
  if (c.anioMes !== undefined && c.anioMes !== anioMes) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.anioMes)) throw new ErrorEdicion("Mes inválido");
    const m = await obtenerMes(c.anioMes);
    mesId = m.id;
    anioMes = m.anioMes;
    data.mesId = mesId;
    data.presupuestoItemId = null; // el ítem era de otro mes
  }

  // Monto, moneda o TC → recalcular equivalentes
  const monto = c.monto !== undefined ? Number(c.monto) : actual.montoOriginal.toNumber();
  if (!(monto > 0)) throw new ErrorEdicion("El monto tiene que ser mayor a 0");
  const moneda: Moneda = c.moneda ?? (actual.monedaOriginal as Moneda);
  const tcPropio = c.tcPropio !== undefined ? (c.tcPropio && c.tcPropio > 0 ? Number(c.tcPropio) : null) : num(actual.tcPropio);
  if (c.monto !== undefined || c.moneda !== undefined || c.tcPropio !== undefined || data.mesId) {
    const tc = tcPropio ?? (await tcVigente(anioMes));
    const eq = equivalentes(monto, moneda, tc);
    data.montoOriginal = new Prisma.Decimal(monto);
    data.monedaOriginal = moneda;
    data.tcPropio = tcPropio == null ? null : new Prisma.Decimal(tcPropio);
    data.montoArs = eq.ars == null ? null : new Prisma.Decimal(eq.ars);
    data.montoUsd = eq.usd == null ? null : new Prisma.Decimal(eq.usd);
  }

  await prisma.$transaction(async (tx) => {
    const r = await tx.finRegistro.update({ where: { id }, data });
    // El aporte a la meta sigue al registro de ahorro (spec §4: fin_aportes_meta)
    await tx.finAporteMeta.deleteMany({ where: { registroId: id } });
    if (r.tipo === "ahorro" && r.metaId) {
      await tx.finAporteMeta.create({
        data: {
          metaId: r.metaId, mesId: r.mesId, registroId: id,
          montoOriginal: r.montoOriginal, monedaOriginal: r.monedaOriginal, montoArs: r.montoArs, montoUsd: r.montoUsd,
        },
      });
    }
  });
  // Si cambió algo del período, el resumen IA queda desactualizado (spec §9)
  await prisma.finResumenIa.updateMany({
    where: { desactualizado: false, periodoDesde: { lte: actual.fecha }, periodoHasta: { gte: actual.fecha } },
    data: { desactualizado: true },
  });
  return obtenerMovimiento(id);
}

// ─── Clasificar pendientes (spec §6.5) ──────────────────────────

// Palabras frecuentes → categoría inicial. La historia del usuario tiene prioridad.
const PALABRAS: [RegExp, string][] = [
  [/\b(super|supermercado|coto|dia|carrefour|jumbo|disco|chino|almacen|verduleria|carniceria|panaderia)\b/, "fincat_super"],
  [/\b(nafta|combustible|ypf|shell|axion|peaje|estacionamiento|lavadero|mecanico|service)\b/, "fincat_auto"],
  [/\b(uber|cabify|didi|taxi|remis|colectivo|subte|sube|tren)\b/, "fincat_transporte"],
  [/\b(delivery|rappi|pedidosya|restaurant|resto|bar|cafe|cerveza|birra|cine|salida|pizza|sushi|helado)\b/, "fincat_salidas"],
  [/\b(farmacia|medico|dentista|psicologo|prepaga|osde|swiss|analisis|remedio)\b/, "fincat_salud"],
  [/\b(netflix|spotify|disney|hbo|max|youtube|prime|icloud|google one|chatgpt|suscripcion)\b/, "fincat_suscripciones"],
  [/\b(veterinaria|vete|gato|gatos|perro|perros|piedras|alimento)\b/, "fincat_mascotas"],
  [/\b(luz|gas|agua|internet|celular|telefono|edenor|edesur|metrogas|aysa|personal|claro|movistar|fibertel)\b/, "fincat_servicios"],
  [/\b(alquiler|expensas|abl|inmobiliaria)\b/, "fincat_vivienda"],
  [/\b(ropa|zapatillas|peluqueria|barberia|perfume)\b/, "fincat_ropa"],
  [/\b(curso|libro|libros|facultad|colegio|universidad)\b/, "fincat_educacion"],
  [/\b(regalo|cumple|cumpleanos)\b/, "fincat_regalos"],
  [/\b(monotributo|afip|arca|contador|notebook|software)\b/, "fincat_trabajo"],
];

export async function pendientesDeClasificar() {
  const [pendientes, historia] = await Promise.all([
    prisma.finRegistro.findMany({ where: { categoriaId: null }, select: SELECT, orderBy: [{ fecha: "desc" }, { createdAt: "desc" }], take: 200 }),
    prisma.finRegistro.findMany({
      where: { categoriaId: { not: null }, descripcion: { not: null } },
      select: { descripcion: true, categoriaId: true, tipo: true },
      orderBy: { fecha: "desc" },
      take: 1000,
    }),
  ]);

  // Por descripción normalizada → categoría más usada
  const votos = new Map<string, Map<string, number>>();
  for (const h of historia) {
    const k = `${h.tipo}|${normalizar(h.descripcion)}`;
    const m = votos.get(k) ?? new Map<string, number>();
    m.set(h.categoriaId!, (m.get(h.categoriaId!) ?? 0) + 1);
    votos.set(k, m);
  }

  const activas = new Set((await prisma.finCategoria.findMany({ where: { activa: true }, select: { id: true } })).map((c) => c.id));
  const sugerir = (r: Fila): string | null => {
    const d = normalizar(r.descripcion);
    const v = votos.get(`${r.tipo}|${d}`);
    if (v) return Array.from(v.entries()).sort((a, b) => b[1] - a[1])[0][0];
    if (r.tipo === "ingreso") return "fincat_otros_ingresos";
    if (r.tipo === "ahorro") return "fincat_ahorro";
    const texto = `${d} ${normalizar(r.incluye)}`;
    return PALABRAS.find(([re]) => re.test(texto))?.[1] ?? null;
  };

  return pendientes.map((r) => {
    const s = sugerir(r);
    return { ...aMovimiento(r), sugerida: s && activas.has(s) ? s : null };
  });
}
