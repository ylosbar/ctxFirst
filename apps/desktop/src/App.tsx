import { HashRouter } from "react-router";
import { Toaster } from "sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { ServicesProvider } from "./ui/di/services-provider";
import { buildServices } from "./ui/di/build-services";
import { useThemeVariant } from "./ui/stores/appearance-store";
import Workbench from "./ui/workbench/Workbench";
import "./ui/workbench/register-contributions";
import { TooltipProvider } from "./components/ui/tooltip";
import ChannelProvider from "./ui/channels/ChannelProvider";
import I18nProvider from "./ui/i18n/provider";
import { createQueryClient } from "./ui/query/query-client";
import WorkflowEventsBridge from "./ui/query/WorkflowEventsBridge";
import FpsOverlay from "./ui/components/FpsOverlay";
import "./App.css";

const services = buildServices();
const queryClient = createQueryClient();

// Binds sonner's surface to the active theme's shadcn tokens so toasts
// restyle live when the in-app theme picker changes (sonner's own
// `theme="system"` only reads prefers-color-scheme). `richColors` is left off
// on purpose — it would override these vars with sonner's built-in palette.
const ThemedToaster = () => {
  const variant = useThemeVariant();
  return (
    <Toaster
      theme={variant}
      position="bottom-right"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--popover)",
          "--success-text": "var(--popover-foreground)",
          "--success-border": "var(--border)",
          "--error-bg": "var(--popover)",
          "--error-text": "var(--destructive)",
          "--error-border": "var(--border)",
          "--info-bg": "var(--popover)",
          "--info-text": "var(--popover-foreground)",
          "--info-border": "var(--border)",
        } as React.CSSProperties
      }
    />
  );
};

const App = () => {
  return (
    <ServicesProvider services={services}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <ChannelProvider>
            <WorkflowEventsBridge />
            <TooltipProvider>
              <HashRouter>
                <Workbench />
              </HashRouter>
              <ThemedToaster />
              <FpsOverlay />
            </TooltipProvider>
          </ChannelProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ServicesProvider>
  );
};

export default App;
