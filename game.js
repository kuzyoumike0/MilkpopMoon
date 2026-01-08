// BGM.js（非module / ✅WB差し替え耐性版）
// ✅ 追加：BGM購入（コイン消費）
// - BGMは「購入済み」じゃないと再生しない（通常BGMも購入制）
// - ハンバーガーUI内にショップ（購入ボタン）を追加
// - WBのコインAPI差を吸収（getCoin/spendCoins/addCoin/coins直叩き等）
// - app.js が window.WB を再代入しても再パッチ継続

(() => {
  "use strict";

  const LS_KEY_SETTINGS = "milkpop_bgm_settings_v1";
  const LS_KEY_OWNED    = "milkpop_bgm_owned_v1";

  const TRACKS = {
    morning: "./assets/bgm_morning.mp3",
    day:     "./assets/bgm_day.mp3",
    night:   "./assets/bgm_night.mp3",
    depart:  "./assets/bgm_depart.mp3",
  };

  // ✅ BGM価格（好きに調整OK）
  const PRICES = {
    morning: 3000,
    day:     3000,
    night:   3000,
    depart:  8000,
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS_KEY_SETTINGS);
      if (!raw) return { volume: 0.5, muted: false, enabled: true };
      const j = JSON.parse(raw);
      return {
        volume: clamp(Number(j.volume ?? 0.5), 0, 1),
        muted: !!j.muted,
        enabled: j.enabled !== false,
      };
    } catch {
      return { volume: 0.5, muted: false, enabled: true };
    }
  }
  function saveSettings(s) {
    try { localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(s)); } catch {}
  }

  function loadOwned() {
    try {
      const raw = localStorage.getItem(LS_KEY_OWNED);
      if (!raw) return {};
      const j = JSON.parse(raw);
      return (j && typeof j === "object") ? j : {};
    } catch {
      return {};
    }
  }
  function saveOwned(o) {
    try { localStorage.setItem(LS_KEY_OWNED, JSON.stringify(o)); } catch {}
  }

  let settings = loadSettings();
  let owned = loadOwned(); // { morning:true, day:true ... }

  // BGM.js側の解禁フラグ
  let unlocked = false;
  let currentKey = null;
  let specialKey = null;

  let audio = null;

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    applyVolume();
    return audio;
  }

  function applyVolume() {
    ensureAudio();
    audio.volume = settings.muted ? 0 : settings.volume;
  }

  function pickByTime() {
    const h = new Date().getHours();
    if (h >= 5 && h <= 10) return "morning";
    if (h >= 11 && h <= 17) return "day";
    return "night";
  }

  function isOwned(key) {
    return !!owned?.[key];
  }

  function resolveKeyBySrc(src) {
    // TRACKSに一致するならそのkeyを返す
    for (const k of Object.keys(TRACKS)) {
      if (TRACKS[k] === src) return k;
    }
    return null;
  }

  /* =========================
   * WBコイン互換ヘルパ
   * ========================= */
  function getCoinsWB() {
    const WB = window.WB;
    try {
      if (WB && typeof WB.getCoin === "function") return Number(WB.getCoin()) || 0;
      if (WB && typeof WB.getCoins === "function") return Number(WB.getCoins()) || 0;
      if (WB && typeof WB.coins === "number") return Number(WB.coins) || 0;
      // HUDから読める場合
      const el = document.getElementById("coinValue");
      if (el) return Number(el.textContent || "0") || 0;
    } catch {}
    return 0;
  }

  function setCoinsWB(next) {
    const WB = window.WB;
    const v = Math.max(0, Math.floor(Number(next) || 0));

    try {
      if (WB && typeof WB.setCoin === "function") { WB.setCoin(v); return true; }
      if (WB && typeof WB.setCoins === "function") { WB.setCoins(v); return true; }
      if (WB && typeof WB.coins === "number") { WB.coins = v; }
      const el = document.getElementById("coinValue");
      if (el) el.textContent = String(v);
      return true;
    } catch {}
    return false;
  }

  function spendCoinsWB(amount) {
    const WB = window.WB;
    const a = Math.max(0, Math.floor(Number(amount) || 0));
    if (!a) return true;

    try {
      // 最優先：専用API
      if (WB && typeof WB.spendCoins === "function") return !!WB.spendCoins(a);
      if (WB && typeof WB.spendCoin === "function") return !!WB.spendCoin(a);

      // 次点：addCoinがある場合はマイナス加算
      if (WB && typeof WB.addCoin === "function") {
        const cur = getCoinsWB();
        if (cur < a) return false;
        WB.addCoin(-a);
        // HUD更新がない実装もあるので念のため
        const after = getCoinsWB();
        if (after === cur) setCoinsWB(cur - a);
        return true;
      }

      // 最後：直叩き
      const cur = getCoinsWB();
      if (cur < a) return false;
      setCoinsWB(cur - a);
      return true;
    } catch {
      return false;
    }
  }

  function toast(msg) {
    try {
      const id = "bgmToastV1";
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.style.cssText = `
position:fixed; left:50%; top:16px; transform:translateX(-50%);
z-index:2147483646;
background:rgba(0,0,0,.78); color:#fff;
padding:10px 12px; border-radius:14px;
font-weight:900; font-size:13px;
box-shadow:0 14px 40px rgba(0,0,0,.25);
pointer-events:none; opacity:0; transition:opacity .18s ease;
`;
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = "1";
      clearTimeout(el.__t);
      el.__t = setTimeout(() => { el.style.opacity = "0"; }, 1200);
    } catch {}
  }

  async function tryPlay(src, keyHint = null) {
    ensureAudio();
    if (!src) return false;

    // ✅ 購入チェック
    const key = keyHint || resolveKeyBySrc(src);
    if (key && !isOwned(key)) {
      stop();
      return false;
    }

    const nextHref = new URL(src, location.href).href;
    if (audio.src !== nextHref) {
      try { audio.pause(); } catch {}
      audio.src = src;
      audio.currentTime = 0;
    }

    applyVolume();

    if (!settings.enabled) return false;
    if (!unlocked) return false;

    try {
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  function stop() {
    if (!audio) return;
    try { audio.pause(); } catch {}
  }

  function startNormalBgm(force = false) {
    if (specialKey) return;

    const want = pickByTime();

    // ✅ 未購入なら、買ってある通常BGMへフォールバック（なければ停止）
    let key = want;
    if (!isOwned(key)) {
      const fallback = ["morning", "day", "night"].find(isOwned) || null;
      if (!fallback) {
        currentKey = null;
        stop();
        return;
      }
      key = fallback;
    }

    if (!force && key === currentKey) return;

    const src = TRACKS[key];
    currentKey = key;
    tryPlay(src, key);
  }

  async function unlockBgmOnce() {
    if (unlocked) return;
    unlocked = true;

    // ✅ unlock時に必ず一度再生を試す（クリック直後に走る想定）
    if (specialKey) {
      const src = TRACKS[specialKey];
      if (src) await tryPlay(src, specialKey);
    } else {
      startNormalBgm(true);
    }
  }

  /* =========================
   * ✅ WBパッチ（差し替え耐性）
   * ========================= */
  let lastWBRef = null;

  function patchWB(WB) {
    if (!WB || typeof WB !== "object") return;

    if (lastWBRef === WB && WB.__bgmPatchedV3) return;

    lastWBRef = WB;

    if (!WB.__bgmPatchedV3) WB.__bgmPatchedV3 = { done: false };

    const prevUnlock = (typeof WB.unlockAudioOnce === "function") ? WB.unlockAudioOnce : null;

    WB.unlockAudioOnce = async () => {
      try { prevUnlock?.(); } catch {}
      await unlockBgmOnce();
    };

    WB.bgm = WB.bgm || {};
    WB.bgm.mountUI = mountUI;
    WB.bgm.playSpecial = playSpecial;
    WB.bgm.clearSpecial = clearSpecial;
    WB.bgm.start = () => startNormalBgm(true);
    WB.bgm.stop = () => stop();
    WB.bgm.TRACKS = TRACKS;

    // ✅ 購入APIも公開
    WB.bgm.isOwned = isOwned;
    WB.bgm.buy = buyBgm;
    WB.bgm.getCoins = () => getCoinsWB();
    WB.bgm.PRICES = PRICES;

    WB.__bgmPatchedV3.done = true;

    if (unlocked && settings.enabled) {
      if (specialKey) {
        const src = TRACKS[specialKey];
        if (src) tryPlay(src, specialKey);
      } else {
        startNormalBgm(true);
      }
    }
  }

  function startWBWatcher() {
    patchWB(window.WB);
    const start = Date.now();
    const watchMs = 15000;
    const t = setInterval(() => {
      patchWB(window.WB);
      if (Date.now() - start > watchMs) clearInterval(t);
    }, 200);
  }

  /* =========================
   * Autoplay unlock
   * ========================= */
  function setupAutoplayUnlock() {
    const handler = async () => {
      patchWB(window.WB);
      try { await window.WB?.unlockAudioOnce?.(); } catch {}
    };
    window.addEventListener("pointerdown", handler, { passive: true });
    window.addEventListener("keydown", handler, { passive: true });
    window.addEventListener("touchstart", handler, { passive: true });
  }

  function startTimeWatcher() {
    setInterval(() => startNormalBgm(false), 30_000);
  }

  /* =========================
   * ✅ 購入ロジック
   * ========================= */
  function buyBgm(key) {
    if (!TRACKS[key] || !PRICES[key]) return { ok: false, reason: "unknown" };
    if (isOwned(key)) return { ok: true, reason: "already" };

    const price = PRICES[key];
    const cur = getCoinsWB();
    if (cur < price) return { ok: false, reason: "coins", need: price, have: cur };

    const ok = spendCoinsWB(price);
    if (!ok) return { ok: false, reason: "coins_api" };

    owned[key] = true;
    saveOwned(owned);
    toast(`✅ ${key} を購入！ -${price}🪙`);
    // 購入直後、該当時間帯 or 特別なら再生を試す
    if (settings.enabled) {
      if (specialKey === key) tryPlay(TRACKS[key], key);
      else startNormalBgm(true);
    }
    return { ok: true, reason: "bought" };
  }

  /* =========================
   * Settings UI（ハンバーガー）
   * ========================= */
  function mountUI({ position = "top-right", title = "BGM" } = {}) {
    if (document.getElementById("bgmHamburgerV1")) return;

    const style = document.createElement("style");
    style.textContent = `
#bgmHamburgerV1{
  position:fixed;
  z-index:2147483000;
  ${position.includes("top") ? "top:10px;" : "bottom:10px;"}
  ${position.includes("right") ? "right:10px;" : "left:10px;"}
  width:44px;height:44px;
  border:none;border-radius:14px;
  background:rgba(255,255,255,.95);
  box-shadow:0 12px 32px rgba(0,0,0,.18);
  cursor:pointer;
  display:flex;align-items:center;justify-content:center;
}
#bgmHamburgerV1 .bars{ width:18px; height:14px; position:relative; }
#bgmHamburgerV1 .bars i{
  position:absolute; left:0; right:0;
  height:2px; border-radius:2px;
  background:#333;
}
#bgmHamburgerV1 .bars i:nth-child(1){ top:0; }
#bgmHamburgerV1 .bars i:nth-child(2){ top:6px; }
#bgmHamburgerV1 .bars i:nth-child(3){ top:12px; }

#bgmPanelV1{
  position:fixed;
  z-index:2147483001;
  ${position.includes("top") ? "top:62px;" : "bottom:62px;"}
  ${position.includes("right") ? "right:10px;" : "left:10px;"}
  width:min(340px, 92vw);
  background:rgba(255,255,255,.98);
  border-radius:16px;
  box-shadow:0 18px 44px rgba(0,0,0,.22);
  padding:12px 12px 10px;
  display:none;
}
#bgmPanelV1 .row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
#bgmPanelV1 .ttl{ font-weight:900; }
#bgmPanelV1 .sub{ font-size:12px; opacity:.75; margin-top:2px; }
#bgmPanelV1 .btn{
  border:none; border-radius:12px;
  padding:8px 10px;
  font-weight:800;
  background:#ffd6e7;
  cursor:pointer;
}
#bgmPanelV1 .btn.ghost{ background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08); }
#bgmPanelV1 .slider{ width:100%; margin:10px 0 6px; }
#bgmPanelV1 .fine{ font-size:12px; opacity:.75; }
#bgmPanelV1 .sep{ height:1px; background:rgba(0,0,0,.08); margin:10px 0; }

#bgmShopV1{ margin-top:8px; }
#bgmShopV1 .shopttl{ font-weight:900; margin:6px 0 8px; }
#bgmShopV1 .item{
  display:flex; align-items:center; justify-content:space-between;
  gap:10px; padding:8px 8px;
  border-radius:14px;
  background:rgba(0,0,0,.03);
  margin-bottom:8px;
}
#bgmShopV1 .name{ font-weight:900; }
#bgmShopV1 .meta{ font-size:12px; opacity:.75; margin-top:2px; }
#bgmShopV1 .right{ display:flex; align-items:center; gap:8px; }
#bgmShopV1 .tag{
  font-size:12px; font-weight:900;
  padding:4px 8px; border-radius:999px;
  background:#fff;
  box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#bgmShopV1 .buy{
  border:none; border-radius:12px;
  padding:8px 10px;
  font-weight:900;
  cursor:pointer;
  background:#ffd6e7;
}
#bgmShopV1 .buy[disabled]{ opacity:.55; cursor:not-allowed; }
`;
    document.head.appendChild(style);

    const btn = document.createElement("button");
    btn.id = "bgmHamburgerV1";
    btn.type = "button";
    btn.innerHTML = `<span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>`;
    btn.title = "BGM設定";

    const panel = document.createElement("div");
    panel.id = "bgmPanelV1";
    panel.innerHTML = `
<div class="row">
  <div>
    <div class="ttl">${title}</div>
    <div class="sub" id="bgmStateTextV1">未再生（画面をクリックで開始）</div>
  </div>
  <button class="btn ghost" id="bgmCloseV1" type="button">×</button>
</div>

<div class="sep"></div>

<div class="row">
  <button class="btn" id="bgmToggleV1" type="button">ON</button>
  <button class="btn ghost" id="bgmMuteV1" type="button">ミュート</button>
</div>

<input class="slider" id="bgmVolV1" type="range" min="0" max="100" step="1" />

<div class="fine" id="bgmInfoV1"></div>

<div class="sep"></div>

<div id="bgmShopV1">
  <div class="row">
    <div class="shopttl">BGMショップ</div>
    <div class="tag" id="bgmCoinTagV1">🪙 0</div>
  </div>

  ${renderShopItem("morning", "朝BGM", "朝の時間帯（5-10時）")}
  ${renderShopItem("day",     "昼BGM", "昼の時間帯（11-17時）")}
  ${renderShopItem("night",   "夜BGM", "夜の時間帯（それ以外）")}
  ${renderShopItem("depart",  "旅立ちBGM", "特別BGM（旅立ち演出など）")}
</div>
`;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    const stateText = panel.querySelector("#bgmStateTextV1");
    const info = panel.querySelector("#bgmInfoV1");
    const toggle = panel.querySelector("#bgmToggleV1");
    const mute = panel.querySelector("#bgmMuteV1");
    const vol = panel.querySelector("#bgmVolV1");
    const close = panel.querySelector("#bgmCloseV1");
    const coinTag = panel.querySelector("#bgmCoinTagV1");

    const buyBtns = {
      morning: panel.querySelector(`#bgmBuy_morning`),
      day:     panel.querySelector(`#bgmBuy_day`),
      night:   panel.querySelector(`#bgmBuy_night`),
      depart:  panel.querySelector(`#bgmBuy_depart`),
    };
    const ownedTags = {
      morning: panel.querySelector(`#bgmOwned_morning`),
      day:     panel.querySelector(`#bgmOwned_day`),
      night:   panel.querySelector(`#bgmOwned_night`),
      depart:  panel.querySelector(`#bgmOwned_depart`),
    };

    function refreshShopUI() {
      const c = getCoinsWB();
      if (coinTag) coinTag.textContent = `🪙 ${c}`;

      for (const k of Object.keys(PRICES)) {
        const ownedNow = isOwned(k);
        const price = PRICES[k];

        if (ownedTags[k]) {
          ownedTags[k].textContent = ownedNow ? "購入済み" : `${price}🪙`;
          ownedTags[k].style.opacity = ownedNow ? "0.85" : "0.95";
        }
        if (buyBtns[k]) {
          buyBtns[k].disabled = ownedNow || (c < price);
          buyBtns[k].textContent = ownedNow ? "OK" : "購入";
        }
      }
    }

    function refreshUI() {
      vol.value = String(Math.round(settings.volume * 100));
      toggle.textContent = settings.enabled ? "ON" : "OFF";
      toggle.style.opacity = settings.enabled ? "1" : "0.6";
      mute.textContent = settings.muted ? "ミュート中" : "ミュート";
      mute.style.opacity = settings.muted ? "0.75" : "1";

      const nowKey = specialKey || currentKey || pickByTime();
      const mode = specialKey ? `特別BGM：${specialKey}` : `通常：${nowKey}`;
      const u = unlocked ? "解禁済み" : "未解禁（クリックで開始）";
      const own = (nowKey && TRACKS[nowKey])
        ? (isOwned(nowKey) ? "購入済み" : "未購入")
        : "-";
      info.textContent = `${mode} / ${u} / ${own}`;

      if (stateText) {
        const playing = audio && !audio.paused && unlocked && settings.enabled && !settings.muted && audio.volume > 0;
        stateText.textContent = playing ? "再生中" : "停止中（クリックで開始）";
      }

      refreshShopUI();
    }

    btn.addEventListener("click", () => {
      panel.style.display = (panel.style.display === "block") ? "none" : "block";
      refreshUI();
    });

    close.addEventListener("click", () => { panel.style.display = "none"; });

    toggle.addEventListener("click", async () => {
      settings.enabled = !settings.enabled;
      saveSettings(settings);

      if (!settings.enabled) stop();
      else {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        if (specialKey) tryPlay(TRACKS[specialKey], specialKey);
        else startNormalBgm(true);
      }
      refreshUI();
    });

    mute.addEventListener("click", () => {
      settings.muted = !settings.muted;
      saveSettings(settings);
      applyVolume();
      refreshUI();
    });

    vol.addEventListener("input", async () => {
      settings.volume = clamp(Number(vol.value) / 100, 0, 1);
      saveSettings(settings);
      applyVolume();

      if (settings.enabled) {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        if (specialKey) tryPlay(TRACKS[specialKey], specialKey);
        else startNormalBgm(false);
      }
      refreshUI();
    });

    // ✅ 購入ボタン
    for (const k of Object.keys(PRICES)) {
      buyBtns[k]?.addEventListener("click", async () => {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {} // クリック時にオーディオ解禁も兼ねる

        const r = buyBgm(k);
        if (!r.ok) {
          if (r.reason === "coins") toast(`🪙 足りない！ ${r.have} / ${r.need}`);
          else toast("購入できませんでした");
        }
        refreshUI();
      });
    }

    document.addEventListener("pointerdown", (e) => {
      if (panel.style.display !== "block") return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      panel.style.display = "none";
    });

    setInterval(refreshUI, 500);
    refreshUI();
  }

  function renderShopItem(key, label, desc) {
    const price = PRICES[key] ?? 0;
    return `
<div class="item">
  <div>
    <div class="name">${label}</div>
    <div class="meta">${desc}</div>
  </div>
  <div class="right">
    <div class="tag" id="bgmOwned_${key}">${price}🪙</div>
    <button class="buy" id="bgmBuy_${key}" type="button">購入</button>
  </div>
</div>`;
  }

  /* =========================
   * Public API
   * ========================= */
  function playSpecial(keyOrSrc) {
    // ✅ キー指定のときは「購入済み」必須（カスタムsrcは自由）
    if (TRACKS[keyOrSrc]) {
      if (!isOwned(keyOrSrc)) {
        toast("未購入です");
        return;
      }
      specialKey = keyOrSrc;
      ensureAudio();
      tryPlay(TRACKS[keyOrSrc], keyOrSrc);
      return;
    }

    const src = keyOrSrc;
    if (!src) return;
    specialKey = "__custom__";
    ensureAudio();
    tryPlay(src, null);
  }

  function clearSpecial() {
    specialKey = null;
    startNormalBgm(true);
  }

  /* =========================
   * Boot
   * ========================= */
  (function boot() {
    ensureAudio();
    startWBWatcher();
    setupAutoplayUnlock();
    startNormalBgm(false);
    startTimeWatcher();

    mountUI({ position: "top-right", title: "BGM" });
  })();
})();
