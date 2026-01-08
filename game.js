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
   * Helpers
   * ========================= */
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  /* =========================
   * Physics
   * ========================= */
  const GRAVITY = 1800;     // +下
  const AIR_DRAG = 0.995;
  const BOUNCE = 0.35;
  const FLOOR_FRICTION = 0.85;

  const JUMP_SPEED_MIN = 850;
  const JUMP_SPEED_MAX = 1250;
  const ANGLE_MIN = (-110) * Math.PI / 180; // 真上±20°
  const ANGLE_MAX = (-70)  * Math.PI / 180;

  const HIT_PADDING = 10;

  /* =========================
   * World / Camera
   * =========================
   * worldY: 下が+ / 地面は 0 / 上に登るほどマイナス
   */
  const FLOOR_Y = 0;

  // cameraY = 画面上端が指すワールドY（screenY = worldY - cameraY）
  let cameraY = 0;

  // うさぎがこの高さ（画面上）より上へ行ったらカメラが追う
  const FOLLOW_LINE_RATIO = 0.40; // 画面上から40%
 // ★上下追従（落ちたらカメラも落ちる）
// - 上方向：速めに追従
// - 下方向：少しゆっくり追従（酔い防止）
const CAMERA_EASE_UP = 0.14;
const CAMERA_EASE_DOWN = 0.07;

function updateCamera(bunnyWorldY, H) {
  const followLine = H * FOLLOW_LINE_RATIO;       // 画面上の追従ライン
  const targetCameraY = bunnyWorldY - followLine; // うさぎをラインに置く

  // targetCameraY が cameraY より小さい => カメラが上へ
  // targetCameraY が cameraY より大きい => カメラが下へ
  const ease = (targetCameraY < cameraY) ? CAMERA_EASE_UP : CAMERA_EASE_DOWN;
  cameraY = lerp(cameraY, targetCameraY, ease);
}


  /* =========================
   * Bunny (world coords)
   * ========================= */
  const bunny = {
    x: 0,
    y: 0,      // worldY
    vx: 0,
    vy: 0,
    w: 120,
    h: 120,
    onGround: false,
  };

  function resetBunny() {
    const W = canvas.clientWidth;
    bunny.x = W * 0.5;
    bunny.y = FLOOR_Y - bunny.h / 2;
    bunny.vx = 0;
    bunny.vy = 0;
    bunny.onGround = true;
    cameraY = 0;
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

  // world→screen
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

  // スクロール防止 + 操作
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    unlockAudioOnce();
    const p = getPointerPos(e);
    if (isHit(p.x, p.y)) jumpBoost();
  }, { passive: false });
  canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener("touchmove",  (e) => e.preventDefault(), { passive: false });

  /* =========================
   * Background (登り感)
   * ========================= */
  // 高度で色変化
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

  // ★登ってる感を強くする：高度ライン（目盛り）+ パララックス帯
  function drawClimbBackground(W, H, altitude, heightT) {
    // 1) ベース色
    let bg;
    if (heightT < 0.5) bg = lerpColor(BG_GROUND, BG_SKY, heightT * 2);
    else bg = lerpColor(BG_SKY, BG_SPACE, (heightT - 0.5) * 2);
    ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
    ctx.fillRect(0, 0, W, H);

    // 2) パララックス帯（ゆっくり流れる層）: altitudeで下に流れて見える
    //    ※ altitudeが増えるほど背景が動く＝登ってる感
    const p1 = (altitude * 0.15) % (H * 0.6);
    const p2 = (altitude * 0.30) % (H * 0.8);

    ctx.save();
    ctx.globalAlpha = 0.10 + 0.20 * heightT;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = -2; i < 6; i++) {
      const y = i * (H * 0.6) + (H * 0.6) - p1;
      ctx.fillRect(0, y, W, 22);
    }
    ctx.globalAlpha = 0.08 + 0.18 * heightT;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = -2; i < 6; i++) {
      const y = i * (H * 0.8) + (H * 0.8) - p2;
      ctx.fillRect(0, y, W, 10);
    }
    ctx.restore();

    // 3) 高度目盛りライン（これが一番“登ってる”を作る）
    //    画面上で「上から下へ流れる」ように表示：世界座標で等間隔に刻む
    const tickStep = 250; // world単位（px）ごとに目盛り
    // 画面上端/下端が示す worldY を使って、表示範囲の目盛りを描く
    const topWorld = cameraY;
    const bottomWorld = cameraY + H;

    // 目盛りは worldY=-tickValue（高度）なので、worldYが負の領域で出てくる
    const minAlt = Math.max(0, Math.floor((FLOOR_Y - bottomWorld) / tickStep) * tickStep);
    const maxAlt = Math.max(0, Math.ceil((FLOOR_Y - topWorld) / tickStep) * tickStep);

    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";

    for (let a = minAlt; a <= maxAlt; a += tickStep) {
      const worldY = FLOOR_Y - a;       // altitude a の worldY
      const y = worldY - cameraY;       // screenY
      // 太線/細線
      const major = (a % (tickStep * 4) === 0);
      ctx.globalAlpha = major ? 0.22 : 0.12;
      ctx.lineWidth = major ? 2 : 1;

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();

      if (major) {
        ctx.globalAlpha = 0.55;
        ctx.fillText(`ALT ${a}`, 10, y - 6);
      }
    }
    ctx.restore();
  }

  /* =========================
   * Stars & Rainbow Clouds（高度演出）
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

    /* ---- physics (world) ---- */
    bunny.vy += GRAVITY * dt;
    bunny.x += bunny.vx * dt;
    bunny.y += bunny.vy * dt;
    bunny.vx *= Math.pow(AIR_DRAG, dt * 60);

    // 壁
    const halfW = bunny.w / 2;
    if (bunny.x < halfW) { bunny.x = halfW; bunny.vx *= -0.5; }
    if (bunny.x > W - halfW) { bunny.x = W - halfW; bunny.vx *= -0.5; }

    // 地面
    const halfH = bunny.h / 2;
    const bottom = bunny.y + halfH;
    if (bottom > FLOOR_Y) {
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

    /* ---- camera (only up) ---- */
    updateCamera(bunny.y, H);

    /* ---- altitude & heightT ---- */
    const altitude = Math.max(0, FLOOR_Y - bunny.y); // 上ほど大きい
    let heightT = altitude / (H * 0.75);
    heightT = clamp01(heightT);

    /* ---- background (climb feel) ---- */
    drawClimbBackground(W, H, altitude, heightT);

    /* ---- effects (screen space) ---- */
    drawStars(heightT, now / 1000);
    drawRainbowClouds(heightT, dt);

    /* ---- draw world with camera ---- */
    ctx.save();
    ctx.translate(0, -cameraY);

    // 地面ライン
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.moveTo(0, FLOOR_Y);
    ctx.lineTo(W, FLOOR_Y);
    ctx.stroke();

    // うさぎ
    if (imgReady) {
      ctx.drawImage(img, bunny.x - bunny.w / 2, bunny.y - bunny.h / 2, bunny.w, bunny.h);
    } else {
      ctx.fillStyle = "rgba(255,120,170,0.9)";
      ctx.beginPath();
      ctx.arc(bunny.x, bunny.y, Math.min(bunny.w, bunny.h) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    /* ---- UI: 高度表示（固定） ---- */
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.font = "14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(`ALT: ${Math.floor(altitude)}`, 12, 28);
    ctx.restore();

    /* ---- image error ---- */
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

    // ★うさぎを小さくする：0.35 → 0.18（好みで0.15〜0.22）
    const base = Math.min(canvas.clientWidth, canvas.clientHeight) * 0.18;
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
