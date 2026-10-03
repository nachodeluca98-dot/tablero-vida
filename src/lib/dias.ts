// El cronograma guarda el día abreviado ("Lun", "Mie"...); los textos usan el nombre completo
export const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
export const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export const TZ_AR = "America/Argentina/Buenos_Aires";

// Día de la semana en Argentina (el servidor corre en UTC)
export function diaSemanaAR(d: Date = new Date()): number {
  const nombre = d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ_AR });
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nombre);
}
