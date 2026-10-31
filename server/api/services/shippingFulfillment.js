const CUSTOMS_EEL_PFC = "NOEEI_30_37_a";
const ALLOWED_RATE_PROVIDERS = new Set(["UPS", "USPS"]);

class AddressValidationError extends Error {
  constructor(message, validationResults) {
    super(message);
    this.name = "AddressValidationError";
    this.statusCode = 400;
    this.validationResults = validationResults;
  }
}

const normalizeAddress = (address = {}) => {
  const normalized = { ...address };

  if (!normalized.zip && normalized.postal_code) {
    normalized.zip = normalized.postal_code;
  }
  if (!normalized.postal_code && normalized.zip) {
    normalized.postal_code = normalized.zip;
  }
  if (normalized.country_code) {
    normalized.country = normalized.country_code;
  }
  delete normalized.country_code;

  return normalized;
};

const createCustomsDeclaration = async ({ shippo, contentsExplanation, items }) =>
  shippo.customsDeclarations.create({
    contentsType: "MERCHANDISE",
    contentsExplanation,
    nonDeliveryOption: "RETURN",
    eelPfc: CUSTOMS_EEL_PFC,
    certify: true,
    certifySigner: "Anil Serpin",
    items,
  });

const formatAddressValidationMessage = (validationResults = {}) => {
  const messages = validationResults.messages || [];
  const text = messages
    .map((message) => message.text || message.message || message.code)
    .filter(Boolean)
    .join(" ");

  return text || "Shippo could not validate this shipping address.";
};

const toShippoAddress = (address = {}) => {
  const normalized = normalizeAddress(address);

  return {
    name: normalized.name,
    company: normalized.company,
    street1: normalized.street1,
    street2: normalized.street2 || normalized.apartment,
    street3: normalized.street3,
    city: normalized.city,
    state: normalized.state,
    zip: normalized.zip || normalized.postal_code,
    country: normalized.country || "US",
    phone: normalized.phone,
    email: normalized.email,
    isResidential: normalized.isResidential,
  };
};

const validateShippoAddress = async ({ shippo, address, name, email }) => {
  const addressForValidation = {
    ...toShippoAddress(address),
    name: name || address?.name || "Customer",
    email: email || address?.email,
    validate: true,
  };

  const validatedAddress = await shippo.addresses.create(addressForValidation);
  const validationResults = validatedAddress.validationResults || {};

  if (validationResults.isValid === false) {
    throw new AddressValidationError(
      formatAddressValidationMessage(validationResults),
      validationResults
    );
  }

  return normalizeAddress({
    ...toShippoAddress({ ...address, ...validatedAddress }),
    postal_code: validatedAddress.zip || address?.postal_code,
    country_code: validatedAddress.country || address?.country_code,
  });
};

const getShipmentConfigs = ({
  bookQuantity = 0,
  otherPhysicalQuantity = 0,
  printQuantity = 0,
}) => {
  const shipmentConfigs = [];

  if (bookQuantity > 0) {
    const bookWeight = 1.6 * bookQuantity;
    const stickerWeight = 0.04 * otherPhysicalQuantity;
    const totalWeight = bookWeight + stickerWeight;
    const items = [
      {
        description: "Graphic Novel",
        quantity: bookQuantity,
        netWeight: bookWeight.toFixed(2),
        massUnit: "lb",
        valueAmount: (20 * bookQuantity).toFixed(2),
        valueCurrency: "USD",
        originCountry: "US",
      },
    ];

    if (otherPhysicalQuantity > 0) {
      items.push({
        description: "Stickers and Bookmarks",
        quantity: otherPhysicalQuantity,
        netWeight: stickerWeight.toFixed(2),
        massUnit: "lb",
        valueAmount: (10 * otherPhysicalQuantity).toFixed(2),
        valueCurrency: "USD",
        originCountry: "US",
      });
    }

    shipmentConfigs.push({
      parcel: {
        weight: totalWeight.toFixed(2),
        length: bookQuantity >= 2 && bookQuantity <= 4 ? "9" : "10",
        width: bookQuantity >= 2 && bookQuantity <= 4 ? "9" : "7.5",
        height: bookQuantity >= 2 && bookQuantity <= 4 ? "5" : "1",
        massUnit: "lb",
        distanceUnit: "in",
      },
      customs: {
        contentsExplanation: "Graphic Novel and Stickers/Bookmarks",
        items,
      },
    });
  }

  if (bookQuantity === 0 && otherPhysicalQuantity > 0) {
    const stickerWeight = 0.04 * otherPhysicalQuantity;

    shipmentConfigs.push({
      parcel: {
        weight: stickerWeight.toFixed(2),
        length: "6.5",
        width: "4.5",
        height: "1",
        massUnit: "lb",
        distanceUnit: "in",
      },
      customs: {
        contentsExplanation: "Stickers and Bookmarks",
        items: [
          {
            description: "Stickers and Bookmarks",
            quantity: otherPhysicalQuantity,
            netWeight: stickerWeight.toFixed(2),
            massUnit: "lb",
            valueAmount: (10 * otherPhysicalQuantity).toFixed(2),
            valueCurrency: "USD",
            originCountry: "US",
          },
        ],
      },
    });
  }

  if (printQuantity > 0) {
    const numShipments = Math.ceil(printQuantity / 2);

    for (let i = 0; i < numShipments; i += 1) {
      const quantityInBox = Math.min(2, printQuantity - i * 2);

      shipmentConfigs.push({
        parcel: {
          weight: "1",
          length: "20",
          width: "4",
          height: "4",
          massUnit: "lb",
          distanceUnit: "in",
        },
        customs: {
          contentsExplanation: "Prints",
          items: [
            {
              description: "Prints",
              quantity: quantityInBox,
              netWeight: "1",
              massUnit: "lb",
              valueAmount: "15.00",
              valueCurrency: "USD",
              originCountry: "US",
            },
          ],
        },
      });
    }
  }

  return shipmentConfigs;
};

const createShipments = async ({
  shippo,
  addressFrom,
  addressTo,
  name,
  bookQuantity,
  otherPhysicalQuantity,
  printQuantity,
  isInternational,
  onShipmentCreated,
}) => {
  const normalizedAddressTo = normalizeAddress(addressTo);
  const shipmentConfigs = getShipmentConfigs({
    bookQuantity,
    otherPhysicalQuantity,
    printQuantity,
  });
  const shipments = [];

  for (const shipmentConfig of shipmentConfigs) {
    let customsDeclaration = null;

    if (isInternational) {
      customsDeclaration = await createCustomsDeclaration({
        shippo,
        ...shipmentConfig.customs,
      });
    }

    const shipment = await shippo.shipments.create({
      addressFrom,
      addressTo: {
        ...normalizedAddressTo,
        name: name || normalizedAddressTo.name || "Customer",
      },
      parcels: [shipmentConfig.parcel],
      ...(customsDeclaration && { customsDeclaration: customsDeclaration.objectId }),
    });

    shipments.push(shipment);
    if (onShipmentCreated) await onShipmentCreated(shipment, shipments.length - 1);
  }

  return shipments;
};

const getCheapestAllowedRate = (rates = []) => {
  const filteredRates = rates.filter((rate) => ALLOWED_RATE_PROVIDERS.has(rate.provider));

  if (filteredRates.length === 0) {
    return null;
  }

  return filteredRates.reduce((minRate, currentRate) =>
    parseFloat(currentRate.amount) < parseFloat(minRate.amount) ? currentRate : minRate
  );
};

module.exports = {
  createShipments,
  getShipmentConfigs,
  getCheapestAllowedRate,
  normalizeAddress,
  validateShippoAddress,
  AddressValidationError,
};
