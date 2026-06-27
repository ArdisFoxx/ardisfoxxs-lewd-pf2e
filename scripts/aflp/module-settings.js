// ===============================
// AFLP Module Settings
// ===============================
// Register all configurable settings for the AFLP module.
// Called from index.js in the "init" hook.
// Settings are ordered by the Lewd Level at which they become relevant.

// Soundpack download links. The curated LITE pack is the default we push (a small
// Git download); the full pack is the "want more sounds?" upsell. Update here only.
AFLP.SOUNDPACK_LITE_URL = "https://github.com/ArdisFoxx/aflr-soundpack-lite/releases/latest";
AFLP.SOUNDPACK_URL      = "https://mega.nz/file/1d5lxbZQ#_jH1AfpTqrP8rddGV94Wrr705RTnRzTtWBtSA6OF_i0";

AFLP.Settings = {

  ID: "ardisfoxxs-lewd-pf2e",

  KEYS: {
    AUTOMATION:          "arousalAutomation",
    STRESS_AS_AROUSAL:   "dhStressAsArousal",
    CARNAL_FRAME:        "dhCarnalFrame",
    DUALITY_LABELS:      "dhDualityLabels",
    PROSE_FLAVOR:        "hsceneProseFlavorLines",
    HSCENE_ENABLED:      "hsceneEnabled",
    CUM_VOLUME_MODE:     "cumVolumeMode",
    PREGNANCY_STACKING:  "pregnancyStacking",
    CUMFLATION_ENABLED:  "cumflationEnabled",
    CUMFLATION_TRACKING: "cumflationTracking",
    CUMFLATION_ML:       "cumflationMlTracking",
    CUMFLATION_HSCENE:   "cumflationInHscene",
    TITLES_AUTOMATION:   "titlesAutomation",
    TITLES_SHOW:         "titlesShow",
    HSCENE_LOG_TO_CHAT:  "hsceneLogToChat",
    SCENE_REPORT_VIS:    "sceneReportVisibility",
    POSITION_TRACKING:   "positionTracking",
    GANGBANG_AUTO_ASSIGN: "gangbangAutoAssign",
    CUM_HOLE_FROM_POSITION: "cumHoleFromPosition",
    CUSTOM_POSITIONS:    "customPositions",
    EDGE_AUTO:           "edgeAuto",
    EDGE_SKIP_DIALOG:    "edgeSkipDialog",
    EDGE_INCLUDE_NPC:    "edgeIncludeNpc",
    SHOW_WELCOME:        "showWelcome",
    TOOLBAR_MODE:        "toolbarMode",
    LEWD_LEVEL:          "lewdLevel",
    LEWD_LEVEL_CONFIGURED: "lewdLevelConfigured",
    LEGACY_COND_STRIP:     "legacyCondStripDone",
    INFINITE_CUM:        "infiniteCumVolume",
    HSCENE_THEME:        "hsceneTheme",
    HSCENE_THEME_PC:     "hsceneThemePc",
    HSCENE_THEME_MON:    "hsceneThemeMon",
    HSCENE_PLAYER_PICK:  "hscenePlayerPick",
    HSCENE_AROUSAL:      "hsceneArousalStyle",
    HSCENE_DOSSIER_FX:   "hsceneDossierAnimated",
    HSCENE_MESSAGES:     "hsceneCustomMessages",
    TITLES_CONFIG:       "titlesCustomConfig",
    CF_LABELS:           "cumflationLabels",
    CF_HOLE_LABELS:      "cumflationHoleLabels",
    SPLATTER_ENABLED:    "splatterEnabled",
    SPLATTER_INTENSITY:  "splatterIntensity",
    CARD_FONT_BOOST:     "cardFontBoost",
    SPLATTER_INCLUDE_NPC: "splatterIncludeNpc",
    SPLATTER_COLOR:      "splatterColor",
    SPLATTER_HIDE_LOCAL: "splatterHideLocal",
    SPLATTER_QUALITY:    "splatterQuality",
    VOICE_ENABLED:       "voiceEnabled",
    VOICE_FOLDER:        "voiceFolder",
    VOICE_VOLUME:        "voiceVolume",
    VOICE_MUTE_LOCAL:    "voiceMuteLocal",
    SFX_ENABLED:         "sfxEnabled",
    SFX_VOLUME:          "sfxVolume",
  },

  register() {
    const S = AFLP.Settings;

    // ── Per-system config visibility ──────────────────────────────────────
    // Some settings only make sense on one game system. They stay REGISTERED on
    // every system (so getters and stored values keep working) but are hidden
    // from the Configure Settings menu where they don't apply, by feeding these
    // flags into each setting's `config`. game.system.id is known at init, when
    // register() runs. Today only Daggerheart has system-specific settings; the
    // pf2eOnly hook is here ready for any PF2e-only settings added later.
    const SYS      = game.system?.id ?? "";
    const dhOnly   = SYS === "daggerheart";
    const pf2eOnly = SYS === "pf2e"; // eslint-disable-line no-unused-vars
    const dnd5eOnly = SYS === "dnd5e"; // eslint-disable-line no-unused-vars

    // ── Session Zero setup — accessible from module settings ──────────────
    // type must extend ApplicationV2 (v13+) or FormApplication. We use a
    // minimal ApplicationV2 subclass that immediately delegates to the
    // aflpShowSessionZero function and closes the stub window.
    const SessionZeroLauncher = class extends foundry.applications.api.ApplicationV2 {
      static DEFAULT_OPTIONS = {
        id: "aflp-session-zero-launcher",
        window: { title: "AFLP Session Zero Setup" },
      };
      async _renderHTML() { return document.createElement("div"); }
      _replaceHTML(result, content) { content.replaceChildren(result); }
      _onRender() {
        setTimeout(() => this.close(), 0);
        if (typeof aflpShowSessionZero === "function") aflpShowSessionZero();
      }
    };
    game.settings.registerMenu(S.ID, "sessionZeroSetup", {
      name:       "Session Zero Setup",
      label:      "Open Session Zero Setup",
      hint:       "Configure AFLP's Lewd Level and automation settings for your campaign.",
      icon:       "fas fa-cog",
      type:       SessionZeroLauncher,
      restricted: true,
    });

    // ── AFLR Soundpack helpers (shared by the settings menu button, the
    // welcome screen link, and the "audio on but pack missing" notice) ────
    const aflpSoundpackActive = () =>
      !!(game.modules?.get?.("aflp-soundpack")?.active || game.modules?.get?.("aflr-soundpack-lite")?.active);
    const aflpShowSoundpackDialog = () => {
      const liteUrl = (window.AFLP && AFLP.SOUNDPACK_LITE_URL) || "";
      const fullUrl = (window.AFLP && AFLP.SOUNDPACK_URL) || "";
      foundry.applications.api.DialogV2.wait({
        window: { title: "AFLR Soundpack - Free Download" },
        content: `<div style="font-size:13px; line-height:1.6; max-width:480px;">
          <p>AFLP's voice and ambient-SFX audio ships in a free companion module. AFLP runs fine without it - install it to turn audio on.</p>
          <p>We recommend the <strong>AFLR Soundpack Lite</strong>: a curated pick of voices and SFX, a small download that covers the full feature set.</p>
          <p style="text-align:center; margin:14px 0;">
            <a href="${liteUrl}" target="_blank" rel="noopener" style="display:inline-block; padding:8px 18px; background:#c9a96e; color:#1b1b1b; font-weight:700; border-radius:5px; text-decoration:none;">Get the AFLR Soundpack Lite</a>
          </p>
          <p style="margin:0 0 4px;"><strong>To install (one-time):</strong></p>
          <ol style="margin:0 0 10px; padding-left:18px;">
            <li>Download and unzip the file above.</li>
            <li>Move the <code>aflr-soundpack-lite</code> folder into your Foundry <code>Data/modules</code> folder.</li>
            <li>Restart Foundry, then enable <strong>AFLR Soundpack Lite</strong> under Manage Modules.</li>
          </ol>
          <p style="margin:12px 0 4px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.15);"><strong>Want more sounds?</strong> The full <a href="${fullUrl}" target="_blank" rel="noopener" style="color:#c9a96e; font-weight:700;">AFLR Soundpack</a> bundles every voice actor and the complete SFX library (a much larger download). Install it instead of Lite and AFLP uses it automatically.</p>
          <p style="font-size:11px; opacity:0.8;">Audio: OpenNSFW Sound Pack (CC BY 4.0). Full contributor credits ship with the soundpack.</p>
        </div>`,
        buttons: [{ action: "close", label: "Close", default: true }],
      });
    };
    // When audio is enabled but the soundpack isn't installed/active there is
    // nothing to play. openDialog=true (on toggle) shows the actionable dialog;
    // openDialog=false (on load) shows a passive warning. Returns true if missing.
    const aflpAudioNeedsSoundpack = (openDialog = false) => {
      if (aflpSoundpackActive()) return false;
      if (openDialog) aflpShowSoundpackDialog();
      else ui.notifications?.warn("AFLP: Voice/Ambient SFX is enabled, but the AFLR Soundpack module is not installed or active - there is no audio to play. Open Module Settings and use 'Get the AFLR Soundpack' to download it.", { permanent: true });
      return true;
    };

    // ── AFLR Soundpack download — accessible from module settings ─────────
    const SoundpackLink = class extends foundry.applications.api.ApplicationV2 {
      static DEFAULT_OPTIONS = {
        id: "aflp-soundpack-link",
        window: { title: "Get the AFLR Soundpack" },
      };
      async _renderHTML() { return document.createElement("div"); }
      _replaceHTML(result, content) { content.replaceChildren(result); }
      _onRender() { setTimeout(() => this.close(), 0); aflpShowSoundpackDialog(); }
    };
    game.settings.registerMenu(S.ID, "getSoundpack", {
      name:       "AFLR Soundpack (Audio)",
      label:      "Get the AFLR Soundpack",
      hint:       "Download the free AFLR Soundpack companion module - the voice profiles and ambient SFX used by AFLP's audio. Install and enable it alongside AFLP.",
      icon:       "fas fa-download",
      type:       SoundpackLink,
      restricted: true,
    });

    // One-time check on load: if audio is enabled but the pack is absent, warn the GM.
    Hooks.once("ready", () => {
      try {
        if (!game.user?.isGM) return;
        const vOn = game.settings.get(S.ID, S.KEYS.VOICE_ENABLED) === true;
        const sOn = game.settings.get(S.ID, S.KEYS.SFX_ENABLED) === true;
        if (vOn || sOn) aflpAudioNeedsSoundpack(false);
      } catch (_) {}
    });

    // One-time Lewd Level upgrade-detection. Runs once per world (gated by the
    // configured marker). A world that predates the Lewd Level system was
    // effectively running at full content, so if it shows AFLR usage but the
    // level was never explicitly set, bump it to Lewd 4 to avoid the behaviour
    // gates silently stripping content. A fresh world keeps the default and
    // waits for Session Zero. Worlds that already set a level are left untouched.
    Hooks.once("ready", async () => {
      try {
        if (!game.user?.isGM) return;
        if (game.settings.get(S.ID, S.KEYS.LEWD_LEVEL_CONFIGURED) === true) return;

        // Was the level ever explicitly stored, vs returning the registered default?
        let explicitlyStored = false;
        try {
          const key = `${S.ID}.${S.KEYS.LEWD_LEVEL}`;
          const ws = game.settings.storage.get("world");
          explicitlyStored = !!(ws?.getSetting?.(key) || ws?.find?.(d => d.key === key));
        } catch (_) {}

        if (!explicitlyStored) {
          const FS = AFLP.FLAG_SCOPE;
          const hasFootprint = !!game.actors?.some(a =>
            a.getFlag(FS, "sexual") || a.getFlag(FS, "aflpConditions") || a.getFlag(FS, "history") ||
            a.items?.some(i => ["dominating","submitting","mind-break","exposed"].includes(i.slug))
          );
          if (hasFootprint) {
            await game.settings.set(S.ID, S.KEYS.LEWD_LEVEL, 4);
            console.log("AFLP | Upgrade-detection: existing world found - Lewd Level set to 4 to preserve full content.");
            ui.notifications?.info("AFLR: existing world detected - Lewd Level set to 4 (full content). Adjust it any time via the Session Zero Setup button.");
          }
        }
        await game.settings.set(S.ID, S.KEYS.LEWD_LEVEL_CONFIGURED, true);
      } catch (e) {
        console.warn("AFLP | Lewd Level upgrade-detection failed:", e);
      }
    });

    // One-time strip of legacy condition ITEMS. Before the flag flip, PF2e worlds
    // stored dominating/submitting/defeated as effect items. Those are now flags,
    // and applyCondition/removeCondition self-heal stragglers on next use, but this
    // sweep proactively migrates any survivors to flags (preserving their state)
    // and removes the items in one pass. On flag-based systems there are no such
    // items, so it is a no-op there. The dual-read in the adapter stays as a safety
    // net; it is removed in a later pass once worlds have settled.
    Hooks.once("ready", async () => {
      try {
        if (!game.user?.isGM) return;
        if (game.settings.get(S.ID, S.KEYS.LEGACY_COND_STRIP) === true) return;

        const SLUGS = ["dominating", "submitting", "defeated"];
        const uuidToSlug = {};
        for (const s of SLUGS) { const u = AFLP.conditions?.[s]?.uuid; if (u) uuidToSlug[u] = s; }
        const slugOf = (item) =>
          SLUGS.includes(item.slug) ? item.slug : uuidToSlug[item.flags?.core?.sourceId ?? item.sourceId];

        // World actors, plus unlinked token actors (which carry their own items).
        const targets = [];
        for (const a of game.actors?.contents ?? []) targets.push({ actor: a, tokenId: null });
        for (const scene of game.scenes?.contents ?? []) {
          for (const tok of scene.tokens?.contents ?? []) {
            if (tok.actor && !tok.isLinked) targets.push({ actor: tok.actor, tokenId: tok.id });
          }
        }

        let actorsTouched = 0, migrated = 0, removed = 0;
        for (const { actor, tokenId } of targets) {
          const legacy = (actor.items?.filter(i => slugOf(i)) ?? []);
          if (!legacy.length) continue;
          actorsTouched++;
          for (const item of legacy) {
            const slug = slugOf(item);
            if (slug && !AFLP.cond.has(actor, slug, tokenId)) {
              // Preserve state: apply the flag (which also deletes the legacy item).
              await AFLP.cond.apply(actor, slug, null, tokenId);
              migrated++;
            } else {
              // Flag already set (or unknown) - just remove the stale item.
              try { await item.delete(); removed++; } catch (_) {}
            }
          }
        }

        await game.settings.set(S.ID, S.KEYS.LEGACY_COND_STRIP, true);
        if (actorsTouched) {
          console.log(`AFLP | Legacy condition strip: ${actorsTouched} actor(s), ${migrated} migrated to flags, ${removed} stale item(s) removed.`);
        }
      } catch (e) {
        console.warn("AFLP | Legacy condition strip failed:", e);
      }
    });

    // =====================================================================
    // Settings are grouped logically below (not by the order they were added):
    //   1. General
    //   2. H Scene - Cards & Log
    //   3. H Scene - Appearance
    //   4. Positions
    //   5. Titles
    //   6. Arousal & Climax (Edge)
    //   7. Cum & Cumflation
    // Hidden/internal data stores are registered at the end.
    // =====================================================================

    // ── 1. General ────────────────────────────────────────────────────────

    game.settings.register(S.ID, S.KEYS.SHOW_WELCOME, {
      name:    "Show Welcome Message on Load",
      hint:    "Show the AFLP welcome message when the world loads. Uncheck to suppress it. A new version's message will re-enable this automatically.",
      scope:   "client",
      config:  true,
      type:    Boolean,
      default: true,
    });

    game.settings.register(S.ID, S.KEYS.TOOLBAR_MODE, {
      name:    "AFLR Buttons",
      hint:    "Where the AFLR quick buttons (toggle the H Scene window and your sheet) appear. Floating bar hovers over the screen and can be dragged anywhere; Sidebar tucks them into the left scene-controls toolbar.",
      scope:   "client",
      config:  true,
      type:    String,
      choices: { floating: "Floating bar", sidebar: "Left sidebar" },
      default: "floating",
      onChange: () => { try { AFLP.UI?.Toolbar?.refresh?.(); } catch (e) { /* ignore */ } },
    });

    // Canonical Lewd Level (1-4). Single source of truth for content + behaviour
    // gating. Written by Session Zero Setup; adjustable here afterwards. Defaults
    // to 2 (consensual humanoid content, no cumflation/monster-defeat) as a
    // broad-appeal starting point - groups raise it during Session Zero. When the
    // behaviour gates land, existing worlds get upgrade-detection so they don't
    // silently lose their Lewd 3-4 content.
    game.settings.register(S.ID, S.KEYS.LEWD_LEVEL, {
      name:    "Lewd Level",
      hint:    "The group's agreed content level (set during Session Zero). Gates which AFLR content and automation is available: 1 self-affecting only, 2 consensual humanoid, 3 arousal/kinks/magic-caused acts, 4 monster sexual defeat and CNC. Prefer setting this via the Session Zero Setup button on the welcome screen.",
      scope:   "world",
      config:  true,
      type:    Number,
      choices: { 1: "Lewd 1 - Typical Anime", 2: "Lewd 2 - The Witcher III", 3: "Lewd 3 - Skyrim (Sexy Mods)", 4: "Lewd 4 - Skyrim (Defeat Mods)" },
      default: 2,
    });

    // Hidden marker: has the Lewd Level been deliberately configured (via Session
    // Zero, an explicit settings change, or one-time upgrade-detection)? Lets the
    // ready hook below distinguish a fresh world from a pre-Lewd-Level world that
    // should keep its full content. Set once, never shown in the config UI.
    game.settings.register(S.ID, S.KEYS.LEWD_LEVEL_CONFIGURED, {
      scope:   "world",
      config:  false,
      type:    Boolean,
      default: false,
    });

    // Hidden marker: has the one-time legacy condition-item strip run? Old worlds
    // stored dominating/submitting/defeated as PF2e items before the flag flip;
    // the ready hook below migrates any survivors to flags and removes the items.
    game.settings.register(S.ID, S.KEYS.LEGACY_COND_STRIP, {
      scope:   "world",
      config:  false,
      type:    Boolean,
      default: false,
    });

    // ── 2. H Scene — Cards & Log ───────────────────────────────────────────

    game.settings.register(S.ID, S.KEYS.HSCENE_ENABLED, {
      name:    "H Scene Cards",
      hint:    "[Lewd 2+] Enable the on-screen H Scene card system. Disable to turn off all H Scene UI without removing the module.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    game.settings.register(S.ID, S.KEYS.PROSE_FLAVOR, {
      name:    "H Scene - Flavour Prose",
      hint:    "[Lewd 2+] Generate flavour prose lines in H Scene cards based on actor genitalia. Disable to show only the action name and GM text field.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    game.settings.register(S.ID, S.KEYS.HSCENE_LOG_TO_CHAT, {
      name:    "H Scene - Post Log to Chat on Close",
      hint:    "[Lewd 2+] When an H Scene closes, post the full scene prose log as a single chat message. Useful as a backup record if you want prose in your chat history.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    game.settings.register(S.ID, S.KEYS.SCENE_REPORT_VIS, {
      name:    "H Scene - End-of-Scene Report Visibility",
      hint:    "Who can see the stat report card posted when an H Scene closes.",
      scope:   "world",
      config:  true,
      type:    String,
      choices: {
        "public":     "Public (everyone)",
        "player":     "GM and submitting player",
        "gm":         "GM only",
      },
      default: "public",
    });

    // ── 3. H Scene — Appearance ────────────────────────────────────────────

    // GM default theme for PC/NPC targets
    game.settings.register(S.ID, S.KEYS.HSCENE_THEME_PC, {
      name:    "H Scene Default Theme (PC / NPC Target)",
      hint:    "Default UI theme used when the scene target is a PC or NPC. Applied to all players unless they have chosen their own theme.",
      scope:   "world",
      config:  true,
      type:    String,
      choices: {
        "lewd-lite":   "Lewd Lite",
        "status-strip": "Status Strip",
        "aflp-classic":        "AFLP Classic",
        "dossier":      "Dossier File",
        "fuckamons":    "Fuck a Mon'",
      },
      default: "aflp-classic",
      onChange: () => AFLP.HScene?._applyDefaultThemesToAll?.(),
    });

    // GM default theme for monster targets
    game.settings.register(S.ID, S.KEYS.HSCENE_THEME_MON, {
      name:    "H Scene Default Theme (Monster Target)",
      hint:    "Default UI theme used when the scene target is a monster (NPC with no player owner). Switches automatically when a monster becomes the target.",
      scope:   "world",
      config:  true,
      type:    String,
      choices: {
        "lewd-lite":   "Lewd Lite",
        "status-strip": "Status Strip",
        "aflp-classic":        "AFLP Classic",
        "dossier":      "Dossier File",
        "fuckamons":    "Fuck a Mon'",
      },
      default: "fuckamons",
      onChange: () => AFLP.HScene?._applyDefaultThemesToAll?.(),
    });

    // Allow players to pick their own theme
    game.settings.register(S.ID, S.KEYS.HSCENE_PLAYER_PICK, {
      name:    "H Scene - Allow Players to Choose Their Own UI",
      hint:    "When enabled, each player can switch the H scene UI theme via the dropdown on the card. When disabled, all players use the GM's default theme setting and any player-chosen themes are reset.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
      onChange: (allowed) => {
        if (!allowed) AFLP.HScene?._resetPlayersToDefaultTheme?.();
      },
    });

    game.settings.register(S.ID, S.KEYS.HSCENE_DOSSIER_FX, {
      name:    "H Scene - Dossier Animated Hologram Effects",
      hint:    "Enable scan-line and glitch animations for the Dossier File theme.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    // Per-user theme + arousal display (config:false — chosen via card dropdown)
    game.settings.register(S.ID, S.KEYS.HSCENE_THEME, {
      name:    "H Scene UI Theme",
      hint:    "Visual style for H scene cards. Per-user - each player can choose their own.",
      scope:   "client",
      config:  false,
      type:    String,
      choices: {
        "lewd-lite":   "Lewd Lite",
        "status-strip": "Status Strip",
        "aflp-classic":        "AFLP Classic",
        "dossier":      "Dossier File",
        "fuckamons":    "Fuck a Mon'",
      },
      default: "aflp-classic",
      onChange: () => {
        // Re-inject updated CSS for new theme
        const styleEl = document.getElementById("aflp-hscene-styles-v2");
        if (styleEl && AFLP?.HScene?._rebuildStyle) {
          AFLP.HScene._rebuildStyle();
        }
        // Rebuild all active card portraits with the new theme
        const scenes = AFLP?.HScene?._scenes;
        if (!scenes) return;
        for (const [targetId, scene] of scenes) {
          const card = document.querySelector(`[data-target-id="${targetId}"]`);
          if (!card) continue;
          const sceneTheme = AFLP.HScene._effectiveTheme?.(scene) ?? AFLP.Settings.hsceneTheme ?? "aflp-classic";
          card.className = card.className.replace(/aflp-theme-\S+/, "aflp-theme-" + sceneTheme);
          AFLP.HScene.refreshScene?.(targetId);
          const sel = card.querySelector(".aflp-card-theme-select");
          if (sel) sel.value = sceneTheme;
        }
      },
    });

    game.settings.register(S.ID, S.KEYS.HSCENE_AROUSAL, {
      name:    "H Scene Arousal Display",
      hint:    "Bars or pips for arousal. Per-user.",
      scope:   "client",
      config:  false,
      type:    String,
      choices: {
        "auto": "Theme default",
        "bars": "Bars",
        "pips": "Pips",
      },
      default: "auto",
    });

    // ── 4. Positions ───────────────────────────────────────────────────────

    game.settings.register(S.ID, S.KEYS.POSITION_TRACKING, {
      name:    "Positions - Track Current Position",
      hint:    "[Lewd 2+] When starting a scene or using Sexual Advance, prompt to select the current position/act. The position is shown on the H Scene card and used by other position-aware features.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    game.settings.register(S.ID, S.KEYS.CUM_HOLE_FROM_POSITION, {
      name:    "Positions - Auto-Choose Cum Hole from Position",
      hint:    "When enabled, the Cum macro skips its hole-selection dialog and uses the hole implied by each cock-having performer's tracked position (e.g. a vaginal position cums in the pussy). When disabled (default), the hole dialog always appears so you can choose freely. Requires Position Tracking.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: false,
    });

    game.settings.register(S.ID, S.KEYS.GANGBANG_AUTO_ASSIGN, {
      name:    "Positions - Auto-Assign Gangbang Slots",
      hint:    "When a group position is selected, automatically assign performers to slots based on their body type. When off, the GM is shown the slot assignments and can confirm or swap them before applying.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: false,
    });

    // Custom Positions manager (menu) + its data store
    const PositionManagerStub = class extends foundry.applications.api.ApplicationV2 {
      static DEFAULT_OPTIONS = {
        id: "aflp-position-manager-stub",
        window: { title: "Custom Positions" },
      };
      async _renderHTML() { return document.createElement("div"); }
      _replaceHTML(result, content) { content.replaceChildren(result); }
      async _onRender() {
        setTimeout(() => this.close(), 0);
        const { AFLPPositionManager } = await import("./ui/aflp-position-manager.js");
        new AFLPPositionManager().render(true);
      }
    };

    game.settings.registerMenu(S.ID, "customPositionsMenu", {
      name:       "Custom Positions",
      hint:       "Add your own positions to the H Scene position picker. Stored as world data.",
      label:      "Manage Custom Positions",
      icon:       "fas fa-plus-circle",
      type:       PositionManagerStub,
      restricted: true,
    });

    game.settings.register(S.ID, S.KEYS.CUSTOM_POSITIONS, {
      name:    "Custom Positions Data",
      scope:   "world",
      config:  false,
      type:    String,
      default: "[]",
    });

    // ── 5. Titles ──────────────────────────────────────────────────────────

    game.settings.register(S.ID, S.KEYS.TITLES_SHOW, {
      name:    "Titles - Show on Character Sheet",
      hint:    "[Lewd 2+] Show the Titles section on the AFLP character sheet tab (view and edit mode).",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    game.settings.register(S.ID, S.KEYS.TITLES_AUTOMATION, {
      name:    "Titles - Automatic Award",
      hint:    "[Lewd 2+] Automatically award titles to characters when they meet the criteria during play. A toast and chat card will announce each new title.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    // ── 6. Arousal & Climax ────────────────────────────────────────────────

    game.settings.register(S.ID, S.KEYS.AUTOMATION, {
      name:    "Arousal Automation",
      hint:    "[Lewd 3+] Automatically apply arousal changes from conditions (Submitting bonus, Dominating passive, etc.) and trigger the cum sequence when arousal hits max.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    game.settings.register(S.ID, S.KEYS.STRESS_AS_AROUSAL, {
      name:    "Daggerheart: Stress as Arousal",
      hint:    "[Daggerheart only] When on, a creature's Stress track doubles as its Arousal: arousal reads and writes Stress directly, and cumming clears marked Stress. Off (the default) keeps the two separate - Stress is the will to resist (draining toward Mind Break) and Arousal is its own scene track owned by the Carnal resolution layer. Leave this OFF unless you specifically want Stress and Arousal to be one and the same track. No effect on other game systems.",
      scope:   "world",
      config:  dhOnly,
      type:    Boolean,
      default: false,
    });

    game.settings.register(S.ID, S.KEYS.CARNAL_FRAME, {
      name:    "Daggerheart: Carnal Campaign Frame",
      hint:    "[Daggerheart only] Tunes how the Carnal resolution layer leans. 'Default' is the tense-but-survivable posture: Mind Break can be recovered through fiction, and allies can free a pinned character cleanly. 'Lust Haze' is the grim, overwhelming lean toward a bad end: Mind Break is treated as a scene-claiming finish, you mostly save yourself through Struggle Escape, and allies who intervene risk being pulled in. This dial only changes framing and defaults; it never overrides an explicit choice at the table.",
      scope:   "world",
      config:  dhOnly,
      type:    String,
      choices: {
        default:  "Default (tense, survivable)",
        lustHaze: "Lust Haze (grim, overwhelming bad-end)",
      },
      default: "default",
    });

    game.settings.register(S.ID, S.KEYS.DUALITY_LABELS, {
      name:    "Daggerheart: Duality Dice Labels",
      hint:    "[Daggerheart only] Renames the Duality outcome words across the game for a lewd campaign. 'Hope / Fear' keeps the core Daggerheart terms. 'Virtue / Lust' reskins every 'Hope' to 'Virtue' and every 'Fear' to 'Lust' in AFLR's own chat cards (live) and in the core Daggerheart UI labels - the Fear tracker, sheet headings, settings, and the duality roll readout (applied on reload). It does NOT change any dice or how outcomes resolve, and it deliberately leaves ability/rules text and compendium content alone, so feature descriptions may still read Hope/Fear.",
      scope:   "world",
      config:  dhOnly,
      type:    String,
      choices: {
        "hope-fear":   "Hope / Fear (default)",
        "virtue-lust": "Virtue / Lust",
      },
      default: "hope-fear",
      onChange: () => { try { ui.chat?.render(); } catch (e) { /* non-fatal */ } },
    });

    game.settings.register(S.ID, S.KEYS.EDGE_AUTO, {
      name:    "Edge - Offer Edge on Cum",
      hint:    "[Lewd 3+] When a character reaches max Arousal, present in-card Cum and Edge buttons instead of cumming automatically. The climax waits until Cum (let go) or Edge (Fortitude vs level DC to hold back) is clicked. Turn this off to have characters cum automatically with no Edge option. Requires Arousal Automation.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: false,
    });

    game.settings.register(S.ID, S.KEYS.EDGE_INCLUDE_NPC, {
      name:    "Edge - Also Apply to Monsters and NPCs",
      hint:    "Include non-player characters in the Edge flow, showing them the in-card Cum/Edge buttons too. When off, monsters and NPCs cum automatically. Useful to leave off so monster climaxes resolve without GM clicks during combat.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: false,
    });

    game.settings.register(S.ID, S.KEYS.EDGE_SKIP_DIALOG, {
      name:    "Edge - Auto-Roll Edge Instead of Showing Buttons",
      hint:    "[Lewd 4] Skip the in-card Cum/Edge buttons and immediately roll the Edge Fortitude save when a character would Cum (success cancels the climax, failure cums). Only active when 'Offer Edge on Cum' is also enabled. Best for fast, hands-off monster combat.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: false,
    });

    // ── 7. Cum & Cumflation ────────────────────────────────────────────────

    game.settings.register(S.ID, S.KEYS.CUM_VOLUME_MODE, {
      name:    "Cum Volume - Unit Size",
      hint:    "[Lewd 3+] Fantasy: each unit of cum is 250 ml (suitable for Cumflation). Realistic: each unit is 4 ml (anatomically grounded, Cumflation less meaningful).",
      scope:   "world",
      config:  true,
      type:    String,
      choices: {
        fantasy:   "Fantasy (250 ml per unit)",
        realistic: "Realistic (4 ml per unit)",
      },
      default: "fantasy",
    });

    game.settings.register(S.ID, S.KEYS.PREGNANCY_STACKING, {
      name:    "Pregnancy - Allow Concurrent Pregnancies",
      hint:    "[Lewd 3+] By default a bearer already carrying an active pregnancy cannot be impregnated again - the womb is occupied, so further loads still fill and flood but take no new pregnancy. Turn this ON to allow stacking: every successful breeding adds another concurrent pregnancy regardless of who or how many are already taking root. Applies the same way on every game system.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: false,
    });

    game.settings.register(S.ID, S.KEYS.INFINITE_CUM, {
      name:    "Cum Volume - Infinite (Monsters)",
      hint:    "When enabled, monsters' cum volume is not reduced when they cum. It stays at maximum. Useful for high-intensity encounters where tracking depletion is not desired.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: false,
    });

    game.settings.register(S.ID, S.KEYS.CUMFLATION_ENABLED, {
      name:    "Cumflation - Master Toggle",
      hint:    "[Lewd 3+] Enable or disable all Cumflation features as a group. Turning this off overrides the sub-toggles below.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    game.settings.register(S.ID, S.KEYS.CUMFLATION_HSCENE, {
      name:    "Cumflation - Apply Cumflation in H Scene Actions",
      hint:    "[Lewd 3+] When the Cum macro fires during an H Scene, apply Cumflation tiers to the target. Disable to track cum volume and history without causing Cumflation.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    game.settings.register(S.ID, S.KEYS.CUMFLATION_TRACKING, {
      name:    "Cumflation - Show Cumflation Section in Sheet",
      hint:    "[Lewd 3+] Show the Cumflation pip bars and tier links on the AFLP character sheet tab.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    game.settings.register(S.ID, S.KEYS.CUMFLATION_ML, {
      name:    "Cumflation - Show Cum Given/Received Lifetime Totals",
      hint:    "[Lewd 3+] Show the Cum Given (ml) and Cum Received (ml) columns in the Lifetime Totals table on the AFLP sheet tab. Requires Cumflation master toggle to be on.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    // ── Hidden / internal data stores (config:false) ───────────────────────

    // Stores active H scene state for reload persistence.
    game.settings.register(S.ID, "hsceneActiveScenes", {
      name:   "Active H Scenes (persist)",
      scope:  "world",
      config: false,
      type:   String,
      default: "",
    });

    // Custom H scene messages - JSON string, world-scoped so it survives module updates
    game.settings.register(S.ID, S.KEYS.HSCENE_MESSAGES, {
      name:    "H Scene Custom Messages",
      scope:   "world",
      config:  false,
      type:    String,
      default: "",
    });

    // Custom title thresholds, names, and extra titles - JSON string, world-scoped
    game.settings.register(S.ID, S.KEYS.TITLES_CONFIG, {
      name:    "Titles Custom Config",
      scope:   "world",
      config:  false,
      type:    String,
      default: "",
    });

    // Cumflation status word labels - editable per world
    game.settings.register(S.ID, S.KEYS.CF_LABELS, {
      name:    "Cumflation Status Labels",
      scope:   "world",
      config:  false,
      type:    String,
      default: "",
    });

    game.settings.register(S.ID, S.KEYS.CF_HOLE_LABELS, {
      name:    "Cumflation Per-Hole Labels",
      scope:   "world",
      config:  false,
      type:    String,
      default: "",
    });

    // ── Cum Splatter visuals ───────────────────────────────────────────────
    game.settings.register(S.ID, S.KEYS.SPLATTER_ENABLED, {
      name:    "Cum Splatter - Enable Token Splatter Visuals",
      hint:    "[Lewd 3+] Coat cumflated tokens and splatter the ground beneath them. Intensity scales with cumflation tier. Purely visual; turns off all splatter when disabled.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
      onChange: () => window.AFLP_Splatter?.refreshAll?.(),
    });

    game.settings.register(S.ID, S.KEYS.SPLATTER_QUALITY, {
      name:    "Cum Splatter - Render Quality",
      hint:    "Performance vs fidelity for the cum coat and ground puddles. High is the original full-detail render. Medium (default) lowers texture resolution, blur passes and puddle detail for a large performance gain while the cumflation still reads clearly. Low is lightest - half-resolution textures, minimal blur, fewer layers, and no wet-film or pooled-cum extras - for weaker machines or scenes with many puddles.",
      scope:   "world",
      config:  true,
      type:    String,
      choices: { high: "High (full detail)", medium: "Medium (balanced - default)", low: "Low (best performance)" },
      default: "medium",
      onChange: () => window.AFLP_Splatter?.refreshAll?.(),
    });

    game.settings.register(S.ID, S.KEYS.SPLATTER_INTENSITY, {
      name:    "Cum Splatter - Intensity",
      hint:    "Multiplier for splatter coverage, blob count and puddle size. 1.0 = default.",
      scope:   "world",
      config:  true,
      type:    Number,
      range:   { min: 0.25, max: 2.5, step: 0.25 },
      default: 1.0,
      onChange: () => window.AFLP_Splatter?.refreshAll?.(),
    });

    game.settings.register(S.ID, S.KEYS.CARD_FONT_BOOST, {
      name:    "H Scene Card - Larger Font (+2)",
      hint:    "Increase the H Scene card text by +2pt across all themes for readability. Layout and card sizing are unchanged.",
      scope:   "client",
      config:  true,
      type:    Boolean,
      default: false,
      onChange: () => { try { const H = window.AFLP?.HScene; if (H?._scenes) for (const [sid] of H._scenes) H.refreshScene?.(sid); } catch (_) {} },
    });

    game.settings.register(S.ID, S.KEYS.SPLATTER_INCLUDE_NPC, {
      name:    "Cum Splatter - Apply to NPCs",
      hint:    "Also splatter non-player-owned (NPC / monster) tokens. When off, only player-owned tokens are splattered.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
      onChange: () => window.AFLP_Splatter?.refreshAll?.(),
    });

    game.settings.register(S.ID, S.KEYS.SPLATTER_COLOR, {
      name:    "Cum Splatter - Colour",
      hint:    "Hex colour for the splatter (default off-white #f2efe6).",
      scope:   "world",
      config:  true,
      type:    String,
      default: "#f2efe6",
      onChange: () => window.AFLP_Splatter?.refreshAll?.(),
    });

    game.settings.register(S.ID, S.KEYS.SPLATTER_HIDE_LOCAL, {
      name:    "Cum Splatter - Hide On My Client",
      hint:    "Per-user: hide all cum splatter for yourself only, without changing what other players see.",
      scope:   "client",
      config:  true,
      type:    Boolean,
      default: false,
      onChange: () => window.AFLP_Splatter?.refreshAll?.(),
    });

    // ── Voice profiles ─────────────────────────────────────────────────────
    game.settings.register(S.ID, S.KEYS.VOICE_ENABLED, {
      name:    "Voice Profiles - Enable",
      hint:    "Play per-actor voice clips on climax, Sexual Advance, Struggle Snuggle and cumflation milestones. Assign a profile per actor from the dropdown on their AFLP sheet tab. Voices load from the free AFLR Soundpack module. (No audio plays until the soundpack is installed and a profile is assigned, so leaving this on is harmless if unconfigured.)",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
      onChange: (v) => { if (v) aflpAudioNeedsSoundpack(true); },
    });

    game.settings.register(S.ID, S.KEYS.VOICE_FOLDER, {
      name:    "Voice Profiles - Extra Custom Folder",
      hint:    "Optional. The shipped soundpack's voice profiles load automatically from the AFLR Soundpack module (modules/aflp-soundpack/aflp-voices). Use this only to add your OWN extra profiles kept in a separate folder. Each subfolder is one profile, with per-event subfolders inside it: <Profile>/climax, <Profile>/advance, <Profile>/struggle, <Profile>/cumflation, plus <Profile>/moan/1..6. A profile here with the same name as a bundled one overrides it.",
      scope:   "world",
      config:  true,
      type:    String,
      filePicker: "folder",
      default: "",
      onChange: () => window.AFLP_Voice?.scan?.(),
    });

    game.settings.register(S.ID, S.KEYS.VOICE_VOLUME, {
      name:    "Voice Profiles - Volume (my client)",
      hint:    "Per-user playback volume for voice clips. 0 mutes them for you.",
      scope:   "client",
      config:  true,
      type:    Number,
      range:   { min: 0, max: 1, step: 0.05 },
      default: 0.8,
    });

    game.settings.register(S.ID, S.KEYS.VOICE_MUTE_LOCAL, {
      name:    "Voice Profiles - Mute On My Client",
      hint:    "Per-user: silence all AFLP voice clips for yourself only.",
      scope:   "client",
      config:  true,
      type:    Boolean,
      default: false,
    });

    game.settings.register(S.ID, S.KEYS.SFX_ENABLED, {
      name:    "Ambient SFX - Enable",
      hint:    "Layer generic activity sounds (plap for pussy/anal, gluk for oral, etc.) on top of voices, chosen by each actor's current H Scene position. These play even for actors with no voice profile. Files load from the AFLR Soundpack module at modules/aflp-soundpack/aflp-sfx.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
      onChange: (v) => { window.AFLP_Voice?.scanSfx?.(); if (v) aflpAudioNeedsSoundpack(true); },
    });

    game.settings.register(S.ID, S.KEYS.SFX_VOLUME, {
      name:    "Ambient SFX - Volume (my client)",
      hint:    "Per-user playback volume for the ambient activity sounds. 0 mutes them for you.",
      scope:   "client",
      config:  true,
      type:    Number,
      range:   { min: 0, max: 1, step: 0.05 },
      default: 0.7,
    });

  },

  // ── Convenience getters ──────────────────────────────────────────────────

  get automation()           { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.AUTOMATION); },
  get toolbarMode()          { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.TOOLBAR_MODE) ?? "floating"; },
  get lewdLevel()            { return Number(game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.LEWD_LEVEL) ?? 2); },
  get lewdLevelConfigured()  { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.LEWD_LEVEL_CONFIGURED) === true; },

  // Minimum Lewd Level each gated feature requires. Single source of truth for
  // the behaviour gates; callers use AFLP.Settings.allows("kinks") rather than
  // bare numeric comparisons so the thresholds live in one place.
  LEWD_GATE: {
    hscene:         2,   // H Scene cards / on-screen UI
    arousal:        3,   // arousal tracking & climax
    kinks:          3,   // kink traits & automation
    position:       3,   // position manager / position-aware acts
    noncon:         4,   // non-consensual framing
    struggleSnuggle:4,   // Struggle Snuggle
    sexualAdvance:  4,   // Sexual Advance
    mindBreak:      4,   // Mind Break
    sexualDefeat:   4,   // sexual defeat flow
    npcEdge:        4,   // edge flow applied to NPCs
  },
  /** True if the current Lewd Level permits `feature` (see LEWD_GATE). */
  allows(feature) {
    return this.lewdLevel >= (this.LEWD_GATE[feature] ?? 0);
  },
  get stressAsArousal()      { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.STRESS_AS_AROUSAL) ?? false; },
  get carnalFrame()          { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CARNAL_FRAME) ?? "default"; },
  get dualityLabels()        { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.DUALITY_LABELS) ?? "hope-fear"; },
  get proseFlavor()          { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.PROSE_FLAVOR); },
  get hsceneEnabled()        { return AFLP.Settings.allows("hscene") && game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_ENABLED); },
  get hsceneLogToChat()      { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_LOG_TO_CHAT); },
  get sceneReportVisibility(){ return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.SCENE_REPORT_VIS) ?? "public"; },
  get positionTracking()     { return AFLP.Settings.allows("position") && game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.POSITION_TRACKING); },
  get cumHoleFromPosition()  { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CUM_HOLE_FROM_POSITION) ?? false; },
  get gangbangAutoAssign()   { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.GANGBANG_AUTO_ASSIGN); },

  get cumVolumeMode()        { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CUM_VOLUME_MODE); },
  get pregnancyStacking()    { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.PREGNANCY_STACKING) === true; },
  /** ml per unit of cum — 250 (fantasy) or 4 (realistic) */
  get cumUnitMl()            {
    return AFLP.Settings.cumVolumeMode === "realistic" ? 4 : 250;
  },

  get cumflationEnabled()    { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CUMFLATION_ENABLED); },
  /** Show cumflation pip bars section on the sheet */
  get cumflationTracking()   { return AFLP.Settings.cumflationEnabled && game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CUMFLATION_TRACKING); },
  /** Show ml Given / ml Received columns in lifetime totals */
  get cumflationMl()         { return AFLP.Settings.cumflationEnabled && game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CUMFLATION_ML); },
  /** Apply cumflation tiers when cum macro fires */
  get cumflationInHscene()   { return AFLP.Settings.cumflationEnabled && game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CUMFLATION_HSCENE); },
  get splatterEnabled()      { return AFLP.Settings.cumflationEnabled && game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.SPLATTER_ENABLED); },
  get splatterIntensity()    { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.SPLATTER_INTENSITY) ?? 1.0; },
  get cardFontBoost()        { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CARD_FONT_BOOST) ?? false; },
  get splatterIncludeNpc()   { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.SPLATTER_INCLUDE_NPC) ?? true; },
  get splatterColor()        { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.SPLATTER_COLOR) ?? "#f2efe6"; },
  get splatterHideLocal()    { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.SPLATTER_HIDE_LOCAL) ?? false; },
  get splatterQuality()      { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.SPLATTER_QUALITY) ?? "medium"; },
  get voiceEnabled()         { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.VOICE_ENABLED) === true; },
  get voiceFolder()          { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.VOICE_FOLDER) ?? ""; },
  get voiceVolume()          { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.VOICE_VOLUME) ?? 0.8; },
  get voiceMuteLocal()       { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.VOICE_MUTE_LOCAL) ?? false; },
  get sfxEnabled()           { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.SFX_ENABLED) === true; },
  get sfxVolume()            { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.SFX_VOLUME) ?? 0.7; },
  get titlesAutomation()     { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.TITLES_AUTOMATION); },
  get titlesShow()           { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.TITLES_SHOW); },
  get edgeAuto()             { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.EDGE_AUTO); },
  get edgeSkipDialog()       { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.EDGE_SKIP_DIALOG); },
  get edgeIncludeNpc()       { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.EDGE_INCLUDE_NPC); },
  get showWelcome()          { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.SHOW_WELCOME); },
  get infiniteCum()          { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.INFINITE_CUM); },
  get hsceneTheme()          { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_THEME) ?? "aflp-classic"; },
  get hsceneThemePc()        { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_THEME_PC) ?? "aflp-classic"; },
  get hsceneThemeMon()       { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_THEME_MON) ?? "fuckamons"; },
  get hscenePlayerPick()     { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_PLAYER_PICK) ?? true; },
  get hsceneArousalStyle()   { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_AROUSAL) ?? "auto"; },
  get hsceneDossierFx()      { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_DOSSIER_FX) ?? false; },
};

// ───────────────────────────────────────────────────────────────────────────
// Daggerheart core-UI duality relabel (Virtue / Lust)
// When dhDualityLabels is "virtue-lust" in a Daggerheart world, override the
// SYSTEM's own i18n labels so the Fear tracker, sheet headings, settings, and
// duality roll readout read Virtue / Lust. The system is fully i18n-driven for
// these labels, so this is a clean, supported override. Runs at i18nInit before
// any UI renders; this file is imported during the "init" hook, so the handler
// registers in time. Display-only and reversible by reload. Scoped to exact
// "Hope"/"Fear" labels plus a small allowlist of multi-word labels, so ability
// and rules PROSE that merely mentions Hope/Fear is left untouched. Compendium
// content (feature names/descriptions) is system data, not i18n, and is out of
// scope by design.
function _aflpApplyDualityI18n() {
  try {
    if (game.system?.id !== "daggerheart") return;
    if (game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.DUALITY_LABELS) !== "virtue-lust") return;
    const tr = game.i18n?.translations;
    const D  = tr?.DAGGERHEART;
    if (!D) return;

    // 1) Exact-label pass: a value that is exactly "Hope"/"Fear" (the resource
    //    name, the in-chat roll outcome, countdown/automation labels, and the
    //    roll readout) flips cleanly. Sentences never match, so prose stays put.
    const walk = (obj) => {
      for (const k in obj) {
        const v = obj[k];
        if (typeof v === "string") {
          if (v === "Hope") obj[k] = "Virtue";
          else if (v === "Fear") obj[k] = "Lust";
        } else if (v && typeof v === "object") walk(v);
      }
    };
    walk(D);

    // 2) Multi-word labels: explicit key -> value, applied only if the key still
    //    exists, so a future system rename fails gracefully (never injects a
    //    stray key). Hope -> Virtue, Fear -> Lust within each label.
    const swaps = {
      "DAGGERHEART.APPLICATIONS.TagTeamSelect.FIELDS.initiator.cost.label": "Virtue Cost",
      "DAGGERHEART.APPLICATIONS.TagTeamSelect.hopeCost":                    "Virtue Cost",
      "DAGGERHEART.CONFIG.Triggers.hopeRoll.label":                        "Virtue Roll",
      "DAGGERHEART.CONFIG.Triggers.fearRoll.label":                        "Lust Roll",
      "DAGGERHEART.SETTINGS.Appearance.FIELDS.displayFear.label":          "Display Lust",
      "DAGGERHEART.SETTINGS.Automation.FIELDS.hopeFear.label":             "Virtue & Lust",
      "DAGGERHEART.SETTINGS.Homebrew.FIELDS.maxFear.label":                "Max Lust",
      "DAGGERHEART.SETTINGS.Homebrew.FIELDS.maxHope.label":                "Max Virtue",
      "DAGGERHEART.ITEMS.Class.hopeFeatures":                              "Virtue Features",
      "DAGGERHEART.ACTORS.Character.defaultHopeDice":                      "Default Virtue Dice",
      "DAGGERHEART.ACTORS.Character.defaultFearDice":                      "Default Lust Dice",
    };
    for (const [key, val] of Object.entries(swaps)) {
      if (foundry.utils.getProperty(tr, key) !== undefined) foundry.utils.setProperty(tr, key, val);
    }
    console.log("AFLP | Daggerheart duality labels relabeled to Virtue/Lust");
  } catch (e) { console.warn("AFLP | duality i18n relabel failed", e); }
}
Hooks.once("i18nInit", _aflpApplyDualityI18n);
