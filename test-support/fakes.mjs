import { EventEmitter } from 'node:events';
export function fakePi(cwd, models = []) {
  const handlers = new Map(),
    commands = new Map(),
    providers = new Map(),
    entries = [],
    bus = new EventEmitter(),
    notifications = [];
  let selected = models[0],
    leaf = 0;
  const virtuals = [];
  const registry = {
    getAll: () => models,
    getAvailable: () => models,
    getModelsOfType: () => [],
    find: (p, id) =>
      models.find((m) => m.provider === p && m.id === id) ??
      virtuals.find((m) => m.provider === p && m.id === id),
    findOfType: () => null,
    getProvider: (p) => providers.get(p),
    getRegisteredNativeProvider: (p) => undefined,
    getRegisteredProviderConfig: () => undefined,
  };
  const pi = {
    on: (name, fn) => {
      const all = handlers.get(name) ?? [];
      all.push(fn);
      handlers.set(name, all);
      return () => {};
    },
    events: {
      on: (name, fn) => {
        bus.on(name, fn);
        return () => bus.off(name, fn);
      },
      emit: (name, payload) => bus.emit(name, payload),
    },
    registerCommand: (name, c) => commands.set(name, c),
    registerVirtualModel: (v) => {
      pi.virtual = v;
      virtuals.push(v);
    },
    registerTool: (t) => {
      pi.tool = t;
    },
    getAllTools: () => [],
    getActiveTools: () => [],
    setActiveTools: () => {},
    getMcpServers: () => [],
    registerMcpServer: () => {},
    unregisterMcpServer: () => {},
    registerProvider: (p) => providers.set(p.id, p),
    unregisterProvider: (p) => providers.delete(p),
    appendEntry: (customType, data) =>
      entries.push({ id: `e${++leaf}`, type: 'custom', customType, data }),
    setModel: async (m) => {
      selected = m;
      return true;
    },
  };
  const ctx = {
    cwd,
    hasUI: true,
    mode: 'tui',
    ui: {
      notify: (v) => notifications.push(v),
      confirm: async () => true,
      select: async (_title, options) => options?.[0],
      input: async (_title, placeholder) => placeholder ?? 'typed',
      setStatus: () => {},
    },
    sessionManager: {
      getSessionId: () => 'S1',
      getBranch: () => entries,
      getLeafId: () => entries.at(-1)?.id ?? null,
    },
    modelRegistry: registry,
    isProjectTrusted: () => true,
    isIdle: () => false,
    getContextUsage: () => undefined,
    abort: () => {
      ctx.aborted = true;
    },
    signal: undefined,
    thinkingLevel: 'off',
    waitForIdle: async () => {},
    get model() {
      return selected;
    },
  };
  return {
    pi,
    ctx,
    handlers,
    commands,
    providers,
    entries,
    notifications,
    async emit(name, data = {}) {
      let result;
      for (const fn of handlers.get(name) ?? []) {
        const r = await fn({ type: name, ...data }, ctx);
        if (r) result = r;
        if (r?.block) break;
      }
      return result;
    },
    command: (name, args) => commands.get(name).handler(args, ctx),
  };
}
export class TestStream {
  constructor() {
    this.events = [];
    this.finished = false;
    this.wait = [];
    this.promise = new Promise((r) => (this.done = r));
  }
  push(e) {
    this.events.push(e);
    if (e.type === 'done' || e.type === 'error') this.final = e.message ?? e.error;
    this.wait.splice(0).forEach((r) => r());
  }
  end(m) {
    this.final = m ?? this.final;
    this.finished = true;
    this.done(this.final);
    this.wait.splice(0).forEach((r) => r());
  }
  result() {
    return this.promise;
  }
  async *[Symbol.asyncIterator]() {
    let i = 0;
    while (true) {
      if (i < this.events.length) {
        yield this.events[i++];
        continue;
      }
      if (this.finished) return;
      await new Promise((r) => this.wait.push(r));
    }
  }
}
