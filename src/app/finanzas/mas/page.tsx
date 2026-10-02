import Link from "next/link";

const SECCIONES = [
  { href: "/finanzas/presupuesto", ico: "🧾", titulo: "Presupuesto del mes", texto: "Previsto vs. real por categoría y reasignar" },
  { href: "/finanzas/metas", ico: "🎯", titulo: "Metas", texto: "Fondo de emergencia y tus objetivos de ahorro" },
  { href: "/finanzas/patrimonio", ico: "🏦", titulo: "Patrimonio", texto: "Tus cuentas y cómo evoluciona el total" },
  { href: "/finanzas/configuracion", ico: "⚙️", titulo: "Configuración", texto: "Categorías, tarjetas, revisiones y avisos" },
  { href: "/finanzas/guias", ico: "💡", titulo: "Guías", texto: "Consejos cortos para sacarle el jugo" },
];

export default function Mas() {
  return (
    <>
      <h1>Más</h1>
      <div className="fin-lista">
        {SECCIONES.map((s) => (
          <Link key={s.href} href={s.href} className="fin-fila">
            <div className="fin-icono" aria-hidden>{s.ico}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{s.titulo}</div>
              <div style={{ fontSize: 12, color: "var(--tx3)" }}>{s.texto}</div>
            </div>
            <span aria-hidden style={{ color: "var(--tx3)" }}>›</span>
          </Link>
        ))}
      </div>
    </>
  );
}
