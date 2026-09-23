// El seguro es un gasto mensual: cada mes se registra la cuota vigente como un Mantenimiento tipo "seguro"
import { prisma } from "@/lib/prisma";
import { escapeHtml } from "@/lib/telegram";
import { notificar } from "./canal";
import { fmtPesos, hoyYmd } from "./core";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function mesActual() {
  const [y, m] = hoyYmd().split("-").map(Number);
  return {
    desde: new Date(Date.UTC(y, m - 1, 1, 12)),
    hasta: new Date(Date.UTC(y, m, 1, 12)),
    nombre: MESES[m - 1],
  };
}

async function cuotaDelMes(vehiculoId: string) {
  const { desde, hasta } = mesActual();
  return prisma.mantenimiento.findFirst({
    where: { vehiculoId, tipo: "seguro", fecha: { gte: desde, lt: hasta } },
  });
}

// Fija la cuota vigente y la aplica al mes en curso. Si la informa el usuario, el mes queda verificado.
export async function actualizarSeguro(vehiculoId: string, monto: number | null, compania?: string | null, confirmado = true) {
  const data: { seguroMensual: number | null; seguroCompania?: string | null } = { seguroMensual: monto };
  if (compania !== undefined) data.seguroCompania = compania;
  const v = await prisma.vehiculo.update({ where: { id: vehiculoId }, data });
  if (monto == null) return v;

  const { desde } = mesActual();
  const existente = await cuotaDelMes(vehiculoId);
  const descripcion = `Cuota mensual${v.seguroCompania ? ` — ${v.seguroCompania}` : ""}`;
  if (existente) {
    await prisma.mantenimiento.update({
      where: { id: existente.id },
      data: { monto, descripcion, fuente: confirmado ? "confirmado" : existente.fuente },
    });
  } else {
    await prisma.mantenimiento.create({
      data: { vehiculoId, tipo: "seguro", fecha: desde, monto, descripcion, fuente: confirmado ? "confirmado" : "auto" },
    });
  }
  return v;
}

// Cuota del mes registrada automáticamente y todavía no verificada por el usuario
export async function seguroSinVerificar(vehiculoId: string) {
  const c = await cuotaDelMes(vehiculoId);
  return c && c.fuente === "auto" ? { monto: c.monto, mes: mesActual().nombre } : null;
}

export async function confirmarSeguroMes(vehiculoId: string) {
  const c = await cuotaDelMes(vehiculoId);
  if (c) await prisma.mantenimiento.update({ where: { id: c.id }, data: { fuente: "confirmado" } });
}

// Corre a diario: si arrancó un mes nuevo, registra la cuota y avisa para confirmar el monto
export async function registrarSegurosDelMes() {
  const vehiculos = await prisma.vehiculo.findMany({ where: { activo: true, seguroMensual: { not: null } } });
  const { nombre } = mesActual();
  let registrados = 0;
  for (const v of vehiculos) {
    if (await cuotaDelMes(v.id)) continue;
    await actualizarSeguro(v.id, v.seguroMensual, undefined, false);
    registrados++;
    await notificar(
      `🛡️ Registré el seguro de <b>${nombre}</b> de ${escapeHtml(v.alias)}: <b>${fmtPesos(v.seguroMensual!)}</b>.\n¿Cambió el monto?`,
      [[
        { text: "✓ Está bien", callback_data: `vsok:${v.id}` },
        { text: "✏️ Cambió el monto", callback_data: `vs:${v.id}` },
      ]],
    );
  }
  return { registrados };
}

// "45 lucas", "45.000", "45k", "1,2 palos" → número
export function parsearMonto(texto: string): number | null {
  const t = texto.toLowerCase().replace(/\$/g, "");
  const m = t.match(/(\d+(?:[.,]\d+)*)/);
  if (!m) return null;
  let s = m[1];
  // "45.000" o "1.200.000" usan punto de miles; "1,5" usa coma decimal
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else s = s.replace(/\./g, "").replace(",", ".");
  let n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  if (/palo|mill[oó]n/.test(t)) n *= 1_000_000;
  else if (/luca|mil\b|\d\s*k\b/.test(t)) n *= 1000;
  return Math.round(n);
}
