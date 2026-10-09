import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubmitReport } from "./SubmitReport";

afterEach(() => vi.unstubAllGlobals());
describe("report submission", () => {
  it("preserves the source and defaults to current time and nearby help", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ id: "saved", engine: "deterministic-rules" }),
      });
    vi.stubGlobal("fetch", fetcher);
    const saved = vi.fn();
    render(<SubmitReport onCreated={saved} />);
    await userEvent.type(
      screen.getByLabelText(/What is being reported/),
      "Flooding at Barasat. People trapped.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Process report/ }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.text).toBe("Flooding at Barasat. People trapped.");
    expect(body.synthetic).toBe(false);
    expect(Math.abs(Date.now() - Date.parse(body.occurred_at))).toBeLessThan(3000);
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: "saved" }), true);
    expect(body.latitude).toBeNull();
  });
  it("shows backend errors without reporting success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          json: async () => ({
            error: { message: "Coordinates must be paired" },
          }),
        }),
    );
    const saved = vi.fn();
    render(<SubmitReport onCreated={saved} />);
    await userEvent.type(
      screen.getByLabelText(/What is being reported/),
      "A road is blocked near the station.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Process report/ }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Coordinates must be paired",
    );
    expect(saved).not.toHaveBeenCalled();
  });
  it("adds a machine transcript to the editable source before final submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "audio",
            kind: "audio",
            url: "/api/media/audio",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transcript: "Flooding reported near Barasat" }),
        }),
    );
    const saved = vi.fn();
    render(<SubmitReport onCreated={saved} />);
    await userEvent.upload(
      screen.getByLabelText("Upload voice recording"),
      new File(["audio"], "sample.wav", { type: "audio/wav" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/What is being reported/)).toHaveValue(
        "Flooding reported near Barasat",
      ),
    );
    await userEvent.clear(screen.getByLabelText(/What is being reported/));
    await userEvent.type(
      screen.getByLabelText(/What is being reported/),
      "Corrected source transcript",
    );
    expect(screen.getByLabelText(/What is being reported/)).toHaveValue(
      "Corrected source transcript",
    );
    expect(saved).not.toHaveBeenCalled();
  });
});
