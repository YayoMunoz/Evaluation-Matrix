import { useState, useEffect, useRef } from "react";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://dqbdhsgbygnavlwpngye.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxYmRoc2dieWduYXZsd3BuZ3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NjYzMDcsImV4cCI6MjA5NDI0MjMwN30.Iah7EncDUJmsrQpNVOndilw7r0wZuXZCmx8fk6wiUDg";

async function dbLoad(){
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/matrices?select=id,data`,{headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`}});
    const rows=await r.json();
    if(Array.isArray(rows)) return rows.map(r=>r.data);
  }catch(e){console.error(e);}
  return null;
}

async function dbSave(matrices){
  try{
    // Upsert all matrices as individual rows
    const rows=matrices.map(m=>({id:m.id,data:m}));
    await fetch(`${SUPABASE_URL}/rest/v1/matrices`,{
      method:"POST",
      headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},
      body:JSON.stringify(rows),
    });
    // Delete rows not in current list
    const ids=matrices.map(m=>m.id);
    if(ids.length>0){
      await fetch(`${SUPABASE_URL}/rest/v1/matrices?id=not.in.(${ids.map(id=>`"${id}"`).join(",")})`,{
        method:"DELETE",
        headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`},
      });
    }
  }catch(e){console.error(e);}
}

// ─── SHORT SHARE LINKS (Supabase) ─────────────────────────────────────────────
// Genera un ID corto y guarda el reporte en la tabla `shared_reports`.
// El link resultante lleva solo ?r=<id> en vez de todo el payload en Base64,
// por lo que es corto y no se rompe al pegarlo en WhatsApp / correo.
function shortId(){
  const chars="abcdefghijklmnopqrstuvwxyz0123456789";
  let s="";for(let i=0;i<8;i++)s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}

// Guarda un reporte y devuelve su id corto (o null si falla).
async function saveSharedReport(payload){
  try{
    const id=shortId();
    const r=await fetch(`${SUPABASE_URL}/rest/v1/shared_reports`,{
      method:"POST",
      headers:{
        "apikey":SUPABASE_KEY,
        "Authorization":`Bearer ${SUPABASE_KEY}`,
        "Content-Type":"application/json",
        "Prefer":"return=minimal",
      },
      body:JSON.stringify({id,data:payload}),
    });
    if(r.ok) return id;
    console.error("saveSharedReport failed",r.status);
  }catch(e){console.error(e);}
  return null;
}

// Lee un reporte guardado por su id corto.
async function loadSharedReport(id){
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/shared_reports?id=eq.${encodeURIComponent(id)}&select=data`,{
      headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`},
    });
    const rows=await r.json();
    if(Array.isArray(rows)&&rows.length>0) return rows[0].data;
  }catch(e){console.error(e);}
  return null;
}

// ─── BRAND ────────────────────────────────────────────────────────────────────
const B = {
  blue:"#1558B0",blueDark:"#0D2A52",blueMid:"#4A6FA5",blueLight:"#EBF2FB",
  orange:"#F5793A",white:"#FFFFFF",green:"#1E9E6B",red:"#E03E3E",
  yellow:"#F59E0B",bg:"#F4F8FE",border:"#C8DCF5",
  textDark:"#0D2A52",textMid:"#4A6FA5",textLight:"#7FA3CC",
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SCORE_LABELS = ["Not demonstrated","Minimally demonstrated","Adequately demonstrated","Exceeds expectations"];
const SCORE_VALUES = [0,40,100,100];
const SCORE_COLORS = [B.red,B.yellow,B.blue,B.green];

const CAT_CONFIG = [
  {id:"must",      name:"MUST",        pool:0.45,  min:3, fixed:false},
  {id:"hard",      name:"HARD SKILLS", pool:0.225, min:3, fixed:false},
  {id:"soft",      name:"SOFT SKILLS", pool:0.225, min:3, fixed:false},
  {id:"economics", name:"ECONOMICS",   pool:0.10,  min:2, fixed:true},
];
const CAT_COLORS = {must:B.blue,hard:"#2575C4",soft:B.green,economics:B.orange};
const CAT_BG = {must:"#EBF2FB",hard:"#E8F0FA",soft:"#E6F6F0",economics:"#FEF3EC"};

const STATUS_CONFIG = {
  activa:  {label:"Active",  color:B.green,  bg:"#E6F6F0",border:"#A7DFCA"},
  pausada: {label:"Paused",  color:B.yellow, bg:"#FEF9EC",border:"#F5D88A"},
  cerrada: {label:"Closed",  color:B.red,    bg:"#FEE8E8",border:"#FBCACA"},
};

function getCriterionWeight(catId,count){
  const cfg=CAT_CONFIG.find(c=>c.id===catId);
  return cfg&&count>0?cfg.pool/count:0;
}
function uid(){return Math.random().toString(36).slice(2,9);}
function buildEmptyCategories(){
  return CAT_CONFIG.map(cfg=>({
    id:cfg.id,name:cfg.name,
    criteria:Array.from({length:cfg.min},()=>({id:uid(),description:"",question:""})),
  }));
}
function calcScore(scores,categories){
  let total=0;
  for(const cat of categories){
    const w=getCriterionWeight(cat.id,cat.criteria.length);
    for(const cr of cat.criteria){
      const s=scores?.[cr.id];
      if(s!==undefined) total+=w*SCORE_VALUES[s];
    }
  }
  return Math.round(total*10)/10;
}
function applySortFilter(list,search,statusFilter,clientFilter,sortCol,sortDir){
  const f=list.filter(m=>{
    const q=search.toLowerCase();
    const matchSearch=m.name.toLowerCase().includes(q)||(m.positionNumber||"").toLowerCase().includes(q)||(m.clientName||"").toLowerCase().includes(q);
    const matchStatus=statusFilter==="all"||(m.status||"activa")===statusFilter;
    const matchClient=clientFilter==="all"||(m.clientName||"")=== clientFilter;
    return matchSearch&&matchStatus&&matchClient;
  });
  return [...f].sort((a,b)=>{
    let cmp=0;
    if(sortCol==="num") cmp=(a.positionNumber||"").localeCompare(b.positionNumber||"",undefined,{numeric:true});
    else if(sortCol==="name") cmp=a.name.localeCompare(b.name);
    else if(sortCol==="client") cmp=(a.clientName||"").localeCompare(b.clientName||"");
    else if(sortCol==="status") cmp=(a.status||"activa").localeCompare(b.status||"activa");
    return sortDir==="asc"?cmp:-cmp;
  });
}

const DEFAULT_MATRIX={
  id:"matrix-ap",positionNumber:"001",clientName:"Example Corp",status:"activa",
  name:"Accounts Payable Coordinator",candidates:[],
  categories:[
    {id:"must",name:"MUST",criteria:[
      {id:"c1",description:"At least 2+ years handling invoices, payments, and vendor interactions"},
      {id:"c2",description:"Able to communicate clearly with vendors and internal teams (written and verbal)"},
      {id:"c3",description:"Ability to manage invoice flow, track pending items, and ensure tickets or requests do not age"},
    ]},
    {id:"hard",name:"HARD SKILLS",criteria:[
      {id:"c4",description:"Ability to review, validate, and resolve discrepancies in invoices"},
      {id:"c5",description:"Experience entering invoices and working within ERP systems"},
      {id:"c6",description:"Basic formulas, tracking files, and managing AP reports"},
    ]},
    {id:"soft",name:"SOFT SKILLS",criteria:[
      {id:"c7",description:"Consistent attention to detail when entering and reviewing invoices"},
      {id:"c8",description:"Follows up on tickets, vendors, and pending items without waiting"},
      {id:"c9",description:"Handles vendor inquiries clearly and keeps things moving"},
    ]},
    {id:"economics",name:"ECONOMICS",criteria:[
      {id:"c10",description:"Salary Expectation"},
      {id:"c11",description:"Work Modality (Remote)"},
    ]},
  ],
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const btnPrimary={background:B.blue,color:B.white,border:"none",borderRadius:8,padding:"9px 20px",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 2px 8px ${B.blue}33`};
const btnSecondary={background:B.white,color:B.blue,border:`1.5px solid ${B.border}`,borderRadius:8,padding:"9px 16px",fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"inherit"};
const btnSm={border:"none",borderRadius:6,padding:"5px 10px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit"};
const inputBase={background:B.white,border:`1.5px solid ${B.border}`,borderRadius:8,padding:"8px 12px",color:B.textDark,fontSize:13,fontFamily:"inherit",outline:"none"};
const card={background:B.white,borderRadius:14,border:`1px solid ${B.border}`,boxShadow:`0 2px 12px ${B.blue}10`};

// ─── ATOMS ────────────────────────────────────────────────────────────────────
function WexpandLogo({size=28}){
  return(
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill={B.blue}/>
      <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="22" fontWeight="900" fontFamily="Arial Black,Arial,sans-serif">W</text>
    </svg>
  );
}
function PosBadge({number}){
  return <span style={{background:B.orange+"18",color:B.orange,border:`1.5px solid ${B.orange}55`,borderRadius:7,padding:"2px 9px",fontWeight:800,fontSize:12,fontFamily:"'DM Mono',monospace",letterSpacing:0.5,whiteSpace:"nowrap"}}>#{number}</span>;
}
function StatusBadge({status,small}){
  const s=STATUS_CONFIG[status]||STATUS_CONFIG.activa;
  return <span style={{background:s.bg,color:s.color,border:`1.5px solid ${s.border}`,borderRadius:20,padding:small?"1px 8px":"3px 11px",fontWeight:800,fontSize:small?10:11,letterSpacing:0.3,whiteSpace:"nowrap"}}>{s.label}</span>;
}
function StatusSelect({status,matrixId,onStatusChange}){
  const s=STATUS_CONFIG[status||"activa"];
  return(
    <select value={status||"activa"}
      onClick={e=>e.stopPropagation()}
      onChange={e=>{e.stopPropagation();onStatusChange(matrixId,e.target.value);}}
      style={{border:`1.5px solid ${s.border}`,background:s.bg,color:s.color,borderRadius:20,padding:"3px 8px",fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"inherit",outline:"none",flexShrink:0}}>
      {Object.entries(STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
    </select>
  );
}
function ScoreBadge({score,large}){
  const color=score>=90?B.green:score>=70?B.blue:score>=50?B.yellow:B.red;
  return <span style={{background:color+"18",color,border:`1.5px solid ${color}44`,borderRadius:20,padding:large?"5px 16px":"3px 12px",fontWeight:800,fontSize:large?18:13,fontFamily:"'DM Mono',monospace"}}>{score}%</span>;
}
function ScoreButton({value,selected,onChange}){
  return(
    <button onClick={()=>onChange(value)} title={SCORE_LABELS[value]}
      style={{width:30,height:30,borderRadius:"50%",flexShrink:0,border:selected?`3px solid ${SCORE_COLORS[value]}`:`2px solid ${B.border}`,background:selected?SCORE_COLORS[value]:B.white,cursor:"pointer",transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:selected?`0 2px 8px ${SCORE_COLORS[value]}44`:"none"}}>
      {selected&&<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </button>
  );
}
function WeightPill({catId,count}){
  const cfg=CAT_CONFIG.find(c=>c.id===catId);
  const per=count>0?Math.round((cfg.pool/count)*1000)/10:0;
  return <span style={{background:B.blueLight,color:B.blue,border:`1px solid ${B.border}`,borderRadius:6,padding:"2px 9px",fontSize:11,fontFamily:"'DM Mono',monospace",fontWeight:600,whiteSpace:"nowrap"}}>{Math.round(cfg.pool*100)}% ÷ {count} = {per}% each</span>;
}
function RankingBar({score}){
  const color=score>=90?B.green:score>=70?B.blue:score>=50?B.yellow:B.red;
  return(
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <div style={{flex:1,height:8,background:B.blueLight,borderRadius:4,overflow:"hidden"}}>
        <div style={{width:`${score}%`,height:"100%",background:color,borderRadius:4,transition:"width 0.6s ease"}}/>
      </div>
      <ScoreBadge score={score}/>
    </div>
  );
}
function SortIcon({active,dir}){
  return(
    <span style={{display:"inline-flex",flexDirection:"column",gap:1,marginLeft:4,verticalAlign:"middle"}}>
      <svg width="8" height="5" viewBox="0 0 8 5" fill={active&&dir==="asc"?B.blue:B.textLight}><path d="M4 0L8 5H0z"/></svg>
      <svg width="8" height="5" viewBox="0 0 8 5" fill={active&&dir==="desc"?B.blue:B.textLight}><path d="M4 5L0 0H8z"/></svg>
    </span>
  );
}
function ViewToggle({view,onChange}){
  return(
    <div style={{display:"flex",background:B.blueLight,border:`1px solid ${B.border}`,borderRadius:8,padding:3,gap:2}}>
      {[
        {key:"kanban",label:"Kanban",icon:<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/></svg>},
        {key:"list",label:"List",icon:<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>},
      ].map(({key,icon,label})=>(
        <button key={key} onClick={()=>onChange(key)} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 14px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,transition:"all 0.15s",background:view===key?B.white:"transparent",color:view===key?B.blue:B.textLight,boxShadow:view===key?`0 1px 4px ${B.border}`:"none"}}>
          {icon}{label}
        </button>
      ))}
    </div>
  );
}

// ─── 3-DOT MATRIX MENU ───────────────────────────────────────────────────────
function MatrixMenu({matrixId,onDelete}){
  const [open,setOpen]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const ref=useRef(null);

  useEffect(()=>{
    function handleClick(e){if(ref.current&&!ref.current.contains(e.target)){setOpen(false);setConfirm(false);}}
    document.addEventListener("mousedown",handleClick);
    return()=>document.removeEventListener("mousedown",handleClick);
  },[]);

  return(
    <div ref={ref} style={{position:"relative",flexShrink:0}} onClick={e=>e.stopPropagation()}>
      <button
        onClick={e=>{e.stopPropagation();setOpen(o=>!o);setConfirm(false);}}
        style={{width:28,height:28,borderRadius:6,background:"none",border:`1px solid transparent`,color:B.textLight,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.15s"}}
        onMouseEnter={e=>{e.currentTarget.style.background=B.blueLight;e.currentTarget.style.borderColor=B.border;}}
        onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.borderColor="transparent";}}
      >
        {[0,1,2].map(i=><div key={i} style={{width:4,height:4,borderRadius:"50%",background:B.textLight}}/>)}
      </button>

      {open&&(
        <div style={{position:"absolute",top:32,right:0,background:B.white,border:`1px solid ${B.border}`,borderRadius:10,boxShadow:`0 8px 24px ${B.blue}18`,minWidth:180,zIndex:100,overflow:"hidden"}}>
          {!confirm?(
            <button
              onClick={e=>{e.stopPropagation();setConfirm(true);}}
              style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"none",border:"none",cursor:"pointer",color:B.red,fontSize:13,fontWeight:700,fontFamily:"inherit",textAlign:"left"}}
              onMouseEnter={e=>e.currentTarget.style.background="#FEE8E8"}
              onMouseLeave={e=>e.currentTarget.style.background="none"}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Delete matrix
            </button>
          ):(
            <div style={{padding:"12px 14px"}}>
              <div style={{color:B.textDark,fontSize:12,fontWeight:700,marginBottom:8,lineHeight:1.4}}>Delete this matrix and all its evaluations?</div>
              <div style={{display:"flex",gap:6}}>
                <button
                  onClick={e=>{e.stopPropagation();setOpen(false);setConfirm(false);}}
                  style={{flex:1,padding:"6px 0",borderRadius:6,border:`1px solid ${B.border}`,background:B.white,color:B.textMid,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
                >Cancel</button>
                <button
                  onClick={e=>{e.stopPropagation();onDelete(matrixId);setOpen(false);setConfirm(false);}}
                  style={{flex:1,padding:"6px 0",borderRadius:6,border:"none",background:B.red,color:B.white,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                >Delete</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MATRIX CARD ──────────────────────────────────────────────────────────────
function MatrixCard({m,onSelect,onDelete}){
  const cands=m.candidates||[];
  const best=cands.length?Math.max(...cands.map(c=>c.totalScore)):null;
  const totalCriteria=m.categories.flatMap(c=>c.criteria).length;
  const [hov,setHov]=useState(false);
  return(
    <div onClick={()=>onSelect(m.id)} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{...card,padding:"20px 20px 16px",cursor:"pointer",position:"relative",transition:"box-shadow 0.2s,transform 0.15s",display:"flex",flexDirection:"column",gap:14,boxShadow:hov?`0 6px 24px ${B.blue}22`:card.boxShadow,transform:hov?"translateY(-2px)":"none",borderColor:hov?B.blue:B.border}}>

      {/* 3-dot menu top right */}
      <div style={{position:"absolute",top:12,right:12}} onClick={e=>e.stopPropagation()}>
        <MatrixMenu matrixId={m.id} onDelete={onDelete}/>
      </div>

      <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
        <div style={{flex:1,paddingRight:28}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
            <PosBadge number={m.positionNumber||"—"}/>
            <StatusBadge status={m.status||"activa"} small/>
          </div>
          <div style={{color:B.textDark,fontWeight:800,fontSize:14,lineHeight:1.3}}>{m.name}</div>
          {m.clientName&&<div style={{display:"flex",alignItems:"center",gap:4,marginTop:4}}>
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke={B.textLight} strokeWidth="2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0H5m-2 0h2M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 00-1-1h-2a1 1 0 00-1 1v5m4 0H9" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{color:B.textLight,fontSize:11,fontWeight:600}}>{m.clientName}</span>
          </div>}
        </div>
      </div>

      <div style={{borderTop:`1px solid ${B.border}`,paddingTop:12,display:"flex",alignItems:"center",gap:0}}>
        {[{label:"Candidates",value:cands.length},...(best!==null?[{label:"Best",value:`${best}%`,color:B.green}]:[])].map((s,i)=>(
          <div key={i} style={{flex:1,borderLeft:i>0?`1px solid ${B.border}`:"none",paddingLeft:i>0?12:0,marginLeft:i>0?12:0}}>
            <div style={{color:B.textLight,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{s.label}</div>
            <div style={{color:s.color||B.textDark,fontWeight:800,fontSize:16,fontFamily:"'DM Mono',monospace"}}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MATRIX ROW ───────────────────────────────────────────────────────────────
function MatrixRow({m,onSelect,onDelete}){
  const cands=m.candidates||[];
  const best=cands.length?Math.max(...cands.map(c=>c.totalScore)):null;
  const [hov,setHov]=useState(false);
  return(
    <div onClick={()=>onSelect(m.id)} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{background:B.white,borderRadius:10,border:`1px solid ${B.border}`,boxShadow:`0 1px 6px ${B.blue}08`,padding:"13px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:20,transition:"box-shadow 0.15s,border-color 0.15s",boxShadow:hov?`0 4px 18px ${B.blue}18`:`0 1px 6px ${B.blue}08`,borderColor:hov?B.blue:B.border}}>
      {/* # */}
      <div style={{flexShrink:0}}><PosBadge number={m.positionNumber||"—"}/></div>
      {/* Position name */}
      <div style={{flex:2,minWidth:0,color:B.textDark,fontWeight:800,fontSize:15,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.name}</div>
      {/* Client */}
      <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:4}}>
        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke={B.textLight} strokeWidth="2" style={{flexShrink:0}}><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0H5m-2 0h2M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 00-1-1h-2a1 1 0 00-1 1v5m4 0H9" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <span style={{color:B.textLight,fontSize:13,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.clientName||"—"}</span>
      </div>
      {/* Status */}
      <div style={{flexShrink:0}}><StatusBadge status={m.status||"activa"} small/></div>
      {/* Candidates */}
      <div style={{textAlign:"center",flexShrink:0,minWidth:80}}>
        <div style={{color:B.textDark,fontWeight:800,fontSize:15,fontFamily:"'DM Mono',monospace"}}>{cands.length}</div>
      </div>
      {/* Best score */}
      <div style={{textAlign:"center",flexShrink:0,minWidth:80}}>
        <div style={{color:best!==null?B.green:B.textLight,fontWeight:800,fontSize:15,fontFamily:"'DM Mono',monospace"}}>{best!==null?`${best}%`:"—"}</div>
      </div>
      {/* 3-dot menu */}
      <div onClick={e=>e.stopPropagation()}>
        <MatrixMenu matrixId={m.id} onDelete={onDelete}/>
      </div>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function Home({matrices,onSelect,onCreate,onDelete,onStatusChange}){
  const [displayMode,setDisplayMode]=useState("list");
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("all");
  const [clientFilter,setClientFilter]=useState("all");
  const [sortCol,setSortCol]=useState("num");
  const [sortDir,setSortDir]=useState("asc");

  function handleColSort(col){
    if(sortCol===col) setSortDir(d=>d==="asc"?"desc":"asc");
    else{setSortCol(col);setSortDir("asc");}
  }

  // Unique client list from matrices
  const clientOptions=["all",...Array.from(new Set(matrices.map(m=>m.clientName||"").filter(Boolean))).sort()];

  const filtered=applySortFilter(matrices,search,statusFilter,clientFilter,sortCol,sortDir);

  // shared dropdown style
  const dropStyle={
    ...inputBase,
    paddingRight:30, cursor:"pointer", appearance:"none", WebkitAppearance:"none",
    backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237FA3CC' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat:"no-repeat", backgroundPosition:"calc(100% - 10px) center",
    minWidth:160,
  };

  return(
    <>
      <div style={{marginBottom:24}}>
        <h1 style={{margin:0,fontSize:30,color:B.textDark,fontWeight:900,letterSpacing:-0.5}}>Evaluation Matrix</h1>
        <p style={{color:B.textMid,margin:"6px 0 0",fontSize:14}}>Manage position matrices and evaluate candidates.</p>
      </div>

      {/* Toolbar */}
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
        {/* Search */}
        <div style={{flex:1,minWidth:200,position:"relative"}}>
          <svg style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}} width="15" height="15" fill="none" viewBox="0 0 24 24" stroke={B.textLight} strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, number or client..."
            style={{...inputBase,width:"100%",paddingLeft:34,borderRadius:8}}/>
          {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:B.textLight,cursor:"pointer",fontSize:17,lineHeight:1,padding:0}}>×</button>}
        </div>

        {/* Status dropdown */}
        <div style={{position:"relative"}}>
          {statusFilter!=="all"&&(
            <div style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",width:8,height:8,borderRadius:"50%",background:STATUS_CONFIG[statusFilter]?.color,pointerEvents:"none",zIndex:1}}/>
          )}
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
            style={{...dropStyle, paddingLeft: statusFilter!=="all"?26:12,
              borderColor: statusFilter!=="all"?STATUS_CONFIG[statusFilter]?.border:B.border,
              color: statusFilter!=="all"?STATUS_CONFIG[statusFilter]?.color:B.textMid,
              background: statusFilter!=="all"?STATUS_CONFIG[statusFilter]?.bg:B.white,
            }}>
            <option value="all">All statuses</option>
            {Object.entries(STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Client dropdown */}
        <div style={{position:"relative"}}>
          {clientFilter!=="all"&&(
            <svg style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}} width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={B.blue} strokeWidth="2">
              <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0H5m-2 0h2M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 00-1-1h-2a1 1 0 00-1 1v5m4 0H9" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          <select value={clientFilter} onChange={e=>setClientFilter(e.target.value)}
            style={{...dropStyle, paddingLeft: clientFilter!=="all"?28:12,
              borderColor: clientFilter!=="all"?B.blue:B.border,
              color: clientFilter!=="all"?B.blue:B.textMid,
              background: clientFilter!=="all"?B.blueLight:B.white,
            }}>
            <option value="all">All clients</option>
            {clientOptions.filter(c=>c!=="all").map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <ViewToggle view={displayMode} onChange={v=>setDisplayMode(v)}/>
        <button onClick={onCreate} style={btnPrimary}>+ New Matrix</button>
      </div>

      {/* Active filters summary */}
      {(search||statusFilter!=="all"||clientFilter!=="all")&&(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          <span style={{color:B.textMid,fontSize:13}}>{filtered.length} result{filtered.length!==1?"s":""}</span>
          {statusFilter!=="all"&&(
            <span style={{display:"flex",alignItems:"center",gap:4,background:STATUS_CONFIG[statusFilter].bg,color:STATUS_CONFIG[statusFilter].color,border:`1px solid ${STATUS_CONFIG[statusFilter].border}`,borderRadius:20,padding:"2px 10px",fontSize:12,fontWeight:700}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:STATUS_CONFIG[statusFilter].color}}/>
              {STATUS_CONFIG[statusFilter].label}
              <button onClick={()=>setStatusFilter("all")} style={{background:"none",border:"none",cursor:"pointer",color:"inherit",fontSize:14,lineHeight:1,padding:"0 0 0 2px",opacity:0.7}}>×</button>
            </span>
          )}
          {clientFilter!=="all"&&(
            <span style={{display:"flex",alignItems:"center",gap:4,background:B.blueLight,color:B.blue,border:`1px solid ${B.border}`,borderRadius:20,padding:"2px 10px",fontSize:12,fontWeight:700}}>
              {clientFilter}
              <button onClick={()=>setClientFilter("all")} style={{background:"none",border:"none",cursor:"pointer",color:"inherit",fontSize:14,lineHeight:1,padding:"0 0 0 2px",opacity:0.7}}>×</button>
            </span>
          )}
          {search&&(
            <span style={{color:B.textLight,fontSize:12}}>"{search}"</span>
          )}
        </div>
      )}

      {filtered.length===0?(
        <div style={{textAlign:"center",padding:"60px 0",border:`1.5px dashed ${B.border}`,borderRadius:14,background:B.blueLight}}>
          <div style={{fontSize:36,marginBottom:10}}>🔍</div>
          <div style={{color:B.textMid,fontWeight:700,marginBottom:4}}>No results found.</div>
          <div style={{fontSize:13,color:B.textLight}}>Try adjusting your filters or search term.</div>
        </div>
      ):matrices.length===0?(
        <div style={{textAlign:"center",padding:"60px 0",border:`1.5px dashed ${B.border}`,borderRadius:14,background:B.blueLight}}>
          <div style={{fontSize:36,marginBottom:10}}>📋</div>
          <div style={{color:B.textMid,fontWeight:700,marginBottom:4}}>No matrices yet.</div>
          <div style={{fontSize:13,color:B.textLight}}>Click "+ New Matrix" to create the first one.</div>
        </div>
      ):displayMode==="kanban"?(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:16}}>
          {filtered.map(m=><MatrixCard key={m.id} m={m} onSelect={onSelect} onDelete={onDelete}/>)}
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {/* Sortable header */}
          <div style={{display:"flex",alignItems:"center",gap:20,padding:"4px 20px 8px",borderBottom:`1px solid ${B.border}`}}>
            <button onClick={()=>handleColSort("num")} style={{flexShrink:0,background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:2,color:sortCol==="num"?B.blue:B.textLight,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:700,fontFamily:"inherit",padding:0,minWidth:60}}>
              # <SortIcon active={sortCol==="num"} dir={sortDir}/>
            </button>
            <button onClick={()=>handleColSort("name")} style={{flex:2,background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:2,color:sortCol==="name"?B.blue:B.textLight,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:700,fontFamily:"inherit",padding:0,textAlign:"left"}}>
              Position <SortIcon active={sortCol==="name"} dir={sortDir}/>
            </button>
            <button onClick={()=>handleColSort("client")} style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:2,color:sortCol==="client"?B.blue:B.textLight,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:700,fontFamily:"inherit",padding:0,textAlign:"left"}}>
              Client <SortIcon active={sortCol==="client"} dir={sortDir}/>
            </button>
            <button onClick={()=>handleColSort("status")} style={{flexShrink:0,minWidth:60,background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:2,color:sortCol==="status"?B.blue:B.textLight,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:700,fontFamily:"inherit",padding:0}}>
              Status <SortIcon active={sortCol==="status"} dir={sortDir}/>
            </button>
            <div style={{textAlign:"center",flexShrink:0,minWidth:80,color:B.textLight,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>Candidates</div>
            <div style={{textAlign:"center",flexShrink:0,minWidth:80,color:B.textLight,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>Best score</div>
            <div style={{width:28,flexShrink:0}}/>
          </div>
          {filtered.map(m=><MatrixRow key={m.id} m={m} onSelect={onSelect} onDelete={onDelete}/>)}
        </div>
      )}
    </>
  );
}

// ─── CLIENT COMBOBOX ──────────────────────────────────────────────────────────
// Campo tipo "combobox": muestra la lista de clientes existentes, permite
// filtrar escribiendo y crear uno nuevo cuando no hay match. Evita duplicados
// por diferencias de mayúsculas o espacios (normaliza antes de comparar).
function normalizeClientKey(s){return (s||"").trim().toLowerCase().replace(/\s+/g," ");}

function ClientCombobox({value,onChange,existingClients}){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState(value||"");
  const wrapRef=useRef(null);

  // Sync externo (cuando se edita una matriz y entra un value distinto)
  useEffect(()=>{setQuery(value||"");},[value]);

  // Cerrar al hacer clic fuera
  useEffect(()=>{
    function onDoc(e){if(wrapRef.current&&!wrapRef.current.contains(e.target))setOpen(false);}
    document.addEventListener("mousedown",onDoc);
    return()=>document.removeEventListener("mousedown",onDoc);
  },[]);

  const q=query.trim();
  const qKey=normalizeClientKey(q);
  const filtered=existingClients.filter(c=>!q||normalizeClientKey(c).includes(qKey));
  const exactMatch=existingClients.some(c=>normalizeClientKey(c)===qKey);
  const showAddOption=q.length>0&&!exactMatch;

  function pick(name){
    onChange(name);
    setQuery(name);
    setOpen(false);
  }

  return(
    <div ref={wrapRef} style={{position:"relative"}}>
      <svg style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",zIndex:1}} width="15" height="15" fill="none" viewBox="0 0 24 24" stroke={B.textLight} strokeWidth="2">
        <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0H5m-2 0h2M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 00-1-1h-2a1 1 0 00-1 1v5m4 0H9" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <input
        value={query}
        onChange={e=>{setQuery(e.target.value);onChange(e.target.value);setOpen(true);}}
        onFocus={()=>setOpen(true)}
        placeholder="Select or type a new client..."
        style={{...inputBase,width:"100%",paddingLeft:34,paddingRight:34,fontSize:14,padding:"10px 34px 10px 34px"}}
        autoComplete="off"
      />
      <svg onClick={()=>setOpen(o=>!o)} style={{position:"absolute",right:10,top:"50%",transform:`translateY(-50%) rotate(${open?180:0}deg)`,cursor:"pointer",transition:"transform 0.15s"}} width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={B.textLight} strokeWidth="2">
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {open&&(filtered.length>0||showAddOption)&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:B.white,border:`1.5px solid ${B.border}`,borderRadius:8,boxShadow:`0 6px 24px ${B.blue}22`,zIndex:10,maxHeight:240,overflowY:"auto"}}>
          {showAddOption&&(
            <div onMouseDown={e=>{e.preventDefault();pick(q);}} style={{padding:"10px 14px",cursor:"pointer",borderBottom:filtered.length>0?`1px solid ${B.bg}`:"none",display:"flex",alignItems:"center",gap:8,color:B.blue,fontWeight:700,fontSize:13}}
              onMouseEnter={e=>e.currentTarget.style.background=B.blueLight}
              onMouseLeave={e=>e.currentTarget.style.background=B.white}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={B.blue} strokeWidth="2.5"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
              Add new client: <span style={{fontWeight:800}}>&ldquo;{q}&rdquo;</span>
            </div>
          )}
          {filtered.map(c=>(
            <div key={c} onMouseDown={e=>{e.preventDefault();pick(c);}} style={{padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontSize:13,color:B.textDark}}
              onMouseEnter={e=>e.currentTarget.style.background=B.bg}
              onMouseLeave={e=>e.currentTarget.style.background=B.white}>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={B.textLight} strokeWidth="2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0H5m-2 0h2" strokeLinecap="round"/></svg>
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MATRIX BUILDER ───────────────────────────────────────────────────────────
function MatrixBuilder({matrix,onSave,onCancel,existingClients}){
  const [positionNumber,setPositionNumber]=useState(matrix?.positionNumber||"");
  const [clientName,setClientName]=useState(matrix?.clientName||"");
  const [name,setName]=useState(matrix?.name||"");
  const [categories,setCategories]=useState(
    matrix?.categories?JSON.parse(JSON.stringify(matrix.categories)):buildEmptyCategories()
  );

  function addCriterion(catId){
    setCategories(cats=>cats.map(cat=>cat.id===catId?{...cat,criteria:[...cat.criteria,{id:uid(),description:""}]}:cat));
  }
  function deleteCriterion(catId,crId){
    const cfg=CAT_CONFIG.find(c=>c.id===catId);
    setCategories(cats=>cats.map(cat=>{
      if(cat.id!==catId||cat.criteria.length<=cfg.min) return cat;
      return{...cat,criteria:cat.criteria.filter(cr=>cr.id!==crId)};
    }));
  }
  function updateDesc(catId,crId,value){
    setCategories(cats=>cats.map(cat=>cat.id===catId?{...cat,criteria:cat.criteria.map(cr=>cr.id===crId?{...cr,description:value}:cr)}:cat));
  }
  function updateQuestion(catId,crId,value){
    setCategories(cats=>cats.map(cat=>cat.id===catId?{...cat,criteria:cat.criteria.map(cr=>cr.id===crId?{...cr,question:value}:cr)}:cat));
  }
  function handleSave(){
    if(!positionNumber.trim()) return alert("Please enter a position number.");
    if(!clientName.trim()) return alert("Please enter the client name.");
    if(!name.trim()) return alert("Please enter the position name.");
    for(const cat of categories){
      const cfg=CAT_CONFIG.find(c=>c.id===cat.id);
      if(cat.criteria.length<cfg.min) return alert(`${cat.name} requires at least ${cfg.min} criteria.`);
      if(cat.criteria.some(cr=>!cr.description.trim())) return alert(`All criteria in ${cat.name} must have a description.`);
    }
    // Normaliza el nombre del cliente: si ya existe uno con el mismo nombre
    // (ignorando mayúsculas y espacios extra), reutiliza la forma existente.
    const inputClient=clientName.trim();
    const matchExisting=(existingClients||[]).find(c=>normalizeClientKey(c)===normalizeClientKey(inputClient));
    const finalClient=matchExisting||inputClient;
    onSave({id:matrix?.id||uid(),positionNumber:positionNumber.trim(),clientName:finalClient,name:name.trim(),status:matrix?.status||"activa",categories});
  }

  return(
    <div style={{maxWidth:860,margin:"0 auto"}}>
      <div style={{display:"flex",gap:14,marginBottom:14,alignItems:"flex-end"}}>
        <div style={{width:160,flexShrink:0}}>
          <label style={{color:B.textMid,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:700,display:"block",marginBottom:6}}>Position # <span style={{color:B.red}}>*</span></label>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:B.orange,fontWeight:800,fontSize:15,pointerEvents:"none"}}>#</span>
            <input value={positionNumber} onChange={e=>setPositionNumber(e.target.value)} placeholder="001" style={{...inputBase,width:"100%",paddingLeft:26,fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:15,letterSpacing:1}}/>
          </div>
        </div>
        <div style={{flex:1}}>
          <label style={{color:B.textMid,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:700,display:"block",marginBottom:6}}>Position Name <span style={{color:B.red}}>*</span></label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Accounts Payable Coordinator" style={{...inputBase,width:"100%",fontSize:15,padding:"10px 14px"}}/>
        </div>
      </div>

      <div style={{marginBottom:24}}>
        <label style={{color:B.textMid,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:700,display:"block",marginBottom:6}}>Client Name <span style={{color:B.red}}>*</span></label>
        <ClientCombobox value={clientName} onChange={setClientName} existingClients={existingClients||[]}/>
      </div>

      {(positionNumber||name||clientName)&&(
        <div style={{...card,padding:"10px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{color:B.textLight,fontSize:12}}>Preview:</span>
          {positionNumber&&<PosBadge number={positionNumber}/>}
          {name&&<span style={{color:B.textDark,fontWeight:700,fontSize:14}}>{name}</span>}
          {clientName&&<span style={{display:"flex",alignItems:"center",gap:4,color:B.textLight,fontSize:12}}>
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke={B.textLight} strokeWidth="2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0H5m-2 0h2M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 00-1-1h-2a1 1 0 00-1 1v5m4 0H9" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {clientName}
          </span>}
        </div>
      )}

      {categories.map(cat=>{
        const cfg=CAT_CONFIG.find(c=>c.id===cat.id);
        const accent=CAT_COLORS[cat.id];
        const bg=CAT_BG[cat.id];
        const atMin=cat.criteria.length<=cfg.min;
        return(
          <div key={cat.id} style={{marginBottom:14,background:B.white,borderRadius:12,border:`1.5px solid ${accent}44`,overflow:"hidden",boxShadow:`0 1px 6px ${B.blue}08`}}>
            <div style={{padding:"11px 16px",background:bg,borderBottom:`1px solid ${accent}22`,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:accent,flexShrink:0}}/>
              <span style={{color:accent,fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:1.5,flex:1}}>{cat.name}</span>
              <WeightPill catId={cat.id} count={cat.criteria.length}/>
              {cfg.fixed
                ?<span style={{color:B.textLight,fontSize:11,fontStyle:"italic"}}>Always 2 criteria</span>
                :<button onClick={()=>addCriterion(cat.id)} style={{...btnSm,background:B.white,color:accent,border:`1.5px solid ${accent}`}}>+ Criterion</button>
              }
            </div>
            <div style={{padding:"8px 12px",display:"flex",flexDirection:"column",gap:8}}>
              {cat.criteria.map((cr,idx)=>(
                <div key={cr.id} style={{display:"flex",flexDirection:"column",gap:6,background:B.bg,borderRadius:8,padding:"10px 12px"}}>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:bg,border:`1.5px solid ${accent}55`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{color:accent,fontSize:10,fontWeight:800}}>{idx+1}</span>
                    </div>
                    <input value={cr.description} onChange={e=>updateDesc(cat.id,cr.id,e.target.value)}
                      placeholder={`${cat.name} criterion ${idx+1}...`}
                      style={{...inputBase,flex:1}}/>
                    <span style={{color:B.textLight,fontSize:11,fontFamily:"'DM Mono',monospace",flexShrink:0,width:46,textAlign:"right",fontWeight:700}}>{Math.round((cfg.pool/cat.criteria.length)*1000)/10}%</span>
                    {!cfg.fixed&&!atMin
                      ?<button onClick={()=>deleteCriterion(cat.id,cr.id)} style={{color:B.textLight,background:"none",border:"none",cursor:"pointer",fontSize:20,lineHeight:1,padding:"0 4px",flexShrink:0}}>×</button>
                      :<div style={{width:24,flexShrink:0}}/>
                    }
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"flex-start",paddingLeft:30}}>
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={B.orange} strokeWidth="2" style={{flexShrink:0,marginTop:9}}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01" strokeLinecap="round"/></svg>
                    <input value={cr.question||""} onChange={e=>updateQuestion(cat.id,cr.id,e.target.value)}
                      placeholder={`Validation question for criterion ${idx+1}... (optional)`}
                      style={{...inputBase,flex:1,fontSize:12,borderColor:B.orange+"44",background:B.white}}/>
                  </div>
                </div>
              ))}
              {!cfg.fixed&&<div style={{color:B.textLight,fontSize:11,paddingLeft:30,paddingTop:2}}>Min {cfg.min} criteria · Current: {cat.criteria.length}</div>}
            </div>
          </div>
        );
      })}
      <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:12}}>
        <button onClick={onCancel} style={btnSecondary}>Cancel</button>
        <button onClick={handleSave} style={btnPrimary}>Save Matrix</button>
      </div>
    </div>
  );
}

// ─── CANDIDATE EVAL ───────────────────────────────────────────────────────────
function CandidateEval({matrix,candidate,onSave,onCancel}){
  const [candName,setCandName]=useState(candidate?.name||"");
  const [scores,setScores]=useState(candidate?.scores?{...candidate.scores}:{});
  const totalScore=calcScore(scores,matrix.categories);
  const allCriteria=matrix.categories.flatMap(c=>c.criteria);
  const filledCount=allCriteria.filter(cr=>scores[cr.id]!==undefined).length;
  const allFilled=filledCount===allCriteria.length;

  function handleSave(){
    if(!candName.trim()) return alert("Please enter the candidate's name.");
    if(!allFilled&&!confirm("Some criteria have not been evaluated. Save anyway?")) return;
    onSave({id:candidate?.id||uid(),name:candName.trim(),scores,totalScore});
  }

  return(
    <div style={{maxWidth:860,margin:"0 auto"}}>
      <div style={{...card,padding:"18px 20px",marginBottom:20,display:"flex",gap:16,alignItems:"center"}}>
        <div style={{flex:1}}>
          <label style={{color:B.textMid,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>Candidate Name</label>
          <input value={candName} onChange={e=>setCandName(e.target.value)} placeholder="Full name..."
            style={{display:"block",width:"100%",marginTop:6,...inputBase,fontSize:15,padding:"10px 14px"}}/>
        </div>
        <div style={{textAlign:"center",flexShrink:0}}>
          <div style={{color:B.textLight,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:5,fontWeight:700}}>% to fit</div>
          <ScoreBadge score={totalScore} large/>
        </div>
        <div style={{textAlign:"center",flexShrink:0}}>
          <div style={{color:B.textLight,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:5,fontWeight:700}}>Progress</div>
          <span style={{color:B.textDark,fontFamily:"'DM Mono',monospace",fontSize:16,fontWeight:800}}>{filledCount}/{allCriteria.length}</span>
        </div>
      </div>

      <div style={{...card,padding:"10px 16px",marginBottom:16,display:"flex",gap:16,flexWrap:"wrap"}}>
        {SCORE_LABELS.map((lbl,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:B.textMid}}>
            <div style={{width:12,height:12,borderRadius:"50%",background:SCORE_COLORS[i],flexShrink:0}}/>
            <span>{lbl}</span>
            <span style={{color:B.textLight,fontFamily:"'DM Mono',monospace",fontSize:11}}>({SCORE_VALUES[i]})</span>
          </div>
        ))}
      </div>

      {matrix.categories.map(cat=>{
        const cfg=CAT_CONFIG.find(c=>c.id===cat.id);
        const accent=CAT_COLORS[cat.id];
        const bg=CAT_BG[cat.id];
        const catWeight=getCriterionWeight(cat.id,cat.criteria.length);
        const catScore=cat.criteria.reduce((s,cr)=>s+(scores[cr.id]!==undefined?catWeight*SCORE_VALUES[scores[cr.id]]:0),0);
        const catFilled=cat.criteria.filter(cr=>scores[cr.id]!==undefined).length;
        return(
          <div key={cat.id} style={{marginBottom:12,background:B.white,borderRadius:12,border:`1.5px solid ${accent}44`,overflow:"hidden",boxShadow:`0 1px 6px ${B.blue}08`}}>
            <div style={{padding:"10px 16px",background:bg,borderBottom:`1px solid ${accent}22`,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:accent,flexShrink:0}}/>
              <span style={{color:accent,fontWeight:800,fontSize:12,textTransform:"uppercase",letterSpacing:1.5,flex:1}}>{cat.name}</span>
              <span style={{color:B.textLight,fontSize:11,fontFamily:"'DM Mono',monospace"}}>{catFilled}/{cat.criteria.length} evaluated</span>
              <span style={{color:accent,fontSize:12,fontWeight:800,fontFamily:"'DM Mono',monospace"}}>{Math.round(catScore*10)/10} / {Math.round(cfg.pool*100)}</span>
            </div>
            <div>
              {cat.criteria.map((cr,idx)=>(
                <div key={cr.id} style={{display:"flex",flexDirection:"column",padding:"12px 16px",borderTop:idx>0?`1px solid ${B.border}`:"none",background:scores[cr.id]!==undefined?B.white:B.bg,gap:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:20,height:20,borderRadius:"50%",background:bg,border:`1.5px solid ${accent}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{color:accent,fontSize:9,fontWeight:800}}>{idx+1}</span>
                    </div>
                    <div style={{flex:1,color:B.textDark,fontSize:13,lineHeight:1.4,fontWeight:700}}>{cr.description}</div>
                    <span style={{color:B.textLight,fontSize:11,fontFamily:"'DM Mono',monospace",flexShrink:0}}>{Math.round(catWeight*1000)/10}%</span>
                    <div style={{display:"flex",gap:8,flexShrink:0}}>
                      {[0,1,2,3].map(v=>(
                        <ScoreButton key={v} value={v} selected={scores[cr.id]===v} onChange={val=>setScores(s=>({...s,[cr.id]:val}))}/>
                      ))}
                    </div>
                  </div>
                  {cr.question&&(
                    <div style={{display:"flex",alignItems:"flex-start",gap:8,paddingLeft:32,background:B.orange+"0D",borderRadius:7,padding:"8px 12px 8px 12px",border:`1px solid ${B.orange}33`}}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={B.orange} strokeWidth="2" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01" strokeLinecap="round"/></svg>
                      <span style={{color:B.orange,fontSize:12,fontWeight:700,lineHeight:1.5}}>{cr.question}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!allFilled&&<div style={{textAlign:"center",color:B.orange,fontSize:13,marginBottom:14,fontWeight:600}}>⚠ {allCriteria.length-filledCount} criterion/criteria pending evaluation</div>}
      <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
        <button onClick={onCancel} style={btnSecondary}>Cancel</button>
        <button onClick={handleSave} style={btnPrimary}>Save Evaluation</button>
      </div>
    </div>
  );
}

// ─── PDF REPORT GENERATOR ─────────────────────────────────────────────────────
// Construye un documento HTML autónomo que replica el reporte del candidato y
// abre el diálogo de impresión del navegador (el usuario elige "Guardar como PDF").
// No requiere librerías externas y conserva colores, gráfica de score y barras.
function buildReportHTML(matrix,candidate){
  const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const scoreColor=s=>s>=90?B.green:s>=70?B.blue:s>=50?B.yellow:B.red;
  const fitLabel=s=>s>=90?"Excellent fit":s>=70?"Good fit":s>=50?"Partial fit":"Low fit";
  const total=candidate.totalScore||0;
  const r=42,circ=2*Math.PI*r;

  const categoriesHTML=matrix.categories.map(cat=>{
    const cfg=CAT_CONFIG.find(c=>c.id===cat.id);
    const accent=CAT_COLORS[cat.id];
    const bg=CAT_BG[cat.id];
    const wpc=cfg.pool/cat.criteria.length;
    const catScore=cat.criteria.reduce((s,cr)=>{const v=candidate.scores?.[cr.id];return s+(v!==undefined?wpc*SCORE_VALUES[v]:0);},0);
    const catMax=cfg.pool*100;
    const pct=catMax>0?Math.round((catScore/catMax)*100):0;
    const rows=cat.criteria.map((cr,idx)=>{
      const v=candidate.scores?.[cr.id];
      const lbl=v!==undefined?SCORE_LABELS[v]:"Not evaluated";
      const col=v!==undefined?SCORE_COLORS[v]:B.textLight;
      return `<div class="crit" style="${idx>0?`border-top:1px solid ${B.bg};`:""}">
        <span class="dot" style="background:${col}"></span>
        <span class="crit-desc">${esc(cr.description)}</span>
        <span class="badge" style="color:${col};background:${col}14;border:1px solid ${col}33">${esc(lbl)}</span>
      </div>`;
    }).join("");
    return `<div data-pdf-block="cat" class="block-wrap"><div class="block-inner"><div class="cat" style="border:1.5px solid ${accent}33">
      <div class="cat-head" style="background:${bg};border-bottom:1px solid ${accent}22">
        <span class="dot" style="background:${accent}"></span>
        <span class="cat-name" style="color:${accent}">${esc(cat.name)}</span>
      </div>
      <div class="cat-body">
        <div class="bar-row">
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${accent}"></div></div>
          <span class="bar-pct" style="color:${accent}">${pct}%</span>
        </div>
        ${rows}
      </div>
    </div></div></div>`;
  }).join("");

  const legendHTML=SCORE_LABELS.map((lbl,i)=>`<span class="leg"><span class="dot" style="background:${SCORE_COLORS[i]}"></span>${esc(lbl)}</span>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(candidate.name)} — Evaluation</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:'Sora','Segoe UI',sans-serif;color:${B.textDark};background:#fff}
    /* Wrappers para paginación bloque-por-bloque en PDF */
    .block-wrap{width:100%}
    .block-inner{max-width:730px;margin:0 auto;padding:0 24px}
    .hero{background:linear-gradient(135deg,${B.blue} 60%,#1a6fd4);padding:30px 40px 50px;color:#fff}
    .brand{display:flex;align-items:center;gap:8px;margin-bottom:24px;font-weight:900;font-size:15px}
    .pill{background:${B.orange};color:#fff;border-radius:20px;padding:2px 12px;font-size:11px;font-weight:800}
    .kicker{color:#ffffff88;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px}
    h1{font-size:32px;font-weight:900;letter-spacing:-.5px;margin-bottom:12px}
    .meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:14px;color:#ffffffcc}
    .num{background:${B.orange};color:#fff;border-radius:6px;padding:3px 11px;font-size:12px;font-weight:800;font-family:'DM Mono',monospace}
    .wrap{max-width:730px;margin:0 auto;padding:0 24px 50px}
    .card{background:#fff;border-radius:16px;border:1px solid ${B.border};padding:24px 28px;margin-top:-28px;margin-bottom:28px;display:flex;align-items:center;gap:24px;box-shadow:0 8px 32px ${B.blue}18}
    .gs-label{color:${B.textLight};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:6px}
    .gs-num{font-size:56px;font-weight:900;font-family:'DM Mono',monospace;line-height:1}
    .gs-row{display:flex;align-items:baseline;gap:8px}
    .gs-100{font-size:22px;color:${B.textLight};font-weight:600}
    .gs-bar{flex:1;height:8px;background:${B.blueLight};border-radius:4px;overflow:hidden}
    .gs-fill{height:100%;border-radius:4px}
    .gs-fitwrap{margin-top:12px;display:flex;align-items:center;gap:8px}
    .gs-fit{font-size:13px;font-weight:800;white-space:nowrap}
    .section-label{color:${B.textLight};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:14px}
    .cat{border-radius:14px;overflow:hidden;margin-bottom:14px;page-break-inside:avoid}
    .cat-head{padding:13px 20px;display:flex;align-items:center;gap:10px}
    .cat-name{font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:1.5px}
    .cat-body{padding:16px 20px}
    .bar-row{display:flex;align-items:center;gap:12px;margin-bottom:14px}
    .bar-track{flex:1;height:10px;background:${B.blueLight};border-radius:5px;overflow:hidden}
    .bar-fill{height:100%;border-radius:5px}
    .bar-pct{font-weight:800;font-size:15px;font-family:'DM Mono',monospace;width:44px;text-align:right}
    .crit{display:flex;align-items:center;gap:12px;padding:10px 0}
    .crit-desc{flex:1;font-size:13px;line-height:1.42}
    .dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;display:inline-block}
    .cat-head .dot{width:10px;height:10px}
    .badge{font-size:11px;font-weight:700;white-space:nowrap;border-radius:20px;padding:3px 10px;flex-shrink:0}
    .legend{background:#fff;border-radius:10px;border:1px solid ${B.border};padding:12px 20px;display:flex;gap:18px;flex-wrap:wrap;margin-bottom:30px}
    .leg{display:flex;align-items:center;gap:6px;font-size:12px;color:${B.textMid}}
    .footer{text-align:center;color:${B.textLight};font-size:12px;border-top:1px solid ${B.border};padding-top:20px}
    @media print{
      @page{margin:14mm 0}
      .hero{padding-top:24px}
      /* Evita que una categoría se corte y le da aire si cae al inicio de una hoja */
      .cat,.legend{break-inside:avoid;page-break-inside:avoid}
    }
  </style></head><body>
    <!-- Bloque 1: Hero + tarjeta de Global Score (mantienen el efecto de card sobresaliente) -->
    <div data-pdf-block="header">
      <div class="hero">
        <div class="brand"><span style="color:#fff">wexpand</span><span class="pill">Recruitment</span></div>
        <div class="kicker">Candidate Evaluation Report</div>
        <h1>${esc(candidate.name)}</h1>
        <div class="meta">
          ${matrix.positionNumber?`<span class="num">#${esc(matrix.positionNumber)}</span>`:""}
          <span>${esc(matrix.name)}</span>
          ${matrix.clientName?`<span style="color:#ffffff44">·</span><span>${esc(matrix.clientName)}</span>`:""}
        </div>
      </div>
      <div class="block-inner" style="padding-bottom:14px">
        <div class="card">
          <div style="flex:1">
            <div class="gs-label">Global Score</div>
            <div class="gs-row"><span class="gs-num" style="color:${scoreColor(total)}">${total}</span><span class="gs-100">/ 100</span></div>
            <div class="gs-fitwrap">
              <div class="gs-bar"><div class="gs-fill" style="width:${total}%;background:${scoreColor(total)}"></div></div>
              <span class="gs-fit" style="color:${scoreColor(total)}">${fitLabel(total)}</span>
            </div>
          </div>
          <svg width="110" height="110" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="${r}" fill="none" stroke="${scoreColor(total)}" stroke-width="12"/>
            <text x="50" y="52" text-anchor="middle" dominant-baseline="middle" fill="${scoreColor(total)}" font-size="17" font-weight="900" font-family="DM Mono,monospace">${total}%</text>
          </svg>
        </div>
      </div>
    </div>
    <!-- Bloque 2: Label "Score by Category" -->
    <div data-pdf-block="section-label" class="block-wrap"><div class="block-inner"><div class="section-label">Score by Category</div></div></div>
    <!-- Bloques 3+: Una categoría por bloque (marcados internamente con data-pdf-block="cat") -->
    ${categoriesHTML}
    <!-- Bloque legend -->
    <div data-pdf-block="legend" class="block-wrap"><div class="block-inner"><div class="legend"><span class="section-label" style="margin:0;align-self:center">Legend:</span>${legendHTML}</div></div></div>
    <!-- Bloque footer -->
    <div data-pdf-block="footer" class="block-wrap"><div class="block-inner"><div class="footer">Shared by Wexpand Recruitment<div style="margin-top:5px;color:${B.textLight}88;font-size:13px">This report is read-only and for evaluation purposes only</div></div></div></div>
  </body></html>`;
}

// Carga las librerías de PDF desde CDN una sola vez (cacheadas en window).
function loadPdfLibs(){
  if(window._pdfLibsPromise) return window._pdfLibsPromise;
  function loadScript(src){
    return new Promise((resolve,reject)=>{
      const s=document.createElement("script");
      s.src=src;s.onload=resolve;s.onerror=reject;
      document.head.appendChild(s);
    });
  }
  window._pdfLibsPromise=Promise.all([
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"),
  ]);
  return window._pdfLibsPromise;
}

// Genera y descarga directamente el PDF del reporte capturando bloque por bloque.
// Estrategia: cada elemento marcado con [data-pdf-block] se captura como una
// imagen independiente; el PDF se arma colocando cada imagen en la página
// actual, o saltando a una nueva si no cabe. Esto garantiza que ninguna
// tarjeta se corte a la mitad.
async function downloadReportPDF(matrix,candidate){
  try{
    await loadPdfLibs();
  }catch(e){
    console.error("Failed to load PDF libs",e);
    alert("Could not load PDF generator. Please check your internet connection.");
    return;
  }

  // Renderiza el HTML en un contenedor oculto.
  const html=buildReportHTML(matrix,candidate);
  const container=document.createElement("div");
  container.style.cssText="position:fixed;left:-99999px;top:0;width:794px;background:#fff;z-index:-1;";
  const bodyMatch=html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const styleMatch=html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if(styleMatch){
    const style=document.createElement("style");
    style.textContent=styleMatch[1];
    container.appendChild(style);
  }
  const inner=document.createElement("div");
  inner.innerHTML=bodyMatch?bodyMatch[1]:html;
  container.appendChild(inner);
  document.body.appendChild(container);

  try{
    if(document.fonts&&document.fonts.ready) await document.fonts.ready;
    await new Promise(r=>setTimeout(r,300));

    // Encuentra todos los bloques que vamos a paginar.
    const blocks=Array.from(container.querySelectorAll("[data-pdf-block]"));
    if(blocks.length===0){
      throw new Error("No PDF blocks found in report");
    }

    // Captura cada bloque como un canvas independiente, en orden.
    const blockCanvases=[];
    for(const el of blocks){
      const c=await window.html2canvas(el,{
        scale:2,
        useCORS:true,
        backgroundColor:"#ffffff",
        logging:false,
      });
      blockCanvases.push({canvas:c,type:el.getAttribute("data-pdf-block")});
    }

    // Configura el PDF A4.
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
    const pdfW=210,pdfH=297;
    const sideMargin=0;  // sin márgenes laterales (el hero llega a los bordes)
    const topMargin=0;   // primera página: sin margen (hero arriba)
    const innerTopMargin=10; // margen superior en páginas 2+
    const bottomMargin=10;
    const usableW=pdfW-sideMargin*2;

    // Cursor de posición vertical y página actual.
    let cursorY=topMargin;
    let pageIdx=0;
    // Fondo blanco en la primera página.
    pdf.setFillColor(255,255,255);
    pdf.rect(0,0,pdfW,pdfH,"F");

    function startNewPage(){
      pdf.addPage();
      pageIdx++;
      pdf.setFillColor(255,255,255);
      pdf.rect(0,0,pdfW,pdfH,"F");
      cursorY=innerTopMargin;
    }

    for(const {canvas:c,type} of blockCanvases){
      const blockHmm=(c.height/c.width)*usableW;
      // ¿Cabe en la página actual?
      const remaining=pdfH-bottomMargin-cursorY;
      if(blockHmm>remaining&&cursorY>topMargin+0.1){
        // No cabe → nueva página
        startNewPage();
      }
      const imgData=c.toDataURL("image/jpeg",0.92);
      // El hero pega a los bordes; los demás bloques también ocupan ancho completo
      pdf.addImage(imgData,"JPEG",sideMargin,cursorY,usableW,blockHmm);
      cursorY+=blockHmm;
    }

    const safeName=(candidate.name||"candidate").replace(/[^\w\s-]/g,"").replace(/\s+/g,"_");
    pdf.save(`${safeName}_Evaluation.pdf`);
  }catch(e){
    console.error("PDF generation failed",e);
    alert("Could not generate PDF. Please try again.");
  }finally{
    document.body.removeChild(container);
  }
}

// ─── SHARE MODAL ──────────────────────────────────────────────────────────────
function ShareModal({matrix,candidate,onClose}){
  const [copied,setCopied]=useState(false);
  const [loading,setLoading]=useState(false);
  const [shareUrl,setShareUrl]=useState("");
  const base=`${window.location.origin}${window.location.pathname}`;

  async function copyLink(){
    if(loading) return;
    setLoading(true);
    try{
      let url=shareUrl;
      if(!url){
        const id=await saveSharedReport({matrix,candidate});
        if(id){
          url=`${base}?r=${id}`;
        }else{
          // Fallback: si Supabase falla, usa el link largo de siempre.
          const encoded=btoa(unescape(encodeURIComponent(JSON.stringify({matrix,candidate}))));
          url=`${base}?share=${encoded}`;
        }
        setShareUrl(url);
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);setTimeout(()=>setCopied(false),2500);
    }catch(e){console.error(e);}
    setLoading(false);
  }
  return(
    <div style={{position:"fixed",inset:0,background:"#0D2A5288",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:B.white,borderRadius:16,border:`1px solid ${B.border}`,boxShadow:`0 8px 40px ${B.blue}30`,width:"100%",maxWidth:480,padding:"28px 28px 24px",position:"relative"}}>
        <button onClick={onClose} style={{position:"absolute",top:14,right:16,background:"none",border:"none",color:B.textLight,cursor:"pointer",fontSize:22,lineHeight:1}}>×</button>
        <div style={{width:44,height:44,borderRadius:12,background:B.blueLight,border:`1px solid ${B.border}`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}>
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke={B.blue} strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{color:B.textDark,fontWeight:900,fontSize:18,marginBottom:4}}>Share Evaluation</div>
        <div style={{color:B.textMid,fontSize:13,marginBottom:20,lineHeight:1.5}}>Read-only link for <strong>{matrix.clientName||"the client"}</strong> — candidate <strong>{candidate.name}</strong>.</div>
        <div style={{background:B.blueLight,borderRadius:10,border:`1px solid ${B.border}`,padding:"12px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:38,height:38,borderRadius:"50%",background:B.blue,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{color:B.white,fontWeight:900,fontSize:16}}>{candidate.name[0]}</span>
          </div>
          <div style={{flex:1}}>
            <div style={{color:B.textDark,fontWeight:800,fontSize:14}}>{candidate.name}</div>
            <div style={{color:B.textMid,fontSize:12}}>{matrix.name}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{color:B.textLight,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>% to fit</div>
            <div style={{color:candidate.totalScore>=70?B.green:B.orange,fontWeight:900,fontSize:18,fontFamily:"'DM Mono',monospace"}}>{candidate.totalScore}%</div>
          </div>
        </div>
        <div style={{background:B.bg,border:`1.5px solid ${B.border}`,borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={B.textLight} strokeWidth="2" style={{flexShrink:0}}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeLinecap="round"/></svg>
          <span style={{color:B.textMid,fontSize:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'DM Mono',monospace"}}>{shareUrl||"Click \u201cCopy link\u201d to generate a short, shareable link"}</span>
        </div>
        <button onClick={copyLink} disabled={loading} style={{...btnPrimary,width:"100%",textAlign:"center",padding:"12px",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:copied?B.green:B.blue,opacity:loading?0.7:1,cursor:loading?"wait":"pointer"}}>
          {loading
            ?<>Generating…</>
            :copied
            ?<><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>Link copied!</>
            :<><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round"/></svg>Copy link</>
          }
        </button>
        <div style={{color:B.textLight,fontSize:11,textAlign:"center",marginTop:10}}>No login required · Read-only</div>
      </div>
    </div>
  );
}

// ─── CANDIDATE REPORT ─────────────────────────────────────────────────────────
function CandidateReport({payload}){
  const {matrix,candidate}=payload;
  const scoreColor=s=>s>=90?B.green:s>=70?B.blue:s>=50?B.yellow:B.red;
  const r=42,circ=2*Math.PI*r;
  return(
    <div style={{minHeight:"100vh",background:B.bg,fontFamily:"'Sora','Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box}`}</style>
      <div style={{background:`linear-gradient(135deg,${B.blue} 60%,#1a6fd4)`,padding:"32px 40px 52px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:32}}>
          <WexpandLogo size={30}/><span style={{color:B.white,fontWeight:900,fontSize:15}}>wexpand</span>
          <span style={{background:B.orange,color:B.white,borderRadius:20,padding:"2px 12px",fontSize:11,fontWeight:800,marginLeft:4}}>Recruitment</span>
          <button onClick={()=>downloadReportPDF(matrix,candidate)} style={{marginLeft:"auto",background:"#ffffff22",color:B.white,border:"1px solid #ffffff55",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Download PDF
          </button>
        </div>
        <div style={{color:"#ffffff88",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>Candidate Evaluation Report</div>
        <h1 style={{color:B.white,margin:"0 0 14px",fontSize:34,fontWeight:900,letterSpacing:-0.5}}>{candidate.name}</h1>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          {matrix.positionNumber&&<span style={{background:B.orange,color:B.white,borderRadius:6,padding:"3px 11px",fontSize:12,fontWeight:800,fontFamily:"'DM Mono',monospace"}}>#{matrix.positionNumber}</span>}
          <span style={{color:"#ffffffcc",fontSize:14}}>{matrix.name}</span>
          {matrix.clientName&&<><span style={{color:"#ffffff44"}}>·</span><span style={{color:"#ffffffcc",fontSize:14}}>{matrix.clientName}</span></>}
        </div>
      </div>
      <div style={{maxWidth:720,margin:"0 auto",padding:"0 24px 60px"}}>
        <div style={{background:B.white,borderRadius:16,border:`1px solid ${B.border}`,boxShadow:`0 8px 32px ${B.blue}18`,padding:"24px 28px",marginTop:-28,marginBottom:32,display:"flex",alignItems:"center",gap:24}}>
          <div style={{flex:1}}>
            <div style={{color:B.textLight,fontSize:11,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:6}}>Global Score</div>
            <div style={{display:"flex",alignItems:"baseline",gap:8}}>
              <span style={{fontSize:60,fontWeight:900,fontFamily:"'DM Mono',monospace",color:scoreColor(candidate.totalScore),lineHeight:1}}>{candidate.totalScore}</span>
              <span style={{fontSize:22,color:B.textLight,fontWeight:600}}>/ 100</span>
            </div>
            <div style={{marginTop:12,display:"flex",alignItems:"center",gap:8}}>
              <div style={{flex:1,height:8,background:B.blueLight,borderRadius:4,overflow:"hidden"}}>
                <div style={{width:`${candidate.totalScore}%`,height:"100%",background:scoreColor(candidate.totalScore),borderRadius:4}}/>
              </div>
              <span style={{color:scoreColor(candidate.totalScore),fontSize:13,fontWeight:800}}>{candidate.totalScore>=90?"Excellent fit":candidate.totalScore>=70?"Good fit":candidate.totalScore>=50?"Partial fit":"Low fit"}</span>
            </div>
          </div>
          <svg width={110} height={110} viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={r} fill="none" stroke={B.blueLight} strokeWidth="12"/>
            <circle cx="50" cy="50" r={r} fill="none" stroke={scoreColor(candidate.totalScore)} strokeWidth="12"
              strokeDasharray={`${circ*candidate.totalScore/100} ${circ}`} strokeDashoffset={circ*0.25} strokeLinecap="round"/>
            <text x="50" y="52" textAnchor="middle" dominantBaseline="middle" fill={scoreColor(candidate.totalScore)} fontSize="17" fontWeight="900" fontFamily="DM Mono,monospace">{candidate.totalScore}%</text>
          </svg>
        </div>
        <div style={{color:B.textLight,fontSize:11,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:14}}>Score by Category</div>
        {matrix.categories.map(cat=>{
          const cfg=CAT_CONFIG.find(c=>c.id===cat.id);
          const accent=CAT_COLORS[cat.id];
          const bg=CAT_BG[cat.id];
          const wpc=cfg.pool/cat.criteria.length;
          const catScore=cat.criteria.reduce((s,cr)=>{const v=candidate.scores?.[cr.id];return s+(v!==undefined?wpc*SCORE_VALUES[v]:0);},0);
          const catMax=cfg.pool*100;
          const pct=catMax>0?Math.round((catScore/catMax)*100):0;
          return(
            <div key={cat.id} style={{background:B.white,borderRadius:14,border:`1.5px solid ${accent}33`,overflow:"hidden",boxShadow:`0 2px 12px ${B.blue}08`,marginBottom:14}}>
              <div style={{padding:"13px 20px",background:bg,borderBottom:`1px solid ${accent}22`,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:accent,flexShrink:0}}/>
                <span style={{color:accent,fontWeight:800,fontSize:13,textTransform:"uppercase",letterSpacing:1.5,flex:1}}>{cat.name}</span>
              </div>
              <div style={{padding:"16px 20px"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
                  <div style={{flex:1,height:10,background:B.blueLight,borderRadius:5,overflow:"hidden"}}>
                    <div style={{width:`${pct}%`,height:"100%",background:accent,borderRadius:5}}/>
                  </div>
                  <span style={{color:accent,fontWeight:800,fontSize:15,fontFamily:"'DM Mono',monospace",width:44,textAlign:"right"}}>{pct}%</span>
                </div>
                {cat.criteria.map((cr,idx)=>{
                  const v=candidate.scores?.[cr.id];
                  const lbl=v!==undefined?SCORE_LABELS[v]:"Not evaluated";
                  const col=v!==undefined?SCORE_COLORS[v]:B.textLight;
                  return(
                    <div key={cr.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderTop:idx>0?`1px solid ${B.bg}`:"none"}}>
                      <div style={{width:9,height:9,borderRadius:"50%",background:col,flexShrink:0}}/>
                      <div style={{flex:1,color:B.textDark,fontSize:13,lineHeight:1.4}}>{cr.description}</div>
                      <span style={{color:col,fontSize:11,fontWeight:700,whiteSpace:"nowrap",background:col+"14",border:`1px solid ${col}33`,borderRadius:20,padding:"3px 10px",flexShrink:0}}>{lbl}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div style={{background:B.white,borderRadius:10,border:`1px solid ${B.border}`,padding:"12px 20px",display:"flex",gap:18,flexWrap:"wrap",marginBottom:36}}>
          <span style={{color:B.textLight,fontSize:11,textTransform:"uppercase",letterSpacing:1,fontWeight:700,alignSelf:"center"}}>Legend:</span>
          {SCORE_LABELS.map((lbl,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:B.textMid}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:SCORE_COLORS[i],flexShrink:0}}/>
              <span>{lbl}</span>
            </div>
          ))}
        </div>
        <div style={{textAlign:"center",color:B.textLight,fontSize:12,borderTop:`1px solid ${B.border}`,paddingTop:24}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:5}}>
            <WexpandLogo size={18}/><span style={{color:B.blue,fontWeight:700,fontSize:13}}>wexpand</span>
          </div>
          Shared by Wexpand Recruitment
          <div style={{marginTop:4,color:B.textLight+"88",fontSize:11}}>This report is read-only and for evaluation purposes only</div>
        </div>
      </div>
    </div>
  );
}

// ─── CANDIDATE VIEW (report + share link) ────────────────────────────────────
function CandidateView({matrix,candidate,onBack,onEdit,onDelete}){
  const [copied,setCopied]=useState(false);
  const [loading,setLoading]=useState(false);
  const [shareUrl,setShareUrl]=useState("");
  const base=`${window.location.origin}${window.location.pathname}`;

  async function copyLink(){
    if(loading) return;
    setLoading(true);
    try{
      let url=shareUrl;
      if(!url){
        const id=await saveSharedReport({matrix,candidate});
        if(id){
          url=`${base}?r=${id}`;
        }else{
          const encoded=btoa(unescape(encodeURIComponent(JSON.stringify({matrix,candidate}))));
          url=`${base}?share=${encoded}`;
        }
        setShareUrl(url);
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);setTimeout(()=>setCopied(false),2500);
    }catch(e){console.error(e);}
    setLoading(false);
  }

  const scoreColor=s=>s>=90?B.green:s>=70?B.blue:s>=50?B.yellow:B.red;
  const r=42,circ=2*Math.PI*r;

  return(
    <div style={{maxWidth:860,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
        <button onClick={onBack} style={{...btnSecondary,padding:"6px 12px"}}>← Back</button>
        <div style={{flex:1}}>
          <div style={{color:B.textLight,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:2}}>Candidate Evaluation</div>
          <h2 style={{color:B.textDark,margin:0,fontSize:22,fontWeight:900}}>{candidate.name}</h2>
          <div style={{color:B.textMid,fontSize:13,marginTop:2}}>{matrix.name} · <PosBadge number={matrix.positionNumber||"—"}/></div>
        </div>
        <button onClick={()=>downloadReportPDF(matrix,candidate)} style={{...btnPrimary,padding:"7px 14px",fontSize:13,display:"flex",alignItems:"center",gap:6}}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Download PDF
        </button>
        <button onClick={onEdit} style={{...btnSecondary,padding:"7px 14px",fontSize:13}}>Edit</button>
        <CandidateMenu candidateId={candidate.id} onDelete={id=>{onDelete(id);onBack();}}/>
      </div>

      {/* Share link bar */}
      <div style={{...card,padding:"14px 18px",marginBottom:24,display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:36,height:36,borderRadius:9,background:B.blueLight,border:`1px solid ${B.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke={B.blue} strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:B.textDark,fontSize:12,fontWeight:700,marginBottom:3}}>Client share link</div>
          <div style={{color:B.textLight,fontSize:11,fontFamily:"'DM Mono',monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{shareUrl||"Click \u201cCopy link\u201d to generate a short link"}</div>
        </div>
        <button onClick={copyLink} disabled={loading} style={{...btnPrimary,padding:"8px 16px",fontSize:13,display:"flex",alignItems:"center",gap:6,background:copied?B.green:B.blue,flexShrink:0,opacity:loading?0.7:1,cursor:loading?"wait":"pointer"}}>
          {loading
            ?<>Generating…</>
            :copied
            ?<><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>Copied!</>
            :<><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round"/></svg>Copy link</>
          }
        </button>
      </div>

      {/* Global score */}
      <div style={{...card,padding:"24px 28px",marginBottom:24,display:"flex",alignItems:"center",gap:24}}>
        <div style={{flex:1}}>
          <div style={{color:B.textLight,fontSize:11,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:6}}>Global Score</div>
          <div style={{display:"flex",alignItems:"baseline",gap:8}}>
            <span style={{fontSize:60,fontWeight:900,fontFamily:"'DM Mono',monospace",color:scoreColor(candidate.totalScore),lineHeight:1}}>{candidate.totalScore}</span>
            <span style={{fontSize:22,color:B.textLight,fontWeight:600}}>/ 100</span>
          </div>
          <div style={{marginTop:12,display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,height:8,background:B.blueLight,borderRadius:4,overflow:"hidden"}}>
              <div style={{width:`${candidate.totalScore}%`,height:"100%",background:scoreColor(candidate.totalScore),borderRadius:4}}/>
            </div>
            <span style={{color:scoreColor(candidate.totalScore),fontSize:13,fontWeight:800,whiteSpace:"nowrap"}}>
              {candidate.totalScore>=90?"Excellent fit":candidate.totalScore>=70?"Good fit":candidate.totalScore>=50?"Partial fit":"Low fit"}
            </span>
          </div>
        </div>
        <svg width={110} height={110} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke={B.blueLight} strokeWidth="12"/>
          <circle cx="50" cy="50" r={r} fill="none" stroke={scoreColor(candidate.totalScore)} strokeWidth="12"
            strokeDasharray={`${circ*candidate.totalScore/100} ${circ}`} strokeDashoffset={circ*0.25} strokeLinecap="round"/>
          <text x="50" y="52" textAnchor="middle" dominantBaseline="middle" fill={scoreColor(candidate.totalScore)} fontSize="17" fontWeight="900" fontFamily="DM Mono,monospace">{candidate.totalScore}%</text>
        </svg>
      </div>

      {/* Category breakdown */}
      <div style={{color:B.textLight,fontSize:11,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:14}}>Score by Category</div>
      {matrix.categories.map(cat=>{
        const cfg=CAT_CONFIG.find(c=>c.id===cat.id);
        const accent=CAT_COLORS[cat.id];
        const bg=CAT_BG[cat.id];
        const wpc=cfg.pool/cat.criteria.length;
        const catScore=cat.criteria.reduce((s,cr)=>{const v=candidate.scores?.[cr.id];return s+(v!==undefined?wpc*SCORE_VALUES[v]:0);},0);
        const catMax=cfg.pool*100;
        const pct=catMax>0?Math.round((catScore/catMax)*100):0;
        return(
          <div key={cat.id} style={{background:B.white,borderRadius:14,border:`1.5px solid ${accent}33`,overflow:"hidden",boxShadow:`0 2px 12px ${B.blue}08`,marginBottom:12}}>
            <div style={{padding:"13px 20px",background:bg,borderBottom:`1px solid ${accent}22`,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:accent,flexShrink:0}}/>
              <span style={{color:accent,fontWeight:800,fontSize:13,textTransform:"uppercase",letterSpacing:1.5,flex:1}}>{cat.name}</span>
            </div>
            <div style={{padding:"14px 20px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <div style={{flex:1,height:10,background:B.blueLight,borderRadius:5,overflow:"hidden"}}>
                  <div style={{width:`${pct}%`,height:"100%",background:accent,borderRadius:5}}/>
                </div>
                <span style={{color:accent,fontWeight:800,fontSize:15,fontFamily:"'DM Mono',monospace",width:44,textAlign:"right"}}>{pct}%</span>
              </div>
              {cat.criteria.map((cr,idx)=>{
                const v=candidate.scores?.[cr.id];
                const lbl=v!==undefined?SCORE_LABELS[v]:"Not evaluated";
                const col=v!==undefined?SCORE_COLORS[v]:B.textLight;
                return(
                  <div key={cr.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderTop:idx>0?`1px solid ${B.bg}`:"none"}}>
                    <div style={{width:9,height:9,borderRadius:"50%",background:col,flexShrink:0}}/>
                    <div style={{flex:1,color:B.textDark,fontSize:13,lineHeight:1.4}}>{cr.description}</div>
                    <span style={{color:col,fontSize:11,fontWeight:700,whiteSpace:"nowrap",background:col+"14",border:`1px solid ${col}33`,borderRadius:20,padding:"3px 10px",flexShrink:0}}>{lbl}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div style={{...card,padding:"12px 20px",display:"flex",gap:18,flexWrap:"wrap",marginTop:4}}>
        <span style={{color:B.textLight,fontSize:11,textTransform:"uppercase",letterSpacing:1,fontWeight:700,alignSelf:"center"}}>Legend:</span>
        {SCORE_LABELS.map((lbl,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:B.textMid}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:SCORE_COLORS[i],flexShrink:0}}/>
            <span>{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CANDIDATE MENU (3-dot delete) ───────────────────────────────────────────
function CandidateMenu({candidateId,onDelete}){
  const [open,setOpen]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const ref=useRef(null);

  useEffect(()=>{
    function handleClick(e){if(ref.current&&!ref.current.contains(e.target)){setOpen(false);setConfirm(false);}}
    document.addEventListener("mousedown",handleClick);
    return()=>document.removeEventListener("mousedown",handleClick);
  },[]);

  return(
    <div ref={ref} style={{position:"relative",flexShrink:0}} onClick={e=>e.stopPropagation()}>
      <button
        onClick={e=>{e.stopPropagation();setOpen(o=>!o);setConfirm(false);}}
        style={{width:28,height:28,borderRadius:6,background:"none",border:`1px solid transparent`,color:B.textLight,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.15s"}}
        onMouseEnter={e=>{e.currentTarget.style.background=B.blueLight;e.currentTarget.style.borderColor=B.border;}}
        onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.borderColor="transparent";}}
      >
        {[0,1,2].map(i=><div key={i} style={{width:4,height:4,borderRadius:"50%",background:B.textLight}}/>)}
      </button>
      {open&&(
        <div style={{position:"absolute",top:32,right:0,background:B.white,border:`1px solid ${B.border}`,borderRadius:10,boxShadow:`0 8px 24px ${B.blue}18`,minWidth:180,zIndex:100,overflow:"hidden"}}>
          {!confirm?(
            <button
              onClick={e=>{e.stopPropagation();setConfirm(true);}}
              style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"none",border:"none",cursor:"pointer",color:B.red,fontSize:13,fontWeight:700,fontFamily:"inherit",textAlign:"left"}}
              onMouseEnter={e=>e.currentTarget.style.background="#FEE8E8"}
              onMouseLeave={e=>e.currentTarget.style.background="none"}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Remove candidate
            </button>
          ):(
            <div style={{padding:"12px 14px"}}>
              <div style={{color:B.textDark,fontSize:12,fontWeight:700,marginBottom:8,lineHeight:1.4}}>Remove this candidate's evaluation?</div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={e=>{e.stopPropagation();setOpen(false);setConfirm(false);}} style={{flex:1,padding:"6px 0",borderRadius:6,border:`1px solid ${B.border}`,background:B.white,color:B.textMid,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                <button onClick={e=>{e.stopPropagation();onDelete(candidateId);setOpen(false);setConfirm(false);}} style={{flex:1,padding:"6px 0",borderRadius:6,border:"none",background:B.red,color:B.white,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Remove</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MATRIX DETAIL ────────────────────────────────────────────────────────────
function MatrixDetail({matrix,onBack,onEditMatrix,onAddCandidate,onViewCandidate,onDeleteCandidate,onStatusChange}){
  const [candSearch,setCandSearch]=useState("");
  const allSorted=[...(matrix.candidates||[])].sort((a,b)=>b.totalScore-a.totalScore);
  const sorted=allSorted.filter(c=>c.name.toLowerCase().includes(candSearch.toLowerCase()));
  const MEDAL=["🥇","🥈","🥉"];
  const medalColors=[B.green,B.blue,B.orange];

  return(
    <div style={{maxWidth:860,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
        <button onClick={onBack} style={{...btnSecondary,padding:"6px 12px"}}>← Back</button>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <span style={{color:B.textLight,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>Evaluation Matrix</span>
            <PosBadge number={matrix.positionNumber||"—"}/>
            <StatusBadge status={matrix.status||"activa"} small/>
          </div>
          <h2 style={{color:B.textDark,margin:0,fontSize:22,fontWeight:900}}>{matrix.name}</h2>
          {matrix.clientName&&<div style={{display:"flex",alignItems:"center",gap:5,marginTop:4}}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={B.textLight} strokeWidth="2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0H5m-2 0h2M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 00-1-1h-2a1 1 0 00-1 1v5m4 0H9" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{color:B.textMid,fontSize:13,fontWeight:600}}>{matrix.clientName}</span>
          </div>}
        </div>
        <StatusSelect status={matrix.status} matrixId={matrix.id} onStatusChange={onStatusChange}/>
        <button onClick={onEditMatrix} style={{...btnSecondary,padding:"7px 14px",fontSize:13}}>Edit Matrix</button>
        <button onClick={onAddCandidate} style={btnPrimary}>+ Evaluate Candidate</button>
      </div>

      <div style={{...card,marginBottom:24,overflow:"hidden"}}>
        <div style={{padding:"10px 16px",background:B.blueLight,borderBottom:`1px solid ${B.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:B.textDark,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:800}}>Evaluation Criteria</span>
          <span style={{color:B.textLight,fontSize:12}}>{matrix.categories.flatMap(c=>c.criteria).length} total criteria</span>
        </div>
        {matrix.categories.map(cat=>{
          const cfg=CAT_CONFIG.find(c=>c.id===cat.id);
          const accent=CAT_COLORS[cat.id];
          const weightPer=Math.round((cfg.pool/cat.criteria.length)*1000)/10;
          return(
            <div key={cat.id} style={{borderTop:`1px solid ${B.border}`}}>
              <div style={{padding:"7px 16px",background:CAT_BG[cat.id],display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:accent}}/>
                <span style={{color:accent,fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:1.5,flex:1}}>{cat.name}</span>
                <span style={{color:B.textLight,fontSize:11,fontFamily:"'DM Mono',monospace"}}>{Math.round(cfg.pool*100)}% · {cat.criteria.length} criteria · {weightPer}% each</span>
              </div>
              {cat.criteria.map((cr,idx)=>(
                <div key={cr.id} style={{display:"flex",gap:10,padding:"6px 16px 6px 32px",borderTop:`1px solid ${B.bg}`}}>
                  <span style={{color:B.textLight,fontSize:11,flexShrink:0,fontFamily:"'DM Mono',monospace",marginTop:1}}>{idx+1}.</span>
                  <span style={{color:B.textMid,fontSize:13}}>{cr.description}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Candidate ranking with search */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <div style={{color:B.textLight,fontSize:12,textTransform:"uppercase",letterSpacing:1,fontWeight:700,whiteSpace:"nowrap"}}>
          Candidate Ranking ({allSorted.length})
        </div>
        <div style={{flex:1,position:"relative"}}>
          <svg style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}} width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={B.textLight} strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            value={candSearch} onChange={e=>setCandSearch(e.target.value)}
            placeholder="Search candidate..."
            style={{...inputBase,width:"100%",paddingLeft:30,paddingTop:6,paddingBottom:6,fontSize:12,borderRadius:7}}
          />
          {candSearch&&<button onClick={()=>setCandSearch("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:B.textLight,cursor:"pointer",fontSize:16,lineHeight:1,padding:0}}>×</button>}
        </div>
      </div>

      {sorted.length===0?(
        <div style={{textAlign:"center",padding:"50px 0",border:`1.5px dashed ${B.border}`,borderRadius:12,background:B.blueLight}}>
          <div style={{fontSize:36,marginBottom:10}}>{candSearch?"🔍":"👤"}</div>
          <div style={{color:B.textMid,fontWeight:700}}>{candSearch?`No results for "${candSearch}"`:"No candidates evaluated yet."}</div>
          {!candSearch&&<div style={{fontSize:13,marginTop:4,color:B.textLight}}>Click "+ Evaluate Candidate" to get started.</div>}
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {sorted.map((cand,idx)=>{
            const realIdx=allSorted.findIndex(c=>c.id===cand.id);
            const accent=realIdx<3?medalColors[realIdx]:B.textLight;
            return(
              <div key={cand.id} onClick={()=>onViewCandidate(cand)}
                style={{...card,padding:"14px 18px",display:"flex",alignItems:"center",gap:16,cursor:"pointer",borderColor:realIdx===0?`${B.green}66`:B.border,boxShadow:realIdx===0?`0 2px 16px ${B.green}18`:card.boxShadow,transition:"border-color 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=B.blue;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=realIdx===0?`${B.green}66`:B.border;}}>
                <div style={{width:34,height:34,borderRadius:"50%",flexShrink:0,background:accent+"18",border:`2px solid ${accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:realIdx<3?17:13,color:realIdx>=3?B.textLight:undefined,fontWeight:800}}>
                  {realIdx<3?MEDAL[realIdx]:realIdx+1}
                </div>
                <div style={{flex:1}}>
                  <div style={{color:B.blue,fontWeight:800,fontSize:15,marginBottom:8,textDecoration:"underline",textUnderlineOffset:2}}>{cand.name}</div>
                  <RankingBar score={cand.totalScore}/>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,color:B.textLight,fontSize:12}}>
                  View report
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </div>
                <CandidateMenu candidateId={cand.id} onDelete={onDeleteCandidate}/>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
// Carga un reporte compartido por id corto (?r=) desde Supabase.
function SharedReportLoader({id}){
  const [state,setState]=useState({loading:true,payload:null});
  useEffect(()=>{
    let alive=true;
    loadSharedReport(id).then(data=>{if(alive)setState({loading:false,payload:data});});
    return()=>{alive=false;};
  },[id]);
  if(state.loading){
    return(
      <div style={{minHeight:"100vh",background:B.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Sora','Segoe UI',sans-serif",color:B.textMid}}>
        <div style={{textAlign:"center"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:12}}><WexpandLogo size={26}/><span style={{color:B.blue,fontWeight:800,fontSize:16}}>wexpand</span></div>
          <div style={{fontSize:14}}>Loading evaluation…</div>
        </div>
      </div>
    );
  }
  if(!state.payload){
    return(
      <div style={{minHeight:"100vh",background:B.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Sora','Segoe UI',sans-serif",color:B.textMid,padding:24}}>
        <div style={{textAlign:"center",maxWidth:360}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:14}}><WexpandLogo size={26}/><span style={{color:B.blue,fontWeight:800,fontSize:16}}>wexpand</span></div>
          <div style={{fontSize:16,fontWeight:800,color:B.textDark,marginBottom:6}}>Evaluation not found</div>
          <div style={{fontSize:13,lineHeight:1.5}}>This link may have expired or is invalid. Please ask for a new one.</div>
        </div>
      </div>
    );
  }
  return <CandidateReport payload={state.payload}/>;
}

export default function App(){
  // Detecta el modo "reporte compartido" desde la URL:
  // ?r=<id>  → link corto (datos en Supabase)
  // ?share=  → link largo legacy (datos embebidos en la URL); sigue funcionando.
  const [shareMode]=useState(()=>{
    try{
      const p=new URLSearchParams(window.location.search);
      const rid=p.get("r");
      if(rid) return {type:"short",id:rid};
      const legacy=p.get("share");
      if(legacy) return {type:"legacy",payload:JSON.parse(decodeURIComponent(escape(atob(legacy))))};
    }catch{}
    return null;
  });
  if(shareMode?.type==="short") return <SharedReportLoader id={shareMode.id}/>;
  if(shareMode?.type==="legacy") return <CandidateReport payload={shareMode.payload}/>;

  const [matrices,setMatrices]=useState([DEFAULT_MATRIX]);
  const [view,setView]=useState("home");
  const [activeMatrixId,setActiveMatrixId]=useState(null);
  const [activeCandidateId,setActiveCandidateId]=useState(null);
  const [viewingCandidateId,setViewingCandidateId]=useState(null);

  const activeMatrix=matrices.find(m=>m.id===activeMatrixId);
  const activeCandidate=activeMatrix?.candidates?.find(c=>c.id===activeCandidateId);
  const viewingCandidate=activeMatrix?.candidates?.find(c=>c.id===viewingCandidateId);

  useEffect(()=>{
    dbLoad().then(data=>{if(data&&data.length>0)setMatrices(data);});
  },[]);

  function persist(updated){
    setMatrices(updated);
    dbSave(updated);
  }
  function handleSaveMatrix(m){
    const updated=matrices.find(x=>x.id===m.id)?matrices.map(x=>x.id===m.id?{...x,...m}:x):[...matrices,{...m,candidates:[]}];
    persist(updated);setActiveMatrixId(m.id);setView("detail");
  }
  function handleDeleteMatrix(id){persist(matrices.filter(m=>m.id!==id));}
  function handleStatusChange(id,status){persist(matrices.map(m=>m.id===id?{...m,status}:m));}
  function handleSaveCandidate(cand){
    persist(matrices.map(m=>{if(m.id!==activeMatrixId)return m;const exists=m.candidates?.find(c=>c.id===cand.id);return{...m,candidates:exists?m.candidates.map(c=>c.id===cand.id?cand:c):[...(m.candidates||[]),cand]};}));
    setView("detail");
  }
  function handleDeleteCandidate(candId){
    persist(matrices.map(m=>m.id===activeMatrixId?{...m,candidates:m.candidates.filter(c=>c.id!==candId)}:m));
  }

  return(
    <div style={{minHeight:"100vh",background:B.bg,color:B.textDark,fontFamily:"'Sora','Segoe UI',sans-serif",display:"flex",flexDirection:"column"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box}input:focus{border-color:${B.blue}!important;box-shadow:0 0 0 3px ${B.blue}22!important}button{transition:opacity 0.15s}button:hover{opacity:0.85}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:${B.blueLight}}::-webkit-scrollbar-thumb{background:${B.border};border-radius:3px}`}</style>

      <div style={{background:B.white,borderBottom:`1px solid ${B.border}`,padding:"0 32px",display:"flex",alignItems:"center",gap:12,height:60,boxShadow:`0 1px 8px ${B.blue}10`,width:"100%"}}>
        <button onClick={()=>setView("home")} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:10,padding:"6px 0"}}>
          <WexpandLogo size={34}/>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
            <span style={{color:B.textDark,fontWeight:900,fontSize:16,lineHeight:1}}>Evaluation Matrix</span>
            <span style={{color:B.textLight,fontSize:11,lineHeight:1,marginTop:2,letterSpacing:0.5}}>Wexpand Recruitment</span>
          </div>
        </button>
        {activeMatrix&&view!=="home"&&(
          <><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={B.textLight} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          <PosBadge number={activeMatrix.positionNumber||"—"}/>
          <span style={{color:B.textMid,fontSize:13,fontWeight:700,maxWidth:280,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeMatrix.name}</span></>
        )}
        <div style={{marginLeft:"auto"}}>
          <div style={{background:B.orange,color:B.white,borderRadius:20,padding:"3px 12px",fontSize:11,fontWeight:800,letterSpacing:0.5}}>Recruitment</div>
        </div>
      </div>

      <div style={{padding:"32px 40px",flex:1,width:"100%",boxSizing:"border-box"}}>
        {view==="home"&&<Home matrices={matrices} onSelect={id=>{setActiveMatrixId(id);setView("detail");}} onCreate={()=>{setActiveMatrixId(null);setView("newMatrix");}} onDelete={handleDeleteMatrix} onStatusChange={handleStatusChange}/>}
        {(view==="newMatrix"||view==="editMatrix")&&(()=>{
          const existingClients=Array.from(new Set(matrices.map(m=>m.clientName||"").filter(Boolean))).sort((a,b)=>a.localeCompare(b));
          if(view==="newMatrix") return(
            <><div style={{marginBottom:24}}><h2 style={{margin:0,color:B.textDark,fontSize:24,fontWeight:900}}>New Evaluation Matrix</h2><p style={{color:B.textMid,margin:"5px 0 0",fontSize:14}}>Enter the position number, client and name, then define the criteria.</p></div>
            <MatrixBuilder matrix={null} onSave={handleSaveMatrix} onCancel={()=>setView("home")} existingClients={existingClients}/></>
          );
          if(activeMatrix) return(
            <><div style={{marginBottom:24}}><h2 style={{margin:0,color:B.textDark,fontSize:24,fontWeight:900}}>Edit Matrix</h2></div>
            <MatrixBuilder matrix={activeMatrix} onSave={handleSaveMatrix} onCancel={()=>setView("detail")} existingClients={existingClients}/></>
          );
          return null;
        })()}
        {view==="detail"&&activeMatrix&&<MatrixDetail matrix={activeMatrix} onBack={()=>setView("home")} onEditMatrix={()=>setView("editMatrix")} onAddCandidate={()=>{setActiveCandidateId(null);setView("newCandidate");}} onViewCandidate={c=>{setViewingCandidateId(c.id);setView("candidateView");}} onDeleteCandidate={handleDeleteCandidate} onStatusChange={handleStatusChange}/>}
        {view==="candidateView"&&activeMatrix&&viewingCandidate&&(
          <CandidateView
            matrix={activeMatrix}
            candidate={viewingCandidate}
            onBack={()=>setView("detail")}
            onEdit={()=>{setActiveCandidateId(viewingCandidateId);setView("editCandidate");}}
            onDelete={(id)=>{handleDeleteCandidate(id);setView("detail");}}
          />
        )}
        {view==="newCandidate"&&activeMatrix&&(
          <><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
            <button onClick={()=>setView("detail")} style={{...btnSecondary,padding:"6px 12px"}}>← Back</button>
            <div><h2 style={{margin:0,color:B.textDark,fontSize:22,fontWeight:900}}>Evaluate Candidate</h2>
            <div style={{color:B.textMid,fontSize:13,display:"flex",alignItems:"center",gap:6,marginTop:2}}><PosBadge number={activeMatrix.positionNumber||"—"}/>{activeMatrix.name}</div></div>
          </div>
          <CandidateEval matrix={activeMatrix} candidate={null} onSave={handleSaveCandidate} onCancel={()=>setView("detail")}/></>
        )}
        {view==="editCandidate"&&activeMatrix&&activeCandidate&&(
          <><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
            <button onClick={()=>setView("detail")} style={{...btnSecondary,padding:"6px 12px"}}>← Back</button>
            <div><h2 style={{margin:0,color:B.textDark,fontSize:22,fontWeight:900}}>Edit Evaluation</h2>
            <div style={{color:B.textMid,fontSize:13}}>{activeMatrix.name} · {activeCandidate.name}</div></div>
          </div>
          <CandidateEval matrix={activeMatrix} candidate={activeCandidate} onSave={handleSaveCandidate} onCancel={()=>setView("detail")}/></>
        )}
      </div>

      <div style={{borderTop:`1px solid ${B.border}`,padding:"14px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",background:B.white}}>
        <span style={{color:B.textLight,fontSize:13}}>© 2026 Wexpand · Recruitment</span>
        <div style={{display:"flex",alignItems:"center",gap:6}}><WexpandLogo size={20}/><span style={{color:B.blue,fontSize:13,fontWeight:700}}>wexpand</span></div>
      </div>
    </div>
  );
}
