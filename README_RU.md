# lolger

[English](./README.md) | [Русский](./README_RU.md)

`lolger` — очередной маленький цветной логгер для Node.js, Deno и браузеров.

![Example output](./images/example.png)

## Установка

```bash
npm i lolger
```

## Использование

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

| Экспорт | Описание |
| --- | --- |
| `LogLevel` | Перечисление уровней логирования, которое используется для управления глобальным порогом логов. |
| `setLogLevel(level)` | Устанавливает глобальный уровень логирования для всех экземпляров логгера. |
| `getLogger(namespace)` | Создает логгер с определенным цветом для указанного namespace. |
| `logger.debug(...msgs)` | Выводит сообщения, когда активный уровень равен `DEBUG`. |
| `logger.log(...msgs)` | Выводит сообщения, когда активный уровень равен `LOG` или выше по важности. |
| `logger.info(...msgs)` | Выводит сообщения, когда активный уровень равен `INFO` или выше по важности. |
| `logger.warn(...msgs)` | Выводит сообщения, когда активный уровень равен `WARN` или выше по важности. |
| `logger.error(...msgs)` | Выводит сообщения, когда активный уровень равен `ERROR`. |

## Примечания

- Глобальный уровень по умолчанию — `LogLevel.LOG`.
- Каждый namespace получает стабильный цвет из внутренней палитры.
- Строки выводятся как есть.
- Обычные объекты сериализуются через `json-stringify-safe` для корректной работы с циклическими ссылками.
- Функции отображаются как `function()`.
- Экземпляры `Error` попадают в форматированное сообщение, а затем дополнительно передаются в консоль как нативные ошибки.
- Пакет ориентирован на TypeScript и поставляется с файлами деклараций.

## Разработка

Если у вас есть идеи, предложения или исправления, буду благодарен за [issue](https://github.com/notKitory/lolger/issues) или [pull request](https://github.com/notKitory/lolger/pulls).
