/**
 * Bir sayının durumu: kesin hesap, varsayıma bağlı, tahmini, senaryo ya da sabah kaydı. Her ana sayının yanında aynı
 * rozet kullanılır (ilk örnek sapma yükü kartıydı); renk tek başına anlam taşımaz, rozet her zaman yazıyla söyler.
 */
export type StatusKind = "exact" | "assumption" | "estimate" | "scenario" | "record";

const STYLE: Record<StatusKind, string> = {
  exact: "bg-teal-50 text-teal-800",
  assumption: "bg-indigo-50 text-indigo-800",
  estimate: "bg-amber-50 text-amber-800",
  scenario: "bg-orange-50 text-orange-800",
  record: "bg-slate-100 text-slate-700",
};

const LABEL: Record<StatusKind, string> = {
  exact: "Kesin hesap",
  assumption: "Varsayıma bağlı",
  estimate: "Tahmini",
  scenario: "Senaryo",
  record: "Kayıt",
};

export function StatusChip({ kind, label, title }: { kind: StatusKind; label?: string; title?: string }) {
  return (
    <span title={title} className={`whitespace-nowrap rounded px-1.5 py-0.5 text-2xs font-semibold ${STYLE[kind]}`}>
      {label ?? LABEL[kind]}
    </span>
  );
}
