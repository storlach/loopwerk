// Trace-Auswertung: Selbstzeit je Ereignisart im Hauptthread des Renderers und JS-Selbstzeit je Funktion (CPU-Profil im Trace)
const CATS = ['devtools.timeline', 'v8.execute', 'disabled-by-default-v8.cpu_profiler', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'loading'];

async function startTrace(browser, page) {
  await browser.startTracing(page, { categories: CATS });
}

async function stopTrace(browser) {
  const buf = await browser.stopTracing();
  return JSON.parse(buf.toString('utf8')).traceEvents;
}

// fromTs/toTs in µs (Trace-Zeit); null = alles
function analyse(events, { fromTs = null, toTs = null, top = 25 } = {}) {
  // Hauptthread des Renderers finden: Thread mit den meisten Ereignissen namens CrRendererMain
  const names = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  const count = new Map();
  for (const e of events) { const k = `${e.pid}:${e.tid}`; if (names.get(k) === 'CrRendererMain') count.set(k, (count.get(k) || 0) + 1); }
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const xs = events.filter((e) => e.ph === 'X' && `${e.pid}:${e.tid}` === main && e.dur != null && (fromTs == null || e.ts + e.dur >= fromTs) && (toTs == null || e.ts <= toTs)).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  // Selbstzeit je Name über Stapel
  const self = new Map();
  const stack = [];
  const add = (name, d) => self.set(name, (self.get(name) || 0) + d);
  for (const e of xs) {
    while (stack.length && stack[stack.length - 1].end <= e.ts) stack.pop();
    if (stack.length) { const p = stack[stack.length - 1]; p.child += Math.min(e.dur, p.end - e.ts); }
    const node = { name: e.name, end: e.ts + e.dur, dur: e.dur, child: 0 };
    stack.push(node);
    node.flush = () => add(node.name, Math.max(0, node.dur - node.child));
    e.__n = node;
  }
  for (const e of xs) e.__n.flush();
  const byName = [...self.entries()].map(([name, us]) => ({ name, ms: +(us / 1000).toFixed(1) })).sort((a, b) => b.ms - a.ms).slice(0, top);
  // Aufgaben (RunTask) über 50 ms
  const tasks = xs.filter((e) => e.name === 'RunTask' && e.dur > 50000).map((e) => ({ at: e.ts, ms: +(e.dur / 1000).toFixed(0) }));
  // CPU-Profil: Selbstzeit je Funktion
  const nodes = new Map(); const fn = new Map(); const file = new Map();
  const chunks = events.filter((e) => e.name === 'ProfileChunk' && `${e.pid}:${e.tid}`.split(':')[0] === main.split(':')[0]);
  const starts = events.filter((e) => e.name === 'Profile');
  const byId = new Map();
  for (const c of chunks) { if (!byId.has(c.id)) byId.set(c.id, []); byId.get(c.id).push(c); }
  // Profil des Hauptthreads: das mit den meisten Samples
  let best = null;
  for (const [id, list] of byId) { const n = list.reduce((a, c) => a + (c.args.data.samples?.length || 0), 0); if (!best || n > best.n) best = { id, list, n }; }
  if (best) {
    const st = starts.find((s) => s.id === best.id);
    let t = st ? st.args.data.startTime : best.list[0].ts;
    for (const c of best.list.sort((a, b) => a.ts - b.ts)) {
      for (const n of c.args.data.cpuProfile?.nodes || []) nodes.set(n.id, n);
      const s = c.args.data.cpuProfile?.samples || [];
      const d = c.args.data.timeDeltas || [];
      for (let i = 0; i < s.length; i++) {
        t += d[i];
        if ((fromTs != null && t < fromTs) || (toTs != null && t > toTs)) continue;
        const n = nodes.get(s[i]);
        if (!n) continue;
        const cf = n.callFrame;
        const url = (cf.url || '').replace(/^https?:\/\/[^/]+\//, '');
        const key = `${cf.functionName || '(anonym)'} ${url}:${cf.lineNumber + 1}`;
        fn.set(key, (fn.get(key) || 0) + d[i]);
        const fk = url || `(${cf.functionName})`;
        file.set(fk, (file.get(fk) || 0) + d[i]);
      }
    }
  }
  const topOf = (m, k = top) => [...m.entries()].map(([name, us]) => ({ name, ms: +(us / 1000).toFixed(1) })).sort((a, b) => b.ms - a.ms).slice(0, k);
  return { byName, tasks, fns: topOf(fn), files: topOf(file) };
}

// Zeitstempel einer Marke (performance.mark) im Trace
function markTs(events, name) {
  const e = events.find((x) => x.cat?.includes('blink.user_timing') && x.name === name);
  return e ? e.ts : null;
}
function navStart(events) {
  const e = events.filter((x) => x.name === 'navigationStart' && x.args?.data?.isLoadingMainFrame && /^http/.test(x.args.data.documentLoaderURL || '')).pop();
  return e ? e.ts : null;
}

module.exports = { startTrace, stopTrace, analyse, markTs, navStart };
