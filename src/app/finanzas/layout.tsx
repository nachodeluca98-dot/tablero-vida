import "./finanzas.css";
import BarraNav from "@/components/finanzas/BarraNav";

export default function FinanzasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="fin-page">{children}</div>
      <BarraNav />
    </>
  );
}
