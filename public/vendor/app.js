const {
  useState,
  useEffect,
  useMemo
} = React;
const {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceDot,
  BarChart,
  Bar
} = Recharts;

// Dark, glass, "futuristic fintech" palette — inspired by CRED's neon-on-black
// cards and Apple's high-contrast, generous-whitespace product pages.
const C = {
  bg: "#06070C",
  panel: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02))",
  panel2: "rgba(255,255,255,0.07)",
  panelSolid: "#12141C",
  line: "rgba(255,255,255,0.09)",
  text: "#F3F5FA",
  sub: "#9AA3B9",
  muted: "#7A84A0",
  go: "#00E5A8",
  goSoft: "rgba(0,229,168,0.14)",
  goInk: "#04150F",
  amber: "#FFB648",
  neg: "#FF6178",
  pos: "#00E5A8",
  btnText: "#04150F",
  border: "1px solid rgba(255,255,255,0.09)",
  rajanish: "#4FA8FF",
  aswini: "#B497FF"
};
const PIE = ["#4FA8FF", "#00E5A8", "#B497FF", "#FFC24E", "#6E86FF", "#FF6E8E", "#8DA0C4", "#FFB648", "#31D6C4", "#C9B8FF"];
const USERS = [["rajanish", "Rajanish"], ["aswini", "Aswini"]];
const BROKERS = [["kite", "Zerodha · Kite"], ["indmoney", "INDmoney"]];
const USER_BROKERS = {
  rajanish: ["kite", "indmoney"],
  aswini: ["kite", "indmoney", "truthifi"]
};
const ASSET_GROUPS = [{
  key: "eq",
  label: "Indian Equities",
  color: "#4FA8FF",
  match: h => !["MF", "US_STOCK", "EPF", "PPF", "NPS", "BOND", "US_401K"].includes(h.assetType) && (h.exchange === "NSE" || h.exchange === "BSE" || !h.assetType && h.exchange)
}, {
  key: "mf",
  label: "Mutual Funds",
  color: "#00E5A8",
  match: h => h.assetType === "MF"
}, {
  key: "us",
  label: "US Stocks & ETFs",
  color: "#B497FF",
  match: h => h.assetType === "US_STOCK"
}, {
  key: "fixed",
  label: "EPF / PPF / NPS",
  color: "#FFC24E",
  match: h => ["EPF", "PPF", "NPS"].includes(h.assetType)
}, {
  key: "bond",
  label: "Bonds",
  color: "#6E86FF",
  match: h => h.assetType === "BOND"
}, {
  key: "ret",
  label: "401k / ESOP (USD)",
  color: "#FF6E9E",
  match: h => h.assetType === "US_401K"
}];
function classifyHolding(h) {
  return ASSET_GROUPS.find(g => g.match(h)) || {
    key: "other",
    label: "Other",
    color: "#8492A8"
  };
}

// Collapse several holdings of the same kind (e.g. one EPF account per
// employer) into a single summed row.
function mergeHoldings(list, symbol) {
  const sum = key => list.reduce((s, h) => s + (h[key] || 0), 0);
  const invested = sum("invested");
  const current = sum("current");
  const pnl = sum("absoluteReturn");
  const dividendEarned = sum("dividendEarned");
  const totalReturn = sum("totalReturn");
  const pnlPct = invested ? pnl / invested * 100 : null;
  const totalReturnPct = invested ? totalReturn / invested * 100 : null;
  return {
    symbol,
    exchange: symbol,
    assetType: symbol,
    broker: "",
    investmentCode: null,
    unitPrice: null,
    quantity: null,
    invested: invested || null,
    current: current || null,
    pnl,
    pnlPct,
    absoluteReturn: pnl,
    absoluteReturnPct: pnlPct,
    dividendEarned: dividendEarned || null,
    totalReturn: totalReturn || null,
    totalReturnPct,
    returnWithDividends: totalReturnPct,
    returnWithoutDividends: pnlPct,
    xirr: null,
    benchmarkXirr: null,
    cagr: null,
    source: list.map(h => h.source).filter((v, i, a) => a.indexOf(v) === i).join(",")
  };
}
const I = {
  rocket: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z",
  refresh: "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  wallet: "M21 12V7H5a2 2 0 0 1 0-4h14v4 M3 5v14a2 2 0 0 0 2 2h16v-5 M18 12a2 2 0 0 0 0 4h4v-4z",
  pie: "M21.21 15.89A10 10 0 1 1 8 2.83 M22 12A10 10 0 0 0 12 2v10z",
  trend: "M23 6l-9.5 9.5-5-5L1 18",
  db: "M12 2c4.42 0 8 1.34 8 3s-3.58 3-8 3-8-1.34-8-3 3.58-3 8-3z M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5 M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3",
  layout: "M3 3h18v18H3z M3 9h18 M9 21V9",
  alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
  up: "M7 17 17 7 M7 7h10v10",
  down: "M17 7 7 17 M17 17H7V7",
  chevron: "M9 18l6-6-6-6",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  heart: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
};
function Icon({
  name,
  size = 16,
  color = "currentColor",
  style
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: style
  }, I[name].split(" M").map((seg, i) => /*#__PURE__*/React.createElement("path", {
    key: i,
    d: (i ? "M" : "") + seg.trim()
  })));
}
const inr = v => "₹" + new Intl.NumberFormat("en-IN").format(Math.round(v || 0));
const cr = v => {
  const n = Math.abs(v || 0);
  if (n >= 1e7) return (v < 0 ? "-" : "") + "₹" + (Math.abs(v) / 1e7).toFixed(2) + " Cr";
  if (n >= 1e5) return (v < 0 ? "-" : "") + "₹" + (Math.abs(v) / 1e5).toFixed(2) + " L";
  return inr(v);
};
const pct = (v, d = 1) => v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(d) + "%";
const timeAgo = iso => {
  if (!iso) return null;
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short"
  });
};
function project(a) {
  const r = a.expectedReturn / 100,
    inf = a.inflation / 100,
    swr = a.swr / 100;
  let corpus = a.currentCorpus,
    contrib = a.monthlyInvestment * 12;
  const rows = [];
  let fiYear = null;
  for (let t = 0; t <= 50; t++) {
    const fiTarget = a.annualExpensesToday * Math.pow(1 + inf, t) / swr;
    rows.push({
      t,
      age: a.currentAge + t,
      corpus,
      fiTarget
    });
    if (fiYear === null && corpus >= fiTarget) fiYear = t;
    corpus = corpus * (1 + r) + contrib;
    contrib = contrib * (1 + a.annualStepUp / 100);
  }
  return {
    rows,
    fiYear,
    todayFI: a.annualExpensesToday / swr
  };
}

/* ─── Ambient background — soft blurred glow blobs, pure CSS ─── */
function AmbientGlow() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "-18%",
      left: "-12%",
      width: 520,
      height: 520,
      borderRadius: "50%",
      background: "radial-gradient(circle, rgba(0,229,168,0.20), transparent 70%)",
      filter: "blur(70px)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: "-22%",
      right: "-14%",
      width: 600,
      height: 600,
      borderRadius: "50%",
      background: "radial-gradient(circle, rgba(79,168,255,0.16), transparent 70%)",
      filter: "blur(80px)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "22%",
      right: "8%",
      width: 380,
      height: 380,
      borderRadius: "50%",
      background: "radial-gradient(circle, rgba(180,151,255,0.14), transparent 70%)",
      filter: "blur(70px)"
    }
  }));
}
function Panel({
  children,
  style,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "rounded-3xl " + className,
    style: {
      background: C.panel,
      border: C.border,
      boxShadow: "0 1px 0 rgba(255,255,255,0.06) inset, 0 20px 44px -24px rgba(0,0,0,0.65)",
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      ...style
    }
  }, children);
}
function Eyebrow({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "uppercase",
    style: {
      color: C.muted,
      fontSize: 10.5,
      letterSpacing: "0.14em",
      fontWeight: 700,
      ...style
    }
  }, children);
}
function Ring({
  frac,
  size = 152
}) {
  const r = size / 2 - 10,
    circ = 2 * Math.PI * r,
    f = Math.max(0, Math.min(1, frac || 0));
  const gid = "ringGrad";
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      transform: "rotate(-90deg)",
      overflow: "visible"
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: gid,
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: C.go
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: C.rajanish
  }))), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: "rgba(255,255,255,0.08)",
    strokeWidth: 9
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: `url(#${gid})`,
    strokeWidth: 9,
    strokeLinecap: "round",
    strokeDasharray: circ,
    strokeDashoffset: circ * (1 - f),
    style: {
      transition: "stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)",
      filter: "drop-shadow(0 0 10px rgba(0,229,168,0.45))"
    }
  }));
}
function ChartTip({
  active,
  payload,
  label,
  fmt
}) {
  if (!active || !payload || !payload.length) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl px-3 py-2",
    style: {
      background: C.panelSolid,
      border: C.border,
      boxShadow: "0 12px 28px -12px rgba(0,0,0,0.7)",
      fontSize: 12
    }
  }, label != null && /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.sub,
      marginBottom: 4
    }
  }, label), payload.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "font-mono flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 2,
      background: p.color
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.sub
    }
  }, p.name), /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.text
    }
  }, fmt ? fmt(p.value) : p.value))));
}
const api = {
  status: () => fetch("/api/status").then(r => r.json()),
  connect: (u, b) => fetch(`/api/${u}/${b}/connect`, {
    method: "POST"
  }).then(r => r.json().then(j => ({
    ok: r.ok,
    ...j
  }))),
  portfolio: (u, b) => fetch(`/api/${u}/${b}/portfolio`).then(r => r.json().then(j => ({
    ok: r.ok,
    status: r.status,
    ...j
  }))),
  callTool: (u, b, name, args) => fetch(`/api/${u}/${b}/tool`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name,
      arguments: args || {}
    })
  }).then(r => r.json()),
  refreshFromDrive: () => fetch("/api/drive/refresh", {
    method: "POST"
  }).then(r => r.json().then(j => ({
    ok: r.ok,
    ...j
  })))
};
function StatusDot({
  color,
  glow
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: 99,
      background: color,
      flexShrink: 0,
      boxShadow: glow ? `0 0 8px ${color}` : "none"
    }
  });
}
function BrokerCard({
  user,
  brokerKey,
  label,
  st,
  onConnect,
  onLoad
}) {
  const dot = st?.authed ? C.go : st?.connected ? C.amber : C.muted;
  const status = st?.error ? st.error : st?.loading ? "Working…" : st?.authed ? `${st.holdings?.length || 0} holdings loaded` : st?.fromCache ? `${st.holdings?.length || 0} holdings · last session` : st?.connected ? "Connected — finish login, then Load" : "Not connected";
  return /*#__PURE__*/React.createElement(Panel, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 min-w-0"
  }, /*#__PURE__*/React.createElement(StatusDot, {
    color: dot,
    glow: st?.authed
  }), /*#__PURE__*/React.createElement("span", {
    className: "truncate",
    style: {
      color: C.text,
      fontSize: 13.5,
      fontWeight: 600
    }
  }, label)), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 flex-shrink-0"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onConnect(user, brokerKey),
    disabled: st?.loading,
    className: "rounded-xl px-3 py-1.5 inline-flex items-center gap-1.5",
    style: {
      background: st?.connected ? C.panel2 : C.go,
      color: st?.connected ? C.sub : C.btnText,
      fontSize: 12,
      fontWeight: 700,
      border: C.border,
      boxShadow: st?.connected ? "none" : "0 0 16px rgba(0,229,168,0.35)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "link",
    size: 12
  }), st?.connected ? "Re-auth" : "Connect"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onLoad(user, brokerKey),
    disabled: !st?.connected || st?.loading,
    className: "rounded-xl px-3 py-1.5 inline-flex items-center gap-1.5",
    style: {
      background: C.panel2,
      color: st?.connected ? C.text : C.muted,
      fontSize: 12,
      fontWeight: 700,
      border: C.border
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh",
    size: 12
  }), "Load"))), /*#__PURE__*/React.createElement("div", {
    className: "mt-1.5",
    style: {
      color: st?.error ? C.neg : C.sub,
      fontSize: 11.5
    }
  }, status));
}

/* ─── Truthifi broker card (rate-limited — shows warning) ─── */
function TruthifiCard({
  user,
  st,
  onConnect,
  onLoad
}) {
  const dot = st?.authed ? C.go : st?.connected ? C.amber : C.muted;
  const status = st?.error ? st.error : st?.loading ? "Working…" : st?.authed ? `${st.holdings?.length || 0} holdings loaded` : st?.fromCache ? `${st.holdings?.length || 0} holdings · last session` : st?.connected ? "Connected — finish login, then Load" : "Not connected";
  return /*#__PURE__*/React.createElement(Panel, {
    className: "p-4",
    style: {
      borderColor: "rgba(180,151,255,0.28)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 min-w-0"
  }, /*#__PURE__*/React.createElement(StatusDot, {
    color: dot,
    glow: st?.authed
  }), /*#__PURE__*/React.createElement("span", {
    className: "truncate",
    style: {
      color: C.text,
      fontSize: 13.5,
      fontWeight: 600
    }
  }, "Truthifi · 401k / ESOP")), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 flex-shrink-0"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onConnect(user, "truthifi"),
    disabled: st?.loading,
    className: "rounded-xl px-3 py-1.5 inline-flex items-center gap-1.5",
    style: {
      background: st?.connected ? C.panel2 : C.go,
      color: st?.connected ? C.sub : C.btnText,
      fontSize: 12,
      fontWeight: 700,
      border: C.border,
      boxShadow: st?.connected ? "none" : "0 0 16px rgba(0,229,168,0.35)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "link",
    size: 12
  }), st?.connected ? "Re-auth" : "Connect"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onLoad(user, "truthifi"),
    disabled: !st?.connected || st?.loading,
    className: "rounded-xl px-3 py-1.5 inline-flex items-center gap-1.5",
    style: {
      background: C.panel2,
      color: st?.connected ? C.text : C.muted,
      fontSize: 12,
      fontWeight: 700,
      border: C.border
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh",
    size: 12
  }), "Load"))), /*#__PURE__*/React.createElement("div", {
    className: "mt-1.5",
    style: {
      color: st?.error ? C.neg : C.sub,
      fontSize: 11.5
    }
  }, status), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 flex items-center gap-1.5 flex-wrap",
    style: {
      color: C.amber,
      fontSize: 10.5
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert",
    size: 11,
    color: C.amber
  }), "Rate limited · 5 calls/day · 25/month — Load only when needed", st?.usdInr && /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.muted
    }
  }, "· 1 USD = ₹", st.usdInr, " at last sync")));
}

/* ─── Overview ─── */
function Overview({
  total,
  allHoldings,
  a,
  proj,
  go
}) {
  const frac = proj.todayFI ? Math.min(1, total.current / proj.todayFI) : 0;
  const gainPct = total.invested ? total.pnl / total.invested * 100 : 0;
  const byClass = useMemo(() => {
    const m = {};
    for (const h of allHoldings) {
      const g = classifyHolding(h);
      if (!m[g.key]) m[g.key] = {
        ...g,
        current: 0,
        invested: 0,
        pnl: 0
      };
      m[g.key].current += h.current || 0;
      m[g.key].invested += h.invested || 0;
      m[g.key].pnl += h.absoluteReturn || 0;
    }
    return Object.values(m).filter(x => x.current > 0).sort((a, b) => b.current - a.current);
  }, [allHoldings]);
  const totalCurrent = total.current || 1;
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement(Panel, {
    className: "p-6 sm:p-7"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col sm:flex-row sm:items-center gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative flex items-center justify-center mx-auto sm:mx-0",
    style: {
      width: 152,
      height: 152,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Ring, {
    frac: frac
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: C.text,
      fontSize: 26,
      fontWeight: 700,
      lineHeight: 1
    }
  }, Math.round(frac * 100), "%"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, "to FI"))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-w-0 text-center sm:text-left"
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Total net worth"), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 font-mono",
    style: {
      color: C.text,
      fontSize: 38,
      fontWeight: 700,
      letterSpacing: "-0.02em",
      lineHeight: 1.1
    }
  }, total.current ? cr(total.current) : "—"), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 flex flex-wrap justify-center sm:justify-start gap-5"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "Invested"), /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: C.text,
      fontSize: 15,
      fontWeight: 600
    }
  }, total.invested ? cr(total.invested) : "—")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "Abs. gain"), /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: total.pnl >= 0 ? C.pos : C.neg,
      fontSize: 15,
      fontWeight: 600
    }
  }, total.pnl ? cr(total.pnl) : "—", " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12
    }
  }, "(", pct(gainPct), ")"))), total.dividends > 0 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "Dividends"), /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: C.pos,
      fontSize: 15,
      fontWeight: 600
    }
  }, cr(total.dividends)))), go && /*#__PURE__*/React.createElement("button", {
    onClick: () => go("trajectory"),
    className: "mt-4 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2",
    style: {
      background: C.go,
      color: C.btnText,
      fontWeight: 700,
      fontSize: 12.5,
      boxShadow: "0 0 20px rgba(0,229,168,0.4)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "rocket",
    size: 14
  }), " Trajectory ", proj.fiYear != null && /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.85
    }
  }, "· FI at age ", a.currentAge + proj.fiYear), " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron",
    size: 14
  }))))), byClass.length > 0 && /*#__PURE__*/React.createElement(Panel, {
    className: "p-5"
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "By asset class"), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 space-y-2.5"
  }, byClass.map(g => {
    const w = g.current / totalCurrent * 100;
    const gp = g.invested ? g.pnl / g.invested * 100 : 0;
    return /*#__PURE__*/React.createElement("div", {
      key: g.key
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between mb-1 gap-2",
      style: {
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2 min-w-0"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: 2,
        background: g.color,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "truncate",
      style: {
        color: C.text,
        fontWeight: 600
      }
    }, g.label), /*#__PURE__*/React.createElement("span", {
      className: "flex-shrink-0",
      style: {
        color: C.muted
      }
    }, w.toFixed(1), "%")), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3 font-mono flex-shrink-0"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: C.text
      }
    }, cr(g.current)), /*#__PURE__*/React.createElement("span", {
      style: {
        color: gp >= 0 ? C.pos : C.neg,
        minWidth: 52,
        textAlign: "right"
      }
    }, pct(gp)))), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 5,
        borderRadius: 99,
        background: "rgba(255,255,255,0.07)",
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        width: `${w}%`,
        background: g.color,
        borderRadius: 99,
        transition: "width 0.8s ease",
        boxShadow: `0 0 8px ${g.color}`
      }
    })));
  }))));
}

/* ─── Holdings ─── */
function HoldingGroup({
  group,
  holdings
}) {
  const [open, setOpen] = useState(true);
  const total = holdings.reduce((s, h) => ({
    invested: s.invested + (h.invested || 0),
    current: s.current + (h.current || 0),
    pnl: s.pnl + (h.absoluteReturn || 0)
  }), {
    invested: 0,
    current: 0,
    pnl: 0
  });
  const gPct = total.invested ? total.pnl / total.invested * 100 : 0;
  return /*#__PURE__*/React.createElement("div", {
    className: "rounded-3xl overflow-hidden",
    style: {
      border: C.border,
      background: C.panelSolid
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(o => !o),
    className: "w-full flex items-center justify-between gap-2 px-4 py-3.5",
    style: {
      background: C.panel2,
      borderBottom: open ? C.border : "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2.5 min-w-0"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 2,
      background: group.color,
      flexShrink: 0,
      boxShadow: `0 0 6px ${group.color}`
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "truncate",
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, group.label), /*#__PURE__*/React.createElement("span", {
    className: "flex-shrink-0",
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, holdings.length)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 font-mono flex-shrink-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13,
      fontWeight: 600
    }
  }, cr(total.current)), /*#__PURE__*/React.createElement("div", {
    style: {
      color: gPct >= 0 ? C.pos : C.neg,
      fontSize: 11
    }
  }, pct(gPct))), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron",
    size: 14,
    color: C.muted,
    style: {
      transform: open ? "rotate(90deg)" : "rotate(0deg)",
      transition: "transform 0.2s",
      flexShrink: 0
    }
  }))), open && /*#__PURE__*/React.createElement("div", null, holdings.map((h, i) => /*#__PURE__*/React.createElement(HoldingRow, {
    key: i,
    h: h,
    last: i === holdings.length - 1
  }))));
}
function HoldingRow({
  h,
  last
}) {
  const [exp, setExp] = useState(false);
  const up = (h.absoluteReturn || 0) >= 0;
  const tone = up ? C.pos : C.neg;
  const retPct = h.absoluteReturnPct;
  const metaBits = [h.broker, h.exchange, h.assetType && h.assetType !== h.exchange ? h.assetType : null].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const unitsBit = h.quantity != null && h.unitPrice != null ? `${h.quantity % 1 === 0 ? h.quantity.toFixed(0) : h.quantity.toFixed(4)} × ${inr(h.unitPrice)}` : null;
  const investedBit = h.invested ? `Inv. ${cr(h.invested)}` : null;
  const subtitle = [...metaBits, unitsBit || investedBit].filter(Boolean).join(" · ");
  const hasExtra = h.xirr != null || h.cagr != null || h.dividendEarned > 0 || unitsBit && h.invested;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderBottom: last && !exp ? "none" : C.border
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => hasExtra && setExp(o => !o),
    className: "w-full flex items-start justify-between gap-3 px-4 py-3 text-left",
    style: {
      cursor: hasExtra ? "pointer" : "default"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "min-w-0 flex-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: "truncate",
    style: {
      color: C.text,
      fontSize: 13,
      fontWeight: 600
    }
  }, h.symbol), subtitle && /*#__PURE__*/React.createElement("div", {
    className: "truncate",
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 2
    }
  }, subtitle)), /*#__PURE__*/React.createElement("div", {
    className: "text-right flex-shrink-0",
    style: {
      minWidth: 78
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: C.text,
      fontSize: 13,
      fontWeight: 700
    }
  }, h.current ? cr(h.current) : "—"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-end gap-1 font-mono",
    style: {
      color: tone,
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("span", null, retPct != null ? pct(retPct) : "—")))), exp && hasExtra && /*#__PURE__*/React.createElement("div", {
    className: "px-4 pb-3 flex flex-wrap gap-x-6 gap-y-2",
    style: {
      background: "rgba(255,255,255,0.02)",
      borderTop: C.border
    }
  }, unitsBit && h.invested && /*#__PURE__*/React.createElement("div", {
    className: "pt-2"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, "Invested"), /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: C.sub,
      fontSize: 12,
      fontWeight: 600
    }
  }, cr(h.invested))), h.xirr != null && /*#__PURE__*/React.createElement("div", {
    className: "pt-2"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, "XIRR"), /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: h.xirr >= 0 ? C.pos : C.neg,
      fontSize: 12,
      fontWeight: 600
    }
  }, pct(h.xirr))), h.cagr != null && /*#__PURE__*/React.createElement("div", {
    className: "pt-2"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, "CAGR"), /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: h.cagr >= 0 ? C.pos : C.neg,
      fontSize: 12,
      fontWeight: 600
    }
  }, pct(h.cagr))), h.dividendEarned > 0 && /*#__PURE__*/React.createElement("div", {
    className: "pt-2"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, "Dividends"), /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: C.pos,
      fontSize: 12,
      fontWeight: 600
    }
  }, cr(h.dividendEarned))), h.absoluteReturn != null && /*#__PURE__*/React.createElement("div", {
    className: "pt-2"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, "Gain"), /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: tone,
      fontSize: 12,
      fontWeight: 600
    }
  }, h.absoluteReturn >= 0 ? "+" : "", cr(h.absoluteReturn)))));
}
function Holdings({
  allHoldings,
  refreshedAt
}) {
  if (!allHoldings.length) return /*#__PURE__*/React.createElement(Panel, {
    className: "p-10 text-center"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "wallet",
    size: 28,
    color: C.muted,
    style: {
      margin: "0 auto 12px"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.sub,
      fontSize: 13.5
    }
  }, "No holdings loaded yet. Connect a broker above, finish the login, then hit Load."));
  const groups = useMemo(() => {
    const map = {};
    for (const h of allHoldings) {
      const g = classifyHolding(h);
      if (!map[g.key]) map[g.key] = {
        ...g,
        holdings: []
      };
      map[g.key].holdings.push(h);
    }
    // Multiple EPF entries (e.g. one pair per employer) are collapsed into a
    // single combined row — the per-employer breakdown isn't useful here.
    for (const g of Object.values(map)) {
      const epfs = g.holdings.filter(h => h.assetType === "EPF");
      if (epfs.length > 1) {
        const merged = mergeHoldings(epfs, "EPF");
        g.holdings = [...g.holdings.filter(h => h.assetType !== "EPF"), merged];
      }
    }
    return Object.values(map).sort((a, b) => {
      const sa = a.holdings.reduce((s, h) => s + (h.current || 0), 0);
      const sb = b.holdings.reduce((s, h) => s + (h.current || 0), 0);
      return sb - sa;
    });
  }, [allHoldings]);
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, refreshedAt && /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, "Data as of ", timeAgo(refreshedAt), " · values from broker MCP"), groups.map(g => /*#__PURE__*/React.createElement(HoldingGroup, {
    key: g.key,
    group: g,
    holdings: g.holdings
  })));
}

/* ─── Allocation ─── */
function Allocation({
  allHoldings
}) {
  const [view, setView] = useState("class");
  if (!allHoldings.length) return /*#__PURE__*/React.createElement(Panel, {
    className: "p-10 text-center"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.sub,
      fontSize: 13.5
    }
  }, "Load holdings to see allocation."));
  const byClass = useMemo(() => {
    const m = {};
    for (const h of allHoldings) {
      const g = classifyHolding(h);
      if (!m[g.key]) m[g.key] = {
        name: g.label,
        value: 0,
        color: g.color
      };
      m[g.key].value += h.current || 0;
    }
    return Object.values(m).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  }, [allHoldings]);
  const byHolding = useMemo(() => {
    const sorted = [...allHoldings].filter(h => h.current > 0).sort((a, b) => b.current - a.current);
    const top = sorted.slice(0, 9).map((h, i) => ({
      name: h.symbol,
      value: h.current,
      color: PIE[i % PIE.length]
    }));
    const rest = sorted.slice(9).reduce((s, h) => s + h.current, 0);
    if (rest > 0) top.push({
      name: "Other",
      value: rest,
      color: "#8492A8"
    });
    return top;
  }, [allHoldings]);
  const data = view === "class" ? byClass : byHolding;
  const total = data.reduce((s, x) => s + x.value, 0);
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, [["class", "By asset class"], ["holding", "By holding"]].map(([v, l]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    onClick: () => setView(v),
    className: "rounded-xl px-3 py-1.5",
    style: {
      fontSize: 12.5,
      fontWeight: 600,
      background: view === v ? C.go : C.panel2,
      color: view === v ? C.btnText : C.sub,
      border: C.border
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-2 gap-4"
  }, /*#__PURE__*/React.createElement(Panel, {
    className: "p-5"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      height: 280
    }
  }, /*#__PURE__*/React.createElement(ResponsiveContainer, null, /*#__PURE__*/React.createElement(PieChart, null, /*#__PURE__*/React.createElement(Pie, {
    data: data,
    dataKey: "value",
    nameKey: "name",
    innerRadius: 68,
    outerRadius: 110,
    paddingAngle: 2,
    stroke: "none",
    isAnimationActive: false
  }, data.map((x, i) => /*#__PURE__*/React.createElement(Cell, {
    key: i,
    fill: x.color
  }))), /*#__PURE__*/React.createElement(Tooltip, {
    content: /*#__PURE__*/React.createElement(ChartTip, {
      fmt: cr
    })
  }))))), /*#__PURE__*/React.createElement(Panel, {
    className: "p-5"
  }, /*#__PURE__*/React.createElement(Eyebrow, null, view === "class" ? "Asset class" : "Holdings", " breakdown"), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 space-y-2.5"
  }, data.map(x => {
    const w = x.value / total * 100;
    return /*#__PURE__*/React.createElement("div", {
      key: x.name
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2 mb-1"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: 2,
        background: x.color,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "flex-1 truncate",
      style: {
        color: C.sub,
        fontSize: 12.5
      }
    }, x.name), /*#__PURE__*/React.createElement("span", {
      className: "font-mono",
      style: {
        color: C.text,
        fontSize: 12.5,
        fontWeight: 600
      }
    }, cr(x.value)), /*#__PURE__*/React.createElement("span", {
      className: "font-mono",
      style: {
        color: C.muted,
        fontSize: 11,
        minWidth: 40,
        textAlign: "right"
      }
    }, w.toFixed(1), "%")), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 4,
        borderRadius: 99,
        background: "rgba(255,255,255,0.07)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        width: `${w}%`,
        background: x.color,
        borderRadius: 99,
        transition: "width 0.6s ease"
      }
    })));
  })))));
}

/* ─── Trajectory ─── */
function Trajectory({
  a,
  setA,
  proj
}) {
  const fields = [["currentAge", "Current age", 1, 18, 70], ["currentCorpus", "Current corpus (₹)", 10000, 0, 100000000], ["monthlyInvestment", "Monthly investment (₹)", 1000, 0, 1000000], ["annualStepUp", "Annual step-up (%)", 1, 0, 25], ["expectedReturn", "Expected return (%)", 0.5, 1, 20], ["inflation", "Inflation (%)", 0.5, 0, 15], ["annualExpensesToday", "Annual expenses today (₹)", 10000, 0, 10000000], ["swr", "Safe withdrawal rate (%)", 0.1, 2, 6]];
  const fi = proj.rows.find(r => proj.fiYear != null && r.t === proj.fiYear);
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-3 gap-4"
  }, /*#__PURE__*/React.createElement(Panel, {
    className: "p-5 md:col-span-1"
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Assumptions"), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 space-y-3"
  }, fields.map(([key, label, step, min, max]) => /*#__PURE__*/React.createElement("div", {
    key: key
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between",
    style: {
      fontSize: 11.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.sub
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "font-mono",
    style: {
      color: C.text
    }
  }, a[key])), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: min,
    max: max,
    step: step,
    value: a[key],
    onChange: e => setA({
      ...a,
      [key]: parseFloat(e.target.value)
    }),
    className: "w-full mt-1",
    style: {
      accentColor: C.go
    }
  }))))), /*#__PURE__*/React.createElement(Panel, {
    className: "p-5 md:col-span-2"
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Corpus vs. the moving target"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      height: 320
    },
    className: "mt-3"
  }, /*#__PURE__*/React.createElement(ResponsiveContainer, null, /*#__PURE__*/React.createElement(LineChart, {
    data: proj.rows
  }, /*#__PURE__*/React.createElement(CartesianGrid, {
    stroke: C.line,
    vertical: false
  }), /*#__PURE__*/React.createElement(XAxis, {
    dataKey: "age",
    stroke: C.muted,
    fontSize: 11
  }), /*#__PURE__*/React.createElement(YAxis, {
    stroke: C.muted,
    fontSize: 11,
    tickFormatter: cr,
    width: 72
  }), /*#__PURE__*/React.createElement(Tooltip, {
    content: /*#__PURE__*/React.createElement(ChartTip, {
      fmt: cr
    })
  }), /*#__PURE__*/React.createElement(Line, {
    type: "monotone",
    dataKey: "corpus",
    name: "Corpus",
    stroke: C.go,
    strokeWidth: 2.5,
    dot: false
  }), /*#__PURE__*/React.createElement(Line, {
    type: "monotone",
    dataKey: "fiTarget",
    name: "FI target",
    stroke: C.amber,
    strokeWidth: 2,
    strokeDasharray: "5 4",
    dot: false
  }), fi && /*#__PURE__*/React.createElement(ReferenceDot, {
    x: fi.age,
    y: fi.corpus,
    r: 5,
    fill: C.go,
    stroke: C.bg,
    strokeWidth: 2
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mt-2",
    style: {
      color: C.sub,
      fontSize: 12.5
    }
  }, proj.fiYear != null ? /*#__PURE__*/React.createElement(React.Fragment, null, "Independence at ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: C.go
    }
  }, "age ", a.currentAge + proj.fiYear), " — corpus crosses the inflation-adjusted target of ", cr(fi.fiTarget), ".") : /*#__PURE__*/React.createElement(React.Fragment, null, "Not reached within 50 years on these assumptions.")))), /*#__PURE__*/React.createElement(Panel, {
    className: "p-4 flex gap-2",
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert",
    size: 15,
    color: C.go,
    style: {
      flexShrink: 0,
      marginTop: 1
    }
  }), /*#__PURE__*/React.createElement("span", null, "A model, not a promise. Assumes steady compounding; ignores tax, sequence-of-returns risk, and crashes.")));
}

/* ─── Data Room ─── */
function DataRoom({
  user,
  brokers,
  onCall
}) {
  const [open, setOpen] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  async function run(b, name) {
    setBusy(true);
    setOpen(b + ":" + name);
    setResult(null);
    const r = await onCall(user, b, name);
    setResult(r);
    setBusy(false);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement(Panel, {
    className: "p-4 flex gap-2",
    style: {
      borderColor: "rgba(255,182,72,0.3)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert",
    size: 15,
    color: C.amber,
    style: {
      flexShrink: 0,
      marginTop: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.sub,
      fontSize: 12.5,
      lineHeight: 1.6
    }
  }, "Raw view of each broker's MCP tools. Call any tool to inspect the real field names.")), BROKERS.map(([k, label]) => {
    const tools = brokers[k]?.tools || [];
    return /*#__PURE__*/React.createElement(Panel, {
      key: k,
      className: "p-5"
    }, /*#__PURE__*/React.createElement(Eyebrow, null, label, " · tools"), !brokers[k]?.connected ? /*#__PURE__*/React.createElement("div", {
      className: "mt-2",
      style: {
        color: C.muted,
        fontSize: 12.5
      }
    }, "Connect this broker to list its tools.") : /*#__PURE__*/React.createElement("div", {
      className: "mt-3 flex flex-wrap gap-2"
    }, tools.length ? tools.map(t => /*#__PURE__*/React.createElement("button", {
      key: t,
      onClick: () => run(k, t),
      className: "rounded-xl px-3 py-1.5",
      style: {
        background: C.panel2,
        color: C.text,
        fontSize: 12,
        fontWeight: 600,
        border: C.border
      }
    }, t)) : /*#__PURE__*/React.createElement("span", {
      style: {
        color: C.muted,
        fontSize: 12.5
      }
    }, "No tools reported.")));
  }), open && /*#__PURE__*/React.createElement(Panel, {
    className: "p-5"
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Result · ", open), /*#__PURE__*/React.createElement("pre", {
    className: "mt-3 rounded-xl p-3 overflow-auto",
    style: {
      background: "#0A0B10",
      color: C.text,
      fontSize: 12,
      maxHeight: 400
    }
  }, busy ? "Calling…" : JSON.stringify(result?.json ?? result?.text ?? result, null, 2))));
}

/* ─── Family Dashboard ─── */
function FamilyDashboard({
  usersState
}) {
  const [tab, setTab] = useState("overview");
  const perUser = useMemo(() => {
    return USERS.map(([uid, name]) => {
      const holdings = Object.values(usersState[uid]?.brokers || {}).flatMap(b => b?.holdings || []);
      const total = holdings.reduce((s, h) => ({
        invested: s.invested + (h.invested || 0),
        current: s.current + (h.current || 0),
        pnl: s.pnl + (h.absoluteReturn || h.pnl || 0)
      }), {
        invested: 0,
        current: 0,
        pnl: 0
      });
      return {
        uid,
        name,
        holdings,
        total
      };
    });
  }, [usersState]);
  const allHoldings = useMemo(() => perUser.flatMap(u => u.holdings), [perUser]);
  const familyTotal = useMemo(() => perUser.reduce((s, u) => ({
    invested: s.invested + u.total.invested,
    current: s.current + u.total.current,
    pnl: s.pnl + u.total.pnl
  }), {
    invested: 0,
    current: 0,
    pnl: 0
  }), [perUser]);
  const NAV_FAM = [["overview", "Overview", "layout"], ["holdings", "Holdings", "wallet"], ["allocation", "Allocation", "pie"]];
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid sm:grid-cols-3 gap-3"
  }, /*#__PURE__*/React.createElement(Panel, {
    className: "p-4 sm:col-span-1",
    style: {
      background: "linear-gradient(135deg, rgba(0,229,168,0.14), rgba(79,168,255,0.08))"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 mb-2"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "heart",
    size: 14,
    color: C.go
  }), /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      margin: 0
    }
  }, "Family total")), /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: C.text,
      fontSize: 28,
      fontWeight: 700,
      lineHeight: 1
    }
  }, familyTotal.current ? cr(familyTotal.current) : "—"), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 font-mono",
    style: {
      color: familyTotal.pnl >= 0 ? C.pos : C.neg,
      fontSize: 12
    }
  }, familyTotal.pnl ? cr(familyTotal.pnl) : "—", " ", familyTotal.invested ? `(${pct(familyTotal.pnl / familyTotal.invested * 100)})` : "")), perUser.map(u => /*#__PURE__*/React.createElement(Panel, {
    key: u.uid,
    className: "p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 mb-2"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 99,
      background: C[u.uid] || C.go,
      flexShrink: 0,
      boxShadow: `0 0 6px ${C[u.uid] || C.go}`
    }
  }), /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      margin: 0
    }
  }, u.name)), /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: C.text,
      fontSize: 22,
      fontWeight: 700,
      lineHeight: 1
    }
  }, u.total.current ? cr(u.total.current) : "—"), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 font-mono",
    style: {
      color: u.total.pnl >= 0 ? C.pos : C.neg,
      fontSize: 12
    }
  }, u.total.pnl ? cr(u.total.pnl) : "—", " ", u.total.invested ? `(${pct(u.total.pnl / u.total.invested * 100)})` : ""), /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 4
    }
  }, u.holdings.length, " holdings")))), /*#__PURE__*/React.createElement("nav", {
    className: "no-scrollbar flex gap-1 overflow-x-auto pb-1"
  }, NAV_FAM.map(([k, l, ic]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setTab(k),
    className: "flex items-center gap-1.5 rounded-xl px-3 py-2 whitespace-nowrap flex-shrink-0",
    style: {
      fontSize: 12.5,
      fontWeight: 600,
      background: tab === k ? C.panel2 : "transparent",
      color: tab === k ? C.text : C.sub,
      border: `1px solid ${tab === k ? "rgba(255,255,255,0.12)" : "transparent"}`
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 14,
    color: tab === k ? C.go : C.muted
  }), l))), tab === "overview" && /*#__PURE__*/React.createElement(Overview, {
    total: familyTotal,
    allHoldings: allHoldings,
    a: {
      currentAge: 0
    },
    proj: {
      rows: [],
      fiYear: null,
      todayFI: 0
    },
    go: null
  }), tab === "holdings" && /*#__PURE__*/React.createElement(Holdings, {
    allHoldings: allHoldings,
    refreshedAt: null
  }), tab === "allocation" && /*#__PURE__*/React.createElement(Allocation, {
    allHoldings: allHoldings
  }));
}

/* ─── Per-user view ─── */
const USER_NAV = [["overview", "Overview", "layout"], ["holdings", "Holdings", "wallet"], ["allocation", "Allocation", "pie"], ["trajectory", "Trajectory", "rocket"], ["data", "Data", "db"]];
function UserDashboard({
  uid,
  uLabel,
  brokers,
  onConnect,
  onLoad,
  onCall
}) {
  const [tab, setTab] = useState("overview");
  const [a, setA] = useState({
    currentAge: 30,
    currentCorpus: 0,
    monthlyInvestment: 50000,
    annualStepUp: 5,
    expectedReturn: 11,
    inflation: 6,
    annualExpensesToday: 600000,
    swr: 3.5
  });
  const allHoldings = useMemo(() => Object.values(brokers || {}).flatMap(b => b?.holdings || []), [brokers]);
  const total = useMemo(() => {
    let invested = 0,
      current = 0,
      pnl = 0,
      dividends = 0;
    for (const h of allHoldings) {
      invested += h.invested || 0;
      current += h.current || 0;
      pnl += h.absoluteReturn || h.pnl || 0;
      dividends += h.dividendEarned || 0;
    }
    return {
      invested,
      current,
      pnl,
      dividends,
      totalReturn: pnl + dividends
    };
  }, [allHoldings]);
  const refreshedAt = useMemo(() => {
    const dates = Object.values(brokers || {}).map(b => b?.cachedAt).filter(Boolean);
    return dates.sort().reverse()[0] || null;
  }, [brokers]);
  useEffect(() => {
    if (total.current && a.currentCorpus === 0) setA(x => ({
      ...x,
      currentCorpus: Math.round(total.current)
    }));
  }, [total.current]);
  const proj = useMemo(() => project(a), [a]);
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid sm:grid-cols-2 gap-3"
  }, (USER_BROKERS[uid] || []).map(k => {
    if (k === "truthifi") return /*#__PURE__*/React.createElement(TruthifiCard, {
      key: k,
      user: uid,
      st: brokers?.[k],
      onConnect: onConnect,
      onLoad: onLoad
    });
    const label = BROKERS.find(([bk]) => bk === k)?.[1] || k;
    return /*#__PURE__*/React.createElement(BrokerCard, {
      key: k,
      user: uid,
      brokerKey: k,
      label: label,
      st: brokers?.[k],
      onConnect: onConnect,
      onLoad: onLoad
    });
  })), /*#__PURE__*/React.createElement("nav", {
    className: "no-scrollbar flex gap-1 overflow-x-auto pb-1"
  }, USER_NAV.map(([k, l, ic]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setTab(k),
    className: "flex items-center gap-1.5 rounded-xl px-3 py-2 whitespace-nowrap flex-shrink-0",
    style: {
      fontSize: 12.5,
      fontWeight: 600,
      background: tab === k ? C.panel2 : "transparent",
      color: tab === k ? C.text : C.sub,
      border: `1px solid ${tab === k ? "rgba(255,255,255,0.12)" : "transparent"}`
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 14,
    color: tab === k ? C.go : C.muted
  }), l))), tab === "overview" && /*#__PURE__*/React.createElement(Overview, {
    total: total,
    allHoldings: allHoldings,
    a: a,
    proj: proj,
    go: setTab
  }), tab === "holdings" && /*#__PURE__*/React.createElement(Holdings, {
    allHoldings: allHoldings,
    refreshedAt: refreshedAt
  }), tab === "allocation" && /*#__PURE__*/React.createElement(Allocation, {
    allHoldings: allHoldings
  }), tab === "trajectory" && /*#__PURE__*/React.createElement(Trajectory, {
    a: a,
    setA: setA,
    proj: proj
  }), tab === "data" && /*#__PURE__*/React.createElement(DataRoom, {
    user: uid,
    brokers: brokers || {},
    onCall: onCall
  }));
}

/* ─── App root ─── */
function App() {
  const [userTab, setUserTab] = useState("rajanish");
  const [users, setUsers] = useState({
    rajanish: {
      brokers: {}
    },
    aswini: {
      brokers: {}
    }
  });
  function patchBroker(user, broker, v) {
    setUsers(prev => ({
      ...prev,
      [user]: {
        ...prev[user],
        brokers: {
          ...(prev[user]?.brokers || {}),
          [broker]: {
            ...(prev[user]?.brokers?.[broker] || {}),
            ...v
          }
        }
      }
    }));
  }
  async function refreshStatus() {
    const s = await api.status();
    const next = {
      rajanish: {
        brokers: {}
      },
      aswini: {
        brokers: {}
      }
    };
    for (const [uid, uData] of Object.entries(s.users || {})) {
      if (!next[uid]) next[uid] = {
        brokers: {}
      };
      for (const [broker, info] of Object.entries(uData.brokers || {})) {
        next[uid].brokers[broker] = {
          connected: info.connected,
          authed: info.authed,
          tools: info.tools,
          loginUrl: info.loginUrl,
          usdInr: info.usdInr || null
        };
        if (info.cachedHoldings?.length) {
          next[uid].brokers[broker].holdings = info.cachedHoldings;
          next[uid].brokers[broker].fromCache = true;
          next[uid].brokers[broker].cachedAt = info.cachedAt;
        }
      }
    }
    setUsers(next);
  }
  useEffect(() => {
    refreshStatus().catch(() => {});
  }, []);
  const [driveRefreshing, setDriveRefreshing] = useState(false);
  const [driveError, setDriveError] = useState(null);
  async function refreshFromDrive() {
    setDriveRefreshing(true);
    setDriveError(null);
    try {
      const r = await api.refreshFromDrive();
      if (!r.ok) throw new Error(r.error || "Drive refresh failed");
      await refreshStatus();
    } catch (e) {
      setDriveError(String(e.message || e));
    } finally {
      setDriveRefreshing(false);
    }
  }
  async function connect(user, broker) {
    patchBroker(user, broker, {
      loading: true,
      error: null
    });
    try {
      const r = await api.connect(user, broker);
      if (!r.ok) throw new Error(r.error || "connect failed");
      patchBroker(user, broker, {
        connected: true,
        tools: r.tools,
        loginUrl: r.loginUrl,
        loading: false
      });
      if (r.loginUrl) window.open(r.loginUrl, "_blank", "noopener");
    } catch (e) {
      patchBroker(user, broker, {
        loading: false,
        error: String(e.message || e)
      });
    }
  }
  async function load(user, broker) {
    patchBroker(user, broker, {
      loading: true,
      error: null
    });
    try {
      const r = await api.portfolio(user, broker);
      if (r.status === 401 && r.loginUrl) {
        window.open(r.loginUrl, "_blank", "noopener");
        patchBroker(user, broker, {
          loading: false,
          error: "Login needed — finish in the new tab, then Load again."
        });
        return;
      }
      if (!r.ok) throw new Error(r.error || "load failed");
      const savedAt = r.savedAt || new Date().toISOString();
      patchBroker(user, broker, {
        authed: true,
        holdings: r.holdings || [],
        tools: r.tools || users[user]?.brokers?.[broker]?.tools || [],
        loading: false,
        fromCache: !!r.fromCache,
        cachedAt: savedAt
      });
    } catch (e) {
      patchBroker(user, broker, {
        loading: false,
        error: String(e.message || e)
      });
    }
  }
  const familyTotal = useMemo(() => {
    let current = 0;
    for (const u of Object.values(users)) {
      for (const b of Object.values(u.brokers || {})) {
        for (const h of b.holdings || []) current += h.current || 0;
      }
    }
    return current;
  }, [users]);
  const USER_TABS = [["rajanish", "Rajanish", C.rajanish], ["aswini", "Aswini", C.aswini], ["family", "Family", "linear-gradient(90deg," + C.rajanish + "," + C.aswini + ")"]];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: C.bg,
      color: C.text,
      minHeight: "100vh",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("style", null, `
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .no-scrollbar::-webkit-scrollbar{display:none}
        .no-scrollbar{scrollbar-width:none;-ms-overflow-style:none}
        input[type=range]{-webkit-appearance:none;background:rgba(255,255,255,0.09);border-radius:99px}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:99px;
          background:${C.go};box-shadow:0 0 8px rgba(0,229,168,0.6);cursor:pointer}
        input[type=range]::-moz-range-thumb{width:15px;height:15px;border:none;border-radius:99px;
          background:${C.go};box-shadow:0 0 8px rgba(0,229,168,0.6);cursor:pointer}
      `), /*#__PURE__*/React.createElement(AmbientGlow, null), /*#__PURE__*/React.createElement("div", {
    className: "relative max-w-5xl mx-auto px-4 md:px-6 py-5",
    style: {
      zIndex: 1
    }
  }, /*#__PURE__*/React.createElement("header", {
    className: "flex items-center justify-between gap-3 mb-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2.5 min-w-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl flex items-center justify-center flex-shrink-0",
    style: {
      width: 34,
      height: 34,
      background: C.go,
      boxShadow: "0 0 18px rgba(0,229,168,0.45)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "rocket",
    size: 17,
    color: C.btnText
  })), /*#__PURE__*/React.createElement("div", {
    className: "min-w-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "truncate",
    style: {
      fontWeight: 700,
      fontSize: 15
    }
  }, "Wealth Trajectory"), /*#__PURE__*/React.createElement("div", {
    className: "truncate",
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "your data · your server · no middleman"))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2.5 flex-shrink-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: "0.1em"
    }
  }, "Family"), /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: C.go,
      fontSize: 15,
      fontWeight: 700
    }
  }, familyTotal ? cr(familyTotal) : "—")), /*#__PURE__*/React.createElement("button", {
    onClick: refreshFromDrive,
    disabled: driveRefreshing,
    title: driveError || "Refresh from Google Drive cache",
    className: "rounded-xl p-2 flex items-center justify-center flex-shrink-0",
    style: {
      background: C.panel2,
      border: C.border,
      color: driveError ? C.neg : C.sub
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh",
    size: 15,
    style: driveRefreshing ? {
      animation: "spin 1s linear infinite"
    } : {}
  })))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-3 gap-2 mb-5"
  }, USER_TABS.map(([uid, label, color]) => {
    const active = userTab === uid;
    return /*#__PURE__*/React.createElement("button", {
      key: uid,
      onClick: () => setUserTab(uid),
      className: "flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5",
      style: {
        fontWeight: 700,
        fontSize: 13,
        background: active ? uid === "family" ? "linear-gradient(90deg," + C.rajanish + " 0%," + C.aswini + " 100%)" : color : C.panel2,
        color: active ? "#04070A" : C.sub,
        border: active ? "none" : C.border,
        boxShadow: active ? `0 0 20px ${uid === "family" ? "rgba(180,151,255,0.35)" : color + "66"}` : "none",
        transition: "all 0.15s ease"
      }
    }, uid === "family" ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Icon, {
      name: "heart",
      size: 14,
      color: active ? "#04070A" : C.muted
    }), label) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 7,
        height: 7,
        borderRadius: 99,
        background: active ? "rgba(4,7,10,0.5)" : color,
        flexShrink: 0
      }
    }), label));
  })), userTab === "rajanish" && /*#__PURE__*/React.createElement(UserDashboard, {
    uid: "rajanish",
    uLabel: "Rajanish",
    brokers: users.rajanish?.brokers,
    onConnect: connect,
    onLoad: load,
    onCall: (u, b, n) => api.callTool(u, b, n)
  }), userTab === "aswini" && /*#__PURE__*/React.createElement(UserDashboard, {
    uid: "aswini",
    uLabel: "Aswini",
    brokers: users.aswini?.brokers,
    onConnect: connect,
    onLoad: load,
    onCall: (u, b, n) => api.callTool(u, b, n)
  }), userTab === "family" && /*#__PURE__*/React.createElement(FamilyDashboard, {
    usersState: users
  }), /*#__PURE__*/React.createElement("footer", {
    className: "mt-8 pt-4",
    style: {
      borderTop: C.border,
      color: C.muted,
      fontSize: 11
    }
  }, "Pulled live from your connected accounts through your own backend. Values as reported by broker MCPs — for visualisation and education, not investment advice.")));
}
try {
  if (typeof Recharts === "undefined") throw new Error("Recharts didn't load — check public/vendor/");
  ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
} catch (e) {
  document.getElementById("root").innerHTML = '<div style="max-width:560px;margin:60px auto;font-family:system-ui;color:#F3F5FA">' + '<h3>Couldn\'t start</h3><pre style="white-space:pre-wrap;background:#12141C;padding:12px;border-radius:8px;color:#FF6178">' + (e && e.message ? e.message : e) + '</pre></div>';
}