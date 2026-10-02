// Fechas del módulo, siempre en hora de Argentina. "anioMes" = "YYYY-MM".

export const TZ = "America/Argentina/Buenos_Aires";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// "YYYY-MM-DD" de hoy en Argentina
export function hoyISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

export function anioMesDe(fechaISO: string): string {
  return fechaISO.slice(0, 7);
}

export function anioMesActual(): string {
  return anioMesDe(hoyISO());
}

export function sumarMeses(anioMes: string, n: number): string {
  const [a, m] = anioMes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function diasDelMes(anioMes: string): number {
  const [a, m] = anioMes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

export function nombreMes(anioMes: string): string {
  return MESES[Number(anioMes.slice(5, 7)) - 1];
}

// Fecha de calendario ("YYYY-MM-DD") → Date a medianoche UTC, como la guarda Prisma en columnas @db.Date
export function fechaDB(fechaISO: string): Date {
  return new Date(`${fechaISO}T00:00:00.000Z`);
}

export function isoDeFechaDB(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Día de revisión configurado → día real del mes (0 = último día)
export function diaReal(anioMes: string, dia: number): number {
  const ultimo = diasDelMes(anioMes);
  return dia <= 0 || dia > ultimo ? ultimo : dia;
}
