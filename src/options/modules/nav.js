/**
 * Sidebar navigation, panel switching, cross-panel search and the first-run
 * welcome banner (#9). Self-contained: owns no settings state.
 */

export function initNav() {
  const PANEL_STORAGE_KEY = "gep_active_panel";
  const VALID_PANELS = ["overview", "formats", "options", "metadata", "overrides", "tools", "whatsnew"];
  const navButtons = document.querySelectorAll(".nav-item[data-nav]");
  const panels = document.querySelectorAll(".panel[data-panel]");
  const searchInput = document.getElementById("searchInput");
  const contentEl = document.getElementById("content");
  let activePanel = "overview";

  function applyPanelFilter() {
    // While a search is active, the search handler controls visibility.
    if (searchInput && searchInput.value.trim()) return;
    panels.forEach((p) => {
      p.classList.toggle("panel-hidden", p.dataset.panel !== activePanel);
    });
  }

  function setActivePanel(name, opts) {
    const updateHash = !opts || opts.updateHash !== false;
    if (!VALID_PANELS.includes(name)) name = "overview";
    activePanel = name;
    navButtons.forEach((b) => {
      const on = b.dataset.nav === name;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    try { localStorage.setItem(PANEL_STORAGE_KEY, name); } catch {}
    if (updateHash) { try { history.replaceState(null, "", "#" + name); } catch {} }
    applyPanelFilter();
  }

  function clearSearch() {
    if (!searchInput || !searchInput.value) return;
    searchInput.value = "";
    panels.forEach((p) => p.classList.remove("search-hidden"));
    document.querySelectorAll(".card").forEach((c) => c.classList.remove("search-hidden"));
    document.querySelectorAll(".toggle").forEach((t) => t.classList.remove("search-match"));
  }

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      clearSearch();
      setActivePanel(btn.dataset.nav);
      if (contentEl) { try { contentEl.focus({ preventScroll: true }); } catch { contentEl.focus(); } }
    });
  });

  // CTA buttons in the Overview panel jump straight to another panel.
  document.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      clearSearch();
      setActivePanel(btn.dataset.go);
    });
  });

  // ── First-run welcome (#9): background opens options.html?welcome=1 once
  // right after install; show a dismissible 3-step orientation banner. ──
  const isWelcome = new URLSearchParams(location.search).get("welcome") === "1";
  const welcomeHero = document.getElementById("welcomeHero");
  if (isWelcome && welcomeHero) {
    welcomeHero.hidden = false;
    const dismissWelcome = () => {
      welcomeHero.hidden = true;
      // Strip ?welcome=1 so a reload doesn't resurrect the banner.
      try { history.replaceState(null, "", location.pathname + location.hash); } catch {}
    };
    const dismissBtn = document.getElementById("welcomeDismiss");
    if (dismissBtn) dismissBtn.addEventListener("click", dismissWelcome);
    const formatsBtn = document.getElementById("welcomeFormats");
    if (formatsBtn) formatsBtn.addEventListener("click", dismissWelcome);
  }

  // Initial panel: welcome flow > URL hash > stored > default.
  let initialPanel = "overview";
  const hashPanel = (location.hash || "").replace(/^#/, "");
  if (isWelcome) {
    initialPanel = "overview";
  } else if (VALID_PANELS.includes(hashPanel)) {
    initialPanel = hashPanel;
  } else {
    try { initialPanel = localStorage.getItem(PANEL_STORAGE_KEY) || "overview"; } catch {}
  }
  setActivePanel(initialPanel, { updateHash: false });

  window.addEventListener("hashchange", () => {
    const h = (location.hash || "").replace(/^#/, "");
    if (VALID_PANELS.includes(h) && h !== activePanel) {
      clearSearch();
      setActivePanel(h, { updateHash: false });
    }
  });

  // ── Search / filter (spans all panels) ──
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase().trim();

      if (!q) {
        panels.forEach((p) => p.classList.remove("search-hidden"));
        document.querySelectorAll(".card").forEach((c) => c.classList.remove("search-hidden"));
        document.querySelectorAll(".toggle").forEach((t) => t.classList.remove("search-match"));
        applyPanelFilter();
        return;
      }

      // Reveal every panel so matches can surface from any section.
      panels.forEach((p) => p.classList.remove("panel-hidden"));

      panels.forEach((panel) => {
        let panelMatch = false;
        panel.querySelectorAll(".card").forEach((card) => {
          const toggles = card.querySelectorAll(".toggle[data-format], .toggle[data-option]");
          let anyMatch = false;
          toggles.forEach((t) => {
            const searchText = [
              t.dataset.search || "",
              t.dataset.format || "",
              t.querySelector(".toggle-name")?.textContent || "",
              t.querySelector(".toggle-hint")?.textContent || "",
            ].join(" ").toLowerCase();
            const match = searchText.includes(q);
            t.classList.toggle("search-match", match);
            if (match) anyMatch = true;
          });
          const headerText = card.querySelector(".section-header")?.textContent?.toLowerCase() || "";
          if (headerText.includes(q)) anyMatch = true;
          card.classList.toggle("search-hidden", !anyMatch);
          if (anyMatch) panelMatch = true;
        });
        panel.classList.toggle("search-hidden", !panelMatch);
      });
    });
  }
}
