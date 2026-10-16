import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { researchVersion } from '../js/post-research-schema.js';

const {values}=parseArgs({options:{input:{type:'string'},credentials:{type:'string'},apply:{type:'boolean'},api:{type:'string',default:'https://playtrace-api.neorgon.workers.dev/api/v1'}}});
if(!values.input)throw new Error('Use --input /private/study/classifications.json [--apply --credentials /private/secrets.json].');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),input=path.resolve(values.input);
if(input===root||input.startsWith(root+path.sep))throw new Error('Keep source-level research outside the website repository.');
const cache=JSON.parse(await fs.readFile(input,'utf8'));
if(cache.version!==researchVersion||!cache.entries||Array.isArray(cache.entries))throw new Error('Expected a versioned local study cache.');
const entries=Object.values(cache.entries);
if(!entries.length||entries.length>500)throw new Error('Use a bounded study with 1–500 entries.');
if(!values.apply){console.log(JSON.stringify({entries:entries.length,mode:'preview',note:'Imports private drafts only; source fingerprints are checked by the server. No Jev requests.'}));}
else{
  if(!values.credentials)throw new Error('Supply a private credential file, never a token argument.');
  const {OPERATOR_TOKEN}=JSON.parse(await fs.readFile(values.credentials,'utf8'));
  const api=new URL(values.api);if(api.protocol!=='https:'||api.username||api.password||api.search||api.hash)throw new Error('Use an HTTPS API URL.');
  if(!OPERATOR_TOKEN)throw new Error('Operator credential is missing.');
  let imported=0,skipped=0;
  for(let i=0;i<entries.length;i+=20){
    const response=await fetch(api.href.replace(/\/$/,'')+'/admin/campaign',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${OPERATOR_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({action:'import-post-research',options:{version:researchVersion,entries:entries.slice(i,i+20)}})});
    if(!response.ok)throw new Error(`Import stopped at batch ${i/20+1}, HTTP ${response.status}. Re-running preserves matching reviews.`);
    const result=await response.json();imported+=result.imported;skipped+=result.skipped;
    console.log(JSON.stringify({processed:Math.min(i+20,entries.length),imported,skipped}));
  }
}
