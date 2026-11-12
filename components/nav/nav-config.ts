/**
 * TR-Energy Analyst - menü yapılandırması (tek kaynak): sol menü, telefon çekmecesi ve alt çubuk buradan beslenir.
 *
 * Gruplar günün sırasını izler (Bugün → Gün içi → Portföy → Analiz). `activeNavId` bir adresin hangi öğeye ait olduğunu söyler;
 * proje alt sayfaları (üretim tahmini dahil) Portföy'e bağlanır.
 */

import {
  Award,
  BookOpen,
  Building2,
  CalendarClock,
  CloudDownload,
  FileBarChart,
  FolderKanban,
  Factory,
  ZapOff,
  CalendarRange,
  Radar,
  GitCompareArrows,
  LayoutDashboard,
  LineChart,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavId =
  | "today"
  | "pre-bid"
  | "daily"
  | "projects"
  | "plants"
  | "companies"
  | "epias"
  | "market"
  | "outages"
  | "yekdem"
  | "radar"
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
    label: "Günlük iş",
    items: [
      {
        id: "pre-bid",
        label: "Teklif öncesi",
        short: "Teklif",
        href: "/market/teklif",
        icon: Target,
        hint: "Yarın için fiyat tahmini ve teklif masası (12:30'a kadar)",
      },
      {
        id: "daily",
        label: "Günlük pano",
        short: "Pano",
        href: "/market/gunluk",
        icon: CalendarClock,
        hint: "Piyasada ne oldu: dün, bugün ve yarının açıklanan fiyatı",
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
        id: "plants",
        label: "Santral rehberi",
        short: "Santraller",
        href: "/santraller",
        icon: Factory,
        hint: "Herhangi bir santralin kurulu gücü, konumu, YEKDEM durumu ve gerçekleşen satış fiyatı",
      },
      {
        id: "companies",
        label: "Şirketler",
        href: "/sirketler",
        icon: Building2,
        hint: "Sahip şirkete göre santraller, kurulu güç, üretim ve sapmanın maliyeti",
      },
      {
        id: "epias",
        label: "EPİAŞ'tan santral ekle",
        href: "/projects/epias",
        icon: CloudDownload,
      },
      {
        id: "summary",
        label: "Dönem özeti",
        href: "/ozet",
        icon: FileBarChart,
        hint: "Dönem özeti: piyasa, projeler ve sektördeki yeriniz",
      },
      {
        id: "compare",
        label: "Proje karşılaştırma",
        short: "Karşılaştır",
        href: "/compare",
        icon: GitCompareArrows,
        hint: "Projelerin sapma yükü, netleşme kazancı ve sektördeki yeri yan yana",
      },
    ],
  },
  {
    id: "analysis",
    label: "Analiz",
    items: [
      { id: "market", label: "Piyasa özeti", href: "/market", icon: LineChart },
      {
        id: "radar",
        label: "Yeni santral radarı",
        short: "Radar",
        href: "/yeni-santraller",
        icon: Radar,
        hint: "Veri havuzunda ilk üretimi görülen santraller: hangi ay kaç santral ve MW devreye girdi",
      },
      {
        id: "yekdem",
        label: "YEKDEM çıkışları",
        short: "YEKDEM",
        href: "/yekdem",
        icon: CalendarRange,
        hint: "Hangi yıl kaç santral ve kaç MW YEKDEM'den çıkıp serbest piyasaya geçiyor",
      },
      {
        id: "outages",
        label: "Arıza izleme",
        short: "Arıza",
        href: "/ariza",
        icon: ZapOff,
        hint: "Şu an devre dışı olan santraller ve çıkan kapasite (EPİAŞ arıza ve bakım bildirimleri)",
      },
      { id: "sector", label: "Sektör karnesi", href: "/sector", icon: Award },
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
  if (is(p, "/santraller")) return "plants";
  if (is(p, "/sirketler")) return "companies";
  if (is(p, "/ariza")) return "outages";
  if (is(p, "/yekdem")) return "yekdem";
  if (is(p, "/yeni-santraller")) return "radar";
  if (is(p, "/projects/epias")) return "epias";
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
