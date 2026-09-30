import { normalizeIndonesiaPhone } from "./directory-findability";

/** Phone numbers as links: `tel:` always, and a WhatsApp link only when the number normalizes to a plausible international number. */
export function PhoneLinks({ phones, keyPrefix = "phone" }: { phones: readonly string[]; keyPrefix?: string }) {
  return (
    <>
      {phones.map((phone, index) => {
        const normalized = normalizeIndonesiaPhone(phone);
        return (
          <span key={`${keyPrefix}-${index}-${phone}`}>
            {index ? ", " : ""}
            {normalized ? <a href={`tel:${phone.replace(/\s/g, "")}`} className="text-action underline">{phone}</a> : phone}
            {normalized ? <a href={`https://wa.me/${normalized}`} target="_blank" rel="noopener noreferrer" className="ml-1 text-action underline" aria-label={`WhatsApp ${phone}`}>WA</a> : null}
          </span>
        );
      })}
    </>
  );
}
