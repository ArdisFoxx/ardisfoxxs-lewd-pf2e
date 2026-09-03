// ===============================
// AFLP Module Settings
// ===============================
// Register all configurable settings for the AFLP module.
// Called from index.js in the "init" hook.
// Settings are ordered by the Lewd Level at which they become relevant.

// Soundpack download link. The AFLR Soundpack is the single free audio companion
// module (voices + ambient SFX). Update here only.
AFLP.SOUNDPACK_URL = "https://github.com/ArdisFoxx/aflr-soundpack";

// Module-agnostic display name: this codebase ships as AFLR (multi-system) and,
// after the fork build rewrites the id, as AFLP (PF2e-only). Resolve the short
// tag from the running module's title so user-facing strings name the right one.
const _aflpModName = () => {
  const t = game.modules?.get?.("ardisfoxxs-lewd-pf2e")?.title;
  const m = t && t.match(/\(([^)]+)\)/);
  return m ? m[1] : (t || "AFLR");
};

AFLP.Settings = {

  ID: "ardisfoxxs-lewd-pf2e",

  KEYS: {
    AUTOMATION:          "arousalAutomation",
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
    STATUS_PANEL_SHEET:  "statusPanelSheet",
    STATUS_PANEL_HUD:    "statusPanelHud",
    STATUS_HIDE_NATIVE:  "statusHideNative",
    CUM_MEASURE:         "cumMeasure",
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
      !!(game.modules?.get?.("aflr-soundpack")?.active ||
         game.modules?.get?.("aflr-soundpack-lite")?.active ||
         game.modules?.get?.("aflp-soundpack")?.active); // legacy id
    const aflpShowSoundpackDialog = () => {
      const url = (window.AFLP && AFLP.SOUNDPACK_URL) || "";
      const name = _aflpModName();
      foundry.applications.api.DialogV2.wait({
        window: { title: "AFLR Soundpack - Free Download" },
        content: `<div style="font-size:13px; line-height:1.6; max-width:480px;">
          <p>Voice and ambient-SFX audio ships in a free companion module, the <strong>AFLR Soundpack</strong>. ${name} runs fine without it - install it to turn audio on.</p>
          <p style="text-align:center; margin:14px 0;">
            <a href="${url}" target="_blank" rel="noopener" style="display:inline-block; padding:8px 18px; background:#c9a96e; color:#1b1b1b; font-weight:700; border-radius:5px; text-decoration:none;">Get the AFLR Soundpack</a>
          </p>
          <p style="margin:0 0 4px;"><strong>To install (one-time):</strong></p>
          <ol style="margin:0 0 10px; padding-left:18px;">
            <li>Download and unzip the file above.</li>
            <li>Move the <code>aflr-soundpack</code> folder into your Foundry <code>Data/modules</code> folder.</li>
            <li>Restart Foundry, then enable <strong>AFLR Soundpack</strong> under Manage Modules.</li>
          </ol>
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
      else ui.notifications?.warn(`${_aflpModName()}: Voice/Ambient SFX is enabled, but the AFLR Soundpack module is not installed or active - there is no audio to play. Open Module Settings and use 'Get the AFLR Soundpack' to download it.`, { permanent: true });
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
      hint:       "Download the free AFLR Soundpack companion module - the voice profiles and ambient SFX used by this module's audio. Install and enable it alongside this module.",
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
      hint:    `Show the ${_aflpModName()} welcome message when the world loads. Uncheck to suppress it. A new version's message will re-enable this automatically.`,
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
      hint:    "The group's agreed content level. Set it with the Lewd Level buttons at the top of these settings, or via Session Zero Setup.",
      scope:   "world",
      config:  false,
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
      hint:    "When enabled (default), the Cum macro skips its hole-selection dialog and uses the hole implied by each cock-having performer's tracked position (e.g. a vaginal position cums in the pussy). When disabled, the hole dialog always appears so you can choose freely. Requires Position Tracking.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    game.settings.register(S.ID, S.KEYS.GANGBANG_AUTO_ASSIGN, {
      name:    "Positions - Auto-Assign Gangbang Slots",
      hint:    "When a group position is selected, automatically assign performers to slots based on their body type. When off, the GM is shown the slot assignments and can confirm or swap them before applying.",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: false,
    });

    // Custom Positions manager launcher (used by the Customization hub below).
    AFLP.Settings._openPositionManager = async () => {
      const { AFLPPositionManager } = await import("./ui/aflp-position-manager.js");
      new AFLPPositionManager().render(true);
    };

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
      hint:    `[Lewd 2+] Show the Titles section on the ${_aflpModName()} character sheet tab (view and edit mode).`,
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
      name:    "Cum Shot - Unit Size",
      hint:    "[Lewd 3+] Sets how much fluid one Cum Shot is. Fantasy: 250 ml per shot (drives Cumflation). Realistic: 4 ml per shot (grounded, Cumflation less pronounced). A creature's Loads is how many shots it can fire before running dry.",
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
      name:    "Cum Shot - Infinite Loads (NPCs)",
      hint:    "When on, an NPC's Loads never deplete - they can keep firing Cum Shots without running dry. Useful for high-intensity encounters where tracking depletion is a chore.",
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
      hint:    `[Lewd 3+] Show the Cumflation pip bars and tier links on the ${_aflpModName()} character sheet tab.`,
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
    });

    game.settings.register(S.ID, S.KEYS.CUMFLATION_ML, {
      name:    "Cumflation - Show Cum Given/Received Lifetime Totals",
      hint:    `[Lewd 3+] Show the Cum Given (ml) and Cum Received (ml) columns in the Lifetime Totals table on the ${_aflpModName()} sheet tab. Requires Cumflation master toggle to be on.`,
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

    game.settings.register(S.ID, "statusPanelEnabled", {
      name:    "Status Effects - Enable (world)",
      hint:    `GM master switch for the ${_aflpModName()} status effect displays (sheet docks, floating HUD, H-scene stacks, and the hide-from-Foundry option). Turn off if another module conflicts with it; everything returns to stock behavior.`,
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
      requiresReload: true,
    });

    game.settings.register(S.ID, S.KEYS.STATUS_PANEL_SHEET, {
      name:    "Status Effects - Hover Beside Character Sheets",
      hint:    `Per-user: cascade the ${_aflpModName()} status effect stack (afflictions, carnal states, drives, roles) down the right side of every open character sheet, floating just outside the window edge, in the hex-tile style.`,
      scope:   "client",
      config:  true,
      type:    Boolean,
      default: true,
      onChange: () => AFLP.StatusPanel?.refreshHud?.(),
    });

    game.settings.register(S.ID, S.KEYS.STATUS_PANEL_HUD, {
      name:    "Status Effects - Floating HUD",
      hint:    "Toggled from the AFLR toolbar's status button. Per-user; drag the window by its handle - position is remembered.",
      scope:   "client",
      config:  false,
      type:    String,
      choices: { off: "Off", on: "Floating window" },
      default: "off",
      onChange: () => AFLP.StatusPanel?.refreshHud?.(),
    });

    game.settings.register(S.ID, "hsceneStatusDock", {
      name:   "H Scene Status Stack (toggle lives on the card)",
      scope:  "client",
      config: false,
      type:   Boolean,
      default: true,
    });

    game.settings.register(S.ID, "statusCustomDefs", {
      name:   "Custom Status Effects (data)",
      scope:  "world",
      config: false,
      type:   Array,
      default: [],
      onChange: () => { AFLP.StatusPanel?.refreshHud?.(); },
    });

    // ── Customization hub ────────────────────────────────────────────────
    // One menu button opening a hub dialog with a row per editor (Positions,
    // Statuses, ...), de-cluttering the settings list. Each row launches the
    // relevant editor.
    game.settings.registerMenu(S.ID, "customizationHub", {
      name:       "Customization",
      label:      "Open Customization",
      hint:       "Custom H-Scene positions, custom status effects, and other editors in one place.",
      icon:       "fa-solid fa-sliders",
      type:       class extends foundry.applications.api.ApplicationV2 {
        render() { AFLP.Settings._openCustomizationHub(); return this; }
      },
      restricted: true,
    });

    game.settings.register(S.ID, "statusGlyphIcons", {
      name:    "Status Effects - Use Glyph Icons",
      hint:    `Per-user: draw the ${_aflpModName()} status panel with its clean built-in colored glyph placeholders (default) instead of each status's compendium art. A consistent, tidy look that also sidesteps missing or placeholder art. Turn off to use the mapped item artwork.`,
      scope:   "client",
      config:  true,
      type:    Boolean,
      default: true,
      onChange: () => {
        try {
          AFLP.StatusPanel?.refreshHud?.();
          AFLP.StatusPanel?.refreshSceneDocks?.();
          AFLP.StatusPanel?.refreshSheetDocks?.();
        } catch (_) {}
        for (const app of foundry.applications.instances?.values?.() ?? []) {
          if (app?.actor?.documentName === "Actor") app.render?.(false);
        }
      },
    });

    game.settings.register(S.ID, "statusHudPos", {
      name:   "Status HUD Position (persist)",
      scope:  "client",
      config: false,
      type:   Object,
      default: null,
    });

    game.settings.register(S.ID, S.KEYS.CUM_MEASURE, {
      name:    "Lifetime Stats - Cum Measure",
      hint:    "How Cum Shot volume is shown in lifetime stats and history. Cum Shots is the underlying unit and never changes; the others are converted for flavour and shift with the Realistic/Fantasy cum volume setting.",
      scope:   "client",
      config:  true,
      type:    String,
      choices: { units: "Cum Shots (units)", ml: "Millilitres", floz: "Fluid Ounces", gal: "Gallons" },
      default: "units",
    });

    game.settings.register(S.ID, S.KEYS.STATUS_HIDE_NATIVE, {
      name:    "Status Effects - Hide From Foundry's Own Displays",
      hint:    `Per-user: stop ${_aflpModName()} conditions and effects (Mind Break, Afterglow, Exposed, Potion of Breeding, Cumflation and the rest) from also appearing in Foundry's native token icons and the system effects panel, so statuses only show in the ${_aflpModName()} displays you enabled above. System-native conditions are untouched. Note: due to how the Daggerheart system handles effects, enabling this in a Daggerheart world hides the native effect-icon panel completely.`,
      scope:   "client",
      config:  true,
      type:    Boolean,
      // Enabled by default: the module ships its own status displays, so showing
      // the same conditions again in Foundry's token icons and effects panel is
      // duplication. Users who want the native displays back can untick it.
      default: true,
      requiresReload: true,
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
      hint:    `Play per-actor voice clips on climax, Sexual Advance, Struggle Snuggle and cumflation milestones. Assign a profile per actor from the dropdown on their ${_aflpModName()} sheet tab. Voices load from the free AFLR Soundpack module. (No audio plays until the soundpack is installed and a profile is assigned, so leaving this on is harmless if unconfigured.)`,
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
      onChange: (v) => { if (v) aflpAudioNeedsSoundpack(true); },
    });

    game.settings.register(S.ID, S.KEYS.VOICE_FOLDER, {
      name:    "Voice Profiles - Extra Custom Folder",
      hint:    "Optional. The shipped soundpack's voice profiles load automatically from the AFLR Soundpack module (modules/aflr-soundpack/aflp-voices; the Lite pack is detected as a fallback). Use this only to add your OWN extra profiles kept in a separate folder. Each subfolder is one profile, with per-event subfolders inside it: <Profile>/climax, <Profile>/advance, <Profile>/struggle, <Profile>/cumflation, plus <Profile>/moan/1..6. A profile here with the same name as a bundled one overrides it.",
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
      hint:    `Per-user: silence all ${_aflpModName()} voice clips for yourself only.`,
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

    // Enhance the Configure Settings window: group AFLR settings under section
    // banners, inject the interactive Lewd Level chooser, and hide the
    // Daggerheart block off-DH. Purely presentational - it reorders and labels
    // the existing rendered controls, it does not change what is registered.
    AFLP.Settings._registerConfigEnhancer(dhOnly, pf2eOnly, dnd5eOnly);
  },

  // ── Configure-Settings UI enhancer ─────────────────────────────────────────
  // Section map: setting KEY -> the section it belongs under, in display order.
  // Keys not listed stay where Foundry places them (should be none for AFLR).
  SECTION_ORDER: [
    ["general",   "General"],
    ["hscene",    "H-Scene"],
    ["positions", "Positions"],
    ["arousal",   "Arousal & Edging"],
    ["cum",       "Cum & Cumflation"],
    ["splatter",  "Cum Splatter"],
    ["pregnancy", "Pregnancy"],
    ["titles",    "Titles"],
    ["status",    "Status Effects"],
    ["voice",     "Audio - Voice"],
    ["sfx",       "Audio - Ambient SFX"],
    ["dh",        "Daggerheart"],
  ],
  _sectionOf(key) {
    const K = AFLP.Settings.KEYS;
    const map = {
      [K.SHOW_WELCOME]: "general", [K.TOOLBAR_MODE]: "general", [K.LEWD_LEVEL]: "general",
      [K.HSCENE_ENABLED]: "hscene", [K.PROSE_FLAVOR]: "hscene", [K.HSCENE_LOG_TO_CHAT]: "hscene",
      [K.SCENE_REPORT_VIS]: "hscene", [K.HSCENE_THEME_PC]: "hscene", [K.HSCENE_THEME_MON]: "hscene",
      [K.HSCENE_PLAYER_PICK]: "hscene", [K.HSCENE_DOSSIER_FX]: "hscene", [K.CARD_FONT_BOOST]: "hscene",
      [K.POSITION_TRACKING]: "positions", [K.CUM_HOLE_FROM_POSITION]: "positions", [K.GANGBANG_AUTO_ASSIGN]: "positions",
      [K.AUTOMATION]: "arousal", [K.EDGE_AUTO]: "arousal", [K.EDGE_INCLUDE_NPC]: "arousal", [K.EDGE_SKIP_DIALOG]: "arousal",
      [K.CUM_VOLUME_MODE]: "cum", [K.INFINITE_CUM]: "cum", [K.CUMFLATION_ENABLED]: "cum",
      [K.CUMFLATION_HSCENE]: "cum", [K.CUMFLATION_TRACKING]: "cum", [K.CUMFLATION_ML]: "cum",
      [K.SPLATTER_ENABLED]: "splatter", [K.SPLATTER_QUALITY]: "splatter", [K.SPLATTER_INTENSITY]: "splatter",
      [K.SPLATTER_INCLUDE_NPC]: "splatter", [K.SPLATTER_COLOR]: "splatter", [K.SPLATTER_HIDE_LOCAL]: "splatter",
      [K.PREGNANCY_STACKING]: "pregnancy",
      [K.TITLES_SHOW]: "titles", [K.TITLES_AUTOMATION]: "titles",
      "statusPanelEnabled": "status", [K.STATUS_PANEL_SHEET]: "status", "statusGlyphIcons": "status", [K.STATUS_HIDE_NATIVE]: "status",
      [K.VOICE_ENABLED]: "voice", [K.VOICE_FOLDER]: "voice", [K.VOICE_VOLUME]: "voice", [K.VOICE_MUTE_LOCAL]: "voice",
      [K.SFX_ENABLED]: "sfx", [K.SFX_VOLUME]: "sfx",
      [K.CARNAL_FRAME]: "dh", [K.DUALITY_LABELS]: "dh",
    };
    return map[key] ?? null;
  },

  // Recommended defaults each Lewd Level applies (content AND presentation).
  // Clicking a level in the chooser writes these as recommended defaults - even
  // settings the user turned off come back on - then the user is free to
  // customize before saving. Presentation (splatter/audio/cumflation) is seeded
  // as a recommended default per level, not a hard content gate. `true`/`false`
  // are booleans; strings are select values.
  LEWD_PRESETS: {
    1: { hsceneEnabled:false, arousalAutomation:false, positionTracking:false,
         cumflationEnabled:false, splatterEnabled:false, voiceEnabled:false, sfxEnabled:false,
         edgeAuto:false },
    2: { hsceneEnabled:true, arousalAutomation:false, positionTracking:false,
         cumflationEnabled:false, splatterEnabled:false, voiceEnabled:true, sfxEnabled:true,
         edgeAuto:false },
    3: { hsceneEnabled:true, arousalAutomation:true, positionTracking:true,
         cumflationEnabled:true, splatterEnabled:true, voiceEnabled:true, sfxEnabled:true,
         edgeAuto:true },
    4: { hsceneEnabled:true, arousalAutomation:true, positionTracking:true,
         cumflationEnabled:true, splatterEnabled:true, voiceEnabled:true, sfxEnabled:true,
         edgeAuto:true },
  },

  _registerConfigEnhancer(dhOnly, pf2eOnly, dnd5eOnly) {
    const S = AFLP.Settings;
    const NS = S.ID;
    Hooks.on("renderSettingsConfig", (app, html) => {
      const root = html instanceof HTMLElement ? html : html?.[0];
      if (!root) return;
      // v14: each setting is a .form-group holding an input named "ns.key";
      // all of a module's settings share one SECTION.tab container. Find our
      // form-groups by the input name prefix.
      const inputs = [...root.querySelectorAll(`[name^="${NS}."]`)];
      if (!inputs.length) return;
      const groups = [];
      const seen = new Set();
      for (const inp of inputs) {
        const g = inp.closest(".form-group");
        if (g && !seen.has(g)) { seen.add(g); groups.push(g); }
      }
      if (!groups.length) return;
      const parent = groups[0].parentElement;
      if (!parent || parent.dataset.aflpEnhanced) return;
      parent.dataset.aflpEnhanced = "1";

      const keyOfGroup = (g) => {
        const inp = g.querySelector(`[name^="${NS}."]`);
        return inp ? inp.getAttribute("name").slice(NS.length + 1) : null;
      };

      // Group rows by section.
      const bySection = new Map();
      for (const g of groups) {
        const key = keyOfGroup(g);
        const sec = key ? S._sectionOf(key) : null;
        if (!sec) continue;
        if (!bySection.has(sec)) bySection.set(sec, []);
        bySection.get(sec).push(g);
      }

      // Rebuild in section order with banner headers. Insert a placeholder at
      // the first group's position FIRST, then move groups into the fragment
      // (moving them out of the DOM would invalidate a live anchor).
      const placeholder = document.createComment("aflp-settings-anchor");
      parent.insertBefore(placeholder, groups[0]);
      const frag = document.createDocumentFragment();
      for (const [secId, title] of S.SECTION_ORDER) {
        const secRows = bySection.get(secId);
        if (!secRows || !secRows.length) continue;
        if (secId === "dh" && !dhOnly) { secRows.forEach(r => r.style.display = "none"); continue; }
        const h = document.createElement("h3");
        h.className = "aflp-settings-banner";
        h.textContent = title;
        h.style.cssText = "margin:14px 0 6px;padding:4px 0 3px;border-bottom:1px solid rgba(200,160,80,0.4);color:#c8a24a;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;";
        frag.append(h);
        if (secId === "general") frag.append(S._buildLewdChooser());
        for (const r of secRows) frag.append(r);
      }
      parent.insertBefore(frag, placeholder);
      placeholder.remove();
    });
  },

  _buildLewdChooser() {
    const S = AFLP.Settings;
    const wrap = document.createElement("div");
    wrap.className = "aflp-lewd-chooser";
    wrap.style.cssText = "margin:6px 0 12px;padding:10px;border:1px solid rgba(200,160,80,0.3);border-radius:6px;background:rgba(40,28,50,0.35);";
    const cur = S.lewdLevel;
    const LABELS = { 1: "Typical Anime", 2: "Witcher III", 3: "Skyrim (Sexy)", 4: "Skyrim (Defeat)" };
    const btns = [1,2,3,4].map(n =>
      `<button type="button" class="aflp-lewd-btn" data-level="${n}" style="flex:1;min-width:0;padding:7px 4px;border:1px solid ${n===cur?"#c8a24a":"rgba(200,160,80,0.3)"};border-radius:5px;background:${n===cur?"rgba(200,160,80,0.22)":"rgba(255,255,255,0.04)"};color:${n===cur?"#f0d68a":"#cabfa6"};cursor:pointer;font-size:11px;line-height:1.25;">
        <strong style="display:block;font-size:15px;">${n}</strong>${LABELS[n]}</button>`).join("");
    wrap.innerHTML = `
      <div style="font-size:11px;color:#a892c0;margin-bottom:7px;">Pick a Lewd Level to apply its recommended defaults to the settings below - toggles update live so you can customize before saving. Content is gated by the level; presentation (splatter, audio, cumflation) is a recommended default you can override.</div>
      <div style="display:flex;gap:6px;">${btns}</div>`;
    // Click applies the preset to the OTHER controls in this open form (no save
    // until the user clicks Save), and sets the Lewd Level select.
    wrap.querySelectorAll(".aflp-lewd-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const lvl = Number(btn.dataset.level);
        S._applyLewdPresetToForm(lvl, wrap.closest("form") ?? document);
        // Repaint button highlight.
        wrap.querySelectorAll(".aflp-lewd-btn").forEach(b => {
          const on = Number(b.dataset.level) === lvl;
          b.style.borderColor = on ? "#c8a24a" : "rgba(200,160,80,0.3)";
          b.style.background = on ? "rgba(200,160,80,0.22)" : "rgba(255,255,255,0.04)";
          b.style.color = on ? "#f0d68a" : "#cabfa6";
        });
      });
    });
    return wrap;
  },

  // Write a level's recommended defaults into the OPEN settings form's controls
  // (does not persist; the user still clicks Save). Also sets the Lewd Level
  // select so the number matches.
  _applyLewdPresetToForm(level, formEl) {
    const S = AFLP.Settings;
    const NS = S.ID;
    const preset = S.LEWD_PRESETS[level] ?? {};
    const setControl = (key, value) => {
      const el = formEl.querySelector(`[name="${NS}.${key}"]`);
      if (!el) return;
      if (el.type === "checkbox") { el.checked = !!value; }
      else { el.value = String(value); }
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    for (const [key, value] of Object.entries(preset)) setControl(key, value);
    // The Lewd Level number has no form control anymore (the chooser replaced
    // its dropdown), so persist it directly - it is a world setting that gates
    // features at runtime and is safe to apply immediately. The recommended
    // toggle defaults above stay unsaved in the form for the user to tweak.
    try {
      game.settings.set(NS, S.KEYS.LEWD_LEVEL, level);
      game.settings.set(NS, S.KEYS.LEWD_LEVEL_CONFIGURED, true);
    } catch (_) {}
  },

  // Customization hub: a small dialog with a launcher per editor.
  async _openCustomizationHub() {
    const rows = [
      { label: "Custom Positions", hint: "Add your own positions to the H-Scene position picker.",
        run: () => AFLP.Settings._openPositionManager?.() },
      { label: "Custom Status Effects", hint: "Map your own effect or condition items to status-panel rows by UUID.",
        run: () => AFLP.StatusPanel?.openCustomEditor?.() },
    ];
    const body = rows.map((r, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 2px;border-bottom:1px solid rgba(200,160,80,0.2);">
        <div><div style="color:#e8c46a;font-size:13px;">${r.label}</div>
          <div style="color:#8f7fb0;font-size:11px;margin-top:1px;">${r.hint}</div></div>
        <button type="button" class="aflp-hub-open" data-idx="${i}" style="flex:0 0 auto;padding:5px 12px;">Open</button>
      </div>`).join("");
    await foundry.applications.api.DialogV2.wait({
      window: { title: "AFLR Customization" },
      position: { width: 460 },
      content: `<div style="padding:2px 2px 6px;">${body}</div>`,
      buttons: [{ action: "close", label: "Close", default: true }],
      render: (ev, dlg) => {
        dlg.element.querySelectorAll(".aflp-hub-open").forEach(b => {
          b.addEventListener("click", () => { rows[Number(b.dataset.idx)]?.run?.(); dlg.close(); });
        });
      },
    }, { classes: ["aflp-dialog"] });
  },


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
  get carnalFrame()          { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CARNAL_FRAME) ?? "default"; },
  get dualityLabels()        { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.DUALITY_LABELS) ?? "hope-fear"; },
  get proseFlavor()          { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.PROSE_FLAVOR); },
  get hsceneEnabled()        { return AFLP.Settings.allows("hscene") && game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_ENABLED); },
  get hsceneLogToChat()      { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_LOG_TO_CHAT); },
  get sceneReportVisibility(){ return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.SCENE_REPORT_VIS) ?? "public"; },
  get positionTracking()     { return AFLP.Settings.allows("position") && game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.POSITION_TRACKING); },
  get cumHoleFromPosition()  { try { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CUM_HOLE_FROM_POSITION) !== false; } catch { return true; } },
  get gangbangAutoAssign()   { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.GANGBANG_AUTO_ASSIGN); },

  get cumVolumeMode()        { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CUM_VOLUME_MODE); },
  get pregnancyStacking()    { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.PREGNANCY_STACKING) === true; },
  /** ml per unit of cum — 250 (fantasy) or 4 (realistic) */
  get cumMeasureMode()       { try { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CUM_MEASURE) ?? "units"; } catch { return "units"; } },
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
  get statusPanelSheet()     { try { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.STATUS_PANEL_SHEET) !== false; } catch { return true; } },
  get statusPanelHud()       { try { const v = game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.STATUS_PANEL_HUD) ?? "off"; return v === "off" ? "off" : "on"; } catch { return "off"; } },
  get statusHideNative()     { try { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.STATUS_HIDE_NATIVE) === true; } catch { return false; } },
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
  get hsceneDossierFx()      { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_DOSSIER_FX) ?? false; },
};

// ───────────────────────────────────────────────────────────────────────────
// Daggerheart core-UI duality relabel (Virtue / Lust)
// When dhDualityLabels is "virtue-lust" in a Daggerheart world, override the
// SYSTEM's own i18n labels so the Fear tracker, sheet headings, settings, and
// duality roll readout read Virtue / Lust. The system is fully i18n-driven for
// these labels, so this is a clean, supported override. Runs at i18nInit if the
// settings have registered by then and at setup/ready if they have not - see the
// hook wiring at the bottom. Display-only and reversible by reload. Scoped to exact
// "Hope"/"Fear" labels plus a small allowlist of multi-word labels, so ability
// and rules PROSE that merely mentions Hope/Fear is left untouched. Compendium
// content (feature names/descriptions) is system data, not i18n, and is out of
// scope by design.
// Reads the setting only if it has actually been REGISTERED on this client.
// `game.settings.get` throws "is not a registered game setting" otherwise, and
// that is a race we lose on some seats - see the hook wiring at the bottom.
// Returns null for "cannot know yet", which is not the same as "hope-fear".
function _aflpDualityMode() {
  const key = `${AFLP.Settings.ID}.${AFLP.Settings.KEYS.DUALITY_LABELS}`;
  if (!game.settings?.settings?.has(key)) return null;
  return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.DUALITY_LABELS);
}

let _aflpDualityDone = false;

// Returns TRUE when the question is settled (relabelled, or decided not to) and
// FALSE when it could not be answered yet, so the caller can retry later.
function _aflpApplyDualityI18n() {
  try {
    if (_aflpDualityDone) return true;
    if (game.system?.id !== "daggerheart") { _aflpDualityDone = true; return true; }
    const mode = _aflpDualityMode();
    if (mode === null) return false;                       // registration has not run here yet
    _aflpDualityDone = true;
    if (mode !== "virtue-lust") return true;
    const tr = game.i18n?.translations;
    const D  = tr?.DAGGERHEART;
    if (!D) return true;

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
    return true;
  } catch (e) { console.warn("AFLP | duality i18n relabel failed", e); return true; }
}

// AFLR registers its settings inside an ASYNC `init` handler - index.js does
// `await import("./schema.js")` and two more imports before calling
// `AFLP.Settings.register()` - and Foundry does not await hook handlers. So on a
// client where those imports resolve slowly, i18nInit wins the race and the
// setting does not exist yet. That threw "ardisfoxxs-lewd-pf2e.dhDualityLabels is
// not a registered game setting" on every player login (31 Aug 2026) and the
// relabel then never happened at all. Retry at setup, then ready; both are
// before any sheet or tracker renders, and the translations table is read
// lazily by game.i18n.localize at render time.
// STALE IF: settings registration moves onto a synchronous init path (then the
// first call always wins and the retries are dead code), or Foundry starts
// awaiting async hook handlers.
Hooks.once("i18nInit", () => {
  if (_aflpApplyDualityI18n()) return;
  Hooks.once("setup", () => {
    if (_aflpApplyDualityI18n()) return;
    Hooks.once("ready", _aflpApplyDualityI18n);
  });
});
