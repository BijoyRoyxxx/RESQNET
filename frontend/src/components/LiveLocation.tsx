import { useEffect, useRef, useState } from "react";
import { LocateFixed, Square, Navigation } from "lucide-react";
import { Button } from "./ui/button";

export interface LocationFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export function LiveLocation({
  onLocation,
}: {
  onLocation: (fix: LocationFix) => void;
}) {
  const watch = useRef<number | null>(null);
  const callback = useRef(onLocation);
  const [active, setActive] = useState(false);
  const [fix, setFix] = useState<LocationFix>();
  const [error, setError] = useState("");
  useEffect(() => {
    callback.current = onLocation;
  }, [onLocation]);
  useEffect(
    () => () => {
      if (watch.current !== null)
        navigator.geolocation?.clearWatch(watch.current);
    },
    [],
  );
  function stop() {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setActive(false);
  }
  function start() {
    if (!navigator.geolocation) {
      setError(
        "Location is unavailable in this browser. Enter coordinates manually.",
      );
      return;
    }
    if (!window.isSecureContext) {
      setError(
        "Live location needs HTTPS or localhost. You can still enter coordinates manually.",
      );
      return;
    }
    setError("");
    setActive(true);
    watch.current = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        if (!Number.isFinite(next.latitude) || !Number.isFinite(next.longitude))
          return;
        setFix(next);
        callback.current(next);
      },
      (failure) => {
        setError(
          failure.code === 1
            ? "Location permission was denied. Allow location in browser settings or enter coordinates manually."
            : failure.code === 2
              ? "Your device could not determine its location. Try outdoors or enter coordinates manually."
              : "Location request timed out. Try again or enter coordinates manually.",
        );
        stop();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }
  return (
    <div className="live-location">
      <div className="location-controls">
        <Button type="button" variant="outline" onClick={active ? stop : start}>
          {active ? <Square size={15} /> : <LocateFixed size={17} />}{" "}
          {active ? "Stop live location" : "Use my live location"}
        </Button>
        {active && (
          <span className="status-label cyan">
            <i />
            {fix ? "Location updating" : "Waiting for permission / GPS"}
          </span>
        )}
      </div>
      {fix && (
        <p className="location-fix">
          <Navigation size={13} />
          {fix.latitude.toFixed(5)}, {fix.longitude.toFixed(5)}{" "}
          <span>
            ±{Math.round(fix.accuracy)} m ·{" "}
            {new Date(fix.timestamp).toLocaleTimeString()}{" "}
            {active ? "" : "· Last fix, tracking stopped"}
          </span>
        </p>
      )}
      <p className="field-hint">
        Your browser asks permission. Updates stop when you leave this view.
        Check that your current position is where the incident happened.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
