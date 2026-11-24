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
