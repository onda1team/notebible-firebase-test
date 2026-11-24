// Keep Cornell originals separate from writable demo notes. No parsing/truncation of individual fields.
export const ARCHIVE_LIMIT=31;
export const ARCHIVE_BYTES=800000;
export const SOURCE_LIMIT=16*1024*1024;
const CANON=/^[1-3]?[A-Z]{2,3}[1-9][0-9]{0,2}$/;
const HEX=/^[a-f0-9]{64}$/;
const obj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const encoder=new TextEncoder();
const decoder=new TextDecoder("utf-8",{fatal:true});
const stable=v=>Array.isArray(v)?v.map(stable):obj(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const bytesOf=v=>encoder.encode(JSON.stringify(stable(v)));
async function sha(v){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",v)),b=>b.toString(16).padStart(2,"0")).join("");}
async function idFor(chapter,digest,version){return sha(encoder.encode("cornell-sites-v"+version+"\0"+chapter+"\0"+digest));}
const keysMatch=(o,allowed)=>Object.keys(o).every(k=>allowed.includes(k));
function mediaLike(v){
 if(typeof v==="string")return /^data:(?!text\/)/i.test(v)||/^blob:/i.test(v);
 if(Array.isArray(v))return v.some(mediaLike);
 return obj(v)&&Object.entries(v).some(([k,x])=>(/^(photos?|images?|blobs?|attachments?|imageData|base64)$/i.test(k)&&x!==null&&x!==""&&(!Array.isArray(x)||x.length>0))||mediaLike(x));
}
const optional=(value,check)=>value===undefined||check(value);
const str=value=>typeof value==="string";
const ownMap=(value,check)=>obj(value)&&Object.values(value).every(check);
const list=(value,check)=>Array.isArray(value)&&value.every(check);
const finite=Number.isFinite;
const positiveInt=x=>Number.isSafeInteger(x)&&x>0;
const atom=x=>obj(x);
const strings=x=>list(x,str);
const point=p=>obj(p)&&finite(p.x)&&finite(p.y);
const stroke=s=>obj(s)&&["pen","highlight"].includes(s.mode)&&list(s.points,point)&&
 optional(s.width,finite)&&optional(s.color,str)&&optional(s.uid,str);
const quote=q=>obj(q)&&CANON.test(q.id??"")&&positiveInt(q.number)&&optional(q.after,str)&&optional(q.color,str)&&optional(q.instance,str);
const body=b=>obj(b)&&str(b.id)&&str(b.reference)&&str(b.text);
const question=q=>obj(q)&&str(q.id)&&str(q.reference)&&str(q.question)&&str(q.answer);
function genuineV2(s){
 // An actual Cornell state has note geometry, named blocks, typed text, and separate ink surfaces.
 // Validate known shapes without coercing values, clamping coordinates, or dropping unknown fields.
 return Number.isFinite(s.notesHeight)&&s.notesHeight>=32&&Array.isArray(s.blocks)&&s.blocks.length>0&&
  s.blocks.every((b,i)=>b===(i?"note-"+i:"note"))&&ownMap(s.text,str)&&s.blocks.every(b=>Object.hasOwn(s.text,b))&&
  ownMap(s.ink,v=>list(v,stroke))&&Array.isArray(s.ink.scripture)&&s.blocks.every(b=>Array.isArray(s.ink[b]))&&
  optional(s.recordTitle,str)&&optional(s.updatedAt,x=>x===null||positiveInt(x))&&
  ["titles","legacyText","quoteMemos"].every(k=>optional(s[k],v=>ownMap(v,str)))&&
  ["heights","quoteHeights"].every(k=>optional(s[k],v=>ownMap(v,finite)))&&
  ["sizedBlocks","deletedBlocks"].every(k=>optional(s[k],v=>ownMap(v,x=>typeof x==="boolean")))&&
  optional(s.noteMarks,v=>ownMap(v,a=>list(a,atom)))&&
  ["timeline","highlights"].every(k=>optional(s[k],v=>list(v,atom)))&&
  optional(s.manualOrder,strings)&&optional(s.inlineOrder,x=>x===null||strings(x))&&
  optional(s.quotes,x=>list(x,quote))&&optional(s.bulletinBody,x=>list(x,body))&&optional(s.bulletinQuestions,x=>list(x,question));
}
export function isEligibleRow(row){
 return obj(row)&&CANON.test(row.id??"")&&obj(row.state)&&(row.state.version===6||(row.state.version===2&&genuineV2(row.state)))&&
  (!("dirty" in row)||row.dirty===false)&&!row.pending&&!row.conflict&&!row.storageError&&
  Number.isSafeInteger(row.revision)&&row.revision>0&&
  (row.state.trashedAt===null||row.state.trashedAt===undefined)&&!mediaLike(row);
}
export async function prepareOriginals(text){
 if(typeof text!=="string"||text.length>SOURCE_LIMIT||encoder.encode(text).length>SOURCE_LIMIT)throw Error("백업 파일이 너무 큽니다.");
 const root=JSON.parse(text.replace(/^\uFEFF/,""));
 if(!obj(root)||!keysMatch(root,["records","backups","recoveryDrafts"])||!Array.isArray(root.records)||!Array.isArray(root.backups)||
    ("recoveryDrafts" in root&&!Array.isArray(root.recoveryDrafts)))throw Error("Cornell 기기 백업 형식만 지원합니다.");
 if(root.records.length>2500)throw Error("백업 기록 수가 검증 한도를 넘었습니다.");
 const counts={ready:0,trash:0,held:0,duplicate:0,history:root.backups.length+(root.recoveryDrafts?.length??0)};
 const groups=new Map();
 for(const row of root.records){
  if(!obj(row)||!CANON.test(row.id??"")){counts.held++;continue;}
  if(row.state?.trashedAt!==undefined&&row.state?.trashedAt!==null){counts.trash++;continue;}
  const bytes=bytesOf(row);
  const digest=await sha(bytes);
  const group=groups.get(row.id)??new Map();
  if(group.has(digest)){counts.duplicate++;continue;}
  group.set(digest,{bytes,digest,row});
  groups.set(row.id,group);
 }
 const candidates=[];
 for(const g of groups.values()){
  if(g.size!==1){counts.held+=g.size;continue;}
  const [item]=g.values();
  if(!isEligibleRow(item.row)||!item.bytes.length||item.bytes.length>ARCHIVE_BYTES){counts.held++;continue;}
  const sourceVersion=item.row.state.version;
  candidates.push({id:await idFor(item.row.id,item.digest,sourceVersion),payload:item.bytes,digest:item.digest,bytes:item.bytes.length,sourceVersion});
 }
 counts.ready=candidates.length;
 if(counts.ready>=ARCHIVE_LIMIT)throw Error("이 검증판에서는 한 번에 30개까지의 사본을 확인할 수 있습니다.");
 return {counts,candidates};
}
export async function validateOriginal(item){
 if(![2,6].includes(item.sourceVersion)||!HEX.test(item.id??"")||!HEX.test(item.digest??"")||!(item.payload instanceof Uint8Array)||
  item.bytes!==item.payload.length||item.bytes<1||item.bytes>ARCHIVE_BYTES||
  await sha(item.payload)!==item.digest)throw Error("기존 기록 사본의 무결성을 확인하지 못했어요.");
 const row=JSON.parse(decoder.decode(item.payload));
 if(!isEligibleRow(row)||row.state.version!==item.sourceVersion||await idFor(row.id,item.digest,item.sourceVersion)!==item.id)throw Error("지원하는 기존 기록 사본이 아닙니다.");
 return row;
}
export async function createOriginalIfAbsent(io,item){
 await validateOriginal(item);
 let created;
 try {
  created=await io.transaction(item.id,async tx=>{
   const found=await tx.get();
   if(found)return false;
   tx.set(item);return true;
  });
 }catch(error){
  if(!["permission-denied","aborted","already-exists","failed-precondition"].includes(error?.code))throw error;
  const found=await io.read(item.id);
  if(!found)throw error;
  created=false;
 }
 const read=await io.read(item.id);
 if(!read)throw Error("사본을 서버에서 다시 확인하지 못했어요.");
 await validateOriginal(read);
 if(read.id!==item.id||read.digest!==item.digest||read.sourceVersion!==item.sourceVersion||read.bytes!==item.bytes||read.payload.some((b,i)=>b!==item.payload[i]))throw Error("서버 사본이 원본과 다릅니다. 아무 기록도 덮어쓰지 않았어요.");
 return created?"created":"existing";
}
