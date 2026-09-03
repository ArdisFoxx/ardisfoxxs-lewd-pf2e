// AFLR - Hypnotic Stare (Mesmerist Dedication, Level 6)
// PF2e / AFLP only.
//
// Dangle a pocket watch, spin a spiral, ensnare a mind. A Deception or Diplomacy
// check against one creature in line of sight:
//   Success       - Entranced, with you as the entrancer. Entranced is AFLR's
//                   replacement for core Fascinated: it carries the same -2 status
//                   penalty to Perception and skill checks and the same
//                   concentrate-action restriction, plus the hypnosis sink rule.
//                   Applying both would double-penalise, so only Entranced lands.
//   Critical       - as success (the skill-scaling target ceiling still applies).
//   Failure        - target immune to your Hypnotic Stare for 1 hour.
//   Critical fail   - immune for 1 week.
// In a situation demanding immediate attention (in combat), you must CRIT to
// perform this at all, and it gains incapacitation.
//
// Skill proficiency sets how many creatures you can target: trained/expert 1,
// expert 4, master 10, legendary any. (Draft: expert 4 / master 10 / legendary
// any - the base allows a single target.)
//
// Feat riders read off the caster's own items, by name (folder "Mesmerist"):
//   Subliminal Seduction (L8) - if present, Hypnotic Stare may be tagged sexual+verbal,
//     and Entranced targets also become Horny 1.
//   Mental Caress (L12)       - passive; noted in the card, applied by the GM to
//     the caster's later mental/illusion spells. No automation here.

(async () => {
  const FLAG = AFLP.FLAG_SCOPE;   // "world" - the scope every AFLR flag uses

  const caster = canvas.tokens.controlled[0]?.actor
    ?? game.user.character
    ?? canvas.tokens.placeables.find(t => t.actor?.hasPlayerOwner && t.actor?.isOwner)?.actor;
  if (!caster) { ui.notifications.warn("AFLR | Select your Mesmerist's token first."); return; }

  const targets = [...game.user.targets];
  if (!targets.length) { ui.notifications.warn("AFLR | Target the creature(s) you want to hypnotize."); return; }

  // Which of the caster's skills, and its proficiency rank (for target scaling).
  const dec = caster.skills?.deception, dip = caster.skills?.diplomacy;
  if (!dec && !dip) { ui.notifications.warn("AFLR | Mesmerist needs Deception or Diplomacy."); return; }
  const useSkill = (dec?.mod ?? -99) >= (dip?.mod ?? -99) ? dec : dip;
  const rank = useSkill?.rank ?? 1;                 // 1 trained, 2 expert, 3 master, 4 legendary
  const cap = rank >= 4 ? Infinity : rank >= 3 ? 10 : rank >= 2 ? 4 : 1;

  if (targets.length > cap) {
    ui.notifications.warn(`AFLR | ${useSkill.label} rank lets you hypnotize ${cap === Infinity ? "any number" : cap} at once; you have ${targets.length} targeted.`);
    return;
  }

  const inCombat = !!game.combat?.started;
  const hasSubliminal = caster.itemTypes.feat.some(f => /^subliminal seduction$/i.test(f.name));
  const hasCaress    = caster.itemTypes.feat.some(f => /^mental caress$/i.test(f.name));
  const sexualTag = hasSubliminal && (await foundry.applications.api.DialogV2.confirm({
    window: { title: "Subliminal Seduction" },
    content: "<p>Weave arousing suggestions into this Hypnotic Stare? (adds the sexual and verbal traits; Entranced targets also become Horny)</p>",
  }).catch(() => false));

  for (const tt of targets) {
    const target = tt.actor;
    if (!target) continue;

    // Per-target immunity from a previous failed Hypnotic Stare by this caster.
    const immuneUntil = target.getFlag(FLAG, `hypnotizeImmune.${caster.id}`) ?? 0;
    if (immuneUntil && game.time.worldTime < immuneUntil) {
      await ChatMessage.create({ speaker: { alias: "AFLR" },
        content: `<div class="aflp-chat-card"><p><strong>${target.name}</strong> is still immune to <strong>${caster.name}</strong>'s Hypnotic Stare.</p></div>` });
      continue;
    }

    const dc = target.saves?.will?.dc?.value ?? (target.system?.attributes?.classDC?.value ?? 20);
    const roll = await useSkill.roll({
      dc: { value: dc, label: "Hypnotic Stare (Will DC)" },
      extraRollOptions: ["action:hypnotize", ...(inCombat ? ["hypnotize:combat"] : []), ...(sexualTag ? ["trait:sexual", "trait:verbal"] : [])],
      createMessage: true,
    });
    const deg = roll?.degreeOfSuccess; // 0 critFail, 1 fail, 2 success, 3 critSuccess

    // In combat the action does nothing but on a crit (incapacitation-style gate).
    const landed = inCombat ? (deg === 3) : (deg >= 2);

    if (landed) {
      // Entranced carries the whole mechanical package now - the -2 status penalty
      // to Perception and skill checks, the concentrate restriction, and the sink
      // rule - so core Fascinated is not applied. Stacking both would double the
      // penalty and leave two conditions to clean up.

      // Open the hypnosis loop: our Entranced, with this caster stamped as the
      // entrancer. Every downstream sink (failed resist, submit, climax at their
      // hands) now deepens Entranced -> Hypnotized -> Hypno Slave for this caster.
      // One helper stamps the whole contract: the condition, entrancedBy,
      // entrancerSignature, hypnoConditionerId and mindHoldDC. It also refuses to
      // regress a deeper hold. Any caller that hand-rolled this forgot something.
      const _casterDC = caster.spellcasting?.contents?.[0]?.statistic?.dc?.value
        ?? caster.system?.attributes?.classDC?.value ?? null;
      await AFLP.entrance(caster, target, _casterDC);

      // Subliminal Seduction: an Entranced target also becomes Horny 1.
      let hornyLine = "";
      if (sexualTag) {
        await AFLP.gm.run("grantHorny", target, 1);
        hornyLine = " and <strong>Horny</strong>";
      }

      await ChatMessage.create({ speaker: { alias: "AFLR" },
        content: `<div class="aflp-chat-card">
          <p><strong>${target.name}</strong> is <strong>Entranced</strong> by <strong>${caster.name}</strong>${hornyLine}.</p>
          <p><em>-2 status to Perception and skill checks; they cannot concentrate on anything but ${caster.name}.</em></p>
          ${deg === 3 ? "<p><em>Critical success.</em></p>" : ""}
          ${hasCaress ? "<p style=\"font-size:11px;color:#a05070\">Mental Caress: your mental/illusion spells against them gain the sexual trait (or shed incapacitation).</p>" : ""}
        </div>` });
    } else {
      // Immunity: 1 hour on a failure, 1 week on a critical failure.
      const dur = deg === 0 ? 604800 : 3600; // seconds
      await AFLP.gm.run("setFlag", target, `hypnotizeImmune.${caster.id}`, game.time.worldTime + dur);
      await ChatMessage.create({ speaker: { alias: "AFLR" },
        content: `<div class="aflp-chat-card">
          <p><strong>${caster.name}</strong>'s Hypnotic Stare slides off <strong>${target.name}</strong>.</p>
          <p><em>Immune to your Hypnotic Stare for ${deg === 0 ? "1 week" : "1 hour"}.</em></p>
          ${inCombat && deg >= 2 ? "<p><em>(In combat you must critically succeed to hypnotize.)</em></p>" : ""}
        </div>` });
    }
  }
})();
