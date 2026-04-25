import type { CSSProperties } from "react";
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { type Theme, useAppStore } from "@/stores";

const getToasterTheme = (theme: Theme): ToasterProps["theme"] => {
  return theme === "light" ? "light" : "dark";
};

const Toaster = ({ className, ...props }: ToasterProps) => {
  const theme = useAppStore((s) => s.theme);

  return (
    <Sonner
      theme={getToasterTheme(theme)}
      position="top-right"
      closeButton
      swipeDirections={["left", "right"]}
      offset={{ top: 16, right: 16 }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 10px)", right: 12, left: 12 }}
      className={["toaster group", className].filter(Boolean).join(" ")}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
        close: <XIcon className="size-3" />,
      }}
      style={
        {
          "--width": "360px",
          "--border-radius": "14px",
          "--normal-bg": "color-mix(in srgb, var(--ide-panel) 92%, transparent)",
          "--normal-border": "color-mix(in srgb, var(--ide-border) 76%, transparent)",
          "--normal-text": "var(--ide-text)",
        } as CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
