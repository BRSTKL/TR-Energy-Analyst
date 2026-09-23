import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TR-Energy Analyst | Dengesizlik ve Piyasa Strateji Analiz Aracı",
  description:
    "Enerji üreticilerinin (RES/HES/GES) gün öncesi üretim tahmini ile gerçekleşen üretimi kıyaslayarak dengesizlik maliyetini hesaplayan, piyasa verileriyle (PTF/SMF/Sistem Yönü) ilişkilendirip strateji önerisi üreten analiz aracı",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
