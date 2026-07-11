export type ExternalStore<T> = {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
  update(update: Partial<T> | ((current: T) => T)): void;
};

export function createExternalStore<T extends object>(initial: T): ExternalStore<T> {
  let snapshot = initial;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(update) {
      snapshot = typeof update === "function"
        ? update(snapshot)
        : { ...snapshot, ...update };
      for (const listener of listeners) listener();
    },
  };
}
