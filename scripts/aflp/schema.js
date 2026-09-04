// ===============================
// AFLP Shared Schema (schema.js)
// ===============================

if (!window.AFLP) window.AFLP = {};

// Cum per shot ("load size"), a rating set by size. A hole's capacity is 8, so
// anything above that overflows onto the ground (see cumSpillRange). Most folk
// sit low; huge and gargantuan monsters shoot massive loads that flood the floor.
AFLP.BASE_CUM_BY_SIZE = {
  tiny: 1,
  sm: 1,
  med: 1,
  lg: 4,
  huge: 12,
  grg: 24
};

// The ceiling on a computed Cum Shot, equal to the Gargantuan row above. Kept as
// its own constant rather than reading BASE_CUM_BY_SIZE.grg inline so the cap and
// the size table can be checked against the journal as two separate claims.
AFLP.CUM_SHOT_MAX = 24;

// ===============================
// Size Difference engine (system-agnostic; DH + PF2e now, 5e later)
// gap = cock size - hole size, clamped 0-3. Every input is a readable number.
// ===============================
// Body size ladder, 1-based so "cock 0" never appears on a sheet.
AFLP.SIZE_STEPS = {
  tiny: 1, small: 2, sm: 2, medium: 3, med: 3,
  large: 4, lg: 4, huge: 5, gargantuan: 6, grg: 6,
};
// The step number IS the creature size ladder, and cocks and holes share it - so
// a bare "3" on the sheet means Medium. These are the words for that ladder.
// Training, Girthy, Bottomless, Deepthroat and Stretch King can push a value past
// Gargantuan, so anything over 6 reads as beyond-scale rather than falling blank.
AFLP.SIZE_WORDS = { 1: "Tiny", 2: "Small", 3: "Medium", 4: "Large", 5: "Huge", 6: "Gargantuan" };
// Tiers in a cumflation pool, 0 to this. Every pool shares it - oral, vaginal,
// anal, facial, bodyCoat and the tits onahole reservoir. It is the top of the
// per-hole flavour ladder, the "this hole is full" threshold, and the highest
// numbered Cumflated art file. Deepthroat absorbs one tier past it before
// overflowing, so overflow points are written as MAX + 1 rather than a literal.
// NOTE: the shake-level key "max8" is a string label, not a number - it is not
// derived from this and does not change if this does.
AFLP.CUMFLATION_MAX = 8;
// Normalise ANY spelling of a creature size to the 1-6 ladder, 0 if unrecognised.
//
// The two vocabularies are real and both appear in stored data: Pathfinder writes
// abbreviations ("lg", "grg") and Daggerheart writes full words ("large",
// "gargantuan"). AFLP.SIZE_STEPS has always accepted both; the readers did not.
// The partner-history `sourceSize` field is recorded straight from the actor, so
// a DH adversary is stored as "large" while the Size Queen title tested
// `=== "lg"` and the sheet's Largest Partner row did `indexOf("large")` on a list
// of abbreviations. Both silently missed every Large and Gargantuan partner on
// Daggerheart, and matched Huge only because the two systems happen to spell that
// one the same. Compare through this, never against a literal size string.
AFLP.sizeStepOf = (raw) => {
  if (raw === null || raw === undefined) return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.round(n);   // already a step
  return AFLP.SIZE_STEPS[String(raw).trim().toLowerCase()] ?? 0;
};

AFLP.sizeWord = (n) => {
  const v = Math.round(Number(n) || 0);
  if (v <= 0) return "";
  return v <= 6 ? (AFLP.SIZE_WORDS[v] ?? "") : `${AFLP.SIZE_WORDS[6]}+`;
};

// Raw body size in steps. DH stores system.size as a word; PF2e uses
// system.traits.size.value. 5e will slot in here as another read.
//
// TROOPS OVERRIDE IT. A troop is one stat block standing in for many creatures,
// and PF2e sizes it by the space the whole group occupies - a goblin troop is
// Gargantuan. Read straight, that gave a goblin a Gargantuan cock: gap 3 against
// any Medium PC, Ruined on contact, from forty knee-high goblins. The body that
// matters for anatomy is ONE of them.
//
// PF2e records nothing about the constituent creature - the troop trait is there
// but the base creature exists only in the name and the description - so this
// cannot be derived and has to be authored per actor:
//
//     flags.world.bodySizeOverride = "sm"     // a SIZE_STEPS word, or a number
//
// Deliberately NOT gated on the troop trait: a Daggerheart adversary group or a
// 5e swarm needs the same treatment and carries no PF2e trait. Gate on the flag
// being present, per the resolution rule.
//
// This moves the whole body, so the troop's own holes read at one goblin too -
// correct, since fucking a troop means fucking one of them. Cum VOLUME does not
// follow it down: see AFLP.cumPerShot, which multiplies by body count.
//
// Stale when: PF2e starts recording a troop's constituent creature, at which
// point derive it and drop the flag.
AFLP.bodySizeSteps = (actor) => {
  const ovr = actor?.getFlag?.(AFLP.FLAG_SCOPE, "bodySizeOverride");
  if (ovr !== undefined && ovr !== null && ovr !== "") {
    const step = Number.isFinite(Number(ovr))
      ? Number(ovr)
      : AFLP.SIZE_STEPS[String(ovr).toLowerCase()];
    if (Number.isFinite(step) && step > 0) return Math.max(1, Math.min(6, Math.round(step)));
  }
  const raw = String(actor?.system?.size ?? actor?.system?.traits?.size?.value ?? "").toLowerCase();
  const named = AFLP.SIZE_STEPS[raw];
  if (Number.isFinite(named)) return named;
  // Fall back to how many grid squares the token occupies. Daggerheart character
  // actors carry no size field at all - not system.size, not traits - so without
  // this every DH player character is Medium forever. Inert while tokens are 1x1,
  // and correct the moment a GM scales one up.
  const w = Number(actor?.prototypeToken?.width ?? actor?.token?.width ?? 1);
  if (!Number.isFinite(w) || w <= 0) return 3;
  if (w < 1)  return 2;   // half-square tokens: small
  if (w < 2)  return 3;   // medium
  if (w < 3)  return 4;   // large
  if (w < 4)  return 5;   // huge
  return 6;               // gargantuan and beyond
};

// How many bodies this actor represents. Everyone is 1 except a troop, which is
// a group in one stat block; its body count is the total 5-ft squares it
// currently occupies on the canvas.
//
// PF2e can draw that footprint two ways: natively as ONE token at full size, or
// - with the pf2e-troops-helper module - split into several sub-tokens, removed
// as strength stages are lost. Summing the live squares of every token sharing
// this actor covers both, and shrinks on its own as the troop weakens.
//
// THE ONE DEFINITION. aflp-hscene's _bodiesOf() delegates here rather than
// keeping its own copy - the same mistake the hole cap made when the tally and
// the spill each computed capacity and disagreed.
//
// Reads the CANVAS, so it is 1 with no tokens placed - off-canvas callers get
// the single-body answer rather than a guess. That is the safe direction: a
// troop's volume falls back to one body's rather than inflating.
//
// Stale when: a system other than PF2e grows a troop concept with its own trait.
// PF2e troops, straight from the rule: "Troops are represented using four
// segments that are 10 feet on each edge" - so four segments of 2x2 five-foot
// squares, sixteen squares at full strength - and "when the troop is reduced to
// 2/3 or 1/3 of its initial HP, it loses a segment to represent the loss of
// forces." Four segments, then three, then two.
AFLP.TROOP_SEGMENTS = 4;
AFLP.SQUARES_PER_SEGMENT = 4;

// How many segments this troop still has.
//
// DERIVED FROM HP, NEVER FROM TOKEN GEOMETRY, and that is the whole point.
// pf2e-troops-helper ("convert troop token to 16 medium tokens", one actor per
// troop) rewrites a troop's token shape, and a Gargantuan troop whose stored
// prototype is 4x4 reads back as 2x2 through PREPARED data with that module
// active - one segment rather than the whole troop. Counting squares therefore
// gave sixteen bodies in a vanilla world and four in the tester's, for the same
// creature. HP is the same number in both.
//
// The helper's own `{isTroop, firstStage, secondStage}` flag is honoured as well,
// taken as thresholds crossed. Where the two disagree we take the WEAKER count,
// so a mismatch loses volume rather than inventing it.
//
// INFERRED, not verified: that firstStage/secondStage mean the 2/3 and 1/3
// thresholds. The names and the rule line up and the flag is only ever on a
// troop, but if that module changes their meaning this is where it breaks -
// and because it is a min() against the HP answer, the failure is quiet and
// small rather than a troop counting as sixteen when it is down to two segments.
//
// A troop stating its own thresholds in `hp.details` (the Goblin Breeding Troop
// says "Thresholds 25 (2 segments)") is NOT parsed - that field is prose. The
// generic 2/3 and 1/3 rule is used, and the helper flag corrects it when present.
AFLP.troopSegments = (actor) => {
  const hp = actor?.system?.attributes?.hp ?? {};
  const max = Number(hp.max) || 0;
  const val = Number(hp.value);
  let seg = AFLP.TROOP_SEGMENTS;
  if (max > 0 && Number.isFinite(val)) {
    if (val <= max / 3) seg = 2;
    else if (val <= (max * 2) / 3) seg = 3;
  }
  // RAW flag access, never actor.getFlag(). Foundry THROWS
  // `Flag scope "pf2e-troops-helper" is not valid or not currently active`
  // when that module is installed but disabled - which is exactly the state a
  // world is in after the GM turns it off, and the state ours was in when this
  // was measured. Reading the object directly answers undefined and moves on.
  const h = actor?.flags?.["pf2e-troops-helper"];
  if (h && typeof h === "object") {
    const hSeg = h.secondStage ? 2 : h.firstStage ? 3 : AFLP.TROOP_SEGMENTS;
    seg = Math.min(seg, hSeg);
  }
  return Math.max(1, Math.min(AFLP.TROOP_SEGMENTS, seg));
};

// Daggerheart's answer to the same idea, and it is a DIFFERENT SHAPE on purpose.
// The SRD calls a Horde "groups of identical creatures acting together as a
// single unit" - the same fiction as a PF2e troop - but Daggerheart has no
// creature space and no footprint, so there are no squares to count. A horde
// token is 1x1 like everything else. The count is therefore authored:
//
//     flags.world.bodyCount = 8
//
// defaulting to HORDE_BODIES_DEFAULT so a new horde works without being told.
// A medium horde's cum shot is 1 per body, so 8 is exactly a hole's capacity -
// a horde fills you and starts spilling only once cumflation is already there.
AFLP.HORDE_BODIES_DEFAULT = 8;

// How many bodies this actor represents. Everyone is 1 except a group standing
// in one stat block: a PF2e troop or a Daggerheart horde.
//
// PF2e counts SQUARES. A troop's footprint is the total 5-ft squares it
// occupies, drawn either as one full-size token or - with pf2e-troops-helper -
// as several sub-tokens removed as strength stages are lost. Summing the live
// squares of every token sharing this actor covers both and shrinks on its own.
//
// DH counts HP. There is no footprint, so the authored count HALVES once the
// horde has marked half or more of its Hit Points - the exact threshold
// Daggerheart's own Horde (X) passive uses for "there are fewer of them now".
// Reusing that threshold rather than inventing a curve is the point: it is a
// rule the card already states, so nothing new has to be written on a stat block.
//
// THE ONE DEFINITION. aflp-hscene's _bodiesOf() delegates here rather than
// keeping its own copy - the same mistake the hole cap made when the tally and
// the spill each computed capacity and disagreed.
//
// PF2e reads the CANVAS, so it is 1 with no tokens placed - off-canvas callers
// get the single-body answer rather than a guess. That is the safe direction: a
// troop's volume falls back to one body's rather than inflating.
//
// Stale when: a third system grows a group-in-one-stat-block concept, or
// Daggerheart starts recording how many creatures a horde is.
// Is this creature MANY creatures - a Pathfinder troop or a Daggerheart horde?
//
// The detection half of AFLP.bodyCountOf, split out so callers outside the count
// (the Gangbang macro's "is this a valid selection") stop re-deriving it. It used
// to be spelled `traits.value.includes("troop")` at each call site, which is a
// Pathfinder-only test that a Daggerheart horde can never pass: DH carries
// `system.traits` null and says `system.type === "horde"` instead.
//
// Stale when: a third system gains a mass-creature type, or 5e adds one.
AFLP.isMassCreature = (actor) => {
  if (!actor) return false;
  if (String(actor.system?.type ?? "") === "horde") return true;                 // Daggerheart
  return (actor.system?.traits?.value ?? []).includes("troop");                  // Pathfinder 2e
};

AFLP.bodyCountOf = (actor) => {
  try {
    if (!actor) return 1;
    if (!AFLP.isMassCreature(actor)) return 1;
    const clamp = (n) => Math.max(1, Math.min(64, Math.round(n)));

    // --- Daggerheart: an authored count, thinned at half HP ---
    if (String(actor.system?.type ?? "") === "horde") {
      const authored = Number(actor.getFlag?.(AFLP.FLAG_SCOPE, "bodyCount"));
      const base = Number.isFinite(authored) && authored > 0 ? authored : AFLP.HORDE_BODIES_DEFAULT;
      const hp = actor.system?.resources?.hitPoints ?? {};
      const max = Number(hp.max) || 0;
      const val = Number(hp.value) || 0;
      // DH counts HP UP - `value` is how much is MARKED and isReversed says so.
      // Honour the field rather than assuming: a future schema that counts down
      // would otherwise read a full-health horde as destroyed.
      const marked = hp.isReversed === false ? Math.max(0, max - val) : val;
      const thinned = max > 0 && marked >= max / 2;
      return clamp(thinned ? Math.floor(base / 2) : base);
    }

    // --- PF2e: SEGMENTS, from the troop rules, never token geometry ---
    return clamp(AFLP.troopSegments(actor) * AFLP.SQUARES_PER_SEGMENT);
  } catch (e) { return 1; }
};

// The size KEY (tiny/sm/med/lg/huge/grg) used by the cum tables, derived from
// AFLP.bodySizeSteps rather than from a raw system field.
//
// This is the one place that turns "how big is this creature" into a cum-table
// key, and it goes through bodySizeSteps ON PURPOSE. Two sites used to ask the
// per-adapter cumSizeKey(), which reads system.traits.size.value directly, so:
//
//   - a troop carrying bodySizeOverride kept its Gargantuan cum shot and its
//     Gargantuan spill radius while its cock correctly read as one goblin, and
//   - a Daggerheart PC scaled up by its token still read "med", because DH PCs
//     carry no size field at all and only bodySizeSteps has the token fallback.
//
// The adapters' own cumSizeKey() methods are left in place: per-system
// divergence belongs there, and one of them will be the right answer the day a
// system needs a different mapping. They have no callers today.
//
// Stale when: an adapter needs its cum sizing to diverge from its body sizing,
// at which point route this back through AFLP.system.cumSizeKey for that system.
// Turn a content KEY into either a LIVE @UUID link or plain text. The one place
// that decides, so a third local copy does not drift from sheet-tab's and the
// status panel's.
//
// THE TRAP THIS CLOSES: contentUuid falls through to the canonical PF2e uuid
// when this system's index has no entry for the key - which is every key on 5e
// today and 16 anatomy rows on DH - so it hands back a TRUTHY string pointing
// into a pack that world does not load. `uuid ? link : name` reads as a guard
// and is not one: the dead uuid takes the link branch and renders broken. Only
// AFLP.uuidIsReal answers the real question.
//
// Returns RAW @UUID markup, because chat content is stored raw and Foundry
// enriches it on render. For direct DOM injection, enrich the result yourself.
//
// Stale when: the 5e and DH packs carry every key, at which point this returns
// a live link everywhere and the plain-text branch stops being reachable.
AFLP.contentLinkText = (key, label, fallbackUuid = null) => {
  const sys = key ? AFLP.system?.contentUuid?.(key) : null;
  const live = [sys, fallbackUuid].find(u => u && AFLP.uuidIsReal?.(u)) ?? null;
  return live ? `@UUID[${live}]{${label}}` : String(label);
};

AFLP.CUM_SIZE_KEY_BY_STEP = { 1: "tiny", 2: "sm", 3: "med", 4: "lg", 5: "huge", 6: "grg" };
AFLP.cumSizeKeyOf = (actor) =>
  AFLP.CUM_SIZE_KEY_BY_STEP[AFLP.bodySizeSteps(actor)] ?? "med";

// Cock size: body size, +1 for the Girthy subtype, +1/+2 for Stretch King
// Greater/Mastery (same offsets as the existing _skVirtualOffset). 0 = no cock.
// ── Cum bottling ────────────────────────────────────────────────────────
// Squeezed onahole tits fill Bottles of Milky Cum. Mirrors AFLP.milk so the
// sheet and Alcumy share one path rather than each rolling their own. The
// bottle is a wildcard Alcumy ingredient - it stands in for any specific
// creature's cum a recipe calls for - and the top rung of the drinking ladder.
// Top rung of the drinking ladder. PF2e and 5e heal per unit on the 3 / 5 / 10
// milk / cum / milky-cum scale; Daggerheart is attrition-based, so it stays at
// a single Hit Point and earns its "a lot" from Stress relief instead - that
// half is DH design work still queued, so only the Hit Point lands here today.
AFLP.milkyCumHealPerUnit = () => (AFLP.system?.id === "daggerheart" ? 1 : 10);

// A container for plain milk, mirroring AFLP.cumBottle. PF2e and 5e keep milk in
// a numeric pool, so until now Tits (Lactating) promised you could "save it as an
// alcumy reagent" with nothing to save it in. Bottled Milk is that container, and
// it is the same item DH has always had - shared key, so the two systems finally
// name the same object.
// A creature strapped into a Living Milking Station. The station wastes nothing:
// milk past the pool's capacity and cum past a hole's capacity are both captured
// as items instead of spilled. Nothing new is created - only waste is redirected -
// so it cannot inflate, and tits size still governs when milk starts bottling.
// Gear that seals a hole shut. Two consequences, both read from this one list:
// you cannot Purge Cumflation from a sealed hole while it is worn, and gear that
// consumes lubricant drains you on a rest.
//
// Keyed rather than name-matched so a new chastity piece only has to declare
// itself here. `holes` is which pools it seals; `drain` is how much cumflation
// it burns off per hole at daily preparations (or a long rest outside PF2e).
// Is this item bondage gear? PF2e answers with the `bondage` trait; Daggerheart
// has no traits at all (system.traits is null on every DH item), so asking for
// one there silently returns false - which is how Bondage Princess never fired
// in DH. The folder id does not help either: it survives onto an actor's copy but
// points at a COMPENDIUM folder that cannot be resolved from an embedded item.
//
// The aflrKey does survive intact, so that is the reliable signal. Ask through
// here rather than reading a system-specific field at the call site.
AFLP.itemIsBondage = (item) => {
  if (!item) return false;
  // PF2e: the native trait, when the system has one.
  try {
    if (item.system?.traits?.value?.includes?.("bondage")) return true;
  } catch (e) { /* no traits on this system */ }
  const key = item.getFlag?.("ardisfoxxs-lewd-pf2e", "aflrKey")
    ?? item.flags?.["ardisfoxxs-lewd-pf2e"]?.aflrKey ?? null;
  if (!key) return false;
  return AFLP.BONDAGE_KEYS.has(key);
};

// STATE, NOT CAPABILITY. `itemIsBondage` answers "is this bondage content" -
// true for a spell that ties someone up, which is correct and is why the spell
// keeps the trait. It is the WRONG question for "is this creature bound",
// because a Dark Elf Slaver owns Apprehend; Apprehend does not own him.
//
// MEASURED 4 Sept 2026 in `pf2e-dev`, which is how this was found: 16 of the
// world's 103 actors and 17 of the pack's 102 read as permanently bound in every
// H-Scene - every slaver, drake and mimic in the bestiary - because owning the
// ability to bind was read as being bound. It also meant a Bondage Princess who
// merely KNEW Shibari Trap would hold the Horny 1 floor forever, since the
// reconcile pass re-derives from items and nothing ever took it off.
//
// The rule is the item's TYPE, deliberately, rather than a list of the eight
// offenders: a list needs maintaining and the next spell anyone adds - ours or a
// customer's homebrew - silently re-opens the hole. Capability types can never
// bind their owner; gear and applied effects can.
//
// Only the whole pack's nine non-physical bondage-trait items were ever in
// scope: 4 spells, 3 actions, 1 feat - all capability - and `Effect: Milking
// Station`, which is state and still counts.
//
// This costs the binding abilities NOTHING, because they already land real state
// on the target: Shibari Trap applies Restrained, Chained Onahole applies
// Restrained plus its own armor, Apprehend applies Grabbed plus Manacles, Bound
// and Fucked applies a Leather Blindfold. The bound flag reads those.
//
// An `Effect: <spell>` carrying the `bondage` trait is what hooks the KINK,
// which scans items and so never sees PF2e's Restrained condition at all.
// ON DAGGERHEART such an effect needs an `aflrKey` listed in BONDAGE_KEYS
// instead - DH has no traits, so the trait on it buys nothing there.
//
// STALE IF: a system introduces a worn item under a type not listed here, or
// starts expressing an applied effect as something other than effect/condition.
AFLP.BINDING_ITEM_TYPES = new Set([
  // worn or carried gear, across pf2e (equipment/armor/...) and DH (loot)
  "equipment", "weapon", "armor", "shield", "consumable", "backpack", "loot",
  "treasure", "kit",
  // state applied TO a creature
  "effect", "condition",
]);

// Is this item, sitting on this creature, a reason to call the creature bound?
AFLP.itemBindsOwner = (item) => {
  if (!item || !AFLP.BINDING_ITEM_TYPES.has(item.type)) return false;
  if (!AFLP.itemIsBondage(item)) return false;
  // Worn-and-active, not merely carried - a harness in a backpack does not bind.
  // An effect has no `equipped` data and `_active` answers TRUE for it (measured
  // on `Effect: Milking Station`), which is the right answer: an effect on you is
  // on you.
  //
  // TRUTHY, not `!== false`. If `anatomy._active` is ever missing the optional
  // call returns undefined, and `!== false` would read that as "yes, bound" -
  // every bondage item binding unconditionally, silently. This direction fails
  // closed instead, which matches what the call sites did before.
  return !!AFLP.anatomy?._active?.(item);
};

// ---------------------------------------------------------------------------
// Identity helpers.
//
// These three were documented in the project instructions and depended on by
// shipped code for weeks while existing nowhere: a past session wrote them in a
// container, described them as delivered, and they never reached the tree. The
// Oath of Nudity suppression called `AFLP.itemHasKey?.(...)`, which on a missing
// function returns undefined, so the feature silently did nothing - the default
// failure mode this codebase keeps producing. Written here on 7 August 2026 to
// the spec the instructions already state.
// ---------------------------------------------------------------------------

// Does this uuid point at a document that exists in THIS world?
//
// `contentUuid` falls through to the canonical PF2e uuid when the system-local
// index has no entry, so in a Daggerheart world it returns a truthy STRING
// pointing into a pack that is not loaded. `??` does not protect you from that -
// a dead uuid is still truthy. Pick the first candidate that actually resolves:
//     const rowUuid = [a, b, c].find(u => AFLP.uuidIsReal(u)) ?? null;
// Synchronous: reads the pack index rather than awaiting fromUuid.
//
// TWO MEASURED LIMITS, 15 Aug 2026, both found by auditing the PF2e packs:
//
// 1. The world branch used to `return true` on the theory that anything outside
//    a pack is live. That FAILED OPEN, which is the bad direction: three shipped
//    pack actors carry links into the developer's own world
//    (`Actor.OCUZ5G7wqjVV6Vk5.Item...` on Harpy Futa Countess, `Macro....` on
//    Medusa Queen) and every audit called them real. World documents resolve
//    synchronously, so ask.
//
// 2. The compendium branch still answers from the INDEX, and PF2e remaps legacy
//    compendium ids: `Compendium.pf2e.spell-effects.Item.RfCEHpMoEAZvB9IZ` is
//    absent from the index, resolves through `await fromUuid` to "Spell Effect:
//    Bless", and renders perfectly in play. `fromUuidSync` does NOT follow that
//    remap. So this can answer false for a foreign link that works - 22 such
//    links exist on the pack actors today. That is the SAFE direction: a false
//    negative drops `contentLinkText` to a plain label. An AUDIT must ask
//    `await fromUuid` instead of this helper, or it reports 24 defects where
//    there are 2.
//
// Stale when: PF2e drops the legacy-id remap, at which point those 22 links
// break for real and this helper becomes right about them by accident.
// STARFINDER READS THE SAME UUID OUT OF A DIFFERENT PACK.
//
// The pf2e packs declare `system: "pf2e"`, so an sf2e world does not load them -
// the content is in the twins (`aflp-lewd-items` -> `aflr-sf2e-items`), which
// carry the SAME document ids. Every static registry in AFLR (`AFLP.coatItems`,
// `AFLP.items`, `AFLP.conditions`) holds the pf2e-pack spelling, so on sf2e this
// answered FALSE for content that is present and that `fromUuid` resolves.
//
// Measured 1 Sept 2026 in a clean sf2e 1.5.0 world: the slick carrier refused to
// apply ("coat card uuid does not resolve"), the living-gear grant gate skipped,
// and the status panel dropped its links - all from this one line.
//
// The twin is tried only when the named pack is ABSENT, so a pf2e world never
// takes this path. STALE IF: the twins stop sharing document ids, or the pack
// naming changes.
const _SF2E_TWIN = { "aflp-lewd-items": "aflr-sf2e-items", "aflp-lewd-actors": "aflr-sf2e-actors",
                     "aflp-lewd-journals": "aflr-sf2e-journals", "aflp-lewd-tables": "aflr-sf2e-tables" };
AFLP.uuidIsReal = (u) => {
  if (!u) return false;
  const q = String(u).split(".");
  if (q[0] !== "Compendium") {
    try { return !!fromUuidSync(u); } catch (e) { return false; }
  }
  const id = q[q.length - 1];
  const pack = game.packs.get(q[1] + "." + q[2]);
  if (pack) return !!pack.index?.get(id);
  const twin = _SF2E_TWIN[q[2]];
  return twin ? !!game.packs.get(q[1] + "." + twin)?.index?.get(id) : false;
};

// A card's text as a READER sees it, not as it is stored.
//
// WHY THIS EXISTS, 27 Aug 2026: `chastityGear._cardDenied` read the card body
// straight out of `system.description.value` and matched `(\d+) Denied token`
// against it. Every one of those cards writes the condition as an enricher -
// "you hold 3 @UUID[Compendium...]{Denied} tokens" - so between the number and
// the word there sat sixty characters of link. The pattern matched NOTHING, in
// EITHER system, and the card gate dropped all six rows: the chastity Denied
// floor granted nothing at all from the day it shipped.
//
// It was invisible because the gate FAILS CLOSED, and "granted nothing" is what
// failing closed looks like from outside. The audit macro had its own stripper
// and would have reported the world CLEAN while the live code granted zero.
// That divergence is why this is one function that both now call: a card reader
// that is not the reader the audit uses can be wrong for eight days undetected.
//
// GOES STALE IF: a card body starts carrying a form of markup Foundry renders
// away that is neither an `@UUID[...]{label}` enricher nor an HTML tag. Add it
// here rather than at a call site, or the two readers drift apart again.
AFLP.cardText = (html) =>
  String(html ?? "")
    .replace(/@UUID\[[^\]]+\]\{([^}]*)\}/g, "$1")   // enricher -> its visible label
    .replace(/@[A-Za-z]+\[[^\]]+\](?:\{([^}]*)\})?/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Is this item the content keyed X?
//
// Asks aflrKey FIRST, then system.slug, then a RESOLVING sourceId. aflrKey is the
// only identifier that survives every system: Daggerheart items carry no slug at
// all, and a DH-pack copy's sourceId points at the DH pack rather than the
// canonical PF2e uuid. The sourceId branch is last and is gated on the uuid
// actually resolving, so a dead provenance stamp cannot produce a false match.
AFLP.itemHasKey = (item, key) => {
  if (!item || !key) return false;
  const MOD = "ardisfoxxs-lewd-pf2e";
  const k = item.getFlag?.(MOD, "aflrKey") ?? item.flags?.[MOD]?.aflrKey ?? null;
  if (k) return k === key;
  const slug = item.slug ?? item.system?.slug ?? null;
  if (slug) return slug === key;
  const src = item.flags?.core?.sourceId ?? item.sourceId ?? item._stats?.compendiumSource ?? null;
  if (!src || !AFLP.uuidIsReal(src)) return false;
  const want = AFLP.system?.contentUuid?.(key) ?? AFLP.conditions?.[key]?.uuid ?? null;
  return !!want && String(src) === String(want);
};

// Does this actor carry the feat or gear item keyed X, and which document is it?
//
// `actorItemByKey` returns the DOCUMENT, because several callers need to edit it
// - a PF2e RollOption rules array, a badge value. It deliberately does NOT gate on
// `AFLP.anatomy._active`: a feat counts on presence, worn gear counts only while
// worn, and only the call site knows which of those it wants. Gate at the call
// site with `_active` or `_held` when the answer depends on carry state.
AFLP.actorItemByKey = (actor, key) => {
  if (!actor || !key) return null;
  const live = actor?.token?.actor ?? actor;
  return live?.items?.find?.(i => AFLP.itemHasKey(i, key)) ?? null;
};

AFLP.actorHasItem = (actor, key) => !!AFLP.actorItemByKey(actor, key);

// Condition ceilings, as the cards and the guide state them. null means uncapped.
// PF2e has enforced these all along through the adapter's own `_STACKABLE`; this
// is the shared copy so every system clamps to the same numbers rather than
// Daggerheart accepting Exposed 5 and Bimbofied 9.
//
// If a new valued condition is added, ADD ITS CAP - an uncapped track will
// happily exceed what its own card promises.
AFLP.CONDITION_CAPS = {
  "horny":           3,
  "mind-break":      null,   // no cap
  "exposed":         2,
  "creature-fetish": 6,   // matches the condition item's badge max
  "bimbofied":       3,
  "bullified":       3,
  // "Denied - tracked in tokens, UP TO 3." Added 8 Aug 2026: the card had said
  // that all along and nothing enforced it - four applications on a rig reached 4.
  "denied":          3,
  // Added 13 Aug 2026, the same shape as Denied and found the same way - by
  // asking which valued keys had no entry here and then pushing each past its
  // card. All three reached 6 through repeated apply() and 7 through setValue()
  // and setExact(), which is the path the sheet's condition manager uses.
  //
  //   Defeat card:        "tracked in tokens, up to 3"
  //   Fertility card:     stages 0-3, each stage described
  //   Birth Control card: "staged from 1 to 3"
  //
  // DEFEAT IS DH-ONLY and keyed "defeat"; PF2e's "defeated" is a separate,
  // binary condition and takes no cap. Do not merge the two.
  //
  // _markDefeat already clamps to _defeatMax (3, or 2 under Mine Now), so the
  // climax path was never the leak - every OTHER write was. A dynamic ceiling
  // in one function is not a cap.
  "defeat":          3,
  "breeding":        3,
  "birth-control":   3,
};
// One ceiling per condition, shared by every system, and kept in step with the
// PF2e condition items' counter badge maxima (horny 3, denied 3, bimbofied 3,
// bullified 3, exposed 2, mind-break uncapped). Change both together or they
// will disagree, and the badge will win.

// Clamp a condition value to its ceiling.
//
// One number per condition, the same on every system, and it matches the PF2e
// condition item's own counter badge `system.badge.max`. THE BADGE IS THE
// AUTHORITY: PF2e clamps a badge write to badge.max before this code is even
// consulted, so a cap here that exceeds the badge cannot be reached, and a badge
// that exceeds this cap can still be pushed by hand from the sheet. When they
// disagree, one of them is a bug.
//
// A per-actor raise was built on 9 Aug 2026 so the Bimbomancer Dedication could
// take Bimbofied to 4, and then REMOVED the same day. It could not work without
// also raising the badge to 4, which would have left the automation capping at 3
// while the sheet and the pack said 4 - a split players would reasonably report
// as a bug. A readable single number beat a correct-but-invisible exception.
// Do not reintroduce it without moving the badge too.
//
// An unknown key is returned untouched, so adding a condition without a cap
// fails open in the harmless direction instead of silently pinning it to zero.
// A cap of null means uncapped.
AFLP.capCondition = (key, value) => {
  const n = Number(value) || 0;
  const cap = AFLP.CONDITION_CAPS[key];
  if (cap === undefined || cap === null) return n;
  return Math.min(n, cap);
};

// Every key in the Bondage Gear folder. A living piece and its dormant twin are
// both here, since both are bondage while worn.
AFLP.BONDAGE_KEYS = new Set([
  "manacles", "leg-cuffs", "rope-bindings", "shibari-harness", "leather-gag",
  "posture-collar", "slave-collar", "slave-leash", "slave-harness",
  "nipple-clamps", "inflatable-plug", "chastity-harness", "bitchsuit",
  "waist-chain-and-spreader", "breeders-collar", "collar-of-the-praiseworthy-pet",
  "gemstone-plug", "feather-duster-plug", "tattoo-of-predicaments",
  "yoke", "ballet-heels", "hobble-boots", "leather-armbinder", "leather-mitts",
  "ring-gag", "leather-blindfold", "sensory-hood", "spreader-bar",
  "latex-hobble-dress", "milkmaid-harness", "tail-plug", "cock-cage",
  "collar-and-leash", "suction-clamps", "chastity-belt", "vibe-egg",
  "latex-corset", "codpiece", "piercings", "milking-station", "pillory",
  "latex-catsuit",
  // living twins
  "living-manacles", "living-leg-cuffs", "living-rope-bindings",
  "living-shibari-harness", "living-posture-collar", "living-slave-collar",
  "living-yoke", "locking-ballet-heels", "living-hobble-boots",
  "living-leather-armbinder", "living-leather-mitts", "living-ring-gag",
  "living-leather-blindfold", "living-sensory-hood", "living-spreader-bar",
  "living-latex-hobble-dress", "living-milkmaid-harness", "living-tail-plug",
  "living-collar-leash", "mimic-suction-clamps",
  "living-chastity-belt", "living-vibe-egg", "living-latex-corset",
  "cursed-codpiece", "living-piercings", "living-milking-station",
  "living-pillory", "living-pillory-of-attraction", "mimic-biosuit",
  "living-exoskeleton",
  // Added 8 Aug 2026 from a reconciliation of this set against BOTH packs.
  // The bikini armor is four tiers on Daggerheart and one item on PF2e; the
  // PF2e copy has no aflrKey but does carry the trait, so only the DH keys are
  // needed. Portal Plug and Bagslut's Buttplug carry `sexual` and `cursed` on
  // PF2e but NOT `bondage`, so the trait path misses them on both systems and
  // the key is doing the work in each - and their two packs key the buttplug
  // differently, hence both spellings.
  "bondage-bikini-armor-t1", "bondage-bikini-armor-t2",
  "bondage-bikini-armor-t3", "bondage-bikini-armor-t4",
  "cock-cage-of-the-cumdump-femboy",
  "portal-plug-of-free-use",
  "bagsluts-buttplug", "bagsluts-buttplug-type-i",
  // Added 4 Sept 2026 from a LIVE folder check, which is what the key-by-key
  // reconciliation above could not do: it asked whether each KEY had an item,
  // never whether each ITEM had a key.
  //
  // MEASURED in `dh-test`: the Bondage Gear folder holds 75 items, every one
  // keyed, and three answered FALSE to `AFLP.itemIsBondage`. Two are real
  // wearables that also register in `chastityGear.ITEMS` - so on Daggerheart,
  // where there are no traits and this set is the ONLY path, wearing either one
  // failed to fire Bondage Princess's Horny grant and its reconcile pass, and
  // did not mark the wearer `bound` in the H-Scene. Silently, since 8.0.20.
  //
  // The third, `living-bondage`, is the explainer card rather than gear and is
  // correctly absent.
  //
  // PF2e carries all 103 items in its Bondage and Living folders with the
  // `bondage` trait, so none of this ever showed there - which is also why
  // `living-pillory-attraction` had no symptom: that is the PF2e item's key,
  // DH spells the same piece `living-pillory-of-attraction`, and only the DH
  // spelling was here. Both are listed rather than renaming a shipped key.
  //
  // STALE IF: a bondage piece is added to either pack. The check is a folder
  // sweep in a live world, not a search - `dev-aflr-audit-identifiers.js` does
  // not report this class.
  "living-chastity-harness", "living-femboy-cage", "living-pillory-attraction",
  // REMOVED 4 Sept 2026: `living-milking-sleeve`. It was the wrong key on
  // Daggerheart's Living Cock Cage, fixed by re-keying the item on 11 Aug and
  // left here. Verified dead four ways before removal: no DH pack item, no PF2e
  // pack item, no world actor, no embedded item on any of the 47 DH actors.
  //
  // DELIBERATELY ABSENT: `silken-shibari-cords`.
  //
  // It reads like bondage gear and it is not worn. On Daggerheart it is a
  // CONSUMABLE you spend on someone else - "use on a willing or Vulnerable
  // creature within Melee range: they become Restrained" - and DH consumables
  // carry no `equipped` block at all, so AFLP.anatomy._active counts them on
  // presence. Keying it would make every character who packs a coil of rope
  // read as tied up themselves: Bondage Princess would pay out, and the
  // bondage-scene tally would count, for carrying it. If a "bound by cords" state is
  // ever wanted it belongs on the Restrained the cords APPLY, not on the item
  // in the user's inventory. Do not add it.
]);

AFLP.chastityGear = {
  ITEMS: {
    "living-chastity-belt":   { holes: ["vaginal", "anal"], drain: 0 },
    "living-chastity-harness":{ holes: ["vaginal", "anal"], drain: 0 },
    // A codpiece covers a cock; it does not plug anything. It seals no holes, so
    // it never blocks a purge - the entry stays only so the piece is recognised
    // as chastity gear.
    "living-codpiece":        { holes: [], drain: 0 },
    "living-cock-cage":       { holes: [], drain: 0 },
    // Daggerheart's cursed cage. Seals nothing - a cage covers a cock, it does
    // not plug a hole - so the row exists only so the piece is RECOGNISED as
    // chastity gear, same reason as the codpiece above.
    "living-femboy-cage":     { holes: [], drain: 0 },
    // The exoskeleton's pistons seat in the lower holes AND its joints eat the
    // lubricant, so it is the one piece that drains. That drain is the point:
    // it empties you daily and sends you looking to be refilled.
    // THE SEAL IS CONDITIONAL, 29 Aug 2026. `holesUnless` names a condition that
    // SUSPENDS this row's holes while it is on: the card says the pistons withdraw
    // when the suit needs lubricating, "leaving you open and still bound", and until
    // now the holes were sealed unconditionally whatever the suit's state.
    //
    // `coatWipe` replaces `drain: 2`. The old rule took 2 from EVERY pool at rest;
    // the settled design takes the whole chest coat and nothing else, so the wearer
    // starts every day dry and must be greased again. THE EXOSKELETON WAS THE ONLY
    // ROW IN THIS TABLE WITH A NON-ZERO `drain` - measured, one hit across 29 rows -
    // so the rate machinery below now has no consumer and is kept only so a future
    // piece can use it.
    "living-exoskeleton":     { holes: ["vaginal", "anal"], drain: 0, coatWipe: true,
                                holesUnless: "exoskeleton-dry" },

    // Plugs seal the ASS. Changed 11 Aug 2026 from `anyHole: true`, which meant
    // "the wearer picks, so warn rather than guess" - and the purge macro did
    // exactly that: it printed an info line and still offered every hole,
    // including the plugged one. Nothing was ever refused.
    //
    // The `Plugged` condition states the rule plainly ("nothing else can get into
    // your ass, and you cannot purge Cumflation from it"), so the seal has to be
    // real. Listing anal makes sealedHoles include it and the purge macro refuse
    // it, which it already knows how to do.
    //
    // A plug worn somewhere other than the ass is now a GM call, which is the
    // trade: an enforced common case beats an unenforced general one.
    "tail-plug":              { holes: ["anal"], drain: 0 },
    "living-tail-plug":       { holes: ["anal"], drain: 0 },
    "vibe-egg":               { holes: ["anal"], drain: 0 },
    "living-vibe-egg":        { holes: ["anal"], drain: 0 },
    "inflatable-plug":        { holes: ["anal"], drain: 0 },
    "living-inflatable-plug": { holes: ["anal"], drain: 0 },
    "feather-duster-plug":    { holes: ["anal"], drain: 0 },
    // Wondrous buttplugs. Named for the ass and now sealing it, same as above.
    "vibrating-buttplug":         { holes: ["anal"], drain: 0 },
    "vibrating-buttplug-greater": { holes: ["anal"], drain: 0 },
    "gemstone-buttplug":          { holes: ["anal"], drain: 0 },
    "slave-buttplug":             { holes: ["anal"], drain: 0 },
    "bagsluts-buttplug-type-i":   { holes: ["anal"], drain: 0 },
    "portal-plug-of-free-use":    { holes: ["anal"], drain: 0 },

    // The Bitchsuit is ONE item across both systems - the wording differs to
    // suit each system, the hardware does not. A muzzle-plug fills the mouth
    // and a tail anal plug seats in the ass, so both holes are stopped and
    // neither can be purged. All four keys carry the same pair.
    //
    // PF2e ships three variants and they are NOT interchangeable here: each
    // carries its own aflrKey, so registering only "bitchsuit" would seal the
    // mundane suit and silently leave the Primal and Living ones open, despite
    // identical hardware. If a fourth variant is ever added, it needs a row.
    //
    // Daggerheart's single suit uses the "bitchsuit" key as well.
    "bitchsuit":         { holes: ["anal", "oral"], drain: 0 },

    // BOTH chastity harnesses seal the lower holes, and unlike the Bitchsuit the
    // mouth is free. The mundane one says "Everything under it is sealed"; the
    // Throat Sleeve Slave spells it out, "You cannot purge Cumflation from your pussy
    // or ass; it has nowhere to go."
    //
    // Two rows because they are two items. The Throat Sleeve Slave was CLONED from the
    // mundane harness and kept its aflrKey - both answered "chastity-harness"
    // until 10 Aug 2026, which would have fired the Throat Sleeve Slave's permanent
    // curse on anyone who buckled on the ordinary one. Keys separated; keep them
    // separate.
    "chastity-harness":                    { holes: ["vaginal", "anal"], drain: 0 },
    "chastity-harness-of-the-throat-sleeve-slave":{ holes: ["vaginal", "anal"], drain: 0 },

    // ADDED 26 Aug 2026. THE MUNDANE PIECES WERE NEVER REGISTERED AT ALL - only
    // their living twins were - so a belt, a cage and a codpiece claimed a seal
    // on their cards that the purge path did not enforce on either system.
    //
    // The belt seals BOTH lower holes, same as its living twin: PF2e's card says
    // "prevents access to the wearer's private parts. Butt plugs cannot be
    // removed while the chastity belt is worn" - which is the ass in as many
    // words - and Daggerheart's says the pussy is Chaste. Note the PF2e item has
    // no aflrKey and is matched by SLUG; `worn` was moved onto AFLP.itemHasKey
    // the same day so that resolves.
    "chastity-belt":          { holes: ["vaginal", "anal"], drain: 0 },
    // A cage and a codpiece cover a cock and plug nothing, so they seal no hole -
    // the rows exist so the pieces are RECOGNISED as chastity gear, the same
    // reason `living-cock-cage`, `living-femboy-cage` and `living-codpiece` are
    // here. `cursed-codpiece` is DAGGERHEART's Living Codpiece: it is the same
    // piece of gear as PF2e's `living-codpiece` under a different key, so both
    // rows are needed until the keys are unified - a single row registered the
    // PF2e twin and left the DH one unrecognised.
    "cock-cage":              { holes: [], drain: 0 },
    "codpiece":               { holes: [], drain: 0 },
    "cursed-codpiece":        { holes: [], drain: 0 },
    // DAGGERHEART'S GEMSTONE PLUG, and the THIRD instance of one key per system
    // for one concept. Its card says "While worn your ass is Plugged" and it had
    // no row at all, so it sealed nothing - Pathfinder's twin is
    // `gemstone-buttplug`, a DIFFERENT KEY, and the single row registered that one
    // and left this one inert. Found 27 Aug 2026 by reading every DH bondage item
    // rather than trusting the names, at Ardis's instruction; he confirmed it
    // should seal. Same class as `living-codpiece`/`cursed-codpiece` above and
    // `living-cock-cage`/`living-femboy-cage`.
    // GOES STALE IF: the two keys are ever unified - then one row does both.
    "gemstone-plug":          { holes: ["anal"], drain: 0 },
    // A SECOND ROW, `living-chastity`, was deleted here on 15 Aug 2026. It was
    // Daggerheart's copy of the same piece of gear as `living-chastity-harness`
    // above - byte-identical, and the DH item is now NAMED `Living Chastity
    // Harness` too, so it was carrying a key that no longer matched its name.
    //
    // The row existed because of a claim in this comment that turned out to be
    // FALSE: that DH living gear is grown mimic-stuff which dies when removed
    // while PF2e's is a curse kept afterwards. PF2e's own Living Bondage rules
    // item reads "living bondage is grown, not made. Each piece is a scrap of
    // mimic-stuff shaped into a restraint" - the same fiction - and it comes off
    // by Force Open, reshaping into a harsher piece on a critical failure, which
    // is the mechanism Daggerheart runs with a Fear. The distinction being
    // reached for was CURSED PF2e gear
    // (`chastity-harness-of-the-throat-sleeve-slave`), which is a different item.
    // Corrected by Ardis 14 Aug 2026.
    //
    // The DH pack item was rekeyed to `living-chastity-harness` in `dh-test`
    // before this row was removed, and no actor in that world or in any AFLR
    // Actor pack carried either key, so nothing was holding the old one.
    // `dev-aflr-rekey-dh-living-chastity.js` is the script and is idempotent.
    //
    // ONE key per piece of gear across every system is the point of a shared
    // registry. Do NOT confuse this with `living-chastity-belt` above: the belt
    // marks Denied and blocks the pussy, the harness seals both lower holes.
    "bitchsuit-primal":  { holes: ["anal", "oral"], drain: 0 },
    "bitchsuit-living":  { holes: ["anal", "oral"], drain: 0 },
  },

  // Plugs the actor is wearing, for the purge dialog to warn about.
  // NO ROW SETS `anyHole` ANY MORE, so this returns [] on every actor and its one
  // caller (the purge macro's warning line) is dead. Kept deliberately: the flag
  // is the mechanism for a plug whose hole genuinely is not knowable in advance -
  // a muzzle plug, a gag - and deleting it would mean rebuilding it. If you are
  // here because the warning never fires, that is why.
  plugs(actor) {
    return this.worn(actor).filter(g => g.anyHole);
  },

  // Every worn piece of chastity gear on this actor.
  //
  // A `systems` filter was added here on 10 Aug 2026 to scope the Bitchsuit to
  // Daggerheart, on the mistaken reading that the two systems' suits were
  // different items. They are the same item worded for each system, so the
  // entry is uniform and the filter had no consumer - removed rather than left
  // as machinery a future session has to reason about.
  //
  // Note `_active` carries the real per-system difference: PF2e's suit is
  // equipment and counts only while worn, DH's is loot with no equip block and
  // counts on presence. That belongs there, not here.
  // THE SLUG FALLBACK, added 26 Aug 2026. This read `getFlag(MOD, "aflrKey")` and
  // nothing else, so it saw only items carrying an aflrKey - and PF2e's Chastity
  // Belt does not have one. It is keyed by its SLUG, which AFLP.itemHasKey falls
  // back to and a raw flag read cannot, so the belt was invisible to the seal.
  //
  // WHY NOT SIMPLY `ITEMS.some(k => AFLP.itemHasKey(it, k))`, which is the obvious
  // form and was written first: itemHasKey's LAST fallback resolves
  // `contentUuid(key)` and calls `uuidIsReal`, which reads the pack index. Looping
  // that over ~25 keys for every item on the actor puts a pack-index sweep inside
  // `worn`, and `worn` is called by `sealed`, `sealedHoles`, `drainAtRest` and the
  // status panel's render. On Daggerheart it would be worst: DH items have no
  // `system.slug`, so every item without an aflrKey - about a fifth of the pack -
  // falls all the way through for every key.
  //
  // So the cheap half of the ladder runs ONCE per item and answers "what key is
  // this", and the full helper is asked only for an item that has neither
  // identifier, where it is the only thing that can answer at all. Same order,
  // same answers, bounded work.
  //
  // GOES STALE IF: itemHasKey's fallback ORDER changes - aflrKey, then slug, then
  // compendium source. An item carrying an aflrKey is never matched by slug, so
  // only a key with no aflrKey anywhere is exposed to a slug collision.
  _keyOf(item) {
    const MOD = "ardisfoxxs-lewd-pf2e";
    const k = item?.getFlag?.(MOD, "aflrKey") ?? item?.flags?.[MOD]?.aflrKey ?? null;
    if (k) return this.ITEMS[k] ? k : null;
    const slug = item?.slug ?? item?.system?.slug ?? null;
    if (slug) return this.ITEMS[slug] ? slug : null;
    // Neither identifier: the compendium-source branch of itemHasKey is the only
    // route left, and it is cheap to reach here because this is a rare item.
    for (const key of Object.keys(this.ITEMS)) if (AFLP.itemHasKey(item, key)) return key;
    return null;
  },

  worn(actor) {
    const out = [];
    for (const it of (actor?.items ?? [])) {
      if (!AFLP.anatomy._active(it)) continue;
      const k = this._keyOf(it);
      if (!k) continue;
      // `__actor` rides along so a row-level gate (`holesUnless`) can ask about the
      // wearer without every caller passing the actor down a second time.
      out.push({ key: k, item: it, __actor: actor, ...this.ITEMS[k] });
    }
    return out;
  },

  // A row whose `holesUnless` condition is currently ON seals nothing. One piece
  // uses it - the exoskeleton, whose pistons withdraw while it needs lubricating -
  // and every other row has no `holesUnless` and is unaffected.
  //
  // READ THROUGH `AFLP.cond.has` rather than a flag, so it works on both stores.
  _holesSuspended(g) {
    const key = g?.holesUnless;
    if (!key) return false;
    try { return AFLP.cond.has(g.__actor, key) === true; } catch (e) { return false; }
  },

  // Is this hole sealed shut by something worn? Purge Cumflation checks this.
  sealed(actor, hole) {
    return this.worn(actor).some(g => !this._holesSuspended(g) && g.holes.includes(hole));
  },

  sealedHoles(actor) {
    const s = new Set();
    for (const g of this.worn(actor)) {
      if (this._holesSuspended(g)) continue;
      for (const h of g.holes) s.add(h);
    }
    return [...s];
  },

  // ── THE WHILE-WORN DENIED FLOOR, ON EVERY SYSTEM ────────────────────────────
  //
  // Ardis, 27 Aug 2026: *"the code should support them holding those denied tokens
  // and not clearing them on rest."* Approved shape:
  // `claude/dh-chastity-floor-draft-2026-08-27.md`.
  //
  // WHY IT LIVES HERE AND NOT IN THE LIVING-GEAR TABLES. `chastityGear` runs on
  // every system and already owns the SEAL half of these same cards, so it owns
  // the floor too - one card, one mechanism, one scope.
  //
  // THE ORIGINAL REASON GIVEN HERE WAS FALSE, and it is corrected rather than
  // deleted because the false version is what did the damage. It said
  // `AFLP_LivingGear` was "PF2e only, and deliberately - its header says so",
  // which is what that file's header claimed and what the 26 Aug chastity test
  // was blamed on. **Daggerheart is where living bondage was invented** (Ardis,
  // 27 Aug) and carries thirty-odd living pieces; the file is now split into
  // `aflp-living-gear-{core,pf2e,dh}.js` and each system has its own table.
  //
  // The conclusion still holds and the reasoning is now the right one: a floor
  // that every system's cards promise belongs with the cross-system reader, not
  // in a per-system grant table.
  //
  // AND THE DUPLICATE THAT REASONING LEFT BEHIND WAS A REAL DEFECT. The PF2e
  // table kept its own ungated `denied` rows until 28 Aug, so the CARD GATE here
  // could refuse a row and the floor landed anyway from the other writer -
  // measured in `pf2e-dev`, and invisible until something tried to REFUSE.
  //
  // THE REST RULE NEEDS NO CODE, and that was verified rather than assumed:
  // `aflp-rest.js` (Daggerheart's rest) and `aflp-daily-prep.js` (Pathfinder's
  // daily preparations) BOTH settle through `AFLP.denied.settleTo`, which settles
  // to `max(permanent, extraFloor)`. A sustained floor survives by construction on
  // either system, which is exactly what the cards now promise.
  //
  // EVERY NUMBER BELOW WAS READ OFF THE CARD IN ITS OWN PACK, 27 Aug 2026, and the
  // two packs were enumerated separately - no key was carried across on the
  // strength of its name. What that turned up:
  //
  //   - `chastity-harness-of-the-throat-sleeve-slave` DOES NOT EXIST on Daggerheart.
  //     It is in this table because the PF2e card states the floor; the DH pack has
  //     no such item, so the row can never match there. CHECKED, not assumed.
  //   - `living-cock-cage` is PF2e's. Daggerheart's nearest piece is
  //     `living-femboy-cage`, a DIFFERENT KEY, and **its card states no Denied at
  //     all** - so it is deliberately absent here. Copying the PF2e row across on
  //     the strength of "it is the cage one" is precisely the leak this comment
  //     exists to prevent.
  //   - `codpiece` exists in BOTH packs and neither card mentions Denied. Absent.
  //   - THE CAGE IS 1, NOT 3, on both packs' cards.
  //
  // GOES STALE IF: a card's Denied number changes, or a seventh chastity piece is
  // added. The check is `dev-aflr-audit-chastity-floor.js`, which reads every card
  // in the loaded pack and reports any disagreement with this table in BOTH
  // directions - a card whose number is not here, and a row with no card.
  DENIED: {
    "chastity-belt":                               3,
    "chastity-harness":                            3,
    "living-chastity-belt":                        3,
    "living-chastity-harness":                     3,
    "cock-cage":                                   1,
    // PF2e only - see above. Its card gained the line on 27 Aug.
    "chastity-harness-of-the-throat-sleeve-slave": 3,
  },

  // The ownership record: what the wearer's Denied total was BEFORE each piece
  // lent its floor. Without it, taking a belt off a wearer who already had Denied 2
  // drops them to ZERO - `setSustained(..., 0)` lowers the total by the whole floor,
  // because a floor of 3 ABSORBS a smaller value while it is on and nothing in the
  // bag distinguishes it afterwards. That bug was live on PF2e until 26 Aug; this
  // is the same guard, so Daggerheart never gets to have it.
  FLAG_DENIED: "chastityDeniedFloor",

  // DELIBERATELY THE SAME SOURCE ID `AFLP_LivingGear` USES. On Pathfinder both
  // reconcilers are live for now, and that is safe rather than lucky:
  // `setSustained` is keyed by source and `permanent` is the **MAX of its sources,
  // never their sum**, so two writers setting one source to one value is
  // idempotent. Living gear's `denied` rows come out once this has run green on
  // both systems - one owner is the end state, and doing it in one step would mean
  // changing Pathfinder's working path in a session that can only test Daggerheart.
  _deniedSource(key) { return `living-gear:${key}`; },

  // ── THE TABLE IS THE INTENT. THE CARD IN THIS WORLD IS THE GATE. ────────────
  //
  // Ardis, 27 Aug 2026: *"the shared table is good but we need to be clear that dh
  // and pf2e are different systems with different interpretations of similar items,
  // so the table needs to not enforce the wrong code or let pf2e automation leak
  // onto dh items in ways that the dh item card doesn't agree with."*
  //
  // A COMMENT SAYING "these were read off the cards" IS A CLAIM THAT ROTS. This
  // makes it a mechanism instead: at registration every row is checked against the
  // card in the pack THIS world actually loaded, and a row is only allowed to fire
  // if that card states that number. So the shared table can never apply Pathfinder's
  // reading to a Daggerheart item - the DH card has to agree, in its own words, or
  // the row is dropped and the console says so.
  //
  // FAIL-CLOSED, on purpose. A grant that fires where no card promises it is a rule
  // players cannot look up; a grant that silently does NOT fire is a bug someone
  // reports. Between those, the second is the one you can find.
  //
  // A row with NO card here is inert, not an error - that is the other system's
  // subset, which is the whole point of a shared table. `chastity-harness-of-the-
  // throat-sleeve-slave` has no Daggerheart item at all and simply never matches
  // there. (Ardis, on DH's Living Chastity Harness: *"inspired by the
  // chastity-harness-of-the-throat-sleeve-slave, so its sort of that item but not.
  // dh is a different system so items are less direct copies and more inspirations."*
  // They are separate keys carrying separate cards, and this gate is what keeps
  // them separate in code as well as in fiction.)
  //
  // GOES STALE IF: a card's Denied sentence is reworded into a shape `_cardDenied`
  // does not read. That direction is SAFE - the row drops and warns - but it is
  // still a regression, which is why `dev-aflr-audit-chastity-floor.js` reports
  // "mentions Denied with no number this reads" as a finding rather than ignoring it.
  // Takes a RAW card body and reads it the way a player sees it. Passing raw HTML
  // straight to the pattern is the bug of 27 Aug - see `AFLP.cardText`.
  _cardDenied(text) {
    const t = AFLP.cardText(text);
    const m = t.match(/hold (\d+) \w*\s?Denied|(\d+) Denied token|Denied (\d+)|mark (\d+) Denied|Denied condition at (\d+)/i);
    if (m) return Number(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]);
    return /\bDenied\b/i.test(t) ? NaN : null;      // NaN = mentions it, unreadable
  },

  async _buildDeniedFloor() {
    const MOD = "ardisfoxxs-lewd-pf2e";
    const active = {}, dropped = [], absent = [];
    for (const p of game.packs.filter(x => /ardisfoxxs/.test(x.collection) && x.documentName === "Item")) {
      let docs; try { docs = await p.getDocuments(); } catch (e) { continue; }
      for (const d of docs) {
        const key = d.getFlag?.(MOD, "aflrKey") ?? d.system?.slug ?? null;
        if (!key || !Object.hasOwn(this.DENIED, key) || Object.hasOwn(active, key)) continue;
        const want = this.DENIED[key];
        const said = this._cardDenied(d.system?.description?.value ?? d.system?.description);
        if (said === want) active[key] = want;
        else dropped.push(`${key} ("${d.name}"): table says ${want}, card says ${said === null ? "nothing" : (Number.isNaN(said) ? "an unreadable number" : said)}`);
      }
    }
    for (const key of Object.keys(this.DENIED)) if (!Object.hasOwn(active, key) && !dropped.some(x => x.startsWith(key + " "))) absent.push(key);

    this._deniedActive = active;
    if (dropped.length) console.warn(`AFLP | chastity Denied floor - ${dropped.length} row(s) DROPPED because this world's card disagrees:\n  ` + dropped.join("\n  "));
    // THE CHECK THAT WAS MISSING. Failing closed and being BROKEN produce the same
    // artifact - an empty table - so "no rows" cannot be allowed to look like the
    // safety behaviour working. If this world holds cards for these keys and NONE
    // of them confirmed, the reader is at fault, not six cards simultaneously.
    // On 27 Aug that state meant `_cardDenied` was being handed unstripped HTML.
    if (!Object.keys(active).length && dropped.length)
      console.error(`AFLP | chastity Denied floor: ${dropped.length} candidate card(s) found and ZERO confirmed. `
        + `That is a reader fault, not a card fault - the floor is granting nothing. Check AFLP.cardText and _cardDenied against a real card body.`);
    console.log(`AFLP | chastity Denied floor on ${AFLP.system?.id}: ${Object.keys(active).length} row(s) card-confirmed`,
      Object.keys(active).length ? Object.entries(active).map(([k, v]) => `${k}=${v}`).join(", ") : "(none)",
      `| ${absent.length} row(s) have no card here (the other system's):`, absent.join(", ") || "-");
    return active;
  },

  async syncDeniedFloor(actor) {
    if (!actor || !AFLP.denied) return;
    // The hooks below are GM-gated, but a stray call from a player client must not
    // half-write: bail rather than proxy, because the GM's own hook will run.
    if (!AFLP.gm?.canWrite?.(actor)) return;

    // The CARD-CONFIRMED rows for this world, never the raw table. `_deniedReady`
    // is awaited so an item created in the first moments after `ready` cannot slip
    // past the gate - without it this would silently do nothing on that item.
    if (this._deniedReady) { try { await this._deniedReady; } catch (e) { /* logged there */ } }
    const rows = this._deniedActive;
    if (!rows) return;                       // gate not built: apply nothing, fail closed

    const rec  = foundry.utils.deepClone(actor.getFlag(AFLP.FLAG_SCOPE, this.FLAG_DENIED) ?? {});
    const worn = new Set(this.worn(actor).map(g => g.key));
    const add = {}, del = [];

    for (const [key, value] of Object.entries(rows)) {
      const on   = worn.has(key);
      const held = Object.hasOwn(rec, key);
      if (on && !held) {
        // Record what they had BEFORE the floor absorbs it.
        // RECORD THE WEARER'S OWN TOKENS, NOT THE TOTAL.
        //
        // `total` includes any floor ALREADY standing from another piece, so the
        // second chastity item recorded the FIRST one's 3 as "what they had
        // before" and handed it back when it came off last. Measured 28 Aug 2026:
        // belt on, harness on, belt off, harness off -> permanent 0 and total 3,
        // a floor nobody was wearing. The suite caught it the moment the card gate
        // started granting for real - before the enricher fix it granted nothing,
        // so this arithmetic had never actually run.
        //
        // `total - permanent` is the part the wearer earned themselves: the floors
        // live in `permanent` (the MAX of the sources) and anything above it is
        // theirs. That is the number the 26 Aug restore was always about - a floor
        // of 3 ABSORBS a pre-existing 2 - and the raw total only looked right
        // while exactly one piece could ever be worn at a time.
        add[key] = Math.max(0, AFLP.denied.total(actor) - AFLP.denied.permanent(actor));
        await AFLP.denied.setSustained(actor, this._deniedSource(key), value);
      } else if (!on && held) {
        const prev   = Number(rec[key]) || 0;
        const before = AFLP.denied.total(actor);
        await AFLP.denied.setSustained(actor, this._deniedSource(key), 0);
        // Only give back what was absorbed, and only if nothing else moved the
        // total meanwhile - the same guard AFLP_LivingGear._revoke uses.
        if (prev > 0 && before === value) await AFLP.denied.raiseTo(actor, prev);
        del.push(key);
      }
    }

    if (!Object.keys(add).length && !del.length) return;
    // `setFlag` MERGES, so a deleted key needs the `-=key: null` form or it comes
    // straight back and the piece would only ever work once.
    const patch = {};
    for (const [k, v] of Object.entries(add)) patch[`flags.${AFLP.FLAG_SCOPE}.${this.FLAG_DENIED}.${k}`] = v;
    for (const k of del)                      patch[`flags.${AFLP.FLAG_SCOPE}.${this.FLAG_DENIED}.-=${k}`] = null;
    await actor.update(patch);
  },

  // Registered on EVERY system - that is the whole point. GM only, so a player
  // client cannot double-apply. Mirrors the three hooks living gear uses, and for
  // the same measured reasons: a piece can arrive already worn (createItem), be
  // deleted outright rather than unequipped (deleteItem), or be equipped and
  // stowed in place (updateItem).
  registerDeniedFloor() {
    if (!game.user?.isGM) return;
    if (this._deniedFloorRegistered) return;      // idempotent: index.js may re-run
    this._deniedFloorRegistered = true;

    // Build the card gate. Hooks bind immediately; `syncDeniedFloor` awaits this,
    // so nothing can be granted before the cards have been read.
    this._deniedReady = this._buildDeniedFloor().catch((e) => {
      console.error("AFLP | chastity Denied floor: could not read the cards - no floor will be applied.", e);
      this._deniedActive = {};                    // fail closed, explicitly
    });

    const touch = async (item) => {
      if (!item?.actor) return;
      // Cheap gate first: only items that could be in the table at all.
      const k = this._keyOf?.(item);
      if (!k || !Object.hasOwn(this.DENIED, k)) return;
      await this.syncDeniedFloor(item.actor);
    };
    Hooks.on("createItem", (item) => { touch(item); });
    Hooks.on("deleteItem", (item) => { touch(item); });
    Hooks.on("updateItem", (item, changes) => {
      // Any equip-shape change. PF2e nests carryType in an object; Daggerheart
      // uses a boolean on weapons/armor and nothing at all on loot, which
      // `_keyOf` -> `anatomy._active` already accounts for.
      if (changes?.system?.equipped === undefined) return;
      touch(item);
    });

    // The CANDIDATE rows. What actually fires is logged by `_buildDeniedFloor`
    // once the cards have been read, and is a subset of this.
    console.log(`AFLP | chastity Denied floor hooks bound on ${AFLP.system?.id}. Candidate rows:`,
      Object.keys(this.DENIED).join(", "));
  },

  // Lubricant burn-off at daily preparations / long rest. Returns what it took.
  //
  // TWO MECHANISMS NOW, and the second is the live one. `drain` takes its rate off
  // every pool; `coatWipe` takes the whole CHEST COAT and nothing else. Ardis,
  // 28 Aug 2026: "lets make the coat dry completely during daily prep. that way they
  // definitely need to grease it daily. facial doesn't count, only bodyCoat."
  //
  // The exoskeleton moved from the first to the second, and it was the only row with
  // a non-zero `drain`, so in practice this function now wipes a coat. The rate half
  // is kept working rather than deleted so a future piece can drain by rate.
  //
  // BOTH SYSTEMS ALREADY CALL THIS - `aflp-rest.js` on Daggerheart and
  // `macro/aflp-daily-prep.js` on Pathfinder - so the change needs no new call site.
  async drainAtRest(actor) {
    const worn = this.worn(actor);
    const rate = Math.max(0, ...worn.map(g => Number(g.drain) || 0));
    const wipesCoat = worn.some(g => g.coatWipe === true);
    if (rate <= 0 && !wipesCoat) return null;
    const cf = foundry.utils.deepClone(AFLP_Cumflation.getCumflation(actor) ?? {});
    const took = {};
    if (rate > 0) {
      for (const [hole, val] of Object.entries(cf)) {
        const n = Number(val) || 0;
        if (n <= 0) continue;
        const after = Math.max(0, n - rate);
        if (after !== n) { took[hole] = n - after; cf[hole] = after; }
      }
    }
    // The coat goes to ZERO, not down by a rate - the suit starts every day dry.
    if (wipesCoat) {
      const bc = Number(cf.bodyCoat) || 0;
      if (bc > 0) { took.bodyCoat = bc; cf.bodyCoat = 0; }
    }
    if (!Object.keys(took).length) return { rate, took: {} };
    if (AFLP.gm.canWrite(actor)) await actor.setFlag(AFLP.FLAG_SCOPE, "cumflation", cf);
    else await AFLP.gm.run("setFlag", actor, "cumflation", cf);
    try { await AFLP_Cumflation.applyCumflationEffects(actor); } catch (e) {}
    // The coat just moved, so the suit's greased/dry state may have moved with it.
    try { await AFLP.exoDry?.sync?.(actor); } catch (e) {}
    return { rate, took };
  },
};

// ── THE EXOSKELETON'S DYNAMIC SEAL ────────────────────────────────────────────
//
// Ardis, 28 Aug 2026: "greased while coat is 4 or more is good. and lets make the
// coat dry completely during daily prep... facial doesn't count, only bodyCoat."
// Settled design: `work/exoskeleton-dry-redline-2026-08-28.md`.
//
// The suit is GREASED while the chest coat is at half or better and DRY below it.
// While Dry the pistons are out: no Plugged, no Chaste, no Caged, no sealed holes,
// and the wearer is easier to open - which is what the card has always said and
// nothing enforced.
//
// COMPUTED, NEVER TOGGLED. `sync` is a function of the current state - is the suit
// worn, and where is the coat - so it cannot drift. A toggle would have to be right
// on every path that can move a cum pool, and this project has already shipped a
// fire-once grant with no counterpart (Bondage Princess, 19 Aug). Call it after
// anything that could change either input; calling it twice is free.
//
// CALL SITES: `applyCumflationEffects` (every cumflation write), the living-gear
// reconcile (the piece going on or off), and `drainAtRest` (the daily wipe).
//
// STALE IF: `AFLP.CUMFLATION_MAX` moves - the threshold is derived from it rather
// than typed as 4, so it follows - or the `bodyCoat` pool is renamed.
AFLP.exoDry = {
  KEY:  "exoskeleton-dry",
  GEAR: "living-exoskeleton",
  // Half the cap, the same half-coverage point the slick and the Horny grant use.
  get THRESHOLD() { return Math.ceil((AFLP.CUMFLATION_MAX ?? 8) / 2); },

  wearing(actor) {
    try { return (AFLP.chastityGear?.worn?.(actor) ?? []).some(g => g.key === this.GEAR); }
    catch (e) { return false; }
  },
  coat(actor) {
    try { return Number(actor?.getFlag?.(AFLP.FLAG_SCOPE, "cumflation")?.bodyCoat) || 0; }
    catch (e) { return 0; }
  },
  // NOT DRY WITHOUT THE SUIT. A creature with no exoskeleton has no joints to run
  // dry, so the condition must never appear on one - failing that way round would
  // suspend nothing and confuse everyone.
  isDry(actor) { return this.wearing(actor) && this.coat(actor) < this.THRESHOLD; },

  async sync(actor) {
    if (!actor) return null;
    const want = this.isDry(actor);
    let has = false;
    try { has = AFLP.cond.has(actor, this.KEY) === true; } catch (e) { has = false; }
    if (want === has) return want;
    try {
      if (want) await AFLP.cond.apply(actor, this.KEY, 1);
      else      await AFLP.cond.remove(actor, this.KEY);
    } catch (e) { console.warn("AFLP | exoDry.sync could not write the condition", e); }
    return want;
  },
};

AFLP.milkingStation = {
  KEY: "effect-milking-station",

  // PF2e strapping someone in applies an EFFECT; DH has no such effect and uses
  // the gear item directly, so both have to count. Checking only the effect meant
  // the DH cum capture could never fire - captureCum returned 0 every time.
  on(actor) {
    try {
      if ((AFLP.cond?.value?.(actor, this.KEY) ?? 0) > 0) return true;
      for (const it of (actor?.items ?? [])) {
        if (it?.getFlag?.("ardisfoxxs-lewd-pf2e", "aflrKey") !== "living-milking-station") continue;
        if (AFLP.anatomy._active(it)) return true;
      }
      return false;
    } catch (e) { return false; }
  },

  // Milk overflow. Takes the amount the pool REFUSED, not a surplus sitting in it -
  // milk.produce clamps to capacity internally and throws the remainder away, so
  // reading stored-minus-capacity afterwards is always zero. Pass how much was
  // offered and how much actually landed; the difference is what the station gets.
  async captureMilk(actor, offered = 0, stored = 0) {
    if (!actor || !this.on(actor)) return 0;
    const over = Math.max(0, Math.round(Number(offered) || 0) - Math.max(0, Math.round(Number(stored) || 0)));
    if (over <= 0) return 0;
    return await AFLP.milkBottle.grant(actor, over);
  },

  // Cum overflow. sourceActor types the vial by its creature type, so a captive
  // milked by a dragon banks dragon cum - the most recent source wins, which is
  // why this is called per resolution rather than aggregated.
  //
  // DH differs deliberately. Each product has exactly one route there: milk comes
  // from resting in a harness or station, plain cum comes off the floor with the
  // Cum Cleaner, and milky cum comes from overflowing while strapped into a
  // station. So on DH the bucket yields Bottle of Milky Cum rather than vials,
  // and the spill never reaches the floor for the Cleaner to find.
  async captureCum(actor, sourceActor, overflowUnits) {
    if (!actor || !this.on(actor)) return 0;
    const n = Math.max(0, Math.round(Number(overflowUnits) || 0));
    if (n <= 0) return 0;
    if (AFLP.system?.id === "daggerheart") return await AFLP.cumBottle.grant(actor, n);
    const traits = sourceActor?.system?.traits?.value ?? [];
    const type = window.AFLP_Alcumist?.getCreatureType?.(traits) ?? null;
    let made = 0;
    for (let i = 0; i < n; i++) {
      if (type && window.AFLP_Alcumist?.grantTypedVial) await AFLP_Alcumist.grantTypedVial(actor, type);
      else if (AFLP_Alcumist?.grantTypedVial) await AFLP_Alcumist.grantTypedVial(actor, null);
      made++;
    }
    return made;
  },

  // Worn milking gear, by key. DELIBERATELY FLAT, unlike the PF2e pool.
  //
  // PF2e scales capacity with absolute tit size because it is a pool: it costs an
  // action per unit to dispense, so depth limits itself. In DH each Bottled Milk
  // is a free Hit Point with no action cost, so the number has to stay small and
  // legible rather than derived. Harness one, station two, three at Hyper - the
  // one exception, so the anatomy that is meant to be absurd still feels it.
  gearRate(actor) {
    try {
      if (!AFLP.system?.isLactating?.(actor)) return 0;
      const hyper = (actor?.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["tits-hyper"] === true;
      let best = 0;
      for (const it of (actor?.items ?? [])) {
        const k = it?.getFlag?.("ardisfoxxs-lewd-pf2e", "aflrKey");
        // Mundane and living forms both milk you - the mimic-stuff changes how
        // the piece behaves when you try to take it off, not what it does while
        // worn. Only the living keys were listed, so every mundane harness and
        // station granted nothing at a rest despite its text saying otherwise.
        const HARNESS = k === "milkmaid-harness" || k === "living-milkmaid-harness";
        const STATION = k === "milking-station"  || k === "living-milking-station";
        if (!HARNESS && !STATION) continue;
        if (!AFLP.anatomy._active(it)) continue;
        const n = STATION ? (hyper ? 3 : 2) : 1;
        if (n > best) best = n;
      }
      return best;
    } catch (e) { return 0; }
  },

  // Called from the rest handler: a rest spent in milking gear is drawn off into
  // Bottled Milk. DH only - PF2e produces milk on climax and needs no rest tick.
  async drawOffAtRest(actor) {
    if (AFLP.system?.id !== "daggerheart") return 0;
    const n = this.gearRate(actor);
    if (n <= 0) return 0;
    return await AFLP.milkBottle.grant(actor, n);
  },
};

// The Alcumist's daily distillates. Storage stays on the legacy flag key so no
// existing character loses their allowance; only the player-facing name changed,
// the same way "coomer" still backs Loads.
//
// The allowance is HALF your Loads (the item text's wording), floored at 1 and
// capped at 6 - the cap exists because Loads is buffable to 20 or 40 by the
// Monster Energy line, and drinking one before daily preparations should not
// mint twenty distillates.
AFLP.alcumy = {
  FLAG: "_alcumistVials",
  MAX: 6,

  allowance(actor) {
    const loads = AFLP.effectiveLoads?.(actor) ?? AFLP.COOMER_DEFAULT;
    let n = Math.max(1, Math.min(this.MAX, Math.floor(loads / 2)));
    // Primed Formula grants one free distillate "in addition to your normal
    // allotment", so it sits OUTSIDE the cap rather than being swallowed by it.
    // Taken multiple times, each instance names a different formula.
    const primed = (actor?.items ?? []).filter(it => it?.name === "Primed Formula").length;
    return n + primed;
  },

  count(actor) {
    const n = Number(actor?.getFlag?.(AFLP.FLAG_SCOPE, this.FLAG));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  },

  async set(actor, n) {
    const v = Math.max(0, Math.round(Number(n) || 0));
    if (AFLP.gm.canWrite(actor)) await actor.setFlag(AFLP.FLAG_SCOPE, this.FLAG, v);
    else await AFLP.gm.run("setFlag", actor, this.FLAG, v);
    return v;
  },

  // Refresh at daily preparations. Does not carry over - Advanced Alchemy's
  // allowance lasts "until your next daily preparations", and so does this.
  async refresh(actor) { return await this.set(actor, this.allowance(actor)); },

  // ---- Formula book -------------------------------------------------------
  // Stored in AFLR's own flag rather than PF2e's system.crafting.formulas: the
  // native book feeds PF2e's own Craft downtime activity, and an Alcumical item
  // sitting there would look craftable by rules that bypass Distillates entirely.
  FORMULA_FLAG: "alcumyFormulas",

  // Granted outright by feats, no choice involved.
  fixedFormulas(actor) {
    const names = [...(AFLP_Alcumist?.STARTER_FORMULAS ?? [])];
    if ((actor?.items ?? []).some(it => it?.name === "Sticky Bomb")) {
      names.push("Sticky Bomb (Lesser)", "Sticky Bomb (Moderate)");
    }
    return names;
  },

  // How many free choices the character has earned: two per Cumcraft feat.
  formulaPicks(actor) {
    const CUMCRAFT = ["Basic Cumcraft", "Advanced Cumcraft", "Greater Cumcraft"];
    return (actor?.items ?? []).filter(it => CUMCRAFT.includes(it?.name)).length * 2;
  },

  // Names the character has chosen. Fixed grants are added on read so they can
  // never be lost or spent, and so an existing character needs no migration.
  chosenFormulas(actor) {
    const raw = actor?.getFlag?.(AFLP.FLAG_SCOPE, this.FORMULA_FLAG);
    return Array.isArray(raw) ? raw.filter(x => typeof x === "string") : [];
  },

  knownFormulas(actor) {
    return [...new Set([...this.fixedFormulas(actor), ...this.chosenFormulas(actor)])];
  },

  picksRemaining(actor) {
    return Math.max(0, this.formulaPicks(actor) - this.chosenFormulas(actor).length);
  },

  async learn(actor, names = []) {
    const add = (Array.isArray(names) ? names : [names]).filter(Boolean);
    if (!add.length) return 0;
    const cur = this.chosenFormulas(actor);
    const room = this.picksRemaining(actor);
    const take = add.filter(n => !cur.includes(n)).slice(0, room);
    if (!take.length) return 0;
    const next = [...cur, ...take];
    if (AFLP.gm.canWrite(actor)) await actor.setFlag(AFLP.FLAG_SCOPE, this.FORMULA_FLAG, next);
    else await AFLP.gm.run("setFlag", actor, this.FORMULA_FLAG, next);
    return take.length;
  },

  // GM override: put formulas in the book regardless of earned picks. The rules
  // answer is that a Cumcraft feat grants two formulas, matching PF2e's own
  // crafting feats (Alchemical Crafting grants four, Magical Crafting four) -
  // never blanket access to a band. But a table may want to hand a returning
  // character back what they had been making for months, and that is the GM's
  // call, not a flag they should be editing by hand.
  async grant(actor, names = []) {
    const add = (Array.isArray(names) ? names : [names]).filter(Boolean);
    if (!add.length) return 0;
    const cur = this.chosenFormulas(actor);
    const take = add.filter(n => !cur.includes(n));
    if (!take.length) return 0;
    const next = [...cur, ...take];
    if (AFLP.gm.canWrite(actor)) await actor.setFlag(AFLP.FLAG_SCOPE, this.FORMULA_FLAG, next);
    else await AFLP.gm.run("setFlag", actor, this.FORMULA_FLAG, next);
    return take.length;
  },

  // Spend on a craft. Returns how many were actually taken.
  async spend(actor, n = 1) {
    const have = this.count(actor);
    const take = Math.max(0, Math.min(have, Math.round(Number(n) || 0)));
    if (take > 0) await this.set(actor, have - take);
    return take;
  },
};

AFLP.milkBottle = {
  KEY: "bottled-milk",
  NAME: "Bottled Milk",

  uuid() { return AFLP.system?.contentUuid?.(this.KEY) ?? null; },

  _is(it) {
    return it?.getFlag?.(AFLP.MODULE_ID ?? "ardisfoxxs-lewd-pf2e", "aflrKey") === this.KEY
        || it?.name === this.NAME;
  },

  count(actor) {
    let n = 0;
    for (const it of (actor?.items ?? [])) {
      if (this._is(it)) n += Math.max(1, Number(it.system?.quantity?.value ?? it.system?.quantity ?? 1) || 1);
    }
    return n;
  },

  async grant(actor, qty = 1) {
    if (!actor || qty < 1) return 0;
    const uuid = this.uuid();
    if (!uuid) { ui.notifications?.warn("AFLR | Bottled Milk item not found in the content index."); return 0; }
    const src = await fromUuid(uuid);
    if (!src) return 0;
    const obj = src.toObject();
    delete obj._id;
    if (obj.system?.quantity !== undefined) {
      if (typeof obj.system.quantity === "object") obj.system.quantity.value = qty;
      else obj.system.quantity = qty;
    }
    if (AFLP.gm.canWrite(actor)) await actor.createEmbeddedDocuments("Item", [obj]);
    else await AFLP.gm.run("createItem", actor, obj);
    return qty;
  },

  async spend(actor, qty = 1) {
    let left = qty;
    for (const it of [...(actor?.items ?? [])]) {
      if (left <= 0) break;
      if (!this._is(it)) continue;
      const have = Math.max(1, Number(it.system?.quantity?.value ?? it.system?.quantity ?? 1) || 1);
      const take = Math.min(have, left);
      left -= take;
      if (take >= have) { await it.delete(); continue; }
      const next = have - take;
      if (typeof it.system?.quantity === "object") await it.update({ "system.quantity.value": next });
      else await it.update({ "system.quantity": next });
    }
    return qty - left;
  },
};

AFLP.cumBottle = {
  KEY: "bottle-of-milky-cum",

  uuid() { return AFLP.system?.contentUuid?.(this.KEY) ?? null; },

  // Every Bottle of Milky Cum the actor is carrying, counting stack quantity.
  count(actor) {
    let n = 0;
    for (const it of (actor?.items ?? [])) {
      if (it.getFlag?.(AFLP.MODULE_ID ?? "ardisfoxxs-lewd-pf2e", "aflrKey") === this.KEY
          || it.name === "Bottle of Milky Cum") {
        n += Math.max(1, Number(it.system?.quantity?.value ?? it.system?.quantity ?? 1) || 1);
      }
    }
    return n;
  },

  async grant(actor, qty = 1) {
    if (!actor || qty < 1) return 0;
    const uuid = this.uuid();
    if (!uuid) { ui.notifications?.warn("AFLR | Bottle of Milky Cum item not found in the content index."); return 0; }
    const src = await fromUuid(uuid);
    if (!src) return 0;
    const obj = src.toObject();
    delete obj._id;
    if (obj.system?.quantity !== undefined) {
      if (typeof obj.system.quantity === "object") obj.system.quantity.value = qty;
      else obj.system.quantity = qty;
    }
    if (AFLP.gm.canWrite(actor)) await actor.createEmbeddedDocuments("Item", [obj]);
    else await AFLP.gm.run("createItem", actor, obj);
    return qty;
  },

  // Spend bottles; returns how many were actually consumed.
  async spend(actor, qty = 1) {
    let left = qty;
    for (const it of [...(actor?.items ?? [])]) {
      if (left <= 0) break;
      const isBottle = it.getFlag?.(AFLP.MODULE_ID ?? "ardisfoxxs-lewd-pf2e", "aflrKey") === this.KEY
        || it.name === "Bottle of Milky Cum";
      if (!isBottle) continue;
      const have = Math.max(1, Number(it.system?.quantity?.value ?? it.system?.quantity ?? 1) || 1);
      const take = Math.min(have, left);
      left -= take;
      if (take >= have) { await it.delete(); continue; }
      // Write back in whatever shape the system stores: PF2e keeps quantity as
      // a plain number, so writing "system.quantity.value" silently mangled the
      // field and a stack of 3 came back as 1 after spending 1.
      const isObj = typeof it.system?.quantity === "object" && it.system.quantity !== null;
      await it.update(isObj ? { "system.quantity.value": have - take }
                            : { "system.quantity": have - take });
    }
    return qty - left;
  },
};

// ── Knot ────────────────────────────────────────────────────────────────
// Cock (Knot): cumming inside a creature locks the knot in place. The partner
// is Grabbed by the cock and auto-fails Escape attempts; only an external
// force beating the owner's Fortitude DC pops it free. State lives on the
// PARTNER as a world-scope flag naming the owning TOKEN (not the actor - two
// unlinked tokens off one sheet must knot independently).
// THE BULL'S GRIP: what this creature's Greater beat adds to the DC of getting
// away from them.
//
// Ardis, 26 Aug 2026. The Bull card's Greater beat used to read "+2 circumstance
// bonus to Sexual Advance checks against a creature you have grabbed", and THERE
// IS NO SEXUAL ADVANCE CHECK - Carnal Press rolls no dice at all, it marks
// Arousal. The bonus was unreadable by anything and had been since it shipped.
// Rewritten to "+2 to your Fortitude DC against Escape attempts by creatures you
// have grabbed", which is a number the escape path already computes.
//
// It complements the rest of the kink rather than overlapping it: Signature gives
// +1 on Athletics to grapple, so the Bull is better at TAKING hold and this is
// what makes hold harder to break.
//
// GATED ON HAVING THE CARD, NOT ON THE SYSTEM NAME. `bull` is a PF2e-only kink
// today, so this reads 0 everywhere else on its own; a system check would have to
// be found and removed if the kink is ever ported.
//
// GOES STALE IF: the Bull card's Greater beat is reworded again, or the beat
// ladder stops putting Greater at tier 2.
AFLP.bullGripDC = (actor) => {
  if (!actor || !AFLP.actorHasKink?.(actor, "bull")) return 0;
  return (AFLP.getKinkTier?.(actor, "bull") ?? 0) >= 2 ? 2 : 0;   // 2 = Greater
};

AFLP.knot = {
  FLAG: "knottedBy",

  get(actor) {
    const k = actor?.getFlag?.(AFLP.FLAG_SCOPE, this.FLAG) ?? null;
    return (k && k.tokenId) ? k : null;
  },

  heldBy(actor, ownerTokenId) {
    const k = this.get(actor);
    return !!(k && ownerTokenId && k.tokenId === ownerTokenId);
  },

  async tie(ownerActor, ownerTokenId, partnerActor) {
    if (!ownerActor || !partnerActor || !ownerTokenId) return null;
    // The Bull's +2 is stamped in HERE rather than added by the reader, because
    // `fortDC` is already a snapshot of the grip taken at the moment it closed -
    // that is what the flag is - and there is exactly one reader (the Knotted
    // branch of Struggle Escape, which prints it for the GM to adjudicate a Pull
    // Free against). Ardis, 26 Aug 2026: the bonus "would apply to escape from
    // knotted as you outlined".
    //
    // KNOWN AND ACCEPTED: a knot tied before its owner reached Greater keeps the
    // DC it was tied at. So does a knot tied before this change shipped.
    // `bull` is stored ALONGSIDE the total rather than only folded into it. The
    // number is printed to a GM who then adjudicates against it, and a DC two
    // higher than the statblock's Fortitude with nothing saying why is how a
    // working feature gets reported as a bug.
    const bull   = AFLP.bullGripDC?.(ownerActor) ?? 0;
    const fortDC = 10 + Number(ownerActor.system?.saves?.fortitude?.value ?? 0) + bull;
    const data = { tokenId: ownerTokenId, actorId: ownerActor.id, name: ownerActor.name, fortDC, bull };
    if (AFLP.gm.canWrite(partnerActor)) await partnerActor.setFlag(AFLP.FLAG_SCOPE, this.FLAG, data);
    else await AFLP.gm.run("setFlag", partnerActor, this.FLAG, data);
    await AFLP.system?.applyNativeCondition?.(partnerActor, "grabbed");
    return data;
  },

  // Null rather than a key delete: setFlag is the only write op guarded for
  // non-owned actors, and get() already treats a null as untied.
  async release(partnerActor) {
    if (!partnerActor || !this.get(partnerActor)) return false;
    if (AFLP.gm.canWrite(partnerActor)) await partnerActor.setFlag(AFLP.FLAG_SCOPE, this.FLAG, null);
    else await AFLP.gm.run("setFlag", partnerActor, this.FLAG, null);
    return true;
  },

  // NOTE: there is deliberately no dragsWith helper any more. Dragging a knotted
  // partner along is GM adjudication, not automation - the movement hooks that
  // used it were unmanageable across Foundry versions. The size rule ("a knotted
  // creature of the owner's size or smaller comes along") lives in the Cock
  // (Knot) item text, where the GM reads it.
};

AFLP.cockSizeOf = (actor) => {
  if (!actor || actor.getFlag?.(AFLP.FLAG_SCOPE, "cock") !== true) return 0;
  let size = AFLP.bodySizeSteps(actor);
  const gt = actor.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {};
  if (gt["cock-girthy"]) size += 1;
  // Cock (Micro): the mirror of Girthy, one step DOWN.
  if (gt["cock-micro"]) size -= 1;
  // Stretch King counts your COCK as one size larger at Greater and two at
  // Mastery, which is what makes the kink read out of the size gap rather than
  // comparing creature sizes. Levels are the card's: Greater 5, Mastery 8.
  // This read `>= 7` for the +2, granting Mastery's cock a level early.
  const sk = AFLP.getKinkLevel?.(actor, "stretch-king") ?? 0;
  if (sk >= 8) size += 2; else if (sk >= 5) size += 1;
  // FLOOR OF 1, and it is load-bearing. Zero is this function's sentinel for
  // "this creature has no cock" - the first line returns 0 for exactly that -
  // and AFLP.sizeGap reads `if (cock <= 0) return 0` meaning "nothing
  // penetrative to measure". A cock that computed to 0 would therefore be
  // indistinguishable from no cock at all: every act would report a gap of 0,
  // so nothing would ever read Stuffed, Stretched or Ruined, and because size
  // TRAINING pays out on the gap, no partner would ever train. Cock (Micro) is
  // the smallest real cock, not the absence of one.
  return Math.max(1, size);
};

// Hole size: body size, +1 if the hole carries its trained Body Feature.
// hole: "vaginal" | "oral" | "anal". bodyFeatures flag is granted by the size
// training tracks (Size Queen / Throat Goat / Gape Glutton); the legacy
// pussy-bottomless subtype counts for the pussy for existing content.
AFLP.holeSizeOf = (actor, hole) => {
  if (!actor) return 0;
  // The onahole is sized by the tits, but on the same FRAME scale as every other
  // hole - creature size plus how enhanced the tits are. Using raw titsSize here
  // compared a cup measure against a frame measure, so a Gargantuan creature's
  // own cock read as Ruined against its own tits. Paizuri Slut is already an
  // input to titsSize, so it must not be added again here.
  if (hole === "onahole" || hole === "nipples") return AFLP.absoluteTitSize(actor);
  let size = AFLP.bodySizeSteps(actor);
  const bf = actor.getFlag?.(AFLP.FLAG_SCOPE, "bodyFeatures") ?? {};
  const key = hole === "vaginal" ? "pussy" : hole === "oral" ? "oral" : hole === "anal" ? "anal" : null;
  if (key && bf[key]) size += 1;
  // Bottomless is its own +1 Pussy size, exactly as Girthy is +1 Cock size, and
  // it STACKS with Size Queen. It used to be an else-branch, so a trained
  // bottomless pussy scored the same as a trained ordinary one.
  if (hole === "vaginal" && (actor.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["pussy-bottomless"]) size += 1;
  // Ass (Deep) is the same +1, stacking with Gape Glutton. Ass (Stretchy)
  // is the goblin body and removes the gap entirely, handled at the gap site
  // rather than here - a size number would still read wrong against a Gargantuan.
  if (hole === "anal" && (actor.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["ass-deep"]) size += 1;
  // Deepthroat enlarges the oral hole by 1 (feeds size-gap the same way training does).
  if (hole === "oral" && (actor.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["throat-deep"]) size += 1;
  return size;
};

// The one number: source's cock vs receiver's hole, clamped 0-3.
// Returns 0 when there is nothing penetrative to measure.
AFLP.sizeGap = (source, receiver, hole) => {
  if (!source || !receiver || !["vaginal", "oral", "anal", "onahole", "nipples"].includes(hole)) return 0;
  const cock = AFLP.cockSizeOf(source);
  if (cock <= 0) return 0;
  // Ass (Stretchy): the goblin body. It gives to whatever is put in it, so there
  // is never a gap - which also means it never trains, since training pays out on
  // the gap. Nothing ruins it however much it takes.
  if (hole === "anal"
    && (receiver.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["ass-stretchy"]) return 0;
  return Math.max(0, Math.min(3, cock - AFLP.holeSizeOf(receiver, hole)));
};

// Gap words + colors for the H-Scene UI. Full is the gap-0 word so a filled
// hole chip's second line is never empty; the ramp mirrors the cumflation
// label escalation feel.
AFLP.GAP_LABELS = [
  { gap: 0, word: "Full",      color: "rgba(200,160,80,0.8)",  glow: "rgba(200,160,80,0.3)" },
  { gap: 1, word: "Stuffed",   color: "rgba(210,150,70,0.9)",  glow: "rgba(210,150,70,0.4)" },
  { gap: 2, word: "Stretched", color: "rgba(220,120,60,0.95)", glow: "rgba(220,120,60,0.45)" },
  { gap: 3, word: "Ruined",    color: "rgba(230,60,80,1)",     glow: "rgba(230,60,80,0.55)" },
];
AFLP.gapLabel = (gap) => AFLP.GAP_LABELS[Math.max(0, Math.min(3, Math.floor(gap || 0)))];

// Apply the Size Difference effects for one landed sexual act (DH Carnal Press
// or PF2e Sexual Advance). Resolves the source's live penile position in the
// battlemap H-Scene, measures the gap against that hole, and applies the tier
// effects with the Size Difference kink's gates:
//   Stuffed (1):   +1 Arousal both sides (returned as extras; caller marks).
//   Stretched (2): +1 Arousal receiver; first penetration of that hole per
//                  scene bites via AFLP.system.sizePenalty (DH: 1 Stress;
//                  PF2e: 1d4 nonlethal + Clumsy 1). Kink Signature converts
//                  the bite to +1 Arousal.
//   Ruined (3):    as Stretched, plus the pin via AFLP.system.sizeRestrain
//                  (DH: Restrained; PF2e: Grabbed), unless kink Mastery.
// Returns { extraTarget, extraSource, gap, hole, scene } (zeros/nulls when
// there is nothing penetrative to measure). Announces once per hole per scene.
// ============================================================================
// EFFECTS LAYER - declarative intents emitted as real per-system sheet effects.
// DH emits a typed ActiveEffect on the actor; PF2e emits a carrier effect Item
// with Rule Elements (PF2e ignores AEs for stats). Both are tagged
// flags["ardisfoxxs-lewd-pf2e"].effectIntent = key; idempotency and cleanup
// match on that flag only (never names, per the collision rule).
// Conditional intents declare when(actor); AFLP.effects.sync(actor) is the one
// choke point that applies/removes them, called from every cumflation write,
// kink grant/shed, and daily prep. GM-gated: player-side calls no-op.
// ============================================================================

// Overall cumflation tier (the pools/status tiering): floor of the three
// fillable holes' units averaged, clamped 0-8. "Cumflated tier 4+" reads this.
AFLP.cumflationTier = (actor) => {
  try {
    const cf = actor?.getFlag?.(AFLP.FLAG_SCOPE, "cumflation") ?? {};
    return Math.min(AFLP.CUMFLATION_MAX ?? 8, Math.floor(((cf.anal ?? 0) + (cf.oral ?? 0) + (cf.vaginal ?? 0)) / 3));
  } catch (e) { return 0; }
};

// Slick: how cum-coated the whole body is. Reads the body-coat cumflation pool and
// scales at 4 and 8 pips -> tier 1 / 2. A coated body is slippery (eases Escape,
// including out of Stuck Submitting) and radiates arousal: it applies Horny equal
// to the tier to the coated creature AND to anyone performing on them. Like the
// other cumflation pools it does not wear off on its own. Returns 0 / 1 / 2.
// Horny granted by the coat is deliberately NOT taken back. cumflation.js's
// _applySlick documents the rule: getting coated grants Horny, and wiping down
// must not cure your own arousal. Only the grant marker resets, so a fresh coat
// can grant again.
// Cum Slut Mastery: slip a hold without a roll, and the coat is spent doing it.
//
// BOTH SYSTEMS as of 10 Aug 2026. This was DH-only for a while, deliberately -
// PF2e's card said escapes "automatically succeed" and named no cost, so
// charging PF2e the coat would have been the code doing something the card did
// not say. Ardis reworded the PF2e card to state the same rule, so the gate came
// off. If either card ever diverges again, this is the line to put back.
AFLP.cumSlutSlipFree = async (actor) => {
  if (!actor) return false;
  if (!AFLP.actorHasKink?.(actor, "cum-slut")) return false;
  if ((AFLP.getKinkTier?.(actor, "cum-slut") ?? 0) < 3) return false;
  if ((AFLP.slickTier?.(actor) ?? 0) < 1) return false;
  const wa = actor.getWorldActor?.() ?? actor;
  try {
    const cf = { ...(wa.getFlag?.(AFLP.FLAG_SCOPE, "cumflation") ?? {}) };
    cf.bodyCoat = 0;
    await wa.setFlag(AFLP.FLAG_SCOPE, "cumflation", cf);
    await wa.unsetFlag(AFLP.FLAG_SCOPE, "aflpSlickHorny");
  } catch (e) { return false; }
  return true;
};

AFLP.slickTier = (actor) => {
  try {
    const bc = Number(actor?.getFlag?.(AFLP.FLAG_SCOPE, "cumflation")?.bodyCoat) || 0;
    const M = AFLP.CUMFLATION_MAX ?? 8;
    return bc >= M ? 2 : bc >= Math.ceil(M / 2) ? 1 : 0;
  } catch (e) { return 0; }
};

// A slick body is harder to hold: +1 to Escape at half chest coat, +2 at full.
//
// Ardis, 29 Aug 2026: "The slick from chest and tits coat should apply to Escape
// in general not just from Stuck Submitting, and instead of lowering the DC it
// should grant a circumstance bonus of 1 and 2 for tier 4 and 8." It used to
// subtract 2 per tier from `stuckSubmitting.escapeDC` - the wrong side of the
// roll, and reachable only from AFLR's own hold.
//
// THE BONUS IS DELIVERED TWICE, ON PURPOSE, AND THE TWO CANNOT BOTH FIRE:
//
//   PF2e's own Escape action   a FlatModifier on the coat's card, predicated on
//                              `action:escape` - see _applySlick in cumflation.js.
//                              Nothing in AFLR can reach that roll from outside.
//   AFLR's own escape rolls    this number, added to the raw d20 in
//                              stuckSubmitting.attemptEscape. That Roll carries no
//                              roll options at all, so the rule element cannot see
//                              it, and Daggerheart has no rule elements either.
//
// STALE - AND A DOUBLE COUNT - IF: an AFLR escape roll is ever routed through the
// PF2e Escape action, or given the `action:escape` roll option. Then drop the
// hand-added number from that roll and let the rule element do it.
//
// Ardis, 29 Aug 2026: "should apply the slick circumstance bonus to all escape
// attempt rolls. swallowed included." Every AFLR escape roll takes it:
// stuckSubmitting.attemptEscape, swallowed.attemptEscape, and the four Struggle
// Escape variants in macro/aflp-struggle-snuggle.js.
//
// STILL EXCLUDED, and it is a different mechanic: Cum Slut Mastery's no-roll slip
// (AFLP.cumSlutSlipFree) is deliberately not offered against a swallow - see the
// comment in stuckSubmitting.attemptEscape. Getting a BONUS to climb out is not
// the same as walking out for free.
AFLP.slickEscapeBonus = (actor) => AFLP.slickTier?.(actor) ?? 0;

// The same bonus in the shape a PF2e Statistic#roll takes, for AFLR's escape rolls
// that go through the system's dice rather than a bare Roll - the Struggle Escape
// variants. Returns an ARRAY so a call site can spread it with no branch.
//
// MEASURED 29 Aug 2026: `statistic.roll({ modifiers: [...] })` lands - Athletics
// 1d20+10 became 1d20+12 with a +2 circumstance modifier passed in.
//
// Deliberately NOT the `action:escape` roll option, which would also work: that
// option is PF2e's own, and putting it on a Deception-based Sly Escape would opt
// AFLR's variants into every other piece of content predicated on the system's
// Escape action. This delivers the bonus and nothing else.
AFLP.slickEscapeModifiers = (actor) => {
  const n = AFLP.slickEscapeBonus?.(actor) ?? 0;
  if (!n) return [];
  const M = game.pf2e?.Modifier;
  if (!M) return [];
  try { return [new M({ label: "Slick", modifier: n, type: "circumstance" })]; }
  catch (e) { console.warn("AFLP | slick modifier could not be built", e); return []; }
};

// Is this actor lactating? Delegates to the adapter because the systems answer
// differently: PF2e and 5e carry a Tits (Lactating) anatomy subtype, while DH
// deliberately has none and uses the Leaking condition. Kept separate from
// AFLP.milk.isLactating, which gates the numeric milk POOL (PF2e/5e only).
AFLP.isLactating = (actor) => {
  try { return AFLP.system?.isLactating?.(actor) === true; } catch (e) { return false; }
};

// Tits size (0 = no tits) is the CONTAINER: how big the tits are, on the creature
// size ladder 1-6 that cocks and every other hole already use. One point per body
// fact, and Hyper is a ceiling rather than a bonus.
//
//   1  has tits          +1 Bimbofied     +1 Pregnant
//   +1 Lactating         +1 Paizuri Slut  Hyper -> 6
//
// Every input is a BODY FACT. No fluid level feeds this: cum in the onahole and
// stored milk both belong to titsSwell below. That separation is deliberate -
// tits size sets milk capacity, so letting a fluid raise size would let filling
// up raise its own ceiling, and letting cum raise it meant pumping someone full
// of cum made them produce more milk.
AFLP.TITS_SIZE_MAX       = 8;   // Hyper only
AFLP.TITS_SIZE_MAX_NATURAL = 6; // everything stacking can reach without Hyper
// Bonus flag an item carries to enlarge the tits it is worn on, e.g. the Cowbell
// of the Docile Slut and the Tattoo of the Lusty Milk Maid at +1 each. Counted
// only while the item is actually worn and invested (AFLP.anatomy._active).
AFLP.TITS_BONUS_FLAG = "titsSizeBonus";
AFLP.titsItemBonus = (actor) => {
  try {
    let bonus = 0;
    for (const it of (actor?.items ?? [])) {
      const b = Number(it?.getFlag?.("ardisfoxxs-lewd-pf2e", AFLP.TITS_BONUS_FLAG) ?? 0);
      if (!b) continue;
      if (!AFLP.anatomy._active(it)) continue;
      bonus += b;
    }
    return bonus;
  } catch (e) { return 0; }
};
AFLP.titsSize = (actor) => {
  try {
    const af = actor?.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {};
    if (!af.tits && !af["tits-onahole"]) return 0;
    let size = 1;
    if ((AFLP.cond?.value?.(actor, "bimbofied") ?? 0) > 0) size += 1;
    if (Object.keys(actor?.getFlag?.(AFLP.FLAG_SCOPE, "pregnancy") ?? {}).length > 0) size += 1;
    if (AFLP.isLactating(actor)) size += 1;
    if ((actor?.getFlag?.(AFLP.FLAG_SCOPE, "bodyFeatures") ?? {})["onahole"]) size += 1;
    // Tits (Heavy). Added 10 Aug 2026: the subtype's own card says "twice the
    // size" and it had no size effect at all - its ONLY mechanic was a +1 to the
    // Wallbang arousal bonus in aflp-gangbang, which needs a troop with Wallbang
    // AND the target already Stuck Submitting. Outside that it did nothing.
    // Sizing it pays off the flavour and feeds absoluteTitSize, so it reaches the
    // onahole's hole size, the milk capacity and the size gap through code that
    // already exists. The natural cap below still applies, so Hyper stays the
    // only route to 8.
    if (af["tits-heavy"]) size += 1;
    // Tits (Itty Bitty), 27 Aug 2026 - the mirror of Tits (Heavy), and the tits
    // answer to Cock (Micro). Ardis: "it reduces the size of tits by 1, floor 1 so
    // they dont get removed by setting to 0."
    //
    // THE FLOOR IS NOT TIDINESS. `titsSize` returns 0 for "this creature has no
    // tits" (the guard at the top), exactly as `cockSizeOf` returns 0 for "no
    // cock" - so a -1 that reached 0 would not make a small chest, it would switch
    // the whole body part off: no Paizuri, no onahole hole, no milk capacity.
    // Same reserved-zero rule the `cock-micro` registry row states.
    if (af["tits-itty-bitty"]) size -= 1;
    size += AFLP.titsItemBonus(actor);
    // The floor also now covers a NEGATIVE `titsSizeBonus` on an item, which
    // nothing ships today and which previously had nothing stopping it.
    size = Math.max(1, Math.min(AFLP.TITS_SIZE_MAX_NATURAL, size));

    // ── HYPER OVERRIDES EVERYTHING, AND IT IS THE LAST WORD ON PURPOSE ──────
    //
    // Ardis, 27 Aug 2026, rewriting the card: "Your tits size is 8, the maximum,
    // OVERRIDING ALL OTHER EFFECTS THAT LOWER OR RAISE IT. Nothing else can raise
    // it past 6." He asked for a guard that holds for lowering effects added
    // later, not just for Itty Bitty.
    //
    // This USED to be an early return above the modifiers, which was correct only
    // because of where it sat. A lowering effect added ABOVE it - the natural
    // place, next to the other modifiers - would have escaped it silently and made
    // a liar of the card. Placed LAST, every modifier feeds `size` and `size` is
    // then discarded, so no future modifier can escape it wherever it is written.
    //
    // The natural cap above sits at 6 so that however many +1 sources are added
    // later, stacking can never reach Hyper's number by accident.
    //
    // GOES STALE IF: a tits-size effect is applied OUTSIDE this function - a caller
    // doing `titsSize(a) - 1`, or a negative bonus reaching `absoluteTitSize`.
    // Nothing does today, and the card's promise depends on nothing ever doing.
    if (af["tits-hyper"]) return AFLP.TITS_SIZE_MAX;
    return size;
  } catch (e) { return 0; }
};
// How big these tits actually ARE, rather than how big they are for this body.
//
// titsSize is a CUP measure - it starts at 1 for anyone with tits and counts body
// facts, so a kaiju and a housecat with D cups both read 2. Cock and hole sizes
// are FRAME measures built from creature size. Comparing the two directly meant a
// Gargantuan creature's own cock read as "Ruined" against its own tits, and a
// Medium pair read as "Stretched" - only Tiny creatures ever fit.
//
// Frame plus enhancement fixes both consumers: the onahole's hole size, and how
// much milk the tits can hold.
AFLP.absoluteTitSize = (actor) => {
  const t = AFLP.titsSize(actor);
  if (t <= 0) return 0;
  return Math.max(1, AFLP.bodySizeSteps(actor) + (t - 1));
};

// Cup bands, three letters each, with the top band widened to catch every
// remaining letter as pure flavour. Display only - the number does the work.
AFLP.TITS_CUP_WORDS = { 1: "A-C", 2: "D-F", 3: "G-I", 4: "J-L", 5: "M-O", 6: "P-R", 7: "S-U", 8: "V-Z" };
AFLP.titsCupWord = (n) => AFLP.TITS_CUP_WORDS[Math.round(Number(n) || 0)] ?? "";

// Tits SWELL is display only: is anything sloshing in them, and roughly how much.
// Drives no mechanic - the reservoir already carries its weight through Cumflated
// (Tits), and milk through its own pool.
// NOT A SIZE. It adds fluid tiers (0-8 each) to a size (1-6), so the total sits on
// no ladder and must never be printed as one. The sheet renders it as the word
// "swollen"; compare it against titsSize, do not display the number.
AFLP.titsSwell = (actor) => {
  try {
    const size = AFLP.titsSize(actor);
    if (size <= 0) return 0;
    const cum  = Number(actor?.getFlag?.(AFLP.FLAG_SCOPE, "cumflation")?.onahole) || 0;
    const milk = AFLP.milk?.stored?.(actor) ?? 0;
    return size + cum + milk;
  } catch (e) { return 0; }
};

// Milk economy: a produce -> store -> extract -> consume loop, kept separate from
// Milking pussy (which drains cocks). Pumps, stimulants, and milk-using items all go
// through this one API. Capacity scales off tits size; K is tunable.
AFLP.milk = {
  CAPACITY_PER_SIZE: 2,
  PER_CLIMAX: 2,   // one climax fills one point of tits size worth
  isLactating(actor) {
    return (actor?.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["tits-lactating"] === true;
  },
  // Absolute size, not cup size: a bigger creature holds more milk at the same
  // cup. Still fills in exactly absoluteTitSize climaxes, since PER_CLIMAX and
  // CAPACITY_PER_SIZE are both 2.
  capacity(actor) {
    if (AFLP.system?.usesMilkPool?.() === false) return 0;
    return AFLP.absoluteTitSize(actor) * this.CAPACITY_PER_SIZE;
  },
  stored(actor) { return Number(actor?.getFlag?.(AFLP.FLAG_SCOPE, "milk")?.stored) || 0; },
  // Add milk (e.g. on a climax while Lactating, scaled by stimulants). Returns the
  // amount actually stored after clamping to capacity.
  async produce(actor, amount = 1, { force = false } = {}) {
    if (!actor) return 0;
    // Daggerheart has no milk pool. Its milk is flat and item-based - a harness
    // fills one bottle at a rest, a station two - so there is nothing to
    // accumulate. Until now only the SHEET honoured usesMilkPool(): the pool
    // itself kept filling underneath, so a lactating DH character banked milk
    // they could not see and had no way to drain.
    if (AFLP.system?.usesMilkPool?.() === false) return 0;
    if (!force && !this.isLactating(actor)) return 0;
    const cur = this.stored(actor);
    const next = Math.max(0, Math.min(this.capacity(actor), cur + amount));
    if (next === cur) return 0;
    if (AFLP.gm.canWrite(actor)) await actor.setFlag(AFLP.FLAG_SCOPE, "milk", { stored: next });
    else await AFLP.gm.run("setFlag", actor, "milk", { stored: next });
    return next - cur;
  },
  // Drain the pool into consumable units (express/suckle/pump). Omit amount to take
  // all. Returns the units yielded.
  async express(actor, { amount = null } = {}) {
    if (!actor) return 0;
    if (AFLP.system?.usesMilkPool?.() === false) return 0;
    const cur = this.stored(actor);
    const take = amount == null ? cur : Math.max(0, Math.min(cur, amount));
    if (take <= 0) return 0;
    const next = cur - take;
    if (AFLP.gm.canWrite(actor)) await actor.setFlag(AFLP.FLAG_SCOPE, "milk", { stored: next });
    else await AFLP.gm.run("setFlag", actor, "milk", { stored: next });
    return take;
  },
  // Bottle stored milk: spend pool units and hand back that many Bottled Milk.
  // The export path the Lactating item always promised. Returns bottles made.
  async bottle(actor, units = null) {
    if (!actor) return 0;
    const took = await this.express(actor, { amount: units });
    if (took <= 0) return 0;
    const made = await AFLP.milkBottle.grant(actor, took);
    return made;
  },

  // Consume milk units on a target (nursing). Heals at the system's own rate -
  // see adapter milkHealPerUnit(). Pass the PRODUCER so the rate can scale off
  // their level: the milk is as rich as whoever made it, not whoever drinks it.
  // A caller can still override the rate outright with perUnit.
  async consume(target, units, { perUnit = null, producer = null } = {}) {
    const rate = perUnit ?? AFLP.system?.milkHealPerUnit?.(producer) ?? 3;
    const amount = Math.max(0, Math.floor(Number(units) || 0)) * rate;
    if (!target || amount <= 0) return 0;
    if (AFLP.gm.canWrite(target)) return await AFLP.system.healActor(target, amount);
    return await AFLP.gm.run("healActor", target, amount);
  }
};

// Stuck Submitting is applied by an object that holds you (Wind Wall Trap, a mimic
// chest, bondage furniture), which stamps the Escape DC onto the target when it
// grabs them. A cum-slick body is harder to hold, so the effective Escape DC drops
// by 2 per slick tier. free() releases them (called on a successful Escape).
AFLP.stuckSubmitting = {
  async apply(target, { dc = null, sourceName = "" } = {}) {
    if (!target) return;
    await AFLP.cond.apply(target, "stuck-submitting", 1);
    const wa = target.getWorldActor?.() ?? target;
    // THROUGH THE GM PROXY, and NOT swallowed. The condition above routes itself;
    // this DC record did not, and it sat inside a bare try/catch, so on a target
    // the caller does not own - which is every monster a player traps - Foundry's
    // permission error was caught and dropped. `escapeDC` then read 0 forever and
    // every Shake Free against that hold was silently free. A swallowed permission
    // error is worse than a thrown one: nothing on screen says the hold is broken.
    try {
      await AFLP.gm.run("setFlag", wa, "stuckSubmitting",
        { dc: (dc == null ? null : Number(dc)), source: String(sourceName || "") });
    } catch (e) {
      console.error("AFLP | stuckSubmitting: could not record the escape DC:", e);
      ui.notifications?.warn("AFLR | The hold was applied but its Escape DC could not be recorded - a GM must be logged in.");
    }
  },
  escapeDC(target) {
    // THE SLICK NO LONGER EASES THIS DC. 29 Aug 2026 it became a circumstance
    // bonus on the escaping creature's roll instead - see AFLP.slickEscapeBonus,
    // which attemptEscape adds. The DC is now just the DC the hold was applied
    // with, on both systems.
    const info = target?.getFlag?.(AFLP.FLAG_SCOPE, "stuckSubmitting") ?? {};
    return Math.max(0, Number(info.dc) || 0);
  },
  async free(target) {
    if (!target) return;
    if (AFLP.cond.has(target, "stuck-submitting")) await AFLP.cond.remove(target, "stuck-submitting");
    const wa = target.getWorldActor?.() ?? target;
    // The release half of the same write - `setFlag` with null is the registered
    // op's shape, and unlike apply() a failure here is harmless (a stale DC on a
    // creature that is no longer held reads through a cond.has that is false), so
    // this one stays quiet.
    try { await AFLP.gm.run("setFlag", wa, "stuckSubmitting", null); } catch (e) { /* stale record only */ }
  },
  // Roll an Escape against the (slick-eased) DC and release on a success. Uses the
  // best of the actor's Athletics/Acrobatics where present, a flat roll otherwise,
  // so it degrades gracefully across systems.
  async attemptEscape(target) {
    if (!target) return false;
    // Too slick to hold: no roll, and the coat is spent doing it. Deliberately
    // NOT wired into AFLP.swallowed.attemptEscape below - being greased does not
    // get you back out of a creature for free. THE BONUS IS A DIFFERENT MATTER
    // and both rolls take it, 29 Aug 2026 - see AFLP.slickEscapeBonus.
    if (await AFLP.cumSlutSlipFree(target)) {
      await this.free(target);
      try {
        await ChatMessage.create({
          content: `<div class="aflp-chat-card"><p><strong>${target.name}</strong> is too slick to hold - they slip free without a roll, and the coat wipes away with them.</p></div>`,
          speaker: ChatMessage.getSpeaker({ actor: target }),
        });
      } catch (e) { /* the escape still stands if the card fails */ }
      return true;
    }
    const dc = this.escapeDC(target);
    const sk = target.system?.skills ?? {};
    const mods = [];
    for (const k of ["athletics", "acrobatics"]) {
      const m = Number(sk[k]?.totalModifier ?? sk[k]?.mod ?? sk[k]?.value?.value ?? sk[k]?.value);
      if (Number.isFinite(m)) mods.push(m);
    }
    const best = mods.length ? Math.max(...mods) : 0;
    // The slick belongs on this side of the roll now. This is a bare Roll with no
    // roll options, so the PF2e rule element on the coat card cannot see it and
    // there is no double count - see AFLP.slickEscapeBonus for the pair.
    const slick = AFLP.slickEscapeBonus?.(target) ?? 0;
    const roll = await new Roll(`1d20 + ${best}${slick ? ` + ${slick}` : ""}`).evaluate();
    const success = (roll?.total ?? 0) >= dc;
    try {
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: target }),
        flavor: `Escape from Stuck Submitting (${AFLP.system?.dcWord ?? "DC"} ${dc})${slick ? ` - slick +${slick}` : ""}${success ? " - free!" : " - still held"}` });
    } catch (e) {}
    if (success) await this.free(target);
    return success;
  }
};

// ── Wildcard hole expansion - THE one definition ──────────────────────────────
// `gangbang` is a hole id that names no hole. Every reader that maps a position
// to pools must expand it or it silently does nothing: HOLE_TO_TRACK had no
// `gangbang` entry, so every troop and orgy scene awarded zero size-training pips
// from the day gangbangs shipped, and a player found it, not the suite.
//
// aflp-cum.js grew its own copy of this expansion inline; that copy now delegates
// here so the two cannot drift. Anything that reads `AFLP.getPosition(id).hole`
// and then indexes a pool by it MUST route through this first.
//
// Stale when: a new wildcard hole id is added, or the body gains a hole.
AFLP.expandHoles = function (hole, targetActor) {
  const FLAG = AFLP.FLAG_SCOPE;
  if (Array.isArray(hole)) return hole.flatMap(h => AFLP.expandHoles(h, targetActor));
  if (hole !== "gangbang") return hole ? [hole] : [];
  const af = targetActor?.getFlag?.(FLAG, "anatomyFeatures") ?? {};
  const holes = ["oral", "anal", "facial"];
  if (targetActor?.getFlag?.(FLAG, "pussy")) holes.push("vaginal");
  if (af.tits) holes.push("paizuri");
  if (af["tits-onahole"]) holes.push("nipples");
  return holes;
};

AFLP.swallowed = {
  // Swallow a target: it is Swallowed (held, Exposed, Restrained) by `swallower`
  // and escapable against `dc`.
  //
  // `arousal` is the amount marked at the start of the swallower's turn, and it
  // DEFAULTS TO 0. Being inside a creature is not arousing by itself - a mimic
  // has to actively press, and only a swallower whose fiction is aphrodisiac
  // rather than digestive should set it. Design decision 13 Aug 2026; the
  // Swallowed card carried the opposite claim and Ardis removed it, so a default
  // of 1 here would put the code back in disagreement with the card.
  //
  // OWNERSHIP. Records which of Exposed and Restrained it actually granted, so
  // free() gives back only those. Without it, a creature already Submitting -
  // which carries Restrained since 13 Aug - was left UNRESTRAINED after being
  // expelled, still Submitting, free to walk away from an H-Scene. Measured on a
  // rig: Restrained true before the swallow, false after being freed, while
  // `submittingRestrained` still claimed it.
  //
  // Stale when: another condition starts granting Restrained, or Exposed stops
  // being part of being swallowed.
  async apply(target, swallower, { dc = null, arousal = 0 } = {}) {
    if (!target) return;
    const hadExposed    = (AFLP.cond.value(target, "exposed") ?? 0) > 0;
    const hadRestrained = !!target.statuses?.has?.("restrained") || AFLP.cond.has(target, "restrained");
    await AFLP.cond.apply(target, "swallowed", 1);
    if (!hadExposed)    await AFLP.cond.apply(target, "exposed", 1);
    if (!hadRestrained) await AFLP.cond.apply(target, "restrained", 1);
    const wa = target.getWorldActor?.() ?? target;
    try {
      await wa.setFlag(AFLP.FLAG_SCOPE, "swallowed", {
        dc: (dc == null ? null : Number(dc)),
        by: swallower?.id ?? null,
        arousal: Math.max(0, Number(arousal) || 0),
        gaveExposed: !hadExposed,
        gaveRestrained: !hadRestrained,
      });
    } catch (e) {}
  },
  info(target) { return target?.getFlag?.(AFLP.FLAG_SCOPE, "swallowed") ?? {}; },
  escapeDC(target) { return Math.max(0, Number(this.info(target).dc) || 0); },
  async free(target) {
    if (!target) return;
    const info = this.info(target);
    if (AFLP.cond.has(target, "swallowed")) await AFLP.cond.remove(target, "swallowed");
    // Give back only what the swallow granted. A flag written before 13 Aug 2026
    // carries neither key, so both read undefined and nothing is taken - which
    // fails in the safe direction (a leftover Restrained a GM can clear) rather
    // than the dangerous one (stripping a hold something else owns).
    if (info?.gaveRestrained) await AFLP.cond.remove(target, "restrained");
    if (info?.gaveExposed)    await AFLP.cond.remove(target, "exposed");
    const wa = target.getWorldActor?.() ?? target;
    try { await wa.unsetFlag(AFLP.FLAG_SCOPE, "swallowed"); } catch (e) {}
  },
  async attemptEscape(target) {
    if (!target) return false;
    const dc = this.escapeDC(target);
    const sk = target.system?.skills ?? {};
    const mods = [];
    for (const k of ["athletics", "acrobatics"]) {
      const m = Number(sk[k]?.totalModifier ?? sk[k]?.mod ?? sk[k]?.value?.value ?? sk[k]?.value);
      if (Number.isFinite(m)) mods.push(m);
    }
    const best = mods.length ? Math.max(...mods) : 0;
    // Ardis, 29 Aug 2026: "swallowed included." A bare Roll with no roll options,
    // so the coat card's rule element cannot see it and there is no double count.
    const slick = AFLP.slickEscapeBonus?.(target) ?? 0;
    const roll = await new Roll(`1d20 + ${best}${slick ? ` + ${slick}` : ""}`).evaluate();
    const success = (roll?.total ?? 0) >= dc;
    try { await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: target }), flavor: `Escape from Swallowed (${AFLP.system?.dcWord ?? "DC"} ${dc})${slick ? ` - slick +${slick}` : ""}${success ? " - expelled!" : " - still swallowed"}` }); } catch (e) {}
    if (success) await this.free(target);
    return success;
  },
  // Start of the swallower's turn: creatures it holds mark the Arousal THAT
  // SWALLOWER declared, if any. Opt-in per swallow, not a property of being
  // inside something - see apply() above. A swallower that does nothing to you
  // just holds you.
  async churnTurn(swallower) {
    if (!swallower) return;
    const sid = swallower.id;
    for (const tok of (canvas?.tokens?.placeables ?? [])) {
      const a = tok.actor; if (!a) continue;
      const info = this.info(a);
      const n = Math.max(0, Number(info?.arousal) || 0);
      if (n > 0 && info?.by === sid && AFLP.cond.has(a, "swallowed")) {
        try { await AFLP_Arousal.increment(a, n, "Swallowed", tok.id); } catch (e) {}
      }
    }
  }
};

// Combat hook: at the start of each combatant's turn, churn anyone they've swallowed.
// GM-only so the arousal is applied exactly once.
Hooks.on("combatTurnChange", (combat) => {
  try { if (game.user?.isGM) AFLP.swallowed.churnTurn(combat?.combatant?.actor); } catch (e) {}
});

// ── Anatomy granted by items ────────────────────────────────────────────────
// Special anatomy is normally authored on an actor by hand. Items grant it too:
// an item flagged `grantsAnatomy: "<key>"` gives that feature while it applies.
//
// Why items rather than a feat: PF2e's incapacitation trait keys off "the item,
// creature, or hazard generating the effect". A body part you simply HAVE is
// generated by you, so your level is the threshold and it cannot be gated. Sourced
// from a worn item, the ITEM's level is the threshold - which is the whole reason
// the six incapacitating features are item-only and never permanent.
AFLP.anatomy = {
  ITEM_FLAG: "grantsAnatomy",
  GRANT_FLAG: "anatomyGrants",

  keyOf(item) {
    try { return item?.getFlag?.("ardisfoxxs-lewd-pf2e", this.ITEM_FLAG) ?? null; } catch (e) { return null; }
  },

  // A worn item only grants while actually worn and (if investable) invested.
  // Items with no equip model at all - effects, feats - count as soon as they
  // are on the actor.
  // Does this item count right now?
  //
  // `system.equipped` holds a DIFFERENT TYPE in each system, which is why this
  // cannot just read a field:
  //   PF2e, all physical items        object   { carryType: "held", invested: true }
  //   Daggerheart weapons and armor   boolean  true / false
  //   Daggerheart loot / consumables  absent   undefined
  //
  // The old guard was `if (!eq) return true` - "no equip block, so count it on
  // presence". A Daggerheart weapon or armor with `equipped: false` is falsy and
  // took that branch, so an UNEQUIPPED set counted exactly as much as a worn one.
  // Latent rather than live today, because no DH weapon or armor carries a bonus
  // flag yet - it was the cock-ring-in-a-backpack bug waiting for the first
  // titsSizeBonus on a Bondage Bikini.
  _active(item) {
    const eq = item?.system?.equipped;
    if (eq === undefined || eq === null) return true;   // no equip block: presence counts
    if (typeof eq === "boolean") return eq;             // DH weapons and armor: itself
    if (eq.invested === false) return false;
    if (typeof eq.carryType === "string") return eq.carryType === "worn" || eq.carryType === "held";
    return true;
  },

  // Is this item IN HAND, as opposed to worn or merely carried?
  //
  // The narrower question, and the one the H-Scene weapon-toy option asks. PF2e
  // distinguishes held from worn through `carryType`; Daggerheart does not, so
  // there an equipped weapon IS the one in hand. Asking
  // `item.system?.equipped?.carryType === "held"` directly reads undefined on a
  // Daggerheart weapon whether or not it is equipped, because `true?.carryType`
  // and `false?.carryType` are both undefined - which is why that option never
  // appeared on Daggerheart.
  _held(item) {
    const eq = item?.system?.equipped;
    if (eq === undefined || eq === null) return false;  // nothing to be holding
    if (typeof eq === "boolean") return eq;             // DH: equipped means in hand
    return eq.carryType === "held";
  },

  async _write(actor, af, grants) {
    // Subtype implies base: an actor granted any tits-* feature (onahole,
    // lactating, milkers) has tits, even if only the subtype item was added.
    // Without this the status panel and every hasTits gate hide the chest.
    if (af && Object.keys(af).some(k => k.startsWith("tits-") && af[k])) af["tits"] = true;
    // A body with a pussy has tits by default. Same rule and same shape as the
    // ass seeding in ensureCoreFlags: SEED ONLY WHEN THE KEY IS ABSENT, so a GM
    // who deliberately set tits false - a construct, an ooze, a flat-chested
    // character - keeps that choice. This is a default, not an invariant.
    //
    // Added 13 Aug 2026 with the v4 migration that backfills existing actors.
    // The migration alone is not enough: it runs once per actor, so a pussy
    // granted afterwards from the sheet or an elixir would arrive bare again.
    //
    // Stale when: a body plan is wanted that has a pussy and no chest BY
    // DEFAULT rather than by an explicit false.
    if (af && af["tits"] === undefined) {
      const legacyPussy = actor?.getFlag?.(AFLP.FLAG_SCOPE, "pussy") === true;
      if (af["pussy"] === true || legacyPussy) af["tits"] = true;
    }
    if (AFLP.gm.canWrite(actor)) {
      await actor.setFlag(AFLP.FLAG_SCOPE, "anatomyFeatures", af);
      await actor.setFlag(AFLP.FLAG_SCOPE, this.GRANT_FLAG, grants);
    } else {
      await AFLP.gm.run("setFlag", actor, "anatomyFeatures", af);
      await AFLP.gm.run("setFlag", actor, this.GRANT_FLAG, grants);
    }
    // Anatomy can hand out a domain card in DH. Hooked HERE rather than on the
    // item hook, so a feature set directly on the sheet grants it too.
    try { await AFLP.syncGrantedCards?.(actor); } catch (e) { /* non-fatal */ }
  },

  // Grant a feature from a non-item source (an elixir is consumed, so nothing
  // stays on the actor to sync against). `kind` marks how it expires.
  async grant(actor, key, { by = null, kind = "elixir" } = {}) {
    if (!actor || !AFLP.anatomyFeatures?.[key]) return false;
    const af = foundry.utils.duplicate(actor.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {});
    const grants = foundry.utils.duplicate(actor.getFlag(AFLP.FLAG_SCOPE, this.GRANT_FLAG) ?? {});
    if (grants[key]) return false;
    // Remember whether they already had it by hand, so revoking never takes away
    // anatomy the player authored themselves.
    grants[key] = { by, kind, prev: af[key] === true };
    af[key] = true;
    await this._write(actor, af, grants);
    return true;
  },

  async revoke(actor, key) {
    if (!actor) return false;
    const grants = foundry.utils.duplicate(actor.getFlag(AFLP.FLAG_SCOPE, this.GRANT_FLAG) ?? {});
    const g = grants[key];
    if (!g) return false;
    const af = foundry.utils.duplicate(actor.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {});
    af[key] = g.prev === true;
    delete grants[key];
    await this._write(actor, af, grants);
    return true;
  },

  // Reconcile item-granted anatomy with what the actor is actually wearing.
  // Only touches grants we made (kind "item"); hand-authored anatomy and elixir
  // grants are left alone.
  async sync(actor) {
    if (!actor?.items) return;
    const wanted = new Map();
    for (const it of actor.items) {
      const k = this.keyOf(it);
      if (!k || !AFLP.anatomyFeatures?.[k]) continue;
      if (!this._active(it)) continue;
      wanted.set(k, it.id);
    }
    const grants = foundry.utils.duplicate(actor.getFlag(AFLP.FLAG_SCOPE, this.GRANT_FLAG) ?? {});
    const af = foundry.utils.duplicate(actor.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {});
    let changed = false;
    for (const [k, g] of Object.entries(grants)) {
      if (g?.kind !== "item") continue;
      if (!wanted.has(k)) { af[k] = g.prev === true; delete grants[k]; changed = true; }
    }
    for (const [k, id] of wanted) {
      if (grants[k]) { if (grants[k].kind === "item") grants[k].by = id; continue; }
      grants[k] = { by: id, kind: "item", prev: af[k] === true };
      af[k] = true; changed = true;
    }
    if (changed) await this._write(actor, af, grants);
  },

  // Elixir-granted anatomy lasts until the next daily preparation.
  async expireTemporary(actor) {
    const grants = actor?.getFlag?.(AFLP.FLAG_SCOPE, this.GRANT_FLAG) ?? {};
    for (const [k, g] of Object.entries(grants)) {
      if (g?.kind === "elixir") await this.revoke(actor, k);
    }
  },
};

// Keep worn grants in step with what is actually worn. GM-only so one client owns
// the write.
for (const h of ["createItem", "deleteItem", "updateItem"]) {
  Hooks.on(h, (item) => {
    try {
      if (!game.user?.isGM) return;
      const actor = item?.parent;
      if (!actor?.items || !AFLP.anatomy.keyOf(item)) return;
      AFLP.anatomy.sync(actor);
    } catch (e) { console.warn("AFLP | anatomy sync failed:", e?.message); }
  });
}

// `aflp.dailyPrep` had a listener (titles) but nothing ever emitted it, so that
// check never ran. Bridge the system's own rest/prep event to it - which fixes
// titles and gives elixir grants their expiry.
Hooks.on("pf2e.restForTheNight", (actor) => {
  try {
    if (!game.user?.isGM) return;
    AFLP.anatomy.expireTemporary(actor);
    Hooks.callAll("aflp.dailyPrep", actor);
  } catch (e) { console.warn("AFLP | daily prep bridge failed:", e?.message); }
});

// Features that may ONLY be gained from an item that generates them, never
// permanently and never from a consumable. Each carries PF2e's incapacitation
// trait, whose threshold is "the item, creature, or hazard generating the effect"
// - so sourced from a levelled tattoo the item's level gates it, while a feature
// you simply HAVE is gated by your own level, i.e. not gated at all. That is the
// entire reason this list exists; keep it in step with the tattoos.
AFLP.ANATOMY_GATED = [
  "cock-electrifying", "cock-pacifying", "cock-paralyzing",
  "pussy-electric", "pussy-honeyed", "pussy-pacifying",
];
AFLP.isAnatomyGated = (key) => AFLP.ANATOMY_GATED.includes(key);

// The coats (facial, chest, nipples) carry no per-tier penalty, so unlike the
// internal holes they get ONE item each rather than eight - there is nothing to
// differentiate tier by tier. They exist so every cumflation row has flavour and
// something to click through to, not to add rules.
// Cumflation, collapsed. ONE item per pool, applied only when that pool hits 8 -
// its presence IS the tier-8 state, so there is no badge and no sub-8 marker.
// Each carries its 8 tier-flavour lines in flags.<MID>.tierFlavour, so the status
// panel can show the right prose per pip WITHOUT 8 items per hole, and so the
// flavour stays editable in the pack rather than hardcoded here.
//
// Cumflated = cum INSIDE a hole (oral/vaginal/anal, plus tits via the onahole
// anatomy). Cum Coat = cum ON a surface (facial/chest). A hole and a skin - not
// two views of one thing. See cumflation.js for the full model.
// Is any active pregnancy past half its term? The Impregnated items say: "Once
// half this gestation period has elapsed, you gain Clumsy 1 until you give birth."
// Terms differ by sire size (30 / 70 / 90 days), so read each pregnancy's own
// total rather than assuming one. Shared: the inflation penalty applies it, the
// status panel reports it (flat belly vs full belly icon).
AFLP.pregnancyPastHalfTerm = (actor) => {
  try {
    const preg = actor?.getFlag?.(AFLP.FLAG_SCOPE, "pregnancy") ?? {};
    return Object.values(preg).some(p => {
      if (!p || typeof p !== "object") return false;
      const total = Number(p.gestationTotal) || 0;
      const rem = p.gestationRemaining;
      if (!total || rem === "Complete") return false;
      return (total - (Number(rem) || 0)) >= total / 2;
    });
  } catch (e) { return false; }
};

AFLP.cumflationItems = {
  oral:    "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.DjtvpLTxSVI9GoUW",
  vaginal: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.UIJG9IJbN2JubQ5F",
  anal:    "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.W3uzbcQpm70S0OkC",
  onahole: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.VZ57tMCtsMWLJE7A",
};

AFLP.coatItems = {
  "cumcoat-facial": "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.5FzqaX6Vvi89otKD",
  "cumcoat-tits":   "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.YeDj9Q9XrsT9geXx",
};

AFLP.EFFECT_INTENTS = {
  // Display-only tooltip notes (DH): the Bimbofied/Bullified d6 pools stay on
  // the roll-wrap implementation (advantageSources cannot express counted
  // dice - it is the advantage TOOLTIP's sources list). These intents just
  // document WHY in that tooltip while tokens are held. systems gates them so
  // sync skips them entirely on pf2e.
  "bimbofied-note": {
    label: "Bimbofied",
    systems: ["daggerheart"],
    dh: { changes: [
      { key: "system.disadvantageSources", type: "add", value: "Bimbofied - your Carnal Resists" },
    ] },
    note: "Giggly and empty-headed: disadvantage dice on your Carnal Resists (one per Bimbofied token).",
    when: (actor) => (AFLP.cond?.value?.(actor, "bimbofied") ?? 0) > 0,
  },
  "bullified-note": {
    label: "Bullified",
    systems: ["daggerheart"],
    dh: { changes: [
      { key: "system.advantageSources", type: "add", value: "Bullified - your Carnal Presses" },
    ] },
    note: "Swollen with dominant muscle: advantage dice on your Carnal Presses (one per Bullified token).",
    when: (actor) => (AFLP.cond?.value?.(actor, "bullified") ?? 0) > 0,
  },
  // Size Difference (Mastery): too blissed-out and stuffed to feel the hit.
  // DH: +2 damage thresholds. PF2e: resistance 2 to ALL damage (redline: the
  // intent is bliss countering pain, so it resists everything, not physical).
  // Size Difference GREATER beat: active while overall cumflation tier >= 4 AND
  // the kink is at Greater (tier 2) or higher. Being stuffed by something far
  // larger blisses you past the pain.
  "size-greater": {
    label: "Size Difference (Greater)",
    dh: { changes: [
      { key: "system.damageThresholds.major",  type: "add", value: 2 },
      { key: "system.damageThresholds.severe", type: "add", value: 2 },
    ] },
    pf2e: { rules: [ { key: "Resistance", type: "all-damage", value: 2 } ] },
    note: "Too blissed-out and stuffed to feel the hit while Cumflated to tier 4 or higher.",
    when: (actor) =>
      (AFLP.actorHasKink?.(actor, "size-difference") ?? false)
      && (AFLP.getKinkTier?.(actor, "size-difference") ?? 0) >= 2
      && AFLP.cumflationTier(actor) >= 4,
  },
  // Throat (Deepthroat): "when a cock fills your throat you fall Prone and your
  // speed becomes 0 until the cock is removed." This intent is the speed half;
  // ui/aflp-deepthroat.js owns the Prone half and drives both.
  //
  // NO `when` PREDICATE, on purpose. effects.sync() only evaluates intents that
  // declare one, so this intent is reachable only through effects.ensure() from
  // aflp-deepthroat.js. That keeps the speed effect and the Prone condition on
  // ONE writer: a predicate here would let a cumflation write or a daily prep
  // strip the speed effect while leaving the Prone it never knew about.
  //
  // -1000 untyped on all-speeds rather than a BaseSpeed rule: PF2e floors a
  // speed total at 0 (measured 11 Aug 2026 - a 10 ft land speed reads 0 with
  // this applied and 10 again when it is removed), and all-speeds catches fly,
  // swim and burrow, which "your speed becomes 0" has to cover.
  "deepthroat-pinned": {
    label: "Deepthroat (Throat Filled)",
    systems: ["pf2e"],
    pf2e: { rules: [ { key: "FlatModifier", selector: "all-speeds", type: "untyped", value: -1000 } ] },
    note: "A cock down your throat: Speed 0 until it is pulled out.",
  },
};

AFLP.effects = {
  // Idempotent apply/remove of one intent on one actor.
  async ensure(actor, key, active) {
    if (!actor || !game.user?.isGM) return;
    const spec = AFLP.EFFECT_INTENTS[key];
    if (!spec) return;
    const existing = AFLP.system?.findEffectIntentDoc?.(actor, key);
    if (active && !existing) await AFLP.system?.applyEffectIntent?.(actor, key, spec);
    else if (!active && existing) await AFLP.system?.removeEffectIntent?.(actor, key);
  },
  // Evaluate every conditional intent for this actor. The single choke point.
  async sync(actor) {
    if (!actor || !game.user?.isGM) return;
    for (const [key, spec] of Object.entries(AFLP.EFFECT_INTENTS)) {
      if (typeof spec.when !== "function") continue;
      if (Array.isArray(spec.systems) && !spec.systems.includes(AFLP.system?.id)) continue;
      let active = false;
      try { active = !!spec.when(actor); } catch (e) { /* predicate errors = off */ }
      try { await this.ensure(actor, key, active); }
      catch (e) { console.warn(`AFLP | effects.sync ${key} failed`, e); }
    }
  },
};

// ============================================================================
// GRANTED CARDS. Daggerheart only: an anatomy feature can hand you a domain
// card. Lactating grants Nurse, so lactation is worth having without gear -
// DH has no milk pool, so without this a lactating character with no harness
// has no route to anything at all.
//
// The card is flagged as granted so removing the anatomy takes it back, and so
// a player who legitimately picked the same card at level-up does not lose it.
// ============================================================================
AFLP.GRANTED_CARDS = {
  "tits-lactating": "nurse",
};

AFLP.syncGrantedCards = async (actor) => {
  if (!actor || !game.user?.isGM) return;
  if (AFLP.system?.id !== "daggerheart") return;
  const af = actor.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {};
  for (const [anatomyKey, cardKey] of Object.entries(AFLP.GRANTED_CARDS)) {
    const want = af[anatomyKey] === true;
    const held = (actor.items ?? []).find(i =>
      i?.getFlag?.("ardisfoxxs-lewd-pf2e", "aflrKey") === cardKey);
    const granted = !!held?.getFlag?.("ardisfoxxs-lewd-pf2e", "grantedCard");
    try {
      if (want && !held) {
        const uuid = AFLP.system.contentUuid(cardKey);
        const doc = uuid ? await fromUuid(uuid).catch(() => null) : null;
        if (!doc) continue;
        const o = doc.toObject();
        delete o._id;
        foundry.utils.setProperty(o, "flags.ardisfoxxs-lewd-pf2e.grantedCard", true);
        await actor.createEmbeddedDocuments("Item", [o]);
      } else if (!want && held && granted) {
        // Only reclaim what we granted. A card the player chose stays theirs.
        await held.delete();
      }
    } catch (e) { console.warn("AFLP | granted card sync failed", cardKey, e); }
  }
};

// ============================================================================
// HYPNOSIS SINK (approved rule): an Entranced creature sinks to Hypnotized
// when it fails a Carnal Resist against its entrancer (or Gives In to them),
// or when it climaxes at their hands. Entranced tracks its source in the
// entrancedBy flag when applied by code (the Hypno Trigger already knows its
// conditioner); a manually-applied Entranced has no source, so the sink is
// LENIENT there - any qualifying source sinks it, and the GM adjudicates
// edge cases. Hypnotized then clears on 2 Stress or Major/Severe damage
// (its own condition text), and Hypno Slave remains the flat-kink end state.
// ============================================================================
AFLP.hypnoSink = async (actor, sourceActor) => {
  try {
    if (!actor || !game.user?.isGM) return false;
    if (!(AFLP.cond?.value?.(actor, "entranced") >= 1)) return false;
    const by = actor.getFlag?.(AFLP.FLAG_SCOPE, "entrancedBy") ?? null;
    if (by && sourceActor && by !== sourceActor.id) return false; // tracked, wrong source
    // Apply Hypnotized BEFORE removing Entranced. cond.remove clears the entrancer
    // flags once neither stage is present; removing first would leave a window with
    // both absent and strand Hypnotized without its entrancer.
    await AFLP.cond.apply(actor, "hypnotized", 1);
    await AFLP.bumpMindLadder(actor, "timesHypnotized");
    // Top-side credit: the conditioner deepened this mind to Hypnotized.
    if (sourceActor && sourceActor.id !== actor.id) await AFLP.bumpLifetime(sourceActor, "mindsHypnotized");
    await AFLP.cond.remove(actor, "entranced");
    // Keep entrancedBy (and entrancerSignature). Hypnotized replaces Entranced but
    // is still THEIR hold: its penalties are predicated on the entrancer's
    // signature, and the shake-free save is against the originating effect. The
    // two sink triggers both gate on `entranced >= 1`, so leaving the flag cannot
    // re-fire a sink. Deleting it used to strand Hypnotized with no entrancer.
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="aflp-chat-card aflp-carnal-card"><p><strong>${actor.name}</strong> sinks - Entranced deepens to <strong>Hypnotized</strong>${sourceActor ? ` under <strong>${sourceActor.name}</strong>'s hold` : ""}. (Shakes free on 2 Stress or Major/Severe damage.)</p></div>`,
    }).catch(() => {});
    return true;
  } catch (e) { console.warn("AFLP | hypnoSink failed", e); return false; }
};

// Cock (Girthy) arousal rider (PF2e): while the target is Submitting to the
// source, the source's Sexual Advance marks the target +1 additional Arousal;
// Stretch King Level 5+ raises the rider to +2 (per both item descriptions).
// Values are calibrated to the current SA base of 1 (the old "sets gain to 3"
// wording dated from the base-2 economy). Daggerheart expresses Girthy through
// the size gap instead, so this rider is pf2e-only.
AFLP.girthyArousalBonus = (sourceActor, targetActor) => {
  try {
    if (AFLP.system?.id !== "pf2e") return 0;
    if (!sourceActor || !targetActor) return 0;
    const gt = sourceActor.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {};
    if (gt["cock-girthy"] !== true) return 0;
    if (!AFLP.cond.has(targetActor, "submitting")) return 0;
    const sk = AFLP.actorHasKink?.(sourceActor, "stretch-king")
      && (AFLP.getKinkLevel?.(sourceActor, "stretch-king") ?? 0) >= 5;
    return sk ? 2 : 1;
  } catch (e) { return 0; }
};

// Gear that adds Arousal to a sexual act, read off worn items rather than coded
// per item. One place, so a new piece is a pack flag and no code - the same
// shape as loadsBonus and cumShotBonus.
//
// Item flags, all on the item in the module's own scope:
//   arousalBonus         how much the WEARER gains
//   arousalBonusPartner  how much the creature performing on them gains
//   arousalBonusHole     restrict both to acts in this hole, e.g. "oral"
//
// These are deliberately NOT the Horny condition. Horny is a tracked condition
// with a ceiling; this is a per-act rider off a worn item, so the two add
// together rather than one capping the other.
//
// Gated on AFLP.anatomy._active, so gear in a backpack grants nothing - the
// failure the cock ring rider shipped with.
AFLP.gearArousalBonus = (wearer, opts = {}) => {
  try {
    if (!wearer) return 0;
    const MOD = "ardisfoxxs-lewd-pf2e";
    const key = opts.forPartner ? "arousalBonusPartner" : "arousalBonus";
    let total = 0;
    let holes = null;   // resolved lazily, and only if some item asks for it
    for (const it of (wearer.items ?? [])) {
      const amt = Number(it.getFlag?.(MOD, key));
      if (!Number.isFinite(amt) || amt === 0) continue;
      if (!AFLP.anatomy?._active?.(it)) continue;
      const wants = it.getFlag?.(MOD, "arousalBonusHole");
      if (wants) {
        if (holes === null) {
          const h = AFLP.HScene?.receivedHolesForActor?.(wearer.id);
          holes = Array.isArray(h) ? h : [];
        }
        // A hole-gated rider pays out only while that hole is actually in use.
        // No scene, or a scene that is not using it, means no bonus - it must
        // not become a flat rider on every act the wearer is ever part of.
        if (!holes.includes(String(wants))) continue;
      }
      total += amt;
    }
    return total;
  } catch (e) { return 0; }
};

AFLP.sizeGapOnAct = async (sourceActor, sourceTokenId, target) => {
  const out = { extraTarget: 0, extraSource: 0, gap: 0, hole: null, scene: null };
  try {
    if (!sourceActor || !sourceTokenId || !target) return out;
    const scenes = AFLP.HScene?._scenes;
    if (!scenes) return out;
    let scene = null, part = null;
    for (const sc of scenes.values()) {
      const p = (sc.participants ?? []).find(pp => pp.tokenId === sourceTokenId);
      if (p) { scene = sc; part = p; break; }
    }
    if (!part?.position) return out;
    const posEntry = AFLP.getPosition?.(part.position);
    const hole = posEntry?.hole ?? posEntry?.holeId;
    if (!posEntry?.penile || !["vaginal", "oral", "anal", "nipples", "onahole"].includes(hole)) return out;
    const gap = AFLP.sizeGap(sourceActor, target, hole);
    if (gap <= 0) return out;
    out.gap = gap; out.hole = hole; out.scene = scene;

    out.extraTarget = 1;
    if (gap === 1) out.extraSource = 1;

    // Stretch King pays out here rather than in a hook of its own, because this
    // function has already resolved the position, the hole and both actors - the
    // exact work a separate hook would have to repeat.
    //
    // The kink does NOT add a second +1 Arousal. `extraTarget = 1` above is
    // already "the stretch marks them 1 Arousal"; granting it again would be the
    // Living Milking Station bug. What the kink adds is the Horny token on the
    // source, and at Mastery it RAISES the stretch to 2 - the card says
    // "instead", not "in addition".
    try {
      const sk = await AFLP.Kinks?.onSizeGapStretchKing?.(sourceActor, gap);
      if (sk) {
        out.extraTarget = sk.arousal;
        out.stretchKing = sk;
      }
    } catch (e) { /* the act must land even if the kink payout fails */ }

    // One announce per hole per scene at the highest tier seen so far.
    try {
      scene.sizeAnnounced ??= {};
      const key = `${target.id}|${hole}`;
      if ((scene.sizeAnnounced[key] ?? 0) < gap) {
        scene.sizeAnnounced[key] = gap;
        const label = AFLP.gapLabel(gap)?.word ?? "";
        const holeWord = hole === "vaginal" ? "pussy"
                       : hole === "oral"    ? "throat"
                       : (hole === "nipples" || hole === "onahole") ? "nipples"
                       : "ass";
        AFLP.HScene?.addProse?.(scene.id,
          `${sourceActor.name} is too big for ${target.name}'s ${holeWord} - <strong>${label}</strong> (size gap ${gap}).`, "flavor");
      }
    } catch (e) { /* non-fatal */ }

    const hasSizeDiff = AFLP.actorHasKink?.(target, "size-difference") ?? false;
    const sdTier = hasSizeDiff ? (AFLP.getKinkTier?.(target, "size-difference") ?? 1) : 0;

    if (gap >= 2) {
      // First oversized penetration of this hole this scene: the bite
      // (system-mapped). Size Difference SIGNATURE: no bite, +1 Arousal instead.
      try {
        scene.sizeStressed ??= {};
        const key = `${target.id}|${hole}`;
        if (!scene.sizeStressed[key]) {
          scene.sizeStressed[key] = true;
          if (sdTier >= 1) out.extraTarget += 1;
          else await AFLP.system?.sizePenalty?.(target);
        }
      } catch (e) { /* non-fatal */ }
    }
    if (gap >= 3) {
      // Ruined: pinned on it (system-mapped slug). Size Difference GREATER: you
      // take it too well to be pinned (tier 2+).
      try {
        const pinSlug = AFLP.system?.id === "pf2e" ? "grabbed" : "restrained";
        if (sdTier < 2 && !AFLP.cond.has(target, pinSlug)) {
          const applied = await AFLP.system?.sizeRestrain?.(target);
          await target.setFlag(AFLP.FLAG_SCOPE, "sizeRestrained", applied || pinSlug);
        }
      } catch (e) { /* non-fatal */ }
    }
  } catch (e) { /* non-fatal */ }
  return out;
};

// ===============================
// Size Training (6-pip tracks per hole -> Body Features -> Size Difference kink)
// ===============================
AFLP.SIZE_TRAIN_MAX = 6;   // pips per hole
// The 6-pip unlock per hole: the Body Feature raising that hole's size by 1.
AFLP.BODY_FEATURES = {
  // slug matches the pack items' aflrKey (DH resolves by key at runtime); uuid
  // is the PF2e pack item (PF2e _contentLink resolves via this fallback). The
  // DH pack items are queued for the next DH session - same slugs.
  pussy: { name: "Size Queen",   hole: "vaginal", slug: "size-queen",   uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.KYFQIHmDPKOlDMGX" },
  oral:  { name: "Throat Goat",  hole: "oral",    slug: "throat-goat",  uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.5obmiXwSLUWizjHL" },
  anal:  { name: "Gape Glutton", hole: "anal",    slug: "gape-glutton", uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.lUfy1xVJNYJe89JC" },
  // Nipple training. Unlike the other three this does not add +1 in holeSizeOf -
  // the onahole's size IS tits size, and this feature is already one of its
  // inputs, so adding it here too would count it twice.
  onahole: { name: "Paizuri Slut", hole: "onahole", slug: "paizuri-slut", uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.UtxNeuXwKFaYXVgE" },
};

// Lewd Tokens asset path. The module id string is rewritten by the fork
// generator on export, so this resolves per-module - same pattern as the pack
// icons. Confirmed sets: Cumflated{,Oral,Vaginal,Anal}0-8 (facial/paizuri use
// the generic set), Size{Pussy,Throat,Ass}0-6.
AFLP.lewdTokenPath = (file) => `modules/ardisfoxxs-lewd-pf2e/assets/Lewd%20Tokens/${file}`;
// The training holes as they key the tracks/features flags.
AFLP.TRAIN_HOLES = ["pussy", "oral", "anal", "onahole"];
// Only these three gate the Size Difference kink. Nipple training is deliberately
// excluded: the kink is about being fucked by things too big, and gating it behind
// an optional subtype would make it harder to reach for the bodies most likely to
// want it. The kink item and both guide journals say "all three holes".
AFLP.KINK_TRAIN_HOLES = ["pussy", "oral", "anal"];

// The training tracks this body can actually train: throat and ass always,
// pussy only if the actor has one (same read the sheet uses for the row), and
// NOT the ass if it is Stretchy.
//
// ASS (STRETCHY) SAYS "it never trains", and the code made that true the long way
// round: the subtype forces the anal size gap to 0, the award skips any hole whose
// gap is below 1, so the anal track can never rise. The outcome was right and the
// LIST was wrong, and two gates read the list rather than the outcome:
//
//   - the Size Difference KINK, granted when every applicable hole is maxed
//   - the "Trained Monster Sleeve" TITLE, the same condition
//
// Both therefore waited on a track that is impossible to raise, so a character with
// a Stretchy ass could never earn either - silently, permanently, as a consequence
// of an anatomy choice that says nothing about kinks or titles. Found 14 Aug 2026
// auditing the Daggerheart anatomy cards against the code.
//
// WHAT MAKES THIS STALE: another subtype that zeroes a hole's gap, or Ass (Stretchy)
// gaining a way to train. A hole belongs in this list only if its track can MOVE.
AFLP.applicableTrainHoles = (actor) => {
  const af = actor?.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {};
  const hasPussy   = actor?.getFlag?.(AFLP.FLAG_SCOPE, "pussy") === true;
  const hasOnahole = af["tits-onahole"] === true;
  const stretchyAss = af["ass-stretchy"] === true;
  return AFLP.TRAIN_HOLES.filter(h =>
    (h !== "pussy"   || hasPussy) &&
    (h !== "onahole" || hasOnahole) &&
    (h !== "anal"    || !stretchyAss));
};

// Read/write the per-hole training pip map. { pussy, oral, anal } 0..6.
AFLP.sizeTrainingOf = (actor) =>
  actor?.getFlag?.(AFLP.FLAG_SCOPE, "sizeTraining") ?? { pussy: 0, oral: 0, anal: 0, onahole: 0 };

// Apply training state after any pip change (automation or manual edit): grant
// a hole's Body Feature at max pips, and grant the Size Difference kink once
// EVERY hole is maxed (18 total). Whispers the GM on each new unlock. Never
// strips here - shedding is the long-rest path with player consent. Returns
// { featureGranted:[...], kinkGranted:bool }.
AFLP.applySizeTraining = async (actor) => {
  if (!actor) return { featureGranted: [], kinkGranted: false };
  const FLAG = AFLP.FLAG_SCOPE;
  const train = AFLP.sizeTrainingOf(actor);
  const bf = structuredClone(actor.getFlag(FLAG, "bodyFeatures") ?? {});
  const featureGranted = [];
  for (const hole of AFLP.TRAIN_HOLES) {
    const pips = Math.max(0, Math.min(AFLP.SIZE_TRAIN_MAX, train[hole] ?? 0));
    if (pips >= AFLP.SIZE_TRAIN_MAX && !bf[hole]) {
      bf[hole] = true;
      featureGranted.push(AFLP.BODY_FEATURES[hole].name);
    }
  }
  if (featureGranted.length) await actor.setFlag(FLAG, "bodyFeatures", bf);

  // Kink when every APPLICABLE hole is maxed (journal rule: all pips at 6, not
  // a flat 18 total) - so a no-pussy body unlocks on throat + ass alone.
  let kinkGranted = false;
  const kinkHoles = AFLP.applicableTrainHoles(actor).filter(h => AFLP.KINK_TRAIN_HOLES.includes(h));
  const allMaxed = kinkHoles.length > 0 && kinkHoles.every(h => (train[h] ?? 0) >= AFLP.SIZE_TRAIN_MAX);
  const hasKink = AFLP.actorHasKink?.(actor, "size-difference")
    ?? (actor.getFlag(FLAG, "sexual")?.kinks?.["size-difference"] === true);
  if (allMaxed && !hasKink) {
    try {
      const sexual = structuredClone(actor.getFlag(FLAG, "sexual") ?? {});
      sexual.kinks = { ...(sexual.kinks ?? {}), "size-difference": true };
      await actor.setFlag(FLAG, "sexual", sexual);
      kinkGranted = true;
    } catch (e) { /* non-fatal */ }
  }

  if (game.user?.isGM) {
    for (const name of featureGranted) {
      ui.notifications?.info(`${actor.name} has trained a hole to its limit and gained the ${name} Body Feature.`);
    }
    if (kinkGranted) ui.notifications?.info(`${actor.name} has fully trained every hole and gained the Size Difference kink.`);
  }
  return { featureGranted, kinkGranted };
};

// Set one hole's training pips (clamped) and run the unlock pass. Used by both
// the sheet click handler and (later) the H-Scene-end automation.
AFLP.setSizeTraining = async (actor, hole, pips) => {
  if (!actor || !AFLP.TRAIN_HOLES.includes(hole)) return;
  const FLAG = AFLP.FLAG_SCOPE;
  const train = structuredClone(AFLP.sizeTrainingOf(actor));
  train[hole] = Math.max(0, Math.min(AFLP.SIZE_TRAIN_MAX, pips | 0));
  await actor.setFlag(FLAG, "sizeTraining", train);
  const _r = await AFLP.applySizeTraining(actor);
  await AFLP.effects?.sync?.(actor);
  return _r;
};

// Long-rest upkeep for size training. Each hole's pips decay by 1. Body Features
// and the Size Difference kink PERSIST through decay. When a hole is at 0 pips,
// its Body Feature is a shedding CANDIDATE; the kink is a candidate only once no
// Body Features remain. Shedding needs player consent, so this returns the
// candidates rather than stripping - the caller prompts. Returns
// { decayed:[{hole,from,to}], shedFeatures:[hole...], canShedKink:bool }.
AFLP.restSizeTraining = async (actor) => {
  const out = { decayed: [], shedFeatures: [], canShedKink: false };
  if (!actor) return out;
  const FLAG = AFLP.FLAG_SCOPE;
  const train = structuredClone(AFLP.sizeTrainingOf(actor));
  let changed = false;
  for (const hole of AFLP.TRAIN_HOLES) {
    const from = Math.max(0, Math.min(AFLP.SIZE_TRAIN_MAX, train[hole] ?? 0));
    if (from > 0) {
      const to = from - 1;
      train[hole] = to;
      out.decayed.push({ hole, from, to });
      changed = true;
    }
  }
  if (changed) await actor.setFlag(FLAG, "sizeTraining", train);

  const bf = actor.getFlag(FLAG, "bodyFeatures") ?? {};
  // A hole whose pips are now 0 but still carries its Body Feature can shed it.
  for (const hole of AFLP.TRAIN_HOLES) {
    if ((train[hole] ?? 0) <= 0 && bf[hole]) out.shedFeatures.push(hole);
  }
  // The kink can shed only once no Body Features remain anywhere.
  out.canShedKink = AFLP.canShedSizeKink(actor);
  return out;
};

// PURE READ of the same question restSizeTraining answers last: is this actor
// carrying the Size Difference kink with no Body Feature left to justify it?
//
// This exists because restSizeTraining MUTATES. Daily preparations used to call
// restSizeTraining a second time just to re-read canShedKink after the shed
// prompts, which decayed every track a second pip on every rest - the guide
// promises one. It was invisible from the chat card, which reports the FIRST
// call's from->to numbers while the flag lands one lower. Same shape as the DH
// Bimbofied double-decay: a mutating function used as a getter.
//
// Stale when: the shed rule stops being "no Body Features remain", or the kink
// moves off flags.<scope>.sexual.kinks.
AFLP.canShedSizeKink = (actor) => {
  if (!actor) return false;
  const FLAG = AFLP.FLAG_SCOPE;
  const bf = actor.getFlag(FLAG, "bodyFeatures") ?? {};
  const anyFeature = AFLP.TRAIN_HOLES.some(h => bf[h]);
  const hasKink = actor.getFlag(FLAG, "sexual")?.kinks?.["size-difference"] === true;
  return !anyFeature && hasKink;
};

// Actually shed one Body Feature (hole size drops back) after player consent.
AFLP.shedBodyFeature = async (actor, hole) => {
  if (!actor || !AFLP.TRAIN_HOLES.includes(hole)) return;
  const FLAG = AFLP.FLAG_SCOPE;
  const bf = structuredClone(actor.getFlag(FLAG, "bodyFeatures") ?? {});
  if (!bf[hole]) return;
  bf[hole] = false;
  await actor.setFlag(FLAG, "bodyFeatures", bf);
};

// Shed the Size Difference kink after player consent. Removes both the flag and
// any embedded kink item so the sheet reflects it.
AFLP.shedSizeDifferenceKink = async (actor) => {
  if (!actor) return;
  const FLAG = AFLP.FLAG_SCOPE;
  await actor.update({ [`flags.${FLAG}.sexual.kinks.-=size-difference`]: null });
  const uuid = AFLP.kinks["size-difference"]?.uuid;
  const item = actor.items?.find(i =>
    (i.getFlag?.("ardisfoxxs-lewd-pf2e", "aflrKey") === "size-difference")
    || (uuid && (i.flags?.core?.sourceId ?? i.sourceId) === uuid));
  if (item) await item.delete();
  await AFLP.effects?.sync?.(actor);
};


// ── Anatomy subtypes: one flat rule, both economies ────────────────────────
//
// EVERY genital subtype is +1 Cum Shot and +1 Load. No exceptions on the Cum
// Shot side; two on the Loads side, because multi-shaft cocks spend one Load
// PER HOLE and their cards print the number:
//
//     Cock (Multipenis)  +1 Cum Shot, +6 Loads
//     Cock (Hemipenis)   +1 Cum Shot, +3 Loads
//     everything else    +1 Cum Shot, +1 Load
//
// Set by Ardis 17 Aug 2026, replacing AFLP.CUM_SUBTYPE_MOD, which was an uneven
// per-subtype table (girthy 1, breeder 1, ovidepositor 2, knot 1, hemipenis 1,
// litter 1) that touched Cum Shot only and left nine subtypes worth nothing.
// The point of the flat rule is that a player can read a sheet without doing
// arithmetic, so resist the urge to make it clever again.
//
// PUSSY SUBTYPES COUNT TOO, AND THAT IS DELIBERATE - DO NOT "FIX" IT.
// The old code reached the same result by ACCIDENT: it stripped `cock-` or
// `pussy-` off the key before the lookup, so Pussy (Breeder) and Pussy (Litter)
// silently fed a Cum Shot table meant for cocks. That was reported as a bug on
// 17 Aug and Ardis kept the behaviour as the rule: "probably best if they at
// least share the base cock type parity for cum shot and loads values, though
// they won't have hemi or multi of course." So it is now intentional, scoped,
// and gated on actually having the part.
//
// For a pussy-only creature these numbers are nearly inert today: the climax
// deposits nothing and running dry only changes a flavour line. They would
// start to matter if squirting ever deposited. That is why the base Pussy card
// deliberately does NOT print them - Ardis, 17 Aug: "redundant data for the user
// to know, it does nothing for them".
AFLP.SUBTYPE_LOADS = { "cock-slime": 6, "cock-hemipenis": 3 };
AFLP.SUBTYPE_LOADS_DEFAULT = 1;

// How many genital subtypes an actor actually has, and what they are worth.
// Gated on carrying the part: a stray `cock-*` key on a body with no cock buys
// nothing, the same way AFLP.cockSizeOf returns 0 without one. Without that gate
// a leftover flag would raise both economies on a creature that cannot use them,
// which is exactly the failure the pussy leak used to be.
AFLP.subtypeBonuses = (actor) => {
  const af = actor?.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {};
  const hasCock  = actor?.getFlag?.(AFLP.FLAG_SCOPE, "cock")  === true;
  const hasPussy = actor?.getFlag?.(AFLP.FLAG_SCOPE, "pussy") === true;
  let shot = 0, loads = 0;
  for (const [k, on] of Object.entries(af)) {
    if (!on) continue;
    const isCock  = k.startsWith("cock-");
    const isPussy = k.startsWith("pussy-");
    if (!(isCock && hasCock) && !(isPussy && hasPussy)) continue;
    shot  += 1;
    loads += AFLP.SUBTYPE_LOADS[k] ?? AFLP.SUBTYPE_LOADS_DEFAULT;
  }
  return { shot, loads };
};

// Default / cap for Coomer (now the number of loads before a rest).
AFLP.COOMER_DEFAULT = 4;
// NO CONSUMER as of 20 Aug 2026 - measured across the whole tree. Its only reader
// was Pineapple Diet's floor, and it contradicted both guide journals, which say
// "Loads has no cap". Left declared rather than deleted because it is Ardis's
// constant to retire, but DO NOT reach for it as a Loads ceiling: there is no
// such ceiling in the content. A declaration with no consumer is how
// capabilities.nativeArousal came to describe a bridge that no longer existed.
AFLP.COOMER_MAX     = 6;

// Per-shot Cum for an actor: size base + subtype mods, or a per-actor override
// flag world.cumPerShot. Minimum 1, NO upper cap - big creatures shoot big, and
// the excess past a hole's capacity of 8 spills onto the ground.
//
// TIMES BODY COUNT. A troop's volume comes from how MANY creatures it is, not
// how big the group's footprint is, so the size table answers for one body and
// AFLP.bodyCountOf multiplies. This is the half that deliberately does NOT
// follow bodySizeOverride down: stepping a goblin troop to Small fixes its cock
// (gap 0 against a Medium PC - a goblin does not ruin you) while its cum still
// fills a hole and spills, because there are dozens of them.
//
// The multiplier is applied at the single exit below so the override flag and
// the One Cock Ring scale with it too - whatever ONE body shoots, times bodies.
//
// KNOWN DRIFT: recalculateCum stores cum.max as Loads x this value, and a troop
// that loses squares mid-scene recomputes smaller. Self-correcting on the next
// recalculate; nothing persists a stale per-shot.
AFLP.cumPerShot = (actor) => {
  if (!actor) return 2;
  // BODY COUNT IS NOT IN HERE ANY MORE, and its absence is the design.
  //
  // This used to multiply the whole result by AFLP.bodyCountOf, so a fresh 16
  // body Pathfinder troop had Cum Shot 16 and a reservoir of 16 x Loads. Two
  // things were wrong with that. It assumed every body in the group climaxes
  // simultaneously every time - a gangbang spent 16 x 4 holes = the entire
  // reservoir in one action, and a 1v1 position from the same troop still put
  // 16 units into one hole, capping it and spilling. And it was hidden: no card
  // and no journal page in either system ever mentioned it (measured 17 Aug
  // 2026 - "troop", "horde" and "swarm" appear zero times across both guides),
  // so a GM reading a troop's sheet could not reconcile the numbers on it.
  //
  // Ardis, 17 Aug: "i actually dont want reservoir to be multiplied at all
  // because it is entirely not user facing... make a goblin troop read cum shot
  // and loads on the sheet just like a regular goblin."
  //
  // A troop is now a troop because it carries Cock (Multipenis), which fills
  // every hole at once and spends one Load per hole, and because its stat block
  // authors the Loads it should have. Both are visible on the sheet.
  // AFLP.bodyCountOf keeps its other jobs - the gangbang macro's Arousal and
  // catch, and the H-Scene card's body tallies - it just no longer sets volume.
  //
  // WHAT WOULD MAKE THIS STALE: a decision that a group's climax should deposit
  // more than one creature's worth. Put that on the POSITION (how many bodies
  // are in play), not back on the shot.
  const FLAG = AFLP.FLAG_SCOPE;
  const MOD = "ardisfoxxs-lewd-pf2e"; // item-flag scope for worn gear
  // Additive Cum Shot bonus: a manual flag plus any worn Cum Shot gear/effects.
  // Read live from the actor's items so equipping applies and removing removes.
  let bonus = Number(actor.getFlag?.(FLAG, "cumShotBonus")) || 0;
  let oneRing = false;
  for (const it of (actor.items ?? [])) {
    // Same rules as Loads: gear counts only while worn and invested, effects and
    // feats count on presence, and the draggable Cum Shot effect carries its
    // amount in its counter badge.
    if (!AFLP.anatomy._active(it)) continue;
    const b = Number(it.getFlag?.(MOD, "cumShotBonus"));
    if (Number.isFinite(b)) bonus += b;
    if (it.getFlag?.(MOD, "aflrKey") === "cum-shot" || it.system?.slug === "cum-shot") {
      const badge = Number(it.system?.badge?.value);
      if (Number.isFinite(badge)) bonus += badge;
    }
    if (it.getFlag?.(MOD, "oneCockRing")) oneRing = true;
  }
  // CAPPED AT 24, and the number is the content's. Ardis, 20 Aug 2026: "the cap
  // should be 24 as per the table in the journal which shows cum shot for a
  // gargantuan creature as 24." Both guides carry that table - Tiny-Medium 1,
  // Large 4, Huge 12, Gargantuan 24 - and say "while some creatures can fire Cum
  // Shots as large as 24". AFLP.BASE_CUM_BY_SIZE already matches it exactly; what
  // was missing was a ceiling on the TOTAL, so piercings, the cumShotBonus flag
  // and a stack of subtypes could push a creature past the largest number its own
  // guide describes. The comment above this function used to say "NO upper cap".
  //
  // The One Cock Ring still reads correctly: the journal says it "sets it to a
  // gargantuan 24", and grg + bonus now clamps to exactly that.
  // GOES STALE IF: the guide's size table gains a row above Gargantuan.
  const _floor = (v) => Math.max(1, Math.min(AFLP.CUM_SHOT_MAX, Math.round(v)));
  // The One Cock Ring floods like a gargantuan regardless of the wearer's size.
  if (oneRing) return _floor(AFLP.BASE_CUM_BY_SIZE.grg + bonus);
  const override = actor.getFlag?.(FLAG, "cumPerShot");
  if (Number.isFinite(override)) return _floor(override + bonus);
  const sizeKey = AFLP.cumSizeKeyOf(actor);
  const v = (AFLP.BASE_CUM_BY_SIZE[sizeKey] ?? AFLP.BASE_CUM_BY_SIZE.med)
          + AFLP.subtypeBonuses(actor).shot;
  return _floor(v + bonus);
};

// True when an actor never depletes its load pool: a manual flag, or worn gear
// (The One Cock Ring, or anything flagged infiniteLoads).
AFLP.hasInfiniteLoads = (actor) => {
  if (actor?.getFlag?.(AFLP.FLAG_SCOPE, "infiniteLoads")) return true;
  const MOD = "ardisfoxxs-lewd-pf2e";
  for (const it of (actor?.items ?? [])) {
    if (it.getFlag?.(MOD, "oneCockRing") || it.getFlag?.(MOD, "infiniteLoads")) return true;
  }
  return false;
};

// Ass (Cumfinity): was this climax driven by the ass? Anything counts - being
// fucked, a toy, fingers, foreplay - so this asks whether the actor is currently
// taking something anally rather than looking for a load being spent.
//
// Checked in order of confidence: an explicit hole on the call, the H-Scene
// position the actor is in, then any anal cumflation gained this scene.
AFLP.cumfinityAnal = (actor, tokenId = null, opts = {}) => {
  try {
    if (opts?.hole) return opts.hole === "anal";
    const holes = AFLP.HScene?.receivedHolesForActor?.(actor?.id, tokenId);
    if (Array.isArray(holes) && holes.length) return holes.includes("anal");
    // Fallback: something is in there right now.
    const cf = actor?.getFlag?.(AFLP.FLAG_SCOPE, "cumflation") ?? {};
    return (Number(cf.anal) || 0) > 0;
  } catch (e) { return false; }
};

// Effective loads = stored base (trainable, manually editable, uncapped) plus any
// worn loads gear: loadsBonus adds, loadsOverride sets a floor (e.g. Endless Loads = 20).
AFLP.effectiveLoads = (actor) => {
  if (!actor) return AFLP.COOMER_DEFAULT;
  const FLAG = AFLP.FLAG_SCOPE, MOD = "ardisfoxxs-lewd-pf2e";
  let base = Number(actor.getFlag?.(FLAG, "coomer")?.level);
  if (!Number.isFinite(base)) base = AFLP.COOMER_DEFAULT;
  // A manually entered bonus, edited on the sheet. The BASE stays the creature's
  // own (4 for a PC), so nothing an existing character has changes value; the
  // sheet now edits this instead of the absolute, which is what lets a player
  // count up their gear and type one number rather than doing the sum.
  let bonus = Number(actor.getFlag?.(FLAG, "coomer")?.bonus);
  if (!Number.isFinite(bonus)) bonus = 0;
  let override = 0;
  for (const it of (actor.items ?? [])) {
    // Gear only counts while actually worn and invested - a cock ring in your
    // backpack should not be filling you up. _active returns true for effects
    // and feats, which have no equipped block, so those count on presence.
    if (!AFLP.anatomy._active(it)) continue;
    const b = Number(it.getFlag?.(MOD, "loadsBonus"));   if (Number.isFinite(b)) bonus += b;
    const o = Number(it.getFlag?.(MOD, "loadsOverride")); if (Number.isFinite(o)) override = Math.max(override, o);
    // The draggable Loads effect carries its amount in its counter badge, so
    // dropping "Loads 20" on a token grants 20. Without this the effect is
    // decorative and every item that links it does nothing.
    if (it.getFlag?.(MOD, "aflrKey") === "loads" || it.system?.slug === "loads") {
      const badge = Number(it.system?.badge?.value);
      if (Number.isFinite(badge)) bonus += badge;
    }
  }
  // Anatomy Loads: EVERY subtype is worth Loads now, not just the multi-shaft
  // pair. See AFLP.subtypeBonuses - flat +1 each, with Multipenis at 6 and
  // Hemipenis at 3 because they spend one Load PER HOLE and their cards print
  // those totals.
  //
  // This used to be two hardcoded lines, `cock-hemipenis` +2 and `cock-slime`
  // +4, and nothing else in the anatomy touched Loads at all. Both numbers moved
  // (17 Aug 2026) and both cards have to say so; a card still reading "+4" is
  // the tell that the pack half of this change did not land.
  bonus += AFLP.subtypeBonuses(actor).loads;
  // Stretch King - kink-aware computed read (the effects-layer follow-up; Loads
  // is our own flag economy, so it reads here rather than storing an effect).
  // DH item text: Greater "Your Loads reservoir rises by +2", Mastery "rises to
  // +3" (replaces, not stacks). PF2e item text: Level 7 "You gain Loads 10" -
  // expressed as an override floor so it dedupes with a dragged Loads 10 item.
  // Gated on actorHasKink so it stays dormant below Lewd 3 like all kink
  // automation. Takes effect at the next cum recalculation (rest / sheet edit),
  // the same semantics as the tier scaling.
  if (AFLP.actorHasKink?.(actor, "stretch-king")) {
    const skTier = AFLP.getKinkTier?.(actor, "stretch-king") ?? 0;
    if (AFLP.system?.id === "pf2e") {
      if (skTier >= 3) override = Math.max(override, 10);
    } else if (skTier >= 2) {
      bonus += (skTier >= 3) ? 3 : 2;
    }
  }
  return Math.max(1, base + bonus, override);
};

// Default loads by tier of play: a flat baseline (all sizes) plus a step per tier.
// Tier 1-4 maps to level bands 1-5 / 6-10 / 11-15 / 16-20 (PF2e and 5e alike); DH
// adapters may override via AFLP.system.tierOfActor(actor) returning 1-4.
// Baseline 4, +2 per tier -> 4 / 6 / 8 / 10. Cum/shot (by size) supplies the size
// scaling; this axis supplies the level/tier scaling.
AFLP.LOADS_BASE     = 4;
AFLP.LOADS_PER_TIER = 2;
AFLP.tierOfLevel = (lvl) => (lvl <= 5 ? 1 : lvl <= 10 ? 2 : lvl <= 15 ? 3 : 4);
// Canonical character-level read, system-aware. PF2e: system.details.level.value.
// Daggerheart PCs: system.levelData.level.current. DH adversaries carry no level,
// so derive a representative one from their tier (1 / 3 / 6 / 9). Falls back to 1.
AFLP.actorLevel = (actor) => {
  const pf2e = Number(actor?.system?.details?.level?.value);
  if (Number.isFinite(pf2e)) return pf2e;
  const dh = Number(actor?.system?.levelData?.level?.current);
  if (Number.isFinite(dh) && dh >= 1) return dh;
  const legacy = Number(actor?.system?.level?.value ?? actor?.system?.level);
  if (Number.isFinite(legacy) && legacy >= 1) return legacy;
  const t = Number(actor?.system?.tier);
  if (Number.isFinite(t) && t >= 1) return t >= 4 ? 9 : t === 3 ? 6 : t === 2 ? 3 : 1;
  return 1;
};
AFLP.defaultLoadsForActor = (actor) => {
  const lvl = AFLP.actorLevel(actor);
  const tier = AFLP.system?.tierOfActor?.(actor) ?? AFLP.tierOfLevel(lvl);
  return AFLP.LOADS_BASE + (Math.max(1, tier) - 1) * AFLP.LOADS_PER_TIER;
};

// A hole's per-hole capacity. Cum beyond this on a shot spills onto the ground.
AFLP.CUM_HOLE_CAP = 8;

// How much this hole holds on THIS body before the rest spills onto the floor.
// One helper because two places ask and they must agree: cumflation.js decides
// what counts as overflow, and recordCumSpill decides whether a pool is drawn and
// how many ml the whisper names.
//
// They did NOT agree until 11 Aug 2026. Throat (Deepthroat) says the throat
// "absorbs one extra tier before it overflows and splashes back", and only the
// internal tally honoured it - recordCumSpill read the flat cap, so a deepthroat
// at 8 still spilled on the floor and still whispered the ml. Measured both
// directions: with the feature on, a unit into a full oral pool counted 0
// overflow and still returned a 1-unit spill.
AFLP.holeCumCap = (actor, poolKey) => {
  const base = AFLP.CUM_HOLE_CAP ?? 8;
  if (poolKey !== "oral") return base;
  try {
    const af = actor?.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {};
    return af["throat-deep"] === true ? base + 1 : base;
  } catch (e) { return base; }
};

// Dragging an AFLR condition card onto an actor should DO something.
//
// Measured 19 Aug 2026. On Daggerheart, dragging Horny, Exposed, Denied, Mind
// Break or Bimbofied onto a character created a `feature` item and changed
// NOTHING - `cond.value` stayed 0, the totals stayed 0, the status panel showed
// nothing. Five for five inert, with the card sitting on the sheet looking like
// it had worked. On Pathfinder it half-works, which is worse: a Horny item at
// badge 2 gives `cond.value 2` and `hornyTotal 0`, so the creature is visibly
// Horny and mechanically not.
//
// THE HARD PART IS NOT IMPORTING, IT IS NOT EATING AFLR'S OWN WRITES.
// On Pathfinder, Exposed and Mind Break ARE stored as items - they are not in
// the adapter's `_FLAG_CONDS` - so a hook that deleted every condition item it
// saw would destroy the condition it was trying to mirror, and then fire again
// on the next apply. Two rules keep that from happening, and neither is a
// hardcoded list that could drift from the adapters:
//
//   1. `horny` and `denied` ALWAYS import, because they are the two keys whose
//      store is a legacy flag while `cond.value` still answers from the item -
//      the one case where the item lying is the whole problem.
//   2. Every other key imports ONLY IF the condition does not already read the
//      item. If `cond.value` already sees it, the item IS the store on this
//      system, the drag already worked, and there is nothing to do. That test is
//      measured at runtime against the live adapter rather than declared here.
//
// GOES STALE IF: a third key gains a second store, or an adapter starts reading
// the item path for horny/denied.
AFLP.importConditionItem = async (item, { toast = true } = {}) => {
  const actorRaw = item?.parent;
  if (!actorRaw || actorRaw.documentName !== "Actor") return null;
  if (!AFLP.gm?.canWrite?.(actorRaw)) return null;
  // AFLR'S OWN WRITES ARE NOT DRAGS. The adapter tags every condition item it
  // creates, and this is the one guard that cannot be derived at runtime: an item
  // AFLR just made and a card a user just dropped look identical on the sheet.
  if (item.getFlag?.(AFLP.MODULE_ID ?? "ardisfoxxs-lewd-pf2e", "aflrApplied")) return null;
  const actor = AFLP.system.liveActor(actorRaw);   // an unlinked mook owns its own state

  // Which AFLR condition is this card? aflrKey first, then slug, then a
  // RESOLVING sourceId - AFLP.itemHasKey covers every path these have ever been
  // identified by, including an actor's embedded copy.
  let key = null;
  for (const k of Object.keys(AFLP.conditions ?? {})) {
    if (AFLP.itemHasKey(item, k)) { key = k; break; }
  }
  if (!key) return null;   // not a condition card - a Bonus Loads effect is left entirely alone

  const dual = (key === "horny" || key === "denied") ? AFLP[key] : null;
  const seen = Number(AFLP.cond?.value?.(actor, key)) || 0;
  if (!dual && seen > 0) return null;   // the item IS the store here; the drag already worked

  // The value. A PF2e card carries it in a counter badge and Ardis asked for
  // that to survive the import. A Daggerheart card carries NO badge - measured,
  // 0 of 10 do - so a drag means one more, and dragging twice means two.
  const badge = Number(item?.system?.badge?.value);
  const before = dual ? dual.total(actor) : seen;
  const want = AFLP.capCondition(key, Number.isFinite(badge) && badge > 0
    ? Math.max(before, badge)     // never LOWER an existing value to the card's default
    : before + 1);
  if (want <= before) return null;

  if (dual) await dual.raiseTo(actor, want);
  else await AFLP.cond.setValue(actor, key, want);

  // Keep the item only when it carries a real duration. AFLR's flag conditions
  // have no expiry of their own, so deleting a timed card would silently make it
  // permanent - a 1-day Bimbofied becoming forever. Foundry already expires the
  // item on schedule, and the deleteItem hook below clears the flag when it does,
  // so the duration survives with no new machinery. 3 of 11 PF2e condition cards
  // carry one; 0 on Daggerheart.
  const dur = item?.system?.duration;
  const timed = !!(dur && dur.unit && dur.unit !== "unlimited" && Number(dur.value) > 0);
  if (timed) {
    await item.setFlag(AFLP.FLAG_SCOPE, "importedCondition", key);
  } else {
    try { await item.delete(); } catch (e) { /* another hook may have removed it */ }
  }

  if (toast) {
    const label = AFLP.conditions?.[key]?.name ?? key;
    ui.notifications?.info(timed
      ? `${label} ${want} added to ${actor.name}'s status panel. The card stays on the sheet because it expires.`
      : `${label} ${want} added to ${actor.name}'s status panel.`);
  }
  return { key, value: want, keptItem: timed };
};

// `AFLP.spotlightNotes` lived here until 30 Aug 2026 and is DELETED. Its only
// consumer was the sheet's "On your Spotlight" panel, which Ardis removed the same
// day: *"we shouldn't have that on the sheet. even for player characters it doesn't
// belong in an AFLR sheet."* Deleted rather than left orphaned - a documented
// helper with no caller is the exact shape this project's founding audit was about.
// The Spotlight remains manual and unautomated, which was always the ruling.


// Every actor instance that can carry AFLR state: the world actors, PLUS the
// synthetic actor of every UNLINKED token on every scene.
//
// EXISTS BECAUSE `game.actors.contents` IS NOT THE POPULATION. An unlinked
// token's synthetic actor holds its own flag store and is not in that list, and
// its `id` EQUALS the base actor's - so `game.actors.get(id)` hands back the
// shared template instead. Measured 18 Aug 2026 in `pf2e-dev` on two unlinked
// tokens made from one base: both report the same `id`, writing `{arousal:4}`
// through token A left token B reading `undefined` and the base actor reading
// `undefined`, and a flag set on the BASE was readable through both tokens
// (the ActorDelta inherits, so a token-first READ is never worse than a
// world-first one). Any sweep that enumerates only `game.actors` skips every
// mook in the world.
//
// Yields `{actor, tokenId}` so callers can pass the tokenId straight on to
// AFLP.system.liveActor / AFLP_Arousal.increment. `tokenId` is null for a world
// actor. De-duplicated by instance, so a base actor is yielded once even when
// several of its tokens are placed.
// GOES STALE IF: Foundry stops giving unlinked tokens their own ActorDelta.
AFLP.allLiveActors = () => {
  const out = [];
  const seen = new Set();
  for (const a of game.actors?.contents ?? []) {
    if (a && !seen.has(a)) { seen.add(a); out.push({ actor: a, tokenId: null }); }
  }
  for (const scene of game.scenes?.contents ?? []) {
    for (const tok of scene.tokens?.contents ?? []) {
      // isLinked is the TokenDocument's own getter; a linked token's actor is
      // already the world actor and was yielded above.
      if (tok?.actor && !tok.isLinked && !seen.has(tok.actor)) {
        seen.add(tok.actor);
        out.push({ actor: tok.actor, tokenId: tok.id });
      }
    }
  }
  return out;
};

// Distance between two tokens (or {x,y} points) in scene units.
//
// EXISTS BECAUSE `canvas.grid.measureDistance()` WAS REMOVED IN FOUNDRY v13.
// Measured on core 14.365 / pf2e 8.4.0: `canvas.grid` is a SquareGrid and
// `measureDistance` is `undefined` - calling it throws TypeError, not a wrong
// number. Five shipped call sites did, and each one aborted the function it sat
// in (twice mid-way through an un-caught combatTurnChange chain, taking every
// later handler with it). If a future core restores measureDistance, this
// helper is still the right call site; delete it only when nothing calls it.
//
// Prefers the system's own measure when it has one - TokenPF2e.distanceTo
// applies PF2e's diagonal rule, token size and elevation. Core `measurePath`
// on token centres is the cross-system path; both returned 50 for the same
// pair when measured. Returns Infinity when it cannot measure, so a caller's
// `<= range` test reads as OUT of range: these are all effect-granting reads,
// and failing open would grant them to the whole scene.
AFLP.tokenDistance = (a, b) => {
  if (!a || !b) return Infinity;
  try {
    if (typeof a.distanceTo === "function" && b.center) {
      const d = a.distanceTo(b);
      if (Number.isFinite(d)) return d;
    }
    const pa = a.center ?? a;
    const pb = b.center ?? b;
    if (!Number.isFinite(pa?.x) || !Number.isFinite(pb?.x)) return Infinity;
    const d = canvas?.grid?.measurePath?.([pa, pb])?.distance;
    return Number.isFinite(d) ? d : Infinity;
  } catch (e) {
    console.warn("AFLP | tokenDistance failed", e);
    return Infinity;
  }
};

// Is `b` within range of `a`, where "range" is a DIFFERENT KIND OF THING per
// system? Pass one entry per system:
//
//   AFLP.withinRange(tok, other, { pf2e: 30, daggerheart: "close", dnd5e: null })
//
// A NUMBER is scene units. `null` MEANS THE EFFECT DOES NOT FIRE ON THAT SYSTEM -
// the honest answer where that system's content states no range for a mechanic,
// rather than inventing one.
//
// A STRING is a Daggerheart range BAND id. Daggerheart states range in bands:
// measured 19 Aug 2026 across the DH pack, 156 cards name one ("close range" 112,
// "far" 17, "melee" 17, "very close" 10) and ZERO state a distance in feet.
//
// A BAND'S NUMBER IS SQUARES, converted here by the scene's grid distance.
// AFLP.dhRanges() reads `{melee:1, veryClose:3, close:10, far:20, veryFar:30}`
// live off the daggerheart system, and per Ardis on 19 Aug 2026 the SYSTEM is
// the authority rather than the core rules' optional-grid guidance
// (Melee 1, Very Close 3, Close 6, Far 12, Very Far 13+), which the system
// matches only to Very Close. On a 5ft grid the system gives Close 50ft,
// Far 100ft, Very Far 150ft.
// (The comment on AFLP.DH_RANGE_FALLBACK calling those "the SRD values" is wrong
// on its face - the rulebook's numbers are 6/12/13, not 10/20/30. Left alone
// here because that ladder has other consumers; fix it there.)
//
// A CORRECTION I OWE THIS BLOCK. On 18 Aug I read Pathfinder's 30ft as
// Daggerheart's Very Far and set four sites to `null` on DH to stop them firing.
// That premise was wrong. Per the DH core rules, on a 5ft grid Close is 6 squares
// = 30ft, Far is 12 = 60ft, Very Far is 13+ = 65ft and up - so AFLR's existing
// 30 / 60 / 120 already sit at Close / Far / Very Far, and killing them lost four
// working features on a bad reading. They are numbers again.
AFLP.withinRange = (a, b, ranges = {}) => {
  const sys = AFLP.system?.id;
  if (!sys || !(sys in ranges)) return false;
  let limit = ranges[sys];
  if (typeof limit === "string") {
    // A band's `distance` is a count of SQUARES, so it is multiplied by the
    // scene's own grid distance to reach scene units. Ardis settled this on
    // 19 Aug 2026: follow the daggerheart system's live CONFIG rather than the
    // core rules' optional-grid guidance, so AFLR agrees with whatever else the
    // user's table is running. The two disagree from Close onward - system
    // 1/3/10/20/30 against rulebook 1/3/6/12/13+ - and that divergence is the
    // system's to own, not ours to reconcile.
    const ladder = (typeof AFLP.dhRanges === "function" ? AFLP.dhRanges() : null) ?? AFLP.DH_RANGE_FALLBACK ?? [];
    const squares = ladder.find(r => r.id === limit)?.distance;
    const perSquare = Number(canvas?.scene?.grid?.distance);
    limit = (Number.isFinite(squares) && Number.isFinite(perSquare)) ? squares * perSquare : null;
  }
  if (!Number.isFinite(limit)) return false;
  return AFLP.tokenDistance(a, b) <= limit;
};

// DH range ladder (distance in scene grid units). Read live from the daggerheart
// system when present, with a fallback to the SRD values.
AFLP.DH_RANGE_FALLBACK = [
  { id: "melee",     name: "Melee",      distance: 1  },
  { id: "veryClose", name: "Very Close", distance: 3  },
  { id: "close",     name: "Close",      distance: 10 },
  { id: "far",       name: "Far",        distance: 20 },
  { id: "veryFar",   name: "Very Far",   distance: 30 },
];
AFLP.dhRanges = () => {
  try {
    const r = CONFIG?.DH?.GENERAL?.range;
    if (r) {
      const order = ["melee","veryClose","close","far","veryFar"];
      const out = order.filter(k => r[k]).map(k => ({
        id: k,
        name: (() => { try { return game.i18n.localize(r[k].label || r[k].name); } catch { return r[k].name || k; } })(),
        distance: r[k].distance,
      }));
      if (out.length) return out;
    }
  } catch (e) { /* fall through */ }
  return AFLP.DH_RANGE_FALLBACK;
};

// Which range band a creature's overflow floods to, keyed to SIZE so a tabletop
// GM needs no math: read the size, read the band. One band per size step over
// Medium. Anything beyond gargantuan (homebrew colossi) reaches Very Far.
AFLP.CUM_SPILL_BY_SIZE = {
  tiny: "melee", sm: "melee", med: "melee",
  lg: "veryClose", huge: "close", grg: "far",
};
// Floor-pool radius in GRID SQUARES, by the giver's size. This is the canonical
// number: the canvas draws it and the chat text is derived from it, so the words
// and the picture can never disagree.
//
// It replaces the old `1 + sqrt(band distance)`, which had two faults: the `1 +`
// floor made even a Medium spill 4 squares across (wider than a Gargantuan
// creature), and the sqrt then squashed the sizes so close together that Large
// was barely distinguishable from Medium. It also reused Daggerheart RANGE bands
// as a radius, so on PF2e a huge spill claimed a 50-foot emanation.
//
// A clean doubling ladder instead. On PF2e (5 ft/square) these read as 2.5 / 5 /
// 10 / 20 / 40-foot emanations; on Daggerheart they sit about where the matching
// range band does.
AFLP.CUM_SPILL_RADIUS_BY_SIZE = {
  tiny: 0.5, sm: 0.5, med: 1, lg: 2, huge: 4, grg: 8,
};

// Resolve the spill for a shot. overflowUnits is the Cum past the hole's
// capacity (0 = contained, no ground spill). The BAND comes from the shooter's
// size (simple, table-friendly); the units ride along for puddle/vial volume.
AFLP.cumSpillRange = (overflowUnits, giverActor) => {
  const u = Math.max(0, Math.round(overflowUnits ?? 0));
  if (u <= 0) return null;
  const bands = AFLP.dhRanges();
  const byId  = Object.fromEntries(bands.map(b => [b.id, b]));
  let bandId = "melee";
  let sizeKey = "med";
  if (giverActor) {
    // Same one answer as the cum shot: a stepped-down troop sprays like one
    // goblin, not like the Gargantuan footprint the group occupies.
    sizeKey = AFLP.cumSizeKeyOf(giverActor);
    bandId = AFLP.CUM_SPILL_BY_SIZE[sizeKey] ?? "melee";
  }
  const band = byId[bandId] ?? bands[0];
  // `radius` (grid squares) is what gets drawn and what the chat text quotes; the
  // band is kept for Daggerheart's vocabulary only.
  const radius = AFLP.CUM_SPILL_RADIUS_BY_SIZE[sizeKey] ?? 1;
  return { units: u, radius, sizeKey, ...band };
};

// Shared spill recorder: given a deposit of `units` into a hole that was at
// `prevTier` before the shot, work out the overflow, stamp the receiver's
// cumSpill flag (max-merged so the widest pool sticks until mopped), and whisper
// the GM. Used by both the Daggerheart Carnal deposit and the pf2e cum macro so
// the floor-flood behaves identically on both systems.
AFLP.recordCumSpill = async (receiver, giver, prevTier, units, hole = null) => {
  try {
    if (!receiver) return null;
    // `hole` is optional only so an old call site cannot throw; without it this
    // falls back to the flat cap and a deepthroat spills a tier early. Every
    // shipped call site passes it.
    const cap = hole ? AFLP.holeCumCap(receiver, hole) : (AFLP.CUM_HOLE_CAP ?? 8);
    const spillUnits = Math.max(0, (units ?? 0) - (cap - (prevTier ?? 0)));
    if (spillUnits <= 0) return null;
    const spill = AFLP.cumSpillRange?.(spillUnits, giver);
    if (!spill) return null;
    try {
      const prev = receiver.getFlag(AFLP.FLAG_SCOPE, "cumSpill");
      const keep = (prev && (prev.units ?? 0) >= spill.units) ? prev : spill;
      await receiver.setFlag(AFLP.FLAG_SCOPE, "cumSpill", keep);
    } catch (e) { /* read-only actor */ }
    try {
      const ml = spill.units * (AFLP.CUM_UNIT_ML ?? 250);
      let poolText;
      if (AFLP.system?.id === "daggerheart") {
        // Daggerheart names the spread by range band. No distance number here:
        // the band is an approximation of the drawn radius, and printing DH's own
        // band distance next to a differently-sized pool just contradicts it.
        poolText = `pooling out to <strong>${spill.name}</strong> range`;
      } else {
        // PF2e (and other gridded systems) use feet: the drawn radius times the
        // scene's grid scale, described as an emanation centered on the flooded
        // creature. Quoting the radius keeps the text honest to the canvas.
        const gridDist = (typeof canvas !== "undefined" && canvas?.scene?.grid?.distance) || 5;
        const feet = spill.radius * gridDist;
        poolText = `pooling into a <strong>${feet}-foot emanation</strong> centered on ${receiver?.name ?? "them"}`;
      }
      await ChatMessage.create({
        speaker: { alias: giver?.name ?? "" },
        content: `<div class="aflp-chat-card aflp-carnal-card"><p><strong>${giver?.name ?? "Someone"}</strong>'s load floods past ${receiver?.name ?? "them"}'s brim - about ${ml}ml spills onto the floor, ${poolText}.</p></div>`,
        whisper: ChatMessage.getWhisperRecipients?.("GM").map(u => u.id) ?? [],
      });
    } catch (e) { /* chat unavailable */ }
    // Drop the floor pool for this spill EVENT. _maybeUpsertPuddle's passive
    // refresh dedupes on tier/units climbing, so an already-maxed receiver spills
    // (chat above) with no new pool - force one here so canvas matches the whisper.
    try { window.AFLP_Splatter?.forceSpillPuddle?.(receiver, spill); } catch (e) { /* no canvas */ }
    return spill;
  } catch (e) { console.warn("AFLR | recordCumSpill failed", e); return null; }
};



Object.assign(window.AFLP, {
  SCHEMA_VERSION: 4,
  FLAG_SCOPE: "world",

  // Build identity. make-aflp.mjs rewrites the module id for the AFLP build,
  // so this constant always names the module actually running.
  MODULE_ID: "ardisfoxxs-lewd-pf2e",

  // ── GM proxy ───────────────────────────────────────────────────────────────
  // Foundry lets a user update only actors they own. Almost every AFLR write
  // lands on somebody else's actor: a player using Sexual Advance or Carnal
  // Press writes Arousal, conditions and flags onto a MONSTER. Foundry answers
  // with "User <name> lacks permission to update Actor <id>", the macro dies
  // half-finished, and the player is told to find a setting that does not exist.
  //
  // So a write the caller cannot make is handed to the GM's client over
  // socketlib and awaited there. Actors cross the wire as uuids, which resolve
  // for unlinked token actors too (Scene.x.Token.y.Actor.z).
  //
  // Ops are registered by the module that owns them (see AFLP.gm.register), so
  // this layer knows nothing about arousal or conditions.
  gm: {
    // ── THE SOCKET IS RESOLVED LAZILY, AND THAT IS THE WHOLE POINT ──────────
    //
    // This was a plain `socket: null` that `setupSocket()` in socket.js assigned:
    //
    //     if (globalThis.AFLP?.gm) globalThis.AFLP.gm.socket = socketlibSocket;
    //
    // `setupSocket()` runs at `init` and again on `socketlib.ready`. AFLP itself
    // is built from `scripts/aflp/index.js`, which is a `scripts` entry and is
    // evaluated AFTER both of those. So `globalThis.AFLP?.gm` was undefined both
    // times, the optional chain quietly skipped the assignment, and nothing ever
    // called setupSocket a third time. **`AFLP.gm.socket` was null in every
    // session AFLR has ever run**, while socketlib was active and the module was
    // registered - measured in pf2e-dev 19 Aug 2026.
    //
    // The consequence is the bug users actually reported. Every proxied write by
    // a player onto a monster reached `run()`, found no socket, and produced
    //
    //     "AFLR | socketlib unavailable - a GM must be logged in for this."
    //
    // with a GM logged in and socketlib working. **The entire GM proxy was dead
    // for players, including every call site that was written correctly.** No
    // amount of routing more writes through `AFLP.gm` would have fixed it, and
    // the harness could never see it: it runs as the GM, where `canWrite` is
    // true for every actor and this branch is unreachable.
    //
    // So the socket is now ASKED FOR rather than handed over. No load order can
    // break a getter. `setupSocket`'s eager assignment still works and is still
    // welcome - it just stopped being load-bearing.
    //
    // This is the `AFLP.x?.(...)` rule from the project instructions wearing a
    // different hat: an optional-chained guard on our OWN global, which answers
    // "not yet" once and then never again.
    // WHAT MAKES THIS STALE: socketlib exposing its registry somewhere other than
    // `socketlib.modules`, or AFLR registering under a name other than MODULE_ID.
    _socket: null,
    get socket() {
      if (this._socket) return this._socket;
      // MODULE_ID, not a literal: make-aflp.mjs rewrites the id for the AFLP
      // fork, and a hardcoded name would resolve to nothing on that side.
      try { this._socket = globalThis.socketlib?.modules?.get(AFLP.MODULE_ID) ?? null; }
      catch (e) { this._socket = null; }
      return this._socket;
    },
    set socket(v) { this._socket = v; },
    ops: {},

    // True when this client may write to the actor directly.
    canWrite(actor) { return !!(game.user?.isGM || actor?.isOwner); },

    register(name, fn) { this.ops[name] = fn; },

    // Run locally when permitted, otherwise ask the GM. Returns whatever the op
    // returns, so callers that read the result (arousal gain objects) still work.
    async run(name, actor, ...args) {
      const fn = this.ops[name];
      if (!fn) { console.error(`AFLP | gm.run: unknown op "${name}"`); return null; }
      if (this.canWrite(actor)) return fn(actor, ...args);
      if (!this.socket) {
        // NAME WHICH ONE FAILED. The old text said "socketlib unavailable - a GM
        // must be logged in", which was wrong on both counts for two years:
        // socketlib was installed and a GM was logged in; only the handoff to
        // AFLP.gm.socket had failed. Players read it as "you must be the GM to
        // affect others" and went looking for a permission setting.
        const why = !globalThis.socketlib
          ? "the socketlib module is not installed or not active - AFLR needs it to act on creatures you do not own"
          : "AFLR could not reach its socket even though socketlib is running - please report this";
        ui.notifications?.error(`AFLR | ${why}.`);
        console.error(`AFLP | gm.run("${name}") had no socket. socketlib global: ${!!globalThis.socketlib}, registered module: ${!!globalThis.socketlib?.modules?.get(AFLP.MODULE_ID)}`);
        return null;
      }
      if (!game.users?.activeGM) {
        ui.notifications?.warn("AFLR | No GM is logged in, so that could not be applied.");
        return null;
      }
      return this.socket.executeAsGM("aflrGmOp", name, actor?.uuid ?? null, ...args);
    },

    // ALWAYS EXECUTES ON THE GM'S CLIENT, even when the caller could write locally.
    //
    // `run` takes a local fast path whenever `canWrite` is true, and for a plain
    // set-this-value op that is right and cheaper. IT IS WRONG FOR A READ-MODIFY-
    // WRITE OP, and the difference is not obvious, so it gets its own door.
    //
    // MEASURED IN pf2e-dev, 23 Aug 2026. `bumpLifetime` serialises per actor - but
    // the chain lives on whichever CLIENT runs it. Two players who both OWN the same
    // actor both pass `canWrite`, so both ran locally, each serialising its own ten
    // bumps correctly against its own chain, and then the two clients wrote the whole
    // `sexual` flag over each other:
    //
    //     one client, 10 parallel bumps        10 of 10   (the per-actor chain works)
    //     two owning clients, 10 each          10 of 20   (exactly one batch survived)
    //
    // Serialising per client cannot fix that. The write has to happen on ONE client,
    // and the GM is the only one every seat agrees on.
    //
    // FALLS BACK RATHER THAN LOSING THE WRITE: with no socket or no GM logged in, a
    // caller who can write does it locally. That is the old behaviour and the old
    // risk, which beats dropping the update entirely - and it is quiet, because a
    // solo player with no GM has nobody to race.
    // GOES STALE IF: `run`'s local fast path is removed, at which point this is `run`.
    async runOnGM(name, actor, ...args) {
      const fn = this.ops[name];
      if (!fn) { console.error(`AFLP | gm.runOnGM: unknown op "${name}"`); return null; }
      if (game.user?.isGM) return fn(actor, ...args);
      if (!this.socket || !game.users?.activeGM) {
        if (this.canWrite(actor)) return fn(actor, ...args);
        return this.run(name, actor, ...args);   // reuse run()'s reporting for the real failure
      }
      return this.socket.executeAsGM("aflrGmOp", name, actor?.uuid ?? null, ...args);
    },

    // GM side of the wire.
    // Ops that act on the WORLD rather than on an actor. They are the only ones
    // allowed across the wire with a null uuid - everything else still refuses,
    // because an op that quietly ran on "no actor" would be a silent no-op.
    WORLD_OPS: new Set(["bankFear"]),

    async _handle(name, actorUuid, ...args) {
      const fn = AFLP.gm.ops[name];
      if (!fn) return null;
      if (AFLP.gm.WORLD_OPS.has(name)) return fn(null, ...args);
      if (!actorUuid) return null;
      const actor = await fromUuid(actorUuid).catch(() => null);
      if (!actor) { console.warn(`AFLP | gm._handle: could not resolve ${actorUuid}`); return null; }
      return fn(actor, ...args);
    },
  },
  // Starfinder 2e (system id "sf2e") is a fork of the PF2e system and runs the
  // PF2e adapter. Use this for raw game.system.id gates; adapter-level checks
  // (AFLP.system.id === "pf2e") are already family-safe because sf2e loads the
  // PF2e adapter.
  PF2E_FAMILY: ["pf2e", "sf2e"],
  isPF2eFamily() { return AFLP.PF2E_FAMILY.includes(game.system?.id); },
  // Foundry filters compendium packs by system server-side, so in an SF2e
  // world the pf2e-tagged packs do not exist and the build ships sf2e twins
  // (see build/make-sf2e-packs.mjs). This map redirects pack-name segments in
  // sf2e worlds; sysUuid applies it to UUIDs, CONTENT_ITEMS_PACK to pack ids.
  SF2E_PACK_MAP: {
    "aflp-lewd-items":   "aflr-sf2e-items",
    "aflp-lewd-actors":  "aflr-sf2e-actors",
    "aflp-lewd-journals":"aflr-sf2e-journals",
    "aflr-pf2e-macros":  "aflr-sf2e-macros",
  },
  // The module's item content pack for the running world.
  get CONTENT_ITEMS_PACK() {
    const name = game.system?.id === "sf2e" ? AFLP.SF2E_PACK_MAP["aflp-lewd-items"] : "aflp-lewd-items";
    return `${AFLP.MODULE_ID}.${name}`;
  },
  // Remap a pf2e-family compendium UUID for the running world:
  // - Compendium.pf2e.X -> Compendium.sf2e.X (the sf2e fork ships the same
  //   condition items under its own package id)
  // - module content pack segments -> their sf2e twins
  // Passthrough everywhere else and on pf2e itself.
  sysUuid(uuid) {
    const sys = game.system?.id;
    if (sys !== "sf2e" || !uuid) return uuid;
    let u = String(uuid).replace(/^Compendium\.pf2e\./, `Compendium.${sys}.`);
    for (const [from, to] of Object.entries(AFLP.SF2E_PACK_MAP)) {
      u = u.split(`${AFLP.MODULE_ID}.${from}.`).join(`${AFLP.MODULE_ID}.${to}.`);
    }
    return u;
  },
  // The engine macro compendium shipped inside this module (system-agnostic
  // sources; the per-system packs hold the user-facing link stubs).
  get ENGINE_MACRO_PACK() { return `${AFLP.MODULE_ID}.aflp-lewd-macros`; },

  // 1 unit = 250ml
  /** ml per cum unit — read from settings at runtime, falls back to 250 (fantasy) if settings not yet loaded */
  get CUM_UNIT_ML() { return AFLP.Settings?.cumUnitMl ?? 250; },

  // Cum Shot UNITS are the canonical stored stat. Every other measure is derived
  // from them at DISPLAY time, never persisted - because CUM_UNIT_ML is 250 on
  // Fantasy and 4 on Realistic, a 62.5x swing. A stored ml figure is frozen at
  // whatever setting was live when it was written, so switching modes silently
  // rewrites the character's history. Store units; convert on the way out.
  //
  //   AFLP.cumMeasure(units, "units" | "ml" | "floz" | "gal")  -> formatted string
  // Open the hypnosis ladder on a target, with `entrancer` as the one who did it.
  // ONE place, because five separate things must be stamped and any caller that
  // forgets one silently breaks a different part of the ladder:
  //   entranced           the condition itself
  //   entrancedBy         the sink reads it to know whose effect deepens the hold
  //   entrancerSignature  Entranced/Hypnotized predicate the -2/-4 saves on it
  //   hypnoConditionerId  Hypno Slave conditioning and _hsHardDC read it
  //   mindHoldDC          Shake Free rolls against it
  //
  // Refuses to regress a deeper hold. Returns true if Entranced was applied.
  async entrance(entrancer, target, originDC = null) {
    try {
      if (!entrancer || !target) return false;
      const deeper = AFLP.cond.has(target, "hypnotized")
        || AFLP.cond.has(target, "persona-overridden")
        || target.items?.some?.(i => i.slug === "persona-overridden" || /^Persona Overridden$/i.test(i.name ?? ""));
      if (deeper) return false;

      if (!AFLP.cond.has(target, "entranced")) {
        await AFLP.cond.apply(target, "entranced", 1);
        await AFLP.bumpMindLadder(target, "timesEntranced");
        // Top-side credit: the entrancer put a new mind under. Self-entrancing
        // (a solo trance) would double-count as both sides, so skip when they
        // are the same actor. System-agnostic - entrance() is the shared writer
        // every adapter routes through.
        if (entrancer.id !== target.id) await AFLP.bumpLifetime(entrancer, "mindsEntranced");
      }
      await AFLP.gm.run("setFlag", target, "entrancedBy", entrancer.id);
      await AFLP.gm.run("setFlag", target, "hypnoConditionerId", entrancer.id);
      if (entrancer.signature) await AFLP.gm.run("setFlag", target, "entrancerSignature", entrancer.signature);

      const dc = Number(originDC)
        || entrancer.spellcasting?.contents?.[0]?.statistic?.dc?.value
        || entrancer.system?.attributes?.classDC?.value
        || (10 + Math.floor((entrancer.level ?? 1) / 2) + 4);
      await AFLP.gm.run("setFlag", target, "mindHoldDC", dc);
      return true;
    } catch (e) { console.warn("AFLP | entrance:", e?.message); return false; }
  },

  // Lifetime counters for the mind ladder. One helper, called from every place a
  // stage is applied, so the count cannot drift between the five call sites.
  // GM-proxied: a player Mesmerist entrancing a monster must not fail the write.
  // NOW ONE DOOR, because this was a second copy of `bumpLifetime` - the same read
  // of the same `sexual` flag, the same `+1` into the same `lifetime` namespace, the
  // same write back, and therefore the same lost update. Worse than a duplicate: the
  // two functions raced EACH OTHER as well as themselves, since they write one shared
  // object. Fixing `bumpLifetime` alone would have left the hole half open.
  //
  // TWO BEHAVIOUR CHANGES COME WITH THE MERGE, both stated rather than smuggled:
  //
  // 1. It now runs on the GM's client via `runOnGM`, like every other lifetime bump.
  // 2. IT NOW AWARDS TITLES. The old body never called `checkAndAward`, so a title
  //    that depended only on mind-ladder counters (`timesHypnotized` and friends)
  //    could not fire when it was earned - it sat until some unrelated bump happened
  //    to run and noticed. That was a latent bug, not a design choice; nothing in the
  //    content says the mind ladder is exempt from titles.
  //
  // GOES STALE IF: the mind ladder moves out of `sexual.lifetime` into a store of its
  // own, at which point it needs its own serialisation rather than this delegation.
  async bumpMindLadder(actor, key) {
    return AFLP.bumpLifetime(actor, key, 1);
  },

  // Generic lifetime-counter bump for the DOMINANT/top side of an interaction.
  // The counterpart being credited (the conditioner, breeder, dominator, or
  // performer) is almost never owned by the acting player - a player entrancing
  // a monster credits the PLAYER (owned, fine), but a monster entrancing a player
  // credits the MONSTER (GM-owned). So this MUST be GM-proxied exactly like
  // bumpMindLadder, or the write throws on the wrong client. `amount` lets one
  // event credit several (e.g. offspringSired += litter size). Idempotency is the
  // caller's job - guard per-scene/per-event before calling, as the tops-side
  // sites do (see closeScene gangbang tally, addPregnancy, the defeat scan).
  // CONCURRENT BUMPS ON ONE ACTOR USED TO LOSE ALL BUT ONE. Measured in pf2e-dev
  // on 23 Aug 2026, on the GM's own client with no socket involved:
  //
  //     10 bumps, awaited one at a time     -> 10      the arithmetic was never wrong
  //     10 bumps fired in parallel          ->  1      nine lost, silently
  //     two players, 10 each, in parallel   ->  2      eighteen lost, silently
  //
  // The cause is the shape, not the seat: this reads the WHOLE `sexual` flag,
  // mutates it and writes it back. Every concurrent caller reads the same starting
  // object and the last write wins. Nothing throws, so nothing is reported.
  //
  // IT IS TRIGGERED IN SHIPPED CODE. `closeScene` bumps `lifetime.gangbang` with an
  // unawaited `setFlag(...).catch(() => {})`, fires `checkAndAward` unawaited beside
  // it - and `checkAndAward` writes this SAME flag - then a few lines later takes its
  // own snapshot of `sexual` for the session titles and awaits a write over the top.
  // Whichever read happens first wins, and the losers vanish along with the titles
  // they feed.
  //
  // SERIALISED PER ACTOR. Each call chains behind the previous one for the same
  // actor id, and - the load-bearing part - THE READ HAPPENS INSIDE THE CHAIN, so
  // every link sees the previous link's write. Callers that forget to await are now
  // safe by construction, which matters because the forgetting is what caused this.
  //
  // `checkAndAward` runs INSIDE the chain too, because it writes `sexual` as well
  // (aflp-titles.js) and would otherwise race the next bump. Verified safe from
  // deadlock: it does not call back into bumpLifetime.
  //
  // GOES STALE IF: something else starts read-modify-writing `flags.world.sexual`
  // outside this chain - the other writers are listed in the queue entry for this
  // fix, and they are the reason this map is keyed by actor rather than global.
  async bumpLifetime(actor, key, amount = 1) {
    try {
      const world = actor?.getWorldActor?.() ?? actor;
      if (!world || !key) return;
      // ON THE GM'S CLIENT, ALWAYS - not merely "on a client that may write".
      // `canWrite` was the old gate and it is not enough here: two players who both
      // own one actor both pass it, both serialise locally against their own chain,
      // and then overwrite each other. Measured 23 Aug 2026, ten bumps from each of
      // two owning seats produced 10 of 20. See `gm.runOnGM`.
      if (!game.user?.isGM) return AFLP.gm.runOnGM("bumpLifetime", world, key, amount);

      AFLP._lifetimeChains ??= new Map();
      const id = world.id;
      const prev = AFLP._lifetimeChains.get(id) ?? Promise.resolve();
      const next = prev.then(async () => {
        const sx = foundry.utils.duplicate(world.getFlag(AFLP.FLAG_SCOPE, "sexual") ?? {});
        sx.lifetime = sx.lifetime ?? {};
        sx.lifetime[key] = (sx.lifetime[key] ?? 0) + (Number(amount) || 0);
        await world.setFlag(AFLP.FLAG_SCOPE, "sexual", sx);
        try { await globalThis.AFLP_Titles?.checkAndAward?.(world); } catch (e) { /* awards are best effort */ }
      }).catch((e) => { console.warn("AFLP | bumpLifetime:", e?.message); });
      AFLP._lifetimeChains.set(id, next);
      // Drop the entry once this call is the tail, so the map cannot grow without
      // bound across a long session.
      next.finally(() => { if (AFLP._lifetimeChains.get(id) === next) AFLP._lifetimeChains.delete(id); });
      await next;
    } catch (e) { console.warn("AFLP | bumpLifetime:", e?.message); }
  },

  cumMeasure(units, mode = "units") {
    const u = Number(units) || 0;
    if (mode === "units") return `${u}`;
    const ml = u * (AFLP.CUM_UNIT_ML ?? 250);
    if (mode === "ml") return ml >= 1000 ? `${(ml / 1000).toFixed(1)} L` : `${Math.round(ml)} ml`;
    if (mode === "floz") return `${(ml / 29.5735).toFixed(1)} fl oz`;
    if (mode === "gal")  return `${(ml / 3785.41).toFixed(2)} gal`;
    return `${u}`;
  },

  // Read units for a hole, falling back to a derived value for saves written before
  // unit tracking existed. The fallback is approximate: it assumes the ml was
  // written under the CURRENT setting, which is the best guess available.
  unitsForHole(lifetime, bucket, hole) {
    const units = lifetime?.[bucket]?.[hole];
    if (typeof units === "number") return units;

    // Legacy fallback: derive from stored ml. Guard it against the load count,
    // because older saves wrote mlGiven without ever incrementing given[hole] -
    // deriving blind produced "0 loads given, 69 units given", which is nonsense.
    // No loads means nothing was delivered, whatever the stale ml says.
    const loads = bucket === "unitsReceived"
      ? (lifetime?.[hole] ?? 0)
      : (lifetime?.given?.[hole] ?? 0);
    if (!loads) return 0;

    const mlBucket = bucket === "unitsReceived" ? "mlReceived" : "mlGiven";
    const ml = lifetime?.[mlBucket]?.[hole];
    if (typeof ml === "number") return Math.round(ml / (AFLP.CUM_UNIT_ML ?? 250));
    return 0;
  },

  // ===============================
  // Core items
  // ===============================
  genitaliaDefaults: { pussy: false, cock: false },

  // ===============================
  // Default sexual stats
  // ===============================
  sexualDefaults: {
    lifetime: {
      oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0,
      given:    { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 },
      cumUnits: 0, cumUnitsSpent: 0, cumReceived: 0, cumGiven: 0,
      mlReceived: { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 },
      mlGiven:    { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 },
      timesImpregnated: 0,
      timesCummed:      0,   // orgasms (arousal hitting max)
      timesDefeated:    0,   // Defeated condition applied
      timesMindBroken:  0,   // Mind Break condition applied
    },
    titles: [],
    favorites: [],
    kinks: {},
    kinkNotes: {}
  },

  cumDefaults:    { current: 0, max: 0 },
  coomerDefaults: { level: 4 },   // Loads = times you can cum before a rest (baseline 4)
  arousalDefaults: { current: 0, max: 6, maxBase: 6 },
  // Horny flag — replaces the Horny / Horny (Always) condition items.
  // temp:      clears on cum (equivalent to old Horny condition)
  // permanent: persists through cum (equivalent to old Horny Always, granted by kinks)
  hornyDefaults: { temp: 0, permanent: 0 },
  deniedDefaults: { value: 0 },

  // ===============================
  // Partner history entry template
  // ===============================
  partnerHistoryEntry: {
    sourceUuid: "",
    sourceName: "",
    date: 0,          // game.time.worldTime at time of event
    holes: [],        // e.g. ["oral", "vaginal"]
    mlGiven: 0,       // ml given by this source this event (on source actor)
    mlReceived: 0,    // ml received by target from this source this event
    pregnancyResult: null  // null | { offspring: Number, deliveryType: "live"|"egg" }
  },

  pregnancyTemplate: {
    sourceUuid: "",
    sourceName: "",
    startedAt: 0,
    gestationTotal: 30,
    gestationRemaining: 30,
    offspring: 0,
    deliveryType: "live"
  },

  // ===============================
  // Kink Registry
  // ===============================
  kinks: {
    "dominant":          { name: "Dominant",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.C5ZtoqW4NXEAUdCf" },
    "submissive":        { name: "Submissive",        uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.R0DRa8QhwXC3LhUD" },
    "switch":            { name: "Switch",            uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.bRrDiw8DIxqYFgRA" },
    "aphrodisiac-junkie":{ name: "Aphrodisiac Junkie",uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.k71GcOR7w25IiwTG" },
    "bondage-princess":  { name: "Bondage Princess",  uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.3iI8WWhDnl71NqVW" },
    "brood-sow":         { name: "Brood Sow",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.zfNxhu2nn3YPz9Lb" },
    "creature-fetish":   { name: "Creature Fetish",   uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.fcnEx5qeoOFNcr5v" },
    "cum-slut":          { name: "Cum Slut",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.omYlzPBNXLVAI7N3" },
    "edge-master":       { name: "Edge Master",       uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.6xLbRrviQSmUEsKP" },
    "exhibitionist":     { name: "Exhibitionist",     uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.JRXfjU2WvdruuhWD" },
    "party-animal":      { name: "Party Animal",      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.pfs8GCIbh6E8polc" },
    "purity":            { name: "Purity",            uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.eFcEwxfe56UxqlJc" },
    "bimbo":             { name: "Bimbo",             uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.mTSsjimziKIcEbLO" },
    "gangslut":          { name: "Gangslut",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.fNSwvzZ3ddJmu7yG" },
    "voyeurism":         { name: "Voyeurism",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.NKiO32mIdFJZpwnb" },
    "ouroboros":         { name: "Ouroboros",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.QvwGGnxQotq1giao" },
    "stretch-king":      { name: "Stretch King",      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.2Kth26AcSdPDxkKa" },
    // PF2e item, per roster convention (DH resolves its own copy via the aflrKey
    // tag on aflr-dh-items.Item.XULVY0PET4hpJ7oh through contentUuid).
    "size-difference":   { name: "Size Difference",   uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.oCFFa3Bfk2bEFzA9" },
    "bull":              { name: "Bull",              uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.JOEfopYTTGGEp5UE" },
    "pain-slut":         { name: "Pain Slut",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.ote7u6RAgw6ZR2w5" },
    "ouroboros":         { name: "Ouroboros",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.6NIXK6BWqAfpxJtt" },
    "hypno-slave":       { name: "Hypno Slave",       uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.naEmpTaaGI3qYAeC" },
  },

  // ===============================
  // Condition Registry
  // Verified against aflp-lewd-items compendium pack.
  // Slugs are used for primary matching; uuids as fallback sourceId checks.
  // ===============================
  conditions: {
    "afterglow":   { name: "Afterglow",   uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.kCV26tqXcvQIcYvM" },
    "arousal":     { name: "Arousal",     uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7Z2RdSitwyyppWN8" },
    "defeated":    { name: "Defeated",    uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.mU065Nhk4ByNujhw" },
    "denied":      { name: "Denied",      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.LrJ9mbeEBXTNp57C" },
    "dominating":  { name: "Dominating",  uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.Cw6RHpmTWEVgzrce" },
    "exposed":     { name: "Exposed",     uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.ocRgNSfLD65sWBhs" },
    // Exposed (Nude) carries an EMPTY system.rules[] ON PURPOSE. Do not "fix" it.
    // Exposed proper holds two FlatModifier rules (circumstance, -1 * @item.badge.value,
    // selectors `ac` and `fortitude`). The Nude copy deliberately holds neither, because
    // it is what the *nude* rune (Item.b4uOUyp0N7lQj6wf) grants: "While nude by this rune
    // you are Exposed, but you do not suffer the penalty to AC or Fortitude saves from
    // this condition." Sharing the `exposed` slug is the mechanism, not an oversight -
    // every slug-based read (AFLP.cond, _getEffectiveExposedLevel, the exposure art sync)
    // sees a nude character as Exposed 2 so the downstream kinks all fire, while PF2e's
    // rules engine finds no modifier to apply. Badge is pinned value/min/max 2 so the
    // level cannot drift. Adding rules here would silently re-penalise every rune wearer.
    "exposed-nude":{ name: "Exposed (Nude)", uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.Y8wxUgOvsXaF2Mc4" },
    "horny":         { name: "Horny",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.hmYj3xU7xrdjMHpe" },
    // "horny-always" (Horny (Permanent)) was RETIRED in 2026-07 - Horny now maxes
    // at 3 and fades on rest. The pack item is gone, so the registry entry is
    // removed too; it pointed at a dead uuid and anything calling cond.apply on
    // it would have failed. The remaining cond.has("horny-always") reads in the
    // status panel and kinks are deliberately left: they resolve through the slug
    // path, so a character created before the retirement who still carries an
    // embedded copy keeps working.
    "bimbofied":     { name: "Bimbofied",     uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.9ySsqXnpfZkhmp2V" },
    "bullified":     { name: "Bullified",     uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.Y2IbwZ9imm4E8v5D" },
    "entranced":     { name: "Entranced",     uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.TAB6oWc9YEEOQHBd" },
    "hypnotized":    { name: "Hypnotized",    uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.sm2jFs2xJNhilEoC" },
    // The Hypno Slave end-state. It was never in this registry, so contentUuid()
    // had no canonical fallback and every caller hardcoded the PF2e UUID directly -
    // which resolves in PF2e/DH but NOT in 5e (that world uses the aflr-5e-items
    // pack). Registered here so contentUuid("persona-overridden") returns a value,
    // and so a system that tags its own copy (aflrKey) resolves via _contentIndex.
    "persona-overridden": { name: "Persona Overridden", uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.kxZVkuhIAW9pjnOI" },
    // WAS ZHMYtfYLHQI1hHnX until 18 Aug 2026 - that id is "Effect: Elixir of
    // Birth Control", the consumable's effect, not the Birth Control CONDITION.
    // See the note on "breeding" below for what a mis-pointed condition uuid
    // does. (The separate _ITEM_UUIDS entry still names the elixir effect on
    // purpose: "is this actor on birth control" is answered by carrying the
    // effect, not by carrying the elixir in a backpack.)
    "birth-control": { name: "Birth Control", max: 3,
      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.ivWPDyho7crXnPGx",
      desc: "Contraception, staged 1-3: each stage reduces the effective Fertility stage by 1. At effective Fertility 0 no pregnancy can take." },
    // Leveled fertility state, slug kept as "breeding" so every existing
    // reader (occupancy gate, gestation shortening, cum macro pre-checks)
    // keeps working. I = Potion of Breeding (temporary), II = the Permanent
    // effect; the effect->condition binding hooks in index.js keep the flag
    // in sync with the PF2e effect items, and the manager can set it by hand
    // on any system.
    // Rescaled 2026-07: Fertility 1 is every creature's implicit default (normal
    // Brood Roll); the stored condition records deviations. 0 = blocked outright,
    // 2 = Brood Roll Difficulty -2 (Fertile anatomy), 3 = no roll needed, it just
    // takes (Breeder anatomy, Potion of Breeding). Birth Control subtracts from
    // the effective stage, floored at 0. NOTE for the code sweep: the legacy
    // readers named above still treat any value > 0 as the old potion semantics
    // (bred-while-carrying + short gestation); they must be re-mapped to stage 3.
    // THE UUID MUST BE THE CONDITION, NOT THE THING THAT GRANTS IT.
    // This read jQ3G8jwA2boYGVrr until 18 Aug 2026 - "Effect: Potion of
    // Breeding". Because `breeding` is a _FLAG_COND on PF2e, applyCondition
    // calls _deleteLegacyConditionItem first, which matches on THIS uuid: so
    // drinking the potion set Fertility 3 and then DELETED the potion effect
    // that granted it. Measured that day: the effect vanishes off the sheet and
    // Fertility 3 stays with nothing left to expire, which quietly turns the
    // temporary potion into the permanent one. Whether the deleteItem sync then
    // clears the flag is a race with the setFlag that follows the delete, so the
    // observed end state was not even stable. Same class as "birth-control"
    // above; both now point at the condition documents.
    "breeding":      { name: "Fertility", max: 3,
      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.5XuYxTnQd6scwp7V",
      desc: "Staged fertility. 1 is the default: a normal Brood Roll. 0: blocked, no Brood Roll at all. 2: Brood Roll Difficulty -2. 3: no roll needed, the breeding simply takes. Birth Control reduces the effective stage." },
    "mind-break":  { name: "Mind Break",  uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.B74Z3GBzgNMoVXr7" },
    "submitting":  { name: "Submitting",  uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.kBLJPOJNjz8fmxrQ" },
    // Stuck Submitting: Submitting + held fast (Exposed, Restrained, cannot leave
    // the scene until freed via Escape). Reusable for any grab-and-hold - troop
    // Gangbang on a failed save, a mimic chest, Wind Wall Trap pinning a target in
    // a wall. Because the target is already pinned, others may Sexual Advance it
    // without Struggle Snuggling first.
    "stuck-submitting": { name: "Stuck Submitting", uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.rwfLcryqVH4uMgvt" },
    "swallowed": { name: "Swallowed", uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.QTqiXk1POmYJk0ax" },
    "toasted": { name: "Toasted", uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.lGBCyDcI0HphDAaI" },
    // Masturbating: an actor lost in a self-scene (self-pleasuring). Grants the
    // "self-absorbed" opening - adversaries who press / advance / grapple them do
    // so more easily. The mechanical vulnerability is applied in code per system
    // (DH: +1 resist disadvantage die; PF2e: off-guard vs grapple / +1 Arousal on
    // Sexual Advance); this effect item carries the PF2e off-guard AE and gives
    // the status its display. Applied on self-scene start, removed on scene end.
    "masturbating": { name: "Masturbating",
      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7VVlk8V2nSqftatG",
      desc: "Lost in self-pleasure - self-absorbed and vulnerable. Adversaries who press, advance on, or grapple you do so more easily." },
  },

  // ===============================
  // Unified Condition API (flag-first, legacy-item fallback)
  // ===============================
  // One read/write surface for AFLR-owned conditions so UI and mechanics share a
  // single source of truth across PF2e / Daggerheart / D&D5e. Reads consult the
  // system adapter first (flag-backed on DH, item-backed on PF2e today) and fall
  // back to a legacy PF2e condition item - so call sites keep working throughout
  // the 8.0.0 flag migration, before AND after PF2e storage is flipped to flags.
  // Writes delegate to the adapter (which applies the per-system mechanical part).
  cond: {
    _live(actor, tokenId = null) {
      if (!actor) return null;
      if (tokenId) return AFLP.system?.liveActor?.(actor, tokenId) ?? actor;
      return actor.token?.actor ?? actor;
    },
    _legacyItem(actor, slug, tokenId = null) {
      const live = this._live(actor, tokenId);
      const uuid = AFLP.conditions?.[slug]?.uuid;
      return live?.items?.find(c =>
        c.slug === slug || (uuid && (c.flags?.core?.sourceId ?? c.sourceId) === uuid)
      ) ?? null;
    },

    // ── The dual-store door ──────────────────────────────────────────────────
    //
    // `horny` and `denied` are the two keys whose STORE is per-system, and
    // AFLP.horny / AFLP.denied own that branch. On Daggerheart the store IS the
    // valued condition, so cond.* below is the primitive and the door calls back
    // into it - `_door` MUST return null there or `_setTotal -> cond.setValue ->
    // _setTotal` recurses forever. On Pathfinder and 5e the store is the legacy
    // `{temp, permanent}` world flag, cond.* would otherwise reach the ITEM path,
    // and that item is a SECOND store that no AFLR reader looks at.
    //
    // Measured in pf2e-dev, 19 Aug 2026, on Neela:
    //
    //   AFLP.cond.apply(a, "horny", 2)  ->  cond.value 2   AFLP.horny.total 0
    //
    // The status panel, the sheet tab, the arousal bonus, rest and daily prep all
    // read the door, so the player saw Horny 0 after a successful application.
    // This is the same split that Denied had at the reader level and Horny had at
    // the writer level; the condition API was the third face of it. Tagging
    // AFLR's own items (pf2e-adapter `aflrApplied`) stopped the drag importer
    // eating them but did NOT make the two stores agree - it only moved which one
    // was wrong. This does: for these keys, on these systems, there is no item.
    //
    // GOES STALE IF: Pathfinder or 5e moves Horny or Denied into a condition (then
    // the door's own `_setTotal` branch changes with it and this follows), or a
    // third dual-store key appears - add it to `_DUAL` and to the doors, not here.
    // `_DUAL` is "does this key have a per-system store"; `_door` is the stronger
    // "and is the door a DIFFERENT store from the condition on THIS system".
    // Every leg below asks `_door` EXCEPT `remove`, which asks `_DUAL` - the
    // floor lives in the bag on every system, so settling to it is right even
    // where the total lives in the condition. See the comment on `remove`.
    _DUAL: ["horny", "denied"],
    _door(slug) {
      if (!this._DUAL.includes(slug)) return null;
      const d = AFLP[slug];
      if (!d) return null;
      // Daggerheart keeps these IN the condition - cond.* is the primitive there.
      return AFLP.system?.id === "daggerheart" ? null : d;
    },
    // A stray Horny/Denied ITEM on a system whose door is the flag is always
    // wrong now - a pre-fix application, or a drag the importer has not reached.
    // Stripped opportunistically on any door write rather than in a migration, so
    // there is no version gate to forget. Failure is non-fatal: the door is
    // already authoritative, the item is only a misleading second badge.
    async _stripStrayItem(actor, slug, tokenId = null) {
      try {
        const item = this._legacyItem(actor, slug, tokenId);
        if (!item || !AFLP.gm?.canWrite?.(actor)) return;
        // NOT a card the importer deliberately KEPT. A timed card carries
        // `importedCondition`, and the deleteItem hook clears what it imported -
        // so stripping one here would fire that hook and wipe the value the
        // caller is in the middle of writing. The card is Foundry's expiry timer,
        // not a second store.
        if (item.getFlag?.(AFLP.FLAG_SCOPE, "importedCondition")) return;
        await item.delete();
      } catch (e) { /* non-fatal */ }
    },

    // True if the condition is present via the adapter (flag/item per system) OR
    // a legacy PF2e item.
    has(actor, slug, tokenId = null) {
      if (!actor) return false;
      const door = this._door(slug);
      if (door) return (Number(door.total(this._live(actor, tokenId))) || 0) > 0;
      try { if (AFLP.system?.hasCondition?.(actor, slug, tokenId)) return true; } catch (e) { /* ignore */ }
      return !!this._legacyItem(actor, slug, tokenId);
    },
    // Numeric value of a valued condition (0 if absent).
    value(actor, slug, tokenId = null) {
      if (!actor) return 0;
      const door = this._door(slug);
      if (door) return Number(door.total(this._live(actor, tokenId))) || 0;
      try {
        const v = AFLP.system?.conditionValue?.(actor, slug, tokenId);
        if (v) return v;
      } catch (e) { /* ignore */ }
      const item = this._legacyItem(actor, slug, tokenId);
      return item ? (item.system?.badge?.value ?? 1) : 0;
    },
    // Apply / remove delegate to the adapter (PF2e item or DH flag, plus the
    // mechanical effect). Passing the registry uuid lets PF2e build the item.
    async apply(actor, slug, value = null, tokenId = null) {
      if (!AFLP.gm.canWrite(actor)) return AFLP.gm.run("condApply", actor, slug, value, tokenId);
      if (!actor) return;
      // Dual-store keys: ACCUMULATE through the door (see `_door`). apply() is the
      // incrementing operation for horny/denied - raiseTo() is the floor one.
      const door = this._door(slug);
      if (door) {
        const live = this._live(actor, tokenId);
        await this._stripStrayItem(actor, slug, tokenId);
        const r = await door.add(live, value ?? 1);
        await AFLP.effects?.sync?.(actor);
        return r;
      }
      const uuid = AFLP.system?.contentUuid?.(slug) ?? AFLP.conditions?.[slug]?.uuid ?? null;
      const r = await AFLP.system?.applyCondition?.(actor, slug, uuid, value, tokenId);
      // Hypnosis sink rule B, submit arm (cross-system): Submitting while
      // Entranced with the entrancer Dominating on canvas sinks the trance.
      // (DH's failed-Resist funnel also sinks via _startHScene; hypnoSink is
      // idempotent so double-firing is harmless. PF2e's raw failed-save case
      // has no code interception - the condition text carries it for the GM.)
      if (slug === "submitting") {
        try {
          if ((AFLP.cond?.value?.(actor, "entranced") ?? 0) >= 1) {
            const _by = actor.getFlag?.(AFLP.FLAG_SCOPE, "entrancedBy") ?? null;
            const dom = canvas?.tokens?.placeables?.find(t =>
              t.actor && t.actor.id !== actor.id && AFLP.cond.has(t.actor, "dominating")
              && (!_by || t.actor.id === _by));
            if (dom) await AFLP.hypnoSink?.(actor, dom.actor);
          }
        } catch (e) { /* sink is non-fatal */ }
      }
      // Condition counts feed effect-intent predicates (Bimbofied/Bullified
      // tooltip notes) - re-sync after every mutation. Idempotent, GM-gated.
      await AFLP.effects?.sync?.(actor);
      return r;
    },
    async remove(actor, slug, tokenId = null) {
      if (!AFLP.gm.canWrite(actor)) return AFLP.gm.run("condRemove", actor, slug, tokenId);
      if (!actor) return;
      // Dual-store keys settle TO THE FLOOR, not to zero. A sourced `permanent`
      // is a standing grant from worn gear or a mastery ("your Horny can't be
      // reduced below 1"); clearing the condition does not take the rope off. The
      // status panel's remove button and rest already route this way - this makes
      // the generic API agree with them instead of zeroing behind their back.
      //
      // GATED ON `_DUAL`, NOT ON `_door` - and this is the one leg that differs.
      // The floor is stored in the `{permanent, sources}` bag on EVERY system,
      // including Daggerheart, where the TOTAL lives in the condition but the
      // floor does not. So a `_door`-gated remove fell through to the DH adapter,
      // which deletes the aflpConditions key outright without consulting the
      // floor - measured in dh-test 19 Aug 2026: a rope granting Horny 1, then
      // cond.remove, left the actor at 0 with `permanent` still 1. The rule was
      // Pathfinder-only and nobody had noticed, because the status panel's X and
      // rest both call clearTemp/settleTo directly and never came through here.
      //
      // Safe from the recursion `_door` exists to prevent: clearTemp/settleTo go
      // to `_setTotal`, which reaches `cond.setValue` on DH - and setValue IS
      // still `_door`-gated, so it falls through to the adapter and terminates.
      // GOES STALE IF: setValue's gate changes, or Daggerheart starts storing the
      // floor in the condition too.
      const door = this._DUAL.includes(slug) ? AFLP[slug] : null;
      if (door) {
        const live = this._live(actor, tokenId);
        // Only where an item could exist. On Daggerheart the condition IS the
        // store and there is nothing to strip - `_legacyItem` would match on a
        // PF2e uuid or a slug DH items do not carry, so it is a guaranteed miss
        // rather than a risk, but not asking is clearer than relying on that.
        if (this._door(slug)) await this._stripStrayItem(actor, slug, tokenId);
        const r = door.clearTemp ? await door.clearTemp(live) : await door.settleTo(live);
        await AFLP.effects?.sync?.(actor);
        return r;
      }
      const r = await AFLP.system?.removeCondition?.(actor, slug, tokenId);
      // The entrancer link outlives Entranced (Hypnotized is still their hold), so
      // it is cleared only once BOTH stages are gone - otherwise Hypnotized loses
      // the signature its save predicate needs.
      if (slug === "entranced" || slug === "hypnotized") {
        try {
          if (!AFLP.cond.has(actor, "entranced") && !AFLP.cond.has(actor, "hypnotized")) {
            const F = AFLP.FLAG_SCOPE;
            await actor.update({
              [`flags.${F}.-=entrancedBy`]: null,
              [`flags.${F}.-=entrancerSignature`]: null,
            }).catch(() => {});
          }
        } catch (e) { /* non-fatal */ }
      }
      await AFLP.effects?.sync?.(actor);
      return r;
    },
    // Set a valued condition to an absolute value (PF2e item badge / DH flag).
    async setValue(actor, slug, value, tokenId = null) {
      if (!AFLP.gm.canWrite(actor)) return AFLP.gm.run("condSetValue", actor, slug, value, tokenId);
      if (!actor) return;
      // Dual-store keys: absolute set through the door. `_setTotal` is the single
      // write both doors funnel through, so the cap and the floor are applied
      // once and in one place. Ardis, 19 Aug 2026: "temp and permanent can be
      // managed via the status editor menu" - that editor lands here.
      const door = this._door(slug);
      if (door) {
        const live = this._live(actor, tokenId);
        await this._stripStrayItem(actor, slug, tokenId);
        const r = await door._setTotal(live, value);
        await AFLP.effects?.sync?.(actor);
        return r;
      }
      const r = await AFLP.system?.setConditionValue?.(actor, slug, value, tokenId);
      await AFLP.effects?.sync?.(actor);
      return r;
    },
    // Reset a timed condition's duration without touching its value. PF2e mirrors
    // some flag-backed conditions as real effects so Foundry expires them on
    // schedule (pf2e-adapter._syncTimedMirror); this re-stamps the clock. On every
    // other system it is a no-op, because nothing there carries a duration.
    //
    // Defeated is the caller that needs it: "When your Arousal increases, defeat's
    // duration resets and you roll a DC 11 Flat Check." The roll half was
    // implemented and the reset half was a comment.
    async refresh(actor, slug, tokenId = null) {
      if (!actor) return false;
      if (!AFLP.gm.canWrite(actor)) return AFLP.gm.run("condRefresh", actor, slug, tokenId);
      try { return await AFLP.system?.refreshConditionDuration?.(actor, slug, tokenId); }
      catch (e) { return false; }
    },

    // Raise a valued condition to AT LEAST `value` (set-to-at-least semantics).
    // This is the correct operation for level-style conditions such as Exposed:
    // re-applying a lower level must not lower it, and applying the same level
    // must not stack it. Distinct from apply(), which increments by `value` for
    // accumulating conditions (horny / mind-break / creature-fetish).
    async raiseTo(actor, slug, value, tokenId = null) {
      if (!actor || !(value > 0)) return;
      const cur = this.value(actor, slug, tokenId);
      if (value <= cur) return;                                   // already at/above
      if (cur <= 0) return this.apply(actor, slug, value, tokenId); // absent: create at value
      return this.setValue(actor, slug, value, tokenId);          // present: raise
    },
    // Set a valued condition to an exact target: create at value if absent, set
    // if present, remove at 0. The generic write path for the token-track
    // conditions (Bimbofied / Bullified) on systems with no native track.
    async setExact(actor, slug, value, tokenId = null) {
      if (!actor) return;
      const v = Math.max(0, Number(value) || 0);
      if (v <= 0) return this.remove(actor, slug, tokenId);
      if (this.value(actor, slug, tokenId) > 0) return this.setValue(actor, slug, v, tokenId);
      return this.apply(actor, slug, v, tokenId);
    },
    // Write a token-track condition through the adapter's dedicated setter when
    // the system implements one (Daggerheart keeps a feature-resource track in
    // step), otherwise fall back to the generic exact-set path.
    //
    // The adapter contract is RETURN-VALUE based, not typeof based: adapter-base
    // declares setBimbofied/setBullified as stubs returning null on every system,
    // so a `typeof === "function"` guard is always true and silently swallows the
    // write. A non-null return means the adapter handled it.
    // ── Condition change events ─────────────────────────────────────────────
    //
    // "Did this condition just turn on" has THREE different storage answers, and
    // every one of them used to have to be listened for separately:
    //   - Daggerheart keeps every AFLR condition in flags.world.aflpConditions.
    //   - PF2e moved Dominating, Submitting, Defeated, Birth Control and Breeding
    //     into that same bag (pf2e-adapter _FLAG_CONDS); Exposed and Mind Break
    //     are still condition ITEMS.
    //   - Native statuses (Restrained, Vulnerable, Hidden, Off-Guard) are
    //     ActiveEffects toggled through toggleStatusEffect.
    // Listening on createItem/deleteItem catches only the second of those. That
    // is not a hypothetical: the Lovense condition feed did exactly that and was
    // measured on 8 Aug 2026 firing ZERO times on Daggerheart.
    //
    // The feeders live in one block at the end of this file. Subscribe here.
    //
    //   const off = AFLP.cond.onChange("horny", ({actor, key, prev, next, source}) => ...);
    //   off();                                   // unsubscribe
    //
    // `key` may be "*" for every condition. `source` is "flag" | "item" |
    // "status" - a listener that must not double-count is expected to filter on
    // it, because the same logical condition is item-backed on one system and
    // flag-backed on another.
    //
    // NOT gated on GM. A client-side listener (UI, sound) legitimately wants the
    // event on every client, and a GM-side one must gate itself - the alternative
    // would silently drop every event raised by a player's own action.
    _listeners: new Map(),

    onChange(key, fn) {
      if (typeof fn !== "function") return () => {};
      const k = String(key ?? "*");
      let set = this._listeners.get(k);
      if (!set) { set = new Set(); this._listeners.set(k, set); }
      set.add(fn);
      return () => {
        const cur = this._listeners.get(k);
        if (!cur) return;
        cur.delete(fn);
        if (!cur.size) this._listeners.delete(k);
      };
    },

    // Raise one transition. Called only by the feeders.
    _emit(actor, key, prev, next, source) {
      if (!actor || !key) return;
      const p = Number(prev) || 0, n = Number(next) || 0;
      if (p === n) return;                        // not a transition; an idempotent rewrite
      const payload = { actor, key, prev: p, next: n, source };
      for (const k of [key, "*"]) {
        // Snapshot: a listener is allowed to unsubscribe itself from inside its
        // own callback, which would otherwise mutate the Set mid-iteration.
        for (const fn of [...(this._listeners.get(k) ?? [])]) {
          // One listener throwing must NOT starve the others. The whole point of
          // a dispatcher is that unrelated features share a transition; a bug in
          // one of them silently disabling the rest is the failure this exists
          // to prevent, so it is logged loudly and the loop continues.
          try { fn(payload); }
          catch (e) { console.error(`AFLP | cond.onChange listener for "${key}" threw:`, e); }
        }
      }
    },

    async setTracked(actor, slug, setter, value, tokenId = null) {
      if (!actor) return;
      const handled = await AFLP.system?.[setter]?.(actor, value);
      if (handled != null) return handled;
      await this.setExact(actor, slug, value, tokenId);
      return this.value(actor, slug, tokenId);
    },
  },

  // ===============================
  // Item Registry
  // Actions, consumables, and other compendium items referenced in macros.
  // ===============================
  items: {
    offspring: {
      slug: "offspring",
      sourceId: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.hoJfZXP5LDhFvKcT"
    },
    egg: {
      slug: "monster-egg",
      sourceId: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.sryUoZQDi1C5P4Fi"
    },
    cumflationAnal: [
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.AB32KRRMMehRIYX0",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.EIpLOOsqHsX5K96Q",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.dQ6jJapX5ItSME7N",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.z5gR0uIUDVEstEqI",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.GzZVIA8flQ66SMkL",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.IX8TZPSJMmJT6QNC",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.eFPjwpmIXu5nvKiM",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.4xtlAan9Aoatr2Gz"
    ],
    cumflationOral: [
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.3ZM95d0mjhUeJsge",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.St4qxZrXSmNz07QO",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.K1UWpkCZb2nVLVXf",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.WvetoZhM6Jc3DEzw",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.03tDyXmS12BUzGb4",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.e9S89RjSUpE2EhZk",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.crrRExas4d2Mx9qm",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.OqDESxRW0zjuNt3L"
    ],
    cumflationVaginal: [
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.hpRVDUwTYgfLCiIv",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.Wb3OIgbpgOzIQmQp",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.fpNnhypftzcwsD3T",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.Nn1k1fCC1nE0yg07",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.MZdLB7XZAVAtZn54",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.MMMTnQXp9km4C5HT",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.bBtJA3B22ypwqvLq",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.iiKuzigPIJec7Bio"
    ],
    cumflationTotal: [
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.M5VbFEA7wikXbC4Q",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.QyHMpQ2pj2wcR91i",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.6P0rsmWx14MQXAEz",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.6qzG65g9NqSu9iVy",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.4jp8zG2TfRrT4y8T",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.li4Npu4XqhE04C8m",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.6dNLoCR1QpbKkZ7Z",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.daPFCWR10Ssrp4Mq"
    ],
    "struggle-snuggle":          { name: "Struggle Snuggle",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.k7M7WiI0Kgyn0pFX" },
    "sexual-advance":            { name: "Sexual Advance",            uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.1Ty2edYgjwn7m6sh" },
    "cum":                       { name: "Cum",                       uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.N9U6snPV0DVE9L5H" },
    "edge":                      { name: "Edge",                      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.aPH8eJBtdByYpvSr" },
    "purge-cumflation":          { name: "Purge Cumflation",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.e6A4cyAOEK8z5Ugo" },
    "dubious-consent":           { name: "Dubious Consent",           uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.ziPugIato0JXzIzu" },
    "potion-of-breeding":        { name: "Potion of Breeding",        uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.WcVMt3xnu08Wq0RW" },
    "potion-of-breeding-effect": { name: "Effect: Potion of Breeding",uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.jQ3G8jwA2boYGVrr" },
    "potion-of-breeding-effect-permanent": { name: "Effect: Potion of Breeding (Permanent)", uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.n6N4vZCs6FvohMF8" },
    "birth-control":             { name: "Elixir of Birth Control",   uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.ZHMYtfYLHQI1hHnX" },
  },

  // ===============================
  // Kink Immunity Helpers
  // ===============================
  // Monstrous Prowess was removed in the DH refactor (the asymmetric design and
  // the Bullified condition cover its role). Always false so dependent callers
  // fall through to their default behavior.
  actorHasMonstrousProwess(actor) {
    return false;
  },

  // Generic kink check helper — use instead of hardcoding slugs/UUIDs.
  // e.g. AFLP.actorHasKink(actor, "edge-master")
  actorHasKink(actor, slug) {
    if (!actor || !slug) return false;
    // Lewd 3+ only: below it, all kink automation goes dormant. The sheet's kink
    // list reads the raw sexual.kinks flag directly, not this helper, so assigned
    // kinks still display and the data is preserved - only automation is gated.
    if (!AFLP.Settings.allows("kinks")) return false;
    const uuid = this.kinks[slug]?.uuid;
    // Check 1: kink item present on the actor. Matches by PF2e slug, by canonical
    // sourceId (PF2e drag-in), OR by the aflrKey flag - DH kink items carry no
    // .slug and their sourceId points to the DH pack, so aflrKey is the only
    // stable identifier there.
    const hasItem = actor.items?.some(i =>
      i.slug === slug
      || (uuid && (i.flags?.core?.sourceId ?? i.sourceId) === uuid)
      || i.flags?.["ardisfoxxs-lewd-pf2e"]?.aflrKey === slug
    ) ?? false;
    if (hasItem) return true;
    // Check 2: kink toggled via AFLP tab (stored as world flag, no item required)
    const worldActor = actor.getWorldActor?.() ?? actor;
    return worldActor.getFlag(this.FLAG_SCOPE, "sexual")?.kinks?.[slug] === true;
  },

  // Returns the effective kink level for an actor, based on their character level.
  // PF2e: kinks unlock features at character levels 2, 3, 5, and 7 - not via badge
  // values. Returns the actor's character level if they have the kink, else 0.
  // Daggerheart: kinks are a three-beat ladder (Signature L1 / Greater L5 /
  // Mastery L8). Returns the BAND FLOOR (1 / 5 / 8) so the legacy PF2e threshold
  // checks scattered through the automation (>= 2/3/5 mid-tier, >= 7 top) unlock
  // exactly one whole beat at a time: DH L1-4 stays Signature-only, L5-7 opens
  // every mid-tier feature at once, L8+ opens the top.
  getKinkLevel(actor, slug) {
    if (!actor || !slug) return 0;
    const uuid = this.kinks[slug]?.uuid;
    const hasItem = actor.items?.some(i =>
      i.slug === slug
      || (uuid && (i.flags?.core?.sourceId ?? i.sourceId) === uuid)
      || i.flags?.["ardisfoxxs-lewd-pf2e"]?.aflrKey === slug
    ) ?? false;
    const worldActor = actor.getWorldActor?.() ?? actor;
    const hasFlag = worldActor.getFlag(this.FLAG_SCOPE, "sexual")?.kinks?.[slug] === true;
    if (!hasItem && !hasFlag) return 0;
    if (this.system?.id === "daggerheart") {
      // PCs store level at system.levelData.level.current; adversaries carry
      // system.tier instead (tiers 1/2/3/4 spanning L1 / L2-4 / L5-7 / L8-10),
      // which folds onto the same band floors.
      const raw = actor.system?.levelData?.level?.current
        ?? actor.system?.level?.value ?? actor.system?.level;
      let lvl = Number(raw);
      if (!Number.isFinite(lvl) || lvl < 1) {
        const t = Number(actor.system?.tier);
        lvl = Number.isFinite(t) && t >= 1 ? (t >= 4 ? 8 : t >= 3 ? 5 : 1) : 1;
      }
      return lvl >= 8 ? 8 : lvl >= 5 ? 5 : 1;
    }
    // Character level determines which kink feature tiers are unlocked
    // (Tiers: 1 = base, 2 = level 2+, 3 = level 3+, 5 = level 5+, 7 = level 7+)
    return actor.system?.details?.level?.value ?? actor.level ?? 1;
  },

  // Three-beat kink tier: 0 = doesn't have the kink, 1 = Signature, 2 = Greater,
  // 3 = Mastery. System-aware: DH bands are L1-4 / L5-7 / L8+; PF2e folds its
  // five-step unlock ladder onto the same beats as L1-4 / L5-6 / L7+.
  getKinkTier(actor, slug) {
    const lvl = this.getKinkLevel(actor, slug);
    if (lvl <= 0) return 0;
    // Both systems now share the three-beat stages: Signature L1-4 / Greater
    // L5-7 / Mastery L8+ (the PF2e kink flatten aligned PF2e to DH's bands;
    // the old PF2e fold was L5-6 / L7+).
    return lvl >= 8 ? 3 : lvl >= 5 ? 2 : 1;
  },

  // ===============================
  // Pronoun Helper
  // Reads PF2e's freetext pronoun field and returns { subject, object, possessive }.
  // Falls back to they/them/their if blank or unrecognised.
  // ===============================
  getPronouns(actor) {
    const raw = (actor?.system?.details?.pronouns ?? "").toLowerCase().trim();
    if (!raw) {
      console.debug(`AFLP | getPronouns: no pronouns set on ${actor?.name} - using they/them`);
    }
    if (/she/.test(raw))  return { subject: "she",  object: "her",  possessive: "her"   };
    if (/they/.test(raw)) return { subject: "they", object: "them", possessive: "their" };
    if (/\bhe\b/.test(raw)) return { subject: "he",   object: "him",  possessive: "his"   };
    return { subject: "they", object: "them", possessive: "their" };
  },

  // ===============================
  // Position Registry
  // Each entry: {
  //   id, uuid (compendium effect item), label(pronouns), logPhrase(a,t,p),
  //   hole: the cum destination key ("vaginal"|"anal"|"oral"|"facial"|null),
  //   bottomFills: where the BOTTOM's own load goes in this same fiction, if the
  //     bottom has a cock and climaxes. `hole` answers the question for the top;
  //     this answers it for the other side. Authored per position by Ardis,
  //     16 Aug 2026; 59 floor, 17 coat-top, 5 coat-self, 2 oral.
  //       "floor"      the ground - from behind, or no contact
  //       "coat-top"   a bodyCoat on the TOP - face to face, under or over them
  //       "coat-self"  a bodyCoat on the BOTTOM - folded, aimed at themselves
  //       "oral"       into the TOP's mouth - only where a mouth is already there
  //     A receiverIsTop position carries NO bottomFills: there the bottom is the
  //     penetrator and `hole` already names the hole it fills on the holder, so a
  //     second answer would be a second deposit.
  //   positionTrait: which body-type trait unlocks this position,
  //   penile: true if only usable by a cock-bearing attacker (kept for backward compat)
  // }
  // positionTrait values: "biped" | "massive" | "quadruped" | "serpentine" |
  //                        "winged" | "tentacled" | "plant" | "incorporeal"
  // All humanoid (biped) positions are also accessible to massive creatures.
  // ===============================
  positions: [
    // ── LEGACY BARE IDs (no compendium item; kept for backward compat) ─────
    { id:"groping",     uuid:null, desc:"Hands over the bottom's chest, ass, and thighs, squeezing and kneading until they squirm.",                                                          label:(p)=>`Hands All Over`,            logPhrase:(a,t,p)=>`${a} runs their hands over ${t}`,  hole:null,       bottomFills:"floor", positionTrait:"biped",  penile:false },
    { id:"fingering",   uuid:null, desc:"Fingers pushed inside and worked in and out, curling deep enough to make the bottom clench around them.",             label:(p)=>`Fingering ${p.object}`,     logPhrase:(a,t,p)=>`${a} fingers ${t}`,                hole:null,       bottomFills:"floor", positionTrait:"biped",  penile:false },
    { id:"licking",     uuid:null, desc:"Tongue dragged slowly over the bottom's neck, chest, and thighs, leaving them wet and shivering.",                                     label:(p)=>`Licking Them`,              logPhrase:(a,t,p)=>`${a} teases ${t} with their tongue`, hole:null,     bottomFills:"floor", positionTrait:"biped",  penile:false },
    { id:"other",       uuid:null, desc:"Touching, rubbing, and grinding that stops just short of anything going inside.",                  label:(p)=>`Teasing`,                   logPhrase:(a,t,p)=>`${a} teases ${t}`,                 hole:null,       bottomFills:"floor", positionTrait:"biped",  penile:false },
    { id:"painplay",    uuid:null, desc:"Biting, slapping, and branding, hard enough to leave marks the bottom keeps for days.",          label:(p)=>`Pain Play`,                 logPhrase:(a,t,p)=>`${a} works ${t} over with deliberate cruelty`, hole:null, bottomFills:"floor", positionTrait:"biped",  penile:false },
    { id:"oral-give",   uuid:null, desc:"The top works the bottom's cock or pussy with lips and tongue, sucking and licking until they squirm.", label:(p)=>`Going Down (Mouth on Them)`,                logPhrase:(a,t,p)=>`${a} goes down on ${t}`,           hole:"oral",     bottomFills:"oral", positionTrait:"biped",  penile:false },
    { id:"oral-receive",uuid:null, desc:"The bottom's mouth held open and used, a cock sliding in and out across their tongue.",                                                              label:(p)=>`Using ${p.possessive} Mouth`, logPhrase:(a,t,p)=>`${a} uses ${t}'s mouth`,         hole:"oral",     bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"facial",      uuid:null, desc:"The top pulls out and spills across the bottom's face, striping their cheeks, lips, and eyelashes.",                                       label:(p)=>`Finishing on ${p.possessive} Face`, logPhrase:(a,t,p)=>`${a} finishes on ${t}'s face`, hole:"facial", bottomFills:"floor", positionTrait:"biped", penile:true },
    { id:"vaginal",     uuid:null, desc:"Cock in pussy, no particular arrangement, just fucking.",                                                      label:(p)=>`Inside ${p.object}`,        logPhrase:(a,t,p)=>`${a} pushes inside ${t}`,          hole:"vaginal",  bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"anal",        uuid:null, desc:"Cock in ass, no particular arrangement, just fucking.",      label:(p)=>`Taking ${p.possessive} Ass`, logPhrase:(a,t,p)=>`${a} takes ${t} from behind`,     hole:"anal",     bottomFills:"floor", positionTrait:"biped",  penile:true  },

    // ── BIPED positions (humanoid, default pool) ───────────────────────────
    { id:"doggy-style-pussy",   uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.nPvToELRkqQNd3HI", desc:"The bottom is on all fours while the top mounts from behind, hands gripping their hips.", label:(p)=>`Doggy Style`,          logPhrase:(a,t,p)=>`${a} takes ${t} from behind in doggy style`,                    hole:"vaginal", bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"doggy-style-anal",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.VnbDYzaUG7eNsyKQ", desc:"The bottom on all fours, the top taking their ass from behind.", label:(p)=>`Doggy Style (Anal)`,    logPhrase:(a,t,p)=>`${a} takes ${t}'s ass from behind`,                            hole:"anal",    bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"missionary-pussy",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.b5BqG9axHRRH4bKP", desc:"Bottom on their back, top between their thighs, face to face.", label:(p)=>`Missionary`,            logPhrase:(a,t,p)=>`${a} presses ${t} down into missionary`,                       hole:"vaginal", bottomFills:"coat-top", positionTrait:"biped",  penile:true  },
    { id:"missionary-anal",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.pQqC03aAzZTHGZFr", desc:"Bottom on their back with legs raised, the top folding in from above.", label:(p)=>`Missionary (Anal)`,     logPhrase:(a,t,p)=>`${a} folds ${t}'s legs back for anal`,                         hole:"anal",    bottomFills:"coat-top", positionTrait:"biped",  penile:true  },
    { id:"cowgirl",             uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.GOZpXGvsmVTdHrjq", desc:"The bottom straddles the top facing them, setting the pace entirely on their own terms.", label:(p)=>`Cowgirl`,               logPhrase:(a,t,p)=>`${a} rides ${t} face-to-face`,                                 hole:"vaginal", bottomFills:"coat-top", positionTrait:"biped",  penile:true  },
    { id:"reverse-cowgirl",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.dv0mrNe317Hg5g5F", desc:"The bottom rides the top facing away.", label:(p)=>`Reverse Cowgirl`,       logPhrase:(a,t,p)=>`${a} rides ${t} facing away`,                                  hole:"vaginal", bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"cowboy-anal",         uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.eMwSuRCo2yNwM2jO", desc:"The bottom straddles the top facing toward them and takes it in the ass.", label:(p)=>`Cowboy (Anal)`,         logPhrase:(a,t,p)=>`${a} takes it in the ass astride ${t}`,                        hole:"anal",    bottomFills:"coat-top", positionTrait:"biped",  penile:true  },
    { id:"facefuck",            uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.2lhcQhGDFK6wOlNm", desc:"The top grips the bottom's head with both hands and uses their throat.", label:(p)=>`Facefuck`,              logPhrase:(a,t,p)=>`${a} grips ${t}'s head and uses their throat`,                 hole:"oral",    bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"deepthroat",          uuid:null, desc:"The bottom takes the cock to the root and holds it there, throat working around the full length.", label:(p)=>`Deepthroat`, logPhrase:(a,t,p)=>`${t} takes ${a} to the root and holds`, hole:"oral", bottomFills:"floor", positionTrait:"biped", penile:true },
    { id:"face-sit-oral",       uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.yR5OMTVFB40rdJ11", desc:"The top sits down on the bottom's face and grinds against their mouth, thighs closing around their head.", label:(p)=>`Face Sit`,              logPhrase:(a,t,p)=>`${a} smothers ${t}'s face and grinds`,                         hole:"oral",    bottomFills:"floor", positionTrait:"biped",  penile:false },
    // ── THE ONLY MUTUAL POSITION IN THE REGISTRY ───────────────────────────
    //
    // Both mouths are working at once, so both sides have a destination: each
    // one's load goes into the other's mouth. Every other entry answers the
    // question for one side only. Added 16 Aug 2026.
    //
    // `penile:false` DESPITE the oral hole, and this is the deliberate part. The
    // picker gates penile positions on a cock being present in the pair, and a
    // sixty-nine needs no cock at all - two pussies is the same position. It sits
    // with `oral-give` and `face-sit-oral`, the pack's other mouth-on-genitals
    // entries, rather than with `oral-receive`. Deposit routing does not consult
    // `penile`, so a load still lands in the partner's mouth. Deepthroat sits it
    // out, which is right - nothing is being taken to the root here.
    //
    // NOT `receiverIsTop`: that flag redirects the shot INTO the position-holder,
    // and here both sides give and take at once.
    //
    // Offered to biped, massive, quadruped, serpentine and tentacled - see the
    // note on the trait pools below for why the other three are out.
    { id:"sixty-nine",          uuid:null, desc:"Both lie head to hip, each mouth working the other's cock or pussy at the same time.", label:(p)=>`Sixty-Nine`,        logPhrase:(a,t,p)=>`${a} and ${t} lie head to hip, each working the other with their mouth`, hole:"oral", bottomFills:"oral", positionTrait:"biped", penile:false },
    { id:"prone-bone-pussy",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.quI62DbOXRCeVyRs", desc:"The bottom lies face down flat while the top presses down onto them from behind, driving in hard.", label:(p)=>`Prone Bone`,            logPhrase:(a,t,p)=>`${a} pins ${t} face-down and takes them`,                      hole:"vaginal", bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"prone-bone-anal",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.apZ3c2MqCf0suwKH", desc:"The bottom flat on their front, the top's weight pinning them down, taking the ass from behind.", label:(p)=>`Prone Bone (Anal)`,     logPhrase:(a,t,p)=>`${a} pins ${t} face-down and takes their ass`,                 hole:"anal",    bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"doggy-piledrive-anal",uuid:null, desc:"Top positioned steeply above, driving downward into the ass.", label:(p)=>`Doggy Piledrive`, logPhrase:(a,t,p)=>`${a} angles above ${t} and drives downward`, hole:"anal", bottomFills:"coat-self", positionTrait:"biped", penile:true  },
    { id:"turn-taking-pussy", minTops:2,   uuid:null, desc:"One top uses the pussy while the others stand over the bottom stroking themselves, waiting their turn.",        label:(p)=>`Taking Turns (Pussy)`,  logPhrase:(a,t,p)=>`${a} takes their turn with ${t}`, hole:"vaginal", bottomFills:"floor", positionTrait:"biped", penile:true  },
    { id:"turn-taking-anal", minTops:2,    uuid:null, desc:"One top uses the ass while the others stand over the bottom stroking themselves, waiting their turn.",          label:(p)=>`Taking Turns (Anal)`,   logPhrase:(a,t,p)=>`${a} takes their turn with ${t}`, hole:"anal",    bottomFills:"floor", positionTrait:"biped", penile:true  },
    { id:"turn-taking-oral", minTops:2,    uuid:null, desc:"One top uses the mouth while the others stand over the bottom stroking themselves, waiting their turn.",        label:(p)=>`Taking Turns (Oral)`,   logPhrase:(a,t,p)=>`${a} takes their turn with ${t}`, hole:"oral",    bottomFills:"floor", positionTrait:"biped", penile:true  },
    { id:"assisting-hands", minTops:2,     uuid:null, desc:"This top works the bottom with their hands - stroking, groping, holding them open - while the others fuck them.",        label:(p)=>`Assisting (Hands)`,    logPhrase:(a,t,p)=>`${a} assists with their hands`, hole:"none",    bottomFills:"coat-top", positionTrait:"biped", penile:false },
    { id:"standing-pussy",      uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.xqFzi6fZRm3pW1yE", desc:"Both standing, the top behind the bottom, one hand holding them in place.", label:(p)=>`Standing (Pussy)`,              logPhrase:(a,t,p)=>`${a} takes ${t} from behind while standing`,                   hole:"vaginal", bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"standing-anal",       uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7HXyQOx3qkq9BIoj", desc:"Both on their feet, the top behind with an arm across the bottom's chest, taking the ass.", label:(p)=>`Standing (Anal)`,       logPhrase:(a,t,p)=>`${a} presses ${t} against the wall and takes their ass`,       hole:"anal",    bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"mating-press",        uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.umaZraEcPSWierPt", desc:"The bottom is folded nearly in half, legs behind their head, the top driving straight down.", label:(p)=>`Mating Press`,          logPhrase:(a,t,p)=>`${a} folds ${t} in half and drives deep`,                      hole:"vaginal", bottomFills:"coat-self", positionTrait:"biped",  penile:true  },
    { id:"mating-press-anal",   uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.SF9smps5XQua3VBc", desc:"Folded back with legs pressed behind the head, the top bearing down from above for deep anal.", label:(p)=>`Mating Press (Anal)`,   logPhrase:(a,t,p)=>`${a} folds ${t} back and takes their ass deep`,                hole:"anal",    bottomFills:"coat-self", positionTrait:"biped",  penile:true  },
    { id:"spitroast", minTops:2,  uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.JcdrD7OUyggqktO3", desc:"One top fucking the mouth, one behind fucking them, the bottom rocked between the pair.", label:(p)=>`Spitroast (Mouth + Behind)`,             logPhrase:(a,t,p)=>`${a} takes one end of ${t} while a partner takes the other`,   hole:"oral",    bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"lotus",               uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.l5YBmML52O87TDUJ", desc:"Both tangled together face to face, the bottom seated in the top's lap with legs wrapped around them.", label:(p)=>`Lotus`,                 logPhrase:(a,t,p)=>`${a} and ${t} wrap around each other in lotus position`,       hole:"vaginal", bottomFills:"coat-top", positionTrait:"biped",  penile:false },
    { id:"lap-dance-anal",      uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.GhnPsrin8Tzctqpw", desc:"The bottom seats themselves in the top's lap from behind and lowers down.", label:(p)=>`Lap Dance (Anal)`,      logPhrase:(a,t,p)=>`${a} lowers themselves onto ${t}'s lap`,                       hole:"anal",    bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"paizuri",  requiresTargetAnatomy:"tits",  uuid:null, desc:"The bottom cradles the top's cock between their tits, stroking it in the slick valley of their cleavage until it spills across their chest.", label:(p)=>`Paizuri`, logPhrase:(a,t,p)=>`${t} wraps their tits around ${a}'s cock and strokes it between their cleavage`, hole:"paizuri", bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"gangbang",            uuid:null, desc:"The troop swarms every opening at once - cocks in the mouth, pussy, and ass, {tits wrapped around one more|one more dragged across their chest} and hands working the rest, filling the target from every side and cumflating them everywhere at once.", label:(p)=>`Gangbang`, logPhrase:(a,t,p)=>`${a} fills every one of ${t}'s holes at once`, hole:"gangbang", bottomFills:"floor", positionTrait:"biped",  penile:true  },
    { id:"nipple-fuck", requiresTargetAnatomy:"tits-onahole", uuid:null, desc:"The top works their cock into the slick, gaping hole of an onahole nipple and fucks it, pumping their load straight into the tit until it swells fuller and fuller.", label:(p)=>`Nipple Fuck`, logPhrase:(a,t,p)=>`${a} fucks ${t}'s nipple until the tit swells with cum`, hole:"nipples", bottomFills:"floor", positionTrait:"biped",  penile:true  },

    { id:"standing-carry-pussy", uuid:null, desc:"The bottom is held off the ground, legs up, seated on the cock - carried and fucked in the same grip.", label:(p)=>`Standing Carry (Pussy)`, logPhrase:(a,t,p)=>`${a} hoists ${t} off the ground and fucks them mid-air`, hole:"vaginal", bottomFills:"coat-top", positionTrait:"biped", penile:true },
    { id:"standing-carry-anal",  uuid:null, desc:"The bottom is held off the ground and taken up the ass mid-air, weight resting on the cocks and the hands holding them.", label:(p)=>`Standing Carry (Anal)`, logPhrase:(a,t,p)=>`${a} holds ${t} aloft and takes their ass mid-air`, hole:"anal", bottomFills:"coat-top", positionTrait:"biped", penile:true },
    { id:"reverse-missionary",  uuid:null, desc:"The top lies on their back beneath the all-fours bottom and drives up into the pussy from below.", label:(p)=>`Reverse Missionary`, logPhrase:(a,t,p)=>`${a} lies beneath ${t} and drives up into them`, hole:"vaginal", bottomFills:"coat-top", positionTrait:"biped", penile:true  },

    // ── HEMIPENIS positions (source has cock-hemipenis; two shafts) ────────
    { id:"hemi-mating-press",   uuid:null, requiresAnatomy:"cock-hemipenis", holes:["vaginal","anal"], desc:"Folded nearly in half, the bottom takes both shafts at once - one seated in the pussy, one in the ass, driving down together.", label:(p)=>`Mating Press (Pussy + Ass)`, logPhrase:(a,t,p)=>`${a} folds ${t} in half and seats both shafts at once`, hole:"vaginal", bottomFills:"coat-self", positionTrait:"biped", penile:true },
    { id:"hemi-doggy",          uuid:null, requiresAnatomy:"cock-hemipenis", holes:["vaginal","anal"], desc:"Mounted from behind, both shafts sliding home in one thrust - pussy and ass filled by the same hips.", label:(p)=>`Doggy (Pussy + Ass)`, logPhrase:(a,t,p)=>`${a} mounts ${t} and fills pussy and ass in one thrust`, hole:"vaginal", bottomFills:"floor", positionTrait:"biped", penile:true },
    { id:"hemi-riding",         uuid:null, requiresAnatomy:"cock-hemipenis", holes:["vaginal","anal"], desc:"The bottom lowers onto both shafts at once and rides them together.", label:(p)=>`Riding (Pussy + Ass)`, logPhrase:(a,t,p)=>`${t} lowers onto both of ${a}'s shafts and rides`, hole:"vaginal", bottomFills:"coat-top", positionTrait:"biped", penile:true },
    { id:"hemi-double-pussy",   uuid:null, requiresAnatomy:"cock-hemipenis", holes:["vaginal"], holeShafts:{vaginal:2}, desc:"Both shafts crammed into the pussy together, stretching it around the pair.", label:(p)=>`Both Shafts, One Pussy`, logPhrase:(a,t,p)=>`${a} crams both shafts into ${t}'s pussy`, hole:"vaginal", bottomFills:"floor", positionTrait:"biped", penile:true },

    // ── MULTIPENIS positions (source has cock-slime; slimes, oozes, troops) ─
    { id:"multi-every-hole",    uuid:null, requiresAnatomy:"cock-slime", holes:["oral","vaginal","anal"], desc:"Cocks in the mouth, pussy, and ass at the same time, spare ones slapping against the bottom's cheeks and filling their hands while they wait a turn.", label:(p)=>`Every Hole at Once`, logPhrase:(a,t,p)=>`${a} fills every one of ${t}'s holes at once`, hole:"vaginal", bottomFills:"floor", positionTrait:"biped", penile:true },
    { id:"multi-buried",        uuid:null, requiresAnatomy:"cock-slime", holes:["oral","vaginal","anal","paizuri"], desc:"The bottom disappears under the top - slick mass or a press of bodies - a cock in every opening, more rubbing across their face, {pumping between their tits|dragging across their chest}, gripped in each hand and against each foot, working their armpits, a nutsack resting over their eyes.", label:(p)=>`Buried in Cock`, logPhrase:(a,t,p)=>`${a} buries ${t} in cock, every opening filled`, hole:"vaginal", bottomFills:"coat-self", positionTrait:"biped", penile:true },
    { id:"multi-throat-ass",    uuid:null, requiresAnatomy:"cock-slime", holes:["oral","anal"], desc:"One cock down the throat, one up the ass, both ends worked in the same rhythm.", label:(p)=>`Throat and Ass at Once`, logPhrase:(a,t,p)=>`${a} works ${t} from both ends`, hole:"oral", bottomFills:"floor", positionTrait:"biped", penile:true },
    // Same-hole stacking: a multipenis top can put more than one shaft in the
    // same hole, which widens the gap a step per extra shaft (gapStep), exactly
    // as Both Shafts, One Pussy does for a hemipenis.
    { id:"multi-triple-pussy",  uuid:null, requiresAnatomy:"cock-slime", holes:["vaginal"], holeShafts:{vaginal:3}, desc:"Three shafts crammed into the pussy at once, stretching it wide around the bundle.", label:(p)=>`Three Shafts, One Pussy`, logPhrase:(a,t,p)=>`${a} crams three shafts into ${t}'s pussy`, hole:"vaginal", bottomFills:"floor", positionTrait:"biped", penile:true },
    { id:"multi-triple-anal",   uuid:null, requiresAnatomy:"cock-slime", holes:["anal"], holeShafts:{anal:3}, desc:"Three shafts forced into the ass together, the ring stretched to its limit around them.", label:(p)=>`Three Shafts, One Ass`, logPhrase:(a,t,p)=>`${a} forces three shafts into ${t}'s ass`, hole:"anal", bottomFills:"floor", positionTrait:"biped", penile:true },
    { id:"multi-triple-oral",   uuid:null, requiresAnatomy:"cock-slime", holes:["oral"], holeShafts:{oral:3}, desc:"Three shafts crowding into the mouth at once, jaw forced wide and throat packed full.", label:(p)=>`Three Shafts, One Throat`, logPhrase:(a,t,p)=>`${a} crowds three shafts into ${t}'s throat`, hole:"oral", bottomFills:"floor", positionTrait:"biped", penile:true },
    { id:"multi-double-pussy",  uuid:null, requiresAnatomy:"cock-slime", holes:["vaginal"], holeShafts:{vaginal:2}, desc:"Two shafts crammed into the pussy together, stretching it around the pair.", label:(p)=>`Two Shafts, One Pussy`, logPhrase:(a,t,p)=>`${a} crams two shafts into ${t}'s pussy`, hole:"vaginal", bottomFills:"floor", positionTrait:"biped", penile:true },
    { id:"multi-double-anal",   uuid:null, requiresAnatomy:"cock-slime", holes:["anal"], holeShafts:{anal:2}, desc:"Two shafts worked into the ass side by side, stretching it open around both.", label:(p)=>`Two Shafts, One Ass`, logPhrase:(a,t,p)=>`${a} works two shafts into ${t}'s ass`, hole:"anal", bottomFills:"floor", positionTrait:"biped", penile:true },
    { id:"multi-dp-pussy-heavy",uuid:null, requiresAnatomy:"cock-slime", holes:["vaginal","anal"], holeShafts:{vaginal:2,anal:1}, desc:"Two shafts stuffed into the pussy and a third up the ass, every hole below the waist stretched at once.", label:(p)=>`Two in the Pussy, One in the Ass`, logPhrase:(a,t,p)=>`${a} stuffs two shafts into ${t}'s pussy and one up their ass`, hole:"vaginal", bottomFills:"floor", positionTrait:"biped", penile:true },
    { id:"multi-dp-anal-heavy", uuid:null, requiresAnatomy:"cock-slime", holes:["vaginal","anal"], holeShafts:{anal:2,vaginal:1}, desc:"Two shafts forced into the ass and a third buried in the pussy, both stretched around the load.", label:(p)=>`Two in the Ass, One in the Pussy`, logPhrase:(a,t,p)=>`${a} forces two shafts into ${t}'s ass and one into their pussy`, hole:"anal", bottomFills:"floor", positionTrait:"biped", penile:true },
    { id:"multi-throat-pussy",  uuid:null, requiresAnatomy:"cock-slime", holes:["oral","vaginal"], desc:"One cock down the throat, one deep in the pussy, both worked in the same rhythm.", label:(p)=>`Throat and Pussy at Once`, logPhrase:(a,t,p)=>`${a} fills ${t}'s throat and pussy together`, hole:"oral", bottomFills:"floor", positionTrait:"biped", penile:true },

    // ── ACROBATIC MOUNT positions (Small tops; carried/standing bottoms) ───
    { id:"am-face-mount",       uuid:null, requiresAnatomy:"cock-acrobatic-mount", desc:"The small top stands on the bottom's shoulders or clings to their head and fucks their face while they stand, walk, or fight.", label:(p)=>`Face Mount (Carried)`, logPhrase:(a,t,p)=>`${a} mounts ${t}'s face and fucks it while carried`, hole:"oral", bottomFills:"floor", positionTrait:"biped", penile:true },
    { id:"am-front-cling",      uuid:null, requiresAnatomy:"cock-acrobatic-mount", desc:"Clinging to the bottom's front like a pack, legs wrapped around their waist, fucking them while they carry the weight.", label:(p)=>`Front Cling (Pussy)`, logPhrase:(a,t,p)=>`${a} clings to ${t}'s front and fucks them while carried`, hole:"vaginal", bottomFills:"coat-top", positionTrait:"biped", penile:true },
    { id:"am-back-cling",       uuid:null, requiresAnatomy:"cock-acrobatic-mount", desc:"Riding the bottom's back, arms around their neck, driving in from behind while they stay on their feet.", label:(p)=>`Back Cling (Ass)`, logPhrase:(a,t,p)=>`${a} rides ${t}'s back and drives in from behind`, hole:"anal", bottomFills:"floor", positionTrait:"biped", penile:true },
    { id:"amp-face-mount",      uuid:null, requiresAnatomy:"pussy-acrobatic-mount", desc:"The small top sits on the standing bottom's face, thighs locked around their head, grinding while the bottom carries them.", label:(p)=>`Face Mount (Pussy)`, logPhrase:(a,t,p)=>`${a} locks their thighs around ${t}'s head and grinds`, hole:"oral", bottomFills:"floor", positionTrait:"biped", penile:false },
    { id:"amp-cock-ride",       uuid:null, requiresAnatomy:"pussy-acrobatic-mount", receiverIsTop:true, desc:"The small top clings to the standing bottom's front, sinks onto their cock, and rides while carried.", label:(p)=>`Cock Ride (Clinging)`, logPhrase:(a,t,p)=>`${a} clings to ${t}, sinks onto their cock, and rides`, hole:"vaginal", positionTrait:"biped", penile:true },

    // ── MASSIVE positions (large biped, can carry/lift) ────────────────────
    { id:"full-nelson-anal",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.jV9yvOmPfx6hY2YZ", desc:"The top lifts the bottom off the ground with arms hooked under their armpits, hands locked behind their neck.", label:(p)=>`Full Nelson (Anal)`,    logPhrase:(a,t,p)=>`${a} locks ${t}'s arms back and lifts them for anal`,          hole:"anal",    bottomFills:"floor", positionTrait:"massive", penile:true  },
    { id:"full-nelson-pussy",   uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.xQSRHhxK1V2vTbe4", desc:"The bottom is hoisted with arms hooked under their armpits and hands locked behind their neck, held open and fucked in the air.", label:(p)=>`Full Nelson`,           logPhrase:(a,t,p)=>`${a} locks ${t}'s arms back and lifts them`,                   hole:"vaginal", bottomFills:"floor", positionTrait:"massive", penile:true  },
    { id:"carry-fuck-pussy",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.IQ4m1LBWr6PbzE8K", desc:"The top lifts the bottom entirely off the ground and fucks them mid-air.", label:(p)=>`Carry Fuck`,            logPhrase:(a,t,p)=>`${a} lifts ${t} entirely off the ground and uses them`,        hole:"vaginal", bottomFills:"coat-top", positionTrait:"massive", penile:true  },
    { id:"carry-fuck-anal",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.mqzTCWDWTnZrfqCy", desc:"Lifted off the ground and impaled from below for anal.", label:(p)=>`Carry Fuck (Anal)`,     logPhrase:(a,t,p)=>`${a} impales ${t} from below while holding them aloft`,        hole:"anal",    bottomFills:"floor", positionTrait:"massive", penile:true  },
    { id:"wall-pin-pussy",      uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.2oQKhNr474HjGUFh", desc:"The top pins the bottom against a wall with their full body weight and drives forward.", label:(p)=>`Wall Pin`,              logPhrase:(a,t,p)=>`${a} pins ${t} against the wall`,                              hole:"vaginal", bottomFills:"coat-top", positionTrait:"massive", penile:true  },
    { id:"wall-pin-anal",       uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.Y2wqBq5NTqIYpjGC", desc:"Slammed against a wall for anal, no room to pull away.", label:(p)=>`Wall Pin (Anal)`,       logPhrase:(a,t,p)=>`${a} slams ${t} against the wall and takes their ass`,         hole:"anal",    bottomFills:"floor", positionTrait:"massive", penile:true  },

    // ── QUADRUPED positions ────────────────────────────────────────────────
    { id:"mounted-pussy",       uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.pbwAAskML7SQgP72", desc:"The beast mounts from behind in its natural breeding stance, weight pinning the bottom down.", label:(p)=>`Mounted`,               logPhrase:(a,t,p)=>`${a} mounts ${t} from behind in natural breeding posture`,     hole:"vaginal", bottomFills:"floor", positionTrait:"quadruped", penile:true  },
    { id:"mounted-anal",        uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.xHtKpBi5yAQ4xejd", desc:"Quadruped mounting for anal, powerful haunches setting the pace.", label:(p)=>`Mounted (Anal)`,        logPhrase:(a,t,p)=>`${a} mounts ${t} from behind, forcing their ass`,              hole:"anal",    bottomFills:"floor", positionTrait:"quadruped", penile:true  },
    // ── THE BEAST RIDES ARE THE INVERTED PAIR: THE RIDER PENETRATES THE BEAST ──
    //
    // `mounted-*` and `beast-ride-*` are the same act with the roles swapped, and
    // that swap is the whole reason both exist. Mounted: the beast is the
    // penetrator, pinning from behind. Beast Ride: the RIDER is the penetrator
    // and the beast is the one being filled. Decided 16 Aug 2026.
    //
    // The position is held by the ATTACKER, which for a quadruped pool is the
    // BEAST - so on these two rows the position-holder is the RECEIVER. Three
    // flags carry that, and each is load-bearing somewhere different:
    //
    //   receiverIsTop  aflp-cum reads it: the cumming partner has no position of
    //                  its own, so the macro copies THIS one onto them and derives
    //                  the holes against the beast. Without it the pair falls
    //                  through to the manual hole dialog.
    //   hole           names the hole ON THE BEAST that gets filled, not on the
    //                  rider. The picker's vaginal gate already allows an attacker
    //                  with a pussy for exactly this ("or attacker for riding").
    //   penile:false   the position-holder is not the one penetrating. The scene
    //                  card reads `!penile && vaginal|anal` to light COCK on the
    //                  TARGET, which is correct here. It also makes the size-gap
    //                  and deepthroat readers sit this position out - also
    //                  correct, because both measure the attacker's cock against
    //                  the target's hole and this pair runs the other way.
    //
    // KNOWN DISAGREEMENT, NOT FIXED HERE: `amp-cock-ride` is the other
    // receiverIsTop position and carries penile:TRUE, so its COCK chip credits
    // the wrong side. Flagged for Ardis rather than changed silently.
    { id:"beast-ride-pussy",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.VQ5oMEIwPJkHjHEY", receiverIsTop:true, desc:"The rider mounts the beast from above and fucks its pussy, hands braced on its flanks.", label:(p)=>`Beast Ride`,            logPhrase:(a,t,p)=>`${t} climbs astride ${a} and fucks them`,                      hole:"vaginal", positionTrait:"quadruped", penile:false },
    { id:"beast-ride-anal",     uuid:null, receiverIsTop:true, desc:"The rider mounts the beast from above and takes its ass, gripping its haunches for leverage.", label:(p)=>`Beast Ride (Anal)`, logPhrase:(a,t,p)=>`${t} climbs astride ${a} and takes their ass`,                 hole:"anal",    positionTrait:"quadruped", penile:false },

    // ── SERPENTINE positions ───────────────────────────────────────────────
    { id:"coil-pussy",          uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.fJkY9sc4agqcaScj", desc:"The serpentine top winds its coils around the bottom and guides its way inside.", label:(p)=>`Coil`,                  logPhrase:(a,t,p)=>`${a} wraps ${p.possessive} coils around ${t} and enters them`, hole:"vaginal", bottomFills:"coat-top", positionTrait:"serpentine", penile:true  },
    { id:"coil-anal",           uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7zLeZ1HoYXo5LSgW", desc:"Wrapped tight and taken in the ass, the coils tightening with every breath.", label:(p)=>`Coil (Anal)`,           logPhrase:(a,t,p)=>`${a} constricts ${t} and drives into their ass`,               hole:"anal",    bottomFills:"coat-top", positionTrait:"serpentine", penile:true  },
    { id:"constrict-oral",      uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.K5sFyxvyGhr6jSyv", desc:"The creature winds around the bottom's head and forces its way between their lips.", label:(p)=>`Constrict Oral`,        logPhrase:(a,t,p)=>`${a} wraps around ${t}'s head and forces into their throat`,   hole:"oral",    bottomFills:"floor", positionTrait:"serpentine", penile:true  },

    // ── WINGED positions ──────────────────────────────────────────────────
    { id:"talon-grip-pussy",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.TKRGL7YxSDoilDbA", desc:"The winged creature grips the bottom in its talons and pulls them onto itself, wings spread for balance.", label:(p)=>`Talon Grip`,            logPhrase:(a,t,p)=>`${a} grips ${t} with its talons and enters them`,              hole:"vaginal", bottomFills:"floor", positionTrait:"winged",  penile:true  },
    { id:"talon-grip-anal",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.LxV8YntD3CMqORUC", desc:"Gripped in talons, lifted, and taken in the ass.", label:(p)=>`Talon Grip (Anal)`,     logPhrase:(a,t,p)=>`${a} pins ${t} in its talons and takes their ass`,             hole:"anal",    bottomFills:"floor", positionTrait:"winged",  penile:true  },
    { id:"aerial-carry-pussy",  uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.dfP9tKm9pKoqF7Zq", desc:"The creature carries the bottom aloft while the act is in progress.", label:(p)=>`Aerial Carry`,          logPhrase:(a,t,p)=>`${a} carries ${t} aloft and uses them mid-air`,               hole:"vaginal", bottomFills:"floor", positionTrait:"winged",  penile:true  },

    // ── TENTACLED positions ──────────────────────────────────────────────
    { id:"tentacle-fill-pussy", uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.M5YPh117fAzGpQpe", desc:"A tentacle pushes into the pussy and thickens as it works deeper.", label:(p)=>`Tentacle Fill`,         logPhrase:(a,t,p)=>`${a}'s tentacle probes deep into ${t}`,                       hole:"vaginal", bottomFills:"floor", positionTrait:"tentacled", penile:true  },
    { id:"tentacle-fill-anal",  uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7uM3mAuPNEXC0tu6", desc:"The tentacle fills the ass with methodical thoroughness.", label:(p)=>`Tentacle Fill (Anal)`,  logPhrase:(a,t,p)=>`${a}'s tentacle fills ${t}'s ass`,                            hole:"anal",    bottomFills:"floor", positionTrait:"tentacled", penile:true  },
    { id:"tentacle-throat",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.JqHE1MKVHfHqcTm3", desc:"A tentacle forces itself between the bottom's lips and down their throat, pulsing with slow rhythm.", label:(p)=>`Tentacle Throat`,       logPhrase:(a,t,p)=>`${a} drives a tentacle down ${t}'s throat`,                   hole:"oral",    bottomFills:"floor", positionTrait:"tentacled", penile:true  },
    { id:"tentacle-spitroast", holes:["oral","vaginal","anal"],  uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.PbuVIa9dtQclLYWs", desc:"Tentacles in the mouth, pussy, and ass at once, all working in the same slow rhythm.", label:(p)=>`Tentacle Spitroast`,    logPhrase:(a,t,p)=>`${a} fills ${t} from every angle simultaneously`,             hole:"oral",    bottomFills:"floor", positionTrait:"tentacled", penile:true  },

    // ── PLANT positions ────────────────────────────────────────────────────
    { id:"vine-wrap-pussy",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.6ka2MlMkIZKe41gR", desc:"Vines hold the bottom spread open while a thick tendril pushes inside, slow and inexorable.", label:(p)=>`Vine Wrap`,             logPhrase:(a,t,p)=>`${a}'s vines hold ${t} open and push inside`,                 hole:"vaginal", bottomFills:"coat-top", positionTrait:"plant",  penile:true  },
    { id:"vine-wrap-anal",      uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.FLOM2Hw6trwxyerO", desc:"Roots bind the bottom in place and a tendril fills their ass.", label:(p)=>`Vine Wrap (Anal)`,      logPhrase:(a,t,p)=>`${a}'s tendrils hold ${t} spread and fill their ass`,         hole:"anal",    bottomFills:"coat-top", positionTrait:"plant",  penile:true  },

    // ── INCORPOREAL positions ─────────────────────────────────────────────
    { id:"phantom-touch-pussy", uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.G4noN7OkbOZ07SU1", desc:"The entity phases partially into the bottom's body, manifesting heat and pressure from within.", label:(p)=>`Phantom Touch`,         logPhrase:(a,t,p)=>`${a} phases into ${t}, filling them without touching`,        hole:"vaginal", bottomFills:"floor", positionTrait:"incorporeal", penile:true  },
    { id:"phantom-touch-anal",  uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.GzGEfkhCG3hveuu4", desc:"The incorporeal top passes through and fills the ass with cold-then-warm pressure.", label:(p)=>`Phantom Touch (Anal)`,  logPhrase:(a,t,p)=>`${a} passes through ${t}'s body and fills their ass`,         hole:"anal",    bottomFills:"floor", positionTrait:"incorporeal", penile:true  },
    { id:"phantom-oral",        uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.iPZicqrJZxpnrLIr", desc:"The entity pours past the bottom's lips and fills their throat, cold and thick.", label:(p)=>`Phantom Oral`,          logPhrase:(a,t,p)=>`${a} flows into ${t}'s mouth`,                                hole:"oral",    bottomFills:"floor", positionTrait:"incorporeal", penile:true  },
  ],

  // ===============================
  // Default position pools by position trait
  // Massive creatures also get all biped positions.
  // ===============================
  // WHICH BODIES GET SIXTY-NINE, and why three pools do not. Added 16 Aug 2026.
  //
  // A sixty-nine needs two bodies that can lie head to hip with a mouth at each
  // end, so it is a question about the creature's SHAPE, not its size. In:
  // biped and massive (a scale gap the carry positions already live with),
  // quadruped (lying under the beast is the standard version of this),
  // serpentine (a coiled body reaches its own length), and tentacled, which has
  // a mouth-analogue the pack already uses in `tentacle-throat`.
  //
  // OUT, and each for a stated reason rather than an oversight: `winged`, whose
  // every entry is a talon grab or an aerial carry; `plant`, which is rooted
  // vines with no mouth in either of its two entries; and `incorporeal`, which
  // phases through a body rather than putting a mouth on it. Any of the three is
  // one array entry away if the fiction turns up.
  positionTraitDefaults: {
    biped:       ["doggy-style-pussy","doggy-style-anal","missionary-pussy","missionary-anal","cowgirl","reverse-cowgirl","cowboy-anal","facefuck","deepthroat","face-sit-oral","sixty-nine","prone-bone-pussy","prone-bone-anal","doggy-piledrive-anal","turn-taking-pussy","turn-taking-anal","turn-taking-oral","assisting-hands","standing-pussy","standing-anal","mating-press","mating-press-anal","spitroast","lotus","lap-dance-anal","reverse-missionary","standing-carry-pussy","standing-carry-anal","paizuri","nipple-fuck","groping","licking","oral-give","oral-receive","facial","other"],
    massive:     ["doggy-style-pussy","doggy-style-anal","missionary-pussy","missionary-anal","facefuck","sixty-nine","prone-bone-pussy","prone-bone-anal","standing-pussy","standing-anal","mating-press","mating-press-anal","full-nelson-anal","full-nelson-pussy","carry-fuck-pussy","carry-fuck-anal","wall-pin-pussy","wall-pin-anal","reverse-missionary","standing-carry-pussy","standing-carry-anal","paizuri","nipple-fuck","groping","other"],
    quadruped:   ["mounted-pussy","mounted-anal","doggy-piledrive-anal","beast-ride-pussy","beast-ride-anal","sixty-nine","other"],
    serpentine:  ["coil-pussy","coil-anal","constrict-oral","sixty-nine","other"],
    winged:      ["doggy-style-pussy","doggy-style-anal","missionary-pussy","missionary-anal","facefuck","prone-bone-pussy","prone-bone-anal","talon-grip-pussy","talon-grip-anal","aerial-carry-pussy","other"],
    tentacled:   ["tentacle-fill-pussy","tentacle-fill-anal","tentacle-throat","tentacle-spitroast","sixty-nine","groping","other"],
    plant:       ["vine-wrap-pussy","vine-wrap-anal","groping","other"],
    incorporeal: ["phantom-touch-pussy","phantom-touch-anal","phantom-oral","other"],
  },

  // ===============================
  // Creature trait → position trait mapping
  // Used by the initialize macro to set allowedPositions on actors.
  // PF2e creature traits map to AFLP position traits here.
  // ===============================
  creatureTraitToPositionTrait: {
    // Humanoids and human-shaped → biped
    "humanoid": "biped", "human": "biped", "elf": "biped", "dwarf": "biped",
    "gnome": "biped", "halfling": "biped", "orc": "biped", "goblin": "biped",
    "hobgoblin": "biped", "kobold": "biped", "lizardfolk": "biped",
    "gnoll": "biped", "bugbear": "biped", "kitsune": "biped", "merfolk": "biped",
    "nephilim": "biped", "drow": "biped", "troll": "biped",
    "oni": "biped", "fey": "biped", "hag": "biped", "nymph": "biped",
    "velstrac": "biped", "demon": "biped", "fiend": "biped",
    "vampire": "biped", "ghost": "biped", "undead": "biped",
    "werecreature": "biped", "dragon": "biped", // dragons are typically biped in combat posture
    // Large biped → massive
    "giant": "massive",
    // Four-legged beasts → quadruped
    "animal": "quadruped", "beast": "quadruped", "dinosaur": "quadruped",
    // Serpentine → serpentine
    "naga": "serpentine", "serpent": "serpentine",
    // Special
    "plant": "plant", "fungus": "plant",
    "ooze": "tentacled", "aberration": "tentacled",
    "incorporeal": "incorporeal", "spirit": "incorporeal",
    "construct": "biped", // constructs default to biped; override per creature
    "swarm": "other",
    "troop": "biped",
  },

  // ===============================
  // Gangbang Presets
  // Shown when a 3rd attacker joins a scene. Each preset assigns a position
  // slot to each attacker in order. The prompt auto-assigns positions to all
  // attackers instead of each picking individually.
  // slots: array of { label, position, hole } — one per attacker slot (may be
  // fewer than the actual attacker count; extras fallback to individual pick).
  // ===============================
  // ── Group position presets (3p+) ──────────────────────────────────────────
  // minActors: minimum tops needed (does not count the target/bottom)
  // maxActors: maximum tops (null = unlimited)
  // needsPussy: requires target to have a pussy
  // requiredTraits: array of traits required per slot (length = minActors)
  //   "any" = any body type, "biped"/"massive"/"quadruped" etc = specific
  // slots: per-top assignments in order
  gangbangPresets: [
    // ── 2-top presets ────────────────────────────────────────────────────
    { id: "gb-spitroast-anal",       name: "Spitroast (Anal)",    minActors: 2, maxActors: 2, needsPussy: false,
      requiredTraits: ["any","any"],
      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.g1e7709z60MUvp9U",
      desc: "Both ends at once: throat and ass.",
      slots: [{ label: "Front (Throat)", position: "facefuck", hole: "oral" }, { label: "Back (Ass)", position: "doggy-style-anal", hole: "anal" }] },

    { id: "gb-spitroast-pussy",      name: "Spitroast (Pussy)",   minActors: 2, maxActors: 2, needsPussy: true,
      requiredTraits: ["any","any"],
      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.5fOaCZjPCXUWjKIo",
      desc: "Both ends at once: throat and pussy.",
      slots: [{ label: "Front (Throat)", position: "facefuck", hole: "oral" }, { label: "Back (Pussy)", position: "doggy-style-pussy", hole: "vaginal" }] },

    { id: "gb-double-penetration",   name: "Double Penetration",  minActors: 2, maxActors: 2, needsPussy: true,
      requiredTraits: ["any","any"],
      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.sWde7LxwpEVKlkvq",
      desc: "The bottom rides one top while the second takes the ass from behind.",
      slots: [{ label: "Vaginal (Riding)", position: "cowgirl", hole: "vaginal" }, { label: "Anal (Behind)", position: "doggy-style-anal", hole: "anal" }] },

    { id: "gb-double-vaginal",       name: "Double Vaginal (DVP)", minActors: 2, maxActors: 2, needsPussy: true,
      requiredTraits: ["any","any"],
      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.DES5GyCJlpTjBYvi",
      desc: "Two tops in the pussy simultaneously.",
      slots: [{ label: "Vaginal (Riding)", position: "cowgirl", hole: "vaginal" }, { label: "Vaginal (Pressed Behind)", position: "standing-pussy", hole: "vaginal" }] },

    { id: "gb-double-anal-cowgirl",  name: "Double Anal - Cowgirl", minActors: 2, maxActors: 2, needsPussy: false,
      requiredTraits: ["any","any"],
      uuid: null,
      desc: "Two in the ass. Bottom rides the first, second from behind.",
      slots: [{ label: "Cowgirl (Anal)", position: "cowboy-anal", hole: "anal" }, { label: "Doggy (Anal)", position: "doggy-style-anal", hole: "anal" }] },

    { id: "gb-double-anal-piledrive", name: "Double Anal - Piledrive", minActors: 2, maxActors: 2, needsPussy: false,
      requiredTraits: ["any","any"],
      uuid: null,
      desc: "Two in the ass. First drives from above, second from behind.",
      slots: [{ label: "Doggy Piledrive (Anal)", position: "doggy-piledrive-anal", hole: "anal" }, { label: "Doggy (Anal)", position: "doggy-style-anal", hole: "anal" }] },

    { id: "gb-oral-vaginal",         name: "Missionary + Oral",   minActors: 2, maxActors: 2, needsPussy: true,
      requiredTraits: ["any","any"],
      uuid: null,
      desc: "Bottom on their back in missionary while a second top uses their mouth.",
      slots: [{ label: "Oral", position: "facefuck", hole: "oral" }, { label: "Vaginal (Missionary)", position: "missionary-pussy", hole: "vaginal" }] },

    { id: "gb-oral-anal",            name: "Missionary Anal + Oral", minActors: 2, maxActors: 2, needsPussy: false,
      requiredTraits: ["any","any"],
      uuid: null,
      desc: "Bottom on their back for anal in missionary while a second top uses their mouth.",
      slots: [{ label: "Oral", position: "facefuck", hole: "oral" }, { label: "Anal (Missionary)", position: "missionary-anal", hole: "anal" }] },

    // ── 3-top presets ────────────────────────────────────────────────────
    { id: "gb-dp-facial",            name: "DP with Facial",      minActors: 3, maxActors: 3, needsPussy: true,
      requiredTraits: ["any","any","any"],
      uuid: null,
      desc: "Bottom rides the vaginal top, takes the ass from behind, and uses their mouth on a third.",
      slots: [{ label: "Throat", position: "facefuck", hole: "oral" }, { label: "Vaginal (Riding)", position: "cowgirl", hole: "vaginal" }, { label: "Anal (Behind)", position: "doggy-style-anal", hole: "anal" }] },

    { id: "gb-da-facial",            name: "DA with Facial",      minActors: 3, maxActors: 3, needsPussy: false,
      requiredTraits: ["any","any","any"],
      uuid: null,
      desc: "Bottom rides one top anally, a second takes the ass from behind, and a third uses the mouth.",
      slots: [{ label: "Throat", position: "facefuck", hole: "oral" }, { label: "Anal (Riding)", position: "cowboy-anal", hole: "anal" }, { label: "Anal (Behind)", position: "doggy-style-anal", hole: "anal" }] },

    { id: "gb-dvp-anal",             name: "DVP with Anal",       minActors: 3, maxActors: 3, needsPussy: true,
      requiredTraits: ["any","any","any"],
      uuid: null,
      desc: "Two tops fill the pussy together while a third enters the ass from behind.",
      slots: [{ label: "Vaginal (Riding)", position: "cowgirl", hole: "vaginal" }, { label: "Vaginal (Pressed Behind)", position: "standing-pussy", hole: "vaginal" }, { label: "Anal (Behind)", position: "doggy-style-anal", hole: "anal" }] },

    { id: "gb-dap-vaginal",          name: "DAP with Vaginal",    minActors: 3, maxActors: 3, needsPussy: true,
      requiredTraits: ["any","any","any"],
      uuid: null,
      desc: "Bottom on all fours: one top beneath in the pussy, two doubled up in the ass from behind and above.",
      slots: [{ label: "Vaginal (Beneath)", position: "reverse-missionary", hole: "vaginal" }, { label: "Anal (Behind)", position: "doggy-style-anal", hole: "anal" }, { label: "Anal (Above)", position: "doggy-piledrive-anal", hole: "anal" }] },

    { id: "gb-spitroast-anal-extra", name: "Spitroast (Anal) + Facial", minActors: 3, maxActors: 3, needsPussy: false,
      requiredTraits: ["any","any","any"],
      uuid: null,
      desc: "Spitroasted from both ends while a third adds a facial.",
      slots: [{ label: "Throat (Primary)", position: "facefuck", hole: "oral" }, { label: "Ass", position: "doggy-style-anal", hole: "anal" }, { label: "Facial", position: "facial", hole: "facial" }] },

    // ── 4+ top presets ────────────────────────────────────────────────────
    { id: "gb-train",                name: "Train (Pussy)",       minActors: 2, maxActors: null, needsPussy: true,
      requiredTraits: [],
      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.rjpjsDaRoRSRv5IO",
      desc: "All tops take the bottom one after another in the pussy. The bottom stops keeping count.",
      slots: [{ label: "Current", position: "doggy-style-pussy", hole: "vaginal" }] },

    { id: "gb-train-anal",           name: "Train (Anal)",        minActors: 2, maxActors: null, needsPussy: false,
      requiredTraits: [],
      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.1UUPESCDcRH2qjyE",
      desc: "All tops take the ass in turn. Each one leaves the bottom a little more wrecked.",
      slots: [{ label: "Current", position: "doggy-style-anal", hole: "anal" }] },

    { id: "gb-carry-dap-vaginal", name: "Standing Carry - DAP + Pussy", minActors: 3, maxActors: 3, needsPussy: true,
      requiredTraits: ["any","any","any"],
      uuid: null,
      desc: "The bottom is hoisted off the ground between three tops: one in the pussy from the front, two sharing the ass behind. A fourth top has no slot in the carry - they wait their turn and run a train instead.",
      slots: [{ label: "Front (Pussy)", position: "standing-carry-pussy", hole: "vaginal" }, { label: "Behind (Anal)", position: "standing-carry-anal", hole: "anal" }, { label: "Behind (Anal)", position: "standing-carry-anal", hole: "anal" }] },

    { id: "gb-carry-dvp-anal",    name: "Standing Carry - DVP + Anal", minActors: 3, maxActors: 3, needsPussy: true,
      requiredTraits: ["any","any","any"],
      uuid: null,
      desc: "The bottom hangs between three tops: two sharing the pussy from the front, one in the ass behind. A fourth top has no slot in the carry - they wait their turn and run a train instead.",
      slots: [{ label: "Front (Pussy)", position: "standing-carry-pussy", hole: "vaginal" }, { label: "Front (Pussy)", position: "standing-carry-pussy", hole: "vaginal" }, { label: "Behind (Anal)", position: "standing-carry-anal", hole: "anal" }] },

    // ── Hemipenis / Multipenis presets (anatomy-gated slots) ─────────────
    { id: "gb-twin-dp-throat",     name: "Twin-Shaft DP + Throat",  minActors: 2, maxActors: 2, needsPussy: true,
      requiredTraits: ["any","any"],
      uuid: null,
      desc: "A hemipenis top seats both shafts below - pussy and ass at once - while a second top takes the throat.",
      slots: [{ label: "Below (Pussy + Ass)", position: "hemi-mating-press", hole: "vaginal", holes: ["vaginal","anal"], requiresAnatomy: "cock-hemipenis" }, { label: "Front (Throat)", position: "facefuck", hole: "oral" }] },

    { id: "gb-twin-mount-turns",   name: "Twin Mount + Turns",      minActors: 2, maxActors: 4, needsPussy: true,
      requiredTraits: ["any","any"],
      uuid: null,
      desc: "A hemipenis top mounts from behind and fills pussy and ass together; the rest rotate through the mouth and assist.",
      slots: [{ label: "Behind (Pussy + Ass)", position: "hemi-doggy", hole: "vaginal", holes: ["vaginal","anal"], requiresAnatomy: "cock-hemipenis" }, { label: "Mouth (Turns)", position: "turn-taking-oral", hole: "oral" }, { label: "Assisting", position: "assisting-hands", hole: "none" }, { label: "Assisting", position: "assisting-hands", hole: "none" }] },

    { id: "gb-living-centerpiece", name: "Living Centerpiece",      minActors: 2, maxActors: 5, needsPussy: false,
      requiredTraits: ["any","any"],
      uuid: null,
      desc: "A multipenis top claims every hole at once; everyone else works the outside - {tits, nipples|chest}, hands.",
      slots: [{ label: "Every Hole", position: "multi-every-hole", hole: "vaginal", holes: ["oral","vaginal","anal"], requiresAnatomy: "cock-slime" }, { label: "Tits", position: "paizuri", hole: "paizuri" }, { label: "Nipples", position: "nipple-fuck", hole: "nipples" }, { label: "Assisting", position: "assisting-hands", hole: "none" }, { label: "Assisting", position: "assisting-hands", hole: "none" }] },

    { id: "gb-shared-burial",      name: "Buried, Mouth Free",      minActors: 2, maxActors: 3, needsPussy: true,
      requiredTraits: ["any","any"],
      uuid: null,
      desc: "The multipenis top buries the bottom - pussy, ass, {tits|chest}, and every spare inch - but leaves the mouth for a partner's cock.",
      slots: [{ label: "Buried (Pussy + Ass + Tits)", position: "multi-buried", hole: "vaginal", holes: ["vaginal","anal","paizuri"], requiresAnatomy: "cock-slime" }, { label: "Front (Throat)", position: "facefuck", hole: "oral" }, { label: "Assisting", position: "assisting-hands", hole: "none" }] },

    { id: "gb-train-oral",           name: "Train (Oral)",        minActors: 2, maxActors: null, needsPussy: false,
      requiredTraits: [],
      uuid: null,
      desc: "All tops use the mouth in turn. The bottom's jaw is going to hurt tomorrow.",
      slots: [{ label: "Current", position: "facefuck", hole: "oral" }] },

    { id: "gb-bukakke",              name: "Bukakke",             minActors: 2, maxActors: null, needsPussy: false,
      requiredTraits: [],
      uuid: null,
      desc: "All tops finish on the bottom's face in turn. The bottom kneels and endures.",
      slots: [{ label: "Current", position: "facial", hole: "facial" }] },
  ],

  // Get available gangbang presets for a scene, filtering by whether the target has a pussy.
  // Get group presets valid for the current number of tops in the scene.
  // nTops = number of attacker slots currently in the scene.
  // hasPussy = whether the target has a pussy.
  getGangbangPresets(targetActor, nTops = 2, topActors = null) {
    const hasPussy = !!targetActor?.getFlag?.(this.FLAG_SCOPE, "pussy");
    return this.gangbangPresets.filter(p => {
      if (p.needsPussy && !hasPussy) return false;
      if (p.minActors > nTops) return false;
      if (p.maxActors !== null && p.maxActors < nTops) return false;
      // Anatomy-gated slots (hemipenis/multipenis presets): when the caller
      // hands over the top actors, require at least one top per distinct
      // required anatomy; without the actor list the preset stays visible
      // and slot assignment sorts it out.
      if (Array.isArray(topActors)) {
        const needs = [...new Set((p.slots ?? []).map(sl => sl.requiresAnatomy).filter(Boolean))];
        for (const key of needs) {
          const ok = topActors.some(a =>
            (a?.getFlag?.(this.FLAG_SCOPE, "anatomyFeatures") ?? {})[key]);
          if (!ok) return false;
        }
      }
      return true;
    });
  },

  // ── Description cache ─────────────────────────────────────────────────────
  // Populated by _loadPositionDescriptions() on Hooks.once("ready").
  // Maps position id → first sentence of the compendium item description.
  _positionDescCache: {},

  async _loadPositionDescriptions() {
    try {
      // First populate from inline desc on legacy entries (no UUID)
      for (const entry of this.positions) {
        if (entry.desc) this._positionDescCache[entry.id] = entry.desc;
      }
      const pack = game.packs.get(AFLP.CONTENT_ITEMS_PACK);
      if (!pack) return;
      for (const entry of this.positions) {
        if (!entry.uuid) continue;
        if (this._positionDescCache[entry.id]) continue; // inline desc already loaded - skip compendium
        const id = entry.uuid.split(".").pop();
        try {
          const doc = await pack.getDocument(id);
          if (!doc) continue;
          const raw = doc.system?.description?.value ?? "";
          // Strip HTML, get first sentence (up to first period or 120 chars)
          const plain = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          const firstSentence = plain.match(/^.+?[.!?]/)?.[0] ?? plain.substring(0, 120);
          this._positionDescCache[entry.id] = firstSentence;
        } catch { /* individual item missing - skip */ }
      }
      console.log("AFLP | Position description cache loaded: " + Object.keys(this._positionDescCache).length + " entries");
    } catch(e) {
      console.warn("AFLP | Could not load position descriptions:", e);
    }
  },

  // Anatomy-aware description tokens. "{with tits|without tits}" renders the
  // left form when the BOTTOM has tits and the right form when they do not, so
  // a maximum-fill position stops promising tits to a bottom with none. With no
  // target in hand (browsing UIs, tooltips outside a pairing) the neutral right
  // form is used, which is always true. Tits is the only keyed anatomy today;
  // extend here if another one ever needs the same treatment.
  resolveDescTokens(desc, targetActor = null) {
    if (typeof desc !== "string" || !desc.includes("{")) return desc;
    const af = targetActor?.getFlag?.(this.FLAG_SCOPE, "anatomyFeatures") ?? {};
    const hasTits = !!(af["tits"] || Object.keys(af).some(k => k.startsWith("tits-") && af[k]));
    return desc.replace(/\{([^|{}]*)\|([^|{}]*)\}/g, (_m, withTits, without) => (hasTits ? withTits : without));
  },

  getPositionDesc(id, targetActor = null) {
    return this.resolveDescTokens(this._positionDescCache[id] ?? null, targetActor);
  },

  // Convenience: get a position entry by id
  getPosition(id) {
    // Cut duplicates resolve to their survivors so live scenes holding the
    // dead ids keep working (riding-* cut in the Jul 2026 duplicate audit).
    const _legacyPositions = { "riding-vaginal": "cowgirl", "riding-anal": "cowboy-anal" };
    id = _legacyPositions[id] ?? id;
    return this.positions.find(p => p.id === id) ?? null;
  },

  // The four destinations a BOTTOM's load can have, as a list rather than four
  // string literals scattered through the deposit code. Anything that hardcodes
  // one of these words is a bug waiting for the fifth.
  BOTTOM_FILLS: ["floor", "coat-top", "coat-self", "oral"],

  // Where does the BOTTOM's load go, for the position this creature is in?
  //
  // Returns one of BOTTOM_FILLS, or null when the position ITSELF answers the
  // question - a receiverIsTop entry, where the bottom is the penetrator and the
  // existing `hole` already names what it fills. A null here means "not my
  // question", NOT "nothing happens": the caller must not read it as a floor
  // spill or the beast rides would deposit twice.
  //
  // Unknown or missing ids fall to "floor", which is the safe direction: a load
  // that lands somewhere it should not is visible and moppable, where a load that
  // silently vanishes is the failure this whole pass exists to stop.
  bottomFillsOf(positionId) {
    const p = this.getPosition?.(positionId);
    if (!p) return "floor";
    if (p.receiverIsTop) return null;
    const v = p.bottomFills;
    return this.BOTTOM_FILLS.includes(v) ? v : "floor";
  },

  // Get allowed position IDs for an actor based on their position trait flag.
  // Falls back to creature trait detection if flag not set.
  getActorPositions(actor) {
    const FLAG = this.FLAG_SCOPE;
    const positionTrait = actor.getFlag?.(FLAG, "positionTrait")
      ?? this._detectPositionTrait(actor);
    const ids = this.positionTraitDefaults[positionTrait] ?? this.positionTraitDefaults.biped;
    // Also always include non-positional options
    const extras = ["groping","fingering","licking","oral-give","oral-receive","facial","other","painplay"];
    return [...new Set([...ids, ...extras])];
  },

  // Full gated position list for a top/bottom pair. Union of the top's trait
  // pool and every anatomy-gated entry the top qualifies for, minus entries
  // whose target-anatomy requirement the bottom fails. This is THE list any
  // position UI should render; the trait pool alone misses requiresAnatomy
  // entries (hemipenis, multipenis, acrobatic mounts) and shows
  // target-gated ones (paizuri, nipple-fuck) against the wrong bottoms.
  positionsForPair(atkActor, targetActor) {
    const FLAG = this.FLAG_SCOPE;
    const pool = new Set(this.getActorPositions(atkActor));
    const atkAf = atkActor?.getFlag?.(FLAG, "anatomyFeatures") ?? {};
    const tgtAf = targetActor?.getFlag?.(FLAG, "anatomyFeatures") ?? {};
    const tgtHasPussy = !!targetActor?.getFlag?.(FLAG, "pussy");
    const out = [];
    for (const p of (this.positions ?? [])) {
      const inPool = pool.has(p.id);
      const anatomyGated = !!p.requiresAnatomy;
      if (!inPool && !anatomyGated) continue;
      if (anatomyGated && !atkAf[p.requiresAnatomy]) continue;
      if (p.requiresTargetAnatomy && !tgtAf[p.requiresTargetAnatomy]) continue;
      // A multi-hole position needs each hole to exist on the bottom; vaginal
      // drops out for pussyless bottoms rather than blocking the position,
      // unless vaginal was its ONLY hole.
      if (Array.isArray(p.holes)) {
        const usable = p.holes.filter(h =>
          h === "vaginal" ? tgtHasPussy :
          h === "paizuri" ? !!tgtAf["tits"] : true);
        if (!usable.length) continue;
      } else if (p.hole === "vaginal" && targetActor && !tgtHasPussy) continue;
      out.push(p.id);
    }
    return out;
  },

  // Effective holes of a position against a given bottom: holes[] filtered by
  // the bottom's anatomy (vaginal needs a pussy, paizuri needs tits), else the
  // single hole. Cum, cumflation, and impregnation route per entry of this.
  // Shafts occupying each usable hole for a position, e.g. { vaginal: 2, anal: 1 }.
  // One source of truth for both economies: the size-gap bonus for a hole is
  // (shafts - 1), and the cum spend is one full Cum Shot and one Load PER SHAFT,
  // so a triple-stacked hole costs three of each. Positions without holeShafts
  // are one shaft per hole, which is every ordinary position.
  positionShaftsFor(positionId, targetActor) {
    const p = this.getPosition?.(positionId);
    const holes = this.positionHolesFor(positionId, targetActor);
    const map = {};
    for (const h of holes) map[h] = Math.max(1, Number(p?.holeShafts?.[h]) || 1);
    return map;
  },

  positionHolesFor(positionId, targetActor) {
    const FLAG = this.FLAG_SCOPE;
    const p = this.getPosition?.(positionId);
    if (!p) return [];
    const tgtAf = targetActor?.getFlag?.(FLAG, "anatomyFeatures") ?? {};
    const tgtHasPussy = !!targetActor?.getFlag?.(FLAG, "pussy");
    const src = Array.isArray(p.holes) ? p.holes : (p.hole ? [p.hole] : []);
    return src.filter(h =>
      h === "vaginal" ? tgtHasPussy :
      h === "paizuri" ? !!tgtAf["tits"] :
      h === "nipples" ? !!tgtAf["tits-onahole"] : true);
  },

  // Detect position trait from PF2e creature traits, priority order
  _detectPositionTrait(actor) {
    const traits = actor.system?.traits?.value ?? [];
    // Priority: incorporeal > plant > tentacled > serpentine > winged > massive > quadruped > biped
    if (traits.includes("incorporeal") || traits.includes("spirit")) return "incorporeal";
    if (traits.includes("plant") || traits.includes("fungus")) return "plant";
    if (traits.includes("ooze")) return "tentacled";
    if (traits.includes("aberration")) {
      // Some aberrations are tentacled, some are not — check for naga/serpent shape
      const name = (actor.name ?? "").toLowerCase();
      if (name.includes("naga") || name.includes("serpent") || name.includes("worm")) return "serpentine";
      return "tentacled";
    }
    if (traits.includes("naga")) return "serpentine";
    if (traits.includes("giant")) return "massive";
    // Winged: dragons, harpies, manticores etc - check both trait AND name
    const wingNames = ["harpy","drake","wyrm","dragon","manticore","sphinx","wyvern","pegasus"];
    if (traits.includes("dragon") || wingNames.some(n => (actor.name ?? "").toLowerCase().includes(n))) {
      // But humanoid dragons (like Lustful Werewolf with humanoid) stay biped
      if (!traits.includes("humanoid")) return "winged";
    }
    if (traits.includes("animal") || traits.includes("beast")) {
      if (traits.includes("humanoid")) return "biped"; // werewolves, harpies, lamia
      return "quadruped";
    }
    return "biped";
  },

  // Base parts (`parent: null`) that every body HAS unless a GM turns them off.
  // Every reader spells this as `genitalTypes[x] !== false` rather than
  // `=== true`, because requiring the flag meant no actor had one - the Head pane
  // read "None" on every character until 11 Aug 2026.
  //
  // THIS LIST IS THE DEFAULT, NOT THE MEMBERSHIP. The set of base parts is
  // derived from `anatomyFeatures` itself (`parent: null`); this only says which
  // of them start on. `pussy`, `cock` and `tits` are base parts too and are
  // deliberately absent - they default OFF.
  // GOES STALE IF: a new base part is added that should also default on.
  ANATOMY_DEFAULT_ON: ["throat", "ass", "chest"],

  // ===============================
  // Genital Type Registry
  // ===============================
  anatomyFeatures: {
    pussy:               { name: "Pussy",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.pXivTb1f84SDm2xc", parent: null },
    "pussy-litter":      { name: "Litter",        uuid: null, parent: "pussy" },
    "pussy-breeder":     { name: "Breeder",       uuid: null, parent: "pussy" },
    "pussy-milking":     { name: "Milking",       uuid: null, parent: "pussy" },
    "pussy-gripping":    { name: "Gripping",      uuid: null, parent: "pussy" },
    "pussy-venomous":    { name: "Venomous",      uuid: null, parent: "pussy" },
    "pussy-electric":    { name: "Electric",      uuid: null, parent: "pussy" },
    "pussy-honeyed":     { name: "Honeyed",       uuid: null, parent: "pussy" },
    "pussy-clutch":      { name: "Clutch",        uuid: null, parent: "pussy" },
    "pussy-slick":       { name: "Slick",         uuid: null, parent: "pussy" },
    "pussy-fanged":      { name: "Fanged",        uuid: null, parent: "pussy" },
    "pussy-bottomless":  { name: "Bottomless",    uuid: null, parent: "pussy" },
    "pussy-fertile":     { name: "Fertile",       uuid: null, parent: "pussy" },
    "pussy-pacifying":   { name: "Pacifying",     uuid: null, parent: "pussy" },
    cock:                { name: "Cock",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.PR96OQsnDSzt1e4i", parent: null },
    "cock-barbed":       { name: "Barbed",        uuid: null, parent: "cock" },
    "cock-breeder":      { name: "Breeder",       uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7Lsd1xTTpGv7irtB", parent: "cock" },
    "cock-electrifying": { name: "Electrifying",  uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.jkRFNqFtRcKkAZwC", parent: "cock" },
    "cock-fertile":      { name: "Fertile",       uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.tUqN9UtQhawLd5Nq", parent: "cock" },
    "cock-flared":       { name: "Flared",        uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.qF8wy9Nz11DyBgRH", parent: "cock" },
    "cock-girthy":       { name: "Girthy",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.EOo3rbWwAybJFmlv", parent: "cock" },
    // The only cock subtype that SHRINKS. See AFLP.cockSizeOf for why it is a
    // -1 with a floor of 1 rather than a set-to-zero: 0 is the reserved value
    // for "this creature has no cock" and would switch the size gap off.
    "cock-micro":        { name: "Micro",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.vsXNRgsSfzwgHFic", parent: "cock" },
    "cock-hemipenis":    { name: "Hemipenis",     uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.JTWCaeV5zCKpT7uk", parent: "cock" },
    "cock-knot":         { name: "Knot",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.A8cubySA9aPKmNCF", parent: "cock" },
    "cock-litter":       { name: "Litter",        uuid: null, parent: "cock" },
    "cock-ovidepositor": { name: "Ovidepositor",  uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7Hp4H1QcJiiMM9Gp", parent: "cock" },
    "cock-pacifying":    { name: "Pacifying",     uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.tuc39pbCilMKvYx8", parent: "cock" },
    "cock-paralyzing":   { name: "Paralyzing",    uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.vy3wCGu8tRKwfAP5", parent: "cock" },
    "cock-slime":        { name: "Multipenis",    uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.TAfvb2RvjbwcT7Ci", parent: "cock" },
    "cock-acrobatic-mount": { name: "Acrobatic Mount", uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.OyUZYLdirrsTPk87", parent: "cock" },
    "pussy-acrobatic-mount": { name: "Acrobatic Mount", uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.vp6sC7rZ2f3cVRf2", parent: "pussy" },
    // Tits: a base body part granted at creation, on the same footing as pussy/cock.
    // Special tit types are subtypes (parent "tits") unlocked by feats/items/spells/
    // conditions, exactly like the cock/pussy subtypes; author them as tits-<x> with
    // a pack item uuid as they're created. Tits gate the Paizuri action.
    tits:                { name: "Tits",          uuid: null, parent: null },
    // Tits subtypes (parent "tits") - step-7 draft. uuid backfilled as pack items
    // are authored; a null uuid renders as a plain toggle (like the litter subtypes).
    "tits-lactating":    { name: "Lactating",     uuid: null, parent: "tits" },
    "tits-slime":        { name: "Slime",         uuid: null, parent: "tits" },
    "tits-gripping":     { name: "Gripping",      uuid: null, parent: "tits" },
    "tits-electric":     { name: "Electric",      uuid: null, parent: "tits" },
    "tits-honeyed":      { name: "Honeyed",       uuid: null, parent: "tits" },
    "tits-numbing":      { name: "Numbing",       uuid: null, parent: "tits" },
    "tits-heavy":        { name: "Heavy",         uuid: null, parent: "tits" },
    // The mirror of Heavy, and the second SHRINKING subtype in the module after
    // `cock-micro`. -1 tits size with a floor of 1, because 0 is the reserved
    // value for "this creature has no tits" - see AFLP.titsSize. Added 27 Aug
    // 2026 at Ardis's request. `uuid: null` like every other tits row: these
    // resolve by aflrKey through the built content index, so a new card needs no
    // id written here and none is invented.
    "tits-itty-bitty":   { name: "Itty Bitty",    uuid: null, parent: "tits" },
    "tits-onahole":      { name: "Onahole",       uuid: null, parent: "tits" },
    "tits-hyper":        { name: "Hyper",         uuid: null, parent: "tits" },
    // Throat: an optional special-throat base (Option B) with its own subtypes.
    throat:              { name: "Throat",        uuid: null, parent: null },

    // Chest: the base every body has, and the one the chest coat sits on. Tits
    // OVERRIDE it - a creature with tits reads the Tits card, which carries the
    // same Coated paragraph. It has no subtypes by design (Ardis, 29 Aug 2026:
    // "I don't plan on making special chest anatomy types besides that base one"),
    // so it exists to give the sheet's Chest Coat row an anatomy to hang on and to
    // give a flat-chested creature a card that states the coat rule.
    // `uuid: null` like tits / throat / ass - these resolve by aflrKey through the
    // built content index, so the card needs no id written here.
    chest:               { name: "Chest",         uuid: null, parent: null },

    // Everyone has one, so `ass` seeds true the same way `throat` does. It is the
    // only lower hole nobody has to be given, which is why the subtype list runs
    // longer than pussy's or cock's.
    ass:                 { name: "Ass",           uuid: null, parent: null },
    "ass-gripping":      { name: "Gripping",      uuid: null, parent: "ass" },
    "ass-milking":       { name: "Milking",       uuid: null, parent: "ass" },
    "ass-slick":         { name: "Slick",         uuid: null, parent: "ass" },
    "ass-honeyed":       { name: "Honeyed",       uuid: null, parent: "ass" },
    "ass-electric":      { name: "Electric",      uuid: null, parent: "ass" },
    "ass-venomous":      { name: "Venomous",      uuid: null, parent: "ass" },
    "ass-pacifying":     { name: "Pacifying",     uuid: null, parent: "ass" },
    "ass-deep":          { name: "Deep",          uuid: null, parent: "ass" },
    "ass-fertile":       { name: "Fertile",       uuid: null, parent: "ass" },
    "ass-breeder":       { name: "Breeder",       uuid: null, parent: "ass" },
    "ass-clutch":        { name: "Clutch",        uuid: null, parent: "ass" },
    "ass-litter":        { name: "Litter",        uuid: null, parent: "ass" },
    "ass-straight-through": { name: "Straight Through", uuid: null, parent: "ass" },
    "ass-stretchy":      { name: "Stretchy",      uuid: null, parent: "ass" },
    "ass-carrying":      { name: "Carrying",      uuid: null, parent: "ass" },
    "ass-prehensile":    { name: "Prehensile",    uuid: null, parent: "ass" },
    "ass-cumfinity":     { name: "Cumfinity",     uuid: null, parent: "ass" },
    "throat-deep":       { name: "Deepthroat",    uuid: null, parent: "throat" },
    "throat-milking":    { name: "Milking",       uuid: null, parent: "throat" },
    "throat-venomous":   { name: "Venomous",      uuid: null, parent: "throat" },
    "throat-numbing":    { name: "Numbing",       uuid: null, parent: "throat" },
    "throat-swallowing": { name: "Swallowing",    uuid: null, parent: "throat" },
    "maw":               { name: "Maw",           uuid: null, parent: "throat" },
    "tongue-long":       { name: "Prehensile Tongue", uuid: null, parent: "throat" }
  },

  cumflationDefaults: { anal: 0, oral: 0, vaginal: 0, facial: 0, bodyCoat: 0, onahole: 0 },

  // Average of anal+oral+vaginal, floored, capped at 8. Facial excluded.
  cumflationTotal(actor) {
    const c = actor.getFlag(this.FLAG_SCOPE, "cumflation") ?? {};
    return Math.min(AFLP.CUMFLATION_MAX ?? 8, Math.floor(((c.anal ?? 0) + (c.oral ?? 0) + (c.vaginal ?? 0)) / 3));
  },

  // ── Mind Break save DC (D&D 5e) ──────────────────────────────────────────
  // While Defeated, every Arousal increment forces a Wisdom save or the mind
  // breaks. The DC comes from the Dominator - 8 + proficiency + Charisma mod,
  // the standard 5e monster save-DC formula, since breaking someone down is a
  // force-of-personality effect. A succubus breaks minds far more easily than a
  // goblin, so the GM's CR choice is the loop's difficulty dial.
  //
  // Where no statted Dominator exists (an environmental aphrodisiac haze, a
  // Bullified PC with no meaningful DC) the flat fallback applies. Bounded
  // accuracy makes a fixed number defensible: DC 15 is ~30% failure at +0 Wis.
  mindBreakDCFallback: 15,

  // Content hook: kinks, items, spell effects, monster abilities, and conditions
  // register a (target, dominator) => number here to raise or lower the DC.
  // Natural candidates: Hypnotized, Entranced, existing Mind Break stacks (the
  // spiral tightening on itself).
  mindBreakDCModifiers: [],

  mindBreakSaveDC(target, dominator = null) {
    let dc = this.mindBreakDCFallback;
    if (dominator) {
      const prof = dominator.system?.attributes?.prof ?? 2;
      const cha  = dominator.system?.abilities?.cha?.mod ?? 0;
      dc = 8 + prof + cha;
    }
    for (const fn of (this.mindBreakDCModifiers ?? [])) {
      try { dc += Number(fn(target, dominator)) || 0; } catch (e) { /* a bad hook must not break the save */ }
    }
    return Math.max(5, dc);
  },

  async ensureFlag(actor, path, value) {
    if (await actor.getFlag(this.FLAG_SCOPE, path) === undefined) {
      await actor.setFlag(this.FLAG_SCOPE, path, structuredClone(value));
    }
  },

  async ensureCoreFlags(actor) {
    if (!AFLP.gm.canWrite(actor)) return AFLP.gm.run("ensureCoreFlags", actor);
    await this.ensureFlag(actor, "sexual",      structuredClone(this.sexualDefaults));
    // ensureFlag only seeds when the whole flag is absent, so an actor with a partial
    // or reset `sexual` flag can be missing sub-keys (e.g. per-hole act counts), which
    // silently breaks lifetime tracking and title automation. Backfill missing defaults.
    {
      const sx = actor.getFlag(this.FLAG_SCOPE, "sexual");
      if (sx && typeof sx === "object") {
        let changed = false;
        const merged = { ...sx };
        for (const [k, v] of Object.entries(this.sexualDefaults)) {
          if (merged[k] === undefined) { merged[k] = structuredClone(v); changed = true; }
        }
        const ltMerged = { ...(merged.lifetime ?? {}) };
        for (const [k, v] of Object.entries(this.sexualDefaults.lifetime)) {
          if (ltMerged[k] === undefined) { ltMerged[k] = structuredClone(v); changed = true; }
        }
        merged.lifetime = ltMerged;
        if (changed) await actor.setFlag(this.FLAG_SCOPE, "sexual", merged);
      }
    }
    await this.ensureFlag(actor, "cum",         structuredClone(this.cumDefaults));
    await this.ensureFlag(actor, "cumOverflow", { anal: 0, oral: 0, vaginal: 0, facial: 0 });
    await this.ensureFlag(actor, "coomer",      { level: AFLP.defaultLoadsForActor(actor) });
    await this.ensureFlag(actor, "arousal",     structuredClone(this.arousalDefaults));
    await this.ensureFlag(actor, "horny",       structuredClone(this.hornyDefaults));
    // Every body has a throat, so seed it true when the key is absent. This runs
    // for pack actors, for existing world actors on upgrade, and for anything
    // created later - which a one-off migration would not have covered.
    //
    // Only seeds when the key is MISSING, so a GM who deliberately turns a throat
    // off (an ooze, a construct) keeps that choice. Note the old edit checkbox was
    // labelled "Special Throat" and wrote false when unticked, so an actor saved
    // under that UI carries a false meaning "not special" rather than "no throat";
    // those are cleared once here, since nothing could deliberately remove a
    // throat before this version.
    {
      const af = actor.getFlag(this.FLAG_SCOPE, "anatomyFeatures");
      if (af && typeof af === "object") {
        const hasThroatSubtype = Object.keys(af).some(k => k.startsWith("throat-") && af[k]);
        if (af.throat === undefined || (af.throat === false && !hasThroatSubtype)) {
          await actor.setFlag(this.FLAG_SCOPE, "anatomyFeatures", { ...af, throat: true });
        }
      } else {
        await actor.setFlag(this.FLAG_SCOPE, "anatomyFeatures", { throat: true, ass: true });
      }
    }

    // Same rule for the ass: everyone has one. Seed only when the key is absent
    // so a GM who removed it (an ooze, a construct) keeps that choice.
    {
      const af = actor.getFlag(this.FLAG_SCOPE, "anatomyFeatures");
      if (af && typeof af === "object" && af.ass === undefined) {
        await actor.setFlag(this.FLAG_SCOPE, "anatomyFeatures", { ...af, ass: true });
      }
    }

    // Same rule for the chest: every body has one, tits or not. Ardis, 29 Aug
    // 2026: "Chest should seed true at creation like ass and throat."
    //
    // The sheet does NOT depend on this seed - it shows the Chest Coat row unless
    // the key is explicitly false - so this exists so the anatomy editor starts
    // ticked and a GM turning a chest off has something to untick.
    {
      const af = actor.getFlag(this.FLAG_SCOPE, "anatomyFeatures");
      if (af && typeof af === "object" && af.chest === undefined) {
        await actor.setFlag(this.FLAG_SCOPE, "anatomyFeatures", { ...af, chest: true });
      }
    }

    // Denied: migrate from condition item to flag on first ensureCoreFlags call.
    // If the flag is already present, skip. If the actor has a Denied condition item,
    // read its value, write to flag, then delete the item.
    if (await actor.getFlag(this.FLAG_SCOPE, "denied") === undefined) {
      const UUID_DENIED = this.conditions["denied"]?.uuid;
      const liveActor   = actor.token?.actor ?? actor;
      const deniedItem  = liveActor.items?.find(i =>
        i.slug === "denied" || i.system?.slug === "denied" ||
        (i.flags?.core?.sourceId ?? i.sourceId) === UUID_DENIED
      );
      const migratedVal = deniedItem?.system?.badge?.value ?? deniedItem?.system?.value ?? 0;
      await actor.setFlag(this.FLAG_SCOPE, "denied", { value: Math.max(0, migratedVal) });
      if (deniedItem && migratedVal > 0) {
        await deniedItem.delete().catch(() => {});
        console.log(`AFLP | ${actor.name}: migrated Denied ${migratedVal} from condition item to flag`);
      }
    }
    await this.ensureFlag(actor, "pussy",       false);
    await this.ensureFlag(actor, "cock",        false);
    await this.ensureFlag(actor, "sexual.kinks", {});
    // Legacy migration: actors created under the old "genitalTypes" flag name carry
    // their data to "anatomyFeatures" (renamed once it covered tits/throats, not just
    // genitals). One-time - the old flag is removed after copying so it can't drift.
    {
      const _legacyGT = actor.getFlag(this.FLAG_SCOPE, "genitalTypes");
      if (_legacyGT && !actor.getFlag(this.FLAG_SCOPE, "anatomyFeatures")) {
        await actor.setFlag(this.FLAG_SCOPE, "anatomyFeatures", _legacyGT);
      }
      if (_legacyGT !== undefined) { try { await actor.unsetFlag(this.FLAG_SCOPE, "genitalTypes"); } catch (e) {} }
    }
    await this.ensureFlag(actor, "anatomyFeatures",
      Object.fromEntries(Object.keys(this.anatomyFeatures).map(k => [k, false]))
    );
    await this.ensureFlag(actor, "pregnancy",      {});
    await this.ensureFlag(actor, "cumflation",     structuredClone(this.cumflationDefaults));
    await this.ensureFlag(actor, "partnerHistory", []);
    await this.ensureFlag(actor, "schemaVersion",  this.SCHEMA_VERSION);

    // ── Schema migrations ────────────────────────────────────────────────────
    // Run in version order. Each migration checks the stored version and patches
    // only what's missing, then bumps the stored version.
    const storedVersion = actor.getFlag(this.FLAG_SCOPE, "schemaVersion") ?? 0;

    if (storedVersion < 2) {
      // v2: add sexual.lifetime.given sub-object (tracks cum given by category)
      const sexual = actor.getFlag(this.FLAG_SCOPE, "sexual");
      if (sexual?.lifetime && !sexual.lifetime.given) {
        const givenDefaults = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
        await actor.update({ [`flags.${this.FLAG_SCOPE}.sexual.lifetime.given`]: givenDefaults });
        console.log(`AFLP | ${actor.name}: migrated to schema v2 (added sexual.lifetime.given)`);
      }
      await actor.setFlag(this.FLAG_SCOPE, "schemaVersion", 2);
    }

    if (storedVersion < 3) {
      // v3: Cum/Coomer redesign. Coomer is now "loads before a rest" (default 2,
      // cap 6) and Cum is a small per-shot rating. Remap the old multiplier coomer
      // to a load count and recompute the pool (perShot x loads).
      const oldCo = (actor.getFlag(this.FLAG_SCOPE, "coomer")?.level) ?? 0;
      const loads = Math.max(this.COOMER_DEFAULT, oldCo + this.COOMER_DEFAULT);
      await actor.setFlag(this.FLAG_SCOPE, "coomer", { level: loads });
      await this.recalculateCum(actor);
      console.log(`AFLP | ${actor.name}: migrated to schema v3 (Coomer ${oldCo} -> ${loads} loads, Cum/shot ${this.cumPerShot(actor)})`);
      await actor.setFlag(this.FLAG_SCOPE, "schemaVersion", 3);
    }

    if (storedVersion < 4) {
      // v4: a body with a pussy has tits. Reported by a tester as "no female
      // actors have tits", and the pack was not the problem - all 14 DH pack
      // actors carrying a pussy already had them. The WORLD copies did not:
      // 13 of 14 in dh-test had `flags.world.pussy = true` and an EMPTY
      // anatomyFeatures object. Actors carry embedded copies of pack data that
      // do not update when the pack does, so a pack fix reaches nobody who has
      // already imported.
      //
      // Reads the legacy top-level `pussy` flag as well as anatomyFeatures.pussy,
      // because that is where the 13 actually stored it.
      //
      // SEEDS ONLY WHEN THE KEY IS ABSENT. Measured before writing: all 13 read
      // undefined, not false, so nothing here overrides a GM's explicit choice.
      const af4 = actor.getFlag(this.FLAG_SCOPE, "anatomyFeatures");
      if (af4 && typeof af4 === "object" && af4.tits === undefined) {
        const hasPussy = af4.pussy === true
          || actor.getFlag(this.FLAG_SCOPE, "pussy") === true
          || Object.keys(af4).some(k => k.startsWith("pussy-") && af4[k] === true);
        if (hasPussy) {
          await actor.setFlag(this.FLAG_SCOPE, "anatomyFeatures", { ...af4, tits: true });
          console.log(`AFLP | ${actor.name}: migrated to schema v4 (has a pussy, seeded base tits)`);
        }
      }
      await actor.setFlag(this.FLAG_SCOPE, "schemaVersion", 4);
    }
  },

  recalculateCum: async actor => {
    if (!actor) { console.warn("AFLP.recalculateCum called without actor"); return null; }
    const FLAG    = AFLP.FLAG_SCOPE;
    const perShot = AFLP.cumPerShot(actor);
    const loads   = AFLP.effectiveLoads(actor);
    const max     = perShot * loads;
    await actor.setFlag(FLAG, "cum", { current: max, max });
    return { current: max, max, perShot, loads };
  },

  // Pussy training: a creature that cums in a Slick or Milking pussy gets
  // "trained" to cum more. The FIRST time they finish inside a given such pussy
  // they gain a permanent boost from it, tracked per-partner per-type
  // (coomerTrainedBy) so repeated sex with the same pussy never stacks infinitely.
  //   Slick   -> +1 Loads        (coomer.level, the number of loads before a rest)
  //   Milking -> +1 Cum Shot     (cumShotBonus, the per-shot Cum volume)
  // The Milking item description promises Cum Shot, so the two effects are split
  // here to match. Both feed AFLP.cumPerShot via the live cumShotBonus world flag.
  // A hole that does something to whoever finishes in it. The tits and throat
  // versions fire off the COATING tier in cumflation.js; these fire on the climax
  // itself, which is why they live here rather than there.
  //
  // Deliberately not automated: Gripping. It holds the cummer in place until
  // released, which is a scene state a GM should be steering, not a flag.
  holeContactOnCum: async (cummer, receiver, hole) => {
    if (!cummer || !receiver || hole !== "anal") return;
    const af = receiver.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {};
    // Horny has a DIFFERENT STORE per system - a valued condition on Daggerheart,
    // a { temp, permanent } world flag on PF2e and 5e. grantHorny branches on
    // that; do not write either store directly from here.
    // (An older comment here claimed cond.setValue(actor,"horny",n) "silently
    // does nothing". That is true of PF2e and FALSE of Daggerheart - measured
    // 18 Aug 2026 - and it is what made grantHorny write the wrong store on DH.)
    const horny = async (n = 1) => {
      try { await AFLP.gm.run("grantHorny", cummer, n); } catch (e) {}
    };
    const give = async (slug) => {
      try { if (!AFLP.cond.has(cummer, slug)) await AFLP.cond.apply(cummer, slug, 1); } catch (e) {}
    };
    // THE TWO PACKS NAME DIFFERENT PENALTIES FOR THE SAME SUBTYPE AND BOTH ARE
    // CANON. Measured in dh-test 18 Aug 2026: `clumsy` and `sickened` have NO
    // conditionSlug on Daggerheart and are in neither CONFIG.statusEffects nor
    // the HUD, so cond.apply wrote an invisible key into flags.world.aflpConditions
    // - no Stress moved, nothing rendered, and nothing ever read it back.
    //
    //   Ass (Electric)   PF2e "gains 1 Horny and becomes Clumsy 1"
    //                    DH   "marks a Horny token and marks a Stress"
    //   Ass (Venomous)   PF2e "becomes Sickened 1"
    //                    DH   "marks 2 Stress"
    //
    // STALE WHEN: either card's penalty is reworded, or Daggerheart registers a
    // clumsy/sickened equivalent. Check both cards, not just one.
    const _isDH  = AFLP.system?.id === "daggerheart";
    const stress = async (n) => { try { await AFLP.system?.markStress?.(cummer, n); } catch (e) {} };
    if (af["ass-honeyed"])   await horny(1);
    if (af["ass-electric"]) { await horny(1); if (_isDH) await stress(1); else await give("clumsy"); }
    if (af["ass-venomous"])  { if (_isDH) await stress(2); else await give("sickened"); }
    if (af["ass-pacifying"]) await give("toasted");
  },

  // `hole` matters: a vaginal finish must not train off a slick ASS the cock never
  // entered, and vice versa. Defaults to vaginal for any legacy caller.
  pussyTrainCoomer: async (cummer, pussyHaver, hole = "vaginal") => {
    if (!cummer || !pussyHaver) return;
    const FLAG = AFLP.FLAG_SCOPE;
    const gt = pussyHaver.getFlag(FLAG, "anatomyFeatures") ?? {};
    const pre = hole === "anal" ? "ass" : "pussy";
    const types = [];
    // Ass (Slick) and Ass (Milking) train exactly as their pussy twins do. The
    // once-per-partner guard below is keyed by TYPE, so a partner with both a
    // slick pussy and a slick ass still only trains the cummer once.
    if (gt[`${pre}-slick`])   types.push("slick");
    if (gt[`${pre}-milking`]) types.push("milking");
    if (!types.length) return;
    const live = cummer.getWorldActor?.() ?? cummer;
    const trained = foundry.utils.deepClone(live.getFlag(FLAG, "coomerTrainedBy") ?? {});
    const gainedFrom = [];
    for (const t of types) {
      const list = trained[t] ?? (trained[t] = []);
      if (!list.includes(pussyHaver.id)) { list.push(pussyHaver.id); gainedFrom.push(t); }
    }
    if (!gainedFrom.length) return; // already trained by this pussy - no infinite training
    await live.setFlag(FLAG, "coomerTrainedBy", trained);

    const slickGains   = gainedFrom.filter(t => t === "slick").length;
    const milkingGains = gainedFrom.filter(t => t === "milking").length;

    // Slick -> permanent +1 Loads each.
    let newLevel = null;
    if (slickGains) {
      const coomer   = live.getFlag(FLAG, "coomer") ?? { level: AFLP.COOMER_DEFAULT };
      const oldLevel = coomer.level ?? AFLP.COOMER_DEFAULT;
      newLevel = oldLevel + slickGains; // uncapped; soft limits come from gear/feats
      await live.setFlag(FLAG, "coomer", { level: newLevel });
    }

    // Milking -> permanent +1 Cum Shot each (the manual cumShotBonus world flag,
    // which AFLP.cumPerShot reads live alongside any worn Cum Shot gear).
    let newShotBonus = null;
    if (milkingGains) {
      const oldBonus = Number(live.getFlag(FLAG, "cumShotBonus")) || 0;
      newShotBonus = oldBonus + milkingGains;
      await live.setFlag(FLAG, "cumShotBonus", newShotBonus);
    }

    // Recompute the load pool from the (possibly new) Loads x per-shot Cum, and
    // grant a fresh load on top of whatever is left.
    {
      const perShot = AFLP.cumPerShot(live);
      const loads   = (live.getFlag(FLAG, "coomer")?.level) ?? AFLP.COOMER_DEFAULT;
      const newMax  = perShot * loads;
      const cumNow  = live.getFlag(FLAG, "cum");
      await live.setFlag(FLAG, "cum", { current: Math.min((cumNow?.current ?? newMax) + perShot, newMax), max: newMax });
    }

    // Build a chat card describing exactly what was trained.
    const parts = [];
    if (slickGains)   parts.push(`<strong>Loads +${slickGains}</strong>${newLevel != null ? ` (now Loads ${newLevel})` : ""}`);
    if (milkingGains) parts.push(`<strong>Cum Shot +${milkingGains}</strong>${newShotBonus != null ? ` (now +${newShotBonus})` : ""}`);
    const lbl  = gainedFrom.map(t => t === "slick" ? "Slick" : "Milking").join(" and ");
    const gains = parts.join(" and ");
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${live.name}</strong> spends inside <strong>${pussyHaver.name}</strong>'s ${lbl} pussy for the first time and is trained by it - they gain ${gains} and will cum harder from here on.</p></div>`,
      speaker: { alias: "AFLR" },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Module-aware macro resolution
// ---------------------------------------------------------------------------
// Module code that fires a user macro (auto-cum, in-card SA, DH long-rest
// daily prep) must never depend on which module's world macros happen to be
// imported. A world with a stale stub imported from the SIBLING module (e.g.
// an old "AFLP Cum" whose body targets ardisfoxxs-lewd-pf2e.aflp-lewd-macros
// in an AFLR world) would otherwise be picked by a bare name match and fail
// with "Compendium ... not found".
//
// Resolution order:
//   1. A world macro matching one of the given names, in priority order,
//      PROVIDED every "<module>.<pack>" compendium reference in its body
//      resolves in this world (skips stale sibling-module stubs while still
//      honouring user-customised copies).
//   2. The engine macro straight from this module's own compendium - no
//      world import required. Ownership is cloned to OWNER when needed so
//      players routed through GM-side execution can still run it.
// Returns a Macro document (or an executable ephemeral clone), or null.
// ═══════════════════════════════════════════════════════════════════════════
AFLP._macroRefsResolve = function (command) {
  if (!command) return true;
  // Match compendium ids of either build: "<ardisfoxx module>.<aflr/aflp pack>".
  const re = /ardisfoxxs-lewd-[a-z0-9]+\.afl[pr]-[a-z0-9-]+/g;
  for (const ref of new Set(command.match(re) ?? [])) {
    if (!game.packs.get(ref)) {
      console.warn(`AFLP | macro references missing compendium "${ref}"`);
      return false;
    }
  }
  return true;
};

// ─────────────────────────────────────────────────────────────────────────────
// EVERY CONDITION MUTATION IS SERIALISED PER ACTOR.
//
// MEASURED 23 Aug 2026 in `pf2e-dev`, with no living gear and no AFLR feature in
// the path - just the condition API, twice, on one actor:
//
//     sequential   cond.raiseTo(a,"bimbofied",1) x2   ->  1 item
//     CONCURRENT   the same two calls in a Promise.all ->  2 items
//     then         cond.remove(a,"bimbofied") x1       ->  1 item LEFT, value STILL 1
//
// `apply` and `raiseTo` are read-modify-write: "is it there? no -> create it".
// Two overlapping calls both read absent and both create, and `remove` deleting
// one instance then leaves the condition standing. That is what made the living
// gear suite fail intermittently - `AFLP_LivingGear.sync` runs from more than one
// item hook, so two grant passes can overlap on the same actor.
//
// THIS IS THE THIRD FACE OF ONE BUG. `bumpLifetime` lost whole updates and
// `AFLP_Arousal.increment` lost concurrent Arousal the same morning, both from
// unserialised read-modify-write on one actor. Here it duplicates instead of
// losing, which is why it looked like a different problem.
//
// WHY A DECORATOR RATHER THAN FIVE EDITED BODIES: this changes WHEN a write runs
// and nothing about WHERE it goes. Every store keeps its own path - Foundry-native
// statuses, condition ITEMS, the `aflpConditions` flag bag and the dual-store
// doors are all reached by exactly the code that reached them before. Ardis,
// 23 Aug 2026: "we do use both foundry native effect conditions and flag based
// effect conditions where its useful to have one or the other or both... don't
// break anything that works." A queue cannot break a store it never inspects.
//
// The chain lives on the client that actually WRITES: a caller who fails
// `canWrite` is passed straight through, so its own method forwards to the GM and
// the GM's copy of this wrapper serialises it there. Serialising the caller would
// queue socket calls behind each other and fix nothing.
//
// SERIALISING THE LEAVES ALONE WAS NOT ENOUGH, AND THE SECOND MEASUREMENT IS WHY
// THE COMPOSITIONS ARE WRAPPED TOO. With only the leaves queued, re-measured the
// same day:
//
//     CONCURRENT   cond.raiseTo(a,"bimbofied",1) x2   ->  1 item, VALUE 2
//
// One item - the duplicate is gone - but the wrong value. `raiseTo` is itself a
// read-modify-write: it reads `value()` and then decides between `apply` (which
// INCREMENTS) and `setValue`. Both calls read absent, both chose `apply(+1)`, and
// the queue faithfully ran both. Serialising the writes fixed the store and left
// the DECISION racing. A read-modify-write is only safe when the read is inside
// the same slot as the write.
//
// THE OBVIOUS WRAPPING DEADLOCKS, so it is not what is written below. If a
// composition took the actor's slot and then called the WRAPPED `apply`, that
// inner call would queue behind the slot its own caller is holding and neither
// would ever finish. The fix is a `this` swap, not a re-entrancy flag: a
// composition running inside the chain is handed `_rawView`, whose `apply`,
// `remove` and `setValue` are the UNWRAPPED originals, so its inner writes run
// directly in the slot it already owns. Everything else it touches - `value`,
// `_emit` - still resolves through the prototype to the live `AFLP.cond`.
//
// A re-entrancy flag was rejected deliberately: a flag says "some composition
// holds this actor" and cannot tell an inner call apart from an UNRELATED leaf
// call arriving from elsewhere while the slot is held, so it would wave that one
// past the queue and reopen the race this exists to close. The `this` swap can
// only ever be seen by the composition it was passed to.
//
// The !canWrite branch is deliberately NOT given `_rawView`: a caller who cannot
// write needs the wrapped leaves, because the proxy leg that forwards to the GM
// lives inside them.
//
// GOES STALE IF: a fourth LEAF writer is added to `AFLP.cond` - it must be named
// in `_LEAVES`, or it races everything that is - or if a new COMPOSITION is added
// (`setTracked` is the one that exists and is left unwrapped on purpose: its
// adapter-setter leg is an exact set, not a read-modify-write, and its `setExact`
// leg is serialised underneath it) - or if `raiseTo`/`setExact` stop being pure
// compositions and start writing a store directly, at which point they belong in
// `_LEAVES` instead.
AFLP._condChains = AFLP._condChains ?? new Map();
AFLP.cond._serial = function (actor, fn) {
  const id = actor?.id ?? "_noactor";
  const prev = AFLP._condChains.get(id) ?? Promise.resolve();
  // `then(fn, fn)` on BOTH arms: one caller's rejection must not cancel the work
  // of everyone queued behind it.
  const next = prev.then(fn, fn);
  AFLP._condChains.set(id, next);
  // Bookkeeping only - the caller still gets `next` and still sees a rejection.
  next.catch(() => {}).finally(() => {
    if (AFLP._condChains.get(id) === next) AFLP._condChains.delete(id);
  });
  return next;
};
AFLP.cond._LEAVES = ["apply", "remove", "setValue"];

// ── THE ONE LEAF THAT IS NOT A LEAF, AND IT DEADLOCKED DAGGERHEART ────────────
//
// `remove` on a DUAL-STORE key is not a leaf at all: it delegates to
// `AFLP.horny.clearTemp` / `AFLP.denied.settleTo`, which reach `_setTotal`, which
// on DAGGERHEART reaches `AFLP.cond.setValue` - a wrapped leaf. So the outer
// `remove` took the actor's slot and its own inner write queued behind it, and
// neither ever finished.
//
// MEASURED IN `dh-test` 27 Aug 2026, on a real character rig:
//
//     cond.setValue(a,"horny",2)   RESOLVED, total 2
//     cond.raiseTo(a,"horny",3)    RESOLVED, total 3
//     cond.remove(a,"horny")       HUNG
//     AFLP.horny.clearTemp(a)      HUNG
//     cond.remove(a,"denied")      HUNG
//
// PATHFINDER NEVER SAW IT: there `_door` is non-null, so `_setTotal` writes the
// legacy flag bag directly and never re-enters `AFLP.cond`. The deadlock needs a
// system where the door's store IS the condition, which is Daggerheart only - and
// the DH suite had not been run since 23 Aug, three days before the chain shipped.
//
// **`remove`'s own comment predicted this and named the exact trigger:** *"Safe
// from the recursion `_door` exists to prevent: clearTemp/settleTo go to
// `_setTotal`, which reaches `cond.setValue` on DH - and setValue IS still
// `_door`-gated, so it falls through to the adapter and terminates. GOES STALE IF:
// setValue's gate changes."* Wrapping setValue in a queue changed what setValue
// does on arrival, which is that clause in everything but wording. **The stale-if
// was written down and I still walked into it, because I read it as being about
// the `_door` GATE rather than about setValue being re-entrant.**
//
// THE FIX IS THE NARROWEST ONE THAT HOLDS: `remove` on a `_DUAL` key runs
// UNSERIALISED, exactly as it did before 26 Aug. It is the only leaf that
// re-enters `AFLP.cond`, checked rather than assumed - `apply` and `setValue` both
// ask `_door`, and on either answer they write a store directly and stop. The
// inner `setValue` is still serialised, so the write that actually lands is still
// queued; what is no longer queued is the delegating shell around it.
//
// GOES STALE IF: `apply` or `setValue` gain a branch that calls back into
// `AFLP.cond`, or a third key joins `_DUAL`, or the doors stop routing through
// `_setTotal`. The test for it is cheap and belongs in the suite: call every leaf
// on a dual key, on Daggerheart, and race a deadline.
const _reentersCond = (method, slug) =>
  method === "remove" && (AFLP.cond._DUAL ?? []).includes(slug);

// `this` for a composition that already owns the actor's slot: the raw leaves,
// with everything else inherited from the live AFLP.cond.
const _rawView = Object.create(AFLP.cond);
for (const _m of AFLP.cond._LEAVES) {
  const _real = AFLP.cond[_m];
  if (typeof _real !== "function") { console.warn(`AFLP | cond.${_m} is not a function - not serialised`); continue; }
  _rawView[_m] = _real;
  AFLP.cond[_m] = function (actor, ...rest) {
    // No actor, or this client cannot write: unchanged path. The proxy leg inside
    // the real method does the forwarding, and the GM serialises on arrival.
    if (!actor || !AFLP.gm?.canWrite?.(actor)) return _real.call(this, actor, ...rest);
    // The delegating shell described above - queueing it deadlocks.
    if (_reentersCond(_m, rest[0])) return _real.call(this, actor, ...rest);
    return AFLP.cond._serial(actor, () => _real.call(this, actor, ...rest));
  };
}
// The compositions: the whole read-decide-write runs in ONE slot, and its inner
// writes go to the raw leaves so they do not queue behind their own caller.
AFLP.cond._COMPOSITIONS = ["raiseTo", "setExact"];
for (const _m of AFLP.cond._COMPOSITIONS) {
  const _real = AFLP.cond[_m];
  if (typeof _real !== "function") { console.warn(`AFLP | cond.${_m} is not a function - not serialised`); continue; }
  AFLP.cond[_m] = function (actor, ...rest) {
    if (!actor || !AFLP.gm?.canWrite?.(actor)) return _real.call(this, actor, ...rest);
    return AFLP.cond._serial(actor, () => _real.call(_rawView, actor, ...rest));
  };
}

// Ops the GM performs on a player's behalf. Registered here because these are
// the writes players trigger against actors they do not own.
AFLP.gm.register("ensureCoreFlags", (a) => AFLP.ensureCoreFlags(a));
AFLP.gm.register("condApply",      (a, slug, value, tokenId) => AFLP.cond.apply(a, slug, value, tokenId));
AFLP.gm.register("condRemove",     (a, slug, tokenId) => AFLP.cond.remove(a, slug, tokenId));
AFLP.gm.register("condSetValue",   (a, slug, value, tokenId) => AFLP.cond.setValue(a, slug, value, tokenId));
AFLP.gm.register("condRefresh",    (a, slug, tokenId) => AFLP.cond.refresh(a, slug, tokenId));
// Generic actor writes a player may need to make against a monster.
AFLP.gm.register("createItem", (a, data) => a.createEmbeddedDocuments("Item", [data]));
// Item edits by ID rather than by document, because a document does not cross the
// socket - only the actor's uuid does, and the GM re-resolves the item from it.
AFLP.gm.register("updateItem",  (a, itemId, data) => a.items.get(itemId)?.update(data) ?? null);
// The system's OWN condition (PF2e off-guard, DH restrained), as opposed to an
// AFLR one. `AFLP.system.applyNativeCondition` swallows its own errors, so a
// player calling it on a monster failed silently rather than loudly - which is
// how the Aphrodisiac Junkie L7 stun went unreported.
AFLP.gm.register("nativeCondition", (a, slug, value = null, tokenId = null) =>
  AFLP.system.applyNativeCondition(a, slug, value, tokenId));
AFLP.gm.register("deleteItems", (a, ids, opts = {}) =>
  a.deleteEmbeddedDocuments("Item", (ids ?? []).filter(id => a.items.has(id)), opts));
// The two cumflation write choke points. Registered as ops rather than proxied at
// each of their twelve internal writes: everything downstream of these two
// (_applyInflationPenalty, _applyFacialVision, _applySlick) is pure data work with
// no dialogs, so handing the whole call to the GM costs the player nothing on
// screen. `applyCumflation` itself is NOT here - it mutates its arguments in
// place, and an in-place mutation does not survive the wire.
AFLP.gm.register("saveCumflation",   (a, cf, ovf) => AFLP_Cumflation.saveCumflation(a, cf, ovf));
AFLP.gm.register("cumflationEffects", (a) => AFLP_Cumflation.applyCumflationEffects(a));
AFLP.gm.register("setFlag",    (a, path, value) => a.setFlag(AFLP.FLAG_SCOPE, path, value));
AFLP.gm.register("healActor",  (a, amount) => AFLP.system.healActor(a, amount));
// Arousal set through the ADAPTER, signature preserved (value AND max), because
// aflp-carnal.js's resist maths computes its own max and AFLP_Arousal.set does
// not take one. The adapter layer sits BELOW the permission proxy and has no
// gating of its own - that is correct for a layer the proxy calls, and a bug
// every time something calls it directly. This op is how the carnal layer
// reaches it from a player's client.
AFLP.gm.register("setArousal", (a, value, max) => AFLP.system.setArousalCurrent(a, value, max));
// BANK A FEAR FOR THE GM. A WORLD op: it takes no actor, and it exists because the
// GM's Fear pool is a world SETTING, which a player client cannot write.
//
// MEASURED 21 Aug 2026 across two real clients, Carnal Escape with a Fear result:
// from the GM seat the pool went 0 -> 1; from the player seat it went 0 -> 0,
// three times, while the card announced "the GM gains a Fear". `_markHopeOrFear`
// was gated `if (game.user?.isGM)` and returned `{fear: "+1"}` otherwise - a
// return value that said it had happened.
//
// The Daggerheart system CLAMPS this pool at 12, asynchronously, so writing 13
// lands as 12. That is correct at the table (a Fear result at a full pool is a
// no-op by the rules) and is why nothing here tries to detect a refusal.
AFLP.gm.register("bankFear", async (_a, n = 1) => {
  if (game.system?.id !== "daggerheart") return null;
  try {
    const cur = Number(game.settings.get("daggerheart", "ResourcesFear") ?? 0);
    const next = cur + (Number(n) || 1);
    await game.settings.set("daggerheart", "ResourcesFear", next);
    return next;
  } catch (e) { console.warn("AFLP | bankFear failed", e); return null; }
});
AFLP.gm.register("updateActor",    (a, data) => a.update(data));
AFLP.gm.register("updateTokenDoc", (t, data) => t.update(data));
AFLP.gm.register("bumpMindLadder", (a, key) => AFLP.bumpMindLadder(a, key));
AFLP.gm.register("bumpLifetime",   (a, key, amount = 1) => AFLP.bumpLifetime(a, key, amount));
// Horny has TWO STORES and which one is authoritative depends on the system.
// PF2e and 5e keep a { temp, permanent } world flag whose SUM the arousal bonus
// reads. Daggerheart keeps a VALUED CONDITION in flags.world.aflpConditions, and
// AFLP.cond.value reads it back - measured in dh-test 18 Aug 2026, where the two
// stores proved fully independent: write one and the other still reads 0.
//
// The comment that used to sit here said cond.value "always reads 0. This is the
// correct read." That was true when Horny was flag-only and became false when
// Daggerheart made it a condition, and nobody re-measured - which is how every
// grantHorny caller on DH (the cum coat, tits-honeyed, tits-electric,
// ass-honeyed, ass-electric) came to grant Horny into a bag no DH reader looks at.
AFLP.hornyTotal = (actor) => {
  if (AFLP.system?.id === "daggerheart") return Number(AFLP.cond?.value?.(actor, "horny")) || 0;
  const h = actor?.getFlag?.(AFLP.FLAG_SCOPE, "horny") ?? {};
  return (Number(h.temp) || 0) + (Number(h.permanent) || 0);
};

// ===============================
// HORNY - one door, because there are TWO STORES and they do not talk
// ===============================
// Measured 19 Aug 2026 in `dh-test`: `horny` reports `independent: true` from the
// facts probe, and on a live rig a hand-rolled `setFlag(FLAG,"horny",{temp:2})`
// left `AFLP.hornyTotal` reading **0**. Daggerheart's total lives in the valued
// CONDITION; Pathfinder's lives in the legacy `{temp, permanent}` flag. Eight
// shipped sites hand-rolled that flag with no system branch, so on Daggerheart
// every one of them granted nothing at all.
//
// So: nothing writes the bag by hand any more. Everything goes through here, and
// the per-system branch lives in ONE place.
//
// THE PERMANENT BUCKET IS A FLOOR THAT SURVIVES A REST, and it is SOURCED.
// Ardis, 19 Aug 2026: "certain effects give floors like 'your horny can't be
// reduced below 1' and some grant horny when certain items are equipped such as
// bondage on a bondage princess, which persists as 'permanent' and doesn't get
// cleared on rest." A single number could not do that: Bondage Princess is a
// WHILE clause ("While affected by a Bondage or restraining Carnal effect, gain
// a Horny token") that has to come back off when the rope does, and Aphrodisiac
// Junkie Mastery's permanent 3 must not be clobbered by it. `sources` keys each
// floor by who granted it and `permanent` is the max of them, capped.
//
// `permanent` is still written as a plain number so every existing reader -
// AFLP.hornyTotal on PF2e, the sheet tab, daily prep - keeps working unchanged.
// GOES STALE IF: Daggerheart gains a second Horny store, or a card states that
// two floors should SUM rather than take the higher.
AFLP.horny = {
  _bag(actor) {
    return foundry.utils.duplicate(actor?.getFlag?.(AFLP.FLAG_SCOPE, "horny") ?? AFLP.hornyDefaults);
  },
  async _writeBag(actor, bag) {
    if (AFLP.gm.canWrite(actor)) await actor.setFlag(AFLP.FLAG_SCOPE, "horny", bag);
    else await AFLP.gm.run("setFlag", actor, "horny", bag);
  },
  // The current total, whichever store this system keeps it in.
  total(actor) { return AFLP.hornyTotal(actor); },
  // The rest-proof floor.
  permanent(actor) { return Number(this._bag(actor).permanent) || 0; },

  // Set the total, per system. Everything below routes through this one write.
  async _setTotal(actor, next) {
    const want = AFLP.capCondition("horny", Math.max(0, Number(next) || 0));
    if (AFLP.system?.id === "daggerheart") {
      const cur = Number(AFLP.cond?.value?.(actor, "horny")) || 0;
      if (want !== cur) await AFLP.cond.setValue(actor, "horny", want);
      return want;
    }
    const bag = this._bag(actor);
    const perm = Number(bag.permanent) || 0;
    const temp = Math.max(0, want - perm);
    if (temp !== (Number(bag.temp) || 0)) { bag.temp = temp; await this._writeBag(actor, bag); }
    return want;
  },

  // "+N Horny." The common case.
  async add(actor, n = 1) { return this._setTotal(actor, this.total(actor) + (Number(n) || 0)); },

  // "Horny N minimum" / "cannot be reduced below N". Never lowers.
  async raiseTo(actor, n) {
    const cur = this.total(actor);
    const want = Number(n) || 0;
    return want <= cur ? cur : this._setTotal(actor, want);
  },

  // A floor from a NAMED source, surviving rest. Pass 0 to withdraw that source -
  // which is what "while affected by a Bondage effect" needs when the gear comes
  // off. Withdrawing lowers the total by what it granted, never below the floor
  // the remaining sources still justify.
  async setSustained(actor, sourceId, n = 1) {
    if (!actor || !sourceId) return 0;
    const bag = this._bag(actor);
    const oldPerm = Number(bag.permanent) || 0;
    const totalBefore = this.total(actor);
    // WITHDRAWN SOURCES ARE SET TO 0, NOT DELETED. `setFlag` goes through
    // `update()`, which MERGES an object value - so `delete bag.sources[id]`
    // wrote a bag the merge then filled back in from what was already stored,
    // and a floor could never be withdrawn. Caught by the harness on 19 Aug 2026:
    // withdrawing the last floor left permanent at 3. Zero merges cleanly.
    bag.sources = { ...(bag.sources ?? {}) };
    bag.sources[sourceId] = Math.max(0, Number(n) || 0);
    const vals = Object.values(bag.sources).map(Number).filter(v => Number.isFinite(v) && v > 0);
    const newPerm = AFLP.capCondition("horny", vals.length ? Math.max(...vals) : 0);
    bag.permanent = newPerm;
    await this._writeBag(actor, bag);
    const drop = Math.max(0, oldPerm - newPerm);
    await this._setTotal(actor, Math.max(newPerm, totalBefore - drop));
    return newPerm;
  },

  // A rest clears the temporary part and leaves the floor standing.
  async clearTemp(actor) { return this._setTotal(actor, this.permanent(actor)); },
};

// ===============================
// DENIED - the same split as Horny, and worse: its READERS disagree too
// ===============================
// Measured 19 Aug 2026 in `pf2e-dev`, on one actor:
//
//   after a LEGACY write (Edge Master)   legacyFlag 2   condition 0
//   after a CONDITION apply (chastity)   legacyFlag 0   condition 3
//
// and for that caged actor the H-Scene badge and the sheet tab read **Denied 0**
// while the status panel showed the icon. So this is not only a Daggerheart
// problem the way Horny was - **it is visibly wrong on Pathfinder**, in both
// directions:
//
//   WRITERS: Edge Master and the sheet's manual editor wrote the legacy flag;
//            living gear's chastity harnesses applied the CONDITION.
//   READERS: the H-Scene badge (aflp-hscene.js), the sheet tab and daily prep
//            read the flag; the status panel, rest and living gear read the
//            condition.
//
// One door, same as AFLP.horny, and the same sourced floor - the harnesses say
// "You gain the Denied condition at 3 WHILE IT IS WORN", which is a floor that
// has to survive a rest and come off with the gear, not a one-off grant.
// `value` stays the total on the legacy systems so every existing reader keeps
// working unchanged.
// GOES STALE IF: Daggerheart stops keeping Denied in the valued condition.
AFLP.denied = {
  _bag(actor) {
    return foundry.utils.duplicate(actor?.getFlag?.(AFLP.FLAG_SCOPE, "denied") ?? AFLP.deniedDefaults);
  },
  async _writeBag(actor, bag) {
    if (AFLP.gm.canWrite(actor)) await actor.setFlag(AFLP.FLAG_SCOPE, "denied", bag);
    else await AFLP.gm.run("setFlag", actor, "denied", bag);
  },
  // The per-ACTOR ceiling: Edge Master Greater raises Denied to 4 on Daggerheart,
  // so this is not AFLP.capCondition alone. Falls back to the shared cap when the
  // kink layer has not loaded.
  cap(actor) {
    const k = AFLP.Kinks?._deniedCap?.(actor);
    return Number.isFinite(k) ? k : AFLP.capCondition("denied", 99);
  },
  total(actor) {
    if (AFLP.system?.id === "daggerheart") return Number(AFLP.cond?.value?.(actor, "denied")) || 0;
    return Number(this._bag(actor).value) || 0;
  },
  permanent(actor) { return Number(this._bag(actor).permanent) || 0; },

  async _setTotal(actor, next) {
    const want = Math.max(0, Math.min(this.cap(actor), Number(next) || 0));
    if (AFLP.system?.id === "daggerheart") {
      const cur = Number(AFLP.cond?.value?.(actor, "denied")) || 0;
      if (want !== cur) await AFLP.cond.setValue(actor, "denied", want);
      return want;
    }
    const bag = this._bag(actor);
    if (want !== (Number(bag.value) || 0)) { bag.value = want; await this._writeBag(actor, bag); }
    return want;
  },

  async add(actor, n = 1)   { return this._setTotal(actor, this.total(actor) + (Number(n) || 0)); },
  async setExact(actor, n)  { return this._setTotal(actor, n); },
  async raiseTo(actor, n) {
    const cur = this.total(actor);
    const want = Number(n) || 0;
    return want <= cur ? cur : this._setTotal(actor, want);
  },

  // See AFLP.horny.setSustained - withdrawn sources are set to 0 rather than
  // deleted, because setFlag goes through update() and update() MERGES.
  async setSustained(actor, sourceId, n = 1) {
    if (!actor || !sourceId) return 0;
    const bag = this._bag(actor);
    const oldPerm = Number(bag.permanent) || 0;
    const totalBefore = this.total(actor);
    bag.sources = { ...(bag.sources ?? {}) };
    bag.sources[sourceId] = Math.max(0, Number(n) || 0);
    const vals = Object.values(bag.sources).map(Number).filter(v => Number.isFinite(v) && v > 0);
    const newPerm = Math.min(this.cap(actor), vals.length ? Math.max(...vals) : 0);
    bag.permanent = newPerm;
    await this._writeBag(actor, bag);
    const drop = Math.max(0, oldPerm - newPerm);
    await this._setTotal(actor, Math.max(newPerm, totalBefore - drop));
    return newPerm;
  },

  // A rest settles Denied AT the floor, in BOTH directions - clearing down to it
  // is the rest rule, and topping UP to it is what actually delivers the Creature
  // Fetish kink's two tokens, which nothing else in the module marks.
  // `extraFloor` carries a floor computed from something other than a sustained
  // source, which is how the rest handler passes the kink's.
  async settleTo(actor, extraFloor = 0) {
    const floor = Math.max(this.permanent(actor), Number(extraFloor) || 0);
    return this._setTotal(actor, floor);
  },
};

// Kept as the registered name because callers use it; the per-system branch and
// the cap now live once, in AFLP.horny.
AFLP.gm.register("grantHorny", async (a, amount = 1) => AFLP.horny.add(a, amount));

AFLP.getModuleMacro = async function ({ world = [], engine = null } = {}) {
  // 1) world macros, current-module names first. Duplicate names are all
  // considered so one stale copy cannot shadow a good one.
  for (const n of world) {
    const matches = game.macros.filter(mm => mm.name === n || mm.slug === n);
    for (const m of matches) {
      if (AFLP._macroRefsResolve(m.command)) return m;
      console.warn(`AFLP | world macro "${m.name}" is stale (wrong-module compendium refs) - skipped.`);
    }
  }
  // 2) this module's own engine macro compendium.
  if (engine) {
    try {
      const pack = game.packs.get(AFLP.ENGINE_MACRO_PACK);
      const entry = pack?.index?.find(e => e.name === engine);
      let macro = entry ? await pack.getDocument(entry._id) : null;
      if (macro && !macro.canExecute) {
        macro = new macro.constructor(foundry.utils.mergeObject(
          macro.toObject(),
          { "-=_id": null, "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
          { performDeletions: true, inplace: true },
        ));
      }
      if (macro) return macro;
    } catch (e) {
      console.warn("AFLP | engine macro lookup failed:", e?.message);
    }
  }
  return null;
};

// ═══════════════════════════════════════════════════════════════════════════
// Condition change feed - the three storage feeders behind AFLP.cond.onChange
// ═══════════════════════════════════════════════════════════════════════════
// Built 8 August 2026. Before this, AFLP.cond.onChange was documented in the
// project instructions and in three harness tests and existed nowhere; the
// Lovense condition feed was written against the createItem hook instead and
// was dead on Daggerheart from the day it shipped.
//
// Each feeder answers one storage question, and each carries a trap that a
// hand-written listener gets wrong. That is why this is one function and not
// three call sites.
(() => {
  // Is this key AFLR's own condition, as opposed to a native system status?
  //
  // Two questions, because the registry is not the whole answer. AFLP.conditions
  // entries carry a canonical PF2e uuid, so a Daggerheart-only condition (Hooked,
  // Lustful) has no entry at all - it exists only as a flag key and a HUD status
  // the adapter registers. ownsStatus() is what the adapter answers for those.
  const isOurs = (key) => !!AFLP.conditions?.[key] || !!AFLP.system?.ownsStatus?.(key);

  // ── 1. The flag bag: flags.world.aflpConditions ──────────────────────────
  //
  // Two traps, both measured on v14:
  //
  // A removal does not look like a removal. preUpdateActor sees
  // `{"-=exposed": null}`, but by updateActor Foundry has normalised it to
  // `{exposed: {__$OPERATOR$__: "ForcedDeletion"}}` - a TRUTHY OBJECT. Any
  // `if (diff[key])` reads a clear as an application. So the diff is never
  // parsed for values: the bag is snapshotted before, and the new value is read
  // off the actor after.
  //
  // Sibling flag writes (exposedVulnerable, entrancedBy) arrive with
  // `flags.world` present and no aflpConditions inside it. Guard on the KEY, not
  // the scope, or every unrelated flag write costs a full bag diff.
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    try {
      const w = foundry.utils.getProperty(changes, `flags.${AFLP.FLAG_SCOPE}`);
      if (!w || !("aflpConditions" in w)) return;
      options.aflrCondsBefore = foundry.utils.deepClone(actor.getFlag(AFLP.FLAG_SCOPE, "aflpConditions") ?? {});
    } catch (e) { /* never break another listener's update */ }
  });
  Hooks.on("updateActor", (actor, changes, options) => {
    try {
      const before = options?.aflrCondsBefore;
      if (!before) return;
      const after = actor.getFlag(AFLP.FLAG_SCOPE, "aflpConditions") ?? {};
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        AFLP.cond._emit(actor, key, Number(before[key]) || 0, Number(after[key]) || 0, "flag");
      }
    } catch (e) { /* never break another listener's update */ }
  });

  // ── 1b. The DUAL-STORE bags: flags.world.horny and flags.world.denied ────
  //
  // These two do not live in `aflpConditions` on Pathfinder or 5e - they have
  // their own bags, `{temp, permanent, sources}` and `{value, permanent,
  // sources}`, and feeder 1 above never looked at them. It did not have to,
  // because until 19 Aug 2026 `cond.apply(actor,"horny",n)` on Pathfinder made an
  // ITEM and feeder 2 below caught that. Routing those two keys to the door
  // removed the item and, with it, the only feeder that fired: onChange went
  // silent for Horny and Denied, and the Lovense toy feed - which subscribes to
  // it - stopped emitting. Caught by the harness in pf2e-dev the same day, two
  // FAILs, before any of it shipped.
  //
  // Gated on `_door` so this stays quiet on Daggerheart, where these keys ARE in
  // `aflpConditions` and feeder 1 already reports them - otherwise every DH
  // transition would raise two events, which is the exact thing the
  // "one event per transition" test exists to catch.
  //
  // The value is read off the ACTOR before and after rather than out of the
  // diff, for the same reason feeder 1 does it: a `{temp, permanent}` bag's
  // total is a sum, and the diff carries whichever half moved.
  // WHAT MAKES THIS STALE: a third dual-store key (add it to cond._DUAL and this
  // follows), or Pathfinder moving these into aflpConditions - then feeder 1
  // covers them and `_door` returns null, so this goes quiet on its own.
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    try {
      const w = foundry.utils.getProperty(changes, `flags.${AFLP.FLAG_SCOPE}`);
      if (!w) return;
      const before = {};
      for (const key of (AFLP.cond?._DUAL ?? [])) {
        if (!(key in w)) continue;
        if (!AFLP.cond._door(key)) continue;      // the condition bag owns it here
        before[key] = Number(AFLP.cond.value(actor, key)) || 0;
      }
      if (Object.keys(before).length) options.aflrDualBefore = before;
    } catch (e) { /* never break another listener's update */ }
  });
  Hooks.on("updateActor", (actor, changes, options) => {
    try {
      const before = options?.aflrDualBefore;
      if (!before) return;
      for (const [key, prev] of Object.entries(before)) {
        AFLP.cond._emit(actor, key, prev, Number(AFLP.cond.value(actor, key)) || 0, "flag");
      }
    } catch (e) { /* never break another listener's update */ }
  });

  // ── 2. PF2e condition and effect ITEMS ───────────────────────────────────
  //
  // Only AFLR's own; PF2e's native conditions (off-guard, frightened, clumsy)
  // are the system's business and would swamp every listener. The value lives on
  // the counter badge, and an update carries only the new one, so the old value
  // rides across on `options` exactly as the flag bag's does.
  const _itemKey = (item) => item?.slug ?? item?.system?.slug ?? null;
  const _itemVal = (item) => Number(item?.system?.badge?.value ?? item?.system?.value?.value ?? 1) || 1;
  const _itemOurs = (item) => {
    const key = _itemKey(item);
    return (item?.actor && key && isOurs(key)) ? key : null;
  };

  Hooks.on("createItem", (item) => {
    try { const key = _itemOurs(item); if (key) AFLP.cond._emit(item.actor, key, 0, _itemVal(item), "item"); }
    catch (e) { /* never break another listener */ }
  });
  Hooks.on("deleteItem", (item) => {
    try { const key = _itemOurs(item); if (key) AFLP.cond._emit(item.actor, key, _itemVal(item), 0, "item"); }
    catch (e) { /* never break another listener */ }
  });

  // Dragging an AFLR condition card onto an actor. See AFLP.importConditionItem
  // for why this cannot simply delete every condition item it sees.
  //
  // GM-ONLY and gated on automation: a player dragging a card onto their own
  // sheet should not silently rewrite state, and a table running AFLR manually
  // has said it does not want this.
  Hooks.on("createItem", async (item) => {
    if (!game.user?.isGM || !AFLP.Settings?.automation) return;
    try { await AFLP.importConditionItem(item); }
    catch (e) { console.warn("AFLP | condition import failed:", e?.message); }
  });

  // ...and the same gesture in reverse. Deleting an imported TIMED card - by
  // hand, or by Foundry expiring it - clears what it imported.
  //
  // It fires ONLY for a card this module marked on import, which is what keeps
  // it from clearing a condition every time AFLR removes an item of its own.
  Hooks.on("deleteItem", async (item) => {
    if (!game.user?.isGM) return;
    try {
      const key = item?.getFlag?.(AFLP.FLAG_SCOPE, "importedCondition");
      if (!key) return;
      const actor = AFLP.system.liveActor(item.parent);
      if (!actor) return;
      // Named explicitly, not `settleTo ?? clearTemp` - `await a ?? await b`
      // evaluates BOTH. AFLP.horny clears to its floor with clearTemp; AFLP.denied
      // settles to its floor with settleTo. Either way a sustained floor - a
      // harness still worn - is left standing.
      if (key === "horny")       await AFLP.horny.clearTemp(actor);
      else if (key === "denied") await AFLP.denied.settleTo(actor);
      else                       await AFLP.cond.remove(actor, key);
    } catch (e) { console.warn("AFLP | imported-condition cleanup failed:", e?.message); }
  });
  Hooks.on("preUpdateItem", (item, changes, options) => {
    try { if (_itemOurs(item)) options.aflrCondBefore = _itemVal(item); }
    catch (e) { /* never break another listener */ }
  });
  Hooks.on("updateItem", (item, changes, options) => {
    try {
      if (options?.aflrCondBefore === undefined) return;
      AFLP.cond._emit(item.actor, _itemKey(item), options.aflrCondBefore, _itemVal(item), "item");
    } catch (e) { /* never break another listener */ }
  });

  // ── 3. Native statuses ───────────────────────────────────────────────────
  //
  // THE TRAP: the Daggerheart status bridge double-fires. The adapter mirrors
  // every AFLR condition onto a HUD status, so one application produces a flag
  // write and then, IN A LATER TICK, a status toggle. A same-tick signature
  // guard does not catch that gap - the only thing that does is dropping keys
  // the module already reports through the flag bag. ownsStatus() is the
  // adapter's answer for exactly that, and it covers HUD-mirrored keys such as
  // `hooked` and `lustful` that carry no AFLP.conditions registry entry.
  //
  // What survives the filter is what this feeder is for: a genuinely native
  // status (Restrained, Vulnerable, Hidden, Off-Guard) applied by the system or
  // another module.
  const _statusFeed = (ae, on) => {
    try {
      const actor = ae?.parent;
      if (actor?.documentName !== "Actor") return;
      for (const s of (ae.statuses ?? [])) {
        if (isOurs(s)) continue;
        AFLP.cond._emit(actor, s, on ? 0 : 1, on ? 1 : 0, "status");
      }
    } catch (e) { /* never break another listener */ }
  };
  Hooks.on("createActiveEffect", (ae) => _statusFeed(ae, true));
  Hooks.on("deleteActiveEffect", (ae) => _statusFeed(ae, false));
})();
