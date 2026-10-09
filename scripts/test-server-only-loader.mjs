import { registerHooks } from "node:module";

// `server-only` is a Next.js build-time marker with no installed package. Alias it to Next's own
// empty stub so Node's test runner can load server modules, for both import and require.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return nextResolve("next/dist/compiled/server-only/empty.js", context);
    return nextResolve(specifier, context);
  },
});
