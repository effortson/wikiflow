export function throwIfAborted(
  signal: AbortSignal | undefined,
  message = "Operation cancelled",
): void {
  if (signal?.aborted) {
    throw new Error(message);
  }
}

export function waitForAbort(
  signal: AbortSignal,
  message = "Operation cancelled",
): Promise<never> {
  if (signal.aborted) {
    return Promise.reject(new Error(message));
  }
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error(message)), {
      once: true,
    });
  });
}

export function abortable<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  message = "Operation cancelled",
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error(message));
  return Promise.race([promise, waitForAbort(signal, message)]);
}
