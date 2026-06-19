import { toast } from "sonner";
import { logTechnicalError, toUserFacingError } from "@/lib/user-facing-error";

declare global {
  interface Window {
    __terrevoltToastErrorGuardInstalled?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__terrevoltToastErrorGuardInstalled) {
  window.__terrevoltToastErrorGuardInstalled = true;

  const originalError = toast.error.bind(toast);

  toast.error = ((message: unknown, ...args: Parameters<typeof toast.error> extends [unknown, ...infer Rest] ? Rest : never[]) => {
    const translated = toUserFacingError(message, typeof message === "string" ? message : undefined);
    if (translated !== message) {
      logTechnicalError("toast.error", message);
    }
    return originalError(translated, ...args);
  }) as typeof toast.error;
}

export {};
