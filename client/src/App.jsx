import React from "react";
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import { CartProvider } from "./components/CartContext";
import {Cart} from "./components/Cart";
import {HomePage} from "./components/HomePage";
import {BuyACopy} from "./components/BuyACopy";
import {Checkout} from "./components/Checkout";
import {Gallery} from "./components/Gallery";
import {ComicReader} from "./components/ComicReader";
import {ReaderAuthenticate} from "./components/ReaderAuthenticate";
import {ThankYou} from "./components/ThankYou";
const App = () => {
  return (
    <PayPalScriptProvider options={{ "client-id": process.env.REACT_APP_PAYPAL_CLIENT_ID, currency: "USD" }}>
    <CartProvider>
    <Router>
      {/* <RouteChangeTracker /> */}
      <div>
        <Switch>
          <Route path="/" exact component={HomePage} />
          <Route path="/buy-a-copy" component={BuyACopy} />
          <Route path="/cart" component={Cart} />
          <Route path="/checkout" component={Checkout} />
          <Route path="/read" component={ComicReader}/>
          <Route path="/readerAuth" component={ReaderAuthenticate}/>
          <Route path="/thank-you" component={ThankYou}/>
          <Route path="/gallery" component={Gallery} />
        </Switch>
      </div>
    </Router>
    </CartProvider>
    </PayPalScriptProvider>
  );
};

export default App;

