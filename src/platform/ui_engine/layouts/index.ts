export type AppLayoutTemplate = "workspace" | "catalog" | "editor" | "settings";

export type LayoutDefinition = {
  template: AppLayoutTemplate;
  hasPrimaryNav: boolean;
  hasSecondaryNav?: boolean;
  contentMode: "fixed" | "fluid";
};
