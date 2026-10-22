export {
  PLATFORM_MODULE_MANIFEST,
  composeModuleRegistry,
  getModuleRegistry,
  initializeModuleRegistry,
  resetModuleRegistryForTests,
  type ModuleKind,
  type ModuleManifest,
  type ModuleRegistry,
} from "./manifest";
export { enabledModuleIds, enabledPermissionIds, isModuleEnabled, listModuleOverview, requireModuleEnabled, synchronizeModuleVersions, type ModuleOverview } from "./state";
export { changeIntegrationAccess, listIntegrationAccess, type IntegrationAccessOverview } from "./integration-access";
