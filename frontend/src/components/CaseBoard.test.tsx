import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CaseBoard } from "./CaseBoard";
import type { Account } from "../PortalApp";

const caseRecord = (id: string, text: string) => ({
  report: {
    id,
    text,
    language: "en",
    location_text: "Barasat station",
    latitude: 22.72,
    longitude: 88.48,
    occurred_at: "2026-10-12T10:00:00Z",
    created_at: "2026-10-12T10:00:00Z",
    synthetic: false,
    review_status: "pending",
    extraction: { incident_type: "fire", requested_assistance: [] },
    engine: "rules",
    latency_ms: 1,
    incident_id: id,
    media: [],
  },
  category: "fire",
  urgency: "high",
  automatic_urgency: "high",
  reasons: ["Fire reported"],
  status: "submitted",
  version: 1,
  immediate_danger: false,
  reporter: null,
  assigned_to: null,
  department: "fire",
  messages: [],
});

afterEach(() => vi.unstubAllGlobals());

it("opens a department popup for the next newly assigned live case", async () => {
  let refreshes = 0;
  const fetcher = vi.fn(async () => {
    refreshes += 1;
    const rows = refreshes === 1
      ? [caseRecord("fire-one", "Fire reported at the station")]
      : [caseRecord("fire-two", "Second fire reported at the station"), caseRecord("fire-one", "Fire reported at the station")];
    return { ok: true, json: async () => rows } as Response;
  });
  vi.stubGlobal("fetch", fetcher);
  const account: Account = {
    id: "fire-account",
    name: "Fire Desk",
    email: "fire@example.test",
    role: "department",
    department: "fire",
  };

  render(<CaseBoard account={account} />);

  expect(await screen.findByRole("dialog")).toHaveTextContent("Fire reported at the station");
  fireEvent.click(screen.getByRole("button", { name: "Open case" }));
  fireEvent(window, new Event("resq-live-update"));

  expect(await screen.findByRole("dialog")).toHaveTextContent("Second fire reported at the station");
  expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
});
