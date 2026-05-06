import { describe, expect, it } from "vitest";
import { getIAExecutionMode, isRemoteIAExecutionEnabled } from "../../app/services/ia-execution-mode.server";

describe("ia-execution-mode", () => {
  it("forces remote mode in production even if local was requested", () => {
    expect(
      getIAExecutionMode({
        NODE_ENV: "production",
        IA_EXECUTION_MODE: "local",
      } as NodeJS.ProcessEnv),
    ).toBe("remote");
  });

  it("keeps local mode available outside production", () => {
    expect(
      getIAExecutionMode({
        NODE_ENV: "development",
        IA_EXECUTION_MODE: "local",
      } as NodeJS.ProcessEnv),
    ).toBe("local");
  });

  it("reports remote execution as enabled in production", () => {
    expect(
      isRemoteIAExecutionEnabled({
        NODE_ENV: "production",
        IA_EXECUTION_MODE: "local",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
