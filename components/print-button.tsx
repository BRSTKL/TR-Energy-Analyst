"use client";

import React from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Sayfayı tarayıcının yazdırma penceresiyle PDF'e çevirir (baskı düzeni globals.css'teki @media print kurallarıyla) */
export function PrintButton({ label = "PDF olarak indir" }: { label?: string }) {
  return (
    <Button size="sm" variant="outline" className="gap-1.5 print:hidden" onClick={() => window.print()}>
      <FileDown className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}
