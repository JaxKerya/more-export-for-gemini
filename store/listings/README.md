# Chrome Web Store listing metinleri

Bu klasördeki her `<dil>.txt` dosyası, mağazadaki **ayrıntılı açıklamanın**
(detailed description) o dildeki tam metnidir. Diller, arayüz kataloglarıyla
aynıdır: `en`, `tr`, `es`, `pt_BR`, `de`, `fr`, `ja`, `ko`.

## Mağazaya nasıl girilir

1. [Developer Dashboard](https://chrome.google.com/webstore/devconsole) →
   uzantı → **Store listing** sekmesi.
2. Sağ üstteki dil menüsünden **Add language** ile ilgili dili ekle.
3. O dilin *Description* alanına buradaki dosyanın içeriğini aynen yapıştır.
4. Her dil için tekrarla; varsayılan dil **English** kalmalı (dosya: `en.txt`).

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
