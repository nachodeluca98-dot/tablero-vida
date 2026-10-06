// Reglas de presentación de tareas compartidas entre pantallas (sin dependencias de servidor)

export const PUNTUAL = ["", "puntual", "una vez", "única"];

export function esRecurrente(t: any) {
  if (t.tipo === "Hábito") return true;
  if (!t.frecuencia) return false;
  return !PUNTUAL.includes(String(t.frecuencia).toLowerCase());
}

export function estaCompleta(t: any) {
  const e = String(t.estado || "").toLowerCase();
  return e.includes("complet") || e === "hecho" || e === "listo" || e === "subido";
}

const DIA = 86400000;
const inicioDia = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Días hasta la fecha (negativo = vencida), comparando días de calendario
export function diasHasta(fecha: string | Date) {
  return Math.round((+inicioDia(new Date(fecha)) - +inicioDia()) / DIA);
}

export function venceInfo(fecha?: string | null) {
  if (!fecha) return { txt: "sin fecha", color: "tx3", bg: "var(--bg3)", dias: null as number | null };
  const d = diasHasta(fecha);
  const fmt = new Date(fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  if (d < 0) return { txt: `vencida hace ${-d} d`, color: "red-t", bg: "var(--red-b)", dias: d };
  if (d === 0) return { txt: "hoy", color: "red-t", bg: "var(--red-b)", dias: d };
  if (d === 1) return { txt: "mañana", color: "amb-t", bg: "var(--amb-b)", dias: d };
  if (d <= 7) return { txt: `${fmt} · ${d} d`, color: "amb-t", bg: "var(--amb-b)", dias: d };
  return { txt: fmt, color: "tx2", bg: "var(--bg3)", dias: d };
}

// Lo que conviene mirar hoy: vencidas, con fecha hoy o en curso
export function esDeHoy(t: any) {
  if (estaCompleta(t) || esRecurrente(t) || t.caracterVisibilidad === "No aún") return false;
  const e = String(t.estado || "").toLowerCase();
  if (e === "hoy" || e.includes("progreso")) return true;
  if (t.fechaVencimiento && diasHasta(t.fechaVencimiento) <= 0) return true;
  if (t.fechaInicio && diasHasta(t.fechaInicio) === 0) return true;
  return false;
}

// Fecha de hoy al mediodía local, para guardar como "vence hoy" sin que se corra de día
export function hoyMediodiaISO() {
  const d = inicioDia();
  d.setHours(12);
  return d.toISOString();
}
