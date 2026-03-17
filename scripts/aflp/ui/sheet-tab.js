// ===============================
// AFLP Sheet Tab (sheet-tab.js)
// ===============================
// Injects an AFLP tab into all PF2e actor sheets.
// Visible to: GM + actor owner.
// Edit mode toggled via button — replaces display spans with inputs.

if (!window.AFLP.UI) window.AFLP.UI = {};

// Per-actor tracking of whether AFLP tab was active, keyed by actor.uuid
const _aflpTabWasActive = new Map();

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

    // Catch-all for AppV2: fires for every Application render.
    // Guard against double-injection is handled inside _inject via .aflp-tab-btn check.
    Hooks.on("renderApplication", (app, html, data) => {
      if (!app.actor) return;
      _handler(app, html, data);
    });

    // Legacy fallback for any non-AppV2 sheets
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

    const panelHtml = await AFLP.UI.SheetTab._buildPanel(actor, false);
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
    const panel = await AFLP.UI.SheetTab._buildPanel(actor, editMode);
    const tab = html.querySelector(".aflp-tab");
    if (tab) tab.innerHTML = panel;
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
  async _buildPanel(actor, editMode = false) {
    const FLAG = AFLP.FLAG_SCOPE;

    const sexual       = structuredClone(actor.getFlag(FLAG, "sexual")     ?? AFLP.sexualDefaults);
    const cum          = actor.getFlag(FLAG, "cum")                         ?? AFLP.cumDefaults;
    const coomer       = actor.getFlag(FLAG, "coomer")                      ?? AFLP.coomerDefaults;
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
        ? `<td class="aflp-num">—</td>`
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

    return `
    <div class="aflp-panel${editMode ? " aflp-edit-mode" : ""}">

      ${AFLP.UI.SheetTab._css()}

      <!-- Header row: Cum / Coomer / Edit button -->
      <div class="aflp-header">
        <div class="aflp-cum-pill">
          <span class="aflp-label">Cum</span>
          ${inlineEdit(cum.current, "cum.current")}
          <span class="aflp-cum-sep">/</span>
          <span>${cum.max}</span>
        </div>
        <div class="aflp-coomer">
          <span class="aflp-label">Coomer Lv</span>
          ${inlineEdit(coomer.level, "coomer.level")}
        </div>
        <div class="aflp-header-btns">
          ${editMode
            ? `<button type="button" class="aflp-btn aflp-save-btn">💾 Save</button>
               <button type="button" class="aflp-btn aflp-cancel-btn" style="margin-left:4px">✕ Cancel</button>`
            : `<button type="button" class="aflp-btn aflp-edit-btn">✏ Edit</button>`
          }
        </div>
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
            : `<span class="aflp-denied-btns" style="display:flex;align-items:center;gap:3px;margin-left:6px;">
                <button class="aflp-denied-dec aflp-btn-tiny" title="Remove Denied" ${deniedValue <= 0 ? "disabled" : ""}>-</button>
                <button class="aflp-denied-inc aflp-btn-tiny" title="Add Denied" ${deniedValue >= 6 ? "disabled" : ""}>+</button>
              </span>`
          }
        </div>
        <!-- Horny bar -->
        ${(() => {
          const hp = horny.permanent ?? 0;
          const ht = horny.temp ?? 0;
          const total = hp + ht;
          // In edit mode, pips are visual-only; permanent is staged via hidden input.
          // staged-perm class: lighter pink + red border, opacity 0.75 — visually distinct from committed perm.
          const pips = Array.from({length: 6}, (_, i) => {
            const isPerm = i < hp;
            const isTemp = !isPerm && i < total;
            let cls = "";
            if (isPerm)     cls = " filled perm";
            else if (isTemp) cls = " filled";
            const tipText = isPerm
              ? (editMode ? "Permanent Horny — click to remove" : "Permanent Horny (set by kinks/edit)")
              : isTemp
                ? (editMode ? "Temp Horny — click to make permanent" : "Temp Horny — click to remove")
                : (editMode ? "Empty — click to add as permanent" : "Empty — click to add Horny");
            return `<span class="aflp-pip aflp-horny-pip${cls}"
                         data-pip-index="${i}" data-pip-type="horny"
                         title="${tipText}"></span>`;
          }).join("");
          const valText = total > 0
            ? `${total}/6${hp > 0 ? ` <span class="aflp-horny-perm-label">(${hp} perm)</span>` : ""}`
            : "0/6";
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
          ${await AFLP.UI.SheetTab._renderCumflationRows(cumflation, totalTier)}
        </div>
      </div>` : ""}

      <!-- Pregnancy -->
      ${hasPussy ? `
      <div class="aflp-section">
        <h3 class="aflp-section-header">Pregnancy</h3>
        ${AFLP.UI.SheetTab._renderPregnancy(pregnancy, editMode)}
        <button type="button" class="aflp-btn aflp-process-preg-btn" style="margin-top:6px">
          Advance Gestation Day
        </button>
      </div>` : ""}

      <!-- Partner History -->
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


      <!-- Titles -->
      ${AFLP.Settings.titlesShow ? `
      <div class="aflp-section">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px;">
          <h3 class="aflp-section-header" style="margin:0;border-bottom:none;">Titles</h3>
        </div>
        <div style="border-bottom:1px solid var(--color-border-dark-tertiary,#c9a96e);margin-bottom:6px;"></div>
        ${editMode
          ? AFLP.UI.SheetTab._renderTitlesEdit(titlesHeld)
          : AFLP.UI.SheetTab._renderTitlesView(titlesHeld)
        }
      </div>` : ""}

    </div>`;
  },

  // -----------------------------------------------
  // CSS — scoped to .aflp-panel, no tab-level styles
  // (tab scroll is set inline on the div in _inject)
  // -----------------------------------------------
  _css() {
    return `<style>
      .aflp-panel {
        padding: 8px 10px 24px;
        font-family: var(--font-primary, serif);
        color: var(--color-text-dark-primary, #191813);
        font-size: 13px;
      }

      /* Header */
      .aflp-header {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 12px;
        padding: 6px 10px;
        background: rgba(0,0,0,0.06);
        border: 1px solid var(--color-border-dark-tertiary, #ccc);
        border-radius: 4px;
        flex-wrap: wrap;
      }
      .aflp-header-btns { margin-left: auto; }
      .aflp-label {
        font-weight: bold;
        color: var(--color-text-dark-secondary, #444);
        margin-right: 4px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .aflp-cum-pill { display: flex; align-items: center; gap: 3px; }
      .aflp-cum-sep  { color: #888; }
      .aflp-coomer       { display: flex; align-items: center; }

      /* Pip bars — Arousal + Horny */
      .aflp-bars-section {
        display: flex; flex-direction: column; gap: 5px;
        padding: 7px 10px;
        margin-bottom: 10px;
        background: rgba(0,0,0,0.04);
        border: 1px solid var(--color-border-dark-tertiary, #ccc);
        border-radius: 4px;
      }
      .aflp-bar-row {
        display: flex; align-items: center; gap: 7px;
      }
      .aflp-bar-label {
        width: 50px; flex-shrink: 0;
        font-size: 10px; font-weight: bold;
        text-transform: uppercase; letter-spacing: 0.06em;
        color: var(--color-text-dark-secondary, #555);
      }
      .aflp-pip-bar { display: flex; gap: 3px; flex: 1; }
      .aflp-pip {
        height: 12px; border-radius: 2px; flex: 1;
        border: 1px solid rgba(0,0,0,0.18);
        background: rgba(0,0,0,0.07);
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
        min-width: 10px; max-width: 28px;
      }
      /* Arousal pips — red gradient, matching H scene */
      .aflp-panel .aflp-arousal-pip { background: rgba(0,0,0,0.07) !important; border-color: rgba(0,0,0,0.18) !important; }
      .aflp-panel .aflp-arousal-pip.filled {
        background: linear-gradient(135deg, #e05050, #c02020) !important;
        border-color: #e05050 !important;
      }
      /* Denied extension pips — yellow outline, fill when arousal spills into denied range */
      .aflp-panel .aflp-arousal-pip.denied-ext {
        background: rgba(0,0,0,0.04) !important;
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
      /* Horny pips — pink temp, pink+thick-red-border permanent, lighter staged-perm */
      .aflp-panel .aflp-horny-pip { background: rgba(0,0,0,0.07) !important; border-color: rgba(0,0,0,0.18) !important; }
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
        font-size: 10px; color: #777; white-space: nowrap; min-width: 32px;
      }
      .aflp-horny-perm-label { color: #c05090; font-size: 9px; }
      .aflp-denied-label     { color: #907000; font-size: 9px; font-weight: bold; letter-spacing: 0.03em; }
      .aflp-btn-tiny {
        font-size: 11px; font-weight: bold; line-height: 1;
        width: 18px; height: 18px; padding: 0;
        background: rgba(0,0,0,0.06); border: 1px solid rgba(0,0,0,0.22); border-radius: 3px;
        cursor: pointer; color: #444;
      }
      .aflp-btn-tiny:hover:not(:disabled) { background: rgba(0,0,0,0.14); }
      .aflp-btn-tiny:disabled { opacity: 0.35; cursor: default; }
      .aflp-bar-maxedit {
        display: flex; align-items: center;
        font-size: 10px; color: #888; white-space: nowrap;
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
      .aflp-check-list li.aflp-subtype { padding-left: 14px; color: var(--color-text-dark-secondary, #555); }
      .aflp-check-list label {
        display: flex; align-items: center;
        justify-content: space-between;
        gap: 8px; cursor: pointer; width: 100%;
      }
      .aflp-check-list label input[type="checkbox"] { flex-shrink: 0; margin-left: auto; }
      .aflp-cock-subtypes { margin-top: 2px; }
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
        color: var(--color-text-dark-secondary, #5a4a2a);
        border-bottom: 1px solid var(--color-border-dark-tertiary, #c9a96e);
        margin: 0 0 6px 0;
        padding-bottom: 2px;
      }

      /* Tables */
      .aflp-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .aflp-table th {
        background: rgba(0,0,0,0.07);
        padding: 3px 5px;
        text-align: center;
        font-size: 11px;
        font-weight: bold;
        border: 1px solid var(--color-border-dark-tertiary, #ccc);
      }
      .aflp-table td {
        padding: 3px 5px;
        border: 1px solid var(--color-border-dark-tertiary, #ccc);
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
        background: rgba(255,255,255,0.8);
        border: 1px solid #c9a96e;
        border-radius: 2px;
        padding: 1px 3px;
        font-size: 12px;
        font-family: var(--font-primary, serif);
        color: var(--color-text-dark-primary, #191813);
      }
      .aflp-input:focus { outline: 2px solid #c9a96e; }

      /* Genitalia & Kinks */
      .aflp-genitalia ul, .aflp-kinks ul { list-style: none; margin: 0; padding: 0; }
      .aflp-genitalia li, .aflp-kinks li { padding: 2px 0; font-size: 12px; }
      .aflp-genitalia li.aflp-subtype {
        padding-left: 14px;
        color: var(--color-text-dark-secondary, #555);
      }
      .aflp-none { color: #999; font-style: italic; font-size: 12px; }

      /* Cumflation bars */
      .aflp-cumflation-grid { display: flex; flex-direction: column; gap: 5px; }
      .aflp-cum-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
      .aflp-cum-row-label {
        width: 54px; text-align: right; font-weight: 500;
        text-transform: capitalize;
        color: var(--color-text-dark-secondary, #444);
        flex-shrink: 0;
      }
      .aflp-pip-bar  { display: flex; gap: 2px; flex-shrink: 0; }
      .aflp-pip {
        width: 18px; height: 12px; border-radius: 2px;
        border: 1px solid rgba(0,0,0,0.3);
        background: rgba(0,0,0,0.15);
        transition: background 0.2s;
      }
      .aflp-pip.filled {
        background: #f2f2f2;
        border-color: rgba(220,220,220,0.7);
        box-shadow: inset 0 1px 3px rgba(255,255,255,0.7);
      }
      .aflp-cum-row-tier { font-size: 11px; color: #888; min-width: 36px; }
      .aflp-cum-row-link { font-size: 12px; }
      .aflp-cum-row-overall .aflp-cum-row-label { font-weight: bold; }
      .aflp-cum-row-overall {
        margin-top: 4px; padding-top: 4px;
        border-top: 1px solid rgba(0,0,0,0.1);
      }

      /* Pregnancy table */
      .aflp-preg-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 4px; }
      .aflp-preg-table th {
        background: rgba(0,0,0,0.07); padding: 3px 5px;
        border: 1px solid var(--color-border-dark-tertiary, #ccc); font-size: 11px;
      }
      .aflp-preg-table td {
        padding: 3px 5px;
        border: 1px solid var(--color-border-dark-tertiary, #ccc);
        text-align: center;
      }

      /* Partner history */
      .aflp-history-list { display: flex; flex-direction: column; gap: 4px; }
      .aflp-history-entry {
        background: rgba(0,0,0,0.04);
        border: 1px solid var(--color-border-dark-tertiary, #ddd);
        border-radius: 3px; padding: 4px 7px; font-size: 12px;
      }
      .aflp-history-entry summary {
        cursor: pointer; font-weight: 500; list-style: none;
        display: flex; justify-content: space-between; align-items: center;
      }
      .aflp-history-entry summary::marker,
      .aflp-history-entry summary::-webkit-details-marker { display: none; }
      .aflp-history-date  { color: #999; font-size: 11px; }
      .aflp-history-detail {
        padding-top: 4px;
        color: var(--color-text-dark-secondary, #555);
        display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px;
      }
      .aflp-history-chip {
        background: rgba(0,0,0,0.07); border-radius: 3px; padding: 1px 5px;
      }
      .aflp-history-preg { color: #a04030; font-style: italic; }
      .aflp-history-name { font-weight: 600; }
      .aflp-history-meta { display: flex; align-items: center; gap: 6px; margin-left: auto; }
      .aflp-history-holes {
        background: rgba(0,0,0,0.08); border-radius: 3px;
        padding: 1px 6px; font-size: 11px; font-weight: normal;
        color: var(--color-text-dark-secondary, #555);
      }
      .aflp-chip-cum { color: #5a7a3a; }

      /* Buttons */
      .aflp-btn {
        background: rgba(0,0,0,0.08);
        border: 1px solid var(--color-border-dark-tertiary, #c9a96e);
        border-radius: 3px; padding: 3px 10px; font-size: 12px;
        cursor: pointer;
        font-family: var(--font-primary, serif);
        color: var(--color-text-dark-primary, #191813);
        position: relative;
        z-index: 1;
      }
      .aflp-btn:hover { background: rgba(0,0,0,0.14); }
      .aflp-save-btn   { background: #5a8a3a; color: #fff; border-color: #3a5a20; }
      .aflp-save-btn:hover { background: #4a7a2a; }
      .aflp-cancel-btn { background: rgba(160,60,40,0.1); border-color: #a03c28; }
      .aflp-cancel-btn:hover { background: rgba(160,60,40,0.2); }

      /* Titles */
      .aflp-title-list { display: flex; flex-direction: column; gap: 4px; }
      .aflp-title-chip {
        background: linear-gradient(135deg, rgba(201,169,110,0.1), rgba(201,169,110,0.04));
        border: 1px solid var(--color-border-dark-tertiary, #c9a96e);
        border-radius: 4px; padding: 4px 8px;
        font-size: 12px; display: flex; flex-direction: column; gap: 1px;
      }
      .aflp-title-desc { font-size: 11px; color: var(--color-text-dark-secondary, #666); font-style: italic; }
    </style>`;
  },

  // -----------------------------------------------
  // Render genitalia
  // -----------------------------------------------
  async _renderGenitalia(hasPussy, hasCock, genitalTypes) {
    if (!hasPussy && !hasCock) return `<div class="aflp-none">None</div>`;
    const items = [];
    if (hasPussy) {
      const e = AFLP.genitalTypes["pussy"];
      items.push(`<li>${await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${e.uuid}]{${e.name}}`)}</li>`);
    }
    if (hasCock) {
      const e = AFLP.genitalTypes["cock"];
      items.push(`<li>${await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${e.uuid}]{${e.name}}`)}</li>`);
      const subtypes = await Promise.all(
        Object.entries(AFLP.genitalTypes)
          .filter(([slug, d]) => d.parent === "cock" && genitalTypes[slug])
          .sort((a, b) => a[1].name.localeCompare(b[1].name))
          .map(async ([, d]) =>
            `<li class="aflp-subtype">${await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${d.uuid}]{${d.name}}`)}</li>`
          )
      );
      items.push(...subtypes.filter(Boolean));
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
      const link = await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${data.uuid}]{${data.name}}`);
      const note = slug === "creature-fetish" && kinkNotes?.[slug]
        ? ` — <em>${kinkNotes[slug]}</em>` : "";
      return `<li>${link}${note}</li>`;
    }));
    return `<ul>${items.join("")}</ul>`;
  },

  // -----------------------------------------------
  // Render genitalia as checkboxes (edit mode)
  // -----------------------------------------------
  async _renderGenitaliaEdit(hasPussy, hasCock, genitalTypes) {
    const cockSubtypes = Object.entries(AFLP.genitalTypes)
      .filter(([, d]) => d.parent === "cock")
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([slug, d]) => `
        <li class="aflp-subtype">
          <label>
            <span>${d.name}</span>
            <input type="checkbox" class="aflp-genitalia-check" name="genitalType-${slug}" ${genitalTypes[slug] ? "checked" : ""}/>
          </label>
        </li>`)
      .join("");

    return `
      <ul class="aflp-check-list">
        <li>
          <label>
            <span><strong>Pussy</strong></span>
            <input type="checkbox" class="aflp-genitalia-check" name="genitalia-pussy" ${hasPussy ? "checked" : ""}/>
          </label>
        </li>
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
  async _renderCumflationRows(cumflation, totalTier) {
    const rows = await Promise.all(["oral", "vaginal", "anal", "facial"].map(async hole => {
      const tier    = cumflation[hole] ?? 0;
      const maxPips = hole === "facial" ? Math.max(tier, 8) : 8;
      const pips    = Array.from({ length: maxPips }, (_, i) =>
        `<span class="aflp-pip${i < tier ? " filled" : ""}"></span>`
      ).join("");

      let link = "";
      if (tier > 0) {
        const key  = `cumflation${hole.charAt(0).toUpperCase() + hole.slice(1)}`;
        const uuid = AFLP.items[key]?.[tier - 1];
        link = uuid
          ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${uuid}]{Tier ${tier}}`)
          : `Tier ${tier}`;
      }

      return `
        <div class="aflp-cum-row">
          <span class="aflp-cum-row-label">${hole}</span>
          <div class="aflp-pip-bar">${pips}</div>
          <span class="aflp-cum-row-tier"></span>
          <span class="aflp-cum-row-link">${tier > 0 ? link : "<span style='color:#999;font-style:italic;font-size:11px'>Clear</span>"}</span>
        </div>`;
    }));

    const overallPips = Array.from({ length: 8 }, (_, i) =>
      `<span class="aflp-pip${i < totalTier ? " filled" : ""}"></span>`
    ).join("");
    let overallLink = "";
    if (totalTier > 0) {
      const uuid = AFLP.items.cumflationTotal?.[totalTier - 1];
      overallLink = uuid
        ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${uuid}]{Tier ${totalTier}}`)
        : `Tier ${totalTier}`;
    }
    rows.push(`
      <div class="aflp-cum-row aflp-cum-row-overall">
        <span class="aflp-cum-row-label">Overall</span>
        <div class="aflp-pip-bar">${overallPips}</div>
        <span class="aflp-cum-row-tier"></span>
        <span class="aflp-cum-row-link">${totalTier > 0 ? overallLink : "<span style='color:#999;font-style:italic;font-size:11px'>Clear</span>"}</span>
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
        gestationCell = `<td>${p.gestationRemaining}/${p.gestationTotal}</td>`;
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
      const holes   = (entry.holes ?? []).map(h => h.charAt(0).toUpperCase() + h.slice(1)).join(", ") || "—";
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
        ? `<span class="aflp-history-chip aflp-history-preg">🥚 Impregnated — ${entry.pregnancyResult.offspring} ${entry.pregnancyResult.deliveryType === "egg" ? "eggs" : "offspring"}</span>`
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
  // Render titles — view mode
  // -----------------------------------------------
  _renderTitlesView(titlesHeld) {
    if (!titlesHeld.size) return `<div class="aflp-none">No titles earned yet.</div>`;
    const items = AFLP_Titles.TITLES
      .filter(t => titlesHeld.has(t.id))
      .map(t => `
        <div class="aflp-title-chip" title="🏆 ${t.name}">
          🏆 <strong>${t.name}</strong>
          <span class="aflp-title-desc">${t.desc}</span>
        </div>`).join("");
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
      if (btn.classList.contains("aflp-arousal-inc")) {
        await AFLP_Arousal.increment(actor, 1, "Sheet +");
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }
      if (btn.classList.contains("aflp-arousal-dec")) {
        await AFLP_Arousal.decrement(actor, 1, "Sheet −");
        await AFLP.UI.SheetTab._refreshPanel(html, actor, isEditMode);
        return;
      }
      if (btn.classList.contains("aflp-edit-btn")) {
        await AFLP.UI.SheetTab._refreshPanel(html, actor, true);
        return;
      }
      if (btn.classList.contains("aflp-cancel-btn")) {
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
          const ok = await Dialog.confirm({
            title: "Reset Selected Sections",
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
          "input.aflp-input:not([name^='kink-']):not([name^='genitalia-']):not([name^='genitalType-']):not([name^='kinknote-'])"
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
          const newPerm = Math.max(0, Math.min(6, parseInt(dirty["horny.permanent"], 10) || 0));
          // If permanent increased, keep temp; if decreased, reduce temp so total doesn't exceed 6
          const newTotal = newPerm + (horny.temp ?? 0);
          if (newTotal > 6) horny.temp = Math.max(0, 6 - newPerm);
          horny.permanent = newPerm;
          await actor.setFlag(FLAG, "horny", horny);
        }

        // Pregnancy edits — preg.PREGID.{sourceName,deliveryType,offspring,gestationRemaining,gestationTotal}
        const pregDirty = Object.entries(dirty).filter(([k]) => k.startsWith("preg."));
        if (pregDirty.length && !resetSections.pregnancy) {
          const pregnancies = structuredClone(actor.getFlag(FLAG, "pregnancy") ?? {});
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
                if (isNaN(val) || val < 0) continue;
                pregnancies[pregId][prop] = val;
                break;
              }
              case "sourceName":
                pregnancies[pregId].sourceName = raw?.trim() || "Unknown";
                break;
              case "deliveryType":
                pregnancies[pregId].deliveryType = raw === "egg" ? "egg" : "live";
                break;
              default:
                continue;
            }
          }
          await actor.setFlag(FLAG, "pregnancy", pregnancies);
        }

        // Pregnancy removals (from edit mode remove buttons)
        if (!resetSections.pregnancy && panelRoot._aflpPregRemovals?.length) {
          const pregnancies = structuredClone(actor.getFlag(FLAG, "pregnancy") ?? {});
          for (const pregId of panelRoot._aflpPregRemovals) {
            delete pregnancies[pregId];
          }
          await actor.setFlag(FLAG, "pregnancy", pregnancies);
          panelRoot._aflpPregRemovals = [];
        }

        // Pregnancy additions (from edit mode add button)
        if (!resetSections.pregnancy && panelRoot._aflpPregAdditions?.length) {
          const pregnancies = structuredClone(actor.getFlag(FLAG, "pregnancy") ?? {});
          for (let i = 0; i < panelRoot._aflpPregAdditions.length; i++) {
            const base = panelRoot._aflpPregAdditions[i];
            if (!base) continue; // null = removed before save

            // Read edited values from the DOM inputs (user may have changed defaults)
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
            const id = foundry.utils.randomID();
            pregnancies[id] = newPreg;
          }
          await actor.setFlag(FLAG, "pregnancy", pregnancies);
          panelRoot._aflpPregAdditions = [];
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

        await AFLP.UI.SheetTab._refreshPanel(html, actor, false);
        return;
      }
      if (btn.classList.contains("aflp-deliver-btn")) {
        const pregId = btn.dataset.pregId;
        if (!pregId) return;
        const ok = await Dialog.confirm({
          title: "Deliver",
          content: `Manually deliver this pregnancy for <strong>${actor.name}</strong>?`
        });
        if (!ok) return;
        await AFLP_Pregnancy.recordBirth(actor, pregId);
        await AFLP.UI.SheetTab._refreshPanel(html, actor, false);
        return;
      }
      if (btn.classList.contains("aflp-preg-remove-btn")) {
        ev.preventDefault(); ev.stopPropagation();
        const pregId = btn.dataset.pregId;
        if (!pregId) return;
        // Stage removal for save (don't write immediately - edit mode batches changes)
        if (!panelRoot._aflpPregRemovals) panelRoot._aflpPregRemovals = [];
        panelRoot._aflpPregRemovals.push(pregId);
        // Visually remove the row
        const row = btn.closest("tr[data-preg-id]");
        if (row) row.remove();
        return;
      }
      if (btn.classList.contains("aflp-preg-add-btn")) {
        ev.preventDefault(); ev.stopPropagation();
        // Stage a new pregnancy for save
        if (!panelRoot._aflpPregAdditions) panelRoot._aflpPregAdditions = [];
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
        panelRoot._aflpPregAdditions.push(newPreg);

        // Insert a new editable row into the table
        const table = panelRoot.querySelector(".aflp-preg-table tbody");
        if (table) {
          const tr = document.createElement("tr");
          tr.dataset.pregId = tempId;
          tr.innerHTML = `
            <td style="text-align:left">
              <input class="aflp-input" type="text"
                name="preg-new.${panelRoot._aflpPregAdditions.length - 1}.sourceName"
                value="" style="width:100%;min-width:70px;" placeholder="Source name"/>
            </td>
            <td>
              <select class="aflp-input" name="preg-new.${panelRoot._aflpPregAdditions.length - 1}.deliveryType"
                style="font-size:11px;padding:1px 4px;">
                <option value="live" selected>Live</option>
                <option value="egg">Egg</option>
              </select>
            </td>
            <td>
              <input class="aflp-input" type="number" min="1"
                name="preg-new.${panelRoot._aflpPregAdditions.length - 1}.offspring"
                value="1" style="width:38px;text-align:center;"/>
            </td>
            <td style="text-align:center">
              <input class="aflp-input" type="number" min="0"
                name="preg-new.${panelRoot._aflpPregAdditions.length - 1}.gestationRemaining"
                value="30" style="width:38px;text-align:center;" title="Days remaining"/>
              <span style="color:#aaa;font-size:10px;margin:0 2px">/</span>
              <input class="aflp-input" type="number" min="1"
                name="preg-new.${panelRoot._aflpPregAdditions.length - 1}.gestationTotal"
                value="30" style="width:38px;text-align:center;" title="Total gestation days"/>
            </td>
            <td>
              <button type="button" class="aflp-btn aflp-preg-remove-new-btn"
                data-new-idx="${panelRoot._aflpPregAdditions.length - 1}"
                style="font-size:10px;padding:1px 5px;color:#c05040;border-color:rgba(200,60,40,0.4);"
                title="Remove">&#10005;</button>
            </td>`;
          table.appendChild(tr);

          // Bind remove for the newly added row
          tr.querySelector(".aflp-preg-remove-new-btn")?.addEventListener("click", (e2) => {
            e2.preventDefault(); e2.stopPropagation();
            const idx = parseInt(e2.currentTarget.dataset.newIdx);
            if (!isNaN(idx)) panelRoot._aflpPregAdditions[idx] = null; // null out, filtered on save
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
        const ok = await Dialog.confirm({
          title: "Clear Partner History",
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
            horny.temp = Math.max(0, Math.min(targetTotal - hp, 6 - hp));
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
                p.title = "Staged permanent — click Save to commit";
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
      else if (field === "cum.current")        { const cum = structuredClone(actor.getFlag(FLAG, "cum") ?? AFLP.cumDefaults); cum.current = val; await actor.setFlag(FLAG, "cum", cum); }
      else if (field.startsWith("given."))     { if (!sexual.lifetime.given) sexual.lifetime.given = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 }; sexual.lifetime.given[field.replace("given.", "")] = val; sexualDirty = true; }
      else if (field.startsWith("lifetime."))  { sexual.lifetime[field.replace("lifetime.", "")] = val; sexualDirty = true; }
      else if (field.startsWith("mlGiven."))   { sexual.lifetime.mlGiven[field.replace("mlGiven.", "")] = val; sexualDirty = true; }
      else if (field.startsWith("mlReceived.")){ sexual.lifetime.mlReceived[field.replace("mlReceived.", "")] = val; sexualDirty = true; }
      else if (field === "arousal.current")    { const ar = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults); ar.current = val; await actor.setFlag(FLAG, "arousal", ar); }
      else if (field === "arousal.maxBase")    { const ar = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults); ar.maxBase = val; ar.max = val; await actor.setFlag(FLAG, "arousal", ar); }
      else if (field === "horny.permanent")    { const h = structuredClone(actor.getFlag(FLAG, "horny") ?? AFLP.hornyDefaults); const np = Math.max(0, Math.min(6, val)); if ((np + (h.temp ?? 0)) > 6) h.temp = Math.max(0, 6 - np); h.permanent = np; await actor.setFlag(FLAG, "horny", h); }
    }

    // Numeric field writes — sexual flag
    if (sexualDirty) { await actor.setFlag(FLAG, "sexual", sexual); }
    if (coomerDirty) { await actor.setFlag(FLAG, "coomer", coomer); await AFLP.recalculateCum(actor); }
    // Genitalia, kinks, and titles are written by the save-btn handler directly
    // to avoid race conditions with reset operations.
  }
};