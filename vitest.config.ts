import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests target PURE logic (no DB / no network). Several of those functions
// live in files marked `import "server-only"`, which throws outside a server
// bundle — alias it to a no-op stub so the pure exports are importable in tests.
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
