// ════════════════════════════════════════════════════════════════════════════
// AFLP Voice Profiles  (window.AFLP_Voice / AFLP.Voice)
// ----------------------------------------------------------------------------
// Folder-discovery voice profiles. The GM points the "Voice Folder" setting at a
// base folder; each immediate subfolder is a profile, and within a profile each
// event has its own subfolder of clips:
//
//   <base>/<ProfileName>/climax/*.ogg
//   <base>/<ProfileName>/moan/1..6/*.ogg   (arousal moans; also used for advances)
//   <base>/<ProfileName>/oral/*.ogg
//   <base>/<ProfileName>/struggle/*.ogg
//
// Each actor stores its chosen profile in flags.<scope>.voiceProfile (set from a
// dropdown on the AFLP sheet tab). When an event fires, a random clip from that
// event's folder is chosen, played locally, and broadcast so everyone at the
// table hears the same clip - each client applying its own volume / mute.
//
// Discovery needs FILES_BROWSE, which by Foundry's DEFAULT only Trusted Player
// and up have. A seat without it cannot pick a clip, so it asks the active GM to
// fire the event and hears the GM's broadcast like everyone else - see "Seats
// that cannot browse" below. Playback itself needs no permission.
//
// All audio is user-supplied (drop your own files into the folder); nothing is
// bundled. Triggers are wired non-invasively: climax and cumflation from the UI
// files, and Sexual Advance / Struggle Snuggle by wrapping AFLP_Arousal.increment
// on its reason string, so the compendium macros need no edits.
// ════════════════════════════════════════════════════════════════════════════
(() => {
  const AFLP = (window.AFLP = window.AFLP || {});
  const MODULE_ID = "ardisfoxxs-lewd-pf2e";
  const SOCKET    = `module.${MODULE_ID}`;
  const EVENTS    = ["climax", "oral", "struggle", "cumflation", "edge", "defeated", "mindbreak"];
  const AUDIO_RE  = /\.(ogg|mp3|wav|m4a|webm|flac|opus|aac)$/i;

  const _scope = () => AFLP.FLAG_SCOPE || "aflp";

  // ── Settings shims (tolerant of early calls before registration) ────────────
  const _get = (key, dflt) => { try { return game.settings.get(MODULE_ID, key); } catch (e) { return dflt; } };
  const _clamp01   = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };
  const enabled    = () => _get("voiceEnabled", true) !== false;
  // Shipped soundpack lives in its own module at modules/aflr-soundpack/{aflp-voices,aflp-sfx}.
  // Bundled VA profiles always load from VA_BUNDLED; voiceFolder is an OPTIONAL
  // extra folder for the user's own additional profiles.
  // Shipped audio lives in a companion module. The current pack is the "AFLR
  // Soundpack" (aflr-soundpack); the old curated "AFLR Soundpack Lite"
  // (aflr-soundpack-lite) is kept only as a legacy fallback so existing installs
  // still resolve. The retired aflp-soundpack id is no longer consulted.
  // Evaluated at import (ready), so game.modules.active is reliable here.
  const SOUNDPACK_BASE = (() => {
    try {
      if (game.modules.get("aflr-soundpack")?.active)      return "modules/aflr-soundpack";
      if (game.modules.get("aflr-soundpack-lite")?.active) return "modules/aflr-soundpack-lite";
      if (game.modules.get("aflp-soundpack")?.active)      return "modules/aflp-soundpack"; // legacy id
    } catch (e) { /* fall through to default */ }
    return "modules/aflr-soundpack";
  })();
  const VA_BUNDLED     = `${SOUNDPACK_BASE}/aflp-voices`;
  const SFX_BUNDLED    = `${SOUNDPACK_BASE}/aflp-sfx`;
  const folder     = () => (_get("voiceFolder", "") || "").trim();   // optional extra custom VA folder
  const volume     = () => _clamp01(_get("voiceVolume", 0.8), 0.8);
  const mutedHere  = () => _get("voiceMuteLocal", false) === true;
  const sfxEnabled = () => _get("sfxEnabled", true) !== false;
  const sfxVolume  = () => _clamp01(_get("sfxVolume", 0.7), 0.7);

  // ── Ambient SFX (module assets) ─────────────────────────────────────────────
  // Generic activity sounds shipped in modules/<id>/assets/sfx/<category>/*.
  // They layer on top of profile voices, fire even with no profile assigned, and
  // are selected by the actor's current H-Scene position. Add folders to enable
  // more categories; missing folders are simply silent.
  // SFX base is fixed to the shipped soundpack (no custom-path override).
  const SFX_BASE_DEFAULT = SFX_BUNDLED;
  const sfxBase = () => SFX_BUNDLED;
  // Floor SFX shipped inside this module itself, used as a per-key fallback when
  // the soundpack is absent or yields nothing for a category. Folders present:
  // plap, gluk, schlick, cum, slosh, slide.
  const FLOOR_BASE = "modules/ardisfoxxs-lewd-pf2e/assets/audio";
  const FLOOR_CATS = new Set(["plap", "gluk", "schlick", "cum", "slosh", "slide"]);
  // Ambient category by the position's HOLE (read from the schema position
  // registry via AFLP.getPosition), so every penetrative/oral position maps
  // correctly - doggy, missionary, cowgirl, facefuck, prone-bone, etc., not just
  // the bare "vaginal"/"anal" ids. Positions with no hole (fingering/groping/
  // licking) fall back to POS_SFX_EXTRA by id.
  const HOLE_SFX = { vaginal: "plap", anal: "plap", oral: "gluk" };
  const POS_SFX_EXTRA = { fingering: "schlick" };
  // Event-driven stings (not position-based): category played on a given event.
  const EVENT_SFX = { climax: "cum" /* title sting from titles.js; cumflation via _emitCumflationSfx */ };
  // Cumflation sting pulls from curated cum sound SETS (weighted per set), not the
  // balloon/vore pack. Paths are relative to the SFX base. Wet Soft / Hentai get
  // extra weight; the big-load set below is used for large loads (see below).
  const CUMFLATION_SETS = [
    ["Cum/Cumflation/Cumflation (LeHornySFX3D)",                  2],
    ["Cum/Cumflation/Bubbly Cumflation (SquishSuccubus)",         2],
    ["Cum/Cumflation/Liquid Cumflation (SquishSuccubus)",         2],
    ["Cum/Cumflation/Internal Belly (SquishSuccubus)",            2],
    ["Cum/External & Multipurpose/Wet Soft Cum (SquishSuccubus)", 4],
    ["Cum/External & Multipurpose/Hentai Cum (SquishSuccubus)",   4],
    ["Cum/Internal",                                              1],
  ];
  // The "big load" set, used INSTEAD of the sets above whenever the load deposited
  // this resolution is large (any creature). A big single load - not a big-capacity
  // creature running low - is what should sound big.
  const CUMFLATION_BIG_SET  = "Cum/Bubbley/Bubbly Glup Glup Cum (SquishSuccubus)";
  const CUMFLATION_BIG_LOAD = 20;   // load units this resolution at/above this -> big set
  // All ambient categories we look for under the SFX base.
  const SFX_CATEGORIES = ["plap", "gluk", "schlick", "cum", "title", "slosh", "slide"];
  // Folders from the bundled OpenNSFW SFX pack that also feed each category, so
  // the pack can be dropped in whole (its folder names) or curated into our clean
  // category folders - both are scanned, recursively.
  const SFX_ALIASES = {
    plap:      ["Plaps", "Skin Slides", "Sliding In & Out", "Wet Sounds", "Squish & Knots"],
    gluk:      ["Oral - Mouth"],
    schlick:   ["Fingering & Grinding"],
    cum:       ["Cum"],
    // Internal "sloshing" cum sounds, fired when a hole takes cum while already at
    // its per-hole max (it's full, so it sloshes). Scanned from the pack's
    // Cum/Internal library (belly/womb-fill/traveling clips); .lnk files ignored.
    slosh:     ["Cum/Internal"],
    // Rhythmic in-and-out motion for ORAL acts, used in place of plaps: wet slide
    // clips at various BPMs - a random one is picked, so the cadence varies.
    slide:     ["Sliding In & Out"],
  };

  // ── Climax suppression ──────────────────────────────────────────────────────
  // When an actor climaxes, their advance/struggle/moan sounds are silenced briefly
  // so the climax owns the moment. Cumflation is never suppressed.
  const SUPPRESS_MS = 2000;
  const _climaxAt = new Map();   // actorId -> timestamp of last climax

  // ── Escalating arousal moans ─────────────────────────────────────────────────
  // Arousal is current/max (max varies per actor), mapped to 6 tiers by proportion.
  // A moan fires when an actor crosses UP into a higher tier, pulled from the
  // profile's moan/<tier> subfolder (1 = softest .. 6 = most desperate). Partial
  // packs fall back to the nearest lower tier that has clips.
  const MOAN_TIERS = 6;
  const _moanTier = new Map();   // actorId -> last arousal tier seen
  const _arousalTier = (actor) => {
    const a = actor.getFlag?.(_scope(), "arousal") ?? {};
    const max = a.max ?? 10, cur = a.current ?? 0;
    return (max > 0) ? Math.min(MOAN_TIERS, Math.ceil((cur / max) * MOAN_TIERS)) : 0;
  };

  // ── Discovery cache ─────────────────────────────────────────────────────────
  // _cache.profiles = { [profileName]: { climax:[...src], ..., moan:{1:[...],..} } }
  let _cache = { profiles: {}, ts: 0, scanning: null };
  let _sfxCache = {};            // { [category]: [...src] }
  let _cfSets = {};              // cumflation: { [setPath]: { files:[...], weight } }
  let _cfBig = [];               // cumflation: big-load set files

  function _FP() {
    return foundry?.applications?.apps?.FilePicker
        ?? foundry?.applications?.apps?.FilePicker?.implementation
        ?? globalThis.FilePicker;
  }

  // ── Can this seat read the filesystem at all? ───────────────────────────────
  // FILES_BROWSE is granted to roles 2/3/4 (Trusted Player and up) by Foundry's
  // DEFAULT permission config, so an ordinary PLAYER cannot browse in anyone's
  // world unless the GM has changed it. Measured 31 Aug 2026 in dh-test: role-1
  // seats return false, and every `FP.browse` on them throws "You do not have
  // permission to browse the host file system!".
  //
  // **Only DISCOVERY is gated. Playback is not** - the same seat GETs a clip by
  // URL and receives 200 with the full file (measured, 266 KB .ogg). That is the
  // whole basis of the manifest sharing below: a player seat can play anything,
  // it just cannot find out what exists.
  const _canBrowse = () => { try { return game.user?.can?.("FILES_BROWSE") !== false; } catch (e) { return true; } };

  // ── Seats that cannot browse: the GM fires the sound, everyone hears it ─────
  //
  // WHY ANY OF THIS EXISTS: `play()` runs on whichever client TRIGGERS the event,
  // picks a clip from THAT client's cache and broadcasts the chosen src. A seat
  // with an empty cache plays nothing for ANYBODY - so a player-triggered climax
  // was silent at the whole table while the identical GM-triggered one was heard
  // by everyone. It never looked broken because the GM's seat usually fires.
  //
  // TWO THINGS A BROWSE-LESS SEAT NEEDS, AND THEY ARE NOT THE SAME SIZE:
  //
  //   the dropdown  needs the profile NAMES          44 names, ~700 bytes
  //   playback      needs to pick from the CLIP LISTS 3,899 voice paths, 412 KB
  //                                                   + ~845 ambient paths
  //
  // **Measured 31 Aug 2026 in dh-test, not estimated.** Shipping the clip lists
  // to every player on every login is half a megabyte of socket traffic to solve
  // a problem the GM's client can solve in one packet, so it does not.
  //
  // SO: the GM publishes the NAMES (tiny, and only the dropdown needs them), and
  // a seat that cannot browse DELEGATES the actual firing to the active GM, which
  // picks a clip and broadcasts it exactly as it does for its own events. Everyone
  // hears the same clip, including the player who triggered it - which is the
  // point, and is stronger than sharing lists: with lists, two clients could pick
  // two different clips for one event.
  //
  // Only `game.users.activeGM` answers, so three GMs do not fire three copies.
  // NO GM ONLINE: nothing is played and nothing is logged - the same behaviour as
  // before, deliberately, because clip selection has nowhere to happen.
  // STALE IF: FILES_BROWSE becomes default for role 1, or a server-side listing
  // endpoint appears (then a browse-less seat could pick for itself).
  const MANIFEST_TRIES    = 5;
  const MANIFEST_RETRY_MS = 4000;
  let _reqTries = 0, _reqTimer = null;
  let _sharedNames = null;                       // profile names received from the GM

  const _haveNames = () => Array.isArray(_sharedNames)
    ? _sharedNames.length > 0
    : Object.keys(_cache.profiles ?? {}).length > 0;

  // `to` null = everyone (a push after a rescan); a user id = answering one request.
  //
  // **NEVER PUBLISHES AN EMPTY LIST.** `scanSfx` can finish while `scan` is still
  // walking 44 profile folders, and the debounced publish it triggers then sent
  // `names: []`, which players adopted over a good list - the console read
  // "44 ... / 0 ... / 44 ..." on a player seat, 1 Sept 2026, with the dropdown
  // momentarily empty in between. An empty list carries no information a player
  // can use, so it is never worth sending. STALE IF: publishing moves somewhere
  // that must be able to say "the GM now has none".
  // A BROADCAST (`to` null) is skipped when the list has not changed since the
  // last one. A TARGETED answer (`to` = a user id) always sends: that seat is
  // asking precisely because it has nothing.
  let _lastPublished = null;
  function _publishNames(to = null) {
    if (!game.user?.isGM) return;
    const names = Object.keys(_cache.profiles ?? {});
    if (!names.length) return;
    const sig = names.join(" ");
    if (to === null && sig === _lastPublished) return;
    if (to === null) _lastPublished = sig;
    game.socket?.emit(SOCKET, { aflpVoice: true, kind: "names", to, names });
  }

  // Publish from the END of a scan rather than from each caller, so every path
  // that refills the cache - login, the sheet's Rescan button, the voice-folder
  // and SFX settings - reaches the players without its own publish call.
  //
  // **THE DEBOUNCE HAS TO OUTLAST THE GAP BETWEEN THE TWO SCANS.** Measured
  // 1 Sept 2026: `scanSfx` finishes ~830 ms before `scan` does, so a 500 ms window
  // published twice per rescan. 2 s covers the measured gap; the unchanged-list
  // check above is the real guard, since a slower disk could stretch it further.
  let _pubTimer = null;
  function _publishSoon() {
    if (!game.user?.isGM) return;
    clearTimeout(_pubTimer);
    _pubTimer = setTimeout(() => _publishNames(), 2000);
  }

  function _adoptNames(names) {
    if (!Array.isArray(names) || !names.length) return;
    clearTimeout(_reqTimer);
    // A login answers a request AND catches the userConnected push AND the
    // end-of-scan push, so the same list arrives several times. Adopting it again
    // would log and re-render each sheet for nothing.
    if (Array.isArray(_sharedNames) && _sharedNames.join(" ") === names.join(" ")) return;
    _sharedNames = names;
    console.log(`AFLP Voice | ${names.length} voice profile(s) received from the GM`);
    // Repaint any open sheet so the voice dropdown fills without a reload.
    try {
      const apps = foundry.applications?.instances?.values?.() ?? Object.values(ui.windows ?? {});
      for (const app of apps) if (app?.actor) app.render?.(false);
    } catch (e) { /* cosmetic only */ }
  }

  // Ask the active GM for the profile names, retrying while the GM's own scan
  // finishes (or while no GM is logged in yet). Gives up after MANIFEST_TRIES
  // rather than asking forever; a GM rescan pushes to everyone anyway.
  function _requestManifest() {
    if (_haveNames() || _reqTries >= MANIFEST_TRIES) return;
    _reqTries++;
    game.socket?.emit(SOCKET, { aflpVoice: true, kind: "namesReq", userId: game.user?.id });
    clearTimeout(_reqTimer);
    _reqTimer = setTimeout(_requestManifest, MANIFEST_RETRY_MS);
  }

  // ── Delegation ──────────────────────────────────────────────────────────────
  // A seat with no clip lists asks the active GM to fire the event. Returns true
  // when the request went out, false when there is no GM to ask (caller then does
  // nothing, which is the pre-existing silent behaviour).
  const _mustDelegate = () => !_canBrowse();
  function _delegate(fn, args) {
    if (!game.users?.activeGM) return false;
    game.socket?.emit(SOCKET, { aflpVoice: true, kind: "req", fn, args });
    return true;
  }
  // Runs ON THE ACTIVE GM only. `fn` is checked against this map rather than
  // called by name, so a malformed or hostile packet cannot reach anything else.
  // `reactPosition` is deliberately absent: it calls play/_playMoan, which
  // delegate themselves, so routing it too would fire the event twice.
  const _REQ = {
    play:    (a) => play(a.eventKey, fromUuidSync(a.uuid), { units: a.units ?? 0 }),
    moan:    (a) => _playMoan(fromUuidSync(a.uuid), { onlyOnClimb: !!a.onlyOnClimb, tierBoost: a.tierBoost ?? 0 }),
    playSfx: (a) => playSfx(a.category),
    test:    (a) => testStep(a.actorId, a.profile, { broadcast: true }),
  };
  function _serveReq(data) {
    if (game.users?.activeGM?.id !== game.user?.id) return;
    const h = _REQ[data?.fn];
    if (!h) return;
    try { h(data.args ?? {}); }
    catch (e) { console.warn("AFLP Voice | delegated request failed:", data?.fn, e?.message ?? e); }
  }

  async function scan() {
    if (_cache.scanning) return _cache.scanning;
    // Cannot browse: the manifest comes from the GM instead. Asking is safe to
    // repeat - _requestManifest no-ops once a manifest has landed.
    if (!_canBrowse()) { _requestManifest(); return _cache.profiles; }
    // Always scan the bundled soundpack profiles; add the user's optional extra
    // folder if set and distinct. Later base wins on name collision (user override).
    const norm  = (s) => (s || "").replace(/\/+$/, "");
    const bases = [VA_BUNDLED];
    const custom = folder();
    if (custom && norm(custom) !== norm(VA_BUNDLED)) bases.push(custom);
    const run = (async () => {
      const FP = _FP();
      const profiles = {};
      for (const base of bases) {
        try {
          const top = await FP.browse("data", base);
          for (const dir of (top?.dirs ?? [])) {
            const name = dir.split("/").filter(Boolean).pop();
            if (!name) continue;
            const ev = {};
            for (const e of EVENTS) {
              try {
                const r = await FP.browse("data", `${dir}/${e}`);
                ev[e] = (r?.files ?? []).filter(f => AUDIO_RE.test(f));
              } catch (_) { ev[e] = []; }
            }
            // moan tiers: <profile>/moan/1 .. /6
            const moan = {};
            for (let t = 1; t <= MOAN_TIERS; t++) {
              try {
                const r = await FP.browse("data", `${dir}/moan/${t}`);
                moan[t] = (r?.files ?? []).filter(f => AUDIO_RE.test(f));
              } catch (_) { moan[t] = []; }
            }
            ev.moan = moan;
            profiles[name] = ev;
          }
        } catch (e) {
          console.warn("AFLP Voice | folder scan failed:", base, e?.message ?? e);
        }
      }
      _cache = { profiles, ts: Date.now(), scanning: null };
      _publishSoon();
      return profiles;
    })();
    _cache.scanning = run;
    return run;
  }

  // A browse-less seat has no scan of its own, so the dropdown lists the names the
  // GM published. Falls back to this seat's own scan everywhere else.
  const profileNames = () => (Array.isArray(_sharedNames) ? [..._sharedNames] : Object.keys(_cache.profiles))
    .sort((a, b) => a.localeCompare(b));

  function _pickClip(profile, eventKey) {
    const p = _cache.profiles[profile];
    const list = p?.[eventKey];
    if (!list || !list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  // Pick a moan clip for a tier, falling back to the nearest lower tier with clips
  // so partial packs (e.g. only tiers 3 and 6 filled) still play something.
  function _pickMoan(profile, tier) {
    const moan = _cache.profiles[profile]?.moan;
    if (!moan) return null;
    for (let t = Math.min(tier, MOAN_TIERS); t >= 1; t--) {
      const list = moan[t];
      if (list && list.length) return list[Math.floor(Math.random() * list.length)];
    }
    return null;
  }

  // Recursively gather audio files under a folder (bounded depth/count).
  async function _gatherAudio(FP, dir, depth = 0, acc = []) {
    if (depth > 4 || acc.length >= 400) return acc;
    let r; try { r = await FP.browse("data", dir); } catch (_) { return acc; }
    for (const f of (r?.files ?? [])) if (AUDIO_RE.test(f)) acc.push(f);
    for (const d of (r?.dirs ?? [])) await _gatherAudio(FP, d, depth + 1, acc);
    return acc;
  }

  // Scan the SFX base for each category, recursively, including the OpenNSFW pack
  // folder aliases - so dropping the pack in whole or curating into our clean
  // category folders both work.
  async function scanSfx() {
    // Same seat rule as scan(): _gatherAudio already swallows the permission
    // throw, but without this a player login fires ~40 doomed browse requests.
    // Such a seat never picks an ambient clip itself - it delegates to the GM -
    // so it keeps an empty _sfxCache and does not scan.
    if (!_canBrowse()) return _sfxCache;
    const FP = _FP();
    const base = sfxBase();
    const out = {};
    for (const cat of SFX_CATEGORIES) {
      const sources = [cat, ...(SFX_ALIASES[cat] ?? [])];
      const acc = [];
      for (const s of sources) await _gatherAudio(FP, `${base}/${s}`, 0, acc);
      // Floor fallback: if the soundpack gave us nothing for a floor category,
      // fall back to the clips shipped inside this module at FLOOR_BASE/<cat>.
      if (!acc.length && FLOOR_CATS.has(cat)) await _gatherAudio(FP, `${FLOOR_BASE}/${cat}`, 0, acc);
      out[cat] = [...new Set(acc)];
    }
    _sfxCache = out;
    await _scanCumflation(FP, base);
    _publishSoon();
    return out;
  }
  // Scan the curated cumflation sets (each weighted) and the big-load set.
  async function _scanCumflation(FP, base) {
    const sets = {};
    for (const [rel, weight] of CUMFLATION_SETS) {
      const acc = []; await _gatherAudio(FP, `${base}/${rel}`, 0, acc);
      sets[rel] = { files: [...new Set(acc)], weight };
    }
    const big = []; await _gatherAudio(FP, `${base}/${CUMFLATION_BIG_SET}`, 0, big);
    _cfSets = sets; _cfBig = [...new Set(big)];
  }
  function _pickSfx(cat) {
    const list = _sfxCache[cat];
    if (!list || !list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }
  const _sfxLast = new Map();   // category -> last play timestamp (collapses double-fires)
  function _shuffled(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }

  // Build a back-to-back sequence of DIFFERENT clips from a category to fill about
  // targetMs. Ambient one-shot folders (plap/gluk/schlick) are big bags of ~0.4s
  // clips, so a sustained action plays a varied train instead of one clip looped.
  // Returns [{ src, at }] where `at` is the ms offset from the start.
  // Cache measured SFX clip durations so repeated/longer trains don't reload the
  // same clips every advance (the plap/gluk bags are reused constantly).
  const _sfxDurCache = new Map();   // src -> seconds
  // Pause inserted between hits at the lowest intensity (tier 1); scales to 0 at the
  // top tier, so low arousal = slow, spaced plaps and high arousal = full speed.
  const MAX_SFX_GAP_MS = 380;
  async function _buildTrain(cat, targetMs, tier = 0) {
    const list = _sfxCache[cat];
    if (!list || !list.length) return [];
    const Sound = foundry?.audio?.Sound;
    const train = [];
    let total = 0, i = 0;
    let order = _shuffled(list);
    // Fill the WHOLE target window (e.g. a long moan). On reaching the end of the
    // shuffled list, reshuffle and keep going - a looped but varied train - so the
    // plaps run to the end of the moan instead of stopping after one pass. CAP is a
    // safety ceiling (covers ~15s even with very short clips).
    const CAP = 240;
    // Intensity pacing (tier>0): bigger gap at low arousal, none at the top tier.
    const gapBase = tier > 0
      ? MAX_SFX_GAP_MS * (1 - (Math.min(tier, MOAN_TIERS) - 1) / (MOAN_TIERS - 1))
      : 0;
    while (total < targetMs && train.length < CAP) {
      if (i >= order.length) { order = _shuffled(list); i = 0; }
      const src = order[i]; i++;
      let dur = _sfxDurCache.get(src);
      if (dur == null) {
        dur = 0.4;                                     // fallback if duration unreadable
        if (Sound) { try { const s = new Sound(src); await s.load(); dur = s.duration || 0.4; } catch (_) {} }
        _sfxDurCache.set(src, dur);
      }
      train.push({ src, at: Math.round(total) });
      total += dur * 1000;
      // Organic pause between hits (randomized ±40% around the intensity-derived gap).
      if (gapBase > 0) total += gapBase * (0.6 + Math.random() * 0.8);
    }
    return train;
  }
  // Schedule each clip of a prebuilt train as a one-shot at its offset.
  // Active train timeouts per key, so a fresh advance can cancel the previous
  // (now-stale) train for the same actor and re-size it to the current moan -
  // keeps the plap/slide train monophonic and matched even through rapid bursts.
  const _trainTimers = new Map();   // key -> [timeoutId,...]
  function _cancelTrain(key) {
    const ids = _trainTimers.get(key);
    if (ids) { for (const id of ids) clearTimeout(id); _trainTimers.delete(key); }
  }
  function _playTrainLocal(train, vol, key = null) {
    if (!train || !train.length || mutedHere()) return;
    const v = _clamp01(vol, 0);
    if (!(v > 0)) return;
    if (key) _cancelTrain(key);
    const Sound = foundry?.audio?.Sound;
    const AH = foundry?.audio?.AudioHelper ?? globalThis.AudioHelper;
    const ids = [];
    for (const item of train) {
      const id = setTimeout(async () => {
        try {
          if (Sound) { const s = new Sound(item.src); await s.load(); await s.play({ loop: false, volume: v }); }
          else AH?.play({ src: item.src, volume: v, autoplay: true, loop: false }, false);
        } catch (_) {}
      }, item.at);
      ids.push(id);
    }
    if (key) _trainTimers.set(key, ids);
  }
  // Ambient positional SFX as a varied sequence (~MIN_LEN). De-duped against the
  // paired initiator/receiver double-fire; broadcast as a train so other clients
  // hear the same sequence.
  async function _emitSfxTrain(cat, broadcast, targetMs = 0, tier = 0, key = null) {
    if (!cat) return;
    // De-dupe only the unkeyed ambient/event trains (collapses the paired
    // initiator/receiver double-fire). Keyed advance trains skip this and instead
    // cancel-and-replace via _playTrainLocal, so each advance gets a full train
    // sized to the CURRENT moan (fixes plaps falling short during rapid bursts).
    if (!key) {
      const now = Date.now();
      if ((now - (_sfxLast.get(cat) || 0)) < 200) return;
      _sfxLast.set(cat, now);
    }
    // Fill the matched moan length when given (targetMs), else the default window.
    const target = targetMs > 0 ? targetMs : MIN_LEN * 1000;
    const train = await _buildTrain(cat, target, tier);
    if (!train.length) return;
    _playTrainLocal(train, sfxVolume(), key);
    if (broadcast) game.socket?.emit(SOCKET, { aflpVoice: true, kind: "sfxTrain", train, key });
  }
  // One-shot SFX for event stings (cum / title): the whole clip once,
  // clipped if very long; no loop-fill.
  function _emitSfx(cat, broadcast) {
    if (!cat) return;
    const now = Date.now();
    if ((now - (_sfxLast.get(cat) || 0)) < 200) return;
    _sfxLast.set(cat, now);
    const src = _pickSfx(cat);
    if (!src) return;
    _playShaped(src, sfxVolume(), {});
    if (broadcast) game.socket?.emit(SOCKET, { aflpVoice: true, src, kind: "sfx", shape: {} });
  }
  // Fire the activity-appropriate ambient sequence for an actor, based on the HOLE
  // of their current H-Scene position. Profile-independent; layered over voice.
  function _maybeSfx(actor, broadcast, { targetMs = 0, tier = 0, keyed = false } = {}) {
    if (!sfxEnabled()) return;
    const posId = window.AFLP?.HScene?.positionForActor?.(actor.id);
    if (!posId) return;
    const hole = window.AFLP?.getPosition?.(posId)?.hole ?? null;
    const cat = HOLE_SFX[hole] ?? POS_SFX_EXTRA[posId];
    _emitSfxTrain(cat, broadcast, targetMs, tier, keyed ? `${actor.id}:${cat}` : null);
  }

  // Play a global SFX category on demand (event stings like cum/title).
  // Not position-bound and needs no profile; gated only by the SFX toggle.
  function playSfx(category, { broadcast = true } = {}) {
    try {
      if (!sfxEnabled()) return;
      if (_mustDelegate()) { _delegate("playSfx", { category }); return; }
      _emitSfx(category, broadcast);
    } catch (_) {}
  }

  // Cumflation sting: weighted pick across the curated cum sets, or the big-load
  // set for a large load. Picked here (on the firing client) and broadcast
  // as a single clip so all clients play the same one.
  function _pickCumflation({ units = 0 } = {}) {
    if (units >= CUMFLATION_BIG_LOAD && _cfBig.length) {
      return _cfBig[Math.floor(Math.random() * _cfBig.length)];
    }
    const pool = Object.values(_cfSets).filter(s => s.files.length);
    if (!pool.length) return null;
    const total = pool.reduce((a, s) => a + s.weight, 0);
    let r = Math.random() * total, chosen = pool[pool.length - 1];
    for (const s of pool) { r -= s.weight; if (r <= 0) { chosen = s; break; } }
    return chosen.files[Math.floor(Math.random() * chosen.files.length)];
  }
  function _emitCumflationSfx(opts, broadcast) {
    if (!sfxEnabled()) return;
    const now = Date.now();
    if ((now - (_sfxLast.get("cumflation") || 0)) < 200) return;
    _sfxLast.set("cumflation", now);
    const src = _pickCumflation(opts);
    if (!src) return;
    _playShaped(src, sfxVolume(), {});
    if (broadcast) game.socket?.emit(SOCKET, { aflpVoice: true, src, kind: "sfx", shape: {} });
  }

  // Whether an actor is in an ORAL act now, and in which role. Used so the wet
  // "gluk" never overlaps a closed-mouth moan/climax: the orally-used receiver
  // gags (oral VO), the giver stays vocally silent, and gluk carries the act.
  function _oralRole(actor) {
    const H = window.AFLP?.HScene;
    if (!H || !actor) return null;
    const id = actor.id;
    try {
      if (H.receivedHoleForActor?.(id) === "oral") return "receiver";
      const pos = H.positionForActor?.(id);
      if (pos && window.AFLP?.getPosition?.(pos)?.hole === "oral") return "giver";
    } catch (_) {}
    return null;
  }

  // ── Playback ────────────────────────────────────────────────────────────────
  // Target window for a single sounding "instance": short clips repeat to fill,
  // long clips are clipped with a fade (or, for build-up events, played from near
  // the end so the crescendo is kept).
  const MIN_LEN = 3;     // seconds: fill shorter clips up to about this
  const MAX_LEN = 4;     // seconds: clip longer clips down to about this (was 12)
  const FADE_MS = 600;   // fade in/out duration
  // Positional SFX trains fall back to this window when the receiver has no
  // vocalization to pace against (no profile / missing clip).
  const DEFAULT_TRAIN_MS = 4000;
  // Repeat-to-fill applies to SFX only (mechanical sounds). Voice clips play once
  // (a repeated voice take is too obviously the same sound).

  function _scheduleStop(sound, afterMs, fadeMs) {
    const at = Math.max(0, afterMs - fadeMs);
    setTimeout(() => {
      try { sound.fade(0, { duration: fadeMs }); } catch (_) {}
      setTimeout(() => { try { sound.stop(); } catch (_) {} }, fadeMs + 60);
    }, at);
  }

  // A "channel" makes voice monophonic per actor: a new clip on the same channel
  // fades and replaces any still-playing one (so an actor never overlaps itself).
  // SFX pass no channel and may overlap freely.
  const _voiceCh = new Map();   // channel -> currently playing Sound
  function _cutChannel(channel) {
    if (!channel) return;
    const prev = _voiceCh.get(channel);
    if (prev) {
      try { prev.fade(0, { duration: 180 }); } catch (_) {}
      setTimeout(() => { try { prev.stop(); } catch (_) {} }, 220);
    }
    _voiceCh.delete(channel);
  }

  // Shaped playback. fillLen>0 enables repeat-to-fill for short clips (SFX only);
  // endAnchor plays the tail of an over-long clip (climax/edge) so we keep the peak;
  // channel makes the sound monophonic for that actor (cuts the previous clip).
  // Shaped playback. fillLen>0 enables repeat-to-fill for short clips (SFX only);
  // endAnchor plays the tail of an over-long clip (climax/edge) so we keep the peak;
  // channel makes the sound monophonic for that actor (cuts the previous clip).
  // Returns the effective play length in ms (0 if nothing played), so a caller can
  // match a layered sound (e.g. plap train) to this clip's length.
  async function _playShaped(src, vol, { endAnchor = false, fillLen = 0, channel = null } = {}) {
    if (!src || mutedHere()) return 0;
    const v = _clamp01(vol, 0);
    if (!(v > 0)) return 0;
    try {
      const Sound = foundry?.audio?.Sound;
      const AH = foundry?.audio?.AudioHelper ?? globalThis.AudioHelper;
      if (!Sound) { AH?.play({ src, volume: v, autoplay: true, loop: false }, false); return 0; }
      const s = new Sound(src);
      await s.load();
      if (channel) { _cutChannel(channel); _voiceCh.set(channel, s); }
      const dur = s.duration || 0;
      if (dur > 0 && dur < MIN_LEN && fillLen > 0) {
        const target = Math.max(MIN_LEN, fillLen);              // repeat to fill the window
        await s.play({ loop: true, volume: v, fade: FADE_MS });
        _scheduleStop(s, target * 1000, FADE_MS);
        return Math.round(target * 1000);
      } else if (dur > MAX_LEN) {
        if (endAnchor) {
          await s.play({ offset: Math.max(0, dur - MAX_LEN), loop: false, volume: v, fade: FADE_MS });
        } else {
          await s.play({ loop: false, volume: v, fade: FADE_MS });
          _scheduleStop(s, MAX_LEN * 1000, FADE_MS);
        }
        return MAX_LEN * 1000;
      } else {
        await s.play({ loop: false, volume: v, fade: FADE_MS });
        return Math.round(dur * 1000);
      }
    } catch (e) {
      console.warn("AFLP Voice | playback failed:", e?.message ?? e);
      return 0;
    }
  }
  // Thin one-shot wrapper (whole clip, clip-if-long, no fill): used for incoming
  // broadcasts that carry no shape and for simple cases.
  function _playClip(src, vol, shape = {}) { _playShaped(src, vol, shape); }
  // Shaping hints per event, used both locally and sent to other clients so a
  // broadcast clip is shaped the same way everywhere.
  const _shapeFor = (eventKey) => ({ endAnchor: eventKey === "climax" || eventKey === "edge", fillLen: 0 });

  // ── Test playback (stepwise) ─────────────────────────────────────────────────
  // The sheet Test button plays ONE clip per click and advances to the next step
  // each click, cycling: moan tiers (1..6) first, then advance, struggle, climax,
  // cumflation. Steps with no clips are skipped. Plays only for the clicking user.
  const TEST_ORDER = ["oral", "struggle", "edge", "climax", "cumflation", "defeated", "mindbreak"];
  const _cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const _hasClips = (profile, ev) => ((_cache.profiles[profile]?.[ev]?.length) || 0) > 0;
  const _availableEvents = (profile) => TEST_ORDER.filter(ev => _hasClips(profile, ev));
  const _testStep = new Map();   // `${actorId}::${profile}` -> next index

  function _playOne(profile, ev, channel = null, broadcast = false) {
    const src = _pickClip(profile, ev);
    if (!src) return false;
    const shape = { ..._shapeFor(ev), channel };
    if (broadcast) game.socket?.emit(SOCKET, { aflpVoice: true, src, kind: "voice", shape });
    _playShaped(src, volume(), shape);
    return true;
  }

  // Build the ordered, populated step list for a profile.
  function _testSteps(profile) {
    const steps = [];
    const moan = _cache.profiles[profile]?.moan ?? {};
    for (let t = 1; t <= MOAN_TIERS; t++) {
      if ((moan[t]?.length || 0) > 0) steps.push({ kind: "moan", tier: t, label: `Moan ${t}` });
    }
    for (const ev of TEST_ORDER) {
      if (_hasClips(profile, ev)) steps.push({ kind: "event", ev, label: _cap(ev) });
    }
    return steps;
  }

  // Play the next step for this actor/profile; returns its label or null.
  // `broadcast` is only set when the GM is servicing a delegated Test from a seat
  // that has no clip lists - that seat cannot hear its own preview otherwise, so
  // the whole table hears one clip. A local Test stays local, as it always was.
  function testStep(actorId, profile, { broadcast = false } = {}) {
    if (!profile) return null;
    if (_mustDelegate()) return _delegate("test", { actorId, profile }) ? "Test" : null;
    const steps = _testSteps(profile);
    if (!steps.length) return null;
    const key = `${actorId}::${profile}`;
    const i = (_testStep.get(key) || 0) % steps.length;
    const step = steps[i];
    _testStep.set(key, i + 1);
    if (step.kind === "moan") {
      const src = _pickMoan(profile, step.tier);
      if (src) {
        const shape = { channel: actorId };
        if (broadcast) game.socket?.emit(SOCKET, { aflpVoice: true, src, kind: "voice", shape });
        _playShaped(src, volume(), shape);
      }
    }
    else _playOne(profile, step.ev, actorId, broadcast);
    return step.label;
  }

  // play(eventKey, actor): fire the ambient SFX layer (profile-independent) and,
  // if the actor has a voice profile, a profile clip. A recent climax silences a
  // following advance/struggle for the same actor; cumflation is never suppressed.
  // play(eventKey, actor): fire the ambient SFX layer (profile-independent) and,
  // if the actor has a voice profile, a profile clip. A recent climax silences a
  // following advance/struggle for the same actor; cumflation is never suppressed.
  // Returns the effective voice-clip length in ms (0 if nothing voiced), so a
  // caller can match a layered SFX train (e.g. the oral slide) to the clip.
  async function play(eventKey, actor, { broadcast = true, units = 0 } = {}) {
    try {
      if (!actor || !EVENTS.includes(eventKey)) return 0;
      // No clip lists on this seat: the active GM fires it instead and broadcasts,
      // so this client hears it too. Returns 0 length - a caller sizing an SFX
      // train off the clip gets the default window rather than a matched one.
      if (_mustDelegate()) { _delegate("play", { eventKey, uuid: actor.uuid, units }); return 0; }
      const id  = actor.id;
      const now = Date.now();
      if (eventKey === "climax") _climaxAt.set(id, now);
      else if (eventKey === "struggle" || eventKey === "oral") {
        const t = _climaxAt.get(id);
        if (t && (now - t) < SUPPRESS_MS) return 0;   // silenced by a recent climax
      }
      // Ambient SFX layer - independent of the voice profile and the voice toggle
      _maybeSfx(actor, broadcast);
      if (eventKey === "cumflation") _emitCumflationSfx({ units }, broadcast);
      else if (EVENT_SFX[eventKey]) playSfx(EVENT_SFX[eventKey], { broadcast });  // event sting (cum)
      // Voice profile layer
      if (!enabled()) return 0;
      const profile = actor.getFlag?.(_scope(), "voiceProfile");
      if (!profile) return 0;
      // Oral act: the mouth is busy, so no open-mouth climax/voice over the gluk.
      // Receiver gags (oral VO); giver stays vocally silent (gluk carries it).
      if (eventKey === "climax") {
        const role = _oralRole(actor);
        if (role === "giver") return 0;
        if (role === "receiver") {
          const gag = _pickClip(profile, "oral");
          if (gag) {
            const sh = { channel: id };
            if (broadcast) game.socket?.emit(SOCKET, { aflpVoice: true, src: gag, kind: "voice", shape: sh });
            return await _playShaped(gag, volume(), sh);
          }
          return 0;
        }
      }
      const src = _pickClip(profile, eventKey);
      if (!src) {
        // Pleasure-adjacent events fall back to a moan so they don't need their own
        // clips; distinct states (oral/struggle/defeated/mindbreak) stay silent.
        if (eventKey === "edge" || eventKey === "cumflation") _playMoan(actor);
        return 0;
      }
      const shape = { ..._shapeFor(eventKey), channel: id };
      if (broadcast) game.socket?.emit(SOCKET, { aflpVoice: true, src, kind: "voice", shape });
      return await _playShaped(src, volume(), shape);
    } catch (e) {
      console.warn("AFLP Voice | play failed:", e?.message ?? e);
      return 0;
    }
  }

  // Play a moan at the actor's current arousal tier. onlyOnClimb=true restricts to
  // upward tier crossings (passive arousal); advances play every time. This is the
  // single source of act vocalization - there is no separate "advance" voice.
  async function _playMoan(actor, { onlyOnClimb = false, tierBoost = 0 } = {}) {
    if (!actor) return 0;
    // Delegated like play(). NOTE the tier-climb guard then runs against the GM's
    // _moanTier map rather than this seat's; the tier itself is read from the
    // actor's flags, so the worst case is one repeated or skipped moan when a
    // player's client and the GM's disagree about the previous tier.
    if (_mustDelegate()) { _delegate("moan", { uuid: actor.uuid, onlyOnClimb, tierBoost }); return 0; }
    const id   = actor.id;
    const tier = _arousalTier(actor);
    const prev = _moanTier.get(id) ?? 0;
    _moanTier.set(id, tier);                       // track every change (incl. down)
    if (!enabled() || tier < 1) return 0;
    if (onlyOnClimb && tier <= prev) return 0;
    if (_oralRole(actor)) return 0;   // mouth busy: gluk + gag VO carry oral acts, no moan
    const profile = actor.getFlag?.(_scope(), "voiceProfile");
    if (!profile) return 0;
    const ct = _climaxAt.get(id);
    if (ct && (Date.now() - ct) < SUPPRESS_MS) return 0;   // climax owns the moment
    // tierBoost picks a more intense clip (e.g. group repositions) without
    // disturbing the real-arousal guards or _moanTier tracking above.
    const pickTier = Math.min(6, tier + (tierBoost || 0));
    const src = _pickMoan(profile, pickTier);
    if (!src) return 0;
    const shape = { channel: id };
    game.socket?.emit(SOCKET, { aflpVoice: true, src, kind: "voice", shape });
    return await _playShaped(src, volume(), shape);   // effective moan length in ms
  }
  // Resync the tracked tier without playing (after a reset/set so the next climb
  // re-fires from the bottom instead of comparing against a stale high tier).
  function _resyncMoanTier(actor) {
    if (actor) _moanTier.set(actor.id, _arousalTier(actor));
  }

  // ── Sheet-tab dropdown ───────────────────────────────────────────────────────
  // Returns true when done (injected, already present, or not our sheet) and
  // false when the AFLP tab is not built yet (caller should retry).
  function _injectSheet(app, html) {
    try {
      const actor = app?.document ?? app?.actor ?? app?.object;
      if (!actor || actor.documentName !== "Actor") return true;
      const el = app?.element;
      const root = (el instanceof HTMLElement) ? el
                 : (el && el[0] instanceof HTMLElement) ? el[0]
                 : (html instanceof HTMLElement) ? html
                 : (html && html[0] instanceof HTMLElement) ? html[0]
                 : null;
      if (!root?.querySelector) return false;
      const tab = root.querySelector(".aflp-tab");
      if (!tab) return false;                              // tab not built yet -> retry
      if (tab.querySelector(".aflp-voice-ctl")) return true; // already injected

      const cur  = actor.getFlag(_scope(), "voiceProfile") || "";
      const names = profileNames();
      const opts = ['<option value="">(none)</option>']
        .concat(names.map(n => `<option value="${n}"${n === cur ? " selected" : ""}>${n}</option>`))
        .join("");

      const wrap = document.createElement("div");
      wrap.className = "aflp-voice-ctl";
      wrap.title = "AFLP voice profile for this actor. Set the Voice Folder in module settings with escalating moans in moan/1 .. moan/6 (used for arousal and sexual advances) plus per-event subfolders (climax, oral, struggle, cumflation, edge, defeated, mindbreak); Test steps through the pack; Rescan re-reads the folder.";
      wrap.style.cssText = "display:flex;align-items:center;gap:5px;margin:3px 0;font-size:11px;white-space:nowrap;opacity:0.8;";
      const btnCss = "flex:0 0 auto;width:auto;min-width:0;height:18px;line-height:16px;padding:0 6px;font-size:10px;";
      wrap.innerHTML =
        `<span style="font-weight:600;opacity:0.7;flex:0 0 auto;">Voice</span>` +
        `<select class="aflp-voice-select" style="flex:1 1 auto;min-width:0;height:18px;font-size:11px;padding:0 4px;">${opts}</select>` +
        `<button type="button" class="aflp-voice-test" style="${btnCss}">Test</button>` +
        `<button type="button" class="aflp-voice-rescan" style="${btnCss}">Rescan</button>`;
      tab.prepend(wrap);

      wrap.querySelector(".aflp-voice-select").addEventListener("change", async (e) => {
        const v = e.target.value;
        try {
          if (v) await actor.setFlag(_scope(), "voiceProfile", v);
          else   await actor.unsetFlag(_scope(), "voiceProfile");
        } catch (err) { console.warn("AFLP Voice | could not set profile:", err?.message ?? err); }
      });
      wrap.querySelector(".aflp-voice-test").addEventListener("click", (e) => {
        const btn = e.currentTarget;
        const sel = wrap.querySelector(".aflp-voice-select");
        const profile = (sel?.value || actor.getFlag(_scope(), "voiceProfile") || "").trim();
        if (!profile) { ui.notifications?.warn("AFLP: pick a voice profile to test."); return; }
        if (mutedHere() || volume() <= 0) { ui.notifications?.warn("AFLP: voice is muted or at zero volume on your client."); return; }
        const label = testStep(actor.id, profile);
        if (!label) { ui.notifications?.warn(`AFLP: profile "${profile}" has no clips yet. Add files and Rescan.`); return; }
        btn.textContent = label;   // show what just played (e.g. "Moan 3", "Climax")
        clearTimeout(btn._aflpT);
        btn._aflpT = setTimeout(() => { btn.textContent = "Test"; }, 1100);
      });
      wrap.querySelector(".aflp-voice-rescan").addEventListener("click", async () => {
        await Promise.all([scan(), scanSfx()]);
        ui.notifications?.info(!_canBrowse()
          ? `AFLP: asked the GM for the voice list (${profileNames().length} profile(s) so far). Profiles come from the GM's client.`
          : `AFLP: rescanned voice folder (${profileNames().length} profile(s)) and ambient SFX.`);
        // Re-render the sheet so the dropdown repopulates
        try { app.render?.(false); } catch (_) {}
      });
      return true;
    } catch (e) {
      console.warn("AFLP Voice | sheet inject failed:", e?.message ?? e);
      return true;
    }
  }

  // Retry briefly: sheet-tab builds .aflp-tab asynchronously, so the tab may not
  // exist on the first render tick. Re-resolve from the live app each attempt.
  function _tryInject(app, html, tries = 0) {
    let done = false;
    try { done = _injectSheet(app, html); } catch (_) { done = true; }
    if (!done && tries < 12) setTimeout(() => _tryInject(app, html, tries + 1), 100);
  }

  // ── Advance: wrap AFLP_Arousal.increment on its reason string ─────────────────
  // Both the initiator and the receiver get a "Sexual Advance" increment, so both
  // vocalize. (Struggle Snuggle is handled separately via condition application -
  // see _onRoleConditionCreate - because SS does not tag arousal with its name.)
  function _patchArousal() {
    const A = window.AFLP_Arousal;
    if (!A || typeof A.increment !== "function" || A._aflpVoicePatched) return;
    const orig = A.increment.bind(A);
    A.increment = async function (actor, amount, source = "", tokenId = null) {
      const r = await orig(actor, amount, source, tokenId);
      try {
        if (/Sexual Advance/i.test(String(source || ""))) {
          // ALL holes this actor currently receives in - a gangbang talent
          // taking oral + vaginal + anal at once fires gluk AND plap trains,
          // not just the first hole found (single-hole resolution was why a
          // facefucked talent produced no plaps for her other performers).
          const recvHoles = window.AFLP?.HScene?.receivedHolesForActor?.(actor.id)
            ?? (window.AFLP?.HScene?.receivedHoleForActor?.(actor.id) ? [window.AFLP.HScene.receivedHoleForActor(actor.id)] : []);
          const tier = _arousalTier(actor);
          if (recvHoles.length) {
            // This actor is a RECEIVER. THEIR vocalization (gag if any oral,
            // else moan) drives the positional SFX length. If the receiver has
            // no profile or no clip for the event, the trains still fire on a
            // default window - SFX is not hostage to VO availability.
            const oral = recvHoles.includes("oral");
            const cats = new Set(recvHoles.map(h => HOLE_SFX[h]).filter(Boolean));  // plap and/or gluk
            const voP = oral ? play("oral", actor) : _playMoan(actor);
            voP.then(ms => {
              const win = ms > 0 ? ms : DEFAULT_TRAIN_MS;
              const pace = oral && cats.size === 1 ? 0 : tier;   // solo oral keeps its own cadence
              for (const cat of cats) _emitSfxTrain(cat, true, win, cat === "gluk" ? 0 : pace, `${actor.id}:${cat}`);
              _emitSfxTrain("slide", true, win, pace, `${actor.id}:slide`);
            }).catch(() => {});
          } else {
            // PERFORMER (receives nothing): just their own grunt. No-hole positions
            // (fingering) carry their own SFX here, since no receiver hole covers them.
            const posId = window.AFLP?.HScene?.positionForActor?.(actor.id);
            const hole  = posId ? window.AFLP?.getPosition?.(posId)?.hole : null;
            const extra = (posId && !hole) ? POS_SFX_EXTRA[posId] : null;
            _playMoan(actor).then(ms => {
              if (extra) _emitSfxTrain(extra, true, ms > 0 ? ms : DEFAULT_TRAIN_MS, tier, `${actor.id}:${extra}`);
            }).catch(() => {});
          }
        } else {
          _playMoan(actor, { onlyOnClimb: true });     // passive arousal: moan on a tier-up
        }
      } catch (_) {}
      return r;
    };
    // Resync the moan-tier tracker after a reset/set so the next climb starts fresh.
    if (typeof A.set === "function" && !A._aflpVoiceSetPatched) {
      const origSet = A.set.bind(A);
      A.set = async function (actor, value, source = "", tokenId = null) {
        const r = await origSet(actor, value, source, tokenId);
        try { _resyncMoanTier(actor); } catch (_) {}
        return r;
      };
      A._aflpVoiceSetPatched = true;
    }
    A._aflpVoicePatched = true;
  }

  // ── Struggle Snuggle: fire when the Dominating / Submitting role is applied ────
  // SS gives the initiator "dominating" and the receiver "submitting"; both should
  // vocalize. These same role conditions are also applied by other forced-dominance
  // abilities (Four-Armed Ravish, Serpent Coil, Engulf, Abduct), so the struggle
  // clip plays whenever an actor enters one of those roles. GM-only so a single
  // client broadcasts to the table (createItem fires on every client).
  // Slug -> voice event for conditions whose application should vocalize.
  const COND_VOICE = {
    "dominating": "struggle",   // Struggle Snuggle initiator (and other dominance abilities)
    "submitting": "struggle",   // Struggle Snuggle receiver
    "mind-break": "mindbreak",  // Mind Break applied
    "defeated":   "defeated",   // Defeated applied (pre-mindbreak desperation)
  };
  function _onRoleConditionCreate(item) {
    try {
      if (!game.user?.isGM || !item?.actor) return;
      const ev = COND_VOICE[item.slug ?? item.system?.slug];
      if (ev) play(ev, item.actor);
    } catch (_) {}
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  // A receiver's vocal reaction to a partner repositioning / changing holes:
  // gag VO if the mouth is now occupied (oral), otherwise a moan at the current
  // tier. Uses the same paths as advances (so oral-suppression and broadcast apply).
  function reactPosition(actor, { intense = false } = {}) {
    if (!actor) return;
    const recv = window.AFLP?.HScene?.receivedHoleForActor?.(actor.id);
    if (recv === "oral") play("oral", actor);
    else _playMoan(actor, { tierBoost: intense ? 2 : 0 });
  }

  AFLP.Voice = window.AFLP_Voice = {
    EVENTS,
    play,
    playSfx,
    reactPosition,
    testStep,
    test(profile, eventKey) {
      // console helper: play one event (given, or the first available)
      if (!profile) return null;
      if (eventKey) return _playOne(profile, eventKey) ? eventKey : null;
      const avail = _availableEvents(profile);
      if (!avail.length) return null;
      _playOne(profile, avail[0]);
      return avail[0];
    },
    scan,
    scanSfx,
    profiles: profileNames,
    // True when this seat cannot browse and therefore takes its clip lists from
    // the GM's client. UI uses it to say where the list comes from.
    sharedSeat: () => !_canBrowse(),
    // small inspector for the console: counts per profile/event (no paths)
    summary() {
      const out = {};
      for (const [name, ev] of Object.entries(_cache.profiles)) {
        const o = Object.fromEntries(EVENTS.map(e => [e, (ev[e] ?? []).length]));
        const m = ev.moan ?? {};
        o.moan = Object.fromEntries(Array.from({ length: MOAN_TIERS }, (_, i) => [i + 1, (m[i + 1] ?? []).length]));
        out[name] = o;
      }
      return out;
    },
    // ambient SFX clip counts per category (no paths)
    sfxSummary() {
      const o = {};
      for (const c of SFX_CATEGORIES) o[c] = (_sfxCache[c] ?? []).length;
      return o;
    },
  };

  // ── Wiring ────────────────────────────────────────────────────────────────────
  // The module is imported from index.js inside its own ready hook, so "ready"
  // has already fired by the time this file runs - a Hooks.once("ready") here
  // would never execute. Run init now if the game is ready, else defer.
  function _init() {
    _patchArousal();
    // A seat that can browse scans for itself and, if it is a GM, publishes from
    // the end of the scan (_publishSoon). A seat that cannot browse asks instead -
    // scan/scanSfx route to _requestManifest.
    scan();
    scanSfx();
    game.socket?.on(SOCKET, (data) => {
      if (!data || data.aflpVoice !== true) return;
      // Profile names, and delegated firing. `emit` never loops back to the
      // sender, so a GM never adopts its own push nor answers its own request.
      if (data.kind === "namesReq") {
        if (game.users?.activeGM?.id === game.user?.id && _haveNames()) _publishNames(data.userId ?? null);
        return;
      }
      if (data.kind === "names") {
        if (data.to && data.to !== game.user?.id) return;
        if (_canBrowse()) return;              // this seat scans for itself; keep its own list
        _adoptNames(data.names);
        return;
      }
      if (data.kind === "req") { _serveReq(data); return; }
      if (data.kind === "sfxTrain") { _playTrainLocal(data.train, sfxVolume(), data.key || null); return; }
      if (!data.src) return;
      _playShaped(data.src, data.kind === "sfx" ? sfxVolume() : volume(), data.shape || {});
    });
    // A player who logs in before the GM gets nothing from the exchange above;
    // the GM's client publishes again as each user connects.
    if (game.user?.isGM) Hooks.on("userConnected", (user, connected) => {
      if (connected && !user.isGM && _haveNames()) _publishNames(user.id);
    });
  }
  if (game?.ready) _init();
  else Hooks.once("ready", _init);

  // Struggle Snuggle (and other dominance abilities): fire on role application.
  Hooks.on("createItem", _onRoleConditionCreate);

  // Inject the dropdown after sheet-tab has built its tab (slight delay covers
  // hook ordering; sheet-tab listens on the same render hooks).
  const _hook = (app, html) => _tryInject(app, html, 0);
  Hooks.on("renderApplicationV2", _hook);
  Hooks.on("renderActorSheet", _hook);
})();
