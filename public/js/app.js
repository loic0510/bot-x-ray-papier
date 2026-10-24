import { lineChart, bars, hbars, spark } from "./chart.js";

const $ = (s) => document.querySelector(s);
const main = $("#main");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

async function api(path, body) {
  const r = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json", "x-bx": "1" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

// ---------- formatting ----------
const usd = (v) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const a = Math.abs(v) < 0.5 ? 0 : Math.abs(v);
  const s =
    a >= 1e6
      ? `$${(a / 1e6).toFixed(2)}M`
      : a >= 1e4
        ? `$${Math.round(a / 1e3)}k`
        : `$${Math.round(a).toLocaleString("en-GB")}`;
  return v < 0 && a > 0 ? `−${s}` : s;
};
const signed = (v) => (Number.isFinite(v) && v >= 0 ? `+${usd(v)}` : usd(v));
const pct = (v, dp = 1) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const s = Math.abs(100 * v).toFixed(dp);
  return `${v < 0 && Number(s) !== 0 ? "−" : ""}${s}%`;
};
const cents = (v) => (Number.isFinite(v) ? `${(100 * v).toFixed(1)}¢` : "–");
const MON = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const nice = (d) => {
  if (!d) return "–";
  const [y, m, dd] = d.split("-").map(Number);
  return `${dd} ${MON[m - 1]} ${y}`;
};
const monthName = (m) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const short = (w) => (w ? `${w.slice(0, 6)}…${w.slice(-4)}` : "");
const time = (t) =>
  new Date(t * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const sup = (s) => esc(s).replace(/10\^(\d+)/, "10<sup>$1</sup>");
const stat = (value, label) =>
  `<div class="stat"><b>${value}</b><span>${label}</span></div>`;

// ---------- state and routing ----------
const WALLET_TABS = ["wallet", "does", "luck", "working", "convert"];
const state = {
  tab: "wallet",
  wallet: null,
  report: null,
  job: null,
  steps: [],
  error: null,
  presets: null,
  timers: [],
};
const saved = (() => {
  try {
    return localStorage.getItem("bx.wallet");
  } catch {
    return null;
  }
})();

function route() {
  const [, tab = "wallet", w] = location.hash.split("/");
  if (tab !== state.tab) window.scrollTo(0, 0);
  state.tab = tab;
  for (const a of document.querySelectorAll("nav.tabs a"))
    a.classList.toggle("on", a.dataset.tab === tab);
  if (w && decodeURIComponent(w) !== state.wallet)
    return runXray(decodeURIComponent(w));
  render();
}
const go = (tab, wallet = state.wallet) => {
  location.hash = `#/${tab}${wallet && WALLET_TABS.includes(tab) ? `/${encodeURIComponent(wallet)}` : ""}`;
};
for (const a of document.querySelectorAll("nav.tabs a"))
  a.addEventListener("click", (e) => {
    e.preventDefault();
    go(a.dataset.tab);
  });

$("#who").addEventListener("submit", (e) => {
  e.preventDefault();
  const w = $("#wallet").value.trim();
  if (w) {
    const tab = WALLET_TABS.includes(state.tab)
      ? state.tab
      : "wallet";
    location.hash = `#/${tab}/${encodeURIComponent(w)}`;
  }
});

function clearTimers() {
  state.timers.forEach(clearTimeout);
  state.timers = [];
}
const later = (fn, ms) => state.timers.push(setTimeout(fn, ms));

async function runXray(wallet) {
  state.wallet = wallet;
  state.report = null;
  state.error = null;
  state.steps = [];
  $("#wallet").value = wallet;
  try {
    localStorage.setItem("bx.wallet", wallet);
  } catch {
    /* private window */
  }
  render();
  try {
    const { job } = await api("/api/xray", { wallet });
    state.job = job;
    const poll = async () => {
      if (state.job !== job) return;
      const j = await api(`/api/xray/${job}`);
      state.steps = j.steps;
      if (j.error) state.error = j.error.message;
      if (j.report) state.report = j.report;
      if (!j.done) setTimeout(poll, 600);
      render();
    };
    poll();
  } catch (e) {
    state.error = e.message;
    render();
  }
}

// ---------- screens ----------
function render() {
  clearTimers();
  const t = state.tab;
  if (t === "winning") return winning();
  if (t === "live") return liveScreen();
  if (t === "strategy") return strategy();
  if (t === "claude") return claude();
  if (!state.wallet) return welcome();
  if (state.error)
    return (main.innerHTML = `<div class="empty"><p class="kicker">Couldn't x-ray ${esc(state.wallet)}</p><h1>${esc(state.error)}</h1><p>Try a username from a Polymarket profile page, or the wallet address (it starts 0x and is 42 characters long).</p></div>`);
  if (!state.report) return progress();
  (({ wallet: walletScreen, does, luck, working, convert: convertScreen })[t] || walletScreen)(
    state.report,
  );
}

function welcome() {
  main.innerHTML = `<div class="empty">
    <p class="kicker">Bot X-Ray</p>
    <h1>Reverse engineer any Polymarket bot from its public trades.</h1>
    <p class="sub">Paste a wallet or a username above. Every trade on Polymarket is public, so you can see exactly what a bot did, whether it was skill or luck, and whether it still works. No account needed.</p>
    <p class="hand" style="margin-top:28px">try one of the three from the video ↑</p>
  </div>`;
}

function progress() {
  const last = state.steps.at(-1);
  main.innerHTML = `<div class="progress"><p class="kicker">X-raying ${esc(state.wallet)}</p>
    <p class="hand">${esc(last?.msg || "Starting")}…</p>
    <p class="small">${state.steps
      .slice(0, -1)
      .map((s) => esc(s.msg))
      .join(" · ")}</p>
    <p class="small muted">A fast bot takes a few seconds. A slow one can take 30 seconds the first time, while its trades and every market's result load. After that it's cached.</p></div>`;
}

function header(r, kicker) {
  return `<p class="kicker">${esc(kicker)} · ${esc(r.name)} <span class="muted" title="${esc(r.wallet)}">${short(r.wallet)}</span></p>`;
}

function walletScreen(r) {
  const s = r.series,
    life = s.lifetime;
  const headline = s.stopped
    ? `${r.name} made ${usd(life.pnl)}, then stopped on ${nice(s.main?.end ?? s.lastTrade)}.`
    : `${r.name} has made ${usd(life.pnl)} since ${nice(s.first)}, and it's still trading.`;
  main.innerHTML = `${header(r, "Wallet")}
    <h1>${esc(headline)}</h1>
    <p class="sub">${usd(life.volume)} traded, ${pct(life.perDollar)} kept on every dollar. ${life.trades.toLocaleString("en-GB")} trades. Fees paid ${usd(life.fees)}.</p>
    <div class="hero" id="curve"></div>
    <div class="stats">
      ${stat(usd(life.pnl), "Lifetime P&L, after fees")}
      ${stat(usd(life.volume), "Traded")}
      ${stat(pct(life.perDollar), "Profit per $ traded")}
      ${stat(usd(life.fees), "Fees paid")}
      ${stat(usd(life.income), "Rebates and rewards")}
      ${stat(r.leaderboard ? usd(r.leaderboard.pnl) : "–", "Leaderboard P&L (settled trades only)")}
    </div>
    <h2>Month by month</h2>
    <div class="tablewrap"><table><tr><th>Month</th><th>P&amp;L</th><th>Traded</th><th>Profit per $</th><th>Fees</th><th>Days trading</th></tr>
    ${s.months
      .filter((m) => m.volume >= 1000 || Math.abs(m.pnl) >= 1000)
      .map(
        (m) =>
          `<tr><td>${monthName(m.month)}</td><td>${signed(m.pnl)}</td><td>${usd(m.volume)}</td><td>${pct(m.perDollar)}</td><td>${usd(m.fees)}</td><td>${m.days}</td></tr>`,
      )
      .join("")}</table></div>
    ${r.ruleEffects.length ? `<h2>What the rule changes did</h2><div class="tablewrap"><table><tr><th>Date</th><th class="l">Change</th><th>Average day, 2 weeks before</th><th>2 weeks after</th></tr>${r.ruleEffects.map((e) => `<tr><td>${nice(e.day)}</td><td class="l">${esc(e.label)}${e.stoppedDaysAfter !== null ? `<span class="note-inline">stopped ${e.stoppedDaysAfter} days later</span>` : ""}</td><td>${e.before === null ? "–" : signed(e.before)}</td><td>${e.after === null ? "no trading" : signed(e.after)}</td></tr>`).join("")}</table></div>` : ""}
    <p class="foot">P&amp;L is Polymarket's daily series for this wallet (data-api.polymarket.com/v2/user-pnl): it includes fees, rebates and rewards, and open positions at their current price. The leaderboard shows settled trades only, so it reads a little different. Blue marks are the dates Polymarket changed the rules for crypto markets.</p>`;
  const pts = s.curve.map(([d, v]) => [Date.parse(d), v]);
  const circles = [];
  if (s.stopped && s.main) {
    const p = s.curve.find(([d]) => d === s.main.end);
    if (p)
      circles.push({
        x: Date.parse(p[0]),
        y: p[1],
        label: "stopped",
        dx: 20,
        dy: 34,
      });
  }
  lineChart($("#curve"), {
    series: [{ points: pts }],
    fmt: usd,
    marks: r.series.ruleChanges.map((c) => ({
      x: Date.parse(c.day),
      label: c.short,
    })),
    circles,
  });
}

function does(r) {
  const b = r.behaviour;
  const rx = b.reaction
    ? Object.entries(b.reaction).sort(
        (a, z) => (z[0] === "btc") - (a[0] === "btc") || z[1].buys - a[1].buys,
      )[0]
    : null;
  const COIN = { btc: "Bitcoin", eth: "Ether", sol: "Solana", xrp: "XRP" };
  main.innerHTML = `${header(r, "What it does")}
    <p><span class="pill blue">${esc(r.tagLabel)}</span></p>
    <p class="verdict">${esc(r.verdict)}</p>
    <p class="small" style="margin-top:10px">From ${b.trades.toLocaleString("en-GB")} trades between ${esc(r.sample?.start.slice(0, 16).replace("T", " "))} and ${esc(r.sample?.end.slice(0, 16).replace("T", " "))} UTC (${esc(r.sample?.why)}).</p>
    <div class="cols" style="margin-top:20px">
      <div><h2>Did it follow Binance?</h2>${rx ? `<p class="small">Buys in the 5- and 15-minute ${COIN[rx[0]]} markets right after ${COIN[rx[0]]} moved more than 0.03% on Binance. A coin flip is 50%.</p><div id="react"></div>` : `<p class="small">${esc(b.reactionError || b.reactionNote || "No short Up or Down trades in the sample.")}</p>`}</div>
      <div><h2>Which markets</h2><div id="kinds"></div></div>
    </div>
    <div class="stats">
      ${stat(`${b.bothSides} of ${b.markets}`, "Markets where it bought both sides")}
      ${stat(b.pair ? `${Math.round(100 * b.pair.lo)}–${Math.round(100 * b.pair.hi)}¢` : "–", "What a pair cost it (Up + Down)")}
      ${stat(b.balance !== null ? (b.balance >= 0.85 ? "Near-equal" : "Uneven") : "–", "Amounts on each side")}
      ${stat(b.sells === 0 ? "Never" : pct(b.sells / b.trades), "How often it sold")}
      ${stat(b.settled.markets ? signed(b.settled.pnl) : "–", `Sample result (${b.settled.markets} settled markets)`)}
      ${stat(rx && Number.isFinite(rx[1].edgeCents) ? `${rx[1].edgeCents.toFixed(1)}¢` : "–", "Paid below a fair price from Binance, a share")}
    </div>
    ${r.byPrice.length ? `<h2>P&amp;L by the price it paid</h2><p class="small">Every buy in a market that has ended, grouped by its price. A price is the market's chance: 54¢ means 54%.</p><div class="tablewrap"><table><tr><th>Price paid</th><th>Buys</th><th>Spent</th><th>Average price</th><th>Won</th><th>P&amp;L</th><th>Return</th></tr>${r.byPrice.map((x) => `<tr><td>${x.label}</td><td>${x.buys.toLocaleString("en-GB")}</td><td>${usd(x.spent)}</td><td>${Math.round(100 * x.avgPrice)}¢</td><td>${pct(x.won)}</td><td>${signed(x.pnl)}</td><td>${pct(x.ret)}</td></tr>`).join("")}</table></div>` : ""}
    <h2>The markets in the sample</h2>
    <div class="tablewrap"><table><tr><th>Market</th><th>Trades</th><th class="l">Bought</th><th>Pair</th><th>Winner</th><th>P&amp;L</th></tr>
    ${b.table
      .slice(0, 15)
      .map(
        (m) =>
          `<tr><td title="${esc(m.slug)}">${esc((m.title || m.slug || "").slice(0, 60))}</td><td>${m.trades}</td><td class="l">${m.sides.map((s) => `${Math.round(s.shares).toLocaleString("en-GB")} ${esc(s.side)} @ ${Math.round(100 * s.avg)}¢`).join(", ")}</td><td>${m.pair ? `${Math.round(100 * m.pair)}¢` : ""}</td><td>${esc(m.winner || "open")}</td><td>${m.pnl === null ? "" : signed(m.pnl)}</td></tr>`,
      )
      .join("")}</table></div>
    <p class="foot">Trades from data-api.polymarket.com/activity, results from gamma-api.polymarket.com, prices from Binance's 1-second candles. Fair price: a normal model on Binance's move since the window opened. Polymarket settles on Chainlink's price, so it carries a small basis error.</p>`;
  if (rx) {
    const g = rx[1].byLag;
    const r10 = g.find((x) => x.lag === 10);
    hbars($("#react"), {
      data: g.map((x) => ({
        label: `last ${x.lag} seconds`,
        sub: `${x.buys.toLocaleString("en-GB")} buys`,
        value: x.share ?? 0,
      })),
      max: 1,
      fmt: (v) => pct(v, 0),
      ref: 0.5,
      refLabel: "coin flip",
      circle: r10
        ? {
            label: "last 10 seconds",
            note: r10.share >= 0.6 ? "it trades the lag" : "ignores Binance",
          }
        : null,
    });
  }
  hbars($("#kinds"), {
    data: b.kinds.slice(0, 4).map((k) => ({
      label: k.label
        .replace(/ \(.*\)$/, "")
        .replace("5- and 15-minute crypto Up or Down", "5/15-min Up or Down")
        .replace(
          "hourly and daily crypto Up or Down",
          "Hourly/daily Up or Down",
        ),
      value: k.share,
    })),
    max: 1,
    fmt: (v) => pct(v, 0),
  });
}

function luck(r) {
  const l = r.luck;
  const bigNum =
    l.streak && l.streak.days >= 15 ? sup(l.streak.odds) : pct(l.greenShare, 0);
  const bigLabel =
    l.streak && l.streak.days >= 15
      ? `the chance of ${l.streak.days} heads in a row: its longest run of green days`
      : "of its full trading days were green";
  const lotto =
    l.streak?.lotto >= 2
      ? `Rarer than winning the UK Lotto jackpot ${Math.floor(l.streak.lotto)} times running.`
      : "";
  main.innerHTML = `${header(r, "Skill or luck?")}
    <div class="big">${bigNum}</div>
    <p class="small">${esc(bigLabel)}${lotto ? ` <span class="note-inline">${esc(lotto.charAt(0).toLowerCase() + lotto.slice(1))}</span>` : ""}</p>
    <h1 style="margin-top:22px">${sup(l.verdict)}</h1>
    <div class="hero" id="daily"></div>
    <div class="stats">
      ${stat(`${l.green} of ${l.days}`, "Full trading days that were green")}
      ${stat(l.streak ? `${l.streak.days} days` : "–", l.streak ? `Longest green run, ${nice(l.streak.from)} to ${nice(l.streak.to)}` : "Longest green run")}
      ${stat(l.sharpe.toFixed(1), "Sharpe ratio, a year")}
      ${stat(l.tStat.toFixed(1), "t-stat of the average day")}
      ${stat(l.psr === null ? "–" : pct(l.psr, 2), "Probabilistic Sharpe (chance the edge is real)")}
      ${stat(l.worstDay ? signed(l.worstDay.pnl) : "–", l.worstDay ? `Worst day, ${nice(l.worstDay.day)}` : "Worst day")}
      ${stat(usd(l.maxDrawdown), "Biggest drop from a high")}
      ${stat(sup(l.greenChance), "A coin flip gives this many green days")}
    </div>
    <p class="foot">${esc(l.note)} Sharpe uses 365 days a year, because crypto markets trade every day. The probabilistic Sharpe ratio allows for skew and fat tails. These checks say the edge was real while it ran. They can't say it will last: the next screen covers that.</p>`;
  const data = r.daily.map(([x, y]) => ({ x, y }));
  const hl = [];
  if (l.worstDay && Math.abs(l.worstDay.pnl) > 0)
    hl.push({
      x: l.worstDay.day,
      label: `worst day ${signed(l.worstDay.pnl)}`,
      dx: 22,
      dy: l.worstDay.pnl < 0 ? 6 : -14,
    });
  bars($("#daily"), { data, fmt: usd, highlight: hl, xFmt: nice });
}

function working(r) {
  const s = r.series;
  const months = s.months.filter((m) => m.perDollar !== null);
  main.innerHTML = `${header(r, "Still working?")}
    <h1>${esc(r.still)}</h1>
    <h2>Profit on every dollar traded, by month</h2>
    <div class="hero" id="trend"></div>
    <div class="tablewrap"><table><tr><th>Window</th><th>P&amp;L</th><th>Traded</th><th>Profit per $</th><th>Fees</th><th>Trades</th></tr>
    ${s.recent.map((w) => `<tr><td>Last ${w.days} days</td><td>${signed(w.pnl)}</td><td>${usd(w.volume)}</td><td>${pct(w.perDollar)}</td><td>${usd(w.fees)}</td><td>${w.trades.toLocaleString("en-GB")}</td></tr>`).join("")}
    <tr><td><b>Lifetime</b></td><td><b>${signed(s.lifetime.pnl)}</b></td><td>${usd(s.lifetime.volume)}</td><td>${pct(s.lifetime.perDollar)}</td><td>${usd(s.lifetime.fees)}</td><td>${s.lifetime.trades.toLocaleString("en-GB")}</td></tr></table></div>
    <h2>Fees against profit</h2>
    <div id="fees" style="max-width:720px"></div>
    <p class="foot">Profit per dollar is the month's P&amp;L over the dollars it traded. Months with very little trading are left out of the chart. ${s.stopped ? "" : "This month's numbers are still moving, and rebates for it may not be paid yet."}</p>`;
  if (months.length) {
    const data = months.map((m) => ({ x: m.month, y: m.perDollar }));
    const last = data.at(-1);
    bars($("#trend"), {
      data,
      fmt: (v) => pct(v, 1),
      xFmt: monthName,
      height: 240,
      highlight: s.stopped
        ? []
        : [{ x: last.x, label: "now", dx: -24, dy: -24, anchor: "end" }],
    });
  }
  const before = s.lifetime.tradePnl;
  hbars($("#fees"), {
    data: [
      { label: "Made before fees", value: Math.max(before, 0) },
      { label: "Fees paid", value: s.lifetime.fees, grey: true },
      { label: "Kept", value: Math.max(s.lifetime.pnl, 0) },
    ],
    fmt: usd,
    circle:
      s.lifetime.feeShare !== null && s.lifetime.feeShare > 0.3
        ? {
            label: "Fees paid",
            note: `fees took ${pct(s.lifetime.feeShare, 0)}`,
          }
        : null,
  });
}

const STATUS = { built: ["Built in, runs on paper", "blue"], claude: ["Claude builds it", ""], no: ["Doesn't convert", "grey"] };
function convertScreen(r) {
  const v = r.convert;
  if (!v) return (main.innerHTML = `${header(r, "Trade it with a broker")}<p class="sub">Run the x-ray again to see the conversion.</p>`);
  const pick = state.convertTarget && v.targets[state.convertTarget] ? state.convertTarget : v.best;
  const t = v.targets[pick];
  const order = Object.keys(v.targets).sort((a, b) => ["built", "claude", "no"].indexOf(v.targets[a].status) - ["built", "claude", "no"].indexOf(v.targets[b].status));
  const any = order.some((k) => v.targets[k].status !== "no");
  main.innerHTML = `${header(r, "Trade it with a broker")}
    <h1>${esc(r.name)} traded Polymarket's yes-or-no markets. ${any ? "Here's how its trick converts to markets a broker offers." : "Its trick has no broker version."}</h1>
    <p class="sub"><b>On Polymarket:</b> ${esc(v.idea)}</p>
    <ul class="small" style="margin:6px 0 0;padding-left:18px">${v.polymarket.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="cards" style="margin-top:22px">
      ${order.map((k) => { const x = v.targets[k]; const [lab, cls] = STATUS[x.status]; return `<button class="target ${k === pick ? "on" : ""}" data-k="${k}"><b>${esc(x.label)}</b><span class="small">${esc(x.who)}</span><span class="pill ${cls}">${lab}</span></button>`; }).join("")}
    </div>
    <div class="cols" style="margin-top:8px">
      <div>
        <h2>${esc(t.label)}: ${{ built: "built in", claude: "Claude builds it", no: "doesn't convert" }[t.status]}</h2>
        ${t.status === "no" ? `<p>${esc(t.why)}</p>` : `<p class="small">${esc(t.instrument)}</p><ol class="rules">${t.rules.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        <h2>What's lost in the conversion</h2><ul class="rules">${t.lost.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`}
      </div>
      <div>
        ${t.status === "built" ? `<h2>Who builds it</h2><p>Bot X-Ray already runs this on paper. <a href="#/strategy">Open the Strategy screen</a> and turn on ${pick === "kalshi" ? "Kalshi" : "ETF options"}.</p>` : ""}
        ${t.status === "claude" ? `<h2>Who builds it: Claude</h2><p class="small">Bot X-Ray doesn't ship this version. Paste this into Claude Code in the bot-x-ray folder and Claude writes it as a plug-in that runs on paper on the Strategy screen, inside the same risk limits.</p><pre class="cmd" id="cprompt">${esc(t.prompt)}</pre><div class="row"><button class="btn ghost" id="ccopy">Copy the prompt</button><span class="small" id="ccopied"></span></div>` : ""}
        ${t.status === "no" ? `<h2>Where it does convert</h2><p class="small">${order.filter((k) => v.targets[k].status !== "no").map((k) => esc(v.targets[k].label)).join(", ") || "Nowhere a broker offers."}</p>` : ""}
      </div>
    </div>
    <div class="card" style="margin-top:26px;max-width:900px">
      <p class="hand" style="margin:0 0 6px">who does the converting</p>
      <p style="margin:0">Bot X-Ray ships two conversions and runs them on paper: coinman2's "price it like an option" loop on ETF option spreads and on Kalshi. Every other conversion on this page is written by Claude, from these rules, as a plug-in in <code>lib/strategy/custom</code>. Nothing trades real money until you connect your own broker and arm it yourself.</p>
    </div>
    <p class="foot">Numbers in the rules come from ${esc(r.name)}'s own trades in the x-ray sample. A conversion keeps the idea; the market, the fees, the hours and the speed all change, which is why each one starts on paper.</p>`;
  for (const b of document.querySelectorAll("button.target"))
    b.onclick = () => {
      state.convertTarget = b.dataset.k;
      render();
    };
  if ($("#ccopy"))
    $("#ccopy").onclick = async () => {
      try {
        await navigator.clipboard.writeText($("#cprompt").textContent);
        $("#ccopied").textContent = "Copied";
      } catch {
        $("#ccopied").textContent = "Select the text and copy it";
      }
    };
}

const lbView = (() => {
  try {
    return JSON.parse(localStorage.getItem("bx.lb")) || {};
  } catch {
    return {};
  }
})();

async function winning() {
  const v = { period: "MONTH", limit: "15", show: "all", sort: "pnl", ...lbView };
  const PERIOD = { WEEK: "this week", MONTH: "this month", ALL: "all time" };
  main.innerHTML = `<p class="kicker">Who's winning now</p>
    <h1>The top crypto earners on Polymarket, what each one does, and whether luck could explain it.</h1>
    <p class="sub">Each wallet is tagged from its latest trades. Its daily P&amp;L gets the same skill-or-luck check as the x-ray: how often would flipping a coin give that many green days? Click a row to x-ray it.</p>
    <div class="row" style="margin:18px 0 6px">
      <select id="lp" class="chip"><option value="WEEK">This week</option><option value="MONTH">This month</option><option value="ALL">All time</option></select>
      <select id="ll" class="chip"><option value="15">Top 15</option><option value="50">Top 50</option></select>
      <select id="lw" class="chip"><option value="all">Every wallet</option><option value="better">Better than a coin flip</option><option value="edge">Only edges luck can't explain</option></select>
      <select id="ls" class="chip"><option value="pnl">Sort by P&amp;L</option><option value="skill">Sort by least likely to be luck</option></select>
    </div>
    <div id="lb" class="progress"><p class="hand">Reading the leaderboard…</p></div>`;
  const ctl = { lp: "period", ll: "limit", lw: "show", ls: "sort" };
  for (const [id, k] of Object.entries(ctl)) {
    $(`#${id}`).value = v[k];
    $(`#${id}`).onchange = (e) => {
      v[k] = e.target.value;
      try {
        localStorage.setItem("bx.lb", JSON.stringify(v));
        Object.assign(lbView, v);
      } catch { /* private window */ }
      clearTimers();
      draw();
    };
  }
  const EDGE_PILL = { edge: "blue", probably: "", luck: "grey", few: "grey" };
  const draw = async (refresh = false) => {
    if (state.tab !== "winning") return;
    let s;
    try {
      s = await api(`/api/leaderboard?period=${v.period}&limit=${v.limit}${refresh ? "&refresh=1" : ""}`);
    } catch (e) {
      $("#lb").innerHTML = `<p class="err">${esc(e.message)}</p>`;
      return;
    }
    const busy = s.status && !["Done", "Failed"].includes(s.status);
    const all = s.rows || [];
    let rows = all.filter((x) => (v.show === "edge" ? x.edge === "edge" : v.show === "better" ? x.edge === "edge" || x.edge === "probably" : true));
    if (v.sort === "skill") rows = [...rows].sort((a, b) => (a.luck?.log10Chance ?? 0) - (b.luck?.log10Chance ?? 0) || (b.luck?.tStat ?? 0) - (a.luck?.tStat ?? 0));
    const edges = all.filter((x) => x.edge === "edge").length;
    const better = all.filter((x) => x.edge === "edge" || x.edge === "probably").length;
    const fast = all.filter((x) => ["speed", "maker", "pair", "updown"].includes(x.tag)).length;
    $("#lb").className = "";
    $("#lb").innerHTML = `${busy ? `<p class="hand">${esc(s.status)}: ${s.done ?? 0} of ${s.total ?? v.limit}…</p>` : `<p class="small">${esc(s.error || `Top ${all.length} crypto earners ${PERIOD[v.period]}, updated ${new Date(s.finishedAt).toLocaleTimeString("en-GB")}.`)} <a href="#" id="lbr">Refresh</a></p>`}
      ${all.length && !busy ? `<p class="hand">${edges} of ${all.length} show an edge luck can't explain · ${better} beat a coin flip · ${fast} trade the short Up or Down markets</p>` : ""}
      <div class="tablewrap"><table><tr><th>#</th><th class="l">Wallet</th><th>P&amp;L ${PERIOD[v.period]}</th><th class="l">Looks like</th><th class="l">Skill or luck</th><th>Green days</th><th title="How often flipping a coin gives that many green days">Coin-flip odds</th><th title="Buys after a Binance move that were on the side of the move">Follows Binance</th><th title="Fees as a share of what it traded">Fees</th><th class="l">Profit per $ by month</th></tr>
      ${rows.map((x) => `<tr class="click" data-w="${esc(x.wallet)}" data-n="${esc(x.name)}"><td>${x.rank}</td><td class="l">${esc(/^0x[0-9a-fA-F]{20,}/.test(x.name) ? short(x.name) : x.name)}</td><td>${signed(x.pnl)}</td><td class="l"><span class="pill ${x.tag === "speed" ? "blue" : x.tag === "quiet" || x.tag === "other" ? "grey" : ""}">${esc(x.tagLabel)}</span></td><td class="l"><span class="pill ${EDGE_PILL[x.edge] ?? "grey"}">${esc(x.edgeLabel || "–")}</span></td><td>${x.luck ? `${x.luck.green} of ${x.luck.days}` : "–"}</td><td>${x.luck ? (x.luck.log10Chance > -0.3 ? "often" : sup(x.luck.chance.replace("1 in ", "1 in "))) : "–"}</td><td>${x.followsBinance === null || x.followsBinance === undefined ? "–" : pct(x.followsBinance, 0)}</td><td>${pct(x.feeRate, 2)}</td><td class="l">${spark((x.trend || []).map((t) => t.perDollar))} <span class="small">${(x.trend || []).map((t) => pct(t.perDollar, 1)).join(" → ")}</span></td></tr>`).join("")}</table></div>
      ${!busy && all.length && !rows.length ? `<p class="small">None of these ${all.length} wallets pass that filter. Try all time, or the top 50.</p>` : ""}
      <p class="foot">From Polymarket's crypto leaderboard (by P&amp;L) and each wallet's public trades. "Skill or luck" checks the full trading days of its main run: a real edge means a coin flip would give that many green days less than once in a million tries and the average day is far from zero (t-stat over 4); probably real means less than once in a hundred, or an average day clearly above zero (t-stat over 2.5). Plenty of green days can still come from a strategy that loses big on its red ones, so open the wallet before trusting a label. "Looks like" is a guess from a few hours of trades. Follows Binance: of its buys right after Bitcoin moved on Binance, the share on the side of the move (50% is a coin flip). Fees: what it paid as a share of what it traded.</p>`;
    for (const tr of document.querySelectorAll("tr.click")) tr.onclick = () => (location.hash = `#/luck/${encodeURIComponent(tr.dataset.n && !tr.dataset.n.startsWith("0x") ? tr.dataset.n : tr.dataset.w)}`);
    const rf = $("#lbr");
    if (rf)
      rf.onclick = (e) => {
        e.preventDefault();
        draw(true);
      };
    if (busy) later(draw, 1500);
  };
  draw();
}

async function liveScreen() {
  main.innerHTML = `<p class="kicker">Live gap, paper mode</p><div id="lv"></div>`;
  const draw = async () => {
    if (state.tab !== "live") return;
    const s = await api("/api/live").catch((e) => ({
      error: e.message,
      rows: [],
      paper: [],
    }));
    const sm = s.summary;
    const running = s.running;
    const last = s.rows?.at(-1);
    $("#lv").innerHTML =
      `<h1>${running ? "Watching Bitcoin on Binance and Polymarket's 15‑minute market, every second." : "Is the gap the bots lived on still there? Watch it live."}</h1>
      <p class="sub">${running ? esc(s.window?.title || "") : 'Once a second this reads Bitcoin on Binance and Polymarket\'s order book, prices the market the simple way the threads describe, and logs every "bargain" that model sees as a $10 paper trade. Nothing is sent to Polymarket.'}</p>
      <div class="row" style="margin:16px 0">${running ? `<button class="btn ghost" id="stop">Stop</button><span class="small">Runs until ${new Date(s.endsAt).toLocaleTimeString("en-GB")}${s.error ? ` · <span class="err">${esc(s.error)}</span>` : ""}</span>` : `<button class="btn" id="go">Start a 20-minute check</button><span class="small">Busiest during the US stock market open, when Bitcoin moves most.</span>`}</div>
      ${s.rows?.length ? `<div class="hero" id="lchart"></div>` : ""}
      ${
        sm && sm.seconds
          ? `<div class="stats">
        ${stat(sm.seconds.toLocaleString("en-GB"), `Seconds watched, ${sm.windows} market${sm.windows === 1 ? "" : "s"}`)}
        ${stat(pct(sm.bargainShare.any, 0), "Seconds the simple model saw a 'bargain' after fees")}
        ${stat(sm.pair.minAfterFees ? `$${sm.pair.minAfterFees.toFixed(3)}` : "–", "Cheapest Up + Down, after taker fees")}
        ${stat(sm.pair.underOneAfterFees, "Seconds a pair cost under $1 after fees")}
        ${stat(sm.marketVolVsModel ? `${sm.marketVolVsModel.toFixed(2)}×` : "–", "How much more movement the market prices than the model")}
        ${stat(
          sm.lag[0]?.corr !== null && sm.lag[0]
            ? sm.lag
                .slice(0, 3)
                .map((x) => (x.corr === null ? "–" : x.corr.toFixed(2)))
                .join(" / ")
            : "–",
          "Polymarket vs Binance moves, 0 / 1 / 2 s later",
        )}
      </div>`
          : ""
      }
      ${
        s.paper?.length
          ? `<h2>The model's bargains, as $10 paper trades</h2><p class="small">${sm.paper.settled} settled: ${sm.paper.won} won, paper P&amp;L ${signed(sm.paper.pnl)} on ${usd(sm.paper.staked)}.</p>
        <div class="tablewrap"><table><tr><th>Time</th><th class="l">Market</th><th>Side</th><th>Paid</th><th>Model's fair price</th><th>Result</th><th>P&amp;L</th></tr>
        ${s.paper.map((p) => `<tr><td>${time(p.t)}</td><td class="l">${esc(p.slug.replace("btc-updown-15m-", "BTC 15-min, "))}</td><td>${p.side}</td><td>${cents(p.price)}</td><td>${cents(p.fair)}</td><td>${p.result || "open"}${p.result && p.final === false ? "*" : ""}</td><td>${p.pnl === undefined ? "" : signed(p.pnl)}</td></tr>`).join("")}</table></div>`
          : ""
      }
      <p class="foot">Fair price: a normal model on Binance's move since the window opened, with Binance's last 1,000 seconds of volatility, the way the X threads describe it. Taker fee: Polymarket's crypto curve, 0.07 × p × (1 − p) a share. When the model sees a bargain most of the time, the model is wrong: real bargains are taken in under a second. The markets settle on Chainlink, not Binance. * Settled on its final price: Polymarket marks a market closed a while after it ends.</p>`;
    if ($("#go"))
      $("#go").onclick = async () => {
        await api("/api/live/start", { minutes: 20 });
        later(draw, 1200);
      };
    if ($("#stop"))
      $("#stop").onclick = async () => {
        await api("/api/live/stop", {});
        draw();
      };
    if (s.rows?.length) {
      const rows = s.rows.filter((r) => r.Up.ask && r.Up.bid).slice(-300);
      // A new market opens every 15 minutes: show the last one until the new one has a minute of data.
      let win = rows.filter((r) => r.start === last.start);
      if (win.length < 60) {
        const prev = rows.filter((r) => r.start < last.start);
        if (prev.length > win.length) win = prev.filter((r) => r.start === prev.at(-1).start);
      }
      lineChart($("#lchart"), {
        series: [
          {
            points: win.map((r) => [r.t * 1000, r.fairUp]),
            color: "#9A958C",
            width: 2,
          },
          {
            points: win.map((r) => [r.t * 1000, (r.Up.ask + r.Up.bid) / 2]),
            width: 2.6,
          },
        ],
        still: true,
        yMin: 0,
        yMax: 1,
        height: 300,
        fmt: (v) => `${Math.round(v * 100)}¢`,
        xFmt: (v) =>
          new Date(v).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        circles:
          win.length > 5
            ? [
                {
                  x: win.at(-1).t * 1000,
                  y: win.at(-1).fairUp,
                  r: 10,
                  label: "the simple model",
                  dx: -14,
                  dy: -18,
                  anchor: "end",
                },
              ]
            : [],
      });
    }
    if (running) later(draw, 1000);
  };
  draw();
}

async function strategy() {
  main.innerHTML = `<p class="kicker">Strategy · paper mode</p><div id="st"><p class="hand">Loading…</p></div>`;
  const draw = async () => {
    if (state.tab !== "strategy") return;
    let s;
    try {
      s = await api("/api/strategy");
    } catch (e) {
      $("#st").innerHTML = `<p class="err">${esc(e.message)}</p>`;
      return;
    }
    const c = s.config,
      st = s.stats,
      scan = s.scan,
      br = s.broker;
    const signals = scan
      ? scan.ladders
          .flatMap((l) =>
            l.contracts.filter((x) => x.signal).map((x) => ({ l, x })),
          )
          .sort((a, z) => z.x.best.edge - a.x.best.edge)
      : [];
    const closeStr = (t) =>
      new Date(t * 1000).toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    $("#st").innerHTML =
      `<h1>The loop that's still running: price it like an option, buy the cheap side, hold to the end.</h1>
      <p class="sub">coinman2's loop, converted from Polymarket to markets you can trade: Kalshi's Bitcoin and Ether markets, and option spreads on the Bitcoin and Ether ETFs. Every ${c.everyMinutes} minutes it prices each "above this price by this date" contract from the live price and how much the coin usually moves, then buys the side priced too low by at least ${Math.round(100 * c.minEdge)}¢ after fees. It only buys sides priced ${Math.round(100 * c.band[0])}–${Math.round(100 * c.band[1])}¢ (coinman2 lost money below 20¢) and skips a market when its own volatility disagrees with the market's by a lot (the trap from the live check). It never sells.</p>
      <div class="row" style="margin:18px 0">
        <span class="pill ${br.armed ? "blue" : ""}">${br.armed ? `ARMED for live orders until ${new Date(br.armedUntil).toLocaleString("en-GB")}` : "Paper"}</span>
        <label class="toggle"><input type="checkbox" id="run" ${c.running ? "checked" : ""}/> Scanning every ${c.everyMinutes} minutes</label>
        <label class="toggle"><input type="checkbox" id="mk" ${c.markets.kalshi ? "checked" : ""}/> Kalshi</label>
        <label class="toggle"><input type="checkbox" id="mo" ${c.markets.options ? "checked" : ""}/> ETF options</label>
        <span class="small">$${c.stake} a trade</span>
        <span class="spacer"></span>
        <button class="btn" id="scan">Scan now</button>
      </div>
      <div class="stats">
        ${stat(st.open, "Open positions")}
        ${stat(usd(st.atRisk), "Paper money at risk")}
        ${stat(st.closed, "Settled")}
        ${stat(st.closed ? `${st.won} of ${st.closed}` : "–", "Won")}
        ${stat(st.closed ? signed(st.pnl) : "–", "Paper P&L")}
        ${stat(st.closed ? signed(st.expectedPnl) : "–", "What the model expected on those")}
      </div>
      <h2>Last scan ${scan ? `<span class="small">${new Date(scan.at).toLocaleTimeString("en-GB")} · ${scan.ladders.length} markets · ${scan.ladders.reduce((n, l) => n + l.contracts.length, 0)} contracts</span>` : ""}</h2>
      ${
        scan
          ? `${scan.notes.map((n) => `<p class="small">${esc(n)}</p>`).join("")}
        ${signals.length ? `<p class="hand">${signals.length} contract${signals.length === 1 ? "" : "s"} priced too low by the model</p>` : `<p class="small">Nothing priced too low by ${Math.round(100 * c.minEdge)}¢ or more right now. Most scans look like this.</p>`}
        ${
          signals.length
            ? `<div class="tablewrap"><table><tr><th class="l">Contract</th><th class="l">Where</th><th>Closes</th><th>Buy</th><th>Costs, with fees</th><th>Model's fair price</th><th>Edge</th></tr>${signals
                .slice(0, 12)
                .map(
                  ({ l, x }) =>
                    `<tr><td class="l">${esc(x.label)}</td><td class="l">${l.venue === "kalshi" ? "Kalshi" : "ETF options"}</td><td>${closeStr(l.closes)}</td><td>${x.best.side === "yes" ? "Yes (above)" : "No (below)"}</td><td>${cents(x.best.cost)}</td><td>${cents(x.best.fair)}</td><td>${cents(x.best.edge)}</td></tr>`,
                )
                .join("")}</table></div>`
            : ""
        }
        <h2>Markets read</h2><div class="tablewrap"><table><tr><th class="l">Market</th><th>Closes</th><th>Price</th><th>Contracts</th><th>Model vol</th><th>Market's vol</th><th class="l">Status</th></tr>
        ${scan.ladders.map((l) => `<tr><td class="l">${l.venue === "kalshi" ? `Kalshi ${l.coin.toUpperCase()}` : `${esc(l.symbol)} options`}</td><td>${closeStr(l.closes)}</td><td>${l.venue === "kalshi" ? usd(l.S) : `$${l.S.toFixed(2)}`}</td><td>${l.contracts.length}</td><td>${pct(l.sigma, 0)}</td><td>${pct(l.marketVol, 0)}</td><td class="l">${l.volOk ? `${l.contracts.filter((x) => x.signal).length} to buy` : `<span class="muted">skipped: ${l.ratio ? `model vol ${l.ratio.toFixed(2)}× the market's` : "no market vol"}</span>`}</td></tr>`).join("")}</table></div>`
          : `<p class="small">The first scan runs a few seconds after the app starts. Press Scan now to run one.</p>`
      }
      <h2>Your plug-ins</h2>
      ${scan?.custom?.length ? `<p class="small">Conversions Claude wrote for your broker (lib/strategy/custom). They run on paper in this same loop, inside the same limits.</p><div class="tablewrap"><table><tr><th class="l">Plug-in</th><th class="l">Converted from</th><th class="l">For</th><th class="l">Last scan</th></tr>${scan.custom.map((m) => `<tr><td class="l">${esc(m.title)}</td><td class="l">${esc(m.from || "–")}</td><td class="l">${esc(m.target || "–")}</td><td class="l">${m.error ? `<span class="err">${esc(m.error)}</span>` : m.off ? "switched off" : `${m.signals.length} to buy`}</td></tr>`).join("")}</table></div>` : `<p class="small">None yet. Every other bot converts on its "Trade it with a broker" tab: Claude writes that version here as a plug-in, and it runs on paper next to this one.</p>`}
      ${s.open.length ? `<h2>Open positions</h2><div class="tablewrap"><table><tr><th class="l">Contract</th><th>Side</th><th>Paid</th><th>Fair then</th><th>Stake</th><th>Closes</th></tr>${s.open.map((p) => `<tr><td class="l">${esc(p.label)}</td><td>${p.side}</td><td>${cents(p.cost)}</td><td>${cents(p.fair)}</td><td>${usd(p.stake)}</td><td>${closeStr(p.closes)}</td></tr>`).join("")}</table></div>` : ""}
      ${s.closed.length ? `<h2>Settled</h2><div class="tablewrap"><table><tr><th class="l">Contract</th><th>Side</th><th>Paid</th><th>Paid out</th><th>P&amp;L</th></tr>${s.closed.map((p) => `<tr><td class="l">${esc(p.label)}</td><td>${p.side}</td><td>${cents(p.cost)}</td><td>${cents(p.paid)}</td><td>${signed(p.pnl)}</td></tr>`).join("")}</table></div>` : ""}
      <h2>Your broker</h2>
      <div class="card" style="max-width:820px">
        <p style="margin-top:0"><b>${esc(br.note)}</b></p>
        <p class="small">Where you can trade these: Kalshi's Bitcoin and Ether price markets are for US residents and the other countries Kalshi accepts. The ETF option spreads need an options account with a broker that offers US-listed options where you live. Check what your account allows before you connect it.</p>
        <p class="small">Keys found: ${br.keysFound ? "yes" : "no"} · Adapter: ${esc(br.adapter)}${br.stopped ? " · <b>Stop is on</b>" : ""}. Arming happens only in your own terminal, with <code>node scripts/arm.js</code>.</p>
        ${br.armed ? `<div class="row"><button class="btn ghost" id="disarm">Disarm</button><button class="btn" id="halt">Stop everything</button></div>` : ""}
      </div>
      <p class="foot">Paper fills are at the quoted ask plus fees: Kalshi's taker fee, or $${c.optionsCommission.toFixed(2)} a contract a leg for options. Option quotes are CBOE's free ones, 15 minutes late, so live fills would differ. Nothing here promises a profit, and the side you buy can go to zero.</p>`;
    const set = async (patch) => {
      await api("/api/strategy/config", patch);
      draw();
    };
    $("#run").onchange = (e) => set({ running: e.target.checked });
    $("#mk").onchange = (e) =>
      set({
        markets: { kalshi: e.target.checked, options: c.markets.options },
      });
    $("#mo").onchange = (e) =>
      set({ markets: { kalshi: c.markets.kalshi, options: e.target.checked } });
    $("#scan").onclick = async (e) => {
      e.target.disabled = true;
      e.target.textContent = "Scanning…";
      await api("/api/strategy/scan", {}).catch((x) => alert(x.message));
      draw();
    };
    if ($("#disarm"))
      $("#disarm").onclick = async () => {
        await api("/api/broker/disarm", {});
        draw();
      };
    if ($("#halt"))
      $("#halt").onclick = async () => {
        await api("/api/broker/stop", {});
        draw();
      };
    later(draw, 30000);
  };
  draw();
}

async function claude() {
  const p =
    state.presets ||
    (state.presets = await api("/api/presets").catch(() => ({})));
  main.innerHTML = `<p class="kicker">Connect Claude</p>
    <h1>Ask Claude to reverse engineer any wallet, in one sentence.</h1>
    <p class="sub">Run this once in a terminal and Claude Code can use Bot X-Ray from any chat: the x-ray, the leaderboard, the live check and the paper strategy. It reads the same public data, from your computer.</p>
    <pre class="cmd" id="cmd">${esc(p.mcp || "node scripts/mcp.js --help")}</pre>
    <div class="row"><button class="btn ghost" id="copy">Copy</button><span class="small" id="copied"></span></div>
    <h2>Then ask things like</h2>
    <ul class="hand" style="font-size:24px;line-height:1.5">
      <li>Reverse engineer the Polymarket wallet 0x8dxd.</li>
      <li>Was gabagool22 skill or luck?</li>
      <li>Convert 0x8dxd's strategy so I can trade it on my crypto exchange.</li>
      <li>Who's winning Polymarket's crypto markets this month, and how?</li>
      <li>Run the live gap check for a minute. Is the lag still there?</li>
      <li>What is the paper strategy holding, and how has it done?</li>
    </ul>
    <p class="foot">Using another agent? In the bot-x-ray folder, <code>node scripts/xray.js &lt;wallet or username&gt;</code> prints the same report.</p>`;
  $("#copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText($("#cmd").textContent);
      $("#copied").textContent = "Copied";
    } catch {
      $("#copied").textContent = "Select the line and copy it";
    }
  };
}

// ---------- start ----------
(async () => {
  try {
    state.presets = await api("/api/presets");
    $("#chips").innerHTML = state.presets.wallets
      .map(
        (w) =>
          `<button class="chip" data-w="${esc(w.name)}">${esc(w.name)}</button>`,
      )
      .join("");
    for (const b of document.querySelectorAll(".chip"))
      b.onclick = () =>
        (location.hash = `#/${WALLET_TABS.includes(state.tab) ? state.tab : "wallet"}/${encodeURIComponent(b.dataset.w)}`);
  } catch {
    /* the chips are a shortcut only */
  }
  if (!location.hash && saved)
    location.hash = `#/wallet/${encodeURIComponent(saved)}`;
  window.addEventListener("hashchange", route);
  route();
})();
