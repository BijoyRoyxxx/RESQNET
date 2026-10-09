import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Tooltip,
  useMap,
} from "react-leaflet";
import { LocateFixed, MapPin } from "lucide-react";
import type { Incident } from "../types";
import { shortId } from "../api";
import "leaflet/dist/leaflet.css";

const colors = { high: "#fa7776", medium: "#e5b565", low: "#43cdbb" };
function Fit({ incidents }: { incidents: Incident[] }) {
  const map = useMap();
  useEffect(() => {
    const points = incidents
      .filter((i) => i.latitude !== null && i.longitude !== null)
      .map((i) => [i.latitude!, i.longitude!] as [number, number]);
    if (points.length)
      map.fitBounds(points, { padding: [48, 48], maxZoom: 12 });
    const timer = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(timer);
  }, [map, incidents]);
  return null;
}
export function IncidentMap({
  incidents,
  onSelect,
  large = false,
}: {
  incidents: Incident[];
  onSelect: (id: string) => void;
  large?: boolean;
}) {
  const [tileError, setTileError] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const plotted = incidents.filter(
    (i) => i.latitude !== null && i.longitude !== null,
  );
  return (
    <div className={`map-frame ${large ? "map-large" : ""}`}>
      <MapContainer
        key={mapKey}
        center={[22.78, 88.48]}
        zoom={10}
        scrollWheelZoom={false}
        attributionControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          eventHandlers={{ tileerror: () => setTileError(true) }}
        />
        <Fit incidents={incidents} />
        {plotted.map((i) => (
          <CircleMarker
            key={i.id}
            center={[i.latitude!, i.longitude!]}
            radius={i.priority.level === "high" ? 11 : 7}
            pathOptions={{
              color: colors[i.priority.level],
              fillColor: colors[i.priority.level],
              fillOpacity: 0.32,
              weight: 2,
            }}
          >
            <Tooltip direction="top">
              {i.location_text || shortId(i.id)} · {i.incident_type}
            </Tooltip>
            <Popup>
              <strong>{i.location_text || "Unverified location"}</strong>
              <p>
                {i.incident_type} · {i.report_count} report(s)
              </p>
              <button onClick={() => onSelect(i.id)}>
                Open incident {shortId(i.id)} →
              </button>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="map-caption">
        <MapPin size={13} /> WEST BENGAL{" "}
        <span>
          {plotted.length} located / {incidents.length - plotted.length}{" "}
          unlocated
        </span>
      </div>
      <button
        className="map-reset"
        aria-label="Fit map to incidents"
        onClick={() => setMapKey((k) => k + 1)}
      >
        <LocateFixed size={18} />
      </button>
      {tileError && (
        <div className="map-warning">
          Basemap unavailable. Incident coordinates remain visible; internet is
          required for map tiles.
        </div>
      )}
    </div>
  );
}
