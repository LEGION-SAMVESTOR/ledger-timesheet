"use strict";
const $ = id => document.getElementById(id);
const LS_USERS = "ledger.users";
const LS_SET = "ledger.settings";
const STATUSES = {
  "Done":"st-done","Pending":"st-pending","Preview Sent":"st-preview","Live":"st-live",
  "Paused":"st-paused","Cancelled":"st-cancel","In Progress":"st-progress"
};
const BRANDS = [
  {v:"",    label:"Default Task", cls:"b-none"},
  {v:"KN",  label:"KN",  cls:"b-KN"},
  {v:"ZW",  label:"ZW",  cls:"b-ZW"},
  {v:"RW",  label:"RW",  cls:"b-RW"},
  {v:"AUJ", label:"AUJ", cls:"b-AUJ"},
  {v:"SV",  label:"SV",  cls:"b-SV"},
  {v:"BM",  label:"BM",  cls:"b-BM"},
];
const DEFAULT_ENTRIES = [
  {project:"Meeting",     task:""},
  {project:"Discussions", task:""},
  {project:"Upskilling",  task:""},
  {project:"Research",    task:""},
];
const DEFAULT_ORDER = DEFAULT_ENTRIES.map(d=>d.project);
const DEFAULT_NAMES = DEFAULT_ORDER.map(p=>p.toLowerCase());
// a Default-Task-brand entry named like a default counts as one, flag or not
function routineNames(){
  const rs = (typeof store!=="undefined" && store && store.routines) ? store.routines : null;
  return rs ? rs.filter(r=>!r.brand).map(r=>(r.project||"").trim().toLowerCase()) : DEFAULT_NAMES;
}
const isDefaultEntry = t => !!t.isDefault || (!t.brand && routineNames().includes((t.project||"").trim().toLowerCase()));
const defaultRank = t => {
  const i = routineNames().indexOf((t.project||"").trim().toLowerCase());
  return i<0 ? 99 : i;
};
const brandCls = v => (BRANDS.find(b=>b.v===v)||BRANDS[0]).cls;

/* ---------- helpers ---------- */
const todayKey = () => new Date().toISOString().slice(0,10);
function prevWorkingDay(key){
  const d = new Date(key + "T12:00:00");
  do { d.setDate(d.getDate()-1); } while (d.getDay()===0 || d.getDay()===6);
  return d.toISOString().slice(0,10);
}
const fmtDate = key => new Date(key+"T12:00:00").toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"});
const hhmmss = d => d.toTimeString().slice(0,8);
function toSec(t){ if(!t) return null; const p=t.split(":").map(Number); return p[0]*3600+(p[1]||0)*60+(p[2]||0); }
function hours(start,end){
  let s=toSec(start), e=toSec(end);
  if(s==null||e==null) return 0;
  if(e<s) e+=86400;
  return (e-s)/3600;
}
const fmtH = h => (Math.round(h*100)/100).toFixed(2);
const validT = t => /^\d{1,2}:\d{2}(:\d{2})?$/.test((t||"").trim());
const norm = t => { const p=t.trim().split(":"); return p.length===2?t.trim()+":00":t.trim(); };
const esc = s => (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const short = t => (t||"").length>7 ? t.slice(0,5) : t;
async function hash(str){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),2600); }

/* ---------- settings ---------- */
const PALETTE_DEFAULT = {bg:"#07090d", surface:"#101620", text:"#dbe7f0", muted:"#6d7f8f", accent:"#38e1ff"};
const SET_DEFAULTS = {theme:"dark", style:"hud", toon:"classic", toonImages:{}, imgfx:"front", bgfx:"aurora", accent:"cyan", font:"mono", fsize:"m", density:"comfy", highlight:true, anim:true, stars:false, askStart:true, seed:true,
  bgpat:"grid", bgdim:55,
  starCfg:{density:60, twinkle:100, drift:100, bright:100, shoot:2, shootFreq:13, sizes:true, planets:false, cluster:true, click:true}, remind:true, remindMins:30, target:8, palette:PALETTE_DEFAULT};
let settings = Object.assign({}, SET_DEFAULTS, JSON.parse(localStorage.getItem(LS_SET) || "{}"));
settings.palette = Object.assign({}, PALETTE_DEFAULT, settings.palette||{});
settings.toonImages = settings.toonImages || {};
settings.starCfg = Object.assign({density:60, twinkle:100, drift:100, bright:100, shoot:2, shootFreq:13, sizes:true, planets:false, cluster:true, click:true}, settings.starCfg||{});

/* ---------- background sprites: uploaded images (+ optional URLs) ----------
   Uploads live in their own localStorage key so settings stay small and fast
   to write. Cookies can't be used for this — they cap out around 4 KB. */
const LS_TOONIMG = "ledger.toonimg";
let toonImg = {};
try{ toonImg = JSON.parse(localStorage.getItem(LS_TOONIMG) || "{}"); }catch(e){ toonImg = {}; }
function saveToonImg(){
  try{ localStorage.setItem(LS_TOONIMG, JSON.stringify(toonImg)); return true; }
  catch(e){ toast("Browser storage is full — remove an image and try again"); return false; }
}
// shrink to a sane size before storing, otherwise a couple of photos blow the quota
function shrinkImage(file, maxPx, quality){
  return new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onerror = ()=>rej(new Error("read"));
    fr.onload = ()=>{
      const img = new Image();
      img.onerror = ()=>rej(new Error("decode"));
      img.onload = ()=>{
        const MAX = maxPx || 480;
        let w = img.naturalWidth, h = img.naturalHeight;
        const sc = Math.min(1, MAX/Math.max(w,h));
        w = Math.max(1,Math.round(w*sc)); h = Math.max(1,Math.round(h*sc));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img,0,0,w,h);
        res(c.toDataURL("image/webp", quality || 0.82));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function themeSprites(){
  const ups = (toonImg[settings.toon] || []).slice(0,4);
  const raw = (settings.toonImages && settings.toonImages[settings.toon]) || "";
  const urls = raw.split(/[\n,]+/).map(s=>s.trim())
    .filter(u=>/^https?:\/\/[^\s"'()\\]+$/i.test(u));
  return ups.concat(urls).slice(0,4);
}
/* ---------- IMGFX: canvas field of drifting, cursor-reactive artwork ---------- */
const IMGFX = (function(){
  const CFG = {
    count:14, minSize:60, maxSize:160,
    speed:.45, spin:.35,
    mouseRadius:180, mouseForce:1.6,
    drag:.992, maxSpeed:6, opacity:.55
  };
  let cv=null, ctx=null, raf=0, parts=[], imgs=[], W=0, H=0, DPR=1, token=0;
  const M = {x:-9999,y:-9999,px:-9999,py:-9999,dx:0,dy:0,down:false};
  const rnd = (a,b)=>a+Math.random()*(b-a);

  function resize(){
    W = innerWidth; H = innerHeight;
    cv.width = W*DPR; cv.height = H*DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  const onMove = e=>{ M.px=M.x; M.py=M.y; M.x=e.clientX; M.y=e.clientY; M.dx=M.x-M.px; M.dy=M.y-M.py; };
  const onDown = ()=>M.down=true;
  const onUp   = ()=>M.down=false;
  const onLeave= ()=>{ M.x=M.y=-9999; };

  function stop(){
    token++;
    if(raf) cancelAnimationFrame(raf);
    raf = 0;
    removeEventListener("resize", resize);
    removeEventListener("mousemove", onMove);
    removeEventListener("mousedown", onDown);
    removeEventListener("mouseup", onUp);
    removeEventListener("mouseleave", onLeave);
    if(cv){ cv.remove(); cv=null; ctx=null; }
    parts = []; imgs = [];
  }

  function start(sources, layer){
    stop();
    if(!sources.length) return;
    const mine = ++token;
    Promise.all(sources.map(src=>new Promise(res=>{
      const im = new Image();
      im.onload = ()=>res(im);
      im.onerror = ()=>res(null);   // a dead URL just drops out
      im.src = src;
    }))).then(loaded=>{
      if(mine !== token) return;     // superseded while decoding
      imgs = loaded.filter(Boolean);
      if(!imgs.length) return;
      run(layer);
    });
  }

  function run(layer){
    DPR = Math.min(devicePixelRatio||1, 2);
    cv = document.createElement("canvas");
    cv.id = "imgfxCanvas";
    cv.style.zIndex = layer==="front" ? "40" : "0";
    document.body.prepend(cv);
    ctx = cv.getContext("2d");
    resize();
    addEventListener("resize", resize);
    addEventListener("mousemove", onMove, {passive:true});
    addEventListener("mousedown", onDown);
    addEventListener("mouseup", onUp);
    addEventListener("mouseleave", onLeave);

    parts = Array.from({length:CFG.count}, (_,i)=>{
      const im = imgs[i % imgs.length];
      const w = rnd(CFG.minSize, CFG.maxSize);
      const a = rnd(0, Math.PI*2);
      return {
        img:im, x:rnd(0,W), y:rnd(0,H), w, h:w*(im.naturalHeight/im.naturalWidth || 1),
        vx:Math.cos(a)*CFG.speed*rnd(.5,1.6), vy:Math.sin(a)*CFG.speed*rnd(.5,1.6),
        rot:rnd(0,360), vr:rnd(-CFG.spin,CFG.spin), op:CFG.opacity*rnd(.6,1.15)
      };
    });

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(still){ draw(); return; }   // park them rather than animate
    tick();
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    for(const p of parts){
      ctx.save();
      ctx.globalAlpha = p.op;
      ctx.translate(p.x,p.y);
      ctx.rotate(p.rot*Math.PI/180);
      ctx.drawImage(p.img, -p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    }
  }

  function tick(){
    const swipe = Math.min(Math.hypot(M.dx,M.dy)/14, 3);
    for(const p of parts){
      const dx = p.x-M.x, dy = p.y-M.y, d = Math.hypot(dx,dy);
      if(d < CFG.mouseRadius && d > .1){
        const near = 1 - d/CFG.mouseRadius;
        const f = near * CFG.mouseForce * (M.down ? 2.2 : 1);
        const sign = M.down ? -1 : 1;               // hold to pull them in
        p.vx += (dx/d)*f*.35*sign;
        p.vy += (dy/d)*f*.35*sign;
        p.vx += M.dx*.02*swipe*near;                // flick them with the cursor
        p.vy += M.dy*.02*swipe*near;
        p.vr += M.dx*.01*near;
      }
      p.vx *= CFG.drag; p.vy *= CFG.drag; p.vr *= .99;
      const sp = Math.hypot(p.vx,p.vy);
      if(sp > CFG.maxSpeed){ p.vx = p.vx/sp*CFG.maxSpeed; p.vy = p.vy/sp*CFG.maxSpeed; }
      if(sp < CFG.speed*.25){                        // never fully stall
        const a = Math.random()*Math.PI*2;
        p.vx += Math.cos(a)*.05; p.vy += Math.sin(a)*.05;
      }
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      const m = Math.max(p.w,p.h);                   // wrap at the edges
      if(p.x < -m) p.x = W+m; if(p.x > W+m) p.x = -m;
      if(p.y < -m) p.y = H+m; if(p.y > H+m) p.y = -m;
    }
    draw();
    raf = requestAnimationFrame(tick);
  }

  return {start, stop, cfg:CFG};
})();

function applyToonImages(){
  const imgs = settings.style==="toon" ? themeSprites() : [];
  if(!imgs.length || settings.imgfx==="off"){ IMGFX.stop(); return; }
  IMGFX.start(imgs, settings.imgfx || "front");
}
function renderToonThumbs(){
  const list = toonImg[settings.toon] || [];
  $("toonThumbs").innerHTML = list.map((src,i)=>
    `<span class="thumb"><img src="${src}" alt=""><button type="button" data-rmimg="${i}" title="Remove">×</button></span>`).join("");
  $("toonThumbs").querySelectorAll("[data-rmimg]").forEach(b=>b.onclick=()=>{
    (toonImg[settings.toon]||[]).splice(+b.dataset.rmimg,1);
    saveToonImg(); renderToonThumbs(); applyToonImages();
  });
}
$("toonUpload").addEventListener("change", async e=>{
  const files = [...e.target.files];
  const list = toonImg[settings.toon] || (toonImg[settings.toon] = []);
  let added = 0, full = false;
  for(const f of files){
    if(list.length >= 4){ full = true; break; }
    try{ list.push(await shrinkImage(f)); added++; }
    catch(err){ toast(`Could not read ${f.name}`); }
  }
  e.target.value = "";
  if(added && !saveToonImg()){ list.length = list.length - added; }
  renderToonThumbs(); applyToonImages();
  if(full) toast("4 images max per theme");
  else if(added) toast(`${added} image${added>1?"s":""} added`);
});
$("toonImgs").addEventListener("change", ()=>{
  settings.toonImages[settings.toon] = $("toonImgs").value;
  saveSettings();
  const bad = $("toonImgs").value.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean)
    .filter(u=>!/^https?:\/\/[^\s"'()\\]+$/i.test(u)).length;
  if(bad) toast(`${bad} line${bad>1?"s":""} ignored — needs a plain http(s) image URL`);
});

/* ---------- custom palette ---------- */
const CUSTOM_VARS = ["--bg","--panel","--panel-solid","--panel-2","--ink","--ink-strong","--ink-soft",
  "--line","--line-strong","--cyan","--cyan-dim","--accent-ink","--grid-line","--bg-glow1","--bg-glow2",
  "--neo-lo","--neo-hi"];
function hexRgb(h){
  h = (h||"").replace("#","");
  if(h.length===3) h = h.split("").map(c=>c+c).join("");
  const n = parseInt(h||"000000",16);
  return [(n>>16)&255,(n>>8)&255,n&255];
}
const rgba = (hex,a)=>{ const [r,g,b]=hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
const luma = hex=>{ const [r,g,b]=hexRgb(hex); return (0.299*r+0.587*g+0.114*b)/255; };
function applyPalette(){
  const de = document.documentElement, p = settings.palette;
  if(settings.theme !== "custom"){ CUSTOM_VARS.forEach(v=>de.style.removeProperty(v)); return; }
  const set = (v,val)=>de.style.setProperty(v,val);
  set("--bg", p.bg);
  set("--panel-solid", p.surface);
  set("--panel", rgba(p.surface,.86));
  set("--panel-2", rgba(p.text,.045));
  set("--ink", p.text);
  set("--ink-strong", p.text);
  set("--ink-soft", p.muted);
  set("--line", rgba(p.muted,.28));
  set("--line-strong", rgba(p.muted,.52));
  set("--cyan", p.accent);
  set("--cyan-dim", rgba(p.accent,.14));
  set("--accent-ink", luma(p.accent) > .55 ? "#07090d" : "#ffffff");
  set("--grid-line", rgba(p.muted,.10));
  set("--bg-glow1", rgba(p.accent,.08));
  set("--bg-glow2", rgba(p.accent,.04));
  // neumorphism relief has to follow whether the custom background is light or dark
  const light = luma(p.bg) > .5;
  set("--neo-lo", light ? rgba(p.muted,.30) : "rgba(0,0,0,.58)");
  set("--neo-hi", light ? "rgba(255,255,255,.95)" : rgba(p.text,.06));
}
const PALETTE_INPUTS = {cBg:"bg", cSurface:"surface", cText:"text", cMuted:"muted", cAccent:"accent"};
Object.entries(PALETTE_INPUTS).forEach(([id,key])=>{
  $(id).addEventListener("input", ()=>{ settings.palette[key] = $(id).value; settings.theme="custom"; saveSettings(); });
});
$("cReset").onclick = ()=>{ settings.palette = Object.assign({}, PALETTE_DEFAULT); saveSettings(); };
function saveSettings(){ localStorage.setItem(LS_SET, JSON.stringify(settings)); applySettings(); }
function applySettings(){
  const de = document.documentElement;
  de.dataset.theme = settings.theme;
  de.dataset.style = settings.style;
  de.dataset.bgfx = settings.bgfx;
  de.dataset.toon = settings.toon;
  de.dataset.accent = settings.accent;
  de.dataset.font = settings.font;
  de.dataset.fsize = settings.fsize;
  de.dataset.density = settings.density;
  de.dataset.hl = settings.highlight ? "on" : "off";
  de.dataset.anim = settings.anim ? "on" : "off";
  de.dataset.stars = settings.stars ? "on" : "off";
  de.dataset.bgpat = settings.bgpat;
  $("densitySeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.dn===settings.density));
  $("themeSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.th===settings.theme));
  $("styleSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.sy===settings.style));
  $("bgSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.bgfx===settings.bgfx));
  $("toonSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.tn===settings.toon));
  $("imgfxSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.ix===settings.imgfx));
  $("hlSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", (b.dataset.hl==="1")===!!settings.highlight));
  $("animSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", (b.dataset.an==="1")===!!settings.anim));
  $("askStartSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", (b.dataset.as==="1")===!!settings.askStart));
  $("starSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", (b.dataset.st==="1")===!!settings.stars));
  $("bgPatSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.bp===settings.bgpat));
  if(document.activeElement!==$("bgDim")) $("bgDim").value = settings.bgdim;
  $("fontSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.fn===settings.font));
  $("sizeSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.fs===settings.fsize));
  $("accentDots").querySelectorAll(".dot").forEach(b=>b.classList.toggle("on", b.dataset.ac===settings.accent));
  $("seedSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", (b.dataset.sd==="1")===!!settings.seed));
  $("remindSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", (b.dataset.rm==="1")===!!settings.remind));
  if(document.activeElement!==$("remindMins")) $("remindMins").value = settings.remindMins;
  if(document.activeElement!==$("targetHrs")) $("targetHrs").value = settings.target;
  Object.entries(PALETTE_INPUTS).forEach(([id,key])=>{ if(document.activeElement!==$(id)) $(id).value = settings.palette[key]; });
  if(document.activeElement!==$("toonImgs")) $("toonImgs").value = settings.toonImages[settings.toon] || "";
  applyPalette();
  renderToonThumbs();
  applyToonImages();
  applyBgImage();
  buildStarfield();
  syncStarInputs();
}
$("targetHrs") && $("targetHrs").addEventListener("change", ()=>{
  const v = parseFloat($("targetHrs").value);
  if(v>0){ settings.target=v; saveSettings(); if(store) renderTable(); } else applySettings();
});
$("themeSeg").addEventListener("click", e=>{ if(e.target.dataset.th){ settings.theme=e.target.dataset.th; saveSettings(); }});
$("styleSeg").addEventListener("click", e=>{ if(e.target.dataset.sy){ settings.style=e.target.dataset.sy; saveSettings(); }});
$("bgSeg").addEventListener("click", e=>{ if(e.target.dataset.bgfx){ settings.bgfx=e.target.dataset.bgfx; saveSettings(); }});
$("toonSeg").addEventListener("click", e=>{ if(e.target.dataset.tn){ settings.toon=e.target.dataset.tn; saveSettings(); }});
$("imgfxSeg").addEventListener("click", e=>{ if(e.target.dataset.ix){ settings.imgfx=e.target.dataset.ix; saveSettings(); }});
$("fontSeg").addEventListener("click", e=>{ if(e.target.dataset.fn){ settings.font=e.target.dataset.fn; saveSettings(); }});
$("sizeSeg").addEventListener("click", e=>{ if(e.target.dataset.fs){ settings.fsize=e.target.dataset.fs; saveSettings(); }});
$("densitySeg").addEventListener("click", e=>{ if(e.target.dataset.dn){ settings.density=e.target.dataset.dn; saveSettings(); if(store) renderTable(); }});
$("hlSeg").addEventListener("click", e=>{ if(e.target.dataset.hl!==undefined){ settings.highlight=e.target.dataset.hl==="1"; saveSettings(); }});
$("animSeg").addEventListener("click", e=>{ if(e.target.dataset.an!==undefined){ settings.anim=e.target.dataset.an==="1"; saveSettings(); }});
$("askStartSeg").addEventListener("click", e=>{ if(e.target.dataset.as!==undefined){ settings.askStart=e.target.dataset.as==="1"; saveSettings(); }});
$("starSeg").addEventListener("click", e=>{ if(e.target.dataset.st!==undefined){ settings.stars=e.target.dataset.st==="1"; saveSettings(); }});
$("accentDots").addEventListener("click", e=>{ const b=e.target.closest(".dot"); if(b){ settings.accent=b.dataset.ac; saveSettings(); }});
$("seedSeg").addEventListener("click", e=>{ if(e.target.dataset.sd!==undefined){ settings.seed=e.target.dataset.sd==="1"; saveSettings(); }});
$("remindSeg").addEventListener("click", e=>{
  if(e.target.dataset.rm===undefined) return;
  settings.remind = e.target.dataset.rm==="1";
  saveSettings();
  if(settings.remind && "Notification" in window && Notification.permission==="default") Notification.requestPermission();
});
$("remindMins").addEventListener("change", ()=>{
  const v = parseInt($("remindMins").value,10);
  if(v>0){ settings.remindMins=v; saveSettings(); } else applySettings();
});
$("settingsBtn").onclick = ()=>$("setOverlay").classList.add("show");
$("setClose").onclick = ()=>$("setOverlay").classList.remove("show");
$("setOverlay").addEventListener("mousedown", e=>{ if(e.target===$("setOverlay")) $("setOverlay").classList.remove("show"); });


/* ---------- page background image ---------- */
const LS_BGIMG = "ledger.bgimage";
let bgImage = "";
try{ bgImage = localStorage.getItem(LS_BGIMG) || ""; }catch(e){ bgImage = ""; }
function applyBgImage(){
  const de = document.documentElement;
  if(bgImage) de.style.setProperty("--bgimg", 'url("' + bgImage + '")');
  else de.style.removeProperty("--bgimg");
  de.style.setProperty("--bgdim", (settings.bgdim||0)/100);
  $("bgThumb").innerHTML = bgImage
    ? '<span class="thumb"><img src="' + bgImage + '" alt=""><button type="button" id="bgClear" title="Remove">×</button></span>'
    : "";
  const clr = $("bgClear");
  if(clr) clr.onclick = ()=>{
    bgImage = "";
    try{ localStorage.removeItem(LS_BGIMG); }catch(e){}
    applyBgImage();
  };
}
$("bgUpload").addEventListener("change", async e=>{
  const f = e.target.files[0];
  e.target.value = "";
  if(!f) return;
  try{
    // backgrounds cover the viewport, so they keep more resolution than sprites
    bgImage = await shrinkImage(f, 1920, 0.8);
    localStorage.setItem(LS_BGIMG, bgImage);
    settings.bgpat = "image"; saveSettings();
    toast("Background image set");
  }catch(err){
    bgImage = "";
    toast(err && err.name === "QuotaExceededError" ? "Image too large for browser storage" : "Could not read that image");
  }
  applyBgImage();
});
$("bgPatSeg").addEventListener("click", e=>{
  if(!e.target.dataset.bp) return;
  settings.bgpat = e.target.dataset.bp;
  saveSettings();
  if(settings.bgpat === "image" && !bgImage) $("bgUpload").click();
});
$("bgDim").addEventListener("input", ()=>{ settings.bgdim = +$("bgDim").value; saveSettings(); });

/* ---------- starfield generation ---------- */
function buildStarfield(){
  const c = settings.starCfg;
  const field = $("starField");
  if(!field) return;
  const layers = [
    {el:".s1", n:c.density,               tile:300, r:[1.3,1.9], a:[.72,1.0], drift:240, tw:4.5, v:"1"},
    {el:".s2", n:Math.round(c.density*.8), tile:210, r:[0.9,1.3], a:[.45,.78], drift:340, tw:6.5, v:"2"},
    {el:".s3", n:Math.round(c.density*1.2),tile:150, r:[0.6,1.0], a:[.28,.5],  drift:470, tw:9.0, v:"3"}
  ];
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const bright = (c.bright||100)/100;
  layers.forEach(L=>{
    const el = field.querySelector(L.el);
    if(!el) return;
    let img = [];
    const fixedR = ((L.r[0]+L.r[1])/2).toFixed(2);
    for(let i=0;i<L.n;i++){
      const r = c.sizes === false ? fixedR : rnd(L.r[0], L.r[1]).toFixed(2);
      const x = Math.round(rnd(0, L.tile)), y = Math.round(rnd(0, L.tile));
      const a = Math.min(1, rnd(L.a[0], L.a[1]) * bright).toFixed(2);
      const tint = Math.random() < .18 ? "255,240,214" : (Math.random() < .3 ? "214,238,255" : "255,255,255");
      img.push(`radial-gradient(${r}px ${r}px at ${x}px ${y}px, rgba(${tint},${a}), transparent)`);
    }
    el.style.backgroundImage = img.join(",");
    el.style.backgroundSize = L.tile + "px " + L.tile + "px";
    field.style.setProperty("--sd" + L.v, (L.drift * 100 / (c.drift||100)).toFixed(0) + "s");
    field.style.setProperty("--tw" + L.v, (L.tw * 100 / (c.twinkle||100)).toFixed(2) + "s");
  });
  buildPlanets(field, c);
  // shooting stars: one element per streak, staggered so they never fire together
  field.querySelectorAll(".shoot:not(.once)").forEach(el=>el.remove());
  const n = Math.max(0, Math.min(8, c.shoot|0));
  for(let i=0;i<n;i++){
    const el = document.createElement("i");
    el.className = "shoot";
    el.style.top = (6 + Math.random()*58).toFixed(1) + "%";
    el.style.width = Math.round(rnd(120, 220)) + "px";
    el.style.setProperty("--shootdur", (c.shootFreq * n).toFixed(1) + "s");
    el.style.animationDelay = (i * c.shootFreq).toFixed(1) + "s";
    field.appendChild(el);
  }
}

/* planets: a few slow worlds, one of them ringed */
const PLANET_LOOKS = [
  {size:96,  a:"#c08457", b:"#5e3a22", ring:false, top:"18%", left:"6%",  dur:190},
  {size:150, a:"#7fb3d5", b:"#1d3f5e", ring:true,  top:"58%", left:"72%", dur:260},
  {size:64,  a:"#d9a7c7", b:"#5b2a4a", ring:false, top:"74%", left:"18%", dur:150},
  {size:112, a:"#e8c37e", b:"#7a5312", ring:true,  top:"8%",  left:"58%", dur:320}
];
function buildPlanets(field, c){
  field.querySelectorAll(".planet").forEach(el=>el.remove());
  if(!c.planets) return;
  PLANET_LOOKS.forEach((p,i)=>{
    const el = document.createElement("i");
    el.className = "planet" + (p.ring ? " ringed" : "");
    el.style.cssText =
      "width:"+p.size+"px;height:"+p.size+"px;top:"+p.top+";left:"+p.left+";" +
      "background:radial-gradient(circle at 34% 30%, "+p.a+", "+p.b+" 72%, #05070b 100%);" +
      "animation-duration:"+(p.dur*100/(c.drift||100)).toFixed(0)+"s;animation-delay:-"+(i*17)+"s";
    field.appendChild(el);
  });
}

/* a streak launched from a point — used by clicks and by meteor showers */
function launchShootingStar(x, y, opts){
  const field = $("starField");
  if(!field || !settings.stars) return;
  const o = opts || {};
  const el = document.createElement("i");
  el.className = "shoot once";
  el.style.top = (y != null ? y + "px" : (5 + Math.random()*55) + "%");
  el.style.left = (x != null ? x + "px" : "-10%");
  el.style.width = Math.round(120 + Math.random()*140) + "px";
  el.style.animationDuration = (o.dur || (0.9 + Math.random()*0.5)).toFixed(2) + "s";
  if(o.delay) el.style.animationDelay = o.delay.toFixed(2) + "s";
  el.addEventListener("animationend", ()=>el.remove());
  field.appendChild(el);
}
// clicking anywhere sends one from that spot
document.addEventListener("click", e=>{
  if(!settings.stars || settings.starCfg.click === false) return;
  if(e.target instanceof Element && e.target.closest("input,textarea,select,button,label,a,.overlay .modal")) return;
  launchShootingStar(e.clientX, e.clientY);
});
// occasional meteor shower: a burst of streaks together
setInterval(()=>{
  const c = settings.starCfg;
  if(!settings.stars || !c.cluster || !settings.anim) return;
  if(Math.random() > 0.22) return;                    // roughly one burst every few minutes
  const n = 3 + Math.floor(Math.random()*4);
  const topPct = 4 + Math.random()*40;
  for(let i=0;i<n;i++){
    const el = document.createElement("i");
    el.className = "shoot once";
    el.style.top = (topPct + i*3.5 + Math.random()*2).toFixed(1) + "%";
    el.style.left = (-14 - Math.random()*10) + "%";
    el.style.width = Math.round(130 + Math.random()*120) + "px";
    el.style.animationDuration = (1.0 + Math.random()*0.4).toFixed(2) + "s";
    el.style.animationDelay = (i*0.16).toFixed(2) + "s";
    el.addEventListener("animationend", ()=>el.remove());
    $("starField").appendChild(el);
  }
}, 30000);

const STAR_TOGGLES = {scSizesSeg:["sz","sizes"], scPlanetSeg:["pl","planets"], scClusterSeg:["cl","cluster"], scClickSeg:["ck","click"]};
Object.entries(STAR_TOGGLES).forEach(([id,[attr,key]])=>{
  $(id).addEventListener("click", e=>{
    if(e.target.dataset[attr]===undefined) return;
    settings.starCfg[key] = e.target.dataset[attr]==="1";
    if(!settings.stars) settings.stars = true;
    saveSettings();
  });
});

const STAR_INPUTS = {scDensity:"density", scTwinkle:"twinkle", scDrift:"drift", scBright:"bright", scShoot:"shoot", scShootFreq:"shootFreq"};
function syncStarInputs(){
  const c = settings.starCfg;
  Object.entries(STAR_TOGGLES).forEach(([id,[attr,key]])=>{
    $(id).querySelectorAll("button").forEach(b=>b.classList.toggle("on", (b.dataset[attr]==="1") === (c[key]!==false)));
  });
  const unit = {density:"", twinkle:"%", drift:"%", bright:"%", shoot:"", shootFreq:"s"};
  Object.entries(STAR_INPUTS).forEach(([id,key])=>{
    if(document.activeElement !== $(id)) $(id).value = c[key];
    $(id+"V").textContent = c[key] + unit[key];
  });
}
Object.entries(STAR_INPUTS).forEach(([id,key])=>{
  $(id).addEventListener("input", ()=>{
    settings.starCfg[key] = +$(id).value;
    if(!settings.stars){ settings.stars = true; }   // show what is being tuned
    saveSettings();
  });
});
$("starCfgBtn").onclick = ()=>{ syncStarInputs(); $("starOverlay").classList.add("show"); };
$("starCfgClose").onclick = ()=>$("starOverlay").classList.remove("show");
$("starOverlay").addEventListener("mousedown", e=>{ if(e.target===$("starOverlay")) $("starOverlay").classList.remove("show"); });
$("starReset").onclick = ()=>{
  settings.starCfg = {density:60, twinkle:100, drift:100, bright:100, shoot:2, shootFreq:13, sizes:true, planets:false, cluster:true, click:true};
  saveSettings();
};

applySettings();   // first paint — every binding above now exists

/* ---------- reminders ---------- */
let audioCtx = null;
function beep(){
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type="sine"; o.frequency.value=880;
    g.gain.setValueAtTime(.001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(.25, audioCtx.currentTime+.02);
    g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime+.55);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime+.6);
  }catch(e){}
}
function remindPing(t){
  const label = (t.live && t.live.task) || t.project || t.task || "Timeblock";
  const mins = Math.round(hours(t.live.start, hhmmss(new Date()))*60);
  toast(`⏱ Still running: “${label}” — ${mins} min elapsed`);
  beep();
  if("Notification" in window && Notification.permission==="granted"){
    try{
      // unique tag per ping — reusing one tag made browsers show it only once
      new Notification("LEDGER — timer still running", {
        body:`${label} · ${mins} min elapsed`,
        tag:"ledger-remind-"+label+"-"+Date.now(),
        requireInteraction:true
      });
    }catch(e){}
  }
  document.title = "⏱ STILL RUNNING — " + document.title.replace(/^⏱ STILL RUNNING — /,"");
  setTimeout(()=>{ document.title = document.title.replace(/^⏱ STILL RUNNING — /,""); }, 8000);
}

/* belt-and-braces: cancel any selection or drag that starts outside a text field,
   so a click-drag across the page only pushes the floating artwork around */
document.addEventListener("selectstart", e=>{
  if(!(e.target instanceof Element) || !e.target.closest("input,textarea,[contenteditable='true']")) e.preventDefault();
});
document.addEventListener("dragstart", e=>{
  if(!(e.target instanceof Element) || !e.target.closest("input,textarea")) e.preventDefault();
});

/* ---------- reminders ----------
   Three triggers: a clock time (with catch-up if the app was closed),
   the moment a matching task's timer starts, and the first open of the day. */
function reminders(){ return (store.reminders = store.reminders || []); }
function fireReminder(r){
  toast("🔔 " + r.text);
  beep();
  if("Notification" in window && Notification.permission==="granted"){
    try{
      new Notification("LEDGER — reminder", {
        body:r.text, tag:"ledger-rem-"+r.id+"-"+Date.now(), requireInteraction:true
      });
    }catch(e){}
  }
}
function remSummary(r){
  if(r.type==="time"){
    const rep = r.repeat==="weekdays" ? "weekdays" : (r.repeat==="once" ? "once" : "every day");
    return `<b>${r.time}</b> · ${rep}`;
  }
  if(r.type==="start") return r.match ? `when a task matching <b>${esc(r.match)}</b> starts` : "when <b>any task</b> starts";
  return "when <b>Ledger opens</b> (first time each day)";
}
function renderReminders(){
  const list = reminders();
  $("remList").innerHTML = list.map(r=>
    `<div class="remitem ${r.on?"":"off"}">
      <div class="rm-main">
        <div class="rm-text">${esc(r.text)}</div>
        <div class="rm-when">${remSummary(r)}</div>
      </div>
      <button type="button" class="icon-btn" data-remtoggle="${r.id}">${r.on?"on":"off"}</button>
      <button type="button" class="icon-btn" data-remdel="${r.id}" title="Delete">✕</button>
    </div>`).join("");
  $("remList").querySelectorAll("[data-remtoggle]").forEach(b=>b.onclick=()=>{
    const r = list.find(x=>String(x.id)===b.dataset.remtoggle);
    if(r){ r.on = !r.on; save(); renderReminders(); }
  });
  $("remList").querySelectorAll("[data-remdel]").forEach(b=>b.onclick=()=>{
    const i = list.findIndex(x=>String(x.id)===b.dataset.remdel);
    if(i>-1){ list.splice(i,1); save(); renderReminders(); }
  });
}
function syncRemFields(){
  const t = $("rType").value;
  $("rTimeWrap").style.display   = t==="time"  ? "block" : "none";
  $("rRepeatWrap").style.display = t==="time"  ? "block" : "none";
  $("rMatchWrap").style.display  = t==="start" ? "block" : "none";
}
$("rType").addEventListener("change", syncRemFields);
$("remBtn").onclick = ()=>{ renderReminders(); syncRemFields(); $("remOverlay").classList.add("show"); };
$("remClose").onclick = ()=>$("remOverlay").classList.remove("show");
$("remOverlay").addEventListener("mousedown", e=>{ if(e.target===$("remOverlay")) $("remOverlay").classList.remove("show"); });
$("remForm").addEventListener("submit", e=>{
  e.preventDefault();
  const text = $("rText").value.trim();
  if(!text){ $("rErr").textContent = "Give the reminder some text."; return; }
  const type = $("rType").value;
  if(type==="time" && !/^\d{2}:\d{2}$/.test($("rTime").value)){ $("rErr").textContent = "Pick a time."; return; }
  reminders().push({
    id: Date.now(),
    text, type,
    time: $("rTime").value,
    repeat: $("rRepeat").value,
    match: $("rMatch").value.trim(),
    on: true,
    lastFired: null
  });
  save();
  $("rText").value = ""; $("rMatch").value = ""; $("rErr").textContent = "";
  renderReminders();
  if("Notification" in window && Notification.permission==="default") Notification.requestPermission();
  toast("Reminder added");
});
// clock reminders, checked once a second from tick()
function checkTimeReminders(){
  const now = new Date(), hm = now.toTimeString().slice(0,5), today = todayKey();
  let dirty = false;
  reminders().forEach(r=>{
    if(!r.on || r.type!=="time" || r.lastFired===today) return;
    if(r.repeat==="weekdays" && (now.getDay()===0 || now.getDay()===6)) return;
    if(hm >= r.time){                 // >= so a missed one still lands when you return
      fireReminder(r);
      r.lastFired = today;
      if(r.repeat==="once") r.on = false;
      dirty = true;
    }
  });
  if(dirty){
    save();
    if($("remOverlay").classList.contains("show")) renderReminders();
  }
}
function fireOpenReminders(){
  const today = todayKey();
  let dirty = false, delay = 900;
  reminders().forEach(r=>{
    if(!r.on || r.type!=="open" || r.lastFired===today) return;
    setTimeout(()=>fireReminder(r), delay);
    delay += 1400;
    r.lastFired = today;
    if(r.repeat==="once") r.on = false;
    dirty = true;
  });
  if(dirty) save();
}
function fireStartReminders(t, label){
  const hay = [t.brand, t.project, t.task, label].join(" ").toLowerCase();
  reminders().forEach(r=>{
    if(!r.on || r.type!=="start") return;
    if(r.match && !hay.includes(r.match.toLowerCase())) return;
    setTimeout(()=>fireReminder(r), 250);
  });
}

/* ---------- storage ---------- */
let user=null, store=null, viewDay=null, curBrand="", prevDay=null;
const dataKey = () => "ledger.data." + user;
function newEntry(o){ return Object.assign({brand:"",project:"",task:"",status:"In Progress",sessions:[],live:null,manualHours:null,isDefault:false}, o); }
function migrate(){
  for(const day of Object.values(store.days)){
    for(const t of day){
      if(t.manualHours===undefined) t.manualHours=null;
      if(t.isDefault===undefined) t.isDefault=false;
      if(t.live && typeof t.live==="string") t.live={task:t.task||"",start:t.live};
      if(!t.isDefault && isDefaultEntry(t)) t.isDefault=true;
      // the old seeded Meeting note is no longer wanted
      if(t.isDefault && t.task==="FNR, Other Meetings") t.task="";
      (t.sessions||[]).forEach(s=>{ if(s.task===undefined) s.task=t.task||""; });
    }
  }
}
function seedDefaults(day){
  if(!settings.seed) return;
  const list = store.days[day];
  if(list.length) return;
  const rs = (store.routines && store.routines.length)
    ? store.routines.filter(r=>r.on)
    : DEFAULT_ENTRIES.map(d=>({brand:"", project:d.project, task:d.task, status:"In Progress"}));
  rs.forEach(r=>list.push(newEntry({
    brand:r.brand||"", project:r.project, task:r.task||"",
    status:r.status||"In Progress", isDefault:!r.brand
  })));
}
// any real tracked time on a day — a single logged minute counts
function hasLoggedTime(list){
  return (list||[]).some(t => (t.sessions&&t.sessions.length) || t.live || (t.manualHours!=null && t.manualHours>0));
}
// the day actually worked before today (Saturday counts if time was logged),
// falling back to the calendar weekday when nothing is stored yet
function lastWorkedDay(){
  const today = todayKey();
  const worked = Object.keys(store.days)
    .filter(k => k < today && hasLoggedTime(store.days[k]))
    .sort();
  return worked.length ? worked[worked.length-1] : prevWorkingDay(today);
}
function load(){
  store = JSON.parse(localStorage.getItem(dataKey()) || "{}");
  if(!store.days) store.days = {};
  prevDay = lastWorkedDay();
  // history is kept now — the dashboard, table and day sheet report on it.
  // Only empty days that were never worked get cleared, so the store stays tidy.
  const keep = new Set([todayKey(), prevDay]);
  for(const k of Object.keys(store.days)){
    if(keep.has(k)) continue;
    if(!hasLoggedTime(store.days[k])) delete store.days[k];
  }
  if(!store.days[todayKey()]) store.days[todayKey()] = [];
  migrate();
  closeStaleTimers();
  seedDefaults(todayKey());
  save();
}
// a timer left running past midnight would otherwise count hours forever —
// park it as a zero-length block on its own day so the real end time can be filled in
function closeStaleTimers(){
  let n = 0;
  for(const [day, list] of Object.entries(store.days)){
    if(day === todayKey()) continue;
    list.forEach(t=>{
      if(t.live){
        t.sessions.push({task:t.live.task, start:t.live.start, end:t.live.start});
        t.live = null; n++;
      }
    });
  }
  if(n) setTimeout(()=>toast(`${n} timer${n>1?"s":""} left running overnight — parked as 0m blocks, set the end time`), 1200);
}
const save = () => localStorage.setItem(dataKey(), JSON.stringify(store));
const tasks = () => store.days[viewDay] || (store.days[viewDay]=[]);

/* ---------- ordering (defaults first in fixed order, then Default-Task brand, then brands by hours) ---------- */
function orderedIndices(list){
  const bh = {};
  list.forEach(t=>{ if(!isDefaultEntry(t)) bh[t.brand]=(bh[t.brand]||0)+taskHours(t); });
  return list.map((t,i)=>i).sort((a,b)=>{
    const A=list[a], B=list[b];
    const da=isDefaultEntry(A), db=isDefaultEntry(B);
    if(da !== db) return da?-1:1;
    if(da && db) return (defaultRank(A)-defaultRank(B)) || (a-b);
    if(A.brand!==B.brand){
      if(A.brand==="") return -1;
      if(B.brand==="") return 1;
      return ((bh[B.brand]||0)-(bh[A.brand]||0)) || A.brand.localeCompare(B.brand);
    }
    return a-b;
  });
}

/* ---------- auth ---------- */
$("loginForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const name = $("loginName").value.trim();
  const pin  = $("loginPin").value;
  if(!name||!pin) return;
  const users = JSON.parse(localStorage.getItem(LS_USERS)||"{}");
  const h = await hash(name.toLowerCase()+"::"+pin);
  if(users[name.toLowerCase()]){
    if(users[name.toLowerCase()] !== h){ $("loginMsg").textContent="Wrong PIN for this name."; return; }
  } else {
    users[name.toLowerCase()] = h;
    localStorage.setItem(LS_USERS, JSON.stringify(users));
    toast("Account created on this device");
  }
  sessionStorage.setItem("ledger.session", name);
  enter(name);
});
$("logoutBtn").onclick = ()=>{ sessionStorage.removeItem("ledger.session"); location.reload(); };

function enter(name){
  user = name.toLowerCase();
  $("loginView").style.display="none";
  $("appView").style.display="block";
  $("hdrName").innerHTML = esc(name.charAt(0).toUpperCase()+name.slice(1)) + '<span class="tick">_</span>';
  $("setWho").textContent = "Signed in as " + name;
  load();
  viewDay = todayKey();
  buildBrandMenu();
  buildRtBrandMenu();
  render();
  // the table latches row heights measured with fallback font metrics — recalc once
  // the webfonts land so the layout settles instead of drifting on the next render
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ if(store) renderTable(); });
  maybePromptCarry();
  fireOpenReminders();
  if(settings.remind && "Notification" in window && Notification.permission==="default") Notification.requestPermission();
  setInterval(tick, 1000);
  tick();
}

/* ---------- brand dropdown ---------- */
function buildBrandMenu(){
  $("brandMenu").innerHTML = BRANDS.map(b=>
    `<button type="button" class="branddd-item" data-b="${b.v}" role="option"><span class="bpill ${b.cls}">${b.label}</span></button>`).join("");
  $("brandMenu").querySelectorAll(".branddd-item").forEach(el=>el.onclick=()=>{
    curBrand = el.dataset.b;
    const b = BRANDS.find(x=>x.v===curBrand)||BRANDS[0];
    $("brandCur").innerHTML = `<span class="bpill ${b.cls}">${b.label}</span>`;
    $("brandDD").classList.remove("open");
  });
}
$("brandBtn").onclick = e=>{ e.stopPropagation(); $("brandDD").classList.toggle("open"); };
document.addEventListener("click", e=>{ if(!$("brandDD").contains(e.target)) $("brandDD").classList.remove("open"); });
document.addEventListener("keydown", e=>{
  if(e.key==="Escape"){ $("brandDD").classList.remove("open"); closeBlock(); $("editOverlay").classList.remove("show"); $("setOverlay").classList.remove("show"); $("prevOverlay").classList.remove("show"); $("gapsOverlay").classList.remove("show"); $("assignOverlay").classList.remove("show"); $("carryOverlay").classList.remove("show"); $("remOverlay").classList.remove("show"); }
});

/* ---------- undo (20s window to resume a stopped task and run both) ---------- */
let undo = null; // {items:[{idx, live, sess}], deadline, iv}
function showUndo(items){
  clearUndo(false);
  undo = {items, deadline: Date.now()+20000};
  const names = items.map(x=>{
    const t = tasks()[x.idx];
    return "“"+(x.live.task || t.project || t.task || "task")+"”";
  }).join(", ");
  $("undoText").textContent = `Stopped ${names}.`;
  $("undoCount").textContent = "20";
  $("undoBar").classList.add("show");
  undo.iv = setInterval(()=>{
    const left = Math.max(0, Math.ceil((undo.deadline-Date.now())/1000));
    $("undoCount").textContent = String(left);
    if(left<=0) clearUndo(false);
  }, 250);
}
function clearUndo(){
  if(undo){ clearInterval(undo.iv); undo=null; }
  $("undoBar").classList.remove("show");
}
$("undoBtn").onclick = ()=>{
  if(!undo) return;
  const list = tasks();
  undo.items.forEach(x=>{
    const t = list[x.idx];
    if(!t) return;
    const k = t.sessions.indexOf(x.sess);
    if(k>-1) t.sessions.splice(k,1);
    t.live = x.live; // restore original start & reminder cadence
  });
  clearUndo();
  save(); renderTable();
  toast("Resumed — both timers running");
};

/* ---------- timeblock modal ---------- */
let blockCtx = null; // {i, mode:"start"|"manual"|"edit", sIdx}
let gapsReturn = false;   // set when the block modal was opened from the gaps chart
function openBlock(i, mode, sIdx){
  const t = tasks()[i];
  blockCtx = {i, mode, sIdx};
  const isEdit = mode==="edit";
  const isManual = mode==="manual";
  const isRename = mode==="rename";
  $("blockTitle").textContent = isRename ? "Rename running task"
    : (isEdit ? "Edit timeblock"
    : (isManual ? "Add timeblock"
    : "Start timer — " + (t.project || t.brand || "task")));
  $("bOk").textContent = (isEdit||isRename) ? "Save" : (isManual ? "Add" : "Start ▶");
  $("bCancel").textContent = mode==="start" ? "Not now" : "Cancel";
  $("bDelete").style.display = isEdit ? "inline-block" : "none";
  $("bTimes").style.display = (isManual||isEdit) ? "flex" : "none";
  $("bRemindWrap").style.display = (mode==="start" && settings.remind) ? "block" : "none";
  $("bRemind").value = settings.remindMins;
  if(isRename){
    $("bTask").value = (t.live && t.live.task) || "";
  } else if(isEdit){
    const s = t.sessions[sIdx];
    $("bTask").value = s.task||"";
    $("bStart").value = s.start; $("bEnd").value = s.end;
  } else {
    const last = t.sessions[t.sessions.length-1];
    $("bTask").value = last ? last.task : (t.task||"");
    $("bStart").value = ""; $("bEnd").value = "";
  }
  $("bErr").textContent="";
  $("blockOverlay").classList.add("show");
  setTimeout(()=>$("bTask").select(),30);
}
function closeBlock(){ $("blockOverlay").classList.remove("show"); blockCtx=null; }
function cancelBlock(){ gapsReturn=false; closeBlock(); }
$("bCancel").onclick = cancelBlock;
$("blockOverlay").addEventListener("mousedown", e=>{ if(e.target===$("blockOverlay")) closeBlock(); });
$("bDelete").onclick = ()=>{
  if(!blockCtx || blockCtx.mode!=="edit") return;
  if(!confirm("Delete this timeblock?")) return;
  tasks()[blockCtx.i].sessions.splice(blockCtx.sIdx,1);
  save(); closeBlock(); renderTable();
  if(gapsReturn){ gapsReturn = false; $("gapsBtn").click(); }
};
$("blockModal").addEventListener("submit", e=>{
  e.preventDefault();
  if(!blockCtx) return;
  const list = tasks();
  const t = list[blockCtx.i];
  const label = $("bTask").value.trim();
  if(blockCtx.mode==="rename"){
    if(t.live) t.live.task = label;
  } else if(blockCtx.mode==="manual" || blockCtx.mode==="edit"){
    const st=$("bStart").value, en=$("bEnd").value;
    if(!validT(st)||!validT(en)){ $("bErr").textContent="Times must be HH:MM (or HH:MM:SS)."; return; }
    if(blockCtx.mode==="edit"){
      const s = t.sessions[blockCtx.sIdx];
      s.task=label; s.start=norm(st); s.end=norm(en);
    } else {
      t.sessions.push({task:label, start:norm(st), end:norm(en)});
    }
  } else {
    // stop any other running timers first, with a 20s resume window
    const stopped = [];
    list.forEach((o,j)=>{
      if(j!==blockCtx.i && o.live){
        const sess = {task:o.live.task, start:o.live.start, end:hhmmss(new Date())};
        o.sessions.push(sess);
        stopped.push({idx:j, live:o.live, sess});
        o.live = null;
      }
    });
    const rm = settings.remind ? parseInt($("bRemind").value,10) : 0;
    // restarted within 20s of the last stop → no gap: continue from where it ended
    let startAt = hhmmss(new Date());
    const prev = t.sessions[t.sessions.length-1];
    if(prev){
      const gap = toSec(startAt) - toSec(prev.end);
      if(gap>=0 && gap<=20){
        if((prev.task||"")===label){ t.sessions.pop(); startAt = prev.start; } // same task → merge into one block
        else startAt = prev.end; // different task → butt the blocks together
      }
    }
    t.live = {task:label, start:startAt, remind:(rm>0?rm:null), nextRemind:(rm>0?rm:null)};
    if(rm>0 && "Notification" in window && Notification.permission==="default") Notification.requestPermission();
    fireStartReminders(t, label);
    if(stopped.length) showUndo(stopped);
  }
  save(); closeBlock(); renderTable();
  if(gapsReturn){ gapsReturn = false; $("gapsBtn").click(); }
});

/* ---------- edit modal ---------- */
let editIdx = null;
function openEdit(i){
  const t = tasks()[i];
  editIdx = i;
  $("eBrand").innerHTML = BRANDS.map(b=>`<option value="${b.v}" ${b.v===t.brand?"selected":""}>${b.label}</option>`).join("");
  $("eProject").value = t.project||"";
  $("eTask").value = t.task||"";
  $("eHours").value = t.manualHours!=null ? String(t.manualHours) : "";
  $("eErr").textContent="";
  $("editOverlay").classList.add("show");
  setTimeout(()=>$("eTask").select(),30);
}
$("eCancel").onclick = ()=>$("editOverlay").classList.remove("show");
$("editOverlay").addEventListener("mousedown", e=>{ if(e.target===$("editOverlay")) $("editOverlay").classList.remove("show"); });
$("editModal").addEventListener("submit", e=>{
  e.preventDefault();
  if(editIdx==null) return;
  const t = tasks()[editIdx];
  const hv = $("eHours").value.trim();
  if(hv && isNaN(parseFloat(hv))){ $("eErr").textContent="Hours must be a number, e.g. 0.5"; return; }
  t.brand = $("eBrand").value;
  t.project = $("eProject").value.trim();
  t.task = $("eTask").value.trim();
  t.manualHours = hv ? Math.round(parseFloat(hv)*100)/100 : null;
  save(); $("editOverlay").classList.remove("show"); renderTable();
});

/* ---------- carry over unfinished work from the last worked day ---------- */
const CARRY_SKIP = ["Done","Cancelled"];
function carryCandidates(){
  const prevList = (prevDay && store.days[prevDay]) || [];
  const today = store.days[todayKey()] || [];
  const key = t => (t.brand||"")+"::"+(t.project||"").trim().toLowerCase();
  const existing = new Set(today.map(key));
  return prevList.filter(t=>!isDefaultEntry(t) && !CARRY_SKIP.includes(t.status) && !existing.has(key(t)));
}
function updateCarryBtn(){
  const n = viewDay===todayKey() ? carryCandidates().length : 0;
  $("carryBtn").style.display = n ? "inline-block" : "none";
  $("carryBtn").textContent = `⟲ Carry over ${n} unfinished`;
}
function openCarry(){
  const cands = carryCandidates();
  if(!cands.length){ toast("Nothing unfinished to carry over"); return; }
  $("carryHint").innerHTML = `Still open on <b>${fmtDate(prevDay)}</b>. Ticked items are added to today as fresh entries — timeblocks stay on their original day.`;
  $("carryList").innerHTML = cands.map((t,k)=>
    `<label class="carryitem">
      <input type="checkbox" data-carry="${k}" checked>
      <span class="bpill ${brandCls(t.brand)}">${t.brand?esc(t.brand):"Default Task"}</span>
      <span class="ci-main">
        <span class="ci-proj">${esc(t.project||"—")}</span>
        ${t.task?`<span class="ci-sub">${esc(t.task)}</span>`:""}
      </span>
      <span class="status-sel ${STATUSES[t.status]||""}" style="pointer-events:none">${esc(t.status)}</span>
    </label>`).join("");
  $("carryList")._cands = cands;
  $("carryOverlay").classList.add("show");
}
$("carryBtn").onclick = openCarry;
$("carryCancel").onclick = ()=>$("carryOverlay").classList.remove("show");
$("carryOverlay").addEventListener("mousedown", e=>{ if(e.target===$("carryOverlay")) $("carryOverlay").classList.remove("show"); });
$("carryModal").addEventListener("submit", e=>{
  e.preventDefault();
  const cands = $("carryList")._cands || [];
  const picked = [...$("carryList").querySelectorAll("[data-carry]")].filter(c=>c.checked).map(c=>cands[+c.dataset.carry]);
  picked.forEach(t=>store.days[todayKey()].push(newEntry({brand:t.brand, project:t.project, task:t.task, status:t.status})));
  store.carriedFor = todayKey();
  save();
  $("carryOverlay").classList.remove("show");
  if(picked.length){ viewDay = todayKey(); render(); toast(`${picked.length} task${picked.length>1?"s":""} carried over`); }
});
// offer once per day, when today has nothing of its own yet
function maybePromptCarry(){
  if(store.carriedFor === todayKey()) return;
  const today = store.days[todayKey()] || [];
  if(today.some(t=>!isDefaultEntry(t))) return;
  if(!carryCandidates().length) return;
  store.carriedFor = todayKey(); save();
  setTimeout(openCarry, 700);
}

/* ---------- rendering ---------- */
function render(){
  if(curPage==="dashboard") renderDashboard();
  if(curPage==="table") renderFlatTable();
  if(curPage==="sheet") renderDaySheet();
  $("hdrDate").textContent = fmtDate(viewDay) + (viewDay===todayKey() ? " · TODAY" : "");
  renderTabs(); renderTable(); renderDatalists(); updateCarryBtn();
  $("addBar").style.opacity = viewDay===todayKey() ? 1 : .45;
}
function renderTabs(){
  const prev = prevDay || prevWorkingDay(todayKey());
  const tabs = [[todayKey(),"TODAY"],[prev, hasLoggedTime(store.days[prev]) ? "LAST WORKED" : "PREV WORKING DAY"]];
  $("dayTabs").innerHTML = tabs.map(([k,label])=>
    `<button class="daytab ${k===viewDay?"active":""}" data-day="${k}">${label} · ${fmtDate(k)}</button>`).join("");
  [...$("dayTabs").children].forEach(b=>b.onclick=()=>{viewDay=b.dataset.day;render();});
}
function renderDatalists(){
  const all = Object.values(store.days).flat();
  $("projectList").innerHTML = [...new Set(all.map(t=>t.project).filter(Boolean))].map(v=>`<option value="${v}">`).join("");
}
function taskHours(t){
  let h = t.sessions.reduce((a,s)=>a+hours(s.start,s.end),0);
  if(t.live) h += hours(t.live.start, hhmmss(new Date()));
  if(!t.sessions.length && !t.live && t.manualHours!=null) h = t.manualHours;
  return h;
}
function renderTable(){
  const list = tasks();
  const body = $("taskBody");
  const dayTotal = list.reduce((a,t)=>a+taskHours(t),0);
  if(!list.length){
    body.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="disp">NO ENTRIES ${viewDay===todayKey()?"YET":"THIS DAY"}</div>Add one above${viewDay===todayKey()?" or hit ▶ to start a timeblock":""}.</div></td></tr>`;
  } else {
    const editable = viewDay===todayKey();
    body.innerHTML = orderedIndices(list).map(i=>{
      const t = list[i];
      // keep blocks in clock order — a gap assigned later still slots in where it happened
      t.sessions.sort((a,b)=>(toSec(a.start)??0)-(toSec(b.start)??0));
      const chips = t.sessions.map((s,k)=>{
        const m = Math.round(hours(s.start,s.end)*60);
        return `<span class="chip ${editable?"clickable":""}" ${editable?`data-sedit="${i}:${k}" title="Click to edit"`:""}>${s.task?`<b>${esc(s.task)}</b>`:""}<span class="ct">${short(s.start)}–${short(s.end)}</span><span class="ch">${m}m</span></span>`;
      }).join("")
        + (t.live?`<span class="chip live ${editable?"clickable":""}" ${editable?`data-ledit="${i}" title="Click to rename"`:""}>${t.live.task?`<b>${esc(t.live.task)}</b>`:""}<span class="ct">${short(t.live.start)} – now</span><span class="ch" data-livemin="${i}">${Math.round(hours(t.live.start,hhmmss(new Date()))*60)}m</span></span>`:"");
      const noBlocks = !t.sessions.length && !t.live;
      const h = taskHours(t);
      const share = dayTotal>0 ? Math.min(100, Math.round(h/dayTotal*100)) : 0;
      return `<tr data-i="${i}" class="${t.live?"running":""}">
        <td><span class="bpill ${brandCls(t.brand)}">${t.brand?esc(t.brand):"Default Task"}</span></td>
        <td><div class="projcell">${esc(t.project)}</div>${t.task?`<div class="taskdesc">${esc(t.task)}</div>`:""}</td>
        <td class="tbcell">${t.live?`<span class="livehint">● REC</span>`:""}<div class="sesswrap">${chips||`<span style="color:var(--ink-soft);opacity:.5">—</span>`}</div></td>
        <td class="num ${noBlocks&&editable?"editable":""}" ${noBlocks&&editable?`data-eh="${i}" title="Click to set hours"`:""} data-hours="${i}"><strong>${fmtH(h)}</strong><div class="hbar"><span style="width:${share}%"></span></div></td>
        <td><select class="status-sel ${STATUSES[t.status]||""}" data-st="${i}" ${editable?"":"disabled"}>
          ${Object.keys(STATUSES).map(s=>`<option ${s===t.status?"selected":""}>${s}</option>`).join("")}
        </select></td>
        <td><div class="rowbtns">
          ${editable ? (t.live
            ? `<button class="icon-btn rec live" data-stop="${i}">⏹ stop</button>`
            : `<button class="icon-btn rec" data-go="${i}" title="Start timeblock">▶</button>`)
          : ""}
          ${editable?`<button class="icon-btn" data-sess="${i}" title="Add manual timeblock">+ block</button>
          <button class="icon-btn" data-edit="${i}" title="Edit">✎</button>
          <button class="icon-btn" data-del="${i}" title="Delete">✕</button>`:""}
        </div></td>
      </tr>`;
    }).join("");
  }
  const total = dayTotal;
  $("dayTotal").textContent = fmtH(total);
  $("statHours").textContent = fmtH(total);
  $("statTasks").textContent = list.length;
  renderBrandStrip(list, total);
  renderTarget(total);

  body.querySelectorAll("[data-st]").forEach(el=>el.onchange=()=>{
    const t = tasks()[+el.dataset.st];
    t.status = el.value;
    if(el.value==="Done" && t.live){ // Done auto-stops the timer (can be restarted)
      t.sessions.push({task:t.live.task, start:t.live.start, end:hhmmss(new Date())});
      t.live=null;
      toast("Timer stopped — marked Done");
    }
    save(); renderTable();
  });
  body.querySelectorAll("[data-del]").forEach(el=>el.onclick=()=>{ if(confirm("Delete this entry?")){ tasks().splice(+el.dataset.del,1); clearUndo(); save(); renderTable(); }});
  body.querySelectorAll("[data-go]").forEach(el=>el.onclick=()=>openBlock(+el.dataset.go,"start"));
  body.querySelectorAll("[data-sess]").forEach(el=>el.onclick=()=>openBlock(+el.dataset.sess,"manual"));
  body.querySelectorAll("[data-edit]").forEach(el=>el.onclick=()=>openEdit(+el.dataset.edit));
  body.querySelectorAll("[data-eh]").forEach(el=>el.onclick=()=>openEdit(+el.dataset.eh));
  body.querySelectorAll("[data-ledit]").forEach(el=>el.onclick=()=>openBlock(+el.dataset.ledit,"rename"));
  body.querySelectorAll("[data-sedit]").forEach(el=>el.onclick=()=>{
    const [i,k] = el.dataset.sedit.split(":").map(Number);
    openBlock(i,"edit",k);
  });
  body.querySelectorAll("[data-stop]").forEach(el=>el.onclick=()=>{
    const t=tasks()[+el.dataset.stop];
    t.sessions.push({task:t.live.task, start:t.live.start, end:hhmmss(new Date())});
    t.live=null; save(); renderTable();
  });
  hideHoverCard();
  if(settings.density==="hover"){
    body.querySelectorAll("tr[data-i]").forEach(tr=>{
      tr.addEventListener("mouseenter", ()=>showHoverCard(tr));
      tr.addEventListener("mouseleave", scheduleHideHoverCard);
    });
  }
}

function renderBrandStrip(list, total){
  const agg = {};
  list.forEach(t=>{ const h=taskHours(t); if(h>0) agg[t.brand]=(agg[t.brand]||0)+h; });
  const keys = Object.keys(agg).sort((a,b)=>agg[b]-agg[a]);
  $("brandStrip").innerHTML = keys.map(k=>{
    const b = BRANDS.find(x=>x.v===k)||BRANDS[0];
    const pct = total>0 ? Math.round(agg[k]/total*100) : 0;
    return `<span class="bsitem"><span class="bpill ${b.cls}">${b.label}</span><span class="v">${fmtH(agg[k])}h</span>· ${pct}%</span>`;
  }).join("");
}
function renderTarget(total){
  const goal = settings.target || 8;
  const pct = Math.min(100, Math.round(total/goal*100));
  $("tgGoal").textContent = goal;
  $("tgPct").textContent = pct + "%";
  const fill = $("tgFill");
  fill.style.width = pct + "%";
  fill.classList.toggle("full", pct>=100);
}

/* ---------- floating hover card (hover density) ---------- */
let _hcTimer = null;
function showHoverCard(tr){
  clearTimeout(_hcTimer);
  const i = +tr.dataset.i;
  const t = tasks()[i];
  if(!t) return;
  const editable = viewDay===todayKey();
  const card = $("hoverCard");
  const sess = t.sessions.map((s,k)=>
    `<div class="sess ${editable?"clickable":""}" ${editable?`data-hsedit="${i}:${k}" title="Click to edit"`:""}>${s.task?`<span class="slabel">${esc(s.task)}</span> · `:""}<span class="stime">${short(s.start)}–${short(s.end)} · ${Math.round(hours(s.start,s.end)*60)}m (${fmtH(hours(s.start,s.end))})</span></div>`).join("")
    + (t.live?`<div class="sess livesess ${editable?"clickable":""}" ${editable?`data-hledit="${i}" title="Click to rename"`:""}>${t.live.task?esc(t.live.task)+" · ":""}${short(t.live.start)} – now… · ${Math.round(hours(t.live.start,hhmmss(new Date()))*60)}m</div>`:"");
  card.innerHTML = `<div class="hc-title">${esc(t.project||"Timeblocks")}</div>` +
    (sess || `<div class="sess" style="color:var(--ink-soft)">No timeblocks yet</div>`);
  card.classList.add("show");
  const rect = tr.getBoundingClientRect();
  const cw = card.offsetWidth, ch = card.offsetHeight;
  let top = rect.bottom + 6;
  if(top + ch > window.innerHeight - 10) top = rect.top - ch - 6;
  let left = Math.min(Math.max(rect.left + 120, 8), window.innerWidth - cw - 8);
  card.style.top = top+"px"; card.style.left = left+"px";
  card.querySelectorAll("[data-hsedit]").forEach(el=>el.onclick=()=>{
    const [a,b]=el.dataset.hsedit.split(":").map(Number); hideHoverCard(); openBlock(a,"edit",b);
  });
  card.querySelectorAll("[data-hledit]").forEach(el=>el.onclick=()=>{ hideHoverCard(); openBlock(+el.dataset.hledit,"rename"); });
}
function scheduleHideHoverCard(){ clearTimeout(_hcTimer); _hcTimer=setTimeout(hideHoverCard, 220); }
function hideHoverCard(){ clearTimeout(_hcTimer); $("hoverCard").classList.remove("show"); }
$("hoverCard").addEventListener("mouseenter", ()=>clearTimeout(_hcTimer));
$("hoverCard").addEventListener("mouseleave", scheduleHideHoverCard);
window.addEventListener("scroll", hideHoverCard, {passive:true});
window.addEventListener("resize", hideHoverCard)

function tick(){
  $("statClock").textContent = new Date().toTimeString().slice(0,5);
  if(!store) return;
  checkTimeReminders();
  const list = tasks();
  let dirty = false;
  list.forEach((t,i)=>{
    if(!t.live) return;
    const cell=document.querySelector(`[data-hours="${i}"] strong`);
    if(cell) cell.textContent=fmtH(taskHours(t));
    const lm=document.querySelector(`[data-livemin="${i}"]`);
    if(lm) lm.textContent = Math.round(hours(t.live.start,hhmmss(new Date()))*60)+"m";
    if(settings.remind && t.live.remind && t.live.nextRemind){
      const elapsedMin = hours(t.live.start, hhmmss(new Date()))*60;
      if(elapsedMin >= t.live.nextRemind){
        remindPing(t);
        t.live.nextRemind += t.live.remind;
        dirty = true;
      }
    }
  });
  if(dirty) save();
  if(pipWin) renderPip();
  if(list.some(t=>t.live)){
    const totalNum = list.reduce((a,t)=>a+taskHours(t),0);
    $("dayTotal").textContent = fmtH(totalNum);
    $("statHours").textContent = fmtH(totalNum);
    renderTarget(totalNum);
  }
}

/* ---------- pinned floating timer (Document Picture-in-Picture) ---------- */
let pipWin = null;
$("pinBtn").onclick = async ()=>{
  if(pipWin){ try{ pipWin.close(); }catch(e){} pipWin=null; return; }
  if(!("documentPictureInPicture" in window)){
    toast("Pinned popup needs Chrome or Edge (Document Picture-in-Picture)");
    return;
  }
  try{
    pipWin = await documentPictureInPicture.requestWindow({width:300, height:200});
  }catch(e){ toast("Could not open pinned popup"); return; }
  const d = pipWin.document;
  d.title = "LEDGER timer";
  const st = d.createElement("style");
  st.textContent = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#070b10;color:#dbe7f0;font-family:ui-monospace,Consolas,monospace;font-size:12px;padding:10px;
      background-image:linear-gradient(rgba(120,180,220,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(120,180,220,.05) 1px,transparent 1px);
      background-size:28px 28px}
    .card{background:rgba(16,22,30,.92);border:1px solid rgba(120,180,220,.22);border-radius:12px;padding:12px 14px;margin-bottom:8px;position:relative;overflow:hidden}
    .card::before{content:"";position:absolute;inset:0 0 auto 0;height:2px;background:linear-gradient(90deg,transparent,#38e1ff,transparent)}
    .task{font-weight:600;color:#f2f8fc;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .meta{color:#6d7f8f;font-size:10px;letter-spacing:.08em;text-transform:uppercase;margin:3px 0 8px}
    .row{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
    .time{font-size:26px;font-weight:700;color:#38e1ff;line-height:1}
    .time small{font-size:10px;color:#6d7f8f;font-weight:400;margin-left:4px}
    .stop{background:transparent;border:1px solid #ff5c69;color:#ff5c69;border-radius:8px;padding:5px 14px;cursor:pointer;font:inherit;font-size:11px;font-weight:600;letter-spacing:.05em}
    .stop:hover{background:#ff5c69;color:#fff}
    .none{color:#6d7f8f;text-align:center;padding:22px 0;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
  `;
  d.head.appendChild(st);
  d.body.innerHTML = '<div id="pipRoot"></div>';
  pipWin.addEventListener("pagehide", ()=>{ pipWin=null; });
  _lastPipHtml = "";
  renderPip();
};
let _lastPipHtml = "";
function renderPip(){
  if(!pipWin) return;
  const root = pipWin.document.getElementById("pipRoot");
  if(!root) return;
  const list = store ? (store.days[todayKey()]||[]) : [];
  const lives = list.map((t,i)=>({t,i})).filter(x=>x.t.live);
  const html = (lives.length ? lives.map(x=>{
    const mins = Math.round(hours(x.t.live.start, hhmmss(new Date()))*60);
    return `<div class="card">
      <div class="task">${esc(x.t.live.task||x.t.project||"Task")}</div>
      <div class="meta">${esc(x.t.project||"—")} · from ${x.t.live.start.slice(0,5)}</div>
      <div class="row">
        <div class="time">${mins}m<small>= ${fmtH(mins/60)} h</small></div>
        <button class="stop" data-pstop="${x.i}">■ STOP</button>
      </div>
    </div>`;
  }).join("") : '<div class="none">No timer running</div>');
  if(html === _lastPipHtml) return; // avoid rebuilding every second — only when minutes change
  _lastPipHtml = html;
  root.innerHTML = html;
  root.querySelectorAll("[data-pstop]").forEach(b=>b.onclick=()=>{
    const t = (store.days[todayKey()]||[])[+b.dataset.pstop];
    if(t && t.live){
      t.sessions.push({task:t.live.task, start:t.live.start, end:hhmmss(new Date())});
      t.live=null; save();
      if(viewDay===todayKey()) renderTable();
      renderPip();
    }
  });
}

/* ---------- add entry ---------- */
$("addBtn").onclick = ()=>{
  if(viewDay!==todayKey()){ toast("Switch to Today to add entries"); return; }
  const project=$("fProject").value.trim();
  if(!project){ $("fProject").focus(); return; }
  tasks().push(newEntry({brand:curBrand, project, task:"", status:$("fStatus").value}));
  const idx = tasks().length - 1;
  $("fProject").value=""; save(); render();
  // offer to start timing it straight away — Cancel just leaves it idle
  if(settings.askStart) openBlock(idx, "start");
};
$("fProject").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("addBtn").click();}});

/* ---------- copy for sheets ---------- */
function exportBlocks(t, liveEnd){ // finished sessions + the running timer clipped at now
  const blocks = t.sessions.slice();
  if(t.live) blocks.push({task:t.live.task, start:t.live.start, end:liveEnd});
  return blocks;
}
function exportHours(t, liveEnd){
  const blocks = exportBlocks(t, liveEnd);
  if(!blocks.length && t.manualHours!=null) return t.manualHours;
  return blocks.reduce((a,s)=>a+hours(s.start,s.end),0);
}
// every distinct block label on an entry, comma-joined — what a default task was spent on
function blockLabels(blocks){
  const seen = [];
  blocks.forEach(s=>{ const l=(s.task||"").trim(); if(l && !seen.includes(l)) seen.push(l); });
  return seen.join(", ");
}
// expandDefaults: preview-only view that also breaks default tasks into their blocks
function buildRows(expandDefaults){
  const list = tasks();
  const liveEnd = hhmmss(new Date());
  const rows=[], meta=[];
  for(const i of orderedIndices(list)){
    const t = list[i];
    t.sessions.sort((a,b)=>(toSec(a.start)??0)-(toSec(b.start)??0));
    const total = exportHours(t, liveEnd);
    if(total<=0) continue; // skip zero-hour entries
    const blocks = exportBlocks(t, liveEnd);
    const brandName = t.brand || "Default Task";
    const collapses = !t.brand || isDefaultEntry(t) || !blocks.length;
    if(collapses && !(expandDefaults && blocks.length)){
      // final value only — one row, task column lists every block label
      const desc = blockLabels(blocks) || t.task || "";
      rows.push([brandName, t.project, desc, "", "", fmtH(total), t.status]);
      meta.push({detail:false});
    } else {
      blocks.forEach((s,k)=>{
        rows.push([
          k===0 ? brandName : "", k===0 ? t.project : "",
          s.task || (k===0 ? t.task : ""),
          s.start, s.end, fmtH(hours(s.start,s.end)),
          k===0 ? t.status : ""
        ]);
        meta.push({detail:collapses});
      });
    }
  }
  return {rows, meta};
}
function copyRows(){
  const {rows} = buildRows(false); // clipboard always keeps default tasks collapsed
  if(!rows.length){ toast("Nothing to copy — no logged time yet"); return; }
  const tsv = rows.map(r=>r.join("\t")).join("\n");
  const liveNote = tasks().some(t=>t.live) ? " · running timer included up to now" : "";
  navigator.clipboard.writeText(tsv).then(
    ()=>toast(`Copied ${rows.length} row${rows.length>1?"s":""} — paste with Ctrl+Shift+V to keep the sheet's dropdowns${liveNote}`),
    ()=>{
      const ta=document.createElement("textarea"); ta.value=tsv; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); ta.remove(); toast("Copied — paste with Ctrl+Shift+V");
    });
}
$("copyBtn").onclick = copyRows;

/* ---------- time gaps ---------- */
const fmtMin = m => m>=60 ? `${Math.floor(m/60)}h ${Math.round(m%60)}m` : `${Math.round(m)}m`;
// distinct lane colours — red is reserved for gaps
const GANTT_COLORS = ["#38e1ff","#3ddc84","#ffc24b","#9d7bff","#ff5ce1","#5ea8ff","#ff9f45","#4de0c0","#c3e04d","#f78ab0"];
const secToHM = s => `${String(Math.floor(s/3600)%24).padStart(2,"0")}:${String(Math.floor(s%3600/60)).padStart(2,"0")}`;
$("gapsBtn").onclick = ()=>{
  const list = tasks();
  // gather all covered intervals (sessions + running timer)
  let iv = [];
  list.forEach(t=>{
    t.sessions.forEach(s=>{ const a=toSec(s.start), b=toSec(s.end); if(a!=null&&b!=null&&b>a) iv.push([a,b]); });
    if(t.live){ const a=toSec(t.live.start), b=toSec(hhmmss(new Date())); if(a!=null&&b>a) iv.push([a,b]); }
  });
  if(!iv.length){
    $("gapsSummary").innerHTML = "No timeblocks logged this day yet — nothing to audit.";
    $("gapsChart").innerHTML = ""; $("gapsTable").innerHTML = "";
    $("gapsOverlay").classList.add("show");
    return;
  }
  iv.sort((a,b)=>a[0]-b[0]);
  const merged = [iv[0].slice()];
  for(const [a,b] of iv.slice(1)){
    const last = merged[merged.length-1];
    if(a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a,b]);
  }
  const dayStart = merged[0][0];
  // end of window: now for today, last block end for a past day
  const dayEnd = viewDay===todayKey() ? Math.max(toSec(hhmmss(new Date())), merged[merged.length-1][1]) : merged[merged.length-1][1];
  const span = Math.max(1, dayEnd - dayStart);
  // gaps = complement inside [dayStart, dayEnd]
  const gaps = [];
  let cursor = dayStart;
  for(const [a,b] of merged){
    if(a > cursor) gaps.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if(cursor < dayEnd) gaps.push([cursor, dayEnd]);
  const realGaps = gaps.filter(([a,b])=>b-a >= 60); // ignore sub-minute noise
  const gapSec = realGaps.reduce((x,[a,b])=>x+(b-a),0);
  const covPct = Math.round((span-gapSec)/span*100);
  $("gapsSummary").innerHTML =
    `Window <b>${secToHM(dayStart)} → ${secToHM(dayEnd)}</b> (${fmtMin(span/60)}) · ` +
    `coverage <span class="cov-pct">${covPct}%</span> · ` +
    (realGaps.length ? `<span class="gap-dur">${realGaps.length} gap${realGaps.length>1?"s":""} · ${fmtMin(gapSec/60)} untracked</span>` : `<span class="cov-pct">no gaps — fully tracked ✓</span>`);
  // ---- single-track gantt: every block on one bar, one colour per task ----
  const pos = s => (s-dayStart)/span*100;
  const liveNow = hhmmss(new Date());
  let ticks = "", axis = "";
  for(let s = Math.ceil(dayStart/3600)*3600; s < dayEnd; s += 3600){
    ticks += `<div class="tick" style="left:${pos(s)}%"></div>`;
    axis  += `<span class="atick" style="left:${pos(s)}%">${secToHM(s)}</span>`;
  }
  // collect every block, tagged with its entry's colour
  const items = [];
  const legend = [];
  let c = 0;
  orderedIndices(list).forEach(i=>{
    const t = list[i];
    const blocks = t.sessions.map((s,si)=>({lbl:s.task, a:toSec(s.start), b:toSec(s.end), live:false, si}))
      .concat(t.live ? [{lbl:t.live.task, a:toSec(t.live.start), b:toSec(liveNow), live:true, si:-1}] : [])
      .filter(b=>b.a!=null && b.b>b.a);
    if(!blocks.length) return;
    const col = GANTT_COLORS[c++ % GANTT_COLORS.length];
    const mins = Math.round(blocks.reduce((a,b)=>a+(b.b-b.a),0)/60);
    legend.push({col, project:t.project||t.brand||"—", mins});
    blocks.forEach(b=>items.push(Object.assign({col, project:t.project, brand:t.brand, ti:i}, b)));
  });
  // greedy stacking so overlapping blocks stay visible without leaving the single track
  items.sort((x,y)=>x.a-y.a);
  const laneEnds = [];
  items.forEach(it=>{
    let ln = laneEnds.findIndex(e=>e<=it.a);
    if(ln<0){ ln = laneEnds.length; laneEnds.push(0); }
    laneEnds[ln] = it.b;
    it.lane = ln;
  });
  const lanes = Math.max(1, laneEnds.length);
  const laneH = 100/lanes;
  const blkHtml = items.map(it=>{
    const tip = `${it.project||it.brand||"Task"}${it.lbl?" — "+it.lbl:""}\n${secToHM(it.a)} – ${secToHM(it.b)}${it.live?" (running)":""} · ${fmtMin((it.b-it.a)/60)}
Click to edit this block`;
    return `<div class="gblk gclick ${it.live?"livegblk":""}" data-gedit="${it.ti}:${it.si}" title="${esc(tip)}" style="left:${pos(it.a)}%;width:${Math.max(0.35,(it.b-it.a)/span*100)}%;background:${it.col};top:calc(${it.lane*laneH}% + 3px);height:calc(${laneH}% - 6px)"><span class="gtxt">${esc(it.lbl||it.project||"")}</span></div>`;
  }).join("");
  const gapHtml = realGaps.map(([a,b])=>
    `<div class="gblk gapblk" title="${esc(`Untracked gap\n${secToHM(a)} – ${secToHM(b)} · ${fmtMin((b-a)/60)}`)}" style="left:${pos(a)}%;width:${Math.max(0.35,(b-a)/span*100)}%;top:3px;bottom:3px"><span class="gtxt">${(b-a)>=1200?fmtMin((b-a)/60):""}</span></div>`).join("");
  $("gapsChart").innerHTML =
    `<div class="gtrack">${ticks}${gapHtml}${blkHtml}</div>` +
    `<div class="gaxisrow">${axis}</div>`;
  // clicking a block on the chart edits (or renames, if running) that timeblock
  $("gapsChart").querySelectorAll("[data-gedit]").forEach(el=>el.onclick=()=>{
    const [ti,si] = el.dataset.gedit.split(":").map(Number);
    gapsReturn = true;
    if(si < 0) openBlock(ti, "rename");
    else openBlock(ti, "edit", si);
  });
  $("gapsLegend").innerHTML = legend.map(l=>
    `<span class="lgitem"><span class="gdot" style="background:${l.col}"></span><b>${esc(l.project)}</b> ${fmtMin(l.mins)}</span>`).join("") +
    (realGaps.length?`<span class="lgitem"><span class="gdot" style="background:repeating-linear-gradient(-45deg,var(--red) 0 3px,transparent 3px 6px);box-shadow:inset 0 0 0 1px var(--red)"></span><b>Gaps</b> ${fmtMin(gapSec/60)}</span>`:"");
  // gap list
  const canAssign = viewDay===todayKey();
  $("gapsTable").innerHTML = `<tr><th>#</th><th>From</th><th>To</th><th>Length</th>${canAssign?"<th></th>":""}</tr>` +
    (realGaps.length
      ? realGaps.map(([a,b],k)=>`<tr><td>${k+1}</td><td>${secToHM(a)}</td><td>${secToHM(b)}</td><td class="gap-dur">${fmtMin((b-a)/60)}</td>${canAssign?`<td><button type="button" class="icon-btn" data-assign="${a}:${b}">→ assign</button></td>`:""}</tr>`).join("")
      : `<tr><td colspan="${canAssign?5:4}" style="color:var(--ink-soft)">Every minute between your first block and ${viewDay===todayKey()?"now":"the last block"} is tracked.</td></tr>`);
  $("gapsTable").querySelectorAll("[data-assign]").forEach(el=>el.onclick=()=>{
    const [a,b] = el.dataset.assign.split(":").map(Number);
    openAssign(a,b);
  });
  $("gapsOverlay").classList.add("show");
};
$("gapsClose").onclick = ()=>$("gapsOverlay").classList.remove("show");
const secToHMS = s => `${String(Math.floor(s/3600)%24).padStart(2,"0")}:${String(Math.floor(s%3600/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;
function openAssign(aSec,bSec){
  const list = tasks();
  // nothing preselected — the gap must be assigned deliberately
  $("aEntry").innerHTML = `<option value="" selected disabled>— choose a task —</option>` +
    orderedIndices(list).map(i=>{
      const t=list[i];
      return `<option value="${i}">${esc(t.brand||"Default Task")} · ${esc(t.project||"—")}</option>`;
    }).join("");
  $("aEntry").value = "";
  $("aTask").value = "";
  $("aStart").value = secToHMS(aSec);
  $("aEnd").value = secToHMS(bSec);
  $("aErr").textContent = "";
  $("assignOverlay").classList.add("show");
  setTimeout(()=>$("aEntry").focus(),30);
}
$("aCancel").onclick = ()=>$("assignOverlay").classList.remove("show");
$("assignOverlay").addEventListener("mousedown", e=>{ if(e.target===$("assignOverlay")) $("assignOverlay").classList.remove("show"); });
$("assignModal").addEventListener("submit", e=>{
  e.preventDefault();
  const pick = $("aEntry").value;
  if(pick===""){ $("aErr").textContent="Choose which task this gap belongs to."; $("aEntry").focus(); return; }
  const t = tasks()[+pick];
  if(!t) return;
  const st=$("aStart").value, en=$("aEnd").value;
  if(!validT(st)||!validT(en)){ $("aErr").textContent="Times must be HH:MM (or HH:MM:SS)."; return; }
  t.sessions.push({task:$("aTask").value.trim(), start:norm(st), end:norm(en)});
  save(); renderTable();
  $("assignOverlay").classList.remove("show");
  toast("Gap assigned");
  $("gapsBtn").click(); // refresh the audit
});
$("gapsOverlay").addEventListener("mousedown", e=>{ if(e.target===$("gapsOverlay")) $("gapsOverlay").classList.remove("show"); });

/* ---------- export preview ---------- */
let prevExpand = false;
function renderPreview(){
  const {rows, meta} = buildRows(prevExpand);
  const head = ["Brand","Project","Task","Start","End","Hours","Status"];
  const total = rows.reduce((a,r)=>a+(parseFloat(r[5])||0),0);
  $("prevTable").innerHTML =
    "<tr>"+head.map(h=>`<th>${h}</th>`).join("")+"</tr>" +
    (rows.length
      ? rows.map((r,k)=>`<tr class="${meta[k].detail?"detailrow":""}">`+r.map(c=>`<td>${esc(c)||""}</td>`).join("")+"</tr>").join("")
      : `<tr><td colspan="7" style="color:var(--ink-soft)">Nothing to export yet — no logged time.</td></tr>`);
  $("prevMeta").innerHTML = rows.length
    ? `${rows.length} row${rows.length>1?"s":""} · ${fmtH(total)} h` +
      (prevExpand ? ` · <span class="detailnote">shaded rows are detail only — the clipboard still sends one total row per default task</span>` : "")
    : "";
  $("prevExpandSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on",(b.dataset.px==="1")===prevExpand));
}
$("previewBtn").onclick = ()=>{ renderPreview(); $("prevOverlay").classList.add("show"); };
$("prevExpandSeg").addEventListener("click", e=>{
  if(e.target.dataset.px===undefined) return;
  prevExpand = e.target.dataset.px==="1";
  renderPreview();
});
$("prevClose").onclick = ()=>$("prevOverlay").classList.remove("show");
$("prevCopy").onclick = ()=>{ copyRows(); $("prevOverlay").classList.remove("show"); };
$("prevOverlay").addEventListener("mousedown", e=>{ if(e.target===$("prevOverlay")) $("prevOverlay").classList.remove("show"); });


/* ============================================================
   PAGES — dashboard, table, day sheet, routines
   ============================================================ */
const BRAND_HEX = {"":"#8b98a6", KN:"#ffc24b", ZW:"#a7b2bd", RW:"#3ddc84", AUJ:"#ff5c69", SV:"#5ea8ff", BM:"#9d7bff"};
const brandHex = v => BRAND_HEX[v||""] || "#8b98a6";
const brandLabel = v => (BRANDS.find(b=>b.v===(v||""))||BRANDS[0]).label;

let curPage = "timesheet";
let ranges = {dashboard:"today", table:"today", sheet:"week"};

/* ---------- range helpers ---------- */
function shiftDays(key, n){
  const d = new Date(key+"T12:00:00");
  d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}
function rangeKeys(kind){
  const today = todayKey();
  const stored = Object.keys(store.days).sort();
  if(kind==="today") return [today];
  if(kind==="all")   return stored.length ? stored : [today];
  const from = kind==="week" ? shiftDays(today,-6)
             : kind==="month" ? shiftDays(today,-29)
             : shiftDays(today,-364);
  const keys = stored.filter(k=>k>=from && k<=today);
  if(!keys.includes(today)) keys.push(today);
  return keys.sort();
}
function rangeLabel(kind){
  const keys = rangeKeys(kind);
  if(kind==="today") return "Today · " + fmtDate(todayKey());
  const first = keys[0], last = keys[keys.length-1];
  const span = {week:"Last 7 days", month:"Last 30 days", year:"Last 12 months", all:"All time"}[kind];
  return span + " · " + fmtDate(first) + " → " + fmtDate(last) + " · " + keys.length + " day" + (keys.length>1?"s":"");
}

/* ---------- data shaping ---------- */
// every logged block on a day, flattened; a running timer counts up to now
function dayBlocks(key){
  const list = store.days[key] || [];
  const out = [];
  const liveEnd = hhmmss(new Date());
  list.forEach(t=>{
    const base = {day:key, brand:t.brand||"", project:t.project||"", status:t.status||"", def:isDefaultEntry(t)};
    (t.sessions||[]).forEach(s=>{
      const m = hours(s.start,s.end)*60;
      if(m>0) out.push(Object.assign({}, base, {task:s.task||t.task||"", start:s.start, end:s.end, mins:m, live:false}));
    });
    if(t.live && key===todayKey()){
      const m = hours(t.live.start, liveEnd)*60;
      if(m>0) out.push(Object.assign({}, base, {task:t.live.task||t.task||"", start:t.live.start, end:liveEnd, mins:m, live:true}));
    }
    if(!(t.sessions||[]).length && !t.live && t.manualHours>0){
      out.push(Object.assign({}, base, {task:t.task||"", start:"", end:"", mins:t.manualHours*60, live:false}));
    }
  });
  return out;
}
function rangeBlocks(kind){ return rangeKeys(kind).flatMap(dayBlocks); }
function sumBy(blocks, keyFn){
  const m = new Map();
  blocks.forEach(b=>{ const k = keyFn(b); m.set(k, (m.get(k)||0) + b.mins); });
  return [...m.entries()].sort((a,b)=>b[1]-a[1]);
}
const asHrs = m => fmtH(m/60);

/* ---------- routing ---------- */
function showPage(page){
  curPage = page;
  ["timesheet","dashboard","table","sheet","routines"].forEach(p=>{
    const el = $("page" + p.charAt(0).toUpperCase() + p.slice(1));
    if(el) el.hidden = (p !== page);
  });
  $("pageNav").querySelectorAll(".navtab").forEach(b=>b.classList.toggle("active", b.dataset.page===page));
  if(page==="dashboard") renderDashboard();
  if(page==="table")     renderFlatTable();
  if(page==="sheet")     renderDaySheet();
  if(page==="routines")  renderRoutines();
}
$("pageNav").addEventListener("click", e=>{ const b=e.target.closest(".navtab"); if(b) showPage(b.dataset.page); });
[["rangeSeg","dashboard",()=>renderDashboard()],["tblRangeSeg","table",()=>renderFlatTable()],["shtRangeSeg","sheet",()=>renderDaySheet()]]
.forEach(function(cfg){
  const id=cfg[0], page=cfg[1], fn=cfg[2];
  $(id).addEventListener("click", e=>{
    if(!e.target.dataset.rg) return;
    ranges[page] = e.target.dataset.rg;
    fn();
  });
});
function syncRangeSeg(id, page){
  $(id).querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.rg===ranges[page]));
}

/* ---------- dashboard ---------- */
let donutMode = "brand";
$("donutModeSeg").addEventListener("click", e=>{
  if(!e.target.dataset.dm) return;
  donutMode = e.target.dataset.dm;
  renderDashboard();
});
function renderDashboard(){
  if(!store) return;
  const kind = ranges.dashboard;
  syncRangeSeg("rangeSeg","dashboard");
  $("donutModeSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.dm===donutMode));
  $("rangeNote").textContent = rangeLabel(kind);

  const keys = rangeKeys(kind);
  const blocks = rangeBlocks(kind);
  const total = blocks.reduce((a,b)=>a+b.mins,0);
  const workedDays = keys.filter(k=>dayBlocks(k).length).length;

  $("kpiTotal").textContent = asHrs(total);
  $("kpiTotalSub").textContent = blocks.length + " block" + (blocks.length===1?"":"s") + " · " + workedDays + " day" + (workedDays===1?"":"s") + " worked";
  $("kpiAvg").textContent = workedDays ? asHrs(total/workedDays) : "0.00";
  $("kpiAvgSub").textContent = workedDays ? "per worked day" : "nothing logged yet";
  const byBrand = sumBy(blocks, b=>b.brand);
  $("kpiTop").textContent = byBrand.length ? brandLabel(byBrand[0][0]) : "—";
  $("kpiTopSub").textContent = byBrand.length ? asHrs(byBrand[0][1]) + " h · " + Math.round(byBrand[0][1]/total*100) + "%" : "—";
  const defMins = blocks.filter(b=>b.def || !b.brand).reduce((a,b)=>a+b.mins,0);
  const cliMins = total - defMins;
  $("kpiSplit").textContent = total ? Math.round(cliMins/total*100) + "% / " + Math.round(defMins/total*100) + "%" : "—";
  $("kpiSplitSub").textContent = total ? asHrs(cliMins) + " client · " + asHrs(defMins) + " default" : "—";

  const rows = donutMode==="brand"
    ? byBrand.map(function(e){ return {key:e[0], name:brandLabel(e[0]), mins:e[1], col:brandHex(e[0])}; })
    : sumBy(blocks, b=>(b.brand?brandLabel(b.brand)+" · ":"")+(b.project||"—"))
        .map(function(e,i){ return {key:e[0], name:e[0], mins:e[1], col:GANTT_COLORS[i%GANTT_COLORS.length]}; });
  $("donutSub").textContent = donutMode==="brand" ? "by brand" : "by project";
  $("donutTotal").textContent = asHrs(total);
  const svg = $("donutSvg");
  if(!total){
    svg.innerHTML = '<circle cx="21" cy="21" r="15.9155" stroke="var(--line)"></circle>';
    $("donutLegend").innerHTML = '<div class="emptycard">No time logged in this range yet.</div>';
  } else {
    let acc = 0;
    svg.innerHTML = '<circle cx="21" cy="21" r="15.9155" stroke="var(--panel-2)"></circle>' +
      rows.map(function(r){
        const pct = r.mins/total*100;
        const seg = '<circle class="seg" cx="21" cy="21" r="15.9155" stroke="' + r.col + '"' +
          ' stroke-dasharray="' + pct.toFixed(3) + ' ' + (100-pct).toFixed(3) + '"' +
          ' stroke-dashoffset="' + (100 - acc + 25).toFixed(3) + '">' +
          '<title>' + esc(r.name) + ' — ' + asHrs(r.mins) + ' h</title></circle>';
        acc += pct;
        return seg;
      }).join("");
    $("donutLegend").innerHTML = rows.slice(0,9).map(function(r){
      return '<div class="lgrow"><span class="sw" style="background:' + r.col + '"></span>' +
        '<span class="nm">' + esc(r.name) + '</span>' +
        '<span class="hr">' + asHrs(r.mins) + 'h</span>' +
        '<span class="pc">' + (r.mins/total*100).toFixed(1) + '%</span></div>';
    }).join("");
  }

  const barKeys = kind==="today" ? [todayKey()] : keys.slice(-31);
  const perDay = barKeys.map(k=>({k:k, blocks:dayBlocks(k)}));
  const maxDay = Math.max.apply(null, [1].concat(perDay.map(d=>d.blocks.reduce((a,b)=>a+b.mins,0))));
  $("barsSub").textContent = barKeys.length + " day" + (barKeys.length>1?"s":"") + " · peak " + asHrs(maxDay) + " h";
  $("dayBars").innerHTML = perDay.length ? perDay.map(function(d){
    const t = d.blocks.reduce((a,b)=>a+b.mins,0);
    const inner = sumBy(d.blocks, b=>b.brand).map(function(e){
      return '<i style="width:' + (e[1]/Math.max(t,1)*100).toFixed(2) + '%;background:' + brandHex(e[0]) + '" title="' + esc(brandLabel(e[0])) + ' ' + asHrs(e[1]) + 'h"></i>';
    }).join("");
    return '<div class="dbrow ' + (d.k===todayKey()?"istoday":"") + '">' +
      '<span class="dbd">' + fmtDate(d.k) + '</span>' +
      '<span class="dbt"><span class="dbf" style="width:' + (t/maxDay*100).toFixed(2) + '%">' + inner + '</span></span>' +
      '<span class="dbv">' + (t?asHrs(t):"—") + '</span></div>';
  }).join("") : '<div class="emptycard">Nothing logged yet.</div>';

  const byProj = sumBy(blocks, b=>JSON.stringify([b.brand, b.project||"—"]));
  const maxProj = byProj.length ? byProj[0][1] : 1;
  $("projRank").innerHTML = byProj.length ? byProj.slice(0,14).map(function(e){
    const parts = JSON.parse(e[0]), br = parts[0], pr = parts[1], m = e[1];
    return '<div class="rkrow">' +
      '<span class="bpill ' + brandCls(br) + '">' + esc(brandLabel(br)) + '</span>' +
      '<span class="rkp">' + esc(pr) + '</span>' +
      '<span class="rkbar"><i style="width:' + (m/maxProj*100).toFixed(2) + '%;background:' + brandHex(br) + '"></i></span>' +
      '<span class="rkh">' + asHrs(m) + ' h</span>' +
      '<span class="rkpc">' + (m/total*100).toFixed(0) + '%</span></div>';
  }).join("") : '<div class="emptycard">No projects in this range.</div>';
}

/* ---------- flat table ---------- */
$("tblSearch").addEventListener("input", ()=>renderFlatTable());
function flatRows(){
  const q = $("tblSearch").value.trim().toLowerCase();
  let rows = rangeBlocks(ranges.table);
  if(q) rows = rows.filter(b=>[b.brand,b.project,b.task,b.status].join(" ").toLowerCase().includes(q));
  return rows.sort((a,b)=> a.day===b.day ? (toSec(a.start||"00:00:00")-toSec(b.start||"00:00:00")) : (a.day<b.day?1:-1));
}
function renderFlatTable(){
  if(!store) return;
  syncRangeSeg("tblRangeSeg","table");
  const rows = flatRows();
  const total = rows.reduce((a,b)=>a+b.mins,0);
  $("flatBody").innerHTML = rows.length ? rows.map(function(b){
    return '<tr>' +
      '<td class="mono">' + fmtDate(b.day) + '</td>' +
      '<td><span class="bpill ' + brandCls(b.brand) + '">' + esc(brandLabel(b.brand)) + '</span></td>' +
      '<td class="projcell">' + (esc(b.project) || "—") + '</td>' +
      '<td class="taskdesc">' + (esc(b.task) || "—") + (b.live ? ' <span class="livehint" style="display:inline">● REC</span>' : "") + '</td>' +
      '<td class="mono">' + (b.start ? short(b.start) + "–" + short(b.end) : '<span style="opacity:.4">manual</span>') + '</td>' +
      '<td class="num mono">' + Math.round(b.mins) + '</td>' +
      '<td class="num mono">' + asHrs(b.mins) + '</td>' +
      '<td><span class="status-sel ' + (STATUSES[b.status]||"") + '">' + (esc(b.status)||"—") + '</span></td>' +
      '</tr>';
  }).join("") : '<tr><td colspan="8"><div class="emptycard">No blocks match this range or filter.</div></td></tr>';
  $("flatTotal").textContent = asHrs(total);
  $("flatCount").textContent = rows.length + " block" + (rows.length===1?"":"s") + " · " + rangeLabel(ranges.table);
}
$("tblCopy").onclick = ()=>{
  const rows = flatRows();
  if(!rows.length){ toast("Nothing to copy"); return; }
  const head = ["Date","Brand","Project","Task","Start","End","Minutes","Hours","Status"].join("\t");
  const body = rows.map(b=>[b.day, b.brand||"Default Task", b.project, b.task, b.start, b.end, Math.round(b.mins), asHrs(b.mins), b.status].join("\t"));
  navigator.clipboard.writeText([head].concat(body).join("\n"))
    .then(()=>toast("Copied " + rows.length + " rows"), ()=>toast("Copy failed"));
};

/* ---------- day sheet ---------- */
function renderDaySheet(){
  if(!store) return;
  syncRangeSeg("shtRangeSeg","sheet");
  const keys = rangeKeys(ranges.sheet).filter(k=>dayBlocks(k).length || k===todayKey()).reverse();
  $("shtNote").textContent = rangeLabel(ranges.sheet);
  const cols = [...new Set(rangeBlocks(ranges.sheet).map(b=>b.brand))]
    .sort((a,b)=> (a===""?-1:b===""?1:a.localeCompare(b)));
  if(!cols.length) cols.push("");
  $("daySheetHead").innerHTML = '<tr><th>Day</th>' + cols.map(c=>'<th>' + esc(brandLabel(c)) + '</th>').join("") + '<th>Total</th></tr>';
  const colTotals = cols.map(()=>0);
  let grand = 0;
  $("daySheetBody").innerHTML = keys.length ? keys.map(function(k){
    const blocks = dayBlocks(k);
    const dayTotal = blocks.reduce((a,b)=>a+b.mins,0);
    grand += dayTotal;
    const cells = cols.map(function(c,i){
      const m = blocks.filter(b=>b.brand===c).reduce((a,b)=>a+b.mins,0);
      colTotals[i] += m;
      const share = dayTotal ? m/dayTotal : 0;
      return m ? '<td class="cellbar" style="color:' + brandHex(c) + ';--w:' + share.toFixed(3) + '">' + asHrs(m) + '</td>'
               : '<td class="zero">·</td>';
    }).join("");
    return '<tr><td class="dsheet-day" data-openday="' + k + '" title="Open this day on the timesheet">' +
      fmtDate(k) + (k===todayKey()?" · today":"") + '</td>' + cells +
      '<td><strong>' + (dayTotal?asHrs(dayTotal):"—") + '</strong></td></tr>';
  }).join("") : '<tr><td colspan="' + (cols.length+2) + '"><div class="emptycard">No days logged in this range.</div></td></tr>';
  $("daySheetFoot").innerHTML = '<tr><td>Total</td>' + colTotals.map(m=>'<td>' + (m?asHrs(m):"—") + '</td>').join("") + '<td>' + (grand?asHrs(grand):"—") + '</td></tr>';
  $("daySheetBody").querySelectorAll("[data-openday]").forEach(el=>el.onclick=()=>{
    const k = el.dataset.openday;
    if(!store.days[k]) return;
    viewDay = k; showPage("timesheet"); render();
  });
}
$("shtCopy").onclick = ()=>{
  const grid = [...$("daySheet").querySelectorAll("tr")]
    .map(tr=>[...tr.children].map(td=>td.textContent.trim().replace(/·/g,"")).join("\t")).join("\n");
  navigator.clipboard.writeText(grid).then(()=>toast("Grid copied"), ()=>toast("Copy failed"));
};

/* ---------- routines: the repeating tasks seeded into each new day ---------- */
function routines(){
  if(!store.routines){
    store.routines = DEFAULT_ENTRIES.map(d=>({brand:"", project:d.project, task:d.task, status:"In Progress", on:true}));
    save();
  }
  return store.routines;
}
let rtBrand = "";
function buildRtBrandMenu(){
  $("rtBrandMenu").innerHTML = BRANDS.map(b=>
    '<button type="button" class="branddd-item" data-b="' + b.v + '"><span class="bpill ' + b.cls + '">' + b.label + '</span></button>').join("");
  $("rtBrandMenu").querySelectorAll(".branddd-item").forEach(el=>el.onclick=()=>{
    rtBrand = el.dataset.b;
    const b = BRANDS.find(x=>x.v===rtBrand)||BRANDS[0];
    $("rtBrandCur").innerHTML = '<span class="bpill ' + b.cls + '">' + b.label + '</span>';
    $("rtBrandDD").classList.remove("open");
  });
}
$("rtBrandBtn").onclick = e=>{ e.stopPropagation(); $("rtBrandDD").classList.toggle("open"); };
document.addEventListener("click", e=>{ if(!$("rtBrandDD").contains(e.target)) $("rtBrandDD").classList.remove("open"); });
function renderRoutines(){
  if(!store) return;
  const list = routines();
  $("routineBody").innerHTML = list.length ? list.map(function(r,i){
    return '<tr class="' + (r.on?"":"rtoff") + '">' +
      '<td><div class="rtorder">' +
        '<button class="icon-btn" data-rup="' + i + '" ' + (i===0?"disabled":"") + ' title="Move up">↑</button>' +
        '<button class="icon-btn" data-rdn="' + i + '" ' + (i===list.length-1?"disabled":"") + ' title="Move down">↓</button>' +
      '</div></td>' +
      '<td><span class="bpill ' + brandCls(r.brand) + '">' + esc(brandLabel(r.brand)) + '</span></td>' +
      '<td class="projcell">' + esc(r.project) + '</td>' +
      '<td class="taskdesc">' + (esc(r.task) || '<span style="opacity:.4">—</span>') + '</td>' +
      '<td><span class="status-sel ' + (STATUSES[r.status]||"") + '">' + esc(r.status) + '</span></td>' +
      '<td><div class="rowbtns">' +
        '<button class="icon-btn" data-rtoggle="' + i + '">' + (r.on?"on":"off") + '</button>' +
        '<button class="icon-btn" data-rtedit="' + i + '" title="Rename">✎</button>' +
        '<button class="icon-btn" data-rtdel="' + i + '" title="Delete">✕</button>' +
      '</div></td></tr>';
  }).join("") : '<tr><td colspan="6"><div class="emptycard">No routines — add one above and it will appear every day.</div></td></tr>';
  $("routineCount").textContent = list.filter(r=>r.on).length + " active of " + list.length;
  const body = $("routineBody");
  const swap = (a,b)=>{ const l=routines(); const t=l[a]; l[a]=l[b]; l[b]=t; save(); renderRoutines(); };
  body.querySelectorAll("[data-rup]").forEach(el=>el.onclick=()=>swap(+el.dataset.rup, +el.dataset.rup-1));
  body.querySelectorAll("[data-rdn]").forEach(el=>el.onclick=()=>swap(+el.dataset.rdn, +el.dataset.rdn+1));
  body.querySelectorAll("[data-rtoggle]").forEach(el=>el.onclick=()=>{
    const l=routines(); l[+el.dataset.rtoggle].on = !l[+el.dataset.rtoggle].on; save(); renderRoutines();
  });
  body.querySelectorAll("[data-rtdel]").forEach(el=>el.onclick=()=>{
    const l=routines(), i=+el.dataset.rtdel;
    if(confirm('Remove "' + l[i].project + '" from every day?')){ l.splice(i,1); save(); renderRoutines(); }
  });
  body.querySelectorAll("[data-rtedit]").forEach(el=>el.onclick=()=>{
    const l=routines(), r=l[+el.dataset.rtedit];
    const p = prompt("Project name", r.project); if(p===null) return;
    const n = prompt("Note (optional)", r.task); if(n===null) return;
    r.project = p.trim() || r.project; r.task = n.trim();
    save(); renderRoutines();
  });
}
$("rtAdd").onclick = ()=>{
  const p = $("rtProject").value.trim();
  if(!p){ $("rtProject").focus(); return; }
  routines().push({brand:rtBrand, project:p, task:$("rtTask").value.trim(), status:$("rtStatus").value, on:true});
  $("rtProject").value=""; $("rtTask").value="";
  save(); renderRoutines();
  toast("Routine added — it will appear each new day");
};
$("routineReset").onclick = ()=>{
  if(!confirm("Restore Meeting, Discussions, Upskilling and Research?")) return;
  store.routines = DEFAULT_ENTRIES.map(d=>({brand:"", project:d.project, task:d.task, status:"In Progress", on:true}));
  save(); renderRoutines();
};
// add any routine missing from today, without disturbing what is already there
$("routineApply").onclick = ()=>{
  const list = tasks();
  const have = new Set(list.map(t=>(t.brand||"") + "::" + (t.project||"").trim().toLowerCase()));
  let added = 0;
  routines().filter(r=>r.on).forEach(r=>{
    if(have.has((r.brand||"") + "::" + r.project.trim().toLowerCase())) return;
    list.push(newEntry({brand:r.brand, project:r.project, task:r.task, status:r.status, isDefault:!r.brand}));
    added++;
  });
  save(); render();
  toast(added ? added + " routine" + (added>1?"s":"") + " added to today" : "Today already has them all");
};

/* ---------- boot ---------- */
const sessName = sessionStorage.getItem("ledger.session");
if(sessName) enter(sessName);
(function bootSequence(){
  document.body.classList.add("booting");
  const LINES = [
    ["> mounting /ledger/core", "OK"],
    ["> loading timeblocks.db", "OK"],
    ["> linking sheets.exporter", "OK"],
    ["> auth.vault :: local", "OK"],
    ["> ui.render_engine", "READY"],
  ];
  const term = $("bootTerm"), fill = $("bootFill");
  let i = 0;
  function step(){
    if(i < LINES.length){
      const [txt, res] = LINES[i];
      term.innerHTML = term.innerHTML.replace(/<span class="cursor"><\/span>$/,"") +
        esc(txt).padEnd(34,".").replace(/\./g,'<span style="opacity:.35">.</span>') +
        ` <span class="${res==="OK"?"ok":"val"}">[${res}]</span>\n<span class="cursor"></span>`;
      i++;
      fill.style.width = Math.round(i/LINES.length*100) + "%";
      setTimeout(step, 110 + Math.random()*130);
    } else {
      setTimeout(()=>{ $("boot").classList.add("hide"); document.body.classList.remove("booting"); }, 260);
      setTimeout(()=>{ const b=$("boot"); if(b) b.remove(); }, 900);
    }
  }
  step();
})();
