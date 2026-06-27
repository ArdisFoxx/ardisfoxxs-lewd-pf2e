/*
 * AFLR - pf2e genital-type builder (the 13 Pussy subtypes + Cock (Litter) + Cock (Barbed)).
 * Creates the pf2e aflp-lewd-items effect items missing on the pf2e side, tagged with
 * flags."ardisfoxxs-lewd-pf2e".aflrKey so AFLP.system.contentUuid() resolves them by key
 * (the genitalTypes registry entries stay uuid:null; runtime aflrKey lookup wins).
 * Clones the base "Cock" effect for a correct pf2e schema. Idempotent: skips any aflrKey
 * already present. Run as a GM macro on the pf2e world (or via the live JS bridge).
 *
 * NOTE: the breeding items (Breeder/Fertile/Clutch/Litter) describe the shared Brood Roll.
 * The Brood Roll engine (degrees -> success number -> offspring dice) is a paired code task;
 * until it lands, impregnate automation still uses the old flat check. Text is design-forward.
 */
(async () => {
  const MID = "ardisfoxxs-lewd-pf2e";
  const pack = game.packs.get(`${MID}.aflp-lewd-items`);
  if (!pack) { ui.notifications?.error("AFLR: aflp-lewd-items not found"); return; }

  const items = await pack.getDocuments();
  const byName = (n) => items.find((i) => i.name === n);
  const mUuid = (id) => `Compendium.${pack.collection}.Item.${id}`;

  // --- link targets -------------------------------------------------------
  const U = {
    Cock: mUuid("PR96OQsnDSzt1e4i"),
    Pussy: mUuid("pXivTb1f84SDm2xc"),
    Submitting: mUuid("kBLJPOJNjz8fmxrQ"),
    Horny: mUuid("hmYj3xU7xrdjMHpe"),
    Impregnated: mUuid("aFCk8c78LKCLi6dN"),
    cums: mUuid("N9U6snPV0DVE9L5H"),
    Girthy: mUuid("EOo3rbWwAybJFmlv"),
    Flared: mUuid("qF8wy9Nz11DyBgRH"),
    Knot: mUuid("A8cubySA9aPKmNCF"),
    Escape: "Compendium.pf2e.actionspf2e.Item.SkZAQRkLLkmBQNB9",
  };
  // module items resolved by name (full .uuid)
  for (const [k, nm] of [["Coomer", "Coomer"], ["Cumflated", "Cumflated"], ["Ovidepositor", "Cock (Ovidepositor)"]]) {
    const d = byName(nm); if (d) U[k] = d.uuid;
  }
  // pf2e system conditions resolved by name
  const condPack = game.packs.get("pf2e.conditionitems");
  const cidx = condPack ? await condPack.getIndex() : [];
  const condUuid = (name) => {
    const e = [...cidx].find((x) => x.name?.toLowerCase() === name.toLowerCase());
    return e ? `Compendium.pf2e.conditionitems.Item.${e._id}` : null;
  };
  for (const nm of ["Stunned", "Off-Guard", "Enfeebled", "Grabbed", "Unconscious"]) {
    const u = condUuid(nm); if (u) U[nm.replace("-", "")] = u;
  }

  const L = (key, text) => U[key] ? `@UUID[${U[key]}]{${text ?? key}}` : (text ?? key);
  const cockHdr = `<p>You have a ${L("Cock", "Cock")} with a special feature.</p>`;
  const pussyHdr = `<p>You have a ${L("Pussy", "Pussy")} with a special feature.</p>`;

  // --- the 15 new items ---------------------------------------------------
  const builds = [
    ["pussy-slick", "Pussy (Slick)", `${pussyHdr}<p><strong>Slick</strong> An endlessly wet pussy whose frictionless slick wrings a partner fast. While you are ${L("Submitting","Submitting")} to a creature, that creature gains 1 additional Arousal each time it would gain Arousal from your presses or its Sexual Advance. The first time a creature cums inside you, it gains ${L("Coomer","Coomer")} - trained by your slick to cum harder ever after. Each creature gains this only once from you.</p>`],
    ["pussy-milking", "Pussy (Milking)", `${pussyHdr}<p><strong>Milking</strong> A pussy that milks. Rhythmic inner contractions wring a partner dry: when a creature ${L("cums","cums")} inside you, it immediately cums again - a second load - and is ${L("OffGuard","Off-Guard")} until the end of its next turn. The first time a creature cums inside you, it gains ${L("Coomer","Coomer")}, milked into cumming harder ever after. Each creature gains this only once from you.</p>`],
    ["pussy-gripping", "Pussy (Gripping)", `${pussyHdr}<p><strong>Gripping</strong> A pussy that clamps down and won't let go. When a creature ${L("cums","cums")} inside you, it cannot withdraw - it is ${L("Grabbed","Grabbed")} and automatically fails attempts to ${L("Escape","Escape")} - until it cums again or you choose to release it.</p>`],
    ["pussy-venomous", "Pussy (Venomous)", `${pussyHdr}<p><strong>Venomous</strong> A pussy that weeps a numbing slick. While a creature is inside you it is ${L("OffGuard","Off-Guard")}, and at the start of each of its turns it must succeed at a @Check[fortitude|showDC:all] save against your DC or be ${L("Enfeebled","Enfeebled 1")} until it leaves you. This effect has the poison trait.</p>`],
    ["pussy-electric", "Pussy (Electric)", `${pussyHdr}<p><strong>Electric</strong> A pussy charged with static. When a creature ${L("cums","cums")} inside you, the jolt arcs through it and it becomes ${L("Stunned","Stunned 1")}. This effect has the electricity trait.</p>`],
    ["pussy-honeyed", "Pussy (Honeyed)", `${pussyHdr}<p><strong>Honeyed</strong> A pussy that drips soporific nectar. When a creature ${L("cums","cums")} inside you, it gains ${L("Horny","Horny 1")} and must succeed at a @Check[fortitude|showDC:all|dc:12] save or fall asleep (${L("Unconscious","Unconscious")}). This effect has the incapacitation, mental, and sleep traits.</p>`],
    ["pussy-pacifying", "Pussy (Pacifying)", `${pussyHdr}<p><strong>Pacifying</strong> A pussy that drains the fight out. While a creature is coupling with you, it is ${L("Horny","Horny 2")} and cannot make hostile actions or attempt to ${L("Escape","Escape")}, lost in the soft heat of you. This effect has the mental and incapacitation traits.</p>`],
    ["pussy-fanged", "Pussy (Fanged)", `${pussyHdr}<p><strong>Fanged</strong> A pussy with a hidden bite. When a creature ${L("cums","cums")} inside you, it clenches down hard and the creature takes 1d6 piercing damage.</p>`],
    ["pussy-breeder", "Pussy (Breeder)", `${pussyHdr}<p><strong>Breeder</strong> A pussy built to breed - fertile and eager. When a creature cums inside you, skip the Brood Roll: it counts as an automatic critical success, your womb taking from any compatible mate as if it were your own kind (${L("Impregnated","Impregnated")}). Any pregnancy taken this way is quickened to 11 days.</p>`],
    ["pussy-fertile", "Pussy (Fertile)", `${pussyHdr}<p><strong>Fertile</strong> A pussy that catches easily. Your Brood DC is lowered by 2, so Brood Rolls to breed you succeed and critically succeed more often.</p>`],
    ["pussy-clutch", "Pussy (Clutch)", `${pussyHdr}<p><strong>Clutch</strong> A brood-sac pussy built to incubate. When an ${L("Ovidepositor","Ovidepositor")} fills you, its Brood Roll counts as an automatic critical success - you always take the largest clutch (the maximum eggs). They are laid within 3 days, then hatch the next day, far faster than any other womb.</p>`],
    ["pussy-litter", "Pussy (Litter)", `${pussyHdr}<p><strong>Litter</strong> A litter womb, bred for large clutches. Your offspring die becomes 1d4, so a Brood Roll breeds you with that many young per success (1d4 on a success, doubled on a critical success), carried to term over the usual 30 days.</p>`],
    ["pussy-bottomless", "Pussy (Bottomless)", `${pussyHdr}<p><strong>Bottomless</strong> A pussy so vast that an ordinary cock is lost in it. While you are ${L("Submitting","Submitting")} to a creature, you gain no Arousal from its presses unless its cock is ${L("Girthy","Girthy")}, ${L("Flared","Flared")}, or ${L("Knot","Knotted")} - only those reach deep enough to feel. In addition, your depths never overflow: any cum that would ${L("Cumflated","Cumflate")} you past its limit is swallowed whole, spilling nothing onto the ground.</p>`],
    ["cock-litter", "Cock (Litter)", `${cockHdr}<p><strong>Litter</strong> Seed potent enough to quicken a whole clutch. Your offspring die becomes 1d4, so your Brood Rolls breed that many young per success (1d4 on a success, doubled on a critical success), carried to term over the usual 30 days.</p>`],
    ["cock-barbed", "Cock (Barbed)", `${cockHdr}<p><strong>Barbed</strong> A cock lined with backward barbs. When you withdraw from a creature (it stops ${L("Submitting","Submitting")} to you), the rasp marks it 1 Arousal and deals it 1d6 piercing damage.</p>`],
  ];

  // --- clone template from base Cock effect -------------------------------
  const baseCock = byName("Cock");
  if (!baseCock) { ui.notifications?.error("AFLR: base Cock not found to clone"); return; }
  const tmpl = baseCock.toObject();
  const folder = pack.folders?.find((f) => f.name === "Special Genitalia Types");

  const existingKeys = new Set(items.map((i) => i.flags?.[MID]?.aflrKey).filter(Boolean));

  const wasLocked = pack.locked;
  await pack.configure({ locked: false });
  let created = 0, skipped = 0; const errors = [];
  for (const [key, name, html] of builds) {
    if (existingKeys.has(key)) { skipped++; continue; }
    const obj = foundry.utils.deepClone(tmpl);
    delete obj._id;
    obj.name = name;
    obj.img = baseCock.img;
    obj.system.slug = key;
    obj.system.description = { value: html };
    obj.system.rules = [];
    obj.system.traits = { otherTags: [], value: [] };
    obj.system.level = { value: 1 };
    obj.flags = { [MID]: { aflrKey: key } };
    if (folder) obj.folder = folder.id;
    try { const d = await Item.create(obj, { pack: pack.collection }); if (d) created++; }
    catch (e) { errors.push(`${name}: ${e.message || e}`); }
  }
  if (wasLocked) await pack.configure({ locked: true });

  const msg = `AFLR pf2e genitals: created ${created}, skipped ${skipped}` + (errors.length ? ` | ERRORS: ${errors.join("; ")}` : "");
  console.log(msg);
  ui.notifications?.info(msg);
})();
