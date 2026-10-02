// Mensajes de "valor inmediato" después de registrar algo desde la app (texto plano)
import { TIPO_LABEL, describirVencimiento, fmtFecha, fmtKm, resumenVehiculo } from "./core";

const kmL = (n: number) => n.toFixed(1).replace(".", ",");

export async function feedbackCarga(vehiculoId: string, cargaId: string, tanqueLleno: boolean, conKm: boolean): Promise<string[]> {
  const r = await resumenVehiculo(vehiculoId);
  if (!r) return [];
  const out: string[] = [];
  const punto = r.rendimientos.find(p => p.cargaId === cargaId);
  if (punto) {
    const prom = r.rendimientoProm;
    const comp = prom && r.rendimientos.length > 1
      ? punto.kmL >= prom * 1.03 ? " (mejor que tu promedio)" : punto.kmL <= prom * 0.9 ? " (por debajo de tu promedio)" : ""
      : "";
    out.push(`⛽ Rendimiento: ${kmL(punto.kmL)} km/L${comp}`);
  } else if (!tanqueLleno) {
    out.push("⛽ Carga parcial: el rendimiento se mide en la próxima con tanque lleno");
  } else if (!conKm) {
    out.push("⛽ Sin km no puedo medir el rendimiento de esta carga");
  } else if (!r.rendimientos.length) {
    out.push("⛽ Con la próxima carga de tanque lleno vas a ver tu km/L");
  }
  const prox = r.vencimientos.find(v => v.estado !== "sin_datos");
  if (prox?.estado === "vencido") out.push(`⚠️ ${prox.label} vencido: ${describirVencimiento(prox)}`);
  else if (prox) out.push(`${prox.emoji} Próximo ${prox.label.toLowerCase()}: ${describirVencimiento(prox)}`);
  return out;
}

export async function feedbackMantenimiento(vehiculoId: string, tipo: string): Promise<string[]> {
  const r = await resumenVehiculo(vehiculoId);
  const v = r?.vencimientos.find(x => x.tipo === tipo);
  if (!v || v.estado === "sin_datos") return [];
  const cuando: string[] = [];
  if (v.proxKm != null) cuando.push(`a los ${fmtKm(v.proxKm)} km`);
  if (v.proxFecha) cuando.push(`el ${fmtFecha(v.proxFecha)}`);
  return cuando.length ? [`📅 Próximo ${(TIPO_LABEL[tipo] ?? tipo).toLowerCase()}: ${cuando.join(" o ")}`] : [];
}
