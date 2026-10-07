import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MASTERDATA_PERMISSIONS as MD } from "@/apps/masterdata/public";
import { STUDIOFLOW_PERMISSIONS as SF } from "@/apps/studioflow/public";

import { masterDataSettingsGroups } from "../masterdata/settings/sections";
import { studioFlowSettingsGroups } from "../studioflow/settings/sections";
import { canOpenSettingsSection, firstSettingsHref, platformSettingsGroups, visibleSettingsGroups, type SettingsSectionGroup } from "./settings-sections";

const hrefs = (groups: SettingsSectionGroup[]) => groups.flatMap((group) => group.items.map((item) => item.href));
const visibleHrefs = (groups: SettingsSectionGroup[]) => hrefs(visibleSettingsGroups(groups));
const EVERYTHING = [...Object.values(SF), ...Object.values(MD), "platform.settings.read", "platform.user.read", "platform.role.read"];

describe("settings ownership (owner, 2026-10-06)", () => {
  it("keeps each settings area's sidebar inside its own owner, even for someone who holds everything", () => {
    assert.ok(hrefs(platformSettingsGroups(EVERYTHING)).every((href) => href.startsWith("/settings/")));
    assert.ok(hrefs(studioFlowSettingsGroups(EVERYTHING)).every((href) => href.startsWith("/studioflow/settings/")));
    assert.ok(hrefs(masterDataSettingsGroups(EVERYTHING)).every((href) => href.startsWith("/masterdata/settings/")));
  });

  it("shows platform pages only to the matching platform permission", () => {
    assert.deepEqual(visibleHrefs(platformSettingsGroups([])), []);
    assert.deepEqual(visibleHrefs(platformSettingsGroups(["platform.user.read"])), ["/settings/access/users"]);
    assert.equal(firstSettingsHref(platformSettingsGroups(["platform.role.read"])), "/settings/access/roles");
    assert.equal(firstSettingsHref(platformSettingsGroups([...Object.values(SF), ...Object.values(MD)])), null, "app permissions never open platform settings");
  });

  it("hides StudioFlow settings from people who only work on projects", () => {
    const worker = [SF.access, SF.projectRead, SF.phaseWork, SF.taskManage, SF.momManage, SF.scheduleManage];
    assert.equal(firstSettingsHref(studioFlowSettingsGroups(worker)), null);
    assert.deepEqual(visibleHrefs(studioFlowSettingsGroups([SF.access, SF.projectRead, SF.projectManage])), ["/studioflow/settings/archived-files"]);
    const admin = studioFlowSettingsGroups([SF.access, SF.projectRead, SF.settingsManage]);
    assert.deepEqual(visibleHrefs(admin), ["/studioflow/settings/phases", "/studioflow/settings/checklists", "/studioflow/settings/schedule", "/studioflow/settings/planning", "/studioflow/settings/archived-files"]);
    assert.equal(canOpenSettingsSection(studioFlowSettingsGroups(worker), "schedule"), false);
  });

  it("shows Master Data settings only to people who may change or decide something there", () => {
    assert.equal(firstSettingsHref(masterDataSettingsGroups([MD.access, MD.dictionaryRead])), null, "reading dictionaries is not a settings permission");
    assert.deepEqual(visibleHrefs(masterDataSettingsGroups([MD.dictionaryManage])), ["/masterdata/settings/units", "/masterdata/settings/categories", "/masterdata/settings/supplier-types"]);
    assert.deepEqual(visibleHrefs(masterDataSettingsGroups([MD.deletionApprove])), ["/masterdata/settings/deletions"]);
    assert.deepEqual(visibleHrefs(masterDataSettingsGroups([MD.promotionApprove])), ["/masterdata/settings/bq-approvals"]);
  });
});
