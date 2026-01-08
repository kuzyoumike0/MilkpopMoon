(() => {
  "use strict";

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  function resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width  = Math.floor(canvas.clientWidth  * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initStarsAndClouds();
  }
  window.addEventListener("resize", resize);

  /* =========================
   * Assets
   * ========================= */
  const IMG_SRC = ".assets/bunny.png"; // ★ここが一致してるか確認
  const img = new Image();
  img.src = IMG_SRC;

  let imgReady = false;
  let imgError = "";

  img.onload = () => { imgReady = true; };
  img.onerror = () => {
    imgReady = false;
    imgError = `画像読み込み失敗: ${IMG_SRC}\n` +
               `✅ bunny.png が index.html と同じ階層にあるか\n` +
               `✅ ファイル名の大文字小文字/拡張子が一致してるか\n` +
               `✅ Live Server など http で開いているか`;
  };

  /* ===== SE ===== */
  const CLICK_SE_SRC = "./assets/se/Onoma-Pop03-1(High).mp3";
  const clickSE = new Audio(CLICK_SE_SRC);
  clickSE.volume = 0.8;

  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      clickSE.muted = true;
      clickSE.currentTime = 0;
      const p = clickSE.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          clickSE.pause();
          clickSE.currentTime = 0;
          clickSE.muted = false;
        }).catch(() => { clickSE.muted = false; });
      } else {
        clickSE.pause();
        clickSE.currentTime = 0;
        clickSE.muted = false;
      }
    } catch {}
  }

  /* =========================
   * Physics
   * ========================= */
  const GRAVITY = 1800;
  const AIR_DRAG = 0.995;
  const BOUNCE = 0.35;
  const FLOOR_FRICTION = 0.85;

  const JUMP_SPEED_MIN = 850;
  const JUMP_SPEED_MAX = 1250;
  const ANGLE_MIN = (-110) * Math.PI / 180;
  const ANGLE_MAX = (-70)  * Math.PI / 180;

  const HIT_PADDING = 8;

  /* =========================
   * Bunny
   * ========================= */
  const bunny = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    w: 160, h: 160,
    onGround: false,
  };

  function resetBunny() {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    bunny.x = W * 0.5;
    bunny.y = H * 0.75;
    bunny.vx = 0;
    bunny.vy = 0;
    bunny.onGround = true;
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  function jumpBoost() {
    clickSE.currentTime = 0;
    clickSE.play().catch(() => {});

    const angle = rand(ANGLE_MIN, ANGLE_MAX);
    const speed = rand(JUMP_SPEED_MIN, JUMP_SPEED_MAX);

    bunny.vx += Math.cos(angle) * speed * 0.45;
    bunny.vy = Math.min(bunny.vy, 0);
    bunny.vy += Math.sin(angle) * speed;

    bunny.onGround = false;
  }

  function isHit(mx, my) {
    const left = bunny.x - bunny.w / 2 - HIT_PADDING;
    const top  = bunny.y - bunny.h / 2 - HIT_PADDING;
    const w    = bunny.w + HIT_PADDING * 2;
    const h    = bunny.h + HIT_PADDING * 2;
    return mx >= left && mx <= left + w && my >= top && my <= top + h;
  }

  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    if (typeof e.clientX === "number") return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (t) return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    return { x: 0, y: 0 };
  }

  canvas.addEventListener("pointerdown", (e) => {
    unlockAudioOnce();
    const p = getPointerPos(e);
    if (isHit(p.x, p.y)) jumpBoost();
  });

  /* =========================
   * Background
   * ========================= */
  const BG_GROUND = { r: 255, g: 245, b: 250 };
  const BG_SKY    = { r: 180, g: 220, b: 255 };
  const BG_SPACE  = { r: 30,  g: 40,  b: 80  };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpColor(c1, c2, t) {
    return {
      r: Math.round(lerp(c1.r, c2.r, t)),
      g: Math.round(lerp(c1.g, c2.g, t)),
      b: Math.round(lerp(c1.b, c2.b, t)),
    };
  }

  /* =========================
   * Stars & Clouds
   * ========================= */
  const SPACE_START_T = 0.72;
  const SPACE_FULL_T  = 0.95;

  const CLOUD_START_T = 0.45;
  const CLOUD_FULL_T  = 0.70;

  const STAR_COUNT = 90;
  const STAR_TWINKLE_SPEED = 1.6;
  const CLOUD_COUNT = 8;

  const stars = [];
  const clouds = [];

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }

  function initStarsAndClouds() {
    stars.length = 0;
    clouds.length = 0;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.8 + Math.random() * 1.8,
        phase: Math.random() * Math.PI * 2,
        spd: 0.6 + Math.random() * 1.6,
      });
    }

    for (let i = 0; i < CLOUD_COUNT; i++) {
      clouds.push({
        x: Math.random() * W,
        y: H * (0.18 + Math.random() * 0.45),
        w: W * (0.35 + Math.random() * 0.45),
        h: 40 + Math.random() * 55,
        a: 0.25 + Math.random() * 0.35,
        drift: (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 28),
      });
    }
  }

  function drawStars(heightT, timeSec) {
    const starT = smoothstep((heightT - SPACE_START_T) / (SPACE_FULL_T - SPACE_START_T));
    if (starT <= 0) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    ctx.save();
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(timeSec * STAR_TWINKLE_SPEED * s.spd + s.phase);
      ctx.globalAlpha = tw * starT;

      ctx.beginPath();
      ctx.arc(s.x % W, s.y % H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();
    }
    ctx.restore();
  }

  function pathRoundRect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawRainbowClouds(heightT, dt) {
    const cloudT = smoothstep((heightT - CLOUD_START_T) / (CLOUD_FULL_T - CLOUD_START_T));
    if (cloudT <= 0) return;

    const W = canvas.clientWidth;

    ctx.save();
    for (const c of clouds) {
      c.x += c.drift * dt;
      if (c.x < -c.w) c.x = W;
      if (c.x > W) c.x = -c.w;

      const g = ctx.createLinearGradient(c.x, c.y, c.x + c.w, c.y);
      g.addColorStop(0,   "rgba(255,100,200,0)");
      g.addColorStop(0.2, "rgba(255,150,80,0.7)");
      g.addColorStop(0.4, "rgba(255,255,120,0.7)");
      g.addColorStop(0.6, "rgba(120,255,170,0.7)");
      g.addColorStop(0.8, "rgba(120,190,255,0.7)");
      g.addColorStop(1,   "rgba(180,140,255,0)");

      ctx.globalAlpha = c.a * cloudT;
      ctx.fillStyle = g;

      const r = c.h / 2;
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(c.x, c.y, c.w, c.h, r);
        ctx.fill();
      } else {
        pathRoundRect(c.x, c.y, c.w, c.h, r);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* =========================
   * Loop
   * ========================= */
  let last = performance.now();

  function step(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const floorY = H - 10;

    // physics
    bunny.vy += GRAVITY * dt;
    bunny.x += bunny.vx * dt;
    bunny.y += bunny.vy * dt;
    bunny.vx *= Math.pow(AIR_DRAG, dt * 60);

    const halfW = bunny.w / 2;
    const halfH = bunny.h / 2;

    if (bunny.x < halfW) { bunny.x = halfW; bunny.vx *= -0.5; }
    if (bunny.x > W - halfW) { bunny.x = W - halfW; bunny.vx *= -0.5; }

    if (bunny.y > floorY - halfH) {
      bunny.y = floorY - halfH;
      if (Math.abs(bunny.vy) > 250) {
        bunny.vy *= -BOUNCE;
        bunny.onGround = false;
      } else {
        bunny.vy = 0;
        bunny.onGround = true;
        bunny.vx *= FLOOR_FRICTION;
      }
    } else {
      bunny.onGround = false;
    }

    // height normalize
    let heightT = (floorY - bunny.y) / (H * 0.75);
    heightT = clamp01(heightT);

    // bg color
    let bg;
    if (heightT < 0.5) bg = lerpColor(BG_GROUND, BG_SKY, heightT * 2);
    else bg = lerpColor(BG_SKY, BG_SPACE, (heightT - 0.5) * 2);

    ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
    ctx.fillRect(0, 0, W, H);

    drawStars(heightT, now / 1000);
    drawRainbowClouds(heightT, dt);

    // ground line
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    ctx.lineTo(W, floorY);
    ctx.stroke();

    // bunny (or fallback)
    if (imgReady) {
      ctx.drawImage(img, bunny.x - bunny.w / 2, bunny.y - bunny.h / 2, bunny.w, bunny.h);
    } else {
      // 代替：ピンクの丸（画像が読めない時もゲーム自体は動く）
      ctx.fillStyle = "rgba(255,120,170,0.9)";
      ctx.beginPath();
      ctx.arc(bunny.x, bunny.y, Math.min(bunny.w, bunny.h) * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // エラー文を画面に表示
      if (imgError) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillRect(12, 52, Math.min(W - 24, 520), 120);
        ctx.fillStyle = "#b00020";
        ctx.font = "14px system-ui, -apple-system, Segoe UI, sans-serif";
        const lines = imgError.split("\n");
        lines.forEach((line, i) => ctx.fillText(line, 20, 78 + i * 18));
        ctx.restore();
      } else {
        // まだ読み込み中表示
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.font = "14px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.fillText("画像読み込み中…", 20, 78);
        ctx.restore();
      }
    }

    requestAnimationFrame(step);
  }

  /* =========================
   * Start
   * ========================= */
  img.onload = () => {
    imgReady = true;

    const base = Math.min(canvas.clientWidth, canvas.clientHeight) * 0.35;
    bunny.h = base;
    bunny.w = base * (img.width / img.height);

    resize();
    resetBunny();
    requestAnimationFrame(step);
  };

  // onerror は上で設定済み

  resize();
  resetBunny();
  requestAnimationFrame(step);
})();
