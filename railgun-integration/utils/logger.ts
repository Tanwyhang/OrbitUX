type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    console.debug(this.formatMessage("debug", message), ...args);
  }

  info(message: string, ...args: unknown[]): void {
    console.log(this.formatMessage("info", message), ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(this.formatMessage("warn", message), ...args);
  }

  error(message: string, error?: Error | unknown, ...args: unknown[]): void {
    console.error(this.formatMessage("error", message), ...args);
    if (error instanceof Error) {
      console.error(`Error stack: ${error.stack}`);
    }
  }
}

export const createLogger = (context: string): Logger => {
  return new Logger(context);
};
