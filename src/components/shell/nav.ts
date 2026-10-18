import {
  BedDouble, BookOpen, CalendarDays, Coins, FileText, Images, ListChecks, MessageCircle,
  Settings, Sparkles, UserRound, Wallet, type LucideIcon,
} from "lucide-react";

/**
 * Las secciones de la plataforma, en un solo lugar: las usan el menú lateral del
 * computador (Sidebar) y la barra de pestañas del celular (BarraInferior).
 */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
};

export const NAV: NavItem[] = [
  { href: "/clara", label: "Clara", icon: MessageCircle },
  { href: "/asistente", label: "Asistente", icon: Sparkles },
  { href: "/isabel", label: "Isabel", icon: UserRound, soon: true },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/seguimiento", label: "Seguimiento", icon: ListChecks },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/finanzas", label: "Finanzas", icon: Wallet },
  { href: "/catalogo", label: "Catálogo", icon: BookOpen },
  { href: "/hoteles", label: "Hoteles", icon: BedDouble },
  { href: "/contenido", label: "Contenido", icon: Images },
  { href: "/tokens", label: "Tokens & Costo", icon: Coins },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

/** Lo que va a un toque del pulgar en el celular; el resto queda en "Más". */
export const PESTANAS_CELULAR = ["/seguimiento", "/cotizaciones", "/asistente", "/calendario"];

export function enSeccion(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}
