import { describe, expect, it } from "vitest";
import { abortable, throwIfAborted } from "../src/shared/abort";

describe("abort helpers", () => {
  it("rejects when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      abortable(Promise.resolve("ok"), controller.signal, "cancelled"),
    ).rejects.toThrow("cancelled");
  });

  it("rejects when signal aborts before promise settles", async () => {
    const controller = new AbortController();
    const pending = new Promise<string>((resolve) => {
      setTimeout(() => resolve("late"), 200);
    });
    const raced = abortable(pending, controller.signal, "cancelled");
    controller.abort();
    await expect(raced).rejects.toThrow("cancelled");
  });

  it("returns result when signal stays active", async () => {
    const controller = new AbortController();
    await expect(
      abortable(Promise.resolve("ok"), controller.signal, "cancelled"),
    ).resolves.toBe("ok");
  });

  it("throwIfAborted throws for aborted signals", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal, "nope")).toThrow("nope");
  });
});
