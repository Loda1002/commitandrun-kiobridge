import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    /**
     * The repo root, two levels up.
     *
     * Turbopack refuses to resolve anything outside its root, and it picks that
     * root by looking for a lockfile — which here is `apps/web/package-lock.json`,
     * because this app is not part of an npm workspace. That would put
     * `packages/engine` out of bounds, and `lib/api.ts` imports the engine's
     * functions to run them in the browser.
     *
     * Type-only imports used to hide this: they are erased before the bundler
     * ever sees them, so the build passed while the path was unresolvable.
     */
    root: path.resolve(__dirname, "..", ".."),
  },
};

export default nextConfig;
