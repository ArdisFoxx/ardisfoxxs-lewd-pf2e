// ===============================
// AFLP Titles / Achievements
// ===============================
// Defines all earnable titles, detection logic, and automation.
// Called from index.js. The AFLP_Titles object is global.
//
// Title thresholds, names, and descriptions can be customised via
// the Titles Config editor in module settings. Custom config is
// stored as a world setting and survives module updates.

window.AFLP_Titles = {

  _loadConfig() {
    try {
      const raw = game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.TITLES_CONFIG) ?? "";
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  },

  async _saveConfig(cfg) {
    await game.settings.set(AFLP.Settings.ID, AFLP.Settings.KEYS.TITLES_CONFIG, JSON.stringify(cfg));
  },

  _cfg(id) {
    const c = this._loadConfig();
    return c[id] ?? {};
  },

  _threshold(id, defaultVal) {
    return this._cfg(id).threshold ?? defaultVal;
  },

  // Progress metadata for numeric titles: id -> (a,s,h) => current value.
  // Target is the title's threshold. Titles absent from this map are binary
  // (flag/creature-match) and report no gradient. Kept data-driven so the ~35
  // threshold titles get a progress bar without hand-editing each one.
  _PROGRESS: {
    "first-time":        (a,s) => s.lifetime?.timesCummed ?? 0,
    "no-strings":        (a,s) => s.lifetime?.sessionsNoPregnancy ?? 0,
    "afterglow-addict":  (a,s) => s.lifetime?.timesCummed ?? 0,
    "deepthroater":      (a,s) => s.lifetime?.oral ?? 0,
    "backdoor-enthusiast":(a,s) => s.lifetime?.anal ?? 0,
    "facial-collector":  (a,s) => s.lifetime?.facial ?? 0,
    "paizuri-princess":  (a,s) => s.lifetime?.paizuri ?? 0,
    "gangbang-queen":    (a,s) => s.lifetime?.gangbang ?? 0,
    "total-slut":        (a,s) => (s.lifetime?.oral ?? 0)+(s.lifetime?.vaginal ?? 0)+(s.lifetime?.anal ?? 0)+(s.lifetime?.facial ?? 0)+(s.lifetime?.paizuri ?? 0),
    "glass-cannon":      (a,s) => (s.lifetime?.vaginal ?? 0)+(s.lifetime?.anal ?? 0),
    "cum-toilet":        (a,s) => s.lifetime?.cumReceived ?? 0,
    "belly-full":        (a,s) => Math.max(s.lifetime?.oral ?? 0, s.lifetime?.vaginal ?? 0, s.lifetime?.anal ?? 0, s.lifetime?.facial ?? 0),
    "baby-maker":        (a,s) => s.lifetime?.timesImpregnated ?? 0,
    "brood-mother":      (a,s) => s.lifetime?.timesImpregnated ?? 0,
    "perpetually-pregnant":(a,s) => s.lifetime?.timesImpregnated ?? 0,
    "defeat-fetish":     (a,s) => s.lifetime?.timesDefeated ?? 0,
    "mind-gone":         (a,s) => s.lifetime?.timesMindBroken ?? 0,
    "pain-curious":      (a,s) => s.lifetime?.damageTaken ?? 0,
    "painslut":          (a,s) => s.lifetime?.damageTaken ?? 0,
    "masochist":         (a,s) => s.lifetime?.damageTaken ?? 0,
    "bliss-in-agony":    (a,s) => s.lifetime?.damageTaken ?? 0,
    "suffering-is-joy":  (a,s) => s.lifetime?.damageTaken ?? 0,
    "rough-lover":       (a,s) => s.lifetime?.damageDealt ?? 0,
    "dominant-striker":  (a,s) => s.lifetime?.damageDealt ?? 0,
    "sadist":            (a,s) => s.lifetime?.damageDealt ?? 0,
    "cruel-master":      (a,s) => s.lifetime?.damageDealt ?? 0,
    "apex-predator":     (a,s) => s.lifetime?.damageDealt ?? 0,
    "bound-once":        (a,s) => s.lifetime?.bondageScenes ?? 0,
    "well-bound":        (a,s) => s.lifetime?.bondageScenes ?? 0,
    "bondage-pet":       (a,s) => s.lifetime?.bondageScenes ?? 0,
    "eternal-thrall":    (a,s) => s.lifetime?.restrainedScenes ?? 0,
    "fire-hose":         (a,s) => s.lifetime?.cumGiven ?? 0,
    "cum-dump":          (a,s) => s.lifetime?.cumReceived ?? 0,
    "insatiable":        (a,s) => Object.values(s.kinks ?? {}).filter(Boolean).length,
    "goblin-groupie":    (a,s,h) => (h ?? []).filter(e => AFLP_Titles._nameContains(e.sourceName, ["goblin"])).length,
    "beastmaster":       (a,s,h) => new Set((h ?? []).map(e => e.sourceType).filter(Boolean)).size,
  },

  // Returns { current, target, pct, done } for a numeric title, or null for a
  // binary (flag/creature) title that has no gradient.
  progressOf(id, actor, sexual, history) {
    const fn = this._PROGRESS[id];
    if (!fn) return null;
    const builtin = this.TITLES.find(t => t.id === id);
    const target = this._threshold(id, builtin?.defaultThreshold ?? 1);
    let current = 0;
    try { current = Number(fn(actor, sexual, history ?? [])) || 0; } catch (_) {}
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    return { current, target, pct, done: current >= target };
  },

  _name(id, defaultName) {
    return this._cfg(id).name ?? defaultName;
  },

  // Resolve a held title id to { id, name, desc }, honoring name overrides and
  // custom titles. Returns null if the id matches no known title.
  resolveTitle(id) {
    if (!id) return null;
    const builtin = this.TITLES.find(t => t.id === id);
    if (builtin) {
      return { id, name: this._name(id, builtin.name), desc: builtin.desc };
    }
    const cfg = this._loadConfig();
    const custom = (cfg._custom ?? []).find(ct => ct.id === id);
    if (custom) {
      return { id, name: custom.name ?? id, desc: custom.desc ?? "Custom title." };
    }
    return null;
  },

  // ── Title definitions ──────────────────────────────────────────────────────
  TITLES: [
    {
      id: "first-time",
      name: "The Deflowered",
      desc: "Had sex for the first time.",
      defaultThreshold: 1,
      detect: (a, s) => (s.lifetime?.timesCummed ?? 0) >= 1,
    },
    {
      id: "no-strings",
      name: "The Hookup",
      desc: "Had 10 or more encounters with no pregnancy.",
      defaultThreshold: 10,
      detect: (a, s) => (s.lifetime?.sessionsNoPregnancy ?? 0) >= 10,
    },
    {
      id: "afterglow-addict",
      name: "Afterglow Addict",
      desc: "Climaxed 20 or more times.",
      defaultThreshold: 20,
      detect: (a, s) => (s.lifetime?.timesCummed ?? 0) >= AFLP_Titles._threshold("afterglow-addict", 20),
    },
    {
      id: "deepthroater",
      name: "Deepthroater",
      desc: "Received oral sex 20 or more times.",
      defaultThreshold: 20,
      detect: (a, s) => (s.lifetime?.oral ?? 0) >= AFLP_Titles._threshold("deepthroater", 20),
    },
    {
      id: "backdoor-enthusiast",
      name: "Anal Slut",
      desc: "Received anal sex 20 or more times.",
      defaultThreshold: 20,
      detect: (a, s) => (s.lifetime?.anal ?? 0) >= AFLP_Titles._threshold("backdoor-enthusiast", 20),
    },
    {
      id: "facial-collector",
      name: "Cumwalk Addict",
      desc: "Received 20 or more facials.",
      defaultThreshold: 20,
      detect: (a, s) => (s.lifetime?.facial ?? 0) >= AFLP_Titles._threshold("facial-collector", 20),
    },
    {
      id: "paizuri-princess",
      name: "Paizuri Princess",
      desc: "Finished 20 or more times between their tits.",
      defaultThreshold: 20,
      detect: (a, s) => (s.lifetime?.paizuri ?? 0) >= AFLP_Titles._threshold("paizuri-princess", 20),
    },
    {
      id: "gangbang-queen",
      name: "Gangbang Queen",
      desc: "Been gangbanged 5 or more times.",
      defaultThreshold: 5,
      detect: (a, s) => (s.lifetime?.gangbang ?? 0) >= AFLP_Titles._threshold("gangbang-queen", 5),
    },
    {
      id: "well-used",
      name: "Airlock Angel",
      desc: "Received sex in all three holes in a single encounter.",
      detect: (a, s) => !!(s.lifetime?.allHolesInSession),
    },
    {
      id: "total-slut",
      name: "Total Slut",
      desc: "Received sex 50 or more times total.",
      defaultThreshold: 50,
      detect: (a, s) => {
        const l = s.lifetime ?? {};
        return (l.oral ?? 0) + (l.vaginal ?? 0) + (l.anal ?? 0) + (l.facial ?? 0) + (l.paizuri ?? 0) >= AFLP_Titles._threshold("total-slut", 50);
      },
    },
    {
      id: "glass-cannon",
      name: "Glass Bottom",
      desc: "Been creampied 50 or more times.",
      defaultThreshold: 50,
      detect: (a, s) => ((s.lifetime?.vaginal ?? 0) + (s.lifetime?.anal ?? 0)) >= AFLP_Titles._threshold("glass-cannon", 50),
    },
    {
      id: "variety-is-spice",
      name: "Every-Hole Expert",
      desc: "Received sex in all four hole types (oral, vaginal, anal, facial).",
      detect: (a, s) => {
        const l = s.lifetime ?? {};
        return (l.oral ?? 0) > 0 && (l.vaginal ?? 0) > 0 && (l.anal ?? 0) > 0 && (l.facial ?? 0) > 0;
      },
    },
    {
      id: "legendary-hole",
      name: "Epic Lay",
      desc: "Received sex 100 or more times total.",
      defaultThreshold: 100,
      detect: (a, s) => {
        const l = s.lifetime ?? {};
        return (l.oral ?? 0) + (l.vaginal ?? 0) + (l.anal ?? 0) + (l.facial ?? 0) + (l.paizuri ?? 0) >= AFLP_Titles._threshold("legendary-hole", 100);
      },
    },
    {
      id: "power-bottom",
      name: "Power Bottom",
      desc: "Received more than 500 total acts across all holes.",
      defaultThreshold: 500,
      detect: (a, s) => {
        const l = s.lifetime ?? {};
        return (l.oral ?? 0) + (l.vaginal ?? 0) + (l.anal ?? 0) + (l.facial ?? 0) + (l.paizuri ?? 0) >= AFLP_Titles._threshold("power-bottom", 500);
      },
    },
    {
      id: "cum-bucket",
      name: "Cum Bucket",
      desc: "Received cum from 10 or more separate partners.",
      defaultThreshold: 10,
      // History is the third argument (checkAndAward reads the partnerHistory
      // flag and passes it). sexual.lifetime.partnerHistory does not exist.
      detect: (a, s, h) => (h ?? []).length >= AFLP_Titles._threshold("cum-bucket", 10),
    },
    {
      id: "village-bicycle",
      name: "Village Bicycle",
      desc: "Received sex from 25 or more unique partners.",
      defaultThreshold: 25,
      detect: (a, s, h) => {
        const unique = new Set((h ?? []).map(e => e.sourceUuid));
        return unique.size >= AFLP_Titles._threshold("village-bicycle", 25);
      },
    },
    {
      id: "belly-full",
      name: "Mens' Cum Dump",
      desc: "Taken 50 or more loads in a single hole over a lifetime.",
      defaultThreshold: 50,
      detect: (a, s) => {
        // Loads received per hole (lifetime[hole] counts +1 per filling), NOT ml -
        // ml scales with the Realistic/Fantasy Cum Module setting, so a load count
        // reads the same at any setting.
        const holes = ["oral", "vaginal", "anal", "facial"];
        return holes.some(h => (s.lifetime?.[h] ?? 0) >= AFLP_Titles._threshold("belly-full", 50));
      },
    },
    {
      id: "stuffed-to-bursting",
      name: "Monsters' Cum Dump",
      desc: "Accumulated 40 or more overflow units in a single hole (been packed past maximum repeatedly).",
      defaultThreshold: 40,
      // cumOverflow lives as its own actor flag (cumflation.js saveCumflation),
      // NOT under sexual.lifetime. Reading the wrong path made this unreachable.
      detect: (a) => {
        const ov = a?.getFlag?.(AFLP.FLAG_SCOPE, "cumOverflow") ?? {};
        return Object.values(ov).some(v => v >= AFLP_Titles._threshold("stuffed-to-bursting", 40));
      },
    },
    {
      id: "overflowing",
      name: "Leaky",
      desc: "Exceeded Cumflation capacity (overflow triggered) at least once.",
      detect: (a) => {
        const ov = a?.getFlag?.(AFLP.FLAG_SCOPE, "cumOverflow") ?? {};
        return Object.values(ov).some(v => v > 0);
      },
    },
    {
      id: "cum-toilet",
      name: "Public Cum Toilet",
      desc: "Received 200 or more Cum Shots in total over a lifetime.",
      defaultThreshold: 200,
      detect: (a, s) => (s.lifetime?.cumReceived ?? 0) >= AFLP_Titles._threshold("cum-toilet", 200),
    },
    {
      id: "baby-maker",
      name: "Baby Maker",
      desc: "Been impregnated 3 or more times.",
      defaultThreshold: 3,
      detect: (a, s) => (s.lifetime?.timesImpregnated ?? 0) >= AFLP_Titles._threshold("baby-maker", 3),
    },
    {
      id: "litter-bearer",
      name: "Litter Bearer",
      desc: "Given birth to 5 or more offspring in a single pregnancy.",
      defaultThreshold: 5,
      detect: (a, s) => (s.lifetime?.maxLitterSize ?? 0) >= 5,
    },
    {
      id: "brood-mother",
      name: "Brood Mother",
      desc: "Been impregnated 10 or more times.",
      defaultThreshold: 10,
      detect: (a, s) => (s.lifetime?.timesImpregnated ?? 0) >= AFLP_Titles._threshold("brood-mother", 10),
    },
    {
      id: "perpetually-pregnant",
      name: "Walking Womb",
      desc: "Been impregnated 20 or more times.",
      defaultThreshold: 20,
      detect: (a, s) => (s.lifetime?.timesImpregnated ?? 0) >= AFLP_Titles._threshold("perpetually-pregnant", 20),
    },
    {
      id: "egg-layer",
      name: "Egg Layer",
      desc: "Laid eggs from an oviposition pregnancy.",
      detect: (a, s) => !!(s.lifetime?.hasLaidEggs),
    },
    {
      id: "monster-mommy",
      name: "Monster Mommy",
      desc: "Carried a pregnancy from a monster or creature source.",
      detect: (a, s) => !!(s.lifetime?.hasMonsterPregnancy),
    },
    {
      id: "orc-breeder",
      name: "Orc Breeder",
      desc: "Been bred by an orc.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["orc"])),
    },
    {
      id: "defeat-fetish",
      name: "Recreational Loser",
      desc: "Sexually defeated 5 or more times.",
      defaultThreshold: 5,
      detect: (a, s) => (s.lifetime?.timesDefeated ?? 0) >= AFLP_Titles._threshold("defeat-fetish", 5),
    },
    {
      id: "mind-gone",
      name: "Brainless Cock Sleeve",
      desc: "Suffered Mind Break 3 or more times.",
      defaultThreshold: 3,
      // Field is timesMindBroken (aflp-arousal.js writes it). "timesMindBroke"
      // never existed, so this title could never award - only its bar moved.
      detect: (a, s) => (s.lifetime?.timesMindBroken ?? 0) >= AFLP_Titles._threshold("mind-gone", 3),
    },
    {
      id: "size-queen",
      name: "Size Queen",
      desc: "Been with a Large or larger creature (giant, dragon, etc.).",
      // Large is step 4. Compared through AFLP.sizeStepOf because sourceSize
      // holds PF2e's abbreviation ("lg") on one system and Daggerheart's full
      // word ("large") on the other; testing the literals missed every Large and
      // Gargantuan DH partner. An entry with no sourceSize reads 0 and never
      // awards, which is what the old `?? "med"` did.
      detect: (a, s, h) => h.some(e => AFLP.sizeStepOf(e.sourceSize) >= 4),
    },
    {
      id: "beastmaster",
      name: "Beastmaster",
      desc: "Been with 5 different kinds of creatures.",
      defaultThreshold: 5,
      detect: (a, s, h) => new Set(h.map(e => e.sourceType).filter(Boolean)).size >= 5,
    },
    {
      id: "celestial-blessed",
      name: "Celestially Blessed",
      desc: "Been intimate with a celestial being.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["angel","archon","azata","celestial","deva","planetar","solar","empyreal"])),
    },
    {
      id: "demon-consort",
      name: "Demon's Consort",
      desc: "Been with a demon or devil.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["demon","devil","fiend","balor","succubus","incubus","pit fiend","erinyes"])),
    },
    {
      id: "dragon-hoard",
      name: "Dragon's Hoard",
      desc: "Been claimed by a dragon.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["dragon"])),
    },
    {
      id: "giant-problem",
      name: "Giant's Toy",
      desc: "Been with a giant.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["giant","ettin","cyclops","troll","ogre"])),
    },
    {
      id: "goblin-groupie",
      name: "Goblin Groupie",
      desc: "Been with 3 or more goblins.",
      defaultThreshold: 3,
      detect: (a, s, h) => h.filter(e => AFLP_Titles._nameContains(e.sourceName, ["goblin"])).length >= 3,
    },
    {
      id: "plant-based",
      name: "Garden Slut",
      desc: "Been used by a plant creature.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["plant","vine","tendril","mycelium","leshy","dryad","nymph","treant"])),
    },
    {
      id: "slime-time",
      name: "Slime Bucket",
      desc: "Been used by a slime or ooze.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["slime","ooze","jelly","pudding","blob","gelatinous"])),
    },
    {
      id: "tentacle-toy",
      name: "Tentacle Toy",
      desc: "Been used by a creature with tentacles.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["tentacle","octopus","kraken","aboleth","cthulhu","cephalopod","squid"])),
    },
    {
      id: "troll-lover",
      name: "Troll Lover",
      desc: "Been with a troll.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["troll"])),
    },
    {
      id: "undead-embrace",
      name: "Grave Warmer",
      desc: "Been with an undead creature.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["undead","zombie","skeleton","vampire","ghost","lich","wraith","wight"])),
    },
    {
      id: "wolf-pack",
      name: "Wolf Pack's Favourite",
      desc: "Been with a wolf, werewolf, or similar.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["wolf","werewolf","warg","gnoll"])),
    },

    // ── Masochist progression ─────────────────────────────────────────────────
    {
      id: "pain-curious",
      name: "Punching Bag",
      desc: "Taken half a health bar of damage across H-Scenes.",
      defaultThreshold: 0.5,
      detect: (a, s) => (s.lifetime?.damageTaken ?? 0) >= AFLP_Titles._threshold("pain-curious", 0.5),
    },
    {
      id: "painslut",
      name: "Painslut",
      desc: "Taken 2 health bars of damage across H-Scenes.",
      defaultThreshold: 2,
      detect: (a, s) => (s.lifetime?.damageTaken ?? 0) >= AFLP_Titles._threshold("painslut", 2),
    },
    {
      id: "masochist",
      name: "Masochist",
      desc: "Taken 5 health bars of damage across H-Scenes.",
      defaultThreshold: 5,
      detect: (a, s) => (s.lifetime?.damageTaken ?? 0) >= AFLP_Titles._threshold("masochist", 5),
    },
    {
      id: "bliss-in-agony",
      name: "Blissful Agony Addict",
      desc: "Taken 15 health bars of damage across H-Scenes.",
      defaultThreshold: 15,
      detect: (a, s) => (s.lifetime?.damageTaken ?? 0) >= AFLP_Titles._threshold("bliss-in-agony", 15),
    },
    {
      id: "suffering-is-joy",
      name: "Slave to Suffering",
      desc: "Taken 50 health bars of damage across H-Scenes.",
      defaultThreshold: 50,
      detect: (a, s) => (s.lifetime?.damageTaken ?? 0) >= AFLP_Titles._threshold("suffering-is-joy", 50),
    },

    // ── Sadist progression ────────────────────────────────────────────────────
    {
      id: "rough-lover",
      name: "Rough Lover",
      desc: "Dealt half a health bar of damage across H-Scenes.",
      defaultThreshold: 0.5,
      detect: (a, s) => (s.lifetime?.damageDealt ?? 0) >= AFLP_Titles._threshold("rough-lover", 0.5),
    },
    {
      id: "dominant-striker",
      name: "Dominant Striker",
      desc: "Dealt 2 health bars of damage across H-Scenes.",
      defaultThreshold: 2,
      detect: (a, s) => (s.lifetime?.damageDealt ?? 0) >= AFLP_Titles._threshold("dominant-striker", 2),
    },
    {
      id: "sadist",
      name: "Sadist",
      desc: "Dealt 5 health bars of damage across H-Scenes.",
      defaultThreshold: 5,
      detect: (a, s) => (s.lifetime?.damageDealt ?? 0) >= AFLP_Titles._threshold("sadist", 5),
    },
    {
      id: "cruel-master",
      name: "Cruel Master",
      desc: "Dealt 15 health bars of damage across H-Scenes.",
      defaultThreshold: 15,
      detect: (a, s) => (s.lifetime?.damageDealt ?? 0) >= AFLP_Titles._threshold("cruel-master", 15),
    },
    {
      id: "apex-predator",
      name: "Apex Predator",
      desc: "Dealt 50 health bars of damage across H-Scenes.",
      defaultThreshold: 50,
      detect: (a, s) => (s.lifetime?.damageDealt ?? 0) >= AFLP_Titles._threshold("apex-predator", 50),
    },

    // ── Bondage progression ───────────────────────────────────────────────────
    // Counted in SCENES, not rounds. Rounds needed initiative to be running,
    // which Daggerheart has no equivalent of, and made one long encounter worth
    // more than several short ones. Grabbed is deliberately no longer named on
    // the cards: nearly every scene opens with it, so it carried no signal - but
    // it still SETS the flag, because a scene spent grabbed is a scene spent
    // bound. Thresholds sit in the same register as the other per-scene tallies
    // (gangbang-queen 5, no-strings 10). A world that customised the old
    // round-based thresholds keeps that number and will need it re-set.
    {
      id: "bound-once",
      name: "Bondage Bait",
      desc: "Spent 5 or more H-Scenes in bondage.",
      defaultThreshold: 5,
      detect: (a, s) => (s.lifetime?.bondageScenes ?? 0) >= AFLP_Titles._threshold("bound-once", 5),
    },
    {
      id: "well-bound",
      name: "Helpless Fuck Toy",
      desc: "Spent 15 or more H-Scenes in bondage.",
      defaultThreshold: 15,
      detect: (a, s) => (s.lifetime?.bondageScenes ?? 0) >= AFLP_Titles._threshold("well-bound", 15),
    },
    {
      id: "bondage-pet",
      name: "Leashed Sex Slave",
      desc: "Spent 40 or more H-Scenes in bondage.",
      defaultThreshold: 40,
      detect: (a, s) => (s.lifetime?.bondageScenes ?? 0) >= AFLP_Titles._threshold("bondage-pet", 40),
    },
    {
      id: "eternal-thrall",
      name: "Eternal Thrall",
      desc: "Spent 50 or more H-Scenes restrained.",
      defaultThreshold: 50,
      detect: (a, s) => (s.lifetime?.restrainedScenes ?? 0) >= AFLP_Titles._threshold("eternal-thrall", 50),
    },

    // ── Cum Shot / Loads ──────────────────────────────────────────────────────
    {
      id: "fire-hose",
      name: "The Fire Hose",
      desc: "Fired 500 or more Cum Shots (Loads) over a lifetime.",
      defaultThreshold: 500,
      detect: (a, s) => (s.lifetime?.cumGiven ?? 0) >= AFLP_Titles._threshold("fire-hose", 500),
    },
    {
      id: "cum-dump",
      name: "The Cum Dump",
      desc: "Received 500 or more Cum Shots (Loads) over a lifetime.",
      defaultThreshold: 500,
      detect: (a, s) => (s.lifetime?.cumReceived ?? 0) >= AFLP_Titles._threshold("cum-dump", 500),
    },

    // ── Cumflation ────────────────────────────────────────────────────────────
    {
      id: "cum-balloon",
      name: "The Cum Balloon",
      desc: "Filled to bursting - reached maximum cumflation in a hole.",
      detect: (a) => {
        const cf = a.getFlag?.(AFLP.FLAG_SCOPE, "cumflation") ?? {};
        return ["oral", "vaginal", "anal", "facial", "paizuri"].some(h => (cf[h] ?? 0) >= (AFLP.CUMFLATION_MAX ?? 8));
      },
    },
    {
      id: "human-waterbed",
      name: "Creampie Waterbed",
      desc: "Flooded in every hole at once - all three holes cumflated 4 or higher.",
      detect: (a) => {
        const cf = a.getFlag?.(AFLP.FLAG_SCOPE, "cumflation") ?? {};
        return ["oral", "vaginal", "anal"].every(h => (cf[h] ?? 0) >= 4);
      },
    },

    // ── Size Training / Body Features ─────────────────────────────────────────
    {
      id: "trained-monster-sleeve",
      name: "Trained Monster Sleeve",
      desc: "Fully trained every applicable hole to maximum.",
      detect: (a) => {
        const holes = AFLP.applicableTrainHoles?.(a) ?? [];
        if (!holes.length) return false;
        const train = AFLP.sizeTrainingOf?.(a) ?? {};
        return holes.every(h => (train[h] ?? 0) >= (AFLP.SIZE_TRAIN_MAX ?? 6));
      },
    },
    {
      id: "gaping-ruin",
      name: "The Gaping Ruin",
      desc: "Trained the ass to its limit (Gape Glutton).",
      detect: (a) => !!(a.getFlag?.(AFLP.FLAG_SCOPE, "bodyFeatures") ?? {})["anal"],
    },
    {
      id: "slack-jaw",
      name: "The Slack-Jaw",
      desc: "Trained the throat to its limit (Throat Goat).",
      detect: (a) => !!(a.getFlag?.(AFLP.FLAG_SCOPE, "bodyFeatures") ?? {})["oral"],
    },
    {
      id: "ruined-sow",
      name: "The Ruined Sow",
      desc: "Trained the pussy to its limit (Size Queen).",
      detect: (a) => !!(a.getFlag?.(AFLP.FLAG_SCOPE, "bodyFeatures") ?? {})["pussy"],
    },

    // ── Kinks ─────────────────────────────────────────────────────────────────
    {
      id: "insatiable",
      name: "Insatiable",
      desc: "Holds 5 or more kinks at once.",
      defaultThreshold: 5,
      detect: (a, s) => Object.values(s.kinks ?? {}).filter(Boolean).length >= 5,
    },

    // ── Breeding ──────────────────────────────────────────────────────────────
    {
      id: "clutch-mother",
      name: "Clutch Mother",
      desc: "Delivered an egg clutch as a clutch-bearer.",
      detect: (a, s) => !!(s.lifetime?.hasDeliveredClutch),
    },
  ],

  // ── Helper utilities ───────────────────────────────────────────────────────
  _nameContains(name, keywords) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return keywords.some(k => lower.includes(k));
  },

  // ── Check and award titles to an actor ────────────────────────────────────
  async checkAndAward(actor) {
    // "Titles - Automatic Award": registered and preset by the welcome screen
    // but previously never enforced here - titles were always auto-awarded.
    if (AFLP.Settings?.titlesAutomation === false) return [];
    const sexual  = structuredClone(actor.getFlag(AFLP.FLAG_SCOPE, "sexual") ?? {});
    const history = actor.getFlag(AFLP.FLAG_SCOPE, "partnerHistory") ?? [];
    // Read from sexual.titles to match the sheet tab
    const earned  = new Set(sexual.titles ?? []);
    const newTitles = [];

    for (const title of this.TITLES) {
      if (earned.has(title.id)) continue;
      try {
        const qualifies = title.detect(actor, sexual, history);
        if (qualifies) {
          earned.add(title.id);
          newTitles.push(title);
        }
      } catch(e) {
        console.warn(`AFLP | Title check failed for ${title.id}:`, e);
      }
    }

    // Also include any custom titles from config that aren't in the TITLES array
    const cfg = this._loadConfig();
    for (const ct of (cfg._custom ?? [])) {
      if (!earned.has(ct.id)) continue; // custom titles must be manually awarded
    }

    if (newTitles.length) {
      sexual.titles = [...earned];
      // If the actor was questing toward a title they just earned, clear the
      // tracked marker - the H-Quest is complete, nothing left to track.
      if (sexual.trackedTitleId && earned.has(sexual.trackedTitleId)) {
        sexual.trackedTitleId = null;
      }
      await actor.setFlag(AFLP.FLAG_SCOPE, "sexual", sexual);
      try { window.AFLP?.Voice?.playSfx?.("title"); } catch (_) {}
    }

    return newTitles;
  },

  // ── Register hooks ─────────────────────────────────────────────────────────
  register() {
    // Check titles after daily prep and after scene end (called from hscene)
    Hooks.on("aflp.dailyPrep", async (actor) => {
      await AFLP_Titles.checkAndAward(actor).catch(() => {});
    });
  },
};

// ==============================================
// Titles Config Editor - ApplicationV2
// ==============================================
class TitlesConfigApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id:       "aflp-titles-config",
    tag:      "div",
    window:   { title: "Title Thresholds & Names", resizable: true, minimizable: true },
    position: { width: 680, height: 620 },
  };

  _cfg = {};

  async _prepareContext() {
    this._cfg = AFLP_Titles._loadConfig();
    return {};
  }

  async _renderHTML() {
    const cfg = AFLP_Titles._loadConfig();
    const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const threshTitles = AFLP_Titles.TITLES.filter(t => t.defaultThreshold != null);

    const rows = threshTitles.map(t => {
      const cur = cfg[t.id] ?? {};
      const thresh = cur.threshold ?? t.defaultThreshold;
      const name = cur.name ?? t.name;
      const max = Math.max(t.defaultThreshold * 5, 20);
      const step = t.defaultThreshold >= 1000 ? 500 : t.defaultThreshold >= 100 ? 10 : 1;
      return `<div class="aflp-tc-row">
        <div class="aflp-tc-id">${esc(t.id)}</div>
        <div class="aflp-tc-fields">
          <label>Name<input type="text" class="aflp-tc-name" data-id="${esc(t.id)}" value="${esc(name)}" placeholder="${esc(t.name)}"/></label>
          <label>Threshold (default: ${t.defaultThreshold})
            <div class="aflp-tc-slider-row">
              <input type="range" class="aflp-tc-slider" data-id="${esc(t.id)}" min="1" max="${max}" step="${step}" value="${thresh}"/>
              <span class="aflp-tc-val" data-id="${esc(t.id)}">${thresh}</span>
            </div>
          </label>
          <div style="grid-column:1/-1;font-size:9px;color:#666;font-style:italic;">${esc(t.desc)}</div>
        </div>
      </div>`;
    }).join("");

    const customTitles = (cfg._custom ?? []);
    const customRows = customTitles.map((ct, i) =>
      `<div class="aflp-tc-custom-row" data-idx="${i}">
        <input type="text" class="aflp-tc-cname" placeholder="Title name" value="${esc(ct.name ?? "")}"/>
        <input type="text" class="aflp-tc-cdesc" placeholder="Description" value="${esc(ct.desc ?? "")}"/>
        <button class="aflp-tc-rm" data-idx="${i}">✕</button>
      </div>`
    ).join("");

    const el = document.createElement("div");
    el.innerHTML = `<style>
      .aflp-tc-scroll{padding:10px 14px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;max-height:440px;}
      .aflp-tc-section-hdr{font-size:11px;font-weight:700;color:#c9a96e;text-transform:uppercase;border-bottom:1px solid rgba(200,160,80,0.25);padding-bottom:4px;margin-top:4px;}
      .aflp-tc-row{background:rgba(255,255,255,0.02);border:1px solid rgba(200,160,80,0.1);border-radius:3px;padding:8px 10px;}
      .aflp-tc-id{font-size:9px;color:#888;margin-bottom:5px;}
      .aflp-tc-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
      .aflp-tc-fields label{font-size:10px;color:#aaa;display:flex;flex-direction:column;gap:3px;}
      .aflp-tc-fields input[type=text]{background:#111;color:#ddd;border:1px solid rgba(200,160,80,0.25);border-radius:3px;padding:3px 6px;font-size:11px;}
      .aflp-tc-slider-row{display:flex;align-items:center;gap:8px;}
      .aflp-tc-slider{flex:1;accent-color:#c9a96e;}
      .aflp-tc-val{font-size:12px;font-weight:700;color:#c9a96e;min-width:40px;text-align:right;}
      .aflp-tc-custom-row{display:grid;grid-template-columns:1fr 2fr auto;gap:6px;align-items:center;margin-top:4px;}
      .aflp-tc-custom-row input{background:#111;color:#ddd;border:1px solid rgba(200,160,80,0.25);border-radius:3px;padding:3px 6px;font-size:11px;}
      .aflp-tc-rm{background:rgba(180,40,40,0.5);color:#fff;border:none;border-radius:3px;padding:2px 8px;cursor:pointer;}
      .aflp-tc-add{margin-top:4px;font-size:11px;cursor:pointer;padding:4px 12px;}
      .aflp-tc-footer{padding:8px 14px;border-top:1px solid rgba(200,160,80,0.2);display:flex;gap:8px;justify-content:flex-end;}
      .aflp-tc-footer button{padding:5px 16px;font-size:12px;cursor:pointer;}
    </style>
    <div class="aflp-tc-scroll">
      <div class="aflp-tc-section-hdr">Thresholds &amp; Names</div>
      ${rows}
      <div class="aflp-tc-section-hdr">Custom Titles</div>
      <div class="aflp-tc-custom-list">${customRows || '<div style="color:#666;font-size:11px;font-style:italic;">No custom titles yet.</div>'}</div>
      <button class="aflp-tc-add">+ Add Custom Title</button>
    </div>
    <div class="aflp-tc-footer">
      <button class="aflp-tc-reset">Reset All</button>
      <button class="aflp-tc-save">Save</button>
    </div>`;
    return el;
  }

  _replaceHTML(result, content) { content.replaceChildren(result); }

  _onRender(context, options) {
    const el = this.element;
    el.querySelectorAll(".aflp-tc-slider").forEach(sl => {
      sl.addEventListener("input", () => {
        el.querySelector(`.aflp-tc-val[data-id="${sl.dataset.id}"]`).textContent = sl.value;
      });
    });
    el.querySelector(".aflp-tc-add")?.addEventListener("click", () => {
      const list = el.querySelector(".aflp-tc-custom-list");
      const idx = list.querySelectorAll(".aflp-tc-custom-row").length;
      const row = document.createElement("div");
      row.className = "aflp-tc-custom-row";
      row.dataset.idx = idx;
      row.innerHTML = `<input type="text" class="aflp-tc-cname" placeholder="Title name" value=""/>
        <input type="text" class="aflp-tc-cdesc" placeholder="Description" value=""/>
        <button type="button" class="aflp-tc-rm" data-idx="${idx}">✕</button>`;
      list.appendChild(row);
      row.querySelector(".aflp-tc-rm").addEventListener("click", () => row.remove());
    });
    el.querySelectorAll(".aflp-tc-rm").forEach(btn => {
      btn.addEventListener("click", () => btn.closest(".aflp-tc-custom-row").remove());
    });
    el.querySelector(".aflp-tc-save")?.addEventListener("click", () => this._save(el));
    el.querySelector(".aflp-tc-reset")?.addEventListener("click", async () => {
      if (!await foundry.applications.api.DialogV2.confirm({ window: { title:"Reset titles config?" }, content:"<p>Clear all custom threshold and name overrides?</p>" })) return;
      await AFLP_Titles._saveConfig({});
      this._cfg = {};
      this.render();
    });
  }

  async _save(el) {
    const newCfg = {};
    el.querySelectorAll(".aflp-tc-slider").forEach(sl => {
      const id = sl.dataset.id;
      const title = AFLP_Titles.TITLES.find(t => t.id === id);
      if (!newCfg[id]) newCfg[id] = {};
      newCfg[id].threshold = parseInt(sl.value, 10);
      const nameEl = el.querySelector(`.aflp-tc-name[data-id="${id}"]`);
      const nameVal = nameEl?.value?.trim();
      if (nameVal && nameVal !== (title?.name ?? "")) newCfg[id].name = nameVal;
    });
    const customRows = [...el.querySelectorAll(".aflp-tc-custom-row")];
    const customTitles = customRows.map(row => ({
      id:   "custom-" + (row.querySelector(".aflp-tc-cname")?.value?.trim() ?? "").toLowerCase().replace(/\s+/g,"-"),
      name: row.querySelector(".aflp-tc-cname")?.value?.trim() ?? "",
      desc: row.querySelector(".aflp-tc-cdesc")?.value?.trim() ?? "",
    })).filter(ct => ct.name);
    if (customTitles.length) newCfg._custom = customTitles;
    await AFLP_Titles._saveConfig(newCfg);
    this._cfg = newCfg;
    ui.notifications.info("AFLP | Title config saved.");
  }
}

AFLP.TitlesConfigApp = TitlesConfigApp;

game.settings.registerMenu("ardisfoxxs-lewd-pf2e", "titleConfigMenu", {
  name:       "Title Thresholds and Names",
  label:      "Edit Titles",
  hint:       "Adjust the criteria required to unlock each title, rename titles, or add custom titles.",
  icon:       "fas fa-trophy",
  type:       TitlesConfigApp,
  restricted: true,
});
