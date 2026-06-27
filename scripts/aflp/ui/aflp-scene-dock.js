// =============================================================================
// AFLR Scene Dock - the character sheet, docked as a sidebar beside the H-Scene.
//
// Clicking a portrait in a scene opens that actor's AFLR sheet flush against the
// H-Scene container, so the sheet is reachable from the scene as well as the
// header button. It reuses the SAME panel the popout sheet uses (SheetTab's
// _buildPanel / _activateListeners / _refreshPanel), so it is identical in look
// and behaviour and inherits the shared design tokens automatically.
//
// One dock at a time: clicking a different portrait swaps it to that actor. It
// tracks the scene container as it is dragged, flips to the other side if there
// is no room, and closes on its own button. No top-level import/export.
// =============================================================================
(function () {
  window.AFLP = window.AFLP || {};
  AFLP.UI = AFLP.UI || {};

  const DOCK_ID  = "aflp-scene-dock";
  const STYLE_ID = "aflp-scene-dock-style";
  let _dock = null;     // dock root element
  let _content = null;  // the .window-content root we activate listeners on
  let _actor = null;    // currently shown actor (object reference, not id-fetched)
  let _editMode = false;

  function _hsContainer() { return document.getElementById("aflp-hscene-container"); }

  function _injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = `
      #${DOCK_ID} {
        position: fixed; z-index: 99; width: 340px; max-height: 580px;
        overflow: auto; pointer-events: auto;
        background: var(--aflr-ground, #0f0b14);
        border: 1px solid var(--aflr-border-gold, rgba(244,183,76,0.35));
        border-radius: var(--aflr-radius, 6px);
        box-shadow: var(--aflr-shadow, 0 6px 28px rgba(0,0,0,0.55));
        display: none;
      }
      #${DOCK_ID} .aflp-scene-dock-bar {
        position: sticky; top: 0; z-index: 2;
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 6px 10px;
        background: var(--aflr-header-bg, #1c1228);
        border-bottom: 1px solid var(--aflr-border, rgba(160,139,216,0.25));
        font-family: var(--aflr-serif, serif);
      }
      #${DOCK_ID} .aflp-scene-dock-title {
        color: var(--aflr-gold, #f4b74c); font-size: 12px; font-weight: 500;
        letter-spacing: 0.4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      #${DOCK_ID} .aflp-scene-dock-close {
        color: #b06a6a; font-size: 13px; cursor: pointer; flex-shrink: 0;
        line-height: 1; padding: 2px 4px; border-radius: 3px;
      }
      #${DOCK_ID} .aflp-scene-dock-close:hover { color: #ff8a8a; background: rgba(176,106,106,0.15); }
      #${DOCK_ID} .window-content { padding: 8px; }
    `;
    document.head.appendChild(el);
  }

  function _ensureDock() {
    if (_dock && document.body.contains(_dock)) return _dock;
    _injectStyle();
    _dock = document.createElement("div");
    _dock.id = DOCK_ID;
    document.body.appendChild(_dock);
    return _dock;
  }

  function reposition() {
    const c = _hsContainer();
    if (!_dock || !c || _dock.style.display === "none") return;
    const r = c.getBoundingClientRect();
    const dockW = _dock.offsetWidth || 340;
    const gap = 8;
    let left = r.right + gap;
    if (left + dockW > window.innerWidth - 4) {
      const flipped = r.left - gap - dockW;       // try the other side
      left = flipped >= 4 ? flipped : Math.max(4, window.innerWidth - dockW - 4);
    }
    _dock.style.left = Math.round(left) + "px";
    _dock.style.top  = Math.round(Math.max(4, r.top)) + "px";
    _dock.style.maxHeight = Math.max(160, Math.min(580, window.innerHeight - r.top - 12)) + "px";
  }

  // Resolve token-first so unlinked tokens use their own synthetic actor (live
  // per-token state) rather than the shared world template.
  function _resolveActorByToken(tokenId) {
    try {
      const tok = canvas?.tokens?.get(tokenId);
      if (tok?.actor) return tok.actor;
    } catch (e) { /* ignore */ }
    return null;
  }

  async function open(actor) {
    if (!actor) return null;
    _ensureDock();
    _actor = actor;
    _dock._aflpActorId = actor.id;
    if (!actor.pack) { try { await AFLP.ensureCoreFlags(actor); } catch (e) { /* read-only */ } }

    const panel = await AFLP.UI.SheetTab._buildPanel(actor, _editMode);
    const css   = AFLP.UI.SheetTab._css();
    _dock.innerHTML =
      `<style>${css}</style>`
      + `<div class="aflp-scene-dock-bar">`
      +   `<span class="aflp-scene-dock-title"></span>`
      +   `<span class="aflp-scene-dock-close" title="Close">\u2715</span>`
      + `</div>`
      + `<div class="window-content"><div class="aflp-popout"><div class="aflp-tab" data-tab="aflp">${panel}</div></div></div>`;

    // Name via textContent (no markup injection).
    const titleEl = _dock.querySelector(".aflp-scene-dock-title");
    if (titleEl) titleEl.textContent = actor.name ?? "";

    _content = _dock.querySelector(".window-content");
    try { AFLP.UI.SheetTab._activateListeners(_content, actor, null); }
    catch (e) { console.warn("AFLP | scene-dock activateListeners failed:", e); }

    _dock.querySelector(".aflp-scene-dock-close")?.addEventListener("click", close);
    _dock.style.display = "block";
    reposition();
    return _dock;
  }

  function openByTokenId(tokenId) {
    // Toggle: re-clicking the portrait whose sheet is already docked closes it,
    // same as the X. A different portrait swaps the dock to that actor.
    if (isOpen() && _dock && _dock._aflpTokenId === tokenId) { close(); return; }
    const actor = _resolveActorByToken(tokenId);
    if (!actor) return;
    open(actor);
    if (_dock) _dock._aflpTokenId = tokenId;
  }

  function refresh() {
    if (!_dock || _dock.style.display === "none" || !_actor || !_content) return;
    try { AFLP.UI.SheetTab._refreshPanel(_content, _actor, _editMode); }
    catch (e) { console.warn("AFLP | scene-dock refresh failed:", e); }
  }

  function close() {
    if (!_dock) return;
    _dock.style.display = "none";
    _dock.innerHTML = "";
    _dock._aflpActorId = null;
    _dock._aflpTokenId = null;
    _actor = null;
    _content = null;
  }

  function isOpen() { return !!(_dock && _dock.style.display !== "none"); }

  // Keep the docked sheet in sync when its actor changes externally.
  if (typeof Hooks !== "undefined") {
    Hooks.on("updateActor", (a) => { if (a?.id && _dock?._aflpActorId === a.id) refresh(); });
    Hooks.on("updateToken", () => { if (isOpen()) refresh(); });
  }
  if (typeof window !== "undefined") {
    window.addEventListener("resize", () => { if (isOpen()) reposition(); });
  }

  AFLP.UI.SceneDock = { open, openByTokenId, close, refresh, reposition, isOpen };
})();
