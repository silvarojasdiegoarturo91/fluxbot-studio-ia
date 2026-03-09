import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths() as any],
  test: {
    globals: true,
    environment: "node",
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
  },
});
