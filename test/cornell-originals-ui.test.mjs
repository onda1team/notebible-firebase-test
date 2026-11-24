import test from "node:test";
import assert from "node:assert/strict";
import {installCornellOriginals} from "../docs/cornell-originals-ui.mjs";
import {validateOriginal} from "../docs/cornell-originals.mjs";

test("a two-candidate file writes no record until choice, then writes only that one",async()=>{
 class E {
  constructor(tag){this.tag=tag;this.children=[];this.value="";}
  replaceChildren(...child){this.children=child;}
  append(child){this.children.push(child);}
 }
 const ids=["cornell-originals","original-list","original-file","original-select","original-confirm","original-list-button","original-row","original-row-wrap","original-status","original-plan"];
 const e=Object.fromEntries(ids.map(k=>[k,new E(k)]));
 globalThis.document={getElementById:k=>e[k],createElement:tag=>new E(tag)};
 const saved=new Map(),writes=[],owner="synthetic-owner";
 const v=installCornellOriginals({listOriginals:async uid=>{assert.equal(uid,owner);return [...saved.values()]},
  writeOriginal:async(uid,row)=>{assert.equal(uid,owner);writes.push((await validateOriginal(row)).id);saved.set(row.id,row);return "created";}});
 v.setOwner(owner);
 const bytes=JSON.stringify({records:["GEN1","GEN2"].map(id=>({id,dirty:false,revision:1,state:{version:2,blocks:["note"],notesHeight:100,text:{note:"가상"},ink:{note:[],scripture:[]}}})),backups:[]});
 e["original-file"].files=[{size:bytes.length,text:async()=>bytes}];
 await e["original-file"].onchange();
 assert.match(e["original-plan"].textContent,/보관 후보 2건/);
 assert.equal(e["original-row"].value,"");assert.equal(e["original-confirm"].disabled,true);
 await e["original-confirm"].onclick();assert.equal(writes.length,0);
 e["original-row"].value=e["original-row"].children[2].value;e["original-row"].onchange();
 assert.equal(e["original-confirm"].disabled,false);
 await e["original-confirm"].onclick();assert.deepEqual(writes,["GEN2"]);
 assert.match(e["original-status"].textContent,/사본 1건/);
 assert.equal(e["original-list"].children.length,1);
 await e["original-confirm"].onclick();assert.deepEqual(writes,["GEN2"]);
 v.setOwner(null);assert.equal(e["original-list"].children.length,0);assert.equal(e["cornell-originals"].hidden,true);
 delete globalThis.document;
});
