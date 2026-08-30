import { importExportService } from "@masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@masterdata/infrastructure/request-context";
import { AppError, createOperationalErrorReporter, toSafeErrorPayload } from "@platform/core/errors";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("workbook");
    if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "WORKBOOK_REQUIRED", "Select an XLSX workbook.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const preview = await importExportService.preview((await requireMasterDataRequestContext()), bytes);
    if (new URL(request.url).searchParams.get("mode") === "apply") {
      const changedRows = await importExportService.apply((await requireMasterDataRequestContext()), preview);
      return Response.json({ ok: true, changedRows });
    }
    return Response.json({ ok: preview.issues.length === 0, changedRows: preview.changedRows, issues: preview.issues });
  } catch (error) {
    const payload = toSafeErrorPayload(error, { reportUnknownError: createOperationalErrorReporter("masterdata.import") });
    return Response.json(payload, { status: payload.kind === "UNAUTHENTICATED" ? 401 : payload.kind === "FORBIDDEN" ? 403 : 400 });
  }
}
