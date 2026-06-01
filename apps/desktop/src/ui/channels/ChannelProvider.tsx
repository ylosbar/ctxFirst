import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useServices } from "../di/services-provider";

type ChannelContextValue = {
  /** Currently-active channel id. Hydrated from the main process at mount. */
  activeChannelId: string;
  /**
   * Bumped each time the active channel changes. UI hooks watch this in their
   * effect deps to know when to refetch — cheaper than re-subscribing each
   * hook to the gateway directly.
   */
  channelVersion: number;
  /**
   * Switches channel. Awaits the IPC round-trip; the actual `activeChannelId`
   * state moves once the main process's `onChanged` event arrives, so
   * concurrent listeners and this component stay coherent.
   */
  setActiveChannel: (id: string) => Promise<void>;
  /**
   * Bumps `channelVersion` without changing the active channel — used after a
   * channel was re-saved (e.g. new uploaded image) so dependent hooks (icon
   * cache, lists…) drop stale state and refetch.
   */
  bumpVersion: () => void;
};

const ChannelContext = createContext<ChannelContextValue | null>(null);

const ChannelProvider = ({ children }: PropsWithChildren) => {
  const { workflowGateway } = useServices();
  const [activeChannelId, setActiveChannelId] = useState<string>("personal");
  const [channelVersion, setChannelVersion] = useState(0);

  useEffect(() => {
    let mounted = true;
    void workflowGateway.getActiveChannel().then((id) => {
      if (mounted) setActiveChannelId(id);
    });
    const unsub = workflowGateway.onChannelChanged((id) => {
      setActiveChannelId(id);
      setChannelVersion((v) => v + 1);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [workflowGateway]);

  const setActive = useCallback(
    async (id: string) => {
      await workflowGateway.setActiveChannel(id);
    },
    [workflowGateway],
  );

  const bumpVersion = useCallback(() => {
    setChannelVersion((v) => v + 1);
  }, []);

  const value = useMemo<ChannelContextValue>(
    () => ({
      activeChannelId,
      channelVersion,
      setActiveChannel: setActive,
      bumpVersion,
    }),
    [activeChannelId, channelVersion, setActive, bumpVersion],
  );

  return (
    <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>
  );
};

export default ChannelProvider;

export const useActiveChannel = (): ChannelContextValue => {
  const value = useContext(ChannelContext);
  if (!value) {
    throw new Error("useActiveChannel must be used inside <ChannelProvider>");
  }
  return value;
};
