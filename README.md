# LookIN

**India's missing address API.** One call, any Delhi pincode, validated data, DIGIPIN, coordinates, constituencies, nearby metro & bus stops, and a confidence label on every field.

🔗 **Live API:** `https://lookin-1lmz.onrender.com`
📖 **Docs:** `https://lookinn.netlify.app`

## Why

Every Indian developer building a checkout form, KYC flow, or logistics feature has the same problem. India Post's pincode data is a raw CSV with no geo enrichment, no confidence signals, and no API. Existing third-party options are undocumented, slow, or dead.

LookIN fixes that. Free, open-source, and honest about what it knows.

## What you get per pincode

- ✅ Validated pincode + DIGIPIN (India Post's official geocode, computed live)
- 📍 Coordinates with source label (`authoritative` / `approximate_centroid`)
- 🏛️ District, division, region, circle, state
- 🗳️ Lok Sabha constituency
- 🏣 Post offices with delivery status
- 🚇 Nearby metro stations with line names and walking time
- 🚌 Nearby bus stops and landmarks
- 🔬 `data_confidence` on every field — no silent nulls

## Quick start

```bash
# Pincode lookup
curl https://lookin-1lmz.onrender.com/pincodes/110001

# Full record — everything in one call
curl 'https://lookin-1lmz.onrender.com/pincodes/110001/full?radius=2000&limit=5'

# DIGIPIN encode
curl 'https://lookin-1lmz.onrender.com/digipin/encode?lat=28.622788&lng=77.213033'

# Locality search
curl 'https://lookin-1lmz.onrender.com/localities/search?q=hauz+khas'

# Bulk lookup
curl -X POST https://lookin-1lmz.onrender.com/bulk \
  -H 'Content-Type: application/json' \
  -d '{"pincodes":["110001","110016","110049"]}'
```

---

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/pincodes` | List / filter pincodes (`?district=` `?q=`) |
| GET | `/pincodes/:pincode` | Single pincode core record |
| GET | `/pincodes/:pincode/full` | Everything — postal + civic + POIs |
| GET | `/pincodes/:pincode/validate` | Existence check |
| GET | `/pincodes/:pincode/nearby` | POIs within radius |
| GET | `/pincodes/:pincode/digipin` | Just the DIGIPIN |
| GET | `/digipin/encode?lat=&lng=` | Coordinates → DIGIPIN |
| GET | `/digipin/decode?code=` | DIGIPIN → coordinates |
| GET | `/localities` | All localities |
| GET | `/localities/search?q=` | Locality fuzzy search |
| GET | `/search?q=` | Universal fuzzy search |
| GET | `/districts` | All districts |
| GET | `/districts/:district` | Pincodes in district |
| GET | `/constituencies/lok-sabha` | All LS constituencies |
| GET | `/constituencies/lok-sabha/:name` | Pincodes in constituency |
| GET | `/nearby?lat=&lng=` | Reverse geocode |
| GET | `/pois` | List / filter POIs |
| POST | `/bulk` | Bulk lookup (up to 50) |

---

## Data sources

- **Pincode data** — India Post
- **DIGIPIN** — India Post official spec (March 2025), Apache 2.0 — verified against Dak Bhawan reference `(28.622788, 77.213033) → 39J-49L-L8T4`
- **Metro stations** — DMRC
- **Bus stops** — DTC
- **Points of interest** — OpenStreetMap
- **Lok Sabha mapping** — Election Commission of India

---

## Coverage

**Delhi only — 77 pincodes, 7 Lok Sabha constituencies, 100 POIs.**

All-India expansion is the goal. See [CONTRIBUTING.md](CONTRIBUTING.md) to add your city.

---

## Run locally

```bash
git clone https://github.com/the-marma/LookIN.git
cd LookIN
npm install
npm start
# → http://localhost:3000
```

---

## Contributing

Want to add pincodes for Mumbai, Bangalore, or your city? See **[CONTRIBUTING.md](CONTRIBUTING.md)**.

---

## License

MIT
