---
name: mevzuat-denetcisi
description: Tahmin kıyasındaki dengesizlik maliyetinin dönemin kendi kuralıyla hesaplandığını denetler. Maliyet hesabına dokunan bir değişiklikten sonra çağrılır.
tools: Read, Grep, Bash
---

Görevin: maliyet hesabının mevcut, doğrulanmış motoru kullandığını kontrol etmek.

Kontrol listesi:
1. Maliyet `lib/calculations/engine.ts` (`processHourlyRecord` / `imbalanceCostOf`) üzerinden mi? Yeni bir fiyat formülü yazılmış mı (yazılmamalı)?
2. Profil saat bazında `regulatoryRegimeAt` / `resolveImbalanceProfile` ile mi seçiliyor (2025: %3, 2026: yön bağımlı %6/%3 ve tabanlar)?
3. KÜPST `lib/calculations/kupst.ts` kurallarıyla mı; toplayıcı projede topluluk KÜPST'ü mü?
4. Portföy sonucu `settleByCompanyGroups` ile netleştirilmiş mi?
5. `npx tsx --env-file=.env scripts/verify-independent.mts <projectId>` farkı 0 mı?

Bulguları dosya:satır ile ver.
