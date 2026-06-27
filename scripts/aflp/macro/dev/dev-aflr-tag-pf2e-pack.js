/*
 * AFLR - one-time tagging of the aflp-lewd-items compendium with aflrKey logical keys.
 *
 * Run this ONCE as a script Macro (GM) on a PF2e world where the aflp-lewd-items
 * pack is loaded. It adds flags."ardisfoxxs-lewd-pf2e".aflrKey = <logical key> to
 * each canonical content item, which makes AFLP.system.contentUuid() resolve via the
 * built index rather than the static-registry fallback. Non-destructive: it only adds
 * the flag, unlocks the pack to write, then restores the previous lock state. Safe to
 * re-run (skips items already tagged correctly).
 */
(async () => {
  const SCOPE = "ardisfoxxs-lewd-pf2e";
  const PACK  = "ardisfoxxs-lewd-pf2e.aflp-lewd-items";
  const MAP = {
  "dominant": "C5ZtoqW4NXEAUdCf",
  "submissive": "R0DRa8QhwXC3LhUD",
  "switch": "bRrDiw8DIxqYFgRA",
  "aphrodisiac-junkie": "k71GcOR7w25IiwTG",
  "bondage-princess": "3iI8WWhDnl71NqVW",
  "brood-sow": "zfNxhu2nn3YPz9Lb",
  "creature-fetish": "fcnEx5qeoOFNcr5v",
  "cum-slut": "omYlzPBNXLVAI7N3",
  "edge-master": "6xLbRrviQSmUEsKP",
  "exhibitionist": "JRXfjU2WvdruuhWD",
  "party-animal": "pfs8GCIbh6E8polc",
  "purity": "eFcEwxfe56UxqlJc",
  "monstrous-prowess": "0HV6GDwcBG8Yw1ZU",
  "bimbo": "mTSsjimziKIcEbLO",
  "gangslut": "fNSwvzZ3ddJmu7yG",
  "voyeurism": "NKiO32mIdFJZpwnb",
  "ouroboros": "QvwGGnxQotq1giao",
  "stretch-king": "2Kth26AcSdPDxkKa",
  "hypno-slave": "naEmpTaaGI3qYAeC",
  "afterglow": "kCV26tqXcvQIcYvM",
  "arousal": "7Z2RdSitwyyppWN8",
  "defeated": "mU065Nhk4ByNujhw",
  "denied": "LrJ9mbeEBXTNp57C",
  "dominating": "Cw6RHpmTWEVgzrce",
  "exposed": "ocRgNSfLD65sWBhs",
  "exposed-nude": "Y8wxUgOvsXaF2Mc4",
  "horny": "hmYj3xU7xrdjMHpe",
  "horny-always": "RekITrc0sIsHFXvK",
  "bimbofied": "9ySsqXnpfZkhmp2V",
  "mind-break": "B74Z3GBzgNMoVXr7",
  "submitting": "kBLJPOJNjz8fmxrQ",
  "struggle-snuggle": "k7M7WiI0Kgyn0pFX",
  "sexual-advance": "1Ty2edYgjwn7m6sh",
  "cum": "N9U6snPV0DVE9L5H",
  "edge": "aPH8eJBtdByYpvSr",
  "purge-cumflation": "e6A4cyAOEK8z5Ugo",
  "dubious-consent": "ziPugIato0JXzIzu",
  "potion-of-breeding": "WcVMt3xnu08Wq0RW",
  "potion-of-breeding-effect": "jQ3G8jwA2boYGVrr",
  "birth-control": "ZHMYtfYLHQI1hHnX",
  "cock-breeder": "7Lsd1xTTpGv7irtB",
  "cock-electrifying": "jkRFNqFtRcKkAZwC",
  "cock-fertile": "tUqN9UtQhawLd5Nq",
  "cock-flared": "qF8wy9Nz11DyBgRH",
  "cock-girthy": "EOo3rbWwAybJFmlv",
  "cock-hemipenis": "JTWCaeV5zCKpT7uk",
  "cock-knot": "A8cubySA9aPKmNCF",
  "cock-ovidepositor": "7Hp4H1QcJiiMM9Gp",
  "cock-pacifying": "tuc39pbCilMKvYx8",
  "cock-paralyzing": "vy3wCGu8tRKwfAP5",
  "cock-slime": "TAfvb2RvjbwcT7Ci"
};

  const pack = game.packs.get(PACK);
  if (!pack) return ui.notifications.error("AFLR: aflp-lewd-items not found. Run on a PF2e world.");

  const wasLocked = pack.locked;
  if (wasLocked) await pack.configure({ locked: false });

  const tagged = [], already = [], missing = [];
  try {
    for (const [slug, id] of Object.entries(MAP)) {
      const doc = await pack.getDocument(id);
      if (!doc) { missing.push(slug); continue; }
      if (doc.getFlag(SCOPE, "aflrKey") === slug) { already.push(slug); continue; }
      await doc.setFlag(SCOPE, "aflrKey", slug);
      tagged.push(slug);
    }
  } finally {
    if (wasLocked) await pack.configure({ locked: true });
  }

  // verify
  let verifyFail = 0;
  for (const [slug, id] of Object.entries(MAP)) {
    const doc = await pack.getDocument(id).catch(() => null);
    if (doc?.getFlag(SCOPE, "aflrKey") !== slug) verifyFail++;
  }

  // rebuild the live index so resolution picks up the tags immediately
  try { await AFLP.system?.buildContentIndex?.(); } catch (e) {}

  const msg = `AFLR aflrKey tagging: ${tagged.length} tagged, ${already.length} already, ${missing.length} missing, ${verifyFail} verify-fail.`;
  console.log(msg, { tagged, missing });
  ui.notifications.info(msg);
})();
