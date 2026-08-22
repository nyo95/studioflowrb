export function formatMoney(amount: number, currency = "IDR", locale = "id-ID") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}
