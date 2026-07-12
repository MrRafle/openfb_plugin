import { COLOR_SCHEME } from "../shared/colorScheme";
import { LogLevel, shouldLog, getTimestamp } from "../shared/logLevel";

export type { LogLevel } from "../shared/logLevel";

export class WebviewLogger {
  private logLevel: LogLevel = "info";
  private postMessageFn?: (message: unknown) => void;

  constructor(private name: string) {}

  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }

  /**
   * Set a postMessage callback to forward logs to the extension host OutputChannel.
   */
  setPostMessage(fn: (message: unknown) => void) {
    this.postMessageFn = fn;
  }

  private forwardToExtension(level: LogLevel, message: string, args?: any[]) {
    if (!this.postMessageFn) return;
    try {
      this.postMessageFn({
        type: "webview-log",
        level,
        message,
        args: args?.map(a => {
          try { return typeof a === 'string' ? a : JSON.stringify(a); }
          catch { return String(a); }
        })
      });
    } catch { /* ignore postMessage errors */ }
  }

  private formatMessage(level: LogLevel, message: string): string {
    return `%c[${getTimestamp()}] [${this.name}] [${level.toUpperCase()}]%c ${message}`;
  }

  private getColorStyle(level: LogLevel): string[] {
    switch (level) {
      case "debug":
        return [`color: ${COLOR_SCHEME.UI.LOG_DEBUG}; font-weight: bold;`, `color: ${COLOR_SCHEME.UI.LOG_DEBUG};`];
      case "info":
        return [`color: ${COLOR_SCHEME.UI.LOG_INFO}; font-weight: bold;`, `color: ${COLOR_SCHEME.UI.LOG_INFO};`];
      case "warn":
        return [`color: ${COLOR_SCHEME.UI.LOG_WARN}; font-weight: bold;`, `color: ${COLOR_SCHEME.UI.LOG_WARN};`];
      case "error":
        return [`color: ${COLOR_SCHEME.UI.LOG_ERROR}; font-weight: bold;`, `color: ${COLOR_SCHEME.UI.LOG_ERROR};`];
      default:
        return ["", ""];
    }
  }

  private _shouldLog(level: LogLevel): boolean {
    return shouldLog(level, this.logLevel);
  }

  debug(message: string, ...args: any[]) {
    if (!this._shouldLog("debug")) return;
    const [style1, style2] = this.getColorStyle("debug");
    const msg = this.formatMessage("debug", message);
    if ((window as any).OPENFB_DEBUG === true) {
      console.log(msg, style1, style2, ...args);
    }
    this.forwardToExtension("debug", message, args);
  }

  info(message: string, ...args: any[]) {
    if (!this._shouldLog("info")) return;
    const [style1, style2] = this.getColorStyle("info");
    const msg = this.formatMessage("info", message);
    if ((window as any).OPENFB_DEBUG === true) {
      console.log(msg, style1, style2, ...args);
    }
    this.forwardToExtension("info", message, args);
  }

  warn(message: string, ...args: any[]) {
    if (!this._shouldLog("warn")) return;
    const [style1, style2] = this.getColorStyle("warn");
    const msg = this.formatMessage("warn", message);
    console.warn(msg, style1, style2, ...args);
    this.forwardToExtension("warn", message, args);
  }

  error(message: string, error?: Error | any) {
    if (!this._shouldLog("error")) return;
    const [style1, style2] = this.getColorStyle("error");
    const msg = this.formatMessage("error", message);
    if (error instanceof Error) {
      console.error(msg, style1, style2, error.message, error.stack);
      this.forwardToExtension("error", message, [error.message, error.stack]);
    } else {
      console.error(msg, style1, style2, error);
      this.forwardToExtension("error", message, error !== undefined ? [error] : undefined);
    }
  }
}

// Global logger instance for webview
let globalLogger: WebviewLogger;

export function initializeWebviewLogger(): WebviewLogger {
  globalLogger = new WebviewLogger("OpenFB Webview");
  // Set default log level to info (can be increased to debug for development)
  if ((window as any).OPENFB_DEBUG === true) {
    globalLogger.setLogLevel("debug");
  }
  return globalLogger;
}

export function getWebviewLogger(): WebviewLogger {
  if (!globalLogger) {
    globalLogger = new WebviewLogger("OpenFB Webview");
  }
  return globalLogger;
}
