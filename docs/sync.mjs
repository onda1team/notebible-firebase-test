export const VERSION = "v1";
export const MAX_RECORDS=30;
const LIMITS = {ref:120,title:120,passage:8000,cue:4000,note:8000,takeaway:4000,bulletin:16000};
export const FIELDS = Object.freeze(Object.keys(LIMITS));
const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clone = x => structuredClone(x);
export function clean(p){
  if(!p||typeof p!=="object"||Array.isArray(p))throw Error("bad payload");
  const out=Object.fromEntries(FIELDS.map(f=>{
    const v=p[f]??"";if(typeof v!=="string"||v.length>LIMITS[f])throw Error("bad "+f);
    return [f,v];
  }));
  if(!Array.isArray(p.ink??[]))throw Error("bad ink");
  out.ink=(p.ink??[]).map(s=>{
    if(!Array.isArray(s)||!s.length||s.length>280)throw Error("bad stroke");
    return s.map(v=>{if(!Array.isArray(v)||v.length!==2||!v.every(n=>typeof n==="number"&&n>=0&&n<=1))throw Error("bad point");return v.map(n=>Math.round(n*100000)/100000)});
  });
  if(out.ink.length>150)throw Error("too many strokes");
  return out;
}
export const blank = () => clean({});
export const equal = (a,b) => !!a&&!!b&&JSON.stringify(clean(a))===JSON.stringify(clean(b));
const FORMAT="yeobaek-firebase-staging-format1";
export function makeClient({api,storage,makeId=()=>crypto.randomUUID(),onChange=()=>{}}){
  // Firebase Auth runs in-memory; local drafts are scoped per project + path + user.
  let session=null, entries=new Map(), storageKey="", lastStored=null, storageBlocked=false, busy=new Set(), epoch=0, storageIssue=false;
  const state=()=>({user:session?.id??null,entries:clone([...entries.values()]),busy:[...busy],storageIssue});
  const nudge=()=>onChange(state());
  function persist(){
    try{
      if(storageBlocked||storage.getItem(storageKey)!==lastStored){storageBlocked=true;throw Error("another tab saved");}
      const next=JSON.stringify({format:FORMAT,entries:[...entries.values()]});
      storage.setItem(storageKey,next);lastStored=next;storageIssue=false;
    }catch{storageIssue=true}
  }
  function requireAuth(){if(!session)throw Error("먼저 로그인하세요.");return session}
  function begin(reply,scope){
    const id=reply?.uid;
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(id??""))throw Error("테스트 계정 인증이 필요합니다.");
    if(session)throw Error("로그아웃한 뒤 계정을 바꾸세요.");
    epoch++;session={id};entries=new Map();busy=new Set();
    storageKey=FORMAT+":"+scope+":"+id;storageIssue=false;storageBlocked=false;lastStored=null;
    try{
      lastStored=storage.getItem(storageKey);
      if(lastStored){
        const wrapper=JSON.parse(lastStored);
        if(wrapper.format!==FORMAT||!Array.isArray(wrapper.entries)||wrapper.entries.length>MAX_RECORDS)throw Error("bad cache");
        for(const e of wrapper.entries){
          if(!UID.test(e.id)||!Number.isSafeInteger(e.rev)||e.rev<0)throw Error("cache row");
          entries.set(e.id,{id:e.id,rev:e.rev,payload:clean(e.payload),dirty:!!e.dirty,remote:e.remote?row(e.id,e.remote):null});
        }
      }
    }catch{storageIssue=true;storageBlocked=true;entries.clear();}
    nudge();
  }
  function stop(){epoch++;session=null;entries.clear();busy.clear();storageIssue=false;nudge()}
  function draft(id,raw){
    requireAuth();if(!UID.test(id))throw Error("bad id");
    const p=clean(raw), old=entries.get(id);
    if(old&&equal(old.payload,p))return id;
    if(!old&&entries.size>=MAX_RECORDS)throw Error("테스트 기록 한도에 도달했습니다.");
    entries.set(id,{id,rev:old?.rev??0,payload:p,dirty:true,remote:old?.remote??null});persist();nudge();return id;
  }
  function row(id,r){
    if(r.record_id!==id||!Number.isSafeInteger(r.revision)||r.revision<1)throw Error("bad server response");
    return {record_id:id,revision:r.revision,payload:clean(r.payload),updated_at:r.updated_at??null};
  }
  async function pull(canApply=()=>true){
    const s=requireAuth(), marker=epoch, list=await api.list(s.id);
    if(epoch!==marker||!canApply())return false;
    if(!Array.isArray(list))throw Error("잘못된 서버 응답입니다.");
    if(list.length>MAX_RECORDS)throw Error("서버의 검증 기록이 30건을 넘었어요. 일부만 불러오지 않았습니다.");
    const records=list.map(r=>{if(!UID.test(r?.record_id))throw Error("bad server id");return row(r.record_id,r)});
    let changed=false;
    const newIds=records.filter(r=>!entries.has(r.record_id)).length;
    if(entries.size+newIds>MAX_RECORDS)throw Error("서버 기록과 이 기기 초안이 합쳐 30건을 넘었어요. 불러오기 전 JSON으로 초안을 보관해 주세요.");
    for(const r of records){
      const e=entries.get(r.record_id);
      if(busy.has(r.record_id)||r.revision<=(e?.rev??0)||(e?.remote&&r.revision<e.remote.revision))continue;
      if(e?.dirty){
        if(equal(e.payload,r.payload)){e.rev=r.revision;e.dirty=false;e.remote=null;changed=true;}
        else if(!e.remote||r.revision>e.remote.revision){e.remote=r;changed=true}
      }else{
        entries.set(r.record_id,{id:r.record_id,rev:r.revision,payload:r.payload,dirty:false,remote:null});changed=true;
      }
    }
    if(changed)persist();nudge();return true;
  }
  async function save(id){
    const s=requireAuth(),e=entries.get(id);
    if(!e?.dirty)return "unchanged";if(e.remote)return "conflict";if(busy.has(id))return "busy";
    const marker=epoch,snapshot=clone(e.payload),expected=e.rev;
    busy.add(id);nudge();
    try{
      const reply=await api.save(s.id,id,expected,snapshot);
      if(epoch!==marker)return "cancelled";
      if(typeof reply?.ok!=="boolean"||reply.record_id!==id)throw Error("서버 응답을 확인할 수 없습니다.");
      const current=entries.get(id);
      if(reply.revision===null&&!reply.ok)throw Error("서버 사본을 찾지 못했습니다. 백업을 먼저 보관해 주세요.");
      const r=row(id,reply);
      if(reply.ok && (r.revision!==expected+1||!equal(r.payload,snapshot)))throw Error("서버 저장본을 확인할 수 없습니다.");
      if(reply.ok||equal(snapshot,r.payload)||equal(current.payload,r.payload)){
        current.rev=r.revision;current.dirty=!equal(current.payload,r.payload);current.remote=null;
        persist();nudge();return current.dirty?"pending":"saved";
      }
      current.remote=r;persist();nudge();return "conflict";
    }finally{if(epoch===marker){busy.delete(id);nudge()}}
  }
  function copyConflict(id){
    requireAuth();const e=entries.get(id);if(!e?.remote||busy.has(id))throw Error("보존할 충돌 사본이 없습니다.");
    const id2=makeId();if(!UID.test(id2)||entries.has(id2)||entries.size>=MAX_RECORDS)throw Error("별도 사본을 만들 수 없습니다.");
    entries.set(id2,{id:id2,rev:0,payload:clone(e.payload),dirty:true,remote:null});
    entries.set(id,{id,rev:e.remote.revision,payload:clone(e.remote.payload),dirty:false,remote:null});
    persist();nudge();return id2;
  }
  function exportNotes(){requireAuth();return JSON.stringify({format:FORMAT,entries:[...entries.values()]})}
  function importAsCopies(txt){
    requireAuth();if(typeof txt!=="string"||txt.length>12000000)throw Error("지원하지 않는 백업입니다.");
    const v=JSON.parse(txt);
    if(v.format!==FORMAT||!Array.isArray(v.entries)||v.entries.length>MAX_RECORDS)throw Error("지원하지 않는 백업입니다.");
    const ps=v.entries.flatMap(e=>[clean(e.payload),...(e.remote?[clean(e.remote.payload)]:[])]);
    if(entries.size+ps.length>MAX_RECORDS)throw Error("테스트 기록 한도에 도달했습니다.");
    const staged=new Map();
    for(const p of ps){const id=makeId();if(!UID.test(id)||entries.has(id)||staged.has(id))throw Error("기록 ID 중복");staged.set(id,{id,rev:0,payload:p,dirty:true,remote:null});}
    for(const [id,e] of staged)entries.set(id,e);
    persist();nudge();return ps.length;
  }
  return {state,begin,stop,draft,pull,save,copyConflict,exportNotes,importAsCopies,makeId};
}
