"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Hoy", ico: "☀️" },
  { href: "/kanban", label: "Tareas", ico: "✅" },
  { href: "/habitos", label: "Hábitos", ico: "🔥" },
  { href: "/cronograma", label: "Semana", ico: "🗓️" },
];

export default function BottomNav() {
  const pathname = usePathname();
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
