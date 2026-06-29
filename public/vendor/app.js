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
  ReferenceDot
} = Recharts;

/* palette carried over from the original dashboard */
const C = {
  bg: "#F5F7FB",
  panel: "#FFFFFF",
  panel2: "#EEF2F8",
  line: "#E2E8F1",
  text: "#13203A",
  sub: "#5A6884",
  muted: "#94A1B8",
  go: "#0E9E86",
  goSoft: "#E2F4F0",
  goInk: "#06463B",
  amber: "#C77E0A",
  neg: "#DC4B5C",
  pos: "#0E9E86",
  btnText: "#FFFFFF"
};
const PIE = ["#2A8FD6", "#0FB39A", "#7C6BE0", "#E0A310", "#5566E0", "#E0566B", "#8492A8", "#C77E0A", "#19B7A6", "#9B8CFF"];

/* ---- tiny inline-svg icon set (no icon lib dependency) ---- */
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
  target: "M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0 M12 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"
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

/* ---- format ---- */
const inr = v => "₹" + new Intl.NumberFormat("en-IN").format(Math.round(v || 0));
const cr = v => {
  const n = Math.abs(v || 0);
  if (n >= 1e7) return "₹" + (v / 1e7).toFixed(2) + " Cr";
  if (n >= 1e5) return "₹" + (v / 1e5).toFixed(2) + " L";
  return inr(v);
};
const pctS = v => (v > 0 ? "+" : "") + (v || 0).toFixed(1) + "%";

/* ---- FIRE engine (pure client math, unchanged in spirit) ---- */
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

/* ---- small UI ---- */
function Panel({
  children,
  style,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "rounded-2xl " + className,
    style: {
      background: C.panel,
      border: `1px solid ${C.line}`,
      boxShadow: "0 1px 2px rgba(19,32,58,0.04)",
      ...style
    }
  }, children);
}
function Eyebrow({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "uppercase",
    style: {
      color: C.muted,
      fontSize: 11,
      letterSpacing: "0.16em",
      fontWeight: 700
    }
  }, children);
}
function Stat({
  label,
  value,
  sub,
  tone
}) {
  return /*#__PURE__*/React.createElement(Panel, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.sub,
      fontSize: 12.5
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 font-mono",
    style: {
      color: tone || C.text,
      fontSize: 22,
      fontWeight: 600
    }
  }, value), sub && /*#__PURE__*/React.createElement("div", {
    className: "mt-0.5",
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, sub));
}
function Ring({
  frac,
  size = 168
}) {
  const r = size / 2 - 12,
    circ = 2 * Math.PI * r,
    f = Math.max(0, Math.min(1, frac || 0));
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      transform: "rotate(-90deg)"
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: C.panel2,
    strokeWidth: 10
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: C.go,
    strokeWidth: 10,
    strokeLinecap: "round",
    strokeDasharray: circ,
    strokeDashoffset: circ * (1 - f),
    style: {
      transition: "stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)"
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
    className: "rounded-lg px-3 py-2",
    style: {
      background: C.panel,
      border: `1px solid ${C.line}`,
      boxShadow: "0 4px 12px rgba(19,32,58,0.1)",
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

/* ---- api ---- */
const api = {
  status: () => fetch("/api/status").then(r => r.json()),
  connect: b => fetch(`/api/${b}/connect`, {
    method: "POST"
  }).then(r => r.json().then(j => ({
    ok: r.ok,
    ...j
  }))),
  portfolio: b => fetch(`/api/${b}/portfolio`).then(r => r.json().then(j => ({
    ok: r.ok,
    status: r.status,
    ...j
  }))),
  tools: b => fetch(`/api/${b}/tools`).then(r => r.json()),
  callTool: (b, name, args) => fetch(`/api/${b}/tool`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name,
      arguments: args || {}
    })
  }).then(r => r.json())
};
const BROKERS = [["kite", "Zerodha · Kite"], ["indmoney", "INDmoney"]];

/* ---- connection card ---- */
function BrokerCard({
  k,
  label,
  st,
  onConnect,
  onLoad
}) {
  const dot = st?.authed ? C.go : st?.connected ? C.amber : C.muted;
  const cacheLabel = st?.fromCache && st?.cachedAt ? ` · cached ${new Date(st.cachedAt).toLocaleDateString()}` : "";
  const status = st?.error ? st.error : st?.loading ? "Working…" : st?.authed ? `Loaded · ${st.holdings?.length || 0} holdings` : st?.fromCache ? `${st.holdings?.length || 0} holdings (last session${cacheLabel})` : st?.connected ? "Connected · finish login, then Load" : "Not connected";
  return /*#__PURE__*/React.createElement(Panel, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 99,
      background: dot
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.text,
      fontSize: 13.5,
      fontWeight: 600
    }
  }, label)), /*#__PURE__*/React.createElement("div", {
    className: "mt-1",
    style: {
      color: st?.error ? C.neg : C.sub,
      fontSize: 12
    }
  }, status), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onConnect(k),
    disabled: st?.loading,
    className: "rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5",
    style: {
      background: st?.connected ? C.panel2 : C.go,
      color: st?.connected ? C.sub : C.btnText,
      fontSize: 12.5,
      fontWeight: 600,
      border: `1px solid ${st?.connected ? C.line : C.go}`
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "link",
    size: 13
  }), " ", st?.connected ? "Re-auth" : "Connect"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onLoad(k),
    disabled: !st?.connected || st?.loading,
    className: "rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5",
    style: {
      background: C.panel,
      color: st?.connected ? C.text : C.muted,
      fontSize: 12.5,
      fontWeight: 600,
      border: `1px solid ${C.line}`
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh",
    size: 13
  }), " Load")));
}

/* ---- tabs ---- */
function Overview({
  total,
  a,
  proj,
  go
}) {
  const frac = proj.todayFI ? a.currentCorpus / proj.todayFI : 0;
  const tiles = [{
    label: "Net worth",
    value: cr(total.current),
    sub: "current market value"
  }, {
    label: "Invested",
    value: cr(total.invested),
    sub: "total cost basis"
  }, {
    label: "Abs. gain (excl. div)",
    value: cr(total.pnl),
    sub: total.invested ? pctS(total.pnl / total.invested * 100) : "—",
    tone: total.pnl >= 0 ? C.pos : C.neg
  }, {
    label: "Dividends earned",
    value: cr(total.dividends),
    sub: "across all holdings",
    tone: C.pos
  }, {
    label: "Total return (incl. div)",
    value: cr(total.totalReturn),
    sub: total.invested ? pctS(total.totalReturn / total.invested * 100) : "—",
    tone: total.totalReturn >= 0 ? C.pos : C.neg
  }, {
    label: "Holdings",
    value: String(total.count),
    sub: "across connected brokers"
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-5"
  }, /*#__PURE__*/React.createElement(Panel, {
    className: "p-6 md:p-7",
    style: {
      background: `linear-gradient(135deg,#FFFFFF,${C.panel2})`
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col md:flex-row md:items-center gap-7"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative flex items-center justify-center",
    style: {
      width: 168,
      height: 168,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Ring, {
    frac: frac
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: C.go,
      fontSize: 30,
      fontWeight: 700
    }
  }, Math.round(frac * 100), "%"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "to independence"))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Current position"), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 font-mono",
    style: {
      color: C.text,
      fontSize: 40,
      fontWeight: 700,
      letterSpacing: "-0.02em",
      lineHeight: 1
    }
  }, cr(total.current)), /*#__PURE__*/React.createElement("div", {
    className: "mt-2",
    style: {
      color: C.sub,
      fontSize: 14,
      maxWidth: 470,
      lineHeight: 1.55
    }
  }, "Live from your connected accounts. At today's pace, escape velocity arrives at", " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.go,
      fontWeight: 700
    }
  }, proj.fiYear != null ? `age ${a.currentAge + proj.fiYear}` : "—"), "."), /*#__PURE__*/React.createElement("button", {
    onClick: () => go("trajectory"),
    className: "mt-4 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2",
    style: {
      background: C.go,
      color: C.btnText,
      fontWeight: 600,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "rocket",
    size: 15
  }), " Open trajectory ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron",
    size: 15
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 lg:grid-cols-3 gap-3"
  }, tiles.map(t => /*#__PURE__*/React.createElement(Stat, {
    key: t.label,
    ...t
  }))));
}
function MetricCell({
  label,
  value,
  tone
}) {
  if (value == null) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      letterSpacing: "0.05em"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: tone || C.text,
      fontSize: 12,
      fontWeight: 600
    }
  }, value));
}
function HoldingRow({
  h
}) {
  const up = (h.pnl || 0) >= 0;
  const tone = up ? C.pos : C.neg;
  const fmt = (v, isRate) => v == null ? "—" : isRate ? pctS(v) : cr(v);
  return /*#__PURE__*/React.createElement("div", {
    className: "rounded-lg px-3 py-2.5 space-y-1.5",
    style: {
      background: C.panel2
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-w-0"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13.5,
      fontWeight: 600
    }
  }, h.symbol), /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, [h.assetType, h.broker, h.exchange].filter(Boolean).join(" · ") || h.source)), /*#__PURE__*/React.createElement("div", {
    className: "font-mono text-right",
    style: {
      color: C.text,
      fontSize: 13,
      fontWeight: 600
    }
  }, h.current != null ? cr(h.current) : "—"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1 font-mono",
    style: {
      color: tone,
      fontSize: 13,
      minWidth: 72,
      justifyContent: "flex-end"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: up ? "up" : "down",
    size: 13
  }), h.absoluteReturnPct != null ? pctS(h.absoluteReturnPct) : "—")), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-x-5 gap-y-0.5 pl-0.5"
  }, /*#__PURE__*/React.createElement(MetricCell, {
    label: "Invested",
    value: h.invested != null ? cr(h.invested) : null
  }), /*#__PURE__*/React.createElement(MetricCell, {
    label: "Abs. gain",
    value: h.absoluteReturn != null ? cr(h.absoluteReturn) : null,
    tone: tone
  }), h.xirr != null && /*#__PURE__*/React.createElement(MetricCell, {
    label: "XIRR",
    value: pctS(h.xirr),
    tone: h.xirr >= 0 ? C.pos : C.neg
  }), h.benchmarkXirr != null && /*#__PURE__*/React.createElement(MetricCell, {
    label: "Benchmark XIRR",
    value: pctS(h.benchmarkXirr)
  }), h.cagr != null && /*#__PURE__*/React.createElement(MetricCell, {
    label: "CAGR",
    value: pctS(h.cagr),
    tone: h.cagr >= 0 ? C.pos : C.neg
  }), h.dividendEarned > 0 && /*#__PURE__*/React.createElement(MetricCell, {
    label: "Dividends",
    value: cr(h.dividendEarned),
    tone: C.pos
  }), h.totalReturn != null && h.dividendEarned > 0 && /*#__PURE__*/React.createElement(MetricCell, {
    label: "Total return (incl. div)",
    value: cr(h.totalReturn),
    tone: tone
  }), h.totalReturnPct != null && h.dividendEarned > 0 && /*#__PURE__*/React.createElement(MetricCell, {
    label: "Return incl. div %",
    value: pctS(h.totalReturnPct),
    tone: tone
  }), h.returnWithoutDividends != null && h.dividendEarned > 0 && /*#__PURE__*/React.createElement(MetricCell, {
    label: "Return excl. div %",
    value: pctS(h.returnWithoutDividends),
    tone: tone
  })));
}
function Holdings({
  brokers
}) {
  const loaded = BROKERS.filter(([k]) => brokers[k]?.holdings?.length);
  if (!loaded.length) return /*#__PURE__*/React.createElement(Empty, {
    msg: "No holdings loaded yet. Connect a broker above, finish the login, then hit Load."
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-5"
  }, loaded.map(([k, label]) => /*#__PURE__*/React.createElement(Panel, {
    key: k,
    className: "p-5"
  }, /*#__PURE__*/React.createElement(Eyebrow, null, label, brokers[k]?.fromCache ? " · cached" : ""), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 space-y-2"
  }, brokers[k].holdings.map((h, i) => /*#__PURE__*/React.createElement(HoldingRow, {
    key: i,
    h: h
  }))))));
}
function Allocation({
  holdings
}) {
  if (!holdings.length) return /*#__PURE__*/React.createElement(Empty, {
    msg: "Load holdings to see allocation."
  });
  const top = [...holdings].filter(h => h.current).sort((a, b) => b.current - a.current);
  const data = top.slice(0, 9).map((h, i) => ({
    name: h.symbol,
    value: h.current,
    color: PIE[i % PIE.length]
  }));
  const rest = top.slice(9).reduce((s, h) => s + h.current, 0);
  if (rest > 0) data.push({
    name: "Other",
    value: rest,
    color: "#B8C2D4"
  });
  const total = data.reduce((s, x) => s + x.value, 0);
  return /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement(Panel, {
    className: "p-5"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      height: 300
    }
  }, /*#__PURE__*/React.createElement(ResponsiveContainer, null, /*#__PURE__*/React.createElement(PieChart, null, /*#__PURE__*/React.createElement(Pie, {
    data: data,
    dataKey: "value",
    nameKey: "name",
    innerRadius: 72,
    outerRadius: 118,
    paddingAngle: 2,
    stroke: "none"
  }, data.map((x, i) => /*#__PURE__*/React.createElement(Cell, {
    key: i,
    fill: x.color
  }))), /*#__PURE__*/React.createElement(Tooltip, {
    content: /*#__PURE__*/React.createElement(ChartTip, {
      fmt: cr
    })
  }))))), /*#__PURE__*/React.createElement(Panel, {
    className: "p-5"
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "By holding"), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 space-y-2"
  }, data.map(x => {
    const w = x.value / total * 100;
    return /*#__PURE__*/React.createElement("div", {
      key: x.name,
      className: "flex items-center gap-3"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 9,
        height: 9,
        borderRadius: 2,
        background: x.color,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "flex-1",
      style: {
        color: C.sub,
        fontSize: 13
      }
    }, x.name), /*#__PURE__*/React.createElement("span", {
      className: "font-mono",
      style: {
        color: C.text,
        fontSize: 13
      }
    }, cr(x.value)), /*#__PURE__*/React.createElement("span", {
      className: "font-mono text-right",
      style: {
        color: C.muted,
        fontSize: 12,
        width: 46
      }
    }, w.toFixed(1), "%"));
  }))));
}
function Trajectory({
  a,
  setA,
  proj
}) {
  const fields = [["currentAge", "Current age", 1, 18, 70], ["currentCorpus", "Current corpus (₹)", 10000, 0, 100000000], ["monthlyInvestment", "Monthly investment (₹)", 1000, 0, 1000000], ["annualStepUp", "Annual step-up (%)", 1, 0, 25], ["expectedReturn", "Expected return (%)", 0.5, 1, 20], ["inflation", "Inflation (%)", 0.5, 0, 15], ["annualExpensesToday", "Annual expenses today (₹)", 10000, 0, 10000000], ["swr", "Safe withdrawal rate (%)", 0.1, 2, 6]];
  const fi = proj.rows.find(r => proj.fiYear != null && r.t === proj.fiYear);
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-3 gap-3"
  }, /*#__PURE__*/React.createElement(Panel, {
    className: "p-5 md:col-span-1"
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Assumptions"), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 space-y-3"
  }, fields.map(([key, label, step, min, max]) => /*#__PURE__*/React.createElement("div", {
    key: key
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between",
    style: {
      fontSize: 12
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
    width: 70
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
    stroke: "#fff",
    strokeWidth: 2
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mt-2",
    style: {
      color: C.sub,
      fontSize: 13
    }
  }, proj.fiYear != null ? /*#__PURE__*/React.createElement(React.Fragment, null, "Independence at ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: C.go
    }
  }, "age ", a.currentAge + proj.fiYear), " — corpus crosses the inflation-adjusted target of ", cr(fi.fiTarget), ".") : /*#__PURE__*/React.createElement(React.Fragment, null, "Not reached within 50 years on these assumptions. Try a higher contribution or return.")))), /*#__PURE__*/React.createElement(Panel, {
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
  }), /*#__PURE__*/React.createElement("span", null, "A model, not a promise. It assumes steady compounding and ignores tax, sequence-of-returns risk, and crashes. Use it to compare scenarios, not predict the future.")));
}
function DataRoom({
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
    const r = await onCall(b, name);
    setResult(r);
    setBusy(false);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-5"
  }, /*#__PURE__*/React.createElement(Panel, {
    className: "p-4 flex gap-2",
    style: {
      borderColor: "#EAD9B0"
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
  }, "This is the raw view of what each broker's MCP server actually exposes for your account. If the dashboard maps a number wrong, call the matching tool here, see the real field names, and adjust the hint lists in ", /*#__PURE__*/React.createElement("b", null, "mcp.js"), ".")), BROKERS.map(([k, label]) => {
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
      className: "rounded-lg px-3 py-1.5",
      style: {
        background: C.panel2,
        color: C.text,
        fontSize: 12,
        fontWeight: 600,
        border: `1px solid ${C.line}`
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
    className: "mt-3 rounded-lg p-3 overflow-auto",
    style: {
      background: C.panel2,
      color: C.text,
      fontSize: 12,
      maxHeight: 380
    }
  }, busy ? "Calling…" : JSON.stringify(result?.json ?? result?.text ?? result, null, 2))));
}
function Empty({
  msg
}) {
  return /*#__PURE__*/React.createElement(Panel, {
    className: "p-8 text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rounded-full flex items-center justify-center mx-auto",
    style: {
      width: 48,
      height: 48,
      background: C.goSoft
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "wallet",
    size: 20,
    color: C.go
  })), /*#__PURE__*/React.createElement("div", {
    className: "mt-3",
    style: {
      color: C.sub,
      fontSize: 13.5,
      maxWidth: 420,
      margin: "12px auto 0",
      lineHeight: 1.6
    }
  }, msg));
}
const NAV = [["overview", "Overview", "layout"], ["holdings", "Holdings", "wallet"], ["allocation", "Allocation", "pie"], ["trajectory", "Trajectory", "rocket"], ["data", "Data", "db"]];
function App() {
  const [tab, setTab] = useState("overview");
  const [brokers, setBrokers] = useState({}); // key -> {connected,authed,loginUrl,tools,holdings,raw,loading,error}
  const [a, setA] = useState({
    currentAge: 32,
    currentCorpus: 0,
    monthlyInvestment: 50000,
    annualStepUp: 5,
    expectedReturn: 11,
    inflation: 6,
    annualExpensesToday: 600000,
    swr: 3.5
  });
  const patch = (k, v) => setBrokers(b => ({
    ...b,
    [k]: {
      ...(b[k] || {}),
      ...v
    }
  }));
  useEffect(() => {
    api.status().then(s => {
      const next = {};
      for (const [k, info] of Object.entries(s.brokers || {})) {
        next[k] = {
          connected: info.connected,
          authed: info.authed,
          tools: info.tools,
          loginUrl: info.loginUrl
        };
        // Restore last known holdings from server cache so the page isn't blank on refresh.
        if (info.cachedHoldings?.length) {
          next[k].holdings = info.cachedHoldings;
          next[k].fromCache = true;
          next[k].cachedAt = info.cachedAt;
        }
      }
      setBrokers(next);
    }).catch(() => {});
  }, []);
  async function connect(k) {
    patch(k, {
      loading: true,
      error: null
    });
    try {
      const r = await api.connect(k);
      if (!r.ok) throw new Error(r.error || "connect failed");
      patch(k, {
        connected: true,
        tools: r.tools,
        loginUrl: r.loginUrl,
        loading: false
      });
      if (r.loginUrl) window.open(r.loginUrl, "_blank", "noopener");
    } catch (e) {
      patch(k, {
        loading: false,
        error: String(e.message || e)
      });
    }
  }
  async function load(k) {
    patch(k, {
      loading: true,
      error: null
    });
    try {
      const r = await api.portfolio(k);
      if (r.status === 401 && r.loginUrl) {
        window.open(r.loginUrl, "_blank", "noopener");
        patch(k, {
          loading: false,
          error: "Login needed — finish in the new tab, then Load again."
        });
        return;
      }
      if (!r.ok) throw new Error(r.error || "load failed");
      patch(k, {
        authed: true,
        holdings: r.holdings || [],
        raw: r.raw || {},
        tools: r.tools || brokers[k]?.tools || [],
        loading: false
      });
    } catch (e) {
      patch(k, {
        loading: false,
        error: String(e.message || e)
      });
    }
  }
  const allHoldings = useMemo(() => Object.values(brokers).flatMap(b => b?.holdings || []), [brokers]);
  const total = useMemo(() => {
    let invested = 0,
      current = 0,
      pnl = 0,
      dividends = 0,
      count = 0;
    for (const h of allHoldings) {
      invested += h.invested || 0;
      current += h.current || 0;
      pnl += h.absoluteReturn || h.pnl || 0;
      dividends += h.dividendEarned || 0;
      count++;
    }
    const totalReturn = pnl + dividends;
    return {
      invested,
      current,
      pnl: pnl || current - invested,
      dividends,
      totalReturn,
      count
    };
  }, [allHoldings]);

  // seed FIRE corpus from live total once it lands
  useEffect(() => {
    if (total.current && a.currentCorpus === 0) setA(x => ({
      ...x,
      currentCorpus: Math.round(total.current)
    }));
  }, [total.current]);
  const proj = useMemo(() => project(a), [a]);
  async function callTool(b, name) {
    return api.callTool(b, name);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: C.bg,
      color: C.text,
      minHeight: "100vh"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-6xl mx-auto px-4 md:px-6 py-5"
  }, /*#__PURE__*/React.createElement("header", {
    className: "flex items-center justify-between mb-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rounded-lg flex items-center justify-center",
    style: {
      width: 32,
      height: 32,
      background: C.go
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "rocket",
    size: 17,
    color: C.btnText
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 15
    }
  }, "Wealth Trajectory"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "your data · your server · no middleman"))), /*#__PURE__*/React.createElement("div", {
    className: "hidden sm:block text-right"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "NET WORTH"), /*#__PURE__*/React.createElement("div", {
    className: "font-mono",
    style: {
      color: C.go,
      fontSize: 16,
      fontWeight: 600
    }
  }, total.current ? cr(total.current) : "—"))), /*#__PURE__*/React.createElement("div", {
    className: "grid sm:grid-cols-2 gap-3 mb-5"
  }, BROKERS.map(([k, label]) => /*#__PURE__*/React.createElement(BrokerCard, {
    key: k,
    k: k,
    label: label,
    st: brokers[k],
    onConnect: connect,
    onLoad: load
  }))), /*#__PURE__*/React.createElement("nav", {
    className: "flex gap-1.5 mb-6 overflow-x-auto pb-1"
  }, NAV.map(([k, l, ic]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setTab(k),
    className: "flex items-center gap-2 rounded-lg px-3.5 py-2 whitespace-nowrap",
    style: {
      fontSize: 13,
      fontWeight: 600,
      background: tab === k ? C.panel : "transparent",
      color: tab === k ? C.text : C.sub,
      border: `1px solid ${tab === k ? C.line : "transparent"}`
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 15,
    color: tab === k ? C.go : C.muted
  }), " ", l))), tab === "overview" && /*#__PURE__*/React.createElement(Overview, {
    total: total,
    a: a,
    proj: proj,
    go: setTab
  }), tab === "holdings" && /*#__PURE__*/React.createElement(Holdings, {
    brokers: brokers
  }), tab === "allocation" && /*#__PURE__*/React.createElement(Allocation, {
    holdings: allHoldings
  }), tab === "trajectory" && /*#__PURE__*/React.createElement(Trajectory, {
    a: a,
    setA: setA,
    proj: proj
  }), tab === "data" && /*#__PURE__*/React.createElement(DataRoom, {
    brokers: brokers,
    onCall: callTool
  }), /*#__PURE__*/React.createElement("footer", {
    className: "mt-8 pt-4",
    style: {
      borderTop: `1px solid ${C.line}`,
      color: C.muted,
      fontSize: 11.5
    }
  }, "Pulled live from your connected accounts through your own backend. For visualisation and education — not investment advice.")));
}
try {
  if (typeof Recharts === "undefined") throw new Error("Recharts didn't load — check that all vendor files are present in public/vendor/.");
  ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
} catch (e) {
  document.getElementById("root").innerHTML = '<div style="max-width:560px;margin:60px auto;font-family:system-ui;color:#13203A">' + '<h3>Couldn\u2019t start the dashboard</h3><pre style="white-space:pre-wrap;background:#EEF2F8;padding:12px;border-radius:8px;color:#DC4B5C">' + (e && e.message ? e.message : e) + '</pre></div>';
}