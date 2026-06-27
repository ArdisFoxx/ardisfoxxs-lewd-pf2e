// ===============================
// AFLP Welcome / Changelog Toast
// ===============================
// Shows on world load when "Show Welcome Message on Load" setting is enabled.
// "Don't show again" unchecks the setting for this client.
// A new version automatically re-enables the setting for all users (via flag check).

const AFLP_WELCOME_VERSION = "8.0.0";
const AFLP_WELCOME_FLAG    = `aflp-welcome-seen-${AFLP_WELCOME_VERSION}`;

Hooks.once("ready", async () => {
  const S = AFLP.Settings;

  // If the user hasn't seen this version yet, re-enable the setting so it shows.
  const seenThisVersion = game.user.getFlag("ardisfoxxs-lewd-pf2e", AFLP_WELCOME_FLAG);
  if (!seenThisVersion) {
    await game.settings.set("ardisfoxxs-lewd-pf2e", S.KEYS.SHOW_WELCOME, true);
    await game.user.setFlag("ardisfoxxs-lewd-pf2e", AFLP_WELCOME_FLAG, true);
  }

  if (!S.showWelcome) return;

  await new Promise(r => setTimeout(r, 1500));
  aflpShowWelcome();
});

async function aflpShowWelcome() {
  const S = AFLP.Settings;
  const spURL     = (window.AFLP && AFLP.SOUNDPACK_URL) || "";
  const spLiteURL = (window.AFLP && AFLP.SOUNDPACK_LITE_URL) || "";

  const s = {
    wrap:    'font-family: "Helvetica Neue", Arial, sans-serif; width: 100%; color: #ddd;',
    h2:      'text-align:center; margin:0 0 14px; color:#c9a96e; font-size:17px; font-weight:600; letter-spacing:0.3px;',
    group:   'margin:0 0 14px; padding-top:4px;',
    label:   'font-size:11px; font-weight:700; color:#c9a96e; text-transform:uppercase; letter-spacing:0.8px; margin:0 0 6px; padding-bottom:3px; border-bottom:1px solid #c9a96e33;',
    ul:      'margin:0; padding-left:16px; font-size:12px; line-height:1.8;',
    hr:      'border:none; border-top:1px solid #c9a96e44; margin:14px 0;',
    promo:   'display:flex; gap:12px; align-items:center;',
    promoTx: 'font-size:12px; line-height:1.65;',
    note:    'background:rgba(201,169,110,0.08); border:1px solid rgba(201,169,110,0.25); border-radius:5px; padding:8px 12px; font-size:12px; line-height:1.65; color:#c9a96e; margin-bottom:14px;',
  };

  const content = `
<div style="${s.wrap}">
  <div style="text-align:center; margin-bottom:14px;">
    <img src="modules/ardisfoxxs-lewd-pf2e/assets/Lewd%20Tokens/AFLP_Banner.jpg"
         style="width:100%; max-height:130px; object-fit:cover; border-radius:6px; border:1px solid #c9a96e;" alt="AFLP"/>
  </div>

  <h2 style="${s.h2}">What's New in AFLR 8.0.0</h2>

  <div style="${s.group}">
    <div style="${s.label}">AFLR Now Runs on Daggerheart</div>
    <ul style="${s.ul}">
      <li><strong>One module, two systems</strong> - The full Carnal H-Scene toolkit - arousal, positions, cumflation, kinks, pregnancy, voices, and live visuals - now runs natively on <strong>Daggerheart</strong> alongside Pathfinder 2e.</li>
      <li><strong>Built for duality</strong> - Daggerheart-native Carnal actions resolve on Hope and Fear with the duality dice, and AFLR's conditions map to their Daggerheart equivalents so it feels like part of the system, not bolted on.</li>
      <li><strong>Lewd Levels</strong> - A Session Zero dial sets how far your table takes it, from background flavour to a full Defeat-mod frame.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">The Carnal Action Set</div>
    <ul style="${s.ul}">
      <li><strong>Four clean actions</strong> - <strong>Carnal Press</strong>, <strong>Resist</strong>, <strong>Rescue</strong>, and <strong>Escape</strong> give both sides a clear turn structure with duality outcome tables and plain-language conditions, no system jargon to memorise.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Cum, Loads &amp; the Flood</div>
    <ul style="${s.ul}">
      <li><strong>Two small numbers</strong> - Cum is how much you shoot per climax (set by size); Loads is how many times you can cum before a rest. No more unwieldy four-digit volumes.</li>
      <li><strong>Big creatures shoot big</strong> - A hole holds 8; anything past that floods the floor. How far it spreads is set simply by the shooter's size, from a puddle at its feet to a gargantuan tide reaching Far range.</li>
      <li><strong>Bottle the mess</strong> - Floor-cum mops up into Vials of Cum with the Cum Rag macro, and a big enough flood fills a whole stack.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Transformation</div>
    <ul style="${s.ul}">
      <li><strong>Reshape a body</strong> - New spells, consumables, and cursed gear swap or add genitalia, force a heat, or brand a bull - some voluntary, some very much not.</li>
      <li><strong>Adversaries that remake you</strong> - New foes can transform those they defeat, with Bad Ends to match.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">New Content</div>
    <ul style="${s.ul}">
      <li><strong>Adversaries across every tier</strong>, topped by the gargantuan <strong>Brimstone Brood-Wyrm</strong>, a 24-per-shot apex that floods the battlefield.</li>
      <li><strong>New bondage gear, loot, and consumables</strong> - living restraints, Cum boosters, and tonics that play directly off the new Cum and Loads rules.</li>
      <li><strong>New domain cards</strong>, including the <strong>Skyclad</strong> and <strong>Bimbomancy</strong> archetypes.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">AFLR Soundpack Lite - Free Companion Module</div>
    <ul style="${s.ul}">
      <li><strong>Ships separately, free</strong> - Voice and SFX audio lives in its own module so the main download stays small. The recommended <strong>AFLR Soundpack Lite</strong> is a curated, lightweight pick that covers the full feature set. Install and enable it alongside AFLP to turn audio on. AFLP works fine without it.</li>
      <li><strong>What is inside</strong> - A hand-picked set of voice profiles (female, male, and monster) plus the categorised ambient-SFX the engine uses, auto-detected by AFLP once enabled (no path setup). You can also point AFLP at your own extra folder to add custom profiles.</li>
      <li><strong>Want more sounds?</strong> - The full <strong>AFLR Soundpack</strong> bundles every voice actor and the complete SFX library (a much larger download). Install it instead of Lite and AFLP uses it automatically.</li>
      <li><strong>Credits</strong> - All audio is from the <strong>OpenNSFW Sound Pack</strong>, licensed CC BY 4.0. Full contributor credits ship with the soundpack; please contact @OpenNSFWSP rather than individual contributors.</li>
    </ul>
    ${spLiteURL ? `<div style="text-align:center; margin:8px 0 2px;"><a href="${spLiteURL}" target="_blank" rel="noopener" style="display:inline-block; padding:8px 18px; background:#c9a96e; color:#1b1b1b; font-weight:700; font-size:12px; border-radius:5px; text-decoration:none; letter-spacing:0.3px;">Get the AFLR Soundpack Lite</a>${spURL ? `<div style="font-size:10px; opacity:0.7; margin-top:6px;">Want everything? <a href="${spURL}" target="_blank" rel="noopener" style="color:#c9a96e;">Get the full AFLR Soundpack</a></div>` : ``}<div style="font-size:10px; opacity:0.7; margin-top:5px;">Unzip into your Foundry Data/modules folder, restart Foundry, and enable it.</div></div>` : ``}
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Also in 8.0</div>
    <ul style="${s.ul}">
      <li>Adversaries audited and stat-aligned to their tier and role across the bestiary.</li>
      <li>Domain card library cleaned up and de-duplicated, with Pathfinder-isms scrubbed from the Daggerheart cards.</li>
      <li>Assorted fixes and polish across the H-Scene card, cumflation, rest, and daily-prep flows.</li>
    </ul>
  </div>

  <div style="${s.hr}"></div>

  <div style="${s.promo}">
    <img src="modules/ardisfoxxs-lewd-pf2e/assets/Lewd%20Tokens/AFLP_Icon_Square.jpg"
         style="width:58px; height:58px; object-fit:cover; border-radius:6px; border:1px solid #c9a96e; flex-shrink:0;" alt="AFLP Icon"/>
    <div style="${s.promoTx}">
      <strong style="color:#c9a96e;">Support AFLP on SubscribeStar</strong><br/>
      The <strong>AFLP PDF</strong> - a full GM guide for running AFLP campaigns - is available to <strong>$15 Subscribers</strong> at
      <a href="https://subscribestar.adult/ardisfoxxart" target="_blank" style="color:#c9a96e;">ArdisFoxXx on SubscribeStar.adult</a>.
      Your subscription also includes the <strong>AFLP Member Discord</strong> - join the community, share feedback, and help shape future development.
    </div>
  </div>
</div>`;

  await foundry.applications.api.DialogV2.wait({
    window: { title: "Welcome to AFLR!", resizable: true },
    position: { top: 65, left: 493, width: 836 },
    content,
    render(ev, dlg) {
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
    `<strong>Use AFLP monsters from the compendium where possible.</strong> The ${code("aflp-lewd-actors")} compendium has pre-configured monsters with AFLP stats already set. They work with all AFLP macros out of the box.`,
    `<strong>For any other actor, run Token Initialize.</strong> If you drag a monster from the PF2e compendium or create a custom NPC, select its token on the canvas and run ${code("AFLP Token Initialize")} before using any AFLP macros on it.`,
    `<strong>Set genitalia with Token Genital.</strong> After initializing, run ${code("AFLP Token Genital")} to configure what a token has. This affects available actions and cumflation calculations.`,
    `<strong>Session Zero.</strong> Before your first session, agree on a Lewd Level (1 to 4) with your group. Use the <strong>Session Zero Setup</strong> button below to apply the matching Foundry settings in one click.`,
  ])}

  ${hr()}
  ${h("H-Scene Position Picker (new in 6.0)")}
  ${ul([
    `When an H-Scene starts, the GM is prompted to choose roles: who is Dominating, who is Submitting, or <strong>Consensual Sex</strong> (no conditions applied, equal control for all participants).`,
    `The position picker shows all valid positions for the current group size and the top's creature type. In a solo scene (1 top), it shows categorised individual positions. In a group scene (2+ tops), it shows group presets at the top followed by individual categories.`,
    `Selecting a group preset (Spitroast, DP, Airtight, etc.) assigns all tops to their correct slot simultaneously. The GM can confirm or swap slot assignments before applying when auto-assign is off.`,
    `Position descriptions appear under each option in the picker so players can understand what they're choosing without prior knowledge.`,
    `Click any top's position label in the scene card to re-open the picker at any time.`,
  ])}

  ${hr()}
  ${h("For Players: Your Character Sheet")}
  ${ul([
    `Open your character sheet and click the <strong>AFLP tab</strong> (pink heart icon). This is where your arousal pip bar, kinks, pregnancy, sexual stats, and Lovense settings live.`,
    `<strong>Arousal</strong> fills as sexual things happen during play. When it hits max, the Cum macro fires automatically if automation is on.`,
    `<strong>Kinks</strong> are enabled on your character by your GM via the sheet's Edit mode. In view mode, each active kink appears as a link you can click or hover to read its full description.`,
    `<strong>Conditions</strong> like Exposed, Denied, Horny, and Mind Break are applied as items from the ${code("aflp-lewd-items")} compendium. Your GM applies them during play; some trigger automatically from actions and macros.`,
  ])}

  ${hr()}
  ${h("Key Macros")}
  <table style="width:100%;border-collapse:collapse;">
    ${row("AFLP Token Initialize", "First-time setup for any NPC token. Always run this before using other macros on a new actor.")}
    ${row("AFLP Token Genital", "Set what genitalia a token has after initializing.")}
    ${row("AFLP Daily Preparations", "Run at the start of each in-game day. Ticks pregnancies and resets daily stats.")}
    ${row("AFLR Cum", "Manually trigger a cum for the selected token.")}
    ${row("AFLR Carnal Press", "The main H-Scene action (advance arousal). Use this in encounters.")}
    ${row("AFLP Struggle Snuggle", "Sexual grapple action for combat.")}
    ${row("AFLP Purge Cumflation", "Reset cumflation levels on a token.")}
  </table>

  ${hr()}
  ${h("Lovense Toy Integration")}
  ${ul([
    `Click the <strong>🖤 button</strong> on the AFLP tab to open the Lovense settings. First-time users will see the <strong>Setup Wizard</strong>, which detects your setup and recommends the right mode.`,
    `<strong>Lovense Remote Direct</strong> connects directly to the Lovense Remote app on your PC or phone. It requires Foundry to be on HTTPS and sends rich per-event vibration patterns.`,
    `<strong>GIFT (GameInterfaceForToys)</strong> is a free Windows app that works on HTTP Foundry and also supports Chaster digital chastity penalties.`,
    `After setup, use the settings panel to adjust strength ranges and duration for each event, or test any event without triggering it in-game.`,
  ])}

  ${hr()}
  ${h("Common Issues")}
  ${ul([
    `<strong>Macros not working on an NPC?</strong> Run ${code("AFLP Token Initialize")} on its token first.`,
    `<strong>No AFLP tab on a character sheet?</strong> The actor must be owned by a player or you must be GM.`,
    `<strong>Sexual history on NPCs resetting?</strong> Enable <strong>Link Actor Data</strong> in the token settings for recurring NPCs so cumflation and history persist between sessions.`,
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
      { action: "back",  label: "Back to Welcome",       callback: async () => { aflpShowWelcome(); } },
    ],
    close: async () => {},
  });
}

window.aflpShowHowTo = aflpShowHowTo;

// ===============================
// Session Zero Setup Dialog
// ===============================

async function aflpShowSessionZero() {
  if (!game.user.isGM) return ui.notifications.warn("AFLP: Session Zero is for GMs only.");

  const S = AFLP.Settings;
  const ID = "ardisfoxxs-lewd-pf2e";

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
    lewdLevel:        game.settings.get(ID, S.KEYS.LEWD_LEVEL),
  };

  const LEVELS = [
    {
      level: 1, name: "Lewd Level 1: Typical Anime", color: "#8aca8e",
      desc: "You're strictly about the adventure. No H-Scenes, no Arousal system. Sexual items and spells exist but only in self-affecting forms. Monsters will not engage sexually. H-Scene UI not applicable.",
      settings: { automation: false, hscene: false, positionTracking: false, proseFlavor: false, hsceneLogToChat: false, cumVolumeMode: "fantasy", cumflation: false, cumflationHscene: false, edgeAuto: false, edgeSkip: false, edgeNpc: false, titles: false, titlesShow: false, splatterNpc: true },
    },
    {
      level: 2, name: "Lewd Level 2: The Witcher III", color: "#c9a96e",
      desc: "Humanoids may have consensual sex with you. Monsters will not. H-Scenes are tracked with prose. The Arousal Points system is active but Edge and cumflation are off. Uses the <strong>Lewd Lite</strong> scene UI - a clean PF2e-native tracker style with just Arousal tracking.",
      settings: { automation: false, hscene: true, positionTracking: true, proseFlavor: true, hsceneLogToChat: true, cumVolumeMode: "fantasy", cumflation: false, cumflationHscene: false, edgeAuto: false, edgeSkip: false, edgeNpc: false, titles: true, titlesShow: true, splatterNpc: true },
    },
    {
      level: 3, name: "Lewd Level 3: Skyrim with Sexy Mods", color: "#e07090",
      desc: "The full Arousal system is introduced. Kinks, cumflation, and Edge automation all become active. Magic spells may sexually affect you in combat, but physical sex remains consensual and monsters still won't physically engage. Uses the <strong>Lewd Lite</strong> scene UI.",
      settings: { automation: true, hscene: true, positionTracking: true, proseFlavor: true, hsceneLogToChat: true, cumVolumeMode: "fantasy", cumflation: true, cumflationHscene: true, edgeAuto: true, edgeSkip: false, edgeNpc: true, titles: true, titlesShow: true, splatterNpc: true },
    },
    {
      level: 4, name: "Lewd Level 4: Skyrim with Defeat Mods", color: "#c060c0",
      desc: "Monsters may physically have sex with you in combat. Sexual defeat becomes part of the game. NPC Edge automation on; Edge is offered on cum (Cum and Edge buttons) rather than auto-rolled. Full automation. Uses <strong>AFLP Classic</strong> scene UI for PC/NPC scenes and <strong>Fuck a Mon'</strong> for monster targets.",
      settings: { automation: true, hscene: true, positionTracking: true, proseFlavor: true, hsceneLogToChat: true, cumVolumeMode: "fantasy", cumflation: true, cumflationHscene: true, edgeAuto: true, edgeSkip: false, edgeNpc: true, titles: true, titlesShow: true, splatterNpc: true },
    },
  ];

  const card = (lvl) => {
    const isCurrent = (current.lewdLevel != null)
      ? (lvl.level === Number(current.lewdLevel))
      : Object.entries(lvl.settings).every(([k, v]) => current[k] === v);
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
    Select a Lewd Level to apply the recommended Foundry settings for that level. Full guidance is in the <strong>AFLP PDF</strong>. Settings can be adjusted individually in Module Settings afterwards.
  </div>
  ${LEVELS.map(card).join("")}
  <div style="font-size:11px;color:#666;margin-top:10px;">Click a level card to apply it, then close this dialog.</div>
</div>`;

  let applied = null;

  await foundry.applications.api.DialogV2.wait({
    window:   { title: "AFLP Session Zero Setup", resizable: true },
    position: { top: 65, left: 493, width: 836 },
    content,
    buttons: [
      { action: "back",  label: "Back to Welcome", callback: async () => { aflpShowWelcome(); } },
      { action: "close", label: "Done",             default: true, callback: async () => {} },
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
          await game.settings.set(ID, S.KEYS.SPLATTER_INCLUDE_NPC, lvl.settings.splatterNpc);

          // Persist the canonical Lewd Level - the single source of truth that
          // content + behaviour gating reads (and what distinguishes L3 from L4,
          // whose setting bundles are otherwise identical).
          await game.settings.set(ID, S.KEYS.LEWD_LEVEL, level);
          // Mark the level as deliberately configured so upgrade-detection never
          // second-guesses a GM's explicit Session Zero choice.
          await game.settings.set(ID, S.KEYS.LEWD_LEVEL_CONFIGURED, true);

          // Set H-Scene UI defaults based on lewd level
          // Lewd 1-3: Lewd Lite for PC/NPC scenes (no cumflation UI needed)
          // Lewd 4:   AFLP Classic for PC/NPC scenes (full feature set)
          const themePc = level <= 3 ? "lewd-lite" : "aflp-classic";
          await game.settings.set(ID, S.KEYS.HSCENE_THEME_PC,  themePc);
          await game.settings.set(ID, S.KEYS.HSCENE_THEME_MON, "fuckamons");

          applied = level;
          ui.notifications.info(`AFLP: Lewd Level ${level} settings applied.`);

          // A programmatic settings.set does not live-update an already-open
          // Module Settings form, so its checkboxes would still show the old
          // values until reopened. Re-render any open settings window so the
          // applied Lewd Level (edge toggles included) is visible immediately.
          try {
            const open = [
              ...(foundry.applications?.instances?.values?.() ?? []),
              ...Object.values(ui.windows ?? {}),
            ];
            for (const a of open) {
              if (/SettingsConfig/i.test(a?.constructor?.name ?? "")) a.render(false);
            }
          } catch (e) { /* non-fatal cosmetic refresh */ }

          el.querySelectorAll(".aflp-sz-card").forEach(c => {
            const isThis = parseInt(c.dataset.level) === level;
            const thisLvl = LEVELS.find(l => l.level === parseInt(c.dataset.level));
            c.style.background = isThis ? thisLvl.color + "18" : "transparent";
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
