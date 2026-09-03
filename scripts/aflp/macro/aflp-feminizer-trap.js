// AFLR - Feminizer Glyph Trap
// PF2e / AFLP.
//
// Springs the Feminizer Glyph Trap on one creature. Run this when a victim FAILS
// the glyph's Reflex save; a success means they leapt clear and nothing happens,
// so there is nothing to run.
//
// The macro decides nothing itself. It hands the actor to
// AFLP_LivingGear.spring(), which finds the right piece and PUTS IT ON - fitting
// the item fires the ordinary equip path, so the curse, the while-worn grants and
// the purge seal all apply exactly as they would if the gear had been buckled on
// by hand. There is no second copy of that logic here to drift out of step.
//
//   a cock     -> Cock Cage of the Cumdump Femboy
//   a pussy    -> Chastity Harness of the Throat Sleeve Slave
//   both       -> BOTH pieces. They cover different things, so a futa is spared
//                 neither
//   neither    -> the glyph gutters out and says so
//
// The harness brings its built-in Slave Collar, Slave Buttplug and Piercings of
// Vibration with it, and takes them away again if it ever comes off.
//
// Either way a set of Bondage Bikini Armor straps on over the top. That one is
// worn rather than cursed, so it comes off again.

(async () => {
  if (!game.user.isGM) {
    ui.notifications.warn("AFLR | Only the GM can spring the glyph.");
    return;
  }
  if (!window.AFLP_LivingGear?.spring) {
    ui.notifications.error("AFLR | AFLP_LivingGear.spring is unavailable. Is the module fully loaded?");
    return;
  }

  // Selected token first, because the glyph is sprung on whoever stood on it and
  // that is the token the GM has in hand. A target still works, so it does not
  // matter which the GM reaches for.
  const token = canvas.tokens?.controlled?.[0] ?? game.user.targets?.first() ?? null;
  const actor = token?.actor ?? null;
  if (!actor) {
    ui.notifications.warn("AFLR | Select the victim's token (or target them), then run this.");
    return;
  }

  // Unlinked tokens carry their own actor data, so read through token.actor
  // rather than the world actor, or the gear lands on every copy of the NPC.
  const res = await AFLP_LivingGear.spring(actor);
  if (!res) return;

  // `fitted` is a LIST - a body with both a cock and a pussy takes both pieces.
  // An empty array is still truthy, so this checks the length.
  if (!res.fitted?.length) {
    console.log(`AFLP | Feminizer Glyph: nothing to fit on ${res.actor}.`);
    return;
  }
  console.log(`AFLP | Feminizer Glyph: ${res.actor} fitted with ${res.fitted.join(" and ")}${res.extra ? `, plus ${res.extra}` : ""}.`);
})();
