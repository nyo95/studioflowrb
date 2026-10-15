import "server-only";

import { readPlatformGeneralSettings } from "@platform/core/settings";
import { brandMarkStorage, objectStorage, prisma } from "@platform/runtime";
import { readStudioFlowDocumentIdentity } from "./document-identity";

/** The consultant's (StudioFlow's) letterhead as printed: its own identity, else the platform organisation and mark. */
export type ConsultantLetterhead = { name: string; logoUrl: string | null; address: string | null; email: string | null };

export async function readConsultantLetterhead(): Promise<ConsultantLetterhead> {
  const [identity, platform] = await Promise.all([
    readStudioFlowDocumentIdentity(prisma),
    readPlatformGeneralSettings(prisma, (key) => brandMarkStorage.createPublicReadUrl(key)),
  ]);
  // As the BQ quotation does: once StudioFlow names itself or has a logo, the platform mark no longer stands in.
  const own = Boolean(identity.companyName || identity.logoKey);
  const logoUrl = identity.logoKey ? await objectStorage.createSignedReadUrl(identity.logoKey, 600).catch(() => null) : null;
  return {
    name: identity.companyName ?? platform.organizationName,
    logoUrl: own ? logoUrl : platform.brandMarkUrl,
    address: identity.companyAddress,
    email: identity.companyEmail,
  };
}

/** The logo, or the company name set in caps when there is none. `size` is its printed height. */
export function LetterheadMark({ letterhead, size }: { letterhead: ConsultantLetterhead; size: "header" | "running" }) {
  if (letterhead.logoUrl) {
    // A short-lived signed URL; next/image optimisation would cache it.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={letterhead.logoUrl} alt={letterhead.name} className={`block w-auto object-contain object-left ${size === "header" ? "h-[11mm] max-w-[60mm]" : "h-[5mm] max-w-[30mm]"}`} />;
  }
  return <p className={`m-0 font-bold uppercase tracking-[0.18em] ${size === "header" ? "text-[14pt]" : "text-[8pt]"}`}>{letterhead.name}</p>;
}

/** Letterhead strip above a document's own header: the mark at the left, address and e-mail at the right. */
export function LetterheadStrip({ letterhead }: { letterhead: ConsultantLetterhead }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-6">
      <LetterheadMark letterhead={letterhead} size="header" />
      {letterhead.address || letterhead.email ? (
        <p className="m-0 shrink-0 text-right text-[8pt] leading-snug text-neutral-600">
          {(letterhead.address ?? "").split("\n").map((line, index) => <span key={index} className="block">{line.trimEnd() || " "}</span>)}
          {letterhead.email ? <span className="block">{letterhead.email}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
