import { spawn } from 'node:child_process';

export function normalize(raw, now = Date.now()) {
  const limits = raw.rateLimitsByLimitId?.codex ?? raw.rateLimits;
  if (!limits || (limits.limitId && limits.limitId !== 'codex')) throw new Error('Codex quota unavailable');
  const windows = [limits.primary, limits.secondary].filter(Boolean);
  function window(minutes) {
    const w = windows.find(v => v.windowDurationMins === minutes);
    if (!w) return null;
    if (!Number.isFinite(w.usedPercent) || w.usedPercent < 0 || w.usedPercent > 100 || !Number.isFinite(w.resetsAt)) throw new Error('Invalid quota response');
    return {usedPercent:w.usedPercent, remainingPercent:100-w.usedPercent, resetsAt:w.resetsAt};
  }
  const result = {schemaVersion:1, provider:'codex', collectedAt:Math.floor(now/1000), fiveHour:window(300), weekly:window(10080)};
  if (!result.fiveHour && !result.weekly) throw new Error('No recognized quota window');
  return result;
}

export function shouldUpload(previous, next, heartbeat = 300) {
  return !previous || JSON.stringify([previous.fiveHour,previous.weekly]) !== JSON.stringify([next.fiveHour,next.weekly]) || next.collectedAt-previous.collectedAt >= heartbeat;
}

export function readQuota(command='codex', timeout=25000) {
  return new Promise((resolve,reject)=>{
    const p=spawn(command,['app-server'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let buffer='', settled=false;
    const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);p.kill();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>done(new Error('Codex read timeout')),timeout);
    const send=message=>{if(!settled)p.stdin.write(JSON.stringify(message)+'\n');};
    p.on('error',()=>done(new Error('Cannot start Codex')));
    p.on('exit',()=>done(new Error('Codex exited before replying')));
    p.stdin.on('error',()=>done(new Error('Codex pipe closed')));
    p.stderr.resume();
    p.stdout.setEncoding('utf8');
    p.stdout.on('data',chunk=>{
      buffer+=chunk;
      if(buffer.length>2000000)return done(new Error('Codex response too large'));
      let i;
      while((i=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,i);buffer=buffer.slice(i+1);
        let m;try{m=JSON.parse(line);}catch{continue;}
        if(m.id===1){
          if(m.error)return done(new Error('Codex initialize failed'));
          send({method:'initialized'});
          send({id:2,method:'account/rateLimits/read',params:{}});
        }
        if(m.id===2)done(m.error?new Error('Codex quota request failed'):null,m.result);
      }
    });
    send({id:1,method:'initialize',params:{clientInfo:{name:'codex-watch',version:'1.0.0'}}});
  });
}

export async function publish(config, snapshot, token, request=fetch) {
  if(!token)throw new Error('Set CODEX_WATCH_GITHUB_TOKEN locally');
  if(!/^[\w.-]+\/[\w.-]+$/.test(config.repository))throw new Error('Invalid repository');
  const branch=config.branch||'main';
  const path=(config.path||'usage.json').split('/').map(encodeURIComponent).join('/');
  const url=`https://api.github.com/repos/${config.repository}/contents/${path}`;
  const headers={'Authorization':`Bearer ${token}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'codex-watch'};
  const metadata=await request(`https://api.github.com/repos/${config.repository}`,{headers,signal:AbortSignal.timeout(20000)});
  if(!metadata.ok)throw new Error(`GitHub repository HTTP ${metadata.status}`);
  const repository=await metadata.json();
  if(repository.private!==true&&config.allowPublicData!==true)throw new Error('Repository is public; make it private or explicitly set allowPublicData=true');
  // Re-read SHA before every write; never replace an unrelated path after a conflict.
  const current=await request(`${url}?ref=${encodeURIComponent(branch)}`,{headers,signal:AbortSignal.timeout(20000)});
  if(current.status!==404&&!current.ok)throw new Error(`GitHub read HTTP ${current.status}`);
  const sha=current.ok?(await current.json()).sha:undefined;
  const response=await request(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({message:'Update Codex quota snapshot',branch,sha,content:Buffer.from(JSON.stringify(snapshot,null,2)+'\n').toString('base64')})});
  if(!response.ok)throw new Error(`GitHub write HTTP ${response.status}`);
}
