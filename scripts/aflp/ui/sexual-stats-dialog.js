// ============================================
// AFLP Sexual Stats & Pregnancy UI (World Actor Version)
// ============================================
//
// DO NOT DELETE THIS FILE. It has no user-facing entry point and it is still
// load-bearing. Those two facts together are why this warning exists.
//
// The `AFLR Sexual Stats` macro that used to open this dialog was retired on
// 7 August 2026 - it predated the sheet system, which now shows the same numbers.
// Nothing in the shipped code opens the dialog any more, so a sweep for dead UI
// will find this file unreferenced as UI and it looks safe to remove. It is not.
//
// `AFLP.UI.SexualStatsDialog` is the read/write layer for an actor's lifetime
// sexual stats, and `aflp-cum.js` uses it as a DATA object rather than a dialog -
// 21 call sites. It constructs one per resolution, calls `.load()`, mutates
// `.sexual.lifetime` (mlReceived, cumReceived, per-hole counts, gangbang), and
// writes the result back through the batched `flags.world.sexual` update at the
// end of the macro. `cumflation.js` `applyCumflation` takes the same object as its
// `sexualStatsDialog` parameter and mutates it in place.
//
// Deleting this file, or trimming the class down to "just the dialog parts",
// breaks every cum resolution in the module and does it silently - the mutations
// would land on nothing and the lifetime totals would simply stop moving.
//
// If the data layer is ever worth separating from the dialog, that is a real
// refactor: move `.sexual` load/mutate/save into schema.js and repoint all 21
// call sites first. Do not start by deleting.

if (!window.AFLP) throw new Error("AFLP schema not loaded");
if (!window.AFLP_Pregnancy) window.AFLP_Pregnancy = {};
if (!window.AFLP.UI) window.AFLP.UI = {};
if (!window.AFLP.Macros) window.AFLP.Macros = {};

// ===============================
// AFLP Pregnancy Helper (world actor persistence)
// ===============================
window.AFLP_Pregnancy = {

  getPregnancies: actor => actor.getWorldActor?.()?.getFlag(AFLP.FLAG_SCOPE, "pregnancy") ?? actor.getFlag(AFLP.FLAG_SCOPE, "pregnancy") ?? {},

  addPregnancy: async (actor, { partner, method = "vaginal", gestationTotal = 30, offspring = 1, deliveryType = "live" }) => {
    const worldActor = actor.getWorldActor?.() ?? actor;
    await AFLP.ensureCoreFlags(worldActor);
    const pregnancies = (await worldActor.getFlag(AFLP.FLAG_SCOPE, "pregnancy")) ?? {};
    const id = foundry.utils.randomID();
    pregnancies[id] = {
      sourceUuid: partner?.uuid ?? "",
      sourceName: partner?.name || "Unknown",
      gestationTotal,
      gestationRemaining: gestationTotal,
      offspring,
      deliveryType,
      method,
      startedAt: game.time.worldTime
    };
    await worldActor.setFlag(AFLP.FLAG_SCOPE, "pregnancy", pregnancies);

    // Lifetime counters behind the breeding titles. Neither was ever written:
    // timesImpregnated existed only as a default of 0 (so baby-maker,
    // brood-mother and perpetually-pregnant could never award) and maxLitterSize
    // was never recorded at all (litter-bearer). System-agnostic - every system
    // reaches this path.
    try {
      const sx = structuredClone(worldActor.getFlag(AFLP.FLAG_SCOPE, "sexual") ?? {});
      sx.lifetime = sx.lifetime ?? {};
      sx.lifetime.timesImpregnated = (sx.lifetime.timesImpregnated ?? 0) + 1;
      sx.lifetime.maxLitterSize = Math.max(sx.lifetime.maxLitterSize ?? 0, Number(offspring) || 0);
      // Monster Mommy: carried a pregnancy from a monster/creature source. A
      // monster is any non-player-owned actor that is not a PC. The old check
      // gated on type === "npc", which is right for PF2e/5e but MISSES Daggerheart,
      // where monsters are type "adversary" - so DH breeders never counted. Test
      // the general shape instead: not a character, and not player-owned.
      if (partner && partner.type !== "character" && !partner.hasPlayerOwner) {
        sx.lifetime.hasMonsterPregnancy = true;
      }
      // Flag the active scene so The Hookup (no-pregnancy encounters) can tell a
      // pregnancy happened this scene and skip the increment at close.
      try {
        const sc = globalThis.AFLP?.HScene?.sceneForActor?.(worldActor.id);
        if (sc) sc._pregnancyThisScene = true;
      } catch (e) { /* non-fatal */ }
      await worldActor.setFlag(AFLP.FLAG_SCOPE, "sexual", sx);
      globalThis.AFLP_Titles?.checkAndAward?.(worldActor)?.catch?.(() => {});
      // Top-side credit: the partner bred this actor. Only a real actor gets
      // credited (some callers pass a plain descriptor object with no id/flags).
      // System-agnostic - every system reaches addPregnancy. offspringSired
      // counts the whole litter; partnersBred counts the pregnancy.
      const breeder = partner?.getWorldActor?.() ?? (partner?.id ? partner : null);
      if (breeder && typeof breeder.getFlag === "function" && breeder.id !== worldActor.id) {
        await AFLP.bumpLifetime(breeder, "partnersBred", 1);
        await AFLP.bumpLifetime(breeder, "offspringSired", Number(offspring) || 0);
      }
    } catch (e) { console.warn("AFLP | pregnancy lifetime counters:", e?.message); }

    // Brood Sow: apply Endurance (unlimited duration) on becoming pregnant
    if (AFLP.Settings.automation && AFLP.Kinks?.applyBroodSowEndurance) {
      await AFLP.Kinks.applyBroodSowEndurance(worldActor);
    }

    return { id, ...pregnancies[id] };
  },

  // Live-young gestation scales with the SIRE's size (per the AFLR pregnancy
  // rules / journal): Large or smaller -> 30 days, Huge -> 70, Gargantuan or
  // larger -> 90. Egg clutches keep their own fixed laying term. Cross-system:
  // Daggerheart stores system.size as a word; PF2e uses system.traits.size.value.
  _youngGestation: (sireActor) => {
    const sys = sireActor?.system ?? {};
    const raw = String(sys.size ?? sys.traits?.size?.value ?? "").toLowerCase();
    if (/garg|grg/.test(raw)) return 90;
    if (/huge/.test(raw))     return 70;
    return 30;
  },

  // ── Effective Fertility (staged 0-3) ─────────────────────────────────────
  // One truth for every breeding reader. Raw fertility is the HIGHEST of:
  // the "breeding" condition value (absent = the implicit default 1; present
  // without a value = legacy potion semantics, treated as 3), the anatomy
  // stage (Breeder genitals 3, Fertile genitals 2, from the depositing cock
  // types and the bearer's own pussy), and 3 while a Potion of Breeding
  // effect is present. Birth Control subtracts one per stage (a legacy
  // valueless birth-control condition counts as 3, preserving the old
  // absolute block), floored at 0.
  // Stages: 0 no pregnancy ever / 1 normal Brood Roll / 2 DC -2 /
  // 3 no roll, occupancy gate overridden, gestation shortened.
  //
  // BOTH MATES FEED THIS, which is what the Fertility card says: "The highest
  // Fertility between the two mates governs the roll. Birth Control on either mate
  // reduces the roll's effective Fertility by its value, to a minimum of 0."
  //
  // Before 14 Aug 2026 only the BEARER's conditions were read. The sire's anatomy
  // arrived through `cockTypes` and nothing else about them did, so a sire's own
  // Fertility condition, their Potion of Breeding and - the reason Ardis raised it -
  // their BIRTH CONTROL were all ignored. A sire on contraception bred normally.
  //
  // BOTH SIDES USE MAX, deliberately and symmetrically: the highest Fertility
  // governs, and the highest Birth Control reduces. The card's "on either mate"
  // does not say what happens when both are covered; summing two stage-1 Birth
  // Controls would take a Fertility-3 pairing to 1 where each alone leaves 2, which
  // reads as a stacking rule the card does not state. FLAG FOR REDLINE if the
  // intent is additive.
  //
  // `partner` is optional and the shape is unchanged without it, so a caller that
  // only knows one actor - the sheet's own display - still gets that actor's view.
  effectiveFertility: (actor, { cockTypes = {}, hasPotion = false, partner = null } = {}) => {
    // The Potion of Breeding says "You count as Fertility 3 while this effect
    // lasts", so it has to be visible for the PARTNER too, not just for whoever
    // the caller happened to check. Asked by aflrKey rather than by uuid: a DH or
    // 5e copy of the effect resolves to a different uuid and carries no slug.
    const _potion = (a) => {
      try {
        return !!a?.items?.some?.(i =>
          AFLP.itemHasKey?.(i, "potion-of-breeding-effect") ||
          AFLP.itemHasKey?.(i, "potion-of-breeding-effect-permanent"));
      } catch (e) { return false; }
    };
    // One mate's contribution to the raw stage. cockTypes belongs to whoever is
    // depositing and is folded in once, at the top.
    const _rawOf = (a, potion) => {
      if (!a) return 0;
      const gen = a.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {};
      const condVal = Number(AFLP.cond?.value?.(a, "breeding") ?? 0);
      // Absent means the implicit default 1; present-without-a-value is legacy
      // potion semantics and means 3.
      const condStage = condVal > 0 ? condVal : (AFLP.cond?.has?.(a, "breeding") ? 3 : 1);
      const anatomyStage =
        (gen["pussy-breeder"] || gen["ass-breeder"] || gen["cock-breeder"]) ? 3 :
        (gen["pussy-fertile"] || gen["ass-fertile"] || gen["cock-fertile"]) ? 2 : 0;
      return Math.max(condStage, anatomyStage, potion ? 3 : 0);
    };
    // A legacy valueless birth-control condition counts as 3, preserving the old
    // absolute block.
    const _bcOf = (a) => {
      if (!a) return 0;
      const v = Number(AFLP.cond?.value?.(a, "birth-control") ?? 0);
      return v > 0 ? v : (AFLP.cond?.has?.(a, "birth-control") ? 3 : 0);
    };

    const cockStage =
      (cockTypes["cock-breeder"]) ? 3 :
      (cockTypes["cock-fertile"]) ? 2 : 0;
    const raw = Math.max(1,
      _rawOf(actor, hasPotion || _potion(actor)),
      _rawOf(partner, _potion(partner)),
      cockStage);
    const bc = Math.max(_bcOf(actor), _bcOf(partner));
    return { stage: Math.max(0, raw - bc), raw, bc };
  },

  attemptImpregnation: async (targetActor, sourceActor, cockTypes, hasPotionOfBreeding) => {
    // Staged fertility model: compute the effective stage once and route every
    // decision through it. Stage 0 (Birth Control at or above raw Fertility)
    // blocks the pregnancy outright - the load has already deposited upstream;
    // only the Brood Roll / impregnation is cancelled.
    const eff = AFLP_Pregnancy.effectiveFertility(targetActor, {
      cockTypes: cockTypes ?? {}, hasPotion: !!hasPotionOfBreeding,
      partner: sourceActor ?? null,     // both mates govern - see effectiveFertility
    });
    if (eff.stage <= 0) {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: targetActor }),
        content: `<em>${targetActor.name} is protected by birth control - no pregnancy takes.</em>`,
      });
      return null;
    }
    // Fertility 3 overrides the occupancy gate (and shortens gestation below),
    // so the bearer can take a new pregnancy while already carrying.
    const breeding = eff.stage >= 3;

    // Occupancy gate (uniform across every game system): a bearer already
    // carrying an active pregnancy takes no new one unless Pregnancy Stacking is
    // enabled or breeding overrides it. The cum has already deposited upstream -
    // this blocks only a NEW pregnancy, not the load itself. "Active" matches the
    // cum macro: a numeric gestation still counting down.
    if (!AFLP.Settings?.pregnancyStacking && !breeding) {
      const existing = AFLP_Pregnancy.getPregnancies?.(targetActor) ?? {};
      const active = Object.values(existing).filter(p =>
        p && typeof p.gestationRemaining === "number" && p.gestationRemaining > 0
      );
      if (active.length) {
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: targetActor }),
          content: `<em>${targetActor.name} is already carrying - no new pregnancy takes.</em>`,
        });
        return null;
      }
    }
    return AFLP_Pregnancy._broodRollImpregnation(targetActor, sourceActor, cockTypes ?? {}, eff.stage);
  },

  // Brood Roll - the shared breeding resolution for every system. The depositor's
  // cock and the bearer's pussy both feed in (the more prolific feature wins). The
  // roll itself is delegated to AFLP.system.rollBrood(dc) so each system rolls
  // natively (pf2e d20, Daggerheart Duality) while the scaling stays identical:
  //   degree -> success number S: safe day 0 (+birth control), fail 0, success 1,
  //   crit 2. Brood Sow adds +1 to S on a success or crit only. Breeder skips the
  //   roll as an auto-crit; Fertile lowers the Brood DC by 2; an Ovidepositor into
  //   a Clutch bearer auto-crits. Offspring = S x type die (standard 1, litter 1d4,
  //   eggs 3d4).
  _broodRollImpregnation: async (targetActor, sourceActor, cockTypes, breeding = false) => {
    // 4th param: the effective Fertility stage (0-3). A legacy boolean true is
    // accepted and means stage 3; a boolean false recomputes from the actors.
    const fertStage = breeding === true ? 3
      : (typeof breeding === "number" ? breeding
      : AFLP_Pregnancy.effectiveFertility(targetActor, { cockTypes: cockTypes ?? {}, partner: sourceActor ?? null }).stage);
    const SCOPE = AFLP.FLAG_SCOPE;
    const tSexual = targetActor.getFlag(SCOPE, "sexual") ?? {};
    const hasBroodSow = !!(tSexual.kinks ?? {})["brood-sow"];
    const tGen = targetActor.getFlag(SCOPE, "anatomyFeatures") ?? {};

    const isOvi      = !!cockTypes["cock-ovidepositor"];
    const isLitter   = !!cockTypes["cock-litter"]  || !!tGen["pussy-litter"] || !!tGen["ass-litter"];
    const hasBreeder = !!cockTypes["cock-breeder"] || !!tGen["pussy-breeder"];
    const hasFertile = !!cockTypes["cock-fertile"] || !!tGen["pussy-fertile"] || !!tGen["ass-fertile"];
    const hasClutch  = !!tGen["pussy-clutch"] || !!tGen["ass-clutch"];
    let type = isOvi ? "ovidepositor" : isLitter ? "litter" : "standard";
    // Size Difference MASTERY: a pregnancy taken from a sire at least one body
    // size larger comes out one brood step bigger (standard -> litter ->
    // ovidepositor). The bearer's stretched-open body quickens a bigger brood.
    try {
      const sdTier = (tSexual.kinks ?? {})["size-difference"]
        ? (AFLP.getKinkTier?.(targetActor, "size-difference") ?? 0) : 0;
      if (sdTier >= 3 && sourceActor
          && AFLP.bodySizeSteps(sourceActor) >= AFLP.bodySizeSteps(targetActor) + 1) {
        type = type === "standard" ? "litter" : "ovidepositor";
      }
    } catch (e) { /* non-fatal */ }
    // Clutch converts ANY pregnancy into an egg clutch: whatever quickens in a
    // brood-sac womb is incubated and laid as eggs, regardless of the sire's
    // cock type. Offspring count still follows the sire's anatomy dice
    // (standard 1 / litter 1d4 / ovi 3d4 per S); only the delivery form and
    // the laying term (clutch: 3 days) change.
    const deliveryType = (type === "ovidepositor" || hasClutch) ? "egg" : "live";

    const dc = 11 - (fertStage >= 2 ? 2 : 0);

    // Fertility 3 auto-crits (Breeder anatomy, Potion of Breeding, or a
    // GM-set stage - Birth Control can subtract it back down to a real roll);
    // a Clutch bearer auto-crits an egg-laying.
    const autoCrit = fertStage >= 3 || (hasClutch && isOvi);
    let degree, detail;
    if (autoCrit) {
      degree = "crit";
      detail = fertStage >= 3 ? "<em>Fertility 3 - the breeding simply takes: automatic critical success.</em>" : "<em>Clutch - the laying takes as a critical success.</em>";
    } else {
      const r = await (AFLP.system?.rollBrood?.(dc) ?? (async () => {
        const roll = await new Roll("1d20").evaluate();
        const nat = roll.dice?.[0]?.results?.[0]?.result ?? roll.total;
        const d = nat === 1 ? "safe" : nat === 20 ? "crit" : roll.total >= dc ? "success" : "fail";
        return { degree: d, detail: `Roll <strong>${roll.total}</strong> vs Brood ${AFLP.system?.dcWord ?? "DC"} ${dc}` };
      })());
      degree = r.degree; detail = r.detail;
    }

    let S = degree === "crit" ? 2 : degree === "success" ? 1 : 0;
    // Brood Sow adds to the success count BEFORE the anatomy dice (journal
    // rule), scaled by beat: Signature +1 / Greater +2 / Mastery +3.
    const broodSowBonus = hasBroodSow ? Math.max(1, AFLP.getKinkTier?.(targetActor, "brood-sow") ?? 1) : 0;
    if (broodSowBonus && (degree === "success" || degree === "crit")) S += broodSowBonus;

    // Safe day: no pregnancy, and the bearer is protected until their next daily
    // preparations (pf2e) / long rest (Daggerheart).
    if (degree === "safe") {
      try { await AFLP.system?.applyCondition?.(targetActor, "birth-control", AFLP.system?.contentUuid?.("birth-control") ?? null); } catch (e) { /* no birth-control item */ }
    }

    const rollNd4 = async (n) => n > 0 ? (await new Roll(`${n}d4`).evaluate()).total : 0;
    let offspring = 0;
    if (S > 0) {
      if (type === "standard")    offspring = S;
      else if (type === "litter") offspring = await rollNd4(S);
      else                        offspring = await rollNd4(3 * S);
    }

    const word = deliveryType === "egg" ? "eggs" : "young";
    const outcome = degree === "crit" ? "Critical Success" : degree === "success" ? "Success" : degree === "safe" ? "Safe Day" : "Failure";
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: targetActor }),
      content: `<div class="aflp-chat-card"><p><strong>Brood Roll</strong> - ${sourceActor.name} breeds ${targetActor.name}</p>`
        + `<p>${detail} - <strong>${outcome}</strong>${broodSowBonus && S > 0 ? ` <em>(Brood Sow +${broodSowBonus})</em>` : ""}</p>`
        + (degree === "safe"
            ? `<p>A safe day - the seed does not take, and ${targetActor.name} is protected by birth control until their next daily preparations.</p>`
            : S > 0
              ? `<p>${targetActor.name} is bred: <strong>${offspring}</strong> ${word}${(() => {
                  const notes = [];
                  if (type !== "standard") notes.push(type);
                  if (hasClutch && type !== "ovidepositor") notes.push("clutch - laid as eggs");
                  return notes.length ? ` <em>(${notes.join("; ")})</em>` : "";
                })()}.</p>`
              : `<p>The seed does not take this time.</p>`)
        + `</div>`,
    });

    if (S <= 0 || offspring <= 0) return null;
    const gestationDays = deliveryType === "egg"
      ? (hasClutch ? 3 : 9)
      : fertStage >= 3 ? 11 : AFLP_Pregnancy._youngGestation(sourceActor);
    return await AFLP_Pregnancy.addPregnancy(targetActor, {
      partner: sourceActor,
      gestationTotal: gestationDays,
      offspring,
      deliveryType,
    });
  },

  savePregnancies: async (actor, pregnancies) => {
    const worldActor = actor.getWorldActor?.() ?? actor;
    await worldActor.setFlag(AFLP.FLAG_SCOPE, "pregnancy", pregnancies);
  },

  // (The old exploding-d6 birth rolls lived here. The Brood Roll chapter's
  // d20 degree system - implemented in _broodRollImpregnation above - replaced
  // them entirely; they were dead code with zero callers and were removed so
  // the retired system cannot regress back into use.)

  recordBirth: async (actor, pregId, { suppressChat = false } = {}) => {
    const worldActor = actor.getWorldActor?.() ?? actor;
    const FLAG = AFLP.FLAG_SCOPE;
    const pregnancies = structuredClone(await worldActor.getFlag(FLAG, "pregnancy")) ?? {};
    const preg = pregnancies[pregId];
    if (!preg) return;
    preg.gestationRemaining = "Complete";
    await worldActor.setFlag(FLAG, "pregnancy", pregnancies);

    // Lifetime breeding flags for titles: an egg delivery unlocks Egg Layer; an
    // egg delivery by a clutch-bearer (pussy-clutch) unlocks Clutch Mother.
    try {
      if (preg.deliveryType === "egg") {
        const sexual = structuredClone(worldActor.getFlag(FLAG, "sexual") ?? {});
        sexual.lifetime = sexual.lifetime ?? {};
        sexual.lifetime.hasLaidEggs = true;
        const _cbAF = worldActor.getFlag(FLAG, "anatomyFeatures") ?? {};
        const isClutchBearer = !!_cbAF["pussy-clutch"] || !!_cbAF["ass-clutch"];
        if (isClutchBearer) sexual.lifetime.hasDeliveredClutch = true;
        await worldActor.setFlag(FLAG, "sexual", sexual);
      }
    } catch (e) { /* non-fatal */ }

    // Brood Sow: remove Endurance if no active pregnancies remain
    if (AFLP.Settings.automation && AFLP.Kinks?.applyBroodSowEndurance) {
      const active = Object.values(pregnancies).filter(p => p.gestationRemaining !== "Complete");
      if (active.length === 0) await AFLP.Kinks.removeBroodSowEndurance(worldActor);
    }

    if (!suppressChat) {
      const sourceName = preg.sourceName || "Unknown";
      const type = preg.deliveryType === "egg" ? "eggs" : "offspring";
      ChatMessage.create({
        content: `${worldActor.name} gave birth to ${preg.offspring} ${type} fathered by ${sourceName}!`
      });
    }
    return preg;
  }

};

// ===============================
// AFLP Sexual Stats Dialog (world actor persistence)
// ===============================
AFLP.UI.SexualStatsDialog = class SexualStatsDialog {
  constructor(actor) {
    this.actor = actor.getWorldActor?.() ?? actor;
    this.FLAG = AFLP.FLAG_SCOPE;
    this.view = "display";
    this.CUM_UNIT_ML = AFLP.CUM_UNIT_ML;
    this.flatPregnancy = [];
  }
};

AFLP.UI.SexualStatsDialog.prototype.load = async function() {
  await AFLP.ensureCoreFlags(this.actor);

  this.sexual = structuredClone(await this.actor.getFlag(this.FLAG, "sexual") ?? AFLP.sexualDefaults);
  this.cum = structuredClone(await this.actor.getFlag(this.FLAG, "cum") ?? AFLP.cumDefaults);
  this.coomer = structuredClone(await this.actor.getFlag(this.FLAG, "coomer") ?? AFLP.coomerDefaults);
  this.cumShotBonus = Number(await this.actor.getFlag(this.FLAG, "cumShotBonus")) || 0;

  this.hasPussy = !!(await this.actor.getFlag(this.FLAG, "pussy"));
  this.hasCock = !!(await this.actor.getFlag(this.FLAG, "cock"));

  const savedGenitalTypes = structuredClone(await this.actor.getFlag(this.FLAG, "anatomyFeatures") ?? {});
  this.genitalTypes = {};
  for (const slug of Object.keys(AFLP.anatomyFeatures)) {
    this.genitalTypes[slug] = !!savedGenitalTypes[slug];
  }
  this.hasTits = !!this.genitalTypes["tits"];

  this.kinks = {};
  for (const slug of Object.keys(AFLP.kinks)) {
    this.kinks[slug] = !!this.sexual.kinks?.[slug];
  }
  this.kinkNotes = structuredClone(this.sexual.kinkNotes ?? {});

  // Patch missing sub-objects for older actors
  if (!this.sexual.lifetime.mlReceived) {
    this.sexual.lifetime.mlReceived = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
  } else if (this.sexual.lifetime.mlReceived.gangbang === undefined) {
    this.sexual.lifetime.mlReceived.gangbang = 0;
  }
  if (!this.sexual.lifetime.mlGiven) {
    this.sexual.lifetime.mlGiven = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
  } else if (this.sexual.lifetime.mlGiven.gangbang === undefined) {
    this.sexual.lifetime.mlGiven.gangbang = 0;
  }

  this.pregnancy = structuredClone(await this.actor.getFlag(this.FLAG, "pregnancy") ?? {});
  this.size = this.actor.system.traits?.size?.value ?? "med";

  for (const [id, preg] of Object.entries(this.pregnancy)) {
    if (typeof preg.gestationRemaining === "number" && preg.gestationRemaining <= 0) {
      await AFLP_Pregnancy.recordBirth(this.actor, id);
    }
  }

  this.pregnancy = structuredClone(await this.actor.getFlag(this.FLAG, "pregnancy") ?? {});
  this.flatPregnancy = Object.entries(this.pregnancy).map(([id, data]) => ({ ...data, __id: id }));
};

AFLP.UI.SexualStatsDialog.prototype._handleBirthById = async function(pregId) {
  if (!pregId) return;
  await AFLP_Pregnancy.recordBirth(this.actor, pregId);
  this.pregnancy = structuredClone(await this.actor.getFlag(this.FLAG, "pregnancy") ?? {});
  this.flatPregnancy = Object.entries(this.pregnancy).map(([id, data]) => ({ ...data, __id: id }));
  this.render();
};

AFLP.UI.SexualStatsDialog.prototype.render = async function() {
  const content = await this._renderContent();

  const self = this;
  foundry.applications.api.DialogV2.wait({
    window:   { title: `${this.actor.name}: Sexual Stats`, resizable: true },
    position: { width: 680 },
    content,
    buttons:  [{ action: "close", label: "Close", default: true, callback: async () => {} }],
    close:    async () => {},
    render(ev, dlg) { self._activateListeners(dlg.element, dlg); },
  });
};

// =======================
// _renderContent
// =======================
AFLP.UI.SexualStatsDialog.prototype._renderContent = async function() {

  // -----------------------------------------------
  // Unified Lifetime Totals table
  // Columns: Sex Act | Times Given | Times Received | Cum Given (ml) | Cum Received (ml)
  // Given columns hidden entirely if !hasCock
  // Vaginal row hidden if !hasPussy
  // -----------------------------------------------
  const allActs = ["oral", "vaginal", "anal", "facial", "gangbang"];

  const tableHeaders = `
    <tr>
      <th>Sex Act</th>
      ${this.hasCock ? `<th>Times Given</th>` : ""}
      <th>Times Received</th>
      ${this.hasCock ? `<th>Cum Given (ml)</th>` : ""}
      <th>Cum Received (ml)</th>
    </tr>`;

  const actRows = allActs.map(act => {
    if (act === "vaginal" && !this.hasPussy) return "";

    const timesReceived = this.sexual.lifetime[act] ?? 0;
    const timesGiven    = act === "gangbang" ? "-" : (this.sexual.lifetime[act] ?? 0);
    const mlReceived    = this.sexual.lifetime.mlReceived?.[act] ?? 0;
    const mlGiven       = this.sexual.lifetime.mlGiven?.[act] ?? 0;

    if (this.view === "display") {
      return `
        <tr>
          <td>${act}</td>
          ${this.hasCock ? `<td>${timesGiven}</td>` : ""}
          <td>${timesReceived}</td>
          ${this.hasCock ? `<td>${mlGiven.toLocaleString()} ml</td>` : ""}
          <td>${mlReceived.toLocaleString()} ml</td>
        </tr>`;
    } else {
      // Gangbang: times given is not tracked (shown as —), but ml given and ml received are editable
      const timesGivenCell = act === "gangbang"
        ? `<td>-</td>`
        : `<td><input name="times-given-${act}" type="number" value="${timesGiven}" style="width:55px"/></td>`;

      const timesReceivedCell = act === "gangbang"
        ? `<td><input name="lifetime-gangbang" type="number" value="${timesReceived}" style="width:55px"/></td>`
        : `<td><input name="lifetime-${act}" type="number" value="${timesReceived}" style="width:55px"/></td>`;

      const mlGivenCell = act === "gangbang"
        ? `<td><input name="ml-given-gangbang" type="number" value="${mlGiven}" style="width:70px"/></td>`
        : `<td><input name="ml-given-${act}" type="number" value="${mlGiven}" style="width:70px"/></td>`;

      const mlReceivedCell = act === "gangbang"
        ? `<td><input name="ml-received-gangbang" type="number" value="${mlReceived}" style="width:70px"/></td>`
        : `<td><input name="ml-received-${act}" type="number" value="${mlReceived}" style="width:70px"/></td>`;

      return `
        <tr>
          <td>${act}</td>
          ${this.hasCock ? `${timesGivenCell}` : ""}
          ${timesReceivedCell}
          ${this.hasCock ? `${mlGivenCell}` : ""}
          ${mlReceivedCell}
        </tr>`;
    }
  }).join("");

  const lifetimeTable = `
    <table class="aflp-table">
      ${tableHeaders}
      ${actRows}
    </table>`;

  // ---- Kinks (left column) ----
  let kinkList = await Promise.all(
    Object.entries(AFLP.kinks)
      .map(([slug, kink]) => ({ slug, enabled: !!this.kinks[slug], kink }))
      .sort((a, b) => a.kink.name.localeCompare(b.kink.name))
      .map(async ({ slug, enabled, kink }) => {
        if (this.view === "display") {
          if (!enabled) return "";
          if (slug === "creature-fetish") {
            const note = this.kinkNotes?.[slug];
            const extra = note ? `: <em>${note}</em>` : "";
            return `<li>${await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${kink.uuid}]{${kink.name}}`)  }${extra}</li>`;
          }
          return `<li>${await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${kink.uuid}]{${kink.name}}`)}</li>`;
        }
        if (slug === "creature-fetish") {
          const note = this.kinkNotes?.[slug] ?? "";
          return `
            <div style="margin-bottom:4px">
              <label><input type="checkbox" name="kink-${slug}" ${enabled ? "checked" : ""}/> ${kink.name}</label>
              <input type="text" name="kinknote-${slug}" value="${note}" placeholder="e.g. dragons, beasts" style="width:100%;margin-top:2px;"/>
            </div>`;
        }
        return `<div style="margin-bottom:2px"><label><input type="checkbox" name="kink-${slug}" ${enabled ? "checked" : ""}/> ${kink.name}</label></div>`;
      })
  );
  kinkList = kinkList.filter(x => x);

  const kinkSection = this.view === "display"
    ? `<div class="aflp-col-section"><b>Kinks</b>${kinkList.length ? `<ul style="margin:4px 0 0 0;padding-left:16px">${kinkList.join("")}</ul>` : `<div style="color:#888">None</div>`}</div>`
    : `<div class="aflp-col-section"><b>Kinks</b><div style="margin-top:4px">${kinkList.length ? kinkList.join("") : `<div style="color:#888">None</div>`}</div></div>`;

  // ---- Genitalia (right column) ----
  let genitalSection = "";

  if (this.view === "display") {
    const genitals = [];

    // Null-safe genital link: resolve via the active system's content (the new
    // pussy types resolve to their DH items via aflrKey, even with no registry
    // uuid), fall back to the registry uuid on other systems, else plain text so
    // a missing item never renders a broken @UUID link.
    const gLink = async (slug, data) => {
      // RESOLUTION, not system name. contentUuid falls through to the canonical
      // PF2e uuid when this system's index has no entry, so it can hand back a
      // TRUTHY string pointing into an unloaded pack - the documented trap. Both
      // candidates are therefore tested with uuidIsReal, and the label falls back
      // to plain text. Measured 11 Aug 2026 on Daggerheart: 16 of the 67 anatomy
      // rows carry a hardcoded PF2e uuid that is dead there, and every one is
      // saved by the system index. On a world with no anatomy items at all the
      // index cannot save them, and the old `system.id !== "daggerheart"` gate
      // would have rendered a broken link rather than the name.
      const enrich = (u) => foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${u}]{${data.name}}`);
      const sysUuid = AFLP.system?.contentUuid?.(slug) ?? null;
      const live = [sysUuid, data?.uuid].find(u => u && AFLP.uuidIsReal?.(u)) ?? null;
      if (live) return await enrich(live);
      return `<span>${data.name}</span>`;
    };
    const subtypesOf = async (parent) => (await Promise.all(
      Object.entries(AFLP.anatomyFeatures)
        .filter(([slug, data]) => data.parent === parent && this.genitalTypes[slug])
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(async ([slug, data]) => `<li style="margin-left:14px">${await gLink(slug, data)}</li>`)
    )).filter(Boolean);

    if (this.hasPussy) {
      genitals.push(`<li>${await gLink("pussy", AFLP.anatomyFeatures["pussy"])}</li>`);
      genitals.push(...await subtypesOf("pussy"));
    }

    if (this.hasCock) {
      genitals.push(`<li>${await gLink("cock", AFLP.anatomyFeatures["cock"])}</li>`);
      genitals.push(...await subtypesOf("cock"));
    }

    if (this.hasTits) {
      genitals.push(`<li>${await gLink("tits", AFLP.anatomyFeatures["tits"])}</li>`);
      genitals.push(...await subtypesOf("tits"));
    }

    genitalSection = `<div class="aflp-col-section"><b>Genitalia</b>${genitals.length ? `<ul style="margin:4px 0 0 0;padding-left:16px">${genitals.join("")}</ul>` : `<div style="color:#888">None</div>`}</div>`;

  } else {
    const subtypeHtmlFor = (parent) => Object.entries(AFLP.anatomyFeatures)
      .filter(([slug, data]) => data.parent === parent)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([slug, data]) => {
        const checked = this.genitalTypes[slug] ? "checked" : "";
        return `<div style="margin-bottom:2px;margin-left:14px"><label><input type="checkbox" name="genitalType-${slug}" ${checked}/> ${data.name}</label></div>`;
      }).join("");
    const pussySubtypeHtml = subtypeHtmlFor("pussy");
    const cockSubtypeHtml  = subtypeHtmlFor("cock");
    const titsSubtypeHtml  = subtypeHtmlFor("tits");
    const throatSubtypeHtml = subtypeHtmlFor("throat");
    // Silhouette auto-picks from anatomy (cock-only reads male, else female) and can
    // be flipped by hand - no gender field needed.
    const _silh = this.actor?.getFlag?.(AFLP.FLAG_SCOPE, "dollSilhouette")
      ?? ((this.hasCock && !this.hasPussy) ? "Male" : "Female");
    const _hot = _silh === "Monster"
      ? { mouth: "12%", chest: "48%", crotch: "75%" }
      : { mouth: "8%",  chest: "28%", crotch: "54%" };
    const SIL = (g) => `modules/ardisfoxxs-lewd-pf2e/assets/Lewd%20Tokens/Silhouette${g}.png`;

    genitalSection = `
      <div class="aflp-col-section">
        <b>Anatomy</b>
        <div class="aflp-doll-wrap">
          <div class="aflp-doll" id="aflp-doll" data-silh="${_silh}" style="background-image:url('${SIL(_silh)}')">
            <button type="button" class="aflp-doll-hot" data-region="mouth"  style="top:${_hot.mouth}"  title="Mouth / Throat"></button>
            <button type="button" class="aflp-doll-hot" data-region="chest"  style="top:${_hot.chest}" title="Chest / Tits"></button>
            <button type="button" class="aflp-doll-hot active" data-region="crotch" style="top:${_hot.crotch}" title="Genitals"></button>
            <button type="button" class="aflp-doll-flip" data-action="flip-silh" title="Flip silhouette">&#8646;</button>
          </div>
          <div class="aflp-doll-slots">
            <div class="aflp-doll-panel" data-region="crotch">
              <div class="aflp-doll-panel-h">Genitals</div>
              <label><input type="checkbox" name="pussy" id="aflp-pussy-checkbox" ${this.hasPussy ? "checked" : ""}/> <strong>Pussy</strong></label>
              <div id="aflp-pussy-subtypes" style="${this.hasPussy ? "" : "display:none"}">${pussySubtypeHtml}</div>
              <label><input type="checkbox" name="cock" id="aflp-cock-checkbox" ${this.hasCock ? "checked" : ""}/> <strong>Cock</strong></label>
              <div id="aflp-cock-subtypes" style="${this.hasCock ? "" : "display:none"}">${cockSubtypeHtml}</div>
            </div>
            <div class="aflp-doll-panel" data-region="chest" style="display:none">
              <div class="aflp-doll-panel-h">Chest</div>
              <label><input type="checkbox" name="tits" id="aflp-tits-checkbox" ${this.hasTits ? "checked" : ""}/> <strong>Tits</strong></label>
              <div id="aflp-tits-subtypes" style="${this.hasTits ? "" : "display:none"}">${titsSubtypeHtml}</div>
            </div>
            <div class="aflp-doll-panel" data-region="mouth" style="display:none">
              <div class="aflp-doll-panel-h">Mouth / Throat</div>
              ${throatSubtypeHtml || `<div class="aflp-doll-empty">No throat features yet</div>`}
            </div>
          </div>
        </div>
      </div>`;
  }

  // ---- Pregnancy rows ----
  const pregRows = this.flatPregnancy.map(p => `
    <tr>
      <td>${p.sourceName ?? "Unknown"}</td>
      <td>${p.deliveryType === "egg" ? "Egg" : "Live Birth"}</td>
      <td>${p.offspring ?? 1}</td>
      <td>${p.gestationRemaining === "Complete" ? "Complete" : `${p.gestationRemaining}/${p.gestationTotal}`}</td>
    </tr>
  `).join("");

  return `
  <form id="aflp-sexual-stats">
    <style>
      .aflp-table{width:100%;border-collapse:collapse;}
      .aflp-table td,.aflp-table th{border:1px solid #aaa;padding:4px 6px;}
      .aflp-section{margin-bottom:10px;}
      .aflp-two-col{display:flex;gap:16px;margin-bottom:10px;}
      .aflp-col-section{flex:1;min-width:0;}
      .aflp-col-section b{display:block;margin-bottom:2px;}
      .aflp-subtabs{display:flex;gap:2px;border-bottom:2px solid var(--color-border-dark,#666);margin-bottom:10px;}
      .aflp-subtab{flex:1;padding:5px 8px;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;background:none;cursor:pointer;font-weight:600;opacity:.55;line-height:1.2;}
      .aflp-subtab.active{opacity:1;border-bottom-color:var(--color-warm-2,#aa2222);}
      .aflp-subpanel{min-height:60px;}
      .aflp-doll-wrap{display:flex;gap:12px;margin-top:6px;align-items:flex-start;}
      /* Doll art standardized at 836x1908; box locked to the art ratio. */
      .aflp-doll{position:relative;width:150px;aspect-ratio:836 / 1908;height:auto;background-size:contain;background-repeat:no-repeat;background-position:center top;flex:none;}
      .aflp-doll-hot{position:absolute;left:50%;transform:translateX(-50%);width:46px;height:40px;border:2px dashed rgba(200,60,90,.45);border-radius:50%;background:rgba(200,60,90,.06);cursor:pointer;padding:0;}
      .aflp-doll-hot:hover{background:rgba(200,60,90,.16);}
      .aflp-doll-hot.active{border-style:solid;border-color:#c8385a;background:rgba(200,60,90,.22);}
      .aflp-doll-flip{position:absolute;bottom:0;left:50%;transform:translateX(-50%);border:none;background:rgba(0,0,0,.18);border-radius:4px;cursor:pointer;font-size:13px;padding:1px 7px;}
      .aflp-doll-slots{flex:1;min-width:0;border-left:1px solid rgba(150,150,150,.3);padding-left:10px;}
      .aflp-doll-panel-h{font-weight:700;margin-bottom:4px;border-bottom:1px solid rgba(150,150,150,.25);padding-bottom:2px;}
      .aflp-doll-panel label{display:block;margin-bottom:3px;}
      .aflp-doll-empty{color:#888;font-style:italic;font-size:12px;}
    </style>

    <nav class="aflp-subtabs">
      <button type="button" class="aflp-subtab active" data-tab="anatomy">Anatomy</button>
      <button type="button" class="aflp-subtab" data-tab="kinks">Kinks</button>
      <button type="button" class="aflp-subtab" data-tab="stats">Stats</button>
    </nav>

    <div class="aflp-subpanel" data-panel="anatomy">
      ${genitalSection}
      ${this.hasPussy ? `
      <div class="aflp-section" style="margin-top:10px">
        <b>Pregnancy</b>
        ${pregRows
          ? `<table class="aflp-table"><tr><th>Source</th><th>Type</th><th>Number</th><th>Gestation</th></tr>${pregRows}</table>`
          : `<div style="color:#888">None</div>`}
      </div>` : ""}
    </div>

    <div class="aflp-subpanel" data-panel="kinks" style="display:none">
      ${kinkSection}
    </div>

    <div class="aflp-subpanel" data-panel="stats" style="display:none">
      <div class="aflp-section">
        <b>Cum:</b> ${this.cum.current}/${this.cum.max}
        ${this.view === "adjust" ? `<br><label style="margin-top:4px;display:inline-block;margin-right:10px">Loads: <input name="coomer" type="number" value="${this.coomer.level}" style="width:50px"/></label><label style="margin-top:4px;display:inline-block">Cum Shot +: <input name="cumShotBonus" type="number" value="${this.cumShotBonus}" style="width:50px"/></label><br><span style="font-size:11px;opacity:.7">Per shot ${AFLP.cumPerShot(this.actor)} \u00d7 ${AFLP.effectiveLoads(this.actor)} loads (worn gear included)</span>` : ""}
      </div>
      <div class="aflp-section">
        <b>Lifetime Totals</b>
        ${lifetimeTable}
      </div>
    </div>

    <div style="text-align:center;margin-top:8px">
      ${this.view === "display"
        ? `<button type="button" data-action="adjust">Adjust Stats</button>`
        : `<button type="submit">Apply</button> <button type="button" data-action="display">Cancel</button>`}
      <button type="button" data-action="reset">Reset Stats</button>
    </div>
  </form>
  `;
};

// =======================
// _activateListeners
// =======================
// `html` is the raw DialogV2 element (HTMLElement) in Foundry v13+/v14.
AFLP.UI.SexualStatsDialog.prototype._activateListeners = function(html, dialog) {
  html.querySelector("[data-action=adjust]")?.addEventListener("click", () => { this.view = "adjust"; dialog.close(); this.render(); });
  html.querySelector("[data-action=display]")?.addEventListener("click", () => { this.view = "display"; dialog.close(); this.render(); });

  const cockCheckbox = html.querySelector("#aflp-cock-checkbox");
  cockCheckbox?.addEventListener("change", () => {
    const subtypes = html.querySelector("#aflp-cock-subtypes");
    if (subtypes) subtypes.style.display = cockCheckbox.checked ? "" : "none";
  });

  const titsCheckbox = html.querySelector("#aflp-tits-checkbox");
  titsCheckbox?.addEventListener("change", () => {
    const subtypes = html.querySelector("#aflp-tits-subtypes");
    if (subtypes) subtypes.style.display = titsCheckbox.checked ? "" : "none";
  });

  // Subtab switching - hidden panels keep their inputs in the form, so a submit
  // still reads every tab's fields.
  html.querySelectorAll(".aflp-subtab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      html.querySelectorAll(".aflp-subtab").forEach(b => b.classList.toggle("active", b === btn));
      html.querySelectorAll(".aflp-subpanel").forEach(p => { p.style.display = p.dataset.panel === tab ? "" : "none"; });
    });
  });

  // Doll: clicking a body region shows that region's slot panel.
  html.querySelectorAll(".aflp-doll-hot").forEach(hot => {
    hot.addEventListener("click", () => {
      const region = hot.dataset.region;
      html.querySelectorAll(".aflp-doll-hot").forEach(h => h.classList.toggle("active", h === hot));
      html.querySelectorAll(".aflp-doll-panel").forEach(p => { p.style.display = p.dataset.region === region ? "" : "none"; });
    });
  });

  // Doll: flip the silhouette by hand.
  html.querySelector('[data-action="flip-silh"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    const doll = html.querySelector("#aflp-doll");
    if (!doll) return;
    const next = doll.dataset.silh === "Female" ? "Male" : "Female";
    doll.dataset.silh = next;
    doll.style.backgroundImage = `url('modules/ardisfoxxs-lewd-pf2e/assets/Lewd%20Tokens/Silhouette${next}.png')`;
  });

  // Pussy subtypes fold with the Pussy checkbox (cock/tits handled below).
  const pussyCheckbox = html.querySelector("#aflp-pussy-checkbox");
  pussyCheckbox?.addEventListener("change", () => {
    const st = html.querySelector("#aflp-pussy-subtypes");
    if (st) st.style.display = pussyCheckbox.checked ? "" : "none";
  });

  html.querySelector("[data-action=reset]")?.addEventListener("click", async () => {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Reset Sexual Stats" }, content: "Reset all sexual stats and clear pregnancies?" });
    if (!ok) return;
    await this.actor.setFlag(this.FLAG, "sexual", structuredClone(AFLP.sexualDefaults));
    await this.actor.unsetFlag(this.FLAG, "pregnancy");
    if (this.actor) await AFLP.recalculateCum(this.actor);
    ui.notifications.info(`${this.actor.name} sexual stats reset.`);
    dialog.close();
  });

  html.querySelector("#aflp-sexual-stats")?.addEventListener("submit", async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);

    // Coomer and recalc
    this.coomer.level = Number(fd.get("coomer") ?? 0);
    await this.actor.setFlag(this.FLAG, "coomer", this.coomer);
    await this.actor.setFlag(this.FLAG, "cumShotBonus", Number(fd.get("cumShotBonus") ?? 0));
    await AFLP.recalculateCum(this.actor);
    this.cum = structuredClone(await this.actor.getFlag(this.FLAG, "cum"));

    // Lifetime act counters + ml per hole
    for (const act of ["oral", "vaginal", "anal", "facial"]) {
      if (act === "vaginal" && !this.hasPussy) continue;
      this.sexual.lifetime[act] = Number(fd.get(`lifetime-${act}`)) || 0;
      this.sexual.lifetime.mlReceived[act] = Number(fd.get(`ml-received-${act}`)) || 0;
      if (this.hasCock) {
        this.sexual.lifetime.mlGiven[act] = Number(fd.get(`ml-given-${act}`)) || 0;
      }
    }

    // Gangbang
    this.sexual.lifetime.gangbang = Number(fd.get("lifetime-gangbang")) || 0;
    this.sexual.lifetime.mlReceived.gangbang = Number(fd.get("ml-received-gangbang")) || 0;
    if (this.hasCock) {
      this.sexual.lifetime.mlGiven.gangbang = Number(fd.get("ml-given-gangbang")) || 0;
    }

    // Genitalia top-level flags
    this.hasPussy = !!fd.get("pussy");
    this.hasCock = !!fd.get("cock");
    this.hasTits = !!fd.get("tits");
    await this.actor.setFlag(this.FLAG, "pussy", this.hasPussy);
    await this.actor.setFlag(this.FLAG, "cock", this.hasCock);

    // GenitalTypes
    for (const slug of Object.keys(AFLP.anatomyFeatures)) {
      if (slug === "pussy") {
        this.genitalTypes[slug] = this.hasPussy;
      } else if (slug === "cock") {
        this.genitalTypes[slug] = this.hasCock;
      } else if (slug === "tits") {
        this.genitalTypes[slug] = this.hasTits;
      } else {
        this.genitalTypes[slug] = !!fd.get(`genitalType-${slug}`);
      }
    }
    await this.actor.setFlag(this.FLAG, "anatomyFeatures", this.genitalTypes);

    // Kinks
    for (const slug of Object.keys(AFLP.kinks)) {
      this.kinks[slug] = !!fd.get(`kink-${slug}`);
    }
    const creatureNote = String(fd.get("kinknote-creature-fetish") ?? "").trim();
    if (creatureNote) {
      this.kinkNotes["creature-fetish"] = creatureNote;
    } else {
      delete this.kinkNotes["creature-fetish"];
    }

    this.sexual.kinks = structuredClone(this.kinks);
    this.sexual.kinkNotes = structuredClone(this.kinkNotes);
    await this.actor.setFlag(this.FLAG, "sexual", this.sexual);

    ui.notifications.info("Sexual stats updated.");
    this.view = "display";
    dialog.close();
    this.render();
  });
};