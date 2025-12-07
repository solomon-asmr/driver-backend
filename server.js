const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = 3000;

// Connect to Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(cors());
app.use(express.json());

// --- ROUTES ---

// 1. GET /passengers (Now filters by User ID)
// The phone will send ?userId=123 at the end of the URL
app.get("/passengers", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "Missing User ID" });
  }

  try {
    console.log(`Fetching passengers for User: ${userId}`);
    // SQL: Only select rows where user_id matches the requester
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

// 2. POST /passengers (Save to DB with Google & User ID)
app.post("/passengers", async (req, res) => {
  const { name, address, userId } = req.body; // <--- We expect userId now
  const apiKey = process.env.GOOGLE_MAPS_KEY; // Make sure this is in your backend .env file!

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
    // A. Ask Google Maps: "Where is this address?"
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address
    )}&key=${apiKey}`;

    const geoResponse = await fetch(geocodeUrl);
    const geoData = await geoResponse.json();

    // B. Check if Google found it
    if (geoData.status === "OK" && geoData.results.length > 0) {
      const location = geoData.results[0].geometry.location;
      lat = location.lat;
      lng = location.lng;
      console.log(`Found location: ${lat}, ${lng}`);
    } else {
      console.log("Google could not find address:", geoData.status);
      // Fallback: Default to Tel Aviv center
      lat = 32.0853;
      lng = 34.7818;
      type = "Address Not Found";
    }

    // C. Save to Database (Including the user_id)
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

// 3. DELETE /passengers/:id (Remove from DB)
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
// ... existing routes ...

// 5. POST /share (Driver A creates a transfer code)
app.post("/share", async (req, res) => {
  const { passengerIds, destination } = req.body;

  if (!passengerIds || passengerIds.length === 0) {
    return res.status(400).json({ error: "No passengers selected" });
  }

  // Generate a simple 4-char code (e.g., "TR-4921")
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
// 6. POST /import (Driver B claims the passengers - COPY MODE)
app.post("/import", async (req, res) => {
  const { code, userId } = req.body;

  try {
    // A. Find the transfer info
    const transferResult = await pool.query(
      "SELECT * FROM transfers WHERE code = $1",
      [code]
    );

    if (transferResult.rows.length === 0) {
      return res.status(404).json({ error: "Invalid or expired code" });
    }

    const { passenger_ids, destination } = transferResult.rows[0];

    // B. COPY passengers to the NEW User (Instead of moving them)
    // We select the details from the original passengers, but insert them
    // as NEW rows with the NEW user_id ($2).
    const copyQuery = `
      INSERT INTO passengers (name, address, lat, lng, type, user_id)
      SELECT name, address, lat, lng, type, $2
      FROM passengers
      WHERE id = ANY($1)
      RETURNING id
    `;

    const copyResult = await pool.query(copyQuery, [passenger_ids, userId]);

    // Get the IDs of the NEWLY created rows (so we can highlight them green)
    const newPassengerIds = copyResult.rows.map((row) => row.id);

    // C. Delete the used share code (Safety cleanup)
    await pool.query("DELETE FROM transfers WHERE code = $1", [code]);

    // Return the new IDs and destination
    res.json({
      success: true,
      destination: destination,
      passengerIds: newPassengerIds,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Import failed" });
  }
}); // 4. Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
