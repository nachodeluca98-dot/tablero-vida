"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import HojaCargar from "./HojaCargar";

// Barra inferior del módulo (spec §5.1). "＋ Cargar" siempre visible al centro.
const TABS = [
  { href: "/finanzas", label: "Inicio", ico: "🏠", exacto: true },
  { href: "/finanzas/movimientos", label: "Movimientos", ico: "📋" },
  { href: "/finanzas/cargar", label: "Cargar", ico: "+", cargar: true },
  { href: "/finanzas/estadisticas", label: "Estadísticas", ico: "📊" },
  { href: "/finanzas/mas", label: "Más", ico: "☰" },
];

// Secciones que viven dentro de "Más"
const EN_MAS = ["/finanzas/presupuesto", "/finanzas/metas", "/finanzas/patrimonio", "/finanzas/configuracion", "/finanzas/guias"];

export default function BarraNav() {
  const pathname = usePathname() || "";
  const [hoja, setHoja] = useState(false);
  const cerrar = useCallback(() => setHoja(false), []);
  const activo = (t: (typeof TABS)[number]) =>
    t.exacto ? pathname === t.href
    : pathname.startsWith(t.href) || (t.href === "/finanzas/mas" && EN_MAS.some((p) => pathname.startsWith(p)));

  // El onboarding es a pantalla completa (spec §6.1)
  if (pathname.startsWith("/finanzas/onboarding")) return null;

  return (
    <>
      <nav className="fin-nav" aria-label="Finanzas">
        <div className="fin-nav-inner">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`${t.cargar ? "cargar" : ""} ${activo(t) ? "activo" : ""}`}
              aria-current={activo(t) ? "page" : undefined}
              onClick={t.cargar ? (e) => { e.preventDefault(); setHoja(true); } : undefined}
            >
              <span className="ico" aria-hidden>{t.ico}</span>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
      <HojaCargar abierta={hoja} onCerrar={cerrar} />
    </>
  );
}
