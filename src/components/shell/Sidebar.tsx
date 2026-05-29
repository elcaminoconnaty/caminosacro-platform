"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageCircle,
  UserRound,
  FileText,
  ListChecks,
  CalendarDays,
  BookOpen,
  Wallet,
  Coins,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/cn";

type NavItem = {
  href: string;
  label: string;
  icon: typeof MessageCircle;
  soon?: boolean;
};

const NAV: NavItem[] = [
  { href: "/clara", label: "Clara", icon: MessageCircle },
  { href: "/isabel", label: "Isabel", icon: UserRound, soon: true },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/seguimiento", label: "Seguimiento", icon: ListChecks },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/finanzas", label: "Finanzas", icon: Wallet },
  { href: "/catalogo", label: "Catálogo", icon: BookOpen },
  { href: "/tokens", label: "Tokens & Costo", icon: Coins },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-bg-card">
      <div className="px-6 py-6 border-b border-border">
        <Link href="/clara" className="block">
          <span className="font-display text-2xl text-bosque leading-tight">Camino Sacro</span>
          <span className="block text-xs text-muted mt-0.5">Plataforma Comercial</span>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon, soon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition",
                active
                  ? "bg-bosque text-white"
                  : "text-fg hover:bg-taupe/40",
              )}
            >
              <Icon size={16} className={active ? "" : "text-muted"} />
              <span className="flex-1">{label}</span>
              {soon && !active && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-taupe text-muted">Pronto</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-4 border-t border-border text-[11px] text-muted">
        v0.1 · {new Date().getFullYear()}
      </div>
    </aside>
  );
}
