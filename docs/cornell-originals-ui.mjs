import {ARCHIVE_LIMIT,SOURCE_LIMIT,prepareOriginals,validateOriginal} from "./cornell-originals.mjs?v=archive-v2-r1";

export function installCornellOriginals(backend,onBusyChange=()=>{}){
 const $=id=>document.getElementById(id);
 const section=$("cornell-originals");
 const output=$("original-list");
 const file=$("original-file");
 const select=$("original-select"), confirm=$("original-confirm"), list=$("original-list-button");
 const rowSelect=$("original-row"), rowWrap=$("original-row-wrap");
 const feedback=$("original-status"), candidateInfo=$("original-plan");
 let owner=null, check=0, prepared=null, busy=false;
 const selected=()=>prepared?.candidates.find(item=>item.id===rowSelect.value);
 const setFeedback=str=>{feedback.textContent=str;};
 function repaint(){
  onBusyChange(busy);
  select.disabled=busy;list.disabled=busy;rowSelect.disabled=busy;
  rowWrap.hidden=!prepared?.candidates.length;
  confirm.hidden=!prepared?.candidates.length;
  confirm.disabled=busy||!selected();
 }
 function state(uid){
  if(uid===owner)return;
  owner=uid;check++;prepared=null;busy=false;
  section.hidden=!uid;output.replaceChildren();rowSelect.replaceChildren();file.value="";candidateInfo.textContent="";setFeedback("");repaint();
 }
 function line(parent,tag,value,className){
  const e=document.createElement(tag);e.textContent=String(value);if(className)e.className=className;parent.append(e);return e;
 }
 function download(bytes){
  const url=URL.createObjectURL(new Blob([bytes],{type:"application/json"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download="cornell-original-copy.json";anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),2500);
 }
 function readable(date){
  if(!date)return "";
  const d=new Date(date);return Number.isFinite(d.getTime())?d.toLocaleString("ko-KR"):"";
 }
 async function showRow(item){
  const row=await validateOriginal(item);
  const {state}=row;
  const details=document.createElement("details"), heading=state.recordTitle||row.id;
  line(details,"summary",heading+" · "+row.id+" · 원본 v"+item.sourceVersion+" r"+row.revision);
  const date=readable(state.updatedAt);if(date)line(details,"p","원본 마지막 저장: "+date);
  const blocks=Array.isArray(state.blocks)?state.blocks:Object.keys(state.text??{});
  for(const id of blocks){
   const raw=state.text?.[id];
   if(typeof raw!=="string"||!raw||state.deletedBlocks?.[id])continue;
   line(details,"h4",state.titles?.[id]||"묵상 메모");
   line(details,"pre",raw,"original-text");
  }
  if(Array.isArray(state.quotes)&&state.quotes.length){
   line(details,"h4","말씀 카드 (본문 대신 장·절 표시)");
   for(const q of state.quotes){
    if(!q||typeof q!=="object")continue;
    const ref=[q.id,q.number].filter(x=>typeof x==="string"||typeof x==="number").join(":");
    if(ref)line(details,"p",ref);
   }
   for(const memo of Object.values(state.quoteMemos??{}))if(typeof memo==="string"&&memo)line(details,"pre",memo,"original-text");
  }
  if(Array.isArray(state.bulletinBody))for(const body of state.bulletinBody){
   if(typeof body?.text!=="string")continue;
   line(details,"h4","주보 본문"+(typeof body.reference==="string"&&body.reference?" · "+body.reference:""));
   line(details,"pre",body.text,"original-text");
  }
  if(Array.isArray(state.bulletinQuestions))for(const q of state.bulletinQuestions){
   if(!q||typeof q!=="object")continue;
   line(details,"h4","주보 질문·답변"+(typeof q.reference==="string"&&q.reference?" · "+q.reference:""));
   if(typeof q.question==="string")line(details,"pre",q.question,"original-text");
   if(typeof q.answer==="string")line(details,"pre",q.answer,"original-text");
  }
  const ink=Object.values(state.ink??{}).reduce((n,x)=>n+(Array.isArray(x)?x.length:0),0);
  const marks=(Array.isArray(state.highlights)?state.highlights.length:0)+Object.values(state.noteMarks??{}).reduce((n,x)=>n+(Array.isArray(x)?x.length:0),0);
  line(details,"p","원본 손글씨 "+ink+"획 · 표시 "+marks+"개. 이 화면은 필기 위치·밑줄·카드 배치를 재현하지 않지만, 원본 사본에 유지됩니다.");
  const exportButton=line(details,"button","이 기록의 원본 JSON 내려받기");
  exportButton.type="button";exportButton.onclick=()=>{if(owner)download(item.payload);};
  return details;
 }
 async function refresh(ownerAtStart,op){
  const current=()=>owner===ownerAtStart&&check===op;
  const records=await backend.listOriginals(ownerAtStart);
  if(!current())return;
  const parts=await Promise.all(records.map(showRow));
  if(!current())return;
  output.replaceChildren(...parts);
  if(!parts.length)line(output,"p","보관된 기존 기록 사본이 없습니다.");
 }
 if(!backend){section.hidden=true;return {setOwner:()=>{},isBusy:()=>false};}
 list.onclick=async()=>{
  if(!owner||busy)return;const who=owner,op=++check;
  busy=true;repaint();setFeedback("서버에 보관된 사본을 확인 중입니다.");
  try{await refresh(who,op);if(op===check)setFeedback("서버 사본을 확인했습니다.");}
  catch{if(op===check)setFeedback("기존 기록 사본을 확인하지 못했어요. 서버 권한과 연결 상태를 확인하세요.");}
  finally{if(op===check){busy=false;repaint();}}
 };
 select.onclick=()=>file.click();
 rowSelect.onchange=repaint;
 file.onchange=async()=>{
  const chosen=file.files[0];file.value="";
  if(!owner||!chosen||busy)return;const op=++check;
  busy=true;prepared=null;rowSelect.replaceChildren();candidateInfo.textContent="";setFeedback("");repaint();
  try{
   if(chosen.size>SOURCE_LIMIT)throw Error("백업 파일이 너무 큽니다.");
   const stage=await prepareOriginals(await chosen.text());
   const options=await Promise.all(stage.candidates.map(async item=>{
    const row=await validateOriginal(item);
    const title=typeof row.state.recordTitle==="string"&&row.state.recordTitle.trim() ? row.state.recordTitle.slice(0,90)+" · " : "";
    // Display privately in the user's browser, never send this metadata before confirm.
    return {id:item.id,label:title+row.id+" · 원본 v"+item.sourceVersion+" r"+row.revision};
   }));
   if(op!==check)return;
   prepared=stage;
   const empty=line(rowSelect,"option","기록을 선택하세요");
   empty.value="";
   for(const opt of options)line(rowSelect,"option",opt.label).value=opt.id;
   rowSelect.value="";
   const c=stage.counts;
   candidateInfo.textContent="보관 후보 "+c.ready+"건 · 휴지통 제외 "+c.trash+"건 · 확인 보류 "+c.held+"건 · 중복 "+c.duplicate+"건 · 복구 이력 별도 보존 "+c.history+"건";
   setFeedback("아직 서버에 보내지 않았어요. 한 건을 직접 선택한 뒤, 이 Google 계정에 읽기 전용 사본을 추가할 수 있습니다.");
  }catch{if(op===check)setFeedback("지원되는 Cornell 기기 백업인지 확인해 주세요. 이 파일은 서버에 보내지 않았습니다.");}
  finally{if(op===check){busy=false;repaint();}}
 };
 confirm.onclick=async()=>{
  const item=selected();
  if(!owner||busy||!item)return;
  const who=owner,op=++check,current=()=>op===check&&who===owner;
  busy=true;repaint();let confirmed=null;
  try{
   const saved=await backend.listOriginals(who);
   if(!current())return;
   if(saved.length>=ARCHIVE_LIMIT-1&&!saved.some(r=>r.id===item.id)){
    setFeedback("이 계정에는 사본을 최대 30건까지 보관할 수 있어요. 변경하지 않았습니다.");
    return;
   }
   // Deliberately one write. Never iterate over file candidates on confirmation.
   confirmed=await backend.writeOriginal(who,item);
   if(!current())return;
   prepared=null;rowSelect.replaceChildren();candidateInfo.textContent="";
   setFeedback(confirmed==="created"?"선택한 원본 사본 1건을 서버에서 확인했어요. 다른 기록은 쓰지 않았습니다.":"같은 원본 사본이 이미 서버에 있어요. 중복 저장하지 않았습니다.");
   await refresh(who,op);
  }catch{
   if(current())setFeedback(confirmed?"선택한 사본 1건은 확인했지만 목록을 새로 읽지 못했어요. ‘서버 사본 보기’로 다시 확인하세요.":"선택한 한 건의 서버 상태를 확인하지 못했어요. 같은 기록을 다시 시도해도 일치하는 사본은 중복 저장되지 않습니다.");
  }finally{if(current()){busy=false;repaint();}}
 };
 return {setOwner:state,isBusy:()=>busy};
}
