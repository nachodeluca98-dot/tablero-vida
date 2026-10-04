// Borrador de un movimiento: lo que se muestra como tarjeta editable antes de guardar (spec §6.2).
// Se usa en servidor y en cliente: no importar Prisma acá.

import type { Moneda } from "./dinero";

export const MEDIOS_PAGO = ["efectivo", "debito", "transferencia", "billetera", "tarjeta_credito"] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];
export type TipoMov = "gasto" | "ingreso" | "ahorro";

export const MEDIO_LABEL: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  debito: "Débito",
  transferencia: "Transferencia",
  billetera: "Billetera",
  tarjeta_credito: "Tarjeta",
};

export type Borrador = {
  key: string; // id local de la tarjeta en pantalla
  tipo: TipoMov;
  descripcion: string | null;
  incluye: string | null;
  monto: number | null; // total; en cuotas, el total de la compra
  moneda: Moneda;
  esAproximado: boolean;
  categoriaId: string | null;
  presupuestoItemId: string | null;
  medioPago: MedioPago | null;
  tarjetaId: string | null;
  cuotasTotal: number | null;
  compartido: boolean;
  notaCompartido: string | null;
  metaId: string | null;
  fecha: string; // YYYY-MM-DD
  mesImputacion: string; // YYYY-MM
  mesImputacionManual: boolean; // el usuario lo cambió: no recalcular
  // Avisos calculados por el servidor (no se guardan)
  duplicado?: string | null;
};

export function nuevaKey(): string {
  return Math.random().toString(36).slice(2, 10);
}
