import Link from "next/link";
import { GUIAS } from "@/lib/finanzas/guias";

// Más → Guías: todas las guías para releer (spec §7.1)
export default function Guias() {
  return (
    <>
      <h1>Guías</h1>
      <div style={{ display: "grid", gap: 8 }}>
        {[...GUIAS].sort((a, b) => a.orden - b.orden).map((g) => (
          <div key={g.id} className="fin-kpi">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{g.titulo}</div>
            <div style={{ color: "var(--tx2)", lineHeight: 1.4 }}>{g.texto}</div>
            {g.accion && (
              <div style={{ marginTop: 10 }}>
                <Link href={g.accion.ruta} className="fin-btn secundario">{g.accion.etiqueta}</Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
