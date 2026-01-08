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
