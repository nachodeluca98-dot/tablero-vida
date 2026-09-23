// Lista de pendientes de todos los vehículos, agrupada por nivel de urgencia
import { fmtPesos, describirVencimiento, resumenVehiculo, vehiculosActivos, type Vencimiento } from "./core";
import { seguroSinVerificar } from "./seguro";

export type Nivel = "urgente" | "importante" | "relevante";

export type PendienteVehiculo = {
  id: string;
  nivel: Nivel;
  vehiculoId: string;
  alias: string;
  tipo: string;
  emoji: string;
  titulo: string;
  detalle: string;
  kmHoy: number | null;
  orden: number;
};

const TITULO: Record<string, string> = {
  aceite: "Cambio de aceite",
  service: "Service",
  neumaticos: "Rotación de neumáticos",
  correa: "Cambio de correa de distribución",
  presion: "Control mensual de presión de neumáticos",
  vtv: "VTV",
  patente: "Pago de patente",
};

// Controles de rutina: aunque estén atrasados no son urgentes
const TOPE_IMPORTANTE = new Set(["presion"]);
// Se consideran "relevantes" si faltan menos de esto
const HORIZONTE_DIAS = 60;
const HORIZONTE_KM = 2000;

function nivelDe(v: Vencimiento): Nivel | null {
  let n: Nivel | null = null;
  if (v.estado === "vencido") n = "urgente";
  else if (v.estado === "proximo") n = "importante";
  else if (v.estado === "sin_datos" && v.tipo === "presion") n = "importante";
  else if (
    v.estado === "ok" &&
    ((v.diasRestantes != null && v.diasRestantes <= HORIZONTE_DIAS) || (v.kmRestantes != null && v.kmRestantes <= HORIZONTE_KM))
  ) n = "relevante";
  if (n === "urgente" && TOPE_IMPORTANTE.has(v.tipo)) n = "importante";
  return n;
}

const PESO: Record<Nivel, number> = { urgente: 0, importante: 1, relevante: 2 };

export async function pendientesVehiculos(): Promise<PendienteVehiculo[]> {
  const vehiculos = await vehiculosActivos();
  const out: PendienteVehiculo[] = [];

  for (const v of vehiculos) {
    const r = await resumenVehiculo(v.id);
    if (!r) continue;

    for (const venc of r.vencimientos) {
      const nivel = nivelDe(venc);
      if (!nivel) continue;
      const base = TITULO[venc.tipo] ?? venc.label;
      const titulo = nivel === "urgente" ? `${base} pendiente` : base;
      out.push({
        id: `${v.id}:${venc.tipo}`,
        nivel,
        vehiculoId: v.id,
        alias: v.alias,
        tipo: venc.tipo,
        emoji: venc.emoji,
        titulo,
        detalle: venc.estado === "sin_datos" ? "Nunca registrado" : describirVencimiento(venc),
        kmHoy: r.kmHoy,
        orden: Number.isFinite(venc.urgencia) ? venc.urgencia : 9999,
      });
    }

    const seguro = await seguroSinVerificar(v.id);
    if (seguro) {
      out.push({
        id: `${v.id}:seguro`,
        nivel: "relevante",
        vehiculoId: v.id,
        alias: v.alias,
        tipo: "seguro",
        emoji: "🛡️",
        titulo: "Verificar pago y valor del seguro",
        detalle: `Cuota de ${seguro.mes}: ${seguro.monto != null ? fmtPesos(seguro.monto) : "sin monto"}`,
        kmHoy: r.kmHoy,
        orden: 9999,
      });
    }
  }

  return out.sort((a, b) => PESO[a.nivel] - PESO[b.nivel] || a.orden - b.orden);
}
