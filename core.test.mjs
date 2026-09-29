import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize,shouldUpload,publish} from './core.mjs';
const window={usedPercent:25,windowDurationMins:300,resetsAt:2000000000};
test('whitelist fields and select windows by duration',()=>{
 const s=normalize({accountId:'PRIVATE',rateLimits:{secondary:window}},100000);
 assert.equal(s.fiveHour.remainingPercent,75);assert.equal(s.weekly,null);assert.ok(!JSON.stringify(s).includes('PRIVATE'));
});
test('unknown data is never represented as 100 percent',()=>{assert.throws(()=>normalize({rateLimits:{primary:{...window,usedPercent:null}}}));assert.throws(()=>normalize({}));});
test('freshness heartbeat even when usage unchanged',()=>{const a=normalize({rateLimits:{primary:window}},1000000);assert.equal(shouldUpload(a,{...a,collectedAt:1001}),false);assert.equal(shouldUpload(a,{...a,collectedAt:1300}),true);});
test('GitHub conflict is not marked successful',async()=>{await assert.rejects(publish({repository:'a/b'},{},'FAKE',async(url,options)=>options.method?{ok:false,status:409}:{ok:true,status:200,json:async()=>({sha:'old',private:true})}),/409/);});
test('public quota upload requires explicit opt-in',async()=>{let calls=0;await assert.rejects(publish({repository:'a/b'},{},'FAKE',async()=>{calls++;return {ok:true,json:async()=>({private:false})}}),/public/);assert.equal(calls,1);});
test('upload creates missing snapshot with exact data',async()=>{let written;const snapshot=normalize({rateLimits:{primary:window}},100000);await publish({repository:'a/b'},snapshot,'FAKE',async(url,o)=>{if(o.method){written=JSON.parse(o.body);return {ok:true};}return url.includes('/contents/')?{ok:false,status:404}:{ok:true,json:async()=>({private:true})};});assert.deepEqual(JSON.parse(Buffer.from(written.content,'base64').toString()),snapshot);assert.equal(written.sha,undefined);});
