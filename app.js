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
const SET_DEFAULTS = {theme:"dark", accent:"cyan", font:"mono", fsize:"m", density:"comfy", seed:true, remind:true, remindMins:30};
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
}
$("themeSeg").addEventListener("click", e=>{ if(e.target.dataset.th){ settings.theme=e.target.dataset.th; saveSettings(); }});
$("fontSeg").addEventListener("click", e=>{ if(e.target.dataset.fn){ settings.font=e.target.dataset.fn; saveSettings(); }});
$("sizeSeg").addEventListener("click", e=>{ if(e.target.dataset.fs){ settings.fsize=e.target.dataset.fs; saveSettings(); }});
$("densitySeg").addEventListener("click", e=>{ if(e.target.dataset.dn){ settings.density=e.target.dataset.dn; saveSettings(); }});
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
  if(e.key==="Escape"){ $("brandDD").classList.remove("open"); closeBlock(); $("editOverlay").classList.remove("show"); $("setOverlay").classList.remove("show"); $("prevOverlay").classList.remove("show"); }
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
  $("blockTitle").textContent = isEdit ? "Edit timeblock" : (isManual ? "Add timeblock" : "Start timeblock");
  $("bOk").textContent = isEdit ? "Save" : (isManual ? "Add" : "Start ▶");
  $("bDelete").style.display = isEdit ? "inline-block" : "none";
  $("bTimes").style.display = (isManual||isEdit) ? "flex" : "none";
  $("bRemindWrap").style.display = (mode==="start" && settings.remind) ? "block" : "none";
  $("bRemind").value = settings.remindMins;
  if(isEdit){
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
  if(blockCtx.mode==="manual" || blockCtx.mode==="edit"){
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
    t.live = {task:label, start:hhmmss(new Date()), remind:(rm>0?rm:null), nextRemind:(rm>0?rm:null)};
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
  if(!list.length){
    body.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="disp">NO ENTRIES ${viewDay===todayKey()?"YET":"THIS DAY"}</div>Add one above${viewDay===todayKey()?" or hit ▶ to start a timeblock":""}.</div></td></tr>`;
  } else {
    const editable = viewDay===todayKey();
    body.innerHTML = orderedIndices(list).map(i=>{
      const t = list[i];
      const sess = t.sessions.map((s,k)=>
        `<div class="sess ${editable?"clickable":""}" ${editable?`data-sedit="${i}:${k}" title="Click to edit"`:""}>${s.task?`<span class="slabel">${esc(s.task)}</span> · `:""}<span class="stime">${short(s.start)}–${short(s.end)} (${fmtH(hours(s.start,s.end))})</span></div>`).join("")
        + (t.live?`<div class="sess livesess">${t.live.task?esc(t.live.task)+" · ":""}${short(t.live.start)} – now…</div>`:"");
      const noBlocks = !t.sessions.length && !t.live;
      return `<tr data-i="${i}">
        <td><span class="bpill ${brandCls(t.brand)}">${t.brand?esc(t.brand):"Default Task"}</span></td>
        <td class="projcell">${esc(t.project)}</td>
        <td class="taskdesc">${esc(t.task)||'<span style="opacity:.4">—</span>'}</td>
        <td class="tbcell">${t.live?`<span class="livehint">● REC</span>`:""}${sess||`<span style="color:var(--ink-soft);opacity:.5">—</span>`}</td>
        <td class="num ${noBlocks&&editable?"editable":""}" ${noBlocks&&editable?`data-eh="${i}" title="Click to set hours"`:""} data-hours="${i}"><strong>${fmtH(taskHours(t))}</strong></td>
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
  const total = list.reduce((a,t)=>a+taskHours(t),0);
  $("dayTotal").textContent = fmtH(total);
  $("statHours").textContent = fmtH(total);
  $("statTasks").textContent = list.length;

  body.querySelectorAll("[data-st]").forEach(el=>el.onchange=()=>{ tasks()[+el.dataset.st].status=el.value; save(); renderTable(); });
  body.querySelectorAll("[data-del]").forEach(el=>el.onclick=()=>{ if(confirm("Delete this entry?")){ tasks().splice(+el.dataset.del,1); clearUndo(); save(); renderTable(); }});
  body.querySelectorAll("[data-go]").forEach(el=>el.onclick=()=>openBlock(+el.dataset.go,"start"));
  body.querySelectorAll("[data-sess]").forEach(el=>el.onclick=()=>openBlock(+el.dataset.sess,"manual"));
  body.querySelectorAll("[data-edit]").forEach(el=>el.onclick=()=>openEdit(+el.dataset.edit));
  body.querySelectorAll("[data-eh]").forEach(el=>el.onclick=()=>openEdit(+el.dataset.eh));
  body.querySelectorAll("[data-sedit]").forEach(el=>el.onclick=()=>{
    const [i,k] = el.dataset.sedit.split(":").map(Number);
    openBlock(i,"edit",k);
  });
  body.querySelectorAll("[data-stop]").forEach(el=>el.onclick=()=>{
    const t=tasks()[+el.dataset.stop];
    t.sessions.push({task:t.live.task, start:t.live.start, end:hhmmss(new Date())});
    t.live=null; save(); renderTable();
  });
}

function tick(){
  $("statClock").textContent = new Date().toTimeString().slice(0,5);
  if(!store) return;
  const list = tasks();
  let dirty = false;
  list.forEach((t,i)=>{
    if(!t.live) return;
    const cell=document.querySelector(`[data-hours="${i}"] strong`);
    if(cell) cell.textContent=fmtH(taskHours(t));
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
  if(list.some(t=>t.live)){
    const total = fmtH(list.reduce((a,t)=>a+taskHours(t),0));
    $("dayTotal").textContent = total;
    $("statHours").textContent = total;
  }
}

/* ---------- add entry ---------- */
$("addBtn").onclick = ()=>{
  if(viewDay!==todayKey()){ toast("Switch to Today to add entries"); return; }
  const project=$("fProject").value.trim();
  const task=$("fTask").value.trim();
  if(!project && !task){ $("fProject").focus(); return; }
  tasks().push(newEntry({brand:curBrand, project, task, status:$("fStatus").value}));
  $("fProject").value=""; $("fTask").value=""; save(); render();
};
["fProject","fTask"].forEach(id=>$(id).addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("addBtn").click();}}));

/* ---------- copy for sheets ---------- */
function exportHours(t){ // finished time only — a live timer isn't exported
  const h = t.sessions.reduce((a,s)=>a+hours(s.start,s.end),0);
  if(!t.sessions.length && t.manualHours!=null) return t.manualHours;
  return h;
}
function buildRows(){
  const list = tasks();
  const rows=[];
  for(const i of orderedIndices(list)){
    const t = list[i];
    const total = exportHours(t);
    if(total<=0) continue; // skip zero-hour entries
    const brandName = t.brand || "Default Task";
    if(isDefaultEntry(t) || !t.sessions.length){
      // final value only — one row
      const desc = t.task || (t.sessions[0] && t.sessions[0].task) || "";
      rows.push([brandName, t.project, desc, "", "", fmtH(total), t.status]);
    } else {
      t.sessions.forEach((s,k)=>{
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
  navigator.clipboard.writeText(tsv).then(
    ()=>toast(`Copied ${rows.length} row${rows.length>1?"s":""} — paste with Ctrl+Shift+V to keep the sheet's dropdowns`),
    ()=>{
      const ta=document.createElement("textarea"); ta.value=tsv; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); ta.remove(); toast("Copied — paste with Ctrl+Shift+V");
    });
}
$("copyBtn").onclick = copyRows;

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
