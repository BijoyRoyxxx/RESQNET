import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import {
  Copy,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
} from "lucide-react";
import { api } from "../api";
import type { Report } from "../types";
import { Button } from "./ui/button";
import { LiveLocation } from "./LiveLocation";
import type { Category } from "../types";
import "leaflet/dist/leaflet.css";

export interface Facility {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  phone: string | null;
  address: string;
  kind: string;
  source_url: string;
  connected: boolean;
}
export interface NearbyResult {
  id: string;
  latitude: number;
  longitude: number;
  service: string;
  facilities: Facility[];
  radius_km: number;
  routing_reason: string;
  notice: string;
  cached: boolean;
  created_at: string;
}
export interface ResponderAlert {
  id: string;
  facility_id: string;
  facility: Facility;
  status: string;
  message: string;
  connected: boolean;
}
const statusLabels: Record<string, string> = {
  prepared_not_sent: "Prepared only. No alert sent.",
  sending:
    "Delivery attempt started; acknowledgment not recorded. Do not assume receipt.",
  delivered_to_gateway:
    "Delivered to configured gateway. Station acknowledgment and response are not confirmed.",
  rejected_by_gateway: "Gateway rejected the alert. No response is confirmed.",
  delivery_unknown: "Delivery is unknown. Do not assume help is on the way.",
};

function FitServices({
  result,
  selected,
}: {
  result: NearbyResult;
  selected: Facility | undefined;
}) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(
      [
        [result.latitude, result.longitude],
        ...(selected
          ? [[selected.latitude, selected.longitude] as [number, number]]
          : result.facilities.map(
              (f) => [f.latitude, f.longitude] as [number, number],
            )),
      ],
      { padding: [40, 40], maxZoom: 15 },
    );
  }, [map, result, selected]);
  return null;
}

export function NearbyHelp({
  report,
  category,
  initialText = "",
  initialLatitude = "",
  initialLongitude = "",
  compact = false,
  autoSearch = false,
  onSelection,
}: {
  report?: Report;
  category?: Category;
  initialText?: string;
  initialLatitude?: string;
  initialLongitude?: string;
  compact?: boolean;
  onSelection?: (result: NearbyResult, facility: Facility) => void;
  autoSearch?: boolean;
}) {
  const [text, setText] = useState(report?.text || initialText);
  const [latitude, setLatitude] = useState(
    report?.latitude?.toString() || initialLatitude,
  );
  const [longitude, setLongitude] = useState(
    report?.longitude?.toString() || initialLongitude,
  );
  const [service, setService] = useState("auto");
  const [radius, setRadius] = useState("10");
  const [result, setResult] = useState<NearbyResult>();
  const [selectedId, setSelectedId] = useState("");
  const [alerts, setAlerts] = useState<ResponderAlert[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [tileError, setTileError] = useState(false);
  const sequence = useRef(0);
  const searchedAutomatically = useRef(false);
  const selected = result?.facilities.find((f) => f.id === selectedId);
  const alert = alerts.find((a) => a.facility_id === selectedId);
  const dirty =
    !!result &&
    (Number(latitude) !== result.latitude ||
      Number(longitude) !== result.longitude ||
      (service !== "auto" && service !== result.service) ||
      Number(radius) !== result.radius_km);
  useEffect(() => {
    if (!report) return;
    let active = true;
    api<ResponderAlert[]>(`/reports/${report.id}/alerts`)
      .then((items) => {
        if (active)
          setAlerts((current) => [
            ...current,
            ...items.filter(
              (item) => !current.some((saved) => saved.id === item.id),
            ),
          ]);
      })
      .catch(() => {
        if (active)
          setError(
            "Saved alert history could not be loaded. Refresh before preparing another alert.",
          );
      });
    return () => {
      active = false;
    };
  }, [report]);
  const search = useCallback(async () => {
    setError("");
    setNote("");
    setConsent(false);
    if (
      latitude.trim() === "" ||
      longitude.trim() === "" ||
      !Number.isFinite(Number(latitude)) ||
      !Number.isFinite(Number(longitude))
    ) {
      setError("Share your location or enter both coordinates first.");
      return;
    }
    const ticket = ++sequence.current;
    setBusy("Finding mapped services");
    try {
      const found = await api<NearbyResult>("/services/nearby", {
        method: "POST",
        body: JSON.stringify({
          latitude: Number(latitude),
          longitude: Number(longitude),
          text,
          service,
          category: category ?? report?.category,
          radius_km: Number(radius),
        }),
      });
      if (ticket !== sequence.current) return;
      setResult(found);
      setSelectedId(found.facilities[0]?.id || "");
      if (found.facilities[0]) onSelection?.(found, found.facilities[0]);
      if (autoSearch && report && found.facilities[0]) {
        try {
          const prepared = await api<ResponderAlert>(
            `/reports/${report.id}/alerts`,
            {
              method: "POST",
              body: JSON.stringify({
                search_id: found.id,
                facility_id: found.facilities[0].id,
              }),
            },
          );
          setAlerts((previous) => [
            prepared,
            ...previous.filter((a) => a.id !== prepared.id),
          ]);
        } catch (e) {
          setError(
            `Nearby services found, but no contact alert was prepared: ${(e as Error).message}`,
          );
        }
      }
    } catch (e) {
      setResult(undefined);
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }, [
    latitude,
    longitude,
    text,
    service,
    category,
    radius,
    onSelection,
    autoSearch,
    report,
  ]);
  useEffect(() => {
    if (!autoSearch || searchedAutomatically.current) return;
    const timer = window.setTimeout(() => {
      searchedAutomatically.current = true;
      void search();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoSearch, search]);
  async function prepare() {
    if (!report || !result || !selected || dirty) return;
    setBusy("Preparing contact alert");
    setError("");
    try {
      const prepared = await api<ResponderAlert>(
        `/reports/${report.id}/alerts`,
        {
          method: "POST",
          body: JSON.stringify({
            search_id: result.id,
            facility_id: selected.id,
          }),
        },
      );
      setAlerts((previous) => [
        prepared,
        ...previous.filter((a) => a.id !== prepared.id),
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function send() {
    if (!alert || !consent || dirty) return;
    setBusy("Sending to configured gateway");
    setError("");
    try {
      const sent = await api<ResponderAlert>(`/alerts/${alert.id}/send`, {
        method: "POST",
        body: JSON.stringify({ consent: true }),
      });
      setAlerts((previous) =>
        previous.map((a) => (a.id === sent.id ? sent : a)),
      );
    } catch (e) {
      setError((e as Error).message);
      if (report) {
        try {
          setAlerts(
            await api<ResponderAlert[]>(`/reports/${report.id}/alerts`),
          );
        } catch {
          /* Existing state remains visible if the API is unavailable. */
        }
      }
    } finally {
      setBusy("");
    }
  }
  return (
    <section className={`nearby-help ${compact ? "nearby-compact" : ""}`}>
      <div className="nearby-title">
        <div>
          <span className="eyebrow cyan">THE NEXT POINT OF CONTACT</span>
          <h2>Find help close to the incident.</h2>
          <p>
            Fire brigade for fires. Nearby hospitals for medical emergencies.
            Police for general cases. Distances use the incident location.
          </p>
        </div>
        <ShieldCheck size={32} />
      </div>
      <div
        className="service-routing"
        aria-label="Emergency service categories"
      >
        {[
          ["fire", "01", "Fire emergency", "Nearest fire brigade"],
          ["medical", "02", "Medical emergency", "Nearest hospital"],
          ["police", "03", "General / crime", "Nearest police station"],
        ].map(([value, order, title, destination]) => (
          <button
            type="button"
            key={value}
            className={`route-tile route-${value} ${service === value ? "selected" : ""}`}
            onClick={() => {
              setService(value);
              setResult(undefined);
            }}
          >
            <span>{order}</span>
            <strong>{title}</strong>
            <small>{destination} ↗</small>
          </button>
        ))}
      </div>
      <div className="nearby-search panel">
        {!report && (
          <div className="field">
            <label htmlFor="help-problem">What kind of help do you need?</label>
            <textarea
              id="help-problem"
              value={text}
              maxLength={10000}
              rows={2}
              onChange={(e) => {
                setText(e.target.value);
                setResult(undefined);
              }}
              placeholder="e.g. My car was stolen near Barasat station"
            />
          </div>
        )}
        {report?.latitude != null && report?.longitude != null ? (
          <p className="notice">
            Using the report's saved incident location. Finding nearby services
            does not contact them.
          </p>
        ) : (
          <LiveLocation
            onLocation={(fix) => {
              setLatitude(fix.latitude.toFixed(6));
              setLongitude(fix.longitude.toFixed(6));
            }}
          />
        )}
        <div className="form-row">
          <div className="field">
            <label htmlFor="help-latitude">Incident latitude</label>
            <input
              id="help-latitude"
              type="number"
              step="any"
              min={-90}
              max={90}
              value={latitude}
              readOnly={report?.latitude != null && report?.longitude != null}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="help-longitude">Incident longitude</label>
            <input
              id="help-longitude"
              type="number"
              step="any"
              min={-180}
              max={180}
              value={longitude}
              readOnly={report?.latitude != null && report?.longitude != null}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="help-service">Service needed</label>
            <select
              id="help-service"
              value={service}
              onChange={(e) => {
                setService(e.target.value);
                setResult(undefined);
              }}
            >
              <option value="auto">Suggest from the problem</option>
              <option value="police">Police station</option>
              <option value="fire">Fire brigade</option>
              <option value="medical">Nearest hospital</option>
              <option value="rescue">Flood / disaster rescue center</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="help-radius">Search radius</label>
            <select
              id="help-radius"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
            >
              {[5, 10, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n} km
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="nearby-search-action">
          <p>
            Search shares these coordinates and the service type with
            OpenStreetMap's Overpass provider. Your problem text stays on this
            server.
          </p>
          <Button type="button" onClick={() => void search()} disabled={!!busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <MapPin size={16} />
            )}
            Find nearest service
          </Button>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <>
          <p className="routing-note">
            <b>
              {
                {
                  police: "Police stations",
                  fire: "Fire brigades",
                  rescue: "Rescue centers",
                  medical: "Hospitals",
                }[result.service]
              }
            </b>{" "}
            · {result.routing_reason}
          </p>
          {dirty && (
            <div className="notice">
              Location or search settings changed. Results below use the
              previous coordinates. Search again to update distances.
            </div>
          )}
          {result.facilities.length === 0 ? (
            <div className="empty-state panel">
              <MapPin size={26} />
              <h3>No mapped service found within {result.radius_km} km</h3>
              <p>
                This does not mean no service exists. Try a larger radius or
                another service.
              </p>
            </div>
          ) : (
            <div className="nearby-results">
              <div className="facility-list">
                {result.facilities.map((facility, index) => (
                  <button
                    type="button"
                    key={facility.id}
                    className={`facility-row panel ${selectedId === facility.id ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedId(facility.id);
                      setConsent(false);
                      onSelection?.(result, facility);
                    }}
                  >
                    <span className="eyebrow">
                      {index === 0
                        ? "NEAREST MAPPED RESULT"
                        : `OPTION ${index + 1}`}{" "}
                      · {facility.kind.replaceAll("_", " ")}
                    </span>
                    <strong>{facility.name}</strong>
                    <div>
                      <b>
                        {facility.distance_km < 1
                          ? `${Math.round(facility.distance_km * 1000)} m`
                          : `${facility.distance_km.toFixed(2)} km`}
                      </b>
                      <small>straight-line distance</small>
                    </div>
                    <span>
                      {facility.address || "Street address not listed"}
                    </span>
                    <small>
                      {facility.connected
                        ? "Authorized gateway configured"
                        : "No automatic alert connection"}
                    </small>
                  </button>
                ))}
              </div>
              <div className="facility-detail panel">
                <div className="service-map">
                  <MapContainer
                    center={[result.latitude, result.longitude]}
                    zoom={13}
                    scrollWheelZoom={false}
                  >
                    <TileLayer
                      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      eventHandlers={{ tileerror: () => setTileError(true) }}
                    />
                    <FitServices result={result} selected={selected} />
                    <CircleMarker
                      center={[result.latitude, result.longitude]}
                      radius={8}
                      pathOptions={{
                        color: "#ffffff",
                        fillColor: "#48d5bf",
                        fillOpacity: 1,
                      }}
                    >
                      <Popup>Incident / search location</Popup>
                    </CircleMarker>
                    {result.facilities.map((f) => (
                      <CircleMarker
                        key={f.id}
                        center={[f.latitude, f.longitude]}
                        radius={selectedId === f.id ? 10 : 6}
                        pathOptions={{ color: "#e7ba73", fillOpacity: 0.6 }}
                        eventHandlers={{ click: () => setSelectedId(f.id) }}
                      >
                        <Popup>{f.name}</Popup>
                      </CircleMarker>
                    ))}
                    {selected && (
                      <Polyline
                        positions={[
                          [result.latitude, result.longitude],
                          [selected.latitude, selected.longitude],
                        ]}
                        pathOptions={{
                          color: "#48d5bf",
                          dashArray: "5 8",
                          weight: 2,
                        }}
                      />
                    )}
                  </MapContainer>
                </div>
                {tileError && (
                  <p className="uncertainty">
                    Basemap could not load. Coordinates and distances remain
                    available.
                  </p>
                )}
                {selected && (
                  <div className="facility-contact">
                    <h3>{selected.name}</h3>
                    <p>
                      Map information is community maintained. Jurisdiction,
                      staffing and contact details are unverified. The dotted
                      line is not a driving route.
                    </p>
                    <div className="facility-links">
                      {selected.phone && (
                        <a
                          className="button button-outline"
                          href={`tel:${selected.phone}`}
                        >
                          <Phone size={14} />
                          {selected.phone}
                        </a>
                      )}
                      <a
                        className="button button-outline"
                        href={`https://www.google.com/maps/dir/?api=1&origin=${result.latitude},${result.longitude}&destination=${selected.latitude},${selected.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={14} />
                        Open directions
                      </a>
                      <a
                        href={selected.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-button"
                      >
                        View map source ↗
                      </a>
                    </div>
                    {!selected.phone && (
                      <p className="muted">
                        No phone number is listed for this facility.
                      </p>
                    )}
                    {report ? (
                      <div className="alert-handoff">
                        {!alert ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={!!busy || dirty}
                              onClick={() => void prepare()}
                            >
                              <Send size={14} />
                              Prepare contact alert
                            </Button>
                            <p>
                              This saves a message for this facility. It does
                              not send it.
                            </p>
                          </>
                        ) : (
                          <>
                            <div className="alert-status" role="status">
                              <strong>
                                {statusLabels[alert.status] || alert.status}
                              </strong>
                            </div>
                            <label htmlFor="alert-message">
                              Contact message
                            </label>
                            <textarea
                              id="alert-message"
                              readOnly
                              value={alert.message}
                              rows={6}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(
                                    alert.message,
                                  );
                                  setNote("Message copied. Nothing was sent.");
                                } catch {
                                  setNote(
                                    "Copy failed. Select and copy the message above manually.",
                                  );
                                }
                              }}
                            >
                              <Copy size={14} />
                              Copy message
                            </Button>
                            {alert.connected &&
                            !report.synthetic &&
                            alert.status === "prepared_not_sent" ? (
                              <>
                                <label className="check-label">
                                  <input
                                    type="checkbox"
                                    checked={consent}
                                    onChange={(e) =>
                                      setConsent(e.target.checked)
                                    }
                                  />
                                  Send the displayed report and coordinates to{" "}
                                  {selected.name}'s configured gateway.
                                </label>
                                <Button
                                  type="button"
                                  disabled={!consent || !!busy || dirty}
                                  onClick={() => void send()}
                                >
                                  <Send size={15} />
                                  Send alert to connected gateway
                                </Button>
                              </>
                            ) : (
                              <p>
                                {report.synthetic
                                  ? "Synthetic reports cannot be sent to external responders."
                                  : !alert.connected
                                    ? "No authorized station integration is connected. Call the listed number or use the copied message through your own contact channel."
                                    : "No automatic retry is performed. Check delivery with the receiving service."}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="notice">
                        Save a report first to prepare a traceable contact
                        alert. You can use the listed contact or directions now.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <p className="nearby-provenance">
            {result.notice} Source: OpenStreetMap / Overpass ·{" "}
            {result.cached ? "Cached lookup" : "Fresh lookup"} ·{" "}
            {new Date(
              result.created_at.endsWith("Z") ||
                /[+-]\d\d:\d\d$/.test(result.created_at)
                ? result.created_at
                : `${result.created_at}Z`,
            ).toLocaleString()}
          </p>
        </>
      )}
      {note && (
        <p className="notice" role="status">
          {note}
        </p>
      )}
      <div className="emergency-contact">
        <Phone size={18} />
        <p>
          <b>Immediate danger in India?</b>
          <span>
            Use the official emergency service. This app cannot confirm or
            arrange a response.
          </span>
        </p>
        <a className="button button-outline" href="tel:112">
          Call 112
        </a>
        <a
          href="https://112.gov.in/"
          target="_blank"
          rel="noreferrer"
          className="text-button"
        >
          Official information ↗
        </a>
      </div>
    </section>
  );
}
