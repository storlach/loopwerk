// Orte in der Song-Werkbank (Krachwerk): layout.js, freeze-ui.js und main.js bringen ihre Knöpfe per place() dorthin.
// Ohne Song-Werkbank (Loopwerk, auch mit ?density=calm) gibt es keine Einträge, dann gilt der übergebene Ersatz.
const slots = {};
export const setSongSlots = (o) => Object.assign(slots, o);
export const hasSongBench = () => !!slots.head;
export const slot = (name, fallback = null) => slots[name] ?? fallback;
