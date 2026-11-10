// Detecta a qué tipo de mantenimiento corresponde un pendiente escrito a mano.
// Sin dependencias de servidor: se usa también en el navegador para mostrar el tipo al escribir.

const REGLAS: [RegExp, string][] = [
  [/presi[oó]n/, "presion"],
  [/correa|distribuci[oó]n/, "correa"],
  [/\bvtv\b|verificaci[oó]n t[eé]cnica/, "vtv"],
  [/patente/, "patente"],
  [/\bservice\b|servicio (oficial|de mantenimiento)/, "service"],
  [/rotaci[oó]n|alineaci[oó]n|balanceo|neum[aá]tic|cubierta|gomas?\b/, "neumaticos"],
];

export function inferirTipo(titulo: string): string {
  const t = titulo.toLowerCase();
  // "pérdida de aceite" o "consumo de aceite" son fallas, no el cambio de rutina
  if (/aceite/.test(t) && !/p[eé]rdida|fuga|consum|pierde|gasta/.test(t)) return "aceite";
  for (const [re, tipo] of REGLAS) if (re.test(t)) return tipo;
  return "reparacion";
}
