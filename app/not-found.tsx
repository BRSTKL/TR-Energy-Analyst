import Link from "next/link";

/** Türkçe 404 (hata ayıklama testi 16.10.2026: Next'in İngilizce varsayılan sayfası çıkıyordu) */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-16 text-center">
      <p className="text-sm font-medium text-slate-500">404</p>
      <h1 className="text-xl font-semibold text-slate-900">Sayfa bulunamadı</h1>
      <p className="text-sm text-slate-600">Aradığınız adres yok ya da taşınmış olabilir.</p>
      <div className="flex justify-center gap-4 text-sm">
        <Link href="/projects" className="underline">
          Projeler
        </Link>
        <Link href="/" className="underline">
          Bugün
        </Link>
      </div>
    </div>
  );
}
