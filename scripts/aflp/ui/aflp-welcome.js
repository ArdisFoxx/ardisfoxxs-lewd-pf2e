// ===============================
// AFLP Welcome / Changelog Toast
// ===============================
// Shows on world load when "Show Welcome Message on Load" setting is enabled.
// "Don't show again" unchecks the setting for this client.
// A new version automatically re-enables the setting for all users (via flag check).

const AFLP_WELCOME_VERSION = "5.5";
const AFLP_WELCOME_FLAG    = `aflp-welcome-seen-${AFLP_WELCOME_VERSION}`;

Hooks.once("ready", async () => {
  const S = AFLP.Settings;

  // If the user hasn't seen this version yet, re-enable the setting so it shows.
  // This ensures a new version's message always appears once even if suppressed before.
  const seenThisVersion = game.user.getFlag("ardisfoxxs-lewd-pf2e", AFLP_WELCOME_FLAG);
  if (!seenThisVersion) {
    await game.settings.set("ardisfoxxs-lewd-pf2e", S.KEYS.SHOW_WELCOME, true);
    await game.user.setFlag("ardisfoxxs-lewd-pf2e", AFLP_WELCOME_FLAG, true);
  }

  // Check the setting. If disabled, don't show.
  if (!S.showWelcome) return;

  await new Promise(r => setTimeout(r, 1500));
  aflpShowWelcome();
});

async function aflpShowWelcome() {
  const S = AFLP.Settings;

  const s = {
    wrap:    'font-family: "Helvetica Neue", Arial, sans-serif; width: 100%; color: #ddd;',
    h2:      'text-align:center; margin:0 0 14px; color:#c9a96e; font-size:17px; font-weight:600; letter-spacing:0.3px;',
    group:   'margin:0 0 12px; padding-top:4px;',
    label:   'font-size:11px; font-weight:700; color:#c9a96e; text-transform:uppercase; letter-spacing:0.8px; margin:0 0 6px; padding-bottom:3px; border-bottom:1px solid #c9a96e33;',
    ul:      'margin:0; padding-left:16px; font-size:12px; line-height:1.75;',
    hr:      'border:none; border-top:1px solid #c9a96e44; margin:12px 0;',
    promo:   'display:flex; gap:12px; align-items:center;',
    promoTx: 'font-size:12px; line-height:1.65;',
  };

  const content = `
<div style="${s.wrap}">
  <div style="text-align:center; margin-bottom:12px;">
    <img src="modules/ardisfoxxs-lewd-pf2e/assets/Lewd%20Tokens/AFLP_Banner.jpg"
         style="width:100%; max-height:130px; object-fit:cover; border-radius:6px; border:1px solid #c9a96e;" alt="AFLP"/>
  </div>

  <h2 style="${s.h2}">Here's what's new in AFLP version 5.5:</h2>

  <div style="${s.group}">
    <div style="${s.label}">New Archetypes, Feats and Spells</div>
    <ul style="${s.ul}">
      <li><strong>Alcumist Archetype</strong> - 9 feats, 22 Alcumical items (elixirs, tonics, sticky bombs, aphrodisiac charges). Craft using cum volume; Perfect Sample augmentation unlocked with typed monster cum.</li>
      <li><strong>Bimbomancer Archetype</strong> (17 feats) and <strong>Skyclad Idol Archetype</strong> (9 feats + Star of the Show spell) with full automation.</li>
      <li><strong>Armor of Hands</strong> - Three sentient armor variants with an auto-shifting Disposition system (1-5).</li>
      <li><strong>New kinks</strong> - Bimbo, Gangslut (automated per-turn Arousal scaling with Dominator count), Voyeurism.</li>
      <li><strong>New feats</strong> - Ouroboros (self-SS/SA, self-impregnation); Sly Snuggle (Stride + Diplomacy vs Will); Pineapple Diet (Coomer = level).</li>
      <li><strong>New spells</strong> - Temporal Intimacy (Rank 9 time stop); Somnophile's Sleep (Rank 2); Fertile Ground (Rank 3, Fortitude or gain Fertile/Breeder/Brood Sow temporarily).</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Automation</div>
    <ul style="${s.ul}">
      <li><strong>Edge automation</strong> - Arousal max triggers an Edge reaction prompt. Successful Edge writes Denied and fires kink effects downstream.</li>
      <li><strong>Kinks automated</strong> - Brood Sow, Party Animal, Animated Bitchsuit, Gangslut, Creature Fetish, Aphrodisiac Junkie, Cum Slut, Purity.</li>
      <li><strong>Mind Break - Creature Fetish</strong> - GM is prompted to choose a creature type from the active scene attackers when Mind Break is gained. Creature Fetish awarded automatically when it clears.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">H Scene UI</div>
    <ul style="${s.ul}">
      <li><strong>Four themes</strong> - Combat HUD, Status Strip, Porno Scene (new default), Dossier File. Switch per-user from inside the H Scene card. Arousal display (bars/pips) also in the card header.</li>
      <li><strong>Hole tracking</strong> - GM can manually toggle PUSSY, MOUTH, and ASS filled states in Porno Scene. Airlock detection respects manual overrides.</li>
      <li><strong>Persistence and leave</strong> - Scenes survive browser reloads. Per-attacker leave buttons (GM only); deleted or dead tokens auto-leave; last attacker leaving closes the scene.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Scene Report, Stats and Titles</div>
    <ul style="${s.ul}">
      <li><strong>End-of-scene report card</strong> - Posts to chat on scene close (public / player / GM-only, configurable). Shows submitting actor portrait, orgasms, loads per hole, damage taken/dealt, rounds grabbed/restrained/airlocked, and titles earned.</li>
      <li><strong>New title progressions</strong> - Masochist (Pain Curious through Suffering is Joy) and Sadist (Rough Lover through Apex Predator), from lifetime damage tracked during H scenes.</li>
      <li><strong>Title config editor</strong> - Adjust thresholds, rename titles, or add custom ones via Module Settings - Edit Titles.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Messages and System</div>
    <ul style="${s.ul}">
      <li><strong>Custom H scene messages</strong> - All flavor text editable per-world via Module Settings - Edit Messages. Includes 32 cumflation tier messages as defaults (per hole, per tier 1-8).</li>
      <li><strong>Arousal and cum</strong> - Horny permanent/temp split; Denied in arousal bar; cumflation pips clickable; facial cumflation vision effects; cum-to-ground and Vial of Cum options; SA auto-target from H scene.</li>
      <li><strong>Monster updates</strong> - Thundercharger Stallion replaces Centaur Stallion; troop Gangbang reworked to Reflex-save arousal; all Alcumical items audited for correct traits.</li>
      <li><strong>Lovense</strong> - Setup Wizard auto-detects your setup and walks through Direct and GIFT modes, with Chaster integration. Access via the heart button on your AFLP sheet.</li>
      <li><strong>Foundry journal</strong> - "Guide to AFLP" added to the module. Session Zero Setup picks a Lewd Level (1-4) and applies a settings bundle in one click - use the button below.</li>
    </ul>
  </div>


    <div style="${s.hr}"></div>

  <div style="${s.promo}">
    <img src="modules/ardisfoxxs-lewd-pf2e/assets/Lewd%20Tokens/AFLP_Icon_Square.jpg"
         style="width:58px; height:58px; object-fit:cover; border-radius:6px; border:1px solid #c9a96e; flex-shrink:0;" alt="AFLP Icon"/>
    <div style="${s.promoTx}">
      <strong style="color:#c9a96e;">The AFLP PDF</strong> - a full GM guide for running AFLP campaigns.<br/>
      Available to <strong>$15 Subscribers</strong> at
      <a href="https://subscribestar.adult/ardisfoxxart" target="_blank" style="color:#c9a96e;">ArdisFoxXx on SubscribeStar.adult</a>.
      Your subscription also includes access to the <strong>AFLP Member Discord</strong>!<br/>
      Join the community, make friends, organise AFLP campaigns and help guide the module's development.
    </div>
  </div>
</div>`;

  await foundry.applications.api.DialogV2.wait({
    window: { title: "Welcome to AFLP! Otherwise known as...", resizable: true },
    position: { top: 65, left: 493, width: 836 },
    content,
    render(ev, dlg) {
      // Constrain the scrollable content area so the dialog never exceeds the viewport.
      const el = dlg.element ?? dlg;
      const wc = el.querySelector(".window-content") ?? el.querySelector(".dialog-content") ?? el;
      if (wc) {
        wc.style.overflowY = "auto";
        wc.style.maxHeight = "80vh";
        wc.scrollTop = 0;
      }
    },
    buttons: [
      {
        action: "howto",
        label: "📖 How to Use AFLP",
        callback: async () => { aflpShowHowTo(); },
      },
      ...(game.user.isGM ? [{
        action: "sessionzero",
        label: "⚙️ Session Zero Setup",
        callback: async () => { aflpShowSessionZero(); },
      }] : []),
      {
        action: "dismiss",
        label: "Got it - don't show again",
        default: true,
        callback: async () => {
          await game.settings.set("ardisfoxxs-lewd-pf2e", AFLP.Settings.KEYS.SHOW_WELCOME, false);
        },
      },
      {
        action: "later",
        label: "Remind me next session",
        callback: async () => {},
      },
    ],
    close: async () => {},
  });
}

window.aflpShowWelcome = aflpShowWelcome;

// ===============================
// AFLP How to Use Guide
// ===============================
// Opens a scrollable guide dialog. Also accessible from the welcome message.

function aflpShowHowTo() {
  const maxW = "100%";
  const h = (t, s=13) => `<div style="font-size:${s}px;font-weight:700;color:#c9a96e;margin:14px 0 6px;letter-spacing:0.3px;">${t}</div>`;
  const ul = (items) => `<ul style="margin:0;padding-left:18px;">${items.map(i => `<li style="font-size:12px;line-height:1.75;margin-bottom:2px;">${i}</li>`).join("")}</ul>`;
  const hr = () => `<hr style="border:none;border-top:1px solid #c9a96e33;margin:12px 0;"/>`;
  const code = (t) => `<code style="background:#1a1a1a;border:1px solid #c9a96e33;border-radius:3px;padding:1px 5px;font-size:11px;color:#c9a96e;">${t}</code>`;
  const row = (name, desc) => `<tr><td style="padding:4px 10px 4px 0;vertical-align:top;white-space:nowrap;font-size:12px;">${code(name)}</td><td style="padding:4px 0;font-size:12px;color:#ccc;line-height:1.5;">${desc}</td></tr>`;

  const content = `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;color:#ddd;max-width:${maxW};width:${maxW};">

  ${h("For GMs: First-Time Setup")}
  ${ul([
    `<strong>Run Daily Preparations at the start of every in-game day.</strong> The ${code("AFLP Daily Preparations")} macro ticks pregnancies, resets daily stats, and applies overnight effects. Run it before your players join.`,
    `<strong>Use AFLP monsters from the compendium where possible.</strong> The ${code("aflp-lewd-actors")} compendium has 49 pre-configured monsters with AFLP stats already set. They work with all AFLP macros out of the box and can be reflavoured, or their abilities dragged onto other monster statblocks.`,
    `<strong>For any other actor, run Token Initialize.</strong> If you drag a monster from the PF2e compendium or create a custom NPC, select its token on the canvas and run ${code("AFLP Token Initialize")} before using any AFLP macros on it. Skipping this step causes bugs: wrong cum volume, missing stats, macros failing silently.`,
    `<strong>Set genitalia with Token Genital.</strong> After initializing, run ${code("AFLP Token Genital")} to configure what a token has. This affects available actions and cumflation calculations. For creating monsters in bulk, this macro speeds up getting them H Scene ready.`,
    `<strong>Session Zero.</strong> Before your first session, agree on a Lewd Level (1 to 4) with your group. The AFLP PDF has full guidance for each level split into tabletop and Foundry sections. Then use the <strong>Session Zero Setup</strong> button below (or the ${code("AFLP Session Zero")} macro) to apply the matching Foundry settings in one click.`,
  ])}

  ${hr()}
  ${h("For Players: Your Character Sheet")}
  ${ul([
    `Open your character sheet and click the <strong>AFLP tab</strong> (pink heart icon). This is where your arousal pip bar, kinks, pregnancy, sexual stats, and Lovense settings live.`,
    `<strong>Arousal</strong> fills as sexual things happen during play. When it hits max, the Cum macro fires automatically if automation is on.`,
    `<strong>Kinks</strong> are enabled on your character by your GM via the sheet's Edit mode. In view mode, each active kink appears as a link you can click or hover to read its full description. Kinks grow in power automatically as your character levels up, unlocking new passive features at levels 1, 2, 3, 5, and 7 with no extra setup needed.`,
    `<strong>Conditions</strong> like Exposed, Denied, Horny, and Mind Break are applied as items from the ${code("aflp-lewd-items")} compendium. Your GM applies them during play; some trigger automatically from actions and macros.`,
  ])}

  ${hr()}
  ${h("Key Macros")}
  <table style="width:100%;border-collapse:collapse;">
    ${row("AFLP Token Initialize", "First-time setup for any NPC token. Always run this before using other macros on a new actor.")}
    ${row("AFLP Token Genital", "Set what genitalia a token has after initializing.")}
    ${row("AFLP Daily Preparations", "Run at the start of each in-game day. Ticks pregnancies and resets daily stats.")}
    ${row("AFLP Cum", "Manually trigger a cum for the selected token.")}
    ${row("AFLP Sexual Advance", "The main H Scene action. Use this in encounters.")}
    ${row("AFLP Struggle Snuggle", "Sexual grapple action for combat.")}
    ${row("AFLP Purge Cumflation", "Reset cumflation levels on a token.")}
  </table>

  ${hr()}
  ${h("Lovense Toy Integration")}
  ${ul([
    `Click the <strong>🖤 button</strong> on the AFLP tab to open the Lovense settings. First-time users will see the <strong>Setup Wizard</strong>, which detects your setup and recommends the right mode.`,
    `<strong>Lovense Remote Direct</strong> connects directly to the Lovense Remote app on your PC or phone. It requires Foundry to be on HTTPS and sends rich per-event vibration patterns: arousal builds slowly, edging is a deliberate ramp and cut, cumming fires a staccato burst into sustained max. No extra software needed. Chrome shows a one-time "Allow local network access?" prompt. Click Allow..`,
    `<strong>GIFT (GameInterfaceForToys)</strong> is a free Windows app that works on HTTP Foundry and also supports Chaster digital chastity penalties. It requires a special logging browser shortcut (included in GIFT). You must open Foundry through that shortcut every session, not regular Chrome.`,
    `<strong>Both</strong> runs Direct and GIFT together. Direct drives the toy with AFLP's patterns; GIFT handles Chaster time penalties. Requires HTTPS.`,
    `After setup, use the settings panel to adjust strength ranges and duration for each event, or test any event without triggering it in-game. Full setup instructions are in the <strong>AFLP Lovense Setup Guide</strong> on the GitHub repo.`,
  ])}

  ${hr()}
  ${h("Common Issues")}
  ${ul([
    `<strong>Macros not working on an NPC?</strong> Run ${code("AFLP Token Initialize")} on its token first.`,
    `<strong>No AFLP tab on a character sheet?</strong> The actor must be owned by a player or you must be GM. The tab is visible on any owned character, but macros require the token to be initialized first.`,
    `<strong>Sexual history on NPCs resetting?</strong> Unlinked tokens do not save changes back to their actor, which is fine for regular monsters. For recurring NPCs and villains, enable <strong>Link Actor Data</strong> in their token settings so cumflation, conditions, and history persist between sessions.`,
    `<strong>Arousal not automating?</strong> Check Module Settings and confirm Arousal Automation is enabled.`,
  ])}

</div>`;

  foundry.applications.api.DialogV2.wait({
    window: { title: "Getting Started with AFLP", resizable: true },
    position: { top: 65, left: 493, width: 836 },
    content,
    render(ev, dialog) {
      const el = dialog.element;
      const wc = el.closest(".application.dialog")?.querySelector(".window-content") ?? el.parentElement;
      if (wc) { wc.style.overflowY = "auto"; wc.style.maxHeight = "80vh"; wc.scrollTop = 0; }
    },
    buttons: [
      { action: "close", label: "Got it - Close Window", default: true, callback: async () => {} },
      { action: "back", label: "Back to Welcome", callback: async () => { aflpShowWelcome(); } },
    ],
    close: async () => {},
  });
}

// Expose globally so it can be called from macros or other scripts
window.aflpShowHowTo = aflpShowHowTo;

// ===============================
// Session Zero Setup Dialog
// ===============================
// GM-only. Presents Lewd Levels 1-4 with descriptions and applies the
// matching settings bundle in one click. Accessible from the welcome dialog
// or the AFLP Session Zero macro.
// ===============================

async function aflpShowSessionZero() {
  if (!game.user.isGM) return ui.notifications.warn("AFLP: Session Zero is for GMs only.");

  const S = AFLP.Settings;
  const ID = "ardisfoxxs-lewd-pf2e";

  // Current setting values for display
  const current = {
    automation:       game.settings.get(ID, S.KEYS.AUTOMATION),
    hscene:           game.settings.get(ID, S.KEYS.HSCENE_ENABLED),
    positionTracking: game.settings.get(ID, S.KEYS.POSITION_TRACKING),
    proseFlavor:      game.settings.get(ID, S.KEYS.PROSE_FLAVOR),
    hsceneLogToChat:  game.settings.get(ID, S.KEYS.HSCENE_LOG_TO_CHAT),
    cumVolumeMode:    game.settings.get(ID, S.KEYS.CUM_VOLUME_MODE),
    cumflation:       game.settings.get(ID, S.KEYS.CUMFLATION_ENABLED),
    cumflationHscene: game.settings.get(ID, S.KEYS.CUMFLATION_HSCENE),
    edgeAuto:         game.settings.get(ID, S.KEYS.EDGE_AUTO),
    edgeSkip:         game.settings.get(ID, S.KEYS.EDGE_SKIP_DIALOG),
    edgeNpc:          game.settings.get(ID, S.KEYS.EDGE_INCLUDE_NPC),
    titles:           game.settings.get(ID, S.KEYS.TITLES_AUTOMATION),
    titlesShow:       game.settings.get(ID, S.KEYS.TITLES_SHOW),
  };

  // Settings bundles per Lewd Level
  const LEVELS = [
    {
      level: 1,
      name: "Lewd Level 1: Typical Anime",
      color: "#8aca8e",
      desc: "You're strictly about the adventure. Humanoids may be sexy but you won't see anything explicit. No sex acts, no Arousal system, no H Scenes. Sexual items and spells exist but only in self-affecting forms. Monsters are not sexy and will not engage sexually.",
      settings: {
        automation: false, hscene: false, positionTracking: false, proseFlavor: false,
        hsceneLogToChat: false, cumVolumeMode: "fantasy",
        cumflation: false, cumflationHscene: false,
        edgeAuto: false, edgeSkip: false, edgeNpc: false,
        titles: false, titlesShow: false,
      },
    },
    {
      level: 2,
      name: "Lewd Level 2: The Witcher III",
      color: "#c9a96e",
      desc: "Humanoids may have consensual sex with you. Monsters will not. H Scenes are tracked with prose. The Arousal Points system is not used at this level, so Edge and cumflation mechanics are off. A good starting point for most AFLP campaigns.",
      settings: {
        automation: false, hscene: true, positionTracking: true, proseFlavor: true,
        hsceneLogToChat: true, cumVolumeMode: "fantasy",
        cumflation: false, cumflationHscene: false,
        edgeAuto: false, edgeSkip: false, edgeNpc: false,
        titles: true, titlesShow: true,
      },
    },
    {
      level: 3,
      name: "Lewd Level 3: Skyrim with Sexy Mods",
      color: "#e07090",
      desc: "The full Arousal system is introduced. Kinks, cumflation, and Edge automation all become active. Magic spells may sexually affect you in combat, but physical sex remains consensual and monsters still won't physically engage.",
      settings: {
        automation: true, hscene: true, positionTracking: true, proseFlavor: true,
        hsceneLogToChat: true, cumVolumeMode: "fantasy",
        cumflation: true, cumflationHscene: true,
        edgeAuto: true, edgeSkip: false, edgeNpc: true,
        titles: true, titlesShow: true,
      },
    },
    {
      level: 4,
      name: "Lewd Level 4: Skyrim with Defeat Mods",
      color: "#c060c0",
      desc: "Monsters may physically have sex with you in combat. Sexual defeat becomes part of the game. NPC Edge automation on, Edge rolls without prompting. Consensual non-consent with X Cards and safewords enabled. Full automation, no brakes.",
      settings: {
        automation: true, hscene: true, positionTracking: true, proseFlavor: true,
        hsceneLogToChat: true, cumVolumeMode: "fantasy",
        cumflation: true, cumflationHscene: true,
        edgeAuto: true, edgeSkip: true, edgeNpc: true,
        titles: true, titlesShow: true,
      },
    },
  ];

  const card = (lvl) => {
    const isCurrent = Object.entries(lvl.settings).every(([k, v]) => current[k] === v);
    return `
      <div class="aflp-sz-card${isCurrent ? " aflp-sz-current" : ""}" data-level="${lvl.level}"
           style="border:1px solid ${lvl.color}44;border-radius:6px;padding:10px 14px;margin-bottom:8px;
                  cursor:pointer;transition:background 0.15s;background:${isCurrent ? lvl.color + "18" : "transparent"};"
           onmouseover="this.style.background='${lvl.color}18'" onmouseout="this.style.background='${isCurrent ? lvl.color + "18" : "transparent"}'">
        <div style="font-size:13px;font-weight:700;color:${lvl.color};margin-bottom:4px;">${lvl.name}</div>
        <div style="font-size:12px;color:#ccc;line-height:1.6;">${lvl.desc}</div>
        ${isCurrent ? `<div style="font-size:11px;color:${lvl.color};margin-top:6px;font-style:italic;">Currently active</div>` : ""}
      </div>`;
  };

  const content = `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;color:#ddd;width:100%;">
  <div style="font-size:13px;color:#aaa;margin-bottom:14px;line-height:1.6;">
    Select a Lewd Level to apply the recommended Foundry settings for that level. Full guidance for running each level both at the tabletop and in Foundry is in the <strong>AFLP PDF</strong>. Settings can be adjusted individually in Module Settings afterwards.
  </div>
  ${LEVELS.map(card).join("")}
  <div style="font-size:11px;color:#666;margin-top:10px;">
    Click a level card to apply it, then close this dialog.
  </div>
</div>`;

  let applied = null;

  await foundry.applications.api.DialogV2.wait({
    window:   { title: "AFLP Session Zero Setup", resizable: true },
    position: { top: 65, left: 493, width: 836 },
    content,
    buttons: [
      { action: "back",  label: "Back to Welcome", callback: async () => { aflpShowWelcome(); } },
      { action: "close", label: "Done", default: true, callback: async () => {} },
    ],
    close: async () => {},
    render(ev, dlg) {
      const el = dlg.element;
      const wc = el.closest(".application.dialog")?.querySelector(".window-content") ?? el.parentElement;
      if (wc) { wc.style.overflowY = "auto"; wc.style.maxHeight = "80vh"; wc.scrollTop = 0; }

      el.querySelectorAll(".aflp-sz-card").forEach(card => {
        card.addEventListener("click", async () => {
          const level = parseInt(card.dataset.level);
          const lvl   = LEVELS.find(l => l.level === level);
          if (!lvl) return;

          await game.settings.set(ID, S.KEYS.AUTOMATION,          lvl.settings.automation);
          await game.settings.set(ID, S.KEYS.HSCENE_ENABLED,      lvl.settings.hscene);
          await game.settings.set(ID, S.KEYS.POSITION_TRACKING,   lvl.settings.positionTracking);
          await game.settings.set(ID, S.KEYS.PROSE_FLAVOR,        lvl.settings.proseFlavor);
          await game.settings.set(ID, S.KEYS.HSCENE_LOG_TO_CHAT,  lvl.settings.hsceneLogToChat);
          await game.settings.set(ID, S.KEYS.CUM_VOLUME_MODE,     lvl.settings.cumVolumeMode);
          await game.settings.set(ID, S.KEYS.CUMFLATION_ENABLED,  lvl.settings.cumflation);
          await game.settings.set(ID, S.KEYS.CUMFLATION_HSCENE,   lvl.settings.cumflationHscene);
          await game.settings.set(ID, S.KEYS.EDGE_AUTO,           lvl.settings.edgeAuto);
          await game.settings.set(ID, S.KEYS.EDGE_SKIP_DIALOG,    lvl.settings.edgeSkip);
          await game.settings.set(ID, S.KEYS.EDGE_INCLUDE_NPC,    lvl.settings.edgeNpc);
          await game.settings.set(ID, S.KEYS.TITLES_AUTOMATION,   lvl.settings.titles);
          await game.settings.set(ID, S.KEYS.TITLES_SHOW,         lvl.settings.titlesShow);

          applied = level;
          ui.notifications.info(`AFLP: Lewd Level ${level} settings applied.`);

          // Update card highlights
          el.querySelectorAll(".aflp-sz-card").forEach(c => {
            const isThis = parseInt(c.dataset.level) === level;
            const thisLvl = LEVELS.find(l => l.level === parseInt(c.dataset.level));
            c.style.background = isThis ? thisLvl.color + "18" : "transparent";
            // Update "currently active" label
            const existing = c.querySelector(".aflp-sz-active-label");
            if (existing) existing.remove();
            if (isThis) {
              const label = document.createElement("div");
              label.className = "aflp-sz-active-label";
              label.style.cssText = `font-size:11px;color:${thisLvl.color};margin-top:6px;font-style:italic;`;
              label.textContent = "Currently active";
              c.appendChild(label);
            }
          });
        });
      });
    },
  });
}

window.aflpShowSessionZero = aflpShowSessionZero;
