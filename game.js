(() => {
  "use strict";

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  function resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width  = Math.floor(canvas.clientWidth  * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 以降はCSSピクセルで描ける
  }
  window.addEventListener("resize", resize);

  // ===== 画像読み込み =====
  const img = new Image();
  img.src = "./bunny.png";

  // ===== 物理パラメータ =====
  const GRAVITY = 1800;          // px/s^2
  const AIR_DRAG = 0.995;        // 空気抵抗（1に近いほど弱い）
  const BOUNCE = 0.35;           // 地面反発
  const FLOOR_FRICTION = 0.85;   // 接地摩擦

  // ジャンプ強さ
  const JUMP_SPEED_MIN = 850;    // px/s
  const JUMP_SPEED_MAX = 1250;   // px/s
  // ランダム角度（上方向）：-70°〜-110°（真上±20°）
  const ANGLE_MIN = (-110) * Math.PI / 180;
  const ANGLE_MAX = (-70)  * Math.PI / 180;

  // クリック判定を少し甘くする
  const HIT_PADDING = 8;

  // ===== うさぎ状態 =====
  const bunny = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    w: 180, h: 180, // 読み込み後に画像比率で調整
    onGround: false
  };

  // 初期配置
  function resetBunny() {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    bunny.x = W * 0.5;
    bunny.y = H * 0.75;
    bunny.vx = 0;
    bunny.vy = 0;
    bunny.onGround = true;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function jumpBoost() {
    // ランダム角度＋ランダム速度で「上方向に飛ばす」
    const angle = rand(ANGLE_MIN, ANGLE_MAX);
    const speed = rand(JUMP_SPEED_MIN, JUMP_SPEED_MAX);

    // “飛んでる最中に再クリック”でも上方向にちゃんと追加されるように
    // vyは「上向き(負)」を強め、vxは少し足す感じ
    const addVx = Math.cos(angle) * speed * 0.45;
    const addVy = Math.sin(angle) * speed;

    bunny.vx += addVx;
    bunny.vy = Math.min(bunny.vy, 0);      // 落下中でも一旦リセット気味
    bunny.vy += addVy;                     // addVyは負（上方向）

    bunny.onGround = false;
  }

  function isHit(mx, my) {
    const left = bunny.x - bunny.w / 2 - HIT_PADDING;
    const top  = bunny.y - bunny.h / 2 - HIT_PADDING;
    const w    = bunny.w + HIT_PADDING * 2;
    const h    = bunny.h + HIT_PADDING * 2;
    return (mx >= left && mx <= left + w && my >= top && my <= top + h);
  }

  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function onClick(e) {
    const p = getPointerPos(e);
    if (isHit(p.x, p.y)) {
      jumpBoost();
    }
  }

  canvas.addEventListener("pointerdown", onClick);

  // ===== ループ =====
  let last = performance.now();

  function step(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const floorY = H - 10;

    // 物理更新
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
    if (bunny.y > floorY - halfH) {
      bunny.y = floorY - halfH;

      if (Math.abs(bunny.vy) > 250) {
        bunny.vy *= -BOUNCE;
        bunny.onGround = false;
      } else {
        bunny.vy = 0;
        bunny.onGround = true;
        bunny.vx *= FLOOR_FRICTION;
        if (Math.abs(bunny.vx) < 8) bunny.vx = 0;
      }
    } else {
      bunny.onGround = false;
    }

    // 描画
    ctx.clearRect(0, 0, W, H);

    // うっすら地面
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    ctx.lineTo(W, floorY);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.stroke();

    // 影
    const shadowScale = bunny.onGround ? 1.0 : Math.max(0.25, 1.0 - (floorY - (bunny.y + halfH)) / 400);
    ctx.beginPath();
    ctx.ellipse(bunny.x, floorY, 40 * shadowScale, 14 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fill();

    // うさぎ
    ctx.drawImage(
      img,
      bunny.x - bunny.w / 2,
      bunny.y - bunny.h / 2,
      bunny.w,
      bunny.h
    );

    requestAnimationFrame(step);
  }

  img.onload = () => {
    // 画像比率に合わせてサイズ調整（画面に合わせて程よく）
    const W = canvas.clientWidth;
    const base = Math.min(W, canvas.clientHeight) * 0.35;
    const ratio = img.width / img.height;
    bunny.h = base;
    bunny.w = base * ratio;

    resize();
    resetBunny();
    requestAnimationFrame(step);
  };

  // 画像が遅い環境でもキャンバスだけ先に確保
  resize();
  resetBunny();
})();
