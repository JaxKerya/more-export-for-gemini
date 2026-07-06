# Protein Yapı Tahmininde Derin Öğrenme: AlphaFold ve Yeni Nesil Mimarilerin Kapsamlı Analizi

**Özet** Bir proteinin üç boyutlu (3B) yapısının, birincil amino asit dizisinden yola çıkılarak belirlenmesi olan "protein katlanma problemi", elli yılı aşkın bir süredir hesaplamalı biyolojinin en büyük zorluklarından biri olarak kabul edilmektedir. Uçtan uca diferansiyellenebilir (türevlenebilir) derin öğrenme modellerinin, özellikle de AlphaFold2'nin ortaya çıkışı, yapısal biyoinformatik alanında temel bir dönüşüme yol açmıştır. Bu modeller, Çoklu Dizi Hizalamalarından (MSA - Multiple Sequence Alignments) elde edilen evrimsel bilgileri, rotasyonel olarak eşdeğişkin (equivariant) geometrik dikkat mekanizmaları ile birleştirerek, geleneksel ve hesaplama açısından son derece maliyetli fizik tabanlı simülasyonları geride bırakmıştır. Bu rapor, modern protein yapı tahminini tanımlayan mimarileri, matematiksel çerçeveleri ve üretken (generative) kapasiteleri kapsamlı ve lisansüstü düzeyde bir analizle incelemektedir. Analiz, evrişimli sinir ağlarından (CNN), dikkat tabanlı transformatörlere (Evoformer) ve Değişmez Nokta Dikkati (Invariant Point Attention) mimarilerine geçişi kapsamaktadır. Ayrıca, hizalama gerektirmeyen protein dil modellerinin (ESMFold), çok zincirli kompleks modellemesinin (AlphaFold-Multimer, RoseTTAFoldNA) ve yeni işlevsel bölgeleri iskeleyebilen ve çok modlu biyomoleküler kompleksleri tahmin edebilen üretken difüzyon modellerine (AlphaFold 3, RFdiffusion) doğru yaşanan paradigma değişimini araştırmaktadır. Son olarak rapor, bu tahmine dayalı algoritmalara erişimi demokratikleştiren ve büyük ölçekli proteomik analizleri mümkün kılan OpenFold gibi yazılım mühendisliği optimizasyonlarını incelemektedir.

## 1. Giriş ve Biyoinformatik Temelleri

### 1.1 Protein Katlanma Problemi

Hücresel işlevlerin temel uygulayıcıları olan proteinler, güvenilir bir şekilde karmaşık, üç boyutlu konformasyonlara katlanan doğrusal amino asit polimerlerinden oluşur. Temel ders kitabı *Structural Bioinformatics* (Bourne ve diğerleri, ISBN: 9780470181058, 9781118210567) içinde detaylandırıldığı üzere, dizi-yapı ilişkisi son derece karmaşık termodinamik manzaralar tarafından yönetilmektedir. Tarihsel olarak, yerel (native) konformasyon durumunu yalnızca birincil bir diziden tahmin etmek, küresel serbest enerji minimumunu bulmayı amaçlayan devasa moleküler dinamik simülasyonlarını gerektiriyordu. Bu süreç, konformasyonel arama uzayının devasa boyutu (Levinthal Paradoksu) nedeniyle pratik olarak imkansızdı.

Erken dönem hesaplamalı yaklaşımlar, büyük ölçüde şablon tabanlı modellemeye (homoloji modellemesi) dayanıyordu; bu da dizi açısından oldukça benzer, deneysel olarak belirlenmiş bir yapının varlığını zorunlu kılıyordu. Homologlar mevcut olmadığında, fiziksel potansiyelleri kullanan *ab initio* (ilk prensiplerden) veya serbest modelleme teknikleri atomik doğruluğa ulaşmakta zorlanıyordu. Buradaki en kritik darboğaz, uzun menzilli ikili kalıntı (residue) etkileşimlerini doğrudan dizi verilerinden çıkarıp verimli bir şekilde 3B koordinat uzayına haritalayamamaktı.

### 1.2 Uçtan Uca Diferansiyellenebilir Modellere Geçiş

Proteinlerin evrimsel geçmişinin, onların yapısal kısıtlamalarını kodladığının fark edilmesiyle paradigma önemli ölçüde değişti. Katlanmış bir protein içinde iki amino asit kalıntısı fiziksel olarak yakınsa, bir kalıntıdaki mutasyonlara genellikle yapısal kararlılığı korumak için diğerindeki telafi edici mutasyonlar eşlik eder (birlikte evrimleşme - co-evolution).

İlk derin öğrenme modelleri bu durumu bir bilgisayarlı görü (computer vision) problemi olarak ele aldı. AlphaFold1 (Senior ve diğerleri, 2020, DOI: https://doi.org/10.1038/s41586-019-1923-7), amino asit çiftleri arasındaki mesafelerin bir olasılık dağılımı olan "distogram"ı tahmin etmek için eş-evrimsel (co-evolutionary) kovaryans matrisleri üzerinde çalışan artık evrişimli sinir ağlarını (ResNet) kullandı. AlphaFold1, 13. Protein Yapı Tahmini Kritik Değerlendirmesi'nde (CASP13) serbest modelleme hedeflerini tahmin etmede başarılı olsa da, nihai 3B koordinatları oluşturmak için fiziksel bir enerji potansiyeli üzerinde ayrı bir gradyan iniş (gradient descent) optimizasyonuna dayanıyordu.

#### 1.2.1 RGN ve Erken Dönem Yaklaşımları

Tamamen diferansiyellenebilir (türevlenebilir), uçtan uca bir yaklaşım ilk olarak AlQuraishi tarafından Tekrarlayan Geometrik Ağ (Recurrent Geometric Network - RGN) aracılığıyla kavramsallaştırılmıştır (AlQuraishi, 2019, DOI: https://doi.org/10.1016/j.cels.2019.03.006). RGN, yerel protein yapısını burulma (torsiyon) açıları aracılığıyla parametreize etmiş ve yerel kovalent kimyayı ihlal etmeden küresel geometriyi optimize etmiştir.

> "Uçtan uca diferansiyellenebilirlik, karmaşık, insan yapımı, çok aşamalı boru hatlarının, uçtan uca ortaklaşa optimize edilebilen diferansiyellenebilir modellerle yeniden formüle edilmesini ifade eder." (AlQuraishi, 2019, DOI: https://doi.org/10.1016/j.cels.2019.03.006)

Bu gelişme, karmaşık, çok aşamalı biyoinformatik ardışık düzenlerinin, dikkat (attention) tabanlı devrime zemin hazırlayan uçtan uca diferansiyellenebilir sinir mimarileri ile değiştirilebileceğini kanıtlamıştır.

## 2. AlphaFold2: Mimari ve Algoritmik Devrim

AlphaFold2'nin (AF2) Jumper ve diğerleri tarafından yayımlanması (Jumper ve diğerleri, 2021, DOI: https://doi.org/10.1038/s41586-021-03819-2), yapısal biyolojide bir dönüm noktasını temsil etmektedir. AF2, CASP14'te deneysel doğruluğa eşdeğer olan 0.96 Å kök ortalama kare sapması (RMSD) medyan omurga doğruluğuna ulaşmıştır. Mimari, girdileri üç ana aşamadan geçirerek işleyen tek bir diferansiyellenebilir grafiktir: Girdi Yerleştirme (Embedding), Evoformer ve Yapı Modülü (Structure Module).

### 2.1 Çoklu Dizi Hizalamaları (MSA) ve Evoformer Modülü

Evoformer (Evrimsel Transformatör), AF2'nin çekirdek gövdesini oluşturur ve entegre edilmiş iki temsil (representation) üzerinde eşzamanlı olarak çalışır (Jumper ve diğerleri, 2021, DOI: https://doi.org/10.1038/s41586-021-03819-2):

- **MSA Temsili:** $s$ adet hizalanmış, $r$ uzunluğunda ve $c_m$ kanal boyutuna sahip dizileri temsil eden $\mathbf{M} \in \mathbb{R}^{s \times r \times c_m}$.
- **Çift (Pair) Temsili:** Her bir kalıntı çifti arasındaki uzamsal ve evrimsel ilişkiyi temsil eden $\mathbf{Z} \in \mathbb{R}^{r \times r \times c_z}$.

Evoformer, 48 ardışık blok boyunca, 1B/2B MSA etki alanı ile 2B çift etki alanı arasında sürekli olarak bilgi alışverişi yaparak bu temsilleri rafine eder.

#### 2.1.1 Satır ve Sütun Dikkat Mekanizmaları

Girdiyi düz bir dizi olarak ele alan standart transformatörlerin aksine, Evoformer eksenel dikkat (axial attention) uygular.

- **Çift Ön Yargılı Satır Yönlü Geçitli Öz-Dikkat (Row-wise Gated Self-Attention with Pair Bias):** Tek bir dizi içindeki hangi amino asitlerin evrimsel olarak bağlantılı olduğunu tanımlar. En önemlisi, bu adım çift temsilinin $\mathbf{Z}$ bir projeksiyonunu dikkat logitlerine bir ön yargı (bias) terimi olarak dahil eder. Dikkat ağırlığı $a_{ij}^h$, $h$ kafası (head), $q$ sorguları (queries), $k$ anahtarları (keys) ve $b_{ij}^h$ çift ön yargısı için şu şekilde verilir:

$$
a_{ij}^h = \text{softmax}_k \left( \frac{q_i^h \cdot k_j^h}{\sqrt{c}} + b_{ij}^h \right)
$$

- **Sütun Yönlü Geçitli Öz-Dikkat (Column-wise Gated Self-Attention):** Belirli bir pozisyonda farklı türler (homologlar) boyunca korunan kalıntı desenlerini tanımlar. Bu, genetik varyasyonun uzamsal kısıtlamalarla nasıl şekillendiğini ağa öğretir.

#### 2.1.2 Üçgensel Çarpımsal Güncellemeler (Triangular Multiplicative Updates)

Çift temsili $\mathbf{Z}$ üzerinde geometrik tutarlılığı (örneğin üçgen eşitsizliği) zorlamak için AF2, "Üçgensel Çarpımsal Güncelleme" uygular. Bir mesafe matrisi katı metrik uzay kurallarına uymalıdır; eğer A kalıntısı B'ye yakınsa ve B, C'ye yakınsa, A'nın C'den keyfi olarak uzak olması fiziksel olarak imkansızdır.

Bu güncellemeler, amino asitlerin oluşturduğu grafiğin hem "gelen" (incoming) hem de "giden" (outgoing) kenarlarında (edges) çalışır. İşlem hiyerarşisi şu şekilde ilerler:

1. **Giden Kenar Güncellemesi (Outgoing Edge Update):**
  - $i$ ve $j$ kalıntıları arasındaki kenar için, ağ, bir üçüncü düğüm olan $k$'dan bilgi entegre eder.
  - Bu, grafiğin tamamındaki potansiyel üçgenlerin üzerinden geçilmesini gerektirir.
  - Matematiksel olarak güncelleme şu formüle dayanır: $\mathbf{Z}'_{ij} = \mathbf{Z}_{ij} + \text{LayerNorm} \left( \sum_k \sigma(\mathbf{W}_1 \mathbf{Z}_{ik}) \odot \sigma(\mathbf{W}_2 \mathbf{Z}_{kj}) \right)$
2. **Gelen Kenar Güncellemesi (Incoming Edge Update):**
  - Simetriyi korumak için, aynı işlem $\mathbf{Z}_{ki}$ ve $\mathbf{Z}_{jk}$ sırasıyla uygulanarak gelen kenarların geometrik bütünlüğü sağlanır.
3. **Dış Çarpım Ortalaması (Outer Product Mean):**
  - MSA izi (track), MSA temsilinin projelendirildiği ve çift kısıtlamalarını güncellemek için tüm $s$ dizileri boyunca dış çarpımının (outer product) ortalamasının alındığı bir Dış Çarpım Ortalaması katmanı aracılığıyla çift izine (pair track) iletişim kurar.

### 2.2 Yapı Modülü ve SE(3) Eşdeğişkinliği

AF2'nin nihai hedefi, soyut Evoformer temsillerini açık 3B Kartezyen koordinatlarla eşlemektir. Yapı Modülü, proteini bir "kalıntı gazı" (residue gas) olarak kavramsallaştırır; burada her amino asit başlangıçta 3B uzayda serbestçe dolaşan bir katı cisim (rigid body) veya çerçeve (frame) olarak ele alınır.

Her bir çerçeve $T_i \in \text{SE}(3)$, omurga atomlarının (N, C$\alpha$, C) küresel bir orijine göre rotasyonunu $\mathbf{R}_i$ ve ötelemesini (öteleme vektörü) $\mathbf{t}_i$ temsil eder.

#### 2.2.1 Değişmez Nokta Dikkati (Invariant Point Attention - IPA)

3B koordinatları tahmin eden naif bir sinir ağı, molekülün küresel yönelimine karşı oldukça hassastır. Eğer girdi proteini uzayda döndürülürse, protein tamamen aynı kalmasına rağmen sinir ağının sayısal çıktıları değişir. Bu sorunu çözmek için AF2, Değişmez Nokta Dikkati'ni (IPA) kullanır (Jumper ve diğerleri, 2021, DOI: https://doi.org/10.1038/s41586-021-03819-2).

IPA, yapısal güncellemelerin 3B rotasyonlara ve ötelemelere (translation) eşdeğişkin (equivariant) olmasını garanti eder. Bunu, küresel katı cisim dönüşümlerine doğal olarak değişmez olan, 3B uzaydaki mesafelere dayalı dikkat ağırlıklarını hesaplayarak yapar.

IPA'daki dikkat ağırlıkları, standart dizi tabanlı iç çarpımları (dot products), çift temsili ön yargısını ve sorgu noktaları ($\vec{q}$) ile anahtar noktaları ($\vec{k}$) arasındaki karesel mesafeye dayalı geometrik bir cezayı küresel çerçeveye yansıtılmış olarak birleştirir:

$$
a_{ij}^h = \text{softmax}_k \left( \frac{1}{\sqrt{c}} (\mathbf{q}_i^h)^\top \mathbf{k}_j^h + b_{ij}^h - \frac{\gamma^h w c}{2} \sum_p \left\| T_i \circ \vec{q}_{i}^{hp} - T_j \circ \vec{k}_{j}^{hp} \right\|^2 \right)
$$

Burada $T_i \circ \vec{x}$, Öklid dönüşümü $T_i$'nin yerel nokta $\vec{x}$'e uygulanmasını ifade eder. L2 normu $\| \cdot \|^2$ aynı küresel çerçevedeki iki nokta arasındaki mesafeyi değerlendirdiği için, hem $T_i$ hem de $T_j$'ye uygulanan herhangi bir küresel rotasyon birbirini iptal ederek değişmezliği (invariance) korur.

> "Değişmez Nokta Dikkati (IPA), bir molekülün dönüşlerinin ve ötelemelerinin eşdeğer bir yapı tahminiyle sonuçlanması fikrini zorunlu kılar; bu, eğitimi hızlandıran ve sınırlı veri ayarlarında performansı artıran tümevarımsal bir geometrik ön yargıdır." (FlashIPA Makalesi, DOI: https://doi.org/10.1101/2025.05.11580v1)

### 2.3 Kayıp Fonksiyonları (Loss Functions) ve Geri Dönüşüm (Recycling)

Ağ uçtan uca eğitilir; bu, kayıp gradyanlarının (loss gradients) doğrudan nihai 3B atom koordinatlarından girdi MSA yerleştirmelerine kadar geriye doğru aktığı anlamına gelir.

#### 2.3.1 Çerçeve Hizalı Nokta Hatası (FAPE - Frame Aligned Point Error)

Yapı Modülünü yönlendiren birincil kayıp fonksiyonu Çerçeve Hizalı Nokta Hatası'dır (FAPE) (Jumper ve diğerleri, 2021, DOI: https://doi.org/10.1038/s41586-021-03819-2). FAPE, tahmin edilen yapıyı küresel bir Kabsch algoritması (çok etki alanlı esneklikle mücadele eden bir algoritma) kullanarak temel gerçeğe hizalamak yerine hatayı yerel olarak değerlendirir.

Her bir $i$ kalıntısı için FAPE, diğer tüm tahmin edilen atomları $x_j^{pred}$, $i$ kalıntısının yerel çerçevesine ($T_i^{pred}$) yansıtır. Bunu, $i$ kalıntısının gerçek yerel çerçevesine ($T_i^{true}$) yansıtılan gerçek atomlarla $x_j^{true}$ karşılaştırır. Yüksek oranda düzensiz bölgelerden (disordered regions) gelen devasa gradyanları önlemek için hata kırpılır (clamped):

$$
\mathcal{L}_{FAPE} = \frac{1}{Z} \sum_{i} \sum_{j} \min \left( d_{clamp}, \left\| (T_i^{true})^{-1} \circ \vec{x}_j^{true} - (T_i^{pred})^{-1} \circ \vec{x}_j^{pred} \right\| \right)
$$

Burada $Z$ bir normalizasyon sabiti ve $d_{clamp}$ tipik olarak 10 Å'dir (veya zincirler arası multimerler için 30 Å). Modelin optimizasyonunda kullanılan gradyanlar ise zincir kuralı uygulanarak koordinatlara göre türev alınmasıyla bulunur: $\nabla_{\theta}\mathcal{L}_{FAPE} = \sum_i \sum_j \frac{\partial \mathcal{L}}{\partial \vec{x}_j^{pred}} \frac{\partial \vec{x}_j^{pred}}{\partial \theta}$.

Ayrıca AF2, **Geri Dönüşüm** (Recycling - Algoritma 31/32) kullanır. Ağın nihai çıktısı (hem temsiller hem de 3B koordinatlar) dört yinelemeye kadar girdi olarak ağa geri beslenir. Bu, ağın parametre sayısını büyük ölçüde artırmadan yapısal hipotezini yinelemeli olarak iyileştirmesine olanak tanır.

## 3. Hizalamasız Katlanma ve Protein Dil Modelleri

AlphaFold2, bir MSA oluşturmak için evrimsel homologların açık (explicit) olarak aranmasına ve hizalanmasına dayanırken, bu süreç hesaplama açısından maliyetlidir ve bilinen hiçbir homoloğu olmayan (orphan proteins) veya aşırı mutasyona uğramış varyantlar için bazen başarısız olur. Yeni nesil mimariler, büyük dil modellerini (LLM) kullanarak evrimin kurallarını örtük (implicit) olarak öğrenmeyi amaçlamaktadır.

### 3.1 MSA Transformer

Araştırmacılar, MSA'ları tamamen bir kenara bırakmadan önce MSA Transformer'ı geliştirdiler (Rao ve diğerleri, 2021, DOI: https://doi.org/10.1101/2021.02.12.430858). Doğal dil işleme modeli BERT temel alınarak modellenen MSA Transformer, MSA'lar üzerinde maskeli dil modellemesi (MLM - Masked Language Modeling) hedefi kullanır. Bir hizalama boyunca rastgele kalıntıları maskeleyerek ve ağı gizli amino asitleri tahmin etmeye zorlayarak, MSA Transformer birlikte evrimsel kovaryansı içselleştirir. Bu transformatörlerin dikkat haritaları, proteinlerin 3B temas (contact) haritalarıyla doğrudan ilişkilidir ve yapısal verilerin tamamen denetimsiz dil eğitiminden kurtarılabileceğini göstermektedir.

### 3.2 ESMFold: Yüksek Verimli Tahmin için Dil Modellerini Ölçeklendirme

ESMFold (Lin ve diğerleri, 2023, DOI: https://doi.org/10.1126/science.ade2574), MSA oluşturma adımını tamamen atlar. Meta AI tarafından geliştirilen ESMFold, 65 milyondan fazla benzersiz dizi üzerinde eğitilmiş devasa, 15 milyar parametreli bir protein dil modeli olan ESM-2'yi kullanır.

- **Mekanizma:** ESM-2 tek bir amino asit dizisini (örneğin metin belirteçleri/tokenleri olarak) işler. Ön eğitim (pre-training) sırasında öğrenilen evrimsel bağlamı doğal olarak yakalayan LLM tarafından oluşturulan dahili temsiller, doğrudan AF2 tarzı bir Yapı Modülüne beslenir.
- **Performans:** Yüksek oranda korunmuş etki alanlarında AF2'den biraz daha az doğru olsa da, ESMFold tahminleri 60 kata kadar daha hızlı yürütür.
- **Uygulama:** Bu muazzam hızlanma, bilinen yapısal biyolojinin sınırlarını büyük ölçüde genişleterek 617 milyondan fazla metagenomik proteini katlayan ESM Metagenomik Atlası'nın (ESM Metagenomic Atlas) oluşturulmasını sağlamıştır.

Aşağıdaki Tablo 1, AF2 ve ESMFold modellerinin yaygın kıyaslama (benchmark) metriklerindeki performanslarını özetlemektedir:

| Model Adı | CASP14 Medyan GDT-TS | CAMEO Medyan RMSD (Å) | Ortalama Tahmin Süresi | MSA Gerekli Mi? |
| --- | --- | --- | --- | --- |
| **AlphaFold2** | 92.4 | 1.30 | Dakikalar - Saatler | Evet |
| **ESMFold (15B)** | 87.0 | 1.74 | Saniyeler | Hayır |
| **RoseTTAFold** | 81.5 | 1.95 | Dakikalar | Evet |

*Tablo 1: CASP14 ve CAMEO veri kümeleri kullanılarak yapılan kıyaslama (benchmark) skorları (Lin ve diğerleri, 2023, DOI: https://doi.org/10.1126/science.ade2574; Jumper ve diğerleri, 2021, DOI: https://doi.org/10.1038/s41586-021-03819-2).*

## 4. Biyomoleküler Etkileşimler ve Komplekslerin Modellenmesi

Hücresel işlev nadiren izole edilmiş monomerler aracılığıyla yürütülür; proteinler, homo- ve hetero-oligomerik kompleksler oluşturmak için dinamik olarak etkileşime girer.

### 4.1 AlphaFold-Multimer ve ColabFold Algoritmaları

AlphaFold-Multimer (Evans ve diğerleri, DOI: https://doi.org/10.1101/2021.10.04.463034), protein-protein komplekslerini doğru bir şekilde tahmin etmek için AF2 mimarisini genişletir. Model, permutasyon simetrilerini (bir homomerdeki özdeş zincirler) ele almak için yeniden eğitilmiştir. Yanlış kenetlenmiş (docked) arayüzler için daha yumuşak bir gradyan sağlamak amacıyla zincirler arası çiftler için 30 Å'de kırpılan uyarlanmış bir FAPE kaybı kullanılmıştır. Çapraz zincir birlikte evrimi (cross-chain co-evolution), bağlayıcı arayüzlerin (binding interfaces) modellenmesinde kritik öneme sahiptir.

Bu araçları demokratikleştirmek için ColabFold (Mirdita ve diğerleri, 2022, DOI: https://doi.org/10.1038/s41592-022-01488-1), AF2'nin yavaş olan JackHMMER veritabanı aramasını MMseqs2 ile değiştirmiştir. MMseqs2, MSA oluşturmayı yaklaşık 40-60 kat daha hızlı yürüterek, kullanıcıların devasa yerel hesaplama kümelerine ihtiyaç duymadan bulut tabanlı Jupyter Not Defterleri (Google Colab) aracılığıyla kompleksleri hızlı bir şekilde tahmin etmelerine olanak tanır.

### 4.2 RoseTTAFold ve Nükleik Asit Kompleksleri (RoseTTAFoldNA)

RoseTTAFold (Baek ve diğerleri, 2021, DOI: https://doi.org/10.1126/science.abj8754), Yapı Modülünü beklemek yerine, 1B (dizi), 2B (mesafe haritaları) ve 3B (koordinatlar) temsiller arasında eşzamanlı olarak bilgi aktaran "üç izli" (three-track) bir mimari sundu.

Bu mimari, protein-RNA ve protein-DNA komplekslerini işlemek için **RoseTTAFoldNA**'da (Baek ve diğerleri, 2024, DOI: https://doi.org/10.1038/s41592-023-02086-5) başarıyla genişletilmiştir.

- **Çok Modlu Belirteçler (Multi-Modal Tokens):** 1B iz (track) belirteç kelime dağarcığı, DNA ve RNA bazları için belirteçleri içerecek şekilde 22'den (amino asitler \+ boşluklar) 32'ye çıkarıldı.
- **Koordinat Çerçeveleri:** 3B iz, nükleotit fosfat gruplarının pozisyonunu ve yönelimini modellemek üzere genişletildi ve transkripsiyon faktörü bağlanmasını veya ribozomal alt birim montajını modelleyebilen birleşik bir ağ sağladı.

## 5. Difüzyon Çağı: Yapısal Biyolojide Üretken Modeller

Yapısal biyoinformatikteki en son sınır, moleküler yapıların olasılık dağılımını yakalayan üretken (generative) modeller lehine regresyon modellerini (bir girdiyi tek bir optimal yapıya eşleyen) terk etmektedir.

### 5.1 RFdiffusion ile De Novo Tasarım ve Yapısal Halüsinasyon

Midjourney gibi görüntü oluşturucuların arkasındaki teknoloji olan Gürültü Giderici Difüzyon Olasılıksal Modelleri (DDPM'ler - Denoising Diffusion Probabilistic Models) uyarlayan araştırmacılar, **RFdiffusion**'ı yarattı (Watson ve diğerleri, 2023, DOI: https://doi.org/10.1038/s41586-023-06415-8).

RFdiffusion, RoseTTAFold ağının ince ayar yapılmasıyla (fine-tuning) oluşturulmuştur. Ağ, tamamen rastgele bir 3B amino asit çerçeveleri bulutunu alır (ötelemelere uygulanan Gauss gürültüsü, SO(3) rotasyon matrisleri manifoldu üzerindeki Brownian hareketi) ve yüzlerce yineleme boyunca fiziksel olarak uygulanabilir bir protein omurgasına "gürültüyü gidermeyi" (denoise) öğrenir. Üretim, kullanıcı tarafından belirtilen kısıtlamalar tarafından yönlendirildiği için, RFdiffusion *de novo* tasarım için olağanüstüdür. "İskeletleme" (scaffolding - bilinen bir katalitik aktif bölgeyi yeni halüsinasyonla oluşturulmuş bir protein kabuğuna yerleştirme) veya "iç boyama" (inpainting - eksik döngüleri yeniden oluşturma) işlemlerini gerçekleştirebilir (Wang ve diğerleri, 2022, DOI: https://doi.org/10.1126/science.abn2100).

> "RFdiffusion tasarımlı proteinler için deneysel doğrulama oranı çarpıcıydı... Aylar süren hesaplamalı örnekleme ve uzman sezgisi gerektiren de novo tasarım, artık tek bir GPU düğümünde saatler içinde gerçekleştirilebiliyor."

### 5.2 AlphaFold 3: Biyomoleküler Uzay için Birleşik Bir Model

AlphaFold 3 (Abramson ve diğerleri, 2024, DOI: https://doi.org/10.1038/s41586-024-07487-w), bu difüzyon paradigmasını tamamen entegre eder.

- **Mimari Güncellemesi:** AF3, MSA işleme bloğunu büyük ölçüde küçültür (Evoformer, bir "Pairformer" olarak basitleştirilmiştir). AF3, karmaşık, açıkça geometrik bir Yapı Modülü (IPA ve burulma açıları) kullanmak yerine standart bir difüzyon yaklaşımı kullanır.
- **Atomik Koordinatların Gürültüsünün Giderilmesi:** Difüzyon modülü doğrudan ham atom koordinatları üzerinde çalışır. Çıkarım (inference) sırasında, rastgele gürültü örneklenir ve keskin bir nihai yapı üretmek üzere yinelemeli olarak gürültüden arındırılır. Bu, sterokimyasal ihlal cezalarına (stereochemical violation penalties) duyulan ihtiyacı ortadan kaldırır.
- **Kapsam:** AF3, tüm biyokimyasal sistemleri modeller; proteinlerin, DNA'nın, RNA'nın, küçük moleküllü ligandların ve translasyon sonrası modifikasyonların (ör. fosforilasyon) ortak yapılarını doğru bir şekilde tahmin ederek özel moleküler kenetlenme (docking) araçlarından daha iyi performans gösterir.

| Model | Temel Paradigma | Kayıp / Optimizasyon Hedefi | Temel Güçlü Yönler |
| --- | --- | --- | --- |
| **AlphaFold2** | Regresyon (Dikkat/Attention) | FAPE, Çapraz Entropi (MSA) | Yüksek doğruluklu monomer/multimer tahmini |
| **ESMFold** | LLM \+ Regresyon | FAPE, Maskeli Dil Modelleme (MLM) | Yüksek verimli, hizalamasız (alignment-free) katlanma |
| **RFdiffusion** | DDPM (Gürültü Giderme) | Çerçeveler Üzerinde Ortalama Kare Hatası | *De novo* protein tasarımı, bağlayıcı iskeletleme |
| **AlphaFold 3** | Difüzyon (Üretken/Generative) | Koordinat Gürültü Giderme (Denoising) | Birleşik protein-nükleik asit-ligand tahmini |

*Tablo 2: Tahmine dayalı yapısal modellerin nesilleri boyunca algoritmaların ve optimizasyon hedeflerinin evrimsel karşılaştırması.*

## 6. Uygulama, Veri Tabanları ve Yazılım Mühendisliği

Derin sinir ağı uygulamalarını anlamak, bu araçları genişletmek için kritik öneme sahiptir. DeepMind'ın orijinal eğitim kodunun tescilli yapısı, açık kaynaklı (open-source) yeniden uygulamaları zorunlu kılmıştır.

### 6.1 OpenFold: Yeniden Eğitim ve Algoritmik İçgörüler

OpenFold (Ahdritz ve diğerleri, 2024, DOI: https://doi.org/10.1038/s41592-024-02272-z), AlphaFold2'nin matematiksel olarak kesin, PyTorch tabanlı bir yeniden uygulamasıdır. Araştırmacıların katlanma modellerini sıfırdan eğitmelerine olanak tanır.

OpenFold'un eğitimi sırasındaki ara yapılar analiz edilerek derin bir keşif yapılmıştır: uzamsal boyutlar (spatial dimensions) sırayla öğrenilmektedir. Model önce 1B dizi özelliklerini, ardından 2B ikincil yapısal öğeleri (alfa sarmalları) öğrenir ve son olarak bunları 3B bir topolojiye daraltır. Dikkat çekici bir şekilde, OpenFold veri ablasyonlarına karşı son derece dirençli olduğunu kanıtlamıştır. Bütün ikincil yapı sınıfları eğitim verilerinden kasıtlı olarak çıkarıldığında bile, ağ daha önce görülmemiş katlanmalara (unseen folds) başarılı bir şekilde genellenmiştir. Bu, Evoformer'ın yalnızca Protein Veri Bankasını (PDB) ezberlemek yerine temel biyofizik prensipleri öğrendiğini göstermektedir.

Uzun dizilerde Değişmez Nokta Dikkatinin kuadratik $O(L^2)$ bellek karmaşıklığını idare etmek için, modern uygulamalar **FlashIPA** (FlashAttention'a benzer) gibi donanım optimizasyonlu soyutlamalar kullanır. Bu, GPU bellek ölçeklemesini kuadratikten doğrusala düşürerek 2.000 kalıntıyı aşan komplekslerin modellenmesini sağlar (FlashIPA, DOI: https://doi.org/10.1101/2025.05.11580v1).

### 6.2 Veri Tabanı Sorguları ve Yüksek Performanslı Çekirdekler

Aşağıdaki Tablo 3, bu modellerin eğitiminde kullanılan kritik veri kümelerini özetlemektedir:

| Veri Tabanı | Birincil Veri Türü | Yapısal Derin Öğrenme Boru Hattındaki İşlevi |
| --- | --- | --- |
| **PDB (Protein Data Bank)** | 3B Atomik Koordinatlar | FAPE kayıp hesaplaması için temel gerçeklik (ground-truth) etiketleri. |
| **BFD (Big Fantastic Database)** | Metagenomik Protein Dizileri | MSA oluşturma (HMMER) için devasa dizi çeşitliliği sağlar. |
| **UniRef (30/90)** | Kümelenmiş Protein Dizileri | Evoformer dizi hizalaması için hızlı homoloji araması. |

*Tablo 3: Modern protein yapı tahmin algoritmalarının eğitimi ve çıkarımı (inference) için gerekli olan temel veri tabanları.*

Bu algoritmaları eğitmek ve yürütmek, son derece optimize edilmiş kod yolları gerektirir. Aşağıdaki kod blokları, yapısal biyoinformatik boru hatlarını çalıştırmak için gereken çeşitli teknolojik yığınları göstermektedir.

**1. SQL: Eğitim Veri Kümelerini Oluşturma** OpenProteinSet gibi bir eğitim veri kümesi oluşturmak, dizi veri tabanlarını (UniRef) yapısal modellerle (PDB) birleştirmeyi gerektirir. PDB zincirlerini yeterli MSA derinliğini sağlayan kümelenmiş hizalamalara eşlemek için standart bir sorgu:

```sql
-- Yüksek çözünürlüklü ve derin MSA'lı deneysel yapıları ayıklama sorgusu
SELECT 
    pdb.chain_id,
    pdb.resolution,
    COUNT(msa.homolog_id) AS msa_depth,
    seq.sequence
FROM 
    pdb_structures pdb
JOIN 
    mmseqs_clusters msa ON pdb.sequence_hash = msa.cluster_center_hash
JOIN 
    protein_sequences seq ON pdb.chain_id = seq.chain_id
WHERE 
    pdb.resolution <= 2.5 -- Yüksek çözünürlük sınırı (Angstrom)
    AND pdb.experimental_method = 'X-RAY DIFFRACTION'
    AND pdb.release_date <= '2018-04-30' -- AF2 eğitim eşiği
GROUP BY 
    pdb.chain_id, pdb.resolution, seq.sequence
HAVING 
    COUNT(msa.homolog_id) > 30 -- Yeterli birlikte evrimsel (co-evolution) sinyali sağla
ORDER BY 
    msa_depth DESC;
```

**2. Python: PyTorch Evoformer Uygulaması** Evoformer blokları tansör boyutlarını zarif bir şekilde manipüle eder. Aşağıdaki sözde kod (pseudo-code), OpenFold PyTorch mantığını yansıtarak, MSA ve Çift temsillerinin dikkat ve üçgensel güncelleme katmanları boyunca akışını göstermektedir:

```python
import torch
import torch.nn as nn

class EvoformerBlock(nn.Module):
    def __init__(self, c_m, c_z, heads):
        super().__init__()
        # Çift Ön Yargılı MSA Dikkati (Satır Yönlü)
        self.msa_row_attention = MSARowAttentionWithPairBias(c_m, c_z, heads)
        # Sütun Yönlü Dikkat
        self.msa_col_attention = MSAColumnAttention(c_m, heads)
        # MSA'dan Çift Temsiline İletişim
        self.outer_product_mean = OuterProductMean(c_m, c_z)
        # Geometrik grafik kısıtlaması güncellemeleri
        self.triangle_update_outgoing = TriangleMultiplicativeUpdate(c_z, mode="outgoing")
        self.triangle_update_incoming = TriangleMultiplicativeUpdate(c_z, mode="incoming")
        
    def forward(self, m, z):
        # m boyutu: (Batch, Diziler, Kalıntılar, c_m)
        # z boyutu: (Batch, Kalıntılar, Kalıntılar, c_z)
        
        # 1. Çift Ön Yargısını kullanarak MSA'yı güncelle
        m = m + self.msa_row_attention(m, z)
        m = m + self.msa_col_attention(m)
        
        # 2. Birlikte evrimi (co-evolution) Çift Temsiline aktar
        z = z + self.outer_product_mean(m)
        
        # 3. Metrik Uzay Kısıtlamalarını (Üçgen Eşitsizliği) Uygula
        z = z + self.triangle_update_outgoing(z)
        z = z + self.triangle_update_incoming(z)
        
        return m, z
```

**3. C\+\+: Koordinat FAPE Kayıp Çekirdeği (Kernel)** FAPE'nin birden fazla koordinat çerçevesi (coordinate frames) üzerindeki tüm atomlar arasındaki mesafeleri hesaplamasının hesaplama darboğazı nedeniyle, bu işlem genellikle CUDA çekirdekleri aracılığıyla C\+\+'ta optimize edilir. Bu sözde kod, koordinat projeksiyon mantığını göstermektedir:

```cpp
#include <iostream>
#include <vector>
#include <cmath>
#include <algorithm>

// 3B Noktayı Tanımla
struct Point { float x, y, z; };

// Katı Dönüşüm Çerçevesini Tanımla (Rotasyon matrisi R, Öteleme vektörü t)
struct Frame {
    float R[3][3];
    Point t;
};

// Çerçeveyi tersine çevir ve bir noktayı yerel çerçeveye yansıt
Point project_to_local(const Frame& T, const Point& p) {
    // Öteleme
    float dx = p.x - T.t.x;
    float dy = p.y - T.t.y;
    float dz = p.z - T.t.z;
    // Tersine Döndürme (Ortanormal matrisler için R'nin devriği/transpose)
    Point local_p;
    local_p.x = T.R[0][0]*dx + T.R[1][0]*dy + T.R[2][0]*dz;
    local_p.y = T.R[0][1]*dx + T.R[1][1]*dy + T.R[2][1]*dz;
    local_p.z = T.R[0][2]*dx + T.R[1][2]*dy + T.R[2][2]*dz;
    return local_p;
}

// Kırpılmış (clamped) L2 mesafesini hesapla
float compute_fape_distance(const Point& true_p, const Point& pred_p, float d_clamp) {
    float dist = std::sqrt(std::pow(true_p.x - pred_p.x, 2) + 
                           std::pow(true_p.y - pred_p.y, 2) + 
                           std::pow(true_p.z - pred_p.z, 2));
    return std::min(dist, d_clamp);
}
```

## 7. Sonuç ve Gelecek Perspektifleri

Fiziksel simülasyondan veri odaklı derin öğrenmeye geçiş, yapısal biyolojide kesin ve geri dönülemez bir devrim yaratmıştır. AlphaFold2, eş-evrimsel (co-evolutionary) verileri, karmaşık bir şekilde tasarlanmış, geometrik olarak eşdeğişkin (equivariant) bir ağ içinde birleştirerek son derece sağlam bir temel oluşturmuştur. Değişmez Nokta Dikkati (IPA) ve FAPE kaybı gibi yenilikler sayesinde mimari, protein katlanmasının temel biyofiziğini eşi benzeri görülmemiş bir doğrulukla öğrenmiştir.

Bu teknolojinin sonraki iterasyonları—ESMFold'un hizalama gerektirmeyen (alignment-free) yürütülmesinden AlphaFold 3 ve RFdiffusion'ın difüzyon tabanlı üretken (generative) yeteneklerine kadar—hesaplamalı biyolojinin kapsamını statik monomerlerin çok ötesine taşımıştır. Günümüzde bu algoritmalar, çok zincirli kompleksleri modellemek, küçük moleküllü ligandlarla arayüz oluşturmak ve tamamen yeni işlevsel proteinler sentezlemek için rutin olarak kullanılmaktadır. OpenFold ve ColabFold gibi yazılım mühendisliği çabalarıyla hesaplama darboğazları sürekli olarak hafifletildikçe, derin öğrenmenin deneysel yapısal biyolojiyle entegrasyonu, ilaç keşfi, biyokataliz ve hedefe yönelik terapötiklerde hızlı ilerlemeleri yönlendirmeye devam edecektir.
