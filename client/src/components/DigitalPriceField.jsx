import React from 'react';
import { getDigitalAmountCents, MAX_DIGITAL_PRICE } from '../assets/digitalPricing';

const DigitalPriceField = ({ value, onChange, disabled = false, idPrefix = 'digital' }) => {
  const invalid = value.trim() !== '' && getDigitalAmountCents(value) === null;
  const id = `${idPrefix}-price`;
  return <section className="digital-price-choice" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>Pay what you wish</h2>
    <p id={`${id}-help`}>$1 minimum</p>
    <label htmlFor={id}>Your price (USD)</label>
    <div className="digital-price-input"><span aria-hidden="true">$</span><input
      id={id} name="digitalPrice" type="number" inputMode="decimal" min="1" max={MAX_DIGITAL_PRICE} step="1"
      value={value} onChange={event => onChange(event.target.value)} disabled={disabled} required
      onBlur={() => {
        const cents = getDigitalAmountCents(value);
        if (cents !== null) {
          const formatted = (cents / 100).toFixed(2);
          if (formatted !== value) onChange(formatted);
        }
      }}
      aria-describedby={`${id}-help${invalid ? ` ${id}-error` : ''}`} aria-invalid={invalid}
    /></div>
    {invalid && <p className="field-error" id={`${id}-error`}>Please provide an acceptable amount with up to 2 decimal places</p>}
  </section>;
};

export default DigitalPriceField;
