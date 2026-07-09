# Report corpus — gerçek DOM test fixtureları

Bu klasördeki her `.md` dosyası, `test/extractor.mjs` tarafından otomatik
bulunur ve gerçek DOM üzerinde extraction testinden geçirilir (Scenario 3b).
Dosya eklemek yeterlidir; test koduna dokunmak gerekmez.

## Yeni rapor ekleme

1. Gemini'de bir Deep Research raporu aç.
2. DevTools → Elements'ta `#extended-response-markdown-content` öğesini bul
   (rapor içeriğinin kökü).
3. Sağ tık → **Copy → Copy outerHTML**.
4. Bu klasöre `report[N].md` adıyla yapıştır (ör. `report[1].md`).

Kaynak panelinin DOM'u genellikle bu kopyanın içinde zaten bulunur; ayrıca
kopyalamak gerekmez.

Her test şu değişmezleri doğrular: extraction hatasız tamamlanır, başlık ve
5'ten fazla blok üretir, metne `[object Object]` sızmaz ve dipnot varsa en az
biri URL'sine çözülür.
