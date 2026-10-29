"use client";

/**
 * Proje alt menüsü: bir projenin bütün sayfaları tek sekme şeridinde (eskiden sonuç sayfasının başlığında 17 buton vardı).
 * Sık kullanılanlar sekme, derin analizler "Analiz", veri işleri "Veri" açılır menüsünde. Sayfa adreslerinden etkin sekme bulunur.
 */

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CloudSun,
  ClipboardCheck,
  FlaskConical,
  Network,
  Target,
  UploadCloud,
} from "lucide-react";
import { Menu, type MenuLink } from "@/components/ui/menu";
import { writeLastProject } from "@/lib/ui/last-project";

export type ProjectPage =
  | "results"
  | "forecast"
  | "losses"
  | "planning"
  | "insights"
  | "plants"
  | "dsg"
  | "candidates"
  | "backtest"
  | "validation"
  | "import";

export const PROJECT_TABS: Array<{ page: ProjectPage; label: string }> = [
  { page: "results", label: "Sonuçlar" },
  { page: "forecast", label: "Üretim tahmini" },
  { page: "losses", label: "Kayıp üretim" },
  { page: "planning", label: "Planlama" },
  { page: "insights", label: "İçgörüler" },
  { page: "plants", label: "Santraller" },
];

export const ANALYSIS_PAGES: Array<{
  page: ProjectPage;
  label: string;
  icon: MenuLink["icon"];
  hint: string;
}> = [
  {
    page: "dsg",
    label: "DSG senaryoları",
    icon: Network,
    hint: "Dengeleme sorumlusu grubu kurmanın değeri",
  },
  {
    page: "candidates",
    label: "Aday santraller",
    icon: Target,
    hint: "Portföye katılabilecek santraller",
  },
  {
    page: "backtest",
    label: "Geriye dönük test",
    icon: FlaskConical,
    hint: "Teklif kuralının geçmişte ne kazandırdığı",
  },
  {
    page: "validation",
    label: "Doğrulama paketi",
    icon: ClipboardCheck,
    hint: "Şirketten veri istemeden, açık veriyle hesaplanan uzlaştırma tutarları",
  },
];

/** Adresten proje sayfası: /projects/<id>/<sayfa> */
export function projectPageOf(pathname: string): ProjectPage | null {
  const m = /^\/projects\/[^/]+\/([^/]+)/.exec(pathname);
  return m ? (m[1] as ProjectPage) : null;
}

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname() ?? "";
  const page = projectPageOf(pathname);
  useEffect(() => writeLastProject(projectId), [projectId]);
  const href = (p: ProjectPage) => `/projects/${projectId}/${p}`;
  const inAnalysis = !!page && ANALYSIS_PAGES.some((a) => a.page === page);
  const analysis: MenuLink[] = ANALYSIS_PAGES.map((a) => ({
    href: href(a.page),
    label: a.label,
    icon: a.icon,
    hint: a.hint,
  }));
  const data: MenuLink[] = [
    {
      href: href("import"),
      label: "Üretim verisi yükle",
      icon: UploadCloud,
      hint: "Dosyadan gerçekleşen ve planlanan üretim",
    },
  ];
  return (
    <nav
      aria-label="Proje sayfaları"
      className="sticky top-12 z-10 border-b bg-white/95 backdrop-blur print:hidden"
    >
      <div className="mx-auto flex max-w-7xl items-center px-2 sm:px-4 lg:px-6">
        {/* Dar ekranda sekmeler yatay kayar; açılır menüler kayan alanın dışında (taşıp kesilmesin) */}
        <div className="flex min-w-0 flex-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] lg:flex-none lg:overflow-visible [&::-webkit-scrollbar]:hidden">
          {PROJECT_TABS.map((t) => {
            const on = page === t.page;
            return (
              <Link
                key={t.page}
                href={href(t.page)}
                aria-current={on ? "page" : undefined}
                className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                  on
                    ? "border-indigo-600 font-medium text-indigo-700"
                    : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                {t.page === "forecast" && (
                  <CloudSun className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {t.label}
              </Link>
            );
          })}
        </div>
        <Menu
          label="Analiz"
          items={analysis}
          active={inAnalysis}
          align="right"
          className="shrink-0 lg:[&>div]:left-0 lg:[&>div]:right-auto"
        />
        <Menu
          label="Veri"
          items={data}
          active={page === "import"}
          align="right"
          className="shrink-0 lg:[&>div]:left-0 lg:[&>div]:right-auto"
        />
      </div>
    </nav>
  );
}
