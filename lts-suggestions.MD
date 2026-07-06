# Özellik Önerileri — More Export for Gemini

Akademik ve son kullanıcı odaklı olası geliştirmeler. Hangilerini yapmak istediğini numaralarıyla belirtebilirsin (ör. `1, 6, 4`).

> Bu dosya yeni öneriler geldikçe güncellenir.

---

## Akademik Odaklı (1–6)

**1. Daha fazla citation stili**  
Vancouver, Harvard, ACS, AMA gibi ek akademik stiller. (Şu an: numbered, APA, MLA, Chicago, IEEE)

**2. Doküman meta verileri**  
Yazar adı, kurum, anahtar kelimeler, abstract gibi alanları ayarlardan girip exportlara ekleme (LaTeX `\author`, DOCX özellikleri, EPUB metadata).

**3. Sayfa düzeni kontrolü** ✅ *(Yapıldı)*  
PDF/HTML/DOCX/LaTeX için kâğıt boyutu, kenar boşlukları, satır aralığı (1.5 / çift), font boyutu ve font ailesi (sans/serif). Ayarlar → Options → Document Layout. (Header/footer, sayfa numarası ve filigran kapsam dışı bırakıldı.)

**4. LaTeX şablon seçimi**  
`article` dışında `report`, `IEEEtran`, `acmart` gibi akademik şablonlar.

**5. Otomatik özet / abstract**  
Raporun başına ilk paragraflardan veya başlıklardan oluşan bir özet bölümü.

**6. Kaynak doğrulama**  
Footnote URL'lerinin geçerli olup olmadığını kontrol etme, kırık linkleri işaretleme.

---

## Son Kullanıcı Odaklı (7–15)

**7. Klavye kısayolları**  
Ctrl+Shift+M (markdown), Ctrl+Shift+P (PDF) gibi hızlı export.

**8. Doküman istatistikleri**  
Popup'ta kelime sayısı, tahmini okuma süresi, başlık / tablo / kaynak sayısı.

**9. Görsel embed**  
Rapordaki görselleri base64 olarak HTML / DOCX / EPUB içine gömme (şu an placeholder).

**10. HTML/PDF tema seçimi**  
Dark, Light, Akademik, Sepia gibi hazır temalar.

**11. Export önizleme**  
İndirmeden önce çıktının nasıl görüneceğini gösteren bir önizleme paneli.

**12. Otomatik export**  
Deep Research tamamlanınca seçili formatta otomatik indirme.

**13. Çoklu dil arayüzü (i18n)**  
Eklenti arayüzünü Türkçe / İngilizce / diğer dillerde gösterme.

**14. Özel CSS / şablon editörü**  
Kullanıcının kendi stilini tanımlayabilmesi.

**15. Export geçmişi**  
Hangi raporun ne zaman hangi formatta indirildiğinin log'u.

---

## Akademik / Araştırma (16–24)

**16. Kaynak deduplication** ✅ *(Yapıldı)*  
Aynı (normalize edilmiş) URL tekrar ediyorsa kaynak listesinde birleştirme; metindeki referans numaralarını yeniden eşleyip 1..N numaralandırma. Ayarlar → Options → Sources.

**17. DOI / ISBN algılama** ✅ *(Yapıldı)*  
Kaynak URL ve başlığından regex ile DOI/ISBN çıkarma (ağ yok); BibTeX (`doi`/`isbn`), RIS (`DO`/`SN`) ve CSL-JSON (`DOI`/`ISBN`) alanlarına ekleme.

**18. Tablo / şekil numaralandırma**  
“Tablo 1”, “Şekil 2” gibi akademik numaralandırma (LaTeX, DOCX, HTML).

**19. Dipnota vs sonnota seçimi**  
Kaynakları sayfa altı, bölüm sonu veya doküman sonunda gösterme tercihi.

**20. Kaynak sıralama** ✅ *(Yapıldı)*  
Görünüm sırası (varsayılan), alfabetik (başlık) veya domain'e göre sıralama; sıralama sonrası referanslar eşzamanlı yeniden numaralandırılır. Ayarlar → Options → Sources.

**21. Çoklu rapor birleştirme**  
Birden fazla Deep Research'ü tek PDF/DOCX/LaTeX dosyasında birleştirme.

**22. Karşılaştırma export'u**  
İki raporu yan yana (diff veya tablo) export etme.

**23. Anahtar kelime / terim çıkarımı**  
Başlık ve vurgulu metinlerden otomatik “Keywords” bölümü.

**24. Atıf yoğunluğu analizi**  
Paragraf başına kaynak sayısı, en çok atıf yapılan domain'ler.

---

## Kalite / Güven (25–28)

**25. Export öncesi doğrulama raporu**  
İndirmeden önce kısa rapor: kırık link, boş tablo, eksik başlık hiyerarşisi, Türkçe karakter kaybı uyarıları.

**26. Erişilebilirlik kontrolü**  
H1 eksikliği, atlama başlık seviyeleri, tablo başlığı, görsel alt metni uyarıları.

**27. İçerik temizleme seçenekleri**  
UI artıkları, tekrarlayan başlık, boş paragrafları export'tan çıkarma.

**28. Kaynak güven skoru (basit)**  
`.edu`, `.gov`, bilinen dergi domain'leri için hafif işaretleme (heuristic, iddia değil).

---

## Üretkenlik (29–36)

**29. Export profilleri / preset'ler**  
“Akademik paket”, “Notion hızlı”, “Arşiv ZIP” gibi tek tık preset'ler.

**30. Ayarları içe/dışa aktarma**  
Tüm ayarları JSON olarak yedekleme ve geri yükleme.

**31. Son kullanılan formatlar**  
Menüde en sık kullanılan 3 formatı üste taşıma.

**32. Sağ tık menüsünde “Varsayılan format”**  
Tek tıkla favori formatta indirme.

**33. Web Share API**  
Mobilde / destekleyen sistemlerde dosyayı doğrudan paylaşma.

**34. Google Docs / Notion optimize clipboard**  
Sadece yapıştırma için optimize edilmiş özel HTML/Markdown modları.

**35. Okuma modu export'u**  
Gereksiz stil olmadan sade, okunaklı minimal HTML/EPUB.

**36. Sesli okuma dostu TXT**  
Screen reader için daha temiz plain text (kaynaklar ayrı bölüm, liste yapısı sade).

---

## Görsel / Sunum (37–39)

**37. Markdown → slayt (Marp / reveal.js)**  
Başlıklardan otomatik sunum `.md` veya HTML slayt.

**38. Infographic özeti**  
Ana başlıklar + kaynak sayısı + kelime sayısı içeren tek sayfalık özet PDF.

**39. Kapak sayfası şablonu**  
Başlık, tarih, yazar, kurum, logo alanı olan kapak (PDF/HTML/LaTeX).

---

## Entegrasyon / Platform (40–43)

**40. Zotero Quick Copy entegrasyonu**  
Clipboard'ta Zotero'nun beklediği citation formatında kopyalama.

**41. Obsidian “front matter”**  
YAML metadata (`title`, `date`, `tags`, `sources`) ile `.md` export.

**42. Logseq / Roam uyumlu OPML**  
Block reference ve hiyerarşi için geliştirilmiş OPML.

**43. GitHub Gist / Pastebin paylaşımı**  
Tek tıkla metin export'unu online paylaşma (opsiyonel, kullanıcı onayı ile).

---

## Mağaza / Büyüme (44–47)

**44. İlk kurulum sihirbazı**  
Hangi formatları kullanacağını soran kısa onboarding.

**45. Popup'ta “Son export” bilgisi**  
Son indirilen format, tarih, dosya adı.

**46. Sürüm notları paneli**  
Güncellemede ne değiştiğini gösterme.

**47. Geri bildirim / hata raporu**  
Anonim “Export failed” raporu (içerik göndermeden).

---

## Gelişmiş / Teknik (48–50)

**48. Custom exporter hook**  
Gelişmiş kullanıcılar için basit JS şablonu ile özel format tanımlama.

**49. IR JSON'dan yeniden export** ✅ *(Yapıldı)*  
Daha önce indirilen `.json` dosyasından tamamen offline export (Gemini sayfası olmadan). Ayarlar → Tools → Re-export from JSON; canlı dışa aktarımla aynı seçenek hattı ve exporter yığınını kullanır.

**50. Per-format seçenek override**  
Global ayarların yanında format bazlı TOC/footnote/citation override.