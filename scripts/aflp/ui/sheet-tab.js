// ===============================
// AFLP Sheet Tab (sheet-tab.js)
// ===============================
// Injects an AFLP tab into all PF2e actor sheets.
// Visible to: GM + actor owner.
// Edit mode toggled via button — replaces display spans with inputs.

if (!window.AFLP.UI) window.AFLP.UI = {};

// Per-actor tracking of whether AFLP tab was active, keyed by actor.uuid
const _aflpTabWasActive = new Map();
// Staged pregnancy additions survive panel rebuilds by living here rather than on the DOM node
const _aflpPregAdditions = new Map(); // actorId → Array of newPreg objects
// Active AFLP sub-tab per actor, so it persists across panel rebuilds/refreshes.
const _aflpActiveSubtab = new Map(); // actorId → "body" | "drives" | "breeding" | "history"
const _aflpShowLocked = new Map();   // actorId → bool: display-view "Show Locked" titles toggle

// Compact number formatter for progress values: whole numbers plain, fractions
// to one decimal (downing-unit thresholds like 0.5 read cleanly), thousands with
// a k suffix.
const _fmtNum = (n) => {
  const v = Number(n) || 0;
  if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k";
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
};


AFLP.UI.SheetTab = {

  register() {
    // Foundry v13 + PF2e v7: actor sheets are ApplicationV2 subclasses.
    // "renderActorSheet" and "renderActorSheetPF2e" are NOT emitted for AppV2 sheets.
    // We hook explicit PF2e sheet class names as the primary path, then use
    // "renderApplication" as a catch-all for any AppV2 sheet we miss.
    const _handler = (sheet, html, data) => {
      if (!sheet.actor) return;
      // Never inject into a token config / prototype-token config (they carry an
      // .actor and share the .tabs DOM the injector targets).
      if (AFLP.UI.SheetTab._isNonSheetActorApp(sheet)) return;
      console.log("AFLP | render hook fired:", sheet.constructor.name, sheet.actor.name);
      if (!sheet.actor.isOwner && !game.user?.isGM) return;
      AFLP.UI.SheetTab._inject(sheet, html);
    };

    // Named PF2e sheet hooks -- primary coverage
    for (const hookName of [
      "renderCharacterSheetPF2e",
      "renderNPCSheetPF2e",
      "renderHazardSheetPF2e",
      "renderVehicleSheetPF2e",
      "renderFamiliarSheetPF2e",
    ]) {
      Hooks.on(hookName, _handler);
    }

    // Catch-all for AppV2 actor sheets: renderApplicationV2 fires for every
    // ApplicationV2 render in Foundry v13+/v14. We filter to actor sheets via
    // the app.actor guard; dialogs, sidebars, and item sheets have no .actor and
    // are skipped. This covers any PF2e actor sheet not in the named list above
    // (e.g. Loot/Party) plus any future sheet classes. Double-injection is
    // prevented inside _inject via the .aflp-tab-btn / _aflpInjecting guards.
    Hooks.on("renderApplicationV2", (app, html, data) => {
      if (!app.actor) return;
      if (AFLP.UI.SheetTab._isNonSheetActorApp(app)) return;
      // Only inject into the actor's OWN sheet. Other ApplicationV2 windows also
      // expose an .actor (notably TokenConfig / PrototypeTokenConfig), and those
      // were getting the AFLP tab injected over their Appearance tab. The actor's
      // real sheet satisfies actor.sheet === app; a token config does not.
      if (app.actor.sheet !== app) return;
      _handler(app, html, data);
    });

    // Legacy fallbacks for any non-AppV2 sheets (harmless no-ops under v14).
    Hooks.on("renderApplication", (app, html, data) => {
      if (!app.actor) return;
      if (AFLP.UI.SheetTab._isNonSheetActorApp(app)) return;
      if (app.actor.sheet !== app) return; // same scope guard as the AppV2 path
      _handler(app, html, data);
    });
    Hooks.on("renderActorSheet", _handler);
  },

  // True for ApplicationV2 windows that carry an .actor but are NOT the actor's
  // record sheet - notably TokenConfig / PrototypeTokenConfig (and any system
  // subclass like DhTokenConfig / TokenConfigPF2e). These share the generic
  // .tabs / .sheet-navigation DOM the injector looks for, so without this guard
  // the AFLP tab lands over the config's Appearance tab. Checked by the config's
  // own markers rather than actor.sheet identity, since some system token-config
  // subclasses do not reliably satisfy actor.sheet !== app.
  _isNonSheetActorApp(app) {
    try {
      // The config edits a Token document; a real actor sheet edits an Actor.
      if (app?.document?.documentName === "Token") return true;
      if (app?.token || app?.isPrototype) return true;
      const classes = app?.options?.classes ?? [];
      if (Array.isArray(classes) && classes.includes("token-config")) return true;
      // Walk the prototype chain for any *TokenConfig* / *TokenApplication*.
      let p = Object.getPrototypeOf(app);
      let hops = 0;
      while (p && p.constructor && hops++ < 12) {
        const n = p.constructor.name || "";
        if (/TokenConfig|TokenApplication|PlaceableConfig/.test(n)) return true;
        p = Object.getPrototypeOf(p);
      }
    } catch (_) {}
    return false;
  },

  // -----------------------------------------------
  // Inject tab nav button + panel
  // -----------------------------------------------
  async _inject(sheet, html) {
    // Normalize html to a bare HTMLElement.
    // renderApplication passes an array-like (HTMLElement[]) in some v13 builds.
    // Named hooks (renderCharacterSheetPF2e etc.) pass a bare HTMLElement.
    // sheet.element is the reliable fallback for AppV2 sheets.
    if (Array.isArray(html) || (html && typeof html[Symbol.iterator] === "function" && !(html instanceof Element))) {
      html = html[0] ?? null;
    }
    if (!html || typeof html.querySelector !== "function") {
      html = sheet.element ?? null;
    }
    if (!html || typeof html.querySelector !== "function") {
      console.error("AFLP | _inject: could not resolve html to a DOM element.",
        "Type:", typeof html, "Constructor:", html?.constructor?.name,
        "sheet.element:", sheet.element?.constructor?.name);
      return;
    }

    // Hard stop: never inject into a token/prototype config even if some path
    // reached _inject directly. The config shares the .tabs DOM the injector
    // targets, so this is the last line of defense for the Appearance-tab bug.
    if (AFLP.UI.SheetTab._isNonSheetActorApp(sheet)) return;

    // Guard against re-entrant injection BEFORE any awaits.
    // ensureCoreFlags calls setFlag which triggers a re-render, which fires the hook
    // again. Without this early guard, multiple concurrent _inject calls race and
    // all pass the later .aflp-tab-btn check since none has injected yet.
    if (html.querySelector(".aflp-tab-btn")) return;

    // Also guard on a per-sheet in-progress flag to catch the window between
    // this check and the actual DOM insertion below.
    if (sheet._aflpInjecting) return;
    sheet._aflpInjecting = true;

    console.log("AFLP | _inject: html resolved as", html.constructor.name, "tag:", html.tagName,
      "sheet:", sheet.constructor.name);

    const actor = sheet.actor?.getWorldActor?.() ?? sheet.actor;

    // Skip ensureCoreFlags for compendium actors — they are read-only and setFlag
    // would throw. AFLP compendium actors should have flags baked in already so
    // the tab can still render fine without the ensure step.
    if (!actor?.pack) {
      try {
        await AFLP.ensureCoreFlags(actor);
      } catch(e) {
        console.error("AFLP | ensureCoreFlags failed for", actor?.name, e);
        sheet._aflpInjecting = false;
        return;
      }
    }

    // v13: html is a raw HTMLElement. Use querySelector/querySelectorAll throughout.
    // PF2e v13 sheet nav selectors vary by sheet type:
    //   PC sheet:      .sheet-navigation  (or nav.tabs inside .sheet-header)
    //   NPC sheet:     .sheet-navigation  or  .tabs[data-group="primary"]
    //   Hazard/Vehicle: similar variations
    // We try multiple selectors in priority order.
    const nav = html.querySelector(".sheet-navigation")
              ?? html.querySelector("nav.tabs")
              ?? html.querySelector(".tabs[data-group='primary']")
              ?? html.querySelector(".tabs");
    if (!nav) {
      console.warn("AFLP | SheetTab._inject: no nav found on", sheet.constructor.name,
        "-- html.className:", html.className,
        "-- html preview:", html.innerHTML?.slice(0, 500));
      return;
    }
    console.log("AFLP | SheetTab._inject: injecting into", sheet.constructor.name, actor.name);

    nav.insertAdjacentHTML("beforeend", `
      <a class="item aflp-tab-btn" data-tab="aflp" title="AFLP">
        <span class="tab-label">❤</span>
      </a>
    `);
    // Injection is committed to the DOM — clear the in-progress flag.
    sheet._aflpInjecting = false;

    const body = html.querySelector(".sheet-content")
              ?? html.querySelector(".sheet-body")
              ?? html.querySelector(".tab-content")
              ?? html.querySelector(".window-content");
    if (!body) {
      console.warn("AFLP | SheetTab._inject: no body found on", sheet.constructor.name,
        "-- html preview:", html.innerHTML?.slice(0, 500));
      return;
    }

    const wasEditMode = sheet?._aflpEditMode ?? false;
    const panelHtml = await AFLP.UI.SheetTab._buildPanel(actor, wasEditMode);
    body.insertAdjacentHTML("beforeend", `
      <div class="tab aflp-tab" data-tab="aflp" data-group="primary" style="display:none;">
        ${panelHtml}
      </div>
    `);

    // PF2e PC sheets (ApplicationV2) wrap .sheet-body in a <form> whose
    // _onChangeForm handler re-renders the sheet on every input change.
    // Patch the sheet instance to ignore change events from inside our panel.
    // We do this once per sheet instance (flagged by _aflpPatched).
    // _refreshPanel passes sheet=null so the patch is only applied on first inject,
    // but the patched method stays live on the sheet object for its lifetime.
    if (sheet && !sheet._aflpPatched) {
      sheet._aflpPatched = true;
      // ApplicationV2 / Foundry v13: the method is _onChangeForm(formConfig, event)
      const proto = Object.getPrototypeOf(sheet);
      const findMethod = (obj, name) => {
        let p = obj;
        while (p && p !== Object.prototype) {
          if (Object.prototype.hasOwnProperty.call(p, name)) return p;
          p = Object.getPrototypeOf(p);
        }
        return null;
      };
      // Patch on the instance directly so only this sheet is affected
      const origChangeForm = sheet._onChangeForm?.bind(sheet);
      if (origChangeForm) {
        sheet._onChangeForm = (formConfig, event) => {
          const panel = sheet.element?.querySelector?.(".aflp-panel");
          if (panel && event?.target && panel.contains(event.target)) return;
          return origChangeForm(formConfig, event);
        };
      }
      // Also patch _onSubmitForm in case PF2e triggers that path
      const origSubmitForm = sheet._onSubmitForm?.bind(sheet);
      if (origSubmitForm) {
        sheet._onSubmitForm = (formConfig, event) => {
          const panel = sheet.element?.querySelector?.(".aflp-panel");
          if (panel && event?.target && panel.contains(event.target)) return;
          return origSubmitForm(formConfig, event);
        };
      }
    }

    // Restore AFLP tab if it was active before this re-render
    if (_aflpTabWasActive.get(actor.uuid)) {
      setTimeout(() => {
        // Hide all primary tabs WITHOUT removing .active — preserves PF2e's sub-tab state
        html.querySelectorAll(".tab:not(.aflp-tab)").forEach(el => { el.style.display = "none"; });
        html.querySelectorAll(".sheet-navigation .item, .tabs > .item").forEach(el => el.classList.remove("active"));
        html.querySelector(".aflp-tab-btn")?.classList.add("active");
        const t = html.querySelector(".aflp-tab"); if (t) { t.classList.add("active"); t.style.display = "block"; }
        AFLP.UI.SheetTab._applyPanelHeight(html);
      }, 0);
    }

    // Track tab switches — native delegated click on the sheet root
    if (!html._aflpTabListenerAttached) {
      html._aflpTabListenerAttached = true;
      html.addEventListener("click", (ev) => {
        // Cum Measure cycling is handled inside _aflpBtnHandler (the panel
        // dispatcher), NOT here. The measure button lives inside .aflp-panel and
        // the dispatcher stopPropagation()s it before it reaches this root
        // listener - a branch here would be dead code. Tab-switch buttons below
        // live OUTSIDE the panel (in the sheet nav), so those DO reach here.
        if (ev.target.closest(".aflp-tab-btn")) {
          _aflpTabWasActive.set(actor.uuid, true);
          // Hide primary tab panels using display:none only — do NOT remove .active.
          // Removing .active from sub-tab panes destroys PF2e's internal state and
          // causes blank panels when returning to Actions/Spells tabs.
          html.querySelectorAll(".tab:not(.aflp-tab)").forEach(el => { el.style.display = "none"; });
          // Remove active only from the top-level navigation items (not nested sub-tabs)
          html.querySelectorAll(".sheet-navigation .item, .tabs > .item").forEach(el => el.classList.remove("active"));
          const t = html.querySelector(".aflp-tab"); if (t) { t.classList.add("active"); t.style.display = "block"; }
          html.querySelector(".aflp-tab-btn")?.classList.add("active");
          AFLP.UI.SheetTab._applyPanelHeight(html);
        } else if (ev.target.closest(".sheet-navigation .item, .tabs .item") && !ev.target.closest(".aflp-tab-btn")) {
          _aflpTabWasActive.set(actor.uuid, false);
          const t = html.querySelector(".aflp-tab"); if (t) { t.classList.remove("active"); t.style.display = "none"; }
          html.querySelector(".aflp-tab-btn")?.classList.remove("active");
          // Restore display on all primary tabs — PF2e's own click handler will
          // activate the right one and its sub-tabs without any help from us.
          html.querySelectorAll(".tab:not(.aflp-tab)").forEach(el => { el.style.display = ""; });
        }
      });
    }

    AFLP.UI.SheetTab._activateListeners(html, actor, sheet);
  },

  // -----------------------------------------------
  // Rebuild panel content in place — no sheet re-render
  // -----------------------------------------------
  async _refreshPanel(html, actor, editMode = false) {
    // Preserve titles-mode and the voice-control open state across refreshes,
    // both held on the panel element so external updates keep the current view.
    const prev = html.querySelector(".aflp-panel");
    const titlesMode = !!prev?.dataset.aflpTitles;
    const voiceOpen  = !!prev?.classList.contains("aflp-voice-open");
    const panel = await AFLP.UI.SheetTab._buildPanel(actor, editMode, titlesMode);
    const tab = html.querySelector(".aflp-tab");
    if (tab) tab.innerHTML = panel;
    if (voiceOpen) html.querySelector(".aflp-panel")?.classList.add("aflp-voice-open");
    AFLP.UI.SheetTab._applyPanelHeight(html);
    AFLP.UI.SheetTab._activateListeners(html, actor, null);
    // Re-fit the auto-height window: edit mode stacks all panes (tall), view mode
    // shows one pane (short), so a refresh that flips mode changes height a lot.
    try {
      const appEl = html.closest?.(".application");
      const app = [...(foundry.applications.instances?.values?.() ?? [])]
        .find(a => a.constructor?.name === "AFLPSheetApp" && a.element === appEl);
      if (app?.setPosition) requestAnimationFrame(() => app.setPosition({ height: "auto" }));
    } catch (_) {}
  },

  // Ensure the sheet body can scroll when our tab is active.
  _applyPanelHeight(html) {
    setTimeout(() => {
      const sheetBody = html.querySelector(".sheet-body");
      if (!sheetBody) return;
      let el = sheetBody.parentElement;
      while (el) {
        if (el.classList.contains("window-content")) {
          el.style.setProperty("overflow-y", "auto", "important");
          break;
        }
        el = el.parentElement;
      }
    }, 0);
  },

  // -----------------------------------------------
  // Build full panel HTML
  // -----------------------------------------------
  async _buildPanel(actor, editMode = false, titlesMode = false) {
    const FLAG = AFLP.FLAG_SCOPE;

    const sexual       = structuredClone(actor.getFlag(FLAG, "sexual")     ?? AFLP.sexualDefaults);
    const cum          = actor.getFlag(FLAG, "cum")                         ?? AFLP.cumDefaults;
    const coomer       = actor.getFlag(FLAG, "coomer")                      ?? AFLP.coomerDefaults;
    const perShot      = AFLP.cumPerShot?.(actor) ?? 2;
    // The pill used to print effectiveLoads, which is CAPACITY (base + gear) and
    // never moves - so loads appeared not to spend even though the pool was
    // draining. Remaining is the cum pool: cum.current counts load-units, so
    // remaining loads = current / perShot. Clamped in case cum.max is stale
    // relative to gear that changed capacity since the last recalculateCum.
    const cumPool      = actor.getFlag(FLAG, "cum") ?? { current: 0, max: 0 };
    const loadsCap     = AFLP.effectiveLoads(actor);
    const loadsLeft    = Math.max(0, Math.min(loadsCap,
      perShot > 0 ? Math.floor((cumPool.current ?? 0) / perShot) : 0));
    const cumShotBonus = Number(actor.getFlag(FLAG, "cumShotBonus")) || 0;
    const arousal      = actor.getFlag(FLAG, "arousal")     ?? AFLP.arousalDefaults;
    const arousalMax   = AFLP.HScene.calcArousalMax(actor);
    const arousalBase  = arousal.maxBase ?? 6;
    const denied       = { ...(actor.getFlag(FLAG, "denied") ?? AFLP.deniedDefaults),
                           value: AFLP.denied.total(actor) };   // the store differs per system
    const deniedValue  = denied.value ?? 0;
    const horny        = { ...(actor.getFlag(FLAG, "horny") ?? AFLP.hornyDefaults),
                           total: AFLP.horny.total(actor) };   // the store differs per system
    const hasPussy     = !!actor.getFlag(FLAG, "pussy");
    const hasCock      = !!actor.getFlag(FLAG, "cock");
    const cumflation   = actor.getFlag(FLAG, "cumflation")                  ?? AFLP.cumflationDefaults;
    const genitalTypes = actor.getFlag(FLAG, "anatomyFeatures")                ?? {};
    const kinks        = sexual.kinks                                        ?? {};
    const kinkNotes    = sexual.kinkNotes                                    ?? {};
    const pregnancy    = structuredClone(actor.getFlag(FLAG, "pregnancy")   ?? {});
    const history      = actor.getFlag(FLAG, "partnerHistory")              ?? [];
    const titlesHeld   = new Set(sexual.titles ?? []);

    // Ordered list of held title ids (insertion order = acquisition order, so
    // the last entry is the most recently earned). Used by the title banner.
    const heldTitleIds = (sexual.titles ?? []).filter(id => AFLP_Titles.resolveTitle(id));
    // The title the player has chosen to display, falling back to most recent.
    const mostRecentTitleId = heldTitleIds.length ? heldTitleIds[heldTitleIds.length - 1] : null;
    const rawDisplay = sexual.displayTitle ?? null;
    const noneChosen = rawDisplay === "__none__";
    let displayTitleId = noneChosen ? null : rawDisplay;
    // Fall back to most recent ONLY when nothing is chosen (not when None is the
    // deliberate choice).
    if (!noneChosen && (!displayTitleId || !titlesHeld.has(displayTitleId))) displayTitleId = mostRecentTitleId;
    const displayTitle = displayTitleId ? AFLP_Titles.resolveTitle(displayTitleId) : null;

    // Voice profile options (rendered into the panel so the control survives a
    // refresh and appears on the docked sheet, not just the popout).
    const voiceNames = (window.AFLP_Voice?.profiles?.() ?? []);
    const curVoice   = actor.getFlag(FLAG, "voiceProfile") || "";
    const voiceOpts  = ['<option value="">(none)</option>']
      .concat(voiceNames.map(n => `<option value="${n}"${n === curVoice ? " selected" : ""}>${n}</option>`))
      .join("");

    // ── BODY TYPE ───────────────────────────────────────────────────────────
    //
    // The position picker offers a different pool per body type, and 25 of the
    // 86 positions are reachable ONLY through a non-biped one - both beast
    // rides, the coils, the talon grips, the tentacle fills, the vine wraps, the
    // phantom set and the massive carries.
    //
    // WHY THIS CONTROL HAD TO EXIST. `AFLP._detectPositionTrait` reads
    // `actor.system.traits.value`, which is PF2e's creature-trait array.
    // Daggerheart actors have NO `system.traits` at all, so `?? []` makes every
    // branch false and the detection silently answers "biped". Measured 16 Aug
    // 2026 across all 32 adversaries in `aflr-dh-actors`: 30 read biped and the
    // only 2 that did not - Clutch-Wyrm and Brimstone Harem Drake - got there
    // through the NAME list, not a trait. The Knotting Warhound is a biped to
    // the position system, so it cannot be offered its own Mounted position.
    // 5e is expected to be the same (it stores creature type at
    // `system.details.type.value`) but was not measured - `dnd-test` was not up.
    //
    // `getActorPositions` already prefers `flags.world.positionTrait` over
    // detection, so this control is the whole mechanism - no new plumbing. The
    // ONLY other writer is `aflp-token-initialize.js`, which stores the detected
    // value once if the flag is absent and whose comment has always called it an
    // override a GM can set. This is that override.
    //
    // "Auto" writes NOTHING and clears the flag, so detection stays live and the
    // label reports what it currently answers. Showing the detected value is
    // half the point: a wrong body type is invisible otherwise, which is how 30
    // adversaries sat mis-typed without anyone noticing.
    //
    // WHAT WOULD MAKE THIS STALE: `_detectPositionTrait` gaining a per-adapter
    // branch. It would still want the override; it would stop being the only way
    // a Daggerheart creature can be anything but a biped.
    const BODY_TYPES = [
      ["biped",       "Biped (humanoid)"],
      ["massive",     "Massive (large humanoid)"],
      ["quadruped",   "Quadruped (beast)"],
      ["serpentine",  "Serpentine"],
      ["winged",      "Winged"],
      ["tentacled",   "Tentacled / Aberration"],
      ["plant",       "Plant"],
      ["incorporeal", "Incorporeal"],
    ];
    const curBodyType = actor.getFlag(FLAG, "positionTrait") || "";
    let detectedBodyType = "biped";
    try { detectedBodyType = AFLP._detectPositionTrait?.(actor) ?? "biped"; } catch (e) { /* bare rig */ }
    const detectedLabel = BODY_TYPES.find(([v]) => v === detectedBodyType)?.[1] ?? detectedBodyType;
    const bodyTypeOpts = [`<option value=""${curBodyType ? "" : " selected"}>Auto (${detectedLabel})</option>`]
      .concat(BODY_TYPES.map(([v, l]) => `<option value="${v}"${v === curBodyType ? " selected" : ""}>${l}</option>`))
      .join("");

    if (!sexual.lifetime.mlGiven)    sexual.lifetime.mlGiven    = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
    if (!sexual.lifetime.mlReceived) sexual.lifetime.mlReceived = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
    if (!sexual.lifetime.given)      sexual.lifetime.given      = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
    if (sexual.lifetime.mlGiven.gangbang    === undefined) sexual.lifetime.mlGiven.gangbang    = 0;
    if (sexual.lifetime.mlReceived.gangbang === undefined) sexual.lifetime.mlReceived.gangbang = 0;

    const totalTier = AFLP.cumflationTotal(actor);

    const cell = (value, name) => editMode
      ? `<input class="aflp-input" type="number" name="${name}" value="${value}" style="width:60px;text-align:center"/>`
      : `<span>${value}</span>`;

    const inlineEdit = (value, name) => editMode
      ? `<input class="aflp-input" type="number" name="${name}" value="${value}" style="width:44px;text-align:center"/>`
      : `<span>${value}</span>`;

    // Lifetime acts, in Cum Shot UNITS and LOADS - the canonical stats. ml is a
    // presentation of units and is applied at render via AFLP.cumMeasure, so a
    // Fantasy/Realistic switch never rewrites history.
    const _measure = AFLP.Settings.cumMeasureMode ?? "units";
    const _uHole = (bucket, hole) => AFLP.unitsForHole(sexual.lifetime, bucket, hole);
    const _fmt = (units) => AFLP.cumMeasure(units, _measure);

    const ACT_HOLES = ["oral", "vaginal", "anal", "facial", "gangbang"];
    let _totLoadsR = 0, _totLoadsG = 0, _totUnitsR = 0, _totUnitsG = 0;
    const actRows = ACT_HOLES.map(act => {
      if (act === "vaginal" && !hasPussy) return "";
      const loadsR = sexual.lifetime[act] ?? 0;
      const loadsG = act === "gangbang" ? null : (sexual.lifetime.given?.[act] ?? 0);
      const unitsR = _uHole("unitsReceived", act);
      const unitsG = act === "gangbang" ? null : _uHole("unitsGiven", act);

      _totLoadsR += loadsR; _totUnitsR += unitsR;
      if (act !== "gangbang") { _totLoadsG += (loadsG ?? 0); _totUnitsG += (unitsG ?? 0); }

      const dash = `<td class="aflp-num">-</td>`;
      return `
        <tr>
          <td class="aflp-act-label">${act}</td>
          ${hasCock ? (act === "gangbang" ? dash : `<td class="aflp-num">${cell(loadsG, `given.${act}`)}</td>`) : ""}
          <td class="aflp-num">${cell(loadsR, `lifetime.${act}`)}</td>
          ${hasCock ? (act === "gangbang" ? dash : `<td class="aflp-num aflp-units">${_fmt(unitsG)}</td>`) : ""}
          <td class="aflp-num aflp-units">${_fmt(unitsR)}</td>
        </tr>`;
    }).join("");

    const actTotalRow = `
      <tr class="aflp-total-row">
        <td class="aflp-act-label"><strong>Total</strong></td>
        ${hasCock ? `<td class="aflp-num"><strong>${_totLoadsG}</strong></td>` : ""}
        <td class="aflp-num"><strong>${_totLoadsR}</strong></td>
        ${hasCock ? `<td class="aflp-num aflp-units"><strong>${_fmt(_totUnitsG)}</strong></td>` : ""}
        <td class="aflp-num aflp-units"><strong>${_fmt(_totUnitsR)}</strong></td>
      </tr>`;

    if (titlesMode) {
      return `
      <div class="aflp-panel${editMode ? " aflp-edit-mode" : ""}" data-aflp-titles="1">
        ${AFLP.UI.SheetTab._css()}
        ${AFLP.Settings.titlesShow ? AFLP.UI.SheetTab._renderTitleBanner(displayTitle, heldTitleIds.length, true) : ""}
        <section class="aflp-subtab-pane active aflp-titles-fullview">
          <div class="aflp-section">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
              <h3 class="aflp-section-header" style="margin:0;border-bottom:none;">Titles</h3>
              <div class="aflp-header-btns">
                ${editMode
                  ? `<button type="button" class="aflp-btn aflp-save-btn">\uD83D\uDCBE Save</button>
                     <button type="button" class="aflp-btn aflp-cancel-btn" style="margin-left:4px">\u2715 Cancel</button>`
                  : `<button type="button" class="aflp-btn aflp-edit-btn" title="Edit which titles are held">\u270F Edit</button>`}
              </div>
            </div>
            ${!editMode && heldTitleIds.length ? `<div class="aflp-title-hint" style="margin-bottom:6px;">\u2605 sets your displayed title</div>` : ""}
            <div style="border-bottom:1px solid var(--aflr-border-gold);margin-bottom:8px;"></div>
            ${editMode
              ? AFLP.UI.SheetTab._renderTitlesEdit(titlesHeld, actor, sexual)
              : AFLP.UI.SheetTab._renderTitlesView(titlesHeld, displayTitleId, actor, sexual)}
          </div>
        </section>
      </div>`;
    }

    return `
    <div class="aflp-panel${editMode ? " aflp-edit-mode" : ""}">

      ${AFLP.UI.SheetTab._css()}

      <!-- ═══ B: Compact masthead (red title + Cum Shot pill + icon buttons) ═══ -->
      <div class="aflp-masthead">
        ${AFLP.Settings.titlesShow && displayTitle
          ? `<span class="aflp-mast-title" data-title-id="${displayTitle.id}" title="${displayTitle.desc}">\u2605 ${displayTitle.name}</span>`
          : `<span class="aflp-mast-title aflp-mast-title-empty">\u2605 ${AFLP.Settings.titlesShow ? "No Title" : ""}</span>`}
        ${editMode ? `
        <div class="aflp-cum-edit aflp-mast-cum-edit">
          <span>Cum Shot Bonus</span>${inlineEdit(cumShotBonus, "cumShotBonus")}<span style="opacity:.6;">|</span><span>Loads Bonus</span>${inlineEdit(Number(coomer.bonus) || 0, "coomer.bonus")}<span style="opacity:.55;font-size:11px;" title="Base ${coomer.level ?? AFLP.COOMER_DEFAULT} plus your bonus and any worn gear">= ${perShot} &times; ${loadsCap}</span>
        </div>` : `
        <div class="aflp-cum-pill aflp-mast-cum">
          <span class="aflp-label">Cum Shot</span><span>${perShot}</span>
          <span class="aflp-cum-sep">&times;</span><span class="aflp-cum-left${loadsLeft <= 0 ? " aflp-cum-empty" : ""}" title="${loadsLeft} of ${loadsCap} loads left - rest to refill">${loadsLeft}</span><span class="aflp-cum-sep">/</span><span>${loadsCap}</span>
          <span class="aflp-cum-sep">loads</span>
        </div>`}
        <div class="aflp-mast-btns">
          ${editMode
            ? `<button type="button" class="aflp-btn aflp-save-btn">💾 Save</button>
               <button type="button" class="aflp-btn aflp-cancel-btn">✕ Cancel</button>`
            : `${game.user?.isGM ? `<button type="button" class="aflp-btn aflp-status-btn aflp-cond-manage" title="Status & conditions (GM)">＋ Status</button>` : ""}
               <button type="button" class="aflp-btn aflp-icon-btn aflp-edit-btn" title="Edit stats"><i class="fa-solid fa-pen-to-square"></i></button>
               <button type="button" class="aflp-btn aflp-icon-btn aflp-voice-btn" title="Voice profile">🔊</button>
               <button type="button" class="aflp-btn aflp-icon-btn aflp-lovense-btn" title="Lovense Integration">🖤</button>`
          }
        </div>
      </div>

      <!-- Voice profile control: popover toggled by the speaker icon. Hidden
           until the panel carries .aflp-voice-open. -->
      <div class="aflp-voice-ctl" title="AFLP voice profile for this actor. Test steps through the pack; Rescan re-reads the voice folder set in module settings.">
        <span class="aflp-voice-label">Voice</span>
        <select class="aflp-voice-select">${voiceOpts}</select>
        <button type="button" class="aflp-btn aflp-voice-test">Test</button>
        <button type="button" class="aflp-btn aflp-voice-rescan">Rescan</button>
      </div>

      <!-- Body type: which position pool this creature is offered. Shares the
           voice popover so it does not cost the panel a permanent row; both are
           set-once settings rather than things read at a glance. -->
      <div class="aflp-voice-ctl" title="Which H-Scene position pool this creature is offered. Auto reads the system's own creature traits, which only Pathfinder populates - set it by hand for a beast, ooze, serpent or giant on Daggerheart or 5e.">
        <span class="aflp-voice-label">Body</span>
        <select class="aflp-voice-select aflp-bodytype-select">${bodyTypeOpts}</select>
      </div>

      <!-- Condition badges: ONLY when the status window is disabled (otherwise
           the status panel beside the sheet already shows these). -->
      ${game.settings.get(AFLP.Settings.ID, "statusPanelEnabled") === false
        ? AFLP.UI.SheetTab._renderConditionBadges(actor) : ""}

      <!-- ═══ C: Re-themed sub-tab navigation ═══ -->
      <nav class="aflp-subtabs">
        <a class="aflp-subtab" data-subtab="body">Body</a>
        <a class="aflp-subtab" data-subtab="drives">Drives</a>
        <a class="aflp-subtab" data-subtab="history">History${history.length ? ` <span class="aflp-subtab-count">${history.length}</span>` : ""}</a>
      </nav>

      <!-- Arousal + Horny pip bars (shared, above the panes) -->
      <div class="aflp-bars-section">
        <!-- Arousal bar -->
        <div class="aflp-bar-row">
          <span class="aflp-bar-label">Arousal</span>
          <div class="aflp-pip-bar" data-bar-type="arousal">
            ${Array.from({length: arousalBase}, (_, i) =>
              `<span class="aflp-pip aflp-arousal-pip${i < (arousal.current ?? 0) ? " filled" : ""}"
                     data-pip-index="${i}" data-pip-type="arousal" title="Arousal ${i+1}/${arousalBase}"></span>`
            ).join("")}${deniedValue > 0
              ? Array.from({length: deniedValue}, (_, i) =>
                  `<span class="aflp-pip aflp-arousal-pip denied-ext${(arousalBase + i) < (arousal.current ?? 0) ? " filled" : ""}"
                         data-pip-index="${arousalBase + i}" data-pip-type="arousal"
                         title="Denied extension (Denied ${i+1}/${deniedValue})"></span>`
                ).join("")
              : ""}
          </div>
          <span class="aflp-bar-val">${arousal.current ?? 0}/${arousalMax}${deniedValue > 0 ? ` <span class="aflp-denied-label">+${deniedValue} Denied</span>` : ""}</span>
          ${editMode
            ? `<span class="aflp-bar-maxedit">Max:<input class="aflp-input" type="number" name="arousal.maxBase" value="${arousal.maxBase ?? 6}" style="width:32px;text-align:center;margin-left:4px;"/></span>`
            : ""}
          <span class="aflp-denied-btns" style="display:flex;align-items:center;gap:3px;margin-left:6px;">
            <button class="aflp-denied-dec aflp-btn-tiny" title="Remove Denied" ${deniedValue <= 0 ? "disabled" : ""}>-</button>
            <button class="aflp-denied-inc aflp-btn-tiny" title="Add Denied" ${deniedValue >= AFLP.denied.cap(actor) ? "disabled" : ""}>+</button>
          </span>
        </div>
        <!-- Horny bar -->
        ${(() => {
          // The TOTAL comes from AFLP.horny, which knows which store this system
          // keeps it in; only the permanent/temporary SPLIT comes from the bag.
          // Reading `temp + permanent` here showed 0/3 on Daggerheart for a
          // character the scene card and the status panel both showed as Horny 3,
          // because on DH the total lives in the valued condition and the bag
          // carries only the floor.
          const total = AFLP.horny.total(actor);
          const hp = Math.min(Number(horny.permanent) || 0, total);
          const ht = Math.max(0, total - hp);
          // In edit mode, pips are visual-only; permanent is staged via hidden input.
          // staged-perm class: lighter pink + red border, opacity 0.75 — visually distinct from committed perm.
          const pips = Array.from({length: 3}, (_, i) => {
            const isPerm = i < hp;
            const isTemp = !isPerm && i < total;
            let cls = "";
            if (isPerm)     cls = " filled perm";
            else if (isTemp) cls = " filled";
            const tipText = isPerm
              ? (editMode ? "Permanent Horny (click to remove)" : "Permanent Horny (set by kinks/edit)")
              : isTemp
                ? (editMode ? "Temp Horny (click to make permanent)" : "Temp Horny (click to remove)")
                : (editMode ? "Empty (click to add as permanent)" : "Empty (click to add Horny)");
            return `<span class="aflp-pip aflp-horny-pip${cls}"
                         data-pip-index="${i}" data-pip-type="horny"
                         title="${tipText}"></span>`;
          }).join("");
          const valText = total > 0
            ? `${total}/3${hp > 0 ? ` <span class="aflp-horny-perm-label">(${hp} perm)</span>` : ""}`
            : "0/3";
          return `
          <div class="aflp-bar-row">
            <span class="aflp-bar-label">Horny</span>
            <div class="aflp-pip-bar" data-bar-type="horny" data-staged-permanent="${hp}">${pips}</div>
            <span class="aflp-bar-val" data-bar-val-type="horny">${valText}</span>
            ${editMode ? `<input type="hidden" name="horny.permanent" value="${hp}"/>` : ""}
          </div>`;
        })()}
      </div>

      <!-- Reset strip (edit mode only) -->
      ${editMode ? `
      <div class="aflp-reset-strip">
        <span class="aflp-reset-label">Reset on Save:</span>
        <label class="aflp-reset-check"><input type="checkbox" name="reset-lifetime"/> Lifetime Totals</label>
        <label class="aflp-reset-check"><input type="checkbox" name="reset-genitalia"/> Genitalia</label>
        <label class="aflp-reset-check"><input type="checkbox" name="reset-kinks"/> Kinks</label>
        <label class="aflp-reset-check"><input type="checkbox" name="reset-cumflation"/> Cumflation</label>
        <label class="aflp-reset-check"><input type="checkbox" name="reset-pregnancy"/> Pregnancy</label>
        <label class="aflp-reset-check"><input type="checkbox" name="reset-history"/> Partner History</label>
        <label class="aflp-reset-check"><input type="checkbox" name="reset-arousal"/> Arousal</label>
        <label class="aflp-reset-check"><input type="checkbox" name="reset-horny"/> Horny</label>
        <label class="aflp-reset-check"><input type="checkbox" name="reset-cum"/> Cum (refill)</label>
        <label class="aflp-reset-check"><input type="checkbox" name="reset-titles"/> Titles</label>
      </div>` : ""}

      <!-- ═══ BODY pane: doll-driven region layout (lower body / torso / head) ═══ -->
      <section class="aflp-subtab-pane" data-subtab-pane="body">
        <h3 class="aflp-section-header">Anatomy</h3>
        <div class="aflp-genitalia">
          ${await (async () => {
            try {
              const ST = AFLP.UI.SheetTab;
              // Silhouette: explicit per-actor flag wins (the doll-assignment pass
              // sets it); otherwise characters derive from anatomy and everything
              // else defaults to the Monster doll (horse/wolf/dragon/goblin stack).
              const silh = actor.getFlag(FLAG, "dollSilhouette")
                ?? (actor.type !== "character" ? "Monster"
                : ((hasCock && !hasPussy) ? "Male" : "Female"));
              const ct = AFLP.Settings.cumflationTracking;
              const regions = await ST._renderGenitaliaRegions(hasPussy, hasCock, genitalTypes, editMode, actor.getFlag(FLAG, "bodyFeatures") ?? {});
              // Cumflated = cum INSIDE a hole; Coated = cum ON a surface. Torso and
              // Head each hold one of each, and the Torso's two are BOTH called
              // Tits - the reservoir and the chest coat. That distinction now rides
              // on each row's label (HOLE_KIND) rather than a heading above the
              // group, because the heading rendered above the row's ICON instead of
              // above its pips. Never merge these into one call - the order of the
              // two calls is what puts filled above coated.
              const cumSection = async (holes) => {
                if (!ct) return "";
                const rows = await ST._renderCumflationRows(cumflation, totalTier, actor, { holeFilter: holes });
                return /aflp-cum-row/.test(rows) ? rows : "";
              };
              const lowerBody = regions.lowerBody
                + await cumSection(["vaginal", "anal"])
                + await ST._renderSizeTraining(actor, hasPussy, ["pussy", "anal"])
                + ST._renderSizeReadout(actor, ["cock", "vaginal", "anal"]);
              const torso = regions.torso
                + ST._renderSizeReadout(actor, ["tits"])
                + await cumSection(["onahole"])
                + await cumSection(["bodyCoat"])
                + await ST._renderSizeTraining(actor, hasPussy, ["onahole"])
                + await ST._renderMilk(actor, editMode)
                + ST._renderActivePregnancy(actor, pregnancy, editMode, hasPussy);
              const head = regions.head
                + await cumSection(["oral"])
                + await cumSection(["facial"])
                + await ST._renderSizeTraining(actor, hasPussy, ["oral"])
                + ST._renderSizeReadout(actor, ["oral"]);
              const doll = ST._dollShell(silh, lowerBody, torso, head, ST._activeRegion?.[actor.id] ?? "lower-body");
              const footer = ct
                ? `<button type="button" class="aflp-coat-toggle" title="Cycle the cumflation token coat: Portrait (flat face/bust image, no ring) - Bust (cropped portrait inside a dynamic ring)." style="margin-top:8px;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;background:#2a261f;color:#c9a96e;border:1px solid #3a342b;border-radius:4px;padding:3px 8px;cursor:pointer;">Token coat: ${actor.getFlag(AFLP.FLAG_SCOPE, "coatBust") ? "Bust" : "Portrait"}</button>`
                : "";
              return doll + footer;
            } catch (e) {
              console.warn("AFLP | Body region layout failed:", e?.stack ?? e?.message);
              return `<div class="aflp-none" style="padding:8px">Body layout error: ${e?.message ?? "unknown"}. Other tabs still work.</div>`;
            }
          })()}
        </div>
      </section>

      <!-- ═══ DRIVES pane: Kinks + Titles ═══ -->
      <!-- Lifetime Totals moved to History, where the stats belong and where they
           have room to expand. Kinks take the full width they always needed - they
           were cramped into half a column with notes truncated. The kink list uses a
           nested grid so it flows two-up when wide and one-up in the H-Scene
           sidecar, handled entirely by the existing @container query. -->
      <section class="aflp-subtab-pane" data-subtab-pane="drives">
        ${AFLP.Settings.titlesShow ? AFLP.UI.SheetTab._renderTrackedTitle(actor, sexual) : ""}

        <div class="aflp-section">
          <h3 class="aflp-section-header">Kinks</h3>
          <div class="aflp-kinks aflp-kinks-wide">
            ${editMode
              ? AFLP.UI.SheetTab._renderKinksEdit(kinks, kinkNotes)
              : await AFLP.UI.SheetTab._renderKinks(kinks, kinkNotes)}
          </div>
        </div>
        ${AFLP.Settings.titlesShow ? `
        <div class="aflp-titles-section">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <h3 class="aflp-section-header" style="margin:10px 0 6px;border:none;">Titles</h3>
            ${!editMode ? `
            <label class="aflp-showlocked" title="Show titles you haven't earned yet, with progress toward each">
              <input type="checkbox" class="aflp-showlocked-check" ${_aflpShowLocked.get(actor.id) ? "checked" : ""}/>
              <span>Show Locked</span>
            </label>` : ""}
          </div>
          ${editMode
            ? AFLP.UI.SheetTab._renderTitlesEdit(titlesHeld, actor, sexual)
            : AFLP.UI.SheetTab._renderTitlesView(titlesHeld, displayTitleId, actor, sexual)}
        </div>` : ""}
      </section>

      <!-- ═══ HISTORY pane ═══ -->
      <section class="aflp-subtab-pane" data-subtab-pane="history">

        <!-- ── Sexual Acts: loads + Cum Shot units, per hole ── -->
        <div class="aflp-section">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px;">
            <h3 class="aflp-section-header" style="margin:0;border-bottom:none;">Sexual Acts</h3>
            <button type="button" class="aflp-measure-note aflp-measure-cycle"
              title="Click to change measure. Cum Shots are the underlying unit and never change - the others convert from them and shift with the Realistic/Fantasy setting.">${
              { units: "Cum Shots", ml: "millilitres", floz: "fluid ounces", gal: "gallons" }[AFLP.Settings.cumMeasureMode ?? "units"]
            } &#8635;</button>
          </div>
          <div style="border-bottom:1px solid var(--color-border-dark-tertiary,#c9a96e);margin-bottom:6px;"></div>
          <table class="aflp-table aflp-table-compact">
            <thead>
              <tr>
                <th>Act</th>
                ${hasCock ? `<th>Loads Given</th>` : ""}
                <th>Loads Taken</th>
                ${hasCock ? `<th>Given</th>` : ""}
                <th>Taken</th>
              </tr>
            </thead>
            <tbody>${actRows}${actTotalRow}</tbody>
          </table>
        </div>

        <!-- ── Milestones ── -->
        <div class="aflp-section">
          <h3 class="aflp-section-header">Milestones</h3>
          ${AFLP.UI.SheetTab._renderMilestones(actor, sexual, history)}
        </div>

        <div class="aflp-section">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px;">
            <h3 class="aflp-section-header" style="margin:0;border-bottom:none;">Partner History</h3>
            ${editMode && history.length
              ? `<button type="button" class="aflp-btn aflp-history-clear-btn" style="font-size:11px;padding:2px 8px;background:rgba(160,60,40,0.1);border-color:#a03c28;">✕ Clear All</button>`
              : `<span></span>`}
          </div>
          <div style="border-bottom:1px solid var(--color-border-dark-tertiary,#c9a96e);margin-bottom:6px;"></div>
          ${AFLP.UI.SheetTab._renderHistory(history, editMode, pregnancy)}
        </div>
      </section>

    </div>`;
  },

  // -----------------------------------------------
  // CSS — scoped to .aflp-panel, no tab-level styles
  // (tab scroll is set inline on the div in _inject)
  // -----------------------------------------------
  _css() {
    return `<style>
      .aflp-panel {
        background: var(--aflr-ground);
        padding: 8px 10px 24px;
        font-family: var(--font-primary, serif);
        color: var(--aflr-text);
        font-size: 13px;
      }

      /* ── B: Compact masthead ── */
      .aflp-masthead {
        display: flex; align-items: center; gap: 10px;
        padding: 7px 10px; margin-bottom: 8px;
        background: var(--aflr-header-bg, #1c1228);
        border: 1px solid var(--aflr-border-gold, rgba(244,183,76,0.35));
        border-radius: 6px;
      }
      .aflp-mast-title {
        color: #e0607a; font-weight: 700; font-size: 14px; flex: 0 1 auto;
        cursor: default; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .aflp-mast-title-empty { color: rgba(224,96,122,0.5); font-weight: 500; }
      .aflp-mast-cum {
        display: flex; align-items: center; gap: 5px; margin-left: auto;
        font-size: 12px; white-space: nowrap;
      }
      .aflp-mast-cum-edit { margin-left: auto; display: flex; align-items: center; gap: 6px;
        font-size: 12px; font-weight: 600; white-space: nowrap;
        background: rgba(0,0,0,.18); border: 1px solid #c9a96e55; border-radius: 6px; padding: 4px 8px; }
      .aflp-mast-btns { display: flex; gap: 5px; flex: 0 0 auto; }
      .aflp-icon-btn {
        width: 28px; height: 28px; padding: 0; display: inline-flex;
        align-items: center; justify-content: center; font-size: 14px;
      }
      /* The Status button leads the masthead - labelled, plus-glyphed, and tinted
         to match the status panel header so players recognise the same menu. */
      .aflp-status-btn {
        font-weight: 600; padding: 3px 10px; letter-spacing: 0.3px;
        background: rgba(201,169,110,0.18); border-color: rgba(201,169,110,0.5);
        color: #e8c46a;
      }
      .aflp-status-btn:hover { background: rgba(201,169,110,0.32); }

      /* ── C: grid + panes ── */
      .aflp-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 10px; }
      .aflp-grid2 > .aflp-col { min-width: 0; }
      /* ── D: responsive collapse for the narrow H-scene sidecar ── */
      @container (max-width: 400px) { .aflp-grid2 { grid-template-columns: 1fr; } }
      .aflp-panel { container-type: inline-size; }
      .aflp-edit-mode .aflp-grid2 { grid-template-columns: 1fr; }

      .aflp-table-compact th, .aflp-table-compact td { padding: 2px 5px; font-size: 11px; }

      /* ── History: totals row, unit cells, measure note ── */
      .aflp-total-row td { border-top: 1px solid rgba(201,169,110,0.5); }
      .aflp-units { color: #e8c46a; }
      .aflp-measure-note { font-size: 10px; color: #7a7264; font-style: italic; text-transform: lowercase; }
      button.aflp-measure-cycle {
        background: none; border: none; padding: 0 2px; cursor: pointer; line-height: 1;
        width: auto; height: auto;
      }
      button.aflp-measure-cycle:hover { color: #e8c46a; text-shadow: 0 0 4px rgba(232,196,106,0.4); }

      /* ── Milestones: key/value pairs, two-up when wide, one-up in the sidecar ── */
      .aflp-milestones { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; }
      @container (max-width: 400px) { .aflp-milestones { grid-template-columns: 1fr; } }
      .aflp-ms-row {
        display: flex; justify-content: space-between; align-items: baseline;
        padding: 2px 4px; border-bottom: 1px dotted rgba(201,169,110,0.18); font-size: 11px;
      }
      .aflp-ms-label { color: #c9a96e; }
      .aflp-ms-val { color: #e8d9b8; font-weight: 600; }
      /* Zeroes stay visible but recede: they read as goals, not noise. */
      .aflp-ms-zero .aflp-ms-label, .aflp-ms-zero .aflp-ms-val { color: #6b6459; font-weight: 400; }
      /* Group headers span both columns so the pane reads as a trophy case. */
      .aflp-ms-group {
        grid-column: 1 / -1; margin: 9px 0 1px; padding-bottom: 2px;
        color: #e0607a; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
        border-bottom: 1px solid rgba(224,96,122,0.25);
      }
      .aflp-ms-group:first-child { margin-top: 0; }
      /* Bottom/Top role toggle: a compact segmented control. */
      .aflp-ms-toggle { display: inline-flex; gap: 2px; margin: 12px 0 4px; padding: 2px;
        border: 1px solid rgba(224,96,122,0.35); border-radius: 999px; }
      .aflp-ms-role-btn { border: none; background: transparent; cursor: pointer;
        font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
        color: #8a827a; padding: 3px 14px; border-radius: 999px; line-height: 1.4; }
      .aflp-ms-role-btn[aria-pressed="true"] { background: rgba(224,96,122,0.18); color: #e0607a; }
      .aflp-ms-role-btn:hover { color: #e0607a; }

      /* ── Drives: kinks now own the pane, so flow them two-up when there is room ── */
      .aflp-kinks-wide { column-count: 2; column-gap: 16px; }
      @container (max-width: 400px) { .aflp-kinks-wide { column-count: 1; } }
      .aflp-kinks-wide > * { break-inside: avoid; }
      .aflp-table-compact th { white-space: normal; line-height: 1.15; font-size: 10px; vertical-align: bottom; }

      /* Tracked-title banner (Drives) */
      .aflp-tracked {
        margin-bottom: 10px; padding: 7px 9px;
        background: rgba(224,96,122,0.08);
        border: 1px solid rgba(224,96,122,0.35); border-radius: 6px;
      }
      .aflp-tracked-head { display: flex; align-items: baseline; gap: 7px; font-size: 12px; margin-bottom: 5px; }
      .aflp-tracked-label { color: #e0607a; font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; }
      .aflp-tracked-name { color: var(--aflr-text); }
      .aflp-tracked-val { margin-left: auto; color: var(--aflr-text-muted); font-size: 11px; }

      /* Progress bars */
      .aflp-progbar { height: 6px; background: rgba(255,255,255,0.07); border-radius: 3px; overflow: hidden; }
      .aflp-progbar-fill { height: 100%; background: linear-gradient(90deg, #d4557a, #e0607a); border-radius: 3px; }

      /* Titles edit list with progress */
      .aflp-title-elist { display: flex; flex-direction: column; gap: 4px; max-height: 340px; overflow-y: auto; padding-right: 4px; }
      .aflp-title-erow { padding: 4px 6px; border: 1px solid rgba(200,160,80,0.15); border-radius: 5px; background: rgba(255,255,255,0.02); }
      .aflp-title-erow.earned { border-color: rgba(244,183,76,0.4); background: rgba(244,183,76,0.06); }
      .aflp-title-erow-head { display: flex; align-items: center; gap: 7px; font-size: 12px; cursor: pointer; }
      .aflp-title-ename { flex: 1 1 auto; }
      .aflp-title-erow-prog { display: flex; align-items: center; gap: 7px; margin-top: 3px; padding-left: 22px; }
      .aflp-title-erow-prog .aflp-progbar { flex: 1 1 auto; }
      .aflp-prog-val { font-size: 10px; color: var(--aflr-text-muted); flex: 0 0 auto; }
      .aflp-prog-binary { font-size: 10px; color: var(--aflr-text-muted); font-style: italic; }
      .aflp-title-track { background: none; border: none; cursor: pointer; color: rgba(224,96,122,0.5); font-size: 13px; padding: 0 2px; }
      .aflp-title-track:hover { color: #e0607a; }
      .aflp-title-track.active { color: #e0607a; text-shadow: 0 0 5px rgba(224,96,122,0.6); }
      .aflp-title-hint { font-size: 10px; color: var(--aflr-text-muted); }
      .aflp-showlocked { display: inline-flex; align-items: center; gap: 6px; font-size: 11px;
        color: var(--aflr-text-muted); cursor: pointer; user-select: none; }
      .aflp-showlocked input { cursor: pointer; }
      .aflp-locked-list { margin-top: 4px; }
      .aflp-locked-list .aflp-title-erow-head { display: flex; align-items: center; gap: 7px; font-size: 12px; }
      .aflp-locked-list .aflp-title-ename { flex: 1 1 auto; }
      .aflp-title-ereq { font-size: 10px; color: var(--aflr-text-muted); font-style: italic;
        margin: 1px 0 3px 22px; line-height: 1.3; }
      .aflp-tracked-req { font-size: 10px; color: var(--aflr-text-muted); font-style: italic;
        margin: 0 0 5px; line-height: 1.3; }

      /* Header */
      .aflp-header {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 12px;
        padding: 6px 10px;
        background: var(--aflr-panel);
        border: 1px solid var(--aflr-border);
        border-radius: 4px;
        flex-wrap: wrap;
      }
      .aflp-header-btns { margin-left: auto; }
      /* Square button block: wide primary button on top, two small buttons below */
      .aflp-btn-block { display: flex; flex-direction: column; gap: 4px; width: 96px; }
      .aflp-btn-wide { width: 100%; text-align: center; padding: 4px 6px; }
      .aflp-btn-row { display: flex; gap: 4px; }
      .aflp-btn-sq {
        flex: 1 1 0; min-width: 0; padding: 4px 0; text-align: center;
        display: flex; align-items: center; justify-content: center;
      }
      /* Collapsible voice-profile control (toggled by the speaker button) */
      .aflp-voice-ctl { display: none; }
      .aflp-panel.aflp-voice-open .aflp-voice-ctl {
        display: flex; align-items: center; gap: 5px;
        margin: 0 0 10px; padding: 5px 8px; font-size: 11px; white-space: nowrap;
        background: var(--aflr-panel); border: 1px solid var(--aflr-border);
        border-radius: 4px;
      }
      .aflp-voice-label { font-weight: 600; color: var(--aflr-text-muted); flex: 0 0 auto; }
      .aflp-voice-select {
        flex: 1 1 auto; min-width: 0; height: 20px; font-size: 11px; padding: 0 4px;
        background: var(--aflr-header-bg); color: var(--aflr-text);
        border: 1px solid var(--aflr-border); border-radius: 3px;
        font-family: var(--font-primary, serif);
      }
      .aflp-voice-select option { background: var(--aflr-header-bg); color: var(--aflr-text); }
      .aflp-voice-test, .aflp-voice-rescan { flex: 0 0 auto; padding: 2px 7px; font-size: 10px; }
      .aflp-label {
        font-weight: bold;
        color: var(--aflr-text-muted);
        margin-right: 4px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .aflp-cum-pill { display: flex; align-items: center; gap: 3px; }
      .aflp-cum-sep  { color: var(--aflr-text-dim); }
      .aflp-cum-left { font-weight: 600; }
      /* Spent dry: the pool refills on a rest, so flag it rather than hide it. */
      .aflp-cum-empty { color: #e0607a; }
      .aflp-coomer       { display: flex; align-items: center; }

      /* Pip bars — Arousal + Horny */
      .aflp-bars-section {
        display: flex; flex-direction: column; gap: 5px;
        padding: 7px 10px;
        margin-bottom: 10px;
        background: var(--aflr-panel);
        border: 1px solid var(--aflr-border);
        border-radius: 4px;
      }
      .aflp-bar-row {
        display: flex; align-items: center; gap: 7px;
      }
      .aflp-bar-label {
        width: 50px; flex-shrink: 0;
        font-size: 10px; font-weight: bold;
        text-transform: uppercase; letter-spacing: 0.06em;
        color: var(--aflr-text-muted);
      }
      .aflp-pip-bar { display: flex; gap: 3px; flex: 1; }
      /* Arousal + Horny bars wrap pips so a high Max arousal or added Denied never spills off the
         sheet edge, while keeping flex sizing so low counts fill the bar and both rows stay aligned. */
      .aflp-pip-bar[data-bar-type="arousal"],
      .aflp-pip-bar[data-bar-type="horny"] { flex-wrap: wrap; }
      .aflp-pip {
        height: 12px; border-radius: 2px; flex: 1;
        border: 1px solid var(--aflr-track-border);
        background: var(--aflr-track);
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
        min-width: 10px; max-width: 28px;
      }
      /* Arousal pips — red gradient, matching H-Scene */
      .aflp-panel .aflp-arousal-pip { background: var(--aflr-track) !important; border-color: var(--aflr-track-border) !important; }
      .aflp-panel .aflp-arousal-pip.filled {
        background: linear-gradient(135deg, #e05050, #c02020) !important;
        border-color: #e05050 !important;
      }
      /* Denied extension pips — yellow outline, fill when arousal spills into denied range */
      .aflp-panel .aflp-arousal-pip.denied-ext {
        background: var(--aflr-panel) !important;
        border-color: #b89a00 !important;
        border-width: 2px !important;
        border-style: dashed !important;
      }
      .aflp-panel .aflp-arousal-pip.denied-ext.filled {
        background: linear-gradient(135deg, #d4a800, #a07800) !important;
        border-color: #b89a00 !important;
        border-style: solid !important;
      }
      .aflp-panel .aflp-arousal-pip:not(.filled):not(.denied-ext):hover {
        background: rgba(200,60,60,0.25) !important;
        border-color: rgba(200,60,60,0.6) !important;
      }
      .aflp-panel .aflp-arousal-pip.denied-ext:not(.filled):hover {
        background: rgba(180,150,0,0.2) !important;
      }
      /* Cumflation pips — clickable in view mode */
      .aflp-panel .aflp-cumflation-pip { cursor: pointer; }
      .aflp-panel .aflp-cumflation-pip:not(.filled):hover {
        background: rgba(100,160,200,0.25) !important;
        border-color: rgba(100,160,200,0.6) !important;
      }
      .aflp-panel .aflp-cumflation-pip.filled:hover {
        opacity: 0.7;
      }
      /* Size Training pips - warm/gold, escalating fill */
      .aflp-sizetrain { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
      .aflp-sizetrain-row { display: flex; align-items: center; gap: 6px; font-size: 11px; }
      .aflp-sizetrain-label { width: 92px; text-align: right; flex-shrink: 0; opacity: 0.75; align-self: center; }
      /* Big enough to read at a glance - the tier art is the point of the row.
         Measured: at 50px the widest row (8 pips) needs about 436px inside a
         582px panel, so this fits without squeezing the pips. */
      .aflp-panel .aflp-track-icon { width: 50px; height: 50px; object-fit: contain; vertical-align: middle; margin-right: 8px; border: none; flex-shrink: 0; }
      .aflp-panel .aflp-sizetrain-row .aflp-pip-bar { min-width: 0; }
      .aflp-panel .aflp-sizetrain-row .aflp-pip { max-width: 22px; }
      .aflp-panel .aflp-sizetrain-featline { margin: 0 0 4px 26px; font-size: 12px; }
      .aflp-panel .aflp-sizetrain-pip { cursor: pointer; }
      .aflp-panel .aflp-sizetrain-pip.filled {
        background: linear-gradient(135deg, #e0a850, #c8781e) !important;
        border-color: rgba(220,140,50,0.8) !important;
      }
      .aflp-panel .aflp-sizetrain-pip:not(.filled):hover {
        background: rgba(220,140,50,0.25) !important;
        border-color: rgba(220,140,50,0.6) !important;
      }
      .aflp-panel .aflp-sizetrain-pip.filled:hover { opacity: 0.7; }
      .aflp-sizetrain-feat {
        font-size: 10px; font-weight: 600; color: #e0a850;
        text-shadow: 0 0 4px rgba(220,140,50,0.4); margin-left: 2px;
      }
      /* Horny pips — pink temp, pink+thick-red-border permanent, lighter staged-perm */
      .aflp-panel .aflp-horny-pip { background: var(--aflr-track) !important; border-color: var(--aflr-track-border) !important; }
      .aflp-panel .aflp-horny-pip.filled {
        background: linear-gradient(135deg, #e880b8, #c85090) !important;
        border-color: #e880b8 !important;
        border-width: 1px !important;
      }
      .aflp-panel .aflp-horny-pip.filled.perm {
        background: linear-gradient(135deg, #e880b8, #c85090) !important;
        border-color: #a00030 !important;
        border-width: 2px !important;
        box-shadow: inset 0 0 0 1px rgba(200,0,60,0.4);
      }
      .aflp-panel .aflp-horny-pip.staged-perm {
        background: linear-gradient(135deg, #f0a0d0, #e070a8) !important;
        border-color: #a00030 !important;
        border-width: 2px !important;
        box-shadow: inset 0 0 0 1px rgba(200,0,60,0.3);
        opacity: 0.75;
      }
      .aflp-panel .aflp-horny-pip:not(.filled):not(.staged-perm):hover {
        background: rgba(220,100,160,0.25) !important;
        border-color: rgba(220,100,160,0.6) !important;
      }
      .aflp-panel .aflp-horny-pip.filled:hover {
        background: linear-gradient(135deg, #d06898, #a03878) !important;
      }
      .aflp-bar-val {
        font-size: 10px; color: var(--aflr-text-dim); white-space: nowrap; min-width: 32px;
      }
      .aflp-horny-perm-label { color: #c05090; font-size: 9px; }
      .aflp-denied-label     { color: #907000; font-size: 9px; font-weight: bold; letter-spacing: 0.03em; }
      .aflp-btn-tiny {
        font-size: 11px; font-weight: bold; line-height: 1;
        width: 18px; height: 18px; padding: 0;
        background: var(--aflr-panel); border: 1px solid rgba(0,0,0,0.22); border-radius: 3px;
        cursor: pointer; color: var(--aflr-text-muted);
      }
      .aflp-btn-tiny:hover:not(:disabled) { background: var(--aflr-panel-2); }
      .aflp-btn-tiny:disabled { opacity: 0.35; cursor: default; }
      .aflp-bar-maxedit {
        display: flex; align-items: center;
        font-size: 10px; color: var(--aflr-text-dim); white-space: nowrap;
      }

      /* Layout */
      /* View mode: two-column layout */
      .aflp-two-col { display: flex; gap: 14px; margin-bottom: 12px; flex-wrap: wrap; }
      .aflp-col     { flex: 1; min-width: 160px; margin-bottom: 6px; overflow: hidden; }
      .aflp-col-right { text-align: right; flex: 0 0 33%; min-width: 0; }
      .aflp-col-right .aflp-genitalia li,
      .aflp-col-right .aflp-kinks li { text-align: right; }
      /* Section header: never bleeds past its container */
      .aflp-section-header { max-width: 100%; box-sizing: border-box; }

      /* Edit mode: single column, cols stack vertically, full width */
      .aflp-edit-mode .aflp-two-col { display: block; }
      .aflp-edit-mode .aflp-col { min-width: 0; width: 100%; }
      .aflp-edit-mode .aflp-col-right { text-align: left; }
      .aflp-edit-mode .aflp-col-right .aflp-section-header { text-align: left; }

      /* Edit mode stats table: inputs stay compact */
      .aflp-edit-mode .aflp-table { table-layout: auto; }
      .aflp-edit-mode .aflp-table input.aflp-input { width: 52px; }

      /* Checkbox lists: label = full row, text left, checkbox right */
      .aflp-check-list { list-style: none; margin: 0; padding: 0; }
      .aflp-check-list li { padding: 1px 0; font-size: 12px; }
      .aflp-check-list li.aflp-subtype { padding-left: 14px; color: var(--aflr-text-muted); }
      .aflp-check-list label {
        display: flex; align-items: center;
        justify-content: space-between;
        gap: 8px; cursor: pointer; width: 100%;
      }
      .aflp-check-list label input[type="checkbox"] { flex-shrink: 0; margin-left: auto; }
      .aflp-cock-subtypes { margin-top: 2px; }
      .aflp-pussy-subtypes { margin-top: 2px; }
      .aflp-tits-subtypes { margin-top: 2px; }
      /* Top-aligned: the doll column must not stretch to the height of a tall
         pane, or the flip button and token-coat badge drift far below the doll. */
      .aflp-doll-wrap { display: flex; gap: 10px; align-items: flex-start; }
      .aflp-doll-col { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; }
      /* Doll art is standardized at 836x1908; aspect-ratio locks the box to the
         art so contain-fit fills it edge to edge with no letterboxing. */
      .aflp-doll { position: relative; width: 132px; aspect-ratio: 836 / 1908; height: auto; flex: none; background-size: contain; background-repeat: no-repeat; background-position: center top; }
      /* The doll IS the region selector, so the three hotspots have to look like
         three buttons the moment the pane opens - not only once you hover one.
         The text rail that used to duplicate them has been removed. */
      .aflp-doll-hot { position: absolute; left: 50%; transform: translateX(-50%); width: 44px; height: 38px; padding: 0; border: 2px solid rgba(214,120,150,.55); border-radius: 50%; background: rgba(214,120,150,.10); cursor: pointer; box-shadow: 0 0 6px 1px rgba(214,120,150,.18); transition: box-shadow .18s ease, background .18s ease, border-color .18s ease; }
      .aflp-doll-hot:hover { background: rgba(214,120,150,.18); box-shadow: 0 0 10px 2px rgba(214,120,150,.4); }
      .aflp-doll-hot.aflp-doll-active { border-style: solid; border-color: var(--aflr-accent,#d67896); background: rgba(214,120,150,.28); box-shadow: 0 0 16px 5px rgba(214,120,150,.6), inset 0 0 12px rgba(214,120,150,.45); }
      .aflp-doll-flip { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); border: none; border-radius: 4px; background: rgba(0,0,0,.22); color: inherit; cursor: pointer; font-size: 13px; padding: 1px 7px; }
      .aflp-doll-slots { flex: 1; min-width: 0; padding-left: 10px; }
      /* Anatomy chips in one tidy wrapping row rather than staggered one per line. */
      /* Anatomy chips are a UL, and subtypes are a NESTED UL - which is why they
         used to stagger further right with each one. Flatten every level into one
         wrapping row so Tits / Lactating / Onahole sit as a tidy group. */
      .aflp-doll-panel ul { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; list-style: none; margin: 0 0 4px 0; padding: 0; }
      .aflp-doll-panel ul ul { margin: 0; padding: 0; }
      .aflp-doll-panel ul li { margin: 0; padding: 0; }
      .aflp-doll-panel .aflp-none { opacity: .5; font-size: 11px; font-style: italic; margin-bottom: 4px; }
      /* Vertical, so the tabs read down the body the way the doll does:
         Head at the top, Torso in the middle, Lower body at the bottom. */
      /* A narrow rail against the doll, so Head / Torso / Lower body sit beside
         the body part they select. Full-width buttons read as a menu and squeezed
         the content into a strip on the right. */
      .aflp-doll-caption { text-align: center; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; opacity: .7; margin-top: 2px; }

      .aflp-doll-panel-h { font-weight: 700; margin-bottom: 4px; padding-bottom: 2px; border-bottom: 1px solid var(--aflr-border,rgba(150,150,150,.25)); }
      .aflp-doll-empty { color: var(--aflr-text-muted,#888); font-style: italic; }
      .aflp-anatomy-flat .aflp-doll-panel-h { margin-top: 6px; }
      .aflp-anatomy-flat .aflp-doll-panel-h:first-child { margin-top: 0; }
      .aflp-size-readout { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; font-weight: 600; letter-spacing: .02em; color: var(--aflr-text,inherit); opacity: .9; }
      .aflp-size-readout .aflp-size-band { color: var(--aflr-accent,#d67896); font-weight: 700; }
      .aflp-size-readout strong { color: var(--aflr-text,#e8e0ee); font-weight: 600; }
      .aflp-size-word { font-style: normal; margin-left: 4px; opacity: .8; }
      /* Tier-coloured content links: keep the link + its book icon, take the colour. */
      .aflp-cf-tint a.content-link { color: inherit !important; font-weight: 600; }
      .aflp-cf-tint a.content-link i { color: inherit; opacity: .65; }
      .aflp-milk-bar { position: relative; height: 18px; border-radius: 4px; overflow: hidden; background: var(--aflr-track-bg,rgba(120,120,140,.22)); }
      .aflp-milk-fill { height: 100%; background: linear-gradient(90deg,#efe9f4,#cbb8e0); transition: width .2s ease; }
      .aflp-milk-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: var(--aflr-text,#efe9f4); text-shadow: 0 1px 2px rgba(0,0,0,.5); }
      .aflp-kinknote { margin-left: 0; margin-top: 2px; }
      .aflp-kinknote input { width: 100%; font-size: 11px; }
      .aflp-section { margin-bottom: 12px; }
      .aflp-reset-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 12px;
        align-items: center;
        padding: 6px 8px;
        margin-bottom: 10px;
        background: rgba(160,60,40,0.08);
        border: 1px solid rgba(160,60,40,0.25);
        border-radius: 4px;
        font-size: 11px;
      }
      .aflp-reset-label { font-weight: bold; color: #c07060; margin-right: 4px; }
      .aflp-reset-check { display: flex; align-items: center; gap: 4px; cursor: pointer; color: #c8b090; }
      .aflp-reset-check input { cursor: pointer; }

      /* Section headers */
      /* Level 2. Anatomy's subsections - Cumflated, Coated, Size Training, Milk,
         Pregnancy - used to share aflp-section-header with Anatomy itself, so six
         headings shouted at one volume and nothing showed what contained what.
         Quieter, no rule, and more space above than below so it binds to the rows
         beneath it rather than floating between blocks. */
      .aflp-subsection-header {
        font-family: var(--font-primary, serif);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.10em;
        opacity: .62;
        border: none;
        margin: 12px 0 3px 0;
        padding: 0;
      }
      .aflp-section-header {
        font-family: var(--font-primary, serif);
        font-size: 13px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--aflr-text-muted);
        border-bottom: 1px solid var(--aflr-border-gold);
        margin: 0 0 6px 0;
        padding-bottom: 2px;
      }

      /* Tables */
      .aflp-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .aflp-table th {
        background: var(--aflr-track);
        padding: 3px 5px;
        text-align: center;
        font-size: 11px;
        font-weight: bold;
        border: 1px solid var(--aflr-border);
      }
      .aflp-table td {
        padding: 3px 5px;
        border: 1px solid var(--aflr-border);
        text-align: center;
      }
      .aflp-act-label {
        text-align: left !important;
        text-transform: capitalize;
        font-weight: 500;
      }
      .aflp-num { font-variant-numeric: tabular-nums; }

      /* Edit mode inputs */
      .aflp-input {
        background: rgba(255,255,255,0.08);
        border: 1px solid var(--aflr-gold);
        border-radius: 2px;
        padding: 1px 3px;
        font-size: 12px;
        font-family: var(--font-primary, serif);
        color: var(--aflr-text);
      }
      .aflp-input:focus { outline: 2px solid var(--aflr-gold); }

      /* Genitalia & Kinks */
      .aflp-genitalia ul, .aflp-kinks ul { list-style: none; margin: 0; padding: 0; }
      .aflp-genitalia li, .aflp-kinks li { padding: 2px 0; font-size: 12px; }
      .aflp-genitalia li.aflp-subtype {
        padding-left: 14px;
        color: var(--aflr-text-muted);
      }
      .aflp-none { color: var(--aflr-text-dim); font-style: italic; font-size: 12px; }

      /* Cumflation bars */
      .aflp-cumflation-grid { display: flex; flex-direction: column; gap: 8px; }
      .aflp-cum-row { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; }
      .aflp-cum-row-label {
        /* Wide enough for the longest label plus its qualifier ("Vaginal - filled").
           At 54px the qualifier was clipped mid-word. */
        width: 92px; text-align: right; font-weight: 500; align-self: center;
        text-transform: capitalize;
        color: var(--aflr-text-muted);
        flex-shrink: 0;
        line-height: 14px;
      }
      .aflp-cum-col { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
      .aflp-pip-bar  { display: flex; gap: 2px; flex-shrink: 0; }
      .aflp-pip {
        width: 18px; height: 12px; border-radius: 2px;
        border: 1px solid var(--aflr-track-border);
        background: var(--aflr-track);
        transition: background 0.2s;
      }
      .aflp-pip.filled {
        background: var(--aflr-cum);
        border-color: var(--aflr-cum);
        box-shadow: inset 0 1px 3px rgba(255,255,255,0.25);
      }
      .aflp-cum-row-kind { font-weight: 400; font-size: 10px; opacity: .5; margin-left: 4px; text-transform: lowercase; letter-spacing: .02em; }
      .aflp-cum-row-label { white-space: nowrap; }
      .aflp-cum-row-tier { font-size: 11px; color: var(--aflr-text-dim); min-width: 36px; }
      .aflp-cum-row-link { font-size: 12px; line-height: 1.25; }
      .aflp-cum-row-overall .aflp-cum-row-label { font-weight: bold; }
      .aflp-cum-row-overall {
        margin-top: 4px; padding-top: 4px;
        border-top: 1px solid rgba(0,0,0,0.1);
      }

      /* Pregnancy table */
      .aflp-preg-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 4px; }
      .aflp-preg-table th {
        background: var(--aflr-track); padding: 3px 5px;
        border: 1px solid var(--aflr-border); font-size: 11px;
      }
      .aflp-preg-table td {
        padding: 3px 5px;
        border: 1px solid var(--aflr-border);
        text-align: center;
      }

      /* Partner history */
      .aflp-history-list { display: flex; flex-direction: column; gap: 4px; }
      .aflp-history-entry {
        background: var(--aflr-panel);
        border: 1px solid var(--aflr-border);
        border-radius: 3px; padding: 4px 7px; font-size: 12px;
      }
      .aflp-history-entry summary {
        cursor: pointer; font-weight: 500; list-style: none;
        display: flex; justify-content: space-between; align-items: center;
      }
      .aflp-history-entry summary::marker,
      .aflp-history-entry summary::-webkit-details-marker { display: none; }
      .aflp-history-date  { color: var(--aflr-text-dim); font-size: 11px; }
      .aflp-history-detail {
        padding-top: 4px;
        color: var(--aflr-text-muted);
        display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px;
      }
      .aflp-history-chip {
        background: var(--aflr-track); border-radius: 3px; padding: 1px 5px;
      }
      .aflp-history-preg { color: #a04030; font-style: italic; }
      .aflp-history-name { font-weight: 600; }
      .aflp-history-meta { display: flex; align-items: center; gap: 6px; margin-left: auto; }
      .aflp-history-holes {
        background: var(--aflr-panel-2); border-radius: 3px;
        padding: 1px 6px; font-size: 11px; font-weight: normal;
        color: var(--aflr-text-muted);
      }
      .aflp-chip-cum { color: #5a7a3a; }

      /* Buttons */
      .aflp-btn {
        background: var(--aflr-panel-2);
        border: 1px solid var(--aflr-border-gold);
        border-radius: 3px; padding: 3px 10px; font-size: 12px;
        cursor: pointer;
        font-family: var(--font-primary, serif);
        color: var(--aflr-text);
        position: relative;
        z-index: 1;
      }
      .aflp-btn:hover { background: var(--aflr-panel-2); }
      .aflp-save-btn   { background: #5a8a3a; color: #fff; border-color: #3a5a20; }
      .aflp-save-btn:hover { background: #4a7a2a; }
      .aflp-cancel-btn { background: rgba(160,60,40,0.1); border-color: #a03c28; }
      .aflp-cancel-btn:hover { background: rgba(160,60,40,0.2); }

      /* Sub-tabs */
      .aflp-subtabs {
        display: flex; gap: 2px; margin-bottom: 10px;
        border-bottom: 2px solid var(--aflr-border-gold);
      }
      .aflp-subtab {
        flex: 1; text-align: center; padding: 6px 8px; cursor: pointer;
        font-size: 13px; font-weight: 600; letter-spacing: 0.02em;
        color: var(--aflr-text-dim);
        border: 1px solid transparent; border-bottom: none;
        border-radius: 5px 5px 0 0; margin-bottom: -2px;
        transition: background 0.15s ease, color 0.15s ease;
        white-space: nowrap;
      }
      .aflp-subtab:hover { color: var(--aflr-text); background: rgba(244,183,76,0.08); }
      .aflp-subtab.active {
        color: var(--aflr-text);
        background: linear-gradient(180deg, rgba(244,183,76,0.18), rgba(244,183,76,0.06));
        border-color: var(--aflr-border-gold);
        border-bottom: 2px solid var(--aflr-ground);
      }
      .aflp-subtab-count {
        display: inline-block; min-width: 16px; padding: 0 4px; margin-left: 2px;
        font-size: 10px; line-height: 15px; border-radius: 8px;
        background: rgba(244,183,76,0.25); color: var(--aflr-text);
        vertical-align: middle;
      }
      .aflp-subtab-pane { display: none; }
      .aflp-subtab-pane.active { display: block; }
      /* Edit mode: reveal every pane at once as one scrolling form (editing is a
         deliberate full-record task; tab-hopping mid-edit is friction). Each
         pane keeps its section headers as dividers, and the subtab nav hides. */
      .aflp-edit-mode .aflp-subtab-pane { display: block; }
      .aflp-edit-mode .aflp-subtabs { display: none; }
      .aflp-edit-mode .aflp-subtab-pane + .aflp-subtab-pane { border-top: 1px solid rgba(244,183,76,0.18); margin-top: 12px; padding-top: 10px; }

      /* Titles */
      .aflp-title-banner {
        position: relative;
        margin-bottom: 8px; padding: 10px 12px; border-radius: 6px; text-align: center;
        background: linear-gradient(135deg, rgba(244,183,76,0.22), rgba(150,40,80,0.14));
        border: 1px solid var(--aflr-border-gold);
        box-shadow: inset 0 0 18px rgba(244,183,76,0.12);
      }
      .aflp-titles-toggle {
        position: absolute; top: 6px; right: 6px;
        width: 22px; height: 22px; padding: 0; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; cursor: pointer;
        background: rgba(244,183,76,0.12);
        border: 1px solid var(--aflr-border-gold); border-radius: 4px;
        color: var(--aflr-gold);
      }
      .aflp-titles-toggle:hover { background: rgba(244,183,76,0.28); color: var(--aflr-lavender); }
      .aflp-title-banner-empty { opacity: 0.6; }
      .aflp-title-banner-main {
        display: flex; align-items: center; justify-content: center; gap: 8px;
      }
      .aflp-title-banner-crown { font-size: 18px; line-height: 1; }
      .aflp-title-banner-name {
        font-size: 21px; font-weight: 700; letter-spacing: 0.02em;
        color: var(--aflr-text);
        text-shadow: 0 1px 3px rgba(0,0,0,0.5);
      }
      .aflp-title-banner-desc {
        display: block; margin-top: 2px; font-size: 11px; font-style: italic;
        color: var(--aflr-text-dim);
      }
      .aflp-title-hint { font-size: 10px; font-style: italic; color: var(--aflr-text-dim); }
      .aflp-title-list { display: flex; flex-direction: column; gap: 4px; }
      .aflp-title-chip {
        background: linear-gradient(135deg, rgba(244,183,76,0.1), rgba(244,183,76,0.04));
        border: 1px solid var(--aflr-border-gold);
        border-radius: 4px; padding: 4px 8px;
        font-size: 12px; display: flex; flex-direction: column; gap: 1px;
      }
      .aflp-title-chip.aflp-title-active {
        background: linear-gradient(135deg, rgba(244,183,76,0.28), rgba(150,40,80,0.12));
        box-shadow: inset 0 0 10px rgba(244,183,76,0.18);
      }
      .aflp-title-chip-head { display: flex; align-items: center; gap: 6px; }
      .aflp-title-star {
        flex-shrink: 0; background: none; border: none; cursor: pointer;
        font-size: 15px; line-height: 1; padding: 0; width: 18px;
        color: var(--aflr-text-dim);
        transition: color 0.15s ease, transform 0.1s ease;
      }
      .aflp-title-star:hover { color: #e8c46a; transform: scale(1.15); }
      .aflp-title-star.active { color: #f0c040; text-shadow: 0 0 6px rgba(240,192,64,0.6); }
      .aflp-title-desc { font-size: 11px; color: var(--aflr-text-muted); font-style: italic; }

      /* Active AFLR condition badges row */
      .aflp-sheet-conds { display:flex; flex-wrap:wrap; gap:5px; justify-content:center; margin:2px 0 8px; }
      .aflp-sheet-conds .aflp-cond-badge {
        display:inline-flex; align-items:center; gap:3px;
        padding:2px 8px; border-radius:10px; font-size:12px; font-weight:600; line-height:1.4;
      }
      .aflp-sheet-conds .aflp-cond-badge-val { font-size:11px; opacity:0.9; }
      .aflp-sheet-conds .aflp-cb-word { font-weight:600; letter-spacing:0.2px; }
      .aflp-sheet-conds .aflp-cond-manage {
        background:rgba(201,169,110,0.12); border:1px solid rgba(201,169,110,0.4); color:#c9a96e;
        border-radius:10px; font-size:11px; line-height:1.4; padding:2px 9px; cursor:pointer; font-weight:600;
      }
      .aflp-sheet-conds .aflp-cond-manage:hover { background:rgba(201,169,110,0.25); color:#e8c46a; }
      .aflp-sheet-conds .aflp-cond-badge.exposed    { background:rgba(200,160,80,0.2);  border:1px solid rgba(200,160,80,0.5);  color:#d0a850; }
      .aflp-sheet-conds .aflp-cond-badge.dominating { background:rgba(200,64,64,0.2);   border:1px solid rgba(200,64,64,0.55);  color:#d05858; }
      .aflp-sheet-conds .aflp-cond-badge.submitting { background:rgba(96,128,200,0.2);  border:1px solid rgba(96,128,200,0.55); color:#7090d0; }
      .aflp-sheet-conds .aflp-cond-badge.mind-break { background:rgba(200,64,160,0.2);  border:1px solid rgba(200,64,160,0.55); color:#d058b0; }
      .aflp-sheet-conds .aflp-cond-badge.defeated   { background:rgba(150,150,160,0.2); border:1px solid rgba(150,150,160,0.5); color:#9a9aa6; }
      .aflp-sheet-conds .aflp-cond-badge.defeat      { background:rgba(150,150,160,0.2); border:1px solid rgba(150,150,160,0.5); color:#9a9aa6; }
      .aflp-sheet-conds .aflp-cond-badge.bimbofied   { background:rgba(232,154,208,0.18); border:1px solid rgba(232,154,208,0.5); color:#e89ad0; }
      .aflp-sheet-conds .aflp-cond-badge.bullified   { background:rgba(200,120,80,0.18);  border:1px solid rgba(200,120,80,0.5);  color:#c87850; }
      .aflp-sheet-conds .aflp-cond-badge.birth-control { background:rgba(96,180,120,0.18); border:1px solid rgba(96,180,120,0.5); color:#7cc890; }
      .aflp-sheet-conds .aflp-cond-badge.breeding    { background:rgba(208,120,160,0.18); border:1px solid rgba(208,120,160,0.5); color:#e09ec0; }
    </style>`;
  },

  // -----------------------------------------------
  // System-aware content link
  // -----------------------------------------------
  // Resolve an AFLR content link for the active system: prefer this system's own
  // pack item (Daggerheart resolves by aflrKey through contentUuid), fall back to
  // the canonical PF2e uuid only on PF2e. Never emit a link to another system's
  // uuid - that renders as a broken link - return plain text instead.
  async _contentLink(slug, fallbackUuid, label) {
    // RESOLUTION, not system name. contentUuid falls through to the canonical
    // PF2e uuid when this system's index has no entry, so it can hand back a
    // TRUTHY string pointing into an unloaded pack - the documented trap. Both
    // candidates are therefore tested with uuidIsReal, and the label falls back
    // to plain text. Measured 11 Aug 2026 on Daggerheart: 16 of the 67 anatomy
    // rows carry a hardcoded PF2e uuid that is dead there, and every one is
    // saved by the system index. On a world with no anatomy items at all the
    // index cannot save them, and the old `system.id !== "daggerheart"` gate
    // would have rendered a broken link rather than the name.
    const enrich = (u) =>
      foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${u}]{${label}}`);
    const sysUuid = (slug ? AFLP.system?.contentUuid?.(slug) : null) ?? null;
    const live = [sysUuid, fallbackUuid].find(u => u && AFLP.uuidIsReal?.(u)) ?? null;
    if (live) return await enrich(live);
    return `<span>${label}</span>`;
  },

  // -----------------------------------------------
  // Render genitalia
  // -----------------------------------------------
  async _renderGenitalia(hasPussy, hasCock, genitalTypes, silh = "Female", isPC = true) {
    const hasTits = genitalTypes["tits"] === true;
    // Each type links to this system's pack item; subtypes without an item render
    // as plain text so the link is never broken.
    const lbl = async (slug, d) => AFLP.UI.SheetTab._contentLink(slug, d?.uuid, d?.name);
    const subtypesOf = async (parent) => (await Promise.all(
      Object.entries(AFLP.anatomyFeatures)
        .filter(([slug, d]) => d.parent === parent && genitalTypes[slug])
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(async ([slug, d]) => `<li class="aflp-subtype">${await lbl(slug, d)}</li>`)
    )).filter(Boolean);
    const listOr = (items) => items.length ? `<ul>${items.join("")}</ul>` : `<div class="aflp-none">None</div>`;

    const crotchItems = [];
    if (hasPussy) { crotchItems.push(`<li>${await lbl("pussy", AFLP.anatomyFeatures["pussy"])}</li>`); crotchItems.push(...await subtypesOf("pussy")); }
    if (hasCock)  { crotchItems.push(`<li>${await lbl("cock",  AFLP.anatomyFeatures["cock"])}</li>`);  crotchItems.push(...await subtypesOf("cock")); }
    // Same default-on rule as the throat: everyone has one unless a GM removed it.
    if (genitalTypes["ass"] !== false) { crotchItems.push(`<li>${await lbl("ass", AFLP.anatomyFeatures["ass"])}</li>`); crotchItems.push(...await subtypesOf("ass")); }
    const chestItems = [];
    // TITS OVERRIDE THE CHEST, so only one of the two is ever listed. That is the
    // `Chest` card's own rule - "If you have tits, that anatomy overrides this
    // one" - and it is the reason the coat pools merged into `bodyCoat`.
    if (hasTits)  { chestItems.push(`<li>${await lbl("tits", AFLP.anatomyFeatures["tits"])}</li>`); chestItems.push(...await subtypesOf("tits")); }
    else if (genitalTypes["chest"] !== false) { chestItems.push(`<li>${await lbl("chest", AFLP.anatomyFeatures["chest"])}</li>`); chestItems.push(...await subtypesOf("chest")); }
    const throatItems = [];
    // Every body has a throat, so it is present unless a GM has explicitly turned
    // it off. Requiring the flag meant NO actor had one - the Head pane read
    // "None" on every character - and a migration would still have missed every
    // actor created afterwards.
    if (genitalTypes["throat"] !== false) { throatItems.push(`<li>${await lbl("throat", AFLP.anatomyFeatures["throat"])}</li>`); throatItems.push(...await subtypesOf("throat")); }

    const crotch = listOr(crotchItems);
    const chest  = listOr(chestItems);
    const mouth  = listOr(throatItems);
    return { lowerBody: crotch, torso: chest, head: mouth };
  },

  // Returns the three region anatomy pieces { lowerBody, torso, head } for the
  // region-based Body layout, in edit or display form.
  async _renderGenitaliaRegions(hasPussy, hasCock, genitalTypes, editMode, bodyFeatures = {}) {
    return editMode
      ? await AFLP.UI.SheetTab._renderGenitaliaEdit(hasPussy, hasCock, genitalTypes, bodyFeatures)
      : await AFLP.UI.SheetTab._renderGenitalia(hasPussy, hasCock, genitalTypes);
  },

  // -----------------------------------------------
  // Render kinks
  // -----------------------------------------------
  // Milk track - shown only for a lactating actor. stored / capacity, with an
  // Express button (display mode) that drains the pool into units.
  _renderMilk(actor, editMode) {
    // The pool is a PF2e/5e concept. Without this the bar appeared in Daggerheart
    // the moment DH gained a Tits (Lactating) item, showing a capacity its rules
    // never mention and an Express button with nothing behind it.
    if (AFLP.system?.usesMilkPool?.() === false) return "";
    if (!AFLP.milk?.isLactating?.(actor)) return "";
    const stored = AFLP.milk.stored(actor);
    const cap = AFLP.milk.capacity(actor);
    const pct = cap > 0 ? Math.max(0, Math.min(100, Math.round((stored / cap) * 100))) : 0;
    return `
      <h3 class="aflp-subsection-header">Milk</h3>
      <div class="aflp-milk">
        <div class="aflp-milk-bar" title="${stored} / ${cap} stored">
          <div class="aflp-milk-fill" style="width:${pct}%"></div>
          <span class="aflp-milk-label">${stored} / ${cap}</span>
        </div>
        ${!editMode && stored > 0 ? `<button type="button" class="aflp-btn aflp-milk-express" style="margin-top:5px;font-size:11px">Express</button>` : ""}
      </div>`;
  },

  // Active pregnancies live in Body > Torso (this is their only home - the old
  // Breeding tab is gone). Completed ones are filtered out here and listed under
  // History instead. The edit-mode save is dirty-diff based, so omitting the
  // completed rows from this table never drops their data.
  _renderActivePregnancy(actor, pregnancy, editMode, hasPussy) {
    try {
      if (!hasPussy) return "";
      const all = pregnancy ?? {};
      const active = {};
      for (const [id, p] of Object.entries(all)) {
        if (p && typeof p === "object" && !AFLP.UI.SheetTab._pregComplete(p)) active[id] = p;
      }
      return `<div class="aflp-section" style="margin-top:10px">
          <h3 class="aflp-subsection-header">Pregnancy</h3>
          ${AFLP.UI.SheetTab._renderPregnancy(active, editMode)}
          <button type="button" class="aflp-btn aflp-process-preg-btn" style="margin-top:6px">Advance Gestation Day</button>
        </div>`;
    } catch (e) { return ""; }
  },

  // A pregnancy is finished once recordBirth marks it. That marker is
  // gestationRemaining === "Complete" (or <= 0) - there is no born/delivered
  // flag on the record.
  _pregComplete(p) {
    const g = p?.gestationRemaining;
    return g === "Complete" || (typeof g === "number" && g <= 0);
  },

  // "On your Spotlight" was a read-only panel here until 30 Aug 2026. REMOVED at
  // Ardis's instruction: *"why is that spotlight reminder even there? we shouldn't
  // have that on the sheet. even for player characters it doesn't belong in an AFLR
  // sheet."*
  //
  // It quoted any card mentioning the Spotlight back at the reader and applied
  // nothing. On an adversary it was quoting Daggerheart's OWN statblock - the
  // Brimstone Harem Drake tripped it with `Relentless (3)`, and that actor carries
  // no AFLR items at all. `AFLP.spotlightNotes` went with it; it had no other
  // caller. The Spotlight stays what it always was at the table: manual, and the
  // GM's and player's own business.
  // DO NOT REINSTATE without asking - this panel has now been removed by name.


  async _renderKinks(kinks, kinkNotes) {
    const enabled = Object.entries(AFLP.kinks)
      .filter(([slug]) => kinks[slug])
      .sort((a, b) => a[1].name.localeCompare(b[1].name));
    if (!enabled.length) return `<div class="aflp-none">None</div>`;
    const items = await Promise.all(enabled.map(async ([slug, data]) => {
      const link = await AFLP.UI.SheetTab._contentLink(slug, data.uuid, data.name);
      const note = slug === "creature-fetish" && kinkNotes?.[slug]
        ? `: <em>${kinkNotes[slug]}</em>` : "";
      return `<li>${link}${note}</li>`;
    }));
    return `<ul>${items.join("")}</ul>`;
  },

  // -----------------------------------------------
  // Render genitalia as checkboxes (edit mode)
  // -----------------------------------------------
  async _renderGenitaliaEdit(hasPussy, hasCock, genitalTypes, bodyFeatures = {}, silh = "Female", isPC = true) {
    // Body Feature toggles: manual grant/removal per the journal's optional-shed
    // rule (routes through the bodyFeatures flag on save - "the tracker is the
    // truth" governs the PIPS; the feature toggle IS the unlock state).
    const bfCheck = (hole) => {
      const meta = AFLP.BODY_FEATURES[hole];
      return `
        <li class="aflp-subtype">
          <label>
            <span>${meta.name} <em style="opacity:.7">(Body Feature)</em></span>
            <input type="checkbox" class="aflp-genitalia-check" name="bodyFeature-${hole}" ${bodyFeatures[hole] ? "checked" : ""}/>
          </label>
        </li>`;
    };
    const subtypeChecks = (parent) => Object.entries(AFLP.anatomyFeatures)
      .filter(([, d]) => d.parent === parent)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([slug, d]) => `
        <li class="aflp-subtype">
          <label>
            <span>${d.name}</span>
            <input type="checkbox" class="aflp-genitalia-check" name="genitalType-${slug}" ${genitalTypes[slug] ? "checked" : ""}/>
          </label>
        </li>`)
      .join("");
    const pussySubtypes  = subtypeChecks("pussy");
    const cockSubtypes   = subtypeChecks("cock");
    const titsSubtypes   = subtypeChecks("tits");
    const throatSubtypes = subtypeChecks("throat");
    const assSubtypes    = subtypeChecks("ass");
    const hasTits = genitalTypes["tits"] === true;

    const crotch = `
      <ul class="aflp-check-list">
        <li><label><span><strong>Pussy</strong></span><input type="checkbox" class="aflp-genitalia-check aflp-pussy-toggle" name="genitalia-pussy" ${hasPussy ? "checked" : ""}/></label></li>
        <ul class="aflp-check-list aflp-pussy-subtypes" style="${hasPussy ? "" : "display:none"}">${pussySubtypes}${bfCheck("pussy")}</ul>
        <li><label><span><strong>Cock</strong></span><input type="checkbox" class="aflp-genitalia-check aflp-cock-toggle" name="genitalia-cock" ${hasCock ? "checked" : ""}/></label></li>
        <ul class="aflp-check-list aflp-cock-subtypes" style="${hasCock ? "" : "display:none"}">${cockSubtypes}</ul>
      </ul>
      <ul class="aflp-check-list aflp-anatomy-group">
        <li><label><span><strong>Ass</strong></span><input type="checkbox" class="aflp-genitalia-check aflp-ass-toggle" name="genitalia-ass" ${genitalTypes["ass"] !== false ? "checked" : ""}/></label></li>
        <ul class="aflp-check-list aflp-ass-subtypes" style="${genitalTypes["ass"] !== false ? "" : "display:none"}">${assSubtypes}${bfCheck("anal")}</ul>
      </ul>`;
    // CHEST HAD NO CHECKBOX AT ALL until 30 Aug 2026. It was added to
    // `AFLP.anatomyFeatures` on 29 Aug as a base part and this panel was not
    // updated, so the torso pane offered Tits and nothing else - which is what
    // Ardis hit while editing the Brimstone Harem Drake.
    //
    // Default-ON like `ass` and `throat` (`!== false`), because every body has a
    // chest unless a GM turns it off. Rendered ABOVE Tits because Tits OVERRIDE
    // it - `Chest`'s own card says "If you have tits, that anatomy overrides this
    // one" - so the reading order matches the rule.
    const chestSubtypes = subtypeChecks("chest");   // none today; a future one lands here for free
    const chest = `
      <ul class="aflp-check-list">
        <li><label><span><strong>Chest</strong>${hasTits ? ` <em style="opacity:.7">(overridden by Tits)</em>` : ""}</span><input type="checkbox" class="aflp-genitalia-check aflp-chest-toggle" name="genitalia-chest" ${genitalTypes["chest"] !== false ? "checked" : ""}/></label></li>
        <ul class="aflp-check-list aflp-chest-subtypes" style="${genitalTypes["chest"] !== false ? "" : "display:none"}">${chestSubtypes}</ul>
        <li><label><span><strong>Tits</strong></span><input type="checkbox" class="aflp-genitalia-check aflp-tits-toggle" name="genitalia-tits" ${hasTits ? "checked" : ""}/></label></li>
        <ul class="aflp-check-list aflp-tits-subtypes" style="${hasTits ? "" : "display:none"}">${titsSubtypes}${bfCheck("onahole")}</ul>
      </ul>`;
    const mouth = `
      <ul class="aflp-check-list">
        <li><label><span><strong>Throat</strong></span><input type="checkbox" class="aflp-genitalia-check aflp-throat-toggle" name="genitalia-throat" ${genitalTypes["throat"] !== false ? "checked" : ""}/></label></li>
        <ul class="aflp-check-list aflp-throat-subtypes" style="${genitalTypes["throat"] !== false ? "" : "display:none"}">${throatSubtypes}${bfCheck("oral")}</ul>
      </ul>`;
    return { lowerBody: crotch, torso: chest, head: mouth };
  },

  // Shared doll frame - silhouette + region hotspots. Content per region is passed
  // in so edit (checkboxes) and display (read-only lists) share one layout. Regions:
  // lower-body (genitals), torso (tits + belly), head (mouth + face).
  _dollShell(silh, lowerBodyHtml, torsoHtml, headHtml, activeRegion = "lower-body") {
    const SIL = (g) => `modules/ardisfoxxs-lewd-pf2e/assets/Lewd%20Tokens/Silhouette${g}.png`;
    const act = (r) => activeRegion === r ? " aflp-doll-active" : "";
    // Hotspot heights per silhouette: the humanoid dolls put head/torso/crotch
    // at the usual places; the Monster stack hovers head over the goblin and
    // dragon heads, torso over the wolf, lower body over the horse's tummy.
    const HOT = silh === "Monster"
      ? { head: "12%", torso: "48%", lower: "75%" }
      : { head: "8%",  torso: "26%", lower: "46%" };
    const show = (r) => activeRegion === r ? "" : "display:none";
    return `
      <div class="aflp-doll-wrap">
        <div class="aflp-doll-col">
          <div class="aflp-doll" data-silh="${silh}" style="background-image:url('${SIL(silh)}')">
          <button type="button" class="aflp-doll-hot${act("head")}"  data-region="head"  style="top:${HOT.head}"  title="Head - mouth & face"></button>
          <button type="button" class="aflp-doll-hot${act("torso")}" data-region="torso" style="top:${HOT.torso}" title="Torso - tits & belly"></button>
          <button type="button" class="aflp-doll-hot${act("lower-body")}" data-region="lower-body" style="top:${HOT.lower}" title="Lower body"></button>
          <button type="button" class="aflp-doll-flip" title="Flip silhouette">&#8646;</button>
          </div>
          <div class="aflp-doll-caption">${ {head:"Head", torso:"Torso", "lower-body":"Lower body"}[activeRegion] ?? "" }</div>
        </div>
        <div class="aflp-doll-slots">
          <div class="aflp-doll-panel" data-region="lower-body" style="${show("lower-body")}">${lowerBodyHtml}</div>
          <div class="aflp-doll-panel" data-region="torso" style="${show("torso")}">${torsoHtml}</div>
          <div class="aflp-doll-panel" data-region="head" style="${show("head")}">${headHtml}</div>
        </div>
      </div>`;
  },

  // -----------------------------------------------
  // Render kinks as checkboxes (edit mode)
  // -----------------------------------------------
  _renderKinksEdit(kinks, kinkNotes) {
    const items = Object.entries(AFLP.kinks)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([slug, data]) => {
        const checked = kinks[slug] ? "checked" : "";
        const noteField = slug === "creature-fetish"
          ? `<div class="aflp-kinknote">
               <input type="text" class="aflp-input aflp-kinknote-input" name="kinknote-creature-fetish"
                 placeholder="Fetish note…" value="${(kinkNotes?.["creature-fetish"] ?? "").replace(/"/g, '&quot;')}"
                 style="display:${kinks[slug] ? "block" : "none"}"/>
             </div>`
          : "";
        return `
          <li>
            <label>
              <span>${data.name}</span>
              <input type="checkbox" class="aflp-kink-check" name="kink-${slug}" data-slug="${slug}" ${checked}/>
            </label>
            ${noteField}
          </li>`;
      }).join("");
    return `<ul class="aflp-check-list">${items}</ul>`;
  },

  // -----------------------------------------------
  // Render cumflation bars
  // -----------------------------------------------
  // Size Training: three 6-pip tracks (pussy/throat/ass). A hole's row only
  // renders once it has 1+ pips (untouched sheets show nothing new). Click a pip
  // to set that hole's training; at 6 the hole's Body Feature unlocks, at 18
  // total the Size Difference kink unlocks. GM/owner clickable in view mode.
  async _renderSizeTraining(actor, hasPussy, holeFilter = null) {
    const train = AFLP.sizeTrainingOf(actor);
    const bf    = actor.getFlag(AFLP.FLAG_SCOPE, "bodyFeatures") ?? {};
    const MAX   = AFLP.SIZE_TRAIN_MAX;
    // pussy row only for actors with a pussy; throat/ass always trainable.
    const holes = [
      hasPussy ? { key: "pussy", label: "Pussy", feat: "Size Queen" }   : null,
      { key: "oral", label: "Throat", feat: "Throat Goat" },
      { key: "anal", label: "Ass",    feat: "Gape Glutton" },
      // Nipple training, only for an actor whose tits can actually be fucked.
      (actor.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["tits-onahole"]
        ? { key: "onahole", label: "Tits", feat: "Paizuri Slut" } : null,
    ].filter(Boolean).filter(h => !holeFilter || holeFilter.includes(h.key));
    if (!holes.length) return "";

    const ICON = { pussy: "SizePussy", oral: "SizeThroat", anal: "SizeAss", onahole: "SizeTits" };
    const rows = await Promise.all(holes.map(async h => {
      const pips = Math.max(0, Math.min(MAX, train[h.key] ?? 0));
      // Always render, even at 0 pips: the guide (design-authoritative) says the
      // tracks are shown on the sheet, and click-to-set is the GM's manual entry
      // path - an untrained actor must still have pips to click. (Originally
      // hidden at 0 to keep sheets clean; that read as "not built" and blocked
      // manual training entry entirely.)
      const unlocked = !!bf[h.key];
      const dots = Array.from({ length: MAX }, (_, i) =>
        `<span class="aflp-pip aflp-sizetrain-pip${i < pips ? " filled" : ""}"
               data-pip-type="sizetrain" data-hole="${h.key}" data-pip-index="${i}"
               title="${h.label} training ${i+1}/${MAX} - click to set"></span>`
      ).join("");
      const bfMeta = AFLP.BODY_FEATURES[h.key] ?? {};
      // Unlocked Body Features render under the pips as a content link (resolves
      // via aflrKey once the pack items exist; plain label until then) so the
      // player can read what the feature does.
      const featLine = unlocked
        ? `<div class="aflp-sizetrain-featline" title="Body Feature unlocked (hole size +1)">${await AFLP.UI.SheetTab._contentLink(bfMeta.slug, bfMeta.uuid, bfMeta.name ?? h.feat)}</div>`
        : "";
      const icon = `<img class="aflp-track-icon" src="${AFLP.lewdTokenPath(ICON[h.key] + Math.max(0, Math.min(6, pips)) + ".webp")}" alt="" onerror="this.style.display='none'"/>`;
      return `<div class="aflp-sizetrain-row">
      ${icon}<span class="aflp-sizetrain-label">${h.label}</span>
      <span class="aflp-pip-bar" data-bar-type="sizetrain">${dots}</span>
    </div>${featLine}`;
    }));
    const rowsHtml = rows.join("");

    return `<h3 class="aflp-subsection-header">Size Training</h3>
      <div class="aflp-sizetrain">${rowsHtml}</div>`;
  },

  // Read-only size readout: the cock and hole sizes that feed the size-gap bonus
  // (gap = cock size - hole size). Derived from body size + training, so not editable.
  _renderSizeReadout(actor, show = null) {
    try {
      const hasCock  = actor?.getFlag(AFLP.FLAG_SCOPE, "cock") === true;
      const hasPussy = actor?.getFlag(AFLP.FLAG_SCOPE, "pussy") === true;
      const all = [
        hasCock  ? { k: "cock",    label: "Cock",   v: AFLP.cockSizeOf(actor) }              : null,
        hasPussy ? { k: "vaginal", label: "Pussy",  v: AFLP.holeSizeOf(actor, "vaginal") }   : null,
        { k: "anal", label: "Ass",    v: AFLP.holeSizeOf(actor, "anal") },
        { k: "oral", label: "Throat", v: AFLP.holeSizeOf(actor, "oral") },
        // Tits size is the container: what sets milk capacity, and the onahole's
        // hole size for size difference. Swell (what is sloshing in them) is shown
        // beside it, not folded into it.
        // Tits use CUP bands rather than the creature-size words: "Gargantuan" reads
        // wrong on a chest, and the number still carries the mechanics.
        AFLP.titsSize(actor) > 0 ? { k: "tits", label: "Tits", v: AFLP.titsSize(actor), swell: AFLP.titsSwell(actor), word: AFLP.titsCupWord(AFLP.titsSize(actor)) } : null,
      ].filter(Boolean).filter(x => !show || show.includes(x.k));
      if (!all.length) return "";
      const parts = all.map(x => {
        const w = x.word ?? AFLP.sizeWord?.(x.v) ?? "";
        // A WORD, not a number. Swell is size plus fluid tiers, which are two
        // different scales, so its sum sits on no ladder - "swollen to 10" on a
        // 1-6 size row is nonsense. How swollen is already legible in the
        // Cumflated pips and the token art right below.
        const sw = (x.swell > x.v) ? `<em class="aflp-size-word">swollen</em>` : "";
        return `<span>${x.label} <strong>${x.v}</strong>${w ? `<em class="aflp-size-word">${w}</em>` : ""}${sw}</span>`;
      });
      // Tits are measured in CUP bands, not creature sizes, and size difference
      // only means anything on a body with Tits (Onahole) - describing it on every
      // chest was telling most players about a hole they do not have.
      const _hasOna = (actor.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["tits-onahole"] === true;
      const _tip = "Cock and hole sizes sit on the creature size ladder - Tiny 1, Small 2, Medium 3, Large 4, Huge 5, Gargantuan 6. "
        + "Tits are measured in cup bands instead: 1 A-C, 2 D-F, 3 G-I, 4 J-L, 5 M-O, 6 P-R, 7 S-U, 8 V-Z, and they set how much milk you hold."
        + (_hasOna ? " A cock bigger than the hole it fills is a size difference: Stuffed, Stretched, or Ruined." : "");
      return `<div class="aflp-size-readout" title="${_tip}" style="margin-top:6px">${parts.join("")}</div>`;
    } catch (e) { return ""; }
  },

  // -----------------------------------------------
  async _renderCumflationRows(cumflation, totalTier, actor, opts = {}) {
    const { holeFilter = null } = opts;   // overall/Belly row retired
    const BLINDED_UUID = AFLP.sysUuid?.("Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2") ?? "Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2";
    // Cumflation tier effects and the facial vision conditions are PF2e content;
    // on Daggerheart they have no pack item, so show plain tier text (no broken link).
    const isDH = game.system?.id === "daggerheart";

    // The chest coat (a paizuri finish and a body-coat are the same deposit) shows
    // as one row for any actor with tits (migrated off the My Body is a Weapon feat,
    // kept as a legacy path), or if the pool already holds cum.
    const _hasTits = (actor?.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["tits"] === true;
    const _hasOnahole = (actor?.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["tits-onahole"] === true;
    // EVERY BODY HAS A CHEST. Ardis, 29 Aug 2026: *"all actors do have a body coat,
    // just not all have a chest coat"* - so the section must exist for a
    // flat-chested character too, not appear only once cum has landed on them.
    //
    // Gated the way `ass` is and for the same reason: `anatomyFeatures.chest`
    // defaults ON and only an explicit `false` hides it, so no existing actor needs
    // migrating and a GM can still remove it. The tits / My Body is a Weapon /
    // pool-holds-cum clauses are kept beneath it as escapes - an existing fill must
    // never vanish off the sheet even if a GM has removed the chest.
    const _hasChest = (actor?.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["chest"] !== false;
    const showChest = _hasChest
      || _hasTits
      || actor?.getFlag(AFLP.FLAG_SCOPE, "myBodyIsAWeapon") === true
      || (cumflation.bodyCoat ?? 0) > 0;
    // The onahole reservoir (cum fucked INTO the nipples) is its own engorgement
    // row - shown for an onahole actor or if the pool holds cum.
    const showOnahole = _hasOnahole || (cumflation.onahole ?? 0) > 0;
    // Vaginal and anal are gated the same way the chest and onahole rows already
    // are, and by the SAME rules the anatomy list further down uses - not a new
    // convention:
    //   pussy is a TOP-LEVEL flag and defaults OFF (`!!getFlag("pussy")`, which is
    //     how `hasPussy` reads it), so a creature without one has no vaginal row;
    //   ass lives in `anatomyFeatures` and defaults ON - "everyone has one unless
    //     a GM removed it" - so only an explicit `false` hides the anal row.
    // Both keep the "or the pool already holds cum" escape, for the same reason
    // showOnahole has it: an existing fill must never vanish off the sheet.
    //
    // Reported by Ardis 15 Aug 2026. The Bondage Mimic Chest is a maw with no
    // pussy and no ass and still showed vaginal and anal pips, which reads as
    // "these holes exist and are empty" rather than "these do not exist".
    const showVaginal = !!actor?.getFlag(AFLP.FLAG_SCOPE, "pussy") || (cumflation.vaginal ?? 0) > 0;
    const showAnal = (actor?.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["ass"] !== false
      || (cumflation.anal ?? 0) > 0;
    const holeList = [
      "oral",
      ...(showVaginal ? ["vaginal"] : []),
      ...(showAnal ? ["anal"] : []),
      "facial",
      ...(showChest ? ["bodyCoat"] : []),
      ...(showOnahole ? ["onahole"] : []),
    ].filter(h => !holeFilter || holeFilter.includes(h));
    // Row labels. `onahole` is the tits HOLE (cum in) and reads "Tits"; `bodyCoat`
    // is the chest SURFACE (cum on) and always reads "Chest", including on an actor
    // with tits. Two rows both labelled "Tits" told apart only by their Cumflated /
    // Coated heading was too easy to misread at a glance.
    // `bodyCoat` reads "Chest Coat", not "Chest". Ardis, 29 Aug 2026: the card text
    // must name this pool exactly as the user sees it on their own sheet. It
    // rendered as "Chest \u00b7 coated", so a card saying "Chest Coat" would have
    // quoted a string that does not appear anywhere - the label is brought to the
    // card's words rather than the other way round.
    // `facial` reads "Facial Coat" for the same reason `bodyCoat` reads "Chest
    // Coat" - Ardis, 29 Aug 2026: the two coats are the same kind of thing and a
    // card that names one has to be able to name the other the same way. The row
    // already carries "· coated" beside it; the label is what a card quotes.
    const HOLE_LABEL = { oral: "Oral", vaginal: "Vaginal", anal: "Anal", facial: "Facial Coat", bodyCoat: "Chest Coat", onahole: "Tits" };
    // Filled = cum INSIDE a hole, coated = cum ON a surface. This used to be a
    // heading above each group, which sat over the row's ICON rather than over the
    // pips it described. On the row it also disambiguates the Torso, where BOTH
    // rows are called Tits - the reservoir and the chest coat.
    const HOLE_KIND = { oral: "filled", vaginal: "filled", anal: "filled", onahole: "filled",
                        facial: "coated", bodyCoat: "coated" };

    const rows = await Promise.all(holeList.map(async hole => {
      const tier    = cumflation[hole] ?? 0;
      const maxPips = AFLP.CUMFLATION_MAX ?? 8;  // every pool shares one cap
      const pips    = Array.from({ length: maxPips }, (_, i) =>
        `<span class="aflp-pip aflp-cumflation-pip${i < tier ? " filled" : ""}"
               data-pip-type="cumflation" data-hole="${hole}" data-pip-index="${i}"
               title="${hole} tier ${i+1}/8 - click to set"></span>`
      ).join("");

      let link = "";
      if (tier > 0) {
        // The chest pool is one pool but reads two ways: a tits-having actor gets
        // the tits ladder, everyone else the neutral body-coat one.
        const wordHole = (hole === "bodyCoat" && _hasTits) ? "tits" : hole;
        const w = AFLP.cumflationWordForTier?.(tier, wordHole);
        const wordHtml = w
          ? `<span style="color:${w.color};font-weight:600;">${w.word}</span>`
          : `Tier ${tier}`;
        // A Foundry content link paints itself with its own chip colour, which
        // threw away the tier colour the plain rows show. Tint the wrapper and
        // have the anchor inherit, so linked and unlinked rows read alike.
        const tint = (html) => `<span class="aflp-cf-tint" style="color:${w?.color ?? "var(--aflr-text,#e8e0ee)"}">${html}</span>`;
        if (hole === "facial") {
          // Blinded at 8 only - Dazzled at 4 was retired so every pool reads the
          // same: nothing until 8, one effect at 8.
          // RESOLUTION, not system name. `!isDH` was true on 5e, where this
          // hardcoded PF2e uuid is just as dead as it is on Daggerheart.
          const visionUuid = (tier >= 8 && AFLP.uuidIsReal?.(BLINDED_UUID)) ? BLINDED_UUID : null;
          link = visionUuid
            ? tint(await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${visionUuid}]{${w?.word ?? `Tier ${tier}`}}`))
            : wordHtml;
        } else {
          // One item per pool now - the same link at every tier. The tier's detail
          // is the word itself, and the item states the rule that lands at 8.
          const uuid = (hole === "bodyCoat")
            ? AFLP.coatItems?.["cumcoat-tits"]
            : AFLP.cumflationItems?.[hole];
          // RESOLUTION, not system name - same reason as the vision link above.
          link = (uuid && AFLP.uuidIsReal?.(uuid))
            ? tint(await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${uuid}]{${w?.word ?? `Tier ${tier}`}}`))
            : wordHtml;
        }
      }

      // Hole-specific icon by fill level. Facial/paizuri use their own naming
      // conventions (CoatedFacialN / CumflatedPaizuriN); if those asset
      // files are not present yet, onerror hides the img rather than showing a
      // broken icon. The generic CumflatedN set belongs to the Overall row.
      // Coated areas use the Coated* sets; filled holes use Cumflated*. Tits are
      // on both sides and need different art: CumflatedTits is the nipple
      // reservoir, CoatedTits is cum over the chest. They used to share one set.
      // Coated areas with their own art use the Coated* sets: CoatedFacial for the
      // face, CoatedTits for a chest with tits. CumflatedTits is a DIFFERENT set -
      // the nipple reservoir, filled from inside. The rest keep Cumflated* names;
      // there is no CoatedBodyCoat or CoatedPaizuri on disk.
      // `CoatedChest` for a body without tits, added 29 Aug 2026 when Ardis supplied
      // the art. The old fallback was `CumflatedBodyCoat`, and **that set has never
      // existed on disk** - measured, 404 at every tier including 0 - so a
      // flat-chested actor with a chest coat has always rendered with the icon
      // hidden by its own onerror handler. The `Coated*` name is also the correct
      // convention: this is cum ON a surface, not filling a hole.
      // The full set 0-8 is on disk - measured 200 at every tier, 29 Aug 2026 -
      // so every tier renders. STALE WHEN: a tier goes missing from the assets
      // folder, which shows as the icon vanishing rather than as an error.
      const ICON_SET = { oral: "CumflatedOral", vaginal: "CumflatedVaginal", anal: "CumflatedAnal", onahole: "CumflatedTits", facial: "CoatedFacial", paizuri: "CumflatedPaizuri", bodyCoat: _hasTits ? "CoatedTits" : "CoatedChest" };
      const iconFile = (ICON_SET[hole] ?? "Cumflated") + Math.max(0, Math.min(AFLP.CUMFLATION_MAX ?? 8, tier)) + ".webp";
      return `
        <div class="aflp-cum-row">
          <img class="aflp-track-icon" src="${AFLP.lewdTokenPath(iconFile)}" alt="" onerror="this.style.display='none'"/>
          <span class="aflp-cum-row-label">${HOLE_LABEL[hole] ?? (hole.charAt(0).toUpperCase() + hole.slice(1))}${HOLE_KIND[hole] ? `<span class="aflp-cum-row-kind">\u00b7 ${HOLE_KIND[hole]}</span>` : ""}</span>
          <div class="aflp-cum-col">
            <div class="aflp-pip-bar">${pips}</div>
            <span class="aflp-cum-row-link">${tier > 0 ? link : "<span style='color:#999;font-style:italic;font-size:11px'>Clear</span>"}</span>
          </div>
        </div>`;
    }));

    return rows.join("");
  },

  // -----------------------------------------------
  // Render pregnancy table
  // -----------------------------------------------
  _renderPregnancy(pregnancy, editMode = false) {
    const entries = Object.entries(pregnancy);

    const emptyMsg = editMode
      ? ""
      : (entries.length ? "" : `<div class="aflp-none">No active pregnancies.</div>`);

    const rows = entries.map(([id, p]) => {
      const isComplete = p.gestationRemaining === "Complete" || p.gestationRemaining <= 0;

      if (editMode) {
        // Full edit: every field is an input
        return `
          <tr data-preg-id="${id}">
            <td style="text-align:left">
              <input class="aflp-input" type="text"
                name="preg.${id}.sourceName"
                value="${(p.sourceName ?? "Unknown").replace(/"/g, "&quot;")}"
                style="width:100%;min-width:70px;" placeholder="Source name"/>
            </td>
            <td>
              <select class="aflp-input" name="preg.${id}.deliveryType"
                style="font-size:11px;padding:1px 4px;">
                <option value="live"${p.deliveryType !== "egg" ? " selected" : ""}>Live</option>
                <option value="egg"${p.deliveryType === "egg" ? " selected" : ""}>Egg</option>
              </select>
            </td>
            <td>
              <input class="aflp-input" type="number" min="1"
                name="preg.${id}.offspring"
                value="${p.offspring ?? 1}"
                style="width:38px;text-align:center;"/>
            </td>
            <td style="text-align:center">
              ${isComplete ? `<span style="color:#aaa">Complete</span>` : `
                <input class="aflp-input" type="number" min="0"
                  name="preg.${id}.gestationRemaining"
                  value="${p.gestationRemaining}"
                  style="width:38px;text-align:center;"
                  title="Days remaining"/>
                <span style="color:#aaa;font-size:10px;margin:0 2px">/</span>
                <input class="aflp-input" type="number" min="1"
                  name="preg.${id}.gestationTotal"
                  value="${p.gestationTotal}"
                  style="width:38px;text-align:center;"
                  title="Total gestation days"/>
              `}
            </td>
            <td>
              <button type="button" class="aflp-btn aflp-preg-remove-btn"
                data-preg-id="${id}"
                style="font-size:10px;padding:1px 5px;color:#c05040;border-color:rgba(200,60,40,0.4);"
                title="Remove this pregnancy">&#10005;</button>
            </td>
          </tr>`;
      }

      // View mode
      let gestationCell;
      if (isComplete) {
        gestationCell = `<td style="text-align:center">Complete</td>`;
      } else {
        const pct     = Math.round(((p.gestationTotal - p.gestationRemaining) / p.gestationTotal) * 100);
        const barFill = `background:linear-gradient(90deg,#c9a96e ${pct}%,rgba(201,169,110,0.15) ${pct}%)`;
        gestationCell = `<td>
          <div title="${p.gestationRemaining} days remaining of ${p.gestationTotal}"
               style="display:flex;align-items:center;gap:5px;">
            <div style="flex:1;height:6px;border-radius:3px;border:1px solid #c9a96e44;${barFill};min-width:40px;"></div>
            <span style="font-size:11px;color:#aaa;white-space:nowrap;">${p.gestationRemaining}d</span>
          </div>
        </td>`;
      }

      const deliverBtn = !isComplete
        ? `<td><button type="button" class="aflp-btn aflp-deliver-btn" data-preg-id="${id}" style="font-size:11px;padding:1px 6px">Deliver</button></td>`
        : `<td></td>`;

      return `
        <tr>
          <td style="text-align:left">${p.sourceName ?? "Unknown"}</td>
          <td>${p.deliveryType === "egg" ? "Egg" : "Live"}</td>
          <td>${p.offspring ?? 1}</td>
          ${gestationCell}
          ${deliverBtn}
        </tr>`;
    }).join("");

    const addBtn = editMode
      ? `<button type="button" class="aflp-btn aflp-preg-add-btn" style="margin-top:6px;font-size:11px;padding:2px 10px;">+ Add Pregnancy</button>`
      : "";

    if (!entries.length && !editMode) return emptyMsg;

    return `
      <table class="aflp-preg-table">
        <thead><tr>
          <th style="text-align:left">Source</th><th>Type</th><th>Count</th><th>${editMode ? "Gestation (rem / total)" : "Gestation"}</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${addBtn}`;
  },

  // -----------------------------------------------
  // Render partner history
  // -----------------------------------------------
  _renderHistory(history, editMode = false, pregnancy = null) {
    if (!history.length) return `<div class="aflp-none">No history yet.</div>`;
    // Pregnancy records carry sourceUuid + startedAt; history entries carry
    // sourceUuid + date, both in worldTime. Matching on the pair identifies the
    // exact conception even when the same partner sired more than one, and never
    // relies on names (actor names collide freely).
    const pregList = Object.values(pregnancy ?? {}).filter(p => p && typeof p === "object");
    const matchPreg = (entry) => {
      if (!entry?.sourceUuid) return null;
      return pregList.find(p => p.sourceUuid === entry.sourceUuid && p.startedAt === entry.date) ?? null;
    };
    return `<div class="aflp-history-list">` + history.map((entry, idx) => {
      const holes   = (entry.holes ?? []).map(h => h.charAt(0).toUpperCase() + h.slice(1)).join(", ") || "-";
      const mlR     = (entry.mlReceived ?? 0).toLocaleString();
      const mlG     = (entry.mlGiven    ?? 0).toLocaleString();

      const cumDelta = entry.cumflationDelta ?? null;
      const cumChips = cumDelta
        ? Object.entries(cumDelta)
            .filter(([, v]) => v !== 0)
            .map(([hole, v]) => `<span class="aflp-history-chip aflp-chip-cum">📈 ${hole} +${v}</span>`)
            .join("")
        : "";

      const pregChip = (() => {
        if (!entry.pregnancyResult) return "";
        const isEgg = entry.pregnancyResult.deliveryType === "egg";
        const n = entry.pregnancyResult.offspring;
        const kind = isEgg ? (n === 1 ? "egg" : "eggs") : (n === 1 ? "offspring" : "offspring");
        // Outcome, when the matching pregnancy record is still on the actor: in
        // progress shows how far along, finished shows how it ended. A record that
        // has since been removed just leaves the impregnation line as it was.
        const p = matchPreg(entry);
        let tail = "";
        if (p) {
          if (AFLP.UI.SheetTab._pregComplete(p)) tail = isEgg ? " → laid" : " → delivered";
          else {
            const total = Number(p.gestationTotal) || 0;
            const rem = Number(p.gestationRemaining);
            if (total > 0 && Number.isFinite(rem)) tail = ` → day ${Math.max(0, total - rem)}/${total}`;
            else tail = " → carrying";
          }
        }
        return `<span class="aflp-history-chip aflp-history-preg">🥚 Impregnated: ${n} ${kind}${tail}</span>`;
      })();

      const holeTag = entry.holes?.length
        ? `<span class="aflp-history-holes">${holes}</span>`
        : "";

      const deleteBtn = editMode
        ? `<button type="button" class="aflp-btn aflp-history-delete-btn" data-history-idx="${idx}"
             style="font-size:10px;padding:0 5px;line-height:1.4;background:rgba(160,60,40,0.1);border-color:#a03c28;margin-left:4px;"
             title="Remove this entry">✕</button>`
        : "";

      return `
        <details class="aflp-history-entry">
          <summary>
            <span class="aflp-history-name">${entry.sourceName ?? "Unknown"}</span>
            <span class="aflp-history-meta">${holeTag}${deleteBtn}</span>
          </summary>
          <div class="aflp-history-detail">
            ${entry.mlReceived != null ? `<span class="aflp-history-chip">💧 ${mlR} ml received</span>` : ""}
            ${(entry.mlGiven ?? 0) > 0 ? `<span class="aflp-history-chip">⬆ ${mlG} ml given</span>` : ""}
            ${cumChips}
            ${pregChip}
            ${!entry.mlReceived && !(entry.mlGiven > 0) && !cumChips && !pregChip ? `<span class="aflp-none">No details recorded.</span>` : ""}
          </div>
        </details>`;
    }).join("") + `</div>`;
  },

  // -----------------------------------------------
  // Render the large title banner at the top of the tab.
  // Shows the player's chosen display title (set via the star toggle on the
  // Titles tab), defaulting to the most recently earned title.
  // -----------------------------------------------
  // Active AFLR condition badges for the sheet, read through AFLP.cond so they
  // resolve identically on item-based (PF2e) and flag-based (DH/5e) systems.
  // Horny/Denied/Arousal have their own dedicated rows, so they're not repeated
  // here; this row surfaces the role/state conditions at a glance.
  _renderConditionBadges(actor) {
    const badge = (glyph, val, cls, label) => {
      const valStr = (val > 1) ? `<span class="aflp-cond-badge-val">${val}</span>` : "";
      return `<span class="aflp-cond-badge ${cls}" title="${label}"><span class="aflp-cb-ico">${glyph}${valStr}</span> <span class="aflp-cb-word">${label}</span></span>`;
    };
    const isDH = game.system?.id === "daggerheart";
    const out = [];
    if (AFLP.cond.has(actor, "dominating")) out.push(badge("▲", 1, "dominating", "Dominating"));
    if (AFLP.cond.has(actor, "submitting")) out.push(badge("▼", 1, "submitting", "Submitting"));
    const exp = AFLP.cond.value(actor, "exposed");
    if (exp > 0) out.push(badge("✦", exp, "exposed", "Exposed"));
    // Mind Break: a valued condition on PF2e; on Daggerheart it is a death move
    // (a state, not a token track), so show it without a count there.
    const mb = AFLP.cond.value(actor, "mind-break");
    if (mb > 0) out.push(badge("✲", isDH ? 1 : mb, "mind-break", "Mind Break"));
    const bim = AFLP.cond.value(actor, "bimbofied");
    if (bim > 0) out.push(badge("❀", bim, "bimbofied", "Bimbofied"));
    const bul = AFLP.cond.value(actor, "bullified");
    if (bul > 0) out.push(badge("♂", bul, "bullified", "Bullified"));
    // Defeat: DH token track (valued) vs PF2e Defeated boolean item.
    if (isDH) {
      const df = AFLP.cond.value(actor, "defeat");
      if (df > 0) out.push(badge("☠", df, "defeat", "Defeat"));
    } else if (AFLP.cond.has(actor, "defeated")) {
      out.push(badge("☠", 1, "defeated", "Defeated"));
    }
    if (AFLP.cond.has(actor, "birth-control")) out.push(badge("⊘", 1, "birth-control", "Birth Control"));
    if (AFLP.cond.has(actor, "breeding")) out.push(badge("⚸", AFLP.cond.value(actor, "breeding") || 3, "breeding", "Fertility"));
    const isGM = game.user.isGM;
    // Status display lives OUTSIDE the sheet: the hex panel cascades down the
    // window's right side as a body-mounted dock (aflp-status-panel.js). The
    // in-sheet slot keeps only the GM's manage button; the legacy chips above
    // render solely as a fallback if the status panel module failed to load.
    const body = AFLP.StatusPanel ? "" : out.join("");
    if (!body && !isGM) return "";
    const manageBtn = isGM
      ? `<button type="button" class="aflp-cond-manage" title="Manage conditions (GM)">⚙ Conditions</button>`
      : "";
    return `<div class="aflp-sheet-conds">${body}${manageBtn}</div>`;
  },

  // GM-only manager to manually set AFLR state conditions, replacing the old
  // "drag the compendium item" workflow now that these are flag-backed. Writes
  // everything through AFLP.cond so it behaves identically on every system.
  // DialogV2 strips <style> tags from content, so the manager's CSS is injected
  // once into document.head instead (idempotent via the element id).
  _ensureConditionManagerCSS() {
    if (document.getElementById("aflp-cm-styles")) return;
    const style = document.createElement("style");
    style.id = "aflp-cm-styles";
    style.textContent = `
      /* SCROLLS RATHER THAN GROWS. 32 rows is taller than a short screen, and a
         dialog whose Apply button is off the bottom edge is worse than a long
         one. max-width keeps the chip rows from stretching across a wide monitor
         into one unreadable line. */
      .aflp-cm { display:flex; flex-direction:column; gap:12px; padding:4px 2px 2px; min-width:264px; max-width:760px; max-height:68vh; overflow-y:auto; font-family:var(--font-primary, serif); }
      .aflp-cm-ro-wrap > summary { cursor:pointer; list-style:none; user-select:none; }
      .aflp-cm-ro-wrap > summary::-webkit-details-marker { display:none; }
      .aflp-cm-ro-wrap > summary::before { content:"▸ "; opacity:0.7; }
      .aflp-cm-ro-wrap[open] > summary::before { content:"▾ "; }
      .aflp-cm-ro-wrap { gap:6px; }
      .aflp-cm-head { display:flex; align-items:center; justify-content:center; gap:8px; padding-bottom:9px; border-bottom:1px solid rgba(201,169,110,0.3); }
      .aflp-cm-head-ico { color:#c9a96e; font-size:13px; opacity:0.8; }
      .aflp-cm-actor { font-weight:700; font-size:15px; color:#e8c46a; letter-spacing:0.3px; }
      .aflp-cm-section { display:flex; flex-direction:column; gap:7px; }
      .aflp-cm-label { font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#c9a96e; opacity:0.7; font-weight:700; }
      .aflp-cm-chips { display:flex; flex-wrap:wrap; gap:6px; }
      .aflp-cm-chip {
        display:inline-flex; align-items:center; gap:5px; cursor:pointer; user-select:none;
        padding:5px 12px; border-radius:14px; font-size:12px; font-weight:600; width:fit-content;
        border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.04);
        color:#cabfa6; transition:all 0.12s ease;
      }
      .aflp-cm-chip:hover { border-color:rgba(255,255,255,0.4); background:rgba(255,255,255,0.08); }
      .aflp-cm-chip input { display:none; }
      .aflp-cm-chip-ico { font-size:13px; line-height:1; }
      /* THE GENERIC ON STATE. Every checked rule below this one is keyed to a
         class the OLD hand-written markup emitted; the table-driven chips emit
         aflp-cm-toggle instead, so without this a clicked chip looked identical
         to an unclicked one and the only way to know it had taken was to press
         Apply. A toggle that gives no feedback is not a toggle.
         The per-key accents underneath are colour, not state - this rule is what
         says ON. */
      .aflp-cm-chip.aflp-cm-toggle:has(input:checked) {
        background:rgba(201,169,110,0.2); border-color:#c9a96e; color:#e8c46a;
        box-shadow:0 0 9px rgba(201,169,110,0.32);
      }
      .aflp-cm-chip.aflp-cm-toggle:has(input:checked) .aflp-cm-chip-ico { color:#e8c46a; }
      /* A few carry their own colour so a full row of gold is still readable. */
      .aflp-cm-chip.cm-dizzy:has(input:checked)      { background:rgba(201,160,220,0.22); border-color:#c9a0dc; color:#e0c0f0; box-shadow:0 0 9px rgba(201,160,220,0.32); }
      .aflp-cm-chip.cm-posed:has(input:checked)      { background:rgba(185,166,201,0.22); border-color:#b9a6c9; color:#dcc8ec; box-shadow:0 0 9px rgba(185,166,201,0.32); }
      .aflp-cm-chip.cm-lustful:has(input:checked)    { background:rgba(232,132,180,0.22); border-color:#e884b4; color:#f4aed0; box-shadow:0 0 9px rgba(232,132,180,0.32); }
      .aflp-cm-chip.cm-hypnotized:has(input:checked),
      .aflp-cm-chip.cm-entranced:has(input:checked)  { background:rgba(140,120,200,0.22); border-color:#8c78c8; color:#c0b0ec; box-shadow:0 0 9px rgba(140,120,200,0.32); }
      .aflp-cm-chip.cm-chaste:has(input:checked),
      .aflp-cm-chip.cm-caged:has(input:checked),
      .aflp-cm-chip.cm-plugged:has(input:checked)    { background:rgba(200,90,90,0.22); border-color:#c85a5a; color:#eca0a0; box-shadow:0 0 9px rgba(200,90,90,0.3); }
      .aflp-cm-chip.role-none:has(input:checked)       { background:rgba(201,169,110,0.18); border-color:#c9a96e; color:#e8c46a; }
      .aflp-cm-chip.role-dominating:has(input:checked) { background:rgba(200,64,64,0.22);  border-color:#d05858; color:#ec8e8e; box-shadow:0 0 9px rgba(200,64,64,0.35); }
      .aflp-cm-chip.role-submitting:has(input:checked) { background:rgba(96,128,200,0.22); border-color:#7090d0; color:#a6bcec; box-shadow:0 0 9px rgba(96,128,200,0.35); }
      .aflp-cm-chip.state-defeated:has(input:checked)  { background:rgba(150,150,160,0.26); border-color:#9a9aa6; color:#cfcfd8; }
      .aflp-cm-chip.fx-birth-control:has(input:checked) { background:rgba(96,180,120,0.22); border-color:#5fb478; color:#9ad8a8; box-shadow:0 0 9px rgba(96,180,120,0.3); }
      .aflp-cm-chip.fx-breeding:has(input:checked)      { background:rgba(200,120,160,0.22); border-color:#d078a0; color:#ec9ec8; box-shadow:0 0 9px rgba(200,120,160,0.3); }
      .aflp-cm-chip.fx-exposed:has(input:checked)       { background:rgba(208,168,80,0.22); border-color:#d0a850; color:#e8c46a; box-shadow:0 0 9px rgba(208,168,80,0.3); }
      .aflp-cm-chip.dm-mind-break:has(input:checked)    { background:rgba(200,64,160,0.22); border-color:#c840a0; color:#e88ed0; box-shadow:0 0 9px rgba(200,64,160,0.35); }
      .aflp-cm-chip.dm-mind-break .aflp-cm-chip-ico     { color:#d058b0; }
      .aflp-cm-stepper {
        display:flex; align-items:center; gap:9px; padding:7px 11px; border-radius:8px;
        background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1);
      }
      .aflp-cm-step-ico { font-size:14px; width:16px; text-align:center; }
      .aflp-cm-stepper.exposed    .aflp-cm-step-ico { color:#d0a850; }
      .aflp-cm-stepper.mind-break .aflp-cm-step-ico { color:#d058b0; }
      .aflp-cm-stepper.bimbofied  .aflp-cm-step-ico { color:#e89ad0; }
      .aflp-cm-stepper.bullified  .aflp-cm-step-ico { color:#c87850; }
      .aflp-cm-stepper.defeat     .aflp-cm-step-ico { color:#9a9aa6; }
      .aflp-cm-step-name { flex:1; font-size:13px; font-weight:600; color:#cabfa6; }
      .aflp-cm-stepper input {
        width:46px; text-align:center; background:rgba(0,0,0,0.3);
        border:1px solid rgba(201,169,110,0.3); border-radius:5px; color:#e8c46a; font-weight:700; padding:3px;
      }
      .aflp-cm-stepper input:focus { outline:none; border-color:#c9a96e; box-shadow:0 0 6px rgba(201,169,110,0.4); }
      .aflp-cm-step-hint { font-size:10px; opacity:0.5; width:36px; text-align:right; }
      /* Read-outs: conditions something ELSE owns. Deliberately flat and
         uninteractive - a dashed border, no hover - because if they look like a
         control a GM can set, the "why did my change not stick" question just
         moves here instead of being answered. */
      .aflp-cm-ro {
        display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;
        padding:6px 10px; border-radius:8px;
        background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.12);
      }
      .aflp-cm-ro-name { font-size:12px; font-weight:600; color:#cabfa6; min-width:104px; }
      .aflp-cm-ro-val  { font-size:12px; font-weight:700; color:#e8c46a; }
      .aflp-cm-ro-note { font-size:10px; opacity:0.6; flex:1 1 100%; line-height:1.35; }
      .aflp-cm-tok { display:flex; align-items:center; gap:6px; }
      .aflp-cm-tok input[type="hidden"] { display:none; }
      .aflp-cm-tok-btn {
        width:22px; height:22px; line-height:1; padding:0; border-radius:5px;
        background:rgba(201,169,110,0.12); border:1px solid rgba(201,169,110,0.35);
        color:#e8c46a; font-weight:700; font-size:14px; cursor:pointer; transition:all .12s ease;
      }
      .aflp-cm-tok-btn:hover  { background:rgba(201,169,110,0.28); border-color:#c9a96e; }
      .aflp-cm-tok-btn:active { transform:scale(0.92); }
      .aflp-cm-tok-val {
        min-width:26px; text-align:center; font-weight:700; font-size:14px; color:#e8c46a;
        cursor:pointer; user-select:none; padding:2px 5px; border-radius:4px;
        background:rgba(0,0,0,0.25); border:1px solid rgba(201,169,110,0.25);
      }
      .aflp-cm-tok-val:hover { background:rgba(201,169,110,0.18); border-color:#c9a96e; }
      .aflp-cm-tok.is-zero .aflp-cm-tok-val { color:#7a7264; }
    `;
    document.head.appendChild(style);
  },

  // Exposure Token Art picker: three file slots (Exposed 0/1/2) + an enable
  // toggle. Drives token art from the actor's Exposed value via AFLP.ExposureArt.
  async _openExposureArt(actor) {
    const cfg = AFLP.ExposureArt?.get?.(actor) ?? {};
    const row = (name, label, val, hint) => `
      <div style="margin-bottom:10px;">
        <label style="display:block;font-size:12px;color:#c9a96e;margin-bottom:3px;">${label}
          <span style="color:#7a7264;">${hint}</span></label>
        <div style="display:flex;gap:6px;">
          <input type="text" name="${name}" value="${val ?? ""}" placeholder="(use normal art)"
            style="flex:1;background:rgba(0,0,0,0.3);border:1px solid rgba(201,169,110,0.3);color:#e8d9b8;padding:4px 6px;border-radius:3px;"/>
          <button type="button" class="aflp-ea-pick" data-target="${name}"
            style="padding:4px 8px;background:rgba(201,169,110,0.15);border:1px solid rgba(201,169,110,0.4);color:#e8c46a;border-radius:3px;cursor:pointer;">Browse</button>
        </div>
      </div>`;
    const content = `
      <div style="min-width:420px;">
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13px;color:#e8d9b8;">
          <input type="checkbox" name="ea-enabled" ${cfg.enabled ? "checked" : ""}/>
          Enable exposure-driven token art
        </label>
        ${row("ea-base", "Exposed 0 (clothed)", cfg.base, "- blank = the token's normal art")}
        ${row("ea-e1", "Exposed 1 (stripped)", cfg.e1, "")}
        ${row("ea-e2", "Exposed 2 (nude)", cfg.e2, "")}
        <p style="font-size:11px;color:#7a7264;margin-top:8px;">
          The token swaps to the matching image whenever the creature's Exposed value changes.
          Works with the prototype token, the base texture, and the dynamic ring. Wildcard
          (random image) tokens are left alone.
        </p>
      </div>`;
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: `Exposure Token Art - ${actor.name}` },
      content,
      render: (ev, dlg) => {
        dlg.element.querySelectorAll(".aflp-ea-pick").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            const targetName = btn.dataset.target;
            const input = dlg.element.querySelector(`input[name="${targetName}"]`);
            new FilePicker({
              type: "imagevideo",
              current: input?.value || "",
              callback: (path) => { if (input) input.value = path; },
            }).render(true);
          });
        });
      },
      buttons: [
        { action: "save", label: "Save", default: true, callback: (ev, btn, dlg) => {
          const r = dlg.element;
          return {
            enabled: r.querySelector('input[name="ea-enabled"]')?.checked ?? false,
            base:    r.querySelector('input[name="ea-base"]')?.value ?? "",
            e1:      r.querySelector('input[name="ea-e1"]')?.value ?? "",
            e2:      r.querySelector('input[name="ea-e2"]')?.value ?? "",
          };
        } },
        { action: "cancel", label: "Cancel", callback: () => null },
      ],
    });
    if (result && typeof result === "object") {
      await AFLP.ExposureArt.save(actor, result);
      ui.notifications?.info(`AFLR | Exposure token art ${result.enabled ? "enabled" : "disabled"} for ${actor.name}.`);
    }
  },

  // Milestones: the scalar lifetime stats that were never surfaced anywhere.
  // Key/value pairs, not a table - reads correctly at sidecar width.
  _renderMilestones(actor, sexual, history) {
    const lt = sexual.lifetime ?? {};
    const h  = Array.isArray(history) ? history : [];
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

    // Guard for the known corrupted double-scale values (e.g. cumReceived holding
    // stale ml in a unit field, 92607 on Neela). A load delivers a handful of
    // units, never thousands - anything past 200x the load count is bad data, so
    // we hide it with "-" rather than print a lie. Healthy values pass through.
    const _sane = (val, loads) => {
      const v = Number(val) || 0, L = Math.max(Number(loads) || 0, 1);
      return (v > 200 * L && v > 200) ? "-" : v;
    };
    const takenLoads = (lt.oral||0) + (lt.vaginal||0) + (lt.anal||0) + (lt.facial||0);
    const g = lt.given ?? {};
    const givenLoads = (g.oral||0) + (g.vaginal||0) + (g.anal||0) + (g.facial||0) + (g.gangbang||0);

    // Partner-history derivations - all free, no new write sites needed.
    const keyOf = (e) => e.sourceUuid || e.sourceName || "?";
    const freq = new Map(), dayCount = new Map();
    let debut = null, topName = "-", topN = 0;
    for (const e of h) {
      const k = keyOf(e);
      const n = (freq.get(k) || 0) + 1; freq.set(k, n);
      if (n > topN) { topN = n; topName = e.sourceName || k; }
      if (e.date) {
        const day = String(e.date).slice(0, 10);
        dayCount.set(day, (dayCount.get(day) || 0) + 1);
        const t = Date.parse(e.date);
        if (!isNaN(t) && (debut === null || t < debut)) debut = t;
      }
    }
    const distinct   = freq.size;
    const returning  = [...freq.values()].filter(n => n > 1).length;
    const busiest    = dayCount.size ? Math.max(...dayCount.values()) : 0;
    const mostFreq   = topN > 1 ? `${topName} (${topN})` : (topN === 1 ? topName : "-");
    const debutStr   = debut !== null ? new Date(debut).toLocaleDateString() : "-";

    // Creature types / largest partner - present only on saves written after the
    // Beastmaster/Size Queen fix; older partner entries carry neither field.
    const types = new Set(h.map(e => e.sourceType).filter(Boolean));
    // sourceSize holds PF2e's abbreviation on one system and Daggerheart's full
    // word on the other, so the old indexOf against a list of abbreviations
    // returned -1 for every "large" and "gargantuan" and this row read "-" or
    // named a smaller partner than the history actually holds. Steps, not strings.
    let biggest = 0;
    for (const e of h) { const i = AFLP.sizeStepOf(e.sourceSize); if (i > biggest) biggest = i; }

    // Favourite Hole splits by role. lt.oral/vaginal/anal/facial count holes used
    // ON this actor (bottoming) -> the Bottom card; lt.given.<hole> counts holes
    // THIS actor used on a partner (topping) -> the Top card. Each side shows its
    // own top hole, so a Dominator is no longer "-" just because it never bottoms.
    const _topHole = (obj) => {
      const a = [["Oral", obj.oral||0], ["Vaginal", obj.vaginal||0], ["Anal", obj.anal||0], ["Facial", obj.facial||0]]
        .sort((x, y) => y[1] - x[1]);
      return a[0][1] > 0 ? a[0][0] : "-";
    };
    const favTaken = _topHole({ oral: lt.oral, vaginal: lt.vaginal, anal: lt.anal, facial: lt.facial });
    const favUsed  = _topHole(g);
    const deepest = (lt.timesEnslaved||0) > 0 ? "Enslaved"
      : (lt.timesHypnotized||0) > 0 ? "Hypnotized"
      : (lt.timesEntranced||0) > 0 ? "Entranced" : "-";

    const yn = (v) => v ? "Yes" : "-";

    // Three buckets. GENERAL is role-neutral (partnerHistory is bidirectional, so
    // every partner counts both ways). BOTTOM is what was done TO the actor; TOP
    // is what the actor DID (the new dominator-side writers). General shows always;
    // a Bottom/Top toggle swaps the role block.
    const general = [
      ["General", [
        ["Times Climaxed",     lt.timesCummed],
        ["Encounters",         h.length],
        ["Distinct Partners",  distinct],
        ["Returning Partners", returning],
        ["Most Frequent",      mostFreq],
        ["Most in One Day",    busiest],
        ["Creature Types",     types.size],
        ["Largest Partner",    biggest > 0 ? AFLP.sizeWord(biggest) : "-"],
        ["First Encounter",    debutStr],
      ]],
    ];
    const bottom = [
      ["Taken", [
        ["Cum Shots Taken",   _sane(lt.cumReceived, takenLoads)],
        ["Favourite Hole",    favTaken],
        ["Gangbanged",        lt.gangbang],
        ["All Holes at Once", yn(lt.allHolesInSession)],
      ]],
      ["Bred", [
        ["Times Impregnated",       lt.timesImpregnated],
        ["Largest Litter",          lt.maxLitterSize],
        ["No-Pregnancy Encounters", lt.sessionsNoPregnancy],
        ["Bred by a Monster",       yn(lt.hasMonsterPregnancy)],
        ["Laid a Clutch",           yn(lt.hasLaidEggs)],
        ["Delivered a Clutch",      yn(lt.hasDeliveredClutch)],
      ]],
      ["Conditioned", [
        ["Deepest Conditioning", deepest],
        ["Times Entranced",   lt.timesEntranced],
        ["Times Hypnotized",  lt.timesHypnotized],
        ["Times Enslaved",    lt.timesEnslaved],
        ["Times Defeated",    lt.timesDefeated],
        ["Times Mind Broken", lt.timesMindBroken],
      ]],
      ["Endured", [
        // Scenes, not rounds. Old worlds carry the retired round counters; sum
        // them in so a character who earned them before the change does not
        // read as zero here, and the number keeps rising in scenes from now on.
        ["Scenes Bound",      (lt.bondageScenes || 0)    || lt.bondageRounds],
        ["Scenes Restrained", (lt.restrainedScenes || 0) || lt.restrainedRounds],
        ["Scenes Airlocked",  (lt.airlockScenes || 0)    || lt.airlockRounds],
        ["Damage Taken",      Math.round(lt.damageTaken || 0)],
      ]],
    ];
    const top = [
      ["Used", [
        ["Cum Shots Given",     _sane(lt.cumGiven, givenLoads)],
        ["Favourite Hole",      favUsed],
        ["Gangbangs Performed", lt.gangbangsPerformed],
        ["Damage Dealt",        Math.round(lt.damageDealt || 0)],
      ]],
      ["Bred others", [
        ["Partners Bred",   lt.partnersBred],
        ["Offspring Sired", lt.offspringSired],
      ]],
      ["Conditioned others", [
        ["Minds Entranced",  lt.mindsEntranced],
        ["Minds Hypnotized", lt.mindsHypnotized],
        ["Minds Enslaved",   lt.mindsEnslaved],
        ["Foes Defeated",    lt.foesDefeated],
        ["Minds Broken",     lt.mindsBroken],
      ]],
    ];

    // Which role to show first: honour a remembered per-actor choice, else default
    // to whichever side the actor is more active in (a monster dom opens on Top, a
    // bred sub on Bottom). Stored as a user flag (module scope is valid for user
    // flags), keyed by actor id, so it is per-viewer and never touches the shared
    // actor document.
    const bScore = (Number(lt.cumReceived)||0) + takenLoads + (lt.timesImpregnated||0) + (lt.timesDefeated||0)
      + (lt.timesEntranced||0) + (lt.timesHypnotized||0) + (lt.timesEnslaved||0) + (lt.gangbang||0)
      + (lt.bondageScenes||0) + (lt.restrainedScenes||0);
    const tScore = (Number(lt.cumGiven)||0) + givenLoads + (lt.partnersBred||0) + (lt.offspringSired||0)
      + (lt.foesDefeated||0) + (lt.mindsEntranced||0) + (lt.mindsHypnotized||0) + (lt.mindsEnslaved||0)
      + (lt.mindsBroken||0) + (lt.gangbangsPerformed||0);
    const _MOD = (globalThis.AFLP?.MODULE_ID) ?? "ardisfoxxs-lewd-pf2e";
    const _saved = game.user?.getFlag?.(_MOD, "msRole")?.[actor?.id];
    const role = (_saved === "top" || _saved === "bottom") ? _saved : (tScore > bScore ? "top" : "bottom");

    const cellsFor = (rows) => rows.map(([label, val]) => {
      const v = (val === undefined || val === null) ? 0 : val;
      const zero = (v === 0 || v === "-");
      const disp = (typeof v === "string") ? esc(v) : v;
      return `<div class="aflp-ms-row${zero ? " aflp-ms-zero" : ""}">
        <span class="aflp-ms-label">${label}</span>
        <span class="aflp-ms-val">${disp}</span>
      </div>`;
    }).join("");
    const gridFor = (grps) => `<div class="aflp-milestones">${grps.map(([t, rows]) =>
      `<div class="aflp-ms-group">${t}</div>${cellsFor(rows)}`).join("")}</div>`;

    const roleBtn = (r, label) =>
      `<button type="button" class="aflp-ms-role-btn" data-role="${r}" aria-pressed="${role === r ? "true" : "false"}">${label}</button>`;
    const toggle = `<div class="aflp-ms-toggle" role="group" aria-label="Role stats">${roleBtn("bottom", "Bottom")}${roleBtn("top", "Top")}</div>`;

    return `${gridFor(general)}${toggle}`
      + `<div class="aflp-ms-roleblock" data-ms-role="bottom"${role === "bottom" ? "" : ' style="display:none"'}>${gridFor(bottom)}</div>`
      + `<div class="aflp-ms-roleblock" data-ms-role="top"${role === "top" ? "" : ' style="display:none"'}>${gridFor(top)}</div>`;
  },

  // ── THE CONDITION MANAGER IS A TABLE, NOT MARKUP ──────────────────────────
  //
  // It used to be hand-written HTML per condition, and it held EIGHT of the
  // twenty-nine conditions a creature can carry - role, Exposed, Mind Break,
  // Bimbofied, Bullified, Fertility, Birth Control, Defeat. Nobody noticed,
  // because nothing in the file said what the full set was. Ardis, 4 Sept 2026:
  // "the status panel and the status manager need to have ALL AFLR/AFLP
  // conditions in it, otherwise users will think that we are shipping it broken."
  //
  // So the rows are DATA and the dialog is a loop over them. A new condition is
  // one entry here and it appears in the manager, in its band, with the right
  // control. That is the whole point; do not add bespoke markup back.
  //
  // THREE RULES THIS TABLE ENCODES, all settled with Ardis on 4 Sept:
  //
  //  1. The PANEL displays every condition; the MANAGER edits the ones a GM may
  //     legitimately set. Derived state - Exoskeleton Dry from Chest Coat,
  //     Persona Overridden from the Doll Maker, Arousal from its own bar - is
  //     "readout": shown so the manager is complete, not editable, because the
  //     code that owns it would overwrite a manual set on the next sync.
  //  2. Horny and Denied stay editable on the SHEET, where the pips are: "users
  //     like the pips... its kind of part of the arousal suite along with denied".
  //     Here they are a readout that NAMES THEIR FLOORS AND WHO HOLDS THEM, which
  //     is the one thing the pips cannot show and the reason clearing them
  //     sometimes looks broken.
  //  3. Bands, in the status panel's own order, so the two surfaces read alike.
  //
  // CAPS ARE NOT RESTATED HERE. `AFLP.CONDITION_CAPS` is the shared ceiling list
  // and it already matches the PF2e condition items' badge maxima. A second copy
  // in the UI is how Exposed 5 got in once. `cap === null/undefined` is uncapped,
  // which is correct for Mind Break on PF2e.
  //
  // `sys` IS MEASURED, NOT ASSUMED. "dh" rows are conditions only Daggerheart can
  // express - read from `CONFIG.statusEffects` in dh-test on 4 Sept 2026 against
  // the PF2e Conditions folder. STALE IF a system gains one of the other's.
  // Re-measure with the audit probe rather than editing this from memory.
  _managerRows() {
    return [
      { band: "Scene Role", key: "role", label: "Scene Role", control: "role", sys: "both" },

      // Imposed on you, or worn. The gear binaries are SETTABLE by Ardis's call:
      // the Daggerheart token HUD already toggles them, and refusing here while
      // the HUD allows it reads as broken. Worn gear re-asserts on its next sync,
      // which is correct - the gear is the reason, not this dialog.
      { band: "Imposed", key: "dizzy",            label: "Dizzy",        ico: "✵", control: "toggle", sys: "dh" },
      { band: "Imposed", key: "posed",            label: "Posed",        ico: "⛏", control: "toggle", sys: "dh" },
      { band: "Imposed", key: "hooked",           label: "Hooked",       ico: "⚕", control: "toggle", sys: "dh" },
      { band: "Imposed", key: "gagged",           label: "Gagged",       ico: "●", control: "toggle", sys: "both" },
      // DAGGERHEART ONLY, and this is per-system DESIGN rather than a gap.
      // MEASURED in pf2e-dev 4 Sept 2026: setting these three did nothing, because
      // the PF2e pack has no condition item for any of them - `contentUuid` returns
      // nothing and the apply is a silent no-op. It has no item because it needs
      // none: on Pathfinder this gear speaks the SYSTEM's language instead. The
      // Leather Blindfold card says "Wearing this mask makes you Blinded"; Leg
      // Cuffs give "a -10-foot penalty to your Speed". Daggerheart has no native
      // equivalents, so AFLR carries its own three there.
      // Gagged, Plugged, Chaste and Caged are NOT in this group - each has a real
      // PF2e condition item and each applied correctly in the same sweep.
      { band: "Imposed", key: "blindfolded",      label: "Blindfolded",  ico: "◑", control: "toggle", sys: "dh" },
      { band: "Imposed", key: "hobbled",          label: "Hobbled",      ico: "⛓", control: "toggle", sys: "dh" },
      { band: "Imposed", key: "cuffed",           label: "Cuffed",       ico: "⛓", control: "toggle", sys: "dh" },
      { band: "Imposed", key: "plugged",          label: "Plugged",      ico: "⬤", control: "toggle", sys: "both" },
      { band: "Imposed", key: "chaste",           label: "Chaste",       ico: "⛔", control: "toggle", sys: "both" },
      { band: "Imposed", key: "caged",            label: "Caged",        ico: "⛔", control: "toggle", sys: "both" },
      // These two own their own teardown - a bare cond.remove leaves the scene
      // half-dismantled, which is why the panel's X routes them the same way.
      { band: "Imposed", key: "stuck-submitting", label: "Stuck Submitting", ico: "↓", control: "toggle", sys: "both", free: a => AFLP.stuckSubmitting?.free?.(a) },
      { band: "Imposed", key: "swallowed",        label: "Swallowed",    ico: "◌", control: "toggle", sys: "both", free: a => AFLP.swallowed?.free?.(a) },

      // State.
      { band: "State", key: "exposed",    label: "Exposed",    ico: "✦", control: "stepper", sys: "both",
        title: "0-2. At 2 the panel reads Nude: clothes open means Carnal Resist at disadvantage, near enough naked also makes you Vulnerable." },
      // MIND BREAK IS TWO DIFFERENT THINGS. On Daggerheart it is a Death Move -
      // binary, and the old dialog rendered it as a checkbox for that reason. On
      // PF2e it is an uncapped track. Kept as two rows rather than one lying row.
      { band: "State", key: "mind-break", label: "Mind Break", ico: "✲", control: "toggle",  sys: "dh" },
      { band: "State", key: "mind-break", label: "Mind Break", ico: "✲", control: "stepper", sys: "pf2e" },
      { band: "State", key: "bimbofied",  label: "Bimbofied",  ico: "❀", control: "stepper", sys: "both", tracked: "setBimbofied" },
      { band: "State", key: "bullified",  label: "Bullified",  ico: "♉", control: "stepper", sys: "both", tracked: "setBullified" },
      // Defeat on DH is a valued track; PF2e's Defeated is a separate binary
      // condition with its own key. NOT one row, and not one key.
      { band: "State", key: "defeat",     label: "Defeat",     ico: "☠", control: "stepper", sys: "dh" },
      { band: "State", key: "defeated",   label: "Defeated",   ico: "☠", control: "toggle",  sys: "pf2e" },
      { band: "State", key: "entranced",  label: "Entranced",  ico: "◉", control: "toggle",  sys: "both" },
      { band: "State", key: "hypnotized", label: "Hypnotized", ico: "◎", control: "toggle",  sys: "both" },
      { band: "State", key: "lustful",    label: "Lustful",    ico: "♥", control: "toggle",  sys: "dh" },
      { band: "State", key: "toasted",    label: "Toasted",    ico: "♨", control: "toggle",  sys: "both" },
      { band: "State", key: "dubious-consent", label: "Dubious Consent", ico: "⁉", control: "toggle", sys: "pf2e" },
      // PF2E ONLY UNTIL RULED. Reported by Ardis 4 Sept: setting it on Daggerheart
      // does nothing - and it does nothing on three levels, all measured that day:
      //   1. the STATUS PANEL row never reads this condition. Its value is
      //      `AFLP.HScene.isSelfAbsorbed(actorId)`, true only inside a SOLO
      //      H-Scene, so a hand-set condition cannot light the row on either system;
      //   2. Daggerheart does not register `masturbating` as a status effect, so
      //      there is no token icon either;
      //   3. the DH card exists - aflr-dh-items "Masturbating" - with an EMPTY
      //      description, so clicking through shows nothing.
      // On PF2e the condition item is real and carries its own rules (Off-Guard,
      // easier Struggle Snuggle, +1 Arousal from a Sexual Advance), so there the
      // toggle does something.
      // The DH adapter has said since 29 Aug that `masturbating` and `afterglow`
      // "need Ardis's ruling". This is that open question surfacing in the UI.
      { band: "State", key: "masturbating",    label: "Masturbating",    ico: "☝", control: "toggle", sys: "pf2e" },

      // Kit, buffs, fertility.
      { band: "Kit & Buffs", key: "breeding",      label: "Fertility",     ico: "☸", control: "stepper", sys: "both", staged: true,
        title: "Staged 0-3. Every creature is Fertility 1 by default; 0 clears back to that. 2 = Brood Roll DC -2, 3 = no roll, it just takes." },
      { band: "Kit & Buffs", key: "birth-control", label: "Birth Control", ico: "⊘", control: "stepper", sys: "both", staged: true,
        title: "Staged 1-3: each stage reduces effective Fertility by 1, floor 0. 1 blocks an unenhanced character, 2 = the Elixir, 3 = the Greater Elixir." },
      // PF2E ONLY, and MEASURED rather than assumed: driven on a DH rig 4 Sept
      // 2026, `AFLP.cond.apply(actor, "afterglow")` returned without throwing and
      // set nothing. Its registry uuid points into `aflp-lewd-items` - the PF2e
      // pack - and Daggerheart registers no such status. Offering it here on DH
      // was a switch wired to nothing.
      { band: "Kit & Buffs", key: "afterglow",     label: "Afterglow",     ico: "☀", control: "toggle",  sys: "pf2e" },
      { band: "Kit & Buffs", key: "nirvana",       label: "Nirvana",       ico: "✺", control: "toggle",  sys: "dh" },

      // Owned elsewhere. Shown so the manager is the whole picture; not editable
      // here, because something else would overwrite the edit.
      { band: "Held elsewhere", key: "horny",   label: "Horny",   control: "readout", sys: "both", bag: "horny",
        note: "Set with the pips on the sheet." },
      { band: "Held elsewhere", key: "denied",  label: "Denied",  control: "readout", sys: "both", bag: "denied",
        note: "Set with the pips on the sheet." },
      { band: "Held elsewhere", key: "arousal", label: "Arousal", control: "readout", sys: "both",
        read: a => `${AFLP.system?.getArousalCurrent?.(a) ?? 0} / ${AFLP.HScene?.calcArousalMax?.(a) ?? "?"}`,
        note: "The Arousal bar owns this." },
      { band: "Held elsewhere", key: "exoskeleton-dry", label: "Exoskeleton (Dry)", control: "readout", sys: "both",
        note: "Derived from Chest Coat - a manual set is undone by the next sync." },
      { band: "Held elsewhere", key: "persona-overridden", label: "Persona Overridden", control: "readout", sys: "both",
        note: "The Doll Maker's persona swap owns this." },
    ];
  },

  // The floors behind Horny or Denied, and WHO is holding each one. This is the
  // answer to "why won't it clear" - a floor means the reason is still true, and
  // until now nothing on screen ever said which reason.
  _managerFloors(actor, which) {
    const api = which === "denied" ? AFLP.denied : AFLP.horny;
    let bag = {};
    try { bag = api?._bag?.(actor) ?? {}; } catch (e) { bag = {}; }
    const sources = Object.entries(bag.sources ?? {})
      .map(([id, v]) => [id, Number(v) || 0]).filter(([, v]) => v > 0);
    let total = 0, floor = 0;
    try { total = Number(api?.total?.(actor)) || 0; } catch (e) {}
    try { floor = Number(api?.permanent?.(actor)) || 0; } catch (e) {}
    return { total, floor, sources };
  },

  async _openConditionManager(actor, html) {
    if (!game.user.isGM || !actor) return;
    AFLP.UI.SheetTab._ensureConditionManagerCSS();
    const SYS = game.system?.id === "daggerheart" ? "dh" : "pf2e";
    const rows = AFLP.UI.SheetTab._managerRows().filter(r => r.sys === "both" || r.sys === SYS);

    const capOf = (key) => {
      const c = AFLP.CONDITION_CAPS?.[key];
      return (c === undefined || c === null) ? "" : c;
    };
    const valueOf = (r) => {
      if (r.control === "stepper") return Number(AFLP.cond.value(actor, r.key)) || 0;
      if (r.control === "toggle")  return AFLP.cond.has(actor, r.key) ? 1 : 0;
      return 0;
    };
    const esc = (s) => String(s ?? "").replace(/"/g, "&quot;");

    // Token control: +/- plus left-click-to-mark, right-click-to-clear. A hidden
    // input carries the value so the Apply reader below is a plain querySelector.
    const tok = (name, value, min, max) => `
      <div class="aflp-cm-tok" data-min="${min}" data-max="${max}" title="Left-click to mark, right-click to clear">
        <button type="button" class="aflp-cm-tok-btn" data-d="-1">&minus;</button>
        <span class="aflp-cm-tok-val">${value}</span>
        <button type="button" class="aflp-cm-tok-btn" data-d="1">+</button>
        <input type="hidden" name="cm:${name}" value="${value}"/>
      </div>`;

    const renderRow = (r) => {
      if (r.control === "role") {
        const role = AFLP.cond.has(actor, "dominating") ? "dominating"
                   : AFLP.cond.has(actor, "submitting") ? "submitting" : "none";
        return `<div class="aflp-cm-chips">
          <label class="aflp-cm-chip role-none"><input type="radio" name="aflp-cm-role" value="none" ${role === "none" ? "checked" : ""}/><span class="aflp-cm-chip-txt">None</span></label>
          <label class="aflp-cm-chip role-dominating"><input type="radio" name="aflp-cm-role" value="dominating" ${role === "dominating" ? "checked" : ""}/><span class="aflp-cm-chip-ico">▲</span><span class="aflp-cm-chip-txt">Dominating</span></label>
          <label class="aflp-cm-chip role-submitting"><input type="radio" name="aflp-cm-role" value="submitting" ${role === "submitting" ? "checked" : ""}/><span class="aflp-cm-chip-ico">▼</span><span class="aflp-cm-chip-txt">Submitting</span></label>
        </div>`;
      }
      if (r.control === "toggle") {
        // `aflp-cm-toggle` is what the ON styling hangs off. The pre-existing
        // checked rules are all keyed to the OLD bespoke classes (fx-exposed,
        // dm-mind-break...), which this generic markup does not emit - so
        // without this class a clicked chip changed nothing on screen and only
        // Apply revealed it had registered. Reported by Ardis, 4 Sept 2026.
        return `<label class="aflp-cm-chip aflp-cm-toggle cm-${r.key}" title="${esc(r.title ?? "")}">
          <input type="checkbox" name="cm:${r.key}" ${valueOf(r) ? "checked" : ""}/>
          <span class="aflp-cm-chip-ico">${r.ico ?? ""}</span><span class="aflp-cm-chip-txt">${r.label}</span>
        </label>`;
      }
      if (r.control === "stepper") {
        return `<div class="aflp-cm-stepper ${r.key}" title="${esc(r.title ?? "")}">
          <span class="aflp-cm-step-ico">${r.ico ?? ""}</span>
          <span class="aflp-cm-step-name">${r.label}</span>
          ${tok(r.key, valueOf(r), 0, capOf(r.key))}
          <span class="aflp-cm-step-hint">${capOf(r.key) === "" ? "0 = off" : `0–${capOf(r.key)}`}</span>
        </div>`;
      }
      // readout
      let body = "";
      if (r.bag) {
        const f = AFLP.UI.SheetTab._managerFloors(actor, r.bag);
        const held = f.sources.length
          ? f.sources.map(([id, v]) => `${id} ${v}`).join(", ")
          : "nothing";
        body = `<span class="aflp-cm-ro-val">${f.total}</span>`
             + `<span class="aflp-cm-ro-note">floor ${f.floor} held by ${held}${f.floor ? " - it cannot go below that until the source lets go" : ""}. ${r.note ?? ""}</span>`;
      } else {
        const on = r.read ? r.read(actor) : (AFLP.cond.has(actor, r.key) ? "yes" : "no");
        body = `<span class="aflp-cm-ro-val">${on}</span><span class="aflp-cm-ro-note">${r.note ?? ""}</span>`;
      }
      return `<div class="aflp-cm-ro"><span class="aflp-cm-ro-name">${r.label}</span>${body}</div>`;
    };

    // "Pretty heckin big menu" - Ardis, 4 Sept 2026, and he was right: 32 rows is
    // a tall dialog. Two things keep it in hand without hiding anything a GM came
    // here to change. The read-outs COLLAPSE, because they are reference rather
    // than controls and a GM opens this to set something. And the whole thing
    // scrolls internally rather than growing past the window - see the CSS.
    const bands = [];
    for (const band of ["Scene Role", "Imposed", "State", "Kit & Buffs"]) {
      const mine = rows.filter(r => r.band === band);
      if (!mine.length) continue;
      const inner = band === "Scene Role"
        ? mine.map(renderRow).join("")
        : `<div class="aflp-cm-chips">${mine.map(renderRow).join("")}</div>`;
      bands.push(`<div class="aflp-cm-section"><div class="aflp-cm-label">${band}</div>${inner}</div>`);
    }
    const ro = rows.filter(r => r.band === "Held elsewhere");
    if (ro.length) {
      bands.push(`<details class="aflp-cm-section aflp-cm-ro-wrap">
        <summary class="aflp-cm-label">Held elsewhere (${ro.length}) - shown, set somewhere else</summary>
        ${ro.map(renderRow).join("")}
      </details>`);
    }

    const content = `
      <div class="aflp-cm">
        <div class="aflp-cm-head">
          <span class="aflp-cm-head-ico">⚙</span>
          <span class="aflp-cm-actor">${actor.name}</span>
        </div>
        ${bands.join("")}
        <div class="aflp-cm-section">
          <div class="aflp-cm-label">Token Art</div>
          <div class="aflp-cm-chips">
            <button type="button" class="aflp-cm-exposure-art" data-actor-id="${actor.id}"
              style="padding:4px 10px;background:rgba(201,169,110,0.12);border:1px solid rgba(201,169,110,0.4);color:#e8c46a;border-radius:4px;cursor:pointer;">
              \u{1F3AD} Exposure Token Art…
            </button>
          </div>
        </div>
      </div>`;

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: "Manage Conditions" },
      content,
      render: (ev, dlg) => {
        const el = dlg.element;
        el.querySelectorAll(".aflp-cm-tok").forEach(t => {
          const hidden = t.querySelector('input[type="hidden"]');
          const valEl  = t.querySelector(".aflp-cm-tok-val");
          if (!hidden || !valEl) return;
          const min = Number(t.dataset.min ?? 0);
          const maxRaw = t.dataset.max;
          const max = (maxRaw === "" || maxRaw == null) ? Infinity : Number(maxRaw);
          const set = (v) => {
            v = Math.max(min, Math.min(max, v));
            hidden.value = String(v);
            valEl.textContent = String(v);
            t.classList.toggle("is-zero", v <= 0);
          };
          set(Number(hidden.value || 0));
          t.querySelectorAll(".aflp-cm-tok-btn").forEach(b =>
            b.addEventListener("click", e => { e.preventDefault(); set(Number(hidden.value || 0) + Number(b.dataset.d)); }));
          valEl.addEventListener("click",      e => { e.preventDefault(); set(Number(hidden.value || 0) + 1); });
          valEl.addEventListener("contextmenu", e => { e.preventDefault(); set(0); });
        });
        el.querySelector(".aflp-cm-exposure-art")?.addEventListener("click", async (e) => {
          e.preventDefault();
          await AFLP.UI.SheetTab._openExposureArt(actor);
        });
      },
      buttons: [
        {
          action: "apply", label: "Apply", default: true,
          callback: (ev, btn, dlg) => {
            const root = dlg.element;
            const out = { role: root.querySelector('input[name="aflp-cm-role"]:checked')?.value ?? "none", vals: {} };
            for (const r of rows) {
              if (r.control === "toggle")  out.vals[r.key] = root.querySelector(`input[name="cm:${r.key}"]`)?.checked ? 1 : 0;
              if (r.control === "stepper") out.vals[r.key] = Number(root.querySelector(`input[name="cm:${r.key}"]`)?.value ?? 0) || 0;
            }
            return out;
          },
        },
        { action: "cancel", label: "Cancel", callback: () => null },
      ],
      close: () => null,
      rejectClose: false,
    });
    // DialogV2 quirk: a button callback returning null resolves to the button's
    // ACTION STRING ("cancel"), not null - only an object is a real Apply.
    if (!result || typeof result !== "object") return;

    // Exact-set a valued condition (create at value if absent, set if present,
    // remove at 0). The cap comes from the shared list, never from this file.
    const setExact = async (slug, target) => {
      const t = AFLP.capCondition(slug, Math.max(0, Number(target) || 0));
      if (t <= 0) return AFLP.cond.remove(actor, slug);
      if (AFLP.cond.has(actor, slug)) return AFLP.cond.setValue(actor, slug, t);
      return AFLP.cond.apply(actor, slug, t);
    };
    // Fertility and Birth Control are staged and flag-backed on every system;
    // 0 clears the stored condition (for Fertility that is back to the implicit
    // default of 1, for Birth Control it is none).
    const setStaged = async (slug, target) => {
      const t = AFLP.capCondition(slug, Math.max(0, Number(target) || 0));
      const current = AFLP.cond.value(actor, slug) || (AFLP.cond.has(actor, slug) ? 3 : 0);
      if (t === 0) { if (current > 0 || AFLP.cond.has(actor, slug)) await AFLP.cond.remove(actor, slug); }
      else if (t !== current) await AFLP.cond.apply(actor, slug, t);
    };

    // Role is mutually exclusive (Dominating / Submitting / None).
    if (result.role === "dominating") {
      await AFLP.cond.remove(actor, "submitting");
      if (!AFLP.cond.has(actor, "dominating")) await AFLP.cond.apply(actor, "dominating");
    } else if (result.role === "submitting") {
      await AFLP.cond.remove(actor, "dominating");
      if (!AFLP.cond.has(actor, "submitting")) await AFLP.cond.apply(actor, "submitting");
    } else {
      await AFLP.cond.remove(actor, "dominating");
      await AFLP.cond.remove(actor, "submitting");
    }

    for (const r of rows) {
      const want = result.vals[r.key];
      if (want === undefined) continue;               // role and readouts write nothing
      try {
        if (r.control === "toggle") {
          const on = !!want;
          if (on && !AFLP.cond.has(actor, r.key)) await AFLP.cond.apply(actor, r.key);
          else if (!on && AFLP.cond.has(actor, r.key)) {
            // Some conditions own their own teardown - a bare remove would leave
            // the scene half-dismantled.
            if (r.free) await r.free(actor);
            else await AFLP.cond.remove(actor, r.key);
          }
        } else if (r.control === "stepper") {
          // Bimbofied and Bullified are token tracks: the adapter's setter keeps
          // the feature-resource track in step on DH. The guard is on the RETURN
          // VALUE, not typeof - adapter-base defines both as stubs returning null
          // on every system, so a typeof guard always passed and the PF2e write
          // was silently dropped.
          if (r.tracked)      await AFLP.cond.setTracked(actor, r.key, r.tracked, want);
          else if (r.staged)  await setStaged(r.key, want);
          else                await setExact(r.key, want);
        }
      } catch (e) {
        console.warn(`AFLP | condition manager: ${r.key} did not take:`, e?.message);
        continue;
      }
      // AND THEN CHECK IT LANDED. `AFLP.cond.apply` for a condition THIS system
      // cannot express returns without throwing and sets nothing - measured on
      // Daggerheart with `afterglow`, whose registry uuid is a PF2e pack item.
      // A try/catch cannot see that; only reading the value back can. Says so in
      // the console rather than failing, because the GM's other 25 changes did
      // land and losing them to one bad row would be worse.
      try {
        const got = r.control === "toggle" ? (AFLP.cond.has(actor, r.key) ? 1 : 0)
                                           : Number(AFLP.cond.value(actor, r.key)) || 0;
        const expect = r.control === "toggle" ? (want ? 1 : 0) : AFLP.capCondition(r.key, want);
        // Staged rows legitimately settle elsewhere (Fertility 0 means "back to
        // the implicit 1"), so they are not compared.
        if (!r.staged && got !== expect) {
          console.warn(`AFLP | condition manager: "${r.key}" was set to ${expect} and reads back ${got}`
            + ` - this system may not express it. If that is right, give the row a sys of "dh" or "pf2e".`);
        }
      } catch (e) { /* read-back is diagnostic only */ }
    }

    // Refresh the sheet panel and any open scene card showing this actor.
    try { if (html) await AFLP.UI.SheetTab._refreshPanel(html, actor, false); } catch (e) {}
    try {
      for (const s of (AFLP.HScene._scenes?.values?.() ?? [])) {
        const hit = (s.participants ?? []).some(p => AFLP.HScene._resolveActor?.(p)?.id === actor.id);
        if (hit) AFLP.HScene.refreshScene?.(s.targetId ?? s.id);
      }
    } catch (e) {}
  },

  _renderTitleBanner(displayTitle, heldCount, titlesMode = false) {
    const btn = `<button type="button" class="aflp-titles-toggle" title="${titlesMode ? "Close titles" : "View titles & set displayed"}">${titlesMode ? "\u2715" : "\u2605"}</button>`;
    if (!displayTitle) {
      return `<div class="aflp-title-banner aflp-title-banner-empty">
        ${btn}
        <span class="aflp-title-banner-name">No Title Yet</span>
        <span class="aflp-title-banner-desc">Earn titles through play</span>
      </div>`;
    }
    return `<div class="aflp-title-banner" data-title-id="${displayTitle.id}">
      ${btn}
      <div class="aflp-title-banner-main">
        <span class="aflp-title-banner-crown">\uD83C\uDFC6</span>
        <span class="aflp-title-banner-name">${displayTitle.name}</span>
      </div>
      <span class="aflp-title-banner-desc">${displayTitle.desc}</span>
    </div>`;
  },

  // Render titles — view mode
  // Each title has a star toggle; clicking sets it as the display title shown
  // in the banner. The active display title shows a filled star.
  // -----------------------------------------------
  // Tracked-title progress banner for the Drives pane. Shows the one title the
  // player is tracking toward, with a progress bar. Nothing if none tracked or
  // the tracked title is already earned.
  _renderTrackedTitle(actor, sexual) {
    const tid = sexual.trackedTitleId;
    if (!tid) return "";
    const t = AFLP_Titles.resolveTitle(tid);
    if (!t) return "";
    const history = actor.getFlag(AFLP.FLAG_SCOPE, "partnerHistory") ?? [];
    const p = AFLP_Titles.progressOf(tid, actor, sexual, history);
    const earned = (sexual.titles ?? []).includes(tid);
    if (earned) return "";
    const barPct = p ? p.pct : 0;
    const valText = p ? `${_fmtNum(p.current)} / ${_fmtNum(p.target)}` : "in progress";
    return `
      <div class="aflp-tracked">
        <div class="aflp-tracked-head">
          <span class="aflp-tracked-label">◎ H-Quest Progress</span>
          <strong class="aflp-tracked-name">${t.name}</strong>
          <span class="aflp-tracked-val">${valText}</span>
        </div>
        <div class="aflp-tracked-req">${t.desc}</div>
        <div class="aflp-progbar"><div class="aflp-progbar-fill" style="width:${barPct}%"></div></div>
      </div>`;
  },

  _renderTitlesView(titlesHeld, displayTitleId = null, actor = null, sexual = null) {
    // "None" opt-out chip: always first.
    const noneActive = !displayTitleId;
    const noneChip = `
      <div class="aflp-title-chip${noneActive ? " aflp-title-active" : ""}" title="Show no title">
        <div class="aflp-title-chip-head">
          <button type="button" class="aflp-title-star${noneActive ? " active" : ""}"
            data-title-id="" title="${noneActive ? "No title shown" : "Show no title"}">${noneActive ? "★" : "☆"}</button>
          <strong>None</strong>
        </div>
        <span class="aflp-title-desc">Display no title.</span>
      </div>`;
    // Held titles, sorted alphabetically by display name.
    const held = AFLP_Titles.TITLES
      .filter(t => titlesHeld.has(t.id))
      .map(t => ({ t, name: AFLP_Titles._name(t.id, t.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const earnedChips = held.map(({ t, name }) => {
      const isActive = t.id === displayTitleId;
      const star = isActive ? "★" : "☆";
      return `
        <div class="aflp-title-chip${isActive ? " aflp-title-active" : ""}" title="🏆 ${name}">
          <div class="aflp-title-chip-head">
            <button type="button" class="aflp-title-star${isActive ? " active" : ""}"
              data-title-id="${t.id}" title="${isActive ? "Currently displayed" : "Set as displayed title"}">${star}</button>
            🏆 <strong>${name}</strong>
          </div>
          <span class="aflp-title-desc">${t.desc}</span>
        </div>`;
    }).join("");
    const earnedBlock = titlesHeld.size
      ? `<div class="aflp-title-list">${noneChip}${earnedChips}</div>`
      : `<div class="aflp-none">No titles earned yet. Tick "Show Locked" to see what you can earn and track a quest.</div>`;

    // ── Show Locked (toggle lives in the Titles header now): reveals the
    // unearned titles with progress bars + track pins so a quest can be chosen
    // right here in the display view. Persisted per-actor across refreshes.
    const showLocked = actor ? !!_aflpShowLocked.get(actor.id) : false;
    const sx = sexual ?? {};
    const trackedId = sx.trackedTitleId ?? null;
    const history = actor?.getFlag?.(AFLP.FLAG_SCOPE, "partnerHistory") ?? [];

    let lockedBlock = "";
    if (showLocked && actor) {
      const locked = AFLP_Titles.TITLES
        .filter(t => !titlesHeld.has(t.id))
        .map(t => {
          const p = AFLP_Titles.progressOf(t.id, actor, sx, history);
          const name = AFLP_Titles._name(t.id, t.name);
          // in-progress (numeric, not done) first by pct desc, then binary locked alpha.
          const group = (p && !p.done) ? 0 : 1;
          const sortVal = (p && !p.done) ? -p.pct : 0;
          return { t, name, p, group, sortVal };
        })
        .sort((a, b) => a.group - b.group || a.sortVal - b.sortVal || a.name.localeCompare(b.name));
      const rows = locked.map(({ t, name, p }) => {
        const isTracked = t.id === trackedId;
        const bar = p
          ? `<div class="aflp-progbar"><div class="aflp-progbar-fill" style="width:${p.pct}%"></div></div>
             <span class="aflp-prog-val">${_fmtNum(p.current)}/${_fmtNum(p.target)}</span>`
          : `<span class="aflp-prog-binary">locked</span>`;
        return `
        <div class="aflp-title-erow">
          <div class="aflp-title-erow-head">
            <button type="button" class="aflp-title-track${isTracked ? " active" : ""}"
              data-track-id="${t.id}" title="${isTracked ? "Tracking this quest" : "Track this as your H-Quest"}">${isTracked ? "◉" : "◎"}</button>
            <span class="aflp-title-ename">${name}</span>
          </div>
          <div class="aflp-title-ereq">${t.desc}</div>
          <div class="aflp-title-erow-prog">${bar}</div>
        </div>`;
      }).join("");
      lockedBlock = `<div class="aflp-title-elist aflp-locked-list">${rows || `<div class="aflp-none">All titles earned!</div>`}</div>`;
    }

    return `${earnedBlock}${lockedBlock}`;
  },

  // -----------------------------------------------
  // Render titles — edit mode: pure enable/disable award toggles (the "cheat"
  // menu). Progress bars and quest tracking live in the DISPLAY view now, behind
  // the "Show Locked" toggle - the edit menu is only for directly granting or
  // removing titles.
  // -----------------------------------------------
  _renderTitlesEdit(titlesHeld, actor = null, sexual = null) {
    const rows = AFLP_Titles.TITLES
      .map(t => ({ t, name: AFLP_Titles._name(t.id, t.name), held: titlesHeld.has(t.id) }))
      .sort((a, b) => (b.held - a.held) || a.name.localeCompare(b.name));
    const items = rows.map(({ t, name, held }) => `
      <div class="aflp-title-erow${held ? " earned" : ""}">
        <label class="aflp-title-erow-head">
          <input type="checkbox" class="aflp-title-check" name="title-${t.id}"
            data-title-id="${t.id}" ${held ? "checked" : ""}/>
          <span class="aflp-title-ename" title="${t.desc}">${name}</span>
        </label>
      </div>`).join("");
    return `<div class="aflp-title-elist">${items}</div>`;
  },

  // -----------------------------------------------
  // Listeners — bound on html root with .aflp namespace
  // -----------------------------------------------
  _activateListeners(html, actor, sheet) {
    const FLAG = AFLP.FLAG_SCOPE;

    // ── Content links ─────────────────────────────────────────────────────
    // The panel emits proper <a class="content-link" data-uuid="..."> markup, but
    // Foundry binds those clicks through the Application's own core listeners,
    // which never reach HTML we inject into somebody else's sheet. Without this
    // EVERY anatomy, feature and cumflation link on the tab was inert - they
    // looked like links, highlighted like links, and did nothing.
    html.addEventListener("click", async (ev) => {
      const a = ev.target?.closest?.("a.content-link[data-uuid]");
      if (!a) return;
      ev.preventDefault();
      ev.stopPropagation();
      try {
        const doc = await fromUuid(a.dataset.uuid);
        if (doc?.sheet) doc.sheet.render(true);
        else ui.notifications?.warn("AFLR: that item is not in this world's compendiums.");
      } catch (e) { console.warn("AFLR | content link failed:", a.dataset.uuid, e); }
    });

    // ── Sub-tabs ──────────────────────────────────────────────────────────
    // Switching panes is a pure DOM toggle — no panel rebuild — so the heavy
    // Partner History DOM is never re-rendered just to change tabs. The active
    // tab is stored per-actor so it survives panel refreshes (arousal clicks,
    // edit toggles, etc.).
    const subtabBar = html.querySelector(".aflp-subtabs");
    if (subtabBar) {
      const panes = html.querySelectorAll(".aflp-subtab-pane");
      const tabs  = html.querySelectorAll(".aflp-subtab");
      const validTabs = new Set([...tabs].map(t => t.dataset.subtab));

      const applySubtab = (which) => {
        if (!validTabs.has(which)) which = "body";
        _aflpActiveSubtab.set(actor.id, which);
        tabs.forEach(t => t.classList.toggle("active", t.dataset.subtab === which));
        panes.forEach(p => p.classList.toggle("active", p.dataset.subtabPane === which));
        // Re-fit the auto-height window to the newly-shown pane so switching to
        // a shorter/taller pane does not leave dead space or clip. Only when the
        // sheet is the standalone AFLPSheetApp (not docked in another sheet).
        try {
          const app = foundry.applications.instances?.get?.(html.closest?.("[data-appid]")?.dataset?.appid)
            ?? [...(foundry.applications.instances?.values?.() ?? [])]
                 .find(a => a.constructor?.name === "AFLPSheetApp" && a.element === html.closest(".application"));
          if (app?.setPosition) requestAnimationFrame(() => app.setPosition({ height: "auto" }));
        } catch (_) {}
      };

      // Restore the previously-active tab (default "status").
      applySubtab(_aflpActiveSubtab.get(actor.id) ?? "body");

      tabs.forEach(tab => {
        tab.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          applySubtab(tab.dataset.subtab);
        });
      });
    }

    // Note: v13 uses native addEventListener — no jQuery .off() needed.
    // Re-entry is prevented by the panel-level handler cleanup below.

    // Delegate clicks on enriched UUID content-links inside our panel.
    // PF2e's sheet form swallows these — we intercept and open the doc sheet manually.
    // Use a capturing listener on the raw DOM element so it fires before
    // PF2e's form submit handler, which otherwise swallows content-link clicks.
    const panelEl = html.querySelector(".aflp-panel");
    if (panelEl) {
      // Clean up previous native listeners
      if (panelEl._aflpClickHandler)  panelEl.removeEventListener("click",  panelEl._aflpClickHandler,  true);
      if (panelEl._aflpChangeHandler) panelEl.removeEventListener("change", panelEl._aflpChangeHandler, false);

      // CLICK (capture): open content-link sheets before Foundry's own listener fires.
      panelEl._aflpClickHandler = (ev) => {
        // GM condition manager button.
        const manage = ev.target.closest(".aflp-cond-manage");
        if (manage) {
          ev.preventDefault();
          ev.stopPropagation();
          AFLP.UI.SheetTab._openConditionManager(actor, html);
          return;
        }
        // Token coat style cycle (Portrait flat image -> Bust portrait-in-ring). Isometric shelved.
        const coatBtn = ev.target.closest(".aflp-coat-toggle");
        if (coatBtn) {
          ev.preventDefault();
          ev.stopPropagation();
          const iso = !!actor.getFlag(AFLP.FLAG_SCOPE, "coatIso");
          const bust = !!actor.getFlag(AFLP.FLAG_SCOPE, "coatBust");
          const next = bust ? "portrait" : "bust"; // Portrait -> Bust -> Portrait (Isometric shelved)
          Promise.resolve()
            .then(() => actor.setFlag(AFLP.FLAG_SCOPE, "coatIso", false))
            .then(() => actor.setFlag(AFLP.FLAG_SCOPE, "coatBust", next === "bust"))
            .then(() => { try { window.AFLP_Splatter?.refreshActor?.(actor); } catch (e) {} })
            .then(() => coatBtn.textContent = `Token coat: ${next === "bust" ? "Bust" : "Portrait"}`)
            .catch(e => console.warn("AFLP | coat toggle failed:", e?.message ?? e));
          return;
        }
        const link = ev.target.closest(".content-link");
        if (!link) return;
        ev.preventDefault();
        ev.stopPropagation();
        const uuid = link.dataset?.uuid;
        if (!uuid) return;
        const doc = fromUuidSync?.(uuid);
        if (doc) doc.sheet?.render(true);
        else fromUuid(uuid).then(d => d?.sheet?.render(true));
      };
      panelEl.addEventListener("click", panelEl._aflpClickHandler, true);

      // CHANGE (bubble, directly on panel): PF2e's form change handler calls
      // stopPropagation(), which kills the event before it reaches our delegated
      // listeners on `html`. By binding directly on panelEl in the bubble phase,
      // we fire BEFORE the event reaches the ancestor <form> and its PF2e handler.
      // CHANGE: two-phase strategy.
      // Phase 1 — capture: let the event reach the checkbox so the browser applies
      //   the native toggle (target.checked flips). We do NOT stopPropagation here.
      // Phase 2 — bubble on panelEl: by the time bubble reaches panelEl, target.checked
      //   already reflects the NEW value. We react to UI changes here, then call
      //   stopPropagation() to prevent the event reaching PF2e's ancestor form handler.
      panelEl._aflpChangeHandler = (ev) => {
        const target = ev.target;
        if (!panelEl.contains(target)) return;

        // target.checked is now the NEW value (browser has applied the toggle).
        // Stop PF2e's form handler from triggering a re-render.
        ev.stopPropagation();

        // Body type select - which position pool this creature is offered.
        //
        // THIS BRANCH MUST STAY ABOVE THE VOICE BRANCH. The control carries BOTH
        // `.aflp-bodytype-select` and `.aflp-voice-select`, because it reuses the
        // voice popover's layout and CSS; a `.aflp-voice-select` test alone
        // matches it and would write the body type into `voiceProfile`.
        //
        // An empty value is "Auto": UNSET the flag rather than storing a word, so
        // `getActorPositions` falls back to live detection instead of freezing
        // today's answer. Storing "biped" and meaning "auto" is the trap here -
        // the two look identical on the sheet and behave differently the moment
        // the creature's traits change.
        if (target.matches(".aflp-bodytype-select")) {
          const v = target.value;
          (async () => {
            try {
              if (v) await actor.setFlag(AFLP.FLAG_SCOPE, "positionTrait", v);
              else   await actor.unsetFlag(AFLP.FLAG_SCOPE, "positionTrait");
            } catch (err) { console.warn("AFLP | could not set body type:", err?.message ?? err); }
          })();
          return;
        }

        // Voice profile select - persist the choice. The actor update triggers a
        // refresh that rebuilds the control with the new value (and the voice row
        // stays open because _refreshPanel preserves .aflp-voice-open).
        if (target.matches(".aflp-voice-select")) {
          const v = target.value;
          (async () => {
            try {
              if (v) await actor.setFlag(AFLP.FLAG_SCOPE, "voiceProfile", v);
              else   await actor.unsetFlag(AFLP.FLAG_SCOPE, "voiceProfile");
            } catch (err) { console.warn("AFLP | could not set voice profile:", err?.message ?? err); }
          })();
          return;
        }

        // Anatomy toggle: show/hide that part's subtype list.
        //
        // ONE derived block, not one per part. This was four copy-pasted blocks
        // for pussy, cock, tits and throat; the ass arrived in 1.0.20 with its
        // markup and its subtypes rendered but no block here, so ticking Ass did
        // nothing at all and its subtypes could never be reached. That is the
        // "anything that hardcodes the original holes is a bug" rule - the next
        // part added now works without touching this handler.
        //
        // Gated on `.aflp-genitalia-check` AND a matching `-subtypes` list, so the
        // other `aflp-*-toggle` classes on this sheet (titles, milking station,
        // coat, mind break) cannot fall in by name.
        if (target.matches(".aflp-genitalia-check")) {
          const part = [...target.classList]
            .map(c => c.match(/^aflp-(.+)-toggle$/)?.[1])
            .find(Boolean);
          const list = part ? panelEl.querySelector(`.aflp-${part}-subtypes`) : null;
          if (list) {
            list.style.setProperty("display", target.checked ? "" : "none");
            if (!target.checked) {
              list.querySelectorAll("input[type=checkbox]").forEach(cb => cb.checked = false);
            }
          }
        }

        // Creature Fetish note
        if (target.matches(".aflp-kink-check[data-slug='creature-fetish']")) {
          const note = panelEl.querySelector(".aflp-kinknote-input[name='kinknote-creature-fetish']");
          if (note) note.style.display = target.checked ? "block" : "none";
        }
      };
      panelEl.addEventListener("change", panelEl._aflpChangeHandler, false);
    }

    // All button handlers use a single delegated native click listener on the panel.
    // We re-attach each time _activateListeners is called (panel refresh), replacing
    // the previous handler cleanly.
    const panelRoot = html.querySelector(".aflp-panel") ?? html;
    if (panelRoot._aflpBtnHandler) panelRoot.removeEventListener("click", panelRoot._aflpBtnHandler);
    panelRoot._aflpBtnHandler = async (ev) => {
      const btn = ev.target.closest("[class*='aflp-']");
      if (!btn) return;
      // Stop the click from bubbling to any other listeners on parent elements.
      ev.stopPropagation();
      // Re-entry guard: prevent double-fire if two listeners somehow coexist.
      if (panelRoot._aflpBtnProcessing) return;
      panelRoot._aflpBtnProcessing = true;
      // Current edit-mode state, read from the panel (carries .aflp-edit-mode).
      // Several handlers below pass this to _refreshPanel to preserve the mode.
      const isEditMode = panelRoot.classList.contains("aflp-edit-mode");
      try {

      // Doll region: switch which slot panel shows. The doll hotspots are the only
      // selector now - the duplicate text rail is gone - so this also updates the
      // caption under the doll. Pure DOM toggle, no rebuild.
      if (btn.classList.contains("aflp-doll-hot")) {
        const region = btn.dataset.region;
        (AFLP.UI.SheetTab._activeRegion ??= {})[actor.id] = region;
        panelRoot.querySelectorAll(".aflp-doll-hot").forEach(h => h.classList.toggle("aflp-doll-active", h.dataset.region === region));
        panelRoot.querySelectorAll(".aflp-doll-panel").forEach(p => { p.style.display = p.dataset.region === region ? "" : "none"; });
        const cap = panelRoot.querySelector(".aflp-doll-caption");
        if (cap) cap.textContent = { head: "Head", torso: "Torso", "lower-body": "Lower body" }[region] ?? "";
        return;
      }
      // Doll silhouette flip - remembered on the actor so it sticks next open.
      if (btn.classList.contains("aflp-doll-flip")) {
        const doll = panelRoot.querySelector(".aflp-doll");
        if (doll) {
          const order = ["Female", "Male", "Monster"];
          const next = order[(order.indexOf(doll.dataset.silh) + 1 + order.length) % order.length];
          doll.dataset.silh = next;
          doll.style.backgroundImage = `url('modules/ardisfoxxs-lewd-pf2e/assets/Lewd%20Tokens/Silhouette${next}.png')`;
          actor.setFlag(AFLP.FLAG_SCOPE, "dollSilhouette", next).catch(() => {});
        }
        return;
      }

      // Express milk: drain the pool into units. With an ally targeted, nurse them -
      // the milk heals; otherwise it's just expressed.
      if (btn.classList.contains("aflp-milk-express")) {
        const units = await AFLP.milk.express(actor);
        if (units > 0) {
          const tgt = [...(game.user.targets ?? [])][0]?.actor;
          if (tgt && tgt !== actor) {
            const healed = await AFLP.milk.consume(tgt, units, { producer: actor });
            ChatMessage.create({ speaker: { alias: actor.name }, content: `<div class="aflp-chat-card"><p>Nurses <strong>${tgt.name}</strong> with <strong>${units}</strong> milk - ${AFLP.system?.id === "daggerheart" ? "clearing" : "restoring"} <strong>${healed}</strong> HP.</p></div>` }).catch(() => {});
          } else {
            ChatMessage.create({ speaker: { alias: actor.name }, content: `<div class="aflp-chat-card"><p>Expresses <strong>${units}</strong> milk.</p></div>` }).catch(() => {});
          }
        }
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }

      // Cum Measure cycle: Cum Shots -> ml -> fl oz -> gallons -> round.
      // This button lives INSIDE .aflp-panel, so its click is caught here by the
      // panel dispatcher. A handler on the sheet ROOT never sees it: this
      // dispatcher stopPropagation()s every [class*='aflp-'] click before it can
      // bubble out. That is exactly why the old root-mounted handler did nothing.
      // Client-scoped setting, so one player reading in gallons does not change
      // anyone else's sheet.
      if (btn.classList.contains("aflp-measure-cycle")) {
        const ORDER = ["units", "ml", "floz", "gal"];
        const cur   = AFLP.Settings.cumMeasureMode ?? "units";
        const next  = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
        try { await game.settings.set(AFLP.Settings.ID, AFLP.Settings.KEYS.CUM_MEASURE, next); }
        catch (e) { console.warn("AFLP | cum measure cycle:", e?.message); }
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }

      // Milestones Bottom/Top toggle. Pure DOM swap (no re-render) plus a
      // remembered per-actor choice, stored as a user flag so it is per-viewer
      // and never writes to the shared actor. Lives here in the dispatcher for
      // the same reason the measure button does: the panel swallows aflp- clicks.
      if (btn.classList.contains("aflp-ms-role-btn")) {
        const role = btn.dataset.role === "top" ? "top" : "bottom";
        const scope = panelRoot ?? html;
        scope.querySelectorAll(".aflp-ms-roleblock").forEach(el => {
          el.style.display = (el.dataset.msRole === role) ? "" : "none";
        });
        scope.querySelectorAll(".aflp-ms-role-btn").forEach(b =>
          b.setAttribute("aria-pressed", b.dataset.role === role ? "true" : "false"));
        try {
          const MOD = AFLP.MODULE_ID ?? "ardisfoxxs-lewd-pf2e";
          const cur = foundry.utils.duplicate(game.user.getFlag(MOD, "msRole") ?? {});
          cur[actor.id] = role;
          game.user.setFlag(MOD, "msRole", cur).catch(() => {});
        } catch (e) { /* non-fatal */ }
        return;
      }

      // Through AFLP.denied, which knows the store AND the per-actor ceiling.
      // These wrote the legacy bag by hand against a hardcoded 6: wrong store on
      // Daggerheart, where the total lives in the valued condition, and wrong
      // number everywhere, since the cap is 3 - or 4 on DH at Edge Master Greater.
      if (btn.classList.contains("aflp-denied-inc")) {
        await AFLP.denied.add(actor, 1);
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }
      if (btn.classList.contains("aflp-denied-dec")) {
        await AFLP.denied.add(actor, -1);
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }
      if (btn.classList.contains("aflp-voice-btn")) {
        // Live toggle of the voice control row; no rebuild, so it is instant.
        panelRoot.classList.toggle("aflp-voice-open");
        return;
      }
      if (btn.classList.contains("aflp-voice-test")) {
        // :not(.aflp-bodytype-select) is load-bearing - the body-type control
        // shares .aflp-voice-select for its layout and would otherwise be picked
        // up here the moment it is moved above the voice row in the markup.
        const sel = panelRoot.querySelector(".aflp-voice-select:not(.aflp-bodytype-select)");
        const profile = (sel?.value || actor.getFlag(AFLP.FLAG_SCOPE, "voiceProfile") || "").trim();
        if (!profile) { ui.notifications?.warn("AFLP: pick a voice profile to test."); return; }
        const label = window.AFLP_Voice?.testStep?.(actor.id, profile);
        if (!label) { ui.notifications?.warn(`AFLP: profile "${profile}" has no clips yet. Add files and Rescan.`); return; }
        btn.textContent = label;
        clearTimeout(btn._aflpT);
        btn._aflpT = setTimeout(() => { btn.textContent = "Test"; }, 1100);
        return;
      }
      if (btn.classList.contains("aflp-voice-rescan")) {
        try { await window.AFLP_Voice?.scan?.(); await window.AFLP_Voice?.scanSfx?.(); } catch (e) { /* ignore */ }
        // A seat without FILES_BROWSE takes the list from the GM's client rather
        // than scanning, so say that instead of reporting a scan it did not do.
        ui.notifications?.info(window.AFLP_Voice?.sharedSeat?.()
          ? `AFLP: asked the GM for the voice list (${window.AFLP_Voice?.profiles?.().length ?? 0} profile(s) so far).`
          : `AFLP: rescanned voice folder (${window.AFLP_Voice?.profiles?.().length ?? 0} profile(s)).`);
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }
      if (btn.classList.contains("aflp-titles-toggle")) {
        // Legacy titles-mode toggle (title banner removed; kept as a safe no-op
        // fallback if any old surface still emits it).
        if (panelRoot.dataset.aflpTitles) delete panelRoot.dataset.aflpTitles;
        else panelRoot.dataset.aflpTitles = "1";
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }
      // Masthead title -> jump to the Drives pane (where titles live).
      if (btn.classList.contains("aflp-mast-title")) {
        const drivesTab = html.querySelector('.aflp-subtab[data-subtab="drives"]');
        drivesTab?.click();
        return;
      }
      if (btn.classList.contains("aflp-title-star")) {
        const FLAG   = AFLP.FLAG_SCOPE;
        const titleId = btn.dataset.titleId;
        const sexual = structuredClone(actor.getFlag(FLAG, "sexual") ?? {});
        const held = new Set((sexual.titles ?? []).filter(id => AFLP_Titles.resolveTitle(id)));
        if (!titleId) {
          // "None" chosen: store a sentinel so the display does NOT fall back to
          // the most recent earned title. Distinct from unset.
          if (sexual.displayTitle !== "__none__") {
            sexual.displayTitle = "__none__";
            await actor.setFlag(FLAG, "sexual", sexual);
            await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
          }
        } else if (held.has(titleId) && sexual.displayTitle !== titleId) {
          sexual.displayTitle = titleId;
          await actor.setFlag(FLAG, "sexual", sexual);
          await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        }
        return;
      }
      if (btn.classList.contains("aflp-showlocked") || btn.classList.contains("aflp-showlocked-check")) {
        // Toggle the display-view "Show Locked" titles section. Read the intended
        // next state (a label click flips the checkbox), persist per-actor, refresh.
        const cur = !!_aflpShowLocked.get(actor.id);
        _aflpShowLocked.set(actor.id, !cur);
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }
      if (btn.classList.contains("aflp-title-track")) {
        // Toggle the tracked title (progress target). Distinct from displayed.
        const FLAG = AFLP.FLAG_SCOPE;
        const trackId = btn.dataset.trackId;
        const sexual = structuredClone(actor.getFlag(FLAG, "sexual") ?? {});
        sexual.trackedTitleId = (sexual.trackedTitleId === trackId) ? null : trackId;
        await actor.setFlag(FLAG, "sexual", sexual);
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }
      if (btn.classList.contains("aflp-arousal-dec")) {
        await AFLP_Arousal.decrement(actor, 1, "Sheet −");
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }
      if (btn.classList.contains("aflp-edit-btn")) {
        if (sheet) sheet._aflpEditMode = true;
        await AFLP.UI.SheetTab._refreshPanel(html, actor, true);
        return;
      }
      if (btn.classList.contains("aflp-lovense-btn")) {
        if (window.AFLP_Lovense) {
          AFLP_Lovense.openWizard(); // always open wizard - handles setup and reconnection
        }
        return;
      }
      if (btn.classList.contains("aflp-cancel-btn")) {
        if (sheet) sheet._aflpEditMode = false;
        _aflpPregAdditions.delete(actor.id);
        await AFLP.UI.SheetTab._refreshPanel(html, actor, false);
        return;
      }
      // (Reset button removed — reset is now handled inline in the Save handler below)
      if (btn.classList.contains("aflp-save-btn")) {
        const root = html.querySelector(".aflp-tab") ?? html;

        // ---- Collect reset checkboxes ----
        const chk = name => root.querySelector(`input[name="${name}"]`)?.checked ?? false;
        const resetSections = {
          lifetime:   chk("reset-lifetime"),
          genitalia:  chk("reset-genitalia"),
          kinks:      chk("reset-kinks"),
          cumflation: chk("reset-cumflation"),
          pregnancy:  chk("reset-pregnancy"),
          history:    chk("reset-history"),
          arousal:    chk("reset-arousal"),
          horny:      chk("reset-horny"),
          cum:        chk("reset-cum"),
          titles:     chk("reset-titles"),
        };
        const anyReset = Object.values(resetSections).some(Boolean);

        if (anyReset) {
          const labels = Object.entries(resetSections).filter(([,v]) => v).map(([k]) => k).join(", ");
          const ok = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Reset Selected Sections" },
            content: `Reset <strong>${labels}</strong> for <strong>${actor.name}</strong>?`
          });
          if (!ok) {
            root.querySelectorAll(".aflp-reset-strip input[type=checkbox]").forEach(c => { c.checked = false; });
            return;
          }
        }

        // ---- Read current state ONCE, apply all resets + edits, write ONCE per flag ----
        // This avoids race conditions from multiple sequential setFlag("sexual", ...) calls.
        const sexual = structuredClone(actor.getFlag(FLAG, "sexual") ?? AFLP.sexualDefaults);
        if (!sexual.lifetime)            sexual.lifetime            = {};
        if (!sexual.lifetime.mlGiven)    sexual.lifetime.mlGiven    = { oral:0, vaginal:0, anal:0, facial:0, gangbang:0 };
        if (!sexual.lifetime.mlReceived) sexual.lifetime.mlReceived = { oral:0, vaginal:0, anal:0, facial:0, gangbang:0 };
        if (!sexual.lifetime.given)      sexual.lifetime.given      = { oral:0, vaginal:0, anal:0, facial:0, gangbang:0 };
        if (!sexual.kinks)               sexual.kinks               = {};
        if (!sexual.kinkNotes)           sexual.kinkNotes           = {};

        // Apply resets into the in-memory object
        if (resetSections.lifetime) {
          sexual.lifetime = structuredClone(AFLP.sexualDefaults?.lifetime ?? {});
        }
        if (resetSections.kinks) {
          sexual.kinks     = {};
          sexual.kinkNotes = {};
        }

        // Apply numeric field edits from inputs
        const dirty = {};
        root.querySelectorAll(
          "input.aflp-input:not([name^='kink-']):not([name^='genitalia-']):not([name^='genitalType-']):not([name^='kinknote-']), select.aflp-input"
        ).forEach(inp => { if (inp.name && inp.value !== "") dirty[inp.name] = inp.value; });
        // Also collect the hidden horny.permanent staging input (not class=aflp-input)
        const hornyHidden = root.querySelector("input[type='hidden'][name='horny.permanent']");
        if (hornyHidden && hornyHidden.value !== "") dirty["horny.permanent"] = hornyHidden.value;

        let coomerDirty = false;
        const coomer = structuredClone(actor.getFlag(FLAG, "coomer") ?? AFLP.coomerDefaults);
        for (const [field, raw] of Object.entries(dirty)) {
          const val = parseFloat(raw) || 0;
          if      (field === "coomer.level")        { coomer.level = val; coomerDirty = true; }
          else if (field === "coomer.bonus")        { coomer.bonus = val; coomerDirty = true; }
          // Skip lifetime/ml writes if we're resetting lifetime — the reset already cleared it above
          else if (field.startsWith("given."))      { if (!resetSections.lifetime) { if (!sexual.lifetime.given) sexual.lifetime.given = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 }; sexual.lifetime.given[field.replace("given.", "")] = val; } }
          else if (field.startsWith("lifetime."))   { if (!resetSections.lifetime) sexual.lifetime[field.replace("lifetime.", "")] = val; }
          else if (field.startsWith("mlGiven."))    { if (!resetSections.lifetime) sexual.lifetime.mlGiven[field.replace("mlGiven.", "")] = val; }
          else if (field.startsWith("mlReceived.")) { if (!resetSections.lifetime) sexual.lifetime.mlReceived[field.replace("mlReceived.", "")] = val; }
        }

        // Genitalia — write from checkboxes if present in DOM; if reset, clear instead
        const genitaliaInputs = root.querySelectorAll("input[name^='genitalia-'], input[name^='genitalType-']");
        if (genitaliaInputs.length > 0) {
          if (resetSections.genitalia) {
            await actor.setFlag(FLAG, "pussy", false);
            await actor.setFlag(FLAG, "cock",  false);
            await actor.setFlag(FLAG, "anatomyFeatures", Object.fromEntries(Object.keys(AFLP.anatomyFeatures).map(k => [k, false])));
            // Body Features (the size-training unlocks) and the training pips are
            // part of the body, so a Genitalia reset clears them too.
            // Derived from the canonical lists rather than hardcoded, so adding a
            // training track cannot leave a stale key behind. Hardcoding these is
            // how the onahole track survived a Genitalia reset.
            await actor.setFlag(FLAG, "sizeTraining",
              Object.fromEntries(AFLP.TRAIN_HOLES.map(h => [h, 0])));
            await actor.setFlag(FLAG, "bodyFeatures",
              Object.fromEntries(Object.keys(AFLP.BODY_FEATURES).map(k => [k, false])));
          } else {
            await actor.setFlag(FLAG, "pussy", root.querySelector("input[name='genitalia-pussy']")?.checked ?? false);
            await actor.setFlag(FLAG, "cock",  root.querySelector("input[name='genitalia-cock']")?.checked  ?? false);
            const gt = Object.fromEntries(Object.keys(AFLP.anatomyFeatures).map(k => [k, false]));
            root.querySelectorAll("input[name^='genitalType-']").forEach(el => { gt[el.name.replace("genitalType-", "")] = el.checked; });
            // BASE PARTS ARE DERIVED, NEVER LISTED. `gt` is seeded with every
            // anatomy key FALSE, so a base part with no line here is written
            // `false` on every save no matter what its checkbox says. That has now
            // happened twice with a hardcoded list:
            //
            //   11 Aug 2026  `ass` had no line, so every save wrote ass: false -
            //                Neela ended up ass: false / throat: true and ticking
            //                the box appeared to do nothing.
            //   29 Aug 2026  `chest` was added to AFLP.anatomyFeatures and this
            //                block was not touched, so the same bug was armed
            //                again. It never fired only because the torso panel had
            //                no Chest checkbox either, so nobody could set one.
            //
            // Looping over the registry's own base parts is what stops the third
            // occurrence: add a base part and it is handled here with no edit.
            // GOES STALE IF: a base part stops being `parent: null`, or the input
            // naming convention `genitalia-<slug>` changes.
            for (const [slug, d] of Object.entries(AFLP.anatomyFeatures)) {
              if (d.parent) continue;                       // subtypes come from the loop above
              const el = root.querySelector(`input[name='genitalia-${slug}']`);
              // Absent input falls back to the part's own default: throat, ass and
              // chest read as "everyone has one unless a GM turned it off"
              // (`genitalTypes.x !== false`), so defaulting them false here would
              // contradict what the panel displays.
              gt[slug] = el ? el.checked : AFLP.ANATOMY_DEFAULT_ON.includes(slug);
            }
            await actor.setFlag(FLAG, "anatomyFeatures", gt);
            // Body Feature toggles: present checkboxes win; absent holes (e.g.
            // pussy on a no-pussy body) fall back to false.
            const bfInputs = root.querySelectorAll("input[name^='bodyFeature-']");
            if (bfInputs.length) {
              // Seed every known track, not three - an absent key here silently
              // wiped the onahole feature whenever the sheet saved.
              const bf = Object.fromEntries(Object.keys(AFLP.BODY_FEATURES).map(k => [k, false]));
              bfInputs.forEach(el => { bf[el.name.replace("bodyFeature-", "")] = el.checked; });
              await actor.setFlag(FLAG, "bodyFeatures", bf);
            }
          }
        }

        // Kinks — write from checkboxes only if not being reset
        const kinkInputs = root.querySelectorAll("input[name^='kink-']");
        if (resetSections.kinks) {
          // Also remove any embedded kink active effect items from the actor
          const kinkUuids = new Set(Object.values(AFLP.kinks ?? {}).map(k => k.uuid).filter(Boolean));
          const kinkItemsToDelete = actor.items?.filter(i =>
            kinkUuids.has(i.sourceId) || kinkUuids.has(i.flags?.core?.sourceId)
          ) ?? [];
          if (kinkItemsToDelete.length) {
            await actor.deleteEmbeddedDocuments("Item", kinkItemsToDelete.map(i => i.id));
          }
        } else if (kinkInputs.length > 0) {
          const kinks = {};
          kinkInputs.forEach(el => { kinks[el.name.replace("kink-", "")] = el.checked; });
          const cn = root.querySelector("input[name='kinknote-creature-fetish']")?.value?.trim() ?? "";
          if (cn) sexual.kinkNotes["creature-fetish"] = cn;
          else delete sexual.kinkNotes["creature-fetish"];
          sexual.kinks = kinks;
        }

        // Titles — reset or write from checkboxes
        if (resetSections.titles) {
          sexual.titles = [];
        } else {
          const titleInputs = root.querySelectorAll("input[name^='title-']");
          if (titleInputs.length > 0) {
            const titles = new Set(sexual.titles ?? []);
            titleInputs.forEach(el => {
              if (el.checked) titles.add(el.name.replace("title-", ""));
              else titles.delete(el.name.replace("title-", ""));
            });
            sexual.titles = [...titles];
          }
        }

        // Cumflation — commit the staged pip fill (edit-mode pips only touch the
        // DOM). Read each hole's filled-pip count from the Body pane. Skip when
        // the Cumflation reset is checked (handled below by the reset path).
        if (!resetSections.cumflation) {
          const cfBars = root.querySelectorAll(".aflp-cumflation-pip[data-pip-type='cumflation']");
          if (cfBars.length) {
            const cf = structuredClone(actor.getFlag(FLAG, "cumflation") ?? { oral: 0, vaginal: 0, anal: 0, facial: 0 });
            const byHole = {};
            cfBars.forEach(p => {
              const h = p.dataset.hole;
              byHole[h] = (byHole[h] ?? 0) + (p.classList.contains("filled") ? 1 : 0);
            });
            let cfDirty = false;
            for (const [h, v] of Object.entries(byHole)) { if ((cf[h] ?? 0) !== v) { cf[h] = v; cfDirty = true; } }
            if (cfDirty) {
              await actor.setFlag(FLAG, "cumflation", cf);
              await AFLP_Cumflation.applyCumflationEffects(actor);
              await AFLP.effects?.sync?.(actor);
            }
          }
        }

        // Size Training — commit the staged pip fill (routes through
        // setSizeTraining so Body Feature / Size Difference unlocks fire).
        if (!resetSections.genitalia) {
          const stBars = root.querySelectorAll(".aflp-sizetrain-pip[data-pip-type='sizetrain']");
          if (stBars.length) {
            const byHole = {};
            stBars.forEach(p => {
              const h = p.dataset.hole;
              byHole[h] = (byHole[h] ?? 0) + (p.classList.contains("filled") ? 1 : 0);
            });
            const curTrain = AFLP.sizeTrainingOf(actor);
            for (const [h, v] of Object.entries(byHole)) {
              if ((curTrain[h] ?? 0) !== v) await AFLP.setSizeTraining(actor, h, v);
            }
          }
        }

        // Write sexual object once
        await actor.setFlag(FLAG, "sexual", sexual);
        if (coomerDirty) { await actor.setFlag(FLAG, "coomer", coomer); await AFLP.recalculateCum(actor); }
        if (dirty["cumShotBonus"] !== undefined) { await actor.setFlag(FLAG, "cumShotBonus", parseFloat(dirty["cumShotBonus"]) || 0); await AFLP.recalculateCum(actor); }

        // Separate flag writes (cum.current and arousal edits)
        if (dirty["cum.current"] !== undefined) {
          const cum = structuredClone(actor.getFlag(FLAG, "cum") ?? AFLP.cumDefaults);
          cum.current = parseFloat(dirty["cum.current"]) || 0;
          await actor.setFlag(FLAG, "cum", cum);
        }
        if (dirty["arousal.current"] !== undefined) {
          const ar = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults);
          ar.current = parseFloat(dirty["arousal.current"]) || 0;
          await actor.setFlag(FLAG, "arousal", ar);
        }
        if (dirty["arousal.maxBase"] !== undefined) {
          const ar = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults);
          ar.maxBase = parseFloat(dirty["arousal.maxBase"]) || 0;
          ar.max = ar.maxBase;
          await actor.setFlag(FLAG, "arousal", ar);
        }
        // Staged permanent Horny — written from hidden input on Save.
        //
        // A GM setting the permanent floor by hand is just another SOURCE, keyed
        // "manual", so it composes with the granted ones instead of fighting
        // them: Aphrodisiac Junkie Mastery's 3 still wins by max, and a Bondage
        // Princess's while-in-ropes token is not clobbered by a GM typing 1.
        // setSustained also raises the TOTAL to meet the new floor and lowers it
        // when the floor drops - which the hand-rolled version could not do on
        // Daggerheart, where the floor is in the bag but the total is in the
        // valued condition.
        if (dirty["horny.permanent"] !== undefined) {
          const cap = AFLP.CONDITION_CAPS?.horny ?? 3;
          const newPerm = Math.max(0, Math.min(cap, parseInt(dirty["horny.permanent"], 10) || 0));
          await AFLP.horny.setSustained(actor, "manual", newPerm);
        }

        // ── Pregnancy edits, removals, additions — single atomic write ──────
        // All three operations read from one base clone and write once,
        // avoiding stale-cache issues from separate setFlag calls on a
        // synthetic token actor.
        if (!resetSections.pregnancy) {
          // Always read from the world actor to bypass synthetic token cache
          const pregnancies = structuredClone(
            AFLP.system.liveActor(actor)?.getFlag(FLAG, "pregnancy")
            ?? actor.getFlag(FLAG, "pregnancy")
            ?? {}
          );

          // Apply dirty field edits from still-visible inputs
          const pregDirty = Object.entries(dirty).filter(([k]) => k.startsWith("preg."));
          for (const [field, raw] of pregDirty) {
            const parts = field.split(".");
            if (parts.length !== 3) continue;
            const [, pregId, prop] = parts;
            if (!pregnancies[pregId]) continue;
            switch (prop) {
              case "gestationRemaining":
              case "gestationTotal":
              case "offspring": {
                const val = parseInt(raw, 10);
                if (!isNaN(val) && val >= 0) pregnancies[pregId][prop] = val;
                break;
              }
              case "sourceName":   pregnancies[pregId].sourceName   = raw?.trim() || "Unknown"; break;
              case "deliveryType": pregnancies[pregId].deliveryType = raw === "egg" ? "egg" : "live"; break;
            }
          }

          // Apply staged additions
          const additions = _aflpPregAdditions.get(actor.id) ?? [];
          for (let i = 0; i < additions.length; i++) {
            const base = additions[i];
            if (!base) continue; // null = removed before save

            // Read edited values from DOM inputs (user may have changed defaults)
            const readVal = (prop) => root.querySelector(`[name="preg-new.${i}.${prop}"]`)?.value;
            const newPreg = {
              sourceUuid: "",
              sourceName: readVal("sourceName")?.trim() || base.sourceName || "Unknown",
              gestationTotal: parseInt(readVal("gestationTotal"), 10) || base.gestationTotal || 30,
              gestationRemaining: parseInt(readVal("gestationRemaining"), 10) ?? base.gestationRemaining ?? 30,
              offspring: parseInt(readVal("offspring"), 10) || base.offspring || 1,
              deliveryType: readVal("deliveryType") === "egg" ? "egg" : (base.deliveryType || "live"),
              method: "vaginal",
              startedAt: game.time.worldTime,
            };
            pregnancies[foundry.utils.randomID()] = newPreg;
          }
          _aflpPregAdditions.delete(actor.id);

          // Write using dot-notation path — setFlag deep-merges and won't remove keys
          const worldActorWrite = AFLP.system.liveActor(actor);
          await worldActorWrite.update({ [`flags.${FLAG}.pregnancy`]: pregnancies });
        }

        // Separate flag resets
        if (resetSections.pregnancy)  await actor.unsetFlag(FLAG, "pregnancy");
        if (resetSections.history)    await actor.setFlag(FLAG, "partnerHistory", []);
        if (resetSections.arousal) {
          const ar = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults);
          await actor.setFlag(FLAG, "arousal", { ...ar, current: 0 });
        }
        if (resetSections.horny) {
          // Through the door, and through it TWICE - the sourced floors have to
          // be withdrawn or the total settles straight back onto them, and on
          // Daggerheart the total does not live in this flag at all, so the raw
          // setFlag this replaces made the Reset Horny checkbox a no-op there.
          const bag = actor.getFlag(FLAG, "horny") ?? {};
          for (const src of Object.keys(bag.sources ?? {})) await AFLP.horny.setSustained(actor, src, 0);
          await AFLP.horny._setTotal(actor, 0);
        }
        if (resetSections.cum)        await AFLP.recalculateCum(actor);
        if (resetSections.cumflation && window.AFLP_Cumflation) {
          const emptyZones = { anal: 0, oral: 0, vaginal: 0, facial: 0 };
          const emptyOverflow = { anal: 0, oral: 0, vaginal: 0, facial: 0 };
          await AFLP_Cumflation.saveCumflation(actor, emptyZones, emptyOverflow);
          await AFLP_Cumflation.applyCumflationEffects(actor);
        }

        if (anyReset) {
          const labels = Object.entries(resetSections).filter(([,v]) => v).map(([k]) => k).join(", ");
          ui.notifications.info(`${actor.name}: reset ${labels}.`);
        }

        if (sheet) sheet._aflpEditMode = false;
        await AFLP.UI.SheetTab._refreshPanel(html, actor, false);
        return;
      }
      if (btn.classList.contains("aflp-deliver-btn")) {
        const pregId = btn.dataset.pregId;
        if (!pregId) return;
        // Morph the Deliver button into inline Confirm / Cancel controls (no popup).
        btn.outerHTML =
          `<span class="aflp-deliver-wrap" style="display:inline-flex;gap:3px;">`
        + `<button type="button" class="aflp-btn aflp-deliver-confirm" data-preg-id="${pregId}" title="Confirm delivery" style="font-size:11px;padding:1px 8px;background:#3a7d44;border-color:#3a7d44;color:#fff;">&#10003;</button>`
        + `<button type="button" class="aflp-btn aflp-deliver-cancel" data-preg-id="${pregId}" title="Cancel" style="font-size:11px;padding:1px 8px;background:#7d3a3a;border-color:#7d3a3a;color:#fff;">&#10005;</button>`
        + `</span>`;
        return;
      }
      if (btn.classList.contains("aflp-deliver-confirm")) {
        const pregId = btn.dataset.pregId;
        if (!pregId) return;
        await AFLP_Pregnancy.recordBirth(actor, pregId);
        await AFLP.UI.SheetTab._refreshPanel(html, actor, false);
        return;
      }
      if (btn.classList.contains("aflp-deliver-cancel")) {
        const pregId = btn.dataset.pregId;
        if (!pregId) return;
        (btn.closest(".aflp-deliver-wrap") ?? btn).outerHTML =
          `<button type="button" class="aflp-btn aflp-deliver-btn" data-preg-id="${pregId}" style="font-size:11px;padding:1px 6px">Deliver</button>`;
        return;
      }
      if (btn.classList.contains("aflp-preg-remove-btn")) {
        ev.preventDefault(); ev.stopPropagation();
        const pregId = btn.dataset.pregId;
        if (!pregId) return;
        try {
          const worldActor = AFLP.system.liveActor(actor);
          // Use Foundry's -=key deletion syntax — dot-notation replacement and setFlag
          // both deep-merge and leave deleted keys intact. Only -=key actually removes.
          await worldActor.update({ [`flags.${FLAG}.pregnancy.-=${pregId}`]: null });
          if (sheet) sheet._aflpEditMode = true;
          await AFLP.UI.SheetTab._refreshPanel(html, actor, true);
        } catch(err) {
          console.error("AFLP | Pregnancy remove failed:", err);
          ui.notifications?.error("AFLP: Failed to remove pregnancy; see console for details.");
        }
        return;
      }
      if (btn.classList.contains("aflp-preg-add-btn")) {
        ev.preventDefault(); ev.stopPropagation();
        // Stage a new pregnancy for save
        if (!_aflpPregAdditions.has(actor.id)) _aflpPregAdditions.set(actor.id, []);
        const newPreg = {
          sourceUuid: "",
          sourceName: "Unknown",
          gestationTotal: 30,
          gestationRemaining: 30,
          offspring: 1,
          deliveryType: "live",
          method: "vaginal",
          startedAt: game.time.worldTime,
        };
        const tempId = `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        _aflpPregAdditions.get(actor.id).push(newPreg);

        // Insert a new editable row into the table
        const table = panelRoot.querySelector(".aflp-preg-table tbody");
        if (table) {
          const tr = document.createElement("tr");
          tr.dataset.pregId = tempId;
          tr.innerHTML = `
            <td style="text-align:left">
              <input class="aflp-input" type="text"
                name="preg-new.${(_aflpPregAdditions.get(actor.id)?.length ?? 1) - 1}.sourceName"
                value="" style="width:100%;min-width:70px;" placeholder="Source name"/>
            </td>
            <td>
              <select class="aflp-input" name="preg-new.${(_aflpPregAdditions.get(actor.id)?.length ?? 1) - 1}.deliveryType"
                style="font-size:11px;padding:1px 4px;">
                <option value="live" selected>Live</option>
                <option value="egg">Egg</option>
              </select>
            </td>
            <td>
              <input class="aflp-input" type="number" min="1"
                name="preg-new.${(_aflpPregAdditions.get(actor.id)?.length ?? 1) - 1}.offspring"
                value="1" style="width:38px;text-align:center;"/>
            </td>
            <td style="text-align:center">
              <input class="aflp-input" type="number" min="0"
                name="preg-new.${(_aflpPregAdditions.get(actor.id)?.length ?? 1) - 1}.gestationRemaining"
                value="30" style="width:38px;text-align:center;" title="Days remaining"/>
              <span style="color:#aaa;font-size:10px;margin:0 2px">/</span>
              <input class="aflp-input" type="number" min="1"
                name="preg-new.${(_aflpPregAdditions.get(actor.id)?.length ?? 1) - 1}.gestationTotal"
                value="30" style="width:38px;text-align:center;" title="Total gestation days"/>
            </td>
            <td>
              <button type="button" class="aflp-btn aflp-preg-remove-new-btn"
                data-new-idx="${(_aflpPregAdditions.get(actor.id)?.length ?? 1) - 1}"
                style="font-size:10px;padding:1px 5px;color:#c05040;border-color:rgba(200,60,40,0.4);"
                title="Remove">&#10005;</button>
            </td>`;
          table.appendChild(tr);

          // Bind remove for the newly added row
          tr.querySelector(".aflp-preg-remove-new-btn")?.addEventListener("click", (e2) => {
            e2.preventDefault(); e2.stopPropagation();
            const idx = parseInt(e2.currentTarget.dataset.newIdx);
            if (!isNaN(idx)) { const _pa = _aflpPregAdditions.get(actor.id); if (_pa) _pa[idx] = null; } // null out, filtered on save
            tr.remove();
          });
        }
        return;
      }
      if (btn.classList.contains("aflp-history-delete-btn")) {
        ev.preventDefault(); ev.stopPropagation();
        const idx = parseInt(btn.dataset.historyIdx ?? btn.dataset["history-idx"]);
        if (isNaN(idx)) return;
        const history = structuredClone(actor.getFlag(FLAG, "partnerHistory") ?? []);
        history.splice(idx, 1);
        await actor.setFlag(FLAG, "partnerHistory", history);
        await AFLP.UI.SheetTab._refreshPanel(html, actor, true);
        return;
      }
      if (btn.classList.contains("aflp-history-clear-btn")) {
        const ok = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Clear Partner History" },
          content: `Clear <strong>all</strong> partner history for <strong>${actor.name}</strong>? This cannot be undone.`
        });
        if (!ok) return;
        await actor.setFlag(FLAG, "partnerHistory", []);
        await AFLP.UI.SheetTab._refreshPanel(html, actor, true);
        return;
      }
      } finally {
        panelRoot._aflpBtnProcessing = false;
      }
    };
    panelRoot.addEventListener("click", panelRoot._aflpBtnHandler);

    // ── Pip listeners — wired directly to each element, NOT via delegation ──
    // Must be outside _aflpBtnHandler so they register on _activateListeners call,
    // not only after the first button click.  Direct element listeners fire before
    // the bubbling delegation handler, so stopPropagation inside each pip callback
    // prevents the delegation handler from double-processing the event.
    {
      const isEditMode = panelRoot.classList.contains("aflp-edit-mode");
      const PFLAG = AFLP.FLAG_SCOPE;

      // Arousal pips
      panelRoot.querySelectorAll(".aflp-arousal-pip[data-pip-type='arousal']").forEach(pip => {
        pip.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          if (!actor.isOwner && !game.user?.isGM) return;
          const pipIndex = parseInt(pip.dataset.pipIndex, 10);
          if (isNaN(pipIndex)) return;
          const curArousal = actor.getFlag(PFLAG, "arousal") ?? AFLP.arousalDefaults;
          const cur = curArousal.current ?? 0;
          // Click at or beyond current → fill to pipIndex+1; click within filled → peel to pipIndex
          const newVal = (pipIndex < cur) ? pipIndex : pipIndex + 1;
          await AFLP_Arousal.set(actor, newVal, "Sheet pip");
          await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        });
      });

      // Horny pips
      panelRoot.querySelectorAll(".aflp-horny-pip[data-pip-type='horny']").forEach(pip => {
        pip.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          if (!actor.isOwner && !game.user?.isGM) return;
          const pipIndex = parseInt(pip.dataset.pipIndex, 10);
          if (isNaN(pipIndex)) return;

          if (!isEditMode) {
            // VIEW MODE: set the TOTAL through the door - fill up to the clicked
            // pip, or peel it off. Was a raw setFlag on the {temp, permanent}
            // bag, which is not where Daggerheart keeps the total, so clicking a
            // Horny pip on a DH sheet wrote a flag nothing reads and the pips
            // reverted on refresh. `permanent` stays the floor either way, and
            // _setTotal derives temp from it. Found 19 Aug 2026.
            const hp    = AFLP.horny.permanent(actor);
            const total = AFLP.horny.total(actor);
            if (pipIndex < hp) return; // permanent - read-only in view mode
            const targetTotal = (pipIndex < total) ? pipIndex : pipIndex + 1;
            await AFLP.horny._setTotal(actor, Math.max(hp, targetTotal));
            await AFLP.UI.SheetTab._refreshPanel(html, actor, false);

          } else {
            // EDIT MODE: visual-only staging — no flag write until Save.
            const bar = panelRoot.querySelector(".aflp-pip-bar[data-bar-type='horny']");
            if (!bar) return;
            const horny  = actor.getFlag(PFLAG, "horny") ?? AFLP.hornyDefaults;
            const hp     = horny.permanent ?? 0; // committed permanent from flag
            const ht     = horny.temp ?? 0;
            const total  = hp + ht;
            const staged = parseInt(bar.dataset.stagedPermanent ?? hp, 10);

            // Click within staged range → shrink; click at/beyond → expand to pipIndex+1
            const newStaged = (pipIndex < staged) ? pipIndex : Math.min(pipIndex + 1, 6);

            // Update hidden input and bar dataset
            const hiddenInput = panelRoot.querySelector("input[name='horny.permanent']");
            if (hiddenInput) hiddenInput.value = newStaged;
            bar.dataset.stagedPermanent = newStaged;

            // Re-paint pip states in-place
            bar.querySelectorAll(".aflp-horny-pip").forEach(p => {
              const idx = parseInt(p.dataset.pipIndex, 10);
              p.classList.remove("filled", "perm", "staged-perm");
              if (idx < hp) {
                p.classList.add("filled", "perm");
                p.title = "Committed permanent Horny";
              } else if (idx < newStaged) {
                p.classList.add("staged-perm");
                p.title = "Staged permanent (click Save to commit)";
              } else if (idx < total) {
                p.classList.add("filled");
                p.title = "Temp Horny";
              }
            });

            // Update val label
            const valEl = panelRoot.querySelector(".aflp-bar-val[data-bar-val-type='horny']");
            if (valEl) {
              const displayTotal = Math.max(total, newStaged);
              valEl.innerHTML = displayTotal > 0
                ? `${displayTotal}/6${newStaged > 0 ? ` <span class="aflp-horny-perm-label">(${newStaged} perm staged)</span>` : ""}`
                : "0/6";
            }
          }
        });
      });

      // Cumflation pips — in VIEW mode click writes immediately; in EDIT mode
      // click only stages the fill visually (committed by Save, reverted by
      // Cancel), matching how the numeric inputs stage.
      {
        panelRoot.querySelectorAll(".aflp-cumflation-pip[data-pip-type='cumflation']").forEach(pip => {
          pip.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            if (!actor.isOwner && !game.user?.isGM) return;
            const hole     = pip.dataset.hole;
            const pipIndex = parseInt(pip.dataset.pipIndex, 10);
            if (!hole || isNaN(pipIndex)) return;
            if (isEditMode) {
              // Stage: recompute fill for this hole's bar from the click.
              const bar = pip.closest(".aflp-pip-bar") ?? pip.parentElement;
              const pips = [...bar.querySelectorAll(".aflp-cumflation-pip")];
              const cur = pips.filter(p => p.classList.contains("filled")).length;
              const next = (pipIndex < cur) ? pipIndex : Math.min(pipIndex + 1, 8);
              pips.forEach((p, i) => p.classList.toggle("filled", i < next));
              return; // no write, no refresh - Save reads DOM
            }
            const cumflation = structuredClone(actor.getFlag(FLAG, "cumflation") ?? { oral: 0, vaginal: 0, anal: 0, facial: 0 });
            const cur = cumflation[hole] ?? 0;
            cumflation[hole] = (pipIndex < cur) ? pipIndex : Math.min(pipIndex + 1, 8);
            await actor.setFlag(FLAG, "cumflation", cumflation);
            await AFLP_Cumflation.applyCumflationEffects(actor);
            await AFLP.effects?.sync?.(actor);
            await AFLP.UI.SheetTab._refreshPanel(html, actor, false);
          });
        });
      }
      // Size Training pips — same staging model: view mode writes, edit mode
      // stages the fill visually until Save.
      {
        panelRoot.querySelectorAll(".aflp-sizetrain-pip[data-pip-type='sizetrain']").forEach(pip => {
          pip.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            if (!actor.isOwner && !game.user?.isGM) return;
            const hole     = pip.dataset.hole;
            const pipIndex = parseInt(pip.dataset.pipIndex, 10);
            if (!hole || isNaN(pipIndex)) return;
            if (isEditMode) {
              const bar = pip.closest(".aflp-pip-bar") ?? pip.parentElement;
              const pips = [...bar.querySelectorAll(".aflp-sizetrain-pip")];
              const cur = pips.filter(p => p.classList.contains("filled")).length;
              const next = (pipIndex < cur) ? pipIndex : Math.min(pipIndex + 1, AFLP.SIZE_TRAIN_MAX);
              pips.forEach((p, i) => p.classList.toggle("filled", i < next));
              return;
            }
            const cur = (AFLP.sizeTrainingOf(actor)[hole] ?? 0);
            const next = (pipIndex < cur) ? pipIndex : Math.min(pipIndex + 1, AFLP.SIZE_TRAIN_MAX);
            await AFLP.setSizeTraining(actor, hole, next);
            await AFLP.UI.SheetTab._refreshPanel(html, actor, false);
          });
        });
      }
    }
    const procBtn = html.querySelector(".aflp-process-preg-btn");
    if (procBtn) {
      procBtn.onclick = null;
      procBtn.addEventListener("click", async () => {
      const pregnancies = structuredClone(await actor.getFlag(FLAG, "pregnancy") ?? {});
      const anyBirths   = [];

      for (const [pregId, preg] of Object.entries(pregnancies)) {
        if (typeof preg.gestationRemaining === "number") {
          preg.gestationRemaining -= 1;
          if (preg.gestationRemaining <= 0) {
            await AFLP_Pregnancy.recordBirth(actor, pregId, { suppressChat: true });
            anyBirths.push(preg);
          }
        }
      }

      const current = structuredClone(await actor.getFlag(FLAG, "pregnancy") ?? {});
      for (const [pregId, preg] of Object.entries(pregnancies)) {
        if (typeof preg.gestationRemaining === "number" && preg.gestationRemaining > 0) {
          if (current[pregId]) current[pregId].gestationRemaining = preg.gestationRemaining;
        }
      }
      await actor.setFlag(FLAG, "pregnancy", current);
      await AFLP.recalculateCum(actor);

      let message = `<strong>${actor.name}</strong>: gestation advanced by one day.`;
      for (const b of anyBirths) {
        const type = b.deliveryType === "egg" ? "eggs" : "offspring";
        message += `<br>${actor.name} gave birth to ${b.offspring ?? 1} ${type} fathered by <strong>${b.sourceName || "Unknown"}</strong>!`;
      }
      ChatMessage.create({ content: message });
      await AFLP.UI.SheetTab._refreshPanel(html, actor, false);
      });
    }
  },

  // -----------------------------------------------
  // Persist dirty fields
  // -----------------------------------------------
  async _save(actor, dirty, html = null) {
    const FLAG   = AFLP.FLAG_SCOPE;
    const sexual = structuredClone(actor.getFlag(FLAG, "sexual") ?? AFLP.sexualDefaults);
    const coomer = structuredClone(actor.getFlag(FLAG, "coomer") ?? AFLP.coomerDefaults);

    if (!sexual.lifetime.mlGiven)    sexual.lifetime.mlGiven    = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
    if (!sexual.lifetime.mlReceived) sexual.lifetime.mlReceived = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
    if (!sexual.lifetime.given)      sexual.lifetime.given      = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
    if (!sexual.kinks)    sexual.kinks    = {};
    if (!sexual.kinkNotes) sexual.kinkNotes = {};

    let sexualDirty = false;
    let coomerDirty = false;

    for (const [field, raw] of Object.entries(dirty)) {
      const val = parseFloat(raw) || 0;
      if      (field === "coomer.level")       { coomer.level = val; coomerDirty = true; }
      else if (field === "coomer.bonus")       { coomer.bonus = val; coomerDirty = true; }
      else if (field === "cumShotBonus")       { await actor.setFlag(FLAG, "cumShotBonus", val); coomerDirty = true; }
      else if (field === "cum.current")        { const cum = structuredClone(actor.getFlag(FLAG, "cum") ?? AFLP.cumDefaults); cum.current = val; await actor.setFlag(FLAG, "cum", cum); }
      else if (field.startsWith("given."))     { if (!sexual.lifetime.given) sexual.lifetime.given = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 }; sexual.lifetime.given[field.replace("given.", "")] = val; sexualDirty = true; }
      else if (field.startsWith("lifetime."))  { sexual.lifetime[field.replace("lifetime.", "")] = val; sexualDirty = true; }
      else if (field.startsWith("mlGiven."))   { sexual.lifetime.mlGiven[field.replace("mlGiven.", "")] = val; sexualDirty = true; }
      else if (field.startsWith("mlReceived.")){ sexual.lifetime.mlReceived[field.replace("mlReceived.", "")] = val; sexualDirty = true; }
      else if (field === "arousal.current")    { const ar = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults); ar.current = val; await actor.setFlag(FLAG, "arousal", ar); }
      else if (field === "arousal.maxBase")    { const ar = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults); ar.maxBase = val; ar.max = val; await actor.setFlag(FLAG, "arousal", ar); }
      // Through the door, and through the MANUAL source specifically - a floor
      // typed into the status editor is one grantor among several, so writing
      // `permanent` directly would clobber Bondage Princess's and Aphrodisiac
      // Junkie's. Matches the live Save handler, which is the only caller path
      // this duplicates. (This method has no caller today; kept in step rather
      // than left as a second, wrong copy that could get wired up later.)
      else if (field === "horny.permanent")    { await AFLP.horny.setSustained(actor, "manual", Math.max(0, Math.min(3, val))); }
    }

    // Numeric field writes — sexual flag
    if (sexualDirty) { await actor.setFlag(FLAG, "sexual", sexual); }
    if (coomerDirty) { await actor.setFlag(FLAG, "coomer", coomer); await AFLP.recalculateCum(actor); }
    // Genitalia, kinks, and titles are written by the save-btn handler directly
    // to avoid race conditions with reset operations.
  }
};