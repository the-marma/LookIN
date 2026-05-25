const express = require("express");
const cors = require("cors");
const pincodes = require("../data/pincodes.json");
const poisData = require("../data/pois.json");
const { encodeDigipin, decodeDigipin } = require("./digipin");

const app = express();
app.use(cors());
app.use(express.json());

// ─── Build lookup indexes ─────────────────────────────────────────────────────
const byPincode = {};
const byDistrict = {};
const byLocality = {};
const byLokSabha = {};

for (const entry of pincodes) {
  byPincode[entry.pincode] = entry;
  const dk = entry.district.toLowerCase();
  if (!byDistrict[dk]) byDistrict[dk] = [];
  byDistrict[dk].push(entry);
  for (const loc of entry.localities) {
    const lk = loc.toLowerCase();
    if (!byLocality[lk]) byLocality[lk] = [];
    byLocality[lk].push(entry);
  }
  if (entry.lok_sabha_constituency) {
    const lsk = entry.lok_sabha_constituency.toLowerCase();
    if (!byLokSabha[lsk]) byLokSabha[lsk] = [];
    byLokSabha[lsk].push(entry);
  }
}

const { metro_stations, bus_stops, landmarks } = poisData;
const allPois = [
  ...metro_stations.map((p) => ({ ...p, type: "metro_station" })),
  ...bus_stops.map((p) => ({ ...p, type: "bus_stop" })),
  ...landmarks.map((p) => ({ ...p, type: "landmark" })),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const success = (res, data, meta = {}) => res.json({ success: true, ...meta, data });
const notFound = (res, m) => res.status(404).json({ success: false, error: m });
const badRequest = (res, m) => res.status(400).json({ success: false, error: m });

function haversine(la1, lo1, la2, lo2) {
  const R = 6371, dLa = ((la2 - la1) * Math.PI) / 180, dLo = ((lo2 - lo1) * Math.PI) / 180;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180) * Math.cos(la2*Math.PI/180) * Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
const distM = (la, lo, lb, lob) => Math.round(haversine(la, lo, lb, lob) * 1000);
const walkMin = (m) => Math.max(1, Math.round(m / 80));

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length; if (!b.length) return a.length;
  const prev = Array(b.length + 1).fill(0), curr = Array(b.length + 1).fill(0);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      curr[j] = Math.min(curr[j-1] + 1, prev[j] + 1, prev[j-1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}
function trigrams(s) {
  const p = `  ${s.toLowerCase().replace(/\s+/g, " ")}  `, set = new Set();
  for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i+3));
  return set;
}
function trigramSim(a, b) {
  const ta = trigrams(a), tb = trigrams(b);
  let i = 0; for (const t of ta) if (tb.has(t)) i++;
  const u = ta.size + tb.size - i;
  return u === 0 ? 0 : i / u;
}
const SUFFIXES = new Set(["nagar","vihar","enclave","colony","puram","puri","bagh","park","extension","garden","marg","road","sector","phase","block","area","kunj","town","estate"]);
const stripSuffixes = (s) => s.toLowerCase().split(/\s+/).filter((t) => !SUFFIXES.has(t)).join(" ").trim();
function simScore(q, c) {
  const ql = q.toLowerCase().trim(), cl = c.toLowerCase().trim();
  if (ql === cl) return 1.0;
  const t1 = trigramSim(ql, cl);
  const qs = stripSuffixes(ql) || ql, cs = stripSuffixes(cl) || cl;
  const t2 = trigramSim(qs, cs);
  const lev = levenshtein(ql, cl);
  const m = Math.max(ql.length, cl.length);
  const ln = m === 0 ? 1 : 1 - lev / m;
  return Math.round((t1 * 0.4 + t2 * 0.4 + ln * 0.2) * 100) / 100;
}
const matchType = (s) => (s >= 0.95 ? "exact" : s >= 0.8 ? "partial" : s >= 0.6 ? "fuzzy" : "weak");

function buildNearbyPois(entry, { radius = 2000, limit = 5, types = ["metro_station","bus_stop","landmark"] } = {}) {
  const grouped = { metro_station: [], bus_stop: [], landmark: [] };
  for (const p of allPois) {
    if (!types.includes(p.type)) continue;
    const d = distM(entry.centroid.lat, entry.centroid.lng, p.lat, p.lng);
    if (d > radius) continue;
    const out = { name: p.name, lat: p.lat, lng: p.lng, distance_meters: d };
    if (p.type === "metro_station") { out.lines = p.lines; out.walking_time_min = walkMin(d); }
    else if (p.type === "bus_stop") out.routes = p.routes;
    else if (p.type === "landmark") out.category = p.category;
    grouped[p.type].push(out);
  }
  for (const t of Object.keys(grouped)) {
    grouped[t].sort((a,b) => a.distance_meters - b.distance_meters);
    grouped[t] = grouped[t].slice(0, limit);
  }
  return grouped;
}

// ═══ ROUTES ═══
app.get("/", (req, res) => {
  res.json({
    name: "Delhi Pincode API", version: "3.0.0",
    description: "Postal, civic, political, and geo-coded (DIGIPIN) data for Delhi pincodes.",
    total_pincodes: pincodes.length, total_pois: allPois.length,
    endpoints: {
      "GET /pincodes":                       "List/filter pincodes",
      "GET /pincodes/:pincode":              "Single pincode (modular)",
      "GET /pincodes/:pincode/full":         "AGGREGATED: identity + geo + postal + civic + political + POIs",
      "GET /pincodes/:pincode/validate":     "Existence check",
      "GET /pincodes/:pincode/nearby":       "POIs in radius",
      "GET /pincodes/:pincode/digipin":      "Just the DIGIPIN",
      "GET /digipin/encode":                 "lat,lng → DIGIPIN",
      "GET /digipin/decode":                 "DIGIPIN → lat,lng",
      "GET /localities":                     "All localities",
      "GET /localities/search":              "Locality substring search",
      "GET /search":                         "Universal fuzzy search",
      "GET /districts":                      "All districts",
      "GET /districts/:district":            "Pincodes in district",
      "GET /constituencies/lok-sabha":       "All LS constituencies",
      "GET /constituencies/lok-sabha/:name": "Pincodes in LS constituency",
      "GET /nearby":                         "Reverse geocode lat,lng",
      "GET /pois":                           "List/filter POIs",
      "POST /bulk":                          "Bulk pincode lookup",
    },
    notes: [
      "DIGIPINs computed using India Post's official 10-level grid (verified against Dak Bhawan test case).",
      "Vidhan Sabha constituency, MCD zone, and post office street addresses are null pending official source integration.",
    ],
  });
});

// ─── DIGIPIN ─────────────────────────────────────────────────────────────────
app.get("/digipin/encode", (req, res) => {
  const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) return badRequest(res, "Provide valid ?lat= and ?lng=");
  const code = encodeDigipin(lat, lng);
  if (!code) return badRequest(res, "Coordinates outside DIGIPIN bounds (2.5–38.5°N, 63.5–99.5°E)");
  res.json({ success: true, data: { lat, lng, digipin: code } });
});

app.get("/digipin/decode", (req, res) => {
  const code = req.query.code;
  if (!code) return badRequest(res, "Provide ?code=");
  const d = decodeDigipin(code);
  if (!d) return badRequest(res, "Invalid DIGIPIN code");
  res.json({ success: true, data: { digipin: code, lat: d.lat, lng: d.lng } });
});

// ─── PINCODES ────────────────────────────────────────────────────────────────
app.get("/pincodes", (req, res) => {
  let r = pincodes;
  if (req.query.district) {
    const d = req.query.district.toLowerCase();
    r = r.filter((p) => p.district.toLowerCase().includes(d));
  }
  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    r = r.filter((p) => p.pincode.includes(q) || p.district.toLowerCase().includes(q) || p.localities.some((l) => l.toLowerCase().includes(q)));
  }
  if (r.length === 0) return notFound(res, "No pincodes matched.");
  success(res, r, { count: r.length });
});

app.get("/pincodes/:pincode/full", (req, res) => {
  const { pincode } = req.params;
  if (!/^\d{6}$/.test(pincode)) return badRequest(res, "Pincode must be 6 digits.");
  const entry = byPincode[pincode];
  if (!entry) return notFound(res, `Pincode ${pincode} not found.`);
  const radius = Math.min(parseInt(req.query.radius) || 2000, 10000);
  const limit = Math.min(parseInt(req.query.limit) || 5, 20);
  const siblings = byDistrict[entry.district.toLowerCase()]
    .filter((p) => p.pincode !== entry.pincode)
    .map((p) => ({ pincode: p.pincode, digipin: p.digipin, localities: p.localities.slice(0, 3) }));
  const nearby = buildNearbyPois(entry, { radius, limit });
  res.json({
    success: true,
    data: {
      identity: { pincode: entry.pincode, digipin: entry.digipin },
      geography: { centroid: entry.centroid, timezone: entry.timezone, utc_offset: entry.utc_offset },
      postal: { district: entry.district, division: entry.division, region: entry.region, circle: entry.circle, post_offices: entry.post_offices },
      civic: { state: entry.state, state_code: entry.state_code, country: entry.country, country_code: entry.country_code, municipal_corporation: entry.municipal_corporation, municipal_zone: entry.municipal_zone },
      political: { lok_sabha_constituency: entry.lok_sabha_constituency, vidhan_sabha_constituency: entry.vidhan_sabha_constituency },
      codes: { std_code: entry.std_code, gst_state_code: entry.gst_state_code },
      localities: entry.localities,
      nearby: { radius_meters: radius, ...nearby },
      sibling_pincodes: siblings,
      data_confidence: entry.data_confidence,
    },
    meta: {
      data_sources: ["India Post (pincode/division)", "India Post DIGIPIN spec", "ECI (Lok Sabha mapping)", ...poisData.metadata.data_sources],
      last_updated: poisData.metadata.last_updated,
      unverified_fields: ["vidhan_sabha_constituency", "municipal_zone", "post_office.address"],
    },
  });
});

app.get("/pincodes/:pincode/validate", (req, res) => {
  const { pincode } = req.params;
  if (!/^\d{6}$/.test(pincode)) return badRequest(res, "Pincode must be 6 digits.");
  const v = !!byPincode[pincode];
  res.json({ success: true, pincode, valid: v, message: v ? `${pincode} is valid.` : `${pincode} is not recognised.` });
});

app.get("/pincodes/:pincode/digipin", (req, res) => {
  const e = byPincode[req.params.pincode];
  if (!e) return notFound(res, `Pincode ${req.params.pincode} not found.`);
  res.json({ success: true, data: { pincode: e.pincode, digipin: e.digipin, centroid: e.centroid } });
});

app.get("/pincodes/:pincode/nearby", (req, res) => {
  const entry = byPincode[req.params.pincode];
  if (!entry) return notFound(res, `Pincode ${req.params.pincode} not found.`);
  const radius = Math.min(parseInt(req.query.radius) || 2000, 10000);
  const limit = Math.min(parseInt(req.query.limit) || 5, 20);
  const types = (req.query.types || "metro_station,bus_stop,landmark").split(",").map((t) => t.trim());
  const grouped = buildNearbyPois(entry, { radius, limit, types });
  res.json({
    status: "success", pincode: entry.pincode,
    center: { locality: entry.localities[0], district: entry.district, state: "Delhi", lat: entry.centroid.lat, lng: entry.centroid.lng, digipin: entry.digipin },
    radius_meters: radius, results: grouped,
    meta: { data_sources: poisData.metadata.data_sources, last_updated: poisData.metadata.last_updated },
  });
});

app.get("/pincodes/:pincode", (req, res) => {
  const { pincode } = req.params;
  if (!/^\d{6}$/.test(pincode)) return badRequest(res, "Pincode must be 6 digits.");
  if (!pincode.startsWith("11")) return badRequest(res, "This API only covers Delhi pincodes.");
  const e = byPincode[pincode];
  if (!e) return notFound(res, `Pincode ${pincode} not found in Delhi.`);
  success(res, e);
});

// ─── LOCALITIES ──────────────────────────────────────────────────────────────
app.get("/localities", (req, res) => {
  const all = [...new Set(pincodes.flatMap((p) => p.localities))].sort();
  success(res, all, { count: all.length });
});

app.get("/localities/search", (req, res) => {
  const q = req.query.q;
  if (!q || q.trim().length < 2) return badRequest(res, "Provide at least 2 chars in ?q=");
  const term = q.toLowerCase();
  const matches = [];
  for (const [locKey, entries] of Object.entries(byLocality)) {
    if (locKey.includes(term)) {
      for (const e of entries) {
        matches.push({ locality: e.localities.find((l) => l.toLowerCase() === locKey), pincode: e.pincode, district: e.district, digipin: e.digipin, lat: e.centroid.lat, lng: e.centroid.lng });
      }
    }
  }
  if (matches.length === 0) return notFound(res, `No localities matching "${q}".`);
  const seen = new Set();
  const unique = matches.filter((m) => {
    const k = `${m.pincode}-${m.locality}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  success(res, unique, { count: unique.length });
});

// ─── SEARCH ──────────────────────────────────────────────────────────────────
app.get("/search", (req, res) => {
  const q = req.query.q;
  if (!q || q.trim().length < 2) return badRequest(res, "Provide at least 2 chars in ?q=");
  const limit = Math.min(parseInt(req.query.limit) || 10, 25);
  const threshold = parseFloat(req.query.threshold) || 0.55;
  let nearLat = null, nearLng = null;
  if (req.query.near) {
    const [a, b] = req.query.near.split(",").map(parseFloat);
    if (!isNaN(a) && !isNaN(b)) { nearLat = a; nearLng = b; }
  }
  const t0 = Date.now();
  const cands = [];
  for (const e of pincodes) {
    for (const loc of e.localities) {
      const s = simScore(q, loc);
      if (s >= threshold) cands.push({ type: "locality", name: loc, pincode: e.pincode, district: e.district, digipin: e.digipin, lat: e.centroid.lat, lng: e.centroid.lng, match_score: s, match_type: matchType(s) });
    }
    for (const po of e.post_offices) {
      const s = simScore(q, po.name);
      if (s >= threshold) cands.push({ type: "post_office", name: po.name, office_type: po.type, delivery: po.delivery, pincode: e.pincode, district: e.district, digipin: po.digipin, lat: e.centroid.lat, lng: e.centroid.lng, match_score: s, match_type: matchType(s) });
    }
  }
  for (const ms of metro_stations) {
    const s = simScore(q, ms.name);
    if (s >= threshold) cands.push({ type: "metro_station", name: ms.name, lines: ms.lines, pincode: ms.pincode, lat: ms.lat, lng: ms.lng, match_score: s, match_type: matchType(s) });
  }
  for (const lm of landmarks) {
    const s = simScore(q, lm.name);
    if (s >= threshold) cands.push({ type: "landmark", name: lm.name, category: lm.category, pincode: lm.pincode, lat: lm.lat, lng: lm.lng, match_score: s, match_type: matchType(s) });
  }
  if (nearLat !== null) {
    for (const c of cands) {
      const dKm = haversine(nearLat, nearLng, c.lat, c.lng);
      const boost = Math.max(0, 0.15 * (1 - Math.min(dKm / 10, 1)));
      c.distance_km = +dKm.toFixed(2);
      c.match_score = +Math.min(1, c.match_score + boost).toFixed(2);
      c.match_type = matchType(c.match_score);
    }
  }
  const prio = { locality: 1, metro_station: 2, post_office: 3, landmark: 4 };
  cands.sort((a, b) => b.match_score - a.match_score || (prio[a.type]||9) - (prio[b.type]||9));
  const seen = new Set();
  const deduped = cands.filter((c) => {
    const k = `${c.type}:${c.name.toLowerCase()}:${c.pincode}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  const results = deduped.slice(0, limit);
  const exactish = results.filter((r) => r.match_score >= 0.95);
  const disambig = exactish.length >= 2 && exactish[0].pincode !== exactish[1].pincode;
  const dym = results.length > 0 && results[0].match_score < 0.95 && results[0].match_score >= 0.75 ? results[0].name : null;
  const status = results.length === 0 ? "no_match" : results[0].match_score >= 0.95 ? "success" : "partial_match";
  res.json({
    status, query: q, interpreted_as: q.toLowerCase().trim(),
    total_matches: results.length, disambiguation_required: disambig, results,
    suggestions: {
      did_you_mean: dym,
      disambiguation_warning: disambig ? "Multiple high-confidence matches in different pincodes." : null,
      narrow_by: disambig ? exactish.slice(0, 4).map((r) => ({ label: `${r.name} (${r.district || r.pincode})`, query: `${r.name} ${r.district || ""}`.trim(), pincode: r.pincode })) : [],
    },
    meta: { search_time_ms: Date.now() - t0, algorithm: "trigram + levenshtein + suffix-aware", threshold, geo_biased: nearLat !== null },
  });
});

// ─── DISTRICTS / CONSTITUENCIES ──────────────────────────────────────────────
app.get("/districts", (req, res) => {
  const summary = {};
  for (const e of pincodes) {
    if (!summary[e.district]) summary[e.district] = { district: e.district, pincode_count: 0, pincodes: [] };
    summary[e.district].pincode_count++;
    summary[e.district].pincodes.push(e.pincode);
  }
  success(res, Object.values(summary).sort((a, b) => a.district.localeCompare(b.district)));
});

app.get("/districts/:district", (req, res) => {
  const key = req.params.district.toLowerCase().replace(/-/g, " ");
  const r = Object.entries(byDistrict).filter(([k]) => k.includes(key)).flatMap(([, v]) => v);
  if (r.length === 0) return notFound(res, `No pincodes for district "${req.params.district}".`);
  success(res, r, { count: r.length });
});

app.get("/constituencies/lok-sabha", (req, res) => {
  const s = {};
  for (const e of pincodes) {
    const n = e.lok_sabha_constituency;
    if (!n) continue;
    if (!s[n]) s[n] = { constituency: n, pincode_count: 0, pincodes: [] };
    s[n].pincode_count++; s[n].pincodes.push(e.pincode);
  }
  success(res, Object.values(s).sort((a, b) => a.constituency.localeCompare(b.constituency)));
});

app.get("/constituencies/lok-sabha/:name", (req, res) => {
  const key = req.params.name.toLowerCase().replace(/-/g, " ");
  const r = byLokSabha[key] || [];
  if (r.length === 0) return notFound(res, `No pincodes for LS constituency "${req.params.name}".`);
  success(res, r, { count: r.length, constituency: r[0].lok_sabha_constituency });
});

// ─── REVERSE GEO / POIS / BULK ───────────────────────────────────────────────
app.get("/nearby", (req, res) => {
  const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
  const limit = Math.min(parseInt(req.query.limit) || 5, 20);
  if (isNaN(lat) || isNaN(lng)) return badRequest(res, "Provide valid ?lat= and ?lng=");
  if (lat < 28.4 || lat > 28.9 || lng < 76.8 || lng > 77.5)
    return badRequest(res, "Coordinates outside Delhi bounds.");
  const r = pincodes.map((p) => ({ ...p, distance_km: +haversine(lat, lng, p.centroid.lat, p.centroid.lng).toFixed(2) }))
    .sort((a, b) => a.distance_km - b.distance_km).slice(0, limit);
  success(res, r, { count: r.length, query: { lat, lng, limit } });
});

app.get("/pois", (req, res) => {
  let r = allPois;
  if (req.query.type) r = r.filter((p) => p.type === req.query.type);
  if (req.query.pincode) r = r.filter((p) => p.pincode === req.query.pincode);
  if (r.length === 0) return notFound(res, "No POIs matched.");
  success(res, r, { count: r.length });
});

app.post("/bulk", (req, res) => {
  const { pincodes: req_pins } = req.body;
  if (!Array.isArray(req_pins) || req_pins.length === 0)
    return badRequest(res, 'Provide { "pincodes": ["110001"] }');
  if (req_pins.length > 50) return badRequest(res, "Max 50 pincodes per request.");
  const r = req_pins.map((p) => {
    const s = String(p);
    if (!/^\d{6}$/.test(s)) return { pincode: s, found: false, error: "Invalid format" };
    const e = byPincode[s];
    return e ? { ...e, found: true } : { pincode: s, found: false };
  });
  const found = r.filter((x) => x.found).length;
  success(res, r, { total: r.length, found, not_found: r.length - found });
});

app.use((req, res) => res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found.` }));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Delhi Pincode API v3.0 on http://localhost:${PORT}`);
    console.log(`${pincodes.length} pincodes (with DIGIPIN), ${allPois.length} POIs.`);
  });
}

module.exports = app;