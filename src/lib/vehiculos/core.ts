import { prisma } from "@/lib/prisma";
import type { CargaCombustible, Mantenimiento, ReglaMantenimiento, Vehiculo } from "@prisma/client";

export const TZ = "America/Argentina/Buenos_Aires";
const DIA = 86400000;

export const TIPOS_MANT = ["service", "aceite", "neumaticos", "vtv", "seguro", "patente", "reparacion", "otro"] as const;
export type TipoMant = (typeof TIPOS_MANT)[number];

export const TIPO_LABEL: Record<string, string> = {
  service: "Service",
  aceite: "Aceite y filtro",
  neumaticos: "Rotación de neumáticos",
  vtv: "VTV",
  seguro: "Seguro",
  patente: "Patente",
  reparacion: "Reparación",
  otro: "Otro",
};

export const TIPO_EMOJI: Record<string, string> = {
  service: "🔧", aceite: "🛢️", neumaticos: "🛞", vtv: "📋",
  seguro: "🛡️", patente: "🧾", reparacion: "🔩", otro: "📌",
};

export function hoyYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

// Fechas "de calendario" se guardan al mediodía UTC para que no se corran de día por zona horaria
export function fechaDesdeYmd(ymd?: string | null): Date {
  const s = ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : hoyYmd();
  return new Date(`${s}T12:00:00Z`);
}

export function fmtFecha(d: Date) {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" });
}

export function fmtKm(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}

export function fmtPesos(n: number) {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

export function sumarMeses(d: Date, meses: number) {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + meses);
  return r;
}

// ─── Rendimiento (método tanque lleno a tanque lleno) ──────────────

export type PuntoRendimiento = { cargaId: string; fecha: Date; kmL: number; km: number; litros: number };

export function calcularRendimientos(cargas: CargaCombustible[]): PuntoRendimiento[] {
  const orden = [...cargas]
    .filter(c => c.odometro != null)
    .sort((a, b) => a.odometro! - b.odometro!);
  const out: PuntoRendimiento[] = [];
  let ultimoLleno: CargaCombustible | null = null;
  let litrosDesde = 0;
  for (const c of orden) {
    if (ultimoLleno) litrosDesde += c.litros;
    if (c.tanqueLleno) {
      if (ultimoLleno && litrosDesde > 0) {
        const km = c.odometro! - ultimoLleno.odometro!;
        if (km > 0) out.push({ cargaId: c.id, fecha: c.fecha, kmL: km / litrosDesde, km, litros: litrosDesde });
      }
      ultimoLleno = c;
      litrosDesde = 0;
    }
  }
  return out;
}

export function rendimientoPromedio(puntos: PuntoRendimiento[]): number | null {
  const km = puntos.reduce((s, p) => s + p.km, 0);
  const l = puntos.reduce((s, p) => s + p.litros, 0);
  return l > 0 ? km / l : null;
}

// ─── Kilometraje estimado ──────────────────────────────────────────

type Lectura = { fecha: Date; odometro: number };

export function lecturasOdometro(cargas: CargaCombustible[], mants: Mantenimiento[]): Lectura[] {
  return [
    ...cargas.filter(c => c.odometro != null).map(c => ({ fecha: c.fecha, odometro: c.odometro! })),
    ...mants.filter(m => m.odometro != null).map(m => ({ fecha: m.fecha, odometro: m.odometro! })),
  ].sort((a, b) => +a.fecha - +b.fecha);
}

// Promedio de km/día usando las lecturas de los últimos 120 días (o las dos últimas si no alcanza)
export function kmPorDia(lecturas: Lectura[]): number | null {
  if (lecturas.length < 2) return null;
  const ultima = lecturas[lecturas.length - 1];
  const desde = +ultima.fecha - 120 * DIA;
  let primera = lecturas.find(l => +l.fecha >= desde) ?? lecturas[0];
  if (primera === ultima) primera = lecturas[lecturas.length - 2];
  const dias = (+ultima.fecha - +primera.fecha) / DIA;
  const km = ultima.odometro - primera.odometro;
  if (dias < 1 || km <= 0) return null;
  return km / dias;
}

export function kmEstimadoHoy(v: Vehiculo, kmDia: number | null): number | null {
  if (v.kmActual == null) return null;
  if (!kmDia || !v.kmActualFecha) return v.kmActual;
  const dias = Math.max(0, (Date.now() - +v.kmActualFecha) / DIA);
  return Math.round(v.kmActual + kmDia * dias);
}

// ─── Vencimientos ──────────────────────────────────────────────────

export type Estado = "vencido" | "proximo" | "ok" | "sin_datos";

export type Vencimiento = {
  tipo: string;
  label: string;
  emoji: string;
  estado: Estado;
  proxFecha: Date | null;
  proxKm: number | null;
  diasRestantes: number | null;
  kmRestantes: number | null;
  // días hasta el vencimiento más cercano (por fecha o proyectando km), para ordenar por urgencia
  urgencia: number;
  ultimo: Mantenimiento | null;
};

export async function reglasEfectivas(vehiculoId: string): Promise<ReglaMantenimiento[]> {
  const reglas = await prisma.reglaMantenimiento.findMany({
    where: { OR: [{ vehiculoId: null }, { vehiculoId }] },
  });
  const porTipo = new Map<string, ReglaMantenimiento>();
  for (const r of reglas) {
    if (!porTipo.has(r.tipo) || r.vehiculoId) porTipo.set(r.tipo, r);
  }
  return Array.from(porTipo.values()).filter(r => r.activa);
}

export function calcularVencimientos(
  reglas: ReglaMantenimiento[],
  mants: Mantenimiento[],
  kmHoy: number | null,
  kmDia: number | null,
): Vencimiento[] {
  const ahora = Date.now();
  return reglas.map(r => {
    const ultimo = mants
      .filter(m => m.tipo === r.tipo)
      .sort((a, b) => +b.fecha - +a.fecha)[0] ?? null;

    let proxFecha: Date | null = null;
    let proxKm: number | null = null;
    if (ultimo) {
      proxFecha = ultimo.venceFecha ?? (r.cadaMeses ? sumarMeses(ultimo.fecha, r.cadaMeses) : null);
      proxKm = ultimo.venceOdometro ?? (r.cadaKm && ultimo.odometro != null ? ultimo.odometro + r.cadaKm : null);
    }

    const diasRestantes = proxFecha ? Math.ceil((+proxFecha - ahora) / DIA) : null;
    const kmRestantes = proxKm != null && kmHoy != null ? proxKm - kmHoy : null;

    const candidatos: number[] = [];
    if (diasRestantes != null) candidatos.push(diasRestantes);
    // sin historial suficiente para estimar km/día, asumimos ~30 km/día solo para ordenar
    if (kmRestantes != null) candidatos.push(kmRestantes / (kmDia || 30));
    const urgencia = candidatos.length ? Math.min(...candidatos) : Infinity;

    let estado: Estado = "sin_datos";
    if (diasRestantes != null || kmRestantes != null) {
      const vencido = (diasRestantes != null && diasRestantes < 0) || (kmRestantes != null && kmRestantes < 0);
      const proximo =
        (diasRestantes != null && diasRestantes <= r.avisoDiasAntes) ||
        (kmRestantes != null && kmRestantes <= r.avisoKmAntes);
      estado = vencido ? "vencido" : proximo ? "proximo" : "ok";
    }

    return {
      tipo: r.tipo,
      label: TIPO_LABEL[r.tipo] ?? r.tipo,
      emoji: TIPO_EMOJI[r.tipo] ?? "📌",
      estado, proxFecha, proxKm, diasRestantes, kmRestantes, urgencia, ultimo,
    };
  }).sort((a, b) => a.urgencia - b.urgencia);
}

export function describirVencimiento(v: Vencimiento): string {
  if (v.estado === "sin_datos") return "sin registro previo";
  const partes: string[] = [];
  if (v.kmRestantes != null) {
    partes.push(v.kmRestantes < 0 ? `pasado por ${fmtKm(-v.kmRestantes)} km` : `en ${fmtKm(v.kmRestantes)} km`);
  }
  if (v.diasRestantes != null && v.proxFecha) {
    partes.push(
      v.diasRestantes < 0 ? `venció el ${fmtFecha(v.proxFecha)}`
        : v.diasRestantes === 0 ? "vence hoy"
        : `el ${fmtFecha(v.proxFecha)} (${v.diasRestantes} d)`,
    );
  }
  return partes.join(" · ");
}

// ─── Resumen completo de un vehículo ───────────────────────────────

export async function resumenVehiculo(vehiculoId: string) {
  const v = await prisma.vehiculo.findUnique({
    where: { id: vehiculoId },
    include: {
      cargas: { orderBy: { fecha: "desc" } },
      mantenimientos: { orderBy: { fecha: "desc" } },
    },
  });
  if (!v) return null;
  const lecturas = lecturasOdometro(v.cargas, v.mantenimientos);
  const kmDia = kmPorDia(lecturas);
  const kmHoy = kmEstimadoHoy(v, kmDia);
  const rendimientos = calcularRendimientos(v.cargas);
  const reglas = await reglasEfectivas(v.id);
  const vencimientos = calcularVencimientos(reglas, v.mantenimientos, kmHoy, kmDia);
  return {
    vehiculo: v,
    kmDia,
    kmHoy,
    rendimientos,
    rendimientoProm: rendimientoPromedio(rendimientos),
    ultimoRendimiento: rendimientos[rendimientos.length - 1] ?? null,
    vencimientos,
  };
}

// ─── Escritura ─────────────────────────────────────────────────────

export async function actualizarOdometro(vehiculoId: string, odometro: number | null | undefined, fecha: Date) {
  if (odometro == null) return;
  const v = await prisma.vehiculo.findUnique({ where: { id: vehiculoId } });
  if (!v) return;
  if (v.kmActual == null || odometro >= v.kmActual) {
    await prisma.vehiculo.update({ where: { id: vehiculoId }, data: { kmActual: odometro, kmActualFecha: fecha } });
  }
}

export async function recalcularOdometro(vehiculoId: string) {
  const [c, m] = await Promise.all([
    prisma.cargaCombustible.findFirst({ where: { vehiculoId, odometro: { not: null } }, orderBy: { odometro: "desc" } }),
    prisma.mantenimiento.findFirst({ where: { vehiculoId, odometro: { not: null } }, orderBy: { odometro: "desc" } }),
  ]);
  const max = [c, m].filter(Boolean).sort((a, b) => b!.odometro! - a!.odometro!)[0];
  await prisma.vehiculo.update({
    where: { id: vehiculoId },
    data: { kmActual: max?.odometro ?? null, kmActualFecha: max?.fecha ?? null },
  });
}

export async function vehiculosActivos() {
  return prisma.vehiculo.findMany({
    where: { activo: true },
    orderBy: [{ porDefecto: "desc" }, { createdAt: "asc" }],
  });
}

export function resolverVehiculo(vehiculos: Vehiculo[], alias: string | null | undefined): Vehiculo | null {
  if (alias) {
    const a = alias.toLowerCase().trim();
    const hit = vehiculos.find(v =>
      [v.alias, v.marca, v.modelo, v.patente].some(x => x && (x.toLowerCase().includes(a) || a.includes(x.toLowerCase()))),
    );
    if (hit) return hit;
  }
  if (vehiculos.length === 1) return vehiculos[0];
  if (alias) return null;
  return vehiculos.find(v => v.porDefecto) ?? null;
}
