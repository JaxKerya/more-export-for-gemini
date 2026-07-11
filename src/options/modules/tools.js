/**
 * Tools panel cards that talk to the content script on a Gemini tab:
 * debug export (ZIP of all format combinations), diagnostics and the
 * quality check. Also owns the hidden debug-card unlock (tap the logo).
 */

async function resolveGeminiTab() {
  // https only: URL-filtered tabs.query relies on the gemini host permission
  // (there is no broad "tabs" permission), which is granted for https alone.
  const [tab] = await chrome.tabs.query({
    active: true, currentWindow: true, url: "https://gemini.google.com/*",
  });
  if (tab) return tab;
  const geminiTabs = await chrome.tabs.query({ url: "https://gemini.google.com/*" });
  return geminiTabs[0] || null;
}

export function initTools() {
  const t = GEP.i18n.t;

  // ── Debug mode (tap logo 15 times) ──
  const debugCard = document.querySelector('.card[data-section="debug"]');
  const logoTap = document.getElementById("logoTap");
  let tapCount = 0;
  let tapTimer = null;

  if (logoTap && debugCard) {
    logoTap.style.cursor = "pointer";
    logoTap.addEventListener("click", () => {
      tapCount++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { tapCount = 0; }, 2000);

      if (tapCount >= 15) {
        tapCount = 0;
        debugCard.classList.toggle("unlocked");
      }
    });
  }

  // ── Debug export ──
  const debugBtn = document.getElementById("debugExportBtn");
  const debugStatus = document.getElementById("debugStatus");

  function setDebugStatus(msg, type) {
    debugStatus.textContent = msg;
    debugStatus.className = "debug-status visible " + (type || "");
  }

  if (debugBtn) {
    debugBtn.addEventListener("click", async () => {
      debugBtn.disabled = true;
      setDebugStatus(t("optSearchingTab"), "");

      try {
        const target = await resolveGeminiTab();
        if (!target) {
          setDebugStatus(t("optNoGeminiTab"), "error");
          debugBtn.disabled = false;
          return;
        }
        setDebugStatus(t("optExportingAll"), "");
        chrome.tabs.sendMessage(target.id, { type: "GEP_DEBUG_EXPORT" }, (resp) => {
          if (chrome.runtime.lastError) {
            setDebugStatus(t("optNoContentScript"), "error");
          } else if (resp && resp.ok) {
            setDebugStatus(t("optDebugZipDone"), "success");
          } else {
            setDebugStatus(resp?.error || t("optExportFailedShort"), "error");
          }
          debugBtn.disabled = false;
        });
      } catch (err) {
        setDebugStatus(t("optErrorPrefix", err.message), "error");
        debugBtn.disabled = false;
      }
    });
  }

  // ── Run diagnostics ──
  const diagnoseBtn = document.getElementById("diagnoseBtn");
  const diagnoseStatus = document.getElementById("diagnoseStatus");

  function setDiagnoseStatus(msg, type) {
    if (!diagnoseStatus) return;
    diagnoseStatus.textContent = msg;
    diagnoseStatus.className = "debug-status visible " + (type || "");
  }

  if (diagnoseBtn) {
    diagnoseBtn.addEventListener("click", async () => {
      diagnoseBtn.disabled = true;
      setDiagnoseStatus(t("optSearchingTab"), "");
      try {
        const target = await resolveGeminiTab();
        if (!target) {
          setDiagnoseStatus(t("optNoGeminiTab"), "error");
          diagnoseBtn.disabled = false;
          return;
        }
        setDiagnoseStatus(t("optRunningDiag"), "");
        chrome.tabs.sendMessage(target.id, { type: "GEP_DIAGNOSE" }, (resp) => {
          if (chrome.runtime.lastError) {
            setDiagnoseStatus(t("optNoContentScript"), "error");
          } else if (resp && resp.ok) {
            const r = resp.report || {};
            setDiagnoseStatus(
              t("optDiagResult", [
                r.ok ? t("optOkLabel") : t("optIssuesDetected"),
                String(r.blockTotal || 0),
                String(r.footnotes ? r.footnotes.seenCount : 0),
              ]),
              r.ok ? "success" : "error"
            );
          } else {
            setDiagnoseStatus(resp?.error || t("optDiagFailedShort"), "error");
          }
          diagnoseBtn.disabled = false;
        });
      } catch (err) {
        setDiagnoseStatus(t("optErrorPrefix", err.message), "error");
        diagnoseBtn.disabled = false;
      }
    });
  }

  // ── Quality check ──
  const qualityBtn = document.getElementById("qualityBtn");
  const qualityStatus = document.getElementById("qualityStatus");
  const qualityFindings = document.getElementById("qualityFindings");

  function setQualityStatus(msg, type) {
    if (!qualityStatus) return;
    qualityStatus.textContent = msg;
    qualityStatus.className = "debug-status visible " + (type || "");
  }

  function renderQualityFindings(report) {
    if (!qualityFindings) return;
    qualityFindings.replaceChildren();
    const order = { error: 0, warn: 1, info: 2 };
    const labels = { error: "ERROR", warn: "WARN", info: "INFO" };
    const items = (report && report.warnings ? report.warnings : [])
      .slice()
      .sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9));
    if (!items.length) { qualityFindings.classList.remove("visible"); return; }
    items.forEach((w) => {
      const li = document.createElement("li");
      li.className = "quality-finding " + w.level;
      const tag = document.createElement("span");
      tag.className = "qf-tag";
      tag.textContent = labels[w.level] || String(w.level || "").toUpperCase();
      const msg = document.createElement("span");
      msg.className = "qf-msg";
      msg.textContent = w.message;
      li.append(tag, msg);
      qualityFindings.appendChild(li);
    });
    qualityFindings.classList.add("visible");
  }

  if (qualityBtn) {
    qualityBtn.addEventListener("click", async () => {
      qualityBtn.disabled = true;
      if (qualityFindings) { qualityFindings.replaceChildren(); qualityFindings.classList.remove("visible"); }
      setQualityStatus(t("optSearchingTab"), "");
      try {
        const target = await resolveGeminiTab();
        if (!target) {
          setQualityStatus(t("optNoGeminiTab"), "error");
          qualityBtn.disabled = false;
          return;
        }
        setQualityStatus(t("optCheckingQuality"), "");
        chrome.tabs.sendMessage(target.id, { type: "GEP_QUALITY" }, (resp) => {
          if (chrome.runtime.lastError) {
            setQualityStatus(t("optNoContentScript"), "error");
          } else if (resp && resp.ok) {
            const s = (resp.report && resp.report.stats) || {};
            setQualityStatus(
              t("optQualityResult", [
                resp.report.ok ? t("optQualityOkShort") : t("optIssuesDetected"),
                String(s.errors || 0), String(s.warnings || 0), String(s.infos || 0),
              ]),
              resp.report.ok ? "success" : "error"
            );
            renderQualityFindings(resp.report);
          } else {
            setQualityStatus(resp?.error || t("optQualityFailedShort"), "error");
          }
          qualityBtn.disabled = false;
        });
      } catch (err) {
        setQualityStatus(t("optErrorPrefix", err.message), "error");
        qualityBtn.disabled = false;
      }
    });
  }
}
