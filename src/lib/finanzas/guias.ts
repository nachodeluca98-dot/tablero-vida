// Catálogo de guías contextuales (spec §7.2). El estado por usuario vive en FinGuiaEstado.guiaId.
// Reglas (§7.2): una sola visible a la vez, máximo una nueva por día, nunca durante un asistente,
// si se descarta 2 veces no vuelve, y se apagan todas con FinPreferencias.mostrarGuias.

export type GuiaId =
  | "probar_dictar"
  | "varios_de_una"
  | "agrupar_incluye"
  | "primera_revision"
  | "modo_expres"
  | "fondo_emergencia"
  | "seguir_patrimonio"
  | "tarjetas_resumenes"
  | "gastos_anuales"
  | "reasignar"
  | "mirar_estadisticas"
  | "racha";

export type Guia = {
  id: GuiaId;
  titulo: string;
  texto: string;
  // Condición de disparo, en lenguaje natural; la evaluación se implementa en el motor de guías
  cuando: string;
  accion: { etiqueta: string; ruta: string } | null; // null = solo informativa / celebración
  orden: number; // prioridad cuando varias aplican (menor = primero)
};

export const GUIAS: Guia[] = [
  {
    id: "probar_dictar",
    titulo: "Probá dictar",
    texto: "Tocá el micrófono y decí tus gastos como hablás: \"súper 180 lucas, delivery 25 con la visa\".",
    cuando: "después del onboarding, si aún no usó la voz",
    accion: { etiqueta: "Abrir micrófono", ruta: "/finanzas/cargar?modo=voz" },
    orden: 1,
  },
  {
    id: "varios_de_una",
    titulo: "Cargá varios de una",
    texto: "En un mismo dictado podés decir varios gastos. Ej.: \"nafta 40 lucas, farmacia 12 y café 3\".",
    cuando: "usó la voz 2 veces con un solo gasto",
    accion: { etiqueta: "Probar", ruta: "/finanzas/cargar?modo=voz" },
    orden: 2,
  },
  {
    id: "agrupar_incluye",
    titulo: "Agrupá con \"incluye\"",
    texto: "Si hiciste varias compras chicas de lo mismo, cargalas como una sola y anotá qué incluye.",
    cuando: "cargó varios gastos chicos de la misma categoría el mismo día",
    accion: null,
    orden: 3,
  },
  {
    id: "primera_revision",
    titulo: "Tu primera revisión",
    texto: "Son menos de 5 minutos: tildás los fijos, dictás los variables y ves cómo vas.",
    cuando: "primer día de revisión",
    accion: { etiqueta: "Abrir revisión", ruta: "/finanzas/revision" },
    orden: 4,
  },
  {
    id: "modo_expres",
    titulo: "Modo exprés",
    texto: "¿Poco tiempo? La revisión exprés es solo fijos y dura un minuto.",
    cuando: "salteó una revisión",
    accion: { etiqueta: "Revisión exprés", ruta: "/finanzas/revision?modo=expres" },
    orden: 5,
  },
  {
    id: "fondo_emergencia",
    titulo: "Fondo de emergencia",
    texto: "Una buena primera meta: tener cubiertos entre 3 y 6 meses de gastos esenciales.",
    cuando: "primer mes cerrado sin metas",
    accion: { etiqueta: "Crearlo", ruta: "/finanzas/metas?nueva=fondo_emergencia" },
    orden: 6,
  },
  {
    id: "seguir_patrimonio",
    titulo: "Seguí tu patrimonio",
    texto: "Cargá tus cuentas una vez y en cada cierre solo confirmás los saldos.",
    cuando: "segundo mes cerrado sin cuentas",
    accion: { etiqueta: "Crear cuentas", ruta: "/finanzas/patrimonio?nueva=1" },
    orden: 7,
  },
  {
    id: "tarjetas_resumenes",
    titulo: "Tarjetas y resúmenes",
    texto: "Con el día de cierre de tu tarjeta, cada compra se imputa al mes en que pagás el resumen.",
    cuando: "cargó un gasto con tarjeta sin tarjetas configuradas",
    accion: { etiqueta: "Configurar tarjeta", ruta: "/finanzas/configuracion#tarjetas" },
    orden: 8,
  },
  {
    id: "gastos_anuales",
    titulo: "Gastos anuales",
    texto: "Los gastos anuales o cada tantos meses se prevén como un monto mensual, así no te sorprenden.",
    cuando: "agrega un ítem tipo seguro, patente o suscripción anual",
    accion: null,
    orden: 9,
  },
  {
    id: "reasignar",
    titulo: "Reasigná",
    texto: "Si una categoría se pasó, podés cubrirla moviendo plata desde otra.",
    cuando: "una categoría superó el 100%",
    accion: { etiqueta: "Reasignar", ruta: "/finanzas/presupuesto?reasignar=1" },
    orden: 10,
  },
  {
    id: "mirar_estadisticas",
    titulo: "Mirá tus estadísticas",
    texto: "Ya cerraste tu primer mes: mirá a dónde fue la plata y tu tasa de ahorro.",
    cuando: "primer mes cerrado",
    accion: { etiqueta: "Ver estadísticas", ruta: "/finanzas/estadisticas" },
    orden: 11,
  },
  {
    id: "racha",
    titulo: "Tu racha",
    texto: "¡3 revisiones seguidas! Así se arma el hábito.",
    cuando: "3 revisiones seguidas completas",
    accion: null,
    orden: 12,
  },
];

export const GUIA_POR_ID: Record<GuiaId, Guia> = Object.fromEntries(GUIAS.map((g) => [g.id, g])) as Record<GuiaId, Guia>;

export const MAX_DESCARTES_GUIA = 2;
