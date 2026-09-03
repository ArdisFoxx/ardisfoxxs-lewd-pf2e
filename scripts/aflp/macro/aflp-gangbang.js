// AFLR - Gangbang. GM-run from a selected troop or horde token.
//
// CROSS-SYSTEM as of 14 Aug 2026. It was Pathfinder-only, and not by design: it
// opened with `system.traits.value.includes("troop")`, a test a Daggerheart horde
// can never pass because DH carries `system.traits` null and says
// `system.type === "horde"` instead. Detection now goes through
// AFLP.isMassCreature, which is the one definition for both.
//
// THE BODY COUNT WAS ALSO WRONG, on Pathfinder, from the day it shipped. It summed
// the SQUARES of every token sharing the base actor:
//
//     const sq = t => (Number(t.document.width) || 1) * (Number(t.document.height) || 1);
//
// Pathfinder prepares every troop-trait actor's token as a 2x2 segment whatever the
// size trait says and whatever is stored, and `pf2e-troops-helper` gives a third
// shape again - so token geometry is ambiguous by design and can never answer this.
// It now asks AFLP.bodyCountOf, which derives Pathfinder's count from the troop's
// own segment rule (HP thirds) and Daggerheart's from the authored horde count,
// halved once the horde has marked half its Hit Points.
//
// HOW THE CATCH RESOLVES IS PER-SYSTEM, because the two systems answer a Carnal
// Press differently and the module already has both answers:
//
//   Pathfinder - each creature rolls a Reflex save against the troop's DC and the
//     macro applies the result, because PF2e front-loads difficulty on the attacker.
//   Daggerheart - each creature is sent a Carnal Press and the TARGET chooses its
//     Approach (Carnal Resist, Push Through or Give In), because that is what the
//     journal says a Press does and AFLP.Carnal.press already routes all six
//     scenarios. The macro does not roll for them and does not pre-apply Submitting.
//
// On Daggerheart the press carries `scenePosition: "gangbang"`, so a landing press
// runs the same multi-hole fill Every Hole at Once uses - mouth, ass and face
// always, plus whatever else that body has, each taking a full load.
(async function () {
  const FLAG = AFLP.FLAG_SCOPE;
  const MID  = "ardisfoxxs-lewd-pf2e";
  const tok  = canvas.tokens.controlled[0];

  if (!tok?.actor || !AFLP.isMassCreature(tok.actor)) {
    ui.notifications.warn("Select the troop or horde token first.");
    return;
  }
  const troop = tok.actor;
  const isDH  = game.system.id === "daggerheart";

  // Never token geometry. See the header.
  const bodies = AFLP.bodyCountOf(troop);

  // Pathfinder rolls a save against a DC; Daggerheart presses against the
  // adversary's own Difficulty, which is a field it already carries.
  const lvl = Number(troop.system?.details?.level?.value) || 1;
  const dcGuess = isDH
    ? (Number(troop.system?.difficulty) || 15)
    : (Number(troop.system?.attributes?.classOrSpellDC?.value)
       || Number(troop.system?.attributes?.spellDC?.value)
       || (14 + lvl));
  const dcLabel = isDH ? "Difficulty" : "DC";

  // DialogV2 - `Dialog` is the removed v1 API.
  const form = await foundry.applications.api.DialogV2.wait({
    window: { title: "Gangbang" },
    content: `<form>
      <div class="form-group"><label>Actions</label>
        <select name="acts"><option value="1">1 action</option><option value="2">2 actions</option><option value="3">3 actions</option></select></div>
      <div class="form-group"><label>Base ${dcLabel}</label><input type="number" name="dc" value="${dcGuess}"/></div>
      <p style="font-size:11px;opacity:.8">Body count this use: <b>${bodies}</b>. ${dcLabel} rises +2 per action beyond the first.</p></form>`,
    buttons: [
      { action: "go", label: "Press", default: true,
        callback: (event, button) => ({
          acts: Number(button.form.elements.acts.value),
          dc:   Number(button.form.elements.dc.value),
        }) },
      { action: "cancel", label: "Cancel", callback: () => null },
    ],
    rejectClose: false,
  });
  if (!form) return;
  const dc = form.dc + 2 * (form.acts - 1);

  // Targets: tokens in or adjacent to any of the troop's squares. Adjacency IS
  // token geometry, and that is correct - it is asking where the bodies are on the
  // map, not how many of them there are.
  const baseId = tok.document.actorId;
  const troopToks = canvas.tokens.placeables.filter(t => t.document.actorId === baseId);
  const gridSize = canvas.grid.size;
  const adjacent = (cand) => {
    for (const tt of troopToks) {
      const dx = Math.abs(cand.center.x - tt.center.x), dy = Math.abs(cand.center.y - tt.center.y);
      const gapX = Math.max(0, dx - (cand.w + tt.w) / 2), gapY = Math.max(0, dy - (cand.h + tt.h) / 2);
      if (Math.max(gapX, gapY) / gridSize <= 1.01) return true;
    }
    return false;
  };
  const targets = canvas.tokens.placeables.filter(t =>
    t.actor && t.document.actorId !== baseId && adjacent(t));
  if (!targets.length) { ui.notifications.info("No creatures in or adjacent to the troop's squares."); return; }

  // ── Daggerheart: press each target and let them answer ────────────────────
  if (isDH) {
    let sent = 0;
    for (const t of targets) {
      try {
        await AFLP.Carnal.press(troop, {
          targetActor: t.actor,
          targetTokenId: t.id,
          sourceTokenId: tok.id,
          sourceName: troop.name,
          dc,
          hsa: true,
          arousal: bodies,               // one Arousal per body, as on Pathfinder
          scenePosition: "gangbang",     // every opening at once, on a landing press
        });
        sent++;
      } catch (e) { console.warn("AFLR | Gangbang press failed for", t.name, e); }
    }
    ui.notifications.info(`Gangbang: ${sent} pressed (Difficulty ${dc}, ${bodies} bodies). Each target chooses their Approach.`);
    return;
  }

  // ── Pathfinder 2e: roll the save for each target ──────────────────────────
  const caught = [];
  for (const t of targets) {
    let degree = 2;
    try {
      const roll = await t.actor.saves.reflex.roll({ dc: { value: dc }, skipDialog: true });
      const total = roll.total;
      const die = roll.dice?.[0]?.total ?? roll.terms?.[0]?.results?.[0]?.result ?? 10;
      degree = total >= dc + 10 ? 3 : total >= dc ? 2 : total >= dc - 10 ? 1 : 0;
      if (die === 20) degree = Math.min(3, degree + 1);
      if (die === 1) degree = Math.max(0, degree - 1);
    } catch (e) { console.warn("AFLR | Gangbang save failed for", t.name, e); continue; }
    if (degree >= 2) continue; // success / crit success

    // Wallbang keys off a target that was ALREADY Stuck Submitting (pinned by a
    // wall or trap) before this Gangbang - captured here before the troop applies
    // its own hold below.
    const wasStuck = AFLP.cond.has(t.actor, "stuck-submitting");

    await AFLP.cond.apply(t.actor, "exposed", 1);
    await AFLP.cond.apply(t.actor, "submitting", 1);
    await AFLP.stuckSubmitting.apply(t.actor, { dc: form.dc, sourceName: troop.name });
    if (degree === 0) await AFLP.cond.apply(t.actor, "restrained", 1);

    let gain = bodies;
    let wbBonus = 0;
    const canWallbang = troop.items.some(i => (i.getFlag?.(MID, "aflrKey") === "wallbang") || /^wallbang$/i.test(i.name || ""));
    if (canWallbang && wasStuck) {
      const af = t.actor.getFlag(FLAG, "anatomyFeatures") ?? {};
      const hasPussy = !!t.actor.getFlag(FLAG, "pussy");
      const hasTits = !!af.tits;
      const holes = 2 + (hasPussy ? 1 : 0);          // mouth + ass + pussy
      const paizuriSlots = hasTits ? (1 + (af["tits-heavy"] ? 1 : 0) + (af["tits-gripping"] ? 1 : 0)) : 0;
      const tongueSlot = af["tongue-long"] ? 1 : 0;
      wbBonus = 2 * holes + 2 + paizuriSlots + tongueSlot; // 2/hole + 2 handjobs + paizuri + tongue
      gain += wbBonus;
    }
    caught.push({ t, gain, wbBonus });
  }

  if (!caught.length) { ui.notifications.info("Everyone resisted the troop."); return; }

  // Open the scene FIRST, then apply arousal - so a target whose arousal maxes
  // resolves through the H-Scene UI rather than the no-scene "run the cum macro"
  // prompt.
  const P = (t) => ({ id: t.id, actorId: t.actor.id, name: t.name, img: t.document.texture?.src, tokenDoc: t.document });
  AFLP.HScene.startTroopScene(P(tok), caught.map(c => P(c.t)));

  for (const c of caught) {
    await AFLP_Arousal.increment(c.t.actor, c.gain, "Gangbang", c.t.id);
    if (c.wbBonus > 0) {
      ChatMessage.create({ speaker: { alias: "AFLR" },
        content: `<div class="aflp-chat-card"><p><strong>Wallbang!</strong> ${troop.name} floods every one of ${c.t.name}'s openings while they're pinned in place - <strong>+${c.wbBonus} bodies</strong> against them (${c.gain} Arousal total).</p></div>` }).catch(() => {});
    }
  }
  await AFLP_Arousal.increment(troop, caught.length, "Gangbang", tok.id);

  ui.notifications.info(`Gangbang: ${caught.length} caught (${AFLP.system?.dcWord ?? "DC"} ${dc}, ${bodies} bodies).`);
})();
