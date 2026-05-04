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

  // Register settings first (needs to happen in init)
  AFLP.Settings.register();
});

// ── Weapon trait injection ───────────────────────────────────────────────
// PF2e 7.x recomputes system.traits.value for weapon items from the base
// item definition in prepareBASEData(), which overwrites any stored custom
// traits. We patch the prototype AFTER PF2e's init (in setup) to re-inject
// AFLP custom traits after PF2e's computation completes.
Hooks.once("setup", () => {
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



Hooks.once("ready", async () => {
  if (!window.AFLP) return;

  await import("./ui/sexual-stats-dialog.js");
  await import("./ui/cumflation.js");
  await import("./ui/sheet-tab.js");
  await import("./ui/aflp-hscene.js");
  await import("./ui/aflp-arousal.js");
  await import("./ui/aflp-titles.js");
  await import("./ui/aflp-messages.js");
  await import("./ui/aflp-kinks.js");
  await import("./ui/aflp-bitchsuit.js");
  await import("./ui/aflp-sentient-items.js");
  await import("./ui/aflp-alcumist.js");

  // Register actor sheet tab
  AFLP.UI.SheetTab.register();

  // Register kink automation hooks
  AFLP.Kinks.register();

  // Register bitchsuit automation hooks
  if (window.AFLP_Bitchsuit) AFLP_Bitchsuit.register();

  // Register sentient item (Armor of Hands) hooks
  if (window.AFLP_SentientItems) AFLP_SentientItems.register();

  // Register H Scene system (socket + combat hooks)
  if (AFLP.Settings.hsceneEnabled) {
    AFLP.HScene.register();
  }

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