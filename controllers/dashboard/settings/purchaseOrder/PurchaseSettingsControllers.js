const { connectToOrganizationDB, getOrganizationData } = require('../../../../utils/config/connectOrganization');
const purchaseSettingsSchema = require('../../../../utils/models/dashboard/settings/PurchaseSettingSchema');

// Helper to generate year code
const generateYearCode = (start, end) => {
  const s = new Date(start).getFullYear() % 100;
  const e = new Date(end).getFullYear() % 100;
  return `${s}-${e}`;
};

// Helper to generate next number
const generateNextNumber = async (client, type, financial_year_code, prefix) => {
  const result = await client.query(
    `UPDATE purchase_number_counters 
     SET last_number = last_number + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE type = $1 AND financial_year_code = $2 AND prefix = $3
     RETURNING last_number`,
    [type, financial_year_code, prefix]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`No counter found for ${type} with year ${financial_year_code} and prefix ${prefix}`);
  }
  
  return result.rows[0].last_number;
};

// Helper to format number
const formatNumber = (prefix, financial_year_code, number) => {
  return `${prefix}-${financial_year_code}-${number}`;
};

const initializeSchema = async (client) => {
  try {
    for (const stmt of purchaseSettingsSchema.split(';')) {
      if (stmt.trim()) await client.query(stmt);
    }
  } catch (err) {
    console.error('Schema initialization error:', err);
    throw err;
  }
};

const getPurchaseSettings = async (req, res) => { 
  const organizationId = req.params.organizationId;
  let pool, client;
  try {
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }
    pool = await connectToOrganizationDB(orgData.organization_db);
    client = await pool.connect();
    await initializeSchema(client);
    const { rows } = await client.query(
      "SELECT * FROM purchase_settings ORDER BY id DESC LIMIT 1"
    );
    if (!rows.length) {
      return res.json({
        success: true,
        data: {
          po_prefix: "",
          bill_prefix: "",
          financial_year_start_date: null,
          financial_year_end_date: null,
          financial_year_code: "",
          vendor_categories: [],
          selected_category: "",
          counters: []
        }
      });
    }
    const settings = rows[0];
    const counters = await client.query(
      "SELECT * FROM purchase_number_counters ORDER BY type, financial_year_code DESC, prefix"
    );
    res.json({
      success: true,
      data: { ...settings, counters: counters.rows }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (client) client.release();
  }
};

const postPurchaseSettings = async (req, res) => {
  const organizationId = req.params.organizationId;
  let pool, client;
  try {
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }
    pool = await connectToOrganizationDB(orgData.organization_db);
    client = await pool.connect();
    await initializeSchema(client);
    const {
      po_prefix,
      bill_prefix,
      financial_year_start_date,
      financial_year_end_date,
      vendor_categories = [],
      selected_category = ''
    } = req.body;
    if (!po_prefix || !bill_prefix || !financial_year_start_date || !financial_year_end_date) {
      return res.status(400).json({ success: false, message: "Missing required fields: po_prefix, bill_prefix, financial_year_start_date, financial_year_end_date" });
    }
    if (po_prefix.length < 2 || po_prefix.length > 3) {
      return res.status(400).json({ success: false, message: "PO prefix must be 2-3 characters long" });
    }
    if (bill_prefix.length < 2 || bill_prefix.length > 3) {
      return res.status(400).json({ success: false, message: "Bill prefix must be 2-3 characters long" });
    }
    const startDate = new Date(financial_year_start_date);
    const endDate = new Date(financial_year_end_date);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date format for financial year dates" });
    }
    if (endDate <= startDate) {
      return res.status(400).json({ success: false, message: "Financial year end date must be after start date" });
    }
    const financial_year_code = generateYearCode(financial_year_start_date, financial_year_end_date);
    await client.query('BEGIN');
    try {
      const { rows } = await client.query(
        `INSERT INTO purchase_settings
          (po_prefix, bill_prefix, financial_year_start_date, financial_year_end_date, financial_year_code,
           vendor_categories, selected_category)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          po_prefix,
          bill_prefix,
          financial_year_start_date,
          financial_year_end_date,
          financial_year_code,
          vendor_categories,
          selected_category
        ]
      );
      for (const type of ['PO', 'BILL']) {
        const prefix = type === 'PO' ? po_prefix : bill_prefix;
        await client.query(
          `INSERT INTO purchase_number_counters (type, financial_year_code, prefix, last_number)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (type, financial_year_code, prefix) DO UPDATE 
           SET last_number = 0, updated_at = CURRENT_TIMESTAMP`,
          [type, financial_year_code, prefix]
        );
      }
      await client.query('COMMIT');
      const counters = await client.query(
        "SELECT * FROM purchase_number_counters WHERE financial_year_code = $1 ORDER BY type, prefix",
        [financial_year_code]
      );
      res.status(201).json({
        success: true,
        data: {
          ...rows[0],
          counters: counters.rows
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (client) client.release();
  }
};

const putLatestPurchaseSettings = async (req, res) => {
  const { organizationId } = req.params;
  let pool, client;
  try {
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }
    pool = await connectToOrganizationDB(orgData.organization_db);
    client = await pool.connect();
    await initializeSchema(client);
    const { rows } = await client.query(
      "SELECT * FROM purchase_settings ORDER BY id DESC LIMIT 1"
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No settings found" });
    }
    const latest = rows[0];
    const {
      po_prefix,
      bill_prefix,
      financial_year_start_date,
      financial_year_end_date,
      vendor_categories,
      selected_category
    } = req.body;
    if (!po_prefix || !bill_prefix || !financial_year_start_date || !financial_year_end_date) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }
    const financial_year_code = generateYearCode(financial_year_start_date, financial_year_end_date);
    await client.query('BEGIN');
    try {
      const updateResult = await client.query(
        `UPDATE purchase_settings SET
          po_prefix=$1, bill_prefix=$2, financial_year_start_date=$3, financial_year_end_date=$4, financial_year_code=$5,
          vendor_categories=$6, selected_category=$7, updated_at=NOW()
         WHERE id=$8 RETURNING *`,
        [
          po_prefix,
          bill_prefix,
          financial_year_start_date,
          financial_year_end_date,
          financial_year_code, 
          vendor_categories,
          selected_category,
          latest.id
        ]
      );
      for (const type of ['PO', 'BILL']) {
        const prefix = type === 'PO' ? po_prefix : bill_prefix;
        await client.query(
          `INSERT INTO purchase_number_counters (type, financial_year_code, prefix, last_number)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (type, financial_year_code, prefix) DO NOTHING`,
          [type, financial_year_code, prefix]
        );
      }
      await client.query('COMMIT');
      const counters = await client.query(
        "SELECT * FROM purchase_number_counters ORDER BY type, financial_year_code DESC, prefix"
      );
      res.json({
        success: true,
        data: {
          ...updateResult.rows[0],
          counters: counters.rows
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (client) client.release();
  }
};

const deletePurchaseSettings = async (req, res) => {
  const { id, organizationId } = req.params;
  const { vendorCategory } = req.body;
  let pool, client;
  try {
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }
    pool = await connectToOrganizationDB(orgData.organization_db);
    client = await pool.connect();
    await initializeSchema(client);
    if (id && !vendorCategory) {
      const delResult = await client.query(
        "DELETE FROM purchase_settings WHERE id = $1 RETURNING *",
        [id]
      );
      if (delResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Settings not found" });
      }
      return res.json({ success: true, message: "Settings deleted", data: delResult.rows[0] });
    }
    const { rows } = await client.query(
      "SELECT * FROM purchase_settings ORDER BY id DESC LIMIT 1"
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No settings found" });
    }
    const latest = rows[0];
    let updatedCategories = latest.vendor_categories;
    let changed = false;
    if (vendorCategory !== undefined) {
      updatedCategories = updatedCategories.filter(c => c !== vendorCategory);
      changed = true;
    }
    if (!changed) {
      return res.status(400).json({ success: false, message: "No vendorCategory provided" });
    }
    const updateResult = await client.query(
      `UPDATE purchase_settings 
       SET vendor_categories = $1, 
           updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [updatedCategories, latest.id]
    );
    res.json({ success: true, message: "Updated settings", data: updateResult.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (client) client.release();
  }
};

// Generate next PO number
const generatePONumber = async (req, res) => {
  const organizationId = req.params.organizationId;
  let pool, client;
  try {
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    pool = await connectToOrganizationDB(orgData.organization_db);
    client = await pool.connect();

    // Get current active settings
    const { rows } = await client.query(
      "SELECT * FROM purchase_settings ORDER BY id DESC LIMIT 1"
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No active settings found" });
    }

    const settings = rows[0];
    const { po_prefix, financial_year_code } = settings;
    // Start a transaction
    await client.query('BEGIN');
    try {
      // Get next number atomically
      const nextNumber = await generateNextNumber(client, 'PO', financial_year_code, po_prefix);
      const poNumber = formatNumber(po_prefix, financial_year_code, nextNumber);
      // Commit transaction
      await client.query('COMMIT');
      // Get all counters for response
      const counters = await client.query(
        "SELECT * FROM purchase_number_counters ORDER BY financial_year_code DESC, prefix"
      );
      res.json({
        success: true,
        message: "PO number generated successfully",
        data: {
          poNumber,
          prefix: po_prefix,
          financialYearCode: financial_year_code,
          sequentialNumber: nextNumber,
          nextPONumber: poNumber,
          counters: counters.rows
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error generating PO number:", error);
      res.status(500).json({
        success: false,
        message: "Failed to generate PO number",
        error: error.message
      });
    }
  } catch (err) {
    console.error('Error in generatePONumber:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (client) client.release();
  }
};

// Generate next Bill number
const generateBillNumber = async (req, res) => {
  const organizationId = req.params.organizationId;
  let pool, client;
  try {
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    pool = await connectToOrganizationDB(orgData.organization_db);
    client = await pool.connect();

    // Get current active settings
    const { rows } = await client.query(
      "SELECT * FROM purchase_settings ORDER BY id DESC LIMIT 1"
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No active settings found" });
    }

    const settings = rows[0];
    const { bill_prefix, financial_year_code } = settings;
    // Start a transaction
    await client.query('BEGIN');
    try {
      // Get next number atomically
      const nextNumber = await generateNextNumber(client, 'BILL', financial_year_code, bill_prefix);
      const billNumber = formatNumber(bill_prefix, financial_year_code, nextNumber);
      // Commit transaction
      await client.query('COMMIT');
      // Get all counters for response
      const counters = await client.query(
        "SELECT * FROM purchase_number_counters ORDER BY financial_year_code DESC, prefix"
      );
      res.json({
        success: true,
        message: "Bill number generated successfully",
        data: {
          billNumber,
          prefix: bill_prefix,
          financialYearCode: financial_year_code,
          sequentialNumber: nextNumber,
          nextBillNumber: billNumber,
          counters: counters.rows
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error generating Bill number:", error);
      res.status(500).json({
        success: false,
        message: "Failed to generate Bill number",
        error: error.message
      });
    }
  } catch (err) {
    console.error('Error in generateBillNumber:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  getPurchaseSettings,
  postPurchaseSettings,
  putLatestPurchaseSettings,
  generatePONumber,
  generateBillNumber,
  deletePurchaseSettings
};