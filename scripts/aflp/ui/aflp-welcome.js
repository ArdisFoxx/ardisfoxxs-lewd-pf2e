// ===============================
// AFLP Welcome / Changelog Toast
// ===============================
// Shows on world load when "Show Welcome Message on Load" setting is enabled.
// "Don't show again" unchecks the setting for this client.
// A new version automatically re-enables the setting for all users (via flag check).

const AFLP_WELCOME_VERSION = "6.2.1";
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

  <h2 style="${s.h2}">What's New in AFLP 6.2.1</h2>

  <div style="${s.group}">
    <div style="${s.label}">H Scene Card - Multi-Pairing</div>
    <ul style="${s.ul}">
      <li><strong>Every pairing tracked separately</strong> - The H scene card now follows who is actually paired with whom on the battlemap. Multiple couples, full gangbangs, and reversals all display correctly at the same time instead of being lumped under one target.</li>
      <li><strong>Personal focus</strong> - Your card focuses the pairing that matters to you, with your own character highlighted. Every other pairing shows as a compact Nearby block - click its Focus control to bring it front and centre on your own card.</li>
      <li><strong>Partner-aware everywhere</strong> - Position prompts, hole tracking, and flavour text all follow the correct partner, even with several pairs going at once.</li>
      <li><strong>Entangled pairs</strong> - Mutual pairings show both sides as equals, each with their own position picker and controls.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Position Dialog - Full Rearchitecture</div>
    <ul style="${s.ul}">
      <li><strong>Unified group position picker</strong> - When starting or joining an H scene, a single dialog now shows all valid sexual positions for the current group rather than each top choosing a hole or action.</li>
      <li><strong>2p categorised picker</strong> - Solo scenes (one top, one bottom) keep the familiar Vaginal / Anal / Oral / Foreplay / Toy category layout, now with full descriptions on every position.</li>
      <li><strong>3p+ group picker</strong> - When a second or third top joins, a Group Positions section appears at the top of the dialog with all presets valid for the current number of tops. Selecting a preset assigns everyone's position simultaneously.</li>
      <li><strong>17 group presets</strong> - Spitroast (Anal/Pussy), Double Penetration, Double Vaginal (DVP), Double Anal - Cowgirl, Double Anal - Piledrive, Missionary + Oral, Missionary Anal + Oral, Airtight, Pile On, Train (Pussy/Anal/Oral), Bukakke, and more. Each is filtered by actor count and whether the target has a pussy.</li>
      <li><strong>Slot assignment confirmation</strong> - When a group preset is selected, the GM sees a confirmation dialog assigning each top to their position, with selects to swap who goes where before applying, so when you Spitroast you can decide which top goes where. In the module settings you can enable position auto-assign if you want to skip this confirmation and just put tops in a default order.</li>
      <li><strong>59 named positions with descriptions</strong> - Every position in the picker shows a one-line description to help players understand what they're choosing, such as <strong>Doggy Piledrive</strong>, a steep above-angle anal position valid for both bipeds and quadrupeds.</li>
      <li><strong>Creature type awareness</strong> - The picker automatically filters positions to only show what's physically viable for the top's body type. Bipeds see their full range; quadrupeds see mounted positions; tentacled creatures see tentacle fills; incorporeal creatures see their unique phasing positions.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Consensual vs Non-Consensual Scene Indicators</div>
    <ul style="${s.ul}">
      <li><strong>Role selection on scene start</strong> - When an H scene begins, the GM is prompted: Attacker is Dominating, Target is Dominating, or <em>No one is Dominating (Consensual Sex)</em>. The third option starts the scene with no Dominating or Submitting conditions applied.</li>
      <li><strong>Visual mode banner</strong> - The H scene card header now shows either <strong>💗 Consensual H Scene in Progress</strong> or <strong>🔒 Noncon H Scene in Progress</strong> at all times, making the nature of the scene immediately visible to the whole table.</li>
      <li><strong>Equal control in consensual scenes</strong> - In a consensual scene, any participant's owner can click their own hole chips and position label, not just the GM. In non-consensual scenes, only the Dominating attacker's owner and the GM have control.</li>
      <li><strong>Voyeurism/Cuck Support</strong> - Tops who have joined a multi-attacker scene but have not yet been assigned a position show as "Watching" rather than the old "Set Position" placeholder, making it clear they're in the scene but on the sidelines for now.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Custom Positions</div>
    <ul style="${s.ul}">
      <li><strong>Manage Custom Positions</strong> - A new button in Module Settings opens a position manager where GMs can add their own positions to the picker. Individual (2p) positions specify hole and creature type; Group positions define actor count and per-slot hole assignments.</li>
      <li>Custom positions are saved as world data and appear immediately alongside built-in options without a restart.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">H Scene UI Themes</div>
    <ul style="${s.ul}">
      <li><strong>Five themes</strong> - Lewd Lite, Status Strip, AFLP Classic, Dossier File, and Fuck a Mon'. All are built on the multi-pairing card above and are selectable from the dropdown on any H scene card.</li>
      <li><strong>Lewd Lite</strong> - Replaces the old Combat UI theme. A clean PF2e-native tracker style for Lewd 1-3. Target row at top, attackers listed below, PF2e-style arousal bar with green/amber/red colouring. No cum tracking - appropriate for games where cumflation isn't active.</li>
      <li><strong>Fuck a Mon' UI</strong> - A new Pokemon-inspired theme for scenes where a monster is the target. Features a battlefield sky-and-grass backdrop, the monster's portrait in a yellow circle, "Gotta Fuck 'Em All!" tagline, a <strong>CUM bar</strong> instead of arousal (showing the monster's current/max cum volume in mL), and a "TRAINERS IN BATTLE" party panel listing all the PCs and their current positions as moves. Drain the monster's cum and capture it! It's super effective!</li>
      <li><strong>Automatic theme switching</strong> - In Module Settings, the GM can set a default theme for PC/NPC scenes and a separate default for monster scenes. When a PC or NPC is the target, it uses the PC/NPC default. When a monster becomes the target, the card automatically switches to the monster theme. The default settings are AFLP Classic / Fuck a Mon'.</li>
      <li><strong>Player theme control</strong> - With "Allow Players to Choose Their Own UI" enabled (the default), each player can change the theme on their own card. When the GM disables this, all players switch to the GM's default and the dropdown on the card is grayed out.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Struggle Escape</div>
    <ul style="${s.ul}">
      <li><strong>Escape and reversal action</strong> - When an actor with Submitting runs the Struggle Snuggle macro inside an active H scene, it enters Escape Mode. Skill check options and DCs are described in the compendium item. A Critical Success against a single Dominator offers a Reversal, which flips just that pairing and hands control to the escapee while the rest of the scene continues uninterrupted.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Fixes</div>
    <ul style="${s.ul}">
      <li>Various fixes and polish across the H scene card, positions, and scene persistence.</li>
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
    window: { title: "Welcome to AFLP!", resizable: true },
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
  ${h("H Scene Position Picker (new in 6.0)")}
  ${ul([
    `When an H scene starts, the GM is prompted to choose roles: who is Dominating, who is Submitting, or <strong>Consensual Sex</strong> (no conditions applied, equal control for all participants).`,
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
    ${row("AFLP Cum", "Manually trigger a cum for the selected token.")}
    ${row("AFLP Sexual Advance", "The main H Scene action. Use this in encounters.")}
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
  };

  const LEVELS = [
    {
      level: 1, name: "Lewd Level 1: Typical Anime", color: "#8aca8e",
      desc: "You're strictly about the adventure. No H Scenes, no Arousal system. Sexual items and spells exist but only in self-affecting forms. Monsters will not engage sexually. H Scene UI not applicable.",
      settings: { automation: false, hscene: false, positionTracking: false, proseFlavor: false, hsceneLogToChat: false, cumVolumeMode: "fantasy", cumflation: false, cumflationHscene: false, edgeAuto: false, edgeSkip: false, edgeNpc: false, titles: false, titlesShow: false },
    },
    {
      level: 2, name: "Lewd Level 2: The Witcher III", color: "#c9a96e",
      desc: "Humanoids may have consensual sex with you. Monsters will not. H Scenes are tracked with prose. The Arousal Points system is active but Edge and cumflation are off. Uses the <strong>Lewd Lite</strong> scene UI - a clean PF2e-native tracker style with just Arousal tracking.",
      settings: { automation: false, hscene: true, positionTracking: true, proseFlavor: true, hsceneLogToChat: true, cumVolumeMode: "fantasy", cumflation: false, cumflationHscene: false, edgeAuto: false, edgeSkip: false, edgeNpc: false, titles: true, titlesShow: true },
    },
    {
      level: 3, name: "Lewd Level 3: Skyrim with Sexy Mods", color: "#e07090",
      desc: "The full Arousal system is introduced. Kinks, cumflation, and Edge automation all become active. Magic spells may sexually affect you in combat, but physical sex remains consensual and monsters still won't physically engage. Uses the <strong>Lewd Lite</strong> scene UI.",
      settings: { automation: true, hscene: true, positionTracking: true, proseFlavor: true, hsceneLogToChat: true, cumVolumeMode: "fantasy", cumflation: true, cumflationHscene: true, edgeAuto: true, edgeSkip: false, edgeNpc: true, titles: true, titlesShow: true },
    },
    {
      level: 4, name: "Lewd Level 4: Skyrim with Defeat Mods", color: "#c060c0",
      desc: "Monsters may physically have sex with you in combat. Sexual defeat becomes part of the game. NPC Edge automation on, Edge rolls without prompting. Full automation, no brakes. Uses <strong>AFLP Classic</strong> scene UI for PC/NPC scenes and <strong>Fuck a Mon'</strong> for monster targets.",
      settings: { automation: true, hscene: true, positionTracking: true, proseFlavor: true, hsceneLogToChat: true, cumVolumeMode: "fantasy", cumflation: true, cumflationHscene: true, edgeAuto: true, edgeSkip: true, edgeNpc: true, titles: true, titlesShow: true },
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

          // Set H scene UI defaults based on lewd level
          // Lewd 1-3: Lewd Lite for PC/NPC scenes (no cumflation UI needed)
          // Lewd 4:   AFLP Classic for PC/NPC scenes (full feature set)
          const themePc = level <= 3 ? "lewd-lite" : "aflp-classic";
          await game.settings.set(ID, S.KEYS.HSCENE_THEME_PC,  themePc);
          await game.settings.set(ID, S.KEYS.HSCENE_THEME_MON, "fuckamons");

          applied = level;
          ui.notifications.info(`AFLP: Lewd Level ${level} settings applied.`);

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
