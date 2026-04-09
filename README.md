# lolger

[English](./README.md) | [Русский](./README_RU.md)

`lolger` is yet another tiny colorful logger for Node.js, Deno, and browsers.

![Example output](./images/example.png)

## Installation

```bash
npm i lolger
```

`lolger` is an ESM package.

## Quick Start

```ts
import { getLogger, LogLevel, setLogLevel } from "lolger";

setLogLevel(LogLevel.DEBUG);

const logger = getLogger("my-app");

logger.debug("Debug something", { id: 1 });
logger.log("Just a log");
logger.info("Some info:", "nothing here");
logger.warn("Oh, warn...", new Error("warning"));
logger.error("Error!!!", new Error("boom"));
```

These convenience exports are thin wrappers around the global `lolger` singleton.

## Custom Instances

```ts
import { Lolger, LogLevel, consoleTransport, fileTransport } from "lolger";

const myLolger = new Lolger({
  level: LogLevel.DEBUG,
  transports: [
    consoleTransport({ colors: true }),
    fileTransport({
      path: "./logs/worker.log",
      format: "logfmt",
    }),
  ],
});

const logger = myLolger.getLogger("worker");

logger.info("Job started");
```

## Configuring Transports

```ts
import {
  LogLevel,
  configureLogger,
  consoleTransport,
  fileTransport,
  getLogger,
} from "lolger";

configureLogger({
  level: LogLevel.DEBUG,
  timestamp: "iso",
  baseFields: {
    service: "api",
    env: "production",
  },
  transports: [
    consoleTransport({ colors: true }),
    fileTransport({
      path: "./logs/app.log",
      format: "jsonl",
      rotate: {
        maxBytes: 1024 * 1024,
        maxFiles: 3,
      },
    }),
  ],
});

const logger = getLogger("http");

logger.info("Request finished", {
  status: 200,
  durationMs: 42,
});
```

## Formats

| Format | Description |
| --- | --- |
| `pretty` | Human-readable colored output for development. |
| `json` | A readable multi-line JSON object per log record. |
| `jsonl` | A compact JSON object per line. Recommended for files and log ingestion. |
| `logfmt` | A single-line `key=value` record with JSON-stringified complex values. |

## Example Output

```text
12:48:03 [DEBUG] (my-app) Debug something {
  "id": 1
}
12:48:03   [LOG] (my-app) Just a log
12:48:03  [INFO] (my-app) Some info: nothing here
12:48:03  [WARN] (my-app) Oh, warn... Error
12:48:03 [ERROR] (my-app) Error!!! Error
```

## API

```ts
type LogFormat = "pretty" | "json" | "jsonl" | "logfmt";

enum LogLevel {
  DEBUG = 0,
  LOG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
}

interface LogRecord {
  timestamp: string;
  level: "DEBUG" | "LOG" | "INFO" | "WARN" | "ERROR";
  namespace: string;
  message: string;
  args: unknown[];
  fields?: Record<string, unknown>;
  errors?: SerializedError[];
}

interface Transport {
  name: string;
  format?: LogFormat;
  write(record: LogRecord, rendered: string): void | Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

class Logger {
  debug(...msgs: unknown[]): void;
  log(...msgs: unknown[]): void;
  info(...msgs: unknown[]): void;
  warn(...msgs: unknown[]): void;
  error(...msgs: unknown[]): void;
}

class Lolger {
  constructor(options?: ConfigureLoggerOptions);

  level: LogLevel;
  configureLogger(options: ConfigureLoggerOptions): void;
  getLogger(namespace: string): Logger;
  setLogLevel(level: LogLevel): void;
  flushLogger(): Promise<void>;
  closeLogger(): Promise<void>;
}

const lolger: Lolger;

function configureLogger(options: ConfigureLoggerOptions): void;
function consoleTransport(options?: ConsoleTransportOptions): Transport;
function fileTransport(options: FileTransportOptions): Transport;
function flushLogger(): Promise<void>;
function closeLogger(): Promise<void>;
function getLogger(namespace: string): Logger;
function setLogLevel(level: LogLevel): void;
```

| Export | Description |
| --- | --- |
| `lolger` | Global singleton `Lolger` instance used by the convenience exports. |
| `Lolger` | Class for creating isolated logger pipelines with their own configuration and transports. |
| `configureLogger(options)` | Updates the global logger configuration, including transports and default format. |
| `consoleTransport(options)` | Creates a console transport. |
| `fileTransport(options)` | Creates a file transport for Node.js and Deno. Supports append mode and size-based rotation. |
| `flushLogger()` | Waits for pending async transport writes to finish. |
| `closeLogger()` | Flushes and closes transports that implement `close()`. |
| `getLogger(namespace)` | Creates a namespaced logger. |
| `setLogLevel(level)` | Sets the global log level quickly without changing the rest of the config. |

## Notes

- The default global level is `LogLevel.LOG`.
- The default global format is `pretty`.
- Every `Lolger` instance starts with a default console transport unless you replace its transports explicitly.
- In `pretty` console mode, `Error` objects are logged in two steps: first the formatted line, then each native error separately. This preserves browser-friendly error rendering.
- In file mode and structured formats, errors are serialized into a single record.
- `baseFields` are included in structured output and `logfmt`.
- `fileTransport()` is supported in Node.js and Deno. Browsers support console output only.
- With `maxFiles = 1`, `jsonl` and `logfmt` keep removing old lines from the top to make room for new ones. `pretty` and `json` replace the file with the newest record instead.

## Development

If you have ideas, suggestions, or fixes, I would appreciate any [issue](https://github.com/notKitory/lolger/issues) or [pull request](https://github.com/notKitory/lolger/pulls).
