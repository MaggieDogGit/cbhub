import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const COUNTRY_COORDS: Record<string, [number, number]> = {
  "United States": [37.09, -95.71], "USA": [37.09, -95.71], "US": [37.09, -95.71],
  "United Kingdom": [55.37, -3.43], "UK": [55.37, -3.43], "GB": [55.37, -3.43],
  "Germany": [51.16, 10.45], "DE": [51.16, 10.45],
  "France": [46.22, 2.21], "FR": [46.22, 2.21],
  "Japan": [36.20, 138.25], "JP": [36.20, 138.25],
  "China": [35.86, 104.19], "CN": [35.86, 104.19],
  "Switzerland": [46.81, 8.22], "CH": [46.81, 8.22],
  "Netherlands": [52.13, 5.29], "NL": [52.13, 5.29],
  "Spain": [40.46, -3.74], "ES": [40.46, -3.74],
  "Italy": [41.87, 12.56], "IT": [41.87, 12.56],
  "Canada": [56.13, -106.34], "CA": [56.13, -106.34],
  "Australia": [-25.27, 133.77], "AU": [-25.27, 133.77],
  "Singapore": [1.35, 103.81], "SG": [1.35, 103.81],
  "Hong Kong": [22.39, 114.10], "HK": [22.39, 114.10],
  "Sweden": [60.12, 18.64], "SE": [60.12, 18.64],
  "Norway": [60.47, 8.46], "NO": [60.47, 8.46],
  "Denmark": [56.26, 9.50], "DK": [56.26, 9.50],
  "Belgium": [50.50, 4.46], "BE": [50.50, 4.46],
  "Austria": [47.51, 14.55], "AT": [47.51, 14.55],
  "Poland": [51.91, 19.14], "PL": [51.91, 19.14],
  "Brazil": [-14.23, -51.92], "BR": [-14.23, -51.92],
  "India": [20.59, 78.96], "IN": [20.59, 78.96],
  "South Africa": [-30.55, 22.93], "ZA": [-30.55, 22.93],
  "Mexico": [23.63, -102.55], "MX": [23.63, -102.55],
  "Turkey": [38.96, 35.24], "TR": [38.96, 35.24],
  "South Korea": [35.90, 127.76], "KR": [35.90, 127.76],
  "Russia": [61.52, 105.31], "RU": [61.52, 105.31],
  "UAE": [23.42, 53.84], "United Arab Emirates": [23.42, 53.84],
  "Saudi Arabia": [23.88, 45.07],
  "Israel": [31.04, 34.85],
  "Czech Republic": [49.81, 15.47],
  "Hungary": [47.16, 19.50],
  "Romania": [45.94, 24.96],
};

interface ResultRow {
  bankingGroup: string;
  hqCountry: string;
  currency: string;
  rtgs?: boolean;
  instant?: boolean;
  cls?: boolean;
}

interface Props {
  results: ResultRow[];
}

export default function CoverageMap({ results }: Props) {
  const countryGroups: Record<string, { banks: Set<string>; currencies: Set<string> }> = {};
  results.forEach(r => {
    if (!r.hqCountry) return;
    if (!countryGroups[r.hqCountry]) countryGroups[r.hqCountry] = { banks: new Set(), currencies: new Set() };
    countryGroups[r.hqCountry].banks.add(r.bankingGroup);
    countryGroups[r.hqCountry].currencies.add(r.currency);
  });

  const markers = Object.entries(countryGroups)
    .map(([country, data]) => {
      const coords = COUNTRY_COORDS[country];
      if (!coords) return null;
      return { country, coords, bankCount: data.banks.size, currencies: [...data.currencies], banks: [...data.banks] };
    })
    .filter(Boolean) as { country: string; coords: [number, number]; bankCount: number; currencies: string[]; banks: string[] }[];

  const maxCount = Math.max(...markers.map(m => m.bankCount), 1);

  return (
    <div style={{ height: 400 }} className="rounded-lg overflow-hidden">
      <MapContainer center={[20, 0]} zoom={2} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markers.map(m => (
          <CircleMarker
            key={m.country}
            center={m.coords}
            radius={6 + (m.bankCount / maxCount) * 18}
            pathOptions={{ fillColor: "#3b82f6", color: "#1d4ed8", weight: 1, fillOpacity: 0.7 }}
          >
            <Tooltip>
              <div className="text-xs">
                <div className="font-bold">{m.country}</div>
                <div>{m.bankCount} provider{m.bankCount !== 1 ? "s" : ""}</div>
                <div className="text-slate-500">{m.currencies.join(", ")}</div>
                <div className="mt-1">{m.banks.slice(0, 3).join(", ")}{m.banks.length > 3 ? ` +${m.banks.length - 3} more` : ""}</div>
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
