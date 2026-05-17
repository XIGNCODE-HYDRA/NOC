import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Prevent RouterOSAPI / other unhandled errors from crashing the process
process.on("uncaughtException", (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error({ err: msg }, "Uncaught exception — process kept alive");
});

process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logger.error({ reason: msg }, "Unhandled promise rejection");
});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
