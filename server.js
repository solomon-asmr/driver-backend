const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

// Middleware (Crucial for accepting JSON data from the phone)
app.use(cors());
app.use(express.json());

// --- THE DATABASE (Mock Data) ---
const PASSENGERS = [
  {
    id: "1",
    name: "David Cohen",
    lat: 32.0645,
    lng: 34.772,
    type: "Home -> Work",
    address: "Rothschild Blvd 10, TA",
  },
  {
    id: "2",
    name: "Sarah Levy",
    lat: 32.078,
    lng: 34.7745,
    type: "Home -> Work",
    address: "Dizengoff 50, TA",
  },
  {
    id: "3",
    name: "Yossi Ben-Ari",
    lat: 32.063,
    lng: 34.77,
    type: "Work -> Home",
    address: "Allenby 99, TA",
  },
  {
    id: "4",
    name: "Rachel Green",
    lat: 32.071,
    lng: 34.773,
    type: "Home -> Work",
    address: "King George 20, TA",
  },
  {
    id: "5",
    name: "Omer Adam",
    lat: 32.058,
    lng: 34.7705,
    type: "Work -> Home",
    address: "Florentin 15, TA",
  },
];

// --- ROUTES ---

// 1. GET /passengers (Read)
app.get("/passengers", (req, res) => {
  console.log("Phone asked for passenger list");
  res.json(PASSENGERS);
});

// 2. POST /passengers (Create)
app.post("/passengers", (req, res) => {
  const newPassenger = req.body;

  console.log("Phone sent a new passenger:", newPassenger.name);

  // Validation: If name or address is missing, say "Bad Request"
  if (!newPassenger.name || !newPassenger.address) {
    return res.status(400).json({ error: "Name and address required" });
  }

  // Assign Fake ID and Random Location
  newPassenger.id = Date.now().toString();
  newPassenger.lat = 32.06 + Math.random() * 0.04;
  newPassenger.lng = 34.76 + Math.random() * 0.04;
  newPassenger.type = "New Pickup";

  // Save to the list
  PASSENGERS.push(newPassenger);

  // Respond with success
  res.status(201).json(newPassenger);
});

// 3. Start the Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
