import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, BookOpen } from "lucide-react";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = {
  title: "Metodoloji | TR-Energy Analyst",
  description: "Veri kaynakları, hesaplama yöntemleri, mevzuat dayanağı, doğrulamalar ve sınırlar.",
};

/**
 * Metodoloji: uygulamadaki ve rapordaki her rakamın nereden geldiği. Tek kaynak: yöntem değiştiğinde bu sayfa ve
 * "Sürüm notları" güncellenir. "PDF olarak indir" sayfayı yöntem notuna çevirir (baskı düzeni globals.css).
 * Mevzuat satırlarındaki durum etiketi kaynağın ne kadar doğrulandığını söyler; teyit edilmemiş madde numarası yazılmaz.
 */

const VERSION = "1.22";
const VERSION_DATE = "15 Ekim 2026";

const SECTIONS: Array<{ id: string; title: string }> = [
  { id: "ozet", title: "Özet" },
  { id: "veri", title: "Veri kaynakları" },
  { id: "dengesizlik", title: "Dengesizlik riski" },
  { id: "kupst", title: "KÜPST (sapma tutarı)" },
  { id: "uzlastirma", title: "Uzlaştırma birimi ve netleşme" },
  { id: "yekdem", title: "YEKDEM santralleri" },
  { id: "adil-prim", title: "Adil prim (Shapley)" },
  { id: "risk-primi", title: "Risk primi ve PPA göstergesi" },
  { id: "ayristirma", title: "Maliyet neden değişti?" },
  { id: "piyasa", title: "Piyasa göstergeleri" },
  { id: "birimler", title: "Fiyat birimleri: reel TL ve USD" },
  { id: "sektor", title: "Sektör karnesi" },
  { id: "toplayici-kiyas", title: "Toplayıcılar arası kıyas" },
  { id: "uretici-katki", title: "Üreticilerin portföye katkısı" },
  { id: "aday", title: "Aday ve hedef santraller" },
  { id: "sozlesme", title: "Sözleşme fiyatı" },
  { id: "butce", title: "Gelecek yıl bütçesi" },
  { id: "capture", title: "Capture rate ve profil indirimi" },
  { id: "gip", title: "Gün içi piyasa senaryosu" },
  { id: "gun-ici-etkinlik", title: "Gün içi etkinlik ve tahmin fırsatı" },
  { id: "sinama", title: "Geçmişle sınama" },
  { id: "yon-tahmini", title: "Sistem yönü tahmini" },
  { id: "kalite", title: "Veri bütünlüğü ve arıza saatleri" },
  { id: "dogrulama", title: "Doğrulamalar" },
  { id: "etiketler", title: "Etiketler, varsayımlar ve sınırlar" },
  { id: "kaynakca", title: "Kaynakça" },
  { id: "surum", title: "Sürüm notları" },
];

function Section({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-slate-200 pt-6">
      <h2 className="text-lg font-bold text-slate-900">
        <span className="mr-2 text-slate-400">{n}.</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

/** Formül bloğu */
function F({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[12.5px] leading-6 text-slate-800 print:border-slate-300">
      {children}
    </pre>
  );
}

const TAG_STYLE = {
  exact: "border-emerald-200 bg-emerald-50 text-emerald-800",
  estimate: "border-amber-200 bg-amber-50 text-amber-800",
  assumption: "border-violet-200 bg-violet-50 text-violet-800",
  scenario: "border-sky-200 bg-sky-50 text-sky-800",
} as const;
const TAG_TEXT = { exact: "KESİN HESAP", estimate: "TAHMİNİ", assumption: "VARSAYIMA BAĞLI", scenario: "SENARYO" } as const;

function Tag({ kind }: { kind: keyof typeof TAG_STYLE }) {
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide ${TAG_STYLE[kind]}`}>{TAG_TEXT[kind]}</span>;
}

const STATUS_STYLE = {
  verified: "text-emerald-700",
  source: "text-slate-600",
  check: "text-amber-700",
  inference: "text-violet-700",
} as const;

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
            {head.map((h) => (
              <th key={h} className="py-1.5 pr-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 align-top">
              {r.map((c, j) => (
                <td key={j} className="py-1.5 pr-3">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MethodologyPage() {
  let n = 0;
  const next = () => ++n;
  return (
    <div className="min-h-screen bg-slate-50/60 pb-16 print:bg-white print:pb-0">
      <header className="border-b bg-white print:border-b-2 print:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-xs print:hidden">
              <Link href="/" className="flex items-center gap-1 text-slate-500 hover:text-slate-900">
                <ArrowLeft className="h-3 w-3" /> Dashboard
              </Link>
              <span className="text-slate-300">/</span>
              <span className="font-medium text-slate-700">Metodoloji</span>
            </div>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              <BookOpen className="h-6 w-6 text-indigo-600 print:hidden" /> Metodoloji
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              TR-Energy Analyst&apos;teki ve Dengesizlik Karnesi raporundaki her rakamın nereden geldiği: veri kaynakları, hesaplama
              yöntemleri, mevzuat dayanağı, doğrulamalar ve sınırlar.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Sürüm {VERSION} · {VERSION_DATE}
            </p>
          </div>
          <PrintButton />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-8 print:block print:max-w-none print:px-0">
        <nav className="print:hidden lg:sticky lg:top-6 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">İçindekiler</p>
          <ol className="mt-2 space-y-1 text-sm">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-slate-600 hover:text-indigo-700">
                  <span className="mr-1 text-slate-400">{i + 1}.</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <main className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm print:space-y-4 print:border-0 print:p-0 print:shadow-none">
          <Section id="ozet" n={next()} title="Özet">
            <p>
              Uygulama, bir üreticinin gün öncesi üretim planı (KGÜP) ile gerçekleşen üretimini (UEVM) saat saat karşılaştırır ve plan hatasının
              bedelini, EPİAŞ&apos;ın yayımladığı piyasa fiyatları (PTF, SMF) ve sistem yönüyle, mevzuattaki uzlaştırma kurallarına göre
              hesaplar. Bütün sayfalar ve rapor aynı hesaplama motorunu kullanır: bir rakam sonuç sayfasında, raporda ve sektör karnesinde aynı
              yoldan çıkar.
            </p>
            <p>
              Veri yalnızca kamuya açık EPİAŞ Şeffaflık Platformu&apos;dur. Şirketin gün içi işlemleri, ikili anlaşmaları ve fiili uzlaştırma
              faturaları açık veride yoktur; bu yüzden rakamlar &quot;kapatılması gereken risk&quot; olarak okunmalı, gerçekleşen bedel olarak
              değil. Her rakamın ne kadar kesin olduğu rapordaki etiketlerle belirtilir (&quot;Etiketler, varsayımlar ve sınırlar&quot; bölümü).
            </p>
          </Section>

          <Section id="veri" n={next()} title="Veri kaynakları">
            <p>Tüm veriler EPİAŞ Şeffaflık Platformu&apos;ndan, saatlik ve Türkiye saatiyle (Türkiye 2016&apos;dan beri yaz saati uygulamaz; her gün 24 saattir).</p>
            <Table
              head={["Veri", "Anlamı", "Kullanım"]}
              rows={[
                ["KGÜP (ilk ve son sürüm)", "Kesinleşmiş günlük üretim programı: gün öncesinde bildirilen (ilk) ve gün içi piyasası kapandıktan sonra güncellenen (son) saatlik plan", "İlk: dengesizlik riski; son: KÜPST ve gün içi etkinlik"],
                ["UEVM", "Uzlaştırmaya esas veriş miktarı: sayaçtan ölçülen saatlik üretim", "Gerçekleşen üretim"],
                ["PTF", "Piyasa takas fiyatı (gün öncesi piyasası)", "Satış fiyatı ve dengesizlik fiyatının tabanı"],
                ["SMF ve sistem yönü", "Sistem marjinal fiyatı (dengeleme güç piyasası) ve saatin enerji açığı / fazlası", "Dengesizlik fiyatı"],
                ["GİP ağırlıklı ortalama fiyatı ve hacmi", "Gün içi piyasasında saatin işlem fiyatı", "Gün içi senaryosu ve piyasa özeti"],
                ["Santral ve şirket listeleri", "Santral → uzlaştırma birimi, şirket → santraller, toplayıcıların santral listeleri", "Uzlaştırma birimi, sektör karnesi, hedef santraller"],
                ["YEKDEM listeleri", "Yıl bazında YEK Destekleme Mekanizması'ndaki santraller", "YEKDEM senaryoları"],
              ]}
            />
            <p>
              <b>Dengesizlik riski</b> KGÜP&apos;ün <b>ilk sürümüne</b> göre hesaplanır: gün öncesi tahminin hatasını, gün içi işlemler
              öncesinde ölçer. <b>KÜPST</b> mevzuata uygun olarak gün içi piyasası kapandıktan sonra güncellenen <b>son sürüme</b> (KÜP)
              göredir; son sürüm veri havuzunda yoksa ilk sürüm kullanılır (üst sınıra yakın). İki sürümün farkı gün içi etkinlik bölümünde
              ölçülür. Birden çok uzlaştırma birimi olan santralde birimlerin serileri toplanır.
            </p>
            <p>
              <b>Son plan kapsamı:</b> son sürümü olan santral-saat payı raporda, veri kalitesi bandında ve Ek B&apos;de yazılır; kapsamı
              %90&apos;ın altındaki santraller adıyla listelenir. EPİAŞ son sürümü bazı birimler için (ör. lisanssız üretim birimleri)
              yayımlamaz. Portföy kapsamı %90&apos;ın altındaysa KÜPST &quot;üst sınır&quot; etiketini alır ve gün içi düzeltmeler köprüye
              girmez (yalnız kapsanan saatlere dayanırdı). <Tag kind="exact" />
            </p>
          </Section>

          <Section id="dengesizlik" n={next()} title="Dengesizlik riski">
            <p>
              Her saat için sapma = gerçekleşen − plan. Pozitif sapma (fazla üretim) sistemden düşük fiyatla alınır, negatif sapma (eksik
              üretim) yüksek fiyatla kapatılır. Dengesizlik fiyatları:
            </p>
            <F>
              {`Pozitif dengesizlik fiyatı = min(PTF, SMF) × (1 − l)      l: pozitif dengesizlik katsayısı
Negatif dengesizlik fiyatı = max(PTF, SMF) × (1 + k)      k: negatif dengesizlik katsayısı

Dengesizlik riski (saat) = sapma > 0 :  sapma × (PTF − pozitif fiyat)
                           sapma < 0 : |sapma| × (negatif fiyat − PTF)
MWh başına risk = Σ risk / Σ gerçekleşen üretim`}
            </F>
            <p>
              Bu, üretimin tamamı gün öncesinde PTF&apos;den satılabilseydi elde edilecek gelir ile gün öncesi satış + dengesizlik tutarı
              arasındaki farktır; yani plan hatasının bedeli. Katsayılar saatin tarihine göre seçilir:
            </p>
            <Table
              head={["Dönem ve sistem yönü", "k (negatif dengesizlik)", "l (pozitif dengesizlik)"]}
              rows={[
                ["2026 öncesi, her yönde", "%3", "%3"],
                ["2026'dan itibaren · sistem enerji açığı", "%6", "%3"],
                ["2026'dan itibaren · sistem enerji fazlası", "%3", "%6"],
                ["2026'dan itibaren · sistem dengede", "%3", "%3"],
              ]}
            />
            <p>
              Yani 2026&apos;dan itibaren sistemle aynı yöndeki sapma (açıkta eksik, fazlada fazla üretim) %6, ters yöndeki %3 katsayıyla
              uzlaşır. Sistemle ters yöndeki sapma sistemi dengelediği için ucuzdur; riskin büyük kısmı aynı yöndeki sapmadan doğar. Gün içi işlemler
              açık veride olmadığından hesap &quot;gün içi işlemler öncesi&quot; risktir. <Tag kind="exact" />
            </p>
            <p>
              <b>2026 fiyat kuralları</b> (md. 110, 29.12.2025 değişikliği, yürürlük 1.1.2026). Formüle üç kural eklendi:
            </p>
            <F>
              {`Negatif fiyat = max(V, PTF, SMF_N) × (1 + k)           V = 150 TL/MWh
                 (PTF ya da SMF azami fiyat limitindeyse: AFL × 1,05 × (1 + k))
Pozitif fiyat  = −B × (1 − l)   eğer min(PTF, SMF_P) < V,   B = 100 TL/MWh
               = min(PTF, SMF_P) × (1 − l)   diğer hallerde
SMF_N / SMF_P  = saatin içindeki 15 dakikalık SMF'lerin en yükseği / en düşüğü`}
            </F>
            <p>
              Düşük fiyatlı saatlerde fazla üretim para kazanmaz, öder; eksik üretim en az 150 TL/MWh&apos;dan kapatılır. 15 dakikalık SMF
              saatlik veriden görülemediği için uygulama <b>EPİAŞ&apos;ın resmi dengesizlik fiyatını</b> kullanır: Şeffaflık
              Platformu&apos;nun sistem dengesizlik tutarı (TL) ve miktarı (MWh) servislerinden, saat başına tutar ÷ miktar. Resmi fiyat
              saatin kendi katsayısına bölünerek &quot;taban&quot;a çevrilir; mevzuat profili saatin kendi tarihinde resmi fiyatı birebir verir,
              2026 kurallarının 2025 verisine uygulanması gibi projeksiyonlarda taban kuralları ayrıca eklenir. Resmi fiyatı henüz
              yayımlanmamış saatlerde (ay kapanmadan) V ve B kurallarıyla formül kullanılır. <Tag kind="exact" />
            </p>
          </Section>

          <Section id="kupst" n={next()} title="KÜPST (sapma tutarı)">
            <p>Lisanslı üretici, dengesizlik tutarından ayrı olarak, planından tolerans payını aşan sapması için sapma tutarı öder:</p>
            <F>
              {`KÜPSM (saat) = max(0, |UEVM − KÜP| − tolerans × KÜP)
KÜPST (saat) = KÜPSM × max(PTF, SMF) × n                n: fiyat katsayısı`}
            </F>
            <Table
              head={["Dönem", "Tolerans: rüzgâr", "Güneş", "Depolamalı ve diğer", "Katsayı n (yenilenebilir)"]}
              rows={[
                ["2025 öncesi", "%21", "%12", "%5", "0,03"],
                ["2025", "%17", "%10", "%5", "0,03 (aylık arıza ≥ 40 ise 0,05)"],
                ["2026'dan itibaren", "%15", "%8", "%5 (iletimden bağlı lisanssız %20)", "0,05 (aylık arıza ≥ 30 ise 0,08)"],
              ]}
            />
            <p>
              KÜP, gün içi piyasası kapandıktan sonraki son KGÜP&apos;tür. Resmî formül (EPDK 14029 md. 1): KÜPSM = |UEVM − BUDÜP| − m × BUDÜP;
              BUDÜP = KUDÜP + (yük alma − yük atma talimatı) + sekonder ve sınırlı frekans terimleri; talimat ve yan hizmet terimleri
              açık veride santral bazında olmadığından sıfır alınır. Toleransın plana (BUDÜP) oranlandığı formül metninden doğrulandı.
              <b>Kapsam:</b> bir şirketin santralleri için KÜPST santral (uzlaştırma birimi) bazında hesaplanır ve şirket içinde
              netleşmez. <b>Toplayıcı portföyünde</b> ise md. 4 uyarınca KÜPST topluluk için oluşturulan uzlaştırma birimi (portföy)
              bazındadır: toplam UEVM ile toplam KÜP karşılaştırılır (santraller arası sapmalar netleşir), tolerans kaynak türlerinin
              işletmedeki kurulu gücüne göre ağırlıklandırılır ve fiyat katsayısı topluluk içindir (2025&apos;te 0,03; 2026&apos;da 0,05).
              Arıza kayıtları açık veride olmadığından arıza sayısına bağlı katsayı artışı uygulanmaz: hesap bir alt sınırdır.
              2026&apos;da hem tolerans genişler hem katsayı 0,03&apos;ten 0,05&apos;e çıkar. Bu nedenlerle KÜPST her yerde{" "}
              <Tag kind="estimate" /> olarak etiketlenir.
            </p>
            <p>
              <b>Sapma yükü</b> = dengesizlik riski + tahmini KÜPST. Raporda &quot;santralin plandan sapmasının toplam bedeli&quot; olarak
              kullanılır.
            </p>
          </Section>

          <Section id="uzlastirma" n={next()} title="Uzlaştırma birimi ve netleşme">
            <p>
              Dengesizlik santral bazında değil, dengeden sorumlu taraf (şirket ya da toplayıcı) bazında saat saat netleşir: aynı saatte bir
              santralin fazlası diğerinin eksiğini karşılar. Uygulama iki birimi destekler:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <b>Şirket bazında</b> (varsayılan): aynı şirketin santralleri birlikte netleşir. Şirket bilgisi EPİAŞ şirket → santral
                listelerinden gelir.
              </li>
              <li>
                <b>Toplayıcı portföyü</b>: farklı sahiplerin santralleri toplayıcının tek dengesinde netleşir; santral sahipleri raporda korunur.
              </li>
            </ul>
            <F>
              {`Netleşmiş risk (saat) = risk( Σ sapma_i )          (birimdeki santraller üzerinden)
Netleşme değeri       = Σ_i risk(sapma_i) − Σ_saat risk(Σ_i sapma_i)`}
            </F>
            <p>
              Değerin kalıcı olup olmadığını görmek için ay ay netleşme oranı ve &quot;bir üyenin fazla, diğerinin eksik ürettiği saatlerin
              payı&quot; birlikte verilir. <Tag kind="exact" />
            </p>
            <p>
              <b>Grup senaryosu (şirket projelerinde):</b> projedeki farklı şirketler tek dengeden sorumlu grupta netleşseydi. Şirketler
              gün içinde planlarını zaten düzelttiği için fayda <b>son planla</b> (gün içi piyasası kapandıktan sonraki KGÜP; saatlerin en
              az %90&apos;ında varsa) hesaplanır: ilk planla hesaplanan fayda gün içi kazancıyla aynı sapmayı ikinci kez sayar (Polat 2026:
              ilk planla 44,0 M, son planla 35,6 M). Projenin bazı santralleri zaten bir toplayıcının portföyündeyse asıl seçenek, bağımsız
              şirketleri o portföye almaktır: bağımsızlar + portföydeki proje santralleri birlikte netleşir; portföyün diğer üyeleri hesapta
              olmadığı için alt sınırdır (Polat: ≥ 53,0 M). Dengeden sorumlu grup üyeliği EPİAŞ&apos;ta yayımlanmadığı için kalem
              &quot;olası kaldıraç&quot;tır ve görüşmeden önce doğrulanmalıdır DSG sayfası aynı kuralla çalışır: şirket projelerinde son plan, başka bir toplayıcıdaki santraller işaretli ve varsayılan seçim dışında (toplayıcı projesinde sayfa raporun toplayıcı bloğuyla aynı tabanda, ilk planla) (denetim dsg-basis, dsg-join, dsg-text). <Tag kind="scenario" />
            </p>
          </Section>

          <Section id="yekdem" n={next()} title="YEKDEM santralleri">
            <p>
              YEKDEM katılımcısı ürettiği enerjiyi <b>serbest piyasada kendisi satar</b> (YEK Yönetmeliği md. 15/1) ve bu üretime karşılık
              piyasa işletmecisine PTF üzerinden hesaplanan YEKDEM gelirini öder, YEK bedelini alır (md. 18, 23/1). Dolayısıyla YEKDEM
              santralinin dengesizliği ve KÜPST&apos;ü, diğer santrallerde olduğu gibi, dengeden sorumlu tarafına (şirketine ya da
              toplayıcısına) aittir. YEKDEM portföyünün dengesizliğini düzenleyen md. 16 ve 17, 29.4.2016 tarihinde yürürlükten
              kaldırılmıştır.
            </p>
            <p>
              Bu yüzden uygulamada YEKDEM santralleri dengesizlik, netleşme, KÜPST, adil prim ve aday taramasında diğer santrallerle
              aynı şekilde hesaba girer. YEKDEM yalnızca gelir tarafını değiştirir: gelir PTF yerine YEK fiyatından oluşur, bu yüzden
              YEKDEM santrali olan portföyde &quot;dengesizliğin gelire oranı&quot; gösterilmez. <Tag kind="exact" />
            </p>
          </Section>

          <Section id="adil-prim" n={next()} title="Adil prim (Shapley)">
            <p>
              Netleşen portföy maliyeti üyelere (santral sahipleri ya da santraller) Shapley değeriyle paylaştırılır: her üye, gruba
              katılabileceği tüm sıralamalardaki ortalama marjinal maliyetini öder.
            </p>
            <F>
              {`φ_i = Σ_{S ⊆ N∖{i}}  |S|! (n − |S| − 1)! / n!  × [ c(S ∪ {i}) − c(S) ]
Adil prim (TL/MWh) = (φ_i + KÜPST_i) / üretim_i
İndirim = (tek başına maliyet − φ_i) / (tek başına maliyet + KÜPST_i)`}
            </F>
            <p>
              c(S), S alt grubunun saat saat netleşmiş dengesizlik riskidir. Shapley her üyeye katkısı oranında pay verir ve üye sırasından
              bağımsızdır. Paylaşımın istikrarlı olup olmadığı, yani hiçbir alt grubun ayrılıp kendi grubunu kurarak daha ucuza gelemeyeceği
              (çekirdek koşulu), her zaman garanti değildir; DSG sayfası bunu ayrıca kontrol eder. Üye sayısı 8&apos;i aşarsa tam hesap yerine iki oyunculu yaklaşım kullanılır (kazanç
              ikiye bölünür). Paylaşım oranı sözleşmeyle belirlenir; tablo teklifin dayanağıdır. <Tag kind="assumption" />
            </p>
          </Section>

          <Section id="risk-primi" n={next()} title="Risk primi ve PPA göstergesi">
            <F>
              {`Beklenen prim  = dönemin sapma yükü / dönemin üretimi                (TL/MWh)
İhtiyatlı prim = aylık MWh başına sapma yükünün 90. yüzdeliği (P90)
PPA göstergesi = capture rate − beklenen prim / baz PTF
capture rate   = üretim ağırlıklı PTF / düz ortalama PTF`}
            </F>
            <p>
              Prim, portföyün piyasaya açık olduğu varsayımıyla (YEKDEM yok), en güncel kurallarla (2026 katsayıları ve KÜPST oranları)
              hesaplanır; en az 6 ay veri gerekir. Fiyat riski ve marj dahil değildir. <Tag kind="assumption" />
            </p>
          </Section>

          <Section id="ayristirma" n={next()} title="Maliyet neden değişti?">
            <p>Aynı santrallerin iki dönemi arasındaki MWh başına maliyet farkı dört kaleme ayrılır:</p>
            <F>
              {`MWh başına maliyet = W × ḡ
W = Σ|net sapma| / Σ üretim                      → tahmin hatası
ḡ = Σ(|net sapma| × bedel) / Σ|net sapma|        → sapma MWh'ı başına bedel`}
            </F>
            <ul className="list-disc space-y-1 pl-5">
              <li><b>Tahmin hatası:</b> W&apos;nin değişimi.</li>
              <li><b>Fiyat makası:</b> aynı sapmaların diğer dönemin PTF, SMF ve sistem yönüyle bedeli.</li>
              <li><b>Katsayı kuralı:</b> 2025 %3 → 2026 %6 / %3.</li>
              <li><b>Hacim ve profil:</b> sapmanın saatlere ve işarete dağılımı.</li>
            </ul>
            <p>
              İki dönemin saatleri takvimde eşlenir (aynı ay, gün, saat; 29 Şubat hariç). Her kalem tek başına diğer dönemin değeriyle
              değiştirilip yeniden fiyatlanır; etki, iki yöndeki geçişin ortalamasıdır (sıradan bağımsız). Dört etkinin toplamı ile gerçek fark
              arasındaki kalan &quot;etkileşim&quot; olarak gösterilir. &quot;Katsayı kuralı&quot; yalnızca k ve l&apos;dir; 2026&apos;nın 15 dakikalık
              SMF, taban ve negatif fiyat kuralları resmi fiyatın içinde olduğundan &quot;fiyat makası&quot; kalemine girer. <Tag kind="exact" />
            </p>
            <p>
              Yıllar arası ayrıştırma varsayılan olarak <b>aynı fiyat düzeyinde</b> gösterilir: önceki dönemin her saati kendi ayının TÜFE&apos;siyle
              son dönemin ortalama fiyat düzeyine taşınır, son dönem olduğu gibi kalır. Nominal TL&apos;de &quot;fiyat makası&quot; kalemi genel fiyat
              artışını da içerir; reel gösterimde bu kısım düşer. Nominal TL ve USD karşılıkları yanında verilir (bkz. Fiyat birimleri).{" "}
              <Tag kind="exact" />
            </p>
          </Section>

          <Section id="piyasa" n={next()} title="Piyasa göstergeleri">
            <Table
              head={["Gösterge", "Tanım"]}
              rows={[
                ["SMF–PTF makası", "|SMF − PTF| saatlik ortalaması; dengesizlik maliyetinin fiyat tarafındaki sürücüsü"],
                ["Yönlü makas", "Sistem açığında SMF − PTF, fazlasında PTF − SMF ortalaması"],
                ["Sıfır fiyatlı saat", "PTF ≤ 1 TL/MWh"],
                ["Düşük fiyatlı saat", "PTF < 1.000 TL/MWh"],
                ["Sistem yönü payı", "Açık / fazla / denge saatlerinin payı"],
                ["GİP fiyatı", "Hacim ağırlıklı gün içi fiyatı"],
              ]}
            />
            <p>Yıllar arası karşılaştırmada her ay bir önceki yılın aynı ayıyla eşlenir. <Tag kind="exact" /></p>
          </Section>

          <Section id="birimler" n={next()} title="Fiyat birimleri: reel TL ve USD">
            <p>
              2024–2026 arasında birikmiş enflasyon yaklaşık %90&apos;dır; nominal TL rakamlar yıllar arasında doğrudan kıyaslanamaz. Piyasa
              sayfası, karşılaştırma sayfası ve raporun &quot;Ne değişti?&quot; slaytı fiyatları üç birimde verir:
            </p>
            <Table
              head={["Birim", "Dönüşüm", "Kaynak"]}
              rows={[
                ["Nominal TL", "Olduğu gibi", "EPİAŞ"],
                [
                  "Reel TL",
                  "Değer × TÜFE[taban ay] / TÜFE[saatin ayı]. Piyasa sayfasında taban serideki son ay; ayrıştırmada son dönemin ortalama düzeyi",
                  "TCMB Tüketici Fiyatları tablosu (TÜİK TÜFE aylık % değişimi), zincirlenmiş endeks",
                ],
                ["USD", "Değer / (TL/USD)[saatin ayı]", "EPİAŞ PTF TL / PTF USD oranı, aylık medyan"],
                ["PTF'ye oran", "Ortalama makas / ortalama PTF; birimden bağımsız", "EPİAŞ"],
              ]}
            />
            <p>
              Zincirlenmiş TÜFE endeksi TCMB&apos;nin yayımladığı yıllık değişimlerle en fazla 0,02 puan farkla örtüşür (testle sabit). Seri{" "}
              <code>lib/macro/macro-series.json</code> dosyasındadır, <code>scripts/macro-sync.mts</code> ile yenilenir; okuma ağ gerektirmez.
              Sıfır ve düşük fiyat eşikleri (1 ve 1.000 TL/MWh) her birimde nominal TL&apos;dir. TÜFE&apos;si henüz açıklanmamış ay en yakın aya
              bağlanır ve sayfada yazılır. Reel ve USD sonuçları farklı olabilir: TL dolara karşı enflasyondan az değer kaybettiğinde (reel
              değerlenme) dolar bazındaki artış reel TL&apos;deki artıştan büyük görünür. <Tag kind="exact" />
            </p>
            <p>
              Bulgu (2026 Ocak–Ağustos, aynı aylar, Eylül 2026 TL&apos;si): makas reel olarak 743 (2024) → 696 (2025) → 830 TL/MWh (2026), dolar
              bazında 11,8 → 12,8 → 16,9 $/MWh. PTF reel olarak 4.196 → 3.616 → 2.047 TL/MWh&apos;ye indi; makas PTF&apos;nin %17,5&apos;inden
              %40,8&apos;ine çıktı. Sektör karnesinde aynı santrallerin MWh başına maliyeti 2025 → 2026 (Ocak–Ağustos) nominal medyan rüzgâr +%61,
              güneş +%91, hidro +%54; enflasyon düşülünce +%27, +%51, +%22 (genel fiyat ×1,26).
            </p>
          </Section>

          <Section id="sektor" n={next()} title="Sektör karnesi">
            <p>
              EPİAŞ&apos;ta üretimi yayımlanan lisanslı rüzgâr, güneş ve (isteğe bağlı) hidro santrallerinin aynı dönemdeki göstergeleri, aynı
              motordan. Santraller <b>tek başına</b> kıyaslanır: amaç tahmin kalitesini karşılaştırmaktır, şirket içi netleşme şirketten
              şirkete değiştiği için kıyasa katılmaz.
            </p>
            <p>
              <b>Kalite süzgeci:</b> dönem saatlerinin en az %90&apos;ında verisi olan ve plan / gerçekleşen oranı 0,5–2 arasında olan ve net sapma hacmi üretimin %60&apos;ını aşmayan santraller
              kıyaslanır (eksik ya da bariz tutarsız veri elenir; dar aralık kötü tahmin eden santralleri de eleyip medyanı düşürdüğü için genişletildi). Dağılım santral sayısına göre P10, P25, medyan, P75 ve P90 ile, ayrıca üretim
              ağırlıklı ortalamayla verilir; santralin yeri teknoloji içindeki yüzdelik sırasıdır. <b>K1 görünümü</b> olası arıza / kısıntı saatlerini (&quot;Veri bütünlüğü ve arıza saatleri&quot; bölümü) dışarıda bırakır.
            </p>
            <p>
              Hidro alt tipi (barajlı / nehir tipi) kayıttan alınır: önce Global Energy Monitor hidro izleyicisi (depolamalı → barajlı, &quot;run-of-river&quot; →
              nehir tipi; CC BY 4.0), sonra santral ya da EPDK lisans adındaki &quot;Barajı&quot; / &quot;Regülatörü&quot; eki. Kaydı olmayan santral
              sınıflanmamış kalır ve bütün hidrolarla kıyaslanır; gün içi üretim esnekliğinden yapılan tahmin yalnız etiket olarak gösterilir (büyük barajları
              programla bloklar hâlinde çalıştıkları için nehir tipi sayıyordu). Barajlı santral üretimini kendi planına uydurabildiği, nehir tipi akışa bağlı
              olduğu için ikisi ayrı dağılımlarla kıyaslanır (2026 Ocak–Ağustos medyanı barajlı 71, nehir tipi 107 TL/MWh). <Tag kind="exact" /> (alt tip
              kaydı olmayanlarda: kıyas bütün hidrolarla)
            </p>
          </Section>

          <Section id="toplayici-kiyas" n={next()} title="Toplayıcılar arası kıyas">
            <p>
              EPİAŞ&apos;taki her toplayıcının santral listesindeki lisanslı rüzgâr, güneş ve hidro santralleri için aynı yöntem: saatlik sapma (UEVM − ilk KGÜP),
              resmi dengesizlik fiyatı. Sahipler tek başına (aynı sahibin santralleri kendi dengesinde netleşir) ile toplayıcı
              portföyünde tek denge karşılaştırılır:
            </p>
            <F>
              {`Netleşme değeri = Σ sahip tek başına − portföy tek denge
Netleşme oranı = netleşme değeri / Σ sahip tek başına
MWh başına netleşmiş maliyet = portföy tek denge / üretim
Beklenen maliyet = Σ_teknoloji üretim × sektör medyanı (TL/MWh, santral tek başına)
Endeks = portföy tek denge / beklenen maliyet            (1'in altı daha iyi)`}
            </F>
            <p>
              Üyelik, listenin alındığı güne göredir (santraller dönem boyunca portföydeymiş gibi); santral bazında üretimi yayımlanmayan
              lisanssız santraller ve KÜPST hesapta yoktur. Listedeki diğer türler (biyokütle, biyogaz, jeotermal, doğalgaz, kojenerasyon) kapsam dışıdır: tür UEVM kaynak kırılımından, veri çekilmemişse adından (JES, biyogaz, kojenerasyon…) belirlenir; santral sayıları bu yüzden &quot;analizde / listedeki rüzgâr, güneş, hidro&quot; olarak verilir. Ham MWh başına maliyet teknoloji karışımından etkilenir (hidro ağırlıklı
              portföyler doğal olarak düşük çıkar); bu yüzden sıralama <b>endekse</b> göredir: portföy, aynı karışımdaki sektör ortalaması
              santrallerin tek başına ödeyeceğinin ne kadarını ödüyor. Endeksi hem iyi tahmin hem netleşme düşürür. Kıyas <b>benzer
              ölçekli</b> toplayıcılarla yapılır: dönem üretimi 8 ayda 1.000 GWh üstü (dönemle orantılı); grup 4&apos;ten küçükse
              üretimi en yakın 6 toplayıcı. <Tag kind="exact" />
            </p>
          </Section>

          <Section id="uretici-katki" n={next()} title="Üreticilerin portföye katkısı">
            <p>Toplayıcı portföyünde her üretici (lisans sahibi) için: üretici portföyden ayrılsa netleşme değeri ne kadar azalır?</p>
            <F>{`Katkı_i = [portföy − i] netleşmiş + i tek başına − portföy netleşmiş`}</F>
            <p>
              Katkı, üreticinin sapmasının diğerlerini dengelediği saatlerden gelir. MWh başına katkı, üreticiye sunulacak fiyat ya da
              indirim için ölçüdür. Katkılar toplanamaz: değer üreticilerin etkileşiminden oluşur (paylaştırma için Shapley, bölüm adil
              prim). <Tag kind="exact" />
            </p>
          </Section>

          <Section id="aday" n={next()} title="Aday ve hedef santraller">
            <p>Sektör karnesindeki her santral için, portföye eklenseydi ne kadar değer katacağı saat saat hesaplanır:</p>
            <F>
              {`Netleşme kazancı = Σ_saat [ c(portföy) + c(aday) − c(portföy + aday) ]
İlk N aday için adil prim: portföy üyeleri + aday üzerinden Shapley (bölüm 7)`}
            </F>
            <p>
              Portföy, projedeki tüm santrallerdir (YEKDEM santralleri dahil). Portföy saatlerinin %90&apos;ından azında verisi olan aday elenir. İki sıralama
              vardır: toplam kazanç (büyük santralleri öne çıkarır) ve MWh başına kazanç (üretimi portföyün %5&apos;inden az adaylar sona alınır).
              Kazançlar aday başınadır, toplanamaz. <Tag kind="exact" />
            </p>
            <p>
              <b>Ulaşılabilirlik</b> sırayla belirlenir: (1) EPİAŞ&apos;ta &quot;(TOPLAYICI)&quot; olarak kayıtlı katılımcıların santral
              listelerinde ise &quot;başka toplayıcıda&quot;; (2) görevli tedarik şirketinin portföyü ya da lisanssız santralse hedef dışı; (3) sahibinin
              ya da şirket adındaki markanın EPİAŞ&apos;ta en az 3 santrali varsa &quot;grup portföyü&quot;; (4) hiçbiri değilse &quot;hedef&quot;.
              Dengeden sorumlu grup üyeliği santral bazında yayımlanmadığı için &quot;hedef&quot; bir tahmindir. <Tag kind="estimate" />
            </p>
            <p>
              <b>YEKDEM çıkışı.</b> YEKDEM fiyatları tesisin işletmeye giriş tarihinden itibaren 10 yıl uygulanır (5346 s. Kanun md. 6;
              2013/5625 s. BKK; 2021 sonrası TL mekanizması da 10 yıl); kısmen işletmeye girmiş tesiste süre ilk katılımdan başlar. Katılım her
              yıl ayrı başvuruyla olur. Süresi dolan ya da çıkmayı seçen santral üretimini serbest piyasada satar ve dengesizliğini kendisi taşır:
              toplayıcının en doğal hedefidir. İşletmeye giriş tarihi açık veride olmadığı için santralin EPİAŞ YEKDEM listelerinde ilk
              görüldüğü yıl kullanılır: giriş [ilk yıl − 1, ilk yıl], süre [ilk yıl + 9, ilk yıl + 10] içinde dolar. Kaynaklar: santral kimlikli
              liste (2014&apos;ten bugüne; 2017&apos;den önce kapsamı dar) ve ad, şirket, kurulu güçlü katılımcı listesi (2016–2025; kurulu güç
              kuralıyla aynı ad eşleşmesi). Listelerin başında görülen santral daha önce de YEKDEM&apos;de olabilir; bu yıl hâlâ listedeyse süresi
              bu yıldan önce dolmuş olamaz, aralık buna göre daraltılır.
            </p>
            <Table
              head={["Durum", "Tanım"]}
              rows={[
                ["Bu yıl çıktı", "Geçen yılın listesinde var, bu yılınkinde yok. Süre dolmuş ya da süresi sürerken kendi isteğiyle çıkmış (geri dönebilir)"],
                ["Süresi bu yıl doluyor", "Bu yıl listede; ilk yılına göre süre en geç bu yıl doluyor: gelecek yıl serbest piyasada"],
                ["Süresi yakında doluyor", "Bu yıl listede; süre en erken gelecek yıl doluyor (tahmini, ±1 yıl)"],
              ]}
            />
            <p>
              Sınır: kapasite artışı yapılmış santralde eklenen kısmın süresi kendi işletmeye girişinden işleyebilir; bu durumda santralin bir
              kısmı YEKDEM&apos;de kalabilir. Görüşmeden önce santralle doğrulanmalı. 2026 sektör karnesinde (1.011 santral) 82 santral 2026&apos;da
              çıktı (2.935 MW; 58&apos;inde süre dolmuş, 18&apos;i kendi isteğiyle), 4&apos;ünün süresi 2026&apos;da, 110&apos;unun tahminen 2026–2028&apos;de
              doluyor. <Tag kind="estimate" />
            </p>
          </Section>

          <Section id="sozlesme" n={next()} title="Sözleşme fiyatı">
            <p>
              Aday sayfasında, adil primi hesaplanan her aday için toplayıcının teklif edebileceği dengesizlik hizmet bedeli (TL/MWh) üç
              çizgiden çıkar. KÜPST toplayıcıdadır (topluluk KÜPST&apos;ü), taban ve tavan KÜPST dahildir.
            </p>
            <F>
              {`Taban = adil prim = (Shapley payı + KÜPST) / üretim      toplayıcının beklenen maliyeti
Tavan = (tek başına dengesizlik + KÜPST) / üretim          santralin bağımsız kalma alternatifi
Öneri = taban + pay × (tavan − taban)                      pay varsayılanı %50 (%25 / %75 seçilebilir)`}
            </F>
            <p>
              Tavan ≤ taban ise teklif verilmez (portföye katılmak santrale kazandırmıyor). Taban eksiyse öneri 0&apos;a çekilir. <Tag kind="exact" />
            </p>
            <p>
              <b>Sözleşme biçimi geçmişle sınandı (16.2).</b> Sektör karnesinin 858 santralinde bedel 2025 verisiyle (2026 kurallarıyla) tahmini
              maliyetin (1 + kâr payı) katı olarak belirlenip 2026&apos;da üç biçimde uygulandı: sabit TL/MWh; PTF&apos;nin sabit yüzdesi (santralin
              üretim ağırlıklı PTF&apos;siyle); makasa endeksli (bedel × 2026 piyasa makası / 2025 piyasa makası; makas = dönemin ortalama |SMF − PTF|).
            </p>
            <Table
              head={["Ocak–Ağustos, 2025 → 2026", "Sabit TL", "PTF yüzdesi", "Makas endeksi"]}
              rows={[
                ["Karşılama medyanı (bedel / gerçek maliyet, kâr payı 0)", "0,73", "0,55", "1,16"],
                ["Zarar eden santral, kâr payı %50: tümü", "%36", "%74", "%10"],
                ["Rüzgâr / hidro / güneş", "%24 / %41 / %63", "%75 / %71 / %100", "%0 / %16 / %7"],
              ]}
            />
            <p>
              Neden: maliyet arttı (gerçek / tahmin medyanı ×1,36) ve bunu makas yönetti (piyasa makası ×1,58); santrallerin üretim ağırlıklı
              PTF&apos;si ise nominal düştü (medyan ×0,75, güneşte ×0,60). PTF&apos;ye bağlı bedel maliyet artarken azaldı. Öneri bu yüzden makasa
              endeksli verilir: uzlaştırma döneminde bedel = öneri × gerçekleşen piyasa makası / referans makas (projenin dönemindeki ortalama).
              Sabit TL karşılaştırma için durur; sabit TL&apos;de tipik durum (×1,35) ve kötü senaryo (P90) marjı ayrıca gösterilir. Gain 2026&apos;nın
              bağımsız ilk 10 adayında pazarlık alanı 14–41 TL/MWh; sabit TL&apos;de tipik durumda bile hepsinde marj eksi (−35 ile −59 TL/MWh):
              adil prim, gelecek yılın maliyeti için sabit bir bedelin tabanı olamaz. <Tag kind="estimate" />
            </p>
            <p>
              Sınırlar: sınama tek yılı kapsar ve o yıl makas açıldı; makas daralırsa endeksli bedel de düşer (iki yönlü). Endeks maliyetin yalnız
              fiyat kısmını izler; santralin tahmin kalitesi değişirse bedel bunu yakalamaz. Santral bazındadır; portföyde netleşme maliyeti düşürür,
              biçimlerin sırası değişmez. Rakiplerin teklif fiyatı açık veride yoktur (toplayıcı kıyasındaki MWh başına maliyet rakip fiyatının ancak
              alt sınırıdır). Toplayıcının işletme gideri ve GİP işlem kâr/zararı bedele dahil değildir; tavana santralin kendi ticaret ekibinin
              gideri eklenmez (gerçek tavan daha yüksektir). Ölçümdür, işlem önerisi değildir.
            </p>
          </Section>

          <Section id="butce" n={next()} title="Gelecek yıl bütçesi">
            <p>
              Planlama sayfasındaki bütçe sekmesi ve rapordaki bütçe slaytı, portföyün gelecek yıl dengesizlik + KÜPST için ödemesi beklenen tutarı
              verir. Fiyat tahmini yapılmaz: portföyün geçmiş günleri yeniden oynatılır.
            </p>
            <F>
              {`Bütçe (ay) = MWh başına maliyet (ay) × üretim (ay)
MWh başına maliyet: aynı ayın geçmiş günlerinden 7 günlük bloklarla 2.000 kez çekilen ay; medyan, P90, P95
Gün: portföyün 24 saati, sapma ve fiyat aynı günden (sapma ile sistem yönü aynı havadan etkilenir)`}
            </F>
            <Table
              head={["Girdi", "Nasıl"]}
              rows={[
                ["Günler", "Son iki yıl (2025 ve 2026'nın verisi olan ayları). Eski yılın günleri son yılın tahmin kalitesine taşınır (ortak aylarda MWh başına maliyet oranı)."],
                ["Fiyat", "Dengesizlik fiyatı formülle (makas ve kural değişince resmi fiyat geçerli değil). Makas reel olarak seçilen düzeye ölçeklenir: SMF′ = PTF + s × (SMF − PTF)."],
                ["Kural", "2026 kuralı (aynı yönde %6, ters yönde %3), 2025 kuralı (düz %3) ya da sertleşme (aynı yönde %9). Mevzuat değişikliğinin etkisi bu seçimle görülür."],
                ["Üretim", "Yeni santraller tam yıl. Düşük / yüksek üretim yılı teknoloji bazında iki yılın düşük / yüksek olanı (hidroda yağış, rüzgârda rüzgâr, güneşte güneşlenme); normal ortalama; ya da kullanıcının yıllık tahmini."],
                ["Plan ve gün içi", "Sapma ilk KGÜP'e göre (havuzda 2025'in son planı yok). Gün içi düzeltme son yıldaki gibi sürerse: son plana göre dengesizlik ve KÜPST + GİP işlem maliyeti, ilk plana göre maliyetin katı olarak uygulanır."],
                ["Birim", "Reel TL (son ayın fiyat düzeyi, TÜFE). Nominal: yıllık enflasyon ay ay bileşik. USD: kur beklentisi girilirse nominal TL ÷ kur, girilmezse reel TL ÷ taban ayın kuru (reel kur sabit)."],
              ]}
            />
            <p>
              <b>Geçmişle sınama.</b> Aynı yöntemle 2026 bütçesi yalnız 2025 verisiyle kurulup 2026 Ocak–Ağustos gerçekleşenle karşılaştırıldı (13 portföy):
              gerçek / bütçe medyanı 1,02, 9 portföy ±%25 içinde; sapanların hepsi bütçenin üstünde. Kötü durum aralığı dar: P90&apos;ın altında kalan ay
              payı %54 (beklenen %90; 7 günlük bloklarla %56). Iskalamaların çoğu üretimden (2025 kurak yıl: aynı hidro santraller 2026&apos;da ×1,41);
              üretim doğru bilinseydi P90 kapsamı %69. Kalan kısım portföyün tahmin kalitesinin yıldan yıla değişmesi. Bu yüzden P90 ve P95 alt sınır
              olarak okunmalıdır. <Tag kind="estimate" />
            </p>
            <p>
              Sınırlar: iki yılın günleri ve üretimi; daha uç bir yıl aralıkta görünmez (çok yıllık veri bekleyen işlerde). Portföy bugünkü
              santrallerdir. Gün içi oranı ve tahmin kalitesi taşıması tek yıldan gelir ve sınanmadı. Bütçe dengesizlik + KÜPST&apos;tür; satış geliri
              ve toplayıcının hizmet bedeli dahil değildir.
            </p>
          </Section>

          <Section id="capture" n={next()} title="Capture rate ve profil indirimi">
            <p>
              Bir santralin ürettiği saatlerde aldığı ortalama fiyatın piyasanın ortalamasına oranı. %100&apos;ün altı, üretimin fiyatın düşük olduğu
              saatlerde yoğunlaştığını gösterir; PPA fiyatlamasında profil indirimi buradan çıkar.
            </p>
            <F>
              {`Capture fiyatı = Σ (üretim × PTF) / Σ üretim
Baz PTF = verisi olan saatlerin PTF ortalaması (her saat bir kez)
Capture rate = capture fiyatı / baz PTF;   profil indirimi = 100 − capture rate
Beklenen (portföy) = Σ teknolojinin üretim payı × teknolojinin sektör capture rate'i`}
            </F>
            <p>
              Sektör: sektör karnesinin santralleri (kalite süzgeçli), iki yılda da Ocak–Ağustos, üretim EPİAŞ UEVM, fiyat PTF. Teknoloji oranı
              üretim ağırlıklıdır (santraller birleştirilir); santraller arası dağılım her santrali bir nokta sayar (1 GWh altı hariç). Sonuç
              sayfasındaki &quot;sektördeki yer&quot;, santralin kendi teknolojisinin (hidroda barajlı / nehir tipi) santralleri arasındaki
              yüzdeliğidir; raporun PPA kutusu portföyün oranını karışıma göre beklenenle kıyaslar. <Tag kind="exact" />
            </p>
            <Table
              head={["Ocak–Ağustos", "2025", "2026", "Sıfır fiyatlı üretim (2026)"]}
              rows={[
                ["Güneş", "%84,8", "%66,2 (Mayıs %17)", "%16,2"],
                ["Rüzgâr", "%99,2", "%105,6", "%4,0"],
                ["Hidro · barajlı", "%106,5", "%101,3", "%5,3"],
                ["Hidro · nehir tipi", "%100,8", "%95,1", "%5,7"],
              ]}
            />
            <p>
              Güneş fiyatını kendisi düşürüyor (öğle saatlerinde sıfır fiyat); öğle fiyatı düşünce rüzgârın akşam ve gece üretimi görece değerleniyor;
              barajlı hidro üretimi pahalı saatlere kaydırabildiği için Nisan–Mayıs 2026&apos;da hidro toplamı %122–129&apos;a çıktı. Sınırlar: geçmiş
              fiyatlarla (fiyat tahmini değil); talimatla (YAT) kısılan üretim sayılmadığından kısıntının yoğun olduğu saatlerde oran olduğundan
              yüksek görünebilir; santral konumu veride yok, bölge ayrımı yapılmaz.
            </p>
          </Section>

          <Section id="gip" n={next()} title="Gün içi piyasa senaryosu">
            <p>
              Tahmin hatasının bir kısmı teslimattan önce görülüp gün içi piyasasında kapatılsaydı riskin ne kadar azalacağı test edilir. GİP
              teslimattan 60 dakika önce kapandığı için uygulanabilir en kısa gecikme <b>2 saat</b> kabul edilir; 1 saatlik gecikme
              &quot;teorik&quot; olarak ayrılır.
            </p>
            <p>
              Kapatma oranı önceki 4 aydan öğrenilir ve sonraki ayda test edilir (ileriye dönük, veri sızıntısı yok). İşlem fiyatı saatin
              gerçekleşen GİP ağırlıklı ortalamasıdır; zor saatlerde daha kötü fiyat varsayılır. Sonuç üst sınırdır: şirket gün içinde zaten
              işlem yapıyorsa kazancın bir kısmı hâlihazırda alınıyordur. &quot;Kusursuz öngörü&quot; ile hesaplanan tavan ayrıca etiketlenir.{" "}
              <Tag kind="scenario" />
            </p>
            <p>
              <b>GİP likiditesi ve işlem sınırı.</b> Bir saatte yapılan işlem, o saatin GİP eşleşme hacminin en fazla <b>%10</b>&apos;u kadardır.
              Sınır portföy bazındadır (netleşmiş uzlaştırma biriminde) ve bütün gün içi kurallara aynı biçimde uygulanır: sabit pay kapatma,
              kalıcılık, yön tahminiyle gün içi plan ayarı (sınır bağlarsa çarpan 1&apos;e doğru kısılır) ve birleşik kural. Gün öncesi plan ayarı
              GÖP&apos;te olduğu için sınır dışıdır.
            </p>
            <F>
              {`Katılım (saat) = |Σ (ilk KGÜP − son KGÜP)| / GİP eşleşme hacmi     portföy içinde netleşmiş, son planı olan santral-saatler
İşlem (saat) = işaret(istenen) × min(|istenen|, %10 × GİP hacmi)`}
            </F>
            <Table
              head={["2026 Ocak–Ağustos", "Ort. üretim", "Katılım P90", "P99", "En çok", "%10 sınırının bağladığı saat"]}
              rows={[
                ["Aksa", "692 MWh/saat", "%8,0", "%12,5", "%19", "%4,2"],
                ["Pure", "485 MWh/saat", "%7,4", "%13,7", "%28,5", "%3,8"],
                ["Inavitas", "609 MWh/saat", "%3,8", "%8,1", "%15", "%0,4"],
                ["Gain", "137 MWh/saat", "%0,7", "%1,5", "%3", "%0"],
              ]}
            />
            <p>
              Dayanak: en büyük toplayıcıların gözlenen üst katılımı (P99 ≈ %12–14). %10 bunun ihtiyatlı altıdır; büyük toplayıcıların tipik
              katılımı (P90 medyanı ≈ %2) sınır olarak alınmadı, çünkü toplayıcıların genelde ne yaptığını gösterir, piyasanın ne kadarını
              kaldırdığını değil. Etkisi (geriye dönük test, örneklem dışı, sınırsız / %13 / %10): 13 portföyün 10&apos;unda sınır bağlamıyor; Doğuş&apos;ta
              kalıcılık 115,3 / 86,0 / 83,3 milyon TL (strateji piyasanın kaldırabileceğinden fazla işlem istiyordu). Saatlik hacim 2026&apos;da medyan
              1.981 MWh (gece ≈ 1.230, öğleden sonra ≈ 2.380); en düşük–en yüksek eşleşme fiyatı aralığı hacimden bağımsız ≈ %25–27.{" "}
              <Tag kind="estimate" />
            </p>
            <p>
              Sınırlar: plan değişikliğinin hepsi GİP işlemi olmayabilir (ikili anlaşma, talimat), katılım üst sınırdır; hacim saatlik kontratın
              eşleşmesidir; emir defteri açık veride yok, fiyat etkisi yalnız en düşük–en yüksek eşleşme aralığıyla kabaca izlenir.
            </p>
          </Section>

          <Section id="gun-ici-etkinlik" n={next()} title="Gün içi etkinlik ve tahmin fırsatı">
            <p>
              <b>Gün içi etkinlik:</b> uzlaştırma birimindeki saatlik toplam sapma ilk plana ve son plana göre aynı fiyatlarla
              değerlenir. Son plan gün içi işlemlerden sonra kalan pozisyondur; aradaki fark gün içi düzeltmelerin dengesizliği ne kadar
              azalttığıdır. Planı gün içinde hiç değişmeyen (saatlerin %1&apos;inden azında) santraller ayrıca listelenir.{" "}
              <Tag kind="exact" />
            </p>
            <p>
              <b>GİP işlem maliyeti:</b> plan değişikliği bedava değildir. Gün öncesinde PTF&apos;den taahhüt edilen ilk plan ile son plan
              arasındaki fark (Δ = ilk − son) gün içi piyasasında işlem görmüş sayılır: plan düştüyse Δ geri alınır, arttıysa fazladan
              satılır. Maliyet = Δ × (GİP saatlik ağırlıklı ortalama fiyatı − PTF); net gün içi kazanç = dengesizlik azalması − işlem
              maliyeti. Köprüde ayrı (kesikli) adım olarak gösterilir; brüt azalmanın %2&apos;sinden küçükse ihmal edilir. Kural tabanlı gün
              içi stratejisi de işlem fiyatıyla net olduğu için ek fırsat net gerçekleşenle karşılaştırılır. Şirketin gerçek işlem fiyatı
              açık veride yoktur; ortalama fiyat, 15 dakikalık ve blok kontratlar ayrı izlenmez. <Tag kind="estimate" />
            </p>
            <p>
              <b>Sektörde gün içi:</b> aynı hesap (ilk ve son plan, GİP işlem maliyeti, portföy bazında) EPİAŞ toplayıcı listesindeki
              portföylerde yapılır; son plan kapsamı %90&apos;ın ve üretimi 8 ayda 100 GWh&apos;ın altındaki toplayıcılar ve projenin kendi
              toplayıcısı dağılıma girmez. Rapor portföyün yerini (en iyi çeyrek, medyan üstü, medyan altı) verir. Kural tabanlı ek gün içi
              fırsatı en az 5 toplayıcı varsa sektörün en iyi çeyreğinin gerçekte ulaştığı seviyeyle sınırlanır; kuralın 2, 3 ve 4 saatlik
              gecikmeyle sonucu da yazılır (gecikmeye çok duyarlıdır). Portföy karışımları farklıdır: barajlı hidro planı daha kolay
              düzeltir. <Tag kind="exact" />
            </p>
            <p>
              <b>Tahmin iyileştirme fırsatı:</b> sektör medyanının üstündeki santrallerin (dönem içinde devreye girenler hariç) saatlik
              sapması, MWh başına riskleri medyana inecek oranda küçültülür (dengesizlik fiyatı plana bağlı olmadığından maliyet sapmayla
              orantılıdır). Kazanç uzlaştırma biriminde yeniden netleştirilerek bulunur; santral tek başına kazanç yalnız bağlam olarak
              verilir, çünkü portföyde ters sapmalar zaten birbirini dengeler. KÜPST azalması son plana göre ayrıca eklenir.{" "}
              <Tag kind="scenario" />
            </p>
          </Section>

          <Section id="sinama" n={next()} title="Geçmişle sınama">
            <p>
              &quot;Ne olurdu&quot; rakamları gerçekle karşılaştırılır: yöntem 2025 Ocak–Ağustos verisiyle çalıştırılır, 2026&apos;nın aynı
              aylarında gerçekte ne olduğuna bakılır (sektör karnesindeki 858 santral; scripts/sector-backtest.mts).
            </p>
            <Table
              head={["Hesap", "Sınama", "Sonuç ve rapordaki kullanım"]}
              rows={[
                [
                  "Risk primi",
                  "2025 verisi 2026 kurallarıyla (raporun yöntemi) ile 2026 gerçekleşen TL/MWh",
                  "Gerçek / tahmin medyanı 1,36 (%50 aralık 1,11–1,68), tipik hata %41; farkın çoğu fiyat makasından (×1,20), kalanı tahmin kalitesinden (×1,13). Prim geçmişe bakar, makas açılırsa düşük kalır; rapor primin yanında bu hata dağılımıyla bir aralık verir.",
                ],
                [
                  "Tahmin iyileştirme fırsatı",
                  "2025'te teknolojisinin medyanından pahalı santrallerin sapma oranı (WAPE) 2026'da",
                  "Tipik santral iyileşmedi (rüzgâr −%3, hidro +%4, güneş +%21); en iyi çeyrek rüzgârda %12, hidroda %26 iyileşti. Ana rakam bu en iyi çeyrek iyileşmesiyle (en fazla medyana kadar); \"medyana inse\" üst sınırdır.",
                ],
                [
                  "Büyüme adayları",
                  "2025'te bağımsızken bir toplayıcıya katılan 361 santralin portföye katkısı (TL/MWh), 2025 ve 2026 verisiyle (toplayıcı üyeliği EPİAŞ'tan ay ay)",
                  "Sıra büyük ölçüde korundu (Spearman 0,67; tahminde en iyi çeyrekteki santrallerin %87'si gerçekte en iyi yarıda); tutar düşük kaldı (gerçek / tahmin 1,67). Sıra güvenilir, tutar alt sınırdır.",
                ],
                [
                  "Arıza tespiti",
                  "EPİAŞ arıza / bakım bildirimleriyle (66.302 bildirim, Ocak 2024 – Ekim 2026) aynı santralin aynı saatleri: 934 havuz santrali (RES / GES / HES), 13.275 işaretli blok (scripts/outage-validation.mts)",
                  "Yakalama iyi: resmi tam duruşların %64'ünde santral planını önceden düşürmüş (dengesizlik yok, işaretlenmemesi doğru); planı düşürülmeyenlerin %67'si işaretlendi (GES %88, RES ve HES %66). İsabet düşük: işaretli blokların %6'sı (kayıp MWh'ın %11'i; RES %15) bir bildirimle örtüşüyor. Kalanı bildirimsiz: yük atma talimatı (santral bazında yayımlanmaz), bildirilmeyen arıza, fiyat kaynaklı duruş ya da veri sorunu olabilir; aynı saatte başka santrallerde de blok olması ayırt etmiyor (bildirimli bloklarda da %88). Bu yüzden bloklar 'olası arıza / kısıntı' olarak kalır, nedeni işletmeciyle teyit edilmelidir; hesaptan çıkarılmaz. Raporda ve sonuç sayfasında her bloğun bildirimle doğrulanıp doğrulanmadığı ve doğrulananların neden sınıfı yazılır (gerekçe metni yazılmaz).",
                ],
              ]}
            />
          </Section>

          <Section id="yon-tahmini" n={next()} title="Sistem yönü tahmini">
            <p>
              Soru: sistemin bir saatte açık mı (YAT yönü, SMF ≥ PTF) fazla mı vereceği önceden kestirilebilir mi, kestirilebiliyorsa bu bilgi
              plan kararında ne kadar değer taşır? Hesap iki adımdır; ikinci adım ancak birincisi geçerse yapılır.
            </p>
            <Table
              head={["Adım", "Yöntem", "Sınır"]}
              rows={[
                [
                  "Bilgi anı",
                  "Gün öncesi: D günü için D-2 sonuna kadarki yön ve makas, D-1'in PTF'si. Gün içi: saatin 2 saat öncesine kadarki yön ve makas, günün PTF'si (gün içi kalıcılıktaki gecikmeyle aynı). Her satır dayandığı en geç saati taşır; test, karar anından sonraki veriye dayanmadığını doğrular.",
                  "Tatil takvimi, yük ve YEK üretim tahmini yok. Piyasa geneli arızalı kapasite (EPİAŞ arıza bildirimleri, karar anında süren) Ekim 2026'da denendi: aynı saatlerde Brier'i iyileştirmedi (düzey: gün öncesi −%2,2, gün içi −%0,9; 28 güne göre sapma: −%1,1 / −%0,6), modele alınmadı.",
                ],
                [
                  "Model",
                  "Yön: L2 düzenlemeli lojistik regresyon (saat ve gün, son 7 ve 28 günde aynı saatin açık oranı, bilinen son yön ve makas, PTF düzeyi). Makas: log ölçeğinde ridge regresyon, tahmin eğitimde görülen aralıkla sınırlı. Düzenleme katsayısı sabittir, test verisine bakılarak ayarlanmaz.",
                  "Basit model: açıklanabilir ama doğrusal.",
                ],
                [
                  "Piyasa sınaması",
                  "Her ay, model yalnız önceki (en çok 4) aydan öğrenir ve o ayı tahmin eder. Rakipler: saat bazında geçmiş açık oranı ve son bilinen yön (geçmiş isabetiyle kalibre). Ölçü Brier skoru; kapı: model toplamda iki rakipten de iyi VE test aylarının yarısından fazlasında ikisinden de iyi.",
                  "Ekim 2026: 31 test ayı (Mart 2024 – Eylül 2026). Gün öncesi Brier 0,224 (rakipler 0,233 / 0,235; 20 ayda iyi), gün içi 0,173 (0,233 / 0,184; 27 ayda iyi); ikisi de kapıyı geçti. Makas büyüklüğü tahmini rakipleri yenmedi; kararda yalnız yön olasılığı kullanılır.",
                ],
                [
                  "Plan ayarı",
                  "Açık bekleniyorsa (olasılık ≥ eşik) plan k_düşük ≤ 1 ile, değilse k_yüksek ≥ 1 ile çarpılır. Eşik ve çarpanlar önceki aylarda dengesizlik + KÜPST farkı toplamını en aza indirecek biçimde seçilir. Gün içi kuralda plan değişikliği GİP'te işlem sayılır: Δ × (GİP AOF − PTF). Geriye dönük test sayfasında, projenin fiyat profiliyle, netleşmiş uzlaştırma biriminde.",
                  "KÜPST santral bazında (toplayıcı topluluğunda da; temkinli). Gün içi işlem hacim sınırı ve fiyat kayması olmadan: iyimser. 2026 projelerinde yalnız 4 test ayı.",
                ],
                [
                  "Kalıcılık + yön",
                  "Gün içi kalıcılık kuralı (2 saat önce görülen hatanın α kadarı GİP'te kapatılır) ile yön tahmininin birleşimi: α, işlemin pahalı tarafı kapatıp kapatmadığına göre ayrı öğrenilir (açık bekleniyorsa eksik, fazla bekleniyorsa fazla pahalıdır); olasılığı olmayan saatte üçüncü bir α. Eşik ve paylar önceki aylardan; fiyat, hacim sınırı ve kayma düz kuralla aynı.",
                  "KÜPST düz kuraldaki gibi dahil değil. Dört parametre öğrenir: örneklem içi kazanç örneklem dışından belirgin yüksek (kısmen ezber).",
                ],
              ]}
            />
            <p>
              Bu bir <b>ölçümdür</b> (&quot;yön bilgisi bu kadar değer taşıyordu&quot;), işlem önerisi değildir: KGÜP&apos;ün santralin en iyi
              tahmininden bilerek saptırılması mevzuat açısından hassastır <span className={STATUS_STYLE.check}>(teyit edilmeli)</span>.
              Ekim 2026 ölçümünde örneklem dışı sonuç portföye göre değişti: gün içi kural dört portföyün dördünde kazandırdı (%1,8–7,0) ama
              üçünde basit gün içi kalıcılık kuralının altında kaldı; gün öncesi kural iki portföyde kazandırdı (%3,8–5,5), ikisinde kaybettirdi.
              Kalıcılık + yön birleşimi 14 portföyün 8&apos;inde düz kalıcılık kuralını geçti, 6&apos;sında gerisinde kaldı; toplam örneklem dışı
              kazanç 156,8 M&apos;dan 160,9 M TL&apos;ye çıktı (+%2,6). En büyük kayıp bir portföyde 0,76 M TL.
              Kod: lib/analysis/direction-*.ts; piyasa sınaması scripts/direction-backtest.mts. <Tag kind="scenario" />
            </p>
          </Section>

          <Section id="kalite" n={next()} title="Veri bütünlüğü ve arıza saatleri">
            <p>
              <b>Veri bütünlüğü:</b> her santral için ay ay beklenen ve mevcut saat sayısı karşılaştırılır; beklenen saatlerin %90&apos;ından azı
              olan aylar raporda ve sayfalarda uyarı olarak gösterilir (eksik ay sessizce hesaptan düşmez).
            </p>
            <p>
              <b>Olası arıza / kısıntı:</b> plan kurulu gücün en az %30&apos;u, gerçekleşen en fazla %2&apos;si olan ve en az 3 saat süren
              bloklar işaretlenir. Aynı saatlerde birden çok santralde görülen bloklar sayılır, ama bu bir neden göstergesi değildir: resmi
              bildirimli gerçek arızalar da aynı oranda eşzamanlı (yangın, şebeke kesintisi gibi ortak olaylar; bkz. Geçmişle sınama). Bu saatler
              tahmin hatası olmayabilir; nedeni işletmeciyle teyit edilmelidir. <Tag kind="estimate" />
            </p>
            <p>
              <b>İşaret kuralı:</b> plan fazlası = (Σ plan − Σ gerçekleşen) / Σ gerçekleşen. Pozitifse plan fazla (santral eksik üretti).
            </p>
          </Section>

          <Section id="dogrulama" n={next()} title="Doğrulamalar">
            <Table
              head={["Kontrol", "Sonuç"]}
              rows={[
                [
                  "EPİAŞ verisi ↔ şirket dosyası (bir rüzgâr santrali)",
                  "KGÜP ilk sürümü 5.880 saatin tamamında birebir; UEVM Mayıs–Aralık 2025 saat saat eşleşti (161.893 MWh)",
                ],
                ["Hızlı maliyet fonksiyonu ↔ saatlik hesap", "2025 ve 2026 kuralları, iki yön, üç sistem durumunda aynı sonuç (otomatik test)"],
                ["Aday taramasındaki Shapley ↔ DSG senaryo motoru", "Aynı adil pay (otomatik test)"],
                [
                  "Dengesizlik fiyatı ↔ EPİAŞ resmi uzlaştırması",
                  "2024 (8.784 saat) ve 2025 (8.760 saat): mevzuat formülü resmi fiyatla aynı (saat başına ortalama fark 0,02 ve 0,01 TL/MWh). 2026 (5.832 saat): 15 dakikalık SMF nedeniyle formül ortalama 33 TL/MWh sapıyor; uygulama resmi fiyatı birebir kullanıyor",
                ],
                ["Maliyet ayrıştırması (Gain 2025 → 2026)", "Dört kalem farkın %97'sini açıklıyor; kalan etkileşim"],
                ["Piyasa verisi", "2024, 2025 ve 2026 fiyatları ve resmi dengesizlik fiyatları EPİAŞ'tan; eski formatta kayıt kalmadı"],
                ["Otomatik testler", "345 test (4.10.2026); her değişiklikte çalıştırılır"],
                ["Rapor tutarlılık denetimi", "Her PowerPoint raporu indirilmeden önce denetlenir: köprü kapanıyor mu, tablo toplamları satırları tutuyor mu, aylar ve ısı haritası dönem toplamına eşit mi, netleşme ve risk primi tutarlı mı, bozuk değer ya da anonim sürümde gerçek ad var mı. Hata varsa rapor verilmez. 7 projenin 28 raporu (4 sürüm) hatasız"],
              ]}
            />
          </Section>

          <Section id="etiketler" n={next()} title="Etiketler, varsayımlar ve sınırlar">
            <Table
              head={["Etiket", "Anlamı"]}
              rows={[
                [<Tag key="e" kind="exact" />, "Açık veriden, mevzuattaki formülle doğrudan hesap"],
                [<Tag key="t" kind="estimate" />, "Formülü ya da oranı tam doğrulanmamış hesap (ör. KÜPST, hedef santral sınıfı)"],
                [<Tag key="v" kind="assumption" />, "Bir varsayıma dayanır (ör. risk primi, adil prim paylaşımı)"],
                [<Tag key="s" kind="scenario" />, "Davranış varsayımı; taahhüt değil (ör. gün içi pozisyon güncellemesi)"],
              ]}
            />
            <p>
              <b>Sınırlar:</b>
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Gün içi işlemler ve ikili anlaşmalar açık veride yok: rakamlar gün içi işlemler öncesi risktir.</li>
              <li>Yük atma talimatları santral bazında yayımlanmaz; talimata düşen üretim dengesizlik gibi görünebilir.</li>
              <li>Dengeden sorumlu grup üyeliği santral bazında yayımlanmaz; uzlaştırma birimi şirket listelerinden ya da kullanıcı seçiminden gelir.</li>
              <li>2026 projeksiyonları, veri yılının fiyatları ve sistem yönleri tekrar ederse geçerlidir.</li>
              <li>
                Resmi dengesizlik fiyatı, o saatte tüm sistemin dengesizliğine göre ağırlıklıdır. 2026&apos;da fiyat 15 dakikalık dilimlere göre
                oluştuğundan, bir santralin kendi dilimlerindeki sapması farklı dağılıyorsa gerçek fiyatı biraz farklı olabilir; santralin 15
                dakikalık üretimi açık veride yoktur.
              </li>
              <li>PTF fiyat tahmini yapılmaz; uygulama ölçer ve açıklar.</li>
            </ul>
          </Section>

          <Section id="kaynakca" n={next()} title="Kaynakça">
            <p className="text-xs text-slate-500">
              Durum: <span className={STATUS_STYLE.verified}>doğrulandı</span> (canlı veriyle ya da resmi metinle kontrol edildi) ·{" "}
              <span className={STATUS_STYLE.source}>kaynak</span> (resmi kaynağa dayanır, metin ayrıca okunmalı) ·{" "}
              <span className={STATUS_STYLE.check}>teyit edilmeli</span> (resmi metin görülmedi) ·{" "}
              <span className={STATUS_STYLE.inference}>çıkarım</span> (mevzuatın yapısından)
            </p>
            <Table
              head={["Konu", "Kaynak", "Durum"]}
              rows={[
                [
                  "Piyasa ve santral verisi",
                  <span key="1">
                    EPİAŞ Şeffaflık Platformu,{" "}
                    <a className="text-indigo-700 underline" href="https://seffaflik.epias.com.tr" target="_blank" rel="noreferrer">
                      seffaflik.epias.com.tr
                    </a>
                  </span>,
                  <span key="s1" className={STATUS_STYLE.verified}>doğrulandı</span>,
                ],
                [
                  "Dengesizlik tutarı formülü; k negatif, l pozitif dengesizlik katsayısı, sistem yönüne bağlı",
                  <span key="2">
                    Elektrik Piyasası Dengeleme ve Uzlaştırma Yönetmeliği md. 110 (RG 29.12.2025, 33122 sayılı değişiklikle),{" "}
                    <a className="text-indigo-700 underline" href="https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=12985&MevzuatTur=7&MevzuatTertip=5" target="_blank" rel="noreferrer">
                      mevzuat.gov.tr
                    </a>
                  </span>,
                  <span key="s2" className={STATUS_STYLE.verified}>doğrulandı (yönetmelik metni)</span>,
                ],
                [
                  "2026 fiyat kuralları: taban V = 150 TL, negatif fiyat B = 100 TL, azami fiyatta AFL × 1,05, 15 dakikalık SMF (SMF_N / SMF_P)",
                  "Dengeleme ve Uzlaştırma Yönetmeliği md. 110/1–2 (RG 29.12.2025, 33122, değişiklik md. 17; yürürlük 1.1.2026)",
                  <span key="s2b" className={STATUS_STYLE.verified}>doğrulandı (yönetmelik metni ve EPİAŞ resmi tutarlarıyla)</span>,
                ],
                [
                  "Resmi dengesizlik fiyatı",
                  "EPİAŞ Şeffaflık Platformu, dengesizlik tutarı ve dengesizlik miktarı servisleri (saatlik, sistem geneli)",
                  <span key="s2c" className={STATUS_STYLE.verified}>doğrulandı</span>,
                ],
                [
                  "2026'dan itibaren k ve l değerleri (açık: k %6, l %3; fazla: k %3, l %6; denge: %3)",
                  <span key="3">
                    EPDK, 11/12/2025 tarihli ve 14030 sayılı Kurul Kararı (RG 29.12.2025, 33122; uygulama 01/01/2026 teslim gününden),{" "}
                    <a className="text-indigo-700 underline" href="https://www.resmigazete.gov.tr/eskiler/2025/12/20251229-18.pdf" target="_blank" rel="noreferrer">
                      resmigazete.gov.tr
                    </a>
                  </span>,
                  <span key="s3" className={STATUS_STYLE.verified}>doğrulandı (karar metni)</span>,
                ],
                [
                  "KÜPST formülü; kaynak bazlı katsayı yetkisi",
                  "Dengeleme ve Uzlaştırma Yönetmeliği md. 110 (3)–(6); formül ve toplayıcıda topluluk bazı: EPDK 13025 ve 14029 md. 1 ve 4",
                  <span key="s4a" className={STATUS_STYLE.verified}>doğrulandı (yönetmelik metni)</span>,
                ],
                [
                  "KÜPST 2025: tolerans %17 / %10 / %5, katsayı 0,03 (arıza ≥ 40 ise 0,05; topluluk 0,03)",
                  "EPDK 21.11.2024 tarihli, 13025 sayılı kurul kararı (RG 17.12.2024), yürürlük 01.01.2025",
                  <span key="s4" className={STATUS_STYLE.verified}>doğrulandı (karar metni)</span>,
                ],
                [
                  "KÜPST 2026: tolerans %15 / %8 / %5, iletimden bağlı lisanssız %20; katsayı 0,05 (arıza ≥ 30 ise 0,08; topluluk 0,05; depolamalı 0,10)",
                  <span key="5">
                    EPDK, 11/12/2025 tarihli ve 14029 sayılı Kurul Kararı (13025 sayılı kararı kaldırır; RG 29.12.2025, 33122; yürürlük 01.01.2026),{" "}
                    <a className="text-indigo-700 underline" href="https://www.resmigazete.gov.tr/eskiler/2025/12/20251229-19.pdf" target="_blank" rel="noreferrer">
                      resmigazete.gov.tr
                    </a>
                  </span>,
                  <span key="s5" className={STATUS_STYLE.verified}>doğrulandı (karar metni)</span>,
                ],
                [
                  "YEKDEM katılımcısı üretimini serbest piyasada satar; dengesizliği kendisine aittir",
                  <span key="6">
                    Yenilenebilir Enerji Kaynaklarının Belgelendirilmesi ve Desteklenmesine İlişkin Yönetmelik md. 15/1, 18, 23/1; md. 16–17
                    mülga (RG 29.4.2016),{" "}
                    <a className="text-indigo-700 underline" href="https://www.mevzuat.gov.tr/MevzuatMetin/yonetmelik/7.5.18907.pdf" target="_blank" rel="noreferrer">
                      mevzuat.gov.tr
                    </a>
                  </span>,
                  <span key="s6" className={STATUS_STYLE.verified}>doğrulandı (yönetmelik metni)</span>,
                ],
                ["GİP kapı kapanışı", "Gün içi piyasasında işlemler teslimattan 60 dakika önce kapanır (EPİAŞ GİP kuralları)", <span key="s7" className={STATUS_STYLE.source}>kaynak</span>],
                [
                  "Shapley değeri",
                  "Shapley, L. S. (1953). A Value for n-Person Games. Contributions to the Theory of Games II, 307–317.",
                  <span key="s8" className={STATUS_STYLE.verified}>doğrulandı</span>,
                ],
              ]}
            />
          </Section>

          <Section id="surum" n={next()} title="Sürüm notları">
            <Table
              head={["Sürüm", "Tarih", "Değişiklik"]}
              rows={[
                [
                  "1.22",
                  "15 Ekim 2026",
                  "Capture rate ve profil indirimi (Aşama 19): sektör karnesinin santralleri için teknoloji ve ay bazında capture rate (güneş %84,8 → %66,2, rüzgâr %99,2 → %105,6); Piyasa sayfasında kart, sonuç sayfasında santralin sektördeki yeri, raporun PPA kutusunda karışıma göre beklenen oranla kıyas. Diğer hesaplar değişmedi.",
                ],
                [
                  "1.21",
                  "15 Ekim 2026",
                  "GİP likiditesi ve işlem sınırı (Aşama 18): toplayıcıların gerçekleşen katılımı ölçüldü (Aksa / Pure P99 %12,5 / %13,7); %10 sınırı bunun ihtiyatlı altı olarak korundu ve portföy bazında bütün gün içi kurallara uygulandı (yön tahminiyle gün içi plan ayarında önceden sınır yoktu). Piyasa sayfasında GİP likiditesi kartı, geriye dönük testte sınırın portföydeki etkisi. Rapor rakamları değişmedi.",
                ],
                [
                  "1.20",
                  "15 Ekim 2026",
                  "Gelecek yıl bütçesi (Aşama 17): Planlama sayfasında bütçe sekmesi ve raporda bütçe slaytı. Tarihsel benzetim (sapma ve fiyat aynı günden, 7 günlük bloklar), bütçe = MWh başına maliyet × üretim; düşük / yüksek üretim yılı teknoloji bazında; makas, kural ve gün içi senaryoları; reel TL, nominal (ay ay enflasyon) ve USD (kur beklentisi). Geçmişle sınama: merkez tutuyor (1,02), aralık dar (P90 kapsamı %54), alt sınır olarak okunur. Diğer hesaplar değişmedi.",
                ],
                [
                  "1.19",
                  "14 Ekim 2026",
                  "Sözleşme fiyatı (Aşama 16): aday sayfasında önerilen dengesizlik hizmet bedeli (taban = adil prim, tavan = tek başına maliyet, öneri = taban + %50 pazarlık alanı) ve teklif kutusu. Sözleşme biçimi 2025 → 2026 sınandı: kâr payı %50'de zarar eden santral sabit TL'de %36, PTF yüzdesinde %74, makasa endeksli bedelde %10; öneri makasa endeksli verilir. Aday taramasına üretim ağırlıklı PTF. Diğer hesaplar değişmedi.",
                ],
                [
                  "1.18",
                  "14 Ekim 2026",
                  "Grup senaryosu (Polat 2026 değerlendirmesi): fayda son planla (gün içi sonrası) hesaplanır; ilk planla hesaplanan fayda gün içi kazancıyla üst üste biniyordu (Polat 44,0 → 35,6 M). Portföyün bir kısmı bir toplayıcıdaysa bağımsız şirketleri o portföye almak ayrıca hesaplanır, alt sınır (Polat ≥ 53,0 M) ve büyükse öneri odur. Grup üyeliği yayımlanmadığı için başlıkta 'olası kaldıraç', metinde doğrulama notu. Kurulu gücü tahmini santral varken toplam kurulu güç kapakta, özette ve Ek A toplamında '~' ile. DSG sayfası da şirket projelerinde son planla (toplayıcı projesinde raporun toplayıcı bloğuyla aynı, ilk planla) ve başka bir toplayıcıdaki santralleri işaretleyip varsayılan seçime almaz. Denetim: dsg-basis, dsg-join, dsg-text, capacity-total. Depolama senaryosu (1.15) şimdilik kaldırıldı: slayt, Ek B bloğu, uygulama sayfası ve denetimler. Diğer hesaplar değişmedi.",
                ],
                [
                  "1.17",
                  "14 Ekim 2026",
                  "YEKDEM çıkışı: aday santral taramasında 'YEKDEM'den çıkan / çıkacak' süzgeci ve rozeti (bu yıl çıkan, süresi bu yıl ya da yakında dolan; ilk YEKDEM yılından ±1 yıl tahmin), toplayıcı raporunun büyüme slaytında sayı ve hedeflerin serbest piyasa yılı (denetim growth-yekdem). Fiyat birimleri: piyasa sayfası, karşılaştırma ve raporun 'Ne değişti?' slaytı nominal TL'nin yanında reel TL (TCMB TÜFE serisi) ve USD (EPİAŞ PTF TL / USD oranı) verir; makasın PTF'ye oranı her yerde. Yıllar arası ayrıştırma varsayılan olarak aynı fiyat düzeyinde: nominal 'fiyat makası' kalemi genel fiyat artışını da içeriyordu. Sektör satırı reel medyan değişim ve reel olarak maliyeti artan pay yazar. Denetim: cost-change-real. Nominal hesaplar değişmedi.",
                ],
                [
                  "1.16",
                  "13 Ekim 2026",
                  "Sistem yönü tahmini (Aşama 14): her saat için sistemin açık verme olasılığı iki karar anında (gün öncesi, gün içi 2 saat önce) yalnız o anda bilinen veriyle tahmin edilir ve walk-forward ile iki basit rakibe karşı sınanır; ikisi de geçti. Plan ayarı (KÜPST dahil) geriye dönük test sayfasında ayrı kartta, ölçüm olarak. Gün içi kalıcılık + yön tahmini birleşik kuralı (düz kalıcılık karşılaştırma satırıyla). Arıza blokları EPİAŞ arıza / bakım bildirimleriyle karşılaştırılır (doğrulanan / bildirimsiz, neden sınıfı); 'Geçmişle sınama' bölümünde arıza tespitinin ölçülen isabet ve yakalama oranları. Piyasa sayfasında 'Sistem yönü tahmini' kartı ve kalibrasyon grafiği. İçindekiler listesine eksik 'Geçmişle sınama' bölümü eklendi. Önceki hesaplar değişmedi.",
                ],
                [
                  "1.15",
                  "10 Ekim 2026",
                  "Depolama senaryosu (Aşama 13): santrallere kurulu gücün %25 / %50 / %100'ü kadar 2 saatlik batarya eklenseydi birleşik işletmenin değeri: gün öncesi arbitrajı + gerçek zamanda sapma takibi + KÜPST + yaşlanma maliyeti. Gerçekçi işletme (doluluk %10–90, günde en çok bir arbitraj döngüsü, kullanılabilirlik %97, enerjinin %25'i dengesizlik için, yaşlanma 20 $/MWh × EPİAŞ kuru). Sapma takibi yalnız yaşlanma ve KÜPST sonrası kazandırıyorsa; barajlı HES ve YEKDEM'de arbitraj yok. KÜPST EPDK 14029'a göre: bütünleşik ünite ayrı birim (şirket projesinde maliyet), toplayıcıda topluluk (kazanç). Piyasa tavanı, önceki yıl ve fiyat farkı daralması (%25 / %50) duyarlılığı; frekans kontrolü (PFK / SFK) fırsatı ve pazar büyüklüğü ayrı satırda, toplama eklenmez. Raporda 'Depolama' slaytı ve Ek B bloğu, uygulamada depolama sayfası. Denetim: storage-base, storage-bound, storage-sum, storage-cap, storage-ceiling, storage-yekdem, storage-monotone, storage-text. %50 senaryosu: Gain 28,8 M (tavanın %23'ü), Polat 62,4 M, Inavitas 182,6 M. Önceki hesaplar değişmedi.",
                ],
                [
                  "1.14",
                  "6 Ekim 2026",
                  "Kurulu güç resmî kayıttan: EPİAŞ santral listelerinde kurulu güç yok, önce dönemdeki en yüksek saatlik üretimin yukarı yuvarlanmışı kullanılıyordu. Artık EPİAŞ YEKDEM katılımcı listesindeki (2016–2025) lisanslı kurulu güç ad, teknoloji ve sahip şirketle eşleştirilir; 367 proje santralinin 236'sında kayıt bulundu. Kayıt yoksa ya da üretim kaydı %10'dan fazla aşıyorsa (YEKDEM'e girdikten sonraki kapasite artışı; 69 santral, üretim kaydın medyan 1,38 katı) en yüksek saatlik üretim alt sınır olarak kullanılır ve raporda '~' ile işaretlenir. Eski tahminin hatası (kaydı bulunan 236 santral): toplamda +%1,8; 20 MW üstü santrallerde medyan mutlak %2,9, 5–20 MW %5,6, 5 MW altı %18. Dengesizlik maliyeti ve santral KÜPST'ü kurulu güce bağlı olmadığı için değişmedi; topluluk KÜPST'ü en fazla %3 (Pure 4,36 → 4,48 M), arıza tespiti küçük santrallerde daha çok saat işaretler, maliyet payı aynı.",
                ],
                [
                  "1.13",
                  "6 Ekim 2026",
                  "Geçmişle sınama (Aşama 12.2–12.5): risk primi geçmiş yılın hata dağılımıyla aralık olarak verilir (858 santralde gerçek / tahmin medyanı 1,36); tahmin iyileştirme fırsatının ana rakamı benzer santrallerin en iyi çeyreğinin bir yılda gerçekte başardığı iyileşmeyle (rüzgâr %12, hidro %26; önce herkes medyana iniyordu, şimdi bu üst sınır; ör. Gain 1,7 → 1,2 M, Pure 36,5 → 22,2 M); büyüme adaylarında sıra sınandı (361 santral, Spearman 0,67), tutar alt sınır. EPİAŞ arıza bildirimi servisi kapalı olduğu için arıza tespiti sınanamadı.",
                ],
                [
                  "1.12",
                  "6 Ekim 2026",
                  "Gün içi gerçekçilik kontrolü: toplayıcıların gerçekleşen net gün içi düzeltmesi (ilk → son plan, GİP işlem maliyeti düşülmüş) toplayıcı kıyasına eklendi; 136 toplayıcı santralinin son planı EPİAŞ'tan çekildi, kıyastaki 23 toplayıcının kapsamı %100. Medyan ≈ %20, en iyi çeyrek ≈ %35–38. Kural tabanlı ek fırsat en iyi çeyrekle sınırlanır ve 2/3/4 saat gecikme duyarlılığı yazılır (Inavitas: %14,5 / %7,5 / %3,3). Yer: Pure ve Enerjisa Müşteri en iyi çeyrekte, Gain medyanın üstünde, Inavitas, Zeros, Met, Atam ve Enerjisa Doğal medyanın altında. Netleşme rakamları değişmedi (Socar 47,86 → 47,69 M: EPİAŞ verisinin güncellenmesi).",
                ],
                [
                  "1.11",
                  "5 Ekim 2026",
                  "Gün içi düzeltmelerin işlem maliyeti: ilk ve son plan farkı GİP saatlik ağırlıklı ortalama fiyatından işlem görmüş sayılır, maliyet = (ilk − son plan) × (GİP − PTF). Önce plan değişikliği bedava sayılıyordu; gün içi kazancı brüt gösteriyor ve net olan kural tabanlı stratejiyle karşılaştırıyordu. Köprüde ayrı adım; gün içi sonrası sapma yükü nettir. Gain: işlem maliyeti 2,2 M TL, gün içi sonrası 24,7 → 26,9 M TL; Inavitas: 14,0 M TL, 240,8 → 254,8 M TL ve net düzeltme (%9,9) stratejinin (%14,5) altında kaldığı için %4,6 ek gün içi fırsatı görünür. Son plan kapsamı raporda, veri kalitesi bandında ve Ek B'de yazılır; kapsam %90'ın altındaysa KÜPST üst sınır etiketini alır (Zeros %95, son planı eksik 3 santral; Met %92, 1 LÜY birimi). Bağımsız doğrulama betiği (scripts/verify-independent.mts): Gain, Inavitas ve Met'in bütün santral-saatlerinde dengesizlik, KÜPST ve GİP işlem maliyeti ham veriden yeniden hesaplandı, en büyük fark 0,00 TL.",
                ],
                [
                  "1.10",
                  "5 Ekim 2026",
                  "Toplayıcı kıyasının kapsamı açık yazılır: yalnız rüzgâr, güneş ve hidro santralleri. Listedeki diğer türler (biyokütle, biyogaz, jeotermal, doğalgaz, kojenerasyon; ör. Aksa 26, Inavitas 16, Zeros 99 santral) ve lisanssız santraller hesapta yoktur. Tek sayfalık özetin başlığı ve dipnotu, raporun kıyas slaytı ve ayrıntı sayfası bunu söyler (önce yalnız '88 santral' yazıyordu; alıcı listesindeki santral sayısıyla karşılaştırınca eksik veri sanabilirdi). Rakamlar değişmedi. Türü veriyle belirlenen 54 santralin hiçbiri rüzgâr, güneş ya da hidro değil (biyokütle 23, doğalgaz 15, jeotermal 2, kömür 1).",
                ],
                [
                  "1.9",
                  "4 Ekim 2026",
                  "Gün içi anlatımı tekleştirildi. Gerçekleşen gün içi düzeltme (ilk plan → son plan, aynı fiyatlar) köprüde kesin hesap olarak gösterilir: sapma yükü gün içi öncesi ve sonrası birlikte (Gain: 33,1 → 24,6 M TL). Kural tabanlı gün içi stratejisi (2 saat önce görülen hatanın kapatılması, geriye dönük test) aynı tabandan ölçüldüğü için gerçekleşenle karşılaştırılır; yalnız gerçekleşenden fazlası ek fırsat sayılır. Önceden rapor gerçekleşen %26 azalmayı gösterirken özet, köprü ve fırsatlarda 'gün içi en fazla %1 azaltır' diyordu. Rapor denetimi bu çelişkiyi artık hata sayar.",
                ],
                [
                  "1.8",
                  "4 Ekim 2026",
                  "Sektör karnesi kalite süzgecine sapma sınırı: net sapma hacmi üretimin %60'ını aşan santraller kıyas ve aday taramasından çıkar. Bu büyüklükte sapma tahmin hatası değildir: büyük barajlarda yük alma / atma (YAL/YAT) talimatı (talimatlı miktar dengeleme piyasasında uzlaşır; santral bazında açık veride yok) ya da plan girilmemiş saatler (ör. Aslancık Barajı 2026: sapma %109, 1.352 saat plan var üretim yok). Bu santraller aday listesinin başına çıkıyordu. 2026 (Oca–Ağu): 40 santral elendi, medyanlar rüzgâr 176 → 175, güneş 147 → 143, hidro 93 → 90 TL/MWh; 2025: 13 santral. Toplayıcılar arası kıyas güncel medyanlarla yeniden kuruldu (önceki dosya kalite süzgeci genişletilmeden önceki medyanlarla üretilmişti).",
                ],
                [
                  "1.7",
                  "3 Ekim 2026",
                  "2026 kuralları Resmî Gazete'deki kararlardan doğrulandı: k ve l katsayıları 14030, KÜPST toleransları ve katsayıları 14029 sayılı karar (taslak değil nihai metin; değerler aynı). Düzeltme: toplayıcı portföyünde KÜPST, kararların md. 4'üne uygun olarak topluluk (portföy) birimi bazında, kurulu güce ağırlıklı toleransla ve topluluk katsayısıyla hesaplanır; önceden santral bazında hesaplanıyordu. Inavitas (Oca–Ağu 2026): KÜPST 59,6 M TL → 7,2 M TL, sapma yükü 306,1 M TL → 253,8 M TL. Şirket projelerinde (toplayıcı olmayan) hesap değişmedi. Projelerin sektörle kıyaslamasında hidro santraller artık kendi alt tipinin (barajlı / nehir tipi; tahmini) sektör dağılımıyla kıyaslanır; alt tipi belirsiz santraller en az 3 tane ise ayrı satır, aksi halde kıyas dışı kalır.",
                ],
                [
                  "1.6",
                  "30 Eylül 2026",
                  "Toplayıcılar arası kıyas benzer ölçekli toplayıcılarla ve teknoloji karışımına göre düzeltilmiş endeksle (portföy maliyeti / aynı karışımdaki sektör medyanı maliyeti); tabloda santral sayısı, üretim ve karışım.",
                ],
                [
                  "1.5",
                  "30 Eylül 2026",
                  "KÜPST gün içi piyasası kapandıktan sonraki son KGÜP'e göre (mevzuat denetimi 3/3). Yeni bölümler: toplayıcılar arası kıyas, üreticilerin portföye katkısı, gün içi etkinlik ve netleşmiş tahmin fırsatı (eski üst sınır yerine). Dönem içinde devreye giren santraller sıralamalara alınmaz. Raporun anonim sürümü ve tek sayfalık özeti.",
                ],
                [
                  "1.4",
                  "29 Eylül 2026",
                  "Dengesizlik fiyatı EPİAŞ'ın resmi uzlaştırmasından (sistem dengesizlik tutarı / miktarı). 2026 fiyat kuralları (taban 150 TL, negatif fiyat −100 TL, 15 dakikalık SMF) eklendi. 2024–2025'te formül resmi fiyatla aynı; 2026'da resmi fiyatla Gain portföy dengesizliği %10 arttı (23,9 → 26,2 M TL), sektörde güneş medyanı 113 → 134 TL/MWh.",
                ],
                [
                  "1.3",
                  "29 Eylül 2026",
                  "YEKDEM: \"dengesizlik YEKDEM havuzunda kalır\" varsayımı (eski ana senaryo) kaldırıldı. YEK Yönetmeliği md. 15/1 ve 23/1'e göre YEKDEM katılımcısı üretimini serbest piyasada kendisi satar ve dengesizliği kendisine aittir; havuz uzlaştırmasını düzenleyen md. 16–17 2016'da kaldırılmıştı. YEKDEM santralleri artık tüm hesaplarda diğer santrallerle aynı sayılır.",
                ],
                [
                  "1.2",
                  "29 Eylül 2026",
                  "KÜPST 2026 fiyat katsayısı 0,03'ten 0,05'e çıkarıldı (EPDK 2026 taslağı; tolerans oranları zaten bu taslaktan alınıyordu). 2026 KÜPST tutarları yaklaşık %67 arttı. 2025 değerleri 13025 sayılı karar metniyle doğrulandı.",
                ],
                [
                  "1.1",
                  "29 Eylül 2026",
                  "k ve l gösterimi yönetmelik metnine göre düzeltildi (k negatif, l pozitif dengesizlik katsayısı; sistem yönüne göre tablo). Hesaplar değişmedi: uygulama zaten sistemle aynı yöndeki sapmaya %6 uyguluyordu. Kaynakçada yönetmelik ve EPDK taslak metni doğrulandı. 15 dakikalık SMF notu eklendi.",
                ],
                [
                  "1.0",
                  "28 Eylül 2026",
                  "İlk yayın. Kapsam: dengesizlik ve KÜPST, uzlaştırma birimi ve YEKDEM senaryoları, adil prim, risk primi, maliyet ayrıştırması, piyasa göstergeleri, sektör karnesi (2025 ve 2026 Ocak–Ağustos), aday ve hedef santraller, gün içi senaryosu.",
                ],
              ]}
            />
          </Section>

          <p className="border-t border-slate-200 pt-4 text-xs text-slate-500">
            TR-Energy Analyst · Metodoloji sürüm {VERSION} ({VERSION_DATE}) · Veri: EPİAŞ Şeffaflık Platformu
          </p>
        </main>
      </div>
    </div>
  );
}
