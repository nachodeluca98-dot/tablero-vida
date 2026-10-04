// Plantillas del onboarding (spec §6.1). Se usan en servidor y en cliente.

export type ItemPlantilla = { concepto: string; categoriaId: string; icono: string; naturaleza?: "esencial" | "discrecional" };

// Gastos fijos recurrentes comunes (paso 4)
export const FIJOS: ItemPlantilla[] = [
  { concepto: "Alquiler", categoriaId: "fincat_vivienda", icono: "🏠" },
  { concepto: "Expensas", categoriaId: "fincat_vivienda", icono: "🏢" },
  { concepto: "Luz", categoriaId: "fincat_servicios", icono: "💡" },
  { concepto: "Gas", categoriaId: "fincat_servicios", icono: "🔥" },
  { concepto: "Agua", categoriaId: "fincat_servicios", icono: "🚰" },
  { concepto: "Internet", categoriaId: "fincat_servicios", icono: "🌐" },
  { concepto: "Celular", categoriaId: "fincat_servicios", icono: "📱" },
  { concepto: "Prepaga", categoriaId: "fincat_salud", icono: "🩺" },
  { concepto: "Streaming", categoriaId: "fincat_suscripciones", icono: "📺", naturaleza: "discrecional" },
  { concepto: "Gimnasio", categoriaId: "fincat_salud", icono: "🏋️", naturaleza: "discrecional" },
  { concepto: "Seguro auto", categoriaId: "fincat_auto", icono: "🛡️" },
  { concepto: "Patente", categoriaId: "fincat_auto", icono: "🧾" },
  { concepto: "Cochera", categoriaId: "fincat_auto", icono: "🅿️" },
  { concepto: "Alimento mascotas", categoriaId: "fincat_mascotas", icono: "🐾" },
  { concepto: "Colegio / cursos", categoriaId: "fincat_educacion", icono: "📚" },
  { concepto: "Monotributo", categoriaId: "fincat_trabajo", icono: "💼" },
];

// Variables más comunes con un estimado mensual (paso 5)
export const VARIABLES: ItemPlantilla[] = [
  { concepto: "Súper", categoriaId: "fincat_super", icono: "🛒" },
  { concepto: "Salidas y delivery", categoriaId: "fincat_salidas", icono: "🍕", naturaleza: "discrecional" },
  { concepto: "Transporte", categoriaId: "fincat_transporte", icono: "🚌" },
  { concepto: "Nafta", categoriaId: "fincat_auto", icono: "⛽" },
  { concepto: "Mascotas", categoriaId: "fincat_mascotas", icono: "🐾" },
  { concepto: "Ropa y cuidado personal", categoriaId: "fincat_ropa", icono: "👕", naturaleza: "discrecional" },
];

export const PASOS_ONBOARDING = ["bienvenida", "ingreso", "tipo_cambio", "fijos", "variables", "ahorro", "tarjetas", "listo"] as const;
export type PasoOnboarding = (typeof PASOS_ONBOARDING)[number];
