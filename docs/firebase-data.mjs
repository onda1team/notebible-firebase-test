import {clean,equal} from "./sync.mjs";
export const MAX_BYTES=800000;
export function firebaseConfig(raw){
  const {apiKey,authDomain,projectId,appId}=raw??{};
  if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId??"") ||
     authDomain!==projectId+".firebaseapp.com" || !/^AIza[\w-]{35}$/.test(apiKey??"") ||
     !/^1:\d+:web:[0-9a-f]+$/.test(appId??""))throw Error("테스트 Firebase 웹 앱 구성이 아직 없습니다.");
  return {apiKey,authDomain,projectId,appId};
}
export function encodePayload(payload){
  const bytes=new TextEncoder().encode(JSON.stringify(clean(payload)));
  if(bytes.byteLength>MAX_BYTES)throw Error("이 기록이 너무 커서 서버에 보내지 않았어요. 초안을 JSON으로 보관해 주세요.");
  return bytes;
}
export function decodePayload(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_BYTES)throw Error("서버 기록 형식을 확인할 수 없어요.");
  return clean(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)));
}
export function recordFromSnapshot(snap){
  if(!snap.exists())return null;
  const d=snap.data();
  if(!Number.isSafeInteger(d.revision)||d.revision<1||d.schema!==1||!d.payload?.toUint8Array)throw Error("서버 기록 형식을 확인할 수 없어요.");
  return {record_id:snap.id,revision:d.revision,payload:decodePayload(d.payload.toUint8Array()),updated_at:d.updatedAt?.toDate?.()?.toISOString()??null};
}
export function createRecordApi(io){
  const row=()=>{throw Error("서버 응답에 기록이 없습니다.")};
  return {
   async list(uid){ const list=await io.list(uid);return list.map(s=>recordFromSnapshot(s)??row()); },
   async save(uid,id,expected,payload){
    if(!Number.isSafeInteger(expected)||expected<0||expected===Number.MAX_SAFE_INTEGER)throw Error("저장 버전이 잘못되었습니다.");
    const bytes=encodePayload(payload);
    let result;
    try{
     result=await io.transaction(uid,id,async tx=>{
      const current=recordFromSnapshot(await tx.get());
      if((current?.revision??0)!==expected)return {wrote:false,current};
      tx.set({schema:1,revision:expected+1,payload:io.bytes(bytes),updatedAt:io.now()});
      return {wrote:true};
     });
    }catch(error){
     // Rules may reject a stale transaction at commit before the SDK retries it.
     // Resolve this as a conflict only if an authorized, fresh server read proves a newer revision.
     if(!["permission-denied","aborted","failed-precondition"].includes(error?.code))throw error;
     let current;
     try{current=recordFromSnapshot(await io.read(uid,id));}catch{throw error;}
     if(!current||current.revision<=expected)throw error;
     return {ok:false,...current};
    }
    if(!result.wrote)return {ok:false,record_id:id,revision:null,...result.current};
    // Read the committed server value rather than claim success from an optimistic SDK cache.
    const live=recordFromSnapshot(await io.read(uid,id));
    if(!live)return row();
    return {ok:live.revision===expected+1&&equal(live.payload,payload),...live};
   },
  };
}
