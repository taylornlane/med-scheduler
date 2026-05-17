import { useState, useRef, useEffect } from "react";
import {
  Sun, Cloud, Moon, Star,
  Pill, CalendarDays, Stethoscope,
  Camera, PenLine, Trash2,
  RefreshCw, Check, X, LayoutList,
  CalendarRange, Activity, ClipboardList,
  AlertTriangle, ShieldCheck, Loader2, BarChart2,
} from "lucide-react";

// ── Palette ───────────────────────────────────────────────────────────────────
const B = {
  primary:   "#7B1D2E",
  mid:       "#9B2335",
  light:     "#C0394D",
  rose:      "#F2B8C0",
  cream:     "#FDF6F0",
  paper:     "#FFFFFF",
  ink:       "#1C0A0D",
  muted:     "#8C6B70",
  border:    "#EDD5D8",
  morning:   "#C0622B",
  afternoon: "#2B6CB0",
  evening:   "#7B1D2E",
  night:     "#1A2744",
  appt:      "#1D7B5E",
};

const TIME_COLORS = { morning: B.morning, afternoon: B.afternoon, evening: B.evening, night: B.night };
const TIME_ICONS  = { morning: Sun, afternoon: Cloud, evening: Moon, night: Star };
const DAYS  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const TIMES = ["morning","afternoon","evening","night"];

const INITIAL = [
  { id:1, type:"medication",  name:"Metformin",   dose:"500mg",  times:["morning"],    notes:"Take with food",            days:[...DAYS] },
  { id:2, type:"medication",  name:"Lisinopril",  dose:"10mg",   times:["evening"],    notes:"Blood pressure",            days:[...DAYS] },
  { id:3, type:"appointment", name:"Dr. Johnson", dose:"",       times:["afternoon"],  notes:"Annual checkup — Clinic B", days:["Mon"] },
  { id:4, type:"medication",  name:"Vitamin D",   dose:"2000IU", times:["morning"],    notes:"With breakfast",            days:["Mon","Wed","Fri"] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function migrateEntry(e) {
  let out = e.times ? e : {...e, times:[e.time||"morning"]};
  // migrate single specificTime string → specificTimes object
  if (out.specificTime && !out.specificTimes) {
    out = {...out, specificTimes:{[out.times?.[0]||"morning"]: out.specificTime}, specificTime: undefined};
  }
  if (!out.specificTimes) out = {...out, specificTimes:{}};
  if (!out.takenDates) out = {...out, takenDates:{}};
  return out;
}
function fmt12(t) {
  if (!t) return "";
  const [h,m]=t.split(":").map(Number);
  const ampm=h<12?"AM":"PM";
  return `${h%12||12}:${String(m).padStart(2,"0")} ${ampm}`;
}
function entryColor(e) { return e.type==="appointment" ? B.appt : TIME_COLORS[e.times?.[0]||"morning"]; }

function fmtDate(dateStr) {
  const [y,m,d]=dateStr.split("-").map(Number);
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m-1]} ${d}, ${y}`;
}

function getStartedDate(entry) {
  const dates=Object.entries(entry.takenDates||{}).filter(([,v])=>v).map(([d])=>d).sort();
  return dates[0]||null;
}

// Returns 5 rows × 7 cols covering ~5 weeks up to today, Mon-Sun aligned
function getMedHistory(entry) {
  const today=new Date();
  // Rewind to the Monday that begins our grid (~4 full weeks back)
  const anchor=new Date(today);
  anchor.setDate(today.getDate()-27);
  const dow=(anchor.getDay()+6)%7; // 0=Mon
  anchor.setDate(anchor.getDate()-dow);

  const todayStr=TODAY();
  const weeks=[];
  for(let w=0;w<5;w++){
    const row=[];
    for(let d=0;d<7;d++){
      const dt=new Date(anchor);
      dt.setDate(anchor.getDate()+w*7+d);
      const dateStr=dt.toISOString().slice(0,10);
      if(dateStr>todayStr){row.push(null);continue;}
      const dayName=DAYS[(dt.getDay()+6)%7];
      row.push({
        dateStr,
        scheduled:entry.days.includes(dayName),
        taken:!!(entry.takenDates||{})[dateStr],
        isToday:dateStr===todayStr,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

const FLAGGED_CLASSES = [
  "selective serotonin reuptake inhibitor",
  "serotonin and norepinephrine reuptake inhibitor",
  "benzodiazepine",
  "corticosteroid",
  "opioid",
  "beta-adrenergic blocker",
];

function hasRecentMissedDoses(entry) {
  const today = new Date();
  let missed = 0;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = DAYS[(d.getDay() + 6) % 7];
    if (entry.days.includes(dayName) && !(entry.takenDates || {})[dateStr]) missed++;
  }
  return missed >= 2;
}

function EntryIcon({ entry }) {
  return <span style={{color:"#fff",fontWeight:800,fontSize:11,fontFamily:"sans-serif",letterSpacing:0.5}}>{entry.type==="appointment"?"Appt":"Med"}</span>;
}

function TimeIcon({ time, size=14, color }) {
  const Icon = TIME_ICONS[time];
  return <Icon size={size} color={color||TIME_COLORS[time]} strokeWidth={1.6}/>;
}

function Chip({ color, children }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      background:color+"1a", color, border:`1px solid ${color}44`,
      borderRadius:20, padding:"2px 9px", fontSize:11, fontWeight:700, letterSpacing:0.3, whiteSpace:"nowrap",
    }}>{children}</span>
  );
}

const TODAY = ()=>new Date().toISOString().slice(0,10);

// ── Entry Card ────────────────────────────────────────────────────────────────
function EntryCard({ entry, onEdit, onDelete, onToggleTaken, showTaken, compact }) {
  const col = entryColor(entry);
  const [hov, setHov] = useState(false);
  const taken = showTaken && !!(entry.takenDates||{})[TODAY()];
  return (
    <div
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background:B.paper, borderLeft:`5px solid ${col}`,
        border:`1.5px solid ${hov?col+"55":B.border}`, borderRadius:14,
        padding:compact?"11px 14px":"15px 18px",
        display:"flex", alignItems:"center", gap:13,
        boxShadow:hov?`0 6px 20px ${col}22`:"0 2px 8px #1C0A0D0a",
        transition:"all 0.18s",
      }}
    >
      <div style={{
        flexShrink:0, width:42, height:42, borderRadius:12,
        background:`linear-gradient(135deg,${col},${col}bb)`,
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow:`0 3px 10px ${col}44`,
      }}>
        <EntryIcon entry={entry}/>
      </div>

      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",marginBottom:3}}>
          <span style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:700,fontSize:compact?16:18,color:B.ink}}>{entry.name}</span>
          {entry.quantity && <Chip color={B.muted}>{entry.quantity}</Chip>}
          {entry.dose && <Chip color={col}>{entry.dose}</Chip>}
          {(entry.times||[]).map(t=><Chip key={t} color={TIME_COLORS[t]}>{t.charAt(0).toUpperCase()+t.slice(1)}</Chip>)}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",minWidth:0}}>
          {Object.entries(entry.specificTimes||{}).filter(([,v])=>v).map(([t,v])=>(
            <span key={t} style={{fontSize:12,fontWeight:700,color:TIME_COLORS[t]||col,flexShrink:0}}>{fmt12(v)}</span>
          ))}
          {entry.notes&&<span style={{fontSize:12,color:B.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,flex:"1 1 0",display:"block",maxWidth:"100%"}}>{entry.notes}</span>}
        </div>
        {showTaken&&(
          <button onClick={e=>{e.stopPropagation();onToggleTaken(entry.id);}} style={{
            marginTop:6,background:taken?`${B.appt}18`:"transparent",
            border:`1.5px solid ${taken?B.appt:B.border}`,borderRadius:20,
            padding:"3px 10px",cursor:"pointer",display:"inline-flex",alignItems:"center",
            gap:5,fontSize:11,fontWeight:700,color:taken?B.appt:B.muted,fontFamily:"inherit",
          }}>
            <Check size={10} strokeWidth={taken?3:2} color={taken?B.appt:B.muted}/>
            {taken?"Taken today":"Mark as taken"}
          </button>
        )}
        {!compact && entry.days && (
          <div style={{display:"flex",gap:4,marginTop:7}}>
            {DAYS.map(d=>{
              const on=entry.days.includes(d);
              return <span key={d} style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,background:on?col:B.cream,color:on?"#fff":B.border,border:`1.5px solid ${on?col:B.border}`}}>{d[0]}</span>;
            })}
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:6,flexShrink:0}}>
        <button onClick={e=>{e.stopPropagation();onEdit(entry);}}
          style={{background:B.cream,border:`1.5px solid ${B.border}`,borderRadius:9,padding:"0 10px",height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:12,fontWeight:700,color:B.primary,fontFamily:"inherit"}}>
          Edit
        </button>
        <button onClick={e=>{e.stopPropagation();onDelete(entry.id);}}
          style={{background:"#fff0f2",border:"1.5px solid #ffc5cc",borderRadius:9,padding:"0 10px",height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:12,fontWeight:700,color:B.light,fontFamily:"inherit"}}>
          Remove
        </button>
      </div>
    </div>
  );
}

// ── Shared form fields ────────────────────────────────────────────────────────
function Fields({ form, setForm, col, toggleDay, toggleTime }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:13}}>
      <Field label="Name">
        <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={inp}/>
      </Field>
      {form.type==="medication" && (
        <>
          <Field label="Quantity">
            <input value={form.quantity||""} onChange={e=>setForm(f=>({...f,quantity:e.target.value}))} style={inp} placeholder="e.g. 2 tablets, 1 capsule, 5 ml"/>
          </Field>
          <Field label="Dose">
            <input value={form.dose} onChange={e=>setForm(f=>({...f,dose:e.target.value}))} style={inp} placeholder="e.g. 500mg"/>
          </Field>
        </>
      )}
      <Field label="Time of Day (select all that apply)">
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginTop:4}}>
          {TIMES.map(t=>{
            const on=(form.times||[]).includes(t);
            const tcol=TIME_COLORS[t];
            return (
              <button key={t} onClick={()=>toggleTime(t)} style={{height:44,borderRadius:12,border:`2px solid ${on?tcol:B.border}`,background:on?tcol:B.cream,color:on?"#fff":B.muted,fontWeight:700,fontSize:13,cursor:"pointer",transition:"all 0.14s",fontFamily:"inherit"}}>
                {t.charAt(0).toUpperCase()+t.slice(1)}
              </button>
            );
          })}
        </div>
      </Field>
      {(form.times||[]).length>0&&(
        <Field label="Specific Times (optional)">
          <div style={{display:"flex",flexDirection:"column",gap:7,marginTop:4}}>
            {(form.times||[]).map(t=>(
              <div key={t} style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{width:76,fontSize:11,fontWeight:700,color:TIME_COLORS[t],textTransform:"uppercase",letterSpacing:0.5,flexShrink:0}}>
                  {t.charAt(0).toUpperCase()+t.slice(1)}
                </span>
                <input type="time" value={(form.specificTimes||{})[t]||""} onChange={e=>setForm(f=>({...f,specificTimes:{...(f.specificTimes||{}),[t]:e.target.value}}))} style={{...inp,flex:1,minWidth:0,width:"100%"}}/>
              </div>
            ))}
          </div>
        </Field>
      )}
      <Field label="Notes">
        <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={inp} placeholder="Optional notes…"/>
      </Field>
      <Field label="Days">
        <div style={{overflowX:"auto",paddingBottom:4,paddingTop:4}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6,marginTop:4,minWidth:260}}>
          {DAYS.map(d=>{
            const on=form.days.includes(d);
            return (
              <button key={d} onClick={()=>toggleDay(d)} style={{
                height:48,borderRadius:12,
                border:`2px solid ${on?col:B.border}`,
                background:on?col:B.cream, color:on?"#fff":B.muted,
                fontWeight:700,fontSize:11,cursor:"pointer",transition:"all 0.14s",fontFamily:"inherit",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,padding:0,
              }}>
                {on&&<Check size={9} strokeWidth={3.5}/>}
                <span>{d}</span>
              </button>
            );
          })}
        </div>
        </div>
      </Field>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label style={{display:"flex",flexDirection:"column",gap:5,fontSize:11,fontWeight:700,color:B.muted,letterSpacing:0.8,textTransform:"uppercase"}}>
      {label}{children}
    </label>
  );
}

// ── Modals ────────────────────────────────────────────────────────────────────
function Overlay({ children }) {
  return (
    <div style={{position:"fixed",inset:0,background:"#1C0A0D99",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:B.paper,borderRadius:22,width:"100%",maxWidth:480,boxShadow:"0 24px 64px #1C0A0D44",overflow:"hidden",maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
function MHead({ color, onClose, eyebrow, icon, title }) {
  return (
    <div style={{background:`linear-gradient(135deg,${color},${color}cc)`,padding:"22px 28px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{display:"flex",alignItems:"center",gap:7,color:"#ffffff88",fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>{icon}{eyebrow}</div>
        {title && <div style={{color:"#fff",fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:700}}>{title}</div>}
      </div>
      <button onClick={onClose} style={{background:"rgba(0,0,0,0.25)",border:"none",borderRadius:9,width:38,height:38,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:22,color:"#fff",lineHeight:1,fontWeight:300,fontFamily:"sans-serif"}}>×</button>
    </div>
  );
}

function EditModal({ entry, onSave, onClose }) {
  const [form,setForm]=useState({...migrateEntry(entry)});
  const col = form.type==="appointment" ? B.appt : (TIME_COLORS[form.times?.[0]]||B.primary);
  const toggleDay = d=>setForm(f=>({...f,days:f.days.includes(d)?f.days.filter(x=>x!==d):[...f.days,d]}));
  const toggleTime = t=>setForm(f=>({...f,times:(f.times||[]).includes(t)?f.times.filter(x=>x!==t):[...(f.times||[]),t]}));
  const icon = form.type==="appointment" ? <Stethoscope size={14} color="#ffffff88" strokeWidth={1.8}/> : <Pill size={14} color="#ffffff88" strokeWidth={1.8}/>;
  return (
    <Overlay onClose={onClose}>
      <MHead color={col} onClose={onClose} eyebrow={form.type==="appointment"?"Edit Appointment":"Edit Medication"} icon={icon}/>
      <div style={{padding:"24px 28px"}}>
        <Fields form={form} setForm={setForm} col={col} toggleDay={toggleDay} toggleTime={toggleTime}/>
        <div style={{display:"flex",gap:10,marginTop:24}}>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button onClick={()=>onSave(form)} style={solidBtn(col)}><Check size={15} strokeWidth={2.5}/> Save Changes</button>
        </div>
      </div>
    </Overlay>
  );
}

function parseOcrText(text) {
  const lines=text.split("\n").map(l=>l.trim()).filter(l=>l.length>2);
  const isAppt=/\bdr\.?\s+\w+|\bappointment\b|\bclinic\b|\bhospital\b|\boffice visit\b/i.test(text);
  const type=isAppt?"appointment":"medication";
  const doseMatch=text.match(/\d+\s*(mg|mcg|ml|g\b|iu|units?)/i);
  const dose=doseMatch?doseMatch[0].replace(/\s+/,""):"";
  let time="morning";
  if(/\b(bedtime|at night|before bed)\b/i.test(text)) time="night";
  else if(/\b(evening|dinner|supper|6\s*pm|7\s*pm|8\s*pm)\b/i.test(text)) time="evening";
  else if(/\b(afternoon|noon|lunch|12\s*pm|1\s*pm|2\s*pm)\b/i.test(text)) time="afternoon";
  const skipLine=/^(rx|ndc|lot|exp|qty|refill|discard|store|keep|mfg|\d+$)/i;
  let name="";
  for(const line of lines){
    if(skipLine.test(line)||line.length<3) continue;
    name=line.replace(/\s+\d+\s*(mg|mcg|ml|g\b|iu|units?)/i,"").trim();
    if(name) break;
  }
  if(!name) name=isAppt?"Appointment":"Medication";
  const instructionRe=/take with|take before|take after|with food|without food|with water|at bedtime|once daily|twice daily|three times|as directed|do not|avoid/i;
  const notes=lines.find(l=>instructionRe.test(l))||"";
  return {type,name,dose,time,notes};
}

function toBase64(file){return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve({data:r.result.split(",")[1],mediaType:file.type||"image/jpeg"});r.readAsDataURL(file);});}

function parseFrequency(text) {
  if (!text) return null;
  const t = text.toLowerCase();

  // Weekly schedules
  if (/once\s+(a\s+)?week(ly)?|one\s+time\s+(a\s+)?week/i.test(t))
    return { times: ["morning"], days: ["Mon"] };
  if (/twice\s+(a\s+)?week(ly)?|two\s+times\s+(a\s+)?week/i.test(t))
    return { times: ["morning"], days: ["Mon","Thu"] };
  if (/three\s+times\s+(a\s+)?week(ly)?/i.test(t))
    return { times: ["morning"], days: ["Mon","Wed","Fri"] };
  if (/once\s+(a\s+)?month(ly)?/i.test(t))
    return { times: ["morning"], days: ["Mon"] };

  // As needed
  if (/as\s+needed|\bprn\b/i.test(t))
    return { times: [], days: [] };

  // Daily — check higher counts first
  if (/four\s+times\s+(a\s+)?(day|daily)|every\s+6\s+hours?/i.test(t))
    return { times: ["morning","afternoon","evening","night"], days: [...DAYS] };
  if (/three\s+times\s+(a\s+)?(day|daily)|every\s+8\s+hours?/i.test(t))
    return { times: ["morning","afternoon","night"], days: [...DAYS] };
  if (/twice\s+(a\s+)?(day|daily)|two\s+times\s+(a\s+)?day|every\s+12\s+hours?|\bbid\b/i.test(t))
    return { times: ["morning","evening"], days: [...DAYS] };
  if (/once\s+(a\s+)?(day|daily)|one\s+time\s+(a\s+)?day|every\s+24\s+hours?|\b(qd|od)\b/i.test(t))
    return { times: ["morning"], days: [...DAYS] };

  // Time-of-day keywords
  if (/at\s+bedtime|before\s+bed|\bbedtime\b|\bqhs\b/i.test(t))
    return { times: ["night"], days: [...DAYS] };
  if (/every\s+morning|each\s+morning/i.test(t))
    return { times: ["morning"], days: [...DAYS] };
  if (/every\s+evening|each\s+evening/i.test(t))
    return { times: ["evening"], days: [...DAYS] };

  return null;
}

async function enrichMedication(name) {
  try {
    const rxRes = await fetch(`/api/medications?action=rxnorm&name=${encodeURIComponent(name)}`);
    const { rxcui } = await rxRes.json();

    const dosingRes = await fetch(
      rxcui
        ? `/api/medications?action=dosing&rxcui=${rxcui}&name=${encodeURIComponent(name)}`
        : `/api/medications?action=dosing&name=${encodeURIComponent(name)}`
    );
    const dosing = await dosingRes.json();
    return { rxcui: rxcui || dosing.rxcui || null, frequency: dosing.frequency || null, pharmClass: dosing.pharmClass || null };
  } catch {
    return { rxcui: null, frequency: null, pharmClass: null };
  }
}

function ScanModal({ onConfirm, onClose }) {
  const [step,setStep]=useState("idle");
  const [photos,setPhotos]=useState([]);// [{data,mediaType,url}]
  const [form,setForm]=useState(null);
  const [errMsg,setErrMsg]=useState(null);
  const fileRef=useRef();

  const handleFile=async(e)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    if(fileRef.current)fileRef.current.value="";
    const {data,mediaType}=await toBase64(file);
    const url=URL.createObjectURL(file);
    setPhotos(p=>[...p,{data,mediaType,url}]);
    setStep("captured");
  };

  const analyze=async()=>{
    setStep("scanning");setErrMsg(null);
    try{
      const res=await fetch("/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({images:photos.map(p=>({data:p.data,mediaType:p.mediaType}))})});
      const data=await res.json();
      if(!res.ok||data.error){setErrMsg(data.error||"Could not read item");setStep("error");return;}
      const base={...data,times:[data.time||"morning"],id:Date.now(),days:[]};
      const freqFromNotes=parseFrequency(data.notes);
      const initialForm=freqFromNotes
        ?{...base,times:freqFromNotes.times.length?freqFromNotes.times:base.times,days:freqFromNotes.days}
        :base;
      setForm(initialForm);setStep("confirm");
      if(data.type==="medication"&&data.name){
        enrichMedication(data.name).then(({rxcui,frequency,pharmClass})=>{
          setForm(f=>{
            if(!f) return f;
            const parsed=parseFrequency(frequency);
            return {
              ...f,
              rxcui,
              pharmClass: pharmClass||f.pharmClass||null,
              notes:frequency&&!f.notes?frequency:f.notes,
              // Only apply OpenFDA frequency if user hasn't selected days yet
              ...(parsed&&f.days.length===0?{
                times:parsed.times.length?parsed.times:f.times,
                days:parsed.days,
              }:{}),
            };
          });
        });
      }
    }catch{setErrMsg("Network error. Please try again.");setStep("error");}
  };

  const retake=()=>{photos.forEach(p=>URL.revokeObjectURL(p.url));setPhotos([]);setStep("idle");setForm(null);setErrMsg(null);};
  const col=form?(form.type==="appointment"?B.appt:(TIME_COLORS[form.times?.[0]]||B.primary)):B.primary;
  const toggleDay=d=>setForm(f=>({...f,days:f.days.includes(d)?f.days.filter(x=>x!==d):[...f.days,d]}));
  const toggleTime=t=>setForm(f=>({...f,times:(f.times||[]).includes(t)?f.times.filter(x=>x!==t):[...(f.times||[]),t]}));

  return (
    <Overlay onClose={onClose}>
      <MHead color={B.primary} onClose={onClose} eyebrow="Smart Scanner" icon={<Camera size={14} color="#ffffff88" strokeWidth={1.8}/>} title={step==="confirm"?"Review & Confirm":"Scan Item"}/>
      <div style={{padding:"24px 28px"}}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>

        {step==="idle"&&(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div onClick={()=>fileRef.current?.click()} style={{background:B.cream,borderRadius:20,height:160,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20,border:`2px dashed ${B.border}`,cursor:"pointer"}}>
              <div style={{color:B.muted,fontSize:13,fontWeight:600,display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
                <Camera size={36} color={B.muted} strokeWidth={1.4}/>
                Tap to take a photo
              </div>
            </div>
            <button onClick={()=>fileRef.current?.click()} style={{...solidBtn(B.primary),flex:"none",width:"100%",justifyContent:"center"}}>
              <Camera size={17} strokeWidth={1.8}/> Take Photo
            </button>
          </div>
        )}

        {step==="captured"&&(
          <div style={{padding:"4px 0"}}>
            <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
              {photos.map((p,i)=>(
                <div key={i} style={{position:"relative",width:80,height:80,borderRadius:12,overflow:"hidden",border:`2px solid ${B.border}`}}>
                  <img src={p.url} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  <button onClick={()=>setPhotos(ps=>ps.filter((_,j)=>j!==i))} style={{position:"absolute",top:3,right:3,background:"#1C0A0Daa",border:"none",borderRadius:"50%",width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                    <X size={11} color="#fff" strokeWidth={2.5}/>
                  </button>
                </div>
              ))}
              {photos.length<4&&(
                <button onClick={()=>fileRef.current?.click()} style={{width:80,height:80,borderRadius:12,border:`2px dashed ${B.border}`,background:B.cream,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,color:B.muted,fontSize:10,fontWeight:700}}>
                  <Camera size={18} color={B.muted} strokeWidth={1.6}/>Add
                </button>
              )}
            </div>
            <div style={{fontSize:12,color:B.muted,marginBottom:16,textAlign:"center"}}>
              {photos.length===1?"For small bottles, add more angles to improve accuracy":"Ready to analyze"}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={retake} style={ghostBtn}><X size={13} strokeWidth={2}/> Cancel</button>
              <button onClick={analyze} style={solidBtn(B.primary)}><Check size={15} strokeWidth={2.5}/> Analyze {photos.length>1?`${photos.length} Photos`:"Photo"}</button>
            </div>
          </div>
        )}

        {step==="scanning"&&(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{position:"relative",background:"#10050A",borderRadius:20,height:160,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",marginBottom:20}}>
              <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(#ffffff07 1px,transparent 1px),linear-gradient(90deg,#ffffff07 1px,transparent 1px)`,backgroundSize:"32px 32px"}}/>
              <div style={{color:"#ffffff55",fontSize:12,fontWeight:700,letterSpacing:2,textTransform:"uppercase",display:"flex",alignItems:"center",gap:8}}>
                <RefreshCw size={14} color="#ffffff55" strokeWidth={1.8} style={{animation:"spin 1s linear infinite"}}/> Analyzing…
              </div>
            </div>
            <div style={{color:B.muted,fontSize:13,fontWeight:600}}>Reading your item with AI…</div>
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {step==="error"&&(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{background:"#fff0f2",border:"1.5px solid #ffc5cc",borderRadius:14,padding:"20px",marginBottom:20}}>
              <X size={28} color={B.light} strokeWidth={1.8} style={{marginBottom:8}}/>
              <div style={{fontWeight:700,color:B.light,marginBottom:4}}>Couldn't read item</div>
              <div style={{fontSize:13,color:B.muted}}>{errMsg}</div>
            </div>
            <button onClick={retake} style={{...solidBtn(B.primary),flex:"none",width:"100%",justifyContent:"center"}}>
              <RefreshCw size={14} strokeWidth={2}/> Try Again
            </button>
          </div>
        )}

        {step==="confirm"&&form&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:14,padding:"13px 16px",background:col+"10",border:`1.5px solid ${col}33`,borderRadius:14,marginBottom:20}}>
              <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(135deg,${col},${col}aa)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{color:"#fff",fontWeight:800,fontSize:13,fontFamily:"sans-serif"}}>{form.type==="appointment"?"Dr":"Rx"}</span>
              </div>
              <div>
                <div style={{fontSize:10,color:col,fontWeight:800,letterSpacing:1.5,textTransform:"uppercase",marginBottom:2}}>Detected {form.type}</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:700,fontSize:20,color:B.ink}}>{form.name}</div>
                {form.dose&&<div style={{fontSize:12,color:B.muted}}>{form.dose}</div>}
              </div>
            </div>
            <Fields form={form} setForm={setForm} col={col} toggleDay={toggleDay} toggleTime={toggleTime}/>
            <div style={{display:"flex",gap:10,marginTop:22}}>
              <button onClick={retake} style={ghostBtn}><RefreshCw size={13} strokeWidth={2}/> Re-scan</button>
              <button onClick={()=>onConfirm(form)} style={solidBtn(col)}><Check size={15} strokeWidth={2.5}/> Add to Schedule</button>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}

// ── Atoms ─────────────────────────────────────────────────────────────────────
const inp = {padding:"10px 13px",borderRadius:10,border:`1.5px solid ${B.border}`,fontSize:14,fontFamily:"inherit",outline:"none",color:B.ink,background:B.cream,width:"100%",boxSizing:"border-box"};
const ghostBtn = {flex:1,padding:"11px 16px",borderRadius:11,border:`1.5px solid ${B.border}`,background:B.paper,cursor:"pointer",fontWeight:700,fontSize:13,color:B.muted,display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontFamily:"inherit"};
const solidBtn = col=>({flex:2,padding:"11px 16px",borderRadius:11,border:"none",background:`linear-gradient(135deg,${col},${col}cc)`,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontFamily:"inherit",boxShadow:`0 4px 16px ${col}44`});

function ConfirmModal({ onConfirm, onCancel }) {
  return (
    <Overlay>
      <div style={{padding:"28px 28px 24px"}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700,color:B.ink,marginBottom:8}}>Remove entry?</div>
        <div style={{fontSize:14,color:B.muted,marginBottom:24}}>This will permanently remove this item from your schedule.</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={ghostBtn}>Cancel</button>
          <button onClick={onConfirm} style={solidBtn(B.light)}>Yes, Remove</button>
        </div>
      </div>
    </Overlay>
  );
}

function Toast({ msg, color }) {
  return (
    <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:color,color:"#fff",padding:"11px 22px",borderRadius:100,fontWeight:700,fontSize:13,zIndex:2000,boxShadow:"0 8px 28px #1C0A0D33",animation:"toastIn 0.28s ease",display:"flex",alignItems:"center",gap:7,whiteSpace:"nowrap"}}>
      <Check size={14} strokeWidth={2.5}/>{msg}
    </div>
  );
}

const SEVERITY_COLOR = { major: "#C0394D", moderate: "#C0622B", minor: "#2B6CB0", possible: "#7B5EA7", unknown: "#8C6B70" };

function InteractionsModal({ medications, onClose }) {
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [interactions, setInteractions] = useState([]);
  const [source, setSource] = useState(null);
  const [msg, setMsg] = useState("");

  const check = async () => {
    setStatus("loading");
    const names = medications.map(m => m.name).join(",");
    try {
      const res = await fetch(`/api/medications?action=interactions&names=${encodeURIComponent(names)}`);
      const data = await res.json();
      if (data.error) { setMsg(data.error); setStatus("error"); return; }
      setInteractions(data.interactions || []);
      setSource(data.source || null);
      setStatus("done");
    } catch {
      setMsg("Network error. Please try again.");
      setStatus("error");
    }
  };

  return (
    <Overlay onClose={onClose}>
      <MHead color={B.primary} onClose={onClose} eyebrow="Drug Interactions" icon={<AlertTriangle size={14} color="#ffffff88" strokeWidth={1.8}/>} title="Interaction Check"/>
      <div style={{padding:"24px 28px"}}>
        <div style={{fontSize:13,color:B.muted,marginBottom:20,lineHeight:1.6}}>
          Checking <strong style={{color:B.ink}}>{medications.length} medications</strong> against the DrugBank interaction database.
        </div>

        {status==="idle"&&(
          <button onClick={check} style={{...solidBtn(B.primary),flex:"none",width:"100%",justifyContent:"center"}}>
            <ShieldCheck size={16} strokeWidth={1.8}/> Run Interaction Check
          </button>
        )}

        {status==="loading"&&(
          <div style={{textAlign:"center",padding:"20px 0",color:B.muted,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Loader2 size={16} color={B.muted} strokeWidth={1.8} style={{animation:"spin 1s linear infinite"}}/> Checking interactions…
          </div>
        )}

        {status==="error"&&(
          <div style={{background:"#fff0f2",border:"1.5px solid #ffc5cc",borderRadius:12,padding:16,fontSize:13,color:B.light}}>{msg}</div>
        )}

        {status==="done"&&(
          interactions.length===0?(
            <div style={{textAlign:"center",padding:"16px 0"}}>
              <ShieldCheck size={32} color={B.appt} strokeWidth={1.4} style={{marginBottom:10,display:"block",margin:"0 auto 10px"}}/>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,color:B.ink,marginBottom:4}}>No interactions found</div>
              <div style={{fontSize:13,color:B.muted}}>No known drug-drug interactions between your current medications.</div>
              {source&&<div style={{fontSize:11,color:B.border,marginTop:8}}>Source: {source==="drugbank"?"DrugBank":"OpenFDA drug labels"}</div>}
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {source&&<div style={{fontSize:11,color:B.muted,marginBottom:4}}>Source: {source==="drugbank"?"DrugBank":"OpenFDA drug labels"}</div>}
              {interactions.map((i,idx)=>{
                const col=SEVERITY_COLOR[i.severity?.toLowerCase()]||SEVERITY_COLOR.unknown;
                return (
                  <div key={idx} style={{borderLeft:`4px solid ${col}`,background:col+"0d",borderRadius:"0 10px 10px 0",padding:"12px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <AlertTriangle size={12} color={col} strokeWidth={2}/>
                      <span style={{fontSize:11,fontWeight:800,color:col,textTransform:"uppercase",letterSpacing:0.8}}>{i.severity||"Unknown"} interaction</span>
                    </div>
                    <div style={{fontWeight:700,color:B.ink,fontSize:14,marginBottom:3}}>{i.drug1} + {i.drug2}</div>
                    {i.description&&<div style={{fontSize:12,color:B.muted,lineHeight:1.5}}>{i.description}</div>}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </Overlay>
  );
}

// ── Medication History Card ───────────────────────────────────────────────────
function MedHistoryCard({ entry }) {
  const col = entryColor(entry);
  const todayStr = TODAY();
  const startedDate = getStartedDate(entry);
  const weeks = getMedHistory(entry);

  const allCells = weeks.flat().filter(c=>c&&c.scheduled&&c.dateStr<=todayStr);
  const takenCells = allCells.filter(c=>c.taken);
  const pct = allCells.length ? Math.round(takenCells.length/allCells.length*100) : null;
  const pctColor = pct===null ? B.muted : pct>=80 ? B.appt : pct>=50 ? B.morning : B.light;

  return (
    <div style={{background:B.paper,borderRadius:14,padding:"15px 16px",border:`1.5px solid ${B.border}`,boxShadow:"0 2px 8px #1C0A0D0a"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:6}}>
        <div style={{minWidth:0,flex:1}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:700,fontSize:18,color:B.ink}}>{entry.name}</div>
          {entry.dose&&<div style={{fontSize:12,color:B.muted}}>{entry.dose}</div>}
        </div>
        {pct!==null&&(
          <div style={{flexShrink:0,marginLeft:10,background:pctColor+"18",border:`1.5px solid ${pctColor}`,borderRadius:20,padding:"3px 11px",fontSize:13,fontWeight:800,color:pctColor}}>
            {pct}%
          </div>
        )}
      </div>

      <div style={{fontSize:11,color:B.muted,marginBottom:10,fontWeight:600}}>
        {startedDate?`Started ${fmtDate(startedDate)}`:"Not yet started"}
        {allCells.length>0&&` · ${takenCells.length} of ${allCells.length} days`}
      </div>

      {/* Day-of-week headers */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,10px)",gap:3,marginBottom:3}}>
        {["M","T","W","T","F","S","S"].map((d,i)=>(
          <div key={i} style={{width:10,textAlign:"center",fontSize:8,fontWeight:700,color:B.muted}}>{d}</div>
        ))}
      </div>

      {/* Dot grid */}
      <div style={{display:"flex",flexDirection:"column",gap:3}}>
        {weeks.map((week,wi)=>(
          <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,10px)",gap:3}}>
            {week.map((cell,di)=>{
              if(!cell) return <div key={di} style={{width:10,height:10}}/>;
              const bg = !cell.scheduled ? "#f0e8eb"
                : cell.taken ? B.appt
                : cell.isToday ? B.border
                : "#fbbdba";
              return (
                <div key={di} title={cell.dateStr} style={{
                  width:10,height:10,borderRadius:2,background:bg,
                  outline:cell.isToday?`2px solid ${col}`:"none",outlineOffset:1,
                }}/>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:12,marginTop:9}}>
        {[{c:B.appt,l:"Taken"},{c:"#fbbdba",l:"Missed"},{c:"#f0e8eb",l:"Not scheduled"}].map(({c,l})=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:8,height:8,borderRadius:2,background:c,flexShrink:0}}/>
            <span style={{fontSize:10,color:B.muted}}>{l}</span>
          </div>
        ))}
      </div>

      {entry.pharmClass&&FLAGGED_CLASSES.some(fc=>entry.pharmClass.toLowerCase().includes(fc))&&hasRecentMissedDoses(entry)&&(
        <div style={{marginTop:10,background:"#fff7ed",border:"1.5px solid #f59e0b55",borderRadius:10,padding:"10px 12px",display:"flex",gap:8,alignItems:"flex-start"}}>
          <AlertTriangle size={14} color="#d97706" strokeWidth={2} style={{flexShrink:0,marginTop:1}}/>
          <span style={{fontSize:12,color:"#92400e",lineHeight:1.5}}>Missing doses of this medication can cause discontinuation effects -- contact your prescriber if you've missed more than one dose.</span>
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [entries,setEntries]=useState(()=>{
    try{const saved=localStorage.getItem("med-entries");return saved?JSON.parse(saved).map(migrateEntry):INITIAL;}
    catch{return INITIAL;}
  });
  useEffect(()=>{
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-7);
    const pruned=entries.map(e=>({...e,takenDates:Object.fromEntries(Object.entries(e.takenDates||{}).filter(([d])=>new Date(d)>=cutoff))}));
    localStorage.setItem("med-entries",JSON.stringify(pruned));
  },[entries]);
  useEffect(()=>{
    const meds=entries.filter(e=>e.type==="medication"&&!e.pharmClass&&e.name&&e.name!=="New Medication");
    meds.forEach(med=>{
      enrichMedication(med.name).then(({pharmClass})=>{
        if(pharmClass) setEntries(es=>es.map(e=>e.id===med.id?{...e,pharmClass}:e));
      });
    });
  },[]);// eslint-disable-line react-hooks/exhaustive-deps
  const [confirmId,setConfirmId]=useState(null);
  const [view,setView]=useState("schedule");
  const [activeDay,setActiveDay]=useState(DAYS[(new Date().getDay()+6)%7]);
  const [showScan,setShowScan]=useState(false);
  const [editEntry,setEditEntry]=useState(null);
  const [toast,setToast]=useState(null);
  const [filter,setFilter]=useState("all");
  const [showInteractions,setShowInteractions]=useState(false);
  const medications=entries.filter(e=>e.type==="medication");

  const isToday=DAYS[(new Date().getDay()+6)%7]===activeDay;
  const showToast=(msg,color=B.appt)=>{setToast({msg,color});setTimeout(()=>setToast(null),2600);};
  const handleDelete=id=>setConfirmId(id);
  const handleToggleTaken=id=>{
    const today=TODAY();
    setEntries(es=>es.map(e=>e.id!==id?e:{...e,takenDates:{...(e.takenDates||{}),[today]:!(e.takenDates||{})[today]||undefined}}));
  };
  const confirmDelete=()=>{setEntries(e=>e.filter(x=>x.id!==confirmId));showToast("Entry removed",B.light);setConfirmId(null);};
  const handleSave=u=>{setEntries(e=>e.map(x=>x.id===u.id?u:x));setEditEntry(null);showToast("Changes saved");};
  const handleConfirm=e=>{setEntries(p=>[...p,e]);setShowScan(false);showToast(`${e.name} added to schedule`);};

  const dayEntries=entries.filter(e=>e.days.includes(activeDay));
  const timeGroups=TIMES.map(t=>({time:t,entries:dayEntries.filter(e=>(e.times||[e.time]).includes(t))})).filter(g=>g.entries.length>0);
  const filtered=entries.filter(e=>filter==="all"||e.type===filter);
  const medCount=medications.length;
  const apptCount=entries.filter(e=>e.type==="appointment").length;

  return (
    <div style={{minHeight:"100vh",background:B.cream,fontFamily:"'DM Sans','Segoe UI',sans-serif",overflowX:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;}
        input:focus,select:focus{border-color:${B.primary}!important;outline:none;box-shadow:0 0 0 3px ${B.primary}18;}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${B.border};border-radius:3px}
        @keyframes toastIn{from{transform:translateX(-50%) translateY(-12px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
        @keyframes fadeUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>

      {toast&&<Toast msg={toast.msg} color={toast.color}/>}
      {showScan&&<ScanModal onConfirm={handleConfirm} onClose={()=>setShowScan(false)}/>}
      {showInteractions&&<InteractionsModal medications={medications} onClose={()=>setShowInteractions(false)}/>}
      {editEntry&&<EditModal entry={editEntry} onSave={handleSave} onClose={()=>setEditEntry(null)}/>}
      {confirmId&&<ConfirmModal onConfirm={confirmDelete} onCancel={()=>setConfirmId(null)}/>}

      {/* Header */}
      <div style={{background:`linear-gradient(140deg,${B.primary} 0%,${B.mid} 55%,${B.light} 100%)`,padding:"32px 24px 40px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-60,right:-50,width:220,height:220,borderRadius:"50%",border:"1px solid #ffffff14"}}/>
        <div style={{position:"absolute",top:20,right:30,width:100,height:100,borderRadius:"50%",border:"1px solid #ffffff10"}}/>
        <div style={{position:"absolute",bottom:-80,left:-30,width:200,height:200,borderRadius:"50%",background:"#ffffff07"}}/>
        <div style={{maxWidth:800,margin:"0 auto",position:"relative"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <Activity size={13} color={B.rose} strokeWidth={2}/>
            <span style={{color:B.rose,fontSize:10,fontWeight:700,letterSpacing:3,textTransform:"uppercase"}}>Health Assistant</span>
          </div>
          <h1 style={{color:"#fff",fontFamily:"'Cormorant Garamond',serif",fontSize:32,margin:"0 0 24px",fontWeight:700,lineHeight:1.1}}>My Health Schedule</h1>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {[
              {label:"Today",val:dayEntries.length,icon:<ClipboardList size={15} color={B.rose} strokeWidth={1.8}/>},
              {label:"Medications",val:medCount,icon:<Pill size={15} color={B.rose} strokeWidth={1.8}/>},
              {label:"Appointments",val:apptCount,icon:<CalendarDays size={15} color={B.rose} strokeWidth={1.8}/>},
            ].map(s=>(
              <div key={s.label} style={{background:"#ffffff14",backdropFilter:"blur(10px)",borderRadius:14,padding:"10px 16px",border:"1px solid #ffffff1e",display:"flex",alignItems:"center",gap:10}}>
                {s.icon}
                <div>
                  <div style={{color:"#fff",fontSize:22,fontWeight:800,lineHeight:1,fontFamily:"'Cormorant Garamond',serif"}}>{s.val}</div>
                  <div style={{color:B.rose,fontSize:10,fontWeight:700,letterSpacing:0.5}}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{maxWidth:800,margin:"0 auto",padding:"0 16px 100px"}}>

        {/* Actions */}
        <div style={{display:"flex",gap:10,margin:"20px 0 16px",flexWrap:"wrap"}}>
          <button onClick={()=>setShowScan(true)} style={{flex:"1 1 140px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:`linear-gradient(135deg,${B.primary},${B.mid})`,color:"#fff",border:"none",borderRadius:14,padding:"13px 16px",cursor:"pointer",fontWeight:700,fontSize:13,boxShadow:`0 4px 18px ${B.primary}44`,fontFamily:"inherit"}}>
            <Camera size={16} strokeWidth={1.8}/> Scan Item
          </button>
          <button onClick={()=>{const n={id:Date.now(),type:"medication",name:"New Medication",quantity:"",dose:"",times:[],specificTimes:{},notes:"",days:[]};setEntries(e=>[...e,n]);setEditEntry(n);}} style={{flex:"1 1 120px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:B.paper,color:B.primary,border:`1.5px solid ${B.border}`,borderRadius:14,padding:"13px 14px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>
            <Pill size={14} strokeWidth={1.8}/> Add Med
          </button>
          <button onClick={()=>{const n={id:Date.now(),type:"appointment",name:"New Appointment",dose:"",times:[],specificTimes:{},notes:"",days:[]};setEntries(e=>[...e,n]);setEditEntry(n);}} style={{flex:"1 1 120px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:B.paper,color:B.appt,border:"1.5px solid #c5e8de",borderRadius:14,padding:"13px 14px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>
            <CalendarDays size={14} strokeWidth={1.8}/> Add Appt
          </button>
          {medications.length>=2&&(
            <button onClick={()=>setShowInteractions(true)} style={{flex:"1 1 120px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:B.paper,color:B.primary,border:`1.5px solid ${B.border}`,borderRadius:14,padding:"13px 14px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>
              <ShieldCheck size={14} strokeWidth={1.8}/> Interactions
            </button>
          )}
        </div>

        <div style={{fontSize:12,color:B.muted,marginBottom:16,lineHeight:1.6}}>
          <strong style={{color:B.ink}}>Scan Item</strong> — take a photo of a label to add it automatically. &nbsp;
          <strong style={{color:B.ink}}>Add Med / Add Appt</strong> — enter details manually. Use <strong style={{color:B.ink}}>Schedule</strong> to see your day, or <strong style={{color:B.ink}}>All Entries</strong> to see everything.
        </div>

        {/* View toggle */}
        <div style={{overflowX:"auto",marginBottom:22}}>
          <div style={{display:"flex",background:B.paper,borderRadius:12,padding:4,border:`1.5px solid ${B.border}`,width:"fit-content"}}>
            {[
              ["schedule","Schedule",<CalendarRange size={13} strokeWidth={2}/>],
              ["list","All Entries",<LayoutList size={13} strokeWidth={2}/>],
              ["history","History",<BarChart2 size={13} strokeWidth={2}/>],
            ].map(([v,label,icon])=>(
              <button key={v} onClick={()=>{setView(v);if(v==="list")setFilter("all");}} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit",background:view===v?`linear-gradient(135deg,${B.primary},${B.mid})`:"transparent",color:view===v?"#fff":B.muted,transition:"all 0.18s",whiteSpace:"nowrap"}}>
                {icon}{label}
              </button>
            ))}
          </div>
        </div>

        {/* Schedule View */}
        {view==="schedule"&&(
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <div style={{display:"flex",gap:7,marginBottom:26,overflowX:"auto",paddingBottom:6,paddingTop:6}}>
              {DAYS.map(d=>{
                const cnt=entries.filter(e=>e.days.includes(d)).length;
                const on=activeDay===d;
                return (
                  <button key={d} onClick={()=>setActiveDay(d)} style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"9px 13px",borderRadius:13,border:`1.5px solid ${on?B.primary:B.border}`,background:on?`linear-gradient(135deg,${B.primary},${B.mid})`:B.paper,color:on?"#fff":B.muted,cursor:"pointer",minWidth:52,fontWeight:700,fontFamily:"inherit",boxShadow:on?`0 4px 14px ${B.primary}44`:"none",transition:"all 0.16s"}}>
                    <span style={{fontSize:12}}>{d}</span>
                    {cnt>0&&<span style={{background:on?"#ffffff30":B.rose+"66",color:on?"#fff":B.primary,borderRadius:100,fontSize:9,fontWeight:800,padding:"1px 5px"}}>{cnt}</span>}
                  </button>
                );
              })}
            </div>

            {timeGroups.length===0?(
              <div style={{textAlign:"center",padding:"60px 20px"}}>
                <CalendarDays size={40} color={B.border} strokeWidth={1.2} style={{margin:"0 auto 14px",display:"block"}}/>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,color:B.border,marginBottom:6}}>Nothing scheduled for {activeDay}</div>
                <div style={{fontSize:13,color:B.border}}>Use Scan or the Add buttons above</div>
              </div>
            ):timeGroups.map(group=>{
              const col=TIME_COLORS[group.time];
              const TIcon=TIME_ICONS[group.time];
              return (
                <div key={group.time} style={{marginBottom:28}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                    <div style={{width:36,height:36,borderRadius:10,background:col,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13,fontFamily:"inherit"}}>
                      <TIcon size={16} color="#fff" strokeWidth={1.8}/>
                    </div>
                    <div>
                      <div style={{fontWeight:800,fontSize:15,color:B.ink}}>{group.time.charAt(0).toUpperCase()+group.time.slice(1)}</div>
                      <div style={{fontSize:10,color:B.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>{group.entries.length} item{group.entries.length>1?"s":""}</div>
                    </div>
                    <div style={{flex:1,height:1.5,background:col+"22",marginLeft:6}}/>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:9}}>
                    {group.entries.map(e=><EntryCard key={e.id} entry={e} onEdit={setEditEntry} onDelete={handleDelete} onToggleTaken={handleToggleTaken} showTaken={isToday&&e.type==="medication"} compact/>)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List View */}
        {view==="list"&&(
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <div style={{display:"flex",gap:8,marginBottom:20}}>
              {[["all","All"],["medication","Medications"],["appointment","Appointments"]].map(([v,label])=>(
                <button key={v} onClick={()=>setFilter(v)} style={{padding:"8px 16px",borderRadius:10,border:`1.5px solid ${filter===v?B.primary:B.border}`,background:filter===v?B.rose+"55":B.paper,color:filter===v?B.primary:B.muted,cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"inherit",transition:"all 0.14s",letterSpacing:0.3}}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              {filtered.length===0?(
                <div style={{textAlign:"center",padding:"60px 20px"}}>
                  <ClipboardList size={38} color={B.border} strokeWidth={1.2} style={{display:"block",margin:"0 auto 14px"}}/>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,color:B.border}}>No entries found</div>
                </div>
              ):filtered.map(e=><EntryCard key={e.id} entry={e} onEdit={setEditEntry} onDelete={handleDelete}/>)}
            </div>
          </div>
        )}

        {/* History View */}
        {view==="history"&&(
          <div style={{animation:"fadeUp 0.3s ease"}}>
            {medications.length===0?(
              <div style={{textAlign:"center",padding:"60px 20px"}}>
                <BarChart2 size={38} color={B.border} strokeWidth={1.2} style={{display:"block",margin:"0 auto 14px"}}/>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,color:B.border}}>No medications yet</div>
                <div style={{fontSize:13,color:B.border}}>Add medications to track your adherence</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{fontSize:12,color:B.muted,marginBottom:4,lineHeight:1.6}}>
                  Showing the past 4–5 weeks. <strong style={{color:B.ink}}>Tap the colored icon</strong> on today's schedule to mark doses taken.
                </div>
                {medications.map(e=><MedHistoryCard key={e.id} entry={e}/>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer legend */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#fdf6f0ee",backdropFilter:"blur(14px)",borderTop:`1.5px solid ${B.border}`,padding:"10px 20px"}}>
        <div style={{maxWidth:800,margin:"0 auto",display:"flex",gap:18,justifyContent:"center",flexWrap:"wrap"}}>
          {[
            {label:"Morning",   col:B.morning,   Icon:Sun},
            {label:"Afternoon", col:B.afternoon, Icon:Cloud},
            {label:"Evening",   col:B.evening,   Icon:Moon},
            {label:"Night",     col:B.night,     Icon:Star},
            {label:"Appt",      col:B.appt,      Icon:Stethoscope},
          ].map(({label,col,Icon})=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:col}}/>
              <Icon size={12} color={col} strokeWidth={1.8}/>
              <span style={{fontSize:11,color:B.muted,fontWeight:600}}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
