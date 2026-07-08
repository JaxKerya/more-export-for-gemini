# More Export for Gemini

Google Gemini Deep Research raporlarının farklı dosya formatlarında dışa aktarılmasını veya panoya kopyalanmasını sağlayan bir tarayıcı eklentisidir.

## Amaç

Gemini Deep Research tarafından üretilen raporların varsayılan dışa aktarım seçeneklerinin (Google Dokümanlar ve Drive ile sınırlı olması) ötesine geçerek; kullanıcıların raporları internet bağlantısına veya harici platformlara ihtiyaç duymadan Markdown, TXT, HTML, JSON, DOCX, PDF, EPUB, LaTeX gibi geniş bir format yelpazesinde yerel olarak kaydedebilmesini, akademik atıf biçimlerini düzenleyebilmesini ve tüm bu formatları toplu olarak indirebilmesini sağlamaktır.

## Genel Bakış

Eklenti, `gemini.google.com` adresindeki rapor sayfasının DOM yapısını izler. Paylaşım menüsü açıldığında, `MutationObserver` ile bu durumu tespit ederek Gemini menüsüne görsel olarak entegre edilmiş kendi dışa aktarma butonlarını ekler. 

Kullanıcı bir formata tıkladığında, sayfa içerisindeki rapor elementleri ile kaynak panelindeki (`browse-web-item`) atıf verileri ayıklanarak format-bağımsız bir ara temsil (Intermediate Representation - IR) nesnesine dönüştürülür. Bu ara temsil nesnesi, eklentinin dönüştürücü (exporter) modüllerine iletilir; kullanıcının belirlediği atıf stili, içindekiler tablosu ve dosya adı şablonu seçenekleri uygulanarak çıktı dosyası (veya panoya kopyalanacak veri) oluşturulur. Tüm bu süreç üçüncü taraf bir sunucu kullanılmadan, tamamen tarayıcı içinde yerel olarak yürütülür.

## Temel Özellikler

* **Dışa Aktarma Formatları**:
  * **Metin Formatları**: Markdown (.md) [GFM, CommonMark, Obsidian ve Notion biçimleri], Düz Metin (.txt), HTML (.html), HTML – Reader (.html) [tema/anahat/okuma ilerlemesi içeren, kendi kendine yeten okuma sayfası], JSON (.json), LaTeX (.tex).
  * **Veri Formatları**: CSV (.csv) [rapor tabloları].
  * **Akademik Referans Formatları**: BibTeX (.bib), RIS (.ris), CSL-JSON (.json) [Zotero/Pandoc citeproc].
  * **Zengin Doküman Formatları**: Word (.docx) [OpenXML standartlarında], Rich Text (.rtf), PDF (.pdf) [yazdırma arayüzü ile], EPUB (.epub) [e-kitap paketi olarak].
  * **Paketler**: Vault ZIP [ana Markdown + references.md + tablo başına CSV], tüm etkin formatları tek arşivde toplayan Download All ZIP.
* **Matematik/Denklem Desteği**: KaTeX/MathML formülleri (LaTeX kaynağı, varsa MathML ve KaTeX'in hâlihazırda render edilmiş HTML'i) yakalanır. HTML/Reader/PDF/EPUB çıktıları, formül içerdiklerinde gömülü KaTeX stil sayfasını (woff2 fontları base64 olarak gömülü) ekleyerek denklemi tamamen çevrimdışı, ağ gerektirmeden ve kaynak sayfadakiyle birebir aynı gösterir. Yerleşik bir LaTeX dönüştürücüsü (`src/lib/texmath.js`) sayesinde DOCX'te gerçek Office Math (OMML) üretilir. Ayrıca Markdown'da `$…$`/`$$…$$`, LaTeX'te `\(…\)`/`\[…\]`, düz metin tabanlı formatlarda okunabilir Unicode metin olarak işlenir.
* **Çok Dilli ve Sağdan-Sola (RTL) Desteği**: Çıkarıcı, raporun dilini (`document.documentElement.lang`) ve baskın yazı yönünü (`GEP.extractor.detectDir`; Arapça, İbranice, Farsça, Urduca, Süryanice, Thaana, NKo ve Arapça/İbranice sunum biçimlerini kapsar) tespit edip IR'a ekler. Bu `lang`/`dir` tüm gösterim formatlarına akar: HTML/Reader/PDF kök `<html lang dir>` ayarlar ve her bloğu (`<p>`, başlıklar, `<li>`, `<th>/<td>`, `<figcaption>`) `dir="auto"` ile işaretler; ilgili CSS, kenar/dolgu/hizalamada mantıksal özelliklere (`padding-inline-start`, `border-inline-start`, `text-align:start`) geçirilerek RTL'de doğru yöne döner. EPUB `<dc:language>` ile XHTML kökünde `xml:lang`/`lang`/`dir` ve `<body dir>` üretir; DOCX, `styles.xml` varsayılanlarını `<w:bidi/>`/`<w:rtl/>` + sağa hizalama yapar ve tablolara `<w:bidiVisual/>` ekler. Latin dışı (CJK, Kiril, Yunan…) içerik zaten yakalanıyordu; bu özellik onların **doğru gösterimini** sağlar. `lang`/`dir` taşımayan IR'lar için geriye dönük uyumludur (lang'sız, `ltr`). **Bilinen sınır:** LaTeX'te gerçek RTL dizgisi (`polyglossia`+`bidi`+XeLaTeX gerektirir) şimdilik kapsam dışıdır; `.tex` metni yakalar ama soldan-sağa dizer.
* **Sayfa ve Tipografi Kontrolleri (PDF / HTML / DOCX / LaTeX)**: Ayarlar → Options → **Document Layout** ile dört doküman formatına tek bir kurucudan (`GEP.exportOpts.build`) akan ortak düzen seçenekleri: **kâğıt boyutu** (A4 / US Letter), **kenar boşlukları** (dar / normal / geniş), **temel yazı tipi boyutu** (10 / 11 / 12 pt), **satır aralığı** (normal / 1.5 / çift) ve **yazı tipi ailesi** (sans / serif). PDF/HTML yazdırma stil sayfasını (`@page`, gövde `font-size`/`line-height`/`font-family`), DOCX `w:pgSz`/`w:pgMar`/`w:rFonts`/`w:sz`/`w:line` (mm→twip, pt→yarım-punto) ve LaTeX `documentclass` boyut/kâğıt + `geometry`/`setspace`/font paketini kurar. Varsayılanlar önceki çıktıyı birebir korur (tek bilinçli değişiklik: LaTeX varsayılan gövde fontu artık sans; klasik görünüm için **Serif** seçilir). Reader HTML kendi ayrı kontrollerini korur.
* **Kaynak Hijyeni (tekilleştirme / sıralama / DOI-ISBN)**: Ayarlar → Options → **Sources** ile çevrimdışı bir dışa-aktarım-öncesi dönüşüm (`GEP.sourceHygiene`): normalize edilmiş URL'e göre (küçük harf host, atılan `www.`/fragment/izleme parametreleri, http→https) **mükerrer kaynakları birleştirme** — referanslar yeniden eşlenir ve 1..N numaralandırılır; **kaynak listesini sıralama** (görünme sırası [varsayılan], başlık veya alan adı), gövde referansları eşzamanlı kalır; ve ağ gerektirmeyen **DOI/ISBN tespiti** (kaynağın URL+başlığı üzerinde regex) ki BibTeX (`doi`/`isbn`), RIS (`DO`/`SN`) ve CSL-JSON (`DOI`/`ISBN`) çıktılarında alan olarak görünür. Varsayılanlar güvenlidir (tekilleştirme kapalı, görünme sırası, tespit açık ama yalnızca ek alan ekler).
* **JSON'dan Çevrimdışı Yeniden Aktarım**: Ayarlar → Tools → **Re-export from JSON**, eklentinin daha önce ürettiği bir `.json` raporu yükleyip Gemini sayfasına gerek olmadan **tamamen çevrimdışı** başka bir formata dönüştürür. Canlı dışa aktarımla aynı seçenek hattını (düzen, atıflar, kaynak hijyeni) ve aynı exporter yığınını kullanır; metin formatları ile DOCX/EPUB/Vault indirmeye, PDF yazdırma arayüzüne yönlendirilir.
* **Export Geçmişi + Otomatik Yedek**: Her dışa aktarımda raporun ham IR'ı `chrome.storage.local`'a otomatik kaydedilir (son 10 rapor; giriş başına ~2 MB, toplam 8 MB üst sınırıyla LRU tahliyesi; aynı raporun tekrar exportu çoğaltmak yerine mevcut kaydı tazeler). Re-export kartındaki **Recent reports** listesinden herhangi bir yedek yüklenip tamamen çevrimdışı başka formata dönüştürülebilir — Gemini sohbeti silinse bile rapor kurtarılabilir kalır.
* **Export Profilleri (Preset'ler)**: Geçerli kurulumun tamamı (etkin formatlar, tüm seçenekler, format bazlı geçersiz kılmalar) isimli bir profil olarak `chrome.storage.sync`'e kaydedilir (en fazla 6; cihazlar arası eşitlenir). Ayarlar'daki Profiles kartından veya popup'taki hızlı seçiciden tek tıkla profiller arasında geçiş yapılır; yüklenen anlık görüntüler doğrulanarak geçersiz değerlerin sızması engellenir.
* **Doküman Meta Verileri**: Ayarlardan girilen isteğe bağlı Yazar, Kurum, Anahtar Kelimeler ve Özet (Abstract) alanları; destekleyen formatlara yerel olarak işlenir — LaTeX `\author`/`abstract`/anahtar kelimeler, DOCX `docProps/core.xml`, EPUB OPF (`dc:creator`/`dc:subject`/`dc:description`), HTML/PDF `<meta>` etiketleri ile yazar/özet/anahtar kelime bloğu ve Obsidian front matter. Boş bırakılan alanlar çıktıya eklenmez.
* **Kopyalama Desteği**: Raporları Markdown, Düz Metin, HTML ve JSON biçiminde doğrudan panoya kopyalayabilme.
* **Klavye Kısayolları**: Birincil formatta dışa aktarma (`Ctrl/Cmd+Shift+E`), Markdown olarak kopyalama (`Ctrl/Cmd+Shift+M`), tümünü indirme (`Ctrl/Cmd+Shift+L`); birincil format Ayarlar'dan seçilebilir.
* **Toplu İndirme (ZIP)**: Etkinleştirilen tüm dışa aktarım dosyalarını tek bir ZIP arşivi halinde kaydedebilme (ilerleme göstergeli).
* **Vault Paketi (ZIP)**: Raporu ana Markdown notu, `references.md` ve tablo başına CSV dosyaları olarak Obsidian/Notion tarzı bilgi tabanlarına uygun çok dosyalı paket halinde dışa aktarma.
* **Seçici Dışa Aktarım**: Yalnızca tabloları veya kaynaklar bölümü olmadan gövdeyi (sağ tık menüsünden) dışa aktarabilme.
* **Teşhis Modu**: Gizli Debug kartından çalıştırılan, geçerli Gemini sayfasının çıkarıcıya (extractor) ne kadar sağlam eşlendiğini raporlayan ("Run diagnostics") ve `gep-diagnostics.txt` indiren bakım aracı.
* **Sağ Tık (Bağlam) Menüsü**: Gemini sayfalarında sağ tıklama menüsü üzerinden hızlı aktarım gerçekleştirebilme.
* **Gelişmiş Seçenekler ve Özelleştirme**:
  * Rapor kaynaklarının Numbered (Numaralı), APA, MLA, Chicago, IEEE, Vancouver, Harvard, ACS veya AMA akademik formatlarına göre otomatik biçimlendirilmesi.
  * Değişken tabanlı dosya adı şablonları tanımlayabilme (Yıl `{YYYY}`, Ay `{MM}`, Gün `{DD}`, Saat `{time}`, Kelime Sayısı `{wordcount}`, Zaman Damgası `{timestamp}`, Format `{format}` vb. desteklenir).
  * Rapor başlıklarından gezinme bağlantılarına sahip otomatik içindekiler tablosu (TOC) üretebilme.
* **Ayarları Yedekleme/Geri Yükleme**: Tüm format ve seçenek ayarlarını (format bazlı geçersiz kılmalar dahil) tek bir JSON dosyasına dışa aktarma ve daha sonra (başka bir cihazda veya sıfırlamadan sonra) içe aktarma. İçe aktarmada her anahtar tek tek doğrulanır; bilinmeyen anahtarlar yok sayılır, enum değerleri denetlenir ve en az bir format etkin tutulur.
* **Format Bazlı Geçersiz Kılmalar (Overrides)**: Belirli bir format için global İçindekiler Tablosu, Dipnotlar ve Atıf Stili ayarlarını ezme; her kontrol globali *miras alabilir* ya da açıkça belirlenebilir. Tekil dışa aktarımlarda ve toplu ZIP'te geçerlidir.
* **Dışa Aktarma Öncesi Kalite Kontrolü**: Ayarlar → Quality Check, geçerli sayfayı tamamen yerel olarak (ağ kullanmadan) tarar; boş tablolar, başlık seviyesi atlamaları, eşleşmeyen dipnotlar, hiç atıf verilmemiş kaynaklar, mükerrer kaynak URL'leri, alt metni olmayan görseller, `[object Object]` sızıntıları ve aşırı kısa içerik gibi sorunları `gep-quality.txt` raporu olarak indirir.
* **Kod Bloğu Dil Etiketi**: Sayfadan tespit edilen programlama dili (`language-…`/`lang-…`/`data-language`) Markdown ve HTML/Reader çıktılarında korunur; Reader HTML'de kod blokları highlight.js ile (yalnızca kod içeren raporlarda gömülür) sözdizimi renklendirmesi alır.
* **Dipnot Geri-Bağlantıları**: HTML, PDF ve EPUB'da her dipnot referansına benzersiz bağlantı verilir ve kaynak listesinden metne dönüş bağlantısı (↩) eklenir.
* **Sürüm Notları Paneli ("What's New")**: Güncelleme sonrası yeni özellikleri vurgulayan, Ayarlar'da görünen sürüm notları kartı.
* **Hafıza ve Güvenlik Yönetimi**: İndirilen dosyaların Object URL'lerinin 5 saniye sonra bellekten kaldırılmasıyla tarayıcı sızıntılarının önlenmesi.

## Proje Yapısı

* **icons/**: Uzantının tarayıcı üzerinde kullandığı simge dosyaları.
* **src/background.js**: Sağ tık bağlam menüsü öğelerini kaydeden ve tıklamaları yöneten arka plan servis çalışanı.
* **src/content.js**: DOM izlemesini yürüten, kullanıcı ayarlarını yükleyen ve dışa aktarım işlemlerini koordine eden ana betik.
* **src/content.css**: Eklenti tarafından eklenen butonların ve toast bildirimlerinin görsel biçimlendirme stilleri.
* **src/lib/**:
  * `extractor.js`: Sayfadaki başlık, paragraf, tablo, liste, matematik (KaTeX/MathML) gibi yapısal ögeleri ve kaynakları tarayıp ara temsil (IR) nesnesini oluşturan modül; ayrıca DOM kırılganlığını raporlayan `diagnose()` teşhis fonksiyonunu içerir.
  * `citation.js`: Kaynak atıflarını seçilen akademik standartta düzenleyen modül (Numaralı, APA, MLA, Chicago, IEEE, Vancouver, Harvard, ACS ve AMA formatlarını destekler).
  * `validator.js`: Ara temsil (IR) üzerinde tamamen yerel kalite kontrolü yapan modül; boş tablolar, başlık hiyerarşisi sorunları, eşleşmeyen dipnotlar, mükerrer kaynaklar ve içerik sızıntıları için uyarı listesi üretir.
  * `texmath.js`: LaTeX matematiğini (üs/alt indis, kesir, kök, limitli büyük operatörler ∑ ∫ ∏, Yunan harfleri, ilişki/operatörler, `\text`, fonksiyon adları, `\left…\right`) ayrıştırıp MathML, Office Math (OMML) ve Typst sözdizimine dönüştüren, sıfır bağımlılıklı en iyi-çaba dönüştürücü; tanınmayan girdide düz metne güvenli şekilde düşer.
  * `toc.js`: Başlıklardan Türkçe karakter ve boşluk dönüşümlerini yaparak slug'lar üreten ve içindekiler tablosunu yapılandıran modül.
  * `menu-injector.js`: Gemini paylaşım menüsünü klonlayarak eklenti ögelerini enjekte eden modül.
  * `download.js`: Unicode normalizasyonu (NFKD), emoji temizleme ve Windows geçersiz dosya adı karakter filtrelemeleri yapan, 13 adet dinamik değişkeni destekleyen şablon motoru ve tarayıcı indirme tetikleyicisi.
  * `settings.js`: Kullanıcı tercihlerini saklamak ve tarayıcı profiliyle eşitlemek için `chrome.storage.sync` entegrasyonu; ayar anlık görüntülerinin ve export profillerinin doğrulanması (`sanitizeSnapshot` / `sanitizeProfiles`).
  * `history.js`: Her exportta IR'ı `chrome.storage.local`'a yedekleyen, LRU + boyut sınırlı export geçmişi modülü.
  * `docmeta.js`: Doküman meta verilerini (yazar, kurum, anahtar kelimeler, özet) tüm dönüştürücülerin aynı biçimde tüketebilmesi için tek bir nesneye normalize eden yardımcı modül.
* **src/vendor/**: Üçüncü taraf statik varlıklar. `katex.js`, KaTeX stil sayfasını woff2 fontları base64 olarak gömülü hâlde içeren, derleme zamanı üretilen (bkz. `scripts/build-katex.mjs`) tek dosyalık bir modüldür; HTML/Reader/PDF/EPUB çıktılarına çevrimdışı matematik için inline edilir. `highlight.js`, Reader HTML'in sözdizimi renklendirmesi için highlight.js + GitHub açık/koyu token renklerini içerir (bkz. `scripts/build-hljs-vendor.mjs`).
* **src/exporters/**: Ara temsil nesnesini hedef dosya türlerine dönüştüren, harici bağımlılığı olmayan 16 JS dönüştürücü:
  * `zip.js`: 256'lık önceden hesaplanmış CRC-32 doğrulama tablosu kullanarak central directory ve local file header kayıtları üreten ve STORE yöntemi ile zip arşivi oluşturan modül.
  * `docx.js`: WordprocessingML XML şablonlarını (`document.xml`, `styles.xml` vb.) bir araya getirerek, Word'ün yerel stilleriyle (başlıklar, alıntılar, tablolar, kenarlıklar, girintiler) uyumlu gerçek `.docx` paketleri üreten dönüştürücü.
  * `epub.js`: E-kitap standartlarına uyumlu bir EPUB paketi (`mimetype`, `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/toc.xhtml`, `OEBPS/chapter.xhtml`) üreten modül.
  * `pdf.js`: Paylaşılan HTML gövde kurucusunu (`bodyHtml`) ve yazdırma stil sayfasını üretip tarayıcının yazdırma arayüzünü açan modül (HTML/Reader/EPUB de aynı gövde kurucusunu paylaşır).
  * `reader.js`: Tema, anahat, okuma ilerlemesi ve sözdizimi renklendirmesi içeren kendi kendine yeten okuma sayfası (Reader HTML) üreten dönüştürücü.
  * Diğer formatlara özel metin tabanlı dönüştürücüler (`markdown.js`, `txt.js`, `html.js`, `json.js`, `latex.js`, `csv.js`, `bibtex.js`, `ris.js`, `csljson.js`, `rtf.js`, `vault.js`).
* **src/options/**: Eklenti ayarlar sayfasının arayüz ve mantıksal kodları. `options.js` bir ES modül girişidir; her ayar kartı (`modules/nav.js`, `profiles.js`, `backup.js`, `reexport.js`, `tools.js`, `feedback.js`, `whats-new.js`) ayrı bir modülde yaşar ve paylaşılan durum bir `ctx` nesnesiyle aktarılır.
* **src/popup/**: Tarayıcı araç çubuğunda uzantı simgesine tıklandığında açılan hızlı durum ve bilgi penceresi.
* **test/**: Node.js sanal makine (`vm`) ortamında çalışan otomatik test betikleri — `edge-cases.mjs` (birim/entegrasyon), `validate.mjs` (yüksek seviye doğrulama + manifest bütünlüğü), `extractor.mjs` (linkedom ile gerçek çıkarıcı), `menu-injector.mjs` (menü enjeksiyonu), `background.mjs` (sahte chrome ile servis çalışanı), `content.mjs` (mesaj işleyici smoke testleri) — ve sentetik DOM örnekleri (`test/fixtures/`).
* **validate/**: Testler sırasında üretilen ve doğruluğu denetlenen örnek çıktı dosyalarının (.md, .txt, .html, .docx, .epub vb.) saklandığı klasör.
* **referance/**: Ekran görüntüleri, referans HTML kodları ve örnek çıktıların yer aldığı klasör.
* **store/**: Chrome Web Mağazası yüklemesi için derlenen ZIP arşivlerinin biriktirildiği klasör.
* **scripts/build.mjs**: Uzantı dosyalarını temiz bir ZIP paketi halinde `store` klasörüne derleyen platform bağımsız Node betiği (`npm run build`); sürüm etiketi push edildiğinde CI aynı betikle GitHub Release artifact'ı üretir.
* **PRIVACY.md**: Veri gizliliği politikası ve eklentinin kullandığı izinlerin gerekçelerini içeren belge.

## Teknolojiler

* JavaScript (Vanilla JS - Chrome Extension API'leri)
* HTML5 / CSS3
* Manifest V3 standartları
* Node.js (Otomatik test, doğrulama ve derleme süreçleri için)

## Önemli Kavramlar

* **Ara Temsil (Intermediate Representation - IR)**: DOM yapısından okunan verilerin, biçimlendirme mantığından yalıtılmış bir JavaScript nesnesinde toplanmasıdır. Bu sayede yeni bir dönüştürücü eklenirken DOM tarama kodunun değiştirilmesi gerekmez.
* **Gecikmeli / Dinamik Menü Enjeksiyonu**: Gemini'nin tek sayfalı uygulama (SPA) yapısı nedeniyle dinamik değişen sayfa ağacını izleyerek paylaşım menüsü her render edildiğinde eklenti butonlarının kaybolmadan yeniden yerleştirilmesi.
* **İstek Üzerine (Lazy) Exporter Yükleme**: Her Gemini sayfasına yalnızca 8 dosyalık çekirdek (ayarlar, çıkarıcı, menü enjeksiyonu, indirme) enjekte edilir; KaTeX/highlight vendorları ve 16 dönüştürücüden oluşan ağır yığın `web_accessible_resources` üzerinden ilk dışa aktarımda dinamik `import()` ile yüklenir.
* **Sıfır Bağımlılık (Zero-Dependencies)**: ZIP paketleme, Word OpenXML oluşturma, EPUB paketleme gibi tüm karmaşık işlemlerin harici npm paketleri kullanılmaksızın doğrudan Vanilla JS ile tarayıcı içinde yerel olarak çözülmesi.
* **Uç Durum ve Çıktı Doğrulaması**: Türkçe özel karakterlerin (ş, ğ, ı, İ vb.) korunması, iç içe listelerin hizalanması, büyük tabloların bölünmesi, mükerrer atıfların temizlenmesi ve sızan JavaScript nesne kalıntılarının (`[object Object]`) tespiti için sanal makine üzerinde yürütülen doğrulama testleri.
* **Güvenli ve İzin Gerektirmeyen İndirme (Permission-free Download)**: Uzantının tarayıcının ek indirme izinlerine (`downloads` izni) gerek duymadan, kullanıcı etkileşimi sırasında dinamik `<a>` elemanı ve `ObjectURL` oluşturarak yerel diskte dosya indirmeyi tetiklemesi.
* **XML / XHTML Şablonlama ve OOXML Dönüştürme**: DOCX ve EPUB gibi zengin belgelerin, ham XML dize birleştirmeleri ve UTF-8 karakter kodlamasıyla sıfırdan oluşturulması; tablolarda hücre arka plan renkleri (`w:shd`), kenarlıklar (`w:tcBorders`) ve listelerde girintilerin (`w:ind`) XML seviyesinde manuel ayarlanması.