// ===============================
// AFLP Module Settings
// ===============================
// Register all configurable settings for the AFLP module.
// Called from index.js in the "init" hook.
// Settings are ordered by the Lewd Level at which they become relevant.

// Single source of truth for the AFLP Soundpack download link, used by both the
// welcome screen and the settings menu button below. Update the link here only.
AFLP.SOUNDPACK_URL = "https://mega.nz/file/1d5lxbZQ#_jH1AfpTqrP8rddGV94Wrr705RTnRzTtWBtSA6OF_i0";

AFLP.Settings = {

  ID: "ardisfoxxs-lewd-pf2e",

  KEYS: {
    AUTOMATION:          "arousalAutomation",
    PROSE_FLAVOR:        "hsceneProseFlavorLines",
    HSCENE_ENABLED:      "hsceneEnabled",
    CUM_VOLUME_MODE:     "cumVolumeMode",
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

    // ── AFLP Soundpack helpers (shared by the settings menu button, the
    // welcome screen link, and the "audio on but pack missing" notice) ────
    const aflpSoundpackActive = () => !!game.modules?.get?.("aflp-soundpack")?.active;
    const aflpShowSoundpackDialog = () => {
      const url = (window.AFLP && AFLP.SOUNDPACK_URL) || "";
      foundry.applications.api.DialogV2.wait({
        window: { title: "AFLP Soundpack - Free Download" },
        content: `<div style="font-size:13px; line-height:1.6; max-width:480px;">
          <p>The <strong>AFLP Soundpack</strong> is a free companion module containing the voice profiles and ambient SFX used by AFLP's audio features. AFLP runs fine without it - install it to enable voice and SFX.</p>
          <p style="text-align:center; margin:14px 0;">
            <a href="${url}" target="_blank" rel="noopener" style="display:inline-block; padding:8px 18px; background:#c9a96e; color:#1b1b1b; font-weight:700; border-radius:5px; text-decoration:none;">Download the AFLP Soundpack</a>
          </p>
          <p style="margin:0 0 4px;"><strong>To install (one-time):</strong></p>
          <ol style="margin:0 0 10px; padding-left:18px;">
            <li>Download and unzip the file above.</li>
            <li>Move the <code>aflp-soundpack</code> folder into your Foundry <code>Data/modules</code> folder.</li>
            <li>Restart Foundry, then enable <strong>AFLP Soundpack</strong> under Manage Modules.</li>
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
      else ui.notifications?.warn("AFLP: Voice/Ambient SFX is enabled, but the AFLP Soundpack module is not installed or active - there is no audio to play. Open Module Settings and use 'Get the AFLP Soundpack' to download it.", { permanent: true });
      return true;
    };

    // ── AFLP Soundpack download — accessible from module settings ─────────
    const SoundpackLink = class extends foundry.applications.api.ApplicationV2 {
      static DEFAULT_OPTIONS = {
        id: "aflp-soundpack-link",
        window: { title: "Get the AFLP Soundpack" },
      };
      async _renderHTML() { return document.createElement("div"); }
      _replaceHTML(result, content) { content.replaceChildren(result); }
      _onRender() { setTimeout(() => this.close(), 0); aflpShowSoundpackDialog(); }
    };
    game.settings.registerMenu(S.ID, "getSoundpack", {
      name:       "AFLP Soundpack (Audio)",
      label:      "Get the AFLP Soundpack",
      hint:       "Download the free AFLP Soundpack companion module - the voice profiles and ambient SFX used by AFLP's audio. Install and enable it alongside AFLP.",
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
      hint:    "Play per-actor voice clips on climax, Sexual Advance, Struggle Snuggle and cumflation milestones. Assign a profile per actor from the dropdown on their AFLP sheet tab. Voices load from the free AFLP Soundpack module. (No audio plays until the soundpack is installed and a profile is assigned, so leaving this on is harmless if unconfigured.)",
      scope:   "world",
      config:  true,
      type:    Boolean,
      default: true,
      onChange: (v) => { if (v) aflpAudioNeedsSoundpack(true); },
    });

    game.settings.register(S.ID, S.KEYS.VOICE_FOLDER, {
      name:    "Voice Profiles - Extra Custom Folder",
      hint:    "Optional. The shipped soundpack's voice profiles load automatically from the AFLP Soundpack module (modules/aflp-soundpack/aflp-voices). Use this only to add your OWN extra profiles kept in a separate folder. Each subfolder is one profile, with per-event subfolders inside it: <Profile>/moan/1..6 (act vocalisation, 1 soft to 6 peak), plus <Profile>/climax, <Profile>/oral, <Profile>/struggle, <Profile>/cumflation, <Profile>/edge, <Profile>/defeated, <Profile>/mindbreak. A profile here with the same name as a bundled one overrides it.",
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
      hint:    "Layer generic activity sounds (plap for pussy/anal, gluk for oral, etc.) on top of voices, chosen by each actor's current H Scene position. These play even for actors with no voice profile. Files load from the AFLP Soundpack module at modules/aflp-soundpack/aflp-sfx.",
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
  get proseFlavor()          { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.PROSE_FLAVOR); },
  get hsceneEnabled()        { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_ENABLED); },
  get hsceneLogToChat()      { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_LOG_TO_CHAT); },
  get sceneReportVisibility(){ return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.SCENE_REPORT_VIS) ?? "public"; },
  get positionTracking()     { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.POSITION_TRACKING); },
  get cumHoleFromPosition()  { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CUM_HOLE_FROM_POSITION) ?? false; },
  get gangbangAutoAssign()   { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.GANGBANG_AUTO_ASSIGN); },

  get cumVolumeMode()        { return game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CUM_VOLUME_MODE); },
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
