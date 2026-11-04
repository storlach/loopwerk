// Laufprobe ohne Figma: stellt ein ausreichend vollständiges, strenges Fake-`figma` bereit, führt code.js aus und prüft das Ergebnis.
//   node tools/figma-plugin/mock-run.cjs            (zwei Läufe: frische Datei, dann erneuter Lauf ohne Funnel/Azeret)
// Streng heißt: was Figma ablehnt, lehnt auch die Attrappe ab (FILL ohne Auto-Layout-Eltern, Kinder in Instanzen,
// Schrift nicht geladen, textStyleId ohne Async bei dynamic-page, Properties an Varianten …).
// Prüfungen: (a) Molecules/Organisms/Screens ohne nackte Grundformen, nur Instanzen + reine Layout-Frames/Texte,
// (b) keine Farbe ohne Variable, (c) Screens nur aus Organism-Instanzen, (d) keine Überlappungen auf einer Seite,
// (e) Texte an Text-Stilen, Abstände/Radien an Variablen.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(process.env.MOCK_SRC || path.join(__dirname, 'code.js'), 'utf8');
const MIXED = Symbol('mixed');
const AL_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);
const CONTAINERS = new Set(['PAGE', 'SECTION', 'FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'DOCUMENT']);
const SHAPES = new Set(['RECTANGLE', 'ELLIPSE', 'VECTOR', 'LINE', 'POLYGON', 'STAR', 'BOOLEAN_OPERATION']);

function createFigma({ fonts }) {
  let nextId = 1;
  const newId = () => '1:' + nextId++;
  const issues = [];
  const loadedFonts = new Set();
  const variables = new Map();
  const collections = [];
  const textStyles = new Map();
  const effectStyles = new Map();
  let closed = null;
  let resolveClosed;
  const closedP = new Promise((r) => { resolveClosed = r; });
  const notes = [];
  const fail = (msg) => { throw new Error('[Figma-Attrappe] ' + msg); };
  const fontKey = (f) => f.family + '/' + f.style;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  class Node {
    constructor(type) {
      this.id = newId();
      this.type = type;
      this.name = type;
      this.parent = null;
      this.x = 0; this.y = 0; this._w = 100; this._h = 100;
      this.visible = true; this.opacity = 1;
      this.fills = []; this.strokes = []; this.effects = [];
      this.strokeWeight = 1; this.strokeAlign = 'INSIDE';
      this.boundVariables = {};
      this._refs = null;
      this.constraints = { horizontal: 'MIN', vertical: 'MIN' };
      this.layoutPositioning = 'AUTO';
      this._sizingH = 'FIXED'; this._sizingV = 'FIXED';
      this.effectStyleId = '';
      this._pluginData = {};
      if (CONTAINERS.has(type)) this.children = [];
      if (AL_TYPES.has(type)) {
        this.layoutMode = 'NONE'; this.itemSpacing = 0; this.counterAxisSpacing = 0;
        this.paddingTop = 0; this.paddingRight = 0; this.paddingBottom = 0; this.paddingLeft = 0;
        this.primaryAxisAlignItems = 'MIN'; this.counterAxisAlignItems = 'MIN'; this.layoutWrap = 'NO_WRAP';
        this.clipsContent = true;
      }
    }
    get inInstance() { let p = this.parent; while (p) { if (p.type === 'INSTANCE') return true; p = p.parent; } return false; }
    get isAL() { return AL_TYPES.has(this.type) && this.layoutMode && this.layoutMode !== 'NONE'; }
    // --- Größen
    get width() { return this._size('H'); }
    get height() { return this._size('V'); }
    set width(v) { fail('width ist schreibgeschützt (resize nutzen)'); }
    set height(v) { fail('height ist schreibgeschützt (resize nutzen)'); }
    _size(axis) {
      const s = axis === 'H' ? this._sizingH : this._sizingV;
      const p = this.parent;
      if (s === 'FILL' && p && p.isAL && this.layoutPositioning !== 'ABSOLUTE') return this._fill(axis);
      if (s === 'HUG') return this._hug(axis);
      if (this.type === 'TEXT' && this.textAutoResize !== 'NONE') return this._textSize(axis, axis === 'H' ? null : this._w);
      return axis === 'H' ? this._w : this._h;
    }
    _fill(axis) {
      const p = this.parent;
      const pad = axis === 'H' ? p.paddingLeft + p.paddingRight : p.paddingTop + p.paddingBottom;
      const inner = p._size(axis) - pad;
      const primary = (p.layoutMode === 'HORIZONTAL') === (axis === 'H');
      if (!primary) return Math.max(0, inner);
      const kids = p.children.filter((c) => c.visible && c.layoutPositioning !== 'ABSOLUTE');
      const fills = kids.filter((c) => (axis === 'H' ? c._sizingH : c._sizingV) === 'FILL');
      const fixed = kids.filter((c) => fills.indexOf(c) < 0).reduce((a, c) => a + c._size(axis), 0);
      return Math.max(0, (inner - fixed - p.itemSpacing * (kids.length - 1)) / fills.length);
    }
    _hug(axis) {
      if (this.type === 'TEXT') return this._textSize(axis, null);
      const kids = this.children.filter((c) => c.visible && c.layoutPositioning !== 'ABSOLUTE');
      const primary = (this.layoutMode === 'HORIZONTAL') === (axis === 'H');
      const pad = axis === 'H' ? this.paddingLeft + this.paddingRight : this.paddingTop + this.paddingBottom;
      const sizes = kids.map((c) => {
        const cs = axis === 'H' ? c._sizingH : c._sizingV;
        return cs === 'FILL' ? (axis === 'H' ? c._w : c._h) : c._size(axis);
      });
      if (!kids.length) return pad;
      return pad + (primary ? sizes.reduce((a, b) => a + b, 0) + this.itemSpacing * (kids.length - 1) : Math.max.apply(null, sizes));
    }
    _textSize(axis, fixedW) {
      const st = this._style || { fontSize: 12, lineHeight: { unit: 'PERCENT', value: 120 }, letterSpacing: { value: 0 }, fontName: this.fontName };
      const fs = st.fontSize;
      const mono = /Mono/.test((st.fontName || {}).family || '');
      const chars = String(this.characters || '');
      const w = chars.length * fs * (mono ? 0.62 : 0.53) * (st.textCase === 'UPPER' ? 1.12 : 1) + chars.length * fs * (st.letterSpacing.value || 0) / 100;
      const lh = st.lineHeight.unit === 'PERCENT' ? fs * st.lineHeight.value / 100 : fs * 1.2;
      if (axis === 'H') return this._sizingH === 'FIXED' && this.textAutoResize !== 'WIDTH_AND_HEIGHT' ? this._w : Math.max(1, w);
      const width = this._sizingH === 'FILL' && this.parent && this.parent.isAL ? this._fill('H') : this.textAutoResize === 'WIDTH_AND_HEIGHT' ? w : this._w;
      const lines = this.maxLines === 1 ? 1 : Math.max(1, Math.ceil(w / Math.max(1, width)));
      return lines * lh;
    }
    resize(w, h) {
      if (!(w >= 0.01) || !(h >= 0.01)) fail('resize mit ungültiger Größe: ' + w + '×' + h + ' an ' + this.name);
      this._w = w; this._h = h;
      if (this.type === 'TEXT') this.textAutoResize = 'NONE';
      if (this.isAL || (this.parent && this.parent.isAL)) {
        if (this._sizingH !== 'FILL' || !(this.parent && this.parent.isAL)) this._sizingH = 'FIXED';
        if (this._sizingV !== 'FILL' || !(this.parent && this.parent.isAL)) this._sizingV = 'FIXED';
      }
    }
    resizeWithoutConstraints(w, h) { this.resize(w, h); }
    rescale(s) { this.resize(this._w * s, this._h * s); }
    // --- Auto-Layout-Größe
    get layoutSizingHorizontal() { return this._sizingH; }
    set layoutSizingHorizontal(v) { this._setSizing('H', v); }
    get layoutSizingVertical() { return this._sizingV; }
    set layoutSizingVertical(v) { this._setSizing('V', v); }
    _setSizing(axis, v) {
      const p = this.parent;
      const inAL = p && p.isAL && this.layoutPositioning !== 'ABSOLUTE';
      if (!this.isAL && !inAL && this.type !== 'TEXT') fail('layoutSizing ' + v + ' an ' + this.name + ': weder Auto-Layout noch Kind von Auto-Layout');
      if (v === 'FILL') {
        if (!inAL) fail('FILL an ' + this.name + ' ohne Auto-Layout-Eltern');
        const ps = axis === 'H' ? p._sizingH : p._sizingV;
        if (ps === 'HUG') issues.push('FILL in HUG-Eltern: ' + pathOf(this) + ' (' + axis + ')');
      }
      if (v === 'HUG' && !(this.isAL || this.type === 'TEXT')) fail('HUG an ' + this.name + ' (kein Auto-Layout)');
      if (axis === 'H') this._sizingH = v; else this._sizingV = v;
      if (this.type === 'TEXT' && axis === 'H') this.textAutoResize = v === 'HUG' ? 'WIDTH_AND_HEIGHT' : 'HEIGHT';
    }
    set layoutGrow(v) { if (!(this.parent && this.parent.isAL)) fail('layoutGrow ohne Auto-Layout'); }
    // --- Baum
    appendChild(c) { this.insertChild(this.children ? this.children.length : 0, c); }
    insertChild(i, c) {
      if (!this.children) fail(this.type + ' kann keine Kinder haben');
      if (this.type === 'INSTANCE' || this.inInstance) fail('Kind in eine Instanz einfügen: ' + this.name);
      if (c.inInstance) fail('Ebene aus einer Instanz bewegen: ' + c.name);
      if (this.type === 'COMPONENT_SET' && c.type !== 'COMPONENT') fail('Nur Komponenten in ein Component Set');
      if (c.type === 'SECTION' && !(this.type === 'PAGE' || this.type === 'SECTION')) fail('Sektion nur auf Seite');
      if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
      c.parent = this;
      this.children.splice(i, 0, c);
      if (c.layoutPositioning === 'ABSOLUTE' && !this.isAL) c.layoutPositioning = 'AUTO';
    }
    remove() { if (this.inInstance) fail('Ebene einer Instanz löschen'); if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    findAll(fn) { const out = []; const walk = (n) => { for (const c of n.children || []) { if (!fn || fn(c)) out.push(c); walk(c); } }; walk(this); return out; }
    findOne(fn) { return this.findAll(fn)[0] || null; }
    findChild(fn) { return (this.children || []).find(fn) || null; }
    setPluginData(k, v) { this._pluginData[k] = v; }
    getPluginData(k) { return this._pluginData[k] || ''; }
    // --- Positionierung
    get layoutPositioningValue() { return this.layoutPositioning; }
    // --- Variablen
    setBoundVariable(field, v) {
      if (v && v.resolvedType !== 'FLOAT' && !(field === 'visible' && v.resolvedType === 'BOOLEAN') && !(field === 'characters' && v.resolvedType === 'STRING')) fail('Variable ' + v.name + ' passt nicht zu ' + field);
      const allowed = ['width', 'height', 'itemSpacing', 'counterAxisSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius', 'strokeWeight', 'strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'opacity', 'visible', 'characters', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'];
      if (allowed.indexOf(field) < 0) fail('Feld nicht bindbar: ' + field);
      if (/Radius$/.test(field) && !(AL_TYPES.has(this.type) || this.type === 'RECTANGLE')) fail('Radius an ' + this.type);
      if (/^padding|itemSpacing/.test(field) && !AL_TYPES.has(this.type)) fail(field + ' an ' + this.type);
      const val = v.valuesByMode[Object.keys(v.valuesByMode)[0]];
      if (field === 'width') { this._w = val; if (this._sizingH === 'HUG') this._sizingH = 'FIXED'; }
      else if (field === 'height') { this._h = val; if (this._sizingV === 'HUG') this._sizingV = 'FIXED'; }
      else this[field] = val;
      this.boundVariables[field] = { type: 'VARIABLE_ALIAS', id: v.id };
    }
    // --- Stile
    set textStyleId(v) { fail('textStyleId ist mit documentAccess dynamic-page schreibgeschützt'); }
    get textStyleId() { return this._textStyleId || ''; }
    async setTextStyleIdAsync(id) {
      const s = textStyles.get(id);
      if (!s) fail('Text-Stil unbekannt');
      if (!loadedFonts.has(fontKey(s.fontName))) fail('Schrift des Stils nicht geladen');
      this._textStyleId = id; this._style = s; this.fontName = s.fontName;
    }
    async setEffectStyleIdAsync(id) { if (!effectStyles.has(id)) fail('Effekt-Stil unbekannt'); this.effectStyleId = id; }
    // --- Komponenten-Properties
    get componentPropertyReferences() { return this._refs; }
    set componentPropertyReferences(o) {
      if (this.inInstance) fail('componentPropertyReferences in einer Instanz');
      let comp = this.parent;
      while (comp && comp.type !== 'COMPONENT') comp = comp.parent;
      if (!comp) fail('componentPropertyReferences außerhalb einer Komponente: ' + this.name);
      const defs = (comp.parent && comp.parent.type === 'COMPONENT_SET' ? comp.parent : comp)._defs;
      for (const f of Object.keys(o)) {
        const d = defs[o[f]];
        if (!d) fail('Property ' + o[f] + ' nicht definiert');
        const need = { characters: 'TEXT', visible: 'BOOLEAN', mainComponent: 'INSTANCE_SWAP' }[f];
        if (d.type !== need) fail('Property-Typ passt nicht: ' + f + ' → ' + d.type);
        if (f === 'characters' && this.type !== 'TEXT') fail('characters-Referenz an ' + this.type);
        if (f === 'mainComponent' && this.type !== 'INSTANCE') fail('mainComponent-Referenz an ' + this.type);
        if (f === 'characters') this.characters = d.defaultValue;
        if (f === 'visible') this.visible = d.defaultValue;
      }
      this._refs = Object.assign({}, o);
    }
    get isExposedInstance() { return !!this._exposed; }
    set isExposedInstance(v) {
      if (this.type !== 'INSTANCE') fail('isExposedInstance nur an Instanzen');
      if (this.inInstance) fail('isExposedInstance in einer Instanz');
      let p = this.parent; while (p && p.type !== 'COMPONENT') p = p.parent;
      if (!p) fail('isExposedInstance außerhalb einer Komponente');
      this._exposed = !!v;
    }
  }
  // Layout-Felder mit Prüfung
  for (const f of ['layoutPositioning']) {
    Object.defineProperty(Node.prototype, f, {
      get() { return this['_' + f] || 'AUTO'; },
      set(v) { if (v === 'ABSOLUTE' && !(this.parent && this.parent.isAL)) fail('ABSOLUTE ohne Auto-Layout-Eltern: ' + this.name); this['_' + f] = v; },
    });
  }

  class TextNode extends Node {
    constructor() { super('TEXT'); this.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }]; this._chars = ''; this._font = { family: 'Inter', style: 'Regular' }; this.textAutoResize = 'WIDTH_AND_HEIGHT'; this.maxLines = null; this.textTruncation = 'DISABLED'; this._sizingH = 'HUG'; this._sizingV = 'HUG'; }
    get characters() { return this._chars; }
    set characters(v) { if (!loadedFonts.has(fontKey(this._font))) fail('Schrift nicht geladen: ' + fontKey(this._font)); this._chars = String(v); }
    get fontName() { return this._font; }
    set fontName(f) { if (!loadedFonts.has(fontKey(f))) fail('Schrift nicht geladen: ' + fontKey(f)); this._font = f; }
  }
  class VectorNode extends Node {
    constructor() { super('VECTOR'); this.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }]; this._paths = []; }
    get vectorPaths() { return this._paths; }
    set vectorPaths(p) {
      let maxX = 0, maxY = 0;
      for (const e of p) {
        if (!/^[MLCQZ0-9.\s-]+$/.test(e.data)) fail('Pfad mit ungültigen Befehlen: ' + e.data);
        const nums = e.data.split(/\s+/).filter((t) => !/^[A-Z]$/.test(t)).map(Number);
        if (nums.some((n) => Number.isNaN(n))) fail('Pfad nicht lesbar: ' + e.data);
        if (nums.some((n) => n < -0.001)) fail('Pfad nicht am Ursprung: ' + e.data);
        for (let i = 0; i < nums.length; i += 2) { maxX = Math.max(maxX, nums[i]); maxY = Math.max(maxY, nums[i + 1]); }
      }
      this._paths = p; this._w = Math.max(0.01, maxX); this._h = Math.max(0.01, maxY);
    }
  }

  function pathOf(n) { const a = []; let p = n; while (p && p.type !== 'PAGE') { a.unshift(p.name); p = p.parent; } return a.join(' › '); }
  function pageOf(n) { let p = n; while (p && p.type !== 'PAGE') p = p.parent; return p; }
  function setOf(comp) { return comp.parent && comp.parent.type === 'COMPONENT_SET' ? comp.parent : null; }
  function defsOf(comp) { const s = setOf(comp); return (s || comp)._defs; }

  // Instanzen: tiefe Kopie der Hauptkomponente
  const DATA_KEYS = new Set(['fills', 'strokes', 'effects', 'constraints', 'boundVariables', 'dashPattern', 'arcData', '_pluginData', '_font', 'vectorPaths']);
  function cloneInto(src, dst) {
    const skip = new Set(['id', 'parent', 'children', 'type', '_refs', '_exposed', 'mainComponent', '_defs', 'key', '_style', '_textStyleId', '_src', '_propValues', 'description']);
    for (const k of Object.keys(src)) {
      if (skip.has(k)) continue;
      const v = src[k];
      if (typeof v === 'function') continue;
      if (v && typeof v === 'object') { if (DATA_KEYS.has(k)) dst[k] = clone(v); continue; }
      dst[k] = v;
    }
    if (src._style) dst._style = src._style;
    if (src._textStyleId) dst._textStyleId = src._textStyleId;
    if (src._refs) dst._refs = Object.assign({}, src._refs);
    if (src.type === 'TEXT') { dst._chars = src._chars; dst._font = clone(src._font); }
    if (src.type === 'VECTOR') dst._paths = clone(src._paths);
    dst._src = src;
  }
  function instanceApi(inst) {
    Object.defineProperty(inst, 'componentProperties', { configurable: true, get() { return instanceProps(inst); } });
    inst.setProperties = (p) => setInstanceProps(inst, p);
  }
  function cloneTree(src) {
    let n;
    if (src.type === 'TEXT') n = new TextNode();
    else if (src.type === 'VECTOR') n = new VectorNode();
    else n = new Node(src.type === 'COMPONENT' ? 'INSTANCE' : src.type);
    cloneInto(src, n);
    if (src.type === 'INSTANCE') { n.mainComponent = src.mainComponent; n._propValues = Object.assign({}, src._propValues); instanceApi(n); }
    if (src.children) for (const c of src.children) { const k = cloneTree(c); k.parent = n; n.children.push(k); }
    return n;
  }
  function makeInstance(comp) {
    const inst = new Node('INSTANCE');
    cloneInto(comp, inst);
    inst.mainComponent = comp;
    inst._propValues = {};
    for (const c of comp.children) { const k = cloneTree(c); k.parent = inst; inst.children.push(k); }
    const defs = defsOf(comp) || {};
    for (const k of Object.keys(defs)) inst._propValues[k] = defs[k].defaultValue;
    instanceApi(inst);
    return inst;
  }
  function instanceProps(inst) {
    const out = {};
    const comp = inst.mainComponent;
    const defs = defsOf(comp) || {};
    for (const k of Object.keys(defs)) out[k] = { type: defs[k].type, value: inst._propValues[k] };
    if (setOf(comp)) for (const k of Object.keys(comp.variantProperties)) out[k] = { type: 'VARIANT', value: comp.variantProperties[k] };
    return out;
  }
  function setInstanceProps(inst, p) {
    const comp = inst.mainComponent;
    const defs = defsOf(comp) || {};
    const set = setOf(comp);
    const variant = {};
    for (const k of Object.keys(p)) {
      if (defs[k]) {
        const d = defs[k];
        if (d.type === 'TEXT' && typeof p[k] !== 'string') fail('TEXT-Property braucht Text: ' + k);
        if (d.type === 'BOOLEAN' && typeof p[k] !== 'boolean') fail('BOOLEAN-Property braucht true/false: ' + k);
        if (d.type === 'INSTANCE_SWAP') { const t = byId.get(p[k]); if (!t || t.type !== 'COMPONENT') fail('INSTANCE_SWAP braucht Komponenten-ID: ' + k); }
        inst._propValues[k] = p[k];
      } else if (set && comp.variantProperties && k in comp.variantProperties) {
        variant[k] = p[k];
      } else fail('Unbekannte Property ' + k + ' an ' + inst.name);
    }
    if (Object.keys(variant).length) {
      const want = Object.assign({}, comp.variantProperties, variant);
      const next = set.children.find((c) => Object.keys(want).every((k) => c.variantProperties[k] === want[k]));
      if (!next) fail('Variante fehlt: ' + JSON.stringify(want));
      if (next !== comp) {
        const keep = { x: inst.x, y: inst.y, w: inst._w, h: inst._h, sh: inst._sizingH, sv: inst._sizingV, lp: inst.layoutPositioning, name: inst.name, c: inst.constraints, vis: inst.visible, op: inst.opacity, bv: Object.assign({}, inst.boundVariables) };
        cloneInto(next, inst);
        inst.children.length = 0;
        for (const c of next.children) { const k = cloneTree(c); k.parent = inst; inst.children.push(k); }
        inst.mainComponent = next;
        Object.assign(inst, { x: keep.x, y: keep.y, name: keep.name, constraints: keep.c, visible: keep.vis, opacity: keep.op });
        inst._sizingH = keep.sh; inst._sizingV = keep.sv; inst.boundVariables = keep.bv;
        if (keep.lp === 'ABSOLUTE') inst._layoutPositioning = 'ABSOLUTE';
        if (keep.sh === 'FIXED' || keep.sh === 'FILL') inst._w = keep.w;
        if (keep.sv === 'FIXED' || keep.sv === 'FILL') inst._h = keep.h;
      }
    }
    for (const k of Object.keys(inst._propValues)) applyProp(inst, k, defs[k], inst._propValues[k]);
  }
  function applyProp(inst, key, d, val) {
    const walk = (n) => {
      for (const c of n.children || []) {
        const r = c._refs;
        if (r) {
          if (r.characters === key) c._chars = val;
          if (r.visible === key) c.visible = val;
          if (r.mainComponent === key && c.mainComponent.id !== val) {
            const target = byId.get(val);
            const keep = { x: c.x, y: c.y, name: c.name, sh: c._sizingH, sv: c._sizingV, w: c._w, h: c._h, bv: c.boundVariables, refs: c._refs, vis: c.visible, lp: c._layoutPositioning };
            cloneInto(target, c);
            Object.assign(c, { x: keep.x, y: keep.y, name: keep.name, _sizingH: keep.sh, _sizingV: keep.sv, _w: keep.w, _h: keep.h, boundVariables: keep.bv, _refs: keep.refs, visible: keep.vis, _layoutPositioning: keep.lp });
            c.mainComponent = target;
            c.children.length = 0;
            for (const g of target.children) { const k = cloneTree(g); k.parent = c; c.children.push(k); }
            // Figma behält beim Tausch die Größe einer verkleinerten Instanz (Icons bleiben 16 px)
            if (!c.boundVariables.width && c._sizingH !== 'FILL') c._w = target._w;
            if (!c.boundVariables.height && c._sizingV !== 'FILL') c._h = target._h;
            c._propValues = {};
            const defs = defsOf(target) || {};
            for (const k of Object.keys(defs)) c._propValues[k] = defs[k].defaultValue;
            instanceApi(c);
          }
        }
        if (c.type !== 'INSTANCE') walk(c); else walk(c);
      }
    };
    walk(inst);
  }

  const byId = new Map();
  const reg = (n) => { byId.set(n.id, n); return n; };
  function mk(type, o) {
    const n = reg(type === 'TEXT' ? new TextNode() : type === 'VECTOR' ? new VectorNode() : new Node(type));
    Object.assign(n, o || {});
    figma.currentPage.appendChild(n);
    return n;
  }
  function componentify(c) {
    c._defs = {};
    c.key = 'k' + c.id.replace(':', '_') + Math.random().toString(16).slice(2, 8);
    c.description = '';
    c.createInstance = () => { const i = makeInstance(c); reg(i); figma.currentPage.appendChild(i); return i; };
    c.addComponentProperty = (name, type, def, opts) => {
      if (setOf(c)) fail('addComponentProperty an einer Variante (' + c.name + ') – nur am Component Set');
      return addProp(c, name, type, def, opts);
    };
    Object.defineProperty(c, 'variantProperties', { get() { if (!setOf(c)) return null; const o = {}; for (const part of c.name.split(',')) { const kv = part.split('='); o[kv[0].trim()] = kv[1].trim(); } return o; } });
    return c;
  }
  let propN = 1;
  function addProp(target, name, type, def, opts) {
    if (['TEXT', 'BOOLEAN', 'INSTANCE_SWAP', 'VARIANT'].indexOf(type) < 0) fail('Property-Typ unbekannt: ' + type);
    if (type === 'INSTANCE_SWAP') {
      const t = byId.get(def);
      if (!t || t.type !== 'COMPONENT') fail('INSTANCE_SWAP-Vorgabe muss eine Komponenten-ID sein: ' + name);
      for (const pv of (opts && opts.preferredValues) || []) if (!pv.key || ['COMPONENT', 'COMPONENT_SET'].indexOf(pv.type) < 0) fail('preferredValues ungültig');
    }
    if (type === 'TEXT' && typeof def !== 'string') fail('TEXT-Vorgabe muss Text sein');
    if (type === 'BOOLEAN' && typeof def !== 'boolean') fail('BOOLEAN-Vorgabe muss true/false sein');
    const full = name + '#' + propN++ + ':0';
    target._defs[full] = { type, defaultValue: def, preferredValues: opts && opts.preferredValues };
    return full;
  }

  const document = new Node('DOCUMENT');
  document.name = 'Testdatei';
  const firstPage = reg(new Node('PAGE'));
  firstPage.name = 'Page 1';
  document.appendChild(firstPage);
  let current = firstPage;

  const figma = {
    mixed: MIXED,
    root: document,
    get currentPage() { return current; },
    set currentPage(p) { fail('figma.currentPage = … ist mit dynamic-page verboten, setCurrentPageAsync nutzen'); },
    async setCurrentPageAsync(p) { if (p.type !== 'PAGE') fail('keine Seite'); current = p; },
    createPage() { const p = reg(new Node('PAGE')); p.name = 'Page ' + (document.children.length + 1); document.appendChild(p); return p; },
    createFrame() { return mk('FRAME', { fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }] }); },
    createComponent() { return componentify(mk('COMPONENT', { fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }] })); },
    createRectangle() { return mk('RECTANGLE', { fills: [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }] }); },
    createEllipse() { const e = mk('ELLIPSE', { fills: [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }] }); e.arcData = { startingAngle: 0, endingAngle: 2 * Math.PI, innerRadius: 0 }; return e; },
    createVector() { return mk('VECTOR'); },
    createText() { return mk('TEXT'); },
    createSection() { const s = mk('SECTION', { fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }] }); if (s.parent.type !== 'PAGE') fail('Sektion nicht auf Seite'); return s; },
    combineAsVariants(nodes, parent) {
      if (!nodes.length) fail('combineAsVariants ohne Knoten');
      const seen = new Set();
      for (const n of nodes) {
        if (n.type !== 'COMPONENT') fail('combineAsVariants: keine Komponente');
        if (setOf(n)) fail('schon in einem Set');
        if (Object.keys(n._defs).length) fail('Variante hat schon Properties: ' + n.name);
        if (!/^[^=,]+=[^=,]+(, [^=,]+=[^=,]+)*$/.test(n.name)) fail('Variantenname ungültig: ' + n.name);
        if (seen.has(n.name)) fail('Variante doppelt: ' + n.name);
        seen.add(n.name);
      }
      const set = reg(new Node('COMPONENT_SET'));
      set.strokes = [{ type: 'SOLID', color: { r: 0.59, g: 0.28, b: 1 } }];
      set.dashPattern = [10, 5];
      set._defs = {};
      set.key = 'ks' + set.id.replace(':', '_');
      set.description = '';
      set.addComponentProperty = (name, type, def, opts) => addProp(set, name, type, def, opts);
      parent.appendChild(set);
      for (const n of nodes) set.appendChild(n);
      Object.defineProperty(set, 'defaultVariant', { get() { return set.children[0]; } });
      return set;
    },
    variables: {
      createVariableCollection(name) {
        const c = { id: 'VariableCollectionId:' + collections.length, name, modes: [{ modeId: 'm' + collections.length + ':0', name: 'Mode 1' }], variableIds: [],
          renameMode(id, n) { const m = this.modes.find((x) => x.modeId === id); if (!m) fail('Modus fehlt'); m.name = n; } };
        collections.push(c);
        return c;
      },
      createVariable(name, collection, type) {
        if (typeof collection === 'string') fail('createVariable mit Collection-ID ist mit dynamic-page verboten');
        if (/[.{}]/.test(name)) fail('Variablenname ungültig: ' + name);
        if (['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'].indexOf(type) < 0) fail('Typ unbekannt');
        for (const id of collection.variableIds) if (variables.get(id).name === name) fail('Variable doppelt: ' + name);
        const v = { id: 'VariableID:' + variables.size, name, resolvedType: type, description: '', valuesByMode: {}, _scopes: ['ALL_SCOPES'], collection,
          get scopes() { return this._scopes; },
          set scopes(s) {
            const ok = { COLOR: ['ALL_SCOPES', 'ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'EFFECT_COLOR'], FLOAT: ['ALL_SCOPES', 'CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'OPACITY', 'STROKE_FLOAT', 'EFFECT_FLOAT', 'FONT_WEIGHT', 'FONT_SIZE', 'LINE_HEIGHT', 'LETTER_SPACING', 'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT'], STRING: ['ALL_SCOPES', 'TEXT_CONTENT', 'FONT_FAMILY', 'FONT_STYLE'] }[type] || [];
            for (const x of s) if (ok.indexOf(x) < 0) fail('Scope ' + x + ' passt nicht zu ' + type + ' (' + name + ')');
            this._scopes = s.slice();
          },
          setValueForMode(mode, val) {
            if (!collection.modes.some((m) => m.modeId === mode)) fail('Modus fehlt');
            if (val && val.type === 'VARIABLE_ALIAS') { const t = variables.get(val.id); if (!t || t.resolvedType !== type) fail('Alias-Typ passt nicht'); this.valuesByMode[mode] = t.valuesByMode[Object.keys(t.valuesByMode)[0]]; this._alias = val.id; return; }
            if (type === 'COLOR' && !(val && [val.r, val.g, val.b].every((x) => x >= 0 && x <= 1) && (val.a == null || (val.a >= 0 && val.a <= 1)))) fail('Farbwert ungültig: ' + name);
            if (type === 'FLOAT' && typeof val !== 'number') fail('Zahl erwartet: ' + name);
            if (type === 'STRING' && typeof val !== 'string') fail('Text erwartet: ' + name);
            this.valuesByMode[mode] = val;
          } };
        variables.set(v.id, v);
        collection.variableIds.push(v.id);
        return v;
      },
      createVariableAlias(v) { return { type: 'VARIABLE_ALIAS', id: v.id }; },
      setBoundVariableForPaint(paint, field, v) {
        if (field !== 'color' || !v || v.resolvedType !== 'COLOR') fail('Farbe nur an COLOR-Variable');
        if (paint.type !== 'SOLID') fail('Nur SOLID-Paints');
        const p = clone(paint);
        p.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: v.id } };
        return p;
      },
      setBoundVariableForEffect(effect, field, v) {
        if (field !== 'color' || v.resolvedType !== 'COLOR') fail('Effekt-Farbe nur an COLOR-Variable');
        const e = clone(effect);
        e.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: v.id } };
        return e;
      },
      async getLocalVariableCollectionsAsync() { return collections.slice(); },
      async getLocalVariablesAsync() { return Array.from(variables.values()); },
    },
    createTextStyle() {
      const s = { id: 'S:t' + textStyles.size, type: 'TEXT', name: '', description: '', _font: { family: 'Inter', style: 'Regular' }, fontSize: 12, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PERCENT', value: 0 }, textCase: 'ORIGINAL', boundVariables: {},
        get fontName() { return this._font; },
        set fontName(f) { if (!loadedFonts.has(fontKey(f))) fail('Schrift nicht geladen (Stil): ' + fontKey(f)); this._font = f; },
        setBoundVariable(field, v) {
          const need = { fontSize: 'FLOAT', fontFamily: 'STRING', fontStyle: 'STRING', fontWeight: 'FLOAT', letterSpacing: 'FLOAT', lineHeight: 'FLOAT' }[field];
          if (!need || v.resolvedType !== need) fail('Text-Stil-Feld ' + field + ' passt nicht zu ' + v.resolvedType);
          const val = v.valuesByMode[Object.keys(v.valuesByMode)[0]];
          if (field === 'fontFamily' && val !== this._font.family) fail('Schrift-Variable ' + val + ' passt nicht zur Schrift ' + this._font.family);
          this.boundVariables[field] = { type: 'VARIABLE_ALIAS', id: v.id };
        } };
      textStyles.set(s.id, s);
      return s;
    },
    createEffectStyle() { const s = { id: 'S:e' + effectStyles.size, type: 'EFFECT', name: '', description: '', effects: [] }; effectStyles.set(s.id, s); return s; },
    async getLocalTextStylesAsync() { return Array.from(textStyles.values()); },
    async listAvailableFontsAsync() { return fonts.map((f) => ({ fontName: f })); },
    async loadFontAsync(f) {
      if (!fonts.some((x) => x.family === f.family && x.style === f.style)) throw new Error('Font nicht verfügbar: ' + fontKey(f));
      loadedFonts.add(fontKey(f));
    },
    notify(msg) { notes.push(msg); return { cancel() {} }; },
    closePlugin(msg) { if (closed !== null) fail('closePlugin doppelt'); closed = msg || ''; resolveClosed(closed); },
  };

  return { figma, issues, notes, closedP, document, variables, collections, textStyles, effectStyles, byId, pageOf, pathOf, setOf };
}

// ---------------------------------------------------------------- Prüfungen

function checkDocument(env, suffix) {
  const { document, variables, collections, textStyles, effectStyles, pageOf, pathOf } = env;
  const problems = [];
  const warnings = [];
  const pageNames = ['Cover', 'Atoms', 'Molecules', 'Organisms', 'Screens'].map((n) => n + suffix);
  const pages = {};
  for (const p of document.children) pages[p.name] = p;
  const order = document.children.map((p) => p.name).filter((n) => pageNames.indexOf(n) >= 0);
  if (order.join('|') !== pageNames.join('|')) problems.push('Seitenreihenfolge: ' + order.join(', '));

  const allNodes = (root) => root.findAll(() => true);
  const isPaintBound = (p) => p && p.boundVariables && p.boundVariables.color;
  const comps = (page) => page.findAll((n) => n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && n.parent.type !== 'COMPONENT_SET'));
  const variantsOf = (c) => (c.type === 'COMPONENT_SET' ? c.children : [c]);

  // (b) keine Farbe ohne Variable
  let paints = 0, unbound = 0;
  for (const name of pageNames) {
    for (const n of allNodes(pages[name])) {
      for (const k of ['fills', 'strokes']) {
        for (const p of n[k] || []) {
          paints++;
          if (!isPaintBound(p)) { unbound++; if (unbound < 15) problems.push('(b) Farbe ohne Variable: ' + pathOf(n) + ' [' + k + ']'); }
        }
      }
      if (n.effects && n.effects.length && !n.effectStyleId) for (const e of n.effects) if (e.color && !(e.boundVariables && e.boundVariables.color)) problems.push('(b) Effekt ohne Variable: ' + pathOf(n));
    }
  }
  for (const s of effectStyles.values()) for (const e of s.effects) if (e.color && !(e.boundVariables && e.boundVariables.color)) problems.push('(b) Effekt-Stil ohne Variable: ' + s.name);

  // (a) Molecules/Organisms: nur Instanzen, Texte, reine Layout-Frames
  const pageOfMain = (inst) => { const p = pageOf(inst.mainComponent); return p ? p.name : '?'; };
  const allowedMains = { Molecules: ['Atoms'], Organisms: ['Atoms', 'Molecules', 'Organisms'] };
  const pureFrame = (n) => !(n.fills || []).length && !(n.strokes || []).length && !(n.effects || []).length && !n.effectStyleId;
  let instCount = 0;
  for (const level of ['Molecules', 'Organisms']) {
    for (const c of comps(pages[level + suffix])) {
      for (const v of variantsOf(c)) {
        const walk = (n) => {
          for (const ch of n.children || []) {
            if (ch.type === 'INSTANCE') {
              instCount++;
              const mp = pageOfMain(ch).replace(suffix, '');
              if (allowedMains[level].indexOf(mp) < 0) problems.push('(a) ' + level + ': Instanz von ' + mp + ' in ' + pathOf(ch));
              continue;
            }
            if (ch.type === 'TEXT') continue;
            if (ch.type === 'FRAME') { if (!pureFrame(ch)) problems.push('(a) Frame mit Gestaltung statt Atom: ' + pathOf(ch)); walk(ch); continue; }
            problems.push('(a) Nackte Grundform ' + ch.type + ': ' + pathOf(ch));
          }
        };
        walk(v);
      }
    }
  }

  // (c) Screens nur aus Organism-Instanzen (+ Hintergrund-Frame und reine Layout-Frames)
  const screensPage = pages['Screens' + suffix];
  const screens = screensPage.findAll((n) => n.type === 'FRAME' && n.parent.type === 'SECTION');
  for (const s of screens) {
    const walk = (n) => {
      for (const ch of n.children || []) {
        if (ch.type === 'INSTANCE') { const mp = pageOfMain(ch).replace(suffix, ''); if (mp !== 'Organisms') problems.push('(c) Screen enthält ' + mp + '-Instanz: ' + pathOf(ch)); continue; }
        if (ch.type === 'FRAME' && pureFrame(ch)) { walk(ch); continue; }
        problems.push('(c) Screen enthält ' + ch.type + ': ' + pathOf(ch));
      }
    };
    walk(s);
  }

  // (d) keine Überlappung
  const overlap = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
  const noOverlap = (list, where) => {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (overlap(list[i], list[j])) problems.push('(d) Überlappung in ' + where + ': ' + list[i].name + ' ↔ ' + list[j].name);
  };
  for (const name of pageNames) {
    const p = pages[name];
    noOverlap(p.children, name);
    for (const s of p.children) {
      if (s.type === 'SECTION') {
        noOverlap(s.children, name + ' › ' + s.name);
        for (const ch of s.children) {
          if (ch.x < 0 || ch.y < 0 || ch.x + ch.width > s.width + 0.5 || ch.y + ch.height > s.height + 0.5) problems.push('(d) ragt aus der Sektion: ' + ch.name);
          if (ch.type === 'COMPONENT_SET') noOverlap(ch.children, ch.name);
          if (ch.type === 'COMPONENT_SET') for (const v of ch.children) if (v.x + v.width > ch.width + 0.5 || v.y + v.height > ch.height + 0.5) problems.push('(d) Variante ragt aus dem Set: ' + ch.name + ' / ' + v.name);
        }
      }
    }
  }

  // (e) Texte an Stilen, Abstände/Radien gebunden (Hauptkomponenten und Screens; Instanz-Kopien spiegeln sie)
  let texts = 0;
  for (const name of pageNames) {
    for (const n of allNodes(pages[name])) {
      if (n.inInstance) continue;
      if (n.type === 'TEXT') { texts++; if (!n.textStyleId) problems.push('(e) Text ohne Stil: ' + pathOf(n)); }
      if (n.isAL) {
        if (n.itemSpacing > 0 && !n.boundVariables.itemSpacing) problems.push('(e) Abstand ohne Variable: ' + pathOf(n));
        for (const f of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) if (n[f] > 0 && !n.boundVariables[f]) problems.push('(e) ' + f + ' ohne Variable: ' + pathOf(n));
      }
      for (const f of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) if (n[f] > 0 && !n.boundVariables[f]) problems.push('(e) Radius ohne Variable: ' + pathOf(n));
    }
  }

  // Hinweis: Inhalt breiter als ein fester Auto-Layout-Frame (ohne Beschnitt)
  for (const name of pageNames) {
    for (const n of allNodes(pages[name])) {
      if (n.inInstance || !n.isAL || n.clipsContent) continue;
      const axis = n.layoutMode === 'HORIZONTAL' ? 'H' : 'V';
      if ((axis === 'H' ? n._sizingH : n._sizingV) !== 'FIXED') continue;
      const kids = n.children.filter((c) => c.visible && c.layoutPositioning !== 'ABSOLUTE');
      const need = kids.reduce((a, c) => a + ((axis === 'H' ? c._sizingH : c._sizingV) === 'FILL' ? 0 : c._size(axis)), 0) + n.itemSpacing * Math.max(0, kids.length - 1) + (axis === 'H' ? n.paddingLeft + n.paddingRight : n.paddingTop + n.paddingBottom);
      const have = n._size(axis);
      if (need > have + 1) warnings.push('Inhalt größer als Rahmen (' + Math.round(need) + ' > ' + Math.round(have) + ' px, Schätzung): ' + pathOf(n) + (process.env.MOCK_DEBUG ? ' [' + kids.map((k) => k.name + ':' + Math.round(k._size(axis))).join(', ') + ' pad ' + n.paddingLeft + '/' + n.paddingRight + ' gap ' + n.itemSpacing + ']' : ''));
    }
  }

  // Zahlen
  const counts = {};
  for (const c of collections) counts[c.name] = c.variableIds.length;
  const perPage = {};
  for (const lvl of ['Atoms', 'Molecules', 'Organisms']) {
    const list = comps(pages[lvl + suffix]);
    perPage[lvl] = { komponenten: list.length, varianten: list.reduce((a, c) => a + variantsOf(c).length, 0) };
  }
  perPage.Screens = { screens: screens.length };
  return { problems, warnings, counts, perPage, paints, unbound, texts, instCount, issues: env.issues.slice(), textStyles: textStyles.size, effectStyles: effectStyles.size, screens: screens.map((s) => s.name + ' ' + Math.round(s.width) + '×' + Math.round(s.height)) };
}

// ---------------------------------------------------------------- Läufe

const FONTS_FULL = [];
const add = (family, styles) => { for (const s of styles) FONTS_FULL.push({ family, style: s }); };
add('Funnel Display', ['Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']);
add('Funnel Sans', ['Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Italic']);
add('Azeret Mono', ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold']);
add('Inter', ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold']);
add('Roboto Mono', ['Thin', 'Light', 'Regular', 'Medium', 'Bold']);
const FONTS_FALLBACK = FONTS_FULL.filter((f) => !/Funnel|Azeret/.test(f.family));

async function runOnce(env, label) {
  const t0 = Date.now();
  const ctx = vm.createContext({ figma: env.figma, console: { log() {}, warn(m) { env.warnLog = m; }, error(e) { console.error('  code.js:', e && e.stack ? e.stack : e); } } });
  new vm.Script(SRC, { filename: 'code.js' }).runInContext(ctx);
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('closePlugin nicht aufgerufen (Zeitüberschreitung)')), 120000); });
  const msg = await Promise.race([env.closedP, timeout]);
  clearTimeout(timer);
  console.log('\n— ' + label + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  console.log('  closePlugin: ' + msg);
  return msg;
}

function report(res) {
  console.log('  Variablen je Collection: ' + Object.keys(res.counts).map((k) => k + ' ' + res.counts[k]).join(' · '));
  console.log('  Text-Stile: ' + res.textStyles + ' · Effekt-Stile: ' + res.effectStyles);
  console.log('  Komponenten je Seite: ' + ['Atoms', 'Molecules', 'Organisms'].map((k) => k + ' ' + res.perPage[k].komponenten + ' (' + res.perPage[k].varianten + ' Varianten)').join(' · ') + ' · Screens ' + res.perPage.Screens.screens);
  console.log('  Screens: ' + res.screens.join(', '));
  console.log('  Farben geprüft: ' + res.paints + ' (ohne Variable: ' + res.unbound + ') · Texte: ' + res.texts + ' · Instanzen in Molecules/Organisms: ' + res.instCount);
  for (const w of res.warnings.slice(0, 40)) console.log('  Hinweis: ' + w);
  if (res.warnings.length > 40) console.log('  … ' + (res.warnings.length - 40) + ' weitere Hinweise');
}

async function main() {
  let failed = 0;
  const check = (name, ok, detail) => { console.log((ok ? '✔ ' : '✘ ') + name + (detail ? '  — ' + detail : '')); if (!ok) failed++; };

  // Lauf 1: leere Datei, alle Schriften da
  const env = createFigma({ fonts: FONTS_FULL });
  let msg;
  try { msg = await runOnce(env, 'Lauf 1: frische Datei'); } catch (e) { console.error(e); process.exit(1); }
  check('Lauf 1 endet mit „Fertig“', /^Fertig: \d+ Komponenten/.test(msg), msg);
  const r1 = checkDocument(env, '');
  report(r1);
  for (const p of r1.problems.slice(0, 40)) console.log('  ✘ ' + p);
  for (const p of r1.issues.slice(0, 20)) console.log('  ✘ Figma-Regel: ' + p);
  check('(a) Molecules/Organisms nur aus Instanzen, Texten und reinen Layout-Frames', !r1.problems.some((p) => p.startsWith('(a)')));
  check('(b) keine Farbe ohne gebundene Variable', !r1.problems.some((p) => p.startsWith('(b)')) && r1.unbound === 0);
  check('(c) Screens bestehen nur aus Organism-Instanzen', !r1.problems.some((p) => p.startsWith('(c)')) && r1.perPage.Screens.screens === 9);
  check('(d) keine Überlappung von Komponenten auf einer Seite', !r1.problems.some((p) => p.startsWith('(d)')));
  check('(e) Texte an Text-Stilen, Abstände und Radien an Variablen', !r1.problems.some((p) => p.startsWith('(e)')));
  check('Seiten in der Reihenfolge Cover, Atoms, Molecules, Organisms, Screens', !r1.problems.some((p) => p.startsWith('Seitenreihenfolge')));
  check('Figma-Regeln eingehalten (kein FILL in HUG-Eltern)', r1.issues.length === 0, r1.issues.length ? r1.issues.length + ' Verstöße' : '');
  check('Variablen: drei Collections, Farben ≥ 60, Maße ≥ 60', Object.keys(r1.counts).length === 3 && r1.counts['Phosphor'] >= 60 && r1.counts['Maße'] >= 60);
  check('Erste Seite der Datei bleibt erhalten', env.document.children[0].name === 'Page 1');
  check('Keine Bindungsfehler', !/Bindungen nicht möglich/.test(msg), msg);

  // Lauf 2: dieselbe Datei noch einmal, ohne Funnel/Azeret → neue Seiten mit Nummer, Ersatzschrift
  const env2 = env;
  const fonts2 = createFigma({ fonts: FONTS_FALLBACK });
  // dieselbe Datei weiterverwenden: Dokument und Stile bleiben, nur Schriften und Abschluss neu
  Object.assign(env2, { closedP: fonts2.closedP });
  env2.figma.listAvailableFontsAsync = fonts2.figma.listAvailableFontsAsync;
  const loadOrig = env2.figma.loadFontAsync;
  env2.figma.loadFontAsync = async (f) => { await fonts2.figma.loadFontAsync(f); return loadOrig(f); };
  env2.figma.closePlugin = fonts2.figma.closePlugin;
  env2.figma.notify = fonts2.figma.notify;
  let msg2;
  try { msg2 = await runOnce(env2, 'Lauf 2: gleiche Datei, ohne Funnel/Azeret'); } catch (e) { console.error(e); process.exit(1); }
  const r2 = checkDocument(env2, ' · 2');
  report(r2);
  for (const p of r2.problems.slice(0, 20)) console.log('  ✘ ' + p);
  check('Lauf 2 legt neue Seiten „… · 2“ an und lässt Lauf 1 stehen', env2.document.children.filter((p) => /^Atoms/.test(p.name)).length === 2 && !r2.problems.some((p) => p.startsWith('Seitenreihenfolge')));
  check('Lauf 2 meldet die Ersatzschrift', /Ersatzschrift/.test(msg2) && fonts2.notes.some((n) => /Schrift fehlt/.test(n)), msg2);
  check('Lauf 2 besteht dieselben Prüfungen', r2.problems.length === 0 && r2.issues.length === r1.issues.length);

  console.log('\n' + (failed ? failed + ' Prüfung(en) fehlgeschlagen' : 'Alle Prüfungen bestanden'));
  process.exitCode = failed ? 1 : 0;
}

module.exports = { createFigma, runOnce, FONTS_FULL, FONTS_FALLBACK };
if (require.main === module) main();
