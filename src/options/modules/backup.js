/**
 * Backup & Restore card (#30): export the current settings as JSON and
 * restore them later. Mutates the shared state via `ctx` (see options.js).
 */

export function initBackup(ctx) {
  const { DEFAULTS: FORMAT_DEFAULTS, OPTION_DEFAULTS, OPTION_ENUMS, sanitizeOverrides } = GEP.settings;
  const t = GEP.i18n.t;

  const exportSettingsBtn = document.getElementById("exportSettingsBtn");
  const importSettingsBtn = document.getElementById("importSettingsBtn");
  const importSettingsInput = document.getElementById("importSettingsInput");
  const backupStatus = document.getElementById("backupStatus");

  function setBackupStatus(msg, type) {
    if (!backupStatus) return;
    backupStatus.textContent = msg;
    backupStatus.className = "debug-status visible " + (type || "");
  }

  if (exportSettingsBtn) {
    exportSettingsBtn.addEventListener("click", () => {
      const cleanFormats = {};
      for (const key of Object.keys(FORMAT_DEFAULTS)) {
        cleanFormats[key] =
          typeof ctx.formats[key] === "boolean" ? ctx.formats[key] : FORMAT_DEFAULTS[key];
      }
      let version = "";
      try { version = chrome.runtime.getManifest().version; } catch {}
      const payload = {
        app: "more-export-for-gemini",
        type: "settings",
        version,
        exportedAt: new Date().toISOString(),
        formats: cleanFormats,
        options: { ...ctx.options },
        overrides: sanitizeOverrides(ctx.overrides),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `more-export-settings-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setBackupStatus(t("optSettingsExported"), "success");
    });
  }

  /** Validate and merge an imported payload into the live state. */
  function applyImportedSettings(data) {
    if (!data || typeof data !== "object") {
      return { ok: false, error: t("optImportInvalidFile") };
    }
    const f = data.formats;
    const o = data.options;
    if ((f && typeof f !== "object") || (o && typeof o !== "object")) {
      return { ok: false, error: t("optImportMalformed") };
    }

    let formatCount = 0;
    let optionCount = 0;

    if (f) {
      for (const key of Object.keys(FORMAT_DEFAULTS)) {
        if (typeof f[key] === "boolean") { ctx.formats[key] = f[key]; formatCount++; }
      }
      if (Object.values(ctx.formats).filter(Boolean).length === 0) ctx.formats.markdown = true;
    }

    if (o) {
      for (const key of Object.keys(OPTION_DEFAULTS)) {
        const val = o[key];
        const def = OPTION_DEFAULTS[key];
        if (typeof def === "string") {
          if (typeof val !== "string") continue;
          if (OPTION_ENUMS[key]) {
            if (OPTION_ENUMS[key].includes(val)) { ctx.options[key] = val; optionCount++; }
          } else {
            ctx.options[key] = val; optionCount++;
          }
        } else if (typeof def === "boolean") {
          if (typeof val === "boolean") { ctx.options[key] = val; optionCount++; }
        }
      }
    }

    if (data.overrides && typeof data.overrides === "object") {
      ctx.overrides = sanitizeOverrides(data.overrides);
    }

    if (!formatCount && !optionCount) {
      return { ok: false, error: t("optImportNothing") };
    }
    return { ok: true, formatCount, optionCount };
  }

  if (importSettingsBtn && importSettingsInput) {
    importSettingsBtn.addEventListener("click", () => importSettingsInput.click());
    importSettingsInput.addEventListener("change", async () => {
      const file = importSettingsInput.files && importSettingsInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        let data;
        try { data = JSON.parse(text); }
        catch { setBackupStatus(t("optInvalidJson"), "error"); return; }

        const result = applyImportedSettings(data);
        if (!result.ok) {
          setBackupStatus(result.error, "error");
          return;
        }
        ctx.syncControlsFromState();
        await ctx.saveAll();
        ctx.refreshLastEnabled();
        setBackupStatus(
          t("optImportedSummary", [String(result.formatCount), String(result.optionCount)]),
          "success"
        );
      } catch {
        setBackupStatus(t("optFileReadError"), "error");
      } finally {
        importSettingsInput.value = "";
      }
    });
  }
}
