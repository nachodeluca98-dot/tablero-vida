import Link from "next/link";

// Pantallas del módulo que todavía no están construidas (spec §15). Cada una se reemplaza
// por su propia ruta (que tiene prioridad sobre esta) a medida que se implementa.
const PENDIENTES: Record<string, { titulo: string; texto: string; paso: number }> = {
  metas: { titulo: "Metas", texto: "Tus metas y el fondo de emergencia, con aportes por mes.", paso: 10 },
  patrimonio: { titulo: "Patrimonio", texto: "Tus cuentas y la evolución del total en ARS y USD.", paso: 10 },
  estadisticas: { titulo: "Estadísticas", texto: "KPIs, gráficos por período y el resumen con IA.", paso: 10 },
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
