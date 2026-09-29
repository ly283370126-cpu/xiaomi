import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {normalize,shouldUpload,readQuota,publish} from './core.mjs';
const root=new URL('./',import.meta.url);
const local=process.argv.includes('--local');
const once=process.argv.includes('--once');
const cfg=JSON.parse(await readFile(new URL('config.json',root),'utf8').catch(e=>{if(e.code==='ENOENT'&&local)return '{}';throw new Error('Missing or unreadable config.json');}));
const interval=Math.max(60,Number(cfg.intervalSeconds)||60);
async function run(){
  const snapshot=normalize(await readQuota(cfg.codexCommand));
  if(local){await writeFile(new URL('usage.json',root),JSON.stringify(snapshot,null,2));console.log(JSON.stringify(snapshot));return;}
  let previous=null;
  try{previous=JSON.parse(await readFile(new URL('state.json',root),'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('Invalid local state');}
  if(!shouldUpload(previous,snapshot,Math.max(60,Number(cfg.heartbeatSeconds)||300))){console.log('Unchanged');return;}
  await publish(cfg,snapshot,process.env.CODEX_WATCH_GITHUB_TOKEN);
  const temporary=new URL('state.json.tmp',root);
  await writeFile(temporary,JSON.stringify(snapshot));await rename(temporary,new URL('state.json',root));
  console.log('Quota snapshot uploaded');
}
do{
  try{await run();}catch(e){console.error(e.message==='fetch failed'?'Network request failed':e.message);if(once)process.exitCode=1;}
  if(!once)await new Promise(r=>setTimeout(r,interval*1000));
}while(!once);
