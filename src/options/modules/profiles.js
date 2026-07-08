/**
 * Export profiles card (#12): save the current setup (formats + options +
 * overrides) under a name and switch between setups in one click. Profiles
 * live in chrome.storage.sync (validated via GEP.settings.sanitizeProfiles).
 */

export async function initProfiles(ctx) {
  const { DEFAULTS: FORMAT_DEFAULTS, sanitizeOverrides } = GEP.settings;

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
    setProfileStatus(`Profile "${name}" applied.`, "success");
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
      metaEl.textContent = `${enabled} formats · ${p.options ? p.options.citation_style : ""}${when ? " · " + when : ""}`;
      info.append(nameEl, metaEl);

      const applyBtn = document.createElement("button");
      applyBtn.className = "backup-btn";
      applyBtn.type = "button";
      applyBtn.textContent = "Apply";
      applyBtn.addEventListener("click", () => { applyProfile(name); });

      const delBtn = document.createElement("button");
      delBtn.className = "backup-btn danger";
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.setAttribute("aria-label", `Delete profile ${name}`);
      delBtn.addEventListener("click", async () => {
        delete profiles[name];
        await persistProfiles();
        renderProfiles();
        setProfileStatus(`Profile "${name}" deleted.`, "success");
      });

      li.append(info, applyBtn, delBtn);
      profileListEl.appendChild(li);
    }
  }

  if (profileSaveBtn && profileNameInput) {
    profileSaveBtn.addEventListener("click", async () => {
      const name = profileNameInput.value.trim().slice(0, GEP.settings.MAX_PROFILE_NAME);
      if (!name) {
        setProfileStatus("Give the profile a name first.", "error");
        profileNameInput.focus();
        return;
      }
      const isNew = !(name in profiles);
      if (isNew && Object.keys(profiles).length >= GEP.settings.MAX_PROFILES) {
        setProfileStatus(`Profile limit reached (${GEP.settings.MAX_PROFILES}). Delete one first.`, "error");
        return;
      }
      profiles[name] = currentSnapshot();
      try {
        await persistProfiles();
      } catch (e) {
        delete profiles[name];
        setProfileStatus("Could not save profile: " + (e && e.message ? e.message : String(e)), "error");
        return;
      }
      profileNameInput.value = "";
      renderProfiles();
      setProfileStatus(`Profile "${name}" ${isNew ? "saved" : "updated"}.`, "success");
    });
    profileNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") profileSaveBtn.click();
    });
  }

  renderProfiles();
}
