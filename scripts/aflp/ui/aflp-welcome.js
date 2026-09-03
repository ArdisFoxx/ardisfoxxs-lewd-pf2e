// ===============================
// AFLP Welcome / Changelog Toast
// ===============================
// Shows on world load when "Show Welcome Message on Load" setting is enabled.
// "Don't show again" unchecks the setting for this client.
// A new version automatically re-enables the setting for all users (via flag check).

// Bumped whenever the screen's CONTENT changes, not with the module version.
// It only keys the per-user "seen" flag, so bumping it re-shows the screen once.
// _aflpVersion() reads module.json for the version the heading prints, so the
// two are deliberately independent.
const AFLP_WELCOME_VERSION = "1.2.0";
const AFLP_WELCOME_FLAG    = `aflp-welcome-seen-${AFLP_WELCOME_VERSION}`;

// Module-agnostic identity: the same source ships as AFLR (this module id) and,
// after the fork build rewrites the id, as AFLP. Read the display name and
// version from the running module so neither audience sees the other's name.
// (mod.title is the full "ArdisFoxx's Lewd RPG/PF2e ..." string; it is no longer
// parsed for a display name - see _aflpName below.)
function _aflpMod() {
  return game.modules.get("ardisfoxxs-lewd-pf2e") ?? null;
}
// One name for both forks. AFLP is the PF2e fork of AFLR and the audience knows
// it, so the screen says AFLR in the title and the body regardless of which fork
// is installed. Only the VERSION differs, and that comes from the running module.
// Each fork shows its own banner. The generator rewrites the module ID across
// every file, but not an asset FILENAME - both banners ship in both forks, so the
// choice has to happen at runtime.
//
// It has to key off WHICH MODULE THIS FILE BELONGS TO, not what is installed
// alongside it. A first attempt asked game.modules.get("...-pf2e"), which returns
// the module whether or not it is ENABLED - so a world with AFLP installed but
// switched off still showed the AFLP banner while AFLR was the module running.
// The id below is rewritten by the generator, so each fork asks about itself.
const _MODULE_ID = "ardisfoxxs-lewd-pf2e";
function _bannerFile() {
  return _MODULE_ID === "ardisfoxxs-lewd-pf2e" ? "AFLP_Banner.webp" : "AFLR_Banner.webp";
}

function _aflpName() {
  return "AFLR";
}

// System awareness. The same welcome ships to a PF2e world, a DH world and a 5e
// world, so anything that is true of only one of them has to be gated - a DH
// reader should never be told about archetypes, and a PF2e reader should never
// be told about persona-classes or Tiers.
function _aflpSys() {
  return game.system?.id ?? "";
}
function _isPF2e() { return ["pf2e", "sf2e"].includes(_aflpSys()); }
function _isDH()   { return _aflpSys() === "daggerheart"; }
function _is5e()   { return _aflpSys() === "dnd5e"; }
// Emit html only in the listed systems. `only(["pf2e"], "<li>...</li>")`
function _only(systems, html) {
  const sys = _aflpSys();
  const match = systems.some(x => x === sys
    || (x === "pf2e" && _isPF2e())
    || (x === "dh" && _isDH())
    || (x === "5e" && _is5e()));
  return match ? html : "";
}
// The current system's own words, so shared prose does not have to hedge.
function _sysName() { return _isDH() ? "Daggerheart" : _is5e() ? "D&D 5e" : "Pathfinder 2e"; }
function _defeatWord() { return _isPF2e() ? "Defeated" : "Defeat"; }
function _stageGate() { return _isDH() ? "Tiers 1, 3, and 4" : "levels 1, 5, and 8"; }
function _aflpVersion() {
  return _aflpMod()?.version || AFLP_WELCOME_VERSION;
}

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
  const spURL = (window.AFLP && AFLP.SOUNDPACK_URL) || "";

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

  const NAME   = _aflpName();
  const VER    = _aflpVersion();
  const SYS    = _sysName();
  // DEFEAT and STAGES were the evergreen section's only consumers, and that
  // section's climax-rule and kink-ladder bullets moved into the per-system
  // release block on 11 Aug 2026, which states each system's own words directly.
  // The helpers stay because they are the right way to say these things if a
  // shared sentence ever needs them again - and because _defeatWord() answers
  // "Defeat" on 5e, which is Daggerheart's word, so anything reusing it there
  // needs fixing first.
  const only   = _only;
  const content = `
<div style="${s.wrap}">
  <!-- Both banners are 1024x259. Sizing by ASPECT RATIO rather than a pixel
       max-height means the whole image always shows, at any dialog width - a
       fixed 130px box cropped the bottom ~8% and only happened to fit at one
       particular width. contain over cover so it can never crop even if the
       art proportions change later. -->
  <div style="text-align:center; margin-bottom:14px;">
    <img src="modules/ardisfoxxs-lewd-pf2e/assets/Lewd%20Tokens/${_bannerFile()}"
         style="width:100%; aspect-ratio:1024/259; object-fit:contain; display:block; border-radius:6px; border:1px solid #c9a96e;" alt="${NAME}"/>
  </div>

  <h2 style="${s.h2}">Welcome to ${NAME} ${VER}</h2>

  <div style="${s.note}">An adult (18+) supplement, expanding your game with sexual game mechanics: arousal, positions, cumflation, kinks, transformation, pregnancy, spells, creatures and loot, with built-in audio visuals for H-Scenes. Set your table's comfort level with the Lewd Levels dial in Session Zero.</div>

  <div style="${s.group}">
    <div style="${s.label}">${_isDH() ? "How AFLR works" : _is5e() ? "Where 5e stands" : "What has changed since 7.0.0"}</div>
    <ul style="${s.ul}">
      ${only(["pf2e"], `<li><strong>The climax rule changed.</strong> Finish while <strong>Submitting</strong> and you are <strong>Defeated</strong>, no Dominator required - so anything that imposes Submitting, a spell included, can now put you down. Any other climax makes you <strong>Horny</strong> instead, max 3, and <strong>Horny no longer clears when you cum</strong> - it clears at daily preparations. Sexual Advance's default Arousal gain is lower than it was, so handing PCs Horny through effects, monster abilities and items is how a GM builds pressure across the adventuring day.</li>`)}
      ${only(["pf2e"], `<li><strong>Submitting and Dominating grant no Arousal by themselves.</strong> They are scene roles now. Every point of Arousal comes from an action, a condition or an effect.</li>`)}
      ${only(["pf2e"], `<li><strong>Cum Volume and Coomer are gone.</strong> The model is <strong>Cum Shot x Loads</strong>: Cum Shot is how much you release per climax, set by size and anatomy, and Loads is how many climaxes you have before a rest. At 0 loads you still climax but produce nothing.</li>`)}
      ${only(["pf2e"], `<li><strong>A new anatomy system.</strong> Cocks, pussies, tits, throats and the ass are customisable parts, each with its own size, its own size gap and its own subtypes: knots, hemipenises, breeder types, ovidepositors, onahole tits, cumfinity ass and more.</li>`)}
      ${only(["pf2e"], `<li><strong>Kinks rebuilt on three beats.</strong> Every kink unlocks Signature, Greater and Mastery at levels 1, 5 and 8, replacing the old per-level lists. New kinks: Bull, Pain Slut and Ouroboros. <strong>Bimbofied and Bullified changed meaning</strong>: Bimbofied used to be a masculine hunk transformation on male-presenting characters, and is now the feminine transformation for all genders, with Bullified as the masculine one for all genders.</li>`)}
      ${only(["pf2e"], `<li><strong>Size Difference.</strong> Every hole has its own size training track on the sheet. A hole trains when something bigger than it fills it and the receiver climaxes: at scene close the track gains pips equal to the largest size gap that hole took during the scene, 1 for Stuffed, 2 for Stretched, 3 for Ruined. Six pips fills a track, granting a permanent body feature - Size Queen, Throat Goat, Gape Glutton - and stepping that hole up a size. Filling every applicable track earns the Size Difference kink.</li>`)}
      ${only(["pf2e"], `<li><strong>Hypnosis.</strong> Entranced deepens to Hypnotized on a failed save against your entrancer or a climax at their hands, and enough conditioning locks in the Hypno Slave kink. The spell Control Release counteracts it and other mental control.</li>`)}
      ${only(["pf2e"], `<li><strong>Exposed reworked.</strong> One token is clothes open or pulled aside; two is near enough naked, which also makes you easier to press.</li>`)}
      ${only(["pf2e"], `<li><strong>The Alcumist, rebuilt.</strong> Versatile vials became <strong>Distillates</strong>, kept through the day rather than lost when the crafting window shuts, and the Cumcraft feats gate what you can make.</li>`)}
      ${only(["pf2e"], `<li><strong>Living bondage.</strong> Restraints grown from mimic-stuff, some disguised as furniture. They fit themselves, cannot be removed without help, and reshape into something worse if the roll to free you critically fails.</li>`)}
      ${only(["pf2e"], `<li><strong>A new interface.</strong> A draggable button bar opens the H-Scene window, the AFLR sheet and a floating status panel. The sheet has Body, Drives and History panes with click-to-set pip bars, and the status panel lists every condition, body feature, kink and training track on a creature.</li>`)}
      ${only(["pf2e"], `<li><strong>Also:</strong> a full guide journal and GM screen, the Lewd Levels dial in Session Zero, and assets down from about 400MB to 40MB with the soundpack from 15GB to under 1GB.</li>`)}

      ${only(["dh"], `<li><strong>This is the Daggerheart beta.</strong> Built from the ground up as a Daggerheart expansion rather than a port of the Pathfinder module. Where the two systems want different answers, AFLR gives different answers.</li>`)}
      ${only(["dh"], `<li><strong>PCs and adversaries are built differently.</strong> The universal sexual actions of the Pathfinder module are replaced by a <strong>Carnal action system</strong> for adversaries, which is how Daggerheart runs an encounter.</li>`)}
      ${only(["dh"], `<li><strong>Start in Session Zero.</strong> The <strong>Lewd Levels</strong> dial, 1 to 4, sets how much of the module is live at your table, from background flavour to full mid-combat mechanics.</li>`)}
      ${only(["dh"], `<li><strong>The button bar.</strong> A small draggable bar with three buttons: the <strong>H-Scene window</strong>, the <strong>AFLR sheet</strong>, and a <strong>floating status panel</strong>. Drag it anywhere; it stays where you put it.</li>`)}
      ${only(["dh"], `<li><strong>The AFLR sheet</strong> is where a character's lewd side lives: <strong>Body</strong> for anatomy and size training, <strong>Drives</strong> for kinks, conditions and titles, and <strong>History</strong> for what has happened to them. Arousal and Horny are click-to-set pip bars at the top.</li>`)}
      ${only(["dh"], `<li><strong>The status panel</strong> reads any creature at a glance - conditions, body features, kinks, training, cumflation - grouped most-permanent-first and hideable band by band.</li>`)}
      ${only(["dh"], `<li><strong>Arousal is the core track.</strong> Carnal actions mark it, and filling it is a climax. <strong>Carnal Press</strong> is the advance, resisted with a reaction roll against the presser's Difficulty; <strong>Carnal Escape</strong> is an action roll to get free.</li>`)}
      ${only(["dh"], `<li><strong>The climax rule.</strong> Climax while <strong>Submitting</strong> and you mark <strong>Defeat</strong>. Any other climax makes you <strong>Horny</strong> instead, to a maximum of 3, and <strong>Horny does not clear when you cum</strong> - it clears on a rest. Submitting and Dominating are scene roles and grant no Arousal by themselves.</li>`)}
      ${only(["dh"], `<li><strong>Anatomy is customisable.</strong> Cocks, pussies, tits, throats and the ass each have their own size, their own size gap and a long list of subtypes - knots, hemipenises, breeder types, ovidepositors, onahole tits, cumfinity ass and more.</li>`)}
      ${only(["dh"], `<li><strong>Kinks unlock in three beats</strong> - Signature, Greater and Mastery - at Tiers 1, 3 and 4.</li>`)}
      ${only(["dh"], `<li><strong>Six persona-classes</strong> with eighteen subclasses, native to Daggerheart and sitting on top of the SRD classes: The Devoted, Predator, Plaything, Seducer, Fiend and Feral.</li>`)}
      ${only(["dh"], `<li><strong>129 lewd domain cards</strong> across every domain, including Dread and Blood from Hope and Fear.</li>`)}
      ${only(["dh"], `<li><strong>Living bondage.</strong> Restraints grown from mimic-stuff, some disguised as furniture. The GM spends a Fear to have a piece take hold of someone, only another creature can get it off them, and a removal roll that fails with Fear reshapes it into something worse.</li>`)}
      ${only(["dh"], `<li><strong>The milk economy.</strong> Rest in a milkmaid harness and it draws you off into one Bottled Milk; a milking station gives two, or three if your tits are Hyper. A station also catches what creatures finish into you, bottling it rather than leaving it on the floor.</li>`)}
      ${only(["dh"], `<li><strong>Roll tables and a loot generator</strong>, plus tiered lewd armor: Bondage Bikini Armor and Carnal Knight Armor at all four tiers.</li>`)}
      ${only(["dh"], `<li><strong>Read the guide journal.</strong> It carries the full rules with an example of play, and the GM screen is the quick reference for the table.</li>`)}

      ${only(["5e"], `<li><strong>Spells, macros and the shared engine are in place.</strong> Conditions, kinks, anatomy and bondage content are still being built, so most of the module will not show up on a 5e sheet yet.</li>`)}
      ${only(["5e"], `<li><strong>Exposed</strong> is expressed as an AC penalty rather than a roll modifier: -2 at one stage, -5 at two.</li>`)}
    </ul>
  </div>

  <div style="${s.group}">
    <div style="${s.label}">Systems</div>
    <ul style="${s.ul}">
      <li>This world is running <strong>${SYS}</strong>. AFLR speaks each system's own rules vocabulary, dice, and conditions rather than porting one ruleset over another.</li>
      <li><strong>Lewd Levels:</strong> a Session Zero setting (1 to 4) that controls how much of the module is active, from background flavour to full mid-combat mechanics.</li>
      <li><strong>Actions:</strong> ${SYS} has its own action set for PCs and adversaries, to kickstart lewd combat scenes.</li>
	  <li><strong>Journal:</strong> A full guide journal details the expanded rules in their entirety, including an example of play.</li>
    </ul>
  </div>

  ${only(["pf2e", "dh"], `
  <div style="${s.group}">
    <div style="${s.label}">Cum and Cumflation</div>
    <ul style="${s.ul}">
      <li><strong>Cum Shot</strong> is how much a creature releases per climax, set by size. <strong>Loads</strong> is how many times it can climax before a rest. The sheet shows loads remaining out of capacity.</li>
      <li>A climax spends no more loads than remain. At <strong>0 loads</strong> a creature still climaxes but produces nothing - no cumflation, no spill, no coating.</li>
      <li>A hole holds 8 units before it overflows; excess spills onto the floor, spreading a distance set by the shooter's size. A Throat (Deepthroat) holds 9.</li>
      <li>Spilled cum can be collected with the Cum Cleaner macro, bottling it as Bottled Cum.</li>
    </ul>
  </div>`)}

  ${only(["pf2e", "dh"], `
  <div style="${s.group}">
    <div style="${s.label}">Kinks, Conditions, and Transformation</div>
    <ul style="${s.ul}">
      <li><strong>Hypnosis:</strong> the Entranced condition deepens to Hypnotized, and enough conditioning locks in the Hypno Slave kink.${_only(["pf2e", "5e"], " The Control Release spell counteracts it and other mental control.")}</li>
      <li><strong>Transformation:</strong> spells, consumables, and cursed gear that add or change genitalia, affect arousal, or apply the Bullified condition. Some creatures transform those they defeat.</li>
      <li><strong>Size Training:</strong> a hole trains when something bigger than it fills it and the receiver climaxes, gaining pips equal to the size gap at scene close. Six pips earns a permanent Body Feature and steps the hole up a size; filling every applicable track earns the Size Difference kink. Tracked on the character sheet.</li>
    </ul>
  </div>`)}

  ${only(["pf2e", "dh"], `
  <div style="${s.group}">
    <div style="${s.label}">Content</div>
    <ul style="${s.ul}">
      <li>Creatures across every tier, from swarms and imps up to gargantuan breeders.</li>
      <li>Bondage gear, loot, and consumables that use the Cum and Loads rules, including living restraints and tonics.</li>
      <li>A spell and item library: sexual spells, genital-type effects, kink items, and transformation gear.</li>
    </ul>
  </div>`)}

  <div style="${s.group}">
    <div style="${s.label}">Audio (Free Soundpack)</div>
    <ul style="${s.ul}">
      <li>Voice and ambient-SFX audio ships in a separate free module, the <strong>AFLR Soundpack</strong>. ${NAME} runs fine without it; the module itself features a basic audio set, but the Soundpack module expands that audio massively.</li>
      <li>Includes voice profiles (female, male, and monster) and the ambient SFX the engine uses, detected automatically once enabled. You can also add your own folder of custom profiles.</li>
      <li>Audio is from the OpenNSFW Sound Pack (CC BY 4.0). Credits ship with the soundpack; contact @OpenNSFWSP rather than individual contributors.</li>
    </ul>
    ${spURL ? `<div style="text-align:center; margin:8px 0 2px;"><a href="${spURL}" target="_blank" rel="noopener" style="display:inline-block; padding:8px 18px; background:#c9a96e; color:#1b1b1b; font-weight:700; font-size:12px; border-radius:5px; text-decoration:none; letter-spacing:0.3px;">Get the AFLR Soundpack</a><div style="font-size:10px; opacity:0.7; margin-top:5px;">Unzip into your Foundry Data/modules folder, restart Foundry, and enable it.</div></div>` : ``}
  </div>

  <div style="${s.hr}"></div>

  <div style="${s.promo}">
    <img src="modules/ardisfoxxs-lewd-pf2e/assets/Lewd%20Tokens/AFLP_Icon_Square.webp"
         style="width:58px; height:58px; object-fit:cover; border-radius:6px; border:1px solid #c9a96e; flex-shrink:0;" alt="${NAME} Icon"/>
    <div style="${s.promoTx}">
      <strong style="color:#c9a96e;">Support development on SubscribeStar</strong><br/>
      A full guide PDF for the PF2e version of the module is available to <strong>$15 Subscribers</strong> at
      <a href="https://subscribestar.adult/ardisfoxxart" target="_blank" style="color:#c9a96e;">ArdisFoxXx on SubscribeStar.adult</a>.
      Your subscription also includes exclusive access to the <strong>Member Discord</strong> - join the community, share feedback, and help shape future development.
    </div>
  </div>
</div>`;

  await foundry.applications.api.DialogV2.wait({
    window: { title: `Welcome to ${NAME}!`, resizable: true },
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
        label: `📖 How to Use ${NAME}`,
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

  ${h("Full System Guide in the Journal")}
  ${ul([
    `<strong>Check out the journal "A Guide to AFLR in PF2e" in the compendium pack for full details on using this module. For a basic guide on core features, see below.</strong>`,
  ])}

  ${hr()}
  ${h("For GMs: First-Time Setup")}
  ${ul([
    `The ${code("AFLP Daily Preparations")} macro ticks pregnancies, resets daily stats, and applies overnight effects. In the PF2e system this relates to the Daily Preparation activity. In Daggerheart and 5e is can be run after a long rest.`,
    `<strong>Use the bundled monsters from the compendium where possible.</strong> The ${code("aflp-lewd-actors")} compendium has pre-configured monsters with their stats already set. They work with all ${_aflpName()} macros out of the box.`,
    `<strong>For any other actor, run Token Initialize.</strong> If you drag a monster from the compendium or create a custom NPC, select its token on the canvas and run Token Initialize before using any ${_aflpName()} macros on it.`,
    `<strong>Set genitalia with Token Genital macro.</strong> After initializing, run ${code("AFLP Token Genital")} to configure what body features a token has. This affects available actions and cumflation calculations.`,
    `<strong>Session Zero.</strong> Before your first session, agree on a Lewd Level (1 to 4) with your group. Use the <strong>Session Zero Setup</strong> button below to apply the matching Foundry settings in one click.`,
  ])}

  ${hr()}
  ${h("H-Scene Position Picker")}
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
    `Open your character sheet and click the <strong>${_aflpName()} tab</strong> (pink heart icon). This is where your arousal pip bar, kinks, pregnancy, sexual stats, and Lovense settings live.`,
    `<strong>Arousal</strong> fills as sexual things happen during play. When it hits max, the Cum macro fires automatically if automation is on.`,
    `<strong>Kinks</strong> are enabled on your character by your GM via the sheet's Edit mode. In view mode, each active kink appears as a link you can click or hover to read its full description.`,
    `<strong>Conditions</strong> like Exposed, Denied, Horny, and Mind Break are applied via the sheet condition manager. If you have condition effects from the ${code("aflp-lewd-items")} compendium applied to your token, running the Token Initialize macro will port them into the condition manager. Your GM can apply conditions to you during play, and some trigger automatically from actions and macros.`,
  ])}

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
    window: { title: `Getting Started with ${_aflpName()}`, resizable: true },
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
