import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Devuelve el mes, creándolo vacío si no existe. Clonar el presupuesto es parte de la apertura (spec §6.4), no de acá.
export async function obtenerMes(anioMes: string) {
  return prisma.finMes.upsert({ where: { anioMes }, update: {}, create: { anioMes } });
}

// Último tipo de cambio cargado antes de ese mes, para prellenar (spec §2.2.3)
export async function ultimoTipoCambio(anterioresA: string) {
  return prisma.finMes.findFirst({
    where: { anioMes: { lt: anterioresA }, tipoCambio: { not: null } },
    orderBy: { anioMes: "desc" },
    select: { anioMes: true, tipoCambio: true, fuenteTc: true },
  });
}

// Carga o edita el TC del mes y recalcula los equivalentes de ese mes (spec §3.5).
// Los registros con tc_propio no se tocan. La moneda original nunca cambia.
export async function actualizarTipoCambio(anioMes: string, tipoCambio: number, fuenteTc?: string | null) {
  const mes = await obtenerMes(anioMes);
  const tc = new Prisma.Decimal(tipoCambio);
  await prisma.$transaction([
    prisma.finMes.update({
      where: { id: mes.id },
      data: { tipoCambio: tc, ...(fuenteTc !== undefined ? { fuenteTc: fuenteTc || null } : {}) },
    }),
    ...["fin_registros", "fin_presupuesto_items", "fin_aportes_meta"].map((tabla) =>
      prisma.$executeRawUnsafe(
        `UPDATE "${tabla}" SET
           "monto_ars" = CASE WHEN "moneda_original" = 'USD' THEN ROUND("monto_original" * $1::numeric, 2) ELSE "monto_original" END,
           "monto_usd" = CASE WHEN "moneda_original" = 'ARS' THEN ROUND("monto_original" / $1::numeric, 2) ELSE "monto_original" END,
           "updated_at" = NOW()
         WHERE "mes_id" = $2${tabla === "fin_registros" ? ` AND "tc_propio" IS NULL` : ""}`,
        tc.toString(),
        mes.id
      )
    ),
    prisma.$executeRawUnsafe(
      `UPDATE "fin_patrimonio_snapshots" SET
         "saldo_ars" = CASE WHEN "moneda_original" = 'USD' THEN ROUND("saldo_original" * $1::numeric, 2) ELSE "saldo_original" END,
         "saldo_usd" = CASE WHEN "moneda_original" = 'ARS' THEN ROUND("saldo_original" / $1::numeric, 2) ELSE "saldo_original" END,
         "updated_at" = NOW()
       WHERE "mes_id" = $2`,
      tc.toString(),
      mes.id
    ),
  ]);
  return prisma.finMes.findUniqueOrThrow({ where: { id: mes.id } });
}
