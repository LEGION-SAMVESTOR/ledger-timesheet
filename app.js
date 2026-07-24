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
];
const DEFAULT_ENTRIES = [
  {project:"Meeting",     task:"FNR, Other Meetings"},
  {project:"Discussions", task:""},
  {project:"Upskilling",  task:""},
  {project:"Research",    task:""},
];
const DEFAULT_ORDER = DEFAULT_ENTRIES.map(d=>d.project);
const DEFAULT_NAMES = DEFAULT_ORDER.map(p=>p.toLowerCase());
// a Default-Task-brand entry named like a default counts as one, flag or not
const isDefaultEntry = t => !!t.isDefault || (!t.brand && DEFAULT_NAMES.includes((t.project||"").trim().toLowerCase()));
const defaultRank = t => {
  const i = DEFAULT_NAMES.indexOf((t.project||"").trim().toLowerCase());
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
const SET_DEFAULTS = {theme:"dark", accent:"cyan", font:"mono", fsize:"m", density:"comfy", seed:true, remind:true, remindMins:30, target:8};
let settings = Object.assign({}, SET_DEFAULTS, JSON.parse(localStorage.getItem(LS_SET) || "{}"));
function saveSettings(){ localStorage.setItem(LS_SET, JSON.stringify(settings)); applySettings(); }
function applySettings(){
  const de = document.documentElement;
  de.dataset.theme = settings.theme;
  de.dataset.accent = settings.accent;
  de.dataset.font = settings.font;
  de.dataset.fsize = settings.fsize;
  de.dataset.density = settings.density;
  $("densitySeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.dn===settings.density));
  $("themeSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.th===settings.theme));
  $("fontSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.fn===settings.font));
  $("sizeSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.fs===settings.fsize));
  $("accentDots").querySelectorAll(".dot").forEach(b=>b.classList.toggle("on", b.dataset.ac===settings.accent));
  $("seedSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", (b.dataset.sd==="1")===!!settings.seed));
  $("remindSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on", (b.dataset.rm==="1")===!!settings.remind));
  if(document.activeElement!==$("remindMins")) $("remindMins").value = settings.remindMins;
  if(document.activeElement!==$("targetHrs")) $("targetHrs").value = settings.target;
}
$("targetHrs") && $("targetHrs").addEventListener("change", ()=>{
  const v = parseFloat($("targetHrs").value);
  if(v>0){ settings.target=v; saveSettings(); if(store) renderTable(); } else applySettings();
});
$("themeSeg").addEventListener("click", e=>{ if(e.target.dataset.th){ settings.theme=e.target.dataset.th; saveSettings(); }});
$("fontSeg").addEventListener("click", e=>{ if(e.target.dataset.fn){ settings.font=e.target.dataset.fn; saveSettings(); }});
$("sizeSeg").addEventListener("click", e=>{ if(e.target.dataset.fs){ settings.fsize=e.target.dataset.fs; saveSettings(); }});
$("densitySeg").addEventListener("click", e=>{ if(e.target.dataset.dn){ settings.density=e.target.dataset.dn; saveSettings(); if(store) renderTable(); }});
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
applySettings();

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

/* ---------- storage ---------- */
let user=null, store=null, viewDay=null, curBrand="";
const dataKey = () => "ledger.data." + user;
function newEntry(o){ return Object.assign({brand:"",project:"",task:"",status:"Done",sessions:[],live:null,manualHours:null,isDefault:false}, o); }
function migrate(){
  for(const day of Object.values(store.days)){
    for(const t of day){
      if(t.manualHours===undefined) t.manualHours=null;
      if(t.isDefault===undefined) t.isDefault=false;
      if(t.live && typeof t.live==="string") t.live={task:t.task||"",start:t.live};
      if(!t.isDefault && isDefaultEntry(t)) t.isDefault=true;
      (t.sessions||[]).forEach(s=>{ if(s.task===undefined) s.task=t.task||""; });
    }
  }
}
function seedDefaults(day){
  if(!settings.seed) return;
  const list = store.days[day];
  if(list.length) return;
  DEFAULT_ENTRIES.forEach(d=>list.push(newEntry({project:d.project, task:d.task, isDefault:true})));
}
function load(){
  store = JSON.parse(localStorage.getItem(dataKey()) || "{}");
  if(!store.days) store.days = {};
  const keep = new Set([todayKey(), prevWorkingDay(todayKey())]);
  for(const k of Object.keys(store.days)) if(!keep.has(k)) delete store.days[k];
  if(!store.days[todayKey()]) store.days[todayKey()] = [];
  migrate();
  seedDefaults(todayKey());
  save();
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
  render();
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
  if(e.key==="Escape"){ $("brandDD").classList.remove("open"); closeBlock(); $("editOverlay").classList.remove("show"); $("setOverlay").classList.remove("show"); $("prevOverlay").classList.remove("show"); $("gapsOverlay").classList.remove("show"); $("assignOverlay").classList.remove("show"); }
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
function openBlock(i, mode, sIdx){
  const t = tasks()[i];
  blockCtx = {i, mode, sIdx};
  const isEdit = mode==="edit";
  const isManual = mode==="manual";
  const isRename = mode==="rename";
  $("blockTitle").textContent = isRename ? "Rename running task" : (isEdit ? "Edit timeblock" : (isManual ? "Add timeblock" : "Start timeblock"));
  $("bOk").textContent = (isEdit||isRename) ? "Save" : (isManual ? "Add" : "Start ▶");
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
$("bCancel").onclick = closeBlock;
$("blockOverlay").addEventListener("mousedown", e=>{ if(e.target===$("blockOverlay")) closeBlock(); });
$("bDelete").onclick = ()=>{
  if(!blockCtx || blockCtx.mode!=="edit") return;
  if(!confirm("Delete this timeblock?")) return;
  tasks()[blockCtx.i].sessions.splice(blockCtx.sIdx,1);
  save(); closeBlock(); renderTable();
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
    if(stopped.length) showUndo(stopped);
  }
  save(); closeBlock(); renderTable();
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

/* ---------- rendering ---------- */
function render(){
  $("hdrDate").textContent = fmtDate(viewDay) + (viewDay===todayKey() ? " · TODAY" : "");
  renderTabs(); renderTable(); renderDatalists();
  $("addBar").style.opacity = viewDay===todayKey() ? 1 : .45;
}
function renderTabs(){
  const prev = prevWorkingDay(todayKey());
  const tabs = [[todayKey(),"TODAY"],[prev,"PREV WORKING DAY"]];
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
      const chips = t.sessions.map((s,k)=>{
        const m = Math.round(hours(s.start,s.end)*60);
        return `<span class="chip ${editable?"clickable":""}" ${editable?`data-sedit="${i}:${k}" title="Click to edit"`:""}>${s.task?`<b>${esc(s.task)}</b>`:""}${short(s.start)}–${short(s.end)}<span class="ch">${m}m</span></span>`;
      }).join("")
        + (t.live?`<span class="chip live ${editable?"clickable":""}" ${editable?`data-ledit="${i}" title="Click to rename"`:""}>${t.live.task?`<b>${esc(t.live.task)}</b>`:""}${short(t.live.start)} – now<span class="ch" data-livemin="${i}">${Math.round(hours(t.live.start,hhmmss(new Date()))*60)}m</span></span>`:"");
      const noBlocks = !t.sessions.length && !t.live;
      const h = taskHours(t);
      const share = dayTotal>0 ? Math.min(100, Math.round(h/dayTotal*100)) : 0;
      return `<tr data-i="${i}">
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
  $("fProject").value=""; save(); render();
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
function buildRows(){
  const list = tasks();
  const liveEnd = hhmmss(new Date());
  const rows=[];
  for(const i of orderedIndices(list)){
    const t = list[i];
    const total = exportHours(t, liveEnd);
    if(total<=0) continue; // skip zero-hour entries
    const blocks = exportBlocks(t, liveEnd);
    const brandName = t.brand || "Default Task";
    // every Default-Task entry exports as one final-value row — no start/end times
    if(!t.brand || isDefaultEntry(t) || !blocks.length){
      const desc = t.task || (blocks[0] && blocks[0].task) || "";
      rows.push([brandName, t.project, desc, "", "", fmtH(total), t.status]);
    } else {
      blocks.forEach((s,k)=>{
        rows.push([
          k===0 ? brandName : "", k===0 ? t.project : "",
          s.task || (k===0 ? t.task : ""),
          s.start, s.end, fmtH(hours(s.start,s.end)),
          k===0 ? t.status : ""
        ]);
      });
    }
  }
  return rows;
}
function copyRows(){
  const rows = buildRows();
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
    $("gapsTimeline").innerHTML = ""; $("gapsTable").innerHTML = "";
    $("gapsFrom").textContent = ""; $("gapsTo").textContent = "";
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
  // timeline segments
  let segs = merged.map(([a,b])=>`<div class="seg cov" title="tracked ${secToHM(a)}–${secToHM(b)}" style="left:${(a-dayStart)/span*100}%;width:${(b-a)/span*100}%"></div>`).join("");
  segs += realGaps.map(([a,b])=>`<div class="seg gap" title="gap ${secToHM(a)}–${secToHM(b)}" style="left:${(a-dayStart)/span*100}%;width:${(b-a)/span*100}%"></div>`).join("");
  $("gapsTimeline").innerHTML = segs;
  $("gapsFrom").textContent = secToHM(dayStart);
  $("gapsTo").textContent = secToHM(dayEnd) + (viewDay===todayKey()?" (now)":"");
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
  $("aEntry").innerHTML = orderedIndices(list).map(i=>{
    const t=list[i];
    return `<option value="${i}">${esc(t.brand||"Default Task")} · ${esc(t.project||"—")}</option>`;
  }).join("");
  $("aTask").value = "";
  $("aStart").value = secToHMS(aSec);
  $("aEnd").value = secToHMS(bSec);
  $("aErr").textContent = "";
  $("assignOverlay").classList.add("show");
  setTimeout(()=>$("aTask").focus(),30);
}
$("aCancel").onclick = ()=>$("assignOverlay").classList.remove("show");
$("assignOverlay").addEventListener("mousedown", e=>{ if(e.target===$("assignOverlay")) $("assignOverlay").classList.remove("show"); });
$("assignModal").addEventListener("submit", e=>{
  e.preventDefault();
  const t = tasks()[+$("aEntry").value];
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
$("previewBtn").onclick = ()=>{
  const rows = buildRows();
  const head = ["Brand","Project","Task","Start","End","Hours","Status"];
  $("prevTable").innerHTML =
    "<tr>"+head.map(h=>`<th>${h}</th>`).join("")+"</tr>" +
    (rows.length
      ? rows.map(r=>"<tr>"+r.map(c=>`<td>${esc(c)||""}</td>`).join("")+"</tr>").join("")
      : `<tr><td colspan="7" style="color:var(--ink-soft)">Nothing to export yet — no logged time.</td></tr>`);
  $("prevOverlay").classList.add("show");
};
$("prevClose").onclick = ()=>$("prevOverlay").classList.remove("show");
$("prevCopy").onclick = ()=>{ copyRows(); $("prevOverlay").classList.remove("show"); };
$("prevOverlay").addEventListener("mousedown", e=>{ if(e.target===$("prevOverlay")) $("prevOverlay").classList.remove("show"); });

/* ---------- boot ---------- */
const sessName = sessionStorage.getItem("ledger.session");
if(sessName) enter(sessName);
(function bootSequence(){
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
      setTimeout(()=>{ $("boot").classList.add("hide"); }, 260);
      setTimeout(()=>{ const b=$("boot"); if(b) b.remove(); }, 900);
    }
  }
  step();
})();
