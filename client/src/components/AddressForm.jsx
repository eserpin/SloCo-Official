import React, { useRef } from "react";
import { StandaloneSearchBox, useJsApiLoader } from "@react-google-maps/api";

// Define the libraries outside the component
const googleLibraries = ["places"];

const AddressForm = ({ onAddressSelect }) => {
  const inputRef = useRef(null);

  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY,
    libraries: googleLibraries, // Pass the static libraries array here
  });
  const handleOnPlacesChanged = () => {
    if (inputRef.current) {
      const places = inputRef.current.getPlaces();
      const selectedPlace = places[0];
      if (selectedPlace) {
        onAddressSelect(selectedPlace); // Send selected place to parent component
      }
    }
  };

  return (
    <div>
      {isLoaded ? (
        <StandaloneSearchBox
          onLoad={(ref) => (inputRef.current = ref)}
          onPlacesChanged={handleOnPlacesChanged}
        >
          <input
            type="text"
            placeholder="Shipping Address"
            style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
          />
        </StandaloneSearchBox>
      ) : (
        <p>Loading Address Bar...</p>
      )}
    </div>
  );
};

export default AddressForm;
