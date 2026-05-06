export type IAExecutionMode = "local" | "remote";

export function getIAExecutionMode(env: NodeJS.ProcessEnv = process.env): IAExecutionMode {
  if (env.NODE_ENV === "production") {
    return "remote";
  }

  return env.IA_EXECUTION_MODE === "local" ? "local" : "remote";
}

export function isRemoteIAExecutionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getIAExecutionMode(env) === "remote";
}
