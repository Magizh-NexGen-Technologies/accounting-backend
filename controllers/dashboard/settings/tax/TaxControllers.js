const { connectToOrganizationDB, getOrganizationData } = require('../../../../utils/config/connectOrganization');
const taxSettingsSchema = require('../../../../utils/models/dashboard/settings/TAXSchema');

let pool = null;

const getPool = async (organizationId) => {
  if (!pool) {
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      throw new Error("Organization not found");
    }
    pool = await connectToOrganizationDB(orgData.organization_db);
  }
  return pool;
};

const initializeSchema = async (client) => {
  try {
    for (const stmt of taxSettingsSchema.split(';')) {
      if (stmt.trim()) await client.query(stmt);
    }
  } catch (err) {
    console.error('Schema initialization error:', err);
    throw err;
  }
};

// Tax Settings Controllers
const getTaxSettings = async (req, res) => {
  let client;
  try {
    pool = await getPool(req.params.organizationId);
    client = await pool.connect();
    await initializeSchema(client);

    const result = await client.query(
      'SELECT * FROM tax_settings ORDER BY created_at DESC'
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching tax settings:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (client) client.release();
  }
};

const postTaxSettings = async (req, res) => {
  let client;
  try {
    const { tax_name, tax_rate, tax_type, tax_description } = req.body;
    
    pool = await getPool(req.params.organizationId);
    client = await pool.connect();
    await initializeSchema(client);

    const result = await client.query(
      'INSERT INTO tax_settings (tax_name, tax_rate, tax_type, tax_description) VALUES ($1, $2, $3, $4) RETURNING *',
      [tax_name, tax_rate, tax_type, tax_description]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating tax settings:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (client) client.release();
  }
};

const putTaxSettings = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    const { tax_name, tax_rate, tax_type, tax_description } = req.body;
    
    pool = await getPool(req.params.organizationId);
    client = await pool.connect();
    await initializeSchema(client);

    const result = await client.query(
      'UPDATE tax_settings SET tax_name = $1, tax_rate = $2, tax_type = $3, tax_description = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
      [tax_name, tax_rate, tax_type, tax_description, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Tax setting not found" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating tax settings:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (client) client.release();
  }
};

const deleteTaxSettings = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    
    pool = await getPool(req.params.organizationId);
    client = await pool.connect();
    await initializeSchema(client);

    const result = await client.query(
      'DELETE FROM tax_settings WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Tax setting not found" });
    }

    res.json({ success: true, message: "Tax setting deleted successfully" });
  } catch (error) {
    console.error('Error deleting tax settings:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (client) client.release();
  }
};

// GST Settings Controllers
const getGSTSettings = async (req, res) => {
  let client;
  try {
    pool = await getPool(req.params.organizationId);
    client = await pool.connect();
    await initializeSchema(client);

    const result = await client.query(
      'SELECT * FROM gst_settings ORDER BY created_at DESC'
    );

    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    console.error('Error fetching GST settings:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (client) client.release();
  }
};

const postGSTSettings = async (req, res) => {
  let client;
  try {
    const { legal_name, gstin, business_type, state, payment_terms } = req.body;
    pool = await getPool(req.params.organizationId);
    client = await pool.connect();
    await initializeSchema(client);

    const result = await client.query(
      'INSERT INTO gst_settings (legal_name, gstin, business_type, state, payment_terms) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [legal_name, gstin, business_type, state, JSON.stringify(payment_terms || [])]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating GST settings:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (client) client.release();
  }
};

const putGSTSettings = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    const { legal_name, gstin, business_type, state, payment_terms } = req.body;
    pool = await getPool(req.params.organizationId);
    client = await pool.connect();
    await initializeSchema(client);

    const result = await client.query(
      'UPDATE gst_settings SET legal_name = $1, gstin = $2, business_type = $3, state = $4, payment_terms = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING *',
      [legal_name, gstin, business_type, state, JSON.stringify(payment_terms || []), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "GST setting not found" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating GST settings:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (client) client.release();
  }
};

const deleteGSTSettings = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    pool = await getPool(req.params.organizationId);
    client = await pool.connect();
    await initializeSchema(client);

    const result = await client.query(
      'DELETE FROM gst_settings WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "GST setting not found" });
    }

    res.json({ success: true, message: "GST setting deleted successfully" });
  } catch (error) {
    console.error('Error deleting GST settings:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  getTaxSettings,
  postTaxSettings,
  putTaxSettings,
  deleteTaxSettings,
  getGSTSettings,
  postGSTSettings,
  putGSTSettings,
  deleteGSTSettings
};