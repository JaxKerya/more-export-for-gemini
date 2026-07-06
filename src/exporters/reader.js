/**
 * Reader exporter: a self-contained, reading-optimized HTML document for end
 * users who just want to read and keep the report in a clean format.
 *
 * It reuses the shared body builder (GEP.pdf.bodyHtml) — so headings, TOC,
 * footnotes and math match every other HTML/PDF export — but wraps it in a
 * modern, desktop-first "reading app" shell (Swiss/minimalist):
 *   - a sticky top bar with the report title + controls,
 *   - a persistent left sidebar outline with active-section highlighting
 *     (scrollspy) on wide screens, collapsing to a slide-in drawer on phones,
 *   - a comfortable, centered reading column (optimal ~70-character measure)
 *     with a Comfortable/Wide width toggle remembered in localStorage,
 *   - automatic light/dark theming (prefers-color-scheme) + a manual
 *     Auto/Light/Dark toggle remembered in localStorage,
 *   - a top reading-progress bar, a back-to-top button and a skip link,
 *   - hover anchors on headings, a :target highlight, and balanced typography,
 *   - syntax-highlighted code (highlight.js) — inlined only when the report
 *     actually contains code,
 *   - a footer crediting the extension plus an estimated reading time.
 *
 * Progressive: with JavaScript disabled it is still a clean, fully readable
 * single-column article (the sidebar/topbar controls simply stay inert and the
 * report's own inline table of contents remains visible).
 *
 * Fully offline: no external CSS, fonts or scripts. KaTeX styles and the
 * highlight.js payload are inlined only when the report needs them.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});
  const APP_NAME = "More Export for Gemini";

  // Inline SVG icons (no emoji; stroke inherits currentColor so they track the
  // theme). 20×20 on a 24-grid, matching a Lucide-style line set.
  const ICON_MENU =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';

  function esc(s) {
    return GEP.pdf && GEP.pdf.htmlEscape ? GEP.pdf.htmlEscape(s) : String(s == null ? "" : s);
  }

  /** Minimal SEO/attribution <meta> tags from document metadata, if any. */
  function headMeta(opts) {
    const meta = GEP.docmeta ? GEP.docmeta.normalize(opts) : { has: false, keywords: [] };
    if (!meta.has) return "";
    let t = "";
    if (meta.author) t += `<meta name="author" content="${esc(meta.author)}">`;
    if (meta.keywords && meta.keywords.length) t += `<meta name="keywords" content="${esc(meta.keywords.join(", "))}">`;
    if (meta.abstract) t += `<meta name="description" content="${esc(meta.abstract)}">`;
    return t;
  }

  /** True when the report has at least one fenced code block. */
  function irHasCode(ir) {
    return !!(ir && Array.isArray(ir.blocks) && ir.blocks.some((b) => b && b.type === "code"));
  }

  /** Estimated reading time (minutes) from the rendered body text. */
  function readingMinutes(bodyText) {
    const words = (bodyText || "").trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  }

  const READER_CSS = `
    :root{
      color-scheme: light dark;
      --bg:#fdfdfc; --surface:#f4f6f8; --surface-2:#eceff3; --stripe:#f7f8fa;
      --text:#1f2328; --muted:#525a63; --border:#dde1e6;
      --accent:#3b6db3; --accent-soft:#eef3fb; --code-bg:#f2f3f5;
      --topbar-bg:rgba(253,253,252,.82);
      --topbar-h:3.25rem; --sidebar-w:17.5rem; --measure:48rem;
      --shadow:0 1px 2px rgba(15,23,42,.06),0 4px 16px rgba(15,23,42,.06);
    }
    /* OS dark — unless the reader has been manually pinned to light. */
    @media (prefers-color-scheme: dark){
      :root:not([data-theme="light"]){
        --bg:#15171c; --surface:#1e222a; --surface-2:#252b34; --stripe:#1b1f26;
        --text:#e6e8eb; --muted:#9aa3ad; --border:#2b303a;
        --accent:#7fb0ec; --accent-soft:#1b2632; --code-bg:#20252e;
        --topbar-bg:rgba(21,23,28,.82);
        --shadow:0 1px 2px rgba(0,0,0,.4),0 4px 18px rgba(0,0,0,.35);
      }
    }
    /* Baked theme (chosen in extension settings) always wins, regardless of OS. */
    :root[data-theme="light"]{ color-scheme:light; }
    :root[data-theme="dark"]{
      color-scheme:dark;
      --bg:#15171c; --surface:#1e222a; --surface-2:#252b34; --stripe:#1b1f26;
      --text:#e6e8eb; --muted:#9aa3ad; --border:#2b303a;
      --accent:#7fb0ec; --accent-soft:#1b2632; --code-bg:#20252e;
      --topbar-bg:rgba(21,23,28,.82);
      --shadow:0 1px 2px rgba(0,0,0,.4),0 4px 18px rgba(0,0,0,.35);
    }
    /* Wide reading measure (still capped for line-length comfort). */
    :root[data-width="wide"]{ --measure:66rem; }

    /* Font size scales the whole page from the root, so the rem-based measure
       scales too and the line length (in characters) stays balanced. */
    :root[data-size="small"]{ font-size:93.75%; }
    :root[data-size="large"]{ font-size:112.5%; }

    /* Accent presets (light). */
    :root[data-accent="teal"]{ --accent:#0d9488; --accent-soft:#e0f3f0; }
    :root[data-accent="green"]{ --accent:#15803d; --accent-soft:#e7f4ea; }
    :root[data-accent="purple"]{ --accent:#7c3aed; --accent-soft:#f0eafe; }
    :root[data-accent="amber"]{ --accent:#b45309; --accent-soft:#fbf0db; }
    :root[data-accent="rose"]{ --accent:#e11d48; --accent-soft:#fce8ee; }
    /* Accent presets (dark): OS dark unless pinned light, plus pinned dark. */
    @media (prefers-color-scheme: dark){
      :root:not([data-theme="light"])[data-accent="teal"]{ --accent:#2dd4bf; --accent-soft:#10302c; }
      :root:not([data-theme="light"])[data-accent="green"]{ --accent:#4ade80; --accent-soft:#11301c; }
      :root:not([data-theme="light"])[data-accent="purple"]{ --accent:#a78bfa; --accent-soft:#241a36; }
      :root:not([data-theme="light"])[data-accent="amber"]{ --accent:#fbbf24; --accent-soft:#332611; }
      :root:not([data-theme="light"])[data-accent="rose"]{ --accent:#fb7185; --accent-soft:#371821; }
    }
    :root[data-theme="dark"][data-accent="teal"]{ --accent:#2dd4bf; --accent-soft:#10302c; }
    :root[data-theme="dark"][data-accent="green"]{ --accent:#4ade80; --accent-soft:#11301c; }
    :root[data-theme="dark"][data-accent="purple"]{ --accent:#a78bfa; --accent-soft:#241a36; }
    :root[data-theme="dark"][data-accent="amber"]{ --accent:#fbbf24; --accent-soft:#332611; }
    :root[data-theme="dark"][data-accent="rose"]{ --accent:#fb7185; --accent-soft:#371821; }

    *{ box-sizing:border-box; }
    html{ -webkit-text-size-adjust:100%; scroll-behavior:smooth; }
    body{
      margin:0; background:var(--bg); color:var(--text);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;
      font-size:1.075rem; line-height:1.7;
      -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
    }
    /* Serif typeface for a print-like long read (headings inherit it too). */
    :root[data-font="serif"] body{
      font-family:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,Cambria,"Times New Roman",serif;
    }
    /* Relaxed line spacing. */
    :root[data-spacing="relaxed"] body{ line-height:1.9; }
    /* Justified body text with hyphenation (opt-in). */
    :root[data-justify="on"] main.reader p,
    :root[data-justify="on"] main.reader li{ text-align:justify; -webkit-hyphens:auto; hyphens:auto; }
    :focus-visible{ outline:2px solid var(--accent); outline-offset:2px; border-radius:4px; }

    .skip-link{
      position:fixed; top:.5rem; left:.5rem; z-index:120;
      background:var(--surface); color:var(--text); border:1px solid var(--border);
      border-radius:8px; padding:.5rem .9rem; font-size:.85rem; font-weight:600;
      transform:translateY(-160%); transition:transform .15s;
    }
    .skip-link:focus{ transform:none; }

    /* ---- App shell: sticky topbar + sidebar + reading column ---- */
    .reader-topbar{
      position:sticky; top:0; z-index:80;
      display:flex; align-items:center; gap:.6rem;
      height:var(--topbar-h); padding:0 clamp(.7rem,2.5vw,1.2rem);
      background:var(--topbar-bg); -webkit-backdrop-filter:saturate(160%) blur(10px);
      backdrop-filter:saturate(160%) blur(10px);
      border-bottom:1px solid var(--border);
    }
    .reader-topbar-title{
      font-size:.95rem; font-weight:650; letter-spacing:-0.01em;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; flex:1;
    }
    .reader-icon-btn{
      appearance:none; cursor:pointer; font:inherit; width:2.1rem; height:2.1rem; padding:0;
      color:var(--text); background:var(--surface); border:1px solid var(--border);
      border-radius:999px; line-height:1;
      display:inline-flex; align-items:center; justify-content:center;
      transition:color .2s, border-color .2s, background-color .2s, transform .1s;
    }
    .reader-icon-btn:hover{ border-color:var(--accent); color:var(--accent); background:var(--accent-soft); }
    .reader-icon-btn:active{ transform:translateY(1px); }
    .reader-menu{ display:none; }

    .reader-shell{ position:relative; }
    .reader-sidebar{ display:none; }

    main.reader{
      max-width:var(--measure); margin:0 auto;
      padding:clamp(1.6rem,4vw,3rem) clamp(1.1rem,4vw,1.6rem) 4rem;
      word-wrap:break-word; overflow-wrap:break-word;
      transition:max-width .2s ease;
    }

    /* Desktop: persistent sidebar, only once the outline has been built. */
    @media (min-width:64rem){
      :root.has-outline .reader-shell{
        display:grid; grid-template-columns:var(--sidebar-w) minmax(0,1fr);
      }
      :root.has-outline .reader-sidebar{
        display:block; position:sticky; top:var(--topbar-h);
        height:calc(100vh - var(--topbar-h)); overflow-y:auto;
        border-right:1px solid var(--border); background:var(--bg);
        padding:1.4rem 1rem 2rem 1.2rem;
      }
      /* The report's own inline TOC is redundant next to the sidebar. */
      :root.has-outline main.reader .toc{ display:none; }
    }

    /* Sidebar outline (scrollspy). Shared by desktop rail + mobile drawer. */
    .reader-sidebar .side-title{
      text-transform:uppercase; letter-spacing:.09em; font-size:.7rem;
      font-weight:700; color:var(--muted); margin:0 0 .8rem;
    }
    .reader-sidebar ul{ list-style:none; margin:0; padding:0; }
    .reader-sidebar li{ margin:0; }
    .reader-sidebar a{
      display:block; padding:.32rem .6rem .32rem .8rem; border-radius:6px;
      color:var(--muted); text-decoration:none; font-size:.86rem; line-height:1.35;
      border-left:2px solid transparent;
      transition:color .15s, background-color .15s, border-color .15s;
    }
    .reader-sidebar a:hover{ color:var(--text); background:var(--surface); }
    .reader-sidebar a.lvl-3{ padding-left:1.7rem; font-size:.82rem; }
    .reader-sidebar a.active{
      color:var(--accent); border-left-color:var(--accent);
      background:var(--accent-soft); font-weight:600;
    }

    /* Mobile: sidebar slides in as a drawer with a dimming scrim. */
    @media (max-width:63.99rem){
      :root.has-outline .reader-menu{ display:inline-flex; }
      :root.has-outline .reader-sidebar{
        display:block; position:fixed; top:0; left:0; z-index:100;
        width:min(20rem,82vw); height:100vh; overflow-y:auto;
        background:var(--bg); border-right:1px solid var(--border);
        padding:calc(var(--topbar-h) + 1rem) 1.1rem 2rem;
        transform:translateX(-102%); transition:transform .22s ease;
        box-shadow:var(--shadow);
      }
      :root.has-outline .reader-sidebar.open{ transform:none; }
      .reader-scrim{
        position:fixed; inset:0; z-index:90; background:rgba(0,0,0,.45);
        opacity:0; pointer-events:none; transition:opacity .22s ease;
      }
      .reader-scrim.show{ opacity:1; pointer-events:auto; }
    }

    /* ---- Article typography ---- */
    .doc-title{ font-size:clamp(1.9rem,5vw,2.6rem); line-height:1.18; font-weight:750; letter-spacing:-0.02em; margin:0 0 .6rem; text-wrap:balance; }
    .doc-byline{ color:var(--muted); font-style:italic; margin:0 0 1.2rem; }
    h1,h2,h3,h4,h5,h6{ line-height:1.3; font-weight:680; scroll-margin-top:calc(var(--topbar-h) + 1rem); text-wrap:balance; position:relative; }
    h2{ font-size:1.55rem; margin:2.4rem 0 .8rem; padding-bottom:.3rem; border-bottom:1px solid var(--border); }
    h3{ font-size:1.3rem; margin:1.9rem 0 .55rem; }
    h4{ font-size:1.1rem; margin:1.5rem 0 .45rem; }
    h5,h6{ font-size:1rem; color:var(--muted); margin:1.3rem 0 .4rem; }
    p{ margin:0 0 1.1rem; text-wrap:pretty; }
    a{ color:var(--accent); text-underline-offset:.15em; }
    ul,ol{ margin:0 0 1.1rem; padding-inline-start:1.6rem; }
    li{ margin:.3rem 0; }
    li::marker{ color:var(--muted); }
    blockquote{ margin:1.2rem 0; padding:.5rem 1.1rem; border-inline-start:3px solid var(--accent); background:var(--accent-soft); border-start-end-radius:8px; border-end-end-radius:8px; }
    blockquote p:last-child{ margin-bottom:0; }
    code{ font-family:ui-monospace,"SF Mono","Cascadia Code",Consolas,monospace; font-size:.88em; background:var(--code-bg); padding:.12em .4em; border-radius:5px; }
    pre{ background:var(--code-bg); border:1px solid var(--border); border-radius:10px; padding:1rem 1.1rem; overflow:auto; line-height:1.55; }
    pre code{ background:none; padding:0; font-size:.86rem; }
    table{ width:100%; border-collapse:collapse; margin:1.3rem 0; font-size:.95rem; display:block; overflow-x:auto; }
    th,td{ border:1px solid var(--border); padding:.5rem .7rem; text-align:start; vertical-align:top; }
    thead th{ background:var(--surface); font-weight:650; }
    tbody tr:nth-child(even){ background:var(--stripe); }
    hr{ border:none; border-top:1px solid var(--border); margin:2rem 0; }
    img{ max-width:100%; height:auto; border-radius:10px; }
    figure{ margin:1.4rem 0; text-align:center; }
    figcaption{ color:var(--muted); font-size:.85rem; margin-top:.4rem; }
    .abstract{ margin:1.4rem 0; padding:1rem 1.2rem; background:var(--surface); border:1px solid var(--border); border-radius:12px; }
    .abstract h2{ font-size:.8rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); border:none; margin:0 0 .4rem; padding:0; }
    .abstract p{ margin:0; }
    .doc-keywords{ color:var(--muted); font-size:.92rem; margin:0 0 1.4rem; }
    .toc{ margin:1.6rem 0 2.4rem; padding:1.1rem 1.3rem; background:var(--surface); border:1px solid var(--border); border-radius:12px; }
    .toc h2{ font-size:.8rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); border:none; margin:0 0 .5rem; padding:0; }
    .toc ul{ list-style:none; padding-inline-start:0; margin:0; }
    .toc ul ul{ padding-inline-start:1rem; }
    .toc li{ margin:.2rem 0; }
    .toc a{ text-decoration:none; }
    .toc a:hover{ text-decoration:underline; }
    .math-display{ overflow-x:auto; margin:1.3rem 0; }
    .fn-ref{ font-size:.72em; vertical-align:super; line-height:0; }
    .fn-ref a{ text-decoration:none; padding:0 .1em; }
    .footnotes{ margin-top:3rem; padding-top:1.2rem; border-top:1px solid var(--border); font-size:.92rem; color:var(--muted); }
    .footnotes h3{ font-size:1rem; color:var(--text); margin:0 0 .6rem; }
    .footnotes ol{ padding-inline-start:1.3rem; }
    .footnote-item{ margin:.3rem 0; }
    .footnotes a{ color:var(--accent); }
    .fn-back{ text-decoration:none; margin-inline-start:.3rem; }

    /* Jump highlight when navigating to a section, footnote, etc. */
    :target{ scroll-margin-top:calc(var(--topbar-h) + 1rem); }
    h2:target,h3:target,h4:target,li:target,.footnote-item:target{
      animation:reader-flash 1.8s ease; border-radius:6px;
    }
    @keyframes reader-flash{ from{ background:var(--accent-soft); } to{ background:transparent; } }

    /* Hover anchors on headings (added by script). */
    .h-anchor{
      position:absolute; left:-1.1em; top:0; padding-right:.3em;
      color:var(--muted); text-decoration:none; opacity:0; transition:opacity .15s;
      font-weight:400;
    }
    h2:hover .h-anchor,h3:hover .h-anchor,h4:hover .h-anchor,.h-anchor:focus{ opacity:.7; }
    .h-anchor:hover{ opacity:1; color:var(--accent); }

    /* Reading-progress bar (sits on the topbar's bottom edge). */
    .reader-progress{
      position:fixed; top:0; left:0; height:3px; width:0; z-index:110;
      background:var(--accent); transition:width .12s linear;
    }
    /* Floating back-to-top button (created by script). */
    .reader-top{
      position:fixed; bottom:1.4rem; right:1.4rem; z-index:70;
      width:2.6rem; height:2.6rem; border-radius:999px;
      box-shadow:var(--shadow);
      opacity:0; pointer-events:none; transform:translateY(.4rem);
      transition:opacity .2s, transform .2s, color .2s, border-color .2s, background-color .2s;
    }
    .reader-top.show{ opacity:1; pointer-events:auto; transform:none; }

    /* Footer credit + reading time. */
    .reader-footer{
      margin-top:3.5rem; padding-top:1.2rem; border-top:1px solid var(--border);
      color:var(--muted); font-size:.85rem;
      display:flex; justify-content:space-between; flex-wrap:wrap; gap:.4rem 1rem;
    }
    .reader-footer strong{ color:var(--text); font-weight:650; }

    @media (prefers-reduced-motion: reduce){
      html{ scroll-behavior:auto; }
      *{ animation:none !important; transition:none !important; }
    }
    @media print{
      :root{ --bg:#fff; --text:#000; --surface:#f4f6f8; --border:#ccc; }
      body{ font-size:11pt; }
      .reader-topbar,.reader-progress,.reader-top,.reader-sidebar,.reader-scrim,.h-anchor,.skip-link{ display:none !important; }
      .reader-shell{ display:block !important; }
      main.reader{ max-width:none; margin:0; padding:0; }
      main.reader .toc{ display:block !important; }
      a{ color:#000; }
      .toc, pre, blockquote, table, figure, li, tr{ break-inside:avoid; }
    }
  `;

  // Runtime enhancements. Self-contained, progressive: with JS disabled the
  // document is still a clean, fully readable single-column article. Theme and
  // width are baked into <html> at export time, so there is nothing to toggle
  // here — this only adds reading affordances (progress, outline, anchors).
  const READER_JS = `(function(){
    var doc=document, root=doc.documentElement, main=doc.querySelector('main.reader');
    if(!main) return;

    // ---- Reading-progress bar (omitted when disabled in settings). ----
    var bar=null;
    if(root.getAttribute('data-progress')!=='off'){
      bar=doc.createElement('div'); bar.className='reader-progress'; bar.setAttribute('role','presentation'); doc.body.appendChild(bar);
    }

    // ---- Floating back-to-top button. ----
    var topBtn=doc.createElement('button'); topBtn.className='reader-icon-btn reader-top'; topBtn.type='button';
    topBtn.setAttribute('aria-label','Back to top');
    topBtn.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    topBtn.addEventListener('click',function(){ window.scrollTo({top:0,behavior:'smooth'}); });
    doc.body.appendChild(topBtn);

    // ---- Hover anchors on headings. ----
    [].slice.call(main.querySelectorAll('h2[id],h3[id],h4[id]')).forEach(function(h){
      var a=doc.createElement('a'); a.className='h-anchor'; a.href='#'+h.id;
      a.textContent='#'; a.setAttribute('aria-label','Link to this section'); a.setAttribute('tabindex','-1');
      h.insertBefore(a,h.firstChild);
    });

    // ---- Sidebar outline (h2/h3) with scrollspy. ----
    var sidebar=doc.getElementById('reader-sidebar');
    var spy=[].slice.call(main.querySelectorAll('h2[id],h3[id]'));
    var links=[];
    if(sidebar && spy.length>=3){
      var html='<p class="side-title">On this page</p><ul>';
      spy.forEach(function(h){
        var lv=h.tagName==='H3'?3:2;
        var label=(h.textContent||'').replace(/^#/,'').trim();
        html+='<li><a class="lvl-'+lv+'" href="#'+h.id+'">'+label.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</a></li>';
      });
      sidebar.innerHTML=html+'</ul>';
      links=[].slice.call(sidebar.querySelectorAll('a'));
      root.classList.add('has-outline');
    }

    // ---- Mobile drawer (menu button + scrim). ----
    var menuBtn=doc.querySelector('.reader-menu');
    var scrim=doc.querySelector('.reader-scrim');
    function openDrawer(o){
      if(!sidebar) return;
      sidebar.classList.toggle('open',o);
      if(scrim){ scrim.classList.toggle('show',o); scrim.hidden=!o; }
      if(menuBtn) menuBtn.setAttribute('aria-expanded',o?'true':'false');
    }
    if(menuBtn) menuBtn.addEventListener('click',function(){ openDrawer(!sidebar.classList.contains('open')); });
    if(scrim) scrim.addEventListener('click',function(){ openDrawer(false); });
    doc.addEventListener('keydown',function(e){ if(e.key==='Escape') openDrawer(false); });
    links.forEach(function(a){ a.addEventListener('click',function(){ openDrawer(false); }); });

    // ---- Scroll-driven UI: progress, back-to-top, scrollspy. ----
    var topbarPx=(parseFloat(getComputedStyle(root).getPropertyValue('--topbar-h'))||3.25)*16+24;
    function onScroll(){
      var st=window.pageYOffset||doc.documentElement.scrollTop;
      var h=doc.documentElement.scrollHeight-window.innerHeight;
      if(bar) bar.style.width=(h>0?(st/h*100):0)+'%';
      if(st>600) topBtn.classList.add('show'); else topBtn.classList.remove('show');
      if(links.length){
        var active=-1;
        for(var i=0;i<spy.length;i++){ if(spy[i].getBoundingClientRect().top<=topbarPx) active=i; else break; }
        if(active<0) active=0;
        links.forEach(function(a,i){
          var on=i===active; a.classList.toggle('active',on);
          if(on){ a.setAttribute('aria-current','true'); } else { a.removeAttribute('aria-current'); }
        });
      }
    }
    var ticking=false;
    window.addEventListener('scroll',function(){
      if(ticking) return; ticking=true;
      requestAnimationFrame(function(){ onScroll(); ticking=false; });
    },{passive:true});
    onScroll();

    // Syntax highlighting (payload inlined above only when code is present).
    if(window.hljs && typeof window.hljs.highlightAll==='function'){ try{ window.hljs.highlightAll(); }catch(e){} }
  })();`;

  function convert(ir, opts) {
    const o = opts || {};
    const body = GEP.pdf.bodyHtml(ir, o);

    const hasMath = GEP.pdf && GEP.pdf.irHasKatexHtml && GEP.pdf.irHasKatexHtml(ir);
    const katexCss = hasMath && GEP.katex && GEP.katex.css ? `<style>${GEP.katex.css}</style>` : "";

    const hasCode = irHasCode(ir);
    const hljsReady = hasCode && GEP.hljs && GEP.hljs.js && GEP.hljs.css;
    const hljsCss = hljsReady ? `<style>${GEP.hljs.css}</style>` : "";
    const hljsJs = hljsReady ? `<script>${GEP.hljs.js}</script>` : "";

    // Strip tags for a rough word count → reading-time estimate.
    const plain = String(body).replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
    const mins = readingMinutes(plain);

    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const footer =
      '<footer class="reader-footer">' +
      `<span>Generated with <strong>${esc(APP_NAME)}</strong></span>` +
      `<span>~${mins} min read \u00B7 ${date}</span>` +
      "</footer>";

    const title = (ir && ir.title) || "Gemini Deep Research";

    // Presentation is chosen once in the extension settings and baked into the
    // export — so the file ships clean, with no in-page theme/width controls.
    const theme = o.readerTheme === "light" || o.readerTheme === "dark" ? o.readerTheme : "auto";
    const width = o.readerWidth === "wide" ? "wide" : "comfort";
    const outline = o.readerOutline !== false; // default on
    const font = o.readerFont === "serif" ? "serif" : "sans";
    const size = o.readerSize === "small" || o.readerSize === "large" ? o.readerSize : "medium";
    const spacing = o.readerSpacing === "relaxed" ? "relaxed" : "normal";
    const accents = ["teal", "green", "purple", "amber", "rose"];
    const accent = accents.indexOf(o.readerAccent) !== -1 ? o.readerAccent : "blue";
    const justify = o.readerJustify === true;
    const progress = o.readerProgress !== false; // default on
    // Only non-default attributes are emitted, so the markup stays clean.
    const htmlAttrs =
      (theme !== "auto" ? ` data-theme="${theme}"` : "") +
      (width === "wide" ? ' data-width="wide"' : "") +
      (font === "serif" ? ' data-font="serif"' : "") +
      (size !== "medium" ? ` data-size="${size}"` : "") +
      (spacing === "relaxed" ? ' data-spacing="relaxed"' : "") +
      (accent !== "blue" ? ` data-accent="${accent}"` : "") +
      (justify ? ' data-justify="on"' : "") +
      (progress ? "" : ' data-progress="off"');
    // "auto" tracks the device; a pinned theme advertises only that scheme.
    const colorScheme = theme === "auto" ? "light dark" : theme;

    // The top bar shows the report title (and, when an outline is present, the
    // mobile drawer toggle). No theme/width buttons — those are baked in.
    const topbar =
      '<header class="reader-topbar">' +
      (outline
        ? `<button class="reader-icon-btn reader-menu" type="button" aria-label="Toggle outline" aria-expanded="false" aria-controls="reader-sidebar">${ICON_MENU}</button>`
        : "") +
      `<span class="reader-topbar-title">${esc(title)}</span>` +
      "</header>";

    return (
      `<!DOCTYPE html><html${GEP.pdf.htmlLangDirAttrs(ir)}${htmlAttrs}><head><meta charset="utf-8">` +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      `<meta name="color-scheme" content="${colorScheme}">` +
      `<title>${esc(title)}</title>` +
      headMeta(o) +
      `<style>${READER_CSS}</style>` +
      katexCss +
      hljsCss +
      "</head><body>" +
      '<a class="skip-link" href="#reader-content">Skip to content</a>' +
      topbar +
      '<div class="reader-shell">' +
      (outline ? '<aside class="reader-sidebar" id="reader-sidebar" aria-label="Outline"></aside>' : "") +
      `<main class="reader" id="reader-content" tabindex="-1">${body}${footer}</main>` +
      "</div>" +
      (outline ? '<div class="reader-scrim" hidden></div>' : "") +
      hljsJs +
      `<script>${READER_JS}</script>` +
      "</body></html>"
    );
  }

  GEP.reader = { convert };
})();
