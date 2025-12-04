const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config(); // <--- NEW LINE: Loads the .env file

const app = express();
const PORT = 3000;

// -------------------------------------------------------------
// SECURE CONNECTION
// We read the variable from the environment
// -------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // <--- CHANGED THIS
  ssl: { rejectUnauthorized: false },
});

app.use(cors());
app.use(express.json());

// --- ROUTES ---

// 1. GET /passengers (Read from DB)
app.get("/passengers", async (req, res) => {
  try {
    console.log("Fetching from Database...");
    // SQL Query to get all rows
    const result = await pool.query(
      "SELECT * FROM passengers ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// 2. POST /passengers (Save to DB)
app.post("/passengers", async (req, res) => {
  const { name, address } = req.body;

  if (!name || !address) {
    return res.status(400).json({ error: "Name and address required" });
  }

  // Generate random coords (Mock Geocoding)
  const lat = 32.06 + Math.random() * 0.04;
  const lng = 34.76 + Math.random() * 0.04;
  const type = "New Pickup";

  try {
    console.log("Saving to Database:", name);
    // SQL Query to insert data
    const result = await pool.query(
      "INSERT INTO passengers (name, address, lat, lng, type) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, address, lat, lng, type]
    );
    // Send back the new row
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save to database" });
  }
});
// ... existing POST route ...

// 3. DELETE /passengers/:id (Remove from DB)
app.delete("/passengers/:id", async (req, res) => {
  const { id } = req.params; // Get the ID from the URL
  console.log("Deleting passenger ID:", id);

  try {
    // SQL Query to delete
    await pool.query("DELETE FROM passengers WHERE id = $1", [id]);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete" });
  }
});

// ... app.listen ...

// 3. Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
