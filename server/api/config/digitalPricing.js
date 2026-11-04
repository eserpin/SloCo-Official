const MIN_DIGITAL_AMOUNT_CENTS = 100;
// PayPal may cap verified-account transactions at $10,000, below Stripe's
// USD ceiling. Use that conservative shared checkout cap.
const MAX_DIGITAL_AMOUNT_CENTS = 1000000;

const parseDigitalPrice = value => {
  if (!['number', 'string'].includes(typeof value)) throw new Error('Enter a digital price of at least $1 with no more than two decimal places.');
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter a digital price of at least $1 with no more than two decimal places.');
  const [dollars, fraction = ''] = text.split('.');
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < MIN_DIGITAL_AMOUNT_CENTS || cents > MAX_DIGITAL_AMOUNT_CENTS) throw new Error('Digital downloads must be between $1 and $10,000 USD.');
  return cents;
};

const getDigitalUnitAmountCents = item => {
  if (item.unitAmountCents !== undefined) {
    if (!Number.isSafeInteger(item.unitAmountCents) || item.unitAmountCents < MIN_DIGITAL_AMOUNT_CENTS || item.unitAmountCents > MAX_DIGITAL_AMOUNT_CENTS) {
      throw new Error('Digital downloads must be between $1 and $10,000 USD, in whole cents.');
    }
    return item.unitAmountCents;
  }
  // Older open checkout tabs sent price only; validate that amount rather than
  // silently changing an already-selected/paid price during rollout.
  return parseDigitalPrice(item.price);
};

module.exports = { MIN_DIGITAL_AMOUNT_CENTS, MAX_DIGITAL_AMOUNT_CENTS, parseDigitalPrice, getDigitalUnitAmountCents };
