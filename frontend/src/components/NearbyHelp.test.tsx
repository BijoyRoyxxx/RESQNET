import { afterEach, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NearbyHelp } from "./NearbyHelp";

afterEach(() => vi.unstubAllGlobals());

function emptySearch(latitude: number, longitude: number, radius = 10) {
  return {
    id: "search-1",
    latitude,
    longitude,
    service: "police",
    facilities: [],
    radius_km: radius,
    routing_reason: "Service selected by you.",
    notice: "Map data may be incomplete.",
    cached: false,
    created_at: "2026-10-09T12:00:00Z",
  };
}

it("offers a map search for empty coverage and hides results after location changes", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => emptySearch(22.7, 88.4),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => emptySearch(22.7, 88.4, 25),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => emptySearch(22.8, 88.4, 25),
    });
  vi.stubGlobal("fetch", fetcher);
  let updateLocation: PositionCallback | undefined;
  const clearWatch = vi.fn();
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: {
      watchPosition: (callback: PositionCallback) => {
        updateLocation = callback;
        return 17;
      },
      clearWatch,
    },
  });
  vi.stubGlobal("isSecureContext", true);
  render(<NearbyHelp initialLatitude="22.7" initialLongitude="88.4" />);
  const user = userEvent.setup();

  await user.selectOptions(screen.getByLabelText("Service needed"), "police");
  await user.click(
    screen.getByRole("button", { name: "Use my live location" }),
  );
  act(() =>
    updateLocation?.({
      coords: { latitude: 22.7, longitude: 88.4, accuracy: 10 },
      timestamp: Date.now(),
    } as GeolocationPosition),
  );
  await user.click(
    screen.getByRole("button", { name: "Find nearest service" }),
  );

  const fallback = await screen.findByRole("link", {
    name: "Search this location in Google Maps ↗",
  });
  expect(fallback.getAttribute("href")).toContain("22.7%2C%2088.4");
  expect(
    screen.getByText(/not confirmation that no service exists/i),
  ).toBeVisible();
  expect(clearWatch).toHaveBeenCalledWith(17);
  act(() =>
    updateLocation?.({
      coords: { latitude: 22.9, longitude: 88.9, accuracy: 10 },
      timestamp: Date.now(),
    } as GeolocationPosition),
  );
  expect(screen.getByLabelText("Incident latitude")).toHaveValue(22.7);

  await user.click(screen.getByRole("button", { name: "Search within 25 km" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body).radius_km).toBe(25);

  await user.clear(screen.getByLabelText("Incident latitude"));
  await user.type(screen.getByLabelText("Incident latitude"), "22.8");
  expect(screen.queryByText(/No mapped police station found/)).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Search with updated details" }),
  );

  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(JSON.parse(fetcher.mock.calls[2][1].body).latitude).toBe(22.8);
  expect(
    await screen.findByText(/No mapped police station found/),
  ).toBeVisible();
});
