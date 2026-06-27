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
  // PF2e-only: the trait recompute this patches exists only in the PF2e weapon class.
  if (game.system?.id !== "pf2e") return;
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

  const _origPrepareBASEData = WeaponClass.prototype.prepareBASEData;
  // Guard: if PF2e renames or removes this internal method in a future system
  // version, skip patching rather than throwing on every weapon data prep.
  if (typeof _origPrepareBASEData !== "function") {
    console.warn("AFLP | WeaponClass.prepareBASEData not found; skipping Alcumical trait injection patch.");
    return;
  }
  WeaponClass.prototype.prepareBASEData = function () {
    _origPrepareBASEData.call(this);

    const slug = this.system?.slug ?? this._source?.system?.slug ?? "";
    if (!ALCUMICAL_WEAPON_SLUGS.has(slug)) return;

    const traits = this.system?.traits?.value;
    if (!Array.isArray(traits)) return;

    const toAdd = ["alcumical", "sexual"];
    if (APHRODISIAC_WEAPON_SLUGS.has(slug)) toAdd.push("aphrodisiac");

    for (const t of toAdd) {
      if (!traits.includes(t)) traits.push(t);
    }
  };

  console.log("AFLP | Weapon trait injection registered for Alcumical items.");
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
  await import("./ui/aflp-sentient-items.js" + _v);
  await import("./ui/aflp-alcumist.js" + _v);
  await import("./ui/aflp-splatter.js" + _v);
  await import("./ui/aflp-voice.js" + _v);
  await import("./ui/aflp-toolbar.js" + _v);

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

  // ── Register AFLP homebrew traits ───────────────────────────────────────
  // Ensures Sexual, Bondage, and Aphrodisiac traits are present in all
  // relevant PF2e trait categories. Safe to call on every load — only adds
  // entries that are not already present.
  if (game.user.isGM) {
    const AFLP_TRAITS = [
      { id: "sexual",      value: "Sexual" },
      { id: "bondage",     value: "Bondage" },
      { id: "aphrodisiac", value: "Aphrodisiac" },
      { id: "alcumical",   value: "Alcumical" },
    ];
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
      try { current = game.settings.get("pf2e", category) ?? []; }
      catch { continue; }
      const existing = new Set(current.map(t => t.id));
      const toAdd = AFLP_TRAITS.filter(t => !existing.has(t.id));
      if (toAdd.length) {
        await game.settings.set("pf2e", category, [...current, ...toAdd]);
      }
    }
  }

  console.log("AFLP | Ready");
});
