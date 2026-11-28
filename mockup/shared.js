// Throwaway mockup chrome: theme, window size and Ctrl/⌘ toggles, plus the fake top bar.
// Each page puts its welcome view in <template id="welcome"> and calls nothing: this runs on load.
const ICONS = {
  actions:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3M12 15h5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M8 3h8l-1 6 3 4H6l3-4z"/></svg>',
  min: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>',
  keyboard:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>',
}
const LOGO =
  '<svg class="logo" viewBox="0 0 512 512"><rect width="512" height="512" rx="104" fill="var(--foreground)"/><path d="M222 140 H322 M322 140 V288 Q322 380 232 380 Q172 380 150 330" fill="none" stroke="var(--background)" stroke-width="68" stroke-linecap="round" stroke-linejoin="round"/></svg>'

const state = { dark: false, small: false, apple: false }
try {
  Object.assign(state, JSON.parse(localStorage.getItem("jot-mockup") || "{}"))
} catch {}

// "Mod+Shift+P" -> keycaps
function keys(spec) {
  const map = state.apple ? { Mod: "⌘", Alt: "⌥", Shift: "⇧" } : { Mod: "Ctrl" }
  return (
    '<span class="keys">' +
    spec
      .split("+")
      .map((k) => `<kbd>${map[k] ?? k}</kbd>`)
      .join("") +
    "</span>"
  )
}

function render() {
  document.documentElement.classList.toggle("dark", state.dark)
  try {
    localStorage.setItem("jot-mockup", JSON.stringify(state))
  } catch {}
  const html = document
    .getElementById("welcome")
    .innerHTML.replace(/\{\{keys:([^}]+)\}\}/g, (_, s) => keys(s))
    .replace(/\{\{icon:(\w+)\}\}/g, (_, n) => ICONS[n])
    .replace(/\{\{logo\}\}/g, LOGO)
  // Phone pages (<body data-device="phone">): a 390×780 phone with the phone top bar
  // (framed New note on the left, ⋮ on the right, the title between), no window toggles.
  const phone = document.body.dataset.device === "phone"
  const controls = `
    <div class="controls">
      <a href="index.html">← all versions</a>
      <strong>${document.title}</strong>
      <span class="spacer"></span>
      <button data-k="dark" aria-pressed="${state.dark}">Dark</button>
      ${
        phone
          ? ""
          : `<button data-k="small" aria-pressed="${state.small}">Desktop window 380px</button>
      <button data-k="apple" aria-pressed="${state.apple}">⌘ keys</button>`
      }
    </div>`
  document.getElementById("root").innerHTML = phone
    ? `${controls}
    <div class="stage">
      <div class="app phone">
        <div class="phone-status"><span>9:41</span><span>●●● ▮</span></div>
        <div class="topbar">
          <div class="frame"><span class="ib big">${ICONS.plus}</span></div>
          <div class="frame" style="margin-left:auto"><span class="ib big">${ICONS.more}</span></div>
        </div>
        <div class="body">${html}</div>
        <div class="home-bar"></div>
      </div>
    </div>`
    : `${controls}
    <div class="stage">
      <div class="app ${state.small ? "small" : ""}">
        <div class="topbar">
          <div class="frame">
            <span class="ib" title="Actions">${ICONS.actions}</span>
            <span class="ib" title="New note">${ICONS.plus}</span>
            <span class="ib" title="Search notes">${ICONS.search}</span>
          </div>
          <div class="toolbar-slot">formatting toolbar (web)</div>
          <div class="winbtns"><span class="ib">${ICONS.min}</span><span class="ib">${ICONS.close}</span></div>
        </div>
        <div class="body">${html}</div>
      </div>
    </div>`
  document.querySelectorAll("[data-k]").forEach((b) =>
    b.addEventListener("click", () => {
      state[b.dataset.k] = !state[b.dataset.k]
      render()
    }),
  )
}
document.addEventListener("DOMContentLoaded", render)
