// ===============================
// AFLP Welcome / Changelog Toast
// ===============================
// Shows on world load when "Show Welcome Message on Load" setting is enabled.
// "Don't show again" unchecks the setting for this client.
// A new version automatically re-enables the setting for all users (via flag check).

const AFLP_WELCOME_VERSION = "5.0";
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
    group:   'margin:0 0 10px;',
    label:   'font-size:11px; font-weight:700; color:#c9a96e; text-transform:uppercase; letter-spacing:0.8px; margin:0 0 4px;',
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

  <h2 style="${s.h2}">Welcome to AFLP Version 5.0!</h2>

  <div style="${s.group}">
    <div style="${s.label}">Core Features</div>
    <ul style="${s.ul}">
      <li><strong>Arousal and Horny overhaul</strong> - Horny now tracks temp and permanent values separately. Click pips on the AFLP sheet tab to set Arousal and Horny directly.</li>
      <li><strong>Denied condition</strong> - Integrated into the arousal bar with yellow pip extensions and +/- buttons for in-play adjustment.</li>
      <li><strong>Edge automation</strong> - Prompts to attempt Edge when Arousal maxes out. Configure auto-roll and NPC inclusion in Module Settings.</li>
      <li><strong>Character sheet</strong> - The AFLP tab now shows all stats, kinks, conditions, and arousal in one place. Switching tabs no longer blanks Actions or Spells.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Items</div>
    <ul style="${s.ul}">
      <li><strong>Armor of Hands</strong> - Three new sentient armor variants with a Disposition system (Bonded to In Control) that shifts automatically through play.</li>
      <li><strong>Bitchsuit</strong> - Three new bondage armor variants with per-turn arousal, Edge blocking, and Creature Fetish integration.</li>
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Kinks</div>
    <ul style="${s.ul}">
      <li><strong>Bimbo and Gangslut</strong> - Two new kinks with automated passive effects and level-gated abilities.</li>
      <li><strong>Kink automation</strong> - Creature Fetish, Aphrodisiac Junkie, Cum Slut, and Purity all now have automated passive effects firing during play.</li>
    </ul>
  </div>

  <div style="${s.hr}"></div>

  <div style="${s.promo}">
    <img src="modules/ardisfoxxs-lewd-pf2e/assets/Lewd%20Tokens/AFLP_Icon_Square.jpg"
         style="width:58px; height:58px; object-fit:cover; border-radius:6px; border:1px solid #c9a96e; flex-shrink:0;" alt="AFLP Icon"/>
    <div style="${s.promoTx}">
      <strong style="color:#c9a96e;">AFLP 5.0 is available as a PDF</strong> - a full GM guide for running AFLP campaigns.<br/>
      Available to <strong>$15 Subscribers</strong> at
      <a href="https://subscribestar.adult/ardisfoxxart" target="_blank" style="color:#c9a96e;">ArdisFoxXx on SubscribeStar.adult</a>.
      Your subscription also includes access to the <strong>AFLP Member Discord</strong>! <br/>
	  Join the community, make friends, organise AFLP campaigns and help guide the module's development.
    </div>
  </div>
</div>`;

  await foundry.applications.api.DialogV2.wait({
    window: { title: "Welcome - What's New in AFLP 5.0", resizable: true },
    position: { top: 120, left: 400, width: 836 },
    content,
    buttons: [
      {
        action: "howto",
        label: "📖 How to Use AFLP",
        callback: async () => { aflpShowHowTo(); },
      },
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
    `<strong>Session Zero.</strong> Before your first session, use the Session Zero guide in the AFLP PDF to agree on a Lewd Level (0 to 5) with your players. This sets expectations and determines which AFLP content is on the table.`,
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
    `<strong>Lovense Remote Direct</strong> connects directly to the Lovense Remote app on your PC or phone. It requires Foundry to be on HTTPS and sends rich per-event vibration patterns: arousal builds slowly, edging is a deliberate ramp and cut, cumming fires a staccato burst into sustained max. No extra software needed. Chrome shows a one-time "Allow local network access?" prompt — click Allow.`,
    `<strong>GIFT (GameInterfaceForToys)</strong> is a free Windows app that works on HTTP Foundry and also supports Chaster digital chastity penalties. It requires a special logging browser shortcut (included in GIFT) — you must open Foundry through that shortcut every session, not regular Chrome.`,
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
    position: { top: 80, left: 350, width: 836 },
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
