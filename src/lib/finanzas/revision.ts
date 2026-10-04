// Revisión quincenal (spec §6.3): fijos y cuotas pendientes → variables → así vas.
// La revisión se guarda en fin_revisiones para retomarla donde quedó y medir adopción.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { equivalentes, type Moneda } from "./dinero";
import { anioMesActual, diasDelMes, diaReal, fechaDB, hoyISO, sumarMeses } from "./fechas";
import { obtenerMes, obtenerPreferencias, tcVigente } from "./meses";
import { datosPresupuesto } from "./presupuesto";

export type TipoRevision = "quincenal" | "cierre";
export type ModoRevision = "completo" | "expres";

const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : d.toNumber());

// Retoma la revisión en curso de ese tipo y mes, o crea una nueva.
// Sin modo, solo retoma: si no hay una en curso devuelve null (y la pantalla ofrece elegir completa o exprés).
export async function iniciarRevision(tipo: TipoRevision, anioMes: string, modo?: ModoRevision) {
  const desde = fechaDB(`${anioMes}-01`);
  const hasta = fechaDB(sumarMeses(anioMes, 1) + "-01");
  // Buscar y crear bajo un bloqueo: dos pedidos simultáneos (doble toque) no crean dos revisiones
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fin_revision:${tipo}:${anioMes}`}))`;
    const enCurso = await tx.finRevision.findFirst({
      where: { tipo, estado: "en_curso", fecha: { gte: desde, lt: hasta } },
      orderBy: { createdAt: "desc" },
    });
    if (enCurso) {
      return !modo || enCurso.modo === modo ? enCurso : tx.finRevision.update({ where: { id: enCurso.id }, data: { modo } });
    }
    if (!modo) return null;
    // La fecha de la revisión cae dentro del mes revisado (si se hace tarde, el último día de ese mes)
    const hoy = hoyISO();
    const fecha = hoy.startsWith(anioMes) ? hoy : hoy > anioMes ? `${anioMes}-${diasDelMes(anioMes)}` : `${anioMes}-01`;
    return tx.finRevision.create({ data: { tipo, modo, estado: "en_curso", pasoActual: 1, fecha: fechaDB(fecha) } });
  });
}

export async function actualizarRevision(id: string, c: { paso?: number; completar?: boolean; saltear?: boolean; modo?: ModoRevision }) {
  const r = await prisma.finRevision.findUnique({ where: { id } });
  if (!r) throw new Error("No encontré la revisión");
  const data: Prisma.FinRevisionUpdateInput = {};
  // Quincenal: pasos 1-3. Cierre + apertura: 1-5 cierre, 6-10 apertura
  if (c.paso !== undefined) data.pasoActual = Math.max(1, Math.min(r.tipo === "cierre" ? 10 : 3, Math.round(c.paso)));
  if (c.modo) data.modo = c.modo;
  if (c.completar) {
    data.estado = "completa";
    data.duracionSeg = Math.round((Date.now() - r.createdAt.getTime()) / 1000);
  }
  if (c.saltear) data.estado = "salteada";
  return prisma.finRevision.update({ where: { id }, data });
}

// Ítems fijos del mes sin registro real (spec §6.3 paso 1). Solo frecuencia mensual:
// los anuales/bimestrales se prevén por mes pero no se pagan todos los meses.
export async function pendientes(anioMes: string) {
  const mes = await obtenerMes(anioMes);
  const items = await prisma.finPresupuestoItem.findMany({
    where: { mesId: mes.id, activo: true, fijoVariable: "fijo", frecuencia: "mensual", origen: { not: "reasignacion" }, registros: { none: {} } },
    include: { categoria: { select: { nombre: true, icono: true, tipo: true } }, tarjeta: { select: { nombre: true } } },
    orderBy: [{ diaVencimiento: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  return items.map((i) => ({
    id: i.id,
    concepto: i.concepto,
    tipo: i.categoria.tipo,
    categoria: { nombre: i.categoria.nombre, icono: i.categoria.icono },
    monto: i.montoOriginal.toNumber(),
    moneda: i.monedaOriginal as Moneda,
    montoArs: num(i.montoArs),
    montoUsd: num(i.montoUsd),
    esCuota: i.origen === "cuotas",
    tarjeta: i.tarjeta?.nombre ?? null,
    diaVencimiento: i.diaVencimiento,
  }));
}

export type Pendiente = Awaited<ReturnType<typeof pendientes>>[number];

// Tocar el ítem = pagado con el monto previsto (o el editado). Devuelve qué registro creó cada ítem, para Deshacer.
// Si el ítem ya tenía un registro, no se duplica (y no aparece en la respuesta).
export async function marcarPagados(lista: { itemId: string; monto?: number | null }[], anioMes: string) {
  const hoy = hoyISO();
  const fecha = hoy.startsWith(anioMes) ? hoy : hoy > anioMes ? `${anioMes}-${diasDelMes(anioMes)}` : `${anioMes}-01`;
  const tc = await tcVigente(anioMes);
  const pagados: { itemId: string; registroId: string }[] = [];
  for (const { itemId, monto } of lista) {
    const it = await prisma.finPresupuestoItem.findUnique({
      where: { id: itemId },
      include: { categoria: true, planCuotas: true, registros: { select: { id: true }, take: 1 } },
    });
    if (!it || !it.activo || it.registros.length) continue; // ya estaba pagado: no duplicar
    const m = monto && monto > 0 ? monto : it.montoOriginal.toNumber();
    const eq = equivalentes(m, it.monedaOriginal as Moneda, tc);
    // Número de cuota según el mes del plan
    let cuotaNumero: number | null = null;
    if (it.planCuotas) {
      const [a0, m0] = it.planCuotas.mesPrimeraCuota.split("-").map(Number);
      const [a1, m1] = anioMes.split("-").map(Number);
      cuotaNumero = (a1 - a0) * 12 + (m1 - m0) + 1;
    }
    const r = await prisma.finRegistro.create({
      data: {
        mesId: it.mesId,
        fecha: fechaDB(fecha),
        tipo: it.categoria.tipo,
        categoriaId: it.categoriaId,
        presupuestoItemId: it.id,
        descripcion: it.concepto,
        montoOriginal: new Prisma.Decimal(m),
        monedaOriginal: it.monedaOriginal,
        montoArs: eq.ars == null ? null : new Prisma.Decimal(eq.ars),
        montoUsd: eq.usd == null ? null : new Prisma.Decimal(eq.usd),
        fijoVariable: it.fijoVariable,
        naturaleza: it.naturaleza,
        medioPago: it.medioPago,
        tarjetaId: it.tarjetaId,
        planCuotasId: it.planCuotasId,
        cuotaNumero,
        origen: it.origen === "cuotas" ? "cuotas" : "revision",
      },
    });
    pagados.push({ itemId, registroId: r.id });
  }
  return { pagados };
}

// Todo lo que muestra la revisión
export async function datosRevision(id: string) {
  const r = await prisma.finRevision.findUnique({ where: { id } });
  if (!r) return null;
  const anioMes = r.fecha.toISOString().slice(0, 7);
  const [pend, presupuesto, prefs] = await Promise.all([pendientes(anioMes), datosPresupuesto(anioMes), obtenerPreferencias()]);

  // Categorías variables con lo cargado hasta ahora ("Salidas: $0 cargado")
  const variables = presupuesto.grupos
    .filter((g) => g.tipo === "gasto" && g.items.some((i) => i.fijoVariable === "variable" && i.origen !== "reasignacion"))
    .map((g) => ({ id: g.id, nombre: g.nombre, icono: g.icono, previsto: g.previsto, real: g.real }));

  // Próxima revisión, para el cierre positivo
  const hoy = hoyISO();
  const diaHoy = Number(hoy.slice(8, 10));
  let proxima: string | null = null;
  for (const am of [anioMesActual(), sumarMeses(anioMesActual(), 1)]) {
    const dias = Array.from(new Set(prefs.diasRevision.map((d) => diaReal(am, d)))).sort((a, b) => a - b);
    const d = dias.find((x) => am !== anioMesActual() || x > diaHoy);
    if (d) { proxima = `${am}-${String(d).padStart(2, "0")}`; break; }
  }

  // Racha: revisiones seguidas completas (las exprés cuentan, spec §7.3)
  const ultimas = await prisma.finRevision.findMany({
    where: { estado: { in: ["completa", "salteada"] }, tipo: { not: "apertura" } },
    orderBy: { fecha: "desc" },
    take: 24,
    select: { estado: true },
  });
  let racha = 0;
  for (const u of ultimas) {
    if (u.estado !== "completa") break;
    racha++;
  }

  return {
    revision: { id: r.id, tipo: r.tipo, modo: r.modo, estado: r.estado, paso: r.pasoActual, anioMes },
    pendientes: pend,
    variables,
    presupuesto,
    proxima,
    racha,
  };
}

export type DatosRevision = NonNullable<Awaited<ReturnType<typeof datosRevision>>>;
