const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// --- DATABASE CONNECTION ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// ==========================================
//                 ROUTES
// ==========================================

// 1. GET /passengers (Fetch user's list)
app.get("/passengers", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "Missing User ID" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM passengers WHERE user_id = $1 ORDER BY id DESC",
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// 2. POST /passengers (Add new passenger + Geocode)
app.post("/passengers", async (req, res) => {
  const { name, address, userId } = req.body;
  const apiKey = process.env.GOOGLE_MAPS_KEY;

  if (!name || !address || !userId) {
    return res
      .status(400)
      .json({ error: "Name, Address, and User ID required" });
  }

  console.log("Searching Google for:", address);

  let lat = 0;
  let lng = 0;
  let type = "New Pickup";

  try {
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address
    )}&key=${apiKey}`;

    const geoResponse = await fetch(geocodeUrl);
    const geoData = await geoResponse.json();

    if (geoData.status === "OK" && geoData.results.length > 0) {
      const location = geoData.results[0].geometry.location;
      lat = location.lat;
      lng = location.lng;
    } else {
      // Fallback to Tel Aviv Center if not found
      lat = 32.0853;
      lng = 34.7818;
      type = "Address Not Found";
    }

    const result = await pool.query(
      "INSERT INTO passengers (name, address, lat, lng, type, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [name, address, lat, lng, type, userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error during save:", err);
    res.status(500).json({ error: "Server error during save" });
  }
});

// 2.5. PUT /passengers/:id (Edit Name or Address) -> THIS FIXES YOUR ERROR
app.put("/passengers/:id", async (req, res) => {
  const { id } = req.params;
  const { name, address, userId } = req.body;
  const apiKey = process.env.GOOGLE_MAPS_KEY;

  if (!userId) {
    return res.status(403).json({ error: "Unauthorized: Missing User ID" });
  }

  try {
    // A. Verify Ownership
    const checkOwner = await pool.query(
      "SELECT * FROM passengers WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    if (checkOwner.rows.length === 0) {
      return res.status(403).json({ error: "You do not own this passenger." });
    }

    let lat = checkOwner.rows[0].lat;
    let lng = checkOwner.rows[0].lng;

    // B. Re-Geocode if address changed
    if (address && address !== checkOwner.rows[0].address) {
      console.log("Address changed, re-calculating GPS...");
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address
      )}&key=${apiKey}`;

      const geoResponse = await fetch(geocodeUrl);
      const geoData = await geoResponse.json();

      if (geoData.status === "OK" && geoData.results.length > 0) {
        lat = geoData.results[0].geometry.location.lat;
        lng = geoData.results[0].geometry.location.lng;
      }
    }

    // C. Update Database
    const updateResult = await pool.query(
      "UPDATE passengers SET name = $1, address = $2, lat = $3, lng = $4 WHERE id = $5 RETURNING *",
      [name, address, lat, lng, id]
    );

    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ error: "Server failed to update." });
  }
});

// 3. DELETE /passengers/:id (Remove passenger)
app.delete("/passengers/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM passengers WHERE id = $1", [id]);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete" });
  }
});

// 4. POST /share (Create Transfer Code)
app.post("/share", async (req, res) => {
  const { passengerIds, destination } = req.body;

  if (!passengerIds || passengerIds.length === 0) {
    return res.status(400).json({ error: "No passengers selected" });
  }

  const code = "TR-" + Math.floor(1000 + Math.random() * 9000);

  try {
    await pool.query(
      "INSERT INTO transfers (code, passenger_ids, destination) VALUES ($1, $2, $3)",
      [code, passengerIds, destination]
    );
    res.json({ code: code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create share code" });
  }
});

// 5. POST /import (Load Passengers from Code)
app.post("/import", async (req, res) => {
  const { code, userId } = req.body;

  try {
    const transferResult = await pool.query(
      "SELECT * FROM transfers WHERE code = $1",
      [code]
    );

    if (transferResult.rows.length === 0) {
      return res.status(404).json({ error: "Invalid or expired code" });
    }

    const { passenger_ids, destination } = transferResult.rows[0];

    // Copy passengers to the new user's account
    const copyQuery = `
      INSERT INTO passengers (name, address, lat, lng, type, user_id)
      SELECT name, address, lat, lng, type, $2
      FROM passengers
      WHERE id = ANY($1)
      RETURNING id
    `;

    const copyResult = await pool.query(copyQuery, [passenger_ids, userId]);
    const newPassengerIds = copyResult.rows.map((row) => row.id);

    // Clean up used code
    await pool.query("DELETE FROM transfers WHERE code = $1", [code]);

    res.json({
      success: true,
      destination: destination,
      passengerIds: newPassengerIds,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Import failed" });
  }
});

// 6. GET / (Serve Email Confirmation/Success Page)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "success.html"));
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
