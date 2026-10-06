"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const ITEMS = [
  { href: "/", label: "Hoy", ico: "☀️" },
  { href: "/kanban", label: "Tareas", ico: "✅" },
  { href: "/habitos", label: "Hábitos", ico: "🔥" },
  { href: "/cronograma", label: "Semana", ico: "🗓️" },
];

export default function BottomNav() {
  const pathname = usePathname() || "";
  // Finanzas tiene su propia barra inferior: ahí se usa esa y vuelve el ☰ de arriba para salir del módulo
  const conBarraPropia = pathname.startsWith("/finanzas");
  useEffect(() => {
    if (conBarraPropia) document.body.dataset.barraPropia = "1";
    else delete document.body.dataset.barraPropia;
  }, [conBarraPropia]);
  if (conBarraPropia) return null;
  const enItems = ITEMS.some(i => i.href === pathname);
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {ITEMS.map(i => (
        <Link key={i.href} href={i.href} className={pathname === i.href ? "on" : ""}>
          <span className="ico">{i.ico}</span>{i.label}
        </Link>
      ))}
      <button className={enItems ? "" : "on"} onClick={() => window.dispatchEvent(new Event("abrir-menu"))}>
        <span className="ico">☰</span>Más
      </button>
    </nav>
  );
}
