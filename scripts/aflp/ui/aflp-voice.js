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
  // Shipped soundpack lives in its own module at modules/aflp-soundpack/{aflp-voices,aflp-sfx}.
  // Bundled VA profiles always load from VA_BUNDLED; voiceFolder is an OPTIONAL
  // extra folder for the user's own additional profiles.
  const SOUNDPACK_BASE = "modules/aflp-soundpack";
  const VA_BUNDLED     = `${SOUNDPACK_BASE}/aflp-voices`;
  const SFX_BUNDLED    = `${SOUNDPACK_BASE}/aflp-sfx`;
  const folder     = () => (_get("voiceFolder", "") || "").trim();   // optional extra custom VA folder
  const volume     = () => _clamp01(_get("voiceVolume", 0.8), 0.8);
  const mutedHere  = () => _get("voiceMuteLocal", false) === true;
  const sfxEnabled = () => _get("sfxEnabled", true) !== false;
  const sfxVolume  = () => _clamp01(_get("sfxVolume", 0.7), 0.7);

  // ── Ambient SFX (from the AFLP Soundpack module) ─────────────────────────────
  // Generic activity sounds shipped in modules/aflp-soundpack/aflp-sfx/<category>/*.
  // They layer on top of profile voices, fire even with no profile assigned, and
  // are selected by the actor's current H-scene position; missing folders are
  // simply silent. SFX base is fixed to the shipped soundpack (no custom-path override).
  const SFX_BASE_DEFAULT = SFX_BUNDLED;
  const sfxBase = () => SFX_BUNDLED;
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
  const SFX_CATEGORIES = ["plap", "gluk", "schlick", "cum", "inflation", "title", "slosh", "slide"];
  // Folders from the bundled OpenNSFW SFX pack that also feed each category, so
  // the pack can be dropped in whole (its folder names) or curated into our clean
  // category folders - both are scanned, recursively.
  const SFX_ALIASES = {
    plap:      ["Plaps", "Skin Slides", "Sliding In & Out", "Wet Sounds", "Squish & Knots"],
    gluk:      ["Oral - Mouth"],
    schlick:   ["Fingering & Grinding"],
    cum:       ["Cum"],
    // "Inflation & Vore" (pack) is balloon/vore SFX - sounds wrong as a cumflation
    // sting. Leave inflation to a curated `inflation/` folder only (empty = silent;
    // the cumflation moan fallback still plays).
    inflation: [],
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

  async function scan() {
    if (_cache.scanning) return _cache.scanning;
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
      return profiles;
    })();
    _cache.scanning = run;
    return run;
  }

  const profileNames = () => Object.keys(_cache.profiles).sort((a, b) => a.localeCompare(b));

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
    const FP = _FP();
    const base = sfxBase();
    const out = {};
    for (const cat of SFX_CATEGORIES) {
      const sources = [cat, ...(SFX_ALIASES[cat] ?? [])];
      const acc = [];
      for (const s of sources) await _gatherAudio(FP, `${base}/${s}`, 0, acc);
      out[cat] = [...new Set(acc)];
    }
    _sfxCache = out;
    await _scanCumflation(FP, base);
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
  // One-shot SFX for event stings (cum / inflation / title): the whole clip once,
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
  // of their current H-scene position. Profile-independent; layered over voice.
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
    try { if (sfxEnabled()) _emitSfx(category, broadcast); } catch (_) {}
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
  const MAX_LEN = 12;    // seconds: clip longer clips down to about this
  const FADE_MS = 600;   // fade in/out duration
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

  function _playOne(profile, ev, channel = null) {
    const src = _pickClip(profile, ev);
    if (!src) return false;
    _playShaped(src, volume(), { ..._shapeFor(ev), channel });
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
  function testStep(actorId, profile) {
    if (!profile) return null;
    const steps = _testSteps(profile);
    if (!steps.length) return null;
    const key = `${actorId}::${profile}`;
    const i = (_testStep.get(key) || 0) % steps.length;
    const step = steps[i];
    _testStep.set(key, i + 1);
    if (step.kind === "moan") { const src = _pickMoan(profile, step.tier); if (src) _playShaped(src, volume(), { channel: actorId }); }
    else _playOne(profile, step.ev, actorId);
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
        ui.notifications?.info(`AFLP: rescanned voice folder (${profileNames().length} profile(s)) and ambient SFX.`);
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
          const recv = window.AFLP?.HScene?.receivedHoleForActor?.(actor.id);
          const tier = _arousalTier(actor);
          if (recv) {
            // This actor is a RECEIVER. THEIR vocalization (gag if oral, else moan)
            // drives the positional SFX, so the plaps/gluk + slide last as long as
            // HER moan - not the performer's. Hole comes from what they receive.
            const cat = HOLE_SFX[recv] || null;   // vaginal/anal -> plap, oral -> gluk
            if (recv === "oral") {
              play("oral", actor).then(ms => {
                if (ms > 0) {
                  if (cat) _emitSfxTrain(cat, true, ms, 0, `${actor.id}:${cat}`);   // gluk
                  _emitSfxTrain("slide", true, ms, 0, `${actor.id}:slide`);          // wet slide in place of plaps
                }
              }).catch(() => {});
            } else {
              _playMoan(actor).then(ms => {
                if (ms > 0) {
                  if (cat) _emitSfxTrain(cat, true, ms, tier, `${actor.id}:${cat}`);  // plap, paced by her intensity
                  _emitSfxTrain("slide", true, ms, tier, `${actor.id}:slide`);        // slide layered at the same cadence
                }
              }).catch(() => {});
            }
          } else {
            // PERFORMER (receives nothing): just their own grunt. No-hole positions
            // (fingering) carry their own SFX here, since no receiver hole covers them.
            const posId = window.AFLP?.HScene?.positionForActor?.(actor.id);
            const hole  = posId ? window.AFLP?.getPosition?.(posId)?.hole : null;
            const extra = (posId && !hole) ? POS_SFX_EXTRA[posId] : null;
            _playMoan(actor).then(ms => {
              if (extra) _emitSfxTrain(extra, true, ms, tier, `${actor.id}:${extra}`);
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
    scan();
    scanSfx();
    game.socket?.on(SOCKET, (data) => {
      if (!data || data.aflpVoice !== true) return;
      if (data.kind === "sfxTrain") { _playTrainLocal(data.train, sfxVolume(), data.key || null); return; }
      if (!data.src) return;
      _playShaped(data.src, data.kind === "sfx" ? sfxVolume() : volume(), data.shape || {});
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
