import React, { useCallback, useEffect, useRef } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import countryCodes from "../assets/countryCodes";

const googleLibraries = ["places"];
const countries = Object.entries(countryCodes);
const getCountryCode = (address) => countryCodes[address.country] || address.country || address.country_code || "US";
const requiresRegion = (country) => ["US", "CA", "AU"].includes(country);
const requiresPostcode = (country) => ["US", "CA", "AU", "GB"].includes(country);

export const getAddressErrors = (address) => {
  const country = getCountryCode(address);
  const errors = {};
  if (!address.street1?.trim()) errors.street1 = "Enter your street address.";
  if (!address.city?.trim()) errors.city = "Enter your city or town.";
  if (requiresRegion(country) && !address.state?.trim()) errors.state = "Enter your state or province.";
  if (requiresPostcode(country) && !address.zip?.trim()) errors.zip = "Enter your ZIP or postal code.";
  else if (country === "US" && address.zip && !/^\d{5}(-\d{4})?$/.test(address.zip.trim())) errors.zip = "Enter a 5-digit ZIP code, or ZIP+4.";
  if (!countries.some(([, code]) => code === country)) errors.country = "Choose your country.";
  return errors;
};

// Enhance the same input, so loading/failing Google never hides or replaces the form.
const GoogleAddressSuggestions = ({ inputRef, onSelect, countryCode }) => {
  const autocompleteRef = useRef(null);
  const { isLoaded } = useJsApiLoader({ id: "google-map-script", googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY, libraries: googleLibraries });
  useEffect(() => {
    if (!isLoaded || !inputRef.current || !window.google?.maps?.places?.Autocomplete) return undefined;
    const input = inputRef.current;
    let listener;
    let observer;
    try {
      const autocomplete = new window.google.maps.places.Autocomplete(input, { types: ["address"], fields: ["address_components"] });
      autocompleteRef.current = autocomplete;
      listener = autocomplete.addListener("place_changed", () => onSelect(autocomplete.getPlace()));
      // Google's widget can set this to "off". Preserve saved-browser-address autofill.
      const restoreAutofill = () => {
        if (input.getAttribute("autocomplete") !== "shipping address-line1") input.setAttribute("autocomplete", "shipping address-line1");
      };
      restoreAutofill();
      observer = new MutationObserver(restoreAutofill);
      observer.observe(input, { attributes: true, attributeFilter: ["autocomplete"] });
    } catch (error) {
      console.warn("Address suggestions unavailable; manual address entry is available.");
    }
    return () => {
      observer?.disconnect(); listener?.remove(); autocompleteRef.current?.unbindAll(); autocompleteRef.current = null;
    };
  }, [isLoaded, inputRef, onSelect]);
  useEffect(() => { autocompleteRef.current?.setComponentRestrictions({ country: countryCode.toLowerCase() }); }, [isLoaded, countryCode]);
  return null;
};

const AddressForm = ({ address, onChange, errors = {} }) => {
  const inputRef = useRef(null);
  const country = getCountryCode(address);
  const handleSelect = useCallback((place) => {
    if (!place?.address_components?.length) { onChange({ street1: inputRef.current?.value || "" }); return; }
    const component = (type, short = false) => {
      const value = place.address_components.find((part) => part.types.includes(type));
      return value?.[short ? "short_name" : "long_name"] || "";
    };
    const selectedCountry = component("country", true);
    const zip = component("postal_code");
    const suffix = component("postal_code_suffix");
    onChange({
      street1: [component("street_number"), component("route")].filter(Boolean).join(" ") || inputRef.current?.value || "",
      city: component("locality") || component("postal_town") || component("sublocality_level_1") || component("sublocality") || component("administrative_area_level_2"),
      state: component("administrative_area_level_1", true), zip: zip && suffix ? `${zip}-${suffix}` : zip,
      apartment: component("subpremise"),
      ...(selectedCountry ? { country: selectedCountry, country_code: selectedCountry } : {}),
    });
  }, [onChange]);
  const field = (name, label, autocomplete, required = false) => (
    <label htmlFor={`shipping-${name}`}>
      {label}
      <input id={`shipping-${name}`} name={name} type="text" value={address[name] || ""}
        onChange={(event) => onChange({ [name]: event.target.value })} autoComplete={`shipping ${autocomplete}`} required={required}
        aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `shipping-${name}-error` : undefined} />
      {errors[name] && <span className="field-error" id={`shipping-${name}-error`}>{errors[name]}</span>}
    </label>
  );
  return (
    <fieldset className="address-form shipping-address">
      <legend>Shipping address</legend>
      <label htmlFor="shipping-country">Country
        <select id="shipping-country" name="country" value={country} autoComplete="shipping country" required
          onChange={(event) => onChange({ country: event.target.value, country_code: event.target.value })}
          aria-invalid={Boolean(errors.country)} aria-describedby={errors.country ? "shipping-country-error" : undefined}>
          {countries.map(([name, code]) => <option key={code} value={code}>{name}</option>)}
        </select>
        {errors.country && <span className="field-error" id="shipping-country-error">{errors.country}</span>}
      </label>
      <div className="address-street-row">
      <div>
      <label htmlFor="shipping-street1">Street address
        <input ref={inputRef} id="shipping-street1" name="street1" type="text" value={address.street1 || ""}
          onChange={(event) => onChange({ street1: event.target.value })} autoComplete="shipping address-line1" placeholder="Street and house number" required
          aria-invalid={Boolean(errors.street1)} aria-describedby={errors.street1 ? "shipping-street1-error" : undefined} />
        {errors.street1 && <span className="field-error" id="shipping-street1-error">{errors.street1}</span>}
      </label>
      </div>
      {field("apartment", "Apartment (Optional)", "address-line2")}
      </div>
      {process.env.REACT_APP_GOOGLE_MAPS_KEY && <GoogleAddressSuggestions inputRef={inputRef} onSelect={handleSelect} countryCode={country} />}
      <div className="address-location-row">
        {field("city", "City / Town", "address-level2", true)}
        {field("state", country === "US" ? "State" : "State / province", "address-level1", requiresRegion(country))}
        {field("zip", country === "US" ? "ZIP code" : "Postal code", "postal-code", requiresPostcode(country))}
      </div>
    </fieldset>
  );
};
export default AddressForm;
