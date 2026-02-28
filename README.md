# DataDiver

**Civic data visualization platform for San Francisco open data.**

Explore emergency response patterns, parking revenue flows, and neighborhood-level insights through interactive heatmaps and charts — all powered by the city's public Socrata API.

## Features

- **Emergency Response** — Heatmap of SFFD dispatch data with response time statistics, D3 histogram, and neighborhood ranking (avg/median/90th percentile)
- **Parking Revenue** — Cyan heatmap of meter revenue with payment method breakdown and top-earning neighborhoods
- **Date Range Picker** — Preset buttons (7d / 30d / 90d / YTD) plus custom range selection
- **Shareable URLs** — Date range and filters encoded in URL params for bookmarking and sharing
- **PNG Export** — One-click screenshot of the current map view via html2canvas
- **Neighborhood Zoom** — Click any neighborhood in the sidebar to fly the map to that area
- **Hover Tooltips** — Mouseover data points for response time, call type, revenue, and location details
- **Dark / Light Mode** — Full theme toggle with Mapbox basemap switching

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Bundler | Vite 7 |
| Styling | Tailwind CSS v4 |
| Maps | Mapbox GL JS v3 |
| Charts | D3.js |
| State | Zustand |
| Routing | React Router v6 |
| Export | html2canvas |
| Data | SF Open Data (Socrata SODA API) |

## Getting Started

### Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) (or npm/yarn)
- A free [Mapbox access token](https://account.mapbox.com/access-tokens/)

### Setup

```bash
git clone https://github.com/sfbay/datadiver.git
cd datadiver
pnpm install
```

Create a `.env` file in the project root:

```env
VITE_MAPBOX_TOKEN=your_mapbox_token_here
VITE_SOCRATA_APP_TOKEN=        # optional — higher rate limits
```

### Run

```bash
pnpm dev
```

Open [http://localhost:5174](http://localhost:5174).

## Project Structure

```
src/
  api/            # Socrata SODA API client + dataset configs
  components/
    charts/       # D3 visualizations (ResponseHistogram)
    export/       # PNG export button
    filters/      # Date range picker
    layout/       # AppShell (sidebar + navigation)
    maps/         # MapView (Mapbox GL wrapper)
    ui/           # StatCard, reusable primitives
  hooks/
    useDataset    # Fetch + cache Socrata data
    useMapLayer   # Reactive GeoJSON → Mapbox layer binding
    useMapTooltip # Hover popups on map features
    useUrlSync    # Bi-directional URL param sync
  stores/         # Zustand state (date range, theme, sidebar)
  views/
    Home/              # Landing page with exploration cards
    EmergencyResponse/ # Fire/EMS dispatch heatmap + stats
    ParkingRevenue/    # Meter revenue heatmap + breakdown
  utils/          # Colors, geo, time formatting
```

## Data Sources

All data is fetched live from [data.sfgov.org](https://data.sfgov.org) via the Socrata SODA API:

| Dataset | Endpoint | Description |
|---------|----------|-------------|
| Fire/EMS Dispatch | `nuek-vuh3` | Dispatch timestamps with 7-stage response pipeline |
| Parking Revenue | `imvp-dq3v` | Per-transaction meter payments |
| Parking Meters | `8vzz-qzz9` | Meter inventory with lat/lng coordinates |

## Architecture Notes

**Mapbox GL v3 + React**: The map lifecycle is tricky — Mapbox's `load` and `style.load` events are unreliable in React. `useMapLayer` bypasses event-based waiting entirely: it tries to add sources/layers immediately and catches errors with a retry loop. `MapView` calls `onMapReady` synchronously after map creation.

**Client-side geo-join**: Parking transactions don't include coordinates. The app fetches the 50K meter inventory separately and joins transactions to meters via `post_id` to place them on the map.

## License

MIT
