// ===========================================================================
// AFLP Cum Splatter  (aflp-splatter.js)
// ---------------------------------------------------------------------------
// Procedural, asset-free token + ground splatter driven by cumflation tier.
//
// v46 rendering:
//   - Two baked white splat atlases: a SHARPER one for token coats and a
//     slightly softer one for ground puddles (blur baked in; sprites tinted).
//   - A crisp SPECULAR SPECKLE texture (bright dots concentrated in the blob
//     centre) stamped additively over each splat -> the little bubbles/specks
//     that catch the light.
//   - A brighter sheen hotspot offset toward a fixed light direction
//     (upper-left) -> gloss + light-facing-edge catch.
//   - Token coats get a vertical gradient alpha MASK so the top edge (away
//     from gravity) dissolves while the bottom stays defined.
//
// Atlases are built once per session (white textures, tinted at use). Falls
// back to smooth circles if renderer/blur is unavailable.
//
//   COAT: container parented to the Token object (token-local space). Follows
//   the token; re-attached on refreshToken.
//   PUDDLE: anchored per-token in a Scene flag (shared + reload-safe), drawn
//   into one ground container on canvas.primary at sortLayer TILES (500).
//
// Overall tier matches aflp-hscene._cumflationWord:
//   overall = min(8, floor((anal+oral+vaginal)/3)); 9 = overall>=8 && facial>=8
// ===========================================================================

(() => {
  const SCOPE      = "world";
  const MODULE_ID  = "ardisfoxxs-lewd-pf2e";
  const PUDDLE_KEY = "splatterPuddles";
  const COAT_NAME  = "aflp-cum-coat";
  const START_TIER = 1;
  const LIGHT      = { x: -0.30, y: -0.42 };   // normalized light direction (upper-left)

  // ── Settings shims ────────────────────────────────────────────────────────
  const S = () => window.AFLP?.Settings ?? {};
  const sEnabled    = () => S().splatterEnabled    ?? true;
  const sIntensity  = () => S().splatterIntensity  ?? 1.0;
  const sIncludeNpc = () => S().splatterIncludeNpc ?? true;
  const sHideLocal  = () => S().splatterHideLocal  ?? false;
  const sColorHex   = () => S().splatterColor      ?? "#f1e6cf";
  const sQuality    = () => S().splatterQuality    ?? "medium";

  // Render-quality profiles. "high" reproduces the original full-fat render.
  // Lower tiers target the biggest performance costs first: texture resolution
  // (GPU fill + memory), blur passes, puddle texture resolution (the dominant
  // hit when many puddles are on the map), per-frame coat layer count, build-time
  // detail counts, and the optional film/pool extras. The cumflation body, core,
  // gloss and puddle silhouette are retained at every level.
  const QUALITY = {
    high:   { texRes: 1.0,  blurQ: 4, coatDetail: 1.0,  richLayers: true,  film: true,  pool: true,  puddleRes: 1.0,  puddleDetail: 1.0 },
    medium: { texRes: 0.75, blurQ: 2, coatDetail: 0.75, richLayers: true,  film: true,  pool: true,  puddleRes: 0.72, puddleDetail: 0.6 },
    low:    { texRes: 0.5,  blurQ: 1, coatDetail: 0.5,  richLayers: false, film: false, pool: false, puddleRes: 0.5,  puddleDetail: 0.4 },
  };
  const Q = () => QUALITY[sQuality()] ?? QUALITY.medium;

  // ── Seeded PRNG ────────────────────────────────────────────────────────────
  function _hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function _mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const _rng = (seed) => _mulberry32(typeof seed === "number" ? seed : _hash(String(seed)));

  // ── Colour helpers ────────────────────────────────────────────────────────
  function _color() {
    const hex = String(sColorHex()).replace("#", "").trim();
    const n = parseInt(hex, 16);
    return Number.isFinite(n) ? n : 0xf1e6cf;
  }
  function _lighten(color, amt = 0.25) {
    const r = Math.min(255, ((color >> 16) & 0xff) + 255 * amt);
    const g = Math.min(255, ((color >> 8) & 0xff) + 255 * amt);
    const b = Math.min(255, (color & 0xff) + 255 * amt);
    return (r << 16) | (g << 8) | b;
  }
  const _ADD_BLEND = (window.PIXI?.BLEND_MODES?.ADD) ?? "add";

  // ── PIXI v7/v8 Graphics shims (texture building only) ──────────────────────
  function _fillCircle(g, x, y, r, color, alpha) {
    if (typeof g.beginFill === "function") { g.beginFill(color, alpha); g.drawCircle(x, y, r); g.endFill(); }
    else { g.circle(x, y, r).fill({ color, alpha }); }
  }
  function _fillPoly(g, pts, color, alpha) {
    if (typeof g.beginFill === "function") { g.beginFill(color, alpha); g.drawPolygon(pts); g.endFill(); }
    else { g.poly(pts).fill({ color, alpha }); }
  }
  function _fillRect(g, x, y, w, h, color, alpha) {
    if (typeof g.beginFill === "function") { g.beginFill(color, alpha); g.drawRect(x, y, w, h); g.endFill(); }
    else { g.rect(x, y, w, h).fill({ color, alpha }); }
  }

  // ── Texture atlas ──────────────────────────────────────────────────────────
  const ROPE_W = 64, ROPE_H = 256, SPUNK_W = 192, SPUNK_H = 320;
  const _atlas = { built: false, ok: false, coat: [], puddle: [], spec: [], ropes: [], spunk: [], glow: null, grad: null, vignette: null };
  const _renderer = () => canvas?.app?.renderer;
  function _genTex(displayObj, w, h = w) {
    return _renderer().generateTexture(displayObj, { region: new PIXI.Rectangle(0, 0, w, h), resolution: Math.max(0.25, Q().texRes) });
  }
  function _blurWrap(child, strength) {
    const c = new PIXI.Container();
    c.addChild(child);
    try { c.filters = [new PIXI.BlurFilter(strength, Math.max(1, Q().blurQ))]; } catch (e) {}
    return c;
  }

  // Organic splatter body (white). `blurK` controls softness.
  function _buildSplatTexture(rng, size, blurK) {
    const g = new PIXI.Graphics();
    const cx = size / 2, cy = size / 2;
    const massN = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < massN; i++) {
      const ox = (rng() - 0.5) * size * 0.22, oy = (rng() - 0.5) * size * 0.22;
      _fillCircle(g, cx + ox, cy + oy, size * (0.10 + rng() * 0.13), 0xffffff, 1);
    }
    const midN = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < midN; i++) {
      const a = rng() * Math.PI * 2, d = size * (0.20 + rng() * 0.18);
      _fillCircle(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * (0.035 + rng() * 0.05), 0xffffff, 1);
    }
    const tearN = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < tearN; i++) {
      const a = rng() * Math.PI * 2, d = size * (0.18 + rng() * 0.16);
      const hx = cx + Math.cos(a) * d, hy = cy + Math.sin(a) * d, hr = size * (0.03 + rng() * 0.04);
      _fillCircle(g, hx, hy, hr, 0xffffff, 1);
      const tx = cx + Math.cos(a) * d * 0.4, ty = cy + Math.sin(a) * d * 0.4, perp = a + Math.PI / 2;
      _fillPoly(g, [hx + Math.cos(perp) * hr, hy + Math.sin(perp) * hr,
                    hx - Math.cos(perp) * hr, hy - Math.sin(perp) * hr, tx, ty], 0xffffff, 1);
    }
    const speckN = 8 + Math.floor(rng() * 10);
    for (let i = 0; i < speckN; i++) {
      const a = rng() * Math.PI * 2, d = size * (0.28 + rng() * 0.20);
      _fillCircle(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * (0.008 + rng() * 0.022), 0xffffff, 1);
    }
    const wrapped = _blurWrap(g, Math.max(1.5, size * blurK));
    const tex = _genTex(wrapped, size);
    wrapped.destroy({ children: true });
    return tex;
  }

  // Crisp specular speckles: bright dots, dense in the centre (the raised part),
  // a few mid-out. Kept sharp so they read as wet bubbles catching the light.
  function _buildSpecTexture(rng, size) {
    const g = new PIXI.Graphics();
    const cx = size / 2, cy = size / 2;
    const nC = 10 + Math.floor(rng() * 8);
    for (let i = 0; i < nC; i++) {
      const a = rng() * Math.PI * 2, d = size * 0.24 * (rng() * rng());   // squared => centre-biased
      _fillCircle(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * (0.006 + rng() * 0.018), 0xffffff, 1);
    }
    const nM = 5 + Math.floor(rng() * 6);
    for (let i = 0; i < nM; i++) {
      const a = rng() * Math.PI * 2, d = size * (0.20 + rng() * 0.16);
      _fillCircle(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * (0.004 + rng() * 0.012), 0xffffff, 1);
    }
    const wrapped = _blurWrap(g, size * 0.006);
    const tex = _genTex(wrapped, size);
    wrapped.destroy({ children: true });
    return tex;
  }

  // A flung cum rope: curving centerline (snake), width that bulges and
  // pinches along its length with tapered ends, and a fatter leading glob.
  function _buildRopeTexture(rng, w, h) {
    const g = new PIXI.Graphics();
    const steps = 44;
    const cx = w / 2;
    const bendAmp  = w * (0.18 + rng() * 0.14);
    const bendFreq = 1.2 + rng() * 1.6;
    const phase    = rng() * Math.PI * 2;
    const baseR    = w * (0.10 + rng() * 0.05);
    const nb = 2 + Math.floor(rng() * 2);
    const bulges = [];
    for (let i = 0; i < nb; i++) bulges.push({ c: 0.15 + rng() * 0.7, s: 0.05 + rng() * 0.06, a: 0.4 + rng() * 0.6 });
    let lastX = cx, lastY = 0;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const y = h * 0.05 + f * (h * 0.86);
      let x = cx + bendAmp * Math.sin(f * Math.PI * bendFreq + phase);
      x = Math.max(w * 0.16, Math.min(w * 0.84, x));
      const env = Math.min(1, f / 0.10) * Math.min(1, (1 - f) / 0.12);   // gentle, rounded ends
      let bw = 0;
      for (const b of bulges) bw += b.a * Math.exp(-((f - b.c) * (f - b.c)) / (2 * b.s * b.s));
      const r = Math.max(w * 0.04, baseR * (0.62 + bw) * (0.5 + 0.5 * env));
      _fillCircle(g, x, y, r, 0xffffff, 1);
      lastX = x; lastY = y;
    }
    _fillCircle(g, lastX, Math.min(h * 0.97, lastY + baseR * 0.4), baseR * 1.3, 0xffffff, 1);  // rounded leading glob
    const wrapped = _blurWrap(g, w * 0.035);
    const tex = _genTex(wrapped, w, h);
    wrapped.destroy({ children: true });
    return tex;
  }

  // One curving tapered drip with bulges and a rounded bead, drawn into g.
  function _drawTendril(g, x0, y0, len, baseR, bendAmp, targetX, rng) {
    const steps = 22;
    const bendFreq = 1 + rng() * 1.5;
    const phase = rng() * Math.PI * 2;
    const nb = 1 + Math.floor(rng() * 2);
    const bulges = [];
    for (let i = 0; i < nb; i++) bulges.push({ c: 0.2 + rng() * 0.6, s: 0.06 + rng() * 0.06, a: 0.3 + rng() * 0.5 });
    let lx = x0, ly = y0;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const y = y0 + f * len;
      const drift = x0 + (targetX - x0) * Math.min(1, f * 1.3);
      const x = drift + bendAmp * Math.sin(f * Math.PI * bendFreq + phase);
      const env = Math.min(1, f / 0.10) * Math.min(1, (1 - f) / 0.12);
      let bw = 0;
      for (const b of bulges) bw += b.a * Math.exp(-((f - b.c) * (f - b.c)) / (2 * b.s * b.s));
      const r = Math.max(baseR * 0.3, baseR * (0.7 + bw) * (0.55 + 0.45 * env));
      _fillCircle(g, x, y, r, 0xffffff, 1);
      lx = x; ly = y;
    }
    _fillCircle(g, lx, ly + baseR * 0.3, baseR * 1.25, 0xffffff, 1);   // rounded bead
  }

  // A forked "spunk" shape: soft top mass splitting into 2-3 draping drips.
  function _buildSpunkTexture(rng, w, h) {
    const g = new PIXI.Graphics();
    const cx = w / 2, massY = h * 0.15, massR = w * 0.15;
    const massN = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < massN; i++)
      _fillCircle(g, cx + (rng() - 0.5) * massR * 1.5, massY + (rng() - 0.5) * massR, massR * (0.6 + rng() * 0.5), 0xffffff, 1);
    if (rng() < 0.7) {   // a little upward hook off the mass
      const hx = cx + (rng() < 0.5 ? -1 : 1) * massR * 1.1;
      for (let i = 0; i < 3; i++)
        _fillCircle(g, hx + (rng() - 0.5) * massR * 0.4, massY - massR * (0.3 + i * 0.45), massR * (0.32 - i * 0.06), 0xffffff, 1);
    }
    const nB = 2 + Math.floor(rng() * 2);
    for (let b = 0; b < nB; b++) {
      const fan = nB > 1 ? (b / (nB - 1) - 0.5) : 0;
      _drawTendril(g, cx + (rng() - 0.5) * massR * 0.8, massY + massR * 0.4,
                   h * (0.30 + rng() * 0.22), w * (0.06 + rng() * 0.04),
                   (rng() - 0.5) * w * 0.10, cx + fan * w * 0.36, rng);
    }
    const wrapped = _blurWrap(g, w * 0.011);
    const tex = _genTex(wrapped, w, h);
    wrapped.destroy({ children: true });
    return tex;
  }

  function _buildGlowTexture(size) {
    const g = new PIXI.Graphics();
    const cx = size / 2, cy = size / 2, steps = 6;
    for (let i = steps; i >= 1; i--) _fillCircle(g, cx, cy, (size / 2) * (i / steps) * 0.8, 0xffffff, 0.16);
    const wrapped = _blurWrap(g, size * 0.05);
    const tex = _genTex(wrapped, size);
    wrapped.destroy({ children: true });
    return tex;
  }

  // Vertical gradient: transparent top -> opaque, full by ~30% down.
  function _buildGradMask(size) {
    const g = new PIXI.Graphics();
    const steps = 48, vFade = 0.12;
    for (let i = 0; i < steps; i++) {
      const v = (i + 0.5) / steps;
      let a = v <= vFade ? v / vFade : 1;
      a = Math.pow(a, 1.3);
      _fillRect(g, 0, size * (i / steps), size, size / steps + 1, 0xffffff, a);
    }
    const wrapped = _blurWrap(g, size * 0.01);
    const tex = _genTex(wrapped, size);
    wrapped.destroy({ children: true });
    return tex;
  }

  // Soft radial vignette: opaque centre fading to transparent at the edge, used
  // to contain the coat to the round token with no hard crop.
  function _buildVignetteMask(size) {
    const g = new PIXI.Graphics();
    const c = size / 2, steps = 26;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);          // 0 outer ring -> 1 centre
      const rad = c * (1 - t);
      let a = Math.min(1, t / 0.55);      // solid within the inner ~45%
      a = a * a;
      _fillCircle(g, c, c, Math.max(1, rad), 0xffffff, a);
    }
    const wrapped = _blurWrap(g, size * 0.04);
    const tex = _genTex(wrapped, size);
    wrapped.destroy({ children: true });
    return tex;
  }

  function _buildAtlas() {
    if (_atlas.built) return _atlas.ok;
    _atlas.built = true;
    try {
      if (!_renderer()) throw new Error("renderer not ready");
      const r = _rng("aflp-splat-atlas");
      for (let i = 0; i < 6; i++) _atlas.coat.push(_buildSplatTexture(r, 256, 0.010));     // sharper, tighter
      for (let i = 0; i < 6; i++) _atlas.puddle.push(_buildSplatTexture(r, 256, 0.020));   // a touch softer
      for (let i = 0; i < 3; i++) _atlas.spec.push(_buildSpecTexture(r, 256));
      for (let i = 0; i < 4; i++) _atlas.ropes.push(_buildRopeTexture(r, ROPE_W, ROPE_H));
      for (let i = 0; i < 5; i++) _atlas.spunk.push(_buildSpunkTexture(r, SPUNK_W, SPUNK_H));
      _atlas.glow = _buildGlowTexture(128);
      _atlas.grad = _buildGradMask(128);
      _atlas.vignette = _buildVignetteMask(128);
      _atlas.ok = true;
    } catch (e) {
      console.warn("AFLP | Splatter texture atlas unavailable, using circle fallback.", e);
      _atlas.ok = false;
    }
    return _atlas.ok;
  }
  const _pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

  // ── Tier -> stage params ───────────────────────────────────────────────────
  function _stage(tier) {
    let s;
    if      (tier >= 9) s = { coatAlpha: 0.82, coatBlobs: 6, coatSpread: 0.46, face: true,  puddleR: 2.0, droplets: 16 };
    else if (tier >= 8) s = { coatAlpha: 0.72, coatBlobs: 5, coatSpread: 0.44, face: false, puddleR: 1.7, droplets: 12 };
    else if (tier >= 6) s = { coatAlpha: 0.60, coatBlobs: 4, coatSpread: 0.40, face: false, puddleR: 1.3, droplets: 8  };
    else if (tier >= 4) s = { coatAlpha: 0.46, coatBlobs: 3, coatSpread: 0.36, face: false, puddleR: 0.95, droplets: 5 };
    else                s = { coatAlpha: 0.34, coatBlobs: 2, coatSpread: 0.32, face: false, puddleR: 0.55, droplets: 3 };
    const k = Math.max(0.25, Math.min(2.5, Number(sIntensity()) || 1));
    return { ...s,
      coatAlpha: Math.min(0.9, s.coatAlpha * (0.6 + 0.4 * k)),
      coatBlobs: Math.max(1, Math.round(s.coatBlobs * k)),
      puddleR:   s.puddleR * k,
      droplets:  Math.round(s.droplets * k) };
  }

  function _effectiveTier(cf) {
    if (!cf) return 0;
    const anal = cf.anal ?? 0, oral = cf.oral ?? 0, vaginal = cf.vaginal ?? 0, facial = cf.facial ?? 0;
    const overall = Math.min(8, Math.floor((anal + oral + vaginal) / 3));
    if (overall <= 0) return 0;
    return (overall >= 8 && facial >= 8) ? 9 : overall;
  }

  function _circleCluster(g, cx, cy, R, count, color, alpha, rng) {
    for (let i = 0; i < count; i++)
      _fillCircle(g, cx + (rng() - 0.5) * R, cy + (rng() - 0.5) * R, R * (0.25 + rng() * 0.45), color, alpha);
  }

  // Add a splat sprite + its aligned specular speckles to a container.
  function _stampSplat(container, tex, x, y, scl, rot, alpha, color, rng) {
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5); sp.tint = color; sp.alpha = alpha; sp.rotation = rot;
    sp.scale.set(scl, scl); sp.x = x; sp.y = y; sp.eventMode = "none";
    container.addChild(sp);
    if (_atlas.spec.length) {
      const spec = new PIXI.Sprite(_pick(_atlas.spec, rng));
      spec.anchor.set(0.5); spec.tint = _lighten(color, 0.6); spec.alpha = Math.min(0.4, alpha * 0.6);
      spec.rotation = rot; spec.scale.set(scl * 0.9, scl * 0.9); spec.x = x; spec.y = y;
      spec.blendMode = _ADD_BLEND; spec.eventMode = "none";
      container.addChild(spec);
    }
    return sp;
  }

  function _addHotspot(container, cx, cy, radius, color, alpha) {
    if (!_atlas.glow) return;
    const gl = new PIXI.Sprite(_atlas.glow);
    gl.anchor.set(0.5); gl.tint = _lighten(color, 0.55); gl.alpha = alpha; gl.blendMode = _ADD_BLEND;
    const s = (radius * 2) / 128; gl.scale.set(s, s);
    gl.x = cx + LIGHT.x * radius; gl.y = cy + LIGHT.y * radius; gl.eventMode = "none";
    container.addChild(gl);
  }

  // Stamp a shape in three layers: grounding shadow, opaque off-white body, and
  // a pure-white raised highlight offset toward the light. ay is the y-anchor
  // (0 = top-center for hanging shapes, 0.5 = centre for ground pools).
  function _stampLayered(container, tex, ay, x, y, sx, sy, rot, alpha, color) {
    // grounding drop-shadow (tight, mostly downward, so it reads as depth not a halo)
    const sh = new PIXI.Sprite(tex);
    sh.anchor.set(0.5, ay); sh.tint = 0x0e0e12; sh.alpha = alpha * 0.26;
    sh.rotation = rot; sh.scale.set(sx, sy); sh.x = x + 2; sh.y = y + 4; sh.eventMode = "none";
    container.addChild(sh);
    // rim-light along the cum/skin border (light-facing side)
    const rim = new PIXI.Sprite(tex);
    rim.anchor.set(0.5, ay); rim.tint = 0xffffff; rim.alpha = Math.min(0.6, alpha * 0.5);
    rim.rotation = rot; rim.scale.set(sx * 1.03, sy * 1.025);
    rim.x = x + LIGHT.x * 3; rim.y = y + LIGHT.y * 3; rim.eventMode = "none";
    container.addChild(rim);
    // opaque off-white body
    const body = new PIXI.Sprite(tex);
    body.anchor.set(0.5, ay); body.tint = color; body.alpha = alpha;
    body.rotation = rot; body.scale.set(sx, sy); body.x = x; body.y = y; body.eventMode = "none";
    container.addChild(body);
    // glossy specular streak (brighter, taller, additive) down the light side
    const hi = new PIXI.Sprite(tex);
    hi.anchor.set(0.5, ay); hi.tint = 0xffffff; hi.alpha = Math.min(0.7, alpha * 0.7);
    hi.blendMode = _ADD_BLEND; hi.rotation = rot; hi.scale.set(sx * 0.5, sy * 0.9);
    hi.x = x + LIGHT.x * sx * 70; hi.y = y + LIGHT.y * sy * 25; hi.eventMode = "none";
    container.addChild(hi);
  }

  // Frothy bubbles: tiny dark dimples with a bright highlight on the light side.
  function _addBubbles(container, cx, cy, rx, ry, n, color, rng) {
    for (let i = 0; i < n; i++) {
      const bx = cx + (rng() - 0.5) * rx, by = cy + (rng() - 0.5) * ry;
      const r = Math.max(0.8, rx * (0.05 + rng() * 0.08));
      const hole = new PIXI.Graphics();
      _fillCircle(hole, bx, by, r, 0x101015, 0.22); hole.eventMode = "none";
      container.addChild(hole);
      const hl = new PIXI.Graphics();
      _fillCircle(hl, bx + LIGHT.x * r * 0.3, by + LIGHT.y * r * 0.3, r * 0.5, 0xffffff, 0.7);
      hl.blendMode = _ADD_BLEND; hl.eventMode = "none";
      container.addChild(hl);
    }
  }

  // Vertical drip hanging from (xTop,yTop). thickness px wide, length px long.
  function _addRope(container, xTop, yTop, length, thickness, alpha, color, rng, bead) {
    if (!_atlas.ropes.length) return;
    const tex = _pick(_atlas.ropes, rng);
    const rot = (rng() - 0.5) * 0.14;                // slight sway
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5, 0); sp.tint = color; sp.alpha = alpha; sp.rotation = rot;
    sp.scale.set(thickness / ROPE_W, length / ROPE_H);
    sp.x = xTop; sp.y = yTop; sp.eventMode = "none";
    container.addChild(sp);
    // Glossy specular ridge: thinner, brighter copy offset toward the light.
    const ridge = new PIXI.Sprite(tex);
    ridge.anchor.set(0.5, 0); ridge.tint = _lighten(color, 0.5);
    ridge.alpha = Math.min(0.5, alpha * 0.7); ridge.blendMode = _ADD_BLEND; ridge.rotation = rot;
    ridge.scale.set((thickness * 0.4) / ROPE_W, (length * 0.92) / ROPE_H);
    ridge.x = xTop + LIGHT.x * thickness * 0.35; ridge.y = yTop; ridge.eventMode = "none";
    container.addChild(ridge);
    if (bead && _atlas.glow) {
      const gl = new PIXI.Sprite(_atlas.glow);
      gl.anchor.set(0.5); gl.tint = _lighten(color, 0.55); gl.alpha = 0.32; gl.blendMode = _ADD_BLEND;
      const gs = (thickness * 1.6) / 128; gl.scale.set(gs, gs);
      gl.x = xTop + Math.sin(rot) * length; gl.y = yTop + Math.cos(rot) * length; gl.eventMode = "none";
      container.addChild(gl);
    }
  }

  // ── Skull-draped cum (token-seeded) ─────────────────────────────────────────
  // Two white textures (TEXxTEX): `body` is the cum sheet + ropes, `gloss` is the
  // thin bright core down each rope's light side. Cum anchors at the crown and
  // runs down in curving ropes of varied width, splaying outward to follow the
  // curve of the skull and tapering to rounded beads. Tier controls how far the
  // run is revealed, so more cumflation visibly runs further down the face.
  const _drapeCache = {};
  let _coreG = null;

  // Tuned drape style (locked via the coat tuner). The per-token seed still varies
  // the arrangement; these set the global look: counts, sizes, bean shape, gloss,
  // tone and opacity.
  const DRAPE = {
    ropeCount: 19, ropeLen: 1.1, ropeThick: 1.2, ropeWavy: 1.2, forkChance: 0.30,
    bulgeCount: 2, bulgeLen: 0.8, bulgeSize: 1.45, beadLo: 0.58,
    crownDensity: 2.0, bandR: 0.06, spreadX: 1.08, originY: -0.035, originBand: 0.95, arcWidth: 0.95,
    sprayCount: 20, bubbleCount: 16, beanness: 1.70,
    glossW: 0.95, glossTip: 1.40, glossBlur: 0.008, glossOff: 3.4, glossWarm: 0.80, glossA: 0.272,
    tone: 0.74, coatMaxA: 0.70
  };
  function _mixHex(a, b, t) {
    const ar=(a>>16)&255,ag=(a>>8)&255,ab=a&255,br=(b>>16)&255,bg=(b>>8)&255,bb=b&255;
    return ((Math.round(ar+(br-ar)*t))<<16)|((Math.round(ag+(bg-ag)*t))<<8)|(Math.round(ab+(bb-ab)*t));
  }
  // A round blob nudged toward a bean: elongated, slightly kidney, angled by position.
  function _fillBean(g, x, y, r, color, alpha, bn) {
    if (!bn || bn <= 1.03) { _fillCircle(g, x, y, r, color, alpha); return; }
    const ang = x * 0.137 + y * 0.211, ca = Math.cos(ang), sa = Math.sin(ang);
    const rx = r * Math.sqrt(bn), ry = r / Math.sqrt(bn);
    const poly = (ex, ey, erx, ery) => {
      const pts = [];
      for (let k = 0; k < 24; k++) { const t = k / 24 * Math.PI * 2, px = ex + Math.cos(t) * erx, py = ey + Math.sin(t) * ery; pts.push(x + px * ca - py * sa, y + px * sa + py * ca); }
      if (typeof g.beginFill === "function") { g.beginFill(color, alpha); g.drawPolygon(pts); g.endFill(); }
      else { g.poly(pts).fill({ color, alpha }); }
    };
    poly(0, 0, rx, ry);
    poly(rx * 0.32, -ry * 0.16, rx * 0.5, ry * 0.74);
  }

  // One cum rope: a wandering, tapering tube that flows downward under gravity
  // with a gentle lateral meander (not loopy string), varied thickness via
  // bulges, and an occasional fork. Ends in a rounded drip bead. `lean` is the
  // net horizontal drift over the run (signed fraction); `depth` limits forking.
  function _drawDrapeRope(body, gloss, x0, y0, len, baseR, lean, rng, depth) {
    const steps = 48;
    const nw = 2 + Math.floor(rng() * 2);
    const waves = [];
    for (let i = 0; i < nw; i++) waves.push({ amp: baseR * (0.35 + rng() * 0.6) * DRAPE.ropeWavy, freq: 0.3 + rng() * 0.6, phase: rng() * Math.PI * 2 });
    const nb = Math.max(0, Math.round(DRAPE.bulgeCount));
    const bulges = [];
    for (let i = 0; i < nb; i++) bulges.push({ c: rng(), s: (0.07 + rng() * 0.08) * DRAPE.bulgeLen, a: (0.30 + rng() * 0.55) * DRAPE.bulgeSize });
    let fx = 0, fy = 0, fdone = false;
    const forkAt = (rng() < DRAPE.forkChance && depth < 1) ? (0.35 + rng() * 0.35) : -1;
    let lx = x0, ly = y0;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      let x = x0 + lean * Math.sin(f * Math.PI * 0.5) * len * 0.7;
      for (const wv of waves) x += wv.amp * Math.sin(f * Math.PI * wv.freq + wv.phase) * f;  // wander grows downstream
      const y = y0 + len * f;
      const env = Math.min(1, f / 0.10);
      let bw = 0;
      for (const b of bulges) bw += b.a * Math.exp(-((f - b.c) * (f - b.c)) / (2 * b.s * b.s));
      const r = Math.max(baseR * 0.34, baseR * (0.58 + 0.6 * bw) * env * (1 - 0.3 * f));
      _fillCircle(body, x, y, r, 0xffffff, 1); if (_coreG && bw > 0.5) _fillCircle(_coreG, x, y, r * 0.78, 0xffffff, 1);
      _fillCircle(gloss, x + LIGHT.x * r * 0.22, y, r * 0.32 * DRAPE.glossW * (0.4 + 0.6 * Math.sin(f * Math.PI)), 0xffffff, 1); if (bw > 0.6) _fillCircle(gloss, x + LIGHT.x * r * 0.15, y - r * 0.12, r * 0.18 * DRAPE.glossW, 0xffffff, 1);
      if (forkAt > 0 && f >= forkAt && !fdone) { fx = x; fy = y; fdone = true; }
      lx = x; ly = y;
    }
    const _bdr = baseR * (DRAPE.beadLo + rng() * 0.55); _fillBean(body, lx, ly + baseR * 0.2, _bdr, 0xffffff, 1, DRAPE.beanness); if (_coreG) _fillBean(_coreG, lx, ly + baseR * 0.2, _bdr * 0.82, 0xffffff, 1, DRAPE.beanness);  // rounded drip bead (beaned)
    _fillCircle(gloss, lx + LIGHT.x * baseR * 0.15, ly - baseR * 0.1, baseR * 0.28 * DRAPE.glossW * DRAPE.glossTip, 0xffffff, 1);
    if (rng() < 0.2) {                                                      // detached falling droplet
      const dy = ly + baseR * 2.4;
      _fillBean(body, lx, dy, baseR * 0.5, 0xffffff, 1, DRAPE.beanness);
      _fillCircle(gloss, lx + LIGHT.x * baseR * 0.15, dy - baseR * 0.15, baseR * 0.3 * DRAPE.glossW * DRAPE.glossTip, 0xffffff, 1);
    }
    if (fdone) _drawDrapeRope(body, gloss, fx, fy, len * (0.4 + rng() * 0.3),
                              baseR * (0.55 + rng() * 0.25), lean * 0.6 + (rng() - 0.5) * 0.18, rng, depth + 1);
  }

  function _buildDrapeTextures(rng, TEX) {
    const body = new PIXI.Graphics();
    const gloss = new PIXI.Graphics();
    const core = new PIXI.Graphics(); _coreG = core;
    const cx = TEX * 0.5, hcY = TEX * 0.42 + DRAPE.originY * TEX, hr = TEX * 0.34;   // head centre + radius
    const aMax = DRAPE.arcWidth, SX = DRAPE.spreadX, BND = DRAPE.originBand, bn = DRAPE.beanness;
    const cd = Q().coatDetail;   // quality: scale build-time blob/rope/spray counts
    const arcPt = (a) => ({ x: cx + Math.sin(a) * hr, y: hcY - Math.cos(a) * hr * 0.95 });
    const reg = () => ({ x: cx + (rng() - 0.5) * hr * 1.8 * SX, y: hcY - hr * 0.8 * BND + rng() * hr * 1.6 * BND });

    // Crown cap: a connected gloopy sheet across the hairline (so the runs read as
    // descending from one mass of cum), irregular clumps, heavier globs, upward licks.
    const nSc = Math.max(2, Math.round(8 * DRAPE.crownDensity * cd));
    for (let i = 0; i < nSc; i++) { const p = reg(); _fillBean(body, p.x, p.y + TEX * 0.012, TEX * (0.040 + rng() * 0.015), 0xffffff, 1, bn); }
    const caps = Math.max(2, Math.round(5 * DRAPE.crownDensity * cd));
    for (let i = 0; i < caps; i++) {
      const p = reg();
      const _cxp = p.x + (rng() - 0.5) * TEX * 0.03, _cyp = p.y + (rng() - 0.5) * TEX * 0.022, _crp = TEX * (0.028 + rng() * rng() * 0.04);
      _fillBean(body, _cxp, _cyp, _crp, 0xffffff, 1, bn); _fillBean(core, _cxp, _cyp, _crp, 0xffffff, 1, bn);
    }
    const globs = Math.max(1, Math.round(2 * DRAPE.crownDensity * cd));
    for (let i = 0; i < globs; i++) {
      const p = reg();
      const _grp = TEX * (0.04 + rng() * 0.025); _fillBean(body, p.x, p.y, _grp, 0xffffff, 1, bn); _fillBean(core, p.x, p.y, _grp, 0xffffff, 1, bn);
    }
    const peaks = Math.max(1, Math.round(2 * DRAPE.crownDensity * cd));
    for (let i = 0; i < peaks; i++) {
      const p = reg();
      const ph = TEX * (0.05 + rng() * 0.07);
      for (let t = 0; t <= 5; t++) {
        const f = t / 5;
        _fillCircle(body, p.x + (rng() - 0.5) * 6, p.y - ph * f, TEX * 0.03 * (1 - 0.6 * f), 0xffffff, 1);
      }
    }

    // Bubbles in the crown: darker dimples (body, darken after tint) + bright
    // highlights (gloss) so the thick cap reads as gloopy cum, not flat paint.
    const nbub = Math.max(4, Math.round(DRAPE.bubbleCount * cd));
    for (let i = 0; i < nbub; i++) {
      const bp = reg();
      const br = TEX * (0.012 + rng() * 0.024);
      const bx = bp.x + (rng() - 0.5) * TEX * 0.05, by = bp.y + (rng() - 0.5) * TEX * 0.03;
      _fillBean(body, bx, by, br, 0xd8d2c6, 0.35, bn);
      _fillCircle(gloss, bx + LIGHT.x * br * 0.3, by + LIGHT.y * br * 0.3, br * 0.5 * DRAPE.glossW, 0xffffff, 1);
    }

    // Ropes: one per evenly-spaced arc segment (with jitter) so they reliably spread
    // across the head; count/length/thickness/waviness/fork all tuner-tuned.
    const nR = Math.max(6, Math.round(DRAPE.ropeCount * cd));
    for (let i = 0; i < nR; i++) {
      const a = -aMax + (2 * aMax) * ((i + 0.5) / nR) + (rng() - 0.5) * (2 * aMax / nR) * 1.25;
      const p = arcPt(a);
      const baseR = TEX * (0.011 + rng() * 0.058) * DRAPE.ropeThick;          // even spread of thin..fat
      const len = TEX * (0.085 + rng() * 0.18) * DRAPE.ropeLen;
      const lean = Math.sin(a) * 0.42 + (rng() - 0.5) * 0.34;
      _drawDrapeRope(body, gloss, cx + (rng() - 0.5) * hr * 1.9 * SX, hcY - hr * 0.82 * BND + rng() * hr * 1.7 * BND, len, baseR, lean, rng, 0);
    }

    // Fine flung spray: small scattered droplets/specks like the references.
    const nspray = Math.max(4, Math.round(DRAPE.sprayCount * cd));
    for (let i = 0; i < nspray; i++) {
      const sx = cx + (rng() - 0.5) * hr * 1.9 * SX;
      const sy = hcY + TEX * (0.05 + rng() * 0.7);
      const sr = TEX * (0.004 + rng() * 0.012);
      _fillCircle(body, sx, sy, sr, 0xffffff, 1);
      if (rng() < 0.6) _fillCircle(gloss, sx + LIGHT.x * sr, sy + LIGHT.y * sr, sr * 0.5 * DRAPE.glossW, 0xffffff, 1);
    }

    // Connective crown band: stamps along the hairline arc joining the rope tops
    // into one pooled sheet (the "fed from a contiguous mass" look).
    if (DRAPE.bandR > 0.001) {
      const NB = 28;
      for (let i = 0; i <= NB; i++) {
        const a = -aMax + (2 * aMax) * (i / NB);
        const p = arcPt(a);
        _fillCircle(body, p.x + (rng() - 0.5) * TEX * 0.008, p.y + TEX * 0.028, TEX * DRAPE.bandR, 0xffffff, 1);
        _fillCircle(gloss, p.x + LIGHT.x * TEX * 0.02, p.y + TEX * 0.01, TEX * 0.016 * DRAPE.glossW, 0xffffff, 1);
      }
    }

    const bWrap = _blurWrap(body, TEX * 0.008);
    const bTex = _genTex(bWrap, TEX); bWrap.destroy({ children: true });
    const gWrap = _blurWrap(gloss, TEX * Math.max(0.0001, DRAPE.glossBlur));
    const gTex = _genTex(gWrap, TEX); gWrap.destroy({ children: true });
    const cWrap = _blurWrap(core, TEX * 0.006);
    const cTex = _genTex(cWrap, TEX); cWrap.destroy({ children: true });
    _coreG = null;
    return { body: bTex, gloss: gTex, core: cTex };
  }

  // Round-contained vertical reveal mask: opaque from the top down to yCut, soft
  // fade just below, transparent under, all clipped to the circular portrait so
  // the drape never bleeds into the token corners.
  function _buildCoatMask(TEX, yCutFrac, fadeFrac) {
    const g = new PIXI.Graphics();
    const steps = 72, cx = TEX * 0.5, cy = TEX * 0.5, R = TEX * 0.485;
    for (let i = 0; i < steps; i++) {
      const v = (i + 0.5) / steps, y = TEX * v;
      let a = 1;
      if (v > yCutFrac) a = Math.max(0, 1 - (v - yCutFrac) / fadeFrac);
      if (a <= 0) continue;
      const dy = y - cy;
      if (Math.abs(dy) >= R) continue;
      const hw = Math.sqrt(R * R - dy * dy);
      _fillRect(g, cx - hw, TEX * (i / steps), hw * 2, TEX / steps + 1, 0xffffff, a);
    }
    const wrapped = _blurWrap(g, TEX * 0.015);
    const tex = _genTex(wrapped, TEX); wrapped.destroy({ children: true });
    return tex;
  }

  // ── Coat (token-local) ────────────────────────────────────────────────────
  function _drawCoat(container, token, tier) {
    container.mask = null;
    while (container.children.length) container.removeChildAt(0).destroy();
    const w = token.w, h = token.h, color = _color();
    const cx = w * 0.5;
    const TEX = 256;

    if (!_buildAtlas()) {
      const g = new PIXI.Graphics();
      _circleCluster(g, cx, h * 0.4, w * 0.3, 6, color, 0.7, _rng(`${token.id}|coat`));
      container.addChild(g);
      return;
    }

    // Token-seeded drape, cached. Geometry is identity-stable; tier only changes
    // how far it is revealed, so the same sheet just runs further as it grows.
    let d = _drapeCache[token.id];
    if (!d || !d.body?.valid) { d = _buildDrapeTextures(_rng(`${token.id}|drape`), TEX); _drapeCache[token.id] = d; }

    const tcov = Math.max(0, Math.min(1, (tier - 1) / 8));
    const baseA = (DRAPE.coatMaxA - 0.13) + tcov * 0.13;   // tuned: ramps to coatMaxA at top tier
    const sc = w / TEX;

    // Layered stamp of the full-token drape: drop-shadow, rim, opaque body, gloss.
    // Wet film: faint dark-warm translucent sheen with patches/holes, appears mid-tier
    // and spreads to a near-full coat by tier 9. Drawn underneath everything, own portrait clip.
    if (tcov > 0.22 && Q().film) {
      const frng = _rng(token.id + '|film');
      const fcov = Math.min(1, (tcov - 0.22) / 0.78);
      const fg = new PIXI.Graphics();
      const nf = Math.round(4 + fcov * 15);
      for (let i = 0; i < nf; i++) _fillCircle(fg, TEX * (0.14 + frng() * 0.72), TEX * (0.12 + frng() * 0.70), TEX * (0.09 + frng() * 0.09 + fcov * 0.07), 0xffffff, 1);
      const fcr = (color >> 16) & 255, fcg = (color >> 8) & 255, fcb = color & 255;
      const fwd = ((Math.round(fcr * 0.70)) << 16) | ((Math.round(fcg * 0.62)) << 8) | (Math.round(fcb * 0.54));
      const filmTex = _genTex(_blurWrap(fg, TEX * 0.045), TEX);
      const pmg = new PIXI.Graphics(); _fillCircle(pmg, TEX * 0.5, TEX * 0.5, TEX * 0.49, 0xffffff, 1);
      const pmTex = _genTex(pmg, TEX);
      const filmC = new PIXI.Container(); filmC.eventMode = "none";
      const filmSp = new PIXI.Sprite(filmTex); filmSp.anchor.set(0, 0); filmSp.tint = fwd; filmSp.alpha = 0.09 + fcov * 0.15; filmSp.scale.set(sc, sc); filmSp.eventMode = "none";
      const pmSp = new PIXI.Sprite(pmTex); pmSp.anchor.set(0, 0); pmSp.scale.set(sc, sc); pmSp.eventMode = "none";
      filmC.addChild(filmSp); filmC.addChild(pmSp); filmC.mask = pmSp;
      container.addChild(filmC);
    }
    const cumC = new PIXI.Container(); cumC.eventMode = "none"; container.addChild(cumC);
    const place = (tex, tint, alpha, ox, oy, blend) => {
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0, 0); sp.tint = tint; sp.alpha = alpha;
      sp.x = ox; sp.y = oy; sp.scale.set(sc, sc); sp.eventMode = "none";
      if (blend) sp.blendMode = _ADD_BLEND;
      cumC.addChild(sp);
    };
    const tone = DRAPE.tone;
    const rich = Q().richLayers;   // quality: drop the two subtlest per-frame layers at low
    place(d.body, _mixHex(0x0e0e12, 0x6c5842, tone), baseA * 0.34, 1, 2, false);                  // shadow (warmed toward the puddle ramp)
    if (rich) place(d.body, _mixHex(0x655d52, 0x6c5842, tone), baseA * 0.45, -LIGHT.x * 3.0, -LIGHT.y * 3.0, false); // form shadow (shadow-side crescent for roundness)
    if (rich) place(d.body, _mixHex(0xffffff, 0xfffcf4, tone), 0.24, LIGHT.x * 2.4, LIGHT.y * 2.4, false);   // rim
    const _cr=(color>>16)&255,_cg=(color>>8)&255,_cb=color&255;
    const _mr=0.92+0.04*tone,_mg=0.86+0.07*tone,_mb=0.76+0.11*tone;
    const wd=((Math.round(_cr*_mr))<<16)|((Math.round(_cg*_mg))<<8)|(Math.round(_cb*_mb)); place(d.body, wd, baseA * 0.78, 0, 0, false);
    if (d.core) place(d.core, color, baseA * 0.7, 0, 0, false);                                    // body
    place(d.gloss, _mixHex(0xffffff, 0xffecc8, DRAPE.glossWarm), DRAPE.glossA, LIGHT.x * DRAPE.glossOff, 0, true); // gloss

    // Pooled cum: thick bright bubbly blobs spread across the face at high tiers.
    if (tier >= 8 && Q().pool) {
      const rng = _rng(`${token.id}|pool`);
      const npool = 2 + (tier - 8) * 3;
      for (let p = 0; p < npool; p++) {
        const px = w * (0.20 + rng() * 0.60);
        const py = h * (0.16 + rng() * 0.62);
        const psx = (w * (0.10 + rng() * 0.08)) / 256;
        _stampLayered(container, _atlas.coat[Math.floor(rng() * _atlas.coat.length)], 0.5,
                      px, py, psx, psx * 0.62, rng() * Math.PI * 2, baseA * 0.6, color);
        _addBubbles(container, px, py, psx * 80, psx * 70, 2 + Math.floor(rng() * 2), color, rng);
      }
    }

    // Tier-driven reveal: low tiers show only the crown; higher tiers run down
    // past the eyes, nose, and chin.
    // Random-spread reveal: cum lands wherever aimed, so reveal token-seeded
    // random patches whose count grows with cumflation (not a top-down sweep).
    const mrng = _rng(token.id + '|reveal');
    const mg = new PIXI.Graphics();
    const nblob = Math.round(3 + tcov * 22);
    for (let i = 0; i < nblob; i++) {
      _fillCircle(mg, TEX * (0.12 + mrng() * 0.76), TEX * (0.08 + mrng() * 0.78), TEX * (0.10 + mrng() * 0.10), 0xffffff, 1);
    }
    const maskTex = _genTex(_blurWrap(mg, TEX * 0.022), TEX);
    const mask = new PIXI.Sprite(maskTex);
    mask.anchor.set(0, 0); mask.x = 0; mask.y = 0; mask.scale.set(sc, sc); mask.eventMode = "none";
    cumC.addChild(mask);
    cumC.mask = mask;
  }

  function _ensureCoat(token, tier) {
    if (!token || token.destroyed) return;
    let coat = AFLP_Splatter._coats.get(token.id);
    if (tier < START_TIER || !sEnabled() || sHideLocal()) {
      if (coat) { coat.mask = null; coat.destroy({ children: true }); AFLP_Splatter._coats.delete(token.id); }
      return;
    }
    if (!coat || coat.destroyed) {
      coat = new PIXI.Container();
      coat.name = COAT_NAME; coat.eventMode = "none"; coat._aflpTier = -1;
      AFLP_Splatter._coats.set(token.id, coat);
    }
    if (coat.parent !== token) token.addChild(coat);
    if (coat._aflpTier !== tier) { _drawCoat(coat, token, tier); coat._aflpTier = tier; }
  }

  // ── Ground layer + puddles ─────────────────────────────────────────────────
  function _ensureGroundLayer() {
    let layer = AFLP_Splatter._ground;
    if (layer && !layer.destroyed && layer.parent === canvas.primary) return layer;
    if (layer && !layer.destroyed) layer.destroy({ children: true });
    layer = new PIXI.Container();
    layer.eventMode = "none";
    layer.elevation = 0; layer.sortLayer = 500; layer.sort = 0;
    canvas.primary.addChild(layer);
    if (typeof canvas.primary.sortChildren === "function") canvas.primary.sortChildren();
    AFLP_Splatter._ground = layer;
    return layer;
  }

  // ── Proposed ground puddle ──────────────────────────────────────────────────
  // A smooth, soft-edged pool with form-light, lumps, holes, bubbles and glints,
  // drawn on a 2D canvas and used as a sprite texture. Replaces the old
  // translucent splat-stamp cloud. Approved look: round (no perspective squash),
  // cream, edge-feathered.
  const PUDDLE_SQUASH = 1.0;     // was 0.55 (ground perspective); approved round look
  const PUDDLE_SIZE   = 0.72;    // keep the prior design's on-ground footprint
  const PUDDLE_ALPHA  = 0.92;    // tuned overall puddle opacity
  const PUDDLE_PARAMS = { elong: 1.65, axis: 1.10, holes: 9, lumps: 16, bubbles: 20, edge: 6, lightAng: -2.3 };
  // Tuned look of the hollow dark pits in the puddle.
  const PUDDLE_HOLE = { size: 0.8, dark: 30, fillA: 0.28, rimA: 0.84, rimW: 0.23 };
  const _rgbOf  = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const _cssRgb = (c, a) => (a == null ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
  const _mixRgb = (a, b, t) => [Math.round(a[0]+(b[0]-a[0])*t), Math.round(a[1]+(b[1]-a[1])*t), Math.round(a[2]+(b[2]-a[2])*t)];

  // Render the puddle to a 2D canvas and return it. `q` scales the internal pixel
  // resolution (caller compensates with sprite scale); `detail` scales the heavy
  // lump/bubble/glint loops. Both default to 1 (full "high" quality).
  function _buildPuddleCanvas(R, color, seedKey, q = 1, detail = 1) {
    const P = PUDDLE_PARAMS;
    R = R * q;
    const half = Math.ceil(R * 2.4 + 24), SZ = half * 2;
    const cnv = document.createElement("canvas"); cnv.width = SZ; cnv.height = SZ;
    const ctx = cnv.getContext("2d");
    const oc = document.createElement("canvas"); oc.width = SZ; oc.height = SZ;
    const off = oc.getContext("2d");
    const rng = _rng(seedKey);
    const lx = Math.cos(P.lightAng), ly = Math.sin(P.lightAng);
    const base = _rgbOf(color), center = _mixRgb(base, [255,255,255], 0.18),
          edge = _mixRgb(base, [180,168,146], 0.30), cssMid = _cssRgb(base);
    const ph = []; for (let k = 0; k < 5; k++) ph.push(rng() * Math.PI * 2);
    const N = 80, pts = [];
    for (let i = 0; i < N; i++) {
      const th = i / N * Math.PI * 2;
      let n = 0.18*Math.sin(2*th+ph[0]) + 0.11*Math.sin(3*th+ph[1]) + 0.06*Math.sin(5*th+ph[2]) + 0.04*Math.sin(8*th+ph[3]);
      let rr = R * (1 + n); const da = Math.cos(th - P.axis);
      rr *= (1 + (P.elong-1)*Math.max(0,da)*0.9 + (P.elong-1)*0.25*Math.max(0,-da));
      pts.push([Math.cos(th)*rr, Math.sin(th)*rr]);
    }
    const pathP = (c) => {
      c.beginPath(); c.moveTo((pts[0][0]+pts[1][0])/2, (pts[0][1]+pts[1][1])/2);
      for (let i = 0; i < N; i++) { const p = pts[i], q = pts[(i+1)%N]; c.quadraticCurveTo(p[0], p[1], (p[0]+q[0])/2, (p[1]+q[1])/2); }
      c.closePath();
    };
    const big = (c) => c.fillRect(-R*3, -R*3, R*6, R*6);
    // halo + grounding shadow (under the body, kept soft)
    ctx.save(); ctx.translate(half, half);
    ctx.save(); ctx.filter = `blur(${3+P.edge*0.5}px)`; ctx.scale(1.07+P.edge*0.004, 1.07+P.edge*0.004); pathP(ctx); ctx.fillStyle = "rgba(243,234,214,0.26)"; ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(5, 9); ctx.filter = `blur(${7+P.edge*0.6}px)`; pathP(ctx); ctx.fillStyle = "rgba(10,10,14,0.42)"; ctx.fill(); ctx.restore();
    ctx.restore();
    // body + detail on the offscreen, feathered at the end
    off.save(); off.translate(half, half);
    pathP(off); off.save(); off.clip();
    let g = off.createRadialGradient(-R*0.25, -R*0.3, R*0.1, 0, 0, R*1.4);
    g.addColorStop(0, _cssRgb(center)); g.addColorStop(0.55, cssMid); g.addColorStop(1, _cssRgb(edge, 0.85));
    off.fillStyle = g; big(off);
    const lg = off.createLinearGradient(lx*R, ly*R, -lx*R, -ly*R);
    lg.addColorStop(0, "rgba(255,252,244,0.26)"); lg.addColorStop(0.45, "rgba(255,252,244,0)"); lg.addColorStop(0.7, "rgba(120,100,75,0.05)"); lg.addColorStop(1, "rgba(108,88,66,0.26)");
    off.fillStyle = lg; big(off);
    const _nLump = Math.max(3, Math.round(P.lumps * detail));
    for (let i = 0; i < _nLump; i++) {
      const ang = rng()*Math.PI*2, dd = Math.sqrt(rng())*R*0.85, x = Math.cos(ang)*dd, y = Math.sin(ang)*dd, lr = R*(0.16+rng()*0.26), of = lr*0.45;
      let gg = off.createRadialGradient(x-lx*of, y-ly*of, 0, x-lx*of, y-ly*of, lr); gg.addColorStop(0,"rgba(120,98,72,0.26)"); gg.addColorStop(1,"rgba(120,98,72,0)"); off.fillStyle = gg; big(off);
      gg = off.createRadialGradient(x+lx*of*0.9, y+ly*of*0.9, 0, x+lx*of*0.9, y+ly*of*0.9, lr*0.7); gg.addColorStop(0,"rgba(255,253,247,0.34)"); gg.addColorStop(1,"rgba(255,253,247,0)"); off.fillStyle = gg; big(off);
    }
    off.restore();
    const _hc = `rgba(${Math.round(PUDDLE_HOLE.dark)},${Math.round(PUDDLE_HOLE.dark*0.77)},${Math.round(PUDDLE_HOLE.dark*0.51)},${PUDDLE_HOLE.fillA})`;
    for (let i = 0; i < P.holes; i++) {
      const ang = rng()*Math.PI*2, dd = (0.15+Math.sqrt(rng())*0.72)*R, hx = Math.cos(ang)*dd, hy = Math.sin(ang)*dd, hr = R*(0.03+rng()*rng()*0.13)*PUDDLE_HOLE.size;
      off.save(); off.beginPath(); off.ellipse(hx, hy, hr, hr*0.92, 0, 0, Math.PI*2); off.clip(); off.fillStyle = _hc; off.fillRect(hx-hr*2, hy-hr*2, hr*4, hr*4); off.restore();
      if (PUDDLE_HOLE.rimA > 0.001 && PUDDLE_HOLE.rimW > 0.001) { off.lineWidth = Math.max(0.6, hr*PUDDLE_HOLE.rimW); off.strokeStyle = `rgba(255,253,248,${PUDDLE_HOLE.rimA})`; off.beginPath(); off.ellipse(hx+lx*hr*0.15, hy+ly*hr*0.15, hr*0.95, hr*0.72, Math.atan2(ly,lx), 0.15*Math.PI, 0.95*Math.PI); off.stroke(); }
    }
    pathP(off); off.save(); off.clip();
    const _nBub = Math.max(4, Math.round(P.bubbles * detail));
    for (let i = 0; i < _nBub; i++) {
      const bx = (rng()-0.5)*R*1.4, by = (rng()-0.5)*R*1.2, br = R*(0.015+rng()*0.045);
      off.lineWidth = Math.max(0.7, br*0.4); off.strokeStyle = "rgba(255,255,255,0.5)"; off.beginPath(); off.ellipse(bx, by, br, br*0.85, 0, 0, Math.PI*2); off.stroke();
      off.fillStyle = "rgba(255,255,255,0.5)"; off.beginPath(); off.ellipse(bx-lx*br*0.4, by-ly*br*0.4, br*0.3, br*0.25, 0, 0, Math.PI*2); off.fill();
    }
    const _nGlint = Math.max(3, Math.round(10 * detail));
    for (let i = 0; i < _nGlint; i++) {
      const sx = (rng()-0.5)*R*1.4, sy = (rng()-0.5)*R*1.2, gw = 1.2+rng()*rng()*3.5;
      off.fillStyle = "rgba(255,255,255," + (0.45+rng()*0.45) + ")"; off.save(); off.translate(sx, sy); off.rotate(Math.atan2(ly,lx)+(rng()-0.5)); off.beginPath(); off.ellipse(0, 0, gw, gw*0.4, 0, 0, Math.PI*2); off.fill(); off.restore();
    }
    off.restore(); off.restore();
    off.save(); off.globalCompositeOperation = "destination-in"; off.translate(half, half); off.filter = `blur(${P.edge}px)`; pathP(off); off.fillStyle = "#fff"; off.fill(); off.restore();
    ctx.drawImage(oc, 0, 0);
    return cnv;
  }

  function _drawPuddle(layer, rec) {
    const color = _color();
    const st = _stage(rec.tier);
    const grid = canvas.grid?.size ?? 100;
    const R = grid * st.puddleR * PUDDLE_SIZE;
    const sub = new PIXI.Container();
    sub.position.set(rec.x, rec.y);
    sub.scale.set(1, PUDDLE_SQUASH);
    sub.eventMode = "none";
    const prs = Math.max(0.25, Q().puddleRes);   // quality: smaller canvas, scaled back up
    let cnv = null;
    try { cnv = _buildPuddleCanvas(R, color, rec.seed ?? `${rec.x},${rec.y}|${rec.tier}`, prs, Q().puddleDetail); } catch (e) { cnv = null; }
    if (!cnv) {
      const g = new PIXI.Graphics();
      _circleCluster(g, 0, 0, R, Math.round(st.puddleR * 6), color, 0.5, _rng(rec.seed ?? `${rec.x},${rec.y}`));
      sub.addChild(g); layer.addChild(sub); return;
    }
    const tex = PIXI.Texture.from(cnv);
    if (!AFLP_Splatter._puddleTex) AFLP_Splatter._puddleTex = [];
    AFLP_Splatter._puddleTex.push(tex);
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5); sp.eventMode = "none"; sp.alpha = PUDDLE_ALPHA; sp.scale.set(1 / prs, 1 / prs);
    sub.addChild(sp);
    layer.addChild(sub);
  }

  function _redrawPuddles() {
    if (!canvas?.scene) return;
    const layer = _ensureGroundLayer();
    while (layer.children.length) layer.removeChildAt(0).destroy({ children: true });
    if (AFLP_Splatter._puddleTex) { for (const t of AFLP_Splatter._puddleTex) { try { t.destroy(true); } catch (e) {} } AFLP_Splatter._puddleTex = []; }
    if (!sEnabled() || sHideLocal()) return;
    const map = canvas.scene.getFlag(MODULE_ID, PUDDLE_KEY) ?? {};
    for (const v of Object.values(map)) {
      const list = Array.isArray(v) ? v : (v ? [v] : []);
      for (const rec of list) if (rec && rec.tier >= START_TIER) _drawPuddle(layer, rec);
    }
  }

  async function _maybeUpsertPuddle(token, tier) {
    if (!game.user.isGM || !canvas?.scene) return;
    if (tier < START_TIER) return;
    const grid = canvas.grid?.size ?? 100;
    const map = foundry.utils.duplicate(canvas.scene.getFlag(MODULE_ID, PUDDLE_KEY) ?? {});
    let list = map[token.id];
    if (!Array.isArray(list)) list = list ? [list] : [];      // back-compat with old single record
    const cx = token.center.x, cy = token.center.y;
    // Grow the nearest puddle if the token is still roughly where it was;
    // otherwise drop a NEW puddle at the current position (token has moved).
    let near = null, nd = Infinity;
    for (const rec of list) {
      const d = Math.hypot((rec.x ?? 0) - cx, (rec.y ?? 0) - cy);
      if (d < nd) { nd = d; near = rec; }
    }
    if (near && nd <= grid * 0.9) {
      if (near.tier >= tier) return;
      near.tier = tier;
    } else {
      list.push({ x: cx, y: cy, tier, seed: (_hash(`${token.id}|${Date.now()}|${list.length}`) >>> 0) });
    }
    map[token.id] = list;
    await canvas.scene.setFlag(MODULE_ID, PUDDLE_KEY, map);
  }

  // ── Public API ──────────────────────────────────────────────────────────
  const AFLP_Splatter = {
    _coats: new Map(),
    _ground: null,
    _registered: false,

    _tokensFor(actor) {
      if (!canvas?.tokens || !actor) return [];
      return canvas.tokens.placeables.filter(t => t.actor === actor || t.document?.actorId === actor.id);
    },

    refreshActor(actor) {
      if (!sEnabled() || !actor) return;
      if (!actor.hasPlayerOwner && !sIncludeNpc()) return;
      const tier = _effectiveTier(actor.getFlag(SCOPE, "cumflation"));
      for (const token of this._tokensFor(actor)) { _ensureCoat(token, tier); _maybeUpsertPuddle(token, tier); }
    },

    refreshAll() {
      if (!canvas?.ready) return;
      for (const coat of this._coats.values()) { coat.mask = null; coat.destroy({ children: true }); }
      this._coats.clear();
      // Invalidate cached drape textures so a quality change rebuilds the coat at
      // the new resolution/detail (puddles rebuild below regardless).
      for (const k in _drapeCache) {
        const d = _drapeCache[k];
        try { d?.body?.destroy(true); d?.gloss?.destroy(true); d?.core?.destroy(true); } catch (e) {}
        delete _drapeCache[k];
      }
      if (sEnabled() && !sHideLocal()) {
        for (const token of canvas.tokens.placeables) {
          const tier = _effectiveTier(token.actor?.getFlag(SCOPE, "cumflation"));
          if (tier >= START_TIER && (token.actor?.hasPlayerOwner || sIncludeNpc())) _ensureCoat(token, tier);
        }
      }
      _redrawPuddles();
    },

    async clearScenePuddles(scene = canvas?.scene) {
      if (!game.user.isGM || !scene) return;
      await scene.unsetFlag(MODULE_ID, PUDDLE_KEY);
    },

    register() {
      if (this._registered) return;
      this._registered = true;

      Hooks.on("canvasReady", () => this.refreshAll());
      Hooks.on("canvasTearDown", () => {
        for (const coat of this._coats.values()) { try { coat.mask = null; coat.destroy({ children: true }); } catch (e) {} }
        this._coats.clear();
        if (this._ground && !this._ground.destroyed) { try { this._ground.destroy({ children: true }); } catch (e) {} }
        this._ground = null;
      });

      Hooks.on("updateActor", (actor, changes) => {
        if (foundry.utils.getProperty(changes, `flags.${SCOPE}.cumflation`) === undefined) return;
        this.refreshActor(actor);
      });

      Hooks.on("refreshToken", (token) => {
        const coat = this._coats.get(token.id);
        if (coat && !coat.destroyed && coat.parent === token) return;   // still good, no work
        // Coat missing/detached/destroyed (a redraw on click-drag wipes it) -> rebuild.
        if (!sEnabled()) return;
        const tier = _effectiveTier(token.actor?.getFlag(SCOPE, "cumflation"));
        if (tier >= START_TIER && (token.actor?.hasPlayerOwner || sIncludeNpc())) _ensureCoat(token, tier);
      });
      Hooks.on("drawToken", (token) => {
        const tier = _effectiveTier(token.actor?.getFlag(SCOPE, "cumflation"));
        if (tier >= START_TIER && sEnabled() && (token.actor?.hasPlayerOwner || sIncludeNpc())) _ensureCoat(token, tier);
      });
      Hooks.on("destroyToken", (token) => {
        const coat = this._coats.get(token.id);
        if (coat && !coat.destroyed) { coat.mask = null; coat.destroy({ children: true }); }
        this._coats.delete(token.id);
      });

      Hooks.on("updateScene", (scene, changes) => {
        if (scene.id !== canvas?.scene?.id) return;
        if (foundry.utils.getProperty(changes, `flags.${MODULE_ID}.${PUDDLE_KEY}`) === undefined) return;
        _redrawPuddles();
      });

      console.log("AFLP | Splatter registered");

      // register() runs in the `ready` hook, which fires AFTER the first
      // canvasReady - so that initial event was already missed. The canvas is
      // up by now, so draw the current scene immediately.
      if (canvas?.ready) this.refreshAll();
    },
  };

  window.AFLP_Splatter = AFLP_Splatter;
  if (window.AFLP) window.AFLP.Splatter = AFLP_Splatter;
})();
