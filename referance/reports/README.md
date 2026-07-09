# Report corpus — gerçek DOM test fixtureları

Bu klasördeki `report[N].md` adlı her dosya (ör. `report[1].md`,
`report[12].md` — sayı sınırı yok), `test/extractor.mjs` tarafından otomatik
bulunur ve gerçek DOM üzerinde extraction testinden geçirilir (Scenario 3b).
Dosya eklemek yeterlidir; test koduna dokunmak gerekmez.

## Yeni rapor ekleme

1. Gemini'de bir Deep Research raporu aç.
2. DevTools → Elements'ta `#extended-response-markdown-content` öğesini bul
   (rapor içeriğinin kökü).
3. Sağ tık → **Copy → Copy outerHTML**.
4. Bu klasöre `report[N].md` adıyla yapıştır; N mevcut en büyük sayının bir
   fazlası olsun (ör. `report[6].md`). Başka adlı dosyalar taranmaz.

Kaynak panelinin DOM'u genellikle bu kopyanın içinde zaten bulunur; ayrıca
kopyalamak gerekmez.

Her test şu değişmezleri doğrular: extraction hatasız tamamlanır, başlık ve
5'ten fazla blok üretir, metne `[object Object]` sızmaz ve dipnot varsa en az
biri URL'sine çözülür.
