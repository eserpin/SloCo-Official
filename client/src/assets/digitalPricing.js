export const DEFAULT_DIGITAL_PRICE = '';
export const MAX_DIGITAL_PRICE = 10000;

export const getDigitalAmountCents = value => {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [dollars, fraction = ''] = text.split('.');
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 100 && cents <= MAX_DIGITAL_PRICE * 100 ? cents : null;
};
