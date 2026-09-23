globalThis.fetch = (_input, init) => {
  setTimeout(() => process.emit("SIGINT"), 10);
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
};
