"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { PILARES } from "@/lib/pilares";

const NAV = [
  { href: "/", label: "Dashboard", dot: "var(--acc)" },
  { href: "/timeline", label: "Timeline", dot: "var(--met)" },
  { href: "/kanban", label: "Kanban", dot: "var(--mus)" },
  { href: "/calendario", label: "Calendario", dot: "var(--pro)" },
  { href: "/vencimientos", label: "Vencimientos", dot: "var(--ges)" },
  { href: "/habitos", label: "Hábitos", dot: "var(--sal)" },
  { href: "/cronograma", label: "Cronograma", dot: "var(--fit)" },
  { href: "/settings", label: "Settings", dot: "var(--tx3)" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      <button className="hamburger" onClick={() => setOpen(o => !o)} aria-label="Menú">☰</button>
      <div className={`sidebar-backdrop ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <nav className={`sidebar ${open ? "open" : ""}`}>
        <div style={{ fontSize: 14, fontWeight: 700, padding: "0 10px 20px", letterSpacing: ".02em" }}>
          Tablero de Vida
        </div>

        <div style={{ fontSize: 10, color: "var(--tx3)", padding: "0 10px 6px", textTransform: "uppercase", letterSpacing: ".08em" }}>
          Navegación
        </div>
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link key={n.href} href={n.href}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 6,
                color: active ? "var(--tx)" : "var(--tx2)",
                background: active ? "var(--bg3)" : "transparent",
                textDecoration: "none", fontWeight: active ? 600 : 400, marginBottom: 2,
              }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: n.dot }} />
              {n.label}
            </Link>
          );
        })}

        <div style={{ fontSize: 10, color: "var(--tx3)", padding: "20px 10px 6px", textTransform: "uppercase", letterSpacing: ".08em" }}>
          Pilares
        </div>
        {PILARES.map((p) => (
          <Link key={p.key} href={`/kanban?pilar=${p.key}`}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 10px", color: "var(--tx2)", fontSize: 12,
              textDecoration: "none", borderRadius: 6,
            }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: `var(--${p.key})` }} />
            <span style={{ fontSize: 14 }}>{p.emoji}</span>
            {p.nombre}
          </Link>
        ))}
      </nav>
    </>
  );
}
