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
    "gangslut":          { name: "Gangslut",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.fNSwvzZ3ddJmu7yG" }
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
    "horny-always":  { name: "Horny (Always)",uuid: null },  // UUID: set after importing the effect into the compendium
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
    return actor.items?.some(i =>
      i.slug === slug || (uuid && (i.flags?.core?.sourceId ?? i.sourceId) === uuid)
    ) ?? false;
  },

  // Returns the badge/level value of a kink item, or 0 if the actor doesn't have it.
  // Kinks that have levels (Edge Master, Creature Fetish, etc.) store their level as badge.value.
  getKinkLevel(actor, slug) {
    if (!actor || !slug) return 0;
    const uuid = this.kinks[slug]?.uuid;
    const item = actor.items?.find(i =>
      i.slug === slug || (uuid && (i.flags?.core?.sourceId ?? i.sourceId) === uuid)
    );
    return item?.system?.badge?.value ?? (item ? 1 : 0);
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
  // Each entry: { id, label(pronouns), logPhrase(attackerName, targetName, pronouns), penile, holeId }
  //   penile:  true  → only shown if source has cock; maps to a hole for cum macro
  //   holeId:  the hole key used in cumflation/history (null for non-penile)
  // ===============================
  positions: [
    {
      id: "vaginal",
      label:     (p) => `Inside ${p.object}`,
      logPhrase: (a, t, p) => `${a} pushes inside ${t}`,
      penile:    true,
      holeId:    "vaginal",
    },
    {
      id: "anal",
      label:     (p) => `Taking ${p.possessive} Ass`,
      logPhrase: (a, t, p) => `${a} takes ${t} from behind`,
      penile:    true,
      holeId:    "anal",
    },
    {
      id: "oral-receive",
      label:     (p) => `Using ${p.possessive} Mouth`,
      logPhrase: (a, t, p) => `${a} uses ${t}'s mouth`,
      penile:    true,
      holeId:    "oral",
    },
    {
      id: "facial",
      label:     (p) => `Finishing on ${p.possessive} Face`,
      logPhrase: (a, t, p) => `${a} finishes on ${t}'s face`,
      penile:    true,
      holeId:    "facial",
    },
    {
      id: "oral-give",
      label:     (p) => `Going Down`,
      logPhrase: (a, t, p) => `${a} goes down on ${t}`,
      penile:    false,
      holeId:    null,
    },
    {
      id: "fingering",
      label:     (p) => `Fingering ${p.object}`,
      logPhrase: (a, t, p) => `${a} fingers ${t}`,
      penile:    false,
      holeId:    null,
    },
    {
      id: "groping",
      label:     (p) => `Hands All Over`,
      logPhrase: (a, t, p) => `${a} runs their hands over ${t}`,
      penile:    false,
      holeId:    null,
    },
    {
      id: "other",
      label:     (p) => `Teasing`,
      logPhrase: (a, t, p) => `${a} teases ${t}`,
      penile:    false,
      holeId:    null,
    },
  ],

  // Convenience: get a position entry by id
  getPosition(id) {
    return this.positions.find(p => p.id === id) ?? null;
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
    "cock-hemipenis":    { name: "Hemipenis",     uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.JTWCaeV5zCKpT7uk", parent: "cock" },
    "cock-knot":         { name: "Knot",          uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.A8cubySA9aPKmNCF", parent: "cock" },
    "cock-ovidepositor": { name: "Ovidepositor",  uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.0sZoe3XFXKv57RJ6", parent: "cock" },
    "cock-pacifying":    { name: "Pacifying",     uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.tuc39pbCilMKvYx8", parent: "cock" },
    "cock-paralyzing":   { name: "Paralyzing",    uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.vy3wCGu8tRKwfAP5", parent: "cock" },
    "cock-slime":        { name: "Slime",         uuid: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.TAfvb2RvjbwcT7Ci", parent: "cock" }
  },

  cumflationDefaults: { anal: 0, oral: 0, vaginal: 0, facial: 0 },

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
    await this.ensureFlag(actor, "cumOverflow", { anal: 0, oral: 0, vaginal: 0, facial: 0 });
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