import type { Baseline, StoredSample, EventLog, Observation, SessionSummary } from './analysis';
export interface Settings {
  cameraId: string;
  sensitivity: 'low'|'balanced'|'high';
  calibrationSeconds: number;
  audible: boolean;
  autoSave: boolean;
  allowHistory: boolean;
  mirror: boolean;
}
export const defaultSettings:Settings={cameraId:'',sensitivity:'balanced',calibrationSeconds:45,audible:false,autoSave:true,allowHistory:true,mirror:true};
export interface StoredData {
  baseline: Baseline|null;
  history:StoredSample[];
  events:EventLog[];
  observations:Observation[];
  sessions:SessionSummary[];
  settings:Settings;
}
const name='neurosight-research-v1';
export function load():StoredData {
  const initial:StoredData={baseline:null,history:[],events:[],observations:[],sessions:[],settings:defaultSettings};
  try {
    const p=JSON.parse(localStorage.getItem(name)??'null') as Partial<StoredData>|null;
    if (!p)return initial;
    return {baseline:p.baseline??null,history:Array.isArray(p.history)?p.history.slice(-3600):[],
      events:Array.isArray(p.events)?p.events.slice(-250):[],
      observations:Array.isArray(p.observations)?p.observations.slice(-500):[],
      sessions:Array.isArray(p.sessions)?p.sessions.slice(-100):[],settings:{...defaultSettings,...p.settings}};
  } catch {return initial;}
}
export function save(d:StoredData):boolean {
  try {
    localStorage.setItem(name,JSON.stringify({...d,history:d.settings.allowHistory?d.history.slice(-3600):[],
      events:d.settings.allowHistory?d.events.slice(-250):[],sessions:d.settings.allowHistory?d.sessions.slice(-100):[]}));
    return true;
  } catch{return false;}
}
export function clearAll():void {try{localStorage.removeItem(name);}catch{/* storage may be blocked */}}
