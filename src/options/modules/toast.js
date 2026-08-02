/**
 * Page-level toast for action feedback.
 *
 * Card actions (save profile, clear backups, run diagnostics…) used to write
 * their result into an inline status line at the bottom of their own card,
 * which was easy to miss and looked unfinished next to the fixed "Saved"
 * badge. All transient feedback now surfaces in a single toast in the
 * bottom-right corner; the badge keeps the bottom-center spot, so the two
 * never overlap. Persistent state descriptions (the override summary, the
 * quality findings list) are not notifications and stay inline in their card.
 *
 * One toast instance that updates in place: a pending message ("Looking for
 * a Gemini tab…") is replaced by the success/error that follows it, exactly
 * like the old per-card status line behaved.
 */

const ICON_PATHS = {
  success: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z",
  error: "M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z",
};

/** Auto-hide delays; a pending toast (type "") stays until replaced. */
const HIDE_MS = { success: 3200, error: 6000 };

let host = null;
let hideTimer = null;

function ensureHost() {
  if (host && host.isConnected) return host;
  host = document.createElement("div");
  host.id = "pageToast";
  host.className = "page-toast";
  // Dismiss on click — errors otherwise linger for 6 s.
  host.addEventListener("click", () => hide());
  document.body.appendChild(host);
  return host;
}

function hide() {
  clearTimeout(hideTimer);
  hideTimer = null;
  if (host) host.classList.remove("visible");
}

function buildIcon(type) {
  if (!type) {
    // Pending: a CSS spinner, so the user sees the action is still running.
    const spin = document.createElement("span");
    spin.className = "page-toast-spinner";
    spin.setAttribute("aria-hidden", "true");
    return spin;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", ICON_PATHS[type]);
  svg.appendChild(p);
  const wrap = document.createElement("span");
  wrap.className = "page-toast-icon";
  wrap.appendChild(svg);
  return wrap;
}

/**
 * Shows (or updates) the page toast.
 * @param {string} msg  Already-localized text.
 * @param {"success"|"error"|""} [type]  "" = pending, sticks until replaced.
 */
export function notify(msg, type) {
  const el = ensureHost();
  el.className = "page-toast visible " + (type || "pending");
  // Errors should interrupt the screen reader; routine results should not.
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.replaceChildren(buildIcon(type || ""));

  const text = document.createElement("span");
  text.className = "page-toast-msg";
  text.textContent = msg;
  el.appendChild(text);

  clearTimeout(hideTimer);
  hideTimer = null;
  if (type && HIDE_MS[type]) hideTimer = setTimeout(hide, HIDE_MS[type]);
}
