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

## Sık senaryolar

- **Kod değiştirdim, göndermeden önce:** `npm run lint && npm run typecheck && npm test`
- **Yeni ayar kartı ekleyeceğim:** `src/options/modules/` altına yeni modül + `options.js`'te `init` çağrısı; `test/options.mjs`'e kontrol ekleyin.
- **Yeni export formatı ekleyeceğim:** `src/exporters/` + `manifest.json` `web_accessible_resources` + `settings.js` DEFAULTS + `export-opts.js`; `test/edge-cases.mjs`'e test ekleyin (build dosya listesi manifest'ten geldiği için pakete otomatik girer).
- **Gemini DOM'u değişti, menü çıkmıyor:** başlangıç noktaları `src/lib/menu-injector.js` seçicileri ve Settings → Tools → Run diagnostics çıktısı.
- **CI kırmızı ama yerelde yeşil:** CI Ubuntu'da çalışır; yol ayracı / satır sonu (CRLF) farklarına bakın.
