const { useState, useEffect, useMemo, useCallback } = React;
const { ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
        LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceDot,
        BarChart, Bar } = Recharts;

const C = {
  bg:"#F0F4FA", panel:"#FFFFFF", panel2:"#EEF2F8", line:"#E2E8F1",
  text:"#13203A", sub:"#5A6884", muted:"#94A1B8",
  go:"#0E9E86", goSoft:"#E2F4F0", goInk:"#06463B",
  amber:"#C77E0A", neg:"#DC4B5C", pos:"#0E9E86", btnText:"#FFFFFF",
  border:"1px solid #E2E8F1",
};
const PIE = ["#2A8FD6","#0FB39A","#7C6BE0","#E0A310","#5566E0","#E0566B","#8492A8","#C77E0A","#19B7A6","#9B8CFF"];

const ASSET_GROUPS = [
  { key:"eq",    label:"Indian Equities",   color:"#2A8FD6", match: h => !["MF","US_STOCK","EPF","PPF","NPS","BOND"].includes(h.assetType) && (h.exchange==="NSE"||h.exchange==="BSE"||(!h.assetType&&h.exchange)) },
  { key:"mf",    label:"Mutual Funds",      color:"#0FB39A", match: h => h.assetType==="MF" },
  { key:"us",    label:"US Stocks & ETFs",  color:"#7C6BE0", match: h => h.assetType==="US_STOCK" },
  { key:"fixed", label:"EPF / PPF / NPS",   color:"#E0A310", match: h => ["EPF","PPF","NPS"].includes(h.assetType) },
  { key:"bond",  label:"Bonds",             color:"#5566E0", match: h => h.assetType==="BOND" },
];
function classifyHolding(h) {
  return ASSET_GROUPS.find(g => g.match(h)) || { key:"other", label:"Other", color:"#8492A8" };
}

const I = {
  rocket:"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z",
  refresh:"M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  link:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  wallet:"M21 12V7H5a2 2 0 0 1 0-4h14v4 M3 5v14a2 2 0 0 0 2 2h16v-5 M18 12a2 2 0 0 0 0 4h4v-4z",
  pie:"M21.21 15.89A10 10 0 1 1 8 2.83 M22 12A10 10 0 0 0 12 2v10z",
  trend:"M23 6l-9.5 9.5-5-5L1 18",
  db:"M12 2c4.42 0 8 1.34 8 3s-3.58 3-8 3-8-1.34-8-3 3.58-3 8-3z M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5 M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3",
  layout:"M3 3h18v18H3z M3 9h18 M9 21V9",
  alert:"M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
  up:"M7 17 17 7 M7 7h10v10",
  down:"M17 7 7 17 M17 17H7V7",
  chevron:"M9 18l6-6-6-6",
  clock:"M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z M12 6v6l4 2",
};
function Icon({ name, size=16, color="currentColor", style }){
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      {I[name].split(" M").map((seg,i)=><path key={i} d={(i?"M":"")+seg.trim()} />)}
    </svg>
  );
}

const inr = (v)=> "₹"+new Intl.NumberFormat("en-IN").format(Math.round(v||0));
const cr = (v)=>{ const n=Math.abs(v||0);
  if(n>=1e7) return (v<0?"-":"")+"₹"+(Math.abs(v)/1e7).toFixed(2)+" Cr";
  if(n>=1e5) return (v<0?"-":"")+"₹"+(Math.abs(v)/1e5).toFixed(2)+" L";
  return inr(v); };
const pct = (v,d=1)=> v==null?"—":(v>0?"+":"")+v.toFixed(d)+"%";
const timeAgo = (iso)=>{
  if(!iso) return null;
  const s = Math.round((Date.now()-new Date(iso).getTime())/1000);
  if(s<60) return `${s}s ago`;
  if(s<3600) return `${Math.floor(s/60)}m ago`;
  if(s<86400) return `${Math.floor(s/3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN",{day:"numeric",month:"short"});
};

function project(a){
  const r=a.expectedReturn/100, inf=a.inflation/100, swr=a.swr/100;
  let corpus=a.currentCorpus, contrib=a.monthlyInvestment*12;
  const rows=[]; let fiYear=null;
  for(let t=0;t<=50;t++){
    const fiTarget=(a.annualExpensesToday*Math.pow(1+inf,t))/swr;
    rows.push({t, age:a.currentAge+t, corpus, fiTarget});
    if(fiYear===null && corpus>=fiTarget) fiYear=t;
    corpus=corpus*(1+r)+contrib;
    contrib=contrib*(1+a.annualStepUp/100);
  }
  return { rows, fiYear, todayFI:a.annualExpensesToday/swr };
}

function Panel({children, style, className=""}){
  return <div className={"rounded-2xl "+className}
    style={{background:C.panel, border:C.border, boxShadow:"0 1px 3px rgba(19,32,58,0.05)", ...style}}>{children}</div>;
}
function Eyebrow({children, style}){
  return <div className="uppercase" style={{color:C.muted,fontSize:10.5,letterSpacing:"0.14em",fontWeight:700,...style}}>{children}</div>;
}
function Ring({frac,size=152}){
  const r=size/2-10, circ=2*Math.PI*r, f=Math.max(0,Math.min(1,frac||0));
  return (
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.panel2} strokeWidth={9}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.go} strokeWidth={9} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ*(1-f)}
        style={{transition:"stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)"}}/>
    </svg>
  );
}
function ChartTip({active,payload,label,fmt}){
  if(!active||!payload||!payload.length) return null;
  return (
    <div className="rounded-lg px-3 py-2" style={{background:C.panel,border:C.border,boxShadow:"0 4px 12px rgba(19,32,58,0.1)",fontSize:12}}>
      {label!=null && <div style={{color:C.sub,marginBottom:4}}>{label}</div>}
      {payload.map((p,i)=>(
        <div key={i} className="font-mono flex items-center gap-2">
          <span style={{width:8,height:8,borderRadius:2,background:p.color}}/>
          <span style={{color:C.sub}}>{p.name}</span>
          <span style={{color:C.text}}>{fmt?fmt(p.value):p.value}</span>
        </div>
      ))}
    </div>
  );
}

const api = {
  status: ()=>fetch("/api/status").then(r=>r.json()),
  connect: (b)=>fetch(`/api/${b}/connect`,{method:"POST"}).then(r=>r.json().then(j=>({ok:r.ok,...j}))),
  portfolio: (b)=>fetch(`/api/${b}/portfolio`).then(r=>r.json().then(j=>({ok:r.ok,status:r.status,...j}))),
  tools: (b)=>fetch(`/api/${b}/tools`).then(r=>r.json()),
  callTool: (b,name,args)=>fetch(`/api/${b}/tool`,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({name,arguments:args||{}})}).then(r=>r.json()),
  refreshPrices: ()=>fetch("/api/prices/refresh",{method:"POST"}).then(r=>r.json()),
};

const BROKERS = [["kite","Zerodha · Kite"],["indmoney","INDmoney"]];

function BrokerCard({k, label, st, onConnect, onLoad}){
  const dot = st?.authed ? C.go : st?.connected ? C.amber : C.muted;
  const status = st?.error ? st.error
    : st?.loading ? "Working…"
    : st?.authed ? `${st.holdings?.length||0} holdings loaded`
    : st?.fromCache ? `${st.holdings?.length||0} holdings · last session`
    : st?.connected ? "Connected — finish login, then Load"
    : "Not connected";
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{width:7,height:7,borderRadius:99,background:dot,flexShrink:0}}/>
          <span style={{color:C.text,fontSize:13.5,fontWeight:600}}>{label}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>onConnect(k)} disabled={st?.loading}
            className="rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5"
            style={{background:st?.connected?C.panel2:C.go,color:st?.connected?C.sub:C.btnText,fontSize:12,fontWeight:600,border:C.border}}>
            <Icon name="link" size={12}/>{st?.connected?"Re-auth":"Connect"}
          </button>
          <button onClick={()=>onLoad(k)} disabled={!st?.connected||st?.loading}
            className="rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5"
            style={{background:C.panel,color:st?.connected?C.text:C.muted,fontSize:12,fontWeight:600,border:C.border}}>
            <Icon name="refresh" size={12}/>Load
          </button>
        </div>
      </div>
      <div className="mt-1.5" style={{color:st?.error?C.neg:C.sub,fontSize:11.5}}>{status}</div>
    </Panel>
  );
}

/* ─── Overview ─── */
function Overview({total, allHoldings, a, proj, go}){
  const frac = proj.todayFI ? Math.min(1, total.current/proj.todayFI) : 0;
  const gainPct = total.invested ? (total.pnl/total.invested)*100 : 0;
  const totalRetPct = total.invested ? (total.totalReturn/total.invested)*100 : 0;

  // Asset class breakdown
  const byClass = useMemo(()=>{
    const m = {};
    for(const h of allHoldings){
      const g = classifyHolding(h);
      if(!m[g.key]) m[g.key]={...g,current:0,invested:0,pnl:0};
      m[g.key].current += h.current||0;
      m[g.key].invested += h.invested||0;
      m[g.key].pnl += h.absoluteReturn||0;
    }
    return Object.values(m).filter(x=>x.current>0).sort((a,b)=>b.current-a.current);
  },[allHoldings]);

  const totalCurrent = total.current||1;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <Panel className="p-6" style={{background:"linear-gradient(135deg,#FFFFFF 0%,#EEF5FF 100%)"}}>
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="relative flex items-center justify-center" style={{width:152,height:152,flexShrink:0}}>
            <Ring frac={frac}/>
            <div className="absolute text-center">
              <div className="font-mono" style={{color:C.go,fontSize:26,fontWeight:700,lineHeight:1}}>{Math.round(frac*100)}%</div>
              <div style={{color:C.muted,fontSize:10}}>to FI</div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <Eyebrow>Total net worth</Eyebrow>
            <div className="mt-1 font-mono" style={{color:C.text,fontSize:42,fontWeight:700,letterSpacing:"-0.02em",lineHeight:1.1}}>
              {total.current?cr(total.current):"—"}
            </div>
            <div className="mt-3 flex flex-wrap gap-5">
              <div>
                <div style={{color:C.muted,fontSize:11}}>Invested</div>
                <div className="font-mono" style={{color:C.text,fontSize:15,fontWeight:600}}>{total.invested?cr(total.invested):"—"}</div>
              </div>
              <div>
                <div style={{color:C.muted,fontSize:11}}>Abs. gain</div>
                <div className="font-mono" style={{color:total.pnl>=0?C.pos:C.neg,fontSize:15,fontWeight:600}}>
                  {total.pnl?cr(total.pnl):"—"} <span style={{fontSize:12}}>({pct(gainPct)})</span>
                </div>
              </div>
              {total.dividends>0 && <div>
                <div style={{color:C.muted,fontSize:11}}>Dividends</div>
                <div className="font-mono" style={{color:C.pos,fontSize:15,fontWeight:600}}>{cr(total.dividends)}</div>
              </div>}
              {total.totalReturn>0 && total.dividends>0 && <div>
                <div style={{color:C.muted,fontSize:11}}>Total return</div>
                <div className="font-mono" style={{color:C.pos,fontSize:15,fontWeight:600}}>
                  {cr(total.totalReturn)} <span style={{fontSize:12}}>({pct(totalRetPct)})</span>
                </div>
              </div>}
            </div>
            <button onClick={()=>go("trajectory")} className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2"
              style={{background:C.go,color:C.btnText,fontWeight:600,fontSize:12.5}}>
              <Icon name="rocket" size={14}/> Trajectory {proj.fiYear!=null&&<span style={{opacity:0.85}}>· FI at age {a.currentAge+proj.fiYear}</span>} <Icon name="chevron" size={14}/>
            </button>
          </div>
        </div>
      </Panel>

      {/* Asset class breakdown */}
      {byClass.length>0 && (
        <Panel className="p-5">
          <Eyebrow>By asset class</Eyebrow>
          <div className="mt-3 space-y-2.5">
            {byClass.map(g=>{
              const w = (g.current/totalCurrent)*100;
              const gp = g.invested ? (g.pnl/g.invested)*100 : 0;
              return (
                <div key={g.key}>
                  <div className="flex items-center justify-between mb-1" style={{fontSize:12}}>
                    <div className="flex items-center gap-2">
                      <span style={{width:8,height:8,borderRadius:2,background:g.color,flexShrink:0}}/>
                      <span style={{color:C.text,fontWeight:600}}>{g.label}</span>
                      <span style={{color:C.muted}}>{w.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono">
                      <span style={{color:C.text}}>{cr(g.current)}</span>
                      <span style={{color:gp>=0?C.pos:C.neg,minWidth:52,textAlign:"right"}}>{pct(gp)}</span>
                    </div>
                  </div>
                  <div style={{height:5,borderRadius:99,background:C.panel2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${w}%`,background:g.color,borderRadius:99,transition:"width 0.8s ease"}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ─── Holdings ─── */
function HoldingGroup({group, holdings}){
  const [open, setOpen] = useState(true);
  const total = holdings.reduce((s,h)=>({
    invested: s.invested+(h.invested||0),
    current: s.current+(h.current||0),
    pnl: s.pnl+(h.absoluteReturn||0),
  }),{invested:0,current:0,pnl:0});
  const gPct = total.invested ? (total.pnl/total.invested)*100 : 0;

  return (
    <div className="rounded-2xl overflow-hidden" style={{border:C.border}}>
      {/* Group header */}
      <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center justify-between px-4 py-3"
        style={{background:C.panel2,borderBottom:open?C.border:"none"}}>
        <div className="flex items-center gap-2.5">
          <span style={{width:8,height:8,borderRadius:2,background:group.color}}/>
          <span style={{color:C.text,fontWeight:700,fontSize:13}}>{group.label}</span>
          <span style={{color:C.muted,fontSize:12}}>{holdings.length} holding{holdings.length!==1?"s":""}</span>
        </div>
        <div className="flex items-center gap-4 font-mono">
          <div className="text-right">
            <div style={{color:C.text,fontSize:13,fontWeight:600}}>{cr(total.current)}</div>
            <div style={{color:gPct>=0?C.pos:C.neg,fontSize:11}}>{pct(gPct)} · {total.pnl>=0?"+":""}{cr(total.pnl)}</div>
          </div>
          <Icon name="chevron" size={14} color={C.muted} style={{transform:open?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.2s"}}/>
        </div>
      </button>

      {/* Rows */}
      {open && (
        <div style={{background:C.panel}}>
          {/* Column headers */}
          <div className="grid px-4 py-2" style={{gridTemplateColumns:"1fr auto auto auto",gap:16,borderBottom:C.border}}>
            <span style={{color:C.muted,fontSize:10.5,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>Name</span>
            <span style={{color:C.muted,fontSize:10.5,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"right",minWidth:90}}>Invested</span>
            <span style={{color:C.muted,fontSize:10.5,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"right",minWidth:90}}>Current</span>
            <span style={{color:C.muted,fontSize:10.5,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"right",minWidth:80}}>Return</span>
          </div>
          {holdings.map((h,i)=><HoldingRow key={i} h={h} last={i===holdings.length-1}/>)}
          {/* Subtotal */}
          <div className="grid px-4 py-2.5" style={{gridTemplateColumns:"1fr auto auto auto",gap:16,background:C.panel2,borderTop:C.border}}>
            <span style={{color:C.sub,fontSize:11.5,fontWeight:600}}>Total</span>
            <span className="font-mono text-right" style={{color:C.sub,fontSize:11.5,minWidth:90}}>{cr(total.invested)}</span>
            <span className="font-mono text-right" style={{color:C.text,fontSize:11.5,fontWeight:600,minWidth:90}}>{cr(total.current)}</span>
            <span className="font-mono text-right" style={{color:gPct>=0?C.pos:C.neg,fontSize:11.5,fontWeight:600,minWidth:80}}>{pct(gPct)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function HoldingRow({h, last}){
  const [exp, setExp] = useState(false);
  const up = (h.absoluteReturn||0) >= 0;
  const tone = up ? C.pos : C.neg;
  const retPct = h.absoluteReturnPct;
  const subtitle = [h.broker, h.exchange, h.assetType && h.assetType!==h.exchange?h.assetType:null]
    .filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(" · ");

  const hasExtra = h.xirr!=null || h.cagr!=null || h.dividendEarned>0;

  return (
    <div style={{borderBottom:last&&!exp?"none":C.border}}>
      <button onClick={()=>hasExtra&&setExp(o=>!o)} className="w-full grid px-4 py-3 text-left"
        style={{gridTemplateColumns:"1fr auto auto auto",gap:16,cursor:hasExtra?"pointer":"default"}}>
        <div className="min-w-0">
          <div className="truncate" style={{color:C.text,fontSize:13,fontWeight:600}}>{h.symbol}</div>
          {subtitle && <div style={{color:C.muted,fontSize:11,marginTop:1}}>{subtitle}</div>}
          {h.quantity!=null && h.unitPrice!=null && (
            <div style={{color:C.muted,fontSize:10.5,marginTop:1}}>
              {h.quantity % 1 === 0 ? h.quantity.toFixed(0) : h.quantity.toFixed(4)} units × {inr(h.unitPrice)}
            </div>
          )}
        </div>
        <span className="font-mono text-right self-center" style={{color:C.sub,fontSize:12.5,minWidth:90}}>{h.invested?cr(h.invested):"—"}</span>
        <span className="font-mono text-right self-center" style={{color:C.text,fontSize:13,fontWeight:600,minWidth:90}}>{h.current?cr(h.current):"—"}</span>
        <div className="flex flex-col items-end self-center" style={{minWidth:80}}>
          <span className="font-mono" style={{color:tone,fontSize:13,fontWeight:600}}>{retPct!=null?pct(retPct):"—"}</span>
          {h.absoluteReturn!=null && <span className="font-mono" style={{color:tone,fontSize:10.5}}>{h.absoluteReturn>=0?"+":""}{cr(h.absoluteReturn)}</span>}
        </div>
      </button>
      {exp && hasExtra && (
        <div className="px-4 pb-3 flex flex-wrap gap-x-6 gap-y-1" style={{background:"#FAFBFE",borderTop:C.border}}>
          {h.xirr!=null && <div><div style={{color:C.muted,fontSize:10}}>XIRR</div><div className="font-mono" style={{color:h.xirr>=0?C.pos:C.neg,fontSize:12,fontWeight:600}}>{pct(h.xirr)}</div></div>}
          {h.cagr!=null && <div><div style={{color:C.muted,fontSize:10}}>CAGR</div><div className="font-mono" style={{color:h.cagr>=0?C.pos:C.neg,fontSize:12,fontWeight:600}}>{pct(h.cagr)}</div></div>}
          {h.dividendEarned>0 && <div><div style={{color:C.muted,fontSize:10}}>Dividends</div><div className="font-mono" style={{color:C.pos,fontSize:12,fontWeight:600}}>{cr(h.dividendEarned)}</div></div>}
          {h.totalReturn!=null && h.dividendEarned>0 && <div><div style={{color:C.muted,fontSize:10}}>Total return (incl. div)</div><div className="font-mono" style={{color:C.pos,fontSize:12,fontWeight:600}}>{cr(h.totalReturn)} ({pct(h.totalReturnPct)})</div></div>}
          {h.benchmarkXirr!=null && <div><div style={{color:C.muted,fontSize:10}}>Benchmark XIRR</div><div className="font-mono" style={{color:C.text,fontSize:12,fontWeight:600}}>{pct(h.benchmarkXirr)}</div></div>}
        </div>
      )}
    </div>
  );
}

function Holdings({allHoldings, refreshedAt, onRefresh, refreshing}){
  if(!allHoldings.length) return (
    <Panel className="p-10 text-center">
      <Icon name="wallet" size={28} color={C.muted} style={{margin:"0 auto 12px"}}/>
      <div style={{color:C.sub,fontSize:13.5}}>No holdings loaded yet. Connect a broker above, finish the login, then hit Load.</div>
    </Panel>
  );

  // Group holdings by asset class
  const groups = useMemo(()=>{
    const map = {};
    for(const h of allHoldings){
      const g = classifyHolding(h);
      if(!map[g.key]) map[g.key]={...g,holdings:[]};
      map[g.key].holdings.push(h);
    }
    // Sort groups by total current value desc
    return Object.values(map).sort((a,b)=>{
      const sa = a.holdings.reduce((s,h)=>s+(h.current||0),0);
      const sb = b.holdings.reduce((s,h)=>s+(h.current||0),0);
      return sb-sa;
    });
  },[allHoldings]);

  const mfCount = allHoldings.filter(h=>h.assetType==="MF").length;

  return (
    <div className="space-y-4">
      {/* Refresh bar */}
      <div className="flex items-center justify-between">
        <div style={{color:C.muted,fontSize:12}}>
          {refreshedAt
            ? <span><Icon name="clock" size={11} color={C.muted} style={{verticalAlign:"middle",marginRight:4}}/>Updated {timeAgo(refreshedAt)}</span>
            : null}
        </div>
        <button onClick={onRefresh} disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2"
          style={{background:refreshing?C.panel2:C.go,color:refreshing?C.muted:C.btnText,fontSize:12.5,fontWeight:600,border:C.border}}>
          <Icon name="refresh" size={13} style={refreshing?{animation:"spin 1s linear infinite"}:null}/>
          {refreshing?"Refreshing…":`Refresh NAV${mfCount>0?` (${mfCount} MF)`:""}`}
        </button>
      </div>

      {groups.map(g=><HoldingGroup key={g.key} group={g} holdings={g.holdings}/>)}
    </div>
  );
}

/* ─── Allocation ─── */
function Allocation({allHoldings}){
  const [view, setView] = useState("class");
  if(!allHoldings.length) return (
    <Panel className="p-10 text-center"><div style={{color:C.sub,fontSize:13.5}}>Load holdings to see allocation.</div></Panel>
  );

  const byClass = useMemo(()=>{
    const m={};
    for(const h of allHoldings){
      const g=classifyHolding(h);
      if(!m[g.key]) m[g.key]={name:g.label,value:0,color:g.color};
      m[g.key].value+=h.current||0;
    }
    return Object.values(m).filter(x=>x.value>0).sort((a,b)=>b.value-a.value);
  },[allHoldings]);

  const byHolding = useMemo(()=>{
    const sorted=[...allHoldings].filter(h=>h.current>0).sort((a,b)=>b.current-a.current);
    const top=sorted.slice(0,9).map((h,i)=>({name:h.symbol,value:h.current,color:PIE[i%PIE.length]}));
    const rest=sorted.slice(9).reduce((s,h)=>s+h.current,0);
    if(rest>0) top.push({name:"Other",value:rest,color:"#B8C2D4"});
    return top;
  },[allHoldings]);

  const data = view==="class" ? byClass : byHolding;
  const total = data.reduce((s,x)=>s+x.value,0);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[["class","By asset class"],["holding","By holding"]].map(([v,l])=>(
          <button key={v} onClick={()=>setView(v)} className="rounded-lg px-3 py-1.5"
            style={{fontSize:12.5,fontWeight:600,background:view===v?C.go:C.panel,color:view===v?C.btnText:C.sub,border:C.border}}>
            {l}
          </button>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Panel className="p-5">
          <div style={{width:"100%",height:280}}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={68} outerRadius={110} paddingAngle={2} stroke="none">
                  {data.map((x,i)=><Cell key={i} fill={x.color}/>)}
                </Pie>
                <Tooltip content={<ChartTip fmt={cr}/>}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel className="p-5">
          <Eyebrow>{view==="class"?"Asset class":"Holdings"} breakdown</Eyebrow>
          <div className="mt-3 space-y-2.5">
            {data.map(x=>{
              const w=(x.value/total)*100;
              return (
                <div key={x.name}>
                  <div className="flex items-center gap-2 mb-1">
                    <span style={{width:8,height:8,borderRadius:2,background:x.color,flexShrink:0}}/>
                    <span className="flex-1 truncate" style={{color:C.sub,fontSize:12.5}}>{x.name}</span>
                    <span className="font-mono" style={{color:C.text,fontSize:12.5,fontWeight:600}}>{cr(x.value)}</span>
                    <span className="font-mono" style={{color:C.muted,fontSize:11,minWidth:40,textAlign:"right"}}>{w.toFixed(1)}%</span>
                  </div>
                  <div style={{height:4,borderRadius:99,background:C.panel2}}>
                    <div style={{height:"100%",width:`${w}%`,background:x.color,borderRadius:99,transition:"width 0.6s ease"}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ─── Trajectory ─── */
function Trajectory({a,setA,proj}){
  const fields = [
    ["currentAge","Current age",1,18,70],
    ["currentCorpus","Current corpus (₹)",10000,0,100000000],
    ["monthlyInvestment","Monthly investment (₹)",1000,0,1000000],
    ["annualStepUp","Annual step-up (%)",1,0,25],
    ["expectedReturn","Expected return (%)",0.5,1,20],
    ["inflation","Inflation (%)",0.5,0,15],
    ["annualExpensesToday","Annual expenses today (₹)",10000,0,10000000],
    ["swr","Safe withdrawal rate (%)",0.1,2,6],
  ];
  const fi = proj.rows.find(r=>proj.fiYear!=null && r.t===proj.fiYear);
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <Panel className="p-5 md:col-span-1">
          <Eyebrow>Assumptions</Eyebrow>
          <div className="mt-3 space-y-3">
            {fields.map(([key,label,step,min,max])=>(
              <div key={key}>
                <div className="flex justify-between" style={{fontSize:11.5}}>
                  <span style={{color:C.sub}}>{label}</span>
                  <span className="font-mono" style={{color:C.text}}>{a[key]}</span>
                </div>
                <input type="range" min={min} max={max} step={step} value={a[key]}
                  onChange={e=>setA({...a,[key]:parseFloat(e.target.value)})}
                  className="w-full mt-1" style={{accentColor:C.go}}/>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="p-5 md:col-span-2">
          <Eyebrow>Corpus vs. the moving target</Eyebrow>
          <div style={{width:"100%",height:320}} className="mt-3">
            <ResponsiveContainer>
              <LineChart data={proj.rows}>
                <CartesianGrid stroke={C.line} vertical={false}/>
                <XAxis dataKey="age" stroke={C.muted} fontSize={11}/>
                <YAxis stroke={C.muted} fontSize={11} tickFormatter={cr} width={72}/>
                <Tooltip content={<ChartTip fmt={cr}/>}/>
                <Line type="monotone" dataKey="corpus" name="Corpus" stroke={C.go} strokeWidth={2.5} dot={false}/>
                <Line type="monotone" dataKey="fiTarget" name="FI target" stroke={C.amber} strokeWidth={2} strokeDasharray="5 4" dot={false}/>
                {fi && <ReferenceDot x={fi.age} y={fi.corpus} r={5} fill={C.go} stroke="#fff" strokeWidth={2}/>}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2" style={{color:C.sub,fontSize:12.5}}>
            {proj.fiYear!=null
              ? <>Independence at <b style={{color:C.go}}>age {a.currentAge+proj.fiYear}</b> — corpus crosses the inflation-adjusted target of {cr(fi.fiTarget)}.</>
              : <>Not reached within 50 years on these assumptions.</>}
          </div>
        </Panel>
      </div>
      <Panel className="p-4 flex gap-2" style={{color:C.muted,fontSize:12}}>
        <Icon name="alert" size={15} color={C.go} style={{flexShrink:0,marginTop:1}}/>
        <span>A model, not a promise. Assumes steady compounding; ignores tax, sequence-of-returns risk, and crashes.</span>
      </Panel>
    </div>
  );
}

/* ─── Data Room ─── */
function DataRoom({brokers, onCall}){
  const [open,setOpen] = useState(null);
  const [result,setResult] = useState(null);
  const [busy,setBusy] = useState(false);
  async function run(b,name){
    setBusy(true); setOpen(b+":"+name); setResult(null);
    const r = await onCall(b,name);
    setResult(r); setBusy(false);
  }
  return (
    <div className="space-y-4">
      <Panel className="p-4 flex gap-2" style={{borderColor:"#EAD9B0"}}>
        <Icon name="alert" size={15} color={C.amber} style={{flexShrink:0,marginTop:1}}/>
        <span style={{color:C.sub,fontSize:12.5,lineHeight:1.6}}>
          Raw view of each broker's MCP tools. Call any tool to inspect the real field names.
        </span>
      </Panel>
      {BROKERS.map(([k,label])=>{
        const tools = brokers[k]?.tools||[];
        return (
          <Panel key={k} className="p-5">
            <Eyebrow>{label} · tools</Eyebrow>
            {!brokers[k]?.connected
              ? <div className="mt-2" style={{color:C.muted,fontSize:12.5}}>Connect this broker to list its tools.</div>
              : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tools.length? tools.map(t=>(
                    <button key={t} onClick={()=>run(k,t)}
                      className="rounded-lg px-3 py-1.5" style={{background:C.panel2,color:C.text,fontSize:12,fontWeight:600,border:C.border}}>
                      {t}
                    </button>
                  )) : <span style={{color:C.muted,fontSize:12.5}}>No tools reported.</span>}
                </div>
              )}
          </Panel>
        );
      })}
      {open && (
        <Panel className="p-5">
          <Eyebrow>Result · {open}</Eyebrow>
          <pre className="mt-3 rounded-lg p-3 overflow-auto" style={{background:C.panel2,color:C.text,fontSize:12,maxHeight:400}}>
            {busy ? "Calling…" : JSON.stringify(result?.json ?? result?.text ?? result, null, 2)}
          </pre>
        </Panel>
      )}
    </div>
  );
}

const NAV = [["overview","Overview","layout"],["holdings","Holdings","wallet"],
  ["allocation","Allocation","pie"],["trajectory","Trajectory","rocket"],["data","Data","db"]];

function App(){
  const [tab,setTab] = useState("overview");
  const [brokers,setBrokers] = useState({});
  const [refreshedAt,setRefreshedAt] = useState(null);
  const [refreshing,setRefreshing] = useState(false);
  const [a,setA] = useState({currentAge:32,currentCorpus:0,monthlyInvestment:50000,annualStepUp:5,
    expectedReturn:11,inflation:6,annualExpensesToday:600000,swr:3.5});

  const patch = (k,v)=> setBrokers(b=>({...b,[k]:{...(b[k]||{}),...v}}));

  useEffect(()=>{ api.status().then(s=>{
    const next={};
    for(const [k,info] of Object.entries(s.brokers||{})){
      next[k]={connected:info.connected,authed:info.authed,tools:info.tools,loginUrl:info.loginUrl};
      if(info.cachedHoldings?.length){
        next[k].holdings=info.cachedHoldings;
        next[k].fromCache=true;
        next[k].cachedAt=info.cachedAt;
        if(info.cachedAt && !refreshedAt) setRefreshedAt(info.cachedAt);
      }
    }
    setBrokers(next);
  }).catch(()=>{}); },[]);

  async function connect(k){
    patch(k,{loading:true,error:null});
    try{
      const r = await api.connect(k);
      if(!r.ok) throw new Error(r.error||"connect failed");
      patch(k,{connected:true,tools:r.tools,loginUrl:r.loginUrl,loading:false});
      if(r.loginUrl) window.open(r.loginUrl,"_blank","noopener");
    }catch(e){ patch(k,{loading:false,error:String(e.message||e)}); }
  }

  async function load(k){
    patch(k,{loading:true,error:null});
    try{
      const r = await api.portfolio(k);
      if(r.status===401 && r.loginUrl){ window.open(r.loginUrl,"_blank","noopener");
        patch(k,{loading:false,error:"Login needed — finish in the new tab, then Load again."}); return; }
      if(!r.ok) throw new Error(r.error||"load failed");
      const savedAt = r.savedAt || new Date().toISOString();
      patch(k,{authed:true,holdings:r.holdings||[],raw:r.raw||{},tools:r.tools||(brokers[k]?.tools||[]),loading:false,fromCache:!!r.fromCache});
      setRefreshedAt(savedAt);
    }catch(e){ patch(k,{loading:false,error:String(e.message||e)}); }
  }

  async function refreshPrices(){
    setRefreshing(true);
    try{
      const r = await api.refreshPrices();
      if(r.updated > 0 && r.holdings?.length){
        // Redistribute updated holdings back to their broker buckets
        setBrokers(prev=>{
          const next={...prev};
          for(const k of Object.keys(next)){
            if(!next[k]?.holdings?.length) continue;
            // Match by symbol+assetType
            const updated={};
            for(const h of r.holdings) updated[(h.symbol||"")+"::"+h.assetType]=h;
            next[k]={...next[k], holdings: next[k].holdings.map(h=>updated[(h.symbol||"")+"::"+h.assetType]||h)};
          }
          return next;
        });
        setRefreshedAt(r.refreshedAt);
      }
    }catch(e){ /* silently ignore */ }
    finally{ setRefreshing(false); }
  }

  const allHoldings = useMemo(()=> Object.values(brokers).flatMap(b=>b?.holdings||[]),[brokers]);
  const total = useMemo(()=>{
    let invested=0,current=0,pnl=0,dividends=0,count=0;
    for(const h of allHoldings){
      invested+=h.invested||0; current+=h.current||0;
      pnl+=h.absoluteReturn||h.pnl||0;
      dividends+=h.dividendEarned||0;
      count++;
    }
    return {invested,current,pnl,dividends,totalReturn:pnl+dividends,count};
  },[allHoldings]);

  useEffect(()=>{ if(total.current && a.currentCorpus===0) setA(x=>({...x,currentCorpus:Math.round(total.current)})); },[total.current]);

  const proj = useMemo(()=>project(a),[a]);

  return (
    <div style={{background:C.bg,color:C.text,minHeight:"100vh"}}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-5">
        <header className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg flex items-center justify-center" style={{width:32,height:32,background:C.go}}>
              <Icon name="rocket" size={17} color="#FFF"/>
            </div>
            <div>
              <div style={{fontWeight:700,fontSize:15}}>Wealth Trajectory</div>
              <div style={{color:C.muted,fontSize:11}}>your data · your server · no middleman</div>
            </div>
          </div>
          <div className="hidden sm:block text-right">
            <div style={{color:C.muted,fontSize:10.5,textTransform:"uppercase",letterSpacing:"0.1em"}}>Net Worth</div>
            <div className="font-mono" style={{color:C.go,fontSize:17,fontWeight:700}}>{total.current?cr(total.current):"—"}</div>
          </div>
        </header>

        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          {BROKERS.map(([k,label])=>(
            <BrokerCard key={k} k={k} label={label} st={brokers[k]} onConnect={connect} onLoad={load}/>
          ))}
        </div>

        <nav className="flex gap-1 mb-5 overflow-x-auto pb-1">
          {NAV.map(([k,l,ic])=>(
            <button key={k} onClick={()=>setTab(k)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 whitespace-nowrap"
              style={{fontSize:12.5,fontWeight:600,background:tab===k?C.panel:"transparent",
                color:tab===k?C.text:C.sub,border:`1px solid ${tab===k?C.line:"transparent"}`}}>
              <Icon name={ic} size={14} color={tab===k?C.go:C.muted}/>{l}
            </button>
          ))}
        </nav>

        {tab==="overview" && <Overview total={total} allHoldings={allHoldings} a={a} proj={proj} go={setTab}/>}
        {tab==="holdings" && <Holdings allHoldings={allHoldings} refreshedAt={refreshedAt} onRefresh={refreshPrices} refreshing={refreshing}/>}
        {tab==="allocation" && <Allocation allHoldings={allHoldings}/>}
        {tab==="trajectory" && <Trajectory a={a} setA={setA} proj={proj}/>}
        {tab==="data" && <DataRoom brokers={brokers} onCall={(b,n)=>api.callTool(b,n)}/>}

        <footer className="mt-8 pt-4" style={{borderTop:C.border,color:C.muted,fontSize:11}}>
          Pulled live from your connected accounts through your own backend. For visualisation and education — not investment advice.
        </footer>
      </div>
    </div>
  );
}

try {
  if(typeof Recharts==="undefined") throw new Error("Recharts didn't load — check public/vendor/");
  ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
} catch(e) {
  document.getElementById("root").innerHTML =
    '<div style="max-width:560px;margin:60px auto;font-family:system-ui;color:#13203A">'
    +'<h3>Couldn’t start</h3><pre style="white-space:pre-wrap;background:#EEF2F8;padding:12px;border-radius:8px;color:#DC4B5C">'
    +(e&&e.message?e.message:e)+'</pre></div>';
}
