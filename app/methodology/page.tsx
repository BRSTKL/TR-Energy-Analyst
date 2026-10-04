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

const VERSION = "1.9";
const VERSION_DATE = "4 Ekim 2026";

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
  { id: "sektor", title: "Sektör karnesi" },
  { id: "toplayici-kiyas", title: "Toplayıcılar arası kıyas" },
  { id: "uretici-katki", title: "Üreticilerin portföye katkısı" },
  { id: "aday", title: "Aday ve hedef santraller" },
  { id: "gip", title: "Gün içi piyasa senaryosu" },
  { id: "gun-ici-etkinlik", title: "Gün içi etkinlik ve tahmin fırsatı" },
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
              değil. Her rakamın ne kadar kesin olduğu rapordaki etiketlerle belirtilir (bölüm 19).
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

          <Section id="sektor" n={next()} title="Sektör karnesi">
            <p>
              EPİAŞ&apos;ta üretimi yayımlanan lisanslı rüzgâr, güneş ve (isteğe bağlı) hidro santrallerinin aynı dönemdeki göstergeleri, aynı
              motordan. Santraller <b>tek başına</b> kıyaslanır: amaç tahmin kalitesini karşılaştırmaktır, şirket içi netleşme şirketten
              şirkete değiştiği için kıyasa katılmaz.
            </p>
            <p>
              <b>Kalite süzgeci:</b> dönem saatlerinin en az %90&apos;ında verisi olan ve plan / gerçekleşen oranı 0,5–2 arasında olan ve net sapma hacmi üretimin %60&apos;ını aşmayan santraller
              kıyaslanır (eksik ya da bariz tutarsız veri elenir; dar aralık kötü tahmin eden santralleri de eleyip medyanı düşürdüğü için genişletildi). Dağılım santral sayısına göre P10, P25, medyan, P75 ve P90 ile, ayrıca üretim
              ağırlıklı ortalamayla verilir; santralin yeri teknoloji içindeki yüzdelik sırasıdır. <b>K1 görünümü</b> olası arıza / kısıntı saatlerini (bölüm 17) dışarıda bırakır.
            </p>
            <p>
              Hidro alt tipi (barajlı / nehir tipi) addan ya da gün içi üretim esnekliğinden tahmin edilir. <Tag kind="exact" /> (alt tip:{" "}
              <Tag kind="estimate" />)
            </p>
          </Section>

          <Section id="toplayici-kiyas" n={next()} title="Toplayıcılar arası kıyas">
            <p>
              EPİAŞ&apos;taki her toplayıcının santral listesindeki lisanslı santraller için aynı yöntem: saatlik sapma (UEVM − ilk KGÜP),
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
              lisanssız santraller ve KÜPST hesapta yoktur. Ham MWh başına maliyet teknoloji karışımından etkilenir (hidro ağırlıklı
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
          </Section>

          <Section id="gun-ici-etkinlik" n={next()} title="Gün içi etkinlik ve tahmin fırsatı">
            <p>
              <b>Gün içi etkinlik:</b> uzlaştırma birimindeki saatlik toplam sapma ilk plana ve son plana göre aynı fiyatlarla
              değerlenir. Son plan gün içi işlemlerden sonra kalan pozisyondur; aradaki fark gün içi düzeltmelerin dengesizliği ne kadar
              azalttığıdır. Gün içi işlemlerin alım-satım fiyatından doğan kâr ya da zarar açık veride olmadığından hariçtir. Planı gün
              içinde hiç değişmeyen (saatlerin %1&apos;inden azında) santraller ayrıca listelenir. <Tag kind="exact" />
            </p>
            <p>
              <b>Tahmin iyileştirme fırsatı:</b> sektör medyanının üstündeki santrallerin (dönem içinde devreye girenler hariç) saatlik
              sapması, MWh başına riskleri medyana inecek oranda küçültülür (dengesizlik fiyatı plana bağlı olmadığından maliyet sapmayla
              orantılıdır). Kazanç uzlaştırma biriminde yeniden netleştirilerek bulunur; santral tek başına kazanç yalnız bağlam olarak
              verilir, çünkü portföyde ters sapmalar zaten birbirini dengeler. KÜPST azalması son plana göre ayrıca eklenir.{" "}
              <Tag kind="scenario" />
            </p>
          </Section>

          <Section id="kalite" n={next()} title="Veri bütünlüğü ve arıza saatleri">
            <p>
              <b>Veri bütünlüğü:</b> her santral için ay ay beklenen ve mevcut saat sayısı karşılaştırılır; beklenen saatlerin %90&apos;ından azı
              olan aylar raporda ve sayfalarda uyarı olarak gösterilir (eksik ay sessizce hesaptan düşmez).
            </p>
            <p>
              <b>Olası arıza / kısıntı:</b> plan kurulu gücün en az %30&apos;u, gerçekleşen en fazla %2&apos;si olan ve en az 3 saat süren
              bloklar işaretlenir. Aynı saatlerde birden çok santralde görülen bloklar sistem geneli kısıntıya (yük atma talimatı, YAT)
              işaret eder. Bu saatler tahmin hatası olmayabilir; nedeni işletmeciyle teyit edilmelidir. <Tag kind="estimate" />
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
