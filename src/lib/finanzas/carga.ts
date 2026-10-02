// Carga de movimientos (spec §6.2): datos para la pantalla, borradores desde el parser, guardado y deshacer.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Borrador, MEDIOS_PAGO, MedioPago, nuevaKey } from "./borrador";
import { equivalentes } from "./dinero";
import { anioMesActual, fechaDB, hoyISO, isoDeFechaDB, mesImputacion, sumarMeses } from "./fechas";
import { obtenerMes } from "./meses";
import type { ContextoParser, RegistroParseado } from "./parser";

const norm = (s: string | null | undefined) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// ─── Datos para la pantalla de carga ────────────────────────────

export async function datosCarga() {
  const anioMes = anioMesActual();
  const desde = fechaDB(`${sumarMeses(anioMes, -3)}-01`);

  const [categorias, usos, tarjetas, metas, recientes, mes] = await Promise.all([
    prisma.finCategoria.findMany({ where: { activa: true }, orderBy: [{ tipo: "asc" }, { orden: "asc" }] }),
    prisma.finRegistro.groupBy({ by: ["categoriaId"], where: { fecha: { gte: desde }, categoriaId: { not: null } }, _count: true }),
    prisma.finTarjeta.findMany({ where: { activa: true }, orderBy: [{ esDefault: "desc" }, { createdAt: "asc" }] }),
    prisma.finMeta.findMany({ where: { activa: true }, select: { id: true, nombre: true, icono: true, tipo: true } }),
    prisma.finRegistro.findMany({
      where: { fecha: { gte: desde }, tipo: "gasto", categoriaId: { not: null }, descripcion: { not: null }, planCuotasId: null },
      select: { descripcion: true, categoriaId: true, fecha: true },
      orderBy: { fecha: "desc" },
      take: 300,
    }),
    obtenerMes(anioMes),
  ]);

  const usoPorCat = new Map(usos.map((u) => [u.categoriaId, u._count]));
  const cats = categorias
    .map((c) => ({ id: c.id, nombre: c.nombre, icono: c.icono, tipo: c.tipo, usos: usoPorCat.get(c.id) ?? 0, orden: c.orden }))
    .sort((a, b) => (a.tipo === b.tipo ? b.usos - a.usos || a.orden - b.orden : a.tipo === "gasto" ? -1 : b.tipo === "gasto" ? 1 : 0));

  // Atajos: los 4 conceptos más usados, priorizando el mes en curso (spec §6.2)
  const conteo = new Map<string, { descripcion: string; categoriaId: string; n: number }>();
  for (const r of recientes) {
    const k = `${norm(r.descripcion)}|${r.categoriaId}`;
    const peso = isoDeFechaDB(r.fecha).startsWith(anioMes) ? 3 : 1;
    const prev = conteo.get(k);
    if (prev) prev.n += peso;
    else conteo.set(k, { descripcion: r.descripcion!, categoriaId: r.categoriaId!, n: peso });
  }
  const atajos = Array.from(conteo.values()).sort((a, b) => b.n - a.n).slice(0, 4).map(({ descripcion, categoriaId }) => ({ descripcion, categoriaId }));

  return {
    hoy: hoyISO(),
    tipoCambio: mes.tipoCambio?.toNumber() ?? null,
    categorias: cats,
    tarjetas: tarjetas.map((t) => ({ id: t.id, nombre: t.nombre, diaCierre: t.diaCierre, esDefault: t.esDefault })),
    metas,
    atajos,
  };
}

export type DatosCarga = Awaited<ReturnType<typeof datosCarga>>;

// ─── Contexto para el parser ────────────────────────────────────

export async function contextoParser(): Promise<ContextoParser> {
  const anioMes = anioMesActual();
  const [mes, categorias, tarjetas, metas] = await Promise.all([
    obtenerMes(anioMes),
    prisma.finCategoria.findMany({ where: { activa: true }, select: { id: true, nombre: true, tipo: true } }),
    prisma.finTarjeta.findMany({ where: { activa: true }, select: { nombre: true } }),
    prisma.finMeta.findMany({ where: { activa: true }, select: { nombre: true } }),
  ]);
  const items = await prisma.finPresupuestoItem.findMany({
    where: { mesId: mes.id, activo: true },
    select: { id: true, concepto: true, categoriaId: true },
  });
  return {
    fechaActual: hoyISO(),
    tipoCambio: mes.tipoCambio?.toNumber() ?? null,
    categorias,
    itemsPresupuesto: items.map((i) => ({ id: i.id, concepto: i.concepto, categoria_id: i.categoriaId })),
    tarjetas: tarjetas.map((t) => t.nombre),
    metas: metas.map((m) => m.nombre),
  };
}

// Borrador → forma que entiende el parser en modo corrección
export function aParseado(b: Borrador, tarjetas: { id: string; nombre: string }[], metas: { id: string; nombre: string }[]): RegistroParseado {
  return {
    tipo: b.tipo,
    descripcion: b.descripcion,
    incluye: b.incluye,
    monto: b.monto,
    moneda: b.moneda,
    es_aproximado: b.esAproximado,
    categoria_id: b.categoriaId,
    presupuesto_item_id: b.presupuestoItemId,
    medio_pago: b.medioPago,
    tarjeta: tarjetas.find((t) => t.id === b.tarjetaId)?.nombre ?? null,
    cuotas_total: b.cuotasTotal,
    compartido: b.compartido,
    nota_compartido: b.notaCompartido,
    meta: metas.find((m) => m.id === b.metaId)?.nombre ?? null,
    fecha: b.fecha,
  };
}

// ─── Del parser a borradores ────────────────────────────────────

function buscarPorNombre<T extends { nombre: string }>(lista: T[], nombre: string | null): T | null {
  if (!nombre) return null;
  const n = norm(nombre);
  return lista.find((x) => norm(x.nombre) === n) ?? lista.find((x) => norm(x.nombre).includes(n) || n.includes(norm(x.nombre))) ?? null;
}

export async function aBorradores(parseados: RegistroParseado[]): Promise<Borrador[]> {
  const hoy = hoyISO();
  const [categorias, tarjetas, metas] = await Promise.all([
    prisma.finCategoria.findMany({ where: { activa: true }, select: { id: true } }),
    prisma.finTarjeta.findMany({ where: { activa: true }, orderBy: [{ esDefault: "desc" }, { createdAt: "asc" }] }),
    prisma.finMeta.findMany({ where: { activa: true }, select: { id: true, nombre: true } }),
  ]);
  const catIds = new Set(categorias.map((c) => c.id));

  const borradores = parseados.map((p): Borrador => {
    const medio = (MEDIOS_PAGO as readonly string[]).includes(p.medio_pago ?? "") ? (p.medio_pago as MedioPago) : null;
    let tarjeta = medio === "tarjeta_credito" || p.tarjeta ? buscarPorNombre(tarjetas, p.tarjeta) : null;
    // Medio tarjeta sin especificar → tarjeta default (spec §6.2)
    if (!tarjeta && (medio === "tarjeta_credito" || p.tarjeta)) tarjeta = tarjetas[0] ?? null;
    const medioFinal: MedioPago | null = p.tarjeta ? "tarjeta_credito" : medio;
    const fecha = p.fecha && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) && p.fecha <= hoy ? p.fecha : hoy;
    const cuotas = p.cuotas_total && p.cuotas_total > 1 ? Math.min(p.cuotas_total, 60) : null;
    return {
      key: nuevaKey(),
      tipo: p.tipo,
      descripcion: p.descripcion?.trim() || null,
      incluye: p.incluye?.trim() || null,
      monto: p.monto != null && p.monto > 0 ? p.monto : null,
      moneda: p.moneda === "USD" ? "USD" : "ARS",
      esAproximado: !!p.es_aproximado,
      categoriaId: p.categoria_id && catIds.has(p.categoria_id) ? p.categoria_id : null,
      presupuestoItemId: p.presupuesto_item_id || null,
      medioPago: medioFinal,
      tarjetaId: tarjeta?.id ?? null,
      cuotasTotal: medioFinal === "tarjeta_credito" ? cuotas : null,
      compartido: !!p.compartido,
      notaCompartido: p.nota_compartido?.trim() || null,
      metaId: p.tipo === "ahorro" ? buscarPorNombre(metas, p.meta)?.id ?? null : null,
      fecha,
      mesImputacion: mesImputacion(fecha, medioFinal, tarjeta?.diaCierre),
      mesImputacionManual: false,
    };
  });

  return marcarDuplicados(borradores);
}

// ─── Duplicados (spec §6.2 y §12) ───────────────────────────────

async function itemVinculable(b: Borrador, mesId: string) {
  if (!b.categoriaId && !b.presupuestoItemId) return null;
  if (b.presupuestoItemId) {
    const it = await prisma.finPresupuestoItem.findFirst({ where: { id: b.presupuestoItemId, mesId, activo: true } });
    if (it) return it;
  }
  if (!b.categoriaId) return null;
  const items = await prisma.finPresupuestoItem.findMany({ where: { mesId, categoriaId: b.categoriaId, activo: true } });
  const d = norm(b.descripcion);
  return (
    items.find((i) => d && (d.includes(norm(i.concepto)) || norm(i.concepto).includes(d))) ??
    (items.length === 1 ? items[0] : null)
  );
}

export async function marcarDuplicados(borradores: Borrador[]): Promise<Borrador[]> {
  return Promise.all(
    borradores.map(async (b) => {
      if (b.monto == null) return { ...b, duplicado: null };
      const mes = await prisma.finMes.findUnique({ where: { anioMes: b.mesImputacion } });

      // Fijo ya confirmado en el mes
      if (mes && b.tipo === "gasto") {
        const item = await itemVinculable(b, mes.id);
        if (item && item.fijoVariable === "fijo") {
          const yaPagado = await prisma.finRegistro.findFirst({ where: { presupuestoItemId: item.id, mesId: mes.id } });
          if (yaPagado) return { ...b, presupuestoItemId: b.presupuestoItemId ?? item.id, duplicado: `${item.concepto} ya figura pagado este mes` };
        }
      }

      // Mismo monto y categoría en fecha cercana (incluye lo que viene de Vehículos)
      const f = fechaDB(b.fecha);
      const parecido = await prisma.finRegistro.findFirst({
        where: {
          tipo: b.tipo,
          monedaOriginal: b.moneda,
          montoOriginal: new Prisma.Decimal(b.monto),
          ...(b.categoriaId ? { categoriaId: b.categoriaId } : {}),
          fecha: { gte: new Date(f.getTime() - 3 * 864e5), lte: new Date(f.getTime() + 3 * 864e5) },
        },
        select: { descripcion: true, fecha: true, origen: true },
      });
      if (parecido) {
        const de = parecido.origen === "modulo_vehiculos" ? " (desde Vehículos)" : "";
        return { ...b, duplicado: `Ya cargaste algo igual el ${isoDeFechaDB(parecido.fecha).slice(8, 10)}/${isoDeFechaDB(parecido.fecha).slice(5, 7)}${de}` };
      }
      return { ...b, duplicado: null };
    })
  );
}

// ─── Guardar ────────────────────────────────────────────────────

// TC para convertir: el del mes de imputación; si todavía no tiene, el último cargado (se recalcula al cargarlo)
async function tcPara(anioMes: string): Promise<number | null> {
  const m = await prisma.finMes.findFirst({
    where: { anioMes: { lte: anioMes }, tipoCambio: { not: null } },
    orderBy: { anioMes: "desc" },
    select: { tipoCambio: true },
  });
  return m?.tipoCambio?.toNumber() ?? null;
}

export type Origen = "app_voz" | "app_rapida" | "app_formulario";

export type ResultadoGuardado = { ids: string[]; planes: { registroId: string; texto: string }[] };

export async function guardarBorradores(borradores: Borrador[], origen: Origen, transcripcion?: string | null): Promise<ResultadoGuardado> {
  const validos = borradores.filter((b) => b.monto != null && b.monto > 0);
  const tarjetas = await prisma.finTarjeta.findMany({ where: { activa: true }, orderBy: [{ esDefault: "desc" }, { createdAt: "asc" }] });
  const categorias = await prisma.finCategoria.findMany({ select: { id: true, fijoVariableDefault: true, naturalezaDefault: true } });
  const catPorId = new Map(categorias.map((c) => [c.id, c]));

  const ids: string[] = [];
  const planes: ResultadoGuardado["planes"] = [];

  for (const b of validos) {
    // Medio tarjeta sin tarjeta → la default
    const tarjeta =
      b.medioPago === "tarjeta_credito" ? tarjetas.find((t) => t.id === b.tarjetaId) ?? tarjetas[0] ?? null : null;
    const anioMes = b.mesImputacionManual ? b.mesImputacion : mesImputacion(b.fecha, b.medioPago, tarjeta?.diaCierre);
    const mes = await obtenerMes(anioMes);
    const tc = await tcPara(anioMes);
    const item = b.tipo === "gasto" || b.tipo === "ingreso" ? await itemVinculable(b, mes.id) : null;
    const cat = b.categoriaId ? catPorId.get(b.categoriaId) : undefined;

    const cuotas = b.medioPago === "tarjeta_credito" && b.cuotasTotal && b.cuotasTotal > 1 ? b.cuotasTotal : null;
    const montoRegistro = cuotas ? Math.round((b.monto! / cuotas) * 100) / 100 : b.monto!;
    const eq = equivalentes(montoRegistro, b.moneda, tc);

    const base = {
      fecha: fechaDB(b.fecha),
      tipo: b.tipo,
      categoriaId: b.categoriaId,
      presupuestoItemId: item?.id ?? null,
      incluye: b.incluye,
      montoOriginal: new Prisma.Decimal(montoRegistro),
      monedaOriginal: b.moneda,
      montoArs: eq.ars == null ? null : new Prisma.Decimal(eq.ars),
      montoUsd: eq.usd == null ? null : new Prisma.Decimal(eq.usd),
      esAproximado: b.esAproximado,
      fijoVariable: item?.fijoVariable ?? (cuotas ? "fijo" : cat?.fijoVariableDefault) ?? null,
      naturaleza: item?.naturaleza ?? cat?.naturalezaDefault ?? null,
      medioPago: b.medioPago,
      tarjetaId: tarjeta?.id ?? null,
      compartido: b.compartido,
      notaCompartido: b.compartido ? b.notaCompartido : null,
      metaId: b.tipo === "ahorro" ? b.metaId : null,
      origen,
      transcripcion: origen === "app_voz" ? transcripcion ?? null : null,
    } as const;

    const id = await prisma.$transaction(async (tx) => {
      const reg = await tx.finRegistro.create({
        data: {
          ...base,
          mesId: mes.id,
          descripcion: cuotas ? `${b.descripcion || "Compra"} (cuota 1/${cuotas})` : b.descripcion,
          cuotaNumero: cuotas ? 1 : null,
        },
      });

      // Aporte a la meta (spec §4: fin_aportes_meta)
      if (b.tipo === "ahorro" && b.metaId) {
        await tx.finAporteMeta.create({
          data: { metaId: b.metaId, mesId: mes.id, registroId: reg.id, montoOriginal: base.montoOriginal, monedaOriginal: b.moneda, montoArs: base.montoArs, montoUsd: base.montoUsd },
        });
      }

      // Cuotas (spec §3.4): plan + un ítem fijo en cada mes afectado; la cuota 1 ya queda como registro
      if (cuotas) {
        const plan = await tx.finPlanCuotas.create({
          data: {
            descripcion: b.descripcion || "Compra en cuotas",
            categoriaId: b.categoriaId,
            tarjetaId: tarjeta?.id ?? null,
            montoCuota: base.montoOriginal,
            moneda: b.moneda,
            cuotasTotal: cuotas,
            mesPrimeraCuota: anioMes,
            registroOrigenId: reg.id,
          },
        });
        const categoriaItem = b.categoriaId ?? "fincat_varios";
        for (let n = 1; n <= cuotas; n++) {
          const am = sumarMeses(anioMes, n - 1);
          const mesN = n === 1 ? mes : await tx.finMes.upsert({ where: { anioMes: am }, update: {}, create: { anioMes: am } });
          const tcN = n === 1 ? tc : await tcPara(am);
          const eqN = equivalentes(montoRegistro, b.moneda, tcN);
          const it = await tx.finPresupuestoItem.create({
            data: {
              mesId: mesN.id,
              categoriaId: categoriaItem,
              concepto: `${b.descripcion || "Compra"} (cuota ${n}/${cuotas})`,
              montoOriginal: base.montoOriginal,
              monedaOriginal: b.moneda,
              montoArs: eqN.ars == null ? null : new Prisma.Decimal(eqN.ars),
              montoUsd: eqN.usd == null ? null : new Prisma.Decimal(eqN.usd),
              recurrente: false,
              fijoVariable: "fijo",
              naturaleza: base.naturaleza ?? "discrecional",
              medioPago: "tarjeta_credito",
              tarjetaId: tarjeta?.id ?? null,
              origen: "cuotas",
              planCuotasId: plan.id,
            },
          });
          if (n === 1) await tx.finRegistro.update({ where: { id: reg.id }, data: { planCuotasId: plan.id, presupuestoItemId: it.id } });
        }
        const hasta = sumarMeses(anioMes, cuotas - 1);
        planes.push({ registroId: reg.id, texto: `${cuotas} cuotas, hasta ${nombreCorto(hasta)}` });
      }
      return reg.id;
    });
    ids.push(id);
  }

  if (ids.length) await marcarResumenesDesactualizados(validos.map((b) => b.fecha));
  return { ids, planes };
}

function nombreCorto(anioMes: string) {
  const m = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(anioMes.slice(5, 7)) - 1];
  return `${m} ${anioMes.slice(2, 4)}`;
}

// Si cambian registros de un período, su resumen IA queda desactualizado (spec §9)
async function marcarResumenesDesactualizados(fechas: string[]) {
  if (!fechas.length) return;
  await prisma.finResumenIa.updateMany({
    where: { desactualizado: false, OR: fechas.map((f) => ({ periodoDesde: { lte: fechaDB(f) }, periodoHasta: { gte: fechaDB(f) } })) },
    data: { desactualizado: true },
  });
}

// Deshacer: borra los registros recién guardados y lo que generaron (planes de cuotas con sus ítems, aportes)
export async function deshacerRegistros(ids: string[]) {
  if (!ids.length) return 0;
  return prisma.$transaction(async (tx) => {
    await tx.finPlanCuotas.deleteMany({ where: { registroOrigenId: { in: ids } } }); // ítems en cascada
    await tx.finAporteMeta.deleteMany({ where: { registroId: { in: ids } } });
    const r = await tx.finRegistro.deleteMany({ where: { id: { in: ids } } });
    return r.count;
  });
}
