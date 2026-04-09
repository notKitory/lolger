# lolger

[English](./README.md) | [Русский](./README_RU.md)

`lolger` — очередной маленький цветной логгер для Node.js, Deno и браузеров.

![Example output](./images/example.png)

## Установка

```bash
npm i lolger
```

## Быстрый старт

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

## Настройка transport-ов

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

## Форматы

| Формат | Описание |
| --- | --- |
| `pretty` | Человекочитаемый цветной вывод для разработки. |
| `json` | Один читаемый многострочный JSON-объект на запись. |
| `jsonl` | Один компактный JSON-объект на строку. Рекомендуется для файлов и ingestion. |
| `logfmt` | Одна строка в формате `key=value`, где сложные значения сериализуются в JSON. |

## Пример вывода

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
  static level: LogLevel;

  debug(...msgs: unknown[]): void;
  log(...msgs: unknown[]): void;
  info(...msgs: unknown[]): void;
  warn(...msgs: unknown[]): void;
  error(...msgs: unknown[]): void;
}

function configureLogger(options: ConfigureLoggerOptions): void;
function consoleTransport(options?: ConsoleTransportOptions): Transport;
function fileTransport(options: FileTransportOptions): Transport;
function flushLogger(): Promise<void>;
function closeLogger(): Promise<void>;
function getLogger(namespace: string): Logger;
function setLogLevel(level: LogLevel): void;
```

| Экспорт | Описание |
| --- | --- |
| `configureLogger(options)` | Обновляет глобальную конфигурацию логгера, включая transport-ы и формат по умолчанию. |
| `consoleTransport(options)` | Создает console transport. |
| `fileTransport(options)` | Создает file transport для Node.js и Deno. Поддерживает append-режим и ротацию по размеру. |
| `flushLogger()` | Дожидается завершения всех pending async-записей. |
| `closeLogger()` | Выполняет flush и закрывает transport-ы, если у них есть `close()`. |
| `getLogger(namespace)` | Создает логгер с namespace. |
| `setLogLevel(level)` | Быстро меняет глобальный уровень логирования, не трогая остальную конфигурацию. |

## Примечания

- Глобальный уровень по умолчанию — `LogLevel.LOG`.
- Глобальный формат по умолчанию — `pretty`.
- Если transport-ы явно не заданы, `lolger` использует стандартный console transport.
- В режиме `pretty` для консоли объекты `Error` логируются в два шага: сначала formatted line, затем каждая ошибка отдельно как native error. Это сохраняет корректное отображение ошибок в браузере.
- В file mode и structured-форматах ошибки сериализуются внутри одной записи.
- `baseFields` попадают в structured output и `logfmt`.
- `fileTransport()` поддерживается в Node.js и Deno. В браузерах доступен только console output.
- При `maxFiles = 1` форматы `jsonl` и `logfmt` удаляют старые строки сверху, освобождая место для новых. Форматы `pretty` и `json` в этом режиме просто заменяют файл новой записью.

## Разработка

Если у вас есть идеи, предложения или исправления, буду благодарен любым [issue](https://github.com/notKitory/lolger/issues) или [pull request](https://github.com/notKitory/lolger/pulls).
