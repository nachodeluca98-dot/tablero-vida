import Link from "next/link";

// Pantallas del módulo que todavía no están construidas (spec §15). Cada una se reemplaza
// por su propia ruta (que tiene prioridad sobre esta) a medida que se implementa.
const PENDIENTES: Record<string, { titulo: string; texto: string; paso: number }> = {
  cargar: { titulo: "Cargar", texto: "Vas a poder dictar tus gastos o cargarlos en 3 toques.", paso: 3 },
  onboarding: { titulo: "Tu primer presupuesto", texto: "Un asistente de 5 minutos para armar tu presupuesto desde cero.", paso: 4 },
  movimientos: { titulo: "Movimientos", texto: "Todo lo que cargues, con buscador y filtros.", paso: 5 },
  clasificar: { titulo: "Clasificar", texto: "De a un movimiento: tocás la categoría y pasa al siguiente.", paso: 5 },
  presupuesto: { titulo: "Presupuesto del mes", texto: "Previsto vs. real por categoría, con reasignación.", paso: 6 },
  revision: { titulo: "Revisión", texto: "La revisión quincenal (completa o exprés) y el cierre de mes.", paso: 7 },
  metas: { titulo: "Metas", texto: "Tus metas y el fondo de emergencia, con aportes por mes.", paso: 8 },
  patrimonio: { titulo: "Patrimonio", texto: "Tus cuentas y la evolución del total en ARS y USD.", paso: 8 },
  estadisticas: { titulo: "Estadísticas", texto: "KPIs, gráficos por período y el resumen con IA.", paso: 10 },
  configuracion: { titulo: "Configuración", texto: "Categorías, tarjetas, días de revisión y avisos.", paso: 9 },
};

export default function SeccionPendiente({ params }: { params: { seccion: string[] } }) {
  const p = PENDIENTES[params.seccion[0]];
  return (
    <>
      <h1>{p?.titulo ?? "Finanzas"}</h1>
      <div className="fin-vacio">
        <strong>Estamos construyendo esta pantalla</strong>
        {p ? `${p.texto} Llega en el paso ${p.paso} del plan.` : "Esta sección todavía no existe."}
        <div style={{ marginTop: 12 }}>
          <Link href="/finanzas" className="fin-btn secundario">Volver a Inicio</Link>
        </div>
      </div>
    </>
  );
}
