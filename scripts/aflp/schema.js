// ===============================
// AFLP Shared Schema (schema.js)
// ===============================

if (!window.AFLP) window.AFLP = {};

AFLP.BASE_CUM_BY_SIZE = {
  tiny: 1,
  sm: 2,
  med: 2,
  lg: 40,
  huge: 800,
  grg: 1600
};

Object.assign(window.AFLP, {
  SCHEMA_VERSION: 2,
  FLAG_SCOPE: "world",

  // 1 unit = 250ml
  /** ml per cum unit — read from settings at runtime, falls back to 250 (fantasy) if settings not yet loaded */
  get CUM_UNIT_ML() { return AFLP.Settings?.cumUnitMl ?? 250; },

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
  coomerDefaults: { level: 0 },
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
    "monstrous-prowess": { name: "Monstrous Prowess", uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.0HV6GDwcBG8Yw1ZU" },
    "bimbo":             { name: "Bimbo",             uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.mTSsjimziKIcEbLO" },
    "gangslut":          { name: "Gangslut",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.fNSwvzZ3ddJmu7yG" },
    "voyeurism":         { name: "Voyeurism",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.NKiO32mIdFJZpwnb" },
    "ouroboros":         { name: "Ouroboros",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.QvwGGnxQotq1giao" },
    "stretch-king":      { name: "Stretch King",      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.2Kth26AcSdPDxkKa" },
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
    "exposed-nude":{ name: "Exposed (Nude)", uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.Y8wxUgOvsXaF2Mc4" },
    "horny":         { name: "Horny",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.hmYj3xU7xrdjMHpe" },
    "horny-always":  { name: "Horny (Permanent)", uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.RekITrc0sIsHFXvK" },
    "bimbofied":     { name: "Bimbofied",     uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.9ySsqXnpfZkhmp2V" },
    "mind-break":  { name: "Mind Break",  uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.B74Z3GBzgNMoVXr7" },
    "submitting":  { name: "Submitting",  uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.kBLJPOJNjz8fmxrQ" },
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
    cumSlutTotal: [
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.SCS8b1rPtr8iHZwV",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.QQRDqOzJq7PM59bw",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.dtUe8d0ROUEacRGE",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.dpymEL6QzRqN3LcJ",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.R8remTSWla3YR2Va",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.lr0gqv7s7b9iUIPJ",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.2tUflRcpwq1iWvE6",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.1g4jNQNGGcHhhWEn"
    ],
    "struggle-snuggle":          { name: "Struggle Snuggle",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.k7M7WiI0Kgyn0pFX" },
    "sexual-advance":            { name: "Sexual Advance",            uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.1Ty2edYgjwn7m6sh" },
    "cum":                       { name: "Cum",                       uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.N9U6snPV0DVE9L5H" },
    "edge":                      { name: "Edge",                      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.aPH8eJBtdByYpvSr" },
    "purge-cumflation":          { name: "Purge Cumflation",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.e6A4cyAOEK8z5Ugo" },
    "dubious-consent":           { name: "Dubious Consent",           uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.ziPugIato0JXzIzu" },
    "potion-of-breeding":        { name: "Potion of Breeding",        uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.WcVMt3xnu08Wq0RW" },
    "potion-of-breeding-effect": { name: "Effect: Potion of Breeding",uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.jQ3G8jwA2boYGVrr" },
    "birth-control":             { name: "Elixir of Birth Control",   uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.ZHMYtfYLHQI1hHnX" },
  },

  // ===============================
  // Kink Immunity Helpers
  // ===============================
  // Returns true if the actor has the Monstrous Prowess kink.
  actorHasMonstrousProwess(actor) {
    if (!actor) return false;
    const uuid = this.kinks["monstrous-prowess"].uuid;
    return actor.items?.some(i =>
      i.slug === "monstrous-prowess" || i.sourceId === uuid
    ) ?? false;
  },

  // Generic kink check helper — use instead of hardcoding slugs/UUIDs.
  // e.g. AFLP.actorHasKink(actor, "edge-master")
  actorHasKink(actor, slug) {
    if (!actor || !slug) return false;
    const uuid = this.kinks[slug]?.uuid;
    // Check 1: kink item present on the actor (e.g. dragged from compendium)
    const hasItem = actor.items?.some(i =>
      i.slug === slug || (uuid && (i.flags?.core?.sourceId ?? i.sourceId) === uuid)
    ) ?? false;
    if (hasItem) return true;
    // Check 2: kink toggled via AFLP tab (stored as world flag, no item required)
    const worldActor = actor.getWorldActor?.() ?? actor;
    return worldActor.getFlag(this.FLAG_SCOPE, "sexual")?.kinks?.[slug] === true;
  },

  // Returns the effective kink level for an actor, based on their character level.
  // Kinks unlock features at character levels 2, 3, 5, and 7 — not via badge values.
  // Returns 0 if the actor doesn't have the kink.
  // Returns the actor's character level (capped at the highest unlock tier, 7) if they do.
  getKinkLevel(actor, slug) {
    if (!actor || !slug) return 0;
    const uuid = this.kinks[slug]?.uuid;
    const hasItem = actor.items?.some(i =>
      i.slug === slug || (uuid && (i.flags?.core?.sourceId ?? i.sourceId) === uuid)
    ) ?? false;
    const worldActor = actor.getWorldActor?.() ?? actor;
    const hasFlag = worldActor.getFlag(this.FLAG_SCOPE, "sexual")?.kinks?.[slug] === true;
    if (!hasItem && !hasFlag) return 0;
    // Character level determines which kink feature tiers are unlocked
    // (Tiers: 1 = base, 2 = level 2+, 3 = level 3+, 5 = level 5+, 7 = level 7+)
    return actor.system?.details?.level?.value ?? actor.level ?? 1;
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
  //   positionTrait: which body-type trait unlocks this position,
  //   penile: true if only usable by a cock-bearing attacker (kept for backward compat)
  // }
  // positionTrait values: "biped" | "massive" | "quadruped" | "serpentine" |
  //                        "winged" | "tentacled" | "plant" | "incorporeal"
  // All humanoid (biped) positions are also accessible to massive creatures.
  // ===============================
  positions: [
    // ── LEGACY BARE IDs (no compendium item; kept for backward compat) ─────
    { id:"groping",     uuid:null, desc:"Roaming hands and wandering intent.",                                                          label:(p)=>`Hands All Over`,            logPhrase:(a,t,p)=>`${a} runs their hands over ${t}`,  hole:null,       positionTrait:"biped",  penile:false },
    { id:"fingering",   uuid:null, desc:"Fingers working inside, probing and exploring at a pace the bottom has no say in.",             label:(p)=>`Fingering ${p.object}`,     logPhrase:(a,t,p)=>`${a} fingers ${t}`,                hole:null,       positionTrait:"biped",  penile:false },
    { id:"licking",     uuid:null, desc:"Tongue against skin, finding every place worth lingering.",                                     label:(p)=>`Using Tongue`,              logPhrase:(a,t,p)=>`${a} teases ${t} with their tongue`, hole:null,     positionTrait:"biped",  penile:false },
    { id:"other",       uuid:null, desc:"Something between the two of them that doesn't fit neatly into a category.",                  label:(p)=>`Teasing`,                   logPhrase:(a,t,p)=>`${a} teases ${t}`,                 hole:null,       positionTrait:"biped",  penile:false },
    { id:"oral-give",   uuid:null, desc:"Top's mouth on the bottom. Deliberate, attentive, deeply unfair to whoever is receiving it.", label:(p)=>`Going Down`,                logPhrase:(a,t,p)=>`${a} goes down on ${t}`,           hole:"oral",     positionTrait:"biped",  penile:false },
    { id:"oral-receive",uuid:null, desc:"The bottom's mouth, put to use.",                                                              label:(p)=>`Using ${p.possessive} Mouth`, logPhrase:(a,t,p)=>`${a} uses ${t}'s mouth`,         hole:"oral",     positionTrait:"biped",  penile:true  },
    { id:"facial",      uuid:null, desc:"The top finishes on the bottom's face. Not accidental.",                                       label:(p)=>`Finishing on ${p.possessive} Face`, logPhrase:(a,t,p)=>`${a} finishes on ${t}'s face`, hole:"facial", positionTrait:"biped", penile:true },
    { id:"vaginal",     uuid:null, desc:"Direct, deep, and entirely to the point.",                                                      label:(p)=>`Inside ${p.object}`,        logPhrase:(a,t,p)=>`${a} pushes inside ${t}`,          hole:"vaginal",  positionTrait:"biped",  penile:true  },
    { id:"anal",        uuid:null, desc:"Taking the ass, which was not designed for this and is being very accommodating about it.",      label:(p)=>`Taking ${p.possessive} Ass`, logPhrase:(a,t,p)=>`${a} takes ${t} from behind`,     hole:"anal",     positionTrait:"biped",  penile:true  },
    { id:"riding-vaginal", uuid:null, desc:"The bottom straddles the top and rides, controlling every movement from above.",             label:(p)=>`Riding`,         logPhrase:(a,t,p)=>`${a} rides ${t}`,                  hole:"vaginal",  positionTrait:"biped",  penile:true  },
    { id:"riding-anal",    uuid:null, desc:"The bottom takes the top in the ass from above, setting the pace themselves.",               label:(p)=>`Riding (Anal)`,           logPhrase:(a,t,p)=>`${a} rides ${t}`,                  hole:"anal",     positionTrait:"biped",  penile:true  },

    // ── BIPED positions (humanoid, default pool) ───────────────────────────
    { id:"doggy-style-pussy",   uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.nPvToELRkqQNd3HI", desc:"The bottom is on all fours while the top mounts from behind, hands gripping their hips.", label:(p)=>`Doggy Style`,          logPhrase:(a,t,p)=>`${a} takes ${t} from behind in doggy style`,                    hole:"vaginal", positionTrait:"biped",  penile:true  },
    { id:"doggy-style-anal",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.VnbDYzaUG7eNsyKQ", desc:"The bottom on all fours, the top taking their ass from behind.", label:(p)=>`Doggy Style (Anal)`,    logPhrase:(a,t,p)=>`${a} takes ${t}'s ass from behind`,                            hole:"anal",    positionTrait:"biped",  penile:true  },
    { id:"missionary-pussy",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.b5BqG9axHRRH4bKP", desc:"Bottom on their back, top between their thighs, face to face.", label:(p)=>`Missionary`,            logPhrase:(a,t,p)=>`${a} presses ${t} down into missionary`,                       hole:"vaginal", positionTrait:"biped",  penile:true  },
    { id:"missionary-anal",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.pQqC03aAzZTHGZFr", desc:"Bottom on their back with legs raised, the top folding in from above.", label:(p)=>`Missionary (Anal)`,     logPhrase:(a,t,p)=>`${a} folds ${t}'s legs back for anal`,                         hole:"anal",    positionTrait:"biped",  penile:true  },
    { id:"cowgirl",             uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.GOZpXGvsmVTdHrjq", desc:"The bottom straddles the top facing them, setting the pace entirely on their own terms.", label:(p)=>`Cowgirl`,               logPhrase:(a,t,p)=>`${a} rides ${t} face-to-face`,                                 hole:"vaginal", positionTrait:"biped",  penile:true  },
    { id:"reverse-cowgirl",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.dv0mrNe317Hg5g5F", desc:"The bottom rides the top facing away.", label:(p)=>`Reverse Cowgirl`,       logPhrase:(a,t,p)=>`${a} rides ${t} facing away`,                                  hole:"vaginal", positionTrait:"biped",  penile:true  },
    { id:"cowboy-anal",         uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.eMwSuRCo2yNwM2jO", desc:"The bottom straddles the top facing toward them and takes it in the ass.", label:(p)=>`Cowboy (Anal)`,         logPhrase:(a,t,p)=>`${a} takes it in the ass astride ${t}`,                        hole:"anal",    positionTrait:"biped",  penile:true  },
    { id:"facefuck",            uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.2lhcQhGDFK6wOlNm", desc:"The top grips the bottom's head with both hands and uses their throat.", label:(p)=>`Facefuck`,              logPhrase:(a,t,p)=>`${a} grips ${t}'s head and uses their throat`,                 hole:"oral",    positionTrait:"biped",  penile:true  },
    { id:"face-sit-oral",       uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.yR5OMTVFB40rdJ11", desc:"The top sits on the bottom's face and grinds.", label:(p)=>`Face Sit`,              logPhrase:(a,t,p)=>`${a} smothers ${t}'s face and grinds`,                         hole:"oral",    positionTrait:"biped",  penile:false },
    { id:"prone-bone-pussy",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.quI62DbOXRCeVyRs", desc:"The bottom lies face down flat while the top presses down onto them from behind, driving in hard.", label:(p)=>`Prone Bone`,            logPhrase:(a,t,p)=>`${a} pins ${t} face-down and takes them`,                      hole:"vaginal", positionTrait:"biped",  penile:true  },
    { id:"prone-bone-anal",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.apZ3c2MqCf0suwKH", desc:"Face down, weight pressed on top, anal from behind.", label:(p)=>`Prone Bone (Anal)`,     logPhrase:(a,t,p)=>`${a} pins ${t} face-down and takes their ass`,                 hole:"anal",    positionTrait:"biped",  penile:true  },
    { id:"doggy-piledrive-anal",uuid:null, desc:"Top positioned steeply above, driving downward into the ass.", label:(p)=>`Doggy Piledrive`, logPhrase:(a,t,p)=>`${a} angles above ${t} and drives downward`, hole:"anal", positionTrait:"biped", penile:true  },
    { id:"turn-taking-pussy", minTops:2,   uuid:null, desc:"One top uses the pussy while others wait their turn nearby.",        label:(p)=>`Taking Turns (Pussy)`,  logPhrase:(a,t,p)=>`${a} takes their turn with ${t}`, hole:"vaginal", positionTrait:"biped", penile:true  },
    { id:"turn-taking-anal", minTops:2,    uuid:null, desc:"One top uses the ass while others wait their turn nearby.",          label:(p)=>`Taking Turns (Anal)`,   logPhrase:(a,t,p)=>`${a} takes their turn with ${t}`, hole:"anal",    positionTrait:"biped", penile:true  },
    { id:"turn-taking-oral", minTops:2,    uuid:null, desc:"One top uses the mouth while others wait their turn nearby.",        label:(p)=>`Taking Turns (Oral)`,   logPhrase:(a,t,p)=>`${a} takes their turn with ${t}`, hole:"oral",    positionTrait:"biped", penile:true  },
    { id:"assisting-hands", minTops:2,     uuid:null, desc:"Top uses their hands to assist while another top is active.",        label:(p)=>`Assisting (Hands)`,    logPhrase:(a,t,p)=>`${a} assists with their hands`, hole:"none",    positionTrait:"biped", penile:false },
    { id:"standing-pussy",      uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.xqFzi6fZRm3pW1yE", desc:"Both standing, the top behind the bottom, one hand holding them in place.", label:(p)=>`Standing`,              logPhrase:(a,t,p)=>`${a} takes ${t} from behind while standing`,                   hole:"vaginal", positionTrait:"biped",  penile:true  },
    { id:"standing-anal",       uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7HXyQOx3qkq9BIoj", desc:"Standing up, anal from behind.", label:(p)=>`Standing (Anal)`,       logPhrase:(a,t,p)=>`${a} presses ${t} against the wall and takes their ass`,       hole:"anal",    positionTrait:"biped",  penile:true  },
    { id:"mating-press",        uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.umaZraEcPSWierPt", desc:"The bottom is folded nearly in half, legs behind their head, the top driving straight down.", label:(p)=>`Mating Press`,          logPhrase:(a,t,p)=>`${a} folds ${t} in half and drives deep`,                      hole:"vaginal", positionTrait:"biped",  penile:true  },
    { id:"mating-press-anal",   uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.SF9smps5XQua3VBc", desc:"Folded back with legs pressed behind the head, the top bearing down from above for deep anal.", label:(p)=>`Mating Press (Anal)`,   logPhrase:(a,t,p)=>`${a} folds ${t} back and takes their ass deep`,                hole:"anal",    positionTrait:"biped",  penile:true  },
    { id:"spitroast",           uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.JcdrD7OUyggqktO3", desc:"One top at each end.", label:(p)=>`Spitroast`,             logPhrase:(a,t,p)=>`${a} takes one end of ${t} while a partner takes the other`,   hole:"oral",    positionTrait:"biped",  penile:true  },
    { id:"lotus",               uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.l5YBmML52O87TDUJ", desc:"Both tangled together face to face, the bottom seated in the top's lap with legs wrapped around them.", label:(p)=>`Lotus`,                 logPhrase:(a,t,p)=>`${a} and ${t} wrap around each other in lotus position`,       hole:"vaginal", positionTrait:"biped",  penile:false },
    { id:"lap-dance-anal",      uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.GhnPsrin8Tzctqpw", desc:"The bottom seats themselves in the top's lap from behind and lowers down.", label:(p)=>`Lap Dance (Anal)`,      logPhrase:(a,t,p)=>`${a} lowers themselves onto ${t}'s lap`,                       hole:"anal",    positionTrait:"biped",  penile:true  },

    // ── MASSIVE positions (large biped, can carry/lift) ────────────────────
    { id:"full-nelson-anal",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.jV9yvOmPfx6hY2YZ", desc:"The top lifts the bottom off the ground with arms hooked under their armpits, hands locked behind their neck.", label:(p)=>`Full Nelson (Anal)`,    logPhrase:(a,t,p)=>`${a} locks ${t}'s arms back and lifts them for anal`,          hole:"anal",    positionTrait:"massive", penile:true  },
    { id:"full-nelson-pussy",   uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.xQSRHhxK1V2vTbe4", desc:"The same crushing hold for vaginal penetration, bottom lifted and held helpless.", label:(p)=>`Full Nelson`,           logPhrase:(a,t,p)=>`${a} locks ${t}'s arms back and lifts them`,                   hole:"vaginal", positionTrait:"massive", penile:true  },
    { id:"carry-fuck-pussy",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.IQ4m1LBWr6PbzE8K", desc:"The top lifts the bottom entirely off the ground and fucks them mid-air.", label:(p)=>`Carry Fuck`,            logPhrase:(a,t,p)=>`${a} lifts ${t} entirely off the ground and uses them`,        hole:"vaginal", positionTrait:"massive", penile:true  },
    { id:"carry-fuck-anal",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.mqzTCWDWTnZrfqCy", desc:"Lifted off the ground and impaled from below for anal.", label:(p)=>`Carry Fuck (Anal)`,     logPhrase:(a,t,p)=>`${a} impales ${t} from below while holding them aloft`,        hole:"anal",    positionTrait:"massive", penile:true  },
    { id:"wall-pin-pussy",      uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.2oQKhNr474HjGUFh", desc:"The top pins the bottom against a wall with their full body weight and drives forward.", label:(p)=>`Wall Pin`,              logPhrase:(a,t,p)=>`${a} pins ${t} against the wall`,                              hole:"vaginal", positionTrait:"massive", penile:true  },
    { id:"wall-pin-anal",       uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.Y2wqBq5NTqIYpjGC", desc:"Slammed against a wall for anal, no room to pull away.", label:(p)=>`Wall Pin (Anal)`,       logPhrase:(a,t,p)=>`${a} slams ${t} against the wall and takes their ass`,         hole:"anal",    positionTrait:"massive", penile:true  },

    // ── QUADRUPED positions ────────────────────────────────────────────────
    { id:"mounted-pussy",       uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.pbwAAskML7SQgP72", desc:"The beast mounts from behind in its natural breeding stance, weight pinning the bottom down.", label:(p)=>`Mounted`,               logPhrase:(a,t,p)=>`${a} mounts ${t} from behind in natural breeding posture`,     hole:"vaginal", positionTrait:"quadruped", penile:true  },
    { id:"mounted-anal",        uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.xHtKpBi5yAQ4xejd", desc:"Quadruped mounting for anal, powerful haunches setting the pace.", label:(p)=>`Mounted (Anal)`,        logPhrase:(a,t,p)=>`${a} mounts ${t} from behind, forcing their ass`,              hole:"anal",    positionTrait:"quadruped", penile:true  },
    { id:"beast-ride-pussy",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.VQ5oMEIwPJkHjHEY", desc:"The bottom rides astride the beast's haunches, lowering themselves down onto it.", label:(p)=>`Beast Ride`,            logPhrase:(a,t,p)=>`${a} climbs astride ${t} and takes them`,                      hole:"vaginal", positionTrait:"quadruped", penile:false },

    // ── SERPENTINE positions ───────────────────────────────────────────────
    { id:"coil-pussy",          uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.fJkY9sc4agqcaScj", desc:"The serpentine top winds its coils around the bottom and guides its way inside.", label:(p)=>`Coil`,                  logPhrase:(a,t,p)=>`${a} wraps ${p.possessive} coils around ${t} and enters them`, hole:"vaginal", positionTrait:"serpentine", penile:true  },
    { id:"coil-anal",           uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7zLeZ1HoYXo5LSgW", desc:"Wrapped tight and taken in the ass, the coils tightening with every breath.", label:(p)=>`Coil (Anal)`,           logPhrase:(a,t,p)=>`${a} constricts ${t} and drives into their ass`,               hole:"anal",    positionTrait:"serpentine", penile:true  },
    { id:"constrict-oral",      uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.K5sFyxvyGhr6jSyv", desc:"The creature winds around the bottom's head and forces its way between their lips.", label:(p)=>`Constrict Oral`,        logPhrase:(a,t,p)=>`${a} wraps around ${t}'s head and forces into their throat`,   hole:"oral",    positionTrait:"serpentine", penile:true  },

    // ── WINGED positions ──────────────────────────────────────────────────
    { id:"talon-grip-pussy",    uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.TKRGL7YxSDoilDbA", desc:"The winged creature grips the bottom in its talons and pulls them onto itself, wings spread for balance.", label:(p)=>`Talon Grip`,            logPhrase:(a,t,p)=>`${a} grips ${t} with its talons and enters them`,              hole:"vaginal", positionTrait:"winged",  penile:true  },
    { id:"talon-grip-anal",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.LxV8YntD3CMqORUC", desc:"Gripped in talons, lifted, and taken in the ass.", label:(p)=>`Talon Grip (Anal)`,     logPhrase:(a,t,p)=>`${a} pins ${t} in its talons and takes their ass`,             hole:"anal",    positionTrait:"winged",  penile:true  },
    { id:"aerial-carry-pussy",  uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.dfP9tKm9pKoqF7Zq", desc:"The creature carries the bottom aloft while the act is in progress.", label:(p)=>`Aerial Carry`,          logPhrase:(a,t,p)=>`${a} carries ${t} aloft and uses them mid-air`,               hole:"vaginal", positionTrait:"winged",  penile:true  },

    // ── TENTACLED positions ──────────────────────────────────────────────
    { id:"tentacle-fill-pussy", uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.M5YPh117fAzGpQpe", desc:"A tentacle enters with curious patience and then decides it owns the place.", label:(p)=>`Tentacle Fill`,         logPhrase:(a,t,p)=>`${a}'s tentacle probes deep into ${t}`,                       hole:"vaginal", positionTrait:"tentacled", penile:true  },
    { id:"tentacle-fill-anal",  uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7uM3mAuPNEXC0tu6", desc:"The tentacle fills the ass with methodical thoroughness.", label:(p)=>`Tentacle Fill (Anal)`,  logPhrase:(a,t,p)=>`${a}'s tentacle fills ${t}'s ass`,                            hole:"anal",    positionTrait:"tentacled", penile:true  },
    { id:"tentacle-throat",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.JqHE1MKVHfHqcTm3", desc:"A tentacle forces itself between the bottom's lips and down their throat, pulsing with slow rhythm.", label:(p)=>`Tentacle Throat`,       logPhrase:(a,t,p)=>`${a} drives a tentacle down ${t}'s throat`,                   hole:"oral",    positionTrait:"tentacled", penile:true  },
    { id:"tentacle-spitroast",  uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.PbuVIa9dtQclLYWs", desc:"Multiple tentacles fill every available hole at once.", label:(p)=>`Tentacle Spitroast`,    logPhrase:(a,t,p)=>`${a} fills ${t} from every angle simultaneously`,             hole:"oral",    positionTrait:"tentacled", penile:true  },

    // ── PLANT positions ────────────────────────────────────────────────────
    { id:"vine-wrap-pussy",     uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.6ka2MlMkIZKe41gR", desc:"Vines hold the bottom spread open while a thick tendril pushes inside, slow and inexorable.", label:(p)=>`Vine Wrap`,             logPhrase:(a,t,p)=>`${a}'s vines hold ${t} open and push inside`,                 hole:"vaginal", positionTrait:"plant",  penile:true  },
    { id:"vine-wrap-anal",      uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.FLOM2Hw6trwxyerO", desc:"Roots bind the bottom in place and a tendril fills their ass.", label:(p)=>`Vine Wrap (Anal)`,      logPhrase:(a,t,p)=>`${a}'s tendrils hold ${t} spread and fill their ass`,         hole:"anal",    positionTrait:"plant",  penile:true  },

    // ── INCORPOREAL positions ─────────────────────────────────────────────
    { id:"phantom-touch-pussy", uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.G4noN7OkbOZ07SU1", desc:"The entity phases partially into the bottom's body, manifesting heat and pressure from within.", label:(p)=>`Phantom Touch`,         logPhrase:(a,t,p)=>`${a} phases into ${t}, filling them without touching`,        hole:"vaginal", positionTrait:"incorporeal", penile:true  },
    { id:"phantom-touch-anal",  uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.GzGEfkhCG3hveuu4", desc:"The incorporeal top passes through and fills the ass with cold-then-warm pressure.", label:(p)=>`Phantom Touch (Anal)`,  logPhrase:(a,t,p)=>`${a} passes through ${t}'s body and fills their ass`,         hole:"anal",    positionTrait:"incorporeal", penile:true  },
    { id:"phantom-oral",        uuid:"Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.iPZicqrJZxpnrLIr", desc:"The entity flows through the bottom's open lips, cold and inexplicably intimate.", label:(p)=>`Phantom Oral`,          logPhrase:(a,t,p)=>`${a} flows into ${t}'s mouth`,                                hole:"oral",    positionTrait:"incorporeal", penile:true  },
  ],

  // ===============================
  // Default position pools by position trait
  // Massive creatures also get all biped positions.
  // ===============================
  positionTraitDefaults: {
    biped:       ["doggy-style-pussy","doggy-style-anal","missionary-pussy","missionary-anal","cowgirl","reverse-cowgirl","cowboy-anal","facefuck","face-sit-oral","prone-bone-pussy","prone-bone-anal","doggy-piledrive-anal","turn-taking-pussy","turn-taking-anal","turn-taking-oral","assisting-hands","standing-pussy","standing-anal","mating-press","mating-press-anal","spitroast","lotus","lap-dance-anal","groping","licking","oral-give","oral-receive","facial","riding-vaginal","riding-anal","other"],
    massive:     ["doggy-style-pussy","doggy-style-anal","missionary-pussy","missionary-anal","facefuck","prone-bone-pussy","prone-bone-anal","standing-pussy","standing-anal","mating-press","mating-press-anal","full-nelson-anal","full-nelson-pussy","carry-fuck-pussy","carry-fuck-anal","wall-pin-pussy","wall-pin-anal","groping","other"],
    quadruped:   ["mounted-pussy","mounted-anal","doggy-piledrive-anal","beast-ride-pussy","other"],
    serpentine:  ["coil-pussy","coil-anal","constrict-oral","other"],
    winged:      ["doggy-style-pussy","doggy-style-anal","missionary-pussy","missionary-anal","facefuck","prone-bone-pussy","prone-bone-anal","talon-grip-pussy","talon-grip-anal","aerial-carry-pussy","other"],
    tentacled:   ["tentacle-fill-pussy","tentacle-fill-anal","tentacle-throat","tentacle-spitroast","groping","other"],
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
      desc: "Pussy and ass filled simultaneously.",
      slots: [{ label: "Vaginal", position: "missionary-pussy", hole: "vaginal" }, { label: "Anal", position: "cowboy-anal", hole: "anal" }] },

    { id: "gb-double-vaginal",       name: "Double Vaginal (DVP)", minActors: 2, maxActors: 2, needsPussy: true,
      requiredTraits: ["any","any"],
      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.DES5GyCJlpTjBYvi",
      desc: "Two tops in the pussy simultaneously.",
      slots: [{ label: "Reverse Cowgirl", position: "reverse-cowgirl", hole: "vaginal" }, { label: "Missionary", position: "missionary-pussy", hole: "vaginal" }] },

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
      slots: [{ label: "Vaginal (Riding)", position: "reverse-cowgirl", hole: "vaginal" }, { label: "Vaginal (Missionary)", position: "missionary-pussy", hole: "vaginal" }, { label: "Anal (Behind)", position: "doggy-style-anal", hole: "anal" }] },

    { id: "gb-dap-vaginal",          name: "DAP with Vaginal",    minActors: 3, maxActors: 3, needsPussy: true,
      requiredTraits: ["any","any","any"],
      uuid: null,
      desc: "Two tops double up in the ass while a third claims the pussy from the front.",
      slots: [{ label: "Vaginal (Front)", position: "standing-pussy", hole: "vaginal" }, { label: "Anal (Behind)", position: "doggy-style-anal", hole: "anal" }, { label: "Anal (Above)", position: "doggy-piledrive-anal", hole: "anal" }] },

    { id: "gb-spitroast-anal-extra", name: "Spitroast (Anal) + Facial", minActors: 3, maxActors: 3, needsPussy: false,
      requiredTraits: ["any","any","any"],
      uuid: null,
      desc: "Spitroasted from both ends while a third adds a facial.",
      slots: [{ label: "Throat (Primary)", position: "facefuck", hole: "oral" }, { label: "Ass", position: "doggy-style-anal", hole: "anal" }, { label: "Facial", position: "facial", hole: "facial" }] },

    // ── 4+ top presets ────────────────────────────────────────────────────
    { id: "gb-pile-on",              name: "Pile On",             minActors: 2, maxActors: null, needsPussy: true,
      requiredTraits: ["any","any","any"],
      uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.bJgka8u6oaHxaeWF",
      desc: "Bottom on all fours - pussy from behind, throat from the front, ass from behind.",
      slots: [{ label: "Pussy", position: "doggy-style-pussy", hole: "vaginal" }, { label: "Throat", position: "facefuck", hole: "oral" }, { label: "Ass", position: "doggy-style-anal", hole: "anal" }] },

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
  getGangbangPresets(targetActor, nTops = 2) {
    const hasPussy = !!targetActor?.getFlag?.(this.FLAG_SCOPE, "pussy");
    return this.gangbangPresets.filter(p => {
      if (p.needsPussy && !hasPussy) return false;
      if (p.minActors > nTops) return false;
      if (p.maxActors !== null && p.maxActors < nTops) return false;
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
      const pack = game.packs.get("ardisfoxxs-lewd-pf2e.aflp-lewd-items");
      if (!pack) return;
      for (const entry of this.positions) {
        if (!entry.uuid) continue;
        if (this._positionDescCache[entry.id]) continue; // inline desc already loaded — skip compendium
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

  getPositionDesc(id) {
    return this._positionDescCache[id] ?? null;
  },

  // Convenience: get a position entry by id
  getPosition(id) {
    return this.positions.find(p => p.id === id) ?? null;
  },

  // Get allowed position IDs for an actor based on their position trait flag.
  // Falls back to creature trait detection if flag not set.
  getActorPositions(actor) {
    const FLAG = this.FLAG_SCOPE;
    const positionTrait = actor.getFlag?.(FLAG, "positionTrait")
      ?? this._detectPositionTrait(actor);
    const ids = this.positionTraitDefaults[positionTrait] ?? this.positionTraitDefaults.biped;
    // Also always include non-positional options
    const extras = ["groping","fingering","licking","oral-give","oral-receive","facial","other"];
    return [...new Set([...ids, ...extras])];
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

  // ===============================
  // Genital Type Registry
  // ===============================
  genitalTypes: {
    pussy:               { name: "Pussy",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.pXivTb1f84SDm2xc", parent: null },
    cock:                { name: "Cock",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.PR96OQsnDSzt1e4i", parent: null },
    "cock-breeder":      { name: "Breeder",       uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7Lsd1xTTpGv7irtB", parent: "cock" },
    "cock-electrifying": { name: "Electrifying",  uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.jkRFNqFtRcKkAZwC", parent: "cock" },
    "cock-fertile":      { name: "Fertile",       uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.tUqN9UtQhawLd5Nq", parent: "cock" },
    "cock-flared":       { name: "Flared",        uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.qF8wy9Nz11DyBgRH", parent: "cock" },
    "cock-girthy":       { name: "Girthy",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.EOo3rbWwAybJFmlv", parent: "cock" },
    "cock-hemipenis":    { name: "Hemipenis",     uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.JTWCaeV5zCKpT7uk", parent: "cock" },
    "cock-knot":         { name: "Knot",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.A8cubySA9aPKmNCF", parent: "cock" },
    "cock-ovidepositor": { name: "Ovidepositor",  uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7Hp4H1QcJiiMM9Gp", parent: "cock" },
    "cock-pacifying":    { name: "Pacifying",     uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.tuc39pbCilMKvYx8", parent: "cock" },
    "cock-paralyzing":   { name: "Paralyzing",    uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.vy3wCGu8tRKwfAP5", parent: "cock" },
    "cock-slime":        { name: "Slime",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.TAfvb2RvjbwcT7Ci", parent: "cock" }
  },

  cumflationDefaults: { anal: 0, oral: 0, vaginal: 0, facial: 0, paizuri: 0 },

  // Average of anal+oral+vaginal, floored, capped at 8. Facial excluded.
  cumflationTotal(actor) {
    const c = actor.getFlag(this.FLAG_SCOPE, "cumflation") ?? {};
    return Math.min(8, Math.floor(((c.anal ?? 0) + (c.oral ?? 0) + (c.vaginal ?? 0)) / 3));
  },

  async ensureFlag(actor, path, value) {
    if (await actor.getFlag(this.FLAG_SCOPE, path) === undefined) {
      await actor.setFlag(this.FLAG_SCOPE, path, structuredClone(value));
    }
  },

  async ensureCoreFlags(actor) {
    await this.ensureFlag(actor, "sexual",      structuredClone(this.sexualDefaults));
    await this.ensureFlag(actor, "cum",         structuredClone(this.cumDefaults));
    await this.ensureFlag(actor, "cumOverflow", { anal: 0, oral: 0, vaginal: 0, facial: 0, paizuri: 0 });
    await this.ensureFlag(actor, "coomer",      structuredClone(this.coomerDefaults));
    await this.ensureFlag(actor, "arousal",     structuredClone(this.arousalDefaults));
    await this.ensureFlag(actor, "horny",       structuredClone(this.hornyDefaults));
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
    await this.ensureFlag(actor, "genitalTypes",
      Object.fromEntries(Object.keys(this.genitalTypes).map(k => [k, false]))
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
  },

  recalculateCum: async actor => {
    if (!actor) { console.warn("AFLP.recalculateCum called without actor"); return null; }
    const FLAG = AFLP.FLAG_SCOPE;
    const coomer = (await actor.getFlag(FLAG, "coomer")) ?? { level: 0 };
    const size   = actor.system?.traits?.size?.value ?? "med";
    const base   = AFLP.BASE_CUM_BY_SIZE[size] ?? AFLP.BASE_CUM_BY_SIZE.med;
    const max    = base * (1 + (coomer.level ?? 0));
    await actor.setFlag(FLAG, "cum", { current: max, max });
    return { current: max, max };
  }
});