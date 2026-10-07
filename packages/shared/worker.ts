export function startWorker(task: () => Promise<void>, interval = 1000) {
  let running = false;
  let active = Promise.resolve();
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    active = task()
      .catch((error) =>
        console.error(
          JSON.stringify({
            level: "error",
            message: error instanceof Error ? error.message : "Worker failed",
          }),
        ),
      )
      .finally(() => {
        running = false;
      });
  }, interval);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await active;
  };
}
