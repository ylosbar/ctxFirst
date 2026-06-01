import { createContext, useContext, type ReactNode } from "react";
import type { Services } from "./services";

const ServicesContext = createContext<Services | null>(null);

type ServicesProviderProps = {
  services: Services;
  children: ReactNode;
};

const ServicesProvider = ({ services, children }: ServicesProviderProps) => {
  return (
    <ServicesContext.Provider value={services}>
      {children}
    </ServicesContext.Provider>
  );
};

export default ServicesProvider;

// Named re-export kept for backward compatibility with existing import sites.
export { ServicesProvider };

export const useServices = (): Services => {
  const value = useContext(ServicesContext);
  if (!value) {
    throw new Error("useServices must be used inside <ServicesProvider>");
  }
  return value;
};
