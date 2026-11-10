// Skalierung des Arrangers mit der Clip-Zahl. Aufruf: node m3c-arranger-scale.cjs <desktop|handy>
const { start, launch, newPage, stats, fmt, load, sleep } = require('./lib.cjs');
const S = require('./scen.cjs');
const mobile = process.argv[2] === 'handy';
const cpu = mobile ? 4 : 1;

(async () => {
  const srv = await start({ h2: false });
  const browser = await launch();
  console.log('##', mobile ? 'Handy 390×844, CPU 4x' : 'Desktop 1440×900', '· Licht aus · Last', load());
  for (const clips of [20, 200, 448, 1000]) {
    const rs = [];
    for (let i = 0; i < 3; i++) {
      const { page, ctx } = await newPage(browser, { cpu, mobile });
      await page.route('**/src/ui/glow.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export function mountGlow(){ return { state: {}, setQuality(){}, readRoom(){ return { data: new Uint8Array(4), W: 1, H: 1 }; } }; }' }));
      await page.goto(srv.origin + '/');
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
      await sleep(500);
      const tReplace = await page.evaluate(async ({ src, clips }) => { const f = new Function('return (' + src + ')')(); const t0 = performance.now(); await f({ tracks: 16, clips }); return performance.now() - t0; }, { src: S.bigSong.toString(), clips });
      const r = await page.evaluate(async () => {
        const { arranger, store, ui } = window.loopwerk;
        const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const timed = async (fn) => { const t0 = performance.now(); fn(); const sync = performance.now() - t0; await frame(); return { sync, paint: performance.now() - t0 }; };
        const canvasMB = () => { let px = 0; let n = 0; for (const c of document.querySelectorAll('#arr-scroll canvas')) { px += c.width * c.height; n++; } return { mb: +(px * 4 / 1e6).toFixed(1), n }; };
        const out = { dom: document.querySelectorAll('#arr-scroll *').length, clipsDom: document.querySelectorAll('#arr-scroll .clip').length };
        const view = document.getElementById('arr-scroll').getBoundingClientRect();
        out.visible = [...document.querySelectorAll('#arr-scroll .clip')].filter((n) => { const b = n.getBoundingClientRect(); return b.right > view.left && b.left < view.right && b.bottom > view.top && b.top < view.bottom; }).length;
        out.c24 = canvasMB();
        // alles neu zeichnen (erzwungen), 3×
        const full = []; for (let k = 0; k < 3; k++) full.push(await timed(() => arranger.render(true)));
        out.fullSync = Math.min(...full.map((x) => x.sync)); out.fullPaint = Math.min(...full.map((x) => x.paint));
        // nichts geändert (Spur-Lautstärke): nur die Schlüssel werden verglichen
        const none = []; for (let k = 0; k < 3; k++) none.push(await timed(() => store.setTrack('t1', { volume: 0.5 + k / 10 })));
        out.noneSync = Math.min(...none.map((x) => x.sync)); out.nonePaint = Math.min(...none.map((x) => x.paint));
        // ein Clip verschoben: wie viele Clip-Knoten werden ersetzt?
        let added = 0; const mo = new MutationObserver((l) => { for (const m of l) for (const n of m.addedNodes) if (n.classList?.contains('clip')) added++; });
        mo.observe(document.getElementById('arr-scroll'), { childList: true, subtree: true });
        const one = [];
        for (let k = 0; k < 3; k++) { const c = store.project.tracks[2].clips[1]; one.push(await timed(() => store.setClip(c.id, { gain: 0.6 + k / 10 }))); }
        await frame(); mo.disconnect();
        out.oneSync = Math.min(...one.map((x) => x.sync)); out.onePaint = Math.min(...one.map((x) => x.paint)); out.replaced = Math.round(added / 3);
        // Zoom-Stufen
        const z = [];
        for (const v of [48, 96, 192]) { const t = await timed(() => arranger.zoomTo(v)); z.push({ v, ...t, ...canvasMB() }); }
        out.z48 = z[0]; out.z96 = z[1]; out.z192 = z[2];
        await timed(() => arranger.zoomTo(24));
        // Auswahl ändern (markSelection über alle Clips)
        const sel = []; for (let k = 0; k < 3; k++) sel.push(await timed(() => ui.select(store.project.tracks[k].clips[0].id)));
        out.selSync = Math.min(...sel.map((x) => x.sync));
        return out;
      });
      rs.push({ ...r, tReplace });
      await ctx.close();
    }
    const m = (f, d = 0) => fmt(stats(rs.map(f), d));
    const r0 = rs[0];
    console.log(`\n${clips} Clips (16 Spuren): ${r0.clipsDom} Clip-Elemente im DOM, davon ${r0.visible} sichtbar · ${r0.dom} DOM-Knoten im Arranger · Leinwände ${r0.c24.n} = ${r0.c24.mb} MB bei Zoom 24`);
    console.log(`  Song öffnen (replace + Sounds): ${m((r) => r.tReplace)} ms`);
    console.log(`  alles neu zeichnen: ${m((r) => r.fullSync)} ms Skript · ${m((r) => r.fullPaint)} ms bis zum Bild`);
    console.log(`  Änderung ohne Clip (Spur-Lautstärke): ${m((r) => r.noneSync, 1)} ms · bis zum Bild ${m((r) => r.nonePaint)} ms`);
    console.log(`  ein Clip geändert: ${m((r) => r.oneSync, 1)} ms · bis zum Bild ${m((r) => r.onePaint)} ms · dabei ${r0.replaced} Clip-Elemente neu gebaut`);
    console.log(`  Zoom auf 48/96/192 px je Schlag: ${m((r) => r.z48.sync)} / ${m((r) => r.z96.sync)} / ${m((r) => r.z192.sync)} ms Skript · bis zum Bild ${m((r) => r.z48.paint)} / ${m((r) => r.z96.paint)} / ${m((r) => r.z192.paint)} ms · Leinwand-Speicher ${r0.z48.mb} / ${r0.z96.mb} / ${r0.z192.mb} MB`);
    console.log(`  Clip auswählen: ${m((r) => r.selSync, 1)} ms`);
  }
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
