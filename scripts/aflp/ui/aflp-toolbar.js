// =============================================================================
// AFLR Toolbar - a small floating button bar (or, optionally, buttons in the
// Foundry left scene-controls sidebar) that toggles the AFLR windows.
//
// Default is a draggable bar that hovers above the UI with two buttons: one
// minimises/restores the H-Scene window, one toggles the AFLR sheet for the
// user's character (or selected token). The bar is the persistent anchor, so
// the sheet can stay on screen with no scene active, and it is built to take
// more buttons later. The "toolbarMode" setting switches it to a sidebar tool.
// No top-level import/export (loaded via dynamic import like the other UI).
// =============================================================================
(function () {
  window.AFLP = window.AFLP || {};
  AFLP.UI = AFLP.UI || {};

  const BAR_ID   = "aflp-toolbar";
  const STYLE_ID = "aflp-toolbar-style";
  let _bar = null;
  let _lastSheetActorId = null;

  function _mode() { return AFLP.Settings?.toolbarMode ?? "floating"; }

  // --- Targets ---------------------------------------------------------------
  function _resolveSheetActor() {
    const u = game.user;
    if (u?.character) return u.character;
    const tok = canvas?.tokens?.controlled?.[0];
    if (tok?.actor) return tok.actor;
    if (_lastSheetActorId) { const a = game.actors?.get(_lastSheetActorId); if (a) return a; }
    return null;
  }
  function _sheetOpenFor(id) {
    const SA = AFLP.UI.SheetApp;
    return !!(SA && SA.isOpenFor && SA.isOpenFor(id));
  }

  // --- Actions ---------------------------------------------------------------
  function toggleHScene() {
    try { AFLP.HScene?.toggleWindow?.(); } catch (e) { console.warn("AFLP | toggleHScene:", e); }
    sync();
  }
  function toggleSheet() {
    const SA = AFLP.UI.SheetApp;
    if (!SA) return;
    const actor = _resolveSheetActor();
    if (!actor) { ui.notifications?.info("AFLR: select a token or assign a character to open a sheet."); return; }
    if (_sheetOpenFor(actor.id)) { SA.closeFor?.(actor.id); }
    else { _lastSheetActorId = actor.id; SA.open(actor); }
    setTimeout(sync, 50);
  }

  // --- Floating bar ----------------------------------------------------------
  function _injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = `
      #${BAR_ID} {
        position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
        z-index: 95; display: flex; align-items: center; gap: 4px;
        padding: 4px 6px; pointer-events: auto;
        background: var(--aflr-header-bg, #1c1228);
        border: 1px solid var(--aflr-border-gold, rgba(244,183,76,0.35));
        border-radius: 8px; box-shadow: var(--aflr-shadow, 0 6px 28px rgba(0,0,0,0.55));
        font-family: var(--aflr-serif, serif);
      }
      #${BAR_ID} .aflp-tb-handle { cursor: grab; color: var(--aflr-text-dim, #8f7fb0); font-size: 12px; padding: 0 3px; user-select: none; line-height: 1; }
      #${BAR_ID} .aflp-tb-btn {
        width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
        background: var(--aflr-panel-2, rgba(160,139,216,0.11));
        border: 1px solid var(--aflr-border, rgba(160,139,216,0.25));
        border-radius: 6px; color: var(--aflr-text-muted, #bfaad3); cursor: pointer; font-size: 14px;
      }
      #${BAR_ID} .aflp-tb-btn:hover { color: var(--aflr-lavender, #dcc1f8); border-color: var(--aflr-border-gold, rgba(244,183,76,0.35)); }
      #${BAR_ID} .aflp-tb-btn.active {
        background: rgba(244,183,76,0.18); color: var(--aflr-gold, #f4b74c);
        border-color: var(--aflr-border-gold, rgba(244,183,76,0.35));
      }
    `;
    document.head.appendChild(el);
  }

  function _makeDraggable(el, handle) {
    let dragging = false, sx = 0, sy = 0, ol = 0, ot = 0;
    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      dragging = true; handle.style.cursor = "grabbing";
      const r = el.getBoundingClientRect();
      el.style.transform = "none"; el.style.left = r.left + "px"; el.style.top = r.top + "px";
      sx = e.clientX; sy = e.clientY; ol = r.left; ot = r.top; e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      el.style.left = Math.max(0, ol + (e.clientX - sx)) + "px";
      el.style.top  = Math.max(0, ot + (e.clientY - sy)) + "px";
    });
    document.addEventListener("mouseup", () => { if (dragging) { dragging = false; handle.style.cursor = "grab"; } });
  }

  function _ensureBar() {
    if (_bar && document.body.contains(_bar)) return _bar;
    _injectStyle();
    _bar = document.createElement("div");
    _bar.id = BAR_ID;
    _bar.innerHTML =
      `<span class="aflp-tb-handle" title="Drag">\u22EE\u22EE</span>`
      + `<button type="button" class="aflp-tb-btn" data-tb="hscene" title="H-Scene window"><i class="fa-solid fa-heart"></i></button>`
      + `<button type="button" class="aflp-tb-btn" data-tb="sheet" title="AFLR sheet"><i class="fa-solid fa-clipboard-list"></i></button>`;
    document.body.appendChild(_bar);
    _bar.querySelector('[data-tb="hscene"]').addEventListener("click", toggleHScene);
    _bar.querySelector('[data-tb="sheet"]').addEventListener("click", toggleSheet);
    _makeDraggable(_bar, _bar.querySelector(".aflp-tb-handle"));
    return _bar;
  }
  function _removeBar() { if (_bar) { _bar.remove(); _bar = null; } }

  // --- Active-state sync -----------------------------------------------------
  function sync() {
    if (_bar) {
      const hs = _bar.querySelector('[data-tb="hscene"]');
      const sh = _bar.querySelector('[data-tb="sheet"]');
      hs?.classList.toggle("active", !!AFLP.HScene?.windowOpen?.());
      const a = _resolveSheetActor();
      sh?.classList.toggle("active", !!(a && _sheetOpenFor(a.id)));
    }
    if (_mode() === "sidebar") _syncSidebarActive();
  }

  // --- Sidebar mode (Foundry scene controls) ---------------------------------
  // In v13+ ui.controls.controls is an object keyed by group name; each group
  // carries an object of tools. The getSceneControlButtons hook fires when
  // Foundry (re)builds controls (page load, scene change). On a live setting
  // toggle that hook does NOT re-fire, so refresh() also injects the group
  // imperatively into the live controls object and re-renders.
  function _groupDef() {
    const tools = {
      hscene: { name: "hscene", order: 1, title: "H-Scene window", icon: "fa-solid fa-heart",
                button: true, active: !!AFLP.HScene?.windowOpen?.(), onChange: () => toggleHScene() },
      sheet:  { name: "sheet", order: 2, title: "AFLR sheet", icon: "fa-solid fa-clipboard-list",
                button: true, onChange: () => toggleSheet() },
    };
    return { name: "aflr", order: 99, title: "AFLR", icon: "fa-solid fa-heart",
             onChange: () => {}, onToolChange: () => {}, tools, activeTool: "hscene", active: false };
  }

  Hooks.on("getSceneControlButtons", (controls) => {
    if (_mode() !== "sidebar") return;
    try {
      const g = _groupDef();
      if (Array.isArray(controls)) controls.push({ ...g, tools: Object.values(g.tools) }); // legacy array form
      else controls.aflr = g;
    } catch (e) { console.warn("AFLP | scene-control inject failed:", e); }
  });

  // Ensure the group exists in the live controls object. Returns true if it had
  // to add it (caller should re-render).
  function _ensureSidebarGroup() {
    const C = ui.controls;
    if (!C || !C.controls || Array.isArray(C.controls)) return false;
    if (!C.controls.aflr) { C.controls.aflr = _groupDef(); return true; }
    return false;
  }

  function _syncSidebarActive() {
    const root = document.getElementById("scene-controls") || document.querySelector("#scene-controls, .scene-control");
    if (!root) return;
    const hs = root.querySelector('[data-control="aflr"] [data-tool="hscene"]');
    hs?.classList.toggle("active", !!AFLP.HScene?.windowOpen?.());
  }

  function refresh() {
    if (_mode() === "floating") {
      _ensureBar();
      // Drop any sidebar group left over from a previous sidebar session so the
      // toggle is clean both ways (Foundry would otherwise keep it until a rebuild).
      try {
        const C = ui.controls;
        if (C && C.controls && !Array.isArray(C.controls) && C.controls.aflr) {
          delete C.controls.aflr;
          if (C.control?.name === "aflr") C.activate({ control: "tokens" });
          else C.render();
        }
      } catch (e) { /* ignore */ }
    } else {
      _removeBar();
      _ensureSidebarGroup();
      try { ui.controls?.render?.(); } catch (e) { /* ignore */ }
    }
    sync();
  }

  function register() {
    refresh();
    // Keep button states current as windows/sheets and token selection change.
    Hooks.on("controlToken", () => sync());
    Hooks.on("renderApplicationV2", () => setTimeout(sync, 30));
    Hooks.on("closeApplicationV2", () => setTimeout(sync, 30));
    // Re-ensure + re-sync the sidebar group whenever scene controls render
    // (covers Foundry rebuilds that drop the imperatively-added group).
    Hooks.on("renderSceneControls", () => {
      if (_mode() !== "sidebar") return;
      if (_ensureSidebarGroup()) { try { ui.controls.render(); } catch (e) {} return; }
      setTimeout(_syncSidebarActive, 20);
    });
  }

  AFLP.UI.Toolbar = { register, refresh, sync, toggleHScene, toggleSheet };
})();
