const $ = (id) => document.getElementById(id);
const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const on = (target, evt, fn, opts) => target.addEventListener(evt, fn, opts);
const cssVar = (name, val) => document.documentElement.style.setProperty(name, val);
