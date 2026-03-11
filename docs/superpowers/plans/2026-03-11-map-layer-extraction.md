# Map Layer Config Extraction Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** Extract inline Mapbox layer configuration objects from 3 large view files into standalone config files, reducing ~755 LOC from views.

**Architecture:** Pure data files exporting layer/source config objects. No logic changes — just moving config to dedicated files.

---

### Task 1: Extract BusinessActivity map layers

**Files:**
- Read: `src/views/BusinessActivity/BusinessActivity.tsx` (1217 LOC)
- Create: `src/views/BusinessActivity/mapLayers.ts`

- [ ] **Step 1:** Read BusinessActivity.tsx and identify ALL Mapbox layer configurations — these are the objects passed to `useMapLayer` calls (source configs, paint configs, layout configs). Also look for inline layer style objects, heatmap paint definitions, circle paint definitions. This view has 3 map layers (openings heatmap, closures heatmap, circle dots at high zoom) — approximately 326 LOC of config.

- [ ] **Step 2:** Create `mapLayers.ts` and move all layer config objects there as named exports. Use clear names like `OPENINGS_HEATMAP_PAINT`, `CLOSURES_HEATMAP_PAINT`, `CIRCLE_LAYER_PAINT`, etc. Include source configs if they're also inline.

- [ ] **Step 3:** Update BusinessActivity.tsx to import from `./mapLayers`. The `useMapLayer` calls stay in the view — only the config objects move.

- [ ] **Step 4:** Verify: `npx tsc --noEmit`

### Task 2: Extract TrafficSafety map layers

**Files:**
- Read: `src/views/TrafficSafety/TrafficSafety.tsx` (1156 LOC)
- Create: `src/views/TrafficSafety/mapLayers.ts`

- [ ] **Step 1:** Read TrafficSafety.tsx. Identify map layer configs (~318 LOC) — this view has heatmap, anomaly choropleth, circle layers, and possibly speed camera overlay configs. Also look for tooltip formatting functions that are tightly coupled to map layers.

- [ ] **Step 2:** Create `mapLayers.ts` with all layer config exports. If tooltip format functions reference only layer data (not React state), move them too. If they reference component state, leave them in the view.

- [ ] **Step 3:** Update imports in TrafficSafety.tsx.

- [ ] **Step 4:** Verify: `npx tsc --noEmit`

### Task 3: Extract EmergencyResponse map layers

**Files:**
- Read: `src/views/EmergencyResponse/EmergencyResponse.tsx` (1063 LOC)
- Create: `src/views/EmergencyResponse/mapLayers.ts`

- [ ] **Step 1:** Read EmergencyResponse.tsx. Identify map layer configs (~111 LOC) — typically heatmap + circle layers for fire/EMS incidents.

- [ ] **Step 2:** Create `mapLayers.ts` with exports.

- [ ] **Step 3:** Update imports.

- [ ] **Step 4:** Verify: `npx tsc --noEmit`

### Task 4: Final verification and commit

- [ ] **Step 1:** Run `pnpm build` — must pass
- [ ] **Step 2:** Commit:
```bash
git add -A
git commit -m "refactor: extract map layer configs from 3 largest views"
```
