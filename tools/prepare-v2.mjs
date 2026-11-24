import {readFile,writeFile} from "node:fs/promises";
const file=new URL("../docs/sync.mjs",import.meta.url);
const old=await readFile(file,"utf8");
if(!old.includes('const VERSION = "v1";'))throw Error("Only a version-1 workspace can advance to test v2.");
await writeFile(file,old.replace('const VERSION = "v1";','const VERSION = "v2";'));
console.log("Only the visible version marker changed. Run node --test and review git diff before any authorized deploy.");
