import { afterEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveLocation } from "./LiveLocation";

afterEach(() => vi.unstubAllGlobals());
it("requests location only on click, reports accuracy, and stops its watch", async () => {
  let success: PositionCallback | undefined;
  const clearWatch = vi.fn();
  const watchPosition = vi.fn((callback: PositionCallback) => {
    success = callback;
    return 7;
  });
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: { watchPosition, clearWatch },
    clipboard: navigator.clipboard,
  });
  vi.stubGlobal("isSecureContext", true);
  const changed = vi.fn();
  const { unmount } = render(<LiveLocation onLocation={changed} />);
  expect(watchPosition).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Use my live location" }),
  );
  act(() =>
    success?.({
      coords: { latitude: 22.72, longitude: 88.48, accuracy: 12 },
      timestamp: Date.now(),
    } as GeolocationPosition),
  );
  expect(changed).toHaveBeenCalledWith(
    expect.objectContaining({ latitude: 22.72, accuracy: 12 }),
  );
  expect(screen.getByText(/±12 m/)).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Stop live location" }),
  );
  expect(clearWatch).toHaveBeenCalledWith(7);
  unmount();
});

it("explains denied permission without inventing a location", async () => {
  let denied: PositionErrorCallback | undefined;
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: {
      watchPosition: (_: PositionCallback, failure: PositionErrorCallback) => {
        denied = failure;
        return 8;
      },
      clearWatch: vi.fn(),
    },
  });
  vi.stubGlobal("isSecureContext", true);
  const changed = vi.fn();
  render(<LiveLocation onLocation={changed} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Use my live location" }),
  );
  act(() => denied?.({ code: 1 } as GeolocationPositionError));
  expect(screen.getByRole("alert")).toHaveTextContent("permission was denied");
  expect(changed).not.toHaveBeenCalled();
});
