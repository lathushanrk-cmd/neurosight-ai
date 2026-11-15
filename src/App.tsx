import {useCallback,useEffect,useRef,useState} from 'react';
import type {ReactNode,RefObject,ChangeEvent} from 'react';
import type {NormalizedLandmark} from '@mediapipe/tasks-vision';
import {FaceLandmarker,FilesetResolver} from '@mediapipe/tasks-vision';
import {
  Activity,AlertCircle,ArrowDownToLine,ArrowRight,Bell,BellRing,BrainCircuit,
  CalendarClock,Camera,ChartNoAxesCombined,CheckCircle2,ChevronRight,Clock3,
  Database,Eye,FileChartColumnIncreasing,FlaskConical,Gauge,HeartPulse,Info,
  Lightbulb,LockKeyhole,Menu,MonitorPlay,Pause,Play,Plus,RefreshCw,ScanEye,
  ScanFace,Settings2,ShieldCheck,Trash2,TriangleAlert,WifiOff,X
} from 'lucide-react';
import {CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis,Line,LineChart,Legend} from 'recharts';
import {
  computeBaseline,createSample,csvExport,emptyFrame,evaluateAnomaly,fmtTime,initialDetector,
  pretty,readFace,type EventLog,type FrameReading,type Observation,
  type RiskState,type SessionSummary,type StoredSample
} from './analysis';
import {clearAll,defaultSettings,load,save,type Settings,type StoredData} from './storage';

type Tab='dashboard'|'live'|'baseline'|'history'|'research'|'settings';
type ChartMetric='ratio'|'iris'|'brightness';
type OverlayLayers={iris:boolean;pupil:boolean;eyelids:boolean;faceFrame:boolean};
const sections: {id:Tab;title:string;sub:string;icon:typeof Activity}[]=[
  {id:'dashboard',title:'Dashboard',sub:'Monitoring overview',icon:MonitorPlay},
  {id:'live',title:'Live Analysis',sub:'Eye signals',icon:Activity},
  {id:'baseline',title:'Baseline Calibration',sub:'Personal reference',icon:Gauge},
  {id:'history',title:'Historical Analysis',sub:'Time-series & events',icon:ChartNoAxesCombined},
  {id:'research',title:'Research Mode',sub:'Observations & export',icon:FlaskConical},
  {id:'settings',title:'Settings',sub:'Preferences & privacy',icon:Settings2}
];
const fmtDate=(t:number)=>new Date(t).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
function fmtPct(n:number){return `${Math.round(n*100)}%`;}
function saveCSV(content:string,filename:string){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  a.download=filename;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
}
function soundAlert(){
  try{
    const Ctx=window.AudioContext;
    if(!Ctx)return;
    const ctx=new Ctx(); const oscillator=ctx.createOscillator(),gain=ctx.createGain();
    oscillator.type='sine';oscillator.frequency.setValueAtTime(520,ctx.currentTime);
    oscillator.frequency.linearRampToValueAtTime(780,ctx.currentTime+.15);
    gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.055,ctx.currentTime+.03);
    gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.35);
    oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start();oscillator.stop(ctx.currentTime+.36);
    setTimeout(()=>void ctx.close(),850);
  }catch{/* Notification sound is optional. */}
}
function StatePill({state,label}:{state:RiskState|'STOPPED'|'STARTING';label?:string}){
  const scheme=state==='GREEN'?'green':state==='YELLOW'?'yellow':state==='ORANGE'?'orange':state==='CALIBRATING'?'purple':state==='STARTING'?'cyan':'gray';
  const text=label??({GREEN:'Within baseline',YELLOW:'Unusual pattern',ORANGE:'Persistent pattern',UNAVAILABLE:'Not assessed',CALIBRATING:'Calibrating',STOPPED:'Standby',STARTING:'Starting camera'}[state]);
  return <span className={`status-pill ${scheme}`}><span className="status-dot"/>{text}</span>;
}
function Panel({title,eyebrow,action,children,className=''}:{title?:string;eyebrow?:string;action?:ReactNode;children:ReactNode;className?:string}){
  return <section className={`panel ${className}`}>
    {(title||eyebrow||action)&&<div className="panel-head"><div>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}{title&&<h3>{title}</h3>}</div>{action}</div>}
    {children}</section>;
}
function LittleMetric({label,value,unit,icon:Icon,tone='cyan',helper}:{label:string;value:string;unit?:string;icon:typeof Activity;tone?:string;helper?:string}){
  return <div className="little-metric"><div className="metric-top"><span>{label}</span><Icon className={`icon-${tone}`} size={18}/></div><div className="metric-val">{value}{unit&&<span className="metric-unit">{unit}</span>}</div>{helper&&<div className="metric-helper">{helper}</div>}</div>;
}
function QualityBar({quality}:{quality:number}){
  const q=Math.round(quality*100);return <div className="quality-inline"><div className="track"><span style={{width:`${q}%`}}/></div><span>{q}%</span></div>;
}
function TrendChart({samples,metric,height=260,limit=240}:{samples:StoredSample[];metric:ChartMetric;height?:number;limit?:number}){
  const recent=samples.slice(-limit);
  const data=recent.map((s,i)=>({index:i,stamp:new Date(s.time).toLocaleTimeString(),
    left:metric==='ratio'?s.leftRatio:metric==='iris'?s.leftIris:s.brightness,
    right:metric==='ratio'?s.rightRatio:metric==='iris'?s.rightIris:null}));
  if(data.length<2)return <div className="chart-placeholder" style={{height}}><ChartNoAxesCombined size={31}/><strong>No time-series data yet</strong><span>Start monitoring to collect actual camera-derived readings.</span></div>;
  return <div style={{width:'100%',height}}><ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{top:12,right:12,left:-26,bottom:2}}>
      <CartesianGrid stroke="#1d2a40" vertical={false} strokeDasharray="3 6"/>
      <XAxis dataKey="stamp" tick={{fontSize:10,fill:'#677b9a'}} axisLine={false} tickLine={false} minTickGap={42}/>
      <YAxis domain={['auto','auto']} tick={{fontSize:10,fill:'#677b9a'}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>v.toFixed(metric==='ratio'?2:0)}/>
      <Tooltip contentStyle={{background:'#101c30',border:'1px solid #263953',borderRadius:12,fontSize:12,color:'#d8ebff'}} labelStyle={{color:'#8faccc'}} formatter={(v:unknown,name:unknown)=>[typeof v==='number'?v.toFixed(metric==='ratio'?3:1):'—',String(name)]}/>
      <Legend wrapperStyle={{fontSize:11,color:'#96a8c2'}} />
      <Line dataKey="left" name={metric==='brightness'?'Scene brightness':'Left eye'} type="monotone" stroke="#4cdbf5" strokeWidth={2.3} dot={false} connectNulls={false} isAnimationActive={false}/>
      {metric!=='brightness'&&<Line dataKey="right" name="Right eye" type="monotone" stroke="#a08aff" strokeWidth={2.2} dot={false} connectNulls={false} isAnimationActive={false}/>}
    </LineChart>
  </ResponsiveContainer></div>;
}
/** Two dual-axis traces sourced only from timestamped camera/landmark readings. */
function PhysiologicalChart({samples,kind,height=260}:{samples:StoredSample[];kind:'blink'|'luminance';height?:number}){
  const currentSession=samples.at(-1);
  const sessionStart=currentSession?currentSession.time-currentSession.elapsed*1000:null;
  const recent=currentSession&&sessionStart!==null?samples.filter(s=>s.time>=sessionStart-1000 && s.time<=currentSession.time).slice(-120):[];
  const data=recent.map(s=>({
    timestamp:s.elapsed>=0?fmtTime(s.elapsed):new Date(s.time).toLocaleTimeString(),
    primary:kind==='blink'?(s.blinkCount60s??null):(s.eyeLuminance??null),
    secondary:kind==='blink'?(s.meanEAR??null):(s.trackingQuality??null)
  }));
  if(data.length<2)return <div className="chart-placeholder physiological-placeholder" style={{height}}><Activity size={27}/><strong>No genuine measurements yet</strong><span>Start monitoring to build the eye and blink traces.</span></div>;
  const primaryMax=kind==='blink'?Math.max(4,Math.ceil((Math.max(0,...data.map(d=>d.primary??0))+1)/4)*4):255;
  return <div className="phys-chart" style={{height}}><ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{top:12,right:1,left:-8,bottom:5}}>
      <CartesianGrid stroke="#20334b" strokeDasharray="4 4"/>
      <XAxis dataKey="timestamp" minTickGap={35} tick={{fontSize:10,fill:'#8daccd'}} axisLine={{stroke:'#405975'}} tickLine={false}/>
      <YAxis yAxisId="left" orientation="left" domain={[0,primaryMax]} tickCount={5} allowDecimals={kind!=='blink'} tick={{fontSize:10,fill:'#8daccd'}} axisLine={{stroke:'#405975'}} tickLine={false}/>
      <YAxis yAxisId="right" orientation="right" domain={[0,kind==='blink'?.5:1]} tickCount={5} tick={{fontSize:10,fill:'#8daccd'}} axisLine={{stroke:'#405975'}} tickLine={false}/>
      <Tooltip contentStyle={{background:'#101d31',border:'1px solid #284967',borderRadius:10,fontSize:11,color:'#ddedff'}} labelStyle={{color:'#9dc6e1'}} formatter={(value:unknown,name:unknown)=>[typeof value==='number'?value.toFixed(kind==='blink'?2:1):'Unavailable',String(name)]}/>
      <Legend wrapperStyle={{fontSize:10,paddingTop:9,color:'#99b4d5'}}/>
      <Line yAxisId="left" dataKey="primary" name={kind==='blink'?'Blinks (last 60 s)':'Eye-region image luminance (0–255)'} type="monotone" stroke={kind==='blink'?'#4bb9ff':'#26ddf5'} strokeWidth={2.2} dot={false} connectNulls={false} isAnimationActive={false}/>
      <Line yAxisId="right" dataKey="secondary" name={kind==='blink'?'Eye aspect ratio (EAR)':'Tracking quality proxy (0–1)'} type="monotone" stroke={kind==='blink'?'#38e1ac':'#ffbc49'} strokeWidth={2.1} dot={false} connectNulls={false} isAnimationActive={false}/>
    </LineChart>
  </ResponsiveContainer></div>;
}
function ObservationCharts({samples}:{samples:StoredSample[]}){
  return <div className="observation-charts">
    <Panel title="Blink Frequency (60s Rolling) & Aperture"><p className="mini-graph-caption">Blinks detected from eyelid closure · measured six-landmark Eye Aspect Ratio (EAR)</p><PhysiologicalChart samples={samples} kind="blink"/><div className="signal-note"><Info size={14}/> Counts are observed events in the preceding 60 seconds; short blinks can be missed at webcam frame rates.</div></Panel>
    <Panel title="Eye-Region Luminance & Tracking Quality"><p className="mini-graph-caption">Measured camera-pixel brightness (0–255) and heuristic tracking quality (0–1)</p><PhysiologicalChart samples={samples} kind="luminance"/><div className="signal-note"><Info size={14}/> Luminance is not a lux reading; tracking quality is not calibrated model confidence.</div></Panel>
  </div>;
}
const MetricSelector=({metric,onChange}:{metric:ChartMetric;onChange:(v:ChartMetric)=>void})=><div className="segmented">{([['ratio','Pupil ratio'],['iris','Iris size'],['brightness','Brightness']] as const).map(([id,name])=><button key={id} className={metric===id?'selected':''} onClick={()=>onChange(id)}>{name}</button>)}</div>;
function Overlay({videoRef,overlayRef,mirror,active}:{videoRef:RefObject<HTMLVideoElement>;overlayRef:RefObject<HTMLCanvasElement>;mirror:boolean;active:boolean}){
  return <div className={`video-stage ${mirror?'mirrored':''}`}>
    <video className="camera-video" ref={videoRef} autoPlay playsInline muted />
    <canvas className="tracking-overlay" ref={overlayRef}/>
    {!active&&<div className="camera-off"><div className="camera-graphic"><ScanEye size={52} strokeWidth={1.1}/></div><strong>Camera feed inactive</strong><span>Activate your webcam to begin local eye tracking.</span></div>}
    <div className="corners"><i/><i/><i/><i/></div>
  </div>;
}
function drawOverlay(canvas:HTMLCanvasElement,points:NormalizedLandmark[],w:number,h:number,reading:FrameReading,layers:OverlayLayers){
  if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,w,h);
  const plot=(i:number)=>({x:points[i].x*w,y:points[i].y*h});
  const eyeShape=(ids:number[],color:string)=>{
    ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.5,w/550);ctx.beginPath();
    ids.forEach((id,i)=>{const p=plot(id);if(!i)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.closePath();ctx.stroke();
  };
  if(layers.eyelids){
    eyeShape([33,160,158,133,153,144],'rgba(65,221,255,.90)');
    eyeShape([362,385,387,263,373,380],'rgba(167,142,255,.94)');
  }
  if(layers.iris){
  for(const [ids,color] of [[[469,470,471,472],'#4edcf9'],[[474,475,476,477],'#ae8eff']] as const){
    eyeShape([...ids],color);
  }
  for(const [idx,color] of [[468,'#40e4ff'],[473,'#ae9fff']] as const){
    const p=plot(idx);const s=Math.max(6,w/85);
    ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(p.x-s,p.y);ctx.lineTo(p.x+s,p.y);ctx.moveTo(p.x,p.y-s);ctx.lineTo(p.x,p.y+s);ctx.stroke();
    ctx.beginPath();ctx.arc(p.x,p.y,s*1.7,0,2*Math.PI);ctx.stroke();
  }
  }
  if(layers.faceFrame){
    const face=points.slice(0,468);
    const xmin=Math.min(...face.map(p=>p.x*w)), xmax=Math.max(...face.map(p=>p.x*w));
    const ymin=Math.min(...face.map(p=>p.y*h)), ymax=Math.max(...face.map(p=>p.y*h));
    ctx.save();ctx.strokeStyle='rgba(116,171,255,.85)';ctx.setLineDash([8,5]);ctx.lineWidth=2;
    ctx.strokeRect(xmin,ymin,xmax-xmin,ymax-ymin);ctx.restore();
  }
  // A dashed circle is the image-pixel segmentation estimate, NOT a true ground-truth boundary.
  if(layers.pupil) for(const [eye,col] of [[reading.left,'#aaf6f5'],[reading.right,'#d1bdff']] as const){
    if(eye.pupilPx!==null&&eye.centerX!==null&&eye.centerY!==null){
      ctx.save();ctx.strokeStyle=col;ctx.lineWidth=Math.max(1.3,w/950);ctx.setLineDash([3,3]);
      ctx.beginPath();ctx.arc(eye.centerX,eye.centerY,eye.pupilPx/2,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
  }
}

/** Draw an actual webcam crop, never a stock eye or a synthetic pupil. */
function captureEyeImage(video:HTMLVideoElement, reading:FrameReading, side:'left'|'right'):string|null {
  const eye=reading[side];
  if(!reading.faceDetected||eye.centerX===null||eye.centerY===null||eye.irisPx===null||eye.irisPx<=0)return null;
  const diameter=eye.irisPx;
  const cropWidth=Math.min(video.videoWidth,Math.max(95,diameter*7.4));
  const cropHeight=Math.min(video.videoHeight,Math.max(58,diameter*4.7));
  const x=Math.max(0,Math.min(video.videoWidth-cropWidth,eye.centerX-cropWidth/2));
  const y=Math.max(0,Math.min(video.videoHeight-cropHeight,eye.centerY-cropHeight/2));
  const canvas=document.createElement('canvas');canvas.width=336;canvas.height=180;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.drawImage(video,x,y,cropWidth,cropHeight,0,0,canvas.width,canvas.height);
  const ratioX=canvas.width/cropWidth, ratioY=canvas.height/cropHeight;
  const px=(eye.centerX-x)*ratioX, py=(eye.centerY-y)*ratioY;
  ctx.save();ctx.strokeStyle='#45e6ff';ctx.lineWidth=2.5;ctx.shadowColor='#45e6ff';ctx.shadowBlur=6;
  ctx.beginPath();ctx.ellipse(px,py,diameter/2*ratioX,diameter/2*ratioY,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  ctx.strokeStyle='#d5a0ff';ctx.lineWidth=2.3;ctx.setLineDash([5,4]);
  if(eye.pupilPx!==null){ctx.beginPath();ctx.ellipse(px,py,eye.pupilPx/2*ratioX,eye.pupilPx/2*ratioY,0,0,Math.PI*2);ctx.stroke();}
  ctx.setLineDash([]);
  ctx.strokeStyle='#ffffffa9';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px-6,py);ctx.lineTo(px+6,py);ctx.moveTo(px,py-6);ctx.lineTo(px,py+6);ctx.stroke();
  ctx.fillStyle='rgba(4,12,29,.86)';ctx.fillRect(0,146,336,34);
  ctx.font='600 13px system-ui, sans-serif';ctx.fillStyle='#52eaff';ctx.fillText(`Iris ${diameter.toFixed(1)} px`,10,160);
  ctx.fillStyle='#d9abff';ctx.fillText(eye.pupilRatio!==null?`Pupil/iris ${eye.pupilRatio.toFixed(3)}`:'Pupil estimate unavailable',10,175);
  return canvas.toDataURL('image/jpeg',.86);
}
function EyeRegionCard({side,image,eye,running,capturedAt}:{side:'left'|'right';image:string|null;eye:FrameReading['left'];running:boolean;capturedAt:number|null}){
  return <div className="eye-roi-card">
    <div className="eye-roi-heading"><span className={`eye-bullet ${side==='left'?'cyan':'lavender'}`}/><b>{side==='left'?'Left':'Right'} eye · actual webcam crop</b><span className="eye-roi-badge">{running?'LIVE':image?'LAST CAPTURE':'NO FRAME'}</span></div>
    <div className="eye-roi-row"><div className="eye-roi-picture">{image?<img src={image} alt={`${side} eye captured from local webcam with measured iris and estimated pupil outlines`}/>:<div className="roi-empty"><Eye size={27}/><small>No eye image captured</small></div>}</div>
      <div className="eye-roi-stats"><strong>{image?`Iris ${pretty(eye.irisPx,1)} px`:'Unavailable'}</strong><span>Pupil: <b>{pretty(eye.pupilPx,1)}{eye.pupilPx===null?'':' px'}</b></span><span>Ratio: <b>{pretty(eye.pupilRatio,3)}</b></span><span>Landmark quality: <b>{fmtPct(image?eye.irisQuality:0)}</b></span>{capturedAt!==null&&!running&&<small>Frozen at {new Date(capturedAt).toLocaleTimeString()}</small>}</div></div>
  </div>;
}

export default function App(){
  const [tab,setTab]=useState<Tab>('dashboard');
  const [data,setData]=useState<StoredData>(()=>load());
  const dataRef=useRef(data);
  const [running,setRunning]=useState(false);
  const runningRef=useRef(false);
  const [starting,setStarting]=useState(false);
  const [error,setError]=useState('');
  const [frame,setFrame]=useState<FrameReading>(emptyFrame);
  const [lastEyeImages,setLastEyeImages]=useState<{left:string|null;right:string|null}>({left:null,right:null});
  const [lastEyeTime,setLastEyeTime]=useState<number|null>(null);
  const [lastEyeFrame,setLastEyeFrame]=useState<FrameReading|null>(null);
  const lastEyeCapture=useRef(0);
  const [status,setStatus]=useState<RiskState>('UNAVAILABLE');
  const statusRef=useRef<RiskState>('UNAVAILABLE');
  const [statusReason,setStatusReason]=useState('Camera is inactive.');
  const sessionStartRef=useRef<number|null>(null);
  const [seconds,setSeconds]=useState(0);
  const [blinks,setBlinks]=useState(0);
  const blinkTimes=useRef<number[]>([]);
  const [calibrating,setCalibrating]=useState(false);
  const calibrationStart=useRef<number|null>(null);
  const calibrationFrames=useRef<StoredSample[]>([]);
  const [calibrationProgress,setCalibrationProgress]=useState(0);
  const detector=useRef(initialDetector());
  const finishCalibrationRef=useRef<()=>void>(()=>{});
  const [cameras,setCameras]=useState<MediaDeviceInfo[]>([]);
  const [navOpen,setNavOpen]=useState(false);
  const [metric,setMetric]=useState<ChartMetric>('ratio');
  const [historyRange,setHistoryRange]=useState(900);
  const [observationCategory,setObservationCategory]=useState('Attention / behaviour');
  const [lighting,setLighting]=useState('Stable / no reported change');
  const [observationNote,setObservationNote]=useState('');
  const [toast,setToast]=useState('');
  const [confirmClear,setConfirmClear]=useState(false);
  const [trackingLayer,setTrackingLayer]=useState(true);
  const [overlayLayers,setOverlayLayers]=useState<OverlayLayers>({iris:true,pupil:true,eyelids:true,faceFrame:false});
  const videoRef=useRef<HTMLVideoElement>(null);
  const previewVideoRef=useRef<HTMLVideoElement>(null);
  const overlayRef=useRef<HTMLCanvasElement>(null);
  const sampleCanvas=useRef<HTMLCanvasElement|null>(null);
  const modelRef=useRef<FaceLandmarker|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const animationId=useRef(0);
  const lastInference=useRef(0);
  const lastVideoTime=useRef(-1);
  const lastSample=useRef(0);
  const lastSave=useRef(0);
  const lastBlink=useRef(0);
  const blinkClosed=useRef(false);
  const lastLightingNote=useRef(0);
  const sessionBlinkStart=useRef(0);
  const selectedSettings=data.settings;

  const commit=useCallback((update:(prev:StoredData)=>StoredData,persist=true)=>{
    const next=update(dataRef.current);dataRef.current=next;setData(next);
    if(persist&&next.settings.autoSave)save(next);
  },[]);
  const toastMsg=useCallback((message:string)=>{setToast(message);window.setTimeout(()=>setToast(''),3800);},[]);
  const listCameras=useCallback(async()=>{
    try{const all=await navigator.mediaDevices.enumerateDevices();setCameras(all.filter(d=>d.kind==='videoinput'));}
    catch{/* Camera labels may be unavailable before permission. */}
  },[]);
  useEffect(()=>{void listCameras();},[listCameras]);
  // Tracking continues when navigating to other tabs. The processing video is always mounted.
  // The visible webcam preview can safely mount/unmount on the Dashboard.
  useEffect(()=>{
    const preview=previewVideoRef.current;
    if(preview && streamRef.current){
      preview.srcObject=streamRef.current;
      void preview.play().catch(()=>{});
    }
  },[tab,running]);
  useEffect(()=>{
    const t=window.setInterval(()=>{
      if(sessionStartRef.current!==null)setSeconds(Math.floor((Date.now()-sessionStartRef.current)/1000));
      if(calibrationStart.current!==null){
        setCalibrationProgress(Math.min(1,(Date.now()-calibrationStart.current)/(dataRef.current.settings.calibrationSeconds*1000)));
        if(Date.now()-calibrationStart.current>=dataRef.current.settings.calibrationSeconds*1000)finishCalibrationRef.current();
      }
    },250);
    return()=>window.clearInterval(t);
  },[]);

  const stopMonitoring=useCallback(()=>{
    runningRef.current=false;cancelAnimationFrame(animationId.current);
    const end=Date.now();
    if(sessionStartRef.current!==null){
      const start=sessionStartRef.current;
      const sessionItems=dataRef.current.history.filter(s=>s.time>=start);
      const sessionAlerts=dataRef.current.events.filter(e=>e.time>=start && (e.state==='YELLOW'||e.state==='ORANGE'));
      const summary:SessionSummary={id:crypto.randomUUID(),start,end,
        samples:sessionItems.length,reliablePupilSamples:sessionItems.filter(x=>x.pupilRatio!==null).length,
        blinkCount:blinks-sessionBlinkStart.current,alerts:sessionAlerts.length,
        durationSeconds:Math.round((end-start)/1000)};
      commit(p=>({...p,sessions:[summary,...p.sessions].slice(0,100)}),false);
      save(dataRef.current);
    }
    sessionStartRef.current=null;
    setRunning(false);setStarting(false);setSeconds(0);
    calibrationStart.current=null;calibrationFrames.current=[];setCalibrating(false);setCalibrationProgress(0);
    streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null;
    if(videoRef.current){videoRef.current.pause();videoRef.current.srcObject=null;}
    if(overlayRef.current){overlayRef.current.getContext('2d')?.clearRect(0,0,overlayRef.current.width,overlayRef.current.height);}
    modelRef.current?.close();modelRef.current=null;
    // Keep the final real eye crops and their measurements visible after STOP.
    setStatus('UNAVAILABLE');statusRef.current='UNAVAILABLE';
    setStatusReason('Monitoring stopped. No measurements are being collected.');
  },[blinks,commit]);

  // Cleanup on unmount without writing a duplicate session summary.
  useEffect(()=>()=>{runningRef.current=false;cancelAnimationFrame(animationId.current);streamRef.current?.getTracks().forEach(t=>t.stop());modelRef.current?.close();},[]);

  const finishCalibration=useCallback(()=>{
    const collected=calibrationFrames.current;
    const seconds= dataRef.current.settings.calibrationSeconds;
    const baseline=computeBaseline(collected,seconds,Math.max(0,blinkTimes.current.filter(t=>t>calibrationStart.current!).length));
    if(baseline.validFrames<8 || baseline.irisMean===null){
      setError(`Calibration needs at least 8 reliable iris frames (collected ${baseline.validFrames}). No reference saved. Keep both eyes visible, improve lighting, and move a little closer.`);
      toastMsg('Calibration incomplete: insufficient genuine iris readings.');
    }else{
      commit(d=>({...d,baseline}));detector.current=initialDetector();
      toastMsg(baseline.ratioMean===null?'Iris baseline saved. Pupil anomaly monitoring remains unavailable.':'Personal baseline saved. Adaptive monitoring is enabled.');
    }
    calibrationStart.current=null;calibrationFrames.current=[];
    setCalibrating(false);setCalibrationProgress(0);
    setStatus('UNAVAILABLE');setStatusReason(baseline.validFrames<8?'Calibration not saved; improve eye visibility and retry.':baseline.ratioMean===null?'Iris-only baseline saved; webcam cannot resolve pupil contrast sufficiently for anomaly comparison.':'Collecting usable post-calibration pupil estimates.');
  },[commit,toastMsg]);
  finishCalibrationRef.current=finishCalibration;

  const handleSample=useCallback((f:FrameReading)=>{
    const start=sessionStartRef.current;if(start===null)return;
    const blinkWindow=blinkTimes.current.filter(t=>f.time-t>=0 && f.time-t<=60000);
    const duration=Math.min((f.time-start)/1000,60);
    const blinkRate=duration>=15?blinkWindow.length/Math.max(15,duration)*60:null;
    let sample=createSample(f,start,blinkRate,'UNAVAILABLE','',blinkWindow.length);
    if(calibrationStart.current!==null){
      sample={...sample,state:'CALIBRATING',reason:'Gathering a personal reference; anomaly detection is paused.'};
      if(sample.trackingQuality>=.2 && (sample.leftIris!==null||sample.rightIris!==null))calibrationFrames.current.push(sample);
      if(f.time-calibrationStart.current>=dataRef.current.settings.calibrationSeconds*1000)finishCalibration();
      statusRef.current='CALIBRATING';setStatus('CALIBRATING');setStatusReason(sample.reason);
    }else{
      const result=evaluateAnomaly(sample,dataRef.current.baseline,detector.current,dataRef.current.settings.sensitivity,f.time-lastLightingNote.current<45000);
      detector.current=result.next;sample={...sample,state:result.state,reason:result.reason};
      if(statusRef.current!==result.state){
        if(result.state==='YELLOW'||result.state==='ORANGE'){
          const event:EventLog={id:crypto.randomUUID(),time:f.time,state:result.state,detail:result.reason};
          commit(d=>({...d,events:[event,...d.events].slice(0,250)}),false);
          if(dataRef.current.settings.audible)soundAlert();
        }
      }
      statusRef.current=result.state;setStatus(result.state);setStatusReason(result.reason);
    }
    commit(d=>({...d,history:[...d.history,sample].slice(-3600)}),false);
    if(dataRef.current.settings.autoSave && f.time-lastSave.current>=5000){lastSave.current=f.time;save(dataRef.current);}
  },[commit,finishCalibration]);

  const processing=useRef<(time:number)=>void>(()=>{});
  processing.current=(time:number)=>{
    if(!runningRef.current)return;
    const video=videoRef.current;
    if(video&&modelRef.current && video.readyState>=2 && video.videoWidth>0 && time-lastInference.current>=150 && video.currentTime!==lastVideoTime.current){
      lastInference.current=time;lastVideoTime.current=video.currentTime;
      try{
        const w=video.videoWidth,h=video.videoHeight;
        if(!sampleCanvas.current)sampleCanvas.current=document.createElement('canvas');
        const c=sampleCanvas.current;c.width=w;c.height=h;
        const ctx=c.getContext('2d',{willReadFrequently:true});
        if(ctx){
          ctx.drawImage(video,0,0,w,h);
          const found=modelRef.current.detectForVideo(video,performance.now());
          const points=found.faceLandmarks[0];
          let f:FrameReading;
          if(points?.length>=478){
            f=readFace(points,ctx,w,h,false);
            const validEARs=[f.left.ear,f.right.ear].filter((v):v is number=>v!==null && Number.isFinite(v));
            const meanEAR=validEARs.length===2?(validEARs[0]+validEARs[1])/2:null;
            // Blink events are measured from real eyelid landmarks, with a reopen
            // hysteresis threshold. Dropped/poor frames never count as a blink.
            if(meanEAR!==null && f.left.irisPx!==null && f.right.irisPx!==null){
              const now=Date.now();
              if(!blinkClosed.current && meanEAR<.18){blinkClosed.current=true;lastBlink.current=now;}
              else if(blinkClosed.current && meanEAR>.21){
                const duration=now-lastBlink.current;
                if(duration>=55&&duration<=800){blinkTimes.current.push(now);blinkTimes.current=blinkTimes.current.filter(t=>now-t<60000);setBlinks(p=>p+1);f.blink=true;}
                blinkClosed.current=false;
              }
              if(blinkClosed.current && now-lastBlink.current>800)blinkClosed.current=false;
            }else blinkClosed.current=false;
            if(trackingLayer&&overlayRef.current)drawOverlay(overlayRef.current,points,w,h,f,overlayLayers);
            else if(overlayRef.current)overlayRef.current.getContext('2d')?.clearRect(0,0,overlayRef.current.width,overlayRef.current.height);
          }else{
            f=emptyFrame();f.time=Date.now();blinkClosed.current=false;
            if(overlayRef.current)overlayRef.current.getContext('2d')?.clearRect(0,0,overlayRef.current.width,overlayRef.current.height);
          }
          setFrame(f);
          if(f.faceDetected&&time-lastEyeCapture.current>=330){
            lastEyeCapture.current=time;
            const left=captureEyeImage(video,f,'left'),right=captureEyeImage(video,f,'right');
            if(left||right){setLastEyeImages(prev=>({left:left??prev.left,right:right??prev.right}));setLastEyeFrame(f);setLastEyeTime(f.time);}
          }
          if(time-lastSample.current>=1000){lastSample.current=time;handleSample(f);}
        }
      }catch(e){
        const message=e instanceof Error?e.message:String(e);
        setError(`Tracking error: ${message}`);
      }
    }
    animationId.current=requestAnimationFrame(t=>processing.current(t));
  };

  const startMonitoring=useCallback(async()=>{
    if(runningRef.current||starting)return;
    setError('');setStarting(true);
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Webcam access is unavailable. Open the app on http://localhost or https in Chrome/Edge.');
      const cameraId=dataRef.current.settings.cameraId;
      const constraints:MediaStreamConstraints={audio:false,video:{
        ...(cameraId?{deviceId:{ideal:cameraId}}:{facingMode:'user'}),width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30}
      }};
      const stream=await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current=stream;
      await listCameras();
      const video=videoRef.current;
      if(!video)throw new Error('The camera player is not mounted. Select Dashboard and retry.');
      video.srcObject=stream;await video.play();
      const resolver=await FilesetResolver.forVisionTasks('/wasm');
      let model:FaceLandmarker;
      try{
        model=await FaceLandmarker.createFromOptions(resolver,{baseOptions:{modelAssetPath:'/models/face_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5});
      }catch{
        // CPU is a reliable fallback for devices whose GPU delegate is unavailable.
        model=await FaceLandmarker.createFromOptions(resolver,{baseOptions:{modelAssetPath:'/models/face_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numFaces:1});
      }
      modelRef.current=model;
      const now=Date.now();sessionStartRef.current=now;
      sessionBlinkStart.current=blinks;
      blinkTimes.current=[];lastSave.current=0;lastInference.current=0;lastSample.current=0;lastVideoTime.current=-1;
      detector.current=initialDetector();lastEyeCapture.current=0;setLastEyeImages({left:null,right:null});setLastEyeFrame(null);setLastEyeTime(null);runningRef.current=true;setRunning(true);setStarting(false);
      setStatus('UNAVAILABLE');setStatusReason('Searching for a face and usable iris landmarks.');
      animationId.current=requestAnimationFrame(t=>processing.current(t));
    }catch(e){
      streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;
      if(videoRef.current){videoRef.current.srcObject=null;}
      const msg=e instanceof Error?e.message:String(e);
      setError(`Unable to start camera / face tracking: ${msg}. Confirm local model files are installed (npm run setup:assets).`);
      setStarting(false);setRunning(false);runningRef.current=false;
    }
  },[blinks,listCameras,starting]);

  const startCalibration=useCallback(()=>{
    if(!runningRef.current){setTab('dashboard');toastMsg('Start camera monitoring before calibrating.');return;}
    calibrationFrames.current=[];
    calibrationStart.current=Date.now();detector.current=initialDetector();
    setCalibrating(true);setCalibrationProgress(0);setError('');setStatus('CALIBRATING');statusRef.current='CALIBRATING';
    setStatusReason('Collecting quality-filtered real iris frames. Pupil data are optional if unresolvable. Keep lighting stable.');
  },[blinks,toastMsg]);

  const setSettings=useCallback((patch:Partial<Settings>)=>{
    const next={...dataRef.current,settings:{...dataRef.current.settings,...patch}};
    dataRef.current=next;setData(next);save(next);
  },[]);
  const exportAll=()=>{
    const d=dataRef.current;
    if(!d.history.length&&!d.observations.length&&!d.events.length){toastMsg('There is no recorded data to export yet.');return;}
    saveCSV(csvExport(d.history,d.events,d.observations),`neurosight-research-${new Date().toISOString().slice(0,10)}.csv`);
    toastMsg('CSV export generated locally.');
  };
  const saveObservation=()=>{
    if(!observationNote.trim()){toastMsg('Enter an observation before saving.');return;}
    const o:Observation={id:crypto.randomUUID(),time:Date.now(),category:observationCategory,lighting,note:observationNote.trim()};
    if(lighting!=='Stable / no reported change')lastLightingNote.current=Date.now();
    commit(d=>({...d,observations:[o,...d.observations].slice(0,500)}));
    setObservationNote('');toastMsg('Time-stamped research observation saved locally.');
  };
  const deleteStored=()=>{
    stopMonitoring();setLastEyeImages({left:null,right:null});setLastEyeTime(null);setLastEyeFrame(null);setFrame(emptyFrame());clearAll();const reset:StoredData={baseline:null,history:[],events:[],observations:[],sessions:[],settings:defaultSettings};
    dataRef.current=reset;setData(reset);setConfirmClear(false);toastMsg('All locally saved NEUROSIGHT research data cleared.');
  };

  const latest=data.history.at(-1);
  const baseline=data.baseline;
  const chartSamples=data.history;
  const elapsed=running?seconds:0;
  const pupilValid=frame.left.pupilRatio!==null||frame.right.pupilRatio!==null;
  const ratioAvailable=latest?.pupilRatio??null;
  const blinkRate=latest?.blinkRate??null;
  const eyeQuality=frame.trackingQuality;
  const currentSection=sections.find(s=>s.id===tab)!;
  const alertCount=data.events.filter(e=>e.state==='ORANGE'||e.state==='YELLOW').length;
  const today=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  return <div className="app-shell">
    <video ref={videoRef} muted playsInline autoPlay style={{position:'absolute',width:1,height:1,opacity:0,pointerEvents:'none'}} aria-hidden="true"/>
    {navOpen&&<button className="mobile-shade" aria-label="Close navigation" onClick={()=>setNavOpen(false)}/>}
    <aside className={`sidebar ${navOpen?'open':''}`}>
      <div className="brand"><div className="brand-mark"><BrainCircuit size={27} strokeWidth={1.7}/></div><div className="brand-names"><strong>NEUROSIGHT <em>AI</em></strong><span>NEURAL OBSERVATION LAB</span></div></div>
      <div className="workspace-label">WORKSPACE <span>01 / LAB</span></div>
      <div className="nav-block">
        <div className="nav-caption">MONITORING</div>
        {sections.slice(0,4).map(({id,title,icon:Icon})=><button key={id} className={`nav-item ${tab===id?'active':''}`} onClick={()=>{setTab(id);setNavOpen(false);}}><Icon size={18} strokeWidth={1.9}/><span>{title}</span>{tab===id&&<span className="nav-indicator"/>}</button>)}
        <div className="nav-caption second">TOOLS & RESEARCH</div>
        {sections.slice(4).map(({id,title,icon:Icon})=><button key={id} className={`nav-item ${tab===id?'active':''}`} onClick={()=>{setTab(id);setNavOpen(false);}}><Icon size={18} strokeWidth={1.9}/><span>{title}</span>{tab===id&&<span className="nav-indicator"/>}</button>)}
      </div>
      <div className="sidebar-bottom">
        <div className="side-status"><span className="small-glow"/><div><strong>LOCAL PROCESSING</strong><span>Private · On-device inference</span></div><ShieldCheck size={17}/></div>
        <div className="side-disclaimer"><FlaskConical size={16}/><span>Experimental research prototype. Not a diagnostic or safety-critical device.</span></div>
        <div className="sidebar-version">NEUROSIGHT AI <span>v1.2.0 · RESEARCH BUILD</span></div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu icon-button" onClick={()=>setNavOpen(true)} aria-label="Open navigation"><Menu size={21}/></button><div className="breadcrumb">Research Workspace <ChevronRight size={14}/> <b>{currentSection.title}</b></div></div>
        <div className="topbar-right"><span className="top-date"><CalendarClock size={15}/>{today}</span><span className="header-divider"/><span className="offline-chip"><span/>LOCAL / PRIVATE</span><div className="user-avatar"><ScanEye size={20}/></div></div>
      </header>
      <div className="content">
        <div className="page-intro"><div><div className="eyebrow top-eyebrow"><span className="tiny-square"/>EXPERIMENTAL INTELLIGENCE / RESEARCH CONSOLE</div><h1>{tab==='dashboard'?<>Neural <span>Observation</span> Dashboard</>:currentSection.title}</h1><p>{tab==='dashboard'?'Real-time ocular signal exploration and personalized baseline analysis.':currentSection.sub+' · Live camera-derived measurements with transparent quality controls.'}</p></div><div className="intro-actions"><StatePill state={starting?'STARTING':running?status:'STOPPED'}/>{tab!=='dashboard'&&<button className="secondary-button" onClick={()=>setTab('dashboard')}><MonitorPlay size={16}/>Camera workspace</button>}</div></div>
        {error&&<div className="error-bar" role="alert"><AlertCircle size={19}/><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError('')}><X size={17}/></button></div>}
        {tab==='dashboard'&&<>
          <div className="hero-strip"><div className="hero-art"><div className="hero-ring"><ScanEye size={28}/></div></div><div className="hero-copy"><div className="hero-tag"><span className="live-signal"/>LIVE LAB STATUS</div><h2>{running?'Camera acquisition active':'Your observation station is ready.'}</h2><p>{running?'Camera frames are processed on this device. Pupil estimates are shown only when the image supports segmentation.':'Begin a new session to detect facial landmarks, inspect visible iris regions, and collect eye measurements.'}</p></div><div className="hero-action"><button className={`primary-button ${running?'stop-button':''}`} disabled={starting} onClick={running?stopMonitoring:()=>void startMonitoring()}>{starting?<><RefreshCw size={17} className="spin"/> Loading model...</>:running?<><Pause size={17} fill="currentColor"/>Stop monitoring</>:<><Play size={17} fill="currentColor"/>Start monitoring <ArrowRight size={17}/></>}</button><span>{running?'Session in progress · camera live':'Webcam permission requested on start'}</span></div></div>
          <div className="metrics-grid">
            <LittleMetric label="Monitoring duration" value={fmtTime(elapsed)} icon={Clock3} helper={running?'Active session':'Awaiting session'}/>
            <LittleMetric label="Tracking quality" value={running&&frame.faceDetected?fmtPct(eyeQuality):'—'} icon={ScanFace} tone="purple" helper="Heuristic landmark/iris quality"/>
            <LittleMetric label="Pupil / iris ratio" value={running&&pupilValid?pretty((frame.left.pupilRatio!==null&&frame.right.pupilRatio!==null?(frame.left.pupilRatio+frame.right.pupilRatio)/2:frame.left.pupilRatio??frame.right.pupilRatio),3):'—'} icon={Eye} helper="Pixel-estimated · dimensionless"/>
            <LittleMetric label="Blinks detected" value={running?String(blinks-sessionBlinkStart.current):'—'} icon={Activity} tone="purple" helper={blinkRate===null?'Rate pending ≥15s':`${pretty(blinkRate,1)} blinks/min · approximate`}/>
          </div>
          <div className="dashboard-grid">
            <Panel className="camera-panel" title="Live webcam tracking" eyebrow="01 / ACQUISITION" action={<div className="panel-head-actions"><span className={`camera-live ${running?'on':''}`}><span/>{running?'LIVE FEED':'OFFLINE'}</span><button className="icon-button light" onClick={()=>setTrackingLayer(p=>!p)} title="Toggle landmark overlay"><ScanEye size={17}/></button></div>}>
              <div className="feed-wrap"><Overlay videoRef={previewVideoRef} overlayRef={overlayRef} mirror={selectedSettings.mirror} active={running}/><div className="camera-label label-left"><span/> {running?'MEDIAPIPE · FACE LANDMARKER':'CAMERA · STANDBY'}</div><div className="camera-label label-right">{running?'LIVE INPUT':'NO VIDEO'}</div></div>
              <div className="hud-controls"><div className="hud-title"><span>HUD OVERLAY LAYERS</span><span>REAL-TIME</span></div><div className="hud-toggles">{([['iris','Iris ring'],['pupil','Pupil est.'],['eyelids','Eyelids'],['faceFrame','Face frame']] as const).map(([key,label])=><button key={key} className={`hud-toggle ${overlayLayers[key]?'selected':''}`} aria-pressed={trackingLayer&&overlayLayers[key]} onClick={()=>setOverlayLayers(prev=>({...prev,[key]:!prev[key]}))}>{label}</button>)}<button className={`hud-toggle ${selectedSettings.mirror?'selected':''}`} aria-pressed={selectedSettings.mirror} onClick={()=>setSettings({mirror:!selectedSettings.mirror})}>Mirror</button></div><small>Eye annotations display only detected landmarks or resolved pixel-region estimates.</small></div>
              <div className="eye-roi-section"><div className="eye-roi-section-title"><span>02 / EYE DETAIL · GENUINE CAMERA REGIONS</span><span className="eye-roi-legend"><i/> Cyan: iris landmark ring <em/> Violet: estimated pupil boundary</span></div><div className="eye-roi-grid"><EyeRegionCard side="left" image={lastEyeImages.left} eye={lastEyeFrame?.left??frame.left} running={running} capturedAt={lastEyeTime}/><EyeRegionCard side="right" image={lastEyeImages.right} eye={lastEyeFrame?.right??frame.right} running={running} capturedAt={lastEyeTime}/></div><p className="eye-roi-fine">Images are derived from your own webcam; cropped eye images and the last measurements remain visible after Stop until monitoring restarts or the page reloads. If pupil contrast is insufficient, only the measured iris outline is drawn.</p></div>
              <div className="feed-footer"><div><span className="feed-icon"><ScanFace size={18}/></span><div><b>{running?(frame.faceDetected?'Face & iris landmarks detected':'Searching for face...'):'Waiting for camera activation'}</b><small>{running?(frame.faceDetected?'478-point face model, image-pixel segmentation':'Keep your face visible and evenly illuminated'):'No camera frames recorded until you press Start'}</small></div></div><div className="feed-tags"><span><span className="tag-dot cyan"/> LEFT EYE</span><span><span className="tag-dot lavender"/> RIGHT EYE</span></div></div>
            </Panel>
            <div className="right-stack">
              <Panel title="Ocular measurements" eyebrow="02 / REAL-TIME SIGNALS" action={<span className="subtle-tag">PX UNITS</span>}>
                <div className="ocular-row"><div className="ocular-side"><div className="eye-id"><span className="eye-bullet cyan"/>LEFT EYE <span className="eye-note">subject left</span></div><div className="eye-main">{running?pretty(frame.left.irisPx):'—'}<small>px iris</small></div><div className="eye-secondary">Pupil: <b>{running?pretty(frame.left.pupilPx):'—'}</b> px</div><div className="eye-secondary">Ratio: <b>{running?pretty(frame.left.pupilRatio,3):'—'}</b></div><QualityBar quality={running?frame.left.pupilQuality:0}/></div><div className="ocular-divider"/><div className="ocular-side"><div className="eye-id"><span className="eye-bullet lavender"/>RIGHT EYE <span className="eye-note">subject right</span></div><div className="eye-main">{running?pretty(frame.right.irisPx):'—'}<small>px iris</small></div><div className="eye-secondary">Pupil: <b>{running?pretty(frame.right.pupilPx):'—'}</b> px</div><div className="eye-secondary">Ratio: <b>{running?pretty(frame.right.pupilRatio,3):'—'}</b></div><QualityBar quality={running?frame.right.pupilQuality:0}/></div></div>
                <div className="note-box"><Info size={16}/><span>Iris diameters use landmark geometry. Pupil estimates require a distinct dark-region boundary. Unmeasurable values display “—”, never invented numbers.</span></div>
              </Panel>
              <div className="dashboard-calib-quick"><div><strong>{baseline?baseline.ratioMean!==null?'Personal pupil baseline ready':'Iris baseline stored · pupil unavailable':'Baseline acquisition'}</strong><span>{calibrating?`Collecting: ${Math.round(calibrationProgress*100)}% · ${calibrationFrames.current.length} genuine frames`:baseline?'Recalibrate when lighting or camera changes.':'Once the camera detects both eyes, record 30–60 seconds of reference measurements.'}</span></div><button className="secondary-button small" disabled={!running||calibrating} onClick={startCalibration}><Gauge size={15}/>{calibrating?'Calibrating…':baseline?'Recalibrate':'Start baseline'}</button></div>
              <Panel title="Pattern assessment" eyebrow="03 / ADAPTIVE ANALYSIS" action={<StatePill state={running?status:'UNAVAILABLE'}/> }>
                <div className={`assessment ${running?status.toLowerCase():'unavailable'}`}><div className="assessment-icon">{status==='ORANGE'||status==='YELLOW'?<TriangleAlert size={23}/>:status==='GREEN'?<CheckCircle2 size={23}/>:<Activity size={23}/>}</div><div><strong>{!running?'Assessment not started':status==='GREEN'?'Measurements within baseline':status==='CALIBRATING'?'Building personal reference':status==='YELLOW'?'Unusual pattern observed':status==='ORANGE'?'Persistent pattern observed':'Insufficient evidence to assess'}</strong><p>{running?statusReason:'Establish a reliable baseline to enable non-diagnostic pattern comparisons.'}</p></div></div>
                <div className="baseline-mini"><div><span>PERSONAL BASELINE</span><strong>{baseline?baseline.ratioMean!==null?'AVAILABLE':'PARTIAL / IRIS ONLY':'NOT CALIBRATED'}</strong></div><button onClick={()=>setTab('baseline')}>{baseline?'Review baseline':'Set up calibration'}<ArrowRight size={15}/></button></div>
              </Panel>
            </div>
          </div>
          <div className="bottom-grid"><Panel title="Live signal evolution" eyebrow="04 / TIME-SERIES MONITOR" action={<button className="text-button" onClick={()=>setTab('live')}>Open analysis <ArrowRight size={15}/></button>}><MetricSelector metric={metric} onChange={setMetric}/><TrendChart samples={chartSamples} metric={metric} height={220}/></Panel>
          <Panel title="Research integrity" eyebrow="IMPORTANT / STUDY CONTEXT"><div className="research-integrity"><div className="integrity-icon"><FlaskConical size={24}/></div><h4>Investigational, not clinical</h4><p>This system does not identify DLB episodes, cognitive impairment or wandering risk. Pupil appearance is affected by lighting, medications, fatigue, attention, glasses, reflections, camera auto-exposure and distance.</p><div className="integrity-points"><span><CheckCircle2 size={15}/> Raw video stays local</span><span><CheckCircle2 size={15}/> Missing estimates shown clearly</span><span><CheckCircle2 size={15}/> No caregiver messages sent</span></div></div></Panel></div>
          <ObservationCharts samples={chartSamples}/>
        </>}
        {tab==='live'&&<>
          <div className="metrics-grid"><LittleMetric label="Left pupil estimate" value={running?pretty(frame.left.pupilPx):'—'} unit=" px" icon={Eye} helper={`Quality: ${fmtPct(frame.left.pupilQuality)}`}/><LittleMetric label="Right pupil estimate" value={running?pretty(frame.right.pupilPx):'—'} unit=" px" icon={Eye} tone="purple" helper={`Quality: ${fmtPct(frame.right.pupilQuality)}`}/><LittleMetric label="Iris asymmetry" value={running?pretty(latest?.irisDifference):'—'} unit=" px" icon={Gauge} helper="Camera geometry may affect this"/><LittleMetric label="Approx. blink rate" value={running?pretty(blinkRate):'—'} unit=" /min" icon={Activity} helper="Estimation begins after 15 s"/></div>
          <div className="analysis-grid"><Panel eyebrow="01 / DATA STREAM" title="Eye signal dynamics" action={<span className="subtle-tag">LATEST 240 SAMPLES</span>}><MetricSelector metric={metric} onChange={setMetric}/><TrendChart samples={chartSamples} metric={metric} height={330}/><div className="signal-note"><Info size={15}/> Gaps indicate unavailable measurements; lines do not interpolate missing pupil estimates.</div></Panel>
          <Panel eyebrow="02 / MEASUREMENT QUALITY" title="Live signal diagnostics"><div className="diagnostics">{[
            ['Face found',running?(frame.faceDetected?'Yes':'No'):'—',frame.faceDetected?1:0],
            ['Left iris',pretty(frame.left.irisPx)+' px',frame.left.irisQuality],
            ['Right iris',pretty(frame.right.irisPx)+' px',frame.right.irisQuality],
            ['Left pupil pixels',pretty(frame.left.pupilPx)+' px',frame.left.pupilQuality],
            ['Right pupil pixels',pretty(frame.right.pupilPx)+' px',frame.right.pupilQuality],
            ['Mean eye aperture (EAR)',pretty(frame.left.ear!==null&&frame.right.ear!==null?(frame.left.ear+frame.right.ear)/2:null,3),frame.trackingQuality],
            ['Eye-region luminance',frame.eyeLuminance===null?'—':`${pretty(frame.eyeLuminance,0)} / 255`,frame.eyeLuminance===null?0:frame.trackingQuality],
            ['Tracking quality proxy',fmtPct(frame.trackingQuality),frame.trackingQuality]
          ].map(([label,value,q])=><div className="diag-row" key={String(label)}><div><span>{label}</span><b>{value}</b></div><QualityBar quality={Number(q)}/></div>)}</div><div className="note-box"><Info size={16}/><span>Tracking quality is a geometric heuristic, not a model probability or clinical confidence score.</span></div></Panel></div>
          <ObservationCharts samples={chartSamples}/>
          <div className="analysis-grid two-equal"><Panel eyebrow="03 / OCULAR MOVEMENT" title="Relative gaze position"><div className="gaze-layout"><div className="gaze-target"><div className="target-ring a"/><div className="target-ring b"/><span className="crosshair h"/><span className="crosshair v"/>{latest?.gazeX!=null&&latest.gazeY!=null&&<span className="gaze-point" style={{left:`${Math.max(4,Math.min(96,latest.gazeX*100))}%`,top:`${Math.max(4,Math.min(96,latest.gazeY*100))}%`}}/>}</div><div className="gaze-info"><span>HORIZONTAL (RELATIVE)</span><b>{pretty(latest?.gazeX,3)}</b><span>VERTICAL (RELATIVE)</span><b>{pretty(latest?.gazeY,3)}</b><small>Indicative iris position in the eye aperture; not calibrated gaze direction in degrees.</small></div></div></Panel>
          <Panel eyebrow="04 / LIVE DETECTION" title="Assessment contributions"><div className="list-detail"><span>Current state</span><StatePill state={running?status:'UNAVAILABLE'}/></div><div className="list-detail"><span>Baseline pupil ratio</span><b>{pretty(baseline?.ratioMean,3)}</b></div><div className="list-detail"><span>Observed pupil ratio</span><b>{pretty(ratioAvailable,3)}</b></div><div className="list-detail"><span>Forehead image brightness</span><b>{pretty(frame.brightness,1)} / 255</b></div><div className="status-reason"><Info size={17}/>{statusReason}</div></Panel></div>
        </>}
        {tab==='baseline'&&<>
          <div className="calibration-grid"><Panel eyebrow="01 / PERSONAL REFERENCE" title="Baseline acquisition"><div className="calibration-content"><div className="calibration-visual"><div className={`calib-orbit ${calibrating?'rotating':''}`}><ScanEye size={60}/></div></div><div><span className="eyebrow">CALIBRATION PROTOCOL</span><h2>{calibrating?'Calibration in progress':baseline?'Personal reference established':'Build your baseline'}</h2><p>Position your face comfortably in the webcam view. Look naturally toward your screen and keep room lighting stable for {selectedSettings.calibrationSeconds} seconds. Only real, quality-filtered iris frames enter the calculations. Pupil detection is optional; if unavailable an iris-only baseline is saved without claiming pupil monitoring.</p><div className="progress-heading"><span>Acquisition progress</span><b>{calibrating?Math.round(calibrationProgress*100):0}%</b></div><div className="progress-bar"><span style={{width:`${calibrating?calibrationProgress*100:0}%`}}/></div><div className="calibration-numbers"><div><b>{calibrating?calibrationFrames.current.length:'—'}</b><span>Quality frames</span></div><div><b>{calibrating?calibrationFrames.current.filter(s=>s.pupilRatio!==null).length:'—'}</b><span>Usable pupil estimates</span></div><div><b>{selectedSettings.calibrationSeconds}s</b><span>Target duration</span></div></div><button disabled={!running||calibrating} className="primary-button" onClick={startCalibration}><RefreshCw size={17}/>{baseline?'Recalibrate baseline':'Start calibration'}</button>{!running&&<small className="muted-action">Start monitoring from Dashboard first to enable calibration.</small>}{calibrating&&<small className="muted-action">If quality frames remain zero, centre your face, brighten the room evenly, and reduce reflections. Acquisition completes on the timer even if samples are inadequate.</small>}</div></div></Panel>
          <Panel eyebrow="02 / REFERENCE PROFILE" title="Stored baseline parameters" action={<span className="subtle-tag">ON DEVICE</span>}>{baseline?<><div className="baseline-stats">{[['Created',fmtDate(baseline.created)],['Iris size, mean',`${pretty(baseline.irisMean,1)} px`],['Iris size, SD',`${pretty(baseline.irisStd,2)} px`],['Pupil/iris mean',pretty(baseline.ratioMean,3)],['Pupil/iris SD',pretty(baseline.ratioStd,3)],['Brightness proxy',`${pretty(baseline.brightnessMean,0)} / 255`],['Calibration length',`${baseline.durationSeconds}s`],['Pupil samples',String(baseline.pupilSamples)]].map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</div><div className="note-box">{baseline.ratioMean===null?<TriangleAlert size={17}/>:<CheckCircle2 size={17}/>}<span>{baseline.ratioMean===null?'Insufficient visibly separable pupil regions. Iris reference recorded but pupil anomaly detection is disabled.':'Pupil ratio reference was derived from quality-filtered pupil-region segmentations.'}</span></div></>:<div className="blank-slate"><Gauge size={38}/><h4>No baseline saved</h4><p>Complete a camera-based calibration to populate these values.</p></div>}</Panel></div>
          <Panel title="How the adaptive analysis works" eyebrow="03 / NON-DIAGNOSTIC LOGIC"><div className="stages">{[['green','GREEN','Stable measured pattern','Usable estimates broadly align with your stored baseline.'],['yellow','YELLOW','Short sustained deviation','At least four consecutive usable seconds exceed the selected threshold.'],['orange','ORANGE','Persistent deviation','At least twelve consecutive usable seconds remain unusual; investigate context.']].map(([color,name,title,description])=><div className="stage" key={name}><div className={`stage-symbol ${color}`}><span/></div><div><b>{name}</b><strong>{title}</strong><p>{description}</p></div></div>)}</div><div className="note-box"><Info size={17}/><span>Insufficient pupil contrast, poor landmark tracking, or changed illumination suspends pattern assessment instead of generating an artificial “normal” result.</span></div></Panel>
        </>}
        {tab==='history'&&<>
          <div className="metrics-grid"><LittleMetric label="Recorded samples" value={String(data.history.length)} icon={Database} helper="Latest 3,600 retained in memory"/><LittleMetric label="Saved sessions" value={String(data.sessions.length)} icon={Clock3} tone="purple" helper="Summaries saved on Stop"/><LittleMetric label="Recorded alerts" value={String(alertCount)} icon={BellRing} helper="Non-diagnostic only"/><LittleMetric label="Research observations" value={String(data.observations.length)} icon={FileChartColumnIncreasing} tone="purple" helper="Time-stamped annotations"/></div>
          <Panel eyebrow="01 / HISTORICAL SIGNALS" title="Measurement history" action={<button onClick={exportAll} className="secondary-button small"><ArrowDownToLine size={16}/>Export CSV</button>}><div className="chart-controls"><MetricSelector metric={metric} onChange={setMetric}/><select aria-label="History range" value={historyRange} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setHistoryRange(Number(e.target.value))}><option value={240}>Last 4 min</option><option value={900}>Last 15 min</option><option value={3600}>All stored</option></select></div><TrendChart samples={data.history} metric={metric} height={320} limit={historyRange}/></Panel>
          <div className="analysis-grid two-equal"><Panel eyebrow="02 / EVENT LOG" title="Anomaly event history" action={<span className="subtle-tag">{data.events.length} EVENTS</span>}>{data.events.length?<div className="scroll-list">{data.events.slice(0,25).map(e=><div className="event-row" key={e.id}><div className={`event-badge ${e.state.toLowerCase()}`}><TriangleAlert size={17}/></div><div><b>{e.state} · {fmtDate(e.time)}</b><p>{e.detail}</p></div></div>)}</div>:<div className="blank-slate small"><Bell size={30}/><h4>No anomaly alerts recorded</h4><p>Persistent, quality-filtered deviations will appear here.</p></div>}</Panel>
          <Panel eyebrow="03 / SESSION RECORDS" title="Monitoring session summaries">{data.sessions.length?<div className="scroll-list">{data.sessions.slice(0,15).map(s=><div className="session-row" key={s.id}><div className="session-icon"><CalendarClock size={21}/></div><div><b>{fmtDate(s.start)}</b><span>{fmtTime(s.durationSeconds)} duration · {s.samples} samples</span><span>{s.reliablePupilSamples} usable pupil readings · {s.alerts} alerts</span></div></div>)}</div>:<div className="blank-slate small"><CalendarClock size={31}/><h4>No completed sessions yet</h4><p>Monitoring summaries are created when you stop a session.</p></div>}</Panel></div>
        </>}
        {tab==='research'&&<>
          <div className="research-grid"><Panel eyebrow="01 / QUALITATIVE CONTEXT" title="Log an observation"><div className="form-grid"><label>Observation category<select value={observationCategory} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setObservationCategory(e.target.value)}><option>Attention / behaviour</option><option>Subjective alertness</option><option>Eye movement</option><option>Medication context</option><option>Environmental condition</option><option>Researcher annotation</option></select></label><label>Lighting conditions<select value={lighting} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setLighting(e.target.value)}><option>Stable / no reported change</option><option>Lighting increased</option><option>Lighting decreased</option><option>Camera / exposure changed</option><option>Unknown / uncertain</option></select></label></div><label className="form-label">Researcher notes<textarea value={observationNote} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setObservationNote(e.target.value)} placeholder="Describe an observed event, environmental context, or participant-reported change. Avoid personally identifying details." rows={5}/></label><div className="form-footer"><span><Clock3 size={15}/> Time-stamped automatically at save</span><button className="primary-button" onClick={saveObservation}><Plus size={17}/>Save observation</button></div><div className="note-box"><Lightbulb size={17}/><span>Reported lighting changes temporarily suspend pupil anomaly comparisons for 45 seconds. Camera exposure differences also trigger a quality pause.</span></div></Panel>
          <Panel eyebrow="02 / CAREGIVER CONCEPT" title="Example caregiver alert view"><div className="caregiver-demo"><div className="caregiver-top"><div className="caregiver-avatar"><HeartPulse size={22}/></div><div><strong>Caregiver companion</strong><span>CONCEPT INTERFACE · NO DELIVERY</span></div><span className="demo-label">DEMO</span></div><div className={`caregiver-alert ${status==='YELLOW'||status==='ORANGE'?'active':''}`}><BellRing size={23}/><div><b>{status==='ORANGE'?'Persistent pattern requires attention':status==='YELLOW'?'Unusual pattern noticed':'No current anomaly notification'}</b><p>{status==='ORANGE'||status==='YELLOW'?statusReason:'An in-app demonstration of how a future, validated caregiver notification could be displayed.'}</p></div></div><div className="caregiver-meta"><span>Source</span><b>Local camera pattern comparison</b></div><div className="caregiver-meta"><span>Communication</span><b className="not-connected"><WifiOff size={15}/> Not connected</b></div><div className="caregiver-meta"><span>Wandering prediction</span><b>Not supported</b></div></div><p className="small-print">This is not a real caregiver alert service. No SMS, push notification or location tracking is implemented.</p></Panel></div>
          <Panel eyebrow="03 / ANNOTATIONS" title="Recorded observations" action={<button className="secondary-button small" onClick={exportAll}><ArrowDownToLine size={16}/>Export research CSV</button>}>{data.observations.length?<div className="observation-list">{data.observations.slice(0,20).map(o=><div className="observation" key={o.id}><div className="observation-date"><Clock3 size={15}/>{fmtDate(o.time)}<span>{o.category}</span></div><p>{o.note}</p><small>{o.lighting}</small></div>)}</div>:<div className="blank-slate small"><FlaskConical size={32}/><h4>No annotations yet</h4><p>Record observations to pair contextual notes with measurement times.</p></div>}</Panel>
        </>}
        {tab==='settings'&&<div className="settings-grid"><Panel eyebrow="01 / CAMERA & TRACKING" title="Acquisition settings"><div className="settings-field"><label htmlFor="camera-selection">Input camera</label><p>Select the webcam used when starting a new session.</p><select id="camera-selection" value={selectedSettings.cameraId} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setSettings({cameraId:e.target.value})}><option value="">System default camera</option>{cameras.map((c,i)=><option value={c.deviceId} key={c.deviceId||i}>{c.label||`Camera ${i+1}`}</option>)}</select><button className="text-button refresh-cam" onClick={()=>void listCameras()}><RefreshCw size={15}/> Refresh devices</button></div><div className="settings-field"><label>Display mirroring</label><p>Flip only the camera preview and landmark overlay (measurements are unchanged).</p><div className="toggle-row"><span>Mirror preview horizontally</span><button className={`toggle ${selectedSettings.mirror?'enabled':''}`} role="switch" aria-checked={selectedSettings.mirror} onClick={()=>setSettings({mirror:!selectedSettings.mirror})}><span/></button></div></div><div className="note-box"><Camera size={16}/><span>Changing camera selection takes effect when you next start monitoring.</span></div></Panel>
          <Panel eyebrow="02 / ANALYSIS CONTROLS" title="Detection & calibration"><div className="settings-field"><label htmlFor="sensitivity">Anomaly sensitivity</label><p>Higher sensitivity flags smaller sustained deviations. No setting makes the result diagnostic.</p><select id="sensitivity" value={selectedSettings.sensitivity} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setSettings({sensitivity:e.target.value as Settings['sensitivity']})}><option value="low">Conservative · lower sensitivity</option><option value="balanced">Balanced · default</option><option value="high">Exploratory · higher sensitivity</option></select></div><div className="settings-field"><label htmlFor="calibration">Calibration length</label><p>Collect a baseline for 30–60 seconds.</p><select id="calibration" value={selectedSettings.calibrationSeconds} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setSettings({calibrationSeconds:Number(e.target.value)})}><option value={30}>30 seconds</option><option value={45}>45 seconds · recommended</option><option value={60}>60 seconds</option></select></div><div className="settings-field toggle-row"><div><label>Audible alerts</label><p>Play a brief tone on new yellow/orange alerts.</p></div><button className={`toggle ${selectedSettings.audible?'enabled':''}`} role="switch" aria-checked={selectedSettings.audible} onClick={()=>setSettings({audible:!selectedSettings.audible})}><span/></button></div></Panel>
          <Panel eyebrow="03 / PRIVACY" title="On-device data management"><div className="privacy-banner"><LockKeyhole size={25}/><div><b>Private-by-design research workspace</b><p>Video frames are processed in memory on this laptop. No video recording, user accounts, cloud APIs, geolocation or remote caregiver transmissions.</p></div></div><div className="settings-field toggle-row"><div><label>Save research data locally</label><p>Automatically save new measurements in browser localStorage.</p></div><button className={`toggle ${selectedSettings.autoSave?'enabled':''}`} role="switch" aria-checked={selectedSettings.autoSave} onClick={()=>setSettings({autoSave:!selectedSettings.autoSave})}><span/></button></div><div className="settings-field toggle-row"><div><label>Keep measurement history</label><p>Retain recent samples, alerts and completed-session summaries across reloads.</p></div><button className={`toggle ${selectedSettings.allowHistory?'enabled':''}`} role="switch" aria-checked={selectedSettings.allowHistory} onClick={()=>setSettings({allowHistory:!selectedSettings.allowHistory})}><span/></button></div><div className="data-actions"><button className="secondary-button" onClick={exportAll}><ArrowDownToLine size={16}/>Export all CSV data</button><button className="danger-button" onClick={()=>setConfirmClear(true)}><Trash2 size={16}/>Clear saved data</button></div>{confirmClear&&<div className="confirm-delete"><TriangleAlert size={20}/><p>Delete the baseline, samples, alerts, notes and session summaries stored by this browser? Export anything you need first.</p><div><button onClick={()=>setConfirmClear(false)} className="secondary-button small">Cancel</button><button onClick={deleteStored} className="danger-button">Delete all local data</button></div></div>}</Panel></div>}
        <div className="footer"><span><BrainCircuit size={15}/> NEUROSIGHT AI · EXPERIMENTAL RESEARCH PROTOTYPE</span><span>For demonstrations and exploratory research only · Not a medical device</span></div>
      </div>
    </main>
    {toast&&<div className="toast" role="status"><CheckCircle2 size={19}/>{toast}<button onClick={()=>setToast('')} aria-label="Dismiss"><X size={16}/></button></div>}
  </div>;
}
