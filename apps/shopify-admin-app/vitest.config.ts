import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths() as any],
  test: {
    globals: true,
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "build/",
        ".react-router/",
        "test/",
        "**/*.config.ts",
        "**/*.d.ts",
      ],
    },
    include: ["app/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    // Support multiple test environments
    environmentMatchGlobs: [
      // React component tests run in jsdom
      ['test/components/**/*.test.{ts,tsx}', 'jsdom'],
      ['app/routes/**/*.test.{ts,tsx}', 'jsdom'],
      // Everything else runs in node
      ['**/*.test.{ts,tsx}', 'node'],
    ],
  },
});
