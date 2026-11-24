import test from "node:test";
import assert from "node:assert/strict";
import {prepareOriginals,validateOriginal,createOriginalIfAbsent} from "../docs/cornell-originals.mjs";
const state={version:6,recordTitle:"가상 제목",text:{note:"메모", "note-1":"둘째"},titles:{note:"제목"},blocks:["note","note-1"],updatedAt:123000,quoteMemos:{qa:"가상 말씀 카드 메모"},quotes:[{id:"JHN1",number:7,key:"qa"}],ink:{note:[{mode:"pen",width:3,points:[{x:.34,y:.45}]}],scripture:[{mode:"highlight",points:[{x:.6,y:.3}]}]},highlights:[{verse:7,start:3,end:8,quote:"예시"}],bulletinBody:[{text:"가상 주보"}],bulletinQuestions:[{question:"질문",answer:"답변",reference:"시편"}], timeline:["a","b"],future:{bool:true}};
const row={id:"GEN1",revision:3,state,dirty:false};
const render=(...records)=>JSON.stringify({records,backups:[]});
test("six-shape eligibility, metadata preserved, stable IDs across key order and exact repeat",async()=>{
 const each={state,id:row.id,revision:row.revision,dirty:false};
 const out=await prepareOriginals(render(row,each,{...row,id:"GEN2",state:{...state,trashedAt:1}},{...row,id:"GEN3",dirty:true}));
 assert.deepEqual(out.counts,{ready:1,trash:1,held:1,duplicate:1,history:0});
 assert.deepEqual(await validateOriginal(out.candidates[0]),row);
 assert.equal((await prepareOriginals(render(each))).candidates[0].id,out.candidates[0].id);
 assert.notEqual((await prepareOriginals(render({...row,revision:4}))).candidates[0].id,out.candidates[0].id);
});
test("unknown envelope, conflict, unsupported old versions, media and capacity fail closed",async()=>{
 await assert.rejects(prepareOriginals(JSON.stringify({format:"yeobaek-notebook",version:1,records:[],backups:[]})));
 const out=await prepareOriginals(render(row,{...row,revision:5},{...row,id:"GEN3",conflict:{}},{...row,id:"GEN4",state:{...state,version:2}},{...row,id:"GEN5",state:{...state,future:"data:image/png;base64,Zml4"}}));
 assert.equal(out.candidates.length,0);
 assert.equal(out.counts.held,5);
 const tooBig=await prepareOriginals(render({...row,state:{...state,large:"가".repeat(270000)}}));
 assert.equal(tooBig.counts.held,1);
});
test("immutable write: duplicate or race only accepted after exact readback; corrupt documents never replaced",async()=>{
 let value=null,count=0,reject=false; const [item]=(await prepareOriginals(render(row))).candidates;
 const io={read:async()=>value,transaction:async (id,fn)=>{
  if(reject){const e=Error("race");e.code="permission-denied";throw e;}
  return fn({get:async()=>value,set:d=>{value=structuredClone(d);count++;}});
 }};
 assert.equal(await createOriginalIfAbsent(io,item),"created");
 assert.equal(await createOriginalIfAbsent(io,item),"existing");
 reject=true;assert.equal(await createOriginalIfAbsent(io,item),"existing");
 assert.equal(count,1);
 reject=false;value.payload[1]=255;
 await assert.rejects(createOriginalIfAbsent(io,item),/무결성/);assert.equal(count,1);
});

const v2State={
 version:2,notesHeight:320,recordTitle:"가상 제목",updatedAt:1770000000000,
 blocks:["note","note-1"],text:{note:"가상 기록","note-1":"둘째"},titles:{note:"메모"},legacyText:{note:"옛 구조"},
 ink:{scripture:[{mode:"highlight",color:"#123abc",uid:"stroke-1",width:2.943,points:[{x:-.02,y:1.01,time:77,pressure:.3}]}],note:[],"note-1":[{mode:"pen",width:3.5,color:"#121212",points:[{x:.91,y:.3}]}],q:[]},
 heights:{"note-1":90},quoteHeights:{q:98},quoteMemos:{q:"말씀 카드 가상 메모"},
 quotes:[{id:"JHN1",number:7,after:"note",instance:"q",color:"#663388"}],
 highlights:[{verse:7,start:3,end:8,quote:"예시"}],noteMarks:{note:[{start:0,end:1,color:"#ffeeaa"}]},
 bulletinBody:[{id:"body",text:"가상 주보",reference:"가상 장절"}],
 bulletinQuestions:[{id:"qa",question:"가상 질문",answer:"가상 답변",reference:"가상 장절"}],
 timeline:[{id:"t",text:"원본 순서 1"},{id:"t2",text:"원본 순서 2"}],manualOrder:[],inlineOrder:null,sizedBlocks:{note:true},deletedBlocks:{},unfamiliarExtension:{yes:1}
};
const v2={id:"GEN2",revision:9,dirty:false,state:v2State};
test("genuine numeric Cornell v2 keeps exact rich row; no conversion to v6 or clamping",async()=>{
 const got=await prepareOriginals(render(v2,{...v2,id:"GEN3",state:{...v2State,trashedAt:1}},row));
 assert.deepEqual(got.candidates.map(x=>x.sourceVersion),[2,6]);
 assert.equal(got.counts.trash,1);assert.equal(got.counts.held,0);
 assert.deepEqual(await validateOriginal(got.candidates[0]),v2);
 assert.deepEqual(JSON.parse(new TextDecoder().decode(got.candidates[0].payload)),v2);
 const {createHash}=await import("node:crypto"),old=got.candidates[1];
 assert.equal(old.id,createHash("sha256").update("cornell-sites-v6\0"+row.id+"\0"+old.digest).digest("hex"));
});
test("ambiguous, unsettled or syntactically mislabeled v2 fails closed before any network",async()=>{
 const g=await prepareOriginals(render(v2,{...v2,revision:12},
  {...v2,id:"GEN4",state:{...v2State,version:"2"}},{...v2,id:"GEN5",state:{version:2,note:"not Cornell"}},
  {...v2,id:"GEN6",state:{...v2State,ink:{...v2State.ink,note:[{mode:"pen",points:[{x:"1",y:.4}]}]}}},
  {...v2,id:"GEN7",dirty:true},{...v2,id:"GEN8",state:{...v2State,updatedAt:null,inlineOrder:["note"]}}));
 assert.equal(g.counts.held,6);assert.equal(g.candidates.length,1);
 assert.equal((await validateOriginal(g.candidates[0])).id,"GEN8");
 const mix=await prepareOriginals(render(v2,{...row,id:v2.id}));
 assert.equal(mix.counts.ready,0);assert.equal(mix.counts.held,2);
});
test("tampered digest, payload or sourceVersion does not authorize an archive record",async()=>{
 const [v]=(await prepareOriginals(render(v2))).candidates;
 await assert.rejects(validateOriginal({...v,sourceVersion:6}));
 await assert.rejects(validateOriginal({...v,digest:"0".repeat(64)}));
 const bad=v.payload.slice();bad[10]^=1;
 await assert.rejects(validateOriginal({...v,payload:bad}));
});
