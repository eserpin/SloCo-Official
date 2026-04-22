import front from "../images/front.jpeg";
import back from "../images/back.jpeg";
import dragon from "../images/gallery/16.jpeg";
import castle from "../images/gallery/1.jpeg";
import timekeeper from "../images/gallery/13.jpeg";
import goldFoilDragonPrint from "../images/products/gold-foil-dragon-print.png";
import goldFoilVidThumbnail from "../images/products/gold-foil-dragon-vid-thumbnail.png";
import goldFoilVid2Thumbnail from "../images/products/gold-foil-dragon-vid-2-thumbnail.png";
import nandiCoverPrint from "../images/products/nandi-cover-print.jpg";
import blueDragonPrint from "../images/products/blue-dragon-print.jpg";
import flyingMonkeyBookmark from "../images/products/flying-monkey.jpg";
import flyingMonkeyVidThumbnail from "../images/products/flying-monkey-vid-thumbnail.png";
import nandiMescaSticker from "../images/products/nandi-mesca-sticker.jpg";
import dragonSticker from "../images/products/dragon-sticker.jpg";
import timekeeperSticker from "../images/products/timekeeper-sticker.jpg";
import aldrenSticker from "../images/products/aldren-sticker.jpg";
import koyaSticker from "../images/products/koya-sticker.jpg";
import biallaSticker from "../images/products/bialla-sticker.jpg";
import junipSticker from "../images/products/junip-sticker.jpg";
import mimoSticker from "../images/products/mimo-sticker.jpg";
import zaragoSticker from "../images/products/zarago-sticker.jpg";
import carobPukaSticker from "../images/products/carob-puka-sticker.jpg";

// Videos are now served from public folder
const goldFoilDragonVid = "/gold-foil-vid.mp4";
const goldFoilVid2 = "/gold-foil-vid-2.mp4";
const flyingMonkeyVid = "/flying-monkey-vid.mp4";

export const products = [
  {
    id: "nandi-book",
    name: "Nandi and the Castle in the Sea",
    price: 27,
    type: "Graphic Novel",
    description: [
      "368 pages. Every single one in full color.",
      "Fantasy and steampunk. A world you haven't encountered before.",
      "A young boy, a stolen power, an island holding its breath for 30 years, and a Castle in the Sea that won't stop calling his name",
      "Humor, heart, philosophy, and action.",
      "A cast as diverse as the world itself.",
      "A complete story. It begins, builds, and ends right here. No cliffhangers."
    ],
    images: [
      { url: front, thumbnail_url: front },
      { url: back, thumbnail_url: back },
      { url: castle, thumbnail_url: castle },
      { url: timekeeper, thumbnail_url: timekeeper },
      { url: dragon, thumbnail_url: dragon }
    ],
    formats: ["physical", "digital"]
  },
  {
    id: "gold-foil-dragon-print",
    name: "Gold Foil Dragon Print",
    type: "Print",
    price: 50,
    description:[
      'A pivotal moment in the story of "Nandi and the Castle in the Sea"',
      "The print is coated in a soft-touch lamination (almost suede-like), and the gold foiling is then intricately pressed onto the scales of the dragon.",
      "This is a limited item.",
      "12x18 inch print ",
    ],
    images: [
      { url: goldFoilDragonPrint, thumbnail_url: goldFoilDragonPrint },
      { url: goldFoilDragonVid, thumbnail_url: goldFoilVidThumbnail },
      { url: goldFoilVid2, thumbnail_url: goldFoilVid2Thumbnail }
    ]
  },
  {
    id: "cover-print",
    name: "Nandi Cover Print",
    type: "Print",
    price: 15,
    description:[
      'The iconic cover image of "Nandi and the Castle in the Sea"',
      "Nandi sits on a cliff in the Woodfolk Highlands, looking out over Crescent Island as a friendly butterfly lands on him",
      "The Castle in the Sea can be seen off in the distance",
      "11x17 inch print",
    ],
    images: [
      { url: nandiCoverPrint, thumbnail_url: nandiCoverPrint }
    ]
  },
  {
    id: "blue-dragon-print",
    name: "Blue Dragon Print",
    type: "Print",
    price: 15,
    description:[
      "Our two main characters, Nandi and Mesca, meet Baoba, the blue half of the guardian spirit dragon that protects Crescent Island, for the first time. They are overwhelmed by Baoba's essence.",
      "11x17 inch print",
    ],
    images: [
      { url: blueDragonPrint, thumbnail_url: blueDragonPrint }
    ]

  },
  // {
  //   id: "flying-monkey-bookmark",
  //   name: "Flying Monkey Bookmark",
  //   type: "Bookmark",
  //   price: 5,
  //   description:[
  //     "The monkey's hand hooks over the top of your page",
  //     'One included with a purchase of the book "Nandi and the Castle in the Sea"',
  //     "2x5 inches"
  //   ],
  //   images: [
  //     { url: flyingMonkeyBookmark, thumbnail_url: flyingMonkeyBookmark },
  //     { url: flyingMonkeyVid, thumbnail_url: flyingMonkeyVidThumbnail }
  //   ]

  // },
  {
    id: "nandi-mesca-sticker",
    name: "Nandi and Mesca Sticker",
    type: "Sticker",
    price: 5,
    description:[
      "The two main characters",
      "5x2.5 inches"
    ],
    images: [
      { url: nandiMescaSticker, thumbnail_url: nandiMescaSticker }
    ]

  },
  {
    id: "dragon-sticker",
    name: "Dragon Sticker",
    type: "Sticker",
    price: 5,
    description:[
      "Baobavaja, the guardian spirit of Crescent Island",
      "4x4 inches"
    ],
    images: [
      { url: dragonSticker, thumbnail_url: dragonSticker }
    ]

  },
  {
    id: "timekeeper-sticker",
    name: "The Timekeeper Sticker",
    type: "Sticker",
    price: 5,
    description:[
      "A mushroom wizard that shows you the future, but you pay with your lifespan",
      "2.5x4 inches"
    ],
    images: [
      { url: timekeeperSticker, thumbnail_url: timekeeperSticker }
    ]

  },
  {
    id: "aldren-sticker",
    name: "Aldren Sticker",
    type: "Sticker",
    price: 5,
    description:[
      '"The White Shark" - a Seafolk Crew Leader ',
      "3x3 inches"
    ],
    images: [
      { url: aldrenSticker, thumbnail_url: aldrenSticker }
    ]

  },
  {
    id: "koya-sticker",
    name: "Koya Sticker",
    type: "Sticker",
    price: 5,
    description:[
      "The Beauty & Brains of the Smile Island Brasswork Shop",
      "1x4 inches"
    ],
    images: [
      { url: koyaSticker, thumbnail_url: koyaSticker }
    ]

  },
  {
    id: "bialla-sticker",
    name: "Bialla Sticker",
    type: "Sticker",
    price: 5,
    description:[
      'A foreign "princess" visiting Crescent Island',
      "1x4 inches"
    ],
    images: [
      { url: biallaSticker, thumbnail_url: biallaSticker }
    ]

  },
  {
    id: "junip-sticker",
    name: "Junip Sticker",
    type: "Sticker",
    price: 5,
    description:[
      "Woodfolk Warrior Girl",
      "3x2 inches"
    ],
    images: [
      { url: junipSticker, thumbnail_url: junipSticker }
    ]

  },
  {
    id: "mimo-sticker",
    name: "Mimo Sticker",
    type: "Sticker",
    price: 5,
    description:[
      "The Seafolk Weapons Expert",
      "4x2 inches"
    ],
    images: [
      { url: mimoSticker, thumbnail_url: mimoSticker }
    ]

  },
  {
    id: "zarago-sticker",
    name: "Zarago Sticker",
    type: "Sticker",
    price: 5,
    description:[
      "The Woodfolk warrior-turned-villain, doing a Superman-punch",
      "3.5x2 inches"
    ],
    images: [
      { url: zaragoSticker, thumbnail_url: zaragoSticker }
    ]

  },
  {
    id: "carob-puka-sticker",
    name: "Carob & Puka Sticker",
    type: "Sticker",
    price: 5,
    description:[
      "The Naturalist Explorer and his best friend",
      "3x3 inches"
    ],
    images: [
      { url: carobPukaSticker, thumbnail_url: carobPukaSticker }
    ]

  },
];