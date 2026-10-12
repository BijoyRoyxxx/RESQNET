import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Report } from "../types";
import { DepartmentCaseMap } from "./DepartmentCaseMap";

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Marker: ({ children, icon }: { children: React.ReactNode; icon: { options: { className: string } } }) => (
    <div data-testid="incident-marker" className={icon.options.className}>{children}</div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  useMap: () => ({
    setView: vi.fn(),
    fitBounds: vi.fn(),
    invalidateSize: vi.fn(),
  }),
}));

afterEach(() => vi.clearAllMocks());

it("shows category-specific map markers and opens the selected case", () => {
  const onSelect = vi.fn();
  const cases = [
    { report: { id: "fire-1", latitude: 22.72, longitude: 88.48, location_text: "Barasat" } as Report, category: "fire" },
    { report: { id: "health-1", latitude: 22.73, longitude: 88.49, location_text: "Station Road" } as Report, category: "medical" },
  ];

  render(<DepartmentCaseMap cases={cases} onSelect={onSelect} />);

  const markers = screen.getAllByTestId("incident-marker");
  expect(markers[0]).toHaveClass("department-map-marker-fire");
  expect(markers[1]).toHaveClass("department-map-marker-medical");
  fireEvent.click(screen.getAllByRole("button", { name: "Open case →" })[1]);
  expect(onSelect).toHaveBeenCalledWith("health-1");
});
