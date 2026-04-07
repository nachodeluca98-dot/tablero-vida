export type PilarKey =
  | "mus" | "fit" | "sal" | "ges" | "apr" | "cre" | "pro" | "soc" | "met";

export interface Pilar {
  key: PilarKey;
  nombre: string;
  short: string;
  letter: string;
  emoji: string;
}

export const PILARES: Pilar[] = [
  { key: "mus", nombre: "Música", short: "Musica", letter: "M", emoji: "🎵" },
  { key: "fit", nombre: "Actividad física", short: "Fitness", letter: "F", emoji: "🏋️" },
  { key: "sal", nombre: "Nutrición y salud", short: "Salud", letter: "N", emoji: "🥗" },
  { key: "ges", nombre: "Gestión adulta", short: "Gestion", letter: "G", emoji: "🔨" },
  { key: "apr", nombre: "Aprendizaje", short: "Aprender", letter: "A", emoji: "📚" },
  { key: "cre", nombre: "Creator/divulgación", short: "Creator", letter: "C", emoji: "🐉" },
  { key: "pro", nombre: "Profesional", short: "Pro", letter: "P", emoji: "💼" },
  { key: "soc", nombre: "Social", short: "Social", letter: "S", emoji: "❤️" },
  { key: "met", nombre: "Meta-sistema", short: "Meta", letter: "R", emoji: "🤓" },
];

// Mapea nombre libre (épica/pilar del CSV) a la clave corta
export function pilarKey(nombre?: string | null): PilarKey {
  if (!nombre) return "met";
  const n = nombre.toLowerCase();
  if (n.includes("música") || n.includes("musica") || n.includes("canto")) return "mus";
  if (n.includes("física") || n.includes("fisica") || n.includes("fitness") || n.includes("acro") || n.includes("pilates") || n.includes("train")) return "fit";
  if (n.includes("salud") || n.includes("nutri") || n.includes("estilo de vida")) return "sal";
  if (n.includes("gestión") || n.includes("gestion") || n.includes("adult") || n.includes("finan")) return "ges";
  if (n.includes("aprend") || n.includes("curso") || n.includes("estudio") || n.includes("peterson")) return "apr";
  if (n.includes("creator") || n.includes("divulg") || n.includes("contenido") || n.includes("write")) return "cre";
  if (n.includes("profes") || n.includes("trabajo") || n.includes("work") || n.includes("pm")) return "pro";
  if (n.includes("social") || n.includes("flia") || n.includes("familia") || n.includes("amig")) return "soc";
  return "met";
}

export function pilarColor(key: PilarKey) {
  return {
    bg: `var(--${key}-b)`,
    text: `var(--${key}-t)`,
    solid: `var(--${key})`,
  };
}

export function pilarFromKey(key: PilarKey): Pilar {
  return PILARES.find(p => p.key === key) || PILARES[8];
}
