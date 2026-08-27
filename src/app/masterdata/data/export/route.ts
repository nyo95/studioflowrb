import { importExportService } from "@masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT } from "@masterdata/infrastructure/request-context";
import { toSafeErrorPayload } from "@platform/core/errors";

export async function GET() {
  try {
    const bytes = await importExportService.export(MASTER_DATA_REQUEST_CONTEXT);
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="master-data-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const payload = toSafeErrorPayload(error, { reportUnknownError: console.error });
    return Response.json(payload, { status: payload.kind === "UNAUTHENTICATED" ? 401 : payload.kind === "FORBIDDEN" ? 403 : 400 });
  }
}
