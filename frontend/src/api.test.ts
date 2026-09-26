import { describe, expect, it } from "vitest";
import { parseEvent } from "./api";

describe("parseEvent", () => {
  it("accepts known committee events", () => {
    expect(parseEvent('{"type":"stage","stage":"news","message":"x"}')).toEqual({ type: "stage", stage: "news", message: "x" });
  });

  it("never throws on the browser's data-less error event or on bad payloads", () => {
    expect(parseEvent(undefined)).toBeNull(); // native connection-error Event has no data
    expect(parseEvent("{truncated")).toBeNull();
    expect(parseEvent("null")).toBeNull();
    expect(parseEvent('{"type":"surprise"}')).toBeNull();
  });
});
