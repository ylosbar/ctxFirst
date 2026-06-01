import type {
  DomainEventHandler,
  EventBus,
  Unsubscribe,
} from "../../application/ports/outbound/event-bus";
import type { DomainEvent } from "../../domain/events";

export const createInMemoryEventBus = (): EventBus => {
  const handlers = new Set<DomainEventHandler>();
  return {
    async publish(evt: DomainEvent) {
      for (const h of handlers) {
        await h(evt);
      }
    },
    subscribe(h: DomainEventHandler): Unsubscribe {
      handlers.add(h);
      return () => handlers.delete(h);
    },
  };
};
