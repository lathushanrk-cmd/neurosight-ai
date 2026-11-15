import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

/** Numerical quantities are webcam-image pixel estimates, NOT physical mm measurements. */
export interface EyeReading {
  irisPx: number | null;
  pupilPx: number | null;
  pupilRatio: number | null;
  pupilQuality: number;
  irisQuality: number;
  gazeX: number | null;
  gazeY: number | null;
  openness: number | null;
  ear: number | null;
  centerX: number | null;
  centerY: number | null;
}
export interface FrameReading {
  time: number;
  left: EyeReading;
  right: EyeReading;
  brightness: number | null;
  eyeLuminance: number | null;
  trackingQuality: number;
  faceDetected: boolean;
  blink: boolean;
}
export interface StoredSample {
  time: number;
  elapsed: number;
  leftIris: number | null;
  rightIris: number | null;
  leftPupil: number | null;
  rightPupil: number | null;
  leftRatio: number | null;
  rightRatio: number | null;
  pupilRatio: number | null;
  irisDifference: number | null;
  gazeX: number | null;
  gazeY: number | null;
  brightness: number | null;
  eyeLuminance: number | null;
  leftEAR: number | null;
  rightEAR: number | null;
  meanEAR: number | null;
  blinkCount60s: number | null;
  trackingQuality: number;
  pupilQuality: number;
  blinkRate: number | null;
  state: 'GREEN' | 'YELLOW' | 'ORANGE' | 'UNAVAILABLE' | 'CALIBRATING';
  reason: string;
}
export interface Baseline {
  created: number;
  durationSeconds: number;
  validFrames: number;
  pupilSamples: number;
  irisMean: number | null;
  irisStd: number | null;
  ratioMean: number | null;
  ratioStd: number | null;
  brightnessMean: number | null;
  blinkRate: number | null;
}
export interface EventLog { id: string; time: number; state: string; detail: string; }
export interface Observation { id: string; time: number; category: string; lighting: string; note: string; }
export interface SessionSummary {
  id: string; start: number; end: number; samples: number;
  reliablePupilSamples: number; blinkCount: number; alerts: number; durationSeconds: number;
}
export type RiskState = 'GREEN' | 'YELLOW' | 'ORANGE' | 'UNAVAILABLE' | 'CALIBRATING';
export const emptyEye = (): EyeReading => ({ irisPx:null, pupilPx:null, pupilRatio:null, pupilQuality:0, irisQuality:0, gazeX:null, gazeY:null, openness:null, ear:null, centerX:null, centerY:null });
export const emptyFrame = (): FrameReading => ({ time:Date.now(), left:emptyEye(),right:emptyEye(),brightness:null,eyeLuminance:null,trackingQuality:0,faceDetected:false,blink:false });
export const clamp = (x:number, a:number, b:number) => Math.max(a,Math.min(b,x));
const mean = (a:number[]) => a.reduce((s,x)=>s+x,0)/a.length;
const distance = (a:{x:number;y:number},b:{x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);
export function stats(items: number[]): { mean: number | null; std: number | null } {
  if (!items.length) return {mean:null,std:null};
  const m=mean(items);
  return {mean:m,std:Math.sqrt(items.reduce((s,x)=>s+(x-m)**2,0)/Math.max(1,items.length-1))};
}
/** Standard six-landmark eyelid Eye Aspect Ratio: average vertical distances / (2 * corner width). */
export function calculateEAR(
  points:NormalizedLandmark[], w:number, h:number, ids:readonly [number,number,number,number,number,number]
):number|null {
  const [outer,upperOuter,upperInner,inner,lowerInner,lowerOuter]=ids;
  if(ids.some(i=>!points[i]||!Number.isFinite(points[i].x)||!Number.isFinite(points[i].y)))return null;
  const p=(i:number)=>({x:points[i].x*w,y:points[i].y*h});
  const width=distance(p(outer),p(inner));
  if(width<4)return null;
  return (distance(p(upperOuter),p(lowerOuter))+distance(p(upperInner),p(lowerInner)))/(2*width);
}

const averageAvailable = (v:(number|null)[]): number|null => {
  const x=v.filter((a):a is number => a!==null && Number.isFinite(a));
  return x.length?mean(x):null;
};

/** Pixel segmentation in the iris ROI: never derive pupil diameter from the iris landmarks alone. */
export function segmentPupil(
  frame: CanvasRenderingContext2D,
  cx:number, cy:number, radius:number
): {diameter:number|null; quality:number; reason:string} {
  if (radius < 10) return {diameter:null,quality:0,reason:'Iris too small in camera pixels'};
  const r=Math.ceil(radius*.85), x=Math.round(cx)-r,y=Math.round(cy)-r;
  if(x<0||y<0||x+2*r+1>=frame.canvas.width||y+2*r+1>=frame.canvas.height)
    return {diameter:null,quality:0,reason:'Eye is at image edge'};
  let img:ImageData;
  try { img=frame.getImageData(x,y,2*r+1,2*r+1); }
  catch { return {diameter:null,quality:0,reason:'Unable to inspect iris pixels'}; }
  const w=img.width,h=img.height;
  const lum=new Float32Array(w*h);
  const circle:number[]=[];const center:number[]=[];const surround:number[]=[];
  let glare=0;
  for(let j=0;j<h;j++) for(let i=0;i<w;i++) {
    const p=(j*w+i)*4;
    const v=.2126*img.data[p]+.7152*img.data[p+1]+.0722*img.data[p+2];
    const k=j*w+i;lum[k]=v;
    const rr=Math.hypot(x+i-cx,y+j-cy)/radius;
    if(rr<.76){ circle.push(v); if(v>240) glare++; }
    if(rr<.22)center.push(v);
    if(rr>.41&&rr<.67)surround.push(v);
  }
  if(center.length<5||surround.length<15||circle.length<45)
    return {diameter:null,quality:0,reason:'Insufficient iris pixels'};
  center.sort((a,b)=>a-b); surround.sort((a,b)=>a-b);
  const med=(s:number[])=>s[Math.floor(s.length/2)];
  const c=med(center),s=med(surround),contrast=s-c;
  if (contrast<16||c>135 || s<40)
    return {diameter:null,quality:0,reason:'Pupil boundary has insufficient image contrast'};
  if(glare/circle.length>.12)
    return {diameter:null,quality:0,reason:'Eye glare disrupts pupil segmentation'};
  const threshold=c+Math.min(contrast*.52,37);
  // Seed at the darkest patch close to the expected iris centre, then connected flood-fill.
  let seed=-1,best=999;
  for(let j=1;j<h-1;j++)for(let i=1;i<w-1;i++){
    const d=Math.hypot(x+i-cx,y+j-cy);
    if(d>radius*.22)continue;
    const k=j*w+i;
    if(lum[k]<best){best=lum[k];seed=k;}
  }
  if(seed<0||best>threshold) return {diameter:null,quality:0,reason:'No dark central pupil region found'};
  const visited=new Uint8Array(w*h), stack=[seed];visited[seed]=1;
  let area=0,sumX=0,sumY=0,minX=w,minY=h,maxX=0,maxY=0;
  while(stack.length){
    const k=stack.pop()!;const ix=k%w,iy=Math.floor(k/w);
    if(lum[k]>threshold||Math.hypot(x+ix-cx,y+iy-cy)>radius*.76)continue;
    area++;sumX+=x+ix;sumY+=y+iy;minX=Math.min(minX,ix);maxX=Math.max(maxX,ix);minY=Math.min(minY,iy);maxY=Math.max(maxY,iy);
    for(const nk of [k-1,k+1,k-w,k+w]) {
      if(nk<0||nk>=w*h||visited[nk])continue;
      const nx=nk%w,ny=Math.floor(nk/w);
      if(Math.abs(nx-ix)+Math.abs(ny-iy)!==1)continue;
      visited[nk]=1;stack.push(nk);
    }
  }
  if(area<18)return {diameter:null,quality:0,reason:'Dark pupil region too small to resolve'};
  const pr=Math.sqrt(area/Math.PI),relative=pr/radius;
  const centerOffset=Math.hypot(sumX/area-cx,sumY/area-cy)/radius;
  const boxRatio=(maxX-minX+1)/(maxY-minY+1);
  const fill=area/((maxX-minX+1)*(maxY-minY+1));
  if(relative<.15||relative>.68||centerOffset>.26||boxRatio<.58||boxRatio>1.65||fill<.44)
    return {diameter:null,quality:0,reason:'Segmented dark region is not a plausible pupil'};
  const q=clamp(.35+contrast/100 + Math.min(radius,22)/90-centerOffset*.5,0,1);
  if(q<.55)return {diameter:null,quality:q,reason:'Low pupil segmentation quality'};
  return {diameter:pr*2,quality:q,reason:'Pixel-contrast pupil region estimate'};
}

/** Landmark indices: 468-472 subject right iris, 473-477 subject left iris. */
export function readFace(
  points:NormalizedLandmark[],ctx:CanvasRenderingContext2D, w:number,h:number,
  blink:boolean
):FrameReading {
  const p=(id:number)=>({x:points[id].x*w,y:points[id].y*h});
  function readEye(irisCenter:number, irisRing:number[], cornerA:number,cornerB:number,upper:number,lower:number,earIds:readonly [number,number,number,number,number,number]):EyeReading {
    if(points.length<478)return emptyEye();
    const centre=p(irisCenter);
    const ring=irisRing.map(p);
    const diameter=(distance(ring[0],ring[2])+distance(ring[1],ring[3]))/2;
    const radius=diameter/2;
    const left=p(cornerA),right=p(cornerB);
    const eyeWidth=distance(left,right);
    const openness=eyeWidth>0?distance(p(upper),p(lower))/eyeWidth:null;
    const gazeX=eyeWidth>0?clamp((centre.x-Math.min(left.x,right.x))/(Math.abs(left.x-right.x)),0,1):null;
    const gazeY=openness!==null?clamp((centre.y-p(upper).y)/(Math.abs(p(lower).y-p(upper).y)+.00001),-2,3):null;
    const irisQuality=clamp((radius-3)/12,0,1)*(openness!==null&&openness<.11?.25:1);
    const segmented=openness!==null&&openness>=.12?segmentPupil(ctx,centre.x,centre.y,radius):{diameter:null,quality:0,reason:'Blink/closed eyelid'};
    return {irisPx:diameter>3?diameter:null,pupilPx:segmented.diameter,
      pupilRatio:segmented.diameter!==null && diameter>0?segmented.diameter/diameter:null,
      pupilQuality:segmented.quality,irisQuality,gazeX,gazeY,openness,ear:calculateEAR(points,w,h,earIds),
      centerX:centre.x,centerY:centre.y};
  }
  const right=readEye(468,[469,470,471,472],33,133,159,145,[33,160,158,133,153,144]);
  const left=readEye(473,[474,475,476,477],362,263,386,374,[362,385,387,263,373,380]);
  // Average pixel luminance inside each eyelid ROI. This is camera-dependent image brightness,
  // NOT ambient illumination in lux; automatic exposure can change the value.
  function eyelidLuminance(ids:readonly number[]):number|null {
    const region=ids.map(p);
    const x0=Math.max(0,Math.floor(Math.min(...region.map(v=>v.x))));
    const x1=Math.min(w,Math.ceil(Math.max(...region.map(v=>v.x))));
    const y0=Math.max(0,Math.floor(Math.min(...region.map(v=>v.y))));
    const y1=Math.min(h,Math.ceil(Math.max(...region.map(v=>v.y))));
    if(x1-x0<6||y1-y0<3)return null;
    try {
      const image=ctx.getImageData(x0,y0,x1-x0,y1-y0);
      let sum=0,n=0;
      for(let i=0;i<image.data.length;i+=16){
        sum+=.2126*image.data[i]+.7152*image.data[i+1]+.0722*image.data[i+2]; n++;
      }
      return n?sum/n:null;
    } catch {return null;}
  }
  const eyeLuminance=averageAvailable([
    right.openness!==null&&right.openness>=.12?eyelidLuminance([33,160,158,133,153,144]):null,
    left.openness!==null&&left.openness>=.12?eyelidLuminance([362,385,387,263,373,380]):null
  ]);
  // A general scene brightness proxy taken from a small patch on the forehead. This is not a lux measurement.
  const fp=p(10);const patch=12;
  let brightness:null|number=null;
  if(fp.x>patch&&fp.y>patch&&fp.x<w-patch&&fp.y<h-patch){
    try {
      const a=ctx.getImageData(Math.round(fp.x)-patch,Math.round(fp.y)-patch,patch*2,patch*2).data;
      let total=0,n=0;
      for(let i=0;i<a.length;i+=16){total+=.2126*a[i]+.7152*a[i+1]+.0722*a[i+2];n++;}
      brightness=total/n;
    } catch { /* May be unavailable in protected environments. */ }
  }
  return {time:Date.now(),left,right,brightness,eyeLuminance,
    trackingQuality:clamp((left.irisQuality+right.irisQuality)/2,0,1),faceDetected:true,blink};
}

export function createSample(f:FrameReading,started:number,blinkRate:number|null,state:RiskState,reason:string,blinkCount60s:number|null=null):StoredSample{
  const l=f.left,r=f.right;
  return {time:f.time,elapsed:Math.max(0,Math.round((f.time-started)/1000)),
    leftIris:l.irisPx,rightIris:r.irisPx,leftPupil:l.pupilPx,rightPupil:r.pupilPx,
    leftRatio:l.pupilRatio,rightRatio:r.pupilRatio,pupilRatio:averageAvailable([l.pupilRatio,r.pupilRatio]),
    irisDifference:l.irisPx!==null&&r.irisPx!==null?Math.abs(l.irisPx-r.irisPx):null,
    gazeX:averageAvailable([l.gazeX,r.gazeX]),gazeY:averageAvailable([l.gazeY,r.gazeY]),
    brightness:f.brightness,eyeLuminance:f.eyeLuminance,
    leftEAR:l.ear,rightEAR:r.ear,meanEAR:averageAvailable([l.ear,r.ear]),blinkCount60s,
    trackingQuality:f.trackingQuality,
    pupilQuality:averageAvailable([l.pupilQuality||null,r.pupilQuality||null])??0,
    blinkRate,state,reason};
}
export function computeBaseline(samples:StoredSample[],seconds:number,blinkCount:number):Baseline {
  const iris=samples.flatMap(s=>[s.leftIris,s.rightIris]).filter((v):v is number=>v!==null);
  const ratio=samples.map(s=>s.pupilRatio).filter((v):v is number=>v!==null&&v>0);
  const bright=samples.map(s=>s.brightness).filter((v):v is number=>v!==null);
  const a=stats(iris),b=stats(ratio),c=stats(bright);
  return {created:Date.now(),durationSeconds:seconds,validFrames:samples.filter(s=>s.trackingQuality>=.2 && (s.leftIris!==null||s.rightIris!==null)).length,
    pupilSamples:ratio.length,irisMean:a.mean,irisStd:a.std,ratioMean:ratio.length>=12?b.mean:null,
    ratioStd:ratio.length>=12?b.std:null,brightnessMean:c.mean,blinkRate:seconds>0?blinkCount/seconds*60:null};
}

export interface DetectorState { consecutive:number; normal:number; risk:'GREEN'|'YELLOW'|'ORANGE'; }
export interface DetectorResult { state:RiskState;reason:string;next:DetectorState;deviation:number|null; }
export const initialDetector=():DetectorState=>({consecutive:0,normal:0,risk:'GREEN'});
export function evaluateAnomaly(s:StoredSample,base:Baseline|null,current:DetectorState,
  sensitivity:'low'|'balanced'|'high',lightingRecentlyChanged:boolean):DetectorResult {
  const state={...current};
  // An interruption breaks the 'consecutive usable samples' streak. It is not a normal reading.
  const neutral=(reason:string):DetectorResult=>({state:'UNAVAILABLE',reason,next:initialDetector(),deviation:null});
  if(!base)return neutral('Calibrate a personal baseline to enable comparisons.');
  if(s.trackingQuality<.38)return neutral('Face/iris tracking quality is insufficient; no assessment.');
  if(base.ratioMean===null)return neutral('Pupil boundary was not reliably measurable during baseline; anomaly assessment unavailable.');
  if(s.pupilRatio===null||s.pupilQuality<.55)return neutral('Pupil region cannot be estimated reliably; not assessed.');
  if(lightingRecentlyChanged||
    (base.brightnessMean!==null&&s.brightness!==null&&Math.abs(s.brightness-base.brightnessMean)>28))
    return neutral('Lighting/camera exposure differs from baseline; comparisons suspended.');
  const delta=s.pupilRatio-base.ratioMean;
  const deviation=Math.abs(delta)/Math.max(.025,base.ratioStd??0);
  const threshold={low:3.25,balanced:2.6,high:2.05}[sensitivity];
  const unusual=deviation>=threshold && Math.abs(delta)>=.055;
  if(unusual){state.consecutive++;state.normal=0;}
  else{state.normal++;if(state.normal>=5){state.consecutive=0;state.risk='GREEN';}}
  if(state.consecutive>=12)state.risk='ORANGE';
  else if(state.consecutive>=4&&state.risk!=='ORANGE')state.risk='YELLOW';
  if(state.risk==='GREEN')return {state:'GREEN',reason:'Usable pupil estimates are broadly consistent with the personal baseline.',next:state,deviation};
  if(!unusual)return {state:state.risk,reason:`Earlier unusual pattern remains flagged while waiting for recovery (${state.normal}/5 normal usable samples). Non-diagnostic.`,next:state,deviation};
  const trend=delta>=0?'larger':'smaller';
  return {state:state.risk,reason:`Pupil-to-iris ratio ${trend} than baseline for ${state.consecutive} consecutive usable samples (${deviation.toFixed(1)} normalized deviations). Non-diagnostic.`,next:state,deviation};
}

export const pretty = (n:number|null|undefined,decimals=1):string => n===null||n===undefined||!Number.isFinite(n)?'—':n.toFixed(decimals);
export const fmtTime = (s:number):string => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
export function csvExport(samples:StoredSample[],events:EventLog[],observations:Observation[]):string {
  const records=[
    ...samples.map(s=>({kind:'measurement',timestamp:new Date(s.time).toISOString(),...s})),
    ...events.map(e=>({kind:'alert',timestamp:new Date(e.time).toISOString(),...e})),
    ...observations.map(o=>({kind:'observation',timestamp:new Date(o.time).toISOString(),...o}))
  ];
  const keys=['kind','timestamp',...new Set(records.flatMap(o=>Object.keys(o)).filter(k=>k!=='kind'&&k!=='timestamp'))];
  const val=(value:unknown)=>`"${String(value===null||value===undefined?'':value).replaceAll('"','""')}"`;
  return '\ufeff'+[keys.join(','),...records.map(o=>keys.map(k=>val((o as Record<string,unknown>)[k])).join(','))].join('\r\n');
}
