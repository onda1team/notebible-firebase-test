import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRecordApi,decodePayload,encodePayload,firebaseConfig} from "../docs/firebase-data.mjs";
import {blank,makeClient,VERSION} from "../docs/sync.mjs";

const uid="ownerOne", second="testerTwo", scope="demo-project:/notebibledemo/";
const id="10000000-0000-4000-8000-000000000001";
const copyId="10000000-0000-4000-8000-000000000002";
const doc={...blank(),ref:"시편 23편",title:"가상 제목",note:"가상 묵상",bulletin:"예시 주보",ink:[[[0.12345,0.6],[0.2,0.3]]]};
const fake=()=>{
 const db=new Map(), allowed=new Set([uid,second]);let hold=null;
 function access(current,path){if(!allowed.has(current)||current!==path)throw Error("permission denied");}
 function snapshot(id,d){return {id,exists:()=>!!d,data:()=>d}}
 function apiFor(current,opts={}){
  const read=(path,id)=>{access(current,path);return snapshot(id,db.get(path+"/"+id));};
  let fail=opts.failOnce;
  return createRecordApi({
   list:async path=>{access(current,path);if(hold)await hold;return [...db].filter(([k])=>k.startsWith(path+"/")).map(([k,d])=>snapshot(k.split("/")[1],d));},
   read:async (path,id)=>{if(fail){fail=false;throw Error("readback interrupted");}return read(path,id);},
   bytes:u8=>({toUint8Array:()=>u8}), now:()=>({toDate:()=>new Date(0)}),
   async transaction(path,id,fn){
    access(current,path); const key=path+"/"+id;
    for(let n=0;n<4;n++){
     const base=db.get(key);let staged;
     const result=await fn({get:async()=>snapshot(id,base),set:d=>{staged=d;}});
     if(staged&&db.get(key)!==base){
      if(opts.rejectStale){const e=Error("revision write refused by rules");e.code="permission-denied";throw e;}
      continue;
     }
     if(staged)db.set(key,staged);
     return result;
    }
    throw Error("too many retries");
   },
  });
 }
 return {apiFor,db,wait:p=>{hold=p}};
};
function local(){const s=new Map();return {getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,v)}}
function client(service,who=uid,opts={}){
 const c=makeClient({api:service.apiFor(who,opts),storage:opts.cache??local(),makeId:()=>copyId});
 c.begin({uid:who},scope);
 return c;
}

test("requires only plausible public project config and rejects a mismatched project",()=>{
 const c={apiKey:"AIza"+ "x".repeat(35),authDomain:"demo-project.firebaseapp.com",projectId:"demo-project",appId:"1:123:web:abcdef",extra:"ignored"};
 assert.deepEqual(Object.keys(firebaseConfig(c)),["apiKey","authDomain","projectId","appId"]);
 assert.throws(()=>firebaseConfig({...c,authDomain:"else.firebaseapp.com"}));
 assert.throws(()=>firebaseConfig({}));
});
test("same record id, title, typed note, bulletin and ink on a second clean client and v2",async()=>{
 const svc=fake(), a=client(svc);
 assert.equal(VERSION,"v1");
 a.draft(id,doc);assert.equal(await a.save(id),"saved");
 const b=client(svc);assert.equal(b.state().entries.length,0);await b.pull();
 assert.deepEqual(b.state().entries[0].payload,doc);
 b.draft(id,{...doc,note:"휴대폰 수정"});assert.equal(await b.save(id),"saved");
 const core=await readFile(new URL("../docs/sync.mjs",import.meta.url),"utf8");
 const upgraded=await import("data:text/javascript;base64,"+Buffer.from(core.replace('const VERSION = "v1";','const VERSION = "v2";')).toString("base64"));
 const fresh=upgraded.makeClient({api:svc.apiFor(uid),storage:local()});fresh.begin({uid},scope);assert.equal(upgraded.VERSION,"v2");
 await fresh.pull();
 assert.deepEqual(fresh.state().entries[0],{id,rev:2,payload:{...doc,note:"휴대폰 수정"},dirty:false,remote:null});
});
test("simultaneous transaction writers preserve a stale client and server without overwrite",async()=>{
 const svc=fake(), a=client(svc,uid,{rejectStale:true}), b=client(svc,uid,{rejectStale:true});
 a.draft(id,doc);await a.save(id);await b.pull();
 a.draft(id,{...doc,title:"맥 제목"});b.draft(id,{...doc,title:"폰 제목"});
 const outcomes=await Promise.all([a.save(id),b.save(id)]);
 assert.deepEqual(outcomes.sort(),["conflict","saved"]);
 const loser=a.state().entries[0].remote?a:b, conflict=loser.state().entries[0];
 assert.equal(conflict.remote.revision,2);
 assert.notEqual(conflict.remote.payload.title,conflict.payload.title);
 assert.equal(loser.copyConflict(id),copyId);
 assert.equal(await loser.save(copyId),"saved");
 assert.equal(svc.db.get(uid+"/"+id).revision,2);
 assert.equal(svc.db.get(uid+"/"+copyId).revision,1);
});
test("a lost server read-back never confirms prematurely; retry safely recognizes exact saved data",async()=>{
 const svc=fake(), a=client(svc,uid,{failOnce:true});
 a.draft(id,doc);await assert.rejects(a.save(id),/interrupted/);
 assert.equal(a.state().entries[0].dirty,true);
 assert.equal(await a.save(id),"saved");assert.equal(svc.db.get(uid+"/"+id).revision,1);
});
test("account-scoped cache and mocked path isolation, no old-test import",async()=>{
 const svc=fake(), cache=local(), a=client(svc,uid,{cache});
 a.draft(id,doc);await a.save(id);
 const b=client(svc,second,{cache});await b.pull();assert.equal(b.state().entries.length,0);
 await assert.rejects(svc.apiFor(second).list(uid),/permission/);
 await assert.rejects(svc.apiFor("anon").save(uid,id,1,doc),/permission/);
 assert.throws(()=>b.importAsCopies(JSON.stringify({format:"yeobaek-sync-staging-v1",entries:[{payload:doc}]})));
 assert.equal(b.importAsCopies(a.exportNotes()),1);assert.equal(b.state().entries[0].id,copyId);
});
test("remote response is not applied when typing or account changes before it completes",async()=>{
 const svc=fake(), a=client(svc), b=client(svc);
 a.draft(id,doc);await a.save(id);await b.pull();
 const release=Promise.withResolvers();svc.wait(release.promise);
 a.draft(id,{...doc,note:"원격 수정"});await a.save(id);
 let editing=false;const task=b.pull(()=>!editing);editing=true;
 b.draft(id,{...doc,note:"미저장 입력",title:"미저장 제목"});release.resolve();
 assert.equal(await task,false);assert.equal(b.state().entries[0].remote,null);
 await b.pull();assert.equal(b.state().entries[0].remote.payload.note,"원격 수정");
 const release2=Promise.withResolvers();svc.wait(release2.promise);
 const old=b.pull();b.stop();b.begin({uid:second},scope);
 release2.resolve();assert.equal(await old,false);assert.equal(b.state().entries.length,0);
});
test("invalid/oversized payload stays client-side and no transaction starts",async()=>{
 const svc=fake();
 const huge={...blank(),passage:"\u0001".repeat(8000),cue:"\u0001".repeat(4000),note:"\u0001".repeat(8000),takeaway:"\u0001".repeat(4000),bulletin:"\u0001".repeat(16000),ink:Array.from({length:150},()=>Array.from({length:280},()=>[0.98765,0.12345]))};
 assert.throws(()=>encodePayload(huge),/너무 커/);
 assert.throws(()=>decodePayload(Uint8Array.from([255])),/encoded data/);
 const a=client(svc);a.draft(id,huge);await assert.rejects(a.save(id),/너무 커/);
 assert.equal(svc.db.size,0);assert.equal(a.state().entries[0].dirty,true);
});
