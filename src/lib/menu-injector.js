/**
 * Menu injector.
 *
 * Given an opened Gemini export menu, appends new export options that visually
 * match the native items. We clone a real menu item node so the injected entries
 * inherit Gemini's (Angular view-encapsulated) styling, then swap the icon and
 * label and attach our own click handler.
 *
 * Items are organised into visual groups separated by dividers:
 *   Clipboard | Text Formats | Documents | Bundle
 * Each format respects the user's visibility settings from chrome.storage.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  const PROCESSED_ATTR = "data-gep-processed";
  const MAX_MENU_ITEMS = 12;

  const ICONS = {
    markdown:
      "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z",
    txt: "M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z",
    html: "M4 4h16v16H4V4zm2 2v12h12V6H6zm2 2h3v2H8V8zm0 3h8v2H8v-2zm0 3h8v2H8v-2z",
    json: "M5 3h2v2H5v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5h2v2H5c-1.1 0-2-.9-2-2v-4a2 2 0 0 0-2-2v-2a2 2 0 0 0 2-2V5c0-1.1.9-2 2-2zm14 0c1.1 0 2 .9 2 2v4a2 2 0 0 0 2 2v2a2 2 0 0 0-2 2v4c0 1.1-.9 2-2 2h-2v-2h2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5h-2V3h2z",
    latex: "M5 3h14v2H5V3zm0 4h9v2H5V7zm0 4h14v2H5v-2zm0 4h9v2H5v-2zm0 4h14v2H5v-2z",
    csv: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 16H9v-2h4v2zm0-4H9v-2h4v2zm-5 4H7v-2h2v2zm0-4H7v-2h2v2zm8 4h-2v-2h2v2zm0-4h-2v-2h2v2zM13 9V3.5L18.5 9H13z",
    bibtex: "M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 0v5h5l-5-5zM8 12h8v2H8v-2zm0 3h6v2H8v-2zm0-6h8v2H8V9z",
    docx:
      "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 7V3.5L18.5 9H14zM8 13h8v2H8v-2zm0 4h8v2H8v-2z",
    pdf:
      "M7 2h8l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm6 1.5V8h4.5L13 3.5zM8.5 13H11a1.5 1.5 0 0 1 0 3h-1v2h-1.5v-5zm1.5 1.2h-.5v.9h.5a.45.45 0 0 0 0-.9zM13 13h2v1.2h-2v.6h2v1.2h-2V18H11.5v-5H13z",
    clipboard:
      "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
    epub: "M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 9h-2v2h-2v-2H9V9h2V7h2v2h2v2zm-1 7H7v-2h7v2zm3-4H7v-2h10v2z",
    csljson: "M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 0v5h5l-5-5zM8 12h8v2H8v-2zm0 3h6v2H8v-2zm0-6h8v2H8V9z",
    rtf: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 7V3.5L18.5 9H14zM8 13h2.5a1.5 1.5 0 0 1 .9 2.7l1.1 2.3h-1.4l-1-2H9.4v2H8v-5zm1.4 1.2v1h1a.5.5 0 0 0 0-1h-1zM13 13h3.5v1.2h-1v3.8H14.5v-3.8h-1.5V13z",
    vault: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 4v10h16V8H4zm3 2h4v6H7v-6z",
    zip: "M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10h-2v2h-2v-2H8v-2h2v-2h2v2h2v2z",
  };

  /**
   * Grouped layout: each group is rendered with a divider before it (if the
   * previous group had visible items). This keeps the menu clean.
   */
  const GROUPS = [
    {
      items: [
        { format: "clipboard_md", label: "Copy as Markdown", icon: ICONS.clipboard },
        { format: "clipboard_txt", label: "Copy as Plain Text", icon: ICONS.clipboard },
        { format: "clipboard_html", label: "Copy as HTML (rich)", icon: ICONS.clipboard },
        { format: "clipboard_json", label: "Copy as JSON", icon: ICONS.clipboard },
      ],
    },
    {
      items: [
        { format: "markdown", label: "Markdown (.md)", icon: ICONS.markdown },
        { format: "txt", label: "Plain text (.txt)", icon: ICONS.txt },
        { format: "html", label: "HTML (.html)", icon: ICONS.html },
        { format: "reader", label: "HTML – Reader (.html)", icon: ICONS.html },
        { format: "json", label: "JSON (.json)", icon: ICONS.json },
      ],
    },
    {
      items: [
        { format: "latex", label: "LaTeX (.tex)", icon: ICONS.latex },
        { format: "csv", label: "CSV (.csv)", icon: ICONS.csv },
      ],
    },
    {
      items: [
        { format: "bibtex", label: "BibTeX (.bib)", icon: ICONS.bibtex },
        { format: "ris", label: "RIS (.ris)", icon: ICONS.bibtex },
        { format: "csljson", label: "CSL-JSON (.json)", icon: ICONS.csljson },
      ],
    },
    {
      items: [
        { format: "docx", label: "Word (.docx)", icon: ICONS.docx },
        { format: "rtf", label: "Rich Text (.rtf)", icon: ICONS.rtf },
        { format: "pdf", label: "PDF (.pdf)", icon: ICONS.pdf },
        { format: "epub", label: "EPUB (.epub)", icon: ICONS.epub },
      ],
    },
    {
      items: [
        { format: "vault", label: "Vault bundle (.zip)", icon: ICONS.vault },
        { format: "zip_all", label: "Download all (.zip)", icon: ICONS.zip },
      ],
    },
  ];

  function buildSvg(pathD) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("gep-svg");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", pathD);
    svg.appendChild(p);
    return svg;
  }

  function closeMenu() {
    const backdrop = document.querySelector(".cdk-overlay-backdrop");
    if (backdrop) {
      backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
  }

  function createItem(reference, def, onExport) {
    const item = reference.cloneNode(true);

    ["data-test-id", "jslog", "value", "aria-label", "id"].forEach((attr) =>
      item.removeAttribute(attr)
    );
    item.setAttribute("data-gep-format", def.format);
    item.setAttribute("aria-label", def.label);
    item.setAttribute("role", "menuitem");
    item.setAttribute("tabindex", "-1");
    item.classList.add("gep-menu-item");

    const leading = item.querySelector(".leading-container");
    if (leading) {
      leading.textContent = "";
      const iconWrap = document.createElement("span");
      iconWrap.className = "gep-icon";
      iconWrap.appendChild(buildSvg(def.icon));
      leading.appendChild(iconWrap);
    }

    const label = item.querySelector(".label");
    if (label) label.textContent = def.label;

    const trailing = item.querySelector(".trailing-container");
    if (trailing) trailing.textContent = "";

    const handler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      Promise.resolve()
        .then(() => onExport(def.format))
        .catch((err) => console.error("[GEP] export failed", err));
    };
    item.addEventListener("click", handler, true);
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") handler(e);
    });

    return item;
  }

  function createFallbackItem(def, onExport) {
    const item = document.createElement("div");
    item.className = "gep-menu-item gep-fallback";
    item.setAttribute("role", "menuitem");
    item.setAttribute("tabindex", "-1");
    item.setAttribute("data-gep-format", def.format);
    item.setAttribute("aria-label", def.label);

    const leading = document.createElement("span");
    leading.className = "gep-icon";
    leading.appendChild(buildSvg(def.icon));

    const label = document.createElement("span");
    label.className = "gep-label";
    label.textContent = def.label;

    item.append(leading, label);

    const handler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      Promise.resolve()
        .then(() => onExport(def.format))
        .catch((err) => console.error("[GEP] export failed", err));
    };
    item.addEventListener("click", handler, true);
    return item;
  }

  function createDivider() {
    const div = document.createElement("div");
    div.className = "gep-divider";
    div.setAttribute("role", "separator");
    return div;
  }

  function isExportMenu(menuContent) {
    return !!menuContent.querySelector(
      '[data-test-id="copy-button"], [data-test-id="export-to-docs-button"], copy-button, export-to-docs-button'
    );
  }

  /**
   * @param {Element} menuContent
   * @param {Function} onExport
   * @param {Object} enabledFormats - { format_key: boolean }
   */
  function createLimitNotice() {
    const notice = document.createElement("div");
    notice.className = "gep-menu-item gep-fallback gep-limit-notice";
    notice.setAttribute("role", "menuitem");
    notice.setAttribute("tabindex", "-1");
    notice.style.cssText = "opacity:0.55;font-style:italic;cursor:default;";

    const icon = document.createElement("span");
    icon.className = "gep-icon";
    icon.textContent = "⚙";
    icon.style.cssText = "font-style:normal;";

    const label = document.createElement("span");
    label.className = "gep-label";
    label.textContent = "More formats in Settings…";

    notice.append(icon, label);
    return notice;
  }

  /**
   * @param {Element} menuContent
   * @param {Function} onExport
   * @param {Object} enabledFormats - { format_key: boolean }
   */
  function inject(menuContent, onExport, enabledFormats) {
    if (!menuContent || menuContent.getAttribute(PROCESSED_ATTR) === "1") return false;
    if (!isExportMenu(menuContent)) return false;

    menuContent.setAttribute(PROCESSED_ATTR, "1");

    const reference =
      menuContent.querySelector('[data-test-id="copy-button"] gem-menu-item') ||
      menuContent.querySelector("gem-menu-item");

    const enabled = enabledFormats || {};

    let prevGroupHadItems = true;
    let itemCount = 0;
    let limitReached = false;

    GROUPS.forEach((group) => {
      if (limitReached) return;

      const visibleItems = group.items.filter((def) => enabled[def.format] !== false);
      if (!visibleItems.length) return;

      if (prevGroupHadItems) {
        menuContent.appendChild(createDivider());
      }

      visibleItems.forEach((def) => {
        if (limitReached) return;
        if (itemCount >= MAX_MENU_ITEMS) {
          limitReached = true;
          return;
        }

        const item = reference
          ? createItem(reference, def, onExport)
          : createFallbackItem(def, onExport);
        menuContent.appendChild(item);
        itemCount++;
      });

      prevGroupHadItems = true;
    });

    if (limitReached) {
      menuContent.appendChild(createDivider());
      menuContent.appendChild(createLimitNotice());
    }

    return true;
  }

  GEP.menuInjector = { inject, isExportMenu, GROUPS };
})();
