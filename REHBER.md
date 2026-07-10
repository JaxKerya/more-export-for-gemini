# Geliştirici Rehberi

Projedeki tüm npm komutlarının, betiklerin ve GitHub otomasyonlarının kısa açıklaması. Detaylı sürüm adımları için [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), İngilizce genel bakış için [README.md](README.md).

## Kurulum

```bash
npm install        # test/lint araç zinciri (eklentinin kendisi sıfır bağımlılık)
```

Node.js 20+ gerekir. Eklentiyi denemek için: `chrome://extensions` → Geliştirici modu → **Paketlenmemiş öğe yükle** → depo kök klasörü.

## Günlük komutlar

| Komut | Ne yapar |
| --- | --- |
| `npm test` | Tüm test paketleri sırayla (~1.000 kontrol). Commit'ten önce çalıştırın. |
| `npm run lint` | ESLint — kod stili ve hata avı (`src/`, `test/`, `scripts/`). |
| `npm run typecheck` | TypeScript `checkJs` — tip hataları (derleme yok, sadece analiz). |
| `npm run build` | Mağaza paketini üretir: `store/more-export-for-gemini-v<sürüm>.zip`. Her işletim sisteminde çalışır. |

## Test paketleri (tek tek çalıştırmak için)

| Komut | Kapsam |
| --- | --- |
| `npm run test:edge` | Exporter'ların birim/entegrasyon testleri (IR → çıktı, Türkçe karakterler, uç durumlar). |
| `npm run test:validate` | Yüksek seviye çıktı doğrulaması + manifest bütünlüğü. |
| `npm run test:extractor` | Gerçek extractor, sentetik Gemini DOM fixture'ına karşı. |
| `npm run test:menu` | Paylaşım menüsü enjeksiyonu (tespit, filtreleme, 12 öğe sınırı). |
| `npm run test:background` | Service worker (bağlam menüsü, kısayollar, ilk kurulum) — sahte `chrome` API ile. |
| `npm run test:content` | Content script mesaj işleyicileri (PING / EXPORT / QUALITY / DIAGNOSE). |
| `npm run test:history` | Export geçmişi (LRU, boyut sınırları) + profil doğrulama. |
| `npm run test:options` | Options sayfası, gerçek HTML üzerinde (toggle'lar, profiller, geçmiş, senkron). |
| `npm run test:i18n` | Çeviri katalogları: diller arası anahtar pariteleri, `$1` yer tutucu sayıları, HTML/JS/manifest referanslarının çözülmesi. |

## Sürüm çıkarma (özet)

```bash
npm run bump -- 2.2.0                          # 1. sürüm numaralarını tek komutla güncelle
# 2. CHANGELOG.md → [Unreleased] içeriğini yeni [2.2.0] bölümüne taşı
# 3. src/options/modules/whats-new.js → RELEASE_NOTES'a 2.2.0 girdisi ekle
# 4. RELEASE_CHECKLIST.md'deki 5 dakikalık manuel duman testini koş (gerçek Gemini sayfası)
git commit -am "Release 2.2.0"
git tag v2.2.0 && git push origin master v2.2.0   # 5. gerisi otomatik
```

`npm run bump` şunları eşitler: `manifest.json` (`version` + `version_name`), `package.json`, `package-lock.json`. Çıktısında kalan manuel adımları da basar.

## GitHub Actions (otomasyonlar)

| Workflow | Tetikleyici | Ne yapar |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Her push ve PR (`master`) | `npm ci` → lint → typecheck → tüm testler. Kırmızıysa merge etmeyin. |
| `.github/workflows/release.yml` | `v*` tag push'u | Önce tag'in `manifest.json` sürümüyle eşleştiğini doğrular (eşleşmezse durur), sonra lint + typecheck + testler → `npm run build` → zip'i GitHub Release'e ekler. |

Release oluştuğunda zip'i **Releases** sayfasından indirip Chrome Web Store panosuna yüklersiniz — mağaza yüklemesi otomatik değildir (Google API anahtarı gerektirir).

## Yardımcı betikler (`scripts/`)

| Betik | Amaç |
| --- | --- |
| `scripts/build.mjs` | Mağaza zip'i (dosya listesi `manifest.json`'dan türetilir; `npm run build`). |
| `scripts/bump.mjs` | Sürüm numarası güncelleme (`npm run bump -- x.y.z`). |
| `scripts/external-validate.mjs` | Debug export çıktısını harici araçlarla doğrular (`npm run validate:external`). |
| `scripts/validate-rtl.mjs` | Sağdan-sola (RTL) çıktı doğrulaması (`npm run validate:rtl`). |
| `scripts/build-katex.mjs`, `build-hljs-vendor.mjs` | `src/vendor/` altındaki tek dosyalık KaTeX / highlight.js paketlerini yeniden üretir (yalnızca vendor güncellerken gerekir). |

## Çoklu dil (i18n)

Arayüz metinleri `_locales/<dil>/messages.json` kataloglarından gelir. Dil varsayılan olarak tarayıcıdan seçilir (`chrome.i18n`); kullanıcı Settings → Overview'daki **Interface Language** seçicisiyle bir dile sabitleyebilir (ayrı `uiLang` sync anahtarı; profillere bilinçli olarak dahil değildir). Sabitlenen dilin kataloğu `i18n.js` tarafından fetch ile yüklenir — bu yüzden `_locales/*/messages.json` `web_accessible_resources` listesindedir. Manifest'ten gelen metinler (mağaza açıklaması, kısayol açıklamaları) her zaman tarayıcı dilinde kalır. Format adları (Markdown, PDF, BibTeX…), What's New panosu ve CHANGELOG bilinçli olarak İngilizce kalır.

- **Yeni string eklerken:**
  1. `_locales/en/messages.json`'a anahtarı ekleyin (yalnızca `[a-zA-Z0-9_]`; yer tutucular `$1`, `$2`…).
  2. Aynı anahtarı diğer tüm dillere de ekleyin — parite testi eksik anahtarı kırmızıya boyar.
  3. HTML'de: öğeye `data-i18n="anahtar"` (metin), `data-i18n-html` (işaretlemeli), `data-i18n-placeholder` / `data-i18n-title` / `data-i18n-aria` (öznitelik) verin; İngilizce metni yedek olarak satır içinde bırakın.
  4. JS'te: `GEP.i18n.t("anahtar")` veya yer tutucuyla `t("anahtar", deger)` / `t("anahtar", [d1, d2])`.
  5. `npm run test:i18n` — kullanılmayan/eksik anahtar ve yer tutucu uyumsuzluğu burada yakalanır.
- **Yeni dil eklerken:** `_locales/<kod>/messages.json` dosyasını `en`'den kopyalayıp çevirin (Chrome dil kodları: `tr`, `es`, `pt_BR`, `de`, `fr`, `ja`, `ko`…) ve dili `src/lib/i18n.js` içindeki `SUPPORTED_LOCALES` listesi ile `options.html`'deki dil seçicisine ekleyin. Build betiği `_locales/` altındaki her dili otomatik paketler, parite testi anahtar kümesini doğrular. Mağaza açıklamasını Web Store panosunda aynı dilde elle girmeyi unutmayın.
- **Denemek için:** Settings → Overview → Interface Language'tan dili sabitleyin; ya da tarayıcı dilini değiştirip (`chrome://settings/languages`) eklentiyi yeniden yükleyin.

## Sık senaryolar

- **Kod değiştirdim, göndermeden önce:** `npm run lint && npm run typecheck && npm test`
- **Yeni ayar kartı ekleyeceğim:** `src/options/modules/` altına yeni modül + `options.js`'te `init` çağrısı; `test/options.mjs`'e kontrol ekleyin.
- **Yeni export formatı ekleyeceğim:** `src/exporters/` + `manifest.json` `web_accessible_resources` + `settings.js` DEFAULTS + `export-opts.js`; `test/edge-cases.mjs`'e test ekleyin (build dosya listesi manifest'ten geldiği için pakete otomatik girer).
- **Gemini DOM'u değişti, menü çıkmıyor:** başlangıç noktaları `src/lib/menu-injector.js` seçicileri ve Settings → Tools → Run diagnostics çıktısı.
- **CI kırmızı ama yerelde yeşil:** CI Ubuntu'da çalışır; yol ayracı / satır sonu (CRLF) farklarına bakın.
