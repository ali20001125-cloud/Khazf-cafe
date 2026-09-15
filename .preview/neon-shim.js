// بديل سوّاق Neon أثناء المعاينة المحلّية: نفس الواجهة (وسم قالب + استدعاء)
// لكن فوق Postgres محلّية. الكود المُعايَن هو كود الإنتاج نفسه بلا تعديل.
const { Pool } = require("pg");
let pool = null;
function get() {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return pool;
}
function neon() {
  const run = async (strings, ...vals) => {
    if (typeof strings === "string") {
      const r = await get().query(strings, vals[0] || []);
      return r.rows;
    }
    let text = "", i = 0;
    for (const part of strings) {
      text += part;
      if (i < vals.length) text += "$" + (++i);
    }
    const r = await get().query(text, vals);
    return r.rows;
  };
  run.query = (t, p) => get().query(t, p).then((r) => r.rows);
  run.transaction = async (qs) => { const out = []; for (const q of qs) out.push(await q); return out; };
  return run;
}
module.exports = { neon, neonConfig: {}, Pool, types: {} };
