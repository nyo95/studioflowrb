/**
 * StudioFlow public boundary.
 *
 * Only this file may be imported by other apps. StudioFlow's internals
 * (service.ts, runtime.ts, components) are private.
 */

export { STUDIOFLOW_PERMISSIONS } from "../service";
export type {
  CreateClientInput,
  EditClientInput,
  CreateProjectInput,
  EditProjectInput,
  RecordFileInput,
  UpdateNamingTemplateInput,
  SendIterationInput,
  AddIterationPointInput,
  WithdrawPointInput,
} from "../service";
