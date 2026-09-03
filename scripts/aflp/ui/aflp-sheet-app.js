// ===============================
// AFLP Self-Contained Sheet (aflp-sheet-app.js)
// ===============================
// A standalone ApplicationV2 window that renders the AFLP panel, opened by a
// heart button injected into any actor sheet's window header. This replaces the
// old in-sheet tab (sheet-tab.js _inject), which mounted into PF2e-specific nav
// DOM and could not work on D&D 5e or Daggerheart sheets.
//
// The panel CONTENT is reused verbatim from AFLP.UI.SheetTab (_buildPanel, _css,
// _activateListeners, _refreshPanel, _save) - those are system-agnostic, reading
// only AFLP flags and AFLP APIs. Only the mount differs: a window-header button
// (core ApplicationV2 chrome, identical across every system) opening this popout.
// ===============================

(() => {
  window.AFLP = window.AFLP || {};
  AFLP.UI = AFLP.UI || {};
  if (AFLP.UI.SheetApp) return;

  const { ApplicationV2 } = foundry.applications.api;

  class AFLPSheetApp extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      classes: ["aflp-sheet-app"],
      tag: "div",
      window: {
        title: "AFLP",
        icon: "fa-solid fa-heart",
        resizable: true,
        minimizable: true,
      },
      // Widened from 560 so the Size Training rows (icon + label + 6 pips)
      // never clip at default size. Height is auto: with the ABCD pane split,
      // each pane is short, so a fixed tall window left dead space - auto fits
      // the window to the active pane's content (still user-resizable).
      // 600 leaves about 582 of usable panel. The widest row - a 50px tier icon,
      // a 92px label and eight pips - needs roughly 436, so this has room for the
      // pregnancy table and the longer readouts without the user resizing.
      position: { width: 660, height: "auto" },
    };

    // One open window per actor.
    static _open = new Map();

    constructor(actor, options = {}) {
      super(options);
      this.actor = actor;
      this._aflpEditMode = false;
      this._aflpContent = null;
    }

    get title() {
      return `AFLP \u2014 ${this.actor?.name ?? ""}`;
    }

    // Build inner HTML from the shared panel builder + scoped CSS.
    async _renderHTML(_context, _options) {
      const panel = await AFLP.UI.SheetTab._buildPanel(this.actor, this._aflpEditMode);
      const css = AFLP.UI.SheetTab._css();
      // NOTE: do NOT give the wrapper Foundry's "tab" class - core CSS hides
      // every .tab that is not the active member of a tab group, and a
      // standalone window has no group to activate it. The window content takes
      // River's dark violet ground (shared token) so the popout matches the H
      // Scene cards; the panel paints the same ground, this guards any gap.
      return `<style>${css}</style>`
        + `<style>.aflp-sheet-app .window-content{overflow:auto;padding:8px;`
        + `background:var(--aflr-ground,#0f0b14) !important;color:var(--aflr-text,#e8dcfb);}</style>`
        + `<div class="aflp-popout"><div class="aflp-tab" data-tab="aflp">${panel}</div></div>`;
    }

    _replaceHTML(result, content, _options) {
      content.innerHTML = result;
      this._aflpContent = content;
      // `this` stands in for the old `sheet` arg (used only to stash _aflpEditMode).
      AFLP.UI.SheetTab._activateListeners(content, this.actor, this);
    }

    // In-place refresh (used by external actor updates). Internal panel actions
    // already refresh themselves via SheetTab._refreshPanel.
    refresh() {
      if (!this._aflpContent) return;
      AFLP.UI.SheetTab._refreshPanel(this._aflpContent, this.actor, this._aflpEditMode);
    }

    _onClose(options) {
      super._onClose(options);
      if (this.actor?.id) AFLPSheetApp._open.delete(this.actor.id);
      setTimeout(() => { try { AFLP.UI?.Toolbar?.sync?.(); } catch (e) {} }, 50);
    }

    // Open (or focus) the AFLP sheet for an actor.
    static async open(actor) {
      if (!actor) return null;
      let app = AFLPSheetApp._open.get(actor.id);
      if (!app) {
        app = new AFLPSheetApp(actor, { id: `aflp-sheet-${actor.id}` });
        AFLPSheetApp._open.set(actor.id, app);
        if (!actor.pack) {
          try { await AFLP.ensureCoreFlags(actor); } catch (e) { /* compendium / read-only */ }
        }
      }
      app.render(true);
      setTimeout(() => { try { AFLP.UI?.Toolbar?.sync?.(); } catch (e) {} }, 50);
      return app;
    }

    // Is this actor's AFLR sheet currently open? Used by the floating toolbar.
    static isOpenFor(actorId) {
      const a = AFLPSheetApp._open.get(actorId);
      return !!(a && a.rendered);
    }
    // Close this actor's AFLR sheet if open.
    static closeFor(actorId) {
      const a = AFLPSheetApp._open.get(actorId);
      if (a) a.close();
    }

    // Inject the opener button into actor sheet headers, and refresh open AFLP
    // windows when their actor changes.
    static register() {
      const injectButton = (app, html) => {
        try {
          const actor = app?.actor;
          if (!actor) return;
          if (actor.sheet !== app) return;            // only the actor's own sheet
          if (app instanceof AFLPSheetApp) return;     // not our own window
          if (!actor.isOwner && !game.user?.isGM) return;

          // UNWRAP jQUERY. A V1 sheet hands `html` as a jQuery object and exposes
          // `app.element` as one too, and jQuery has no querySelector - so the
          // optional call below returned undefined, `header` was undefined, and
          // this function returned having done nothing. That is why the button
          // appeared on Daggerheart (ApplicationV2, real elements) and never on
          // Pathfinder, even after the PF2e hooks were added to the list below.
          // Measured 11 Aug 2026: CharacterSheetPF2e is V1 and its element is
          // jQuery.
          const raw  = (html instanceof HTMLElement) ? html : (html?.[0] ?? app.element);
          const root = (raw instanceof HTMLElement) ? raw : (raw?.[0] ?? null);
          const header = root?.querySelector?.(".window-header");
          if (!header || header.querySelector(".aflp-open-btn")) return;

          // Match the header's own furniture. V1 headers are <a class="header-button
          // control"> and V2 headers are <button class="header-control icon">; a
          // V2-shaped button dropped into a V1 header is unstyled and sits wrong.
          const isV1Header = !!header.querySelector("a.header-button");
          const btn = document.createElement(isV1Header ? "a" : "button");
          if (!isV1Header) btn.type = "button";
          btn.className = isV1Header
            ? "header-button control aflp-open-btn"
            : "header-control icon aflp-open-btn";
          // Same glyph as the floating toolbar's AFLR sheet button - one icon,
          // one meaning. It used to be a heart, which is the H-Scene button.
          btn.innerHTML = `<i class="fa-solid fa-clipboard-list"></i>`;
          btn.dataset.tooltip = "AFLR sheet";
          btn.title = "AFLR sheet";
          btn.setAttribute("aria-label", "AFLR sheet");
          btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            AFLPSheetApp.open(actor.getWorldActor?.() ?? actor);
          });

          // AppV2 marks close with data-action; V1 sheets use a .close anchor.
          const closeBtn = header.querySelector("[data-action='close'], a.close, .header-button.close");
          if (closeBtn) header.insertBefore(btn, closeBtn);
          else header.appendChild(btn);
        } catch (e) {
          console.warn("AFLP | sheet-opener button mount failed:", e);
        }
      };

      // PF2e actor sheets do not all emit renderApplicationV2, which is why this
      // button existed on Daggerheart sheets and not Pathfinder ones. Mirror the
      // sheet tab's hook set: named PF2e sheets, the AppV2 catch-all, and the V1
      // fallbacks. injectButton is idempotent - it bails if the button is already
      // in the header - so overlapping hooks are harmless.
      for (const hookName of [
        "renderCharacterSheetPF2e",
        "renderNPCSheetPF2e",
        "renderHazardSheetPF2e",
        "renderVehicleSheetPF2e",
        "renderFamiliarSheetPF2e",
      ]) {
        Hooks.on(hookName, (app, html) => injectButton(app, html));
      }
      Hooks.on("renderApplicationV2", (app, html, data) => injectButton(app, html));
      Hooks.on("renderApplication",   (app, html, data) => injectButton(app, html));
      Hooks.on("renderActorSheet",    (app, html, data) => injectButton(app, html));

      // Keep an open AFLP window in sync when its actor changes externally.
      Hooks.on("updateActor", (actor) => {
        const app = AFLPSheetApp._open.get(actor?.id);
        if (!app?.rendered) return;
        // While the panel is in EDIT mode, never auto-rebuild. Two reasons:
        // (1) it would wipe the user's unsaved checkbox edits, and (2) the Save
        // handler writes each flag with a separate awaited setFlag, and every
        // setFlag fires updateActor - rebuilding the DOM between those writes
        // resets the very checkboxes the handler is still reading, so only the
        // first-written field survives. The Save/Cancel handlers do their own
        // explicit refresh when they finish, so display mode stays current.
        if (app._aflpContent?.querySelector(".aflp-panel.aflp-edit-mode")) return;
        app.refresh();
      });

      // Items change derived numbers - Bonus Loads, Cum Shot, tits size, anatomy
      // grants - but updateActor does not fire when an item is added or removed,
      // so the panel showed stale values until the user reopened it. Dragging the
      // Loads effect on lit the status panel and left the sheet's number behind.
      const _itemRefresh = (item) => {
        const actor = item?.parent;
        if (!actor?.id) return;
        const app = AFLPSheetApp._open.get(actor.id);
        if (!app?.rendered) return;
        if (app._aflpContent?.querySelector(".aflp-panel.aflp-edit-mode")) return;
        app.refresh();
      };
      Hooks.on("createItem", _itemRefresh);
      Hooks.on("deleteItem", _itemRefresh);
      // A badge edit (Loads 1 -> Loads 3) is an item UPDATE, not a create.
      Hooks.on("updateItem", _itemRefresh);
    }
  }

  AFLP.UI.SheetApp = AFLPSheetApp;
})();
