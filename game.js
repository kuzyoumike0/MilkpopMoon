(() => {
  "use strict";

  /* =========================
   * Canvas
   * ========================= */
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
   * Assets（指定パス）
   * ========================= */
  const IMG_SRC = "./assets/bunny.png";
  const img = new Image();
  img.src = IMG_SRC;

  let imgReady = false;
  let imgError = "";

  img.onload = () => { imgReady = true; };
  img.onerror = () => {
    imgReady = false;
    imgError =
      `画像読み込み失敗: ${IMG_SRC}\n` +
      `✅ assets/bunny.png が存在するか\n` +
      `✅ 大文字小文字・拡張子が一致するか\n` +
      `✅ Live Server など http で開いているか`;
  };

  /* ===== SE（指定パス） ===== */
  const CLICK_SE_SRC = "./assets/se/Onoma-Pop03-1(High).mp3";
  const clickSE = new Audio(CLICK_SE_SRC);
  clickSE.volume = 0.8;

  // iOS等の「ユーザー操作後に音OK」対策
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
  const GRAVITY = 1800;     // +下
  const AIR_DRAG = 0.995;
  const BOUNCE = 0.35;
  const FLOOR_FRICTION = 0.85;

  const JUMP_SPEED_MIN = 850;
  const JUMP_SPEED_MAX = 1250;
  const ANGLE_MIN = (-110) * Math.PI / 180;
  const ANGLE_MAX = (-70)  * Math.PI / 180;

  const HIT_PADDING = 10;

  /* =========================
   * World / Camera
   * =========================
   * - ワールドY: 下が+（重力と同じ）
   * - 地面は worldY = 0
   * - カメラ cameraY は「画面に映すためのワールドYオフセット」
   *   screenY = worldY - cameraY
   */
  const FLOOR_Y = 0;
  let cameraY = 0;

  // うさぎがこのラインより上に行ったら、カメラが追従して上へ
  const CAMERA_FOLLOW_LINE_RATIO = 0.35; // 画面上から35%の位置
  const CAMERA_EASE = 0.14;              // 追従の滑らかさ

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* =========================
   * Bunny (world coords)
   * ========================= */
  const bunny = {
    x: 0,        // 画面基準（横はカメラ不要）
    y: 0,        // ワールド座標
    vx: 0,
    vy: 0,
    w: 160,
    h: 160,
    onGround: false,
  };

  function resetBunny() {
    const W = canvas.clientWidth;
    bunny.x = W * 0.5;
    bunny.y = FLOOR_Y - (bunny.h / 2); // 地面に乗せる
    bunny.vx = 0;
    bunny.vy = 0;
    bunny.onGround = true;
    cameraY = 0; // 地面スタート
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function jumpBoost() {
    clickSE.currentTime = 0;
    clickSE.play().catch(() => {});

    const angle = rand(ANGLE_MIN, ANGLE_MAX);
    const speed = rand(JUMP_SPEED_MIN, JUMP_SPEED_MAX);

    // 横は少し、縦は上方向（sinは負になる角度域）
    bunny.vx += Math.cos(angle) * speed * 0.45;
    bunny.vy = Math.min(bunny.vy, 0);
    bunny.vy += Math.sin(angle) * speed;

    bunny.onGround = false;
  }

  // ワールド座標→スクリーン座標
  function bunnyScreenRect() {
    const sx = bunny.x;
    const sy = bunny.y - cameraY;
    return {
      left: sx - bunny.w / 2,
      top:  sy - bunny.h / 2,
      w: bunny.w,
      h: bunny.h,
      cx: sx,
      cy: sy,
    };
  }

  function isHit(mx, my) {
    const r = bunnyScreenRect();
    const left = r.left - HIT_PADDING;
    const top  = r.top  - HIT_PADDING;
    const w    = r.w + HIT_PADDING * 2;
    const h    = r.h + HIT_PADDING * 2;
    return mx >= left && mx <= left + w && my >= top && my <= top + h;
  }

  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    if (typeof e.clientX === "number" && typeof e.clientY === "number") {
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (t) return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    return { x: 0, y: 0 };
  }

  // スクロール防止（ページが上に動く対策）
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    unlockAudioOnce();
    const p = getPointerPos(e);
    if (isHit(p.x, p.y)) jumpBoost();
  }, { passive: false });

  canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener("touchmove",  (e) => e.preventDefault(), { passive: false });

  /* =========================
   * Background (height-based)
   * ========================= */
  const BG_GROUND = { r: 255, g: 245, b: 250 };
  const BG_SKY    = { r: 180, g: 220, b: 255 };
  const BG_SPACE  = { r: 30,  g: 40,  b: 80  };

  function lerpColor(c1, c2, t) {
    return {
      r: Math.round(lerp(c1.r, c2.r, t)),
      g: Math.round(lerp(c1.g, c2.g, t)),
      b: Math.round(lerp(c1.b, c2.b, t)),
    };
  }

  /* =========================
   * Stars & Rainbow Clouds
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
   * Main Loop
   * ========================= */
  let last = performance.now();

  function step(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    /* ---- physics in world ---- */
    bunny.vy += GRAVITY * dt;
    bunny.x += bunny.vx * dt;
    bunny.y += bunny.vy * dt;
    bunny.vx *= Math.pow(AIR_DRAG, dt * 60);

    // 壁（横）
    const halfW = bunny.w / 2;
    if (bunny.x < halfW) { bunny.x = halfW; bunny.vx *= -0.5; }
    if (bunny.x > W - halfW) { bunny.x = W - halfW; bunny.vx *= -0.5; }

    // 地面（world y = 0）
    const halfH = bunny.h / 2;
    const bunnyBottom = bunny.y + halfH;
    if (bunnyBottom > FLOOR_Y) {
      bunny.y = FLOOR_Y - halfH;
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

    /* ---- camera follow (up) ---- */
    const followLine = H * CAMERA_FOLLOW_LINE_RATIO; // スクリーンY
    const bunnyScreenY = bunny.y - cameraY;          // 現在スクリーン上のうさぎY
    const desiredCameraY = bunny.y - followLine;     // うさぎをfollowLineに置くためのカメラ

    // うさぎがラインより上に行ったら（bunnyScreenY < followLine）カメラを上へ（cameraYを減らす方向）
    if (bunnyScreenY < followLine) {
      cameraY = lerp(cameraY, desiredCameraY, CAMERA_EASE);
    } else {
      // 落ちてきた時は、カメラをゆっくり地面（0）へ戻す（好みでOFF可）
      cameraY = lerp(cameraY, 0, 0.02);
    }

    /* ---- height (for background) ----
     * 高度 = 地面 - うさぎY（地面は0、上に行くほど bunny.y が負）
     */
    const altitude = FLOOR_Y - bunny.y; // 上ほど大きい
    let heightT = altitude / (H * 0.75);
    heightT = clamp01(heightT);

    /* ---- background color ---- */
    let bg;
    if (heightT < 0.5) bg = lerpColor(BG_GROUND, BG_SKY, heightT * 2);
    else bg = lerpColor(BG_SKY, BG_SPACE, (heightT - 0.5) * 2);

    ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
    ctx.fillRect(0, 0, W, H);

    /* ---- effects (screen space) ---- */
    drawStars(heightT, now / 1000);
    drawRainbowClouds(heightT, dt);

    /* ---- draw world with camera ---- */
    ctx.save();
    ctx.translate(0, -cameraY); // ★ここがカメラ移動

    // 地面ライン（world y=0）
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.beginPath();
    ctx.moveTo(0, FLOOR_Y);
    ctx.lineTo(W, FLOOR_Y);
    ctx.stroke();

    // うさぎ
    if (imgReady) {
      ctx.drawImage(img, bunny.x - bunny.w / 2, bunny.y - bunny.h / 2, bunny.w, bunny.h);
    } else {
      // フォールバック
      ctx.fillStyle = "rgba(255,120,170,0.9)";
      ctx.beginPath();
      ctx.arc(bunny.x, bunny.y, Math.min(bunny.w, bunny.h) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // 画像エラー表示（画面固定）
    if (!imgReady && imgError) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillRect(12, 52, Math.min(W - 24, 560), 120);
      ctx.fillStyle = "#b00020";
      ctx.font = "14px system-ui, -apple-system, Segoe UI, sans-serif";
      const lines = imgError.split("\n");
      lines.forEach((line, i) => ctx.fillText(line, 20, 78 + i * 18));
      ctx.restore();
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

  resize();
  resetBunny();
  requestAnimationFrame(step);
})();
