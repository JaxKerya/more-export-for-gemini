/**
 * Export profiles card (#12): save the current setup (formats + options +
 * overrides) under a name and switch between setups in one click. Profiles
 * live in chrome.storage.sync (validated via GEP.settings.sanitizeProfiles).
 */

export async function initProfiles(ctx) {
  const { DEFAULTS: FORMAT_DEFAULTS, sanitizeOverrides } = GEP.settings;
  const t = GEP.i18n.t;

  const profileNameInput = document.getElementById("profileName");
  const profileSaveBtn = document.getElementById("profileSaveBtn");
  const profileListEl = document.getElementById("profileList");
  const profileStatus = document.getElementById("profileStatus");
  const profiles = await GEP.settings.loadProfiles();

  function setProfileStatus(msg, type) {
    if (!profileStatus) return;
    profileStatus.textContent = msg;
    profileStatus.className = "debug-status visible " + (type || "");
  }

  function currentSnapshot() {
    const cleanFormats = {};
    for (const key of Object.keys(FORMAT_DEFAULTS)) {
      cleanFormats[key] =
        typeof ctx.formats[key] === "boolean" ? ctx.formats[key] : FORMAT_DEFAULTS[key];
    }
    return {
      formats: cleanFormats,
      options: { ...ctx.options },
      overrides: sanitizeOverrides(ctx.overrides),
      savedAt: Date.now(),
    };
  }

  async function persistProfiles() {
    await GEP.settings.saveProfiles(profiles);
  }

  async function applyProfile(name) {
    const snap = GEP.settings.sanitizeSnapshot(profiles[name]);
    Object.assign(ctx.formats, snap.formats);
    Object.assign(ctx.options, snap.options);
    ctx.overrides = snap.overrides;
    ctx.syncControlsFromState();
    await ctx.saveAll();
    ctx.refreshLastEnabled();
    setProfileStatus(t("optProfileApplied", name), "success");
  }

  function renderProfiles() {
    if (!profileListEl) return;
    profileListEl.replaceChildren();
    const names = Object.keys(profiles)
      .sort((a, b) => (profiles[b].savedAt || 0) - (profiles[a].savedAt || 0));
    profileListEl.classList.toggle("visible", names.length > 0);

    for (const name of names) {
      const p = profiles[name];
      const li = document.createElement("li");
      li.className = "profile-item";

      const info = document.createElement("div");
      info.className = "profile-info";
      const nameEl = document.createElement("span");
      nameEl.className = "profile-item-name";
      nameEl.textContent = name;
      const metaEl = document.createElement("span");
      metaEl.className = "profile-item-meta";
      const enabled = Object.values(p.formats || {}).filter(Boolean).length;
      const when = p.savedAt ? new Date(p.savedAt).toLocaleDateString() : "";
      metaEl.textContent = `${t("optProfileMeta", String(enabled))} · ${p.options ? p.options.citation_style : ""}${when ? " · " + when : ""}`;
      info.append(nameEl, metaEl);

      const applyBtn = document.createElement("button");
      applyBtn.className = "backup-btn";
      applyBtn.type = "button";
      applyBtn.textContent = t("optApplyBtn");
      applyBtn.addEventListener("click", () => { applyProfile(name); });

      const delBtn = document.createElement("button");
      delBtn.className = "backup-btn danger";
      delBtn.type = "button";
      delBtn.textContent = t("optDeleteBtn");
      delBtn.setAttribute("aria-label", t("optDeleteProfileAria", name));
      delBtn.addEventListener("click", async () => {
        delete profiles[name];
        await persistProfiles();
        renderProfiles();
        setProfileStatus(t("optProfileDeleted", name), "success");
      });

      li.append(info, applyBtn, delBtn);
      profileListEl.appendChild(li);
    }
  }

  if (profileSaveBtn && profileNameInput) {
    profileSaveBtn.addEventListener("click", async () => {
      const name = profileNameInput.value.trim().slice(0, GEP.settings.MAX_PROFILE_NAME);
      if (!name) {
        setProfileStatus(t("optProfileNameFirst"), "error");
        profileNameInput.focus();
        return;
      }
      const isNew = !(name in profiles);
      if (isNew && Object.keys(profiles).length >= GEP.settings.MAX_PROFILES) {
        setProfileStatus(t("optProfileLimit", String(GEP.settings.MAX_PROFILES)), "error");
        return;
      }
      profiles[name] = currentSnapshot();
      try {
        await persistProfiles();
      } catch (e) {
        delete profiles[name];
        setProfileStatus(t("optProfileSaveFailed", e && e.message ? e.message : String(e)), "error");
        return;
      }
      profileNameInput.value = "";
      renderProfiles();
      setProfileStatus(t(isNew ? "optProfileSaved" : "optProfileUpdated", name), "success");
    });
    profileNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") profileSaveBtn.click();
    });
  }

  // Keep the list fresh when profiles change in another context (a second
  // Options window; our own writes just re-render idempotently).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.profiles) return;
    const next = GEP.settings.sanitizeProfiles(changes.profiles.newValue);
    for (const key of Object.keys(profiles)) delete profiles[key];
    Object.assign(profiles, next);
    renderProfiles();
  });

  renderProfiles();
}
