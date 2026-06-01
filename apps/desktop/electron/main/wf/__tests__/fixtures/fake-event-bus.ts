import type {
  DomainEventHandler,
  EventBus,
  LlmSessionBus,
  LlmSessionEvent,
  LlmSessionHandler,
  Unsubscribe,
} from "../../application/ports/outbound/event-bus";
import type { DomainEvent } from "../../domain/events";
import type { StepExecId } from "../../domain/ids";

export type FakeEventBus = EventBus & {
  /** Tous les events publiés dans l'ordre. */
  readonly published: ReadonlyArray<DomainEvent>;
  /** Filtre par type pour les assertions. */
  ofType<T extends DomainEvent["type"]>(
    t: T,
  ): ReadonlyArray<Extract<DomainEvent, { type: T }>>;
  /** Reset complet (handlers + buffer). */
  reset(): void;
  /** Reset du buffer publié seulement (les abonnements restent en place). */
  clearPublished(): void;
};

export const createFakeEventBus = (): FakeEventBus => {
  const handlers = new Set<DomainEventHandler>();
  let published: DomainEvent[] = [];

  const bus: FakeEventBus = {
    async publish(evt) {
      published.push(evt);
      for (const h of [...handlers]) {
        await h(evt);
      }
    },
    subscribe(handler): Unsubscribe {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    get published() {
      return published;
    },
    ofType(t) {
      return published.filter((e) => e.type === t) as unknown as ReadonlyArray<
        Extract<DomainEvent, { type: typeof t }>
      >;
    },
    reset() {
      handlers.clear();
      published = [];
    },
    clearPublished() {
      published = [];
    },
  };

  return bus;
};

export type FakeLlmSessionBus = LlmSessionBus & {
  readonly emitted: ReadonlyArray<LlmSessionEvent>;
  reset(): void;
};

export const createFakeLlmSessionBus = (): FakeLlmSessionBus => {
  const handlers = new Set<LlmSessionHandler>();
  const byExec = new Map<StepExecId, LlmSessionEvent[]>();
  let emitted: LlmSessionEvent[] = [];

  return {
    emit(evt) {
      emitted.push(evt);
      const id = evt.stepExecId as StepExecId;
      const bucket = byExec.get(id) ?? [];
      bucket.push(evt);
      byExec.set(id, bucket);
      for (const h of handlers) h(evt);
    },
    subscribe(handler): Unsubscribe {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    getReplay(stepExecId) {
      return byExec.get(stepExecId as StepExecId) ?? [];
    },
    get emitted() {
      return emitted;
    },
    reset() {
      handlers.clear();
      byExec.clear();
      emitted = [];
    },
  };
};
