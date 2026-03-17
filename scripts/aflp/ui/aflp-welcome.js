// ===============================
// AFLP Welcome / Changelog Toast
// ===============================
// Shows once per user per version on world load.
// Dismissed flag is stored per-user in game.user.flags.

const AFLP_WELCOME_VERSION = "5.0";
const AFLP_WELCOME_FLAG    = `aflp-welcome-${AFLP_WELCOME_VERSION}`;

Hooks.once("ready", async () => {
  if (game.user.getFlag("ardisfoxxs-lewd-pf2e", AFLP_WELCOME_FLAG)) return;
  await new Promise(r => setTimeout(r, 1500));

  const s = {
    wrap:    'font-family: "Helvetica Neue", Arial, sans-serif; max-width: 600px; color: #ddd;',
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
      Your subscription also includes access to the <strong>AFLP Member Discord</strong> where you can guide the module development, meet fans of the module and organize AFLP play groups in the LFG forum.
    </div>
  </div>
</div>`;

  await foundry.applications.api.DialogV2.wait({
    window: { title: "Welcome - What's New in AFLP 5.0", resizable: true },
    content,
    buttons: [
      {
        action: "dismiss",
        label: "Got it - don't show again",
        default: true,
        callback: async () => {
          await game.user.setFlag("ardisfoxxs-lewd-pf2e", AFLP_WELCOME_FLAG, true);
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
});
