/**
 * index.js
 *
 * API pública para uso programático do deps-guard.
 * Permite que outros scripts importem as funções individuais
 * sem passar pelo CLI completo.
 */

export { checkOutdated } from "./checker.js";
export { resolveConfig } from "./config.js";
export { filterPackages, resolveExitCode } from "./filter.js";
export {
  getUpdateType,
  isOutdated,
  meetsThreshold,
  parseVersion,
} from "./semver.js";
export { runUpdate } from "./updater.js";
