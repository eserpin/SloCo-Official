import React from "react";
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import {HomePage} from "./components/HomePage";
import {BuyACopy} from "./components/BuyACopy";
import {Checkout} from "./components/Checkout";
import {ComicReader} from "./components/ComicReader";
import {ReaderAuthenticate} from "./components/ReaderAuthenticate";
const App = () => {
  return (
    <PayPalScriptProvider options={{ "client-id": process.env.REACT_APP_PAYPAL_CLIENT_ID, currency: "USD" }}> 
    <Router>
      <div>
        <Switch>
          <Route path="/" exact component={HomePage} />
          <Route path="/buy-a-copy" component={BuyACopy} />
          <Route path="/checkout" component={Checkout} />
          <Route path="/read" component={ComicReader}/>
          <Route path="/readerAuth" component={ReaderAuthenticate}/>
        </Switch>
      </div>
    </Router>
    </PayPalScriptProvider>
  );
};

export default App;

