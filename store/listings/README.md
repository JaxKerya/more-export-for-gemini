# Mağaza listing metinleri (Chrome / Firefox / Edge)

Bu klasördeki her `<dil>.txt` dosyası, mağazadaki **ayrıntılı açıklamanın**
(detailed description) o dildeki tam metnidir. Diller, arayüz kataloglarıyla
aynıdır: `en`, `tr`, `es`, `pt_BR`, `de`, `fr`, `ja`, `ko`.

Aynı `npm run build` zip'i üç mağazaya da yüklenir; ayrı paket yoktur.

## Chrome Web Store

1. [Developer Dashboard](https://chrome.google.com/webstore/devconsole) →
   uzantı → **Store listing** sekmesi.
2. Sağ üstteki dil menüsünden **Add language** ile ilgili dili ekle.
3. O dilin *Description* alanına buradaki dosyanın içeriğini aynen yapıştır.
4. Her dil için tekrarla; varsayılan dil **English** kalmalı (dosya: `en.txt`).

## Firefox — addons.mozilla.org (AMO)

1. [Add-on Developer Hub](https://addons.mozilla.org/developers/) → **Submit a
   New Add-on** → "On this site" → `npm run build` zip'ini yükle.
2. Yüklemeden önce `npm run lint:amo` temiz olmalı (CI zaten koşuyor) — bu,
   AMO'nun yükleme anında çalıştırdığı doğrulamanın kendisidir.
3. Açıklamalar: ürün sayfası düzenleyicisinde dil başına aynı `<dil>.txt`
   içeriği kullanılır (AMO sınırlı HTML kabul eder; düz metin güvenlidir).
4. Manifest'teki `browser_specific_settings.gecko.id`
   (`more-export-for-gemini@jaxkerya.com`) eklentinin kalıcı kimliğidir —
   değiştirmeyin, güncellemeler bu kimlikle eşleşir.

## Edge Add-ons

1. [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge) →
   yeni uzantı → aynı zip'i yükle (Edge, Chrome paketini olduğu gibi kabul eder).
2. Açıklamalar: dil başına aynı `<dil>.txt` içerikleri.

Notlar:

- **Kısa açıklama (summary) otomatik yerelleşir:** manifest'teki
  `__MSG_appDesc__`, paketteki `_locales/<dil>/messages.json` üzerinden çözülür;
  dashboard'a ayrıca girilmez.
- Ekran görüntüleri dil başına ayrı yüklenebilir ama zorunlu değildir; ortak
  görseller tüm dillerde gösterilir.
- CWS ayrıntılı açıklamada markdown/HTML desteklemez — bu dosyalar bilerek düz
  metindir; boş satırlar ve `-` maddeleri olduğu gibi korunur.

## Bakım

Kullanıcıya görünür bir özellik eklendiğinde/kaldırıldığında **sekiz dosya
birlikte** güncellenmelidir (kaynak: `en.txt`; diğerleri onun çevirisidir).
Sürüm yayınlarken `RELEASE_CHECKLIST.md` bu klasörü kontrol etmeyi hatırlatır.
