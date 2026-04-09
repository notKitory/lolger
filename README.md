# lolger

[English](./README.md) | [Русский](./README_RU.md)

`lolger` is yet another tiny colorful logger for Node.js, Deno, and browsers.

![Example output](./images/example.png)

## Installation

```bash
npm i lolger
```

## Usage

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
enum LogLevel {
  DEBUG = 0,
  LOG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
}

class Logger {
  static level: LogLevel;

  debug(...msgs: unknown[]): void;
  log(...msgs: unknown[]): void;
  info(...msgs: unknown[]): void;
  warn(...msgs: unknown[]): void;
  error(...msgs: unknown[]): void;
}

function getLogger(namespace: string): Logger;
function setLogLevel(level: LogLevel): void;
```

| Export | Description |
| --- | --- |
| `LogLevel` | Log level enum used to control the global logging threshold. |
| `setLogLevel(level)` | Sets the global log level for all logger instances. |
| `getLogger(namespace)` | Creates a logger with a specific color for the given namespace. |
| `logger.debug(...msgs)` | Prints messages when the active level is `DEBUG`. |
| `logger.log(...msgs)` | Prints messages when the active level is `LOG` or more important. |
| `logger.info(...msgs)` | Prints messages when the active level is `INFO` or more important. |
| `logger.warn(...msgs)` | Prints messages when the active level is `WARN` or more important. |
| `logger.error(...msgs)` | Prints messages when the active level is `ERROR`. |

## Notes

- The default global level is `LogLevel.LOG`.
- Each namespace gets a stable color chosen from an internal palette.
- Strings are printed as-is.
- Plain objects are serialized with `json-stringify-safe` for correct handling of circular references.
- Functions are displayed as `function()`.
- `Error` instances are included in the formatted message and then forwarded to the console as native errors.
- The package is TypeScript-first and ships declaration files.

## Development

If you have ideas, suggestions, or fixes, I would appreciate an [issue](https://github.com/notKitory/lolger/issues) or a [pull request](https://github.com/notKitory/lolger/pulls).
