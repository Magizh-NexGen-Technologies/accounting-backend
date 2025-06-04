const pool = require("../../../utils/config/connectDB");
const freetrialSchema = require("../../../utils/models/superadmin/freetrial/FreeTrialSchema");

// Initialize schema function
const initializeSchema = async (client) => {
  try {
    await client.query(freetrialSchema);
    console.log("Free trial schema initialized successfully");
  } catch (error) {
    console.error("Error initializing free trial schema:", error);
    throw error;
  }
};

// Get trial days setting
exports.getFreeTrial = async (req, res) => {
  const client = await pool.connect();
  try {
    // Ensure schema exists
    await initializeSchema(client);

    const result = await client.query(
      "SELECT id, trial_days, updated_at FROM free_trial ORDER BY id DESC LIMIT 1"
    );

    res.json({
      success: true,
      data: result.rows[0] || { id: 0, trial_days: 0, updated_at: new Date() },
    });
  } catch (error) {
    console.error("Error fetching trial days:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching trial days",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// Update trial days setting
exports.postFreeTrial = async (req, res) => {
  const client = await pool.connect();
  try {
    // Ensure schema exists
    await initializeSchema(client);

    const { trialDays } = req.body;

    if (trialDays < 0 || trialDays > 90) {
      return res.status(400).json({
        success: false,
        message: "Trial days must be between 0 and 90",
      });
    }

    const result = await client.query(
      `INSERT INTO free_trial (trial_days) 
             VALUES ($1)
             RETURNING id, trial_days, updated_at`,
      [trialDays]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating trial days:", error);
    res.status(500).json({
      success: false,
      message: "Error creating trial days",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// Update existing trial days setting by ID
exports.putFreeTrial = async (req, res) => {
  const client = await pool.connect();
  try {
    // Ensure schema exists
    await initializeSchema(client);

    const { id } = req.params;
    const { trialDays } = req.body;

    // Validate input
    if (!id || !Number(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid ID is required",
      });
    }

    if (trialDays < 0 || trialDays > 90) {
      return res.status(400).json({
        success: false,
        message: "Trial days must be between 0 and 90",
      });
    }

    const result = await client.query(
      `UPDATE free_trial 
             SET trial_days = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2 
             RETURNING id, trial_days, updated_at`,
      [trialDays, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Trial setting not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating trial days:", error);
    res.status(500).json({
      success: false,
      message: "Error updating trial days",
      error: error.message,
    });
  } finally {
    client.release();
  }
};
