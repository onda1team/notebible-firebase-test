import {FIELDS,VERSION,blank,makeClient} from "./sync.mjs";
import {installCornellOriginals} from "./cornell-originals-ui.mjs?v=archive-v2-r1";
import {firebaseConfig} from "./firebase-data.mjs";
const $=id=>document.getElementById(id), say=s=>$("action-status").textContent=s, auth=s=>$("auth-status").textContent=s;
$("version").textContent=VERSION;
let backend=null,scope="";
try{
 const cfg=firebaseConfig(window.YEO_SYNC_CONFIG);
 backend=await (await import("./firebase-web.mjs?v=archive-v2-r1")).openBackend(cfg);
 scope=cfg.projectId+":"+location.pathname.replace(/\/index\.html$/,"/");
 $("signin").disabled=false;
 $("setup").textContent="승인된 Google 테스트 계정으로 로그인하세요.";
}catch{
 $("setup").textContent="테스트 서버가 아직 연결되지 않았거나 불러올 수 없습니다. 실제 기록을 입력하지 마세요.";
}
const originals=installCornellOriginals(backend, busy => {$("logout").disabled=busy||client.state().busy.length>0;});
let current=null, ink=[], pen=false, inFlight=null, activePointer=null, composing=false, op=0, timer=0, active=null;
let pendingPull=null,lastPull=0;
const canvas=$("ink"), ctx=canvas.getContext("2d");
const client=makeClient({api:backend,storage:{
 getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v),
},onChange:render});
function live(){return client.state().entries.find(x=>x.id===current)}
function toFields(payload){for(const f of FIELDS)$(f).value=payload[f];ink=structuredClone(payload.ink);draw()}
function gather(){return {...Object.fromEntries(FIELDS.map(f=>[f,$(f).value])),ink}}
function update(){if(!current||!active)return;try{client.draft(current,gather())}catch{say("이 기록을 저장할 수 없어요. 입력 분량을 확인하세요.")}}
function go(id){
 if(composing||activePointer!==null)return;
 current=id; const item=live();toFields(item?.payload??blank());render(client.state());say("");
}
function brief(r){let parts=[r.title,r.ref,r.passage,r.cue,r.note,r.takeaway,r.bulletin].filter(Boolean);parts.push("손글씨 "+r.ink.length+"획");return parts.join("\n\n");}
function render(s){
 const me=s.user;originals.setOwner(me);$("content").hidden=!me;$("signin").hidden=!!me;$("logout").hidden=!me;
 if(!me)return;
 $("logout").disabled=s.busy.length>0||originals.isBusy();
 const e=s.entries.find(x=>x.id===current), actionBusy=s.busy.includes(current), parent=$("records");
 const oldFocus=document.activeElement?.dataset?.record;
 parent.replaceChildren();
 for(const n of s.entries){
  const b=document.createElement("button"),l=document.createElement("div");
  l.className="record"+(n.id===current?" selected":"");
  const title=document.createElement("strong"),status=document.createElement("small");
  title.textContent=n.payload.title||n.payload.ref||"제목 없는 테스트 기록";
  status.textContent=n.remote?"두 사본 보존":n.dirty?"미저장 초안":"서버 r"+n.rev;
  b.type="button";b.textContent="열기";b.dataset.record=n.id;b.setAttribute("aria-label",title.textContent+" 열기");b.onclick=()=>go(n.id);
  if(n.id===current)l.setAttribute("aria-current","true");l.append(title,status,b);parent.append(l);
  if(oldFocus===n.id)b.focus({preventScroll:true});
 }
 if(!s.entries.length)parent.textContent="기록이 없습니다.";
 $("conflict").hidden=!e?.remote;
 if(e?.remote){$("local-copy").textContent=brief(e.payload);$("server-copy").textContent=brief(e.remote.payload);}
 $("save").disabled=actionBusy||!e?.dirty||!!e.remote||composing;
 $("stage-status").textContent=(e?.remote?"충돌: 두 사본 보존":actionBusy?"서버에 전송 중":e?.dirty?"이 기기 초안 · 서버 저장 필요":e?.rev?"서버 저장 확인 · r"+e.rev:"새 기록")+(s.storageIssue?" · 이 브라우저에 백업을 보존할 수 없어요. JSON을 내려받으세요.":"");
}
async function pull(show=false){
 if(!active||composing||activePointer!==null||pendingPull!==null||FIELDS.includes(document.activeElement?.id))return;
 if(!show&&Date.now()-lastPull<3000)return;
 const marker=op, task=Symbol();pendingPull=task;lastPull=Date.now();
 try{
  const usable=()=>marker===op&&!!active&&!composing&&activePointer===null&&!FIELDS.includes(document.activeElement?.id);
  const applied=await client.pull(usable);if(!applied)return;
  const e=live();if(e&&!e.dirty&&!composing&&activePointer===null){
   const prior=gather();
   // Do not reset caret or pen in an unchanged form.
   if(JSON.stringify(e.payload)!==JSON.stringify(prior))toFields(e.payload);
  }
  if(show)say("서버 기록을 확인했어요.");
 }catch(e){if(marker===op&&active)say(e.message||"서버 기록을 확인하지 못했습니다.")}
}
$("signin").onclick=async()=>{
 if(!backend||active)return;
 const marker=++op;
 $("signin").disabled=true;
 auth("Google 테스트 계정을 선택하세요.");
 try{
  const who=await backend.login();if(marker!==op)return;
  client.begin(who,scope);active=who.uid;go(client.makeId());
  auth("승인된 테스트 계정으로 로그인했습니다.");
  await pull(true);
  if(marker===op)timer=setInterval(()=>{if(document.visibilityState==="visible")void pull()},180000);
 }catch(e){
  if(marker!==op)return;
  client.stop();active=null;
  try{await backend.logout()}catch{}
  if(marker!==op)return;
  const message=e.code==="auth/popup-blocked"?"팝업이 차단됐어요. Chrome 또는 Safari에서 이 페이지를 직접 열고 이 사이트의 팝업을 허용한 뒤 다시 시도해 주세요.":
   e.code==="auth/unauthorized-domain"?"이 Pages 주소가 Firebase에서 아직 허용되지 않았어요.":
   e.code==="auth/popup-closed-by-user"?"로그인 창이 닫혔어요. 다시 시도해 주세요.":
   e.code==="tester/not-allowed"?"로그인은 됐지만 이 Google 계정은 테스트 기록 사용 대상으로 등록되지 않았어요.":
   "로그인하지 못했어요. 네트워크 연결과 Firebase 설정을 확인해 주세요.";
  auth(message);
 }finally{if(marker===op)$("signin").disabled=false;}
};
$("logout").onclick=async()=>{
 if(!active||client.state().busy.length||originals.isBusy())return;
 op++;active=null;pendingPull=null;lastPull=0;clearInterval(timer);timer=0;current=null;ink=[];activePointer=null;inFlight=null;composing=false;pen=false;
 canvas.classList.remove("inking");$("pen").setAttribute("aria-pressed","false");$("pen").textContent="손글씨 켜기";
 client.stop();toFields(blank());$("signin").disabled=true;
 try{await backend.logout();auth("이 창에서 로그아웃했습니다.");}
 catch{auth("로그아웃 확인에 실패했어요. 이 탭을 닫아 주세요.");return;}
 $("signin").disabled=false;
};
$("new").onclick=()=>go(client.makeId());$("pull").onclick=()=>pull(true);
$("save").onclick=async()=>{
 if(!current||composing||activePointer!==null)return;
 update();const marker=op;try{
   const r=await client.save(current);if(marker!==op)return;
   say({saved:"서버 저장과 저장 버전을 확인했어요.",conflict:"두 사본을 확인하고 새 기록으로 나눌 수 있어요.",pending:"저장 중 바뀐 내용이 남아 있어요. 다시 저장해 주세요.",unchanged:"서버에 새로 저장할 내용이 없어요.",busy:"현재 저장 중입니다."}[r]||"");
 }catch(e){if(marker===op)say((e.message||"서버 저장 실패")+" 이 기기 초안을 확인하거나 백업해 주세요.");}
};
$("copy").onclick=()=>{try{go(client.copyConflict(current));say("기존 서버 사본은 유지하고 로컬 초안을 새 기록으로 분리했어요.");}catch(e){say(e.message);}};
for(const f of FIELDS){
 $(f).addEventListener("input",update);
 $(f).addEventListener("compositionstart",()=>{composing=true;render(client.state());});
 $(f).addEventListener("compositionend",()=>{composing=false;update();render(client.state());});
}
window.addEventListener("focus",()=>{void pull()});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")void pull()});
function draw(){
 const b=canvas.getBoundingClientRect();if(!b.width||!b.height)return;
 const d=Math.min(devicePixelRatio||1,3), w=Math.round(b.width*d),h=Math.round(b.height*d);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 ctx.clearRect(0,0,w,h);ctx.strokeStyle=ctx.fillStyle="#184638";ctx.lineWidth=2.3*d;ctx.lineCap=ctx.lineJoin="round";
 for(const s of inFlight?[...ink,inFlight]:ink){
  ctx.beginPath();if(s.length===1){ctx.arc(s[0][0]*w,s[0][1]*h,1.15*d,0,Math.PI*2);ctx.fill();continue;}
  ctx.moveTo(s[0][0]*w,s[0][1]*h);for(const p of s.slice(1))ctx.lineTo(p[0]*w,p[1]*h);ctx.stroke();
 }
 $("undo").disabled=!ink.length;
}
const point=e=>{const b=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))];};
$("pen").onclick=()=>{pen=!pen;$("pen").setAttribute("aria-pressed",String(pen));$("pen").textContent=pen?"손글씨 끄기":"손글씨 켜기";canvas.classList.toggle("inking",pen);};
canvas.onpointerdown=e=>{if(!pen||inFlight||e.button!==0)return;if(ink.length>=150){say("손글씨는 최대 150획까지 넣을 수 있어요.");return;}activePointer=e.pointerId;inFlight=[point(e)];canvas.setPointerCapture(e.pointerId);draw();};
canvas.onpointermove=e=>{if(inFlight&&activePointer===e.pointerId&&inFlight.length<280){inFlight.push(point(e));draw();}};
canvas.onpointerup=e=>{if(!inFlight||activePointer!==e.pointerId)return;if(inFlight.length<280)inFlight.push(point(e));ink.push(inFlight);inFlight=null;activePointer=null;draw();update();};
canvas.onpointercancel=e=>{if(activePointer===e.pointerId){activePointer=null;inFlight=null;draw();}};
$("undo").onclick=()=>{if(ink.length){ink.pop();draw();update();}};
new ResizeObserver(draw).observe(canvas);
$("export").onclick=()=>{if(!active)return;const b=new Blob([client.exportNotes()],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="yeobaek-test-"+VERSION+"-backup.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);};
$("import").onclick=()=>$("backup").click();
$("backup").onchange=async e=>{const f=e.target.files[0],marker=op;e.target.value="";if(!f)return;try{if(f.size>12000000)throw Error("size");const t=await f.text();if(marker!==op)return;const n=client.importAsCopies(t);say(n+"건을 새 기록으로 추가했어요. 기존 내용은 덮어쓰지 않았습니다.");}catch{if(marker===op)say("이 검증판의 올바른 백업인지 확인해 주세요.");}};

render(client.state());
