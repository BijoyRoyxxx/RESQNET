import { expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewQueue } from "./ReviewQueue";
import type { Match } from "../types";

const match = {
  id: "match-one",
  report_id: "report",
  incident_id: "incident",
  score: 0.8,
  status: "pending",
  factors: {
    geographic: 1,
    category: 1,
    text: 0.5,
    time: 0.9,
    distance_km: 0.01,
    hours_apart: 0.2,
    uncertainties: [],
  },
  report: {
    id: "report",
    text: "Flooding at the station",
    language: "en",
    synthetic: true,
  },
  incident: {
    location_text: "Barasat",
    summary: "Water rising",
    report_count: 1,
  },
} as unknown as Match;
afterEach(() => vi.unstubAllGlobals());
it("requires a reason and submits the explicit approval", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ status: "approved" }),
    });
  vi.stubGlobal("fetch", fetcher);
  const changed = vi.fn();
  render(
    <ReviewQueue
      matches={[match]}
      reports={[]}
      onChange={changed}
      onSelect={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Approve/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("review note");
  expect(fetcher).not.toHaveBeenCalled();
  await userEvent.type(
    screen.getByRole("textbox"),
    "Same observed location and time",
  );
  await userEvent.click(screen.getByRole("button", { name: /Approve/ }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(fetcher.mock.calls[0][0]).toBe("/api/matches/match-one/approve");
});
