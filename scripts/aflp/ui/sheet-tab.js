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
const _aflpActiveSubtab = new Map(); // actorId → "status" | "pregnancy" | "history"

AFLP.UI.SheetTab = {

  register() {
    // Foundry v13 + PF2e v7: actor sheets are ApplicationV2 subclasses.
    // "renderActorSheet" and "renderActorSheetPF2e" are NOT emitted for AppV2 sheets.
    // We hook explicit PF2e sheet class names as the primary path, then use
    // "renderApplication" as a catch-all for any AppV2 sheet we miss.
    const _handler = (sheet, html, data) => {
      if (!sheet.actor) return;
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
      if (app.actor.sheet !== app) return; // same scope guard as the AppV2 path
      _handler(app, html, data);
    });
    Hooks.on("renderActorSheet", _handler);
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
    const cumShotBonus = Number(actor.getFlag(FLAG, "cumShotBonus")) || 0;
    const arousal      = actor.getFlag(FLAG, "arousal")     ?? AFLP.arousalDefaults;
    const arousalMax   = AFLP.HScene.calcArousalMax(actor);
    const arousalBase  = arousal.maxBase ?? 6;
    const denied       = actor.getFlag(FLAG, "denied")      ?? AFLP.deniedDefaults;
    const deniedValue  = denied.value ?? 0;
    const horny        = actor.getFlag(FLAG, "horny")        ?? AFLP.hornyDefaults;
    const hasPussy     = !!actor.getFlag(FLAG, "pussy");
    const hasCock      = !!actor.getFlag(FLAG, "cock");
    const cumflation   = actor.getFlag(FLAG, "cumflation")                  ?? AFLP.cumflationDefaults;
    const genitalTypes = actor.getFlag(FLAG, "genitalTypes")                ?? {};
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
    let displayTitleId = sexual.displayTitle ?? null;
    if (!displayTitleId || !titlesHeld.has(displayTitleId)) displayTitleId = mostRecentTitleId;
    const displayTitle = displayTitleId ? AFLP_Titles.resolveTitle(displayTitleId) : null;

    // Voice profile options (rendered into the panel so the control survives a
    // refresh and appears on the docked sheet, not just the popout).
    const voiceNames = (window.AFLP_Voice?.profiles?.() ?? []);
    const curVoice   = actor.getFlag(FLAG, "voiceProfile") || "";
    const voiceOpts  = ['<option value="">(none)</option>']
      .concat(voiceNames.map(n => `<option value="${n}"${n === curVoice ? " selected" : ""}>${n}</option>`))
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

    const actRows = ["oral", "vaginal", "anal", "facial", "gangbang"].map(act => {
      if (act === "vaginal" && !hasPussy) return "";
      const tReceived = sexual.lifetime[act]              ?? 0;
      const tGiven    = act === "gangbang" ? null : (sexual.lifetime.given?.[act] ?? 0);
      const mlR       = sexual.lifetime.mlReceived?.[act] ?? 0;
      const mlG       = sexual.lifetime.mlGiven?.[act]    ?? 0;

      const givenCell   = act === "gangbang"
        ? `<td class="aflp-num">-</td>`
        : `<td class="aflp-num">${cell(tGiven, `given.${act}`)}</td>`;
      const recCell     = `<td class="aflp-num">${cell(tReceived, `lifetime.${act}`)}</td>`;
      const mlGivenCell = `<td class="aflp-num">${cell(mlG, `mlGiven.${act}`)}</td>`;
      const mlRecCell   = `<td class="aflp-num">${cell(mlR, `mlReceived.${act}`)}</td>`;

      return `
        <tr>
          <td class="aflp-act-label">${act}</td>
          ${hasCock ? givenCell : ""}
          ${recCell}
          ${hasCock && AFLP.Settings.cumflationMl ? mlGivenCell : ""}
          ${AFLP.Settings.cumflationMl ? mlRecCell : ""}
        </tr>`;
    }).join("");

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
              ? AFLP.UI.SheetTab._renderTitlesEdit(titlesHeld)
              : AFLP.UI.SheetTab._renderTitlesView(titlesHeld, displayTitleId)}
          </div>
        </section>
      </div>`;
    }

    return `
    <div class="aflp-panel${editMode ? " aflp-edit-mode" : ""}">

      ${AFLP.UI.SheetTab._css()}

      <!-- Title banner (always visible, above sub-tabs) -->
      ${AFLP.Settings.titlesShow ? AFLP.UI.SheetTab._renderTitleBanner(displayTitle, heldTitleIds.length) : ""}

      <!-- Active AFLR condition badges (dom/sub/exposed/mind-break/defeated), fed from AFLP.cond -->
      ${AFLP.UI.SheetTab._renderConditionBadges(actor)}

      <!-- Sub-tab navigation -->
      <nav class="aflp-subtabs">
        <a class="aflp-subtab" data-subtab="status">Sexual Status</a>
        ${hasPussy ? `<a class="aflp-subtab" data-subtab="pregnancy">Pregnancy</a>` : ""}
        <a class="aflp-subtab" data-subtab="history">Partner History${history.length ? ` <span class="aflp-subtab-count">${history.length}</span>` : ""}</a>
      </nav>

      <!-- ═══ Sexual Status pane ═══ -->
      <section class="aflp-subtab-pane" data-subtab-pane="status">

      <!-- Header row: Cum / Coomer / Edit button -->
      <div class="aflp-header">
        ${editMode ? `
        <div class="aflp-cum-edit" style="display:flex;flex-direction:column;gap:4px;background:rgba(0,0,0,.18);border:1px solid #c9a96e55;border-radius:6px;padding:6px 9px;min-width:230px;">
          <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;font-size:12px;font-weight:600;white-space:nowrap;">
            <span>Cum Shot Bonus</span>${inlineEdit(cumShotBonus, "cumShotBonus")}<span style="opacity:.6;">&times;</span>${inlineEdit(coomer.level, "coomer.level")}<span>Loads</span>
          </div>
          <div style="font-size:11px;font-style:italic;opacity:.6;">Cum Shot value ${perShot} &middot; about ${perShot * (AFLP.CUM_UNIT_ML ?? 250)} ml (a value of 1 is about ${AFLP.CUM_UNIT_ML ?? 250} ml)</div>
        </div>` : `
        <div class="aflp-cum-pill">
          <span class="aflp-label">Cum Shot</span>
          <span>${perShot}</span>
          <span class="aflp-cum-sep">&times;</span>
          <span>${AFLP.effectiveLoads(actor)}</span>
          <span class="aflp-cum-sep">loads</span>
        </div>`}
        <div class="aflp-header-btns aflp-btn-block">
          ${editMode
            ? `<button type="button" class="aflp-btn aflp-save-btn aflp-btn-wide">💾 Save</button>
               <button type="button" class="aflp-btn aflp-cancel-btn aflp-btn-wide">✕ Cancel</button>`
            : `<button type="button" class="aflp-btn aflp-edit-btn aflp-btn-wide">✏ Edit</button>
               <div class="aflp-btn-row">
                 <button type="button" class="aflp-btn aflp-lovense-btn aflp-btn-sq" title="Lovense Integration Settings">🖤</button>
                 <button type="button" class="aflp-btn aflp-voice-btn aflp-btn-sq" title="Voice profile">🔊</button>
               </div>`
          }
        </div>
      </div>

      <!-- Voice profile control: toggled by the speaker button above; hidden
           until the panel carries .aflp-voice-open. Lives in the panel so it
           survives refreshes and shows on the docked sheet. -->
      <div class="aflp-voice-ctl" title="AFLP voice profile for this actor. Test steps through the pack; Rescan re-reads the voice folder set in module settings.">
        <span class="aflp-voice-label">Voice</span>
        <select class="aflp-voice-select">${voiceOpts}</select>
        <button type="button" class="aflp-btn aflp-voice-test">Test</button>
        <button type="button" class="aflp-btn aflp-voice-rescan">Rescan</button>
      </div>

      <!-- Arousal + Horny pip bars -->
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
            <button class="aflp-denied-inc aflp-btn-tiny" title="Add Denied" ${deniedValue >= 6 ? "disabled" : ""}>+</button>
          </span>
        </div>
        <!-- Horny bar -->
        ${(() => {
          const hp = horny.permanent ?? 0;
          const ht = horny.temp ?? 0;
          const total = hp + ht;
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

      <!-- Two-column: Lifetime | Genitalia & Kinks -->
      <div class="aflp-two-col">
        <div class="aflp-col aflp-col-left">
          <h3 class="aflp-section-header">Lifetime Totals</h3>
          <table class="aflp-table">
            <thead>
              <tr>
                <th>Sex Act</th>
                ${hasCock ? `<th>Times Given</th>` : ""}
                <th>Times Received</th>
                ${hasCock && AFLP.Settings.cumflationMl ? `<th>Cum Given (ml)</th>` : ""}
                ${AFLP.Settings.cumflationMl ? `<th>Cum Received (ml)</th>` : ""}
              </tr>
            </thead>
            <tbody>${actRows}</tbody>
          </table>
        </div>

        <div class="aflp-col aflp-col-right">
          <h3 class="aflp-section-header">Genitalia</h3>
          <div class="aflp-genitalia">
            ${editMode
              ? await AFLP.UI.SheetTab._renderGenitaliaEdit(hasPussy, hasCock, genitalTypes)
              : await AFLP.UI.SheetTab._renderGenitalia(hasPussy, hasCock, genitalTypes)}
          </div>
          <h3 class="aflp-section-header" style="margin-top:10px">Kinks</h3>
          <div class="aflp-kinks">
            ${editMode
              ? AFLP.UI.SheetTab._renderKinksEdit(kinks, kinkNotes)
              : await AFLP.UI.SheetTab._renderKinks(kinks, kinkNotes)}
          </div>
        </div>
      </div>

      <!-- Cumflation -->
      ${AFLP.Settings.cumflationTracking ? `
      <div class="aflp-section">
        <h3 class="aflp-section-header">Cumflation</h3>
        <div class="aflp-cumflation-grid">
          ${await AFLP.UI.SheetTab._renderCumflationRows(cumflation, totalTier, actor)}
        </div>
        <button type="button" class="aflp-coat-toggle" title="Cycle the cumflation token coat: Portrait (flat face/bust image, no ring) - Bust (cropped portrait inside a dynamic ring)." style="margin-top:6px;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;background:#2a261f;color:#c9a96e;border:1px solid #3a342b;border-radius:4px;padding:3px 8px;cursor:pointer;">Token coat: ${actor.getFlag(AFLP.FLAG_SCOPE, "coatBust") ? "Bust" : "Portrait"}</button>
      </div>` : ""}

      </section>

      <!-- ═══ Pregnancy pane ═══ -->
      ${hasPussy ? `
      <section class="aflp-subtab-pane" data-subtab-pane="pregnancy">
        <div class="aflp-section">
          <h3 class="aflp-section-header">Pregnancy</h3>
          ${AFLP.UI.SheetTab._renderPregnancy(pregnancy, editMode)}
          <button type="button" class="aflp-btn aflp-process-preg-btn" style="margin-top:6px">
            Advance Gestation Day
          </button>
        </div>
      </section>` : ""}

      <!-- ═══ Partner History pane ═══ -->
      <section class="aflp-subtab-pane" data-subtab-pane="history">
        <div class="aflp-section">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px;">
            <h3 class="aflp-section-header" style="margin:0;border-bottom:none;">Partner History</h3>
            ${editMode && history.length
              ? `<button type="button" class="aflp-btn aflp-history-clear-btn" style="font-size:11px;padding:2px 8px;background:rgba(160,60,40,0.1);border-color:#a03c28;">✕ Clear All</button>`
              : `<span></span>`}
          </div>
          <div style="border-bottom:1px solid var(--color-border-dark-tertiary,#c9a96e);margin-bottom:6px;"></div>
          ${AFLP.UI.SheetTab._renderHistory(history, editMode)}
        </div>
      </section>

      <!-- Titles now live in titles-mode, reached from the banner button -->

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
        width: 54px; text-align: right; font-weight: 500;
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
    const enrich = (u) =>
      foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${u}]{${label}}`);
    const sysUuid = (slug ? AFLP.system?.contentUuid?.(slug) : null) ?? null;
    if (sysUuid) return await enrich(sysUuid);
    if (game.system?.id !== "daggerheart" && fallbackUuid) return await enrich(fallbackUuid);
    return `<span>${label}</span>`;
  },

  // -----------------------------------------------
  // Render genitalia
  // -----------------------------------------------
  async _renderGenitalia(hasPussy, hasCock, genitalTypes) {
    if (!hasPussy && !hasCock) return `<div class="aflp-none">None</div>`;
    // Each type links to this system's pack item; subtypes without an item (e.g.
    // litter subtypes) render as plain text so the link is never broken.
    const lbl = async (slug, d) => AFLP.UI.SheetTab._contentLink(slug, d?.uuid, d?.name);
    const subtypesOf = async (parent) => (await Promise.all(
      Object.entries(AFLP.genitalTypes)
        .filter(([slug, d]) => d.parent === parent && genitalTypes[slug])
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(async ([slug, d]) => `<li class="aflp-subtype">${await lbl(slug, d)}</li>`)
    )).filter(Boolean);
    const items = [];
    if (hasPussy) {
      items.push(`<li>${await lbl("pussy", AFLP.genitalTypes["pussy"])}</li>`);
      items.push(...await subtypesOf("pussy"));
    }
    if (hasCock) {
      items.push(`<li>${await lbl("cock", AFLP.genitalTypes["cock"])}</li>`);
      items.push(...await subtypesOf("cock"));
    }
    return `<ul>${items.join("")}</ul>`;
  },

  // -----------------------------------------------
  // Render kinks
  // -----------------------------------------------
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
  async _renderGenitaliaEdit(hasPussy, hasCock, genitalTypes) {
    const subtypeChecks = (parent) => Object.entries(AFLP.genitalTypes)
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
    const pussySubtypes = subtypeChecks("pussy");
    const cockSubtypes  = subtypeChecks("cock");

    return `
      <ul class="aflp-check-list">
        <li>
          <label>
            <span><strong>Pussy</strong></span>
            <input type="checkbox" class="aflp-genitalia-check aflp-pussy-toggle" name="genitalia-pussy" ${hasPussy ? "checked" : ""}/>
          </label>
        </li>
        <ul class="aflp-check-list aflp-pussy-subtypes" style="${hasPussy ? "" : "display:none"}">
          ${pussySubtypes}
        </ul>
        <li>
          <label>
            <span><strong>Cock</strong></span>
            <input type="checkbox" class="aflp-genitalia-check aflp-cock-toggle" name="genitalia-cock" ${hasCock ? "checked" : ""}/>
          </label>
        </li>
        <ul class="aflp-check-list aflp-cock-subtypes" style="${hasCock ? "" : "display:none"}">
          ${cockSubtypes}
        </ul>
      </ul>`;
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
  async _renderCumflationRows(cumflation, totalTier, actor) {
    const DAZZLED_UUID = "Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh";
    const BLINDED_UUID = "Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2";
    // Cumflation tier effects and the facial vision conditions are PF2e content;
    // on Daggerheart they have no pack item, so show plain tier text (no broken link).
    const isDH = game.system?.id === "daggerheart";

    // Paizuri is only reachable by actors with My Body is a Weapon, so only show
    // its row for them (or if it already holds cum), to avoid cluttering every sheet.
    const showPaizuri = actor?.getFlag(AFLP.FLAG_SCOPE, "myBodyIsAWeapon") === true || (cumflation.paizuri ?? 0) > 0;
    const holeList = showPaizuri
      ? ["oral", "vaginal", "anal", "facial", "paizuri"]
      : ["oral", "vaginal", "anal", "facial"];

    const rows = await Promise.all(holeList.map(async hole => {
      const tier    = cumflation[hole] ?? 0;
      const maxPips = 8;  // all holes capped at 8
      const pips    = Array.from({ length: maxPips }, (_, i) =>
        `<span class="aflp-pip aflp-cumflation-pip${i < tier ? " filled" : ""}"
               data-pip-type="cumflation" data-hole="${hole}" data-pip-index="${i}"
               title="${hole} tier ${i+1}/8 - click to set"></span>`
      ).join("");

      let link = "";
      if (tier > 0) {
        const w = AFLP.cumflationWordForTier?.(tier, hole);
        const wordHtml = w
          ? `<span style="color:${w.color};font-weight:600;">${w.word}</span>`
          : `Tier ${tier}`;
        if (hole === "facial") {
          // Show this hole's descriptor word; on PF2e link it to the matching
          // vision condition (Dazzled/Blinded) which it causes.
          const visionUuid = (!isDH && tier >= 8) ? BLINDED_UUID : (!isDH && tier >= 4) ? DAZZLED_UUID : null;
          link = visionUuid
            ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${visionUuid}]{${w?.word ?? `Tier ${tier}`}}`)
            : wordHtml;
        } else {
          const key  = `cumflation${hole.charAt(0).toUpperCase() + hole.slice(1)}`;
          const uuid = AFLP.items[key]?.[tier - 1];
          link = (uuid && !isDH)
            ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${uuid}]{${w?.word ?? `Tier ${tier}`}}`)
            : wordHtml;
        }
      }

      return `
        <div class="aflp-cum-row">
          <span class="aflp-cum-row-label">${hole}</span>
          <div class="aflp-cum-col">
            <div class="aflp-pip-bar">${pips}</div>
            <span class="aflp-cum-row-link">${tier > 0 ? link : "<span style='color:#999;font-style:italic;font-size:11px'>Clear</span>"}</span>
          </div>
        </div>`;
    }));

    const overallPips = Array.from({ length: 8 }, (_, i) =>
      `<span class="aflp-pip${i < totalTier ? " filled" : ""}"></span>`
    ).join("");
    const overallW = actor ? AFLP.cumflationWord(actor) : AFLP.cumflationWordForTier?.(totalTier);
    let overallLink = "";
    if (totalTier > 0) {
      const wTxt  = overallW?.word ?? `Tier ${totalTier}`;
      const wHtml = `<span style="color:${overallW?.color ?? "var(--aflr-text)"};font-weight:600;">${wTxt}</span>`;
      const uuid  = AFLP.items.cumflationTotal?.[totalTier - 1];
      if (uuid && !isDH) {
        const raw = await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${uuid}]{${wTxt}}`);
        overallLink = typeof raw === "string" ? raw : (raw?.outerHTML ?? wHtml);
      } else {
        overallLink = wHtml;
      }
    }
    rows.push(`
      <div class="aflp-cum-row aflp-cum-row-overall">
        <span class="aflp-cum-row-label">Overall</span>
        <div class="aflp-cum-col">
          <div class="aflp-pip-bar">${overallPips}</div>
          <span class="aflp-cum-row-link">${totalTier > 0 ? overallLink : "<span style='color:#999;font-style:italic;font-size:11px'>Clear</span>"}</span>
        </div>
      </div>`);

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
  _renderHistory(history, editMode = false) {
    if (!history.length) return `<div class="aflp-none">No history yet.</div>`;
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

      const pregChip = entry.pregnancyResult
        ? `<span class="aflp-history-chip aflp-history-preg">🥚 Impregnated: ${entry.pregnancyResult.offspring} ${entry.pregnancyResult.deliveryType === "egg" ? "eggs" : "offspring"}</span>`
        : "";

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
    if (AFLP.cond.has(actor, "breeding")) out.push(badge("⚸", 1, "breeding", "Breeding"));
    const isGM = game.user.isGM;
    if (!out.length && !isGM) return "";
    const manageBtn = isGM
      ? `<button type="button" class="aflp-cond-manage" title="Manage conditions (GM)">⚙ Conditions</button>`
      : "";
    return `<div class="aflp-sheet-conds">${out.join("")}${manageBtn}</div>`;
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
      .aflp-cm { display:flex; flex-direction:column; gap:12px; padding:4px 2px 2px; min-width:264px; font-family:var(--font-primary, serif); }
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

  async _openConditionManager(actor, html) {
    if (!game.user.isGM || !actor) return;
    AFLP.UI.SheetTab._ensureConditionManagerCSS();
    const dhDefeat = game.system?.id === "daggerheart";
    const cur = {
      dominating:   AFLP.cond.has(actor, "dominating"),
      submitting:   AFLP.cond.has(actor, "submitting"),
      defeat:       dhDefeat ? AFLP.cond.value(actor, "defeat") : (AFLP.cond.has(actor, "defeated") ? 1 : 0),
      exposed:      AFLP.cond.value(actor, "exposed"),
      mindBreak:    AFLP.cond.value(actor, "mind-break"),
      bimbofied:    AFLP.cond.value(actor, "bimbofied"),
      bullified:    AFLP.cond.value(actor, "bullified"),
      birthControl: AFLP.cond.has(actor, "birth-control"),
      breeding:     AFLP.cond.has(actor, "breeding"),
    };
    const role = cur.dominating ? "dominating" : (cur.submitting ? "submitting" : "none");
    // Token control: +/- buttons plus left-click-to-mark / right-click-to-clear
    // on the value. A hidden input preserves the name so the Apply reader below
    // is unchanged. data-max="" means unbounded (Mind Break on PF2e).
    const tok = (name, value, min, max) => `
      <div class="aflp-cm-tok" data-min="${min}" data-max="${max ?? ""}" title="Left-click to mark, right-click to clear">
        <button type="button" class="aflp-cm-tok-btn" data-d="-1">&minus;</button>
        <span class="aflp-cm-tok-val">${value}</span>
        <button type="button" class="aflp-cm-tok-btn" data-d="1">+</button>
        <input type="hidden" name="${name}" value="${value}"/>
      </div>`;
    const content = `
      <div class="aflp-cm">
        <div class="aflp-cm-head">
          <span class="aflp-cm-head-ico">⚙</span>
          <span class="aflp-cm-actor">${actor.name}</span>
        </div>

        <div class="aflp-cm-section">
          <div class="aflp-cm-label">Scene Role</div>
          <div class="aflp-cm-chips">
            <label class="aflp-cm-chip role-none">
              <input type="radio" name="aflp-cm-role" value="none" ${role==="none"?"checked":""}/>
              <span class="aflp-cm-chip-txt">None</span>
            </label>
            <label class="aflp-cm-chip role-dominating">
              <input type="radio" name="aflp-cm-role" value="dominating" ${role==="dominating"?"checked":""}/>
              <span class="aflp-cm-chip-ico">▲</span><span class="aflp-cm-chip-txt">Dominating</span>
            </label>
            <label class="aflp-cm-chip role-submitting">
              <input type="radio" name="aflp-cm-role" value="submitting" ${role==="submitting"?"checked":""}/>
              <span class="aflp-cm-chip-ico">▼</span><span class="aflp-cm-chip-txt">Submitting</span>
            </label>
          </div>
        </div>

        <div class="aflp-cm-section">
          <div class="aflp-cm-label">Tokens</div>
          ${dhDefeat ? "" : `
          <div class="aflp-cm-stepper exposed">
            <span class="aflp-cm-step-ico">✦</span>
            <span class="aflp-cm-step-name">Exposed</span>
            ${tok("aflp-cm-exposed", cur.exposed, 0, 2)}
            <span class="aflp-cm-step-hint">0&ndash;2</span>
          </div>`}
          ${dhDefeat ? "" : `
          <div class="aflp-cm-stepper mind-break">
            <span class="aflp-cm-step-ico">✲</span>
            <span class="aflp-cm-step-name">Mind Break</span>
            ${tok("aflp-cm-mindbreak", cur.mindBreak, 0, null)}
            <span class="aflp-cm-step-hint">0 = off</span>
          </div>`}
          <div class="aflp-cm-stepper defeat">
            <span class="aflp-cm-step-ico">☠</span>
            <span class="aflp-cm-step-name">Defeat</span>
            ${tok("aflp-cm-defeat", cur.defeat, 0, dhDefeat ? 3 : 1)}
            <span class="aflp-cm-step-hint">${dhDefeat ? "0&ndash;3" : "0/1"}</span>
          </div>
          <div class="aflp-cm-stepper bimbofied">
            <span class="aflp-cm-step-ico">❀</span>
            <span class="aflp-cm-step-name">Bimbofied</span>
            ${tok("aflp-cm-bimbofied", cur.bimbofied, 0, 3)}
            <span class="aflp-cm-step-hint">0&ndash;3</span>
          </div>
          <div class="aflp-cm-stepper bullified">
            <span class="aflp-cm-step-ico">♂</span>
            <span class="aflp-cm-step-name">Bullified</span>
            ${tok("aflp-cm-bullified", cur.bullified, 0, 3)}
            <span class="aflp-cm-step-hint">0&ndash;3</span>
          </div>
        </div>

        ${dhDefeat ? `
        <div class="aflp-cm-section">
          <div class="aflp-cm-label">Death Moves</div>
          <div class="aflp-cm-chips">
            <label class="aflp-cm-chip dm-mind-break">
              <input type="checkbox" name="aflp-cm-mindbreak-toggle" ${cur.mindBreak > 0 ? "checked" : ""}/>
              <span class="aflp-cm-chip-ico">✲</span><span class="aflp-cm-chip-txt">Mind Break</span>
            </label>
          </div>
        </div>` : ""}

        ${dhDefeat ? `
        <div class="aflp-cm-section">
          <div class="aflp-cm-label">State</div>
          <div class="aflp-cm-chips">
            <label class="aflp-cm-chip fx-exposed">
              <input type="checkbox" name="aflp-cm-exposed" ${cur.exposed > 0 ? "checked" : ""}/>
              <span class="aflp-cm-chip-ico">✦</span><span class="aflp-cm-chip-txt">Exposed</span>
            </label>
          </div>
        </div>` : ""}

        <div class="aflp-cm-section">
          <div class="aflp-cm-label">Pregnancy Modifiers</div>
          <div class="aflp-cm-chips">
            <label class="aflp-cm-chip fx-birth-control">
              <input type="checkbox" name="aflp-cm-birth-control" ${cur.birthControl?"checked":""}/>
              <span class="aflp-cm-chip-ico">⊘</span><span class="aflp-cm-chip-txt">Birth Control</span>
            </label>
            <label class="aflp-cm-chip fx-breeding">
              <input type="checkbox" name="aflp-cm-breeding" ${cur.breeding?"checked":""}/>
              <span class="aflp-cm-chip-ico">⚸</span><span class="aflp-cm-chip-txt">Breeding</span>
            </label>
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
          // Left-click the value to mark (+1); right-click to clear.
          valEl.addEventListener("click",       e => { e.preventDefault(); set(Number(hidden.value || 0) + 1); });
          valEl.addEventListener("contextmenu",  e => { e.preventDefault(); set(0); });
        });
      },
      buttons: [
        {
          action: "apply", label: "Apply", default: true,
          callback: (ev, btn, dlg) => {
            const root = dlg.element;
            return {
              role:        root.querySelector('input[name="aflp-cm-role"]:checked')?.value ?? "none",
              defeat:      Math.max(0, Math.min(dhDefeat ? 3 : 1, Number(root.querySelector('input[name="aflp-cm-defeat"]')?.value ?? 0))),
              exposed:     dhDefeat
                ? (root.querySelector('input[name="aflp-cm-exposed"]')?.checked ? 1 : 0)
                : Math.max(0, Math.min(2, Number(root.querySelector('input[name="aflp-cm-exposed"]')?.value ?? 0))),
              mindBreak:   dhDefeat
                ? (root.querySelector('input[name="aflp-cm-mindbreak-toggle"]')?.checked ? 1 : 0)
                : Math.max(0, Math.min(99, Number(root.querySelector('input[name="aflp-cm-mindbreak"]')?.value ?? 0))),
              bimbofied:   Math.max(0, Math.min(3, Number(root.querySelector('input[name="aflp-cm-bimbofied"]')?.value ?? 0))),
              bullified:   Math.max(0, Math.min(3, Number(root.querySelector('input[name="aflp-cm-bullified"]')?.value ?? 0))),
              birthControl: root.querySelector('input[name="aflp-cm-birth-control"]')?.checked ?? false,
              breeding:    root.querySelector('input[name="aflp-cm-breeding"]')?.checked ?? false,
            };
          },
        },
        { action: "cancel", label: "Cancel", callback: () => null },
      ],
      close: () => null,
      rejectClose: false,
    });
    if (!result) return;

    // Exact-set a valued condition (create at value if absent, set if present, remove at 0).
    const setExact = async (slug, target) => {
      if (target <= 0) return AFLP.cond.remove(actor, slug);
      if (AFLP.cond.has(actor, slug)) return AFLP.cond.setValue(actor, slug, target);
      return AFLP.cond.apply(actor, slug, target);
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

    // Defeat: on Daggerheart this is a valued token track (0-3, the give-in /
    // climax spiral accelerant); on PF2e it is the boolean Defeated condition
    // item, so any value > 0 means present.
    if (dhDefeat) {
      await setExact("defeat", result.defeat);
    } else if (result.defeat > 0) {
      if (!AFLP.cond.has(actor, "defeated")) await AFLP.cond.apply(actor, "defeated");
    } else {
      await AFLP.cond.remove(actor, "defeated");
    }

    // Valued conditions (Mind Break create/remove also drives the onset/end automation).
    await setExact("exposed", result.exposed);
    await setExact("mind-break", result.mindBreak);

    // Bimbofied / Bullified are token-track conditions: prefer the adapter's
    // dedicated setter (which keeps the feature-resource track in step on DH) and
    // fall back to the generic flag path on systems that lack it.
    const setTracked = async (slug, setter, target) => {
      if (typeof AFLP.system?.[setter] === "function") return AFLP.system[setter](actor, target);
      return setExact(slug, target);
    };
    await setTracked("bimbofied", "setBimbofied", result.bimbofied);
    await setTracked("bullified", "setBullified", result.bullified);

    // Birth Control / Breeding toggles (flag-backed on every system; the cum
    // macro and attemptImpregnation read these via AFLP.cond).
    const setToggle = async (slug, on) => {
      if (on) { if (!AFLP.cond.has(actor, slug)) await AFLP.cond.apply(actor, slug); }
      else await AFLP.cond.remove(actor, slug);
    };
    await setToggle("birth-control", result.birthControl);
    await setToggle("breeding", result.breeding);

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
  _renderTitlesView(titlesHeld, displayTitleId = null) {
    if (!titlesHeld.size) return `<div class="aflp-none">No titles earned yet.</div>`;
    const items = AFLP_Titles.TITLES
      .filter(t => titlesHeld.has(t.id))
      .map(t => {
        const isActive = t.id === displayTitleId;
        const star = isActive ? "★" : "☆";
        const starTitle = isActive ? "Currently displayed title" : "Set as displayed title";
        const name = AFLP_Titles._name(t.id, t.name);
        return `
        <div class="aflp-title-chip${isActive ? " aflp-title-active" : ""}" title="🏆 ${name}">
          <div class="aflp-title-chip-head">
            <button type="button" class="aflp-title-star${isActive ? " active" : ""}"
              data-title-id="${t.id}" title="${starTitle}">${star}</button>
            🏆 <strong>${name}</strong>
          </div>
          <span class="aflp-title-desc">${t.desc}</span>
        </div>`;
      }).join("");
    return `<div class="aflp-title-list">${items}</div>`;
  },

  // -----------------------------------------------
  // Render titles — edit mode (checkbox list)
  // -----------------------------------------------
  _renderTitlesEdit(titlesHeld) {
    const items = AFLP_Titles.TITLES.map(t => `
      <li>
        <label>
          <span title="${t.desc}">${t.name}</span>
          <input type="checkbox" class="aflp-title-check" name="title-${t.id}"
            data-title-id="${t.id}" ${titlesHeld.has(t.id) ? "checked" : ""}/>
        </label>
      </li>`).join("");
    return `<ul class="aflp-check-list">${items}</ul>`;
  },

  // -----------------------------------------------
  // Listeners — bound on html root with .aflp namespace
  // -----------------------------------------------
  _activateListeners(html, actor, sheet) {
    const FLAG = AFLP.FLAG_SCOPE;

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
        if (!validTabs.has(which)) which = "status";
        _aflpActiveSubtab.set(actor.id, which);
        tabs.forEach(t => t.classList.toggle("active", t.dataset.subtab === which));
        panes.forEach(p => p.classList.toggle("active", p.dataset.subtabPane === which));
      };

      // Restore the previously-active tab (default "status").
      applySubtab(_aflpActiveSubtab.get(actor.id) ?? "status");

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

        // Pussy toggle: show/hide subtypes
        if (target.matches(".aflp-pussy-toggle")) {
          panelEl.querySelector(".aflp-pussy-subtypes")
            ?.style.setProperty("display", target.checked ? "" : "none");
          if (!target.checked) {
            panelEl.querySelectorAll(".aflp-pussy-subtypes input[type=checkbox]")
              .forEach(cb => cb.checked = false);
          }
        }

        // Cock toggle: show/hide subtypes
        if (target.matches(".aflp-cock-toggle")) {
          panelEl.querySelector(".aflp-cock-subtypes")
            ?.style.setProperty("display", target.checked ? "" : "none");
          if (!target.checked) {
            panelEl.querySelectorAll(".aflp-cock-subtypes input[type=checkbox]")
              .forEach(cb => cb.checked = false);
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

      if (btn.classList.contains("aflp-denied-inc")) {
        const FLAG   = AFLP.FLAG_SCOPE;
        const denied = structuredClone(actor.getFlag(FLAG, "denied") ?? AFLP.deniedDefaults);
        denied.value = Math.min(6, (denied.value ?? 0) + 1);
        await actor.setFlag(FLAG, "denied", denied);
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }
      if (btn.classList.contains("aflp-denied-dec")) {
        const FLAG   = AFLP.FLAG_SCOPE;
        const denied = structuredClone(actor.getFlag(FLAG, "denied") ?? AFLP.deniedDefaults);
        denied.value = Math.max(0, (denied.value ?? 0) - 1);
        await actor.setFlag(FLAG, "denied", denied);
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }
      if (btn.classList.contains("aflp-voice-btn")) {
        // Live toggle of the voice control row; no rebuild, so it is instant.
        panelRoot.classList.toggle("aflp-voice-open");
        return;
      }
      if (btn.classList.contains("aflp-voice-test")) {
        const sel = panelRoot.querySelector(".aflp-voice-select");
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
        ui.notifications?.info(`AFLP: rescanned voice folder (${window.AFLP_Voice?.profiles?.().length ?? 0} profile(s)).`);
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }
      if (btn.classList.contains("aflp-titles-toggle")) {
        // Flip titles-mode on the panel dataset; _refreshPanel reads it back so
        // the whole sheet swaps to (or from) the titles view.
        if (panelRoot.dataset.aflpTitles) delete panelRoot.dataset.aflpTitles;
        else panelRoot.dataset.aflpTitles = "1";
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }
      if (btn.classList.contains("aflp-title-star")) {
        const FLAG   = AFLP.FLAG_SCOPE;
        const titleId = btn.dataset.titleId;
        const sexual = structuredClone(actor.getFlag(FLAG, "sexual") ?? {});
        const held = new Set((sexual.titles ?? []).filter(id => AFLP_Titles.resolveTitle(id)));
        // Only allow selecting a title the actor actually holds.
        if (titleId && held.has(titleId) && sexual.displayTitle !== titleId) {
          sexual.displayTitle = titleId;
          await actor.setFlag(FLAG, "sexual", sexual);
          await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        }
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
          AFLP_Lovense.openWizard(); // always open wizard — handles setup and reconnection
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
            await actor.setFlag(FLAG, "genitalTypes", Object.fromEntries(Object.keys(AFLP.genitalTypes).map(k => [k, false])));
          } else {
            await actor.setFlag(FLAG, "pussy", root.querySelector("input[name='genitalia-pussy']")?.checked ?? false);
            await actor.setFlag(FLAG, "cock",  root.querySelector("input[name='genitalia-cock']")?.checked  ?? false);
            const gt = Object.fromEntries(Object.keys(AFLP.genitalTypes).map(k => [k, false]));
            root.querySelectorAll("input[name^='genitalType-']").forEach(el => { gt[el.name.replace("genitalType-", "")] = el.checked; });
            await actor.setFlag(FLAG, "genitalTypes", gt);
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
        // Staged permanent Horny — written from hidden input on Save
        if (dirty["horny.permanent"] !== undefined) {
          const horny = structuredClone(actor.getFlag(FLAG, "horny") ?? AFLP.hornyDefaults);
          const newPerm = Math.max(0, Math.min(3, parseInt(dirty["horny.permanent"], 10) || 0));
          // If permanent increased, keep temp; if decreased, reduce temp so total doesn't exceed 3
          const newTotal = newPerm + (horny.temp ?? 0);
          if (newTotal > 3) horny.temp = Math.max(0, 3 - newPerm);
          horny.permanent = newPerm;
          await actor.setFlag(FLAG, "horny", horny);
        }

        // ── Pregnancy edits, removals, additions — single atomic write ──────
        // All three operations read from one base clone and write once,
        // avoiding stale-cache issues from separate setFlag calls on a
        // synthetic token actor.
        if (!resetSections.pregnancy) {
          // Always read from the world actor to bypass synthetic token cache
          const pregnancies = structuredClone(
            game.actors?.get(actor.id)?.getFlag(FLAG, "pregnancy")
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
          const worldActorWrite = game.actors?.get(actor.id) ?? actor;
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
          await actor.setFlag(FLAG, "horny", structuredClone(AFLP.hornyDefaults));
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
          const worldActor = game.actors?.get(actor.id) ?? actor;
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
            // VIEW MODE: immediate flag write, fill up to clicked pip or peel off.
            const horny = structuredClone(actor.getFlag(PFLAG, "horny") ?? AFLP.hornyDefaults);
            const hp    = horny.permanent ?? 0;
            const ht    = horny.temp ?? 0;
            const total = hp + ht;
            if (pipIndex < hp) return; // permanent — read-only in view mode
            const targetTotal = (pipIndex < total) ? pipIndex : pipIndex + 1;
            horny.temp = Math.max(0, Math.min(targetTotal - hp, 3 - hp));
            await actor.setFlag(PFLAG, "horny", horny);
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

      // Cumflation pips — click to set hole tier directly (GM/owner only, view mode)
      if (!isEditMode) {
        panelRoot.querySelectorAll(".aflp-cumflation-pip[data-pip-type='cumflation']").forEach(pip => {
          pip.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            if (!actor.isOwner && !game.user?.isGM) return;
            const hole     = pip.dataset.hole;
            const pipIndex = parseInt(pip.dataset.pipIndex, 10);
            if (!hole || isNaN(pipIndex)) return;
            const cumflation = structuredClone(actor.getFlag(FLAG, "cumflation") ?? { oral: 0, vaginal: 0, anal: 0, facial: 0 });
            const cur = cumflation[hole] ?? 0;
            // Click within filled → reduce to pipIndex; click at/beyond → set to pipIndex+1
            cumflation[hole] = (pipIndex < cur) ? pipIndex : Math.min(pipIndex + 1, 8);
            await actor.setFlag(FLAG, "cumflation", cumflation);
            await AFLP_Cumflation.applyCumflationEffects(actor);
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
      else if (field === "cumShotBonus")       { await actor.setFlag(FLAG, "cumShotBonus", val); coomerDirty = true; }
      else if (field === "cum.current")        { const cum = structuredClone(actor.getFlag(FLAG, "cum") ?? AFLP.cumDefaults); cum.current = val; await actor.setFlag(FLAG, "cum", cum); }
      else if (field.startsWith("given."))     { if (!sexual.lifetime.given) sexual.lifetime.given = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 }; sexual.lifetime.given[field.replace("given.", "")] = val; sexualDirty = true; }
      else if (field.startsWith("lifetime."))  { sexual.lifetime[field.replace("lifetime.", "")] = val; sexualDirty = true; }
      else if (field.startsWith("mlGiven."))   { sexual.lifetime.mlGiven[field.replace("mlGiven.", "")] = val; sexualDirty = true; }
      else if (field.startsWith("mlReceived.")){ sexual.lifetime.mlReceived[field.replace("mlReceived.", "")] = val; sexualDirty = true; }
      else if (field === "arousal.current")    { const ar = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults); ar.current = val; await actor.setFlag(FLAG, "arousal", ar); }
      else if (field === "arousal.maxBase")    { const ar = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults); ar.maxBase = val; ar.max = val; await actor.setFlag(FLAG, "arousal", ar); }
      else if (field === "horny.permanent")    { const h = structuredClone(actor.getFlag(FLAG, "horny") ?? AFLP.hornyDefaults); const np = Math.max(0, Math.min(3, val)); if ((np + (h.temp ?? 0)) > 3) h.temp = Math.max(0, 3 - np); h.permanent = np; await actor.setFlag(FLAG, "horny", h); }
    }

    // Numeric field writes — sexual flag
    if (sexualDirty) { await actor.setFlag(FLAG, "sexual", sexual); }
    if (coomerDirty) { await actor.setFlag(FLAG, "coomer", coomer); await AFLP.recalculateCum(actor); }
    // Genitalia, kinks, and titles are written by the save-btn handler directly
    // to avoid race conditions with reset operations.
  }
};