// ===============================
// AFLP Core Bootstrap (index.js)
// ===============================
Hooks.once("init", async () => {
  if (window.AFLP) return;
  console.log("AFLP | Initializing core");

  window.AFLP = {
    FLAG_SCOPE: "world",
    UI: {},
  };

  await import("./schema.js");
  await import("./module-settings.js");

  // Resolve the per-system adapter (AFLP.system) before any UI loads or scene
  // renders. game.system is available at init. PF2e is the only implemented
  // system today; others fall back to a safe inert base adapter.
  await import("./system/index.js");
  await AFLP.resolveSystem();

  // Register settings first (needs to happen in init)
  AFLP.Settings.register();
});

// ── Weapon trait injection ───────────────────────────────────────────────
// PF2e 7.x recomputes system.traits.value for weapon items from the base
// item definition in prepareBASEData(), which overwrites any stored custom
// traits. We patch the prototype AFTER PF2e's init (in setup) to re-inject
// AFLP custom traits after PF2e's computation completes.
Hooks.once("setup", () => {
  // PF2e-family only: the trait recompute this patches exists only in the
  // PF2e weapon class (which the sf2e fork shares).
  if (!["pf2e", "sf2e"].includes(game.system?.id)) return;
  const WeaponClass = CONFIG.PF2E?.Item?.documentClasses?.weapon;
  if (!WeaponClass) return;

  // Slugs of all AFLP Alcumical folder weapons that need custom traits
  const ALCUMICAL_WEAPON_SLUGS = new Set([
    "aphrodisiac-bomb-lesser",
    "aphrodisiac-bomb-moderate",
    "aphrodisiac-bomb-major",
    "aphrodisiac-bomb-greater",
    "aphrodisiac-charge",
    "aphrodisiac-charge-moderate",
    "aphrodisiac-charge-greater",
    "sticky-bomb-lesser",
    "sticky-bomb-moderate",
    "sticky-bomb-major",
    "sticky-bomb-greater",
    "suppression-bomb",
  ]);
  const APHRODISIAC_WEAPON_SLUGS = new Set([
    "aphrodisiac-bomb-lesser",
    "aphrodisiac-bomb-moderate",
    "aphrodisiac-bomb-major",
    "aphrodisiac-bomb-greater",
    "aphrodisiac-charge",
    "aphrodisiac-charge-moderate",
    "aphrodisiac-charge-greater",
  ]);

  // PF2e renamed prepareBASEData -> prepareBaseData in 8.x; patch whichever
  // exists. (The old exact-name guard silently disabled this whole patch on
  // 8.x, which also dropped the Alcumical bomb traits.)
  const _pbdName = ["prepareBASEData", "prepareBaseData"]
    .find(n => typeof WeaponClass.prototype[n] === "function");
  if (!_pbdName) {
    console.warn("AFLP | weapon prepareBaseData not found; skipping trait injection patch.");
    return;
  }
  const _origPrepareBASEData = WeaponClass.prototype[_pbdName];
  WeaponClass.prototype[_pbdName] = function () {
    _origPrepareBASEData.call(this);

    const traits = this.system?.traits?.value;
    if (!Array.isArray(traits)) return;
    const toAdd = [];

    const slug = this.system?.slug ?? this._source?.system?.slug ?? "";
    if (ALCUMICAL_WEAPON_SLUGS.has(slug)) {
      toAdd.push("alcumical", "sexual");
      if (APHRODISIAC_WEAPON_SLUGS.has(slug)) toAdd.push("aphrodisiac");
    }

    // AFLR etched runes: a weapon carrying etched AFLR runes gains each rune's
    // traits (e.g. Sadomasochistic -> sexual). The etch/un-etch flow lives in
    // the rune item sheet integration below; this is the mechanical half.
    const etched = this.flags?.["ardisfoxxs-lewd-pf2e"]?.etchedRunes;
    if (Array.isArray(etched)) {
      for (const r of etched) {
        for (const t of (window.AFLP?.RUNES?.[r]?.traits ?? [])) toAdd.push(t);
      }
    }

    for (const t of toAdd) {
      if (!traits.includes(t)) traits.push(t);
    }
  };

  // Armor: same recompute pattern for etched armor runes (e.g. Nude).
  const ArmorClass = CONFIG.PF2E?.Item?.documentClasses?.armor;
  const _armorPbdName = ["prepareBASEData", "prepareBaseData"]
    .find(n => typeof ArmorClass?.prototype?.[n] === "function");
  const _origArmorPBD = _armorPbdName ? ArmorClass.prototype[_armorPbdName] : null;
  if (typeof _origArmorPBD === "function") {
    ArmorClass.prototype[_armorPbdName] = function () {
      _origArmorPBD.call(this);
      const etched = this.flags?.["ardisfoxxs-lewd-pf2e"]?.etchedRunes;
      if (!Array.isArray(etched) || !etched.length) return;
      const traits = this.system?.traits?.value;
      if (!Array.isArray(traits)) return;
      for (const r of etched) {
        for (const t of (window.AFLP?.RUNES?.[r]?.traits ?? [])) {
          if (!traits.includes(t)) traits.push(t);
        }
      }
    };
  }

  console.log("AFLP | Weapon trait injection registered for Alcumical items and etched runes.");
});



// ──────────────────────────────────────────────────────────────────────────
// Sibling-module conflict guard
// AFLP (PF2e-only) and AFLR (multi-system) share one engine and must not both be
// active in the same world - running both double-registers settings, hooks, and
// UI. On ready, if both are active, prompt the GM to keep one and deactivate the
// other. The two ids are assembled from fragments so the AFLR build's id-rewrite
// pass cannot collapse them into a single id (this block reads identically, and
// correctly, in both modules).
Hooks.once("ready", async () => {
  const AFLP_ID = "ardisfoxxs-lewd-" + "pf2e";
  const AFLR_ID = "ardisfoxxs-lewd-" + "rpg";
  if (!(game.modules.get(AFLP_ID)?.active && game.modules.get(AFLR_ID)?.active)) return;
  if (window.__aflrSiblingConflictHandled) return;   // one dialog across both modules
  window.__aflrSiblingConflictHandled = true;

  if (!game.user?.isGM) {
    ui.notifications?.warn("AFLP and AFLR are both active, which causes conflicts. Ask your GM to disable one in Module Settings.");
    return;
  }

  const disableModule = async (id) => {
    const cfg = foundry.utils.deepClone(game.settings.get("core", "moduleConfiguration"));
    cfg[id] = false;
    await game.settings.set("core", "moduleConfiguration", cfg);
    if (foundry.utils.debouncedReload) foundry.utils.debouncedReload();
    else window.location.reload();
  };

  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: "AFLP / AFLR - Module Conflict", modal: true },
    content: `<p style="margin:0 0 .5em;">You're running <strong>AFLP</strong> and <strong>AFLR</strong> at the same time. This causes issues.</p>
              <p style="margin:0;">Which module would you like to use? The other will be deactivated in Module Settings.</p>`,
    buttons: [
      { action: "aflp", label: "Use AFLP (PF2e)", default: true },
      { action: "aflr", label: "Use AFLR (multi-system)" },
      { action: "later", label: "Decide later" },
    ],
    close: () => "later",
  }).catch(() => "later");

  if (choice === "aflp") await disableModule(AFLR_ID);
  else if (choice === "aflr") await disableModule(AFLP_ID);
  // "later": leave both active this session; the prompt returns on next reload.
});

Hooks.once("ready", async () => {
  if (!window.AFLP) return;

  // Build the per-system content index (aflrKey -> UUID) so AFLP.system.contentUuid
  // resolves logical keys to this system's pack, falling back to canonical PF2e.
  try { await AFLP.system?.buildContentIndex?.(); } catch (e) { console.warn("AFLP | content index build failed:", e); }

  // Recompute the cum pool live when AFLR loads / cum-shot gear is added or removed,
  // so worn items (Loads rings, Cum Shot piercings, The One Cock Ring) take effect at
  // once rather than waiting for the next rest. GM-only to avoid multi-client writes.
  {
    const MOD = "ardisfoxxs-lewd-pf2e";
    const affectsCum = (it) =>
      it?.getFlag?.(MOD, "loadsBonus") != null ||
      it?.getFlag?.(MOD, "loadsOverride") != null ||
      it?.getFlag?.(MOD, "cumShotBonus") != null ||
      !!it?.getFlag?.(MOD, "oneCockRing");
    const onGear = (it) => {
      if (!game.user.isGM || !it?.actor || !affectsCum(it)) return;
      AFLP.recalculateCum?.(it.actor.getWorldActor?.() ?? it.actor);
    };
    Hooks.on("createItem", onGear);
    Hooks.on("deleteItem", onGear);
  }

  // ── Potion of Breeding effect -> Fertility condition binding ─────────────
  // The PF2e effect items drive the cross-system "breeding" flag so the
  // pregnancy code, condition manager, and status panel all read one truth.
  // Under the staged model both potion effects mean Fertility 3 (no Brood
  // Roll, it just takes) - they differ in duration, not stage. Deleting an
  // effect recomputes from what remains; a manager-set value with no effect
  // items on the actor is left alone (these hooks only fire for the two
  // potion effects).
  if (game.user.isGM) {
    const _pobTemp = AFLP.items?.["potion-of-breeding-effect"]?.uuid ?? null;
    const _pobPerm = AFLP.items?.["potion-of-breeding-effect-permanent"]?.uuid ?? null;
    const _srcOf = (item) => String(item?.flags?.core?.sourceId ?? item?._stats?.compendiumSource ?? item?.sourceId ?? "");
    // ASK BY KEY FIRST, uuid SECOND. On Starfinder the effect is dragged out of
    // `aflr-sf2e-items`, so its compendiumSource is the TWIN's uuid and never
    // equals the registry's pf2e-pack spelling - measured 1 Sept 2026, where the
    // potion embedded, was kept, and left Fertility at 0 because this comparison
    // was the only thing identifying it. `itemHasKey` answered TRUE for the same
    // item. STALE IF: the potion effects lose their aflrKey/slug.
    // ONE test, used by the gate AND by the recount below. The first cut of this
    // fix keyed only the gate and left the two `.some()` scans comparing uuids,
    // so on Starfinder the gate opened and the recount then found nothing:
    // target computed to 0 and the sync "correctly" cleared a floor it had never
    // set. Measured 1 Sept 2026 - calling the hook by hand with the right item
    // still left Fertility 0 while `itemHasKey` answered true for that same item.
    // **A half-converted identity check is worse than an unconverted one**: it
    // passes the guard and fails the arithmetic, so the failure moves somewhere
    // that does not name the cause.
    const _isPob = (item, which) =>
      AFLP.itemHasKey?.(item, which === "perm" ? "potion-of-breeding-effect-permanent"
                                              : "potion-of-breeding-effect")
      || _srcOf(item) === (which === "perm" ? _pobPerm : _pobTemp);
    const _isPobEffect = (item) => _isPob(item, "temp") || _isPob(item, "perm");
    const _syncBreeding = async (item) => {
      const actor = item?.parent;
      if (!actor || actor.documentName !== "Actor" || !_isPobEffect(item)) return;
      const hasPerm = actor.items.some(i => _isPob(i, "perm"));
      const hasTemp = actor.items.some(i => _isPob(i, "temp"));
      const target = (hasPerm || hasTemp) ? 3 : 0;
      try {
        const current = AFLP.cond.value(actor, "breeding");
        if (target > 0 && current !== target) await AFLP.cond.apply(actor, "breeding", target);
        else if (target === 0 && (current > 0 || AFLP.cond.has(actor, "breeding"))) await AFLP.cond.remove(actor, "breeding");
      } catch (e) { console.warn("AFLP | breeding sync failed:", e?.message); }
    };
    Hooks.on("createItem", _syncBreeding);
    Hooks.on("deleteItem", _syncBreeding);
  }

  // Cache-bust dynamic imports by module version. Browsers cache import() URLs
  // and will not re-fetch an unchanged URL across reloads, so without this an
  // updated UI script keeps running the stale cached copy until the version
  // bumps. (During active development, also keep DevTools > Network > "Disable
  // cache" checked, since same-version edits won't change this query.)
  const _v = "?v=" + (game.modules.get("ardisfoxxs-lewd-pf2e")?.version ?? Date.now());

  await import("./ui/aflr-tokens.js" + _v);
  await import("./ui/sexual-stats-dialog.js" + _v);
  await import("./ui/cumflation.js" + _v);
  await import("./ui/sheet-tab.js" + _v);
  await import("./ui/aflp-sheet-app.js" + _v);
  await import("./ui/aflp-scene-dock.js" + _v);
  await import("./ui/aflp-hscene.js" + _v);
  await import("./ui/aflp-arousal.js" + _v);
  await import("./ui/aflp-carnal.js" + _v);
  await import("./ui/aflp-carnal-dock.js" + _v);
  await import("./ui/aflp-rest.js" + _v);
  await import("./ui/aflp-titles.js" + _v);
  await import("./ui/aflp-messages.js" + _v);
  await import("./ui/aflp-kinks.js" + _v);
  await import("./ui/aflp-bitchsuit.js" + _v);
  // Living gear: ONE engine, and a table file per system that never sees the
  // other's rows. Split 27 Aug 2026 - the single shared table was the direct
  // cause of a DH plug that sealed nothing, a DH cage that nearly got a PF2e
  // Denied floor its card never promised, and a header comment claiming DH had
  // no living bondage at all. Core FIRST: both table files extend it.
  await import("./ui/aflp-living-gear-core.js" + _v);
  await import("./ui/aflp-living-gear-pf2e.js" + _v);
  await import("./ui/aflp-living-gear-dh.js" + _v);
  await import("./ui/aflp-deepthroat.js" + _v);
  await import("./ui/aflp-sentient-items.js" + _v);
  await import("./ui/aflp-alcumist.js" + _v);
  await import("./ui/aflp-splatter.js" + _v);
  await import("./ui/aflp-voice.js" + _v);
  await import("./ui/aflp-toolbar.js" + _v);
  await import("./ui/aflp-status-panel.js" + _v);
  await import("./ui/aflp-exposure-art.js" + _v);
  if (["pf2e", "sf2e"].includes(game.system.id)) await import("./ui/aflp-runes.js" + _v);

  // Register the AFLP sheet opener (header button -> self-contained popout).
  // Replaces the old in-sheet tab so it works across PF2e, D&D 5e, and Daggerheart.
  AFLP.UI.SheetApp.register();

  // Pre-load position descriptions from compendium
  AFLP._loadPositionDescriptions?.().catch(() => {});

  // Merge any custom positions from world settings into the schema registries
  const { mergeCustomPositions } = await import("./ui/aflp-position-manager.js" + _v);
  mergeCustomPositions();

  // Register kink automation hooks
  AFLP.Kinks.register();

  // Register bitchsuit automation hooks
  if (window.AFLP_Bitchsuit) AFLP_Bitchsuit.register();
  // Each gates itself on its own system id, so exactly one of these binds hooks
  // in any given world. Calling both is intentional - the gate belongs next to
  // the rows it protects, not here.
  window.AFLP_LivingGear_PF?.register();
  window.AFLP_LivingGear_DH?.register();
  // BACK-COMPAT ALIAS, pointing at whichever file this world actually runs.
  // `aflp-feminizer-trap.js` and the simulation harness still say
  // `AFLP_LivingGear`. It resolves to ONE system's object - it is not a merged
  // view, and nothing may be added to it.
  // STALE WHEN: the last consumer is moved onto the explicit name; then delete it.
  window.AFLP_LivingGear = AFLP.system?.id === "daggerheart"
    ? window.AFLP_LivingGear_DH
    : window.AFLP_LivingGear_PF;
  // The while-worn Denied floor for chastity gear. SEPARATE from living gear's
  // register() above: it runs on every system, because the cards promise it on
  // every system, and it is gated per-card rather than per-system. 27 Aug 2026.
  AFLP.chastityGear?.registerDeniedFloor?.();
  if (window.AFLP_Deepthroat) AFLP_Deepthroat.register();

  // Register sentient item (Armor of Hands) hooks
  if (window.AFLP_SentientItems) AFLP_SentientItems.register();

  // Register cum splatter visuals
  if (window.AFLP_Splatter) AFLP_Splatter.register();

  // Register H Scene system (socket + combat hooks)
  if (AFLP.Settings.hsceneEnabled) {
    AFLP.HScene.register();
  }

  // Register the AFLR floating toolbar (or sidebar buttons, per setting).
  AFLP.UI.Toolbar.register();

  // Token HUD button for H Scene
  // In Foundry v13, TokenHUD is AppV2 — html is a plain HTMLElement, not jQuery.
  // We use querySelector with several fallback selectors to find the right column,
  // then fall back to appending directly to the HUD root if none match.
  Hooks.on("renderTokenHUD", (hud, html, data) => {
    const token = hud.object;
    if (!token) return;
    if (!token.actor?.isOwner && !game.user.isGM) return;

    // Guard: only add once per render
    if (html.querySelector(".aflp-hscene-hud-btn")) return;

    const btn = document.createElement("div");
    btn.className = "control-icon aflp-hscene-hud-btn";
    btn.title = "Start H Scene (AFLP)";
    btn.innerHTML = `<i style="font-style:normal;font-size:18px;line-height:1">❤</i>`;
    btn.style.cssText = "cursor:pointer;";

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targets = [...game.user.targets];
      if (!targets.length) {
        ui.notifications.warn("AFLP | Target a token first, then click the H Scene button.");
        return;
      }
      await AFLP.HScene.launchFromTokens(token, targets[0]);
    });

    // v13 Token HUD DOM selector.
    // The v12 layout used ".col.right"; v13 AppV2 changed the structure.
    // We try known selectors and fall back to appending to the root.
    // If the button doesn't appear, open the browser console and run:
    //   console.log(canvas.hud.token.element.innerHTML)
    // to inspect the actual v13 HUD structure, then update the selector below.
    const rightCol = html.querySelector(".col.right")            // v12
                  ?? html.querySelector(".right.controls")       // possible v13
                  ?? html.querySelector("[data-column='right']") // attribute variant
                  ?? null;

    if (rightCol) {
      rightCol.appendChild(btn);
    } else {
      // Fallback: append to HUD root and position via CSS so it's still visible
      btn.style.cssText += "position:absolute;right:4px;top:50%;transform:translateY(-50%);z-index:10;background:rgba(0,0,0,0.5);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;";
      html.appendChild(btn);
      console.log("AFLP | Token HUD: could not find right column, using fallback placement. HUD HTML:", html.innerHTML);
    }
  });

  // ── SF2e content-UUID remap ──────────────────────────────────────────────
  // In an sf2e world the pf2e-tagged packs (and the pf2e system packs) do not
  // exist; the module ships sf2e twins and AFLP.sysUuid redirects UUIDs to
  // them. Wrapping fromUuid/fromUuidSync at this one chokepoint covers the
  // schema UUID registries, every direct fromUuid call in module code and
  // macros, and @UUID links embedded in shipped item descriptions. sysUuid is
  // a strict passthrough for anything that is not a pf2e-family or module
  // content UUID, and only ever rewrites in sf2e worlds.
  if (game.system?.id === "sf2e") {
    const _wrapFrom = (name) => {
      const target = `${name}`;
      if (globalThis.libWrapper?.register) {
        libWrapper.register("ardisfoxxs-lewd-pf2e", target,
          function (wrapped, uuid, ...args) { return wrapped(AFLP.sysUuid?.(uuid) ?? uuid, ...args); },
          "WRAPPER");
      } else {
        const orig = globalThis[name];
        if (typeof orig === "function") {
          globalThis[name] = function (uuid, ...args) { return orig.call(this, AFLP.sysUuid?.(uuid) ?? uuid, ...args); };
        }
      }
    };
    try { _wrapFrom("fromUuid"); _wrapFrom("fromUuidSync"); }
    catch (e) { console.warn("AFLP | sf2e uuid remap wrapper failed:", e?.message); }
    console.log("AFLP | sf2e content-uuid remap active");
  }

  // ── Scrub AFLP traits from the pf2e homebrew world settings ─────────────
  // The module now provides Sexual/Bondage/Aphrodisiac/Alcumical by direct
  // CONFIG.PF2E injection at init (scripts/module.js), which makes those slugs
  // RESERVED TERMS to the pf2e Homebrew Elements manager. Any copy of them
  // left in the homebrew world settings - written by earlier module editions,
  // or added manually by users following old setup instructions - is filtered
  // out by pf2e at registration AND error-spammed as "X is a reserved term"
  // whenever the settings menu renders. This one-time scrub removes our four
  // ids from every homebrew trait category so the settings hold no dead
  // copies. Self-extinguishing: once clean, nothing is written again.
  if (game.user.isGM && ["pf2e", "sf2e"].includes(game.system?.id)) {
    const AFLP_TRAIT_IDS = new Set(["sexual", "bondage", "aphrodisiac", "alcumical"]);
    const TRAIT_CATEGORIES = [
      "homebrew.creatureTraits",
      "homebrew.featTraits",
      "homebrew.equipmentTraits",
      "homebrew.weaponTraits",
      "homebrew.spellTraits",
      "homebrew.classTraits",
      "homebrew.shieldTraits",
    ];
    for (const category of TRAIT_CATEGORIES) {
      let current;
      try { current = game.settings.get(game.system.id, category) ?? []; }
      catch { continue; } // category not registered on this pf2e version
      const cleaned = current.filter(t => !AFLP_TRAIT_IDS.has(t?.id));
      if (cleaned.length !== current.length) {
        try {
          await game.settings.set(game.system.id, category, cleaned);
          console.log(`AFLP | scrubbed module traits from pf2e ${category}`);
        } catch (e) {
          console.warn(`AFLP | could not scrub ${category}:`, e?.message);
        }
      }
    }
  }

  console.log("AFLP | Ready");
});
