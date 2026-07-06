---
title: "Büyük Dil Modellerinde (LLM) Dikkat Mekanizmaları: Matematiksel Temeller, Verimlilik Optimizasyonları ve Çok Dilli Değerlendirme"
author: "Test Author"
affiliation: "Test University"
tags: ["fourier", "dsp", "signal"]
---

# Büyük Dil Modellerinde (LLM) Dikkat Mekanizmaları: Matematiksel Temeller, Verimlilik Optimizasyonları ve Çok Dilli Değerlendirme

*Test Author — Test University*

> **Abstract.** Bu, metadata render yolunu doğrulamak için kullanılan örnek bir özettir.

**Keywords:** fourier, dsp, signal

## Table of Contents

  - [[#Giriş ve Arka Plan (النموذج اللغوي)]]
  - [[#Matematiksel Temeller ve Öz-Dikkat (Внимание)]]
      - [[#Esneyen Semboller ve Varyans Optimizasyonu]]
  - [[#Yöntem]]
    - [[#Donanım Bilinçli Optimizasyonlar ve Bellek Hiyerarşisi]]
    - [[#Çoklu Sorgu ve Gruplandırılmış Sorgu Dikkati]]
  - [[#Çok Dilli Değerlendirme ve Çapraz Dil Kapsayıcılığı (注意力机制)]]
  - [[#Yöntem]]
    - [[#Tokenizasyon Asimetrileri ve Entropi (Εντροπία) Etkileri]]
    - [[#Değerlendirme Kıyaslamaları (Benchmarks)]]
  - [[#Sonuç]]

**Özet (Abstract):** Bu rapor, Büyük Dil Modellerinin (Large Language Models - LLM) hesaplamasal ve dilbilimsel temellerini oluşturan dikkat (attention) mekanizmalarının teorik, algoritmik ve pratik analizini derinlemesine sunmaktadır. Doğal dil işleme (NLP) literatüründe bir dönüm noktası olan Transformer mimarisinin karmaşık matematiksel kökenlerinden başlayarak, donanım seviyesinde asimetrik bellek erişimini optimize eden gelişmiş yaklaşımlara (FlashAttention, Multi-Query Attention, Grouped-Query Attention) kadar uzanan geniş bir yelpaze incelenmektedir. Ayrıca, modellerin evrensel ölçekte uygulanabilirliğini doğrudan etkileyen çok dilli (multilingual) değerlendirme kıyaslamaları (MMLU, Belebele), tokenizasyon asimetrileri ve bu asimetrilerin neden olduğu yapısal dilsel önyargılar kapsamlı bir biçimde analiz edilmektedir. Donanım verimliliği ve dil kapsayıcılığı arasındaki dengenin, gelecekteki yapay zeka sistemlerinin demokratikleşmesinde oynadığı rol tartışılmaktadır.

**Anahtar Kelimeler:** Büyük Dil Modelleri, Transformer Mimaris, Öz-Dikkat (Self-Attention), FlashAttention, Çok Dilli Değerlendirme, Tokenizasyon Önyargısı, Bellek Optimizasyonu, Yapay Zeka.

## Giriş ve Arka Plan (النموذج اللغوي)

Yapay zeka ve makine öğrenimi alanında son on yılda yaşanan sismik ilerlemeler, özellikle ardışık veri işleme kapasitesindeki algoritmik sıçramalara dayanmaktadır. Tarihsel olarak, istatistiksel makine çevirisi (Statistical Machine Translation - SMT) sistemlerinin yerini alan ilk Nöral Makine Çevirisi (Neural Machine Translation - NMT) mimarileri, genellikle uzun kısa süreli bellek (Long Short-Term Memory - LSTM) gibi tekrarlayan sinir ağları (RNN) üzerine inşa edilmekteydi. Ancak bu mimariler, doğaları gereği kelimeleri veya alt kelime (subword) parçalarını adım adım işlemek zorunda oldukları için, modern grafik işlem birimlerinin (GPU) sunduğu devasa paralel işleme kapasitesinden faydalanamıyorlardı.

Bu yapısal darboğaz, 2014 yılında Dzmitry Bahdanau, Kyunghyun Cho ve Yoshua Bengio tarafından yayımlanan "Neural Machine Translation by Jointly Learning to Align and Translate" başlıklı çalışma ile esnetilmeye başlanmıştır[^1]. Bu çığır açan araştırmada, sabit uzunluklu bir vektörün tüm cümlenin anlamını sıkıştırmadaki yetersizliği teşhis edilmiş ve kod çözücünün (decoder) çıktı üretirken kaynak cümlenin farklı bölümlerine "yumuşak" (soft) bir şekilde odaklanmasını sağlayan ilk hizalama ve dikkat mekanizması önerilmiştir[^4]. Bahdanau'nun sunduğu bu temel, Ian Goodfellow, Yoshua Bengio ve Aaron Courville tarafından kaleme alınan derin öğrenme literatürünün temel eseri *Deep Learning* (ISBN: 9780262035613) kitabında da vurgulandığı üzere, derin ağların bilgi darboğazlarını aşmada istatistiksel hizalamanın önemini kanıtlamıştır[^5].

Ancak gerçek paradigma değişimi, 2017 yılında Ashish Vaswani ve Google'daki bir grup araştırmacı tarafından https://doi.org/10.48550/arXiv.1706.03762 DOI numarasıyla yayımlanan "Attention Is All You Need" çalışmasıyla gerçekleşmiştir[^8]. Bu çalışma, tekrarlayan ve evrişimli (convolutional) katmanları tamamen ortadan kaldırarak sadece dikkat mekanizmalarına dayanan Transformer mimarisini tanıtmıştır. Makalenin girişinde bu radikal değişim şu sözlerle ifade edilmektedir:

> [!NOTE]
> "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks in an encoder-decoder configuration. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely."[^8]

Bu yeni yaklaşım, girdi dizisindeki tüm elemanların birbirleriyle olan ilişkisini eşzamanlı olarak hesaplayarak benzersiz bir paralelleştirme imkanı sunmuş ve modern Büyük Dil Modellerinin (LLM) temel yapı taşı haline gelmiştir[^10].

## Matematiksel Temeller ve Öz-Dikkat (Внимание)

Transformer mimarisinin bilgi işleme yeteneğinin kalbinde, Öz-Dikkat (Self-Attention) adı verilen karmaşık bir doğrusal cebirsel izdüşüm mekanizması yatar. Bu mekanizma, her bir kelimenin veya belirtecin (token), bağlam içindeki diğer tüm kelimelerle olan ilişkisel sözdizimsel ve anlamsal bağlarını hesaplar. Temel işlem; girdilerin üç farklı ağırlık matrisi ile çarpılarak Sorgu (Query - $Q$), Anahtar (Key - $K$) ve Değer (Value - $V$) tensörlerine dönüştürülmesiyle başlar.

Öncelikle, modelin öğrenilebilir parametrelerini barındıran ağırlık matrisi ($W^Q$) ele alındığında, bu dönüşüm çok boyutlu bir uzayda şu şekilde ifade edilir:

$$
W^Q = \begin{bmatrix} w_{11} & w_{12} & \cdots & w_{1d} \\ w_{21} & w_{22} & \cdots & w_{2d} \\ \vdots & \vdots & \ddots & \vdots \\ w_{d1} & w_{d2} & \cdots & w_{dd} \end{bmatrix}
$$

Bu matrisler aracılığıyla elde edilen $Q$, $K$ ve $V$ bileşenleri, bilgi teorisi açısından bağlamsal önem derecelerini belirlemek üzere Ölçekli Nokta-Çarpım Dikkati (Scaled Dot-Product Attention) formülüne tabi tutulur:

$$
\text{Attention}(Q, K, V) = \text{softmax}\left( \frac{QK^T}{\sqrt{d_k}} \right)V
$$

Bu zarif denklemin merkezinde, $Q$ ve $K^T$ arasındaki nokta çarpımının, her bir kelimenin diğeriyle olan anlamsal eşleşme skorunu üretmesi yatar. Elde edilen bu ham skorlar (logits), bir yumuşak maksimum (softmax) fonksiyonu ile normalize edilerek $0$ ile $1$ arasında bir olasılık dağılımına dönüştürülür ve toplamları $1$ olacak şekilde ayarlanır. Softmax fonksiyonunun ayrık uzaydaki tanımı, $\sum$ operatörü ile şu şekilde gösterilir:

$$
\text{softmax}(x_i) = \frac{\exp(x_i)}{\sum_{j=1}^{N} \exp(x_j)}
$$

Matematiksel olarak bu işlem, dizideki her bir eleman için uzaydaki diğer tüm elemanların katkısının ağırlıklı ortalamasını almaktır. Eğer bu mekanizmayı ayrık (discrete) kelime dizilerinden çıkarıp, sinyal işleme veya teorik fizikteki gibi sürekli (continuous) bir zaman veya uzay ekseninde tanımlamak istersek, toplam operatörü yerini bir integrale ($\int$) bırakır. Sürekli uzayda dikkat ağırlıklarının hesabı, bir olasılık yoğunluk fonksiyonu üzerinden beklenen değer (expected value) hesabına dönüşür:

$$
\mathbb{E}[V] = \int_{-\infty}^{\infty} \frac{\exp\left( \frac{q \cdot k(x)}{\sqrt{d_k}} \right)}{\int_{-\infty}^{\infty} \exp\left( \frac{q \cdot k(y)}{\sqrt{d_k}} \right) dy} v(x) dx
$$

Bu integral gösterimi, dikkat mekanizmasının aslında sürekli bir bilgi akışı üzerinden, maksimum ilgiye sahip bölgesel sinyalleri izole eden sofistike bir filtreleme operatörü olduğunu kanıtlamaktadır.

#### Esneyen Semboller ve Varyans Optimizasyonu

Formülasyondaki karekök ifadesi ($\sqrt{d_k}$), derin öğrenme ağlarının optimizasyon dinamikleri açısından kritik bir role sahiptir. Matris boyutlarının ($d_k$) esnemesi ve büyümesi durumunda, iki bağımsız vektörün nokta çarpımından elde edilen sonucun varyansı $d_k$ ile doğru orantılı olarak artar. Yüksek varyanslı skorlar softmax fonksiyonuna beslendiğinde, eksponansiyel büyüme nedeniyle dağılım tek bir değere doğru sivrilir (peaking) ve diğer tüm olasılıklar sıfıra yaklaşır.

Bu durum, geri yayılım (backpropagation) sırasında gradyanların kaybolmasına (vanishing gradients) yol açar ve ağın öğrenme sürecini tamamen durdurur. Esneyen parantezlerin ve kök sembollerinin içindeki bu $\sqrt{d_k}$ faktörü, elde edilen skor dizisinin varyansını $1$'e ölçeklendirerek (temperature scaling) softmax fonksiyonunun her zaman güvenli, türevlenebilir ve pürüzsüz bir gradyan alanında çalışmasını garanti altına alır[^6].

## Yöntem

Büyük dil modellerinde mimari tasarımı kısıtlayan en temel fiziksel problem, yukarıda denklemleri verilen dikkat mekanizmasının asimptotik karmaşıklığıdır. Eğer girdi dizisinin uzunluğu $N$ ise, $Q$ ve $K^T$ matrislerinin çarpımı $N \times N$ boyutunda devasa bir dikkat skor matrisi üretir. Bu durum, bellek karmaşıklığının $O(N^2)$ oranında artması anlamına gelir. Bu matematiksel gerekliliğin kod düzeyindeki yansıması, donanım kaynaklarının nasıl hızla tükendiğini net bir şekilde gösterir.

Aşağıdaki dil etiketli Python kod bloğu, bellek hiyerarşisi farkındalığı olmayan, standart ve naif bir PyTorch dikkat mekanizması sözde-kodunu (pseudocode) temsil etmektedir:

```python
import torch
import torch.nn.functional as F

def standard_scaled_dot_product_attention(query, key, value, mask=None):
    """
    Standart O(N^2) Bellek Karmaşıklığına Sahip Dikkat Mekanizması Uygulaması
    """
    # K matrisinin son iki boyutunun yerini değiştir (Transpose)
    d_k = query.size(-1)
    
    # Adım 1: Nokta Çarpım (O(N^2) boyutunda bellek tahsisi başlar)
    # Bu adımda devasa boyutlu bir S matrisi GPU'nun HBM birimine yazılır.
    scores = torch.matmul(query, key.transpose(-2, -1)) 
    
    # Adım 2: Varyans ölçeklendirme işlemi
    scores = scores / (d_k ** 0.5)
    
    # Nedensel (causal) dil modelleri için geleceğe bakmayı engelleyen maskeleme
    if mask is not None:
        scores = scores.masked_fill(mask == 0, float('-inf'))
        
    # Adım 3: Softmax ile skorları olasılığa dönüştürme (Yine HBM'ye okuma/yazma)
    attention_weights = F.softmax(scores, dim=-1)
    
    # Adım 4: Olasılık ağırlıklarının V matrisi ile çarpılarak nihai çıktının alınması
    output = torch.matmul(attention_weights, value)
    
    return output, attention_weights
```

Yukarıdaki naif yöntemde, `scores` ve `attention_weights` ara değişkenleri tam boyutlu birer matris olarak grafik işlemcinin (GPU) Yüksek Bant Genişlikli Belleğine (High Bandwidth Memory - HBM) yazılmak ve oradan tekrar okunmak zorundadır. Modern NLP görevlerinde dizi uzunlukları 128.000 veya 1.000.000 token seviyelerine çıktığında, bu $O(N^2)$ okuma/yazma döngüsü donanım limitlerini aşar[^12]. Bu nedenle, endüstri standardı haline gelen LLM'lerde donanım seviyesi IO (Giriş/Çıkış) bilinçli algoritmalar geliştirilmek zorunda kalınmıştır.

### Donanım Bilinçli Optimizasyonlar ve Bellek Hiyerarşisi

Standart dikkat mekanizmasının yarattığı bu darboğazı aşmak amacıyla geliştirilen algoritmik çözümlerin başında, Tri Dao ve arkadaşları tarafından Stanford Üniversitesi'nde tasarlanan ve https://doi.org/10.48550/arXiv.2205.14135 DOI numarasıyla yayımlanan **FlashAttention** gelmektedir[^12]. FlashAttention, GPU'ların asimetrik bellek hiyerarşisinden faydalanan tam (exact) bir dikkat algoritmasıdır. GPU'larda devasa kapasiteye sahip ancak yavaş olan HBM ile, sadece birkaç megabayt kapasiteli ancak muazzam hızlı çalışan çip-içi Statik Rastgele Erişimli Bellek (SRAM) bulunur. FlashAttention, $N \times N$ matrisin tamamını HBM'ye yazıp okumak yerine, hesaplamayı küçük bloklara bölerek (tiling tekniği) yalnızca SRAM üzerinde gerçekleştirir. Bu yöntem, HBM erişim sayısını $O(N^2)$'den $O(N^2 d^2 M^{-1})$ (burada $M$ SRAM boyutudur) seviyesine indirerek bellek tüketimini doğrusal ($O(N)$) hale getirir ve hızı 2 ile 4 kat arasında artırır[^13].

FlashAttention'ın ilk sürümünün sağladığı devasa sıçramanın ardından, donanım mimarilerindeki değişimlere entegre edilen yeni sürümler ortaya çıkmıştır:

- **FlashAttention-2:** 2023 yılında Tri Dao tarafından sunulan (https://doi.org/10.48550/arXiv.2307.08691) bu güncelleme, GPU üzerindeki farklı iş parçacığı blokları (thread blocks) ve "warp"lar arasındaki iş bölümünü optimize etmiştir. Matris çarpımı dışındaki (non-matmul) FLOP sayısını azaltarak ve iletişim yükünü düşürerek, NVIDIA A100 GPU'larda teorik maksimum FLOP/s kapasitesinin %73'üne (saniyede 225 TeraFLOP) ulaşmayı başarmıştır[^16].
- **FlashAttention-3:** NVIDIA'nın yeni nesil Hopper (H100) mimarisinin yeteneklerini sonuna kadar kullanmak üzere 2024 yılında geliştirilmiştir (https://doi.org/10.48550/arXiv.2407.08608). Bu sürüm, Tensor Çekirdekleri ile Tensor Bellek Hızlandırıcısı'nın (TMA) asenkron yapısından faydalanarak hesaplama ve veri taşıma işlemlerini eşzamanlı yürütür (overlap). Matris çarpımı ile softmax işlemlerinin blok bazında iç içe geçirilmesi ve FP8 düşük hassasiyet (low-precision) formatının kullanılması sayesinde, hız saniyede 1.2 PetaFLOP (PFLOP/s) seviyelerine kadar çıkarılmıştır[^19].

### Çoklu Sorgu ve Gruplandırılmış Sorgu Dikkati

Dikkat mekanizmasının eğitim (training) sırasındaki en büyük sorunu dizin uzunluğunun karesel karmaşıklığı iken, modelin üretim (inference / decoding) aşamasındaki en büyük sorunu Anahtar-Değer Önbelleği (KV Cache) kısıtlamalarıdır. Otoregresif olarak her yeni token üretildiğinde, geçmiş tüm token'ların $K$ ve $V$ tensörlerinin bellekte tutulması gerekir. Bu durum, özellikle çok kullanıcılı eşzamanlı çıkarım (batch inference) senaryolarında bellek bant genişliğini hızla tüketir.

Bu sorunu çözmek için Noam Shazeer tarafından https://doi.org/10.48550/arXiv.1911.02150 DOI ile yayımlanan çalışmada Çoklu Sorgu Dikkati (Multi-Query Attention - MQA) önerilmiştir[^22]. MQA, her bir dikkat başlığının (attention head) kendi bağımsız $K$ ve $V$ matrislerini öğrenmesi yerine, tüm sorgu başlıklarının tek bir paylaşımlı $K$ ve $V$ matrisini kullanmasını sağlar. Bu mimari, önbellek boyutunu ve bellek bant genişliği ihtiyacını dramatik biçimde düşürür; ancak dil modelinin doğruluğunda ve akıl yürütme kapasitesinde hafif kalite kayıplarına (quality degradation) neden olur[^22].

Kalite kaybı ile donanım verimliliği arasındaki bu zıtlaşmayı çözmek için Joshua Ainslie ve arkadaşları tarafından 2023 yılında https://doi.org/10.48550/arXiv.2305.13245 DOI numaralı "GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints" makalesi yayımlanmıştır[^24]. Gruplandırılmış Sorgu Dikkati (Grouped-Query Attention - GQA) olarak adlandırılan bu yaklaşım, MQA ve standart Çok Başlıklı Dikkat (Multi-Head Attention - MHA) arasında ideal bir denge noktası (Pareto frontier) bulur. Tüm başlıkların tek bir KV matrisini paylaşması yerine, başlıklar belirli "gruplara" ayrılır ve her grup kendi içinde bağımsız bir KV matrisini paylaşır.

GQA'nın başarısı, LLaMA 3 gibi devasa modellerin temel yapı taşı olmasını sağlamıştır. Sadece %5'lik bir eğitim bütçesiyle (uptraining) standart MHA kontrol noktalarından (checkpoints) GQA yapısına geçiş yapılabilmektedir. GQA, MHA'nın yüksek model kalitesini korurken, MQA'nın çıkarım hızına ulaşarak endüstri standardı haline gelmiştir[^24].

## Çok Dilli Değerlendirme ve Çapraz Dil Kapsayıcılığı (注意力机制)

Büyük dil modellerinin mimari seviyedeki donanım verimlilikleri olağanüstü seviyelere ulaşsa da, bu modellerin küresel ölçekte, farklı dilleri konuşan kullanıcılara sunduğu hizmet kalitesi eşit değildir. İnternet verisinin orantısız şekilde İngilizce ağırlıklı olması, LLM'lerin ön-eğitim (pre-training) aşamalarında anlamsal temsillerini İngilizce merkezli kurmasına neden olmaktadır. Lewis Tunstall, Leandro von Werra ve Thomas Wolf tarafından yazılan ve [Hugging Face](https://huggingface.co) kütüphanelerinin temelini anlatan *Natural Language Processing with Transformers* (ISBN: 9781098136796) eserinde de vurgulandığı gibi, modellerin çapraz dil aktarımı (cross-lingual transfer learning) kapasitesi, donanım optimizasyonlarından bağımsız, sosyo-dilbilimsel ve algoritmik bir sorundur[^28].

Son araştırmalar, çok dilli LLM'lerin içsel temsillerini anlamak için Çapraz-Katman Dönüştürücüleri (Cross-Layer Transcoders - CLTs) kullanmaktadır[^31]. Bu çalışmalara göre, ağın erken katmanları farklı dillerdeki kelimeleri işlerken, orta katmanlarda dilden bağımsız, soyut bir "Ortak Pivot Uzayı" (Pivot Language Hypothesis) oluşmaktadır. Model, soyut kavramsal uzayda mantıksal çıkarımını tamamladıktan sonra, son katmanlarda çıktıyı tekrar hedef dile (örneğin Türkçe veya Japonca'ya) dönüştürür[^31]. Ancak bu işlemin başarısı, modelin o dile ait alt birimleri (token) ne kadar iyi tanıdığına bağlıdır.

## Yöntem

Çok dilli modellerin değerlendirilmesi (evaluation), salt makine çevirisi metrikleriyle (BLEU veya ROUGE) ölçülemeyecek kadar karmaşıktır. Daniel Jurafsky ve James H. Martin'in klasikleşmiş *Speech and Language Processing* (ISBN: 9780131873216) adlı kitabında açıklanan temel NLP kuralları[^33], yerini artık karmaşık dünya bilgisini test eden statik kıyaslamalara bırakmıştır. Bu bağlamda, İngilizce dışı dillerdeki performansı ölçmek için yeni yöntemler ve devasa veri setleri geliştirilmiştir.

**1. MMLU (Massive Multitask Language Understanding):** Dan Hendrycks ve arkadaşları tarafından (https://doi.org/10.48550/arXiv.2009.03300) oluşturulan bu kıyaslama, yapay zeka değerlendirmesinde bir endüstri standardıdır[^35]. MMLU; kök hücre biyolojisinden ABD tarihine, anayasa hukukundan soyut cebire kadar uzanan 57 farklı akademik ve profesyonel disiplini kapsar. Yakın zamana kadar modellerin rastgele tahmin (%25) ile insan uzmanlığı (%89) arasında zorlandığı bu test, güncel LLM'lerin İngilizce'de \>%90 doğruluk oranlarına ulaşmasıyla doymuş (saturated) durumdadır[^37]. Ancak bu testin çok dilli türevleri (örneğin EU20-MMLU), Avrupa dilleri veya Hint dillerine çevrildiğinde performansta keskin düşüşler gözlenmektedir[^38].

**2. Belebele Veri Seti:** [Meta AI](https://ai.meta.com/) araştırmacıları tarafından https://doi.org/10.18653/v1/2024.acl-long.44 DOI adresiyle yayımlanan Belebele veri seti, 122 farklı dil varyantını kapsayan, tamamen paralel bir makine okuduğunu anlama (Machine Reading Comprehension) testidir[^40]. FLORES-200 bağlamları kullanılarak insan denetmenler tarafından oluşturulan bu veri seti, diller arasındaki yapısal eşitsizliği doğrudan ölçmeyi sağlar. Yeni türevleri olan 2M-BELEBELE (https://doi.org/10.48550/arXiv.2412.08274), bu kapsamı konuşma (speech) ve Amerikan İşaret Dili'ne (ASL) kadar genişleterek, modellerin metin dışı çoklu modalitelerdeki çok dilli kapasitesini test etmektedir[^43].

### Tokenizasyon Asimetrileri ve Entropi (Εντροπία) Etkileri

Yapay zeka modellerinin farklı dillerdeki başarısızlıklarının temel nedeni, sanıldığının aksine modelin parametre sayısı veya mimarisinden ziyade, girdinin nasıl bölündüğüyle (tokenizasyon) ilgilidir. Modern modeller Byte Pair Encoding (BPE) veya Unigram gibi yöntemler kullanır. İngilizce merkezli bir kelime dağarcığına (vocabulary) sahip bir model, yüksek kaynaklı dilleri çok az token ile temsil edebilirken, düşük kaynaklı veya morfolojik olarak zengin dillerde metni parçalamakta zorlanır.

Aşağıdaki yapı, çok dilli LLM ekosistemindeki tokenizasyon asimetrilerini hiyerarşik bir düzende özetlemektedir:

1. **Alt Kelime Doğurganlığı (Subword Fertility):**
  - Bir kelimenin ortalama kaç tokene bölündüğünü ölçen metriktir. İdeal değer 1.0'a ne kadar yakınsa, model kelimeyi o kadar bütünsel kavramış demektir[^45].
  - İngilizce gibi dillerde bu oran 1.1 ile 1.3 arasındayken, Hintçe, Bengalce veya Telugu dili gibi Hint dillerinde bu oran 3.0'ın üzerine çıkabilmektedir[^46].
2. **Normalize Edilmiş Dizi Uzunluğu (Normalized Sequence Length - NSL):**
  - Farklı tokenizer'ların aynı anlamı ifade eden metinler için ürettikleri dizi uzunluklarının kıyaslamasıdır.
  - Yüksek NSL, kelimenin çok fazla anlamsız parçaya bölündüğünü gösterir.
  - *SUTRA Tokenizer:* Yapılan analizlerde, GPT-4o ve LLaMA 3'e kıyasla Hint dillerinde 14 farklı dilde NSL metriğinde üstünlük sağlamıştır[^45].
3. **Performans ve Maliyet Yansımaları:**
  - **Çıkarım (Inference) Darboğazı:** Bir dilde aynı cümleyi üretmek için 10 token, diğer dilde 30 token gerekiyorsa, otoregresif model ikinci dil için 3 kat daha fazla hesaplama döngüsü harcar. Bu doğrudan API maliyetlerinin artması ve kullanıcı bekleme süresinin uzaması anlamına gelir[^47].
  - **Bağlam Penceresi Sıkışması:** 128K tokenlik bir bağlam penceresi, İngilizce'de devasa bir kitabı kapsayabilirken, Bengalce veya Türkçe'de token enflasyonu nedeniyle sadece birkaç uzun makaleyi kapsayabilir.

Farklı alfabelerdeki metinlerin sembolik veya kural tabanlı dillerde nasıl parçalandığını göstermek için, aşağıda C\+\+ dili kullanılarak yazılmış, bir karakterin veya boşluğun doğrudan sınır kabul edildiği naif bir dize (string) ayrıştırma örneği sunulmuştur. Bu örnek, BPE gibi modern istatistiksel algoritmaların yokluğunda morfolojinin ne kadar zorlu olabileceğini gösterir:

```cpp
#include <iostream>
#include <vector>
#include <string>

// Metni sadece boşluk karakterine göre ayıran basit (naif) C++ tokenizasyon fonksiyonu
// Not: Bu kural tabanlı yaklaşım sondan eklemeli dillerin morfolojisini yakalayamaz.
std::vector<std::string> naive_whitespace_tokenize(const std::string& text) {
    std::vector<std::string> tokens;
    std::string current_token = "";
    
    for (char c : text) {
        if (c == ' ') {
            if (!current_token.empty()) {
                tokens.push_back(current_token);
                current_token = ""; // Yeni token için sıfırla
            }
        } else {
            current_token += c; // Karakterleri birleştir
        }
    }
    // Döngü sonrası elde kalan son tokenin listeye eklenmesi
    if (!current_token.empty()) {
        tokens.push_back(current_token);
    }
    
    return tokens;
}

int main() {
    std::string sample_text = "Çok dilli modeller entropi asimetrisi yaşar.";
    std::vector<std::string> result = naive_whitespace_tokenize(sample_text);
    
    for(size_t i = 0; i < result.size(); ++i) {
        std::cout << "Token " << i+1 << ": [" << result[i] << "]\n";
    }
    return 0;
}
```

Bu naif kural tabanlı yaklaşımların aksine, LLaMA 3 gibi modern yapılar, İngilizce dışındaki dillerin performansını artırmak için devasa BPE sözlük boyutları (örneğin 128.000 kelimelik kelime dağarcığı) kullanmaktadır[^27]. Tokenizer bias'ı (belirteç önyargısı) sadece teknik bir veri israfı değil, aynı zamanda yapısal bir adaletsizliktir (structural bias); zira Amerikan İngilizcesine (AmE) optimize edilmiş ağlar, Afrika veya Asya dillerine geçerken hesaplamasal cezalar üretmektedir[^49].

### Değerlendirme Kıyaslamaları (Benchmarks)

Modellerin hem dilsel yeteneklerini hem de donanımsal optimizasyonlarının (FlashAttention, GQA vb.) uç noktalardaki performansını anlayabilmek için, endüstride kabul gören kıyaslama veri setleri kullanılmaktadır. Tablo 1, çok dilli LLM değerlendirmelerinde günümüzde kullanılan temel testleri özetlemektedir.

**Tablo 1: LLM Değerlendirme Veri Setleri ve Karakteristik Özellikleri**

| Benchmark (Kıyaslama) | Temel Amacı ve Odak Noktası | Kapsam ve Yapısal Açıklamalar |
| --- | --- | --- |
| **MMLU**\[cite: 35\] | Profesyonel Uzmanlık ve Dünya Bilgisi | 57 farklı disiplini kapsar (Hukuk, Tıp, İleri Matematik).Modelin ön-eğitimde (pre-training) gördüğü bilgileri "Zero-shot" (sıfır örnek) ayarlarında test eder.İngilizce'de LLM'ler %90 başarıyla testi doygunluğa ulaştırmıştır. |
| **Belebele**\[cite: 41\] | Küresel Ölçekte Çapraz Dilde Okuduğunu Anlama | Tamamen paralel 122 farklı dil varyantını kapsar (yüksek ve düşük kaynaklı diller bir arada).FLORES-200 bağlamlarını kullanarak tasarlanmış çoktan seçmeli sorulardan oluşur.İngilizce merkezli (English-centric) büyük modellerle, dengeleyici çok dilli (multilingual) modeller arasındaki farkı gösterir. |
| **2M-BELEBELE**\[cite: 44\] | Çok Modlu (Multimodal) Anlama Kapasitesi | Belebele veri setini konuşma (speech) tanıma ve Amerikan İşaret Dili (ASL) yönünde genişletir.Okuduğunu anlama (reading) ile işittiğini anlama arasındaki %10'luk performans farkını analiz eder. |
| **MM-JudgeBench**\[cite: 50\] | Hakem Model (LLM-as-a-Judge) Performansı | Modellerin diğer modelleri değerlendirme kapasitesini 25 tipolojik olarak farklı dilde ölçer.Açık ve kapalı kaynaklı 22 adet görsel-dil (LVLM) modelinin tarafsızlığını kıyaslar. |

Öte yandan, algoritmik ilerlemelerin donanımdaki fiziksel etkilerini gözlemlemek için, modellerin altında yatan mimarilerin verimliliğini değerlendirmek de elzemdir.

**Tablo 2: Dikkat Algoritmalarının Karşılaştırmalı Verimlilik Analizi**

| Algoritma Modeli | Bellek Karmaşıklığı (IO) | Hızlandırıcı Entegrasyonu | Endüstriyel Etki ve Çıkarım Performansı |
| --- | --- | --- | --- |
| **Geleneksel MHA** | Karesel: $O(N^2)$ | Yok / Sınırlı | Devasa boyutlu KV önbelleği nedeniyle yavaştır. |
| **FlashAttention-1** | Doğrusal: $O(N)$ | SRAM Döşeme (Tiling) | GPU okuma/yazma döngülerini minimuma indirerek[^13] hız sağlar. |
| **FlashAttention-2** | Doğrusal: $O(N)$ | İş Bölümü Dağıtımı | NVIDIA A100'lerde donanım limitinin %73'üne (225 TFLOP/s) ulaşır[^17]. |
| **FlashAttention-3** | Doğrusal: $O(N)$ | TMA ve Asenkronizasyon | Hopper (H100) mimarisinde FP8 desteği ile 1.2 PFLOP/s gücüne ulaşır[^20]. |
| **GQA** (Ainslie vd.) | Değişken / Ara Form | MHA ve MQA Melezi | Çıkarım sırasında bellek tüketimini azaltırken kaliteden ödün vermez[^24]. |

## Sonuç

Doğal dil işleme ve üretken yapay zeka sistemleri, Bahdanau'nun hizalama konsepti ile atılan tohumların, Vaswani'nin Transformer mimarisi ile yeşermesi sonucu benzeri görülmemiş bir noktaya ulaşmıştır. Karesel zaman ve bellek kısıtlamalarına sahip standart dikkat mekanizmaları, fiziksel donanım darboğazlarına çarptığında, FlashAttention serisi (1, 2 ve 3) gibi Giriş/Çıkış (IO) bilinçli algoritmalar ve Grouped-Query Attention (GQA) gibi mimari inovasyonlar sayesinde modellerin yüz binlerce token'ı işlemesi sağlanmıştır. Çip içi SRAM'in etkin kullanımı ve asenkron Tensor Çekirdeği operasyonları, yapay zekanın işlem süresini matematiksel olarak mümkün olan alt sınırlara çekmiştir.

Ancak bu etkileyici mimari ilerlemeler, küresel dil kapsayıcılığı söz konusu olduğunda aynı başarıyı sergilemekte zorlanmaktadır. MMLU gibi testlerin İngilizce başarıları göz kamaştırıcı olsa da; Belebele veri setleri, Çapraz-Katman Dönüştürücü analizleri ve SUTRA tabanlı Normalize Edilmiş Dizi Uzunluğu (NSL) araştırmaları, modellerin İngilizce dışındaki dillerde ciddi kısıtlamalar yaşadığını kanıtlamaktadır. Morfolojik olarak zengin ve düşük kaynaklı diller, alt kelime doğurganlığı (subword fertility) ve tokenizasyon önyargıları nedeniyle hem hesaplama maliyeti hem de kalite açısından cezalandırılmaktadır.

Gelecekteki yapay zeka araştırmalarının temel hedefi; sadece silikon tabanlı donanımları sınırlarına kadar zorlayan algoritmalar (FlashAttention-4 vb.) geliştirmekle kalmamalı, aynı zamanda dilden bağımsız (language-agnostic), evrensel tokenizasyon stratejileri üreterek dijital dil uçurumunu ortadan kaldırmak olmalıdır. Etik, adil ve sürdürülebilir bir yapay zeka ekosistemi, ancak modellerin farklı kültürlere, diyalektlere ve morfolojilere "dikkatini" eşit ve önyargısız bir biçimde dağıtabilmesiyle mümkün olacaktır.

---

[^1]: [Neural Machine Translation by Jointly Learning to Align and Translate | BibSonomy](https://www.bibsonomy.org/bibtex/2713375898fd7d2477f6ab6dc3dd66c2c/albinzehe)
[^4]: [Neural Machine Translation by Jointly Learning to Align and Translate - ResearchGate](https://www.researchgate.net/publication/265252627_Neural_Machine_Translation_by_Jointly_Learning_to_Align_and_Translate)
[^5]: [Deep Learning by Ian Goodfellow (71 results) - AbeBooks](https://www.abebooks.com/book-search/title/deep-learning/author/ian-goodfellow/)
[^6]: [Ian Goodfellow, Yoshua Bengio, and Aaron Courville: Deep learning: The MIT Press, 2016, 800 pp, ISBN: 0262035618 - ResearchGate](https://www.researchgate.net/publication/320703571_Ian_Goodfellow_Yoshua_Bengio_and_Aaron_Courville_Deep_learning_The_MIT_Press_2016_800_pp_ISBN_0262035618)
[^8]: [Attention Is All You Need - Wikipedia](https://en.wikipedia.org/wiki/Attention_Is_All_You_Need)
[^10]: [[1706.03762] Attention Is All You Need - arXiv](https://arxiv.org/abs/1706.03762)
[^12]: [FLASHATTENTION: Fast and Memory-Efficient Exact Attention with IO-Awareness - OpenReview](https://openreview.net/references/pdf?id=_MLiUszuOPD)
[^13]: [FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness - arXiv](https://arxiv.org/abs/2205.14135)
[^16]: [FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning | OpenReview](https://openreview.net/forum?id=mZn2Xyh9Ec&noteId=bX7ADEhzWC)
[^17]: [FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning - Tri Dao](https://tridao.me/publications/flash2/flash2.pdf)
[^19]: [FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-precision - Tri Dao](https://tridao.me/publications/flash3/flash3.pdf)
[^20]: [FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-precision - arXiv](https://arxiv.org/abs/2407.08608)
[^22]: [Fast Transformer Decoding: One Write-Head is All You Need | Request PDF - ResearchGate](https://www.researchgate.net/publication/337074940_Fast_Transformer_Decoding_One_Write-Head_is_All_You_Need)
[^24]: [GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints](https://aclanthology.org/2023.emnlp-main.298/)
[^27]: [LLaMA 3 vs. State-of-the-Art Large Language Models: Performance in Detecting Nuanced Fake News - MDPI](https://www.mdpi.com/2073-431X/13/11/292)
[^28]: [Natural Language Processing with Transformers, Revised Edition - Ingram Academic](https://ingramacademic.com/products/natural-language-processing-with-transformers-revised-edition-9781098136796)
[^31]: [Tracing Multilingual Representations in LLMs with Cross-Layer Transcoders - arXiv](https://arxiv.org/html/2511.10840v2)
[^33]: [(PDF) Speech and Language Processing (second edition) Daniel Jurafsky and James H. Martin (Stanford University and University of Colorado at Boulder) Pearson Prentice Hall, 2009, xxxi+988 pp; hardbound, ISBN 978-0-13-187321-6, $115.00 - ResearchGate](https://www.researchgate.net/publication/220355425_Speech_and_Language_Processing_second_edition_Daniel_Jurafsky_and_James_H_Martin_Stanford_University_and_University_of_Colorado_at_Boulder_Pearson_Prentice_Hall_2009_xxxi988_pp_hardbound_ISBN_978-0-13)
[^35]: [Measuring Massive Multitask Language Understanding - ResearchGate](https://www.researchgate.net/publication/344159828_Measuring_Massive_Multitask_Language_Understanding)
[^37]: [A benchmark of expert-level academic questions to assess AI capabilities - AVESİS](https://avesis.ankara.edu.tr/yayin/cc54c2d8-c469-4461-ba94-762be7025672/a-benchmark-of-expert-level-academic-questions-to-assess-ai-capabilities/document.pdf)
[^38]: [[PDF] Towards Multilingual LLM Evaluation for European Languages | Semantic Scholar](https://www.semanticscholar.org/paper/Towards-Multilingual-LLM-Evaluation-for-European-Thellmann-Stadler/0bbef27ae2d4df771b19330a2f4c59070b45cd6d)
[^40]: [Knowledge Distillation for Embeddings of Low-Resource Turkic Family Languages - Gazi University Journal of Science Part A: Engineering and Innovation - DergiPark](https://dergipark.org.tr/en/pub/gujsa/article/1844025)
[^43]: [[2412.08274] 2M-BELEBELE: Highly Multilingual Speech and American Sign Language Comprehension Dataset - arXiv](https://arxiv.org/abs/2412.08274)
[^45]: [Evaluating Tokenizer Performance of Large Language Models Across Official Indian Languages - arXiv](https://arxiv.org/pdf/2411.12240)
[^46]: [Evaluating Tokenizer Performance of Large Language Models Across Official Indian Languages - arXiv](https://arxiv.org/html/2411.12240v1)
[^47]: [Tokenization efficiency of current foundational large language models for the Ukrainian language - Frontiers](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1538165/full)
[^49]: [Quantifying Gender Bias in Large Language Models Using Information-Theoretic and Statistical Analysis - ResearchGate](https://www.researchgate.net/publication/391298386_Quantifying_Gender_Bias_in_Large_Language_Models_Using_Information-Theoretic_and_Statistical_Analysis)
