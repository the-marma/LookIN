# Contributing to LookIN

LookIN is Delhi-first but built to scale to all of India. The fastest way to get there is contributors adding their own city's data.

---

## Ways to contribute

### 1. Add pincodes for a new city
This is the highest-impact contribution. Each pincode entry needs:

```json
{
  "pincode": "400001",
  "state": "Maharashtra",
  "state_code": "MH",
  "circle": "Mumbai",
  "region": "Mumbai",
  "division": "Mumbai City",
  "district": "Mumbai City",
  "municipal_corporation": "BMC",
  "lok_sabha": "Mumbai South",
  "vidhan_sabha": "Colaba",
  "std_code": "022",
  "gst_state_code": "27",
  "timezone": "Asia/Kolkata",
  "lat": 18.9322,
  "lng": 72.8264,
  "localities": ["Colaba", "Regal Cinema", "Gateway of India"],
  "post_offices": [
    { "name": "COLABA", "type": "HEAD OFFICE", "delivery": true, "lat": 18.9067, "lng": 72.8147 }
  ]
}
```

Add entries to `data/pincodes.json` and open a PR.

**Data sources to use:**
- Pincode → post offices: [India Post](https://www.indiapost.gov.in/vas/pages/findpincode.aspx)
- Coordinates: [OpenStreetMap](https://www.openstreetmap.org) or [Bhuvan](https://bhuvan.nrsc.gov.in)
- Lok Sabha / Vidhan Sabha: [ECI](https://eci.gov.in)
- GST state codes: [GSTN](https://www.gst.gov.in)

### 2. Fix incorrect data
Found a wrong coordinate, a misspelled locality, or an outdated constituency name? Open an issue or PR directly.

### 3. Add POIs for existing pincodes
Metro stations, bus stops, hospitals, markets. POI data lives in `data/pois.json`. Match the existing schema.

### 4. Fix bugs or improve endpoints
Check open [Issues](https://github.com/the-marma/LookIN/issues). Good first issues are labelled `good first issue`.

---

## PR checklist

- [ ] Data follows the existing JSON schema exactly
- [ ] Coordinates verified (not guessed)
- [ ] Sources cited in the PR description
- [ ] `npm start` runs without errors locally

---

## Data quality standard

LookIN uses a `data_confidence` system:

| Label | Meaning |
|-------|---------|
| `authoritative` | From an official government source |
| `computed` | Algorithmically derived (e.g. DIGIPIN) |
| `approximate` | Best available estimate |
| `unverified` | Placeholder — needs a real source |

Please don't submit `unverified` data as `authoritative`. Honest gaps are better than silent errors.

---

## Questions

Open an issue or reach out via the repo. All contributions welcome. even a single pincode helps.
