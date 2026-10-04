// Cierre de mes y apertura del siguiente (spec §6.4), encadenados en un solo asistente.
// Cierre: 1 fijos · 2 variables · 3 patrimonio · 4 aportes a metas · 5 el mes en una mirada
// Apertura: 6 tipo de cambio · 7 ajuste por inflación · 8 revisar presupuesto · 9 ahorro primero · 10 listo
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { equivalentes, sumarMontos, type Moneda } from "./dinero";
import { fechaDB, hoyISO, diasDelMes, sumarMeses } from "./fechas";
import { actualizarTipoCambio, obtenerMes, obtenerPreferencias, tcVigente } from "./meses";
import { clonarDesdeAnterior, datosPresupuesto } from "./presupuesto";

const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : d.toNumber());
const dec = (n: number | null) => (n == null ? null : new Prisma.Decimal(Math.round(n * 100) / 100));

export class ErrorCierre extends Error {}

// ─── Datos del asistente ────────────────────────────────────────

export async function datosCierre(anioMes: string) {
  const siguiente = sumarMeses(anioMes, 1);
  const [mes, mesSig, prefs] = await Promise.all([obtenerMes(anioMes), obtenerMes(siguiente), obtenerPreferencias()]);

  // Patrimonio: saldo de este cierre (si ya se cargó) y el del cierre anterior para prellenar
  const cuentas = await prisma.finCuenta.findMany({ where: { activa: true }, orderBy: [{ orden: "asc" }, { createdAt: "asc" }] });
  const snaps = await prisma.finPatrimonioSnapshot.findMany({
    where: { cuentaId: { in: cuentas.map((c) => c.id) }, mes: { anioMes: { lte: anioMes } } },
    include: { mes: { select: { anioMes: true } } },
    orderBy: { mes: { anioMes: "desc" } },
  });
  const cuentasOut = cuentas.map((c) => {
    const actual = snaps.find((s) => s.cuentaId === c.id && s.mes.anioMes === anioMes);
    const anterior = snaps.find((s) => s.cuentaId === c.id && s.mes.anioMes < anioMes);
    return {
      id: c.id, nombre: c.nombre, tipo: c.tipo, moneda: c.moneda as Moneda, icono: c.icono,
      saldoActual: num(actual?.saldoOriginal),
      saldoAnterior: num(anterior?.saldoOriginal),
      equivalente: actual ? { ars: num(actual.saldoArs), usd: num(actual.saldoUsd) } : null,
    };
  });
  const totalPatrimonio = (mesFiltro: (am: string) => boolean) => {
    const porCuenta = new Map<string, (typeof snaps)[number]>();
    for (const s of snaps) if (mesFiltro(s.mes.anioMes) && !porCuenta.has(s.cuentaId)) porCuenta.set(s.cuentaId, s);
    return sumarMontos(Array.from(porCuenta.values()).map((s) => ({ ars: num(s.saldoArs), usd: num(s.saldoUsd) })));
  };

  // Metas: lo aportado este mes y lo asignado en la apertura (ítem de ahorro con meta)
  const [metas, itemsAhorro, aportesMes, sinMeta] = await Promise.all([
    prisma.finMeta.findMany({ where: { activa: true }, orderBy: [{ tipo: "asc" }, { createdAt: "asc" }] }),
    prisma.finPresupuestoItem.findMany({ where: { mesId: mes.id, activo: true, categoria: { tipo: "ahorro" } } }),
    prisma.finAporteMeta.findMany({ where: { mesId: mes.id } }),
    prisma.finRegistro.findMany({ where: { mesId: mes.id, tipo: "ahorro", metaId: null }, select: { montoArs: true, montoUsd: true } }),
  ]);
  const metasOut = metas.map((m) => {
    const ap = aportesMes.filter((a) => a.metaId === m.id);
    const asignado = itemsAhorro.find((i) => i.metaId === m.id) ?? (metas.length === 1 ? itemsAhorro.find((i) => !i.metaId) : undefined);
    const moneda: Moneda = (m.moneda as Moneda | null) ?? (asignado?.monedaOriginal as Moneda | undefined) ?? "ARS";
    const aportado = sumarMontos(ap.map((a) => ({ ars: num(a.montoArs), usd: num(a.montoUsd) })));
    return {
      id: m.id, nombre: m.nombre, icono: m.icono, tipo: m.tipo, moneda,
      aportadoMes: moneda === "USD" ? aportado.usd ?? 0 : aportado.ars ?? 0,
      asignado: asignado ? { monto: asignado.montoOriginal.toNumber(), moneda: asignado.monedaOriginal as Moneda } : null,
    };
  });

  // Apertura: TC sugerido, ajuste por inflación y vista previa sobre los fijos en pesos
  const itemsMes = await prisma.finPresupuestoItem.findMany({
    where: { mesId: mes.id, activo: true, recurrente: true, origen: { notIn: ["cuotas", "reasignacion"] } },
    select: { montoOriginal: true, monedaOriginal: true, fijoVariable: true, categoria: { select: { tipo: true } } },
  });
  const fijosArs = itemsMes
    .filter((i) => i.monedaOriginal === "ARS" && i.fijoVariable === "fijo" && i.categoria.tipo === "gasto")
    .reduce((t, i) => t + i.montoOriginal.toNumber(), 0);
  const yaClonado = (await prisma.finPresupuestoItem.count({ where: { mesId: mesSig.id, origen: "clon" } })) > 0;
  const tieneItemsSig = (await prisma.finPresupuestoItem.count({ where: { mesId: mesSig.id, activo: true } })) > 0;

  return {
    anioMes,
    siguiente,
    estado: mes.estado,
    resumen: await datosPresupuesto(anioMes),
    cuentas: cuentasOut,
    patrimonio: { actual: totalPatrimonio((am) => am <= anioMes), anterior: totalPatrimonio((am) => am < anioMes) },
    metas: metasOut,
    ahorroSinMeta: sumarMontos(sinMeta.map((r) => ({ ars: num(r.montoArs), usd: num(r.montoUsd) }))),
    apertura: {
      tipoCambio: num(mesSig.tipoCambio),
      tcSugerido: num(mesSig.tipoCambio) ?? num(mes.tipoCambio),
      fuenteTc: mesSig.fuenteTc ?? mes.fuenteTc,
      ajusteSugerido: num(mesSig.ajusteInflacionPct) ?? num(prefs.ajusteInflacionDefault) ?? num(mes.ajusteInflacionPct) ?? 0,
      fijosArs,
      yaClonado,
      tieneItems: tieneItemsSig,
    },
  };
}

export type DatosCierre = Awaited<ReturnType<typeof datosCierre>>;

// ─── Cierre ─────────────────────────────────────────────────────

export async function crearCuenta(c: { nombre: string; tipo?: string; moneda?: Moneda; icono?: string | null }) {
  const nombre = c.nombre?.trim();
  if (!nombre) throw new ErrorCierre("Poné un nombre para la cuenta");
  const tipos = ["banco", "billetera", "efectivo", "broker", "cripto", "otro"] as const;
  const tipo = (tipos as readonly string[]).includes(c.tipo ?? "") ? (c.tipo as (typeof tipos)[number]) : "banco";
  const orden = await prisma.finCuenta.count();
  return prisma.finCuenta.create({ data: { nombre: nombre.slice(0, 40), tipo, moneda: c.moneda === "USD" ? "USD" : "ARS", icono: c.icono ?? null, orden } });
}

// Saldos al cierre (spec §6.4 paso 3). Un snapshot por cuenta y mes.
export async function guardarPatrimonio(anioMes: string, saldos: { cuentaId: string; saldo: number }[]) {
  const mes = await obtenerMes(anioMes);
  const tc = await tcVigente(anioMes);
  const cuentas = await prisma.finCuenta.findMany({ where: { id: { in: saldos.map((s) => s.cuentaId) } } });
  await prisma.$transaction(
    saldos.flatMap(({ cuentaId, saldo }) => {
      const c = cuentas.find((x) => x.id === cuentaId);
      if (!c || !isFinite(saldo)) return [];
      const eq = equivalentes(saldo, c.moneda as Moneda, tc);
      const data = { saldoOriginal: dec(saldo)!, monedaOriginal: c.moneda, saldoArs: dec(eq.ars), saldoUsd: dec(eq.usd) };
      return [prisma.finPatrimonioSnapshot.upsert({ where: { mesId_cuentaId: { mesId: mes.id, cuentaId } }, update: data, create: { mesId: mes.id, cuentaId, ...data } })];
    })
  );
}

// Aportes a metas (spec §6.4 paso 4): se confirma cuánto fue a cada meta este mes.
// Si falta: primero se asignan los ahorros del mes que no tenían meta; el resto, un registro de ahorro nuevo.
// Si sobra: un retiro (aporte negativo).
export async function confirmarAportes(anioMes: string, aportes: { metaId: string; monto: number; moneda: Moneda }[]) {
  const mes = await obtenerMes(anioMes);
  const tc = await tcVigente(anioMes);
  const fecha = (() => {
    const hoy = hoyISO();
    return hoy.startsWith(anioMes) ? hoy : `${anioMes}-${diasDelMes(anioMes)}`;
  })();

  for (const a of aportes) {
    const meta = await prisma.finMeta.findUnique({ where: { id: a.metaId } });
    if (!meta || !isFinite(a.monto) || a.monto < 0) continue;
    const enMoneda = (x: { montoArs: Prisma.Decimal | null; montoUsd: Prisma.Decimal | null }) => (a.moneda === "USD" ? num(x.montoUsd) : num(x.montoArs)) ?? 0;
    const actuales = await prisma.finAporteMeta.findMany({ where: { metaId: meta.id, mesId: mes.id } });
    let falta = Math.round((a.monto - actuales.reduce((t, x) => t + enMoneda(x), 0)) * 100) / 100;
    if (Math.abs(falta) < 0.01) continue;

    if (falta > 0) {
      // Ahorros del mes sin meta → a esta meta
      const libres = await prisma.finRegistro.findMany({ where: { mesId: mes.id, tipo: "ahorro", metaId: null }, orderBy: { fecha: "asc" } });
      for (const r of libres) {
        if (falta <= 0.01) break;
        if (enMoneda(r) > falta + 0.01) continue; // no se parte un registro
        await prisma.$transaction([
          prisma.finRegistro.update({ where: { id: r.id }, data: { metaId: meta.id } }),
          prisma.finAporteMeta.create({
            data: { metaId: meta.id, mesId: mes.id, registroId: r.id, montoOriginal: r.montoOriginal, monedaOriginal: r.monedaOriginal, montoArs: r.montoArs, montoUsd: r.montoUsd },
          }),
        ]);
        falta -= enMoneda(r);
      }
      if (falta > 0.01) {
        const eq = equivalentes(falta, a.moneda, tc);
        await prisma.$transaction(async (tx) => {
          const r = await tx.finRegistro.create({
            data: {
              mesId: mes.id, fecha: fechaDB(fecha), tipo: "ahorro", categoriaId: "fincat_ahorro", descripcion: `Aporte a ${meta.nombre}`,
              montoOriginal: dec(falta)!, monedaOriginal: a.moneda, montoArs: dec(eq.ars), montoUsd: dec(eq.usd),
              fijoVariable: "fijo", naturaleza: "esencial", metaId: meta.id, origen: "revision",
            },
          });
          await tx.finAporteMeta.create({
            data: { metaId: meta.id, mesId: mes.id, registroId: r.id, montoOriginal: r.montoOriginal, monedaOriginal: r.monedaOriginal, montoArs: r.montoArs, montoUsd: r.montoUsd },
          });
        });
      }
    } else {
      // Retiro: aporte negativo sin registro (spec §4: fin_aportes_meta admite negativos)
      const eq = equivalentes(falta, a.moneda, tc);
      await prisma.finAporteMeta.create({
        data: { metaId: meta.id, mesId: mes.id, montoOriginal: dec(falta)!, monedaOriginal: a.moneda, montoArs: dec(eq.ars), montoUsd: dec(eq.usd) },
      });
    }
  }
}

export async function cerrarMes(anioMes: string) {
  const mes = await obtenerMes(anioMes);
  return prisma.finMes.update({ where: { id: mes.id }, data: { estado: "cerrado", cerradoAt: new Date() } });
}

// ─── Apertura ───────────────────────────────────────────────────

// Paso 6 + 7: tipo de cambio y presupuesto clonado del mes que se cierra, con ajuste por inflación
export async function abrirMes(siguiente: string, c: { tipoCambio?: number | null; fuenteTc?: string | null; ajustePct?: number | null }) {
  if (c.tipoCambio && c.tipoCambio > 0) await actualizarTipoCambio(siguiente, c.tipoCambio, c.fuenteTc ?? null);
  if (c.ajustePct !== undefined) {
    const mesSig = await obtenerMes(siguiente);
    const yaClonado = (await prisma.finPresupuestoItem.count({ where: { mesId: mesSig.id, origen: "clon" } })) > 0;
    if (!yaClonado) await clonarDesdeAnterior(siguiente, Math.max(-50, Math.min(100, Number(c.ajustePct) || 0)));
    if (c.ajustePct) await obtenerPreferencias().then(() => prisma.finPreferencias.update({ where: { id: "user" }, data: { ajusteInflacionDefault: dec(Number(c.ajustePct)) } }));
  }
}

// Paso 9: ahorro primero — cuánto separar y a qué meta (ítem de ahorro del mes)
export async function configurarAhorro(anioMes: string, c: { monto: number; moneda: Moneda; metaId: string | null }) {
  const mes = await obtenerMes(anioMes);
  if (mes.estado === "cerrado") throw new ErrorCierre("El mes está cerrado");
  const tc = await tcVigente(anioMes);
  const eq = equivalentes(c.monto, c.moneda, tc);
  const meta = c.metaId ? await prisma.finMeta.findUnique({ where: { id: c.metaId } }) : null;
  const existente = await prisma.finPresupuestoItem.findFirst({ where: { mesId: mes.id, activo: true, categoria: { tipo: "ahorro" } }, orderBy: { createdAt: "asc" } });
  const data = {
    montoOriginal: dec(c.monto)!, monedaOriginal: c.moneda, montoArs: dec(eq.ars), montoUsd: dec(eq.usd),
    metaId: meta?.id ?? null, concepto: meta ? `Ahorro · ${meta.nombre}` : "Ahorro",
  };
  if (!(c.monto > 0)) {
    if (existente) await prisma.finPresupuestoItem.update({ where: { id: existente.id }, data: { activo: false } });
    return;
  }
  if (existente) await prisma.finPresupuestoItem.update({ where: { id: existente.id }, data });
  else await prisma.finPresupuestoItem.create({ data: { ...data, mesId: mes.id, categoriaId: "fincat_ahorro", fijoVariable: "fijo", naturaleza: "esencial", recurrente: true, origen: "manual" } });
}

// Fin del asistente: la revisión de cierre queda completa y se registra la apertura (para medir adopción)
export async function finalizarCierre(revisionId: string, siguiente: string) {
  const r = await prisma.finRevision.findUnique({ where: { id: revisionId } });
  if (!r) throw new ErrorCierre("No encontré la revisión");
  await prisma.$transaction([
    prisma.finRevision.update({
      where: { id: revisionId },
      data: { estado: "completa", pasoActual: 10, duracionSeg: Math.round((Date.now() - r.createdAt.getTime()) / 1000) },
    }),
    prisma.finRevision.create({ data: { tipo: "apertura", modo: r.modo, estado: "completa", pasoActual: 5, fecha: fechaDB(`${siguiente}-01`) } }),
  ]);
}

// Estado vacío del paso de metas: crear el fondo de emergencia con un toque (spec §7.1)
export async function crearFondoEmergencia() {
  const ya = await prisma.finMeta.findFirst({ where: { tipo: "fondo_emergencia", activa: true } });
  return ya ?? prisma.finMeta.create({ data: { nombre: "Fondo de emergencia", tipo: "fondo_emergencia", icono: "🛟", mesesCobertura: 6 } });
}
