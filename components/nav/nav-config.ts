/**
 * TR-Energy Analyst - menü yapılandırması (tek kaynak): sol menü, telefon çekmecesi ve alt çubuk buradan beslenir.
 *
 * Gruplar günün sırasını izler (Bugün → Gün içi → Portföy → Analiz). `activeNavId` bir adresin hangi öğeye ait olduğunu söyler;
 * proje alt sayfaları Portföy'e, yalnız Üretim tahmini ayrıca Gün içi altına bağlanır.
 */

import {
  Award,
  BookOpen,
  CalendarClock,
  CloudDownload,
  FileBarChart,
  FolderKanban,
  GitCompareArrows,
  LayoutDashboard,
  LineChart,
  SunMedium,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavId =
  | "today"
  | "pre-bid"
  | "daily"
  | "forecast"
  | "projects"
  | "epias"
  | "market"
  | "sector"
  | "compare"
  | "summary"
  | "methodology"
  | "account";

export interface NavItem {
  id: NavId;
  label: string;
  /** Kısa etiket (alt çubuk) */
  short?: string;
  href: string;
  icon: LucideIcon;
  /** Üzerine gelince açıklama */
  hint?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "today",
    label: "Bugün",
    items: [
      {
        id: "today",
        label: "Bugün",
        href: "/",
        icon: LayoutDashboard,
        hint: "Şimdi hangi adımdasınız, ne hazır, ne eksik",
      },
    ],
  },
  {
    id: "intraday",
    label: "Gün içi",
    items: [
      {
        id: "pre-bid",
        label: "Teklif öncesi",
        short: "Teklif",
        href: "/market/teklif",
        icon: Target,
        hint: "Yarının PTF tahmini ve teklif öncesi bağlam",
      },
      {
        id: "daily",
        label: "Günlük pano",
        short: "Pano",
        href: "/market/gunluk",
        icon: CalendarClock,
        hint: "Geçmiş gün, bugün ve yarın",
      },
      {
        id: "forecast",
        label: "Üretim tahmini",
        href: "/projects",
        icon: SunMedium,
        hint: "Son açılan projenin yarınki üretim tahmini",
      },
    ],
  },
  {
    id: "portfolio",
    label: "Portföy",
    items: [
      {
        id: "projects",
        label: "Projelerim",
        short: "Projeler",
        href: "/projects",
        icon: FolderKanban,
      },
      {
        id: "epias",
        label: "EPİAŞ'tan santral ekle",
        href: "/projects/epias",
        icon: CloudDownload,
      },
    ],
  },
  {
    id: "analysis",
    label: "Analiz",
    items: [
      { id: "market", label: "Piyasa özeti", href: "/market", icon: LineChart },
      { id: "sector", label: "Sektör karnesi", href: "/sector", icon: Award },
      { id: "compare", label: "Karşılaştırma", href: "/compare", icon: GitCompareArrows },
      {
        id: "summary",
        label: "Portföy özeti",
        href: "/ozet",
        icon: FileBarChart,
        hint: "Dönem özeti, projeler ve sektördeki yeriniz",
      },
    ],
  },
];

export const NAV_FOOTER: NavItem[] = [
  { id: "methodology", label: "Metodoloji", href: "/methodology", icon: BookOpen },
  { id: "account", label: "Hesabım", href: "/account", icon: UserRound },
];

/** Telefonda altta görünen dört kısayol (sık kullanılan sayfalar) */
export const MOBILE_BAR: NavId[] = ["today", "pre-bid", "daily", "projects"];

export const ALL_NAV_ITEMS: NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...NAV_FOOTER,
];

export function navItem(id: NavId): NavItem {
  const it = ALL_NAV_ITEMS.find((i) => i.id === id);
  if (!it) throw new Error(`Bilinmeyen menü öğesi: ${id}`);
  return it;
}

const is = (p: string, base: string) => p === base || p.startsWith(`${base}/`);

/** Adresin ait olduğu menü öğesi; menüde karşılığı olmayan adres (giriş, 404) için null */
export function activeNavId(pathname: string): NavId | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/") return "today";
  if (is(p, "/market/teklif")) return "pre-bid";
  if (is(p, "/market/gunluk")) return "daily";
  if (is(p, "/market")) return "market";
  if (is(p, "/projects/epias")) return "epias";
  if (/^\/projects\/[^/]+\/forecast$/.test(p)) return "forecast";
  if (is(p, "/projects")) return "projects";
  if (is(p, "/sector")) return "sector";
  if (is(p, "/compare")) return "compare";
  if (is(p, "/ozet")) return "summary";
  if (is(p, "/methodology")) return "methodology";
  if (is(p, "/account")) return "account";
  return null;
}

/** Kabuğun hiç gösterilmediği adresler */
export function hidesShell(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}
