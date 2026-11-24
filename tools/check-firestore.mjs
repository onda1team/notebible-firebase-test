// Local Firestore emulator only, no real Google project, no login, no credentials.
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {blank,makeClient} from "../docs/sync.mjs";
import {prepareOriginals,createOriginalIfAbsent,validateOriginal} from "../docs/cornell-originals.mjs";
import {createRecordApi} from "../docs/firebase-data.mjs";
const address=process.env.FIRESTORE_EMULATOR_HOST;
if(!/^127\.0\.0\.1:[1-9]\d{3,4}$/.test(address??""))throw Error("Run this only through a loopback Firestore emulator.");
const [host,port]=address.split(":");
const require=createRequire(process.env.FIREBASE_QA_PACKAGE??import.meta.url);
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const {Bytes,collection,deleteDoc,doc,getDocFromServer,getDocsFromServer,limit,query,runTransaction,serverTimestamp,setDoc}=require("firebase/firestore");
const env=await initializeTestEnvironment({
 projectId:"demo-yeobaek-verify",
 firestore:{host,port:Number(port),rules:await readFile(new URL("../firestore.rules",import.meta.url),"utf8")},
});
try{
 await env.clearFirestore();
 const owner="mock-owner", other="mock-other", unlisted="mock-unlisted";
 const id="10000000-0000-4000-8000-000000000001";
 const notes=(db,uid)=>collection(db,"yeobaekTestAccounts",uid,"notes");
 const row=(db,uid=owner)=>doc(notes(db,uid),id);
 const value=(revision=1,bytes=13)=>({schema:1,revision,payload:Bytes.fromUint8Array(new Uint8Array(bytes)),updatedAt:serverTimestamp()});
 await env.withSecurityRulesDisabled(async a=>{
  const aDb=a.firestore();
  await setDoc(doc(aDb,"yeobaekTesters",owner),{enabled:true});
  await setDoc(doc(aDb,"yeobaekTesters",other),{enabled:true});
 });
 const token={email_verified:true,firebase:{sign_in_provider:"google.com",identities:{}}};
 const db=env.authenticatedContext(owner,token).firestore();
 const foreign=env.authenticatedContext(other,token).firestore();
 const outsider=env.authenticatedContext(unlisted,token).firestore();
 const wrong=env.authenticatedContext(owner,{...token,firebase:{sign_in_provider:"password",identities:{}}}).firestore();
 const unverified=env.authenticatedContext(owner,{...token,email_verified:false}).firestore();
 const anon=env.unauthenticatedContext().firestore();
 await assertSucceeds(getDocFromServer(doc(db,"yeobaekTesters",owner)));
 await assertFails(getDocFromServer(doc(foreign,"yeobaekTesters",owner)));
 await assertFails(setDoc(doc(outsider,"yeobaekTesters",unlisted),{enabled:true}));
 await assertFails(setDoc(row(outsider,unlisted),value()));
 await assertFails(setDoc(row(db),value(2)));
 await assertFails(setDoc(row(db),value(1,0)));
 await assertFails(setDoc(row(db),value(1,800001)));
 await assertSucceeds(setDoc(row(db),value()));
 await assertFails(setDoc(row(db),value()));
 await assertFails(setDoc(row(db),value(3)));
 await assertFails(setDoc(row(db),{...value(2),updatedAt:new Date(0)}));
 await assertSucceeds(setDoc(row(db),value(2)));
 await assertFails(getDocFromServer(row(foreign)));
 await assertFails(setDoc(row(foreign),value(3)));
 assert.equal((await assertSucceeds(getDocsFromServer(query(notes(foreign,other),limit(31))))).size,0);
 assert.equal((await assertSucceeds(getDocsFromServer(query(notes(db,owner),limit(31))))).size,1);
 await assertFails(getDocsFromServer(query(notes(db,owner),limit(32))));
 await assertFails(getDocsFromServer(notes(db,owner)));
 await assertFails(getDocsFromServer(query(notes(foreign,owner),limit(31))));
 await assertFails(getDocFromServer(row(wrong)));
 await assertFails(getDocFromServer(row(unverified)));
 await assertFails(getDocFromServer(row(anon)));
 await assertFails(deleteDoc(row(db)));
 assert.equal((await getDocFromServer(row(db))).data().revision,2);
 console.log("Firestore emulator: owner isolation, verified Google allowlist, size/time/revision bounds, query limit and deny-delete passed (local mock identities).");
 const casId="10000000-0000-4000-8000-000000000009", copy="20000000-0000-4000-8000-000000000002";
 const record={...blank(),title:"v1 synthetic",note:"typed note",bulletin:"주보 합성",ink:[[[0.125,0.1],[0.2,0.45]]]};
  function c(core=makeClient){
    const db=env.authenticatedContext(other,token).firestore();
    const path=p=>collection(db,'yeobaekTestAccounts',p,'notes'), ref=(p,k)=>doc(path(p),k);
    const api=createRecordApi({
     list:async p=>(await getDocsFromServer(query(path(p),limit(31)))).docs,
     read:(p,k)=>getDocFromServer(ref(p,k)),
     transaction:(p,k,fn)=>runTransaction(db,tx=>fn({get:()=>tx.get(ref(p,k)),set:d=>tx.set(ref(p,k),d)}),{maxAttempts:4}),
     bytes:Bytes.fromUint8Array,now:serverTimestamp,
    });
    const s=new Map();const app=core({api,storage:{getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,v)},makeId:()=>copy});
    app.begin({uid:other},'demo-project:/notebibledemo/');return app;
  }
  const a=c(), b=c();
  a.draft(casId,record);assert.equal(await a.save(casId),'saved');
  await b.pull();assert.deepEqual(b.state().entries.find(e=>e.id===casId).payload,record);
  a.draft(casId,{...record,title:'iMac'});b.draft(casId,{...record,title:'mobile'});
  assert.deepEqual((await Promise.all([a.save(casId),b.save(casId)])).sort(),['conflict','saved']);
  const loser=a.state().entries.find(e=>e.id===casId).remote?a:b, two=loser.state().entries.find(e=>e.id===casId);
  assert.notEqual(two.payload.title,two.remote.payload.title);
  assert.equal(two.remote.revision,2);
  assert.equal(loser.copyConflict(casId),copy);assert.equal(await loser.save(copy),'saved');
  const code=await readFile(new URL("../docs/sync.mjs",import.meta.url),'utf8');
  const v2=await import('data:text/javascript;base64,'+Buffer.from(code.replace('const VERSION = "v1";','const VERSION = "v2";')).toString('base64'));
  assert.equal(v2.VERSION,'v2');const d=c(v2.makeClient);await d.pull();
  assert.deepEqual(Object.fromEntries(d.state().entries.filter(e=>e.id!==id).map(x=>[x.id,[x.rev,x.payload.title,x.payload.bulletin,x.payload.ink]])),
    {[casId]:[2,two.remote.payload.title,record.bulletin,record.ink],[copy]:[1,two.payload.title,record.bulletin,record.ink]});
  console.log('Actual local Google Firestore emulator: two isolated SDK clients cross-read, competing revision and both copies, fresh v2 IDs/content all pass.');

  const [original]=(await prepareOriginals(JSON.stringify({records:[{id:"GEN1",revision:4,state:{version:6,recordTitle:"가상 Cornell 제목",quotes:[{id:"JHN9",number:2}],quoteMemos:{a:"가상 주석"},ink:{note:[{mode:"pen",width:2,points:[{x:.9,y:.28}]}]},bulletinQuestions:[{question:"가상 질문",answer:"가상 응답"}]}}],backups:[]}))).candidates;
  const orig=(d,who=owner,id=original.id)=>doc(d,"yeobaekTestAccounts",who,"cornellOriginals",id);
  const originalValue=item=>({schema:1,sourceVersion:6,digest:item.digest,bytes:item.bytes,payload:Bytes.fromUint8Array(item.payload),createdAt:serverTimestamp()});
  const asOriginal=snap=>snap.exists()?{id:snap.id,digest:snap.data().digest,bytes:snap.data().bytes,payload:snap.data().payload.toUint8Array()}:null;
  const asIO=d=>({read:async key=>asOriginal(await getDocFromServer(orig(d,owner,key))),
   transaction:(key,fn)=>runTransaction(d, tx=>fn({get:async()=>asOriginal(await tx.get(orig(d,owner,key))),set:item=>tx.set(orig(d,owner,key),originalValue(item))}),{maxAttempts:4})});
  const db2=env.authenticatedContext(owner,token).firestore();
  assert.deepEqual((await Promise.all([createOriginalIfAbsent(asIO(db),original),createOriginalIfAbsent(asIO(db2),original)])).sort(),["created","existing"]);
  assert.equal((await validateOriginal(await asIO(db2).read(original.id))).state.quoteMemos.a,"가상 주석");
  assert.equal(await createOriginalIfAbsent(asIO(db2),original),"existing");
  await assertFails(getDocFromServer(orig(foreign)));
  await assertFails(getDocFromServer(orig(anon)));
  await assertFails(getDocFromServer(orig(unverified)));
  await assertFails(getDocFromServer(orig(outsider,unlisted)));
  await assertFails(getDocsFromServer(query(collection(outsider,"yeobaekTestAccounts",unlisted,"cornellOriginals"),limit(31))));
  await assertFails(setDoc(orig(outsider,unlisted),originalValue(original)));
  await assertFails(setDoc(orig(foreign),originalValue(original)));
  await assertFails(setDoc(orig(db),originalValue(original)));
  await assertFails(deleteDoc(orig(db)));
  await assertFails(setDoc(orig(db,owner,"b".repeat(64)),{...originalValue(original),bytes:original.bytes+1}));
  await assertFails(setDoc(orig(db,owner,"b".repeat(64)),{...originalValue(original),extra:"x"}));
  await assertFails(getDocsFromServer(collection(db,"yeobaekTestAccounts",owner,"cornellOriginals")));
  await assertFails(getDocsFromServer(query(collection(foreign,"yeobaekTestAccounts",owner,"cornellOriginals"),limit(31))));
  const result=await assertSucceeds(getDocsFromServer(query(collection(db,"yeobaekTestAccounts",owner,"cornellOriginals"),limit(31))));
  assert.equal(result.size,1);
  assert.deepEqual((await getDocFromServer(row(db))).data().revision,2);
  console.log("Cornell originals: exact structural archive roundtrip, duplicate concurrent import, deny cross-UID/anonymous/update/delete/malformed create, original notes unchanged.");
}finally{
 await env.cleanup();
}
