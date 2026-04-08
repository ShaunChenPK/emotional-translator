/* =====================================================
   EMOTIONAL TRANSLATOR — sketch.js
   p5.js visual engine: evolving abstract artwork
   driven by emotional state data
   ===================================================== */

const emotionalSketch = (p) => {

  // ── Current + Target State ──────────────────────────
  let current = {
    valence: 0, arousal: 0.1, intensity: 0.1,
    dominant_emotion: "neutral",
    secondary_emotions: [],
    vocal_features: { pace: "moderate", hesitation: "none", pitch_variation: "narrow", tension: "relaxed" },
    visual_keywords: [],
  };
  let target = { ...current };
  let history = [];

  // ── Canvas layers ───────────────────────────────────
  let bgLayer, particleLayer, glowLayer;

  // ── Particle system ─────────────────────────────────
  let particles = [];
  let MAX_PARTICLES = 220;

  // ── Flow field ──────────────────────────────────────
  let cols, rows;
  let flowField = [];
  const FIELD_SCALE = 18;
  let zoff = 0;

  // ── History shapes ──────────────────────────────────
  let historyTrails = [];

  // ── Palette ─────────────────────────────────────────
  let palette = { warm: [], cool: [], accent: [] };
  let bgColor;

  // ── Eased display values ────────────────────────────
  let eased = {
    valence: 0, arousal: 0.1, intensity: 0.1,
    hue: 200, sat: 30, speed: 0.5,
  };

  // ── Setup ────────────────────────────────────────────
  p.setup = () => {
    const container = document.getElementById("p5-canvas-container");
    const canvas = p.createCanvas(container.offsetWidth, container.offsetHeight);
    canvas.parent("p5-canvas-container");

    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noStroke();

    bgLayer     = p.createGraphics(p.width, p.height);
    particleLayer = p.createGraphics(p.width, p.height);
    glowLayer   = p.createGraphics(p.width, p.height);

    bgLayer.colorMode(p.HSB, 360, 100, 100, 100);
    particleLayer.colorMode(p.HSB, 360, 100, 100, 100);
    glowLayer.colorMode(p.HSB, 360, 100, 100, 100);

    cols = Math.floor(p.width / FIELD_SCALE);
    rows = Math.floor(p.height / FIELD_SCALE);
    flowField = new Array(cols * rows);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles.push(createParticle());
    }

    buildPalette();

    // Expose update function globally
    window.updateEmotionState = (newState, newHistory) => {
      target = { ...newState };
      history = newHistory || [];
      buildPalette();
      onEmotionChange(newState);
    };
  };

  // ── Draw Loop ─────────────────────────────────────────
  p.draw = () => {
    easeValues();
    updateFlowField();
    drawBackground();
    drawHistoryTrails();
    drawParticles();
    drawGlowLayer();
    drawEmotionOverlay();

    // Composite
    p.clear();
    p.image(bgLayer, 0, 0);
    p.image(particleLayer, 0, 0);
    p.image(glowLayer, 0, 0);

    zoff += 0.0005 + eased.arousal * 0.002;
  };

  // ── Easing ───────────────────────────────────────────
  function easeValues() {
    const e = 0.04;
    eased.valence   = p.lerp(eased.valence,   target.valence, e);
    eased.arousal   = p.lerp(eased.arousal,   target.arousal, e);
    eased.intensity = p.lerp(eased.intensity, target.intensity, e);

    // Target hue: valence→warm/cool
    const targetHue = p.map(eased.valence, -1, 1, 200, 30);
    eased.hue = p.lerp(eased.hue, targetHue, 0.02);

    const targetSat = p.map(eased.intensity, 0, 1, 15, 70);
    eased.sat = p.lerp(eased.sat, targetSat, 0.02);

    eased.speed = 0.4 + eased.arousal * 3.5;
  }

  // ── Build Palette ────────────────────────────────────
  function buildPalette() {
    const v = target.valence;
    const a = target.arousal;
    const i = target.intensity;

    // warm hues 0-60, cool hues 180-260
    const warmBase = p.map(v, -1, 1, 5, 45);
    const coolBase = p.map(v, -1, 1, 250, 190);
    const sat      = p.map(i, 0, 1, 20, 85);
    const bri      = p.map(a, 0, 1, 40, 90);

    palette.warm  = [
      p.color(warmBase,         sat,       bri,       90),
      p.color(warmBase + 15,    sat * 0.8, bri * 0.8, 70),
      p.color(warmBase + 30,    sat * 0.6, bri * 0.6, 50),
    ];
    palette.cool  = [
      p.color(coolBase,         sat,       bri,       90),
      p.color(coolBase - 20,    sat * 0.8, bri * 0.8, 70),
      p.color(coolBase + 20,    sat * 0.6, bri * 0.6, 50),
    ];
    palette.accent = [
      p.color(eased.hue + 40,  sat * 1.2, 90, 80),
      p.color(eased.hue - 30,  sat * 0.9, 70, 60),
    ];

    bgColor = p.color(
      p.map(v, -1, 1, 220, 25),
      p.map(i, 0, 1, 5, 25),
      p.map(a, 0, 1, 4, 10),
      100
    );
  }

  // ── Background ───────────────────────────────────────
  function drawBackground() {
    bgLayer.noStroke();

    // Slow fade for persistence
    bgLayer.fill(
      p.hue(bgColor), p.saturation(bgColor), p.brightness(bgColor),
      p.map(eased.arousal, 0, 1, 8, 25)
    );
    bgLayer.rect(0, 0, p.width, p.height);

    // Vignette
    drawVignette(bgLayer);

    // Nebula clouds (low arousal = more spacious)
    if (p.frameCount % 3 === 0) {
      drawNebulaCloud(bgLayer);
    }
  }

  function drawVignette(g) {
    const cx = p.width / 2, cy = p.height / 2;
    const r = Math.max(p.width, p.height) * 0.72;
    const numSteps = 12;
    for (let i = numSteps; i >= 0; i--) {
      const t = i / numSteps;
      const alpha = p.pow(t, 1.8) * 60;
      g.noStroke();
      g.fill(0, 0, 0, alpha);
      g.ellipse(cx, cy, r * (1 - t * 0.6) * 2, r * (1 - t * 0.5) * 2);
    }
  }

  function drawNebulaCloud(g) {
    const cx = p.width  * (0.2 + p.noise(zoff * 0.4) * 0.6);
    const cy = p.height * (0.2 + p.noise(zoff * 0.4 + 100) * 0.6);
    const size = p.map(eased.intensity, 0, 1, 80, 260);
    const h = p.map(eased.valence, -1, 1, 240, 35);
    const s = p.map(eased.intensity, 0, 1, 10, 40);
    const b = p.map(eased.arousal, 0, 1, 20, 50);

    g.noStroke();
    for (let r = size; r > 0; r -= size / 8) {
      const alpha = p.map(r, size, 0, 0, 4);
      g.fill(h, s, b, alpha);
      g.ellipse(cx, cy, r * 2, r * 1.4);
    }
  }

  // ── Flow Field ───────────────────────────────────────
  function updateFlowField() {
    let idx = 0;
    // Emotional influence on field: arousal = more turbulence
    const noiseScale = p.map(eased.arousal, 0, 1, 0.003, 0.012);
    const angleRange  = p.map(eased.arousal, 0, 1, p.TWO_PI * 0.3, p.TWO_PI * 1.8);
    const tensionBias  = getTensionBias();

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const angle = p.noise(x * noiseScale * FIELD_SCALE, y * noiseScale * FIELD_SCALE, zoff)
          * angleRange + tensionBias;
        flowField[idx++] = angle;
      }
    }
  }

  function getTensionBias() {
    const vf = target.vocal_features || {};
    const tension = vf.tension || "relaxed";
    const map = { relaxed: 0, mild: 0.2, moderate: 0.5, taut: 1.0, strained: 1.8 };
    return (map[tension] || 0) * p.PI;
  }

  // ── Particles ────────────────────────────────────────
  function createParticle(forced) {
    const side = forced
      ? Math.floor(p.random(4))
      : Math.floor(p.random(4));

    let x, y;
    if (side === 0) { x = p.random(p.width); y = 0; }
    else if (side === 1) { x = p.width; y = p.random(p.height); }
    else if (side === 2) { x = p.random(p.width); y = p.height; }
    else { x = 0; y = p.random(p.height); }

    return {
      x, y,
      px: x, py: y,
      life: p.random(80, 220),
      maxLife: 220,
      size: p.random(0.8, 3.5),
      speed: p.random(0.6, 2.5),
      colorIdx: Math.floor(p.random(3)),
      type: Math.random() < 0.3 ? "glow" : "line",
      // For hesitation: occasional freeze
      frozen: false,
      frozenTimer: 0,
    };
  }

  function drawParticles() {
    const hesitation = (target.vocal_features || {}).hesitation || "none";
    const hesMap = { none: 0, minimal: 0.02, occasional: 0.06, frequent: 0.12, excessive: 0.22 };
    const hesitationChance = hesMap[hesitation] || 0;

    particleLayer.noFill();

    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];

      // Hesitation: stutter
      if (!pt.frozen && p.random() < hesitationChance) {
        pt.frozen = true;
        pt.frozenTimer = p.floor(p.random(4, 18));
      }
      if (pt.frozen) {
        pt.frozenTimer--;
        if (pt.frozenTimer <= 0) pt.frozen = false;
        // Vibrate slightly while frozen
        pt.x += p.random(-1.2, 1.2);
        pt.y += p.random(-1.2, 1.2);
      }

      if (!pt.frozen) {
        // Flow field lookup
        const col = p.floor(pt.x / FIELD_SCALE);
        const row = p.floor(pt.y / FIELD_SCALE);
        const clamped_col = p.constrain(col, 0, cols - 1);
        const clamped_row = p.constrain(row, 0, rows - 1);
        const angle = flowField[clamped_row * cols + clamped_col];

        const spd = pt.speed * eased.speed;
        pt.px = pt.x;
        pt.py = pt.y;
        pt.x += Math.cos(angle) * spd;
        pt.y += Math.sin(angle) * spd;

        // Valence bias: positive = upward drift, negative = downward
        pt.y += p.map(eased.valence, -1, 1, 0.6, -0.6);
      }

      pt.life--;

      // Draw
      const lifeRatio = pt.life / pt.maxLife;
      const alpha     = lifeRatio * p.map(eased.intensity, 0, 1, 30, 85);
      const col_arr   = eased.valence > 0 ? palette.warm : palette.cool;
      const c         = col_arr[pt.colorIdx % col_arr.length] || col_arr[0];

      if (pt.type === "glow") {
        particleLayer.noStroke();
        particleLayer.fill(p.hue(c), p.saturation(c), p.brightness(c), alpha * 0.4);
        const gs = pt.size * p.map(eased.intensity, 0, 1, 4, 14);
        particleLayer.ellipse(pt.x, pt.y, gs, gs);
      } else {
        particleLayer.stroke(p.hue(c), p.saturation(c), p.brightness(c), alpha);
        particleLayer.strokeWeight(pt.size * 0.6);
        particleLayer.line(pt.px, pt.py, pt.x, pt.y);
      }

      // Recycle off-screen or dead particles
      if (
        pt.life <= 0 ||
        pt.x < -20 || pt.x > p.width + 20 ||
        pt.y < -20 || pt.y > p.height + 20
      ) {
        particles[i] = createParticle();
      }
    }

    // Spawn more particles with higher intensity
    const targetCount = p.floor(p.map(eased.intensity, 0, 1, 60, MAX_PARTICLES));
    while (particles.length < targetCount) {
      particles.push(createParticle());
    }
    while (particles.length > MAX_PARTICLES) {
      particles.pop();
    }
  }

  // ── Glow Layer ───────────────────────────────────────
  function drawGlowLayer() {
    glowLayer.clear();
    if (eased.intensity < 0.15) return;

    // Soft radial glow at canvas center
    const cx = p.width / 2;
    const cy = p.height / 2;
    const r  = p.map(eased.intensity, 0, 1, 60, 320);
    const h  = eased.hue;
    const s  = p.map(eased.intensity, 0, 1, 20, 60);

    glowLayer.noStroke();
    for (let i = 8; i >= 0; i--) {
      const t = i / 8;
      const alpha = (1 - t) * p.map(eased.intensity, 0, 1, 0, 22);
      glowLayer.fill(h, s, 90, alpha);
      glowLayer.ellipse(cx, cy, r * t * 2, r * t * 1.5);
    }
  }

  // ── History Trails ───────────────────────────────────
  function drawHistoryTrails() {
    if (history.length < 2) return;

    // Draw faint connecting arcs between recent emotions
    const recent = history.slice(-6);
    for (let i = 0; i < recent.length - 1; i++) {
      const e1 = recent[i], e2 = recent[i + 1];
      const t   = i / (recent.length - 1);
      const x1  = p.map(e1.valence, -1, 1, p.width * 0.15, p.width * 0.85);
      const y1  = p.map(e1.arousal, 0, 1, p.height * 0.85, p.height * 0.15);
      const x2  = p.map(e2.valence, -1, 1, p.width * 0.15, p.width * 0.85);
      const y2  = p.map(e2.arousal, 0, 1, p.height * 0.85, p.height * 0.15);
      const alpha = t * p.map(eased.intensity, 0, 1, 5, 25);

      bgLayer.stroke(eased.hue, 40, 70, alpha);
      bgLayer.strokeWeight(0.5);
      bgLayer.noFill();
      bgLayer.line(x1, y1, x2, y2);
      bgLayer.noStroke();

      // Node dots
      bgLayer.fill(eased.hue, 50, 80, alpha * 2);
      bgLayer.ellipse(x1, y1, 4, 4);
    }
  }

  // ── Emotion Change Event ─────────────────────────────
  function onEmotionChange(state) {
    const em = state.dominant_emotion?.toLowerCase() || "";

    // Spawn burst of particles
    const burstCount = p.floor(p.map(state.intensity, 0, 1, 10, 45));
    for (let i = 0; i < burstCount; i++) {
      const angle = p.random(p.TWO_PI);
      const r     = p.random(p.min(p.width, p.height) * 0.08, p.min(p.width, p.height) * 0.45);
      const cx    = p.width / 2;
      const cy    = p.height / 2;
      particles.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        px: cx + Math.cos(angle) * r,
        py: cy + Math.sin(angle) * r,
        life: p.random(40, 140),
        maxLife: 140,
        size: p.random(0.8, 4),
        speed: p.random(1, 4),
        colorIdx: Math.floor(p.random(3)),
        type: p.random() < 0.4 ? "glow" : "line",
        frozen: false,
        frozenTimer: 0,
      });
    }
  }

  // ── Overlay: emotion-specific texture ───────────────
  function drawEmotionOverlay() {
    const em = target.dominant_emotion?.toLowerCase() || "";

    if (em.includes("anxiet") || em.includes("dread") || em.includes("fear")) {
      drawAnxietyTexture();
    } else if (em.includes("sad") || em.includes("desolat") || em.includes("grief") || em.includes("numb")) {
      drawSadnessTexture();
    } else if (em.includes("joy") || em.includes("elat") || em.includes("delight")) {
      drawJoyTexture();
    } else if (em.includes("calm") || em.includes("peace") || em.includes("serene")) {
      drawCalmTexture();
    } else if (em.includes("hope") || em.includes("wonder") || em.includes("awe")) {
      drawHopeTexture();
    } else if (em.includes("anger") || em.includes("rage") || em.includes("fervor")) {
      drawAngerTexture();
    }
  }

  function drawAnxietyTexture() {
    // Fragmented edge lines
    if (p.frameCount % 2 !== 0) return;
    const count = p.floor(eased.intensity * 14);
    particleLayer.stroke(p.map(eased.valence,-1,1,280,0), 60, 90, 25);
    particleLayer.strokeWeight(0.5);
    for (let i = 0; i < count; i++) {
      const x1 = p.random(p.width), y1 = p.random(p.height);
      const len = p.random(3, 22) * eased.intensity;
      const ang = p.random(p.TWO_PI);
      particleLayer.line(x1, y1, x1 + Math.cos(ang) * len, y1 + Math.sin(ang) * len);
    }
    particleLayer.noStroke();
  }

  function drawSadnessTexture() {
    // Slow downward drifting drops
    if (p.frameCount % 4 !== 0) return;
    const count = p.floor(eased.intensity * 5);
    glowLayer.noStroke();
    for (let i = 0; i < count; i++) {
      const x = p.random(p.width * 0.1, p.width * 0.9);
      const y = p.random(p.height * 0.1, p.height * 0.7);
      const h = p.map(eased.valence, -1, 0, 230, 200);
      glowLayer.fill(h, 30, 70, 12);
      glowLayer.ellipse(x, y, 3, 7);
      glowLayer.fill(h, 40, 60, 6);
      glowLayer.ellipse(x, y + 8, 2, 5);
    }
  }

  function drawJoyTexture() {
    // Blooming circles
    if (p.frameCount % 3 !== 0) return;
    const count = p.floor(eased.intensity * 6);
    glowLayer.noStroke();
    for (let i = 0; i < count; i++) {
      const x = p.random(p.width * 0.2, p.width * 0.8);
      const y = p.random(p.height * 0.2, p.height * 0.8);
      const size = p.random(8, 40) * eased.intensity;
      const h = p.random(20, 60);
      for (let r = size; r > 0; r -= size / 5) {
        glowLayer.fill(h, 60, 95, p.map(r, size, 0, 0, 18));
        glowLayer.ellipse(x, y, r, r);
      }
    }
  }

  function drawCalmTexture() {
    // Smooth flowing bands
    if (p.frameCount % 6 !== 0) return;
    bgLayer.stroke(eased.hue, 20, 70, 6);
    bgLayer.strokeWeight(0.8);
    bgLayer.noFill();
    const y0 = p.height / 2 + p.sin(zoff * 2) * p.height * 0.1;
    bgLayer.beginShape();
    for (let x = 0; x <= p.width; x += 8) {
      const y = y0 + p.noise(x * 0.003, zoff) * p.height * 0.15;
      bgLayer.curveVertex(x, y);
    }
    bgLayer.endShape();
    bgLayer.noStroke();
  }

  function drawHopeTexture() {
    // Upward glowing rays
    if (p.frameCount % 5 !== 0) return;
    const cx = p.width / 2;
    const cy = p.height * 0.6;
    const count = p.floor(eased.intensity * 7);
    bgLayer.noFill();
    for (let i = 0; i < count; i++) {
      const x1 = cx + p.random(-p.width * 0.3, p.width * 0.3);
      const y1 = cy + p.random(-20, 20);
      const x2 = x1 + p.random(-40, 40);
      const y2 = p.random(0, p.height * 0.3);
      bgLayer.stroke(40, 50, 90, p.random(3, 10) * eased.intensity);
      bgLayer.strokeWeight(0.4);
      bgLayer.line(x1, y1, x2, y2);
    }
    bgLayer.noStroke();
  }

  function drawAngerTexture() {
    // Sharp diagonal slashes
    if (p.frameCount % 2 !== 0) return;
    const count = p.floor(eased.intensity * 8);
    particleLayer.stroke(5, 80, 90, 30 * eased.intensity);
    particleLayer.strokeWeight(0.7);
    for (let i = 0; i < count; i++) {
      const x = p.random(p.width);
      const y = p.random(p.height);
      const len = p.random(15, 55) * eased.intensity;
      particleLayer.line(x, y, x + len, y - len * 0.8);
    }
    particleLayer.noStroke();
  }

  // ── Resize ───────────────────────────────────────────
  p.windowResized = () => {
    const container = document.getElementById("p5-canvas-container");
    p.resizeCanvas(container.offsetWidth, container.offsetHeight);
    bgLayer     = p.createGraphics(p.width, p.height);
    particleLayer = p.createGraphics(p.width, p.height);
    glowLayer   = p.createGraphics(p.width, p.height);
    bgLayer.colorMode(p.HSB, 360, 100, 100, 100);
    particleLayer.colorMode(p.HSB, 360, 100, 100, 100);
    glowLayer.colorMode(p.HSB, 360, 100, 100, 100);
    cols = Math.floor(p.width / FIELD_SCALE);
    rows = Math.floor(p.height / FIELD_SCALE);
    flowField = new Array(cols * rows);
  };

};

// Mount sketch
new p5(emotionalSketch, document.getElementById("p5-canvas-container"));
