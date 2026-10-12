import { useEffect, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Report } from "../types";
import { shortId } from "../api";

interface MappedCase {
  report: Report;
  category: string;
}

const categories: Record<string, { glyph: string; label: string; color: string }> = {
  fire: { glyph: "🔥", label: "Fire", color: "#b9472e" },
  medical: { glyph: "✚", label: "Medical", color: "#2877a6" },
  crime: { glyph: "⚑", label: "Police", color: "#987021" },
  women_safety: { glyph: "🛡", label: "Women’s safety", color: "#7a558f" },
  flood: { glyph: "≈", label: "Flood", color: "#267d85" },
  infrastructure: { glyph: "⚠", label: "Infrastructure", color: "#756b42" },
  unknown: { glyph: "•", label: "Other", color: "#53636b" },
};

const icons = Object.fromEntries(
  Object.entries(categories).map(([category, item]) => [
    category,
    L.divIcon({
      className: `department-map-marker department-map-marker-${category}`,
      html: `<span aria-hidden="true">${item.glyph}</span>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    }),
  ]),
);

function FitCases({ cases }: { cases: MappedCase[] }) {
  const map = useMap();
  useEffect(() => {
    const points = cases
      .filter(({ report }) => report.latitude != null && report.longitude != null)
      .map(({ report }) => [report.latitude!, report.longitude!] as [number, number]);
    if (points.length === 1) map.setView(points[0], 14);
    else if (points.length > 1) map.fitBounds(points, { padding: [32, 32], maxZoom: 14 });
    window.setTimeout(() => map.invalidateSize(), 100);
  }, [cases, map]);
  return null;
}

export function DepartmentCaseMap({
  cases,
  onSelect,
}: {
  cases: MappedCase[];
  onSelect: (reportId: string) => void;
}) {
  const [tileError, setTileError] = useState(false);
  const located = cases.filter(
    ({ report }) => report.latitude != null && report.longitude != null,
  );
  return (
    <section className="department-map-section" aria-label="Assigned incident locations">
      <div className="department-map-heading">
        <div>
          <span className="eyebrow">ASSIGNED CASES / MAP</span>
          <h2>Incidents on the ground.</h2>
        </div>
        <span>{located.length} located · {cases.length - located.length} without coordinates</span>
      </div>
      {located.length ? (
        <div className="map-frame department-map-frame">
          <MapContainer
            center={[22.78, 88.48]}
            zoom={10}
            scrollWheelZoom={false}
            attributionControl
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              eventHandlers={{ tileerror: () => setTileError(true) }}
            />
            <FitCases cases={located} />
            {located.map(({ report, category }) => {
              const marker = categories[category] || categories.unknown;
              return (
                <Marker
                  key={report.id}
                  position={[report.latitude!, report.longitude!]}
                  icon={icons[category] || icons.unknown}
                >
                  <Tooltip direction="top">{marker.glyph} {marker.label} · {shortId(report.id)}</Tooltip>
                  <Popup>
                    <strong>{marker.glyph} {marker.label} · {shortId(report.id)}</strong>
                    <p>{report.location_text || "Reported location"}</p>
                    <button onClick={() => onSelect(report.id)}>Open case →</button>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
          {tileError && (
            <div className="map-warning">
              Map tiles are unavailable. The category markers still show the saved incident coordinates.
            </div>
          )}
        </div>
      ) : (
        <div className="department-map-empty">
          No assigned cases have coordinates yet. Their reported place and time remain available in the case details.
        </div>
      )}
      <div className="department-map-legend">
        {Object.entries(categories).map(([category, item]) => (
          <span key={category}>
            <i style={{ backgroundColor: item.color }}>{item.glyph}</i>{item.label}
          </span>
        ))}
      </div>
    </section>
  );
}
