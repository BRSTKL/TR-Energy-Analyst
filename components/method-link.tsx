import React from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";

/** Metodoloji sayfasındaki ilgili bölüme küçük bağlantı ("Bu rakam nereden geliyor?") */
export function MethodLink({ section, label = "Yöntem" }: { section: string; label?: string }) {
  return (
    <Link
      href={`/methodology#${section}`}
      className="inline-flex items-center gap-1 text-xs font-normal text-indigo-600 hover:text-indigo-800 hover:underline print:hidden"
      title="Bu sayfadaki hesapların yöntemi, varsayımları ve sınırları"
    >
      <BookOpen className="h-3 w-3" /> {label}
    </Link>
  );
}
