import { describe, expect, it } from "vitest";
import { EventBus } from "../src/core/events/event-bus";

describe("EventBus", () => {
  it("delivers published events to subscribers", () => {
    const bus = new EventBus();
    const received: string[] = [];

    bus.subscribe("file:added", (p) => {
      received.push(p.path);
    });

    bus.publish("file:added", { path: "raw/legal/a.txt", wikiId: "legal" });

    expect(received).toEqual(["raw/legal/a.txt"]);
  });

  it("stops delivering after unsubscribe", () => {
    const bus = new EventBus();
    let count = 0;
    const off = bus.subscribe("file:added", () => {
      count++;
    });

    bus.publish("file:added", { path: "a", wikiId: null });
    off();
    bus.publish("file:added", { path: "b", wikiId: null });

    expect(count).toBe(1);
  });
});
