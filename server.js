const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config(); // Loads the .env file

const app = express();
const PORT = 3000;

// -------------------------------------------------------------
// SECURE CONNECTION
// We read the variable from the environment file (.env)
// -------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(cors());
app.use(express.json());

// --- ROUTES ---

// 1. GET /passengers (Read from DB)
app.get("/passengers", async (req, res) => {
  try {
    console.log("Fetching from Database...");
    const result = await pool.query(
      "SELECT * FROM passengers ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// 2. POST /passengers (Save to DB with REAL GEOCODING)
app.post("/passengers", async (req, res) => {
  const { name, address } = req.body;

  if (!name || !address) {
    return res.status(400).json({ error: "Name and address required" });
  }

  console.log("Geocoding address:", address);

  let lat = 0;
  let lng = 0;
  let type = "New Pickup";

  try {
    // A. Ask OpenStreetMap (Nominatim): "Where is this address?"
    // We send a User-Agent header because Nominatim requires it
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      address
    )}`;

    const geoResponse = await fetch(geocodeUrl, {
      headers: { "User-Agent": "DriverApp-StudentProject/1.0" },
    });
    const geoData = await geoResponse.json();

    // B. Check if we found it
    if (geoData && geoData.length > 0) {
      lat = parseFloat(geoData[0].lat);
      lng = parseFloat(geoData[0].lon);
      console.log(`Found location: ${lat}, ${lng}`);
    } else {
      console.log("Address not found. Using fallback.");
      // Fallback: Default to Tel Aviv center if address is typed wrong
      lat = 32.0853;
      lng = 34.7818;
      type = "Address Not Found";
    }

    // C. Save the REAL coordinates to Database
    const result = await pool.query(
      "INSERT INTO passengers (name, address, lat, lng, type) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, address, lat, lng, type]
    );

    // Send back the new row
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error during save:", err);
    res.status(500).json({ error: "Server error during save" });
  }
});

// 3. DELETE /passengers/:id (Remove from DB)
app.delete("/passengers/:id", async (req, res) => {
  const { id } = req.params; // Get the ID from the URL
  console.log("Deleting passenger ID:", id);

  try {
    await pool.query("DELETE FROM passengers WHERE id = $1", [id]);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete" });
  }
});

// 4. Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
