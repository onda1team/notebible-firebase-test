import {initializeApp} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {initializeAuth,inMemoryPersistence,browserPopupRedirectResolver,GoogleAuthProvider,signInWithPopup,signOut} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {initializeFirestore,memoryLocalCache,Bytes,collection,doc,getDocFromServer,getDocsFromServer,query,limit,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {MAX_RECORDS} from "./sync.mjs";
import {createRecordApi} from "./firebase-data.mjs";

export function openBackend(config){
 const app=initializeApp(config);
 const auth=initializeAuth(app,{persistence:inMemoryPersistence,popupRedirectResolver:browserPopupRedirectResolver});
 const db=initializeFirestore(app,{localCache:memoryLocalCache()});
 const provider=new GoogleAuthProvider();
 provider.setCustomParameters({prompt:"select_account"});
 function notes(uid){
  if(!uid||auth.currentUser?.uid!==uid)throw Error("같은 Google 테스트 계정으로 다시 로그인하세요.");
  return collection(db,"yeobaekTestAccounts",uid,"notes");
 }
 const ref=(uid,id)=>doc(notes(uid),id);
 const records=createRecordApi({
  list:async uid=>{
   const r=await getDocsFromServer(query(notes(uid),limit(MAX_RECORDS+1)));
   return r.docs;
  },
  read:(uid,id)=>getDocFromServer(ref(uid,id)),
  transaction:(uid,id,fn)=>{
   const r=ref(uid,id);
   return runTransaction(db, tx=>fn({get:()=>tx.get(r),set:data=>tx.set(r,data)}),{maxAttempts:4});
  },
  bytes:Bytes.fromUint8Array,now:serverTimestamp,
 });
 return {...records,async login(){
  try{
   // Must start within the button's gesture. Do not await configuration or token lookup before this.
   const {user}=await signInWithPopup(auth,provider);
   const check=await getDocFromServer(doc(db,"yeobaekTesters",user.uid));
   if(!user.emailVerified||!check.exists()||check.data().enabled!==true){const e=Error("not approved");e.code="tester/not-allowed";throw e;}
   return {uid:user.uid};
  }catch(e){if(auth.currentUser)try{await signOut(auth)}catch{}throw e;}
 },logout:()=>signOut(auth)};
}
