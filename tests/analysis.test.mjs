import test from 'node:test';
import assert from 'node:assert/strict';
import {stats, computeBaseline, evaluateAnomaly, initialDetector, csvExport, pretty, calculateEAR, createSample, emptyFrame} from '../src/analysis.ts';
const example = (i, ratio=.4) => ({time:1700000000000+i*1000,elapsed:i,leftIris:24,rightIris:24,leftPupil:9,rightPupil:9,leftRatio:ratio,rightRatio:ratio,pupilRatio:ratio,irisDifference:0,gazeX:.5,gazeY:.5,brightness:120,trackingQuality:.9,pupilQuality:.85,blinkRate:15,state:'GREEN',reason:''});
test('statistics use real observations',()=>{
 const x=stats([2,3,4]);assert.equal(x.mean,3);assert.equal(x.std,1);
 assert.deepEqual(stats([]),{mean:null,std:null});assert.equal(pretty(null),'—');
});
test('calibration does not fabricate unavailable pupil baseline',()=>{
 const missing=[...Array(45)].map((_,i)=>({...example(i),pupilRatio:null,leftRatio:null,rightRatio:null}));
 const b=computeBaseline(missing,45,10);
 assert.equal(b.ratioMean,null);assert.equal(b.irisMean,24);assert.equal(b.pupilSamples,0);
});
test('repeated deviations transition green then yellow then orange',()=>{
 const base=computeBaseline([...Array(45)].map((_,i)=>example(i)),45,10);
 assert.equal(base.ratioMean,.4);
 let detector=initialDetector();let result;
 for(let i=0;i<13;i++){result=evaluateAnomaly(example(i,.55),base,detector,'balanced',false);detector=result.next;
  if(i===2)assert.equal(result.state,'GREEN');
  if(i===3)assert.equal(result.state,'YELLOW');
  if(i===11)assert.equal(result.state,'ORANGE');
 }
 assert.equal(result.state,'ORANGE');
 for(let i=0;i<5;i++){result=evaluateAnomaly(example(i,.4),base,detector,'balanced',false);detector=result.next;}
 assert.equal(result.state,'GREEN');
});
test('poor quality, absent measurements and lighting changes suspend assessment',()=>{
 const b=computeBaseline([...Array(45)].map((_,i)=>example(i)),45,5);
 assert.equal(evaluateAnomaly({...example(1),pupilRatio:null},b,initialDetector(),'balanced',false).state,'UNAVAILABLE');
 assert.equal(evaluateAnomaly(example(1,.65),b,initialDetector(),'balanced',true).state,'UNAVAILABLE');
 assert.equal(evaluateAnomaly({...example(1,.65),brightness:200},b,initialDetector(),'balanced',false).state,'UNAVAILABLE');
});
test('CSV safely quotes custom researcher notes',()=>{
 const csv=csvExport([example(0)],[],[{id:'1',time:1700000000000,category:'context',lighting:'stable',note:'a, "quoted" remark'}]);
 assert.ok(csv.includes('"a, ""quoted"" remark"'));
 assert.ok(csv.includes('measurement'));assert.ok(csv.includes('observation'));
});
test('unavailable frames break persistent streak rather than fabricating continuity',()=>{
 const b=computeBaseline([...Array(35)].map((_,i)=>example(i)),35,5);
 let d=initialDetector();
 for(let i=0;i<3;i++)d=evaluateAnomaly(example(i,.55),b,d,'balanced',false).next;
 const missing=evaluateAnomaly({...example(4),pupilRatio:null},b,d,'balanced',false);
 assert.equal(missing.state,'UNAVAILABLE');
 const resumed=evaluateAnomaly(example(5,.55),b,missing.next,'balanced',false);
 assert.equal(resumed.state,'GREEN');
});

test('EAR derives from real six-point eyelid geometry, not a synthetic pupil',()=>{
 const points=Array.from({length:478},()=>({x:0,y:0,z:0}));
 const set=(id,x,y)=>{points[id]={x,y,z:0};};
 set(33,.1,.5);set(133,.3,.5);set(160,.15,.48);set(144,.15,.52);set(158,.25,.48);set(153,.25,.52);
 assert.ok(Math.abs(calculateEAR(points,100,100,[33,160,158,133,153,144])-.2)<1e-9);
 assert.equal(calculateEAR([],100,100,[33,160,158,133,153,144]),null);
});
test('unobserved eye, luminance, and pupil values remain unavailable in sample',()=>{
 const frame=emptyFrame(); const sample=createSample(frame,frame.time, null,'UNAVAILABLE','No visible face',0);
 assert.equal(sample.eyeLuminance,null);assert.equal(sample.meanEAR,null);
 assert.equal(sample.pupilRatio,null);assert.equal(sample.blinkCount60s,0);
});
