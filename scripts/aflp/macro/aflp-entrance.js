// AFLR - Entrance
// PF2e / AFLP.
//
// Applies Entranced to your target, with YOU as the entrancer.
//
// Use this from any feat, spell, or effect whose text says a creature "becomes
// Entranced by you" but which has no automation of its own - Captivating Intensity,
// Reactive Charm, and any Mesmerist spell you rule should take hold.
//
// It stamps the whole contract through AFLP.entrance():
//   the Entranced condition
//   entrancedBy          so the sink knows whose effects deepen the hold
//   entrancerSignature   so Entranced's -2 (and Hypnotized's -4) saves predicate on YOU
//   hypnoConditionerId   so Hypno Slave conditioning attributes to you
//   mindHoldDC           so Shake Free has a DC to roll against
//
// It refuses to regress a deeper hold: a creature already Hypnotized or Persona
// Overridden is held further down the ladder and is left alone.
//
// Select your token, target theirs.

(async () => {
  const caster = canvas.tokens.controlled[0]?.actor ?? game.user.character;
  if (!caster) { ui.notifications.warn("AFLR | Select your token first."); return; }

  const targets = [...game.user.targets];
  if (!targets.length) { ui.notifications.warn("AFLR | Target the creature you are entrancing."); return; }

  // Your DC, so an ally shaking them free has a number to beat.
  const dc = caster.spellcasting?.contents?.[0]?.statistic?.dc?.value
    ?? caster.system?.attributes?.classDC?.value
    ?? null;

  const took = [], held = [];
  for (const tt of targets) {
    const target = tt.actor;
    if (!target) continue;
    const ok = await AFLP.entrance(caster, target, dc);
    (ok ? took : held).push(target.name);
  }

  const lines = [];
  if (took.length) {
    lines.push(`<p><strong>${took.join(", ")}</strong> ${took.length > 1 ? "are" : "is"} <strong>Entranced</strong> by <strong>${caster.name}</strong>.</p>`);
    lines.push(`<p><em>-2 status to Perception and skill checks, and to saves against ${caster.name}'s Sexual and mental effects. They cannot concentrate on anything that does not target ${caster.name}.</em></p>`);
  }
  if (held.length) {
    lines.push(`<p><strong>${held.join(", ")}</strong> ${held.length > 1 ? "are" : "is"} already held deeper than a trance. Nothing changes.</p>`);
  }

  await ChatMessage.create({
    speaker: { alias: "AFLR" },
    content: `<div class="aflp-chat-card">${lines.join("")}</div>`,
  });
})();
