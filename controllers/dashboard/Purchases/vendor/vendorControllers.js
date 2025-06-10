const { connectToOrganizationDB, getOrganizationData } = require('../../../../utils/config/connectOrganization');
const Vendors = require('../../../../utils/models/dashboard/purchases/vendors/VendorsSchema');

const initializeSchema = async (client) => {
  try {
    for (const stmt of Vendors.split(';')) {
      if (stmt.trim()) await client.query(stmt);
    }
  } catch (err) {
    console.error('Schema initialization error:', err);
    throw err;
  }
};

const getVendors = async (req, res) => {
  const organizationId = req.params.organizationId;
  let pool, client;

  try {
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    pool = await connectToOrganizationDB(orgData.organization_db);
    client = await pool.connect();
    await initializeSchema(client);

    const { rows } = await client.query(
      `SELECT * FROM vendors ORDER BY created_at DESC`
    );

    // Convert balance to number for each row
    const processedRows = rows.map(row => ({
      ...row,
      balance: row.balance !== null ? Number(row.balance) : 0
    }));

    res.json({
      success: true,
      data: processedRows
    });
  } catch (err) {
    console.error('Error in getVendors:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  } finally {
    if (client) client.release();
  }
};

// Function to generate vendor ID
const generateVendorId = async (client) => {
  // Get the current year
  const currentYear = new Date().getFullYear().toString().slice(-2);
  
  // Get the last vendor ID for the current year
  const { rows } = await client.query(
    `SELECT vendor_id FROM vendors 
     WHERE vendor_id LIKE $1 
     ORDER BY vendor_id DESC 
     LIMIT 1`,
    [`V${currentYear}%`]
  );

  let sequence = 1;
  if (rows.length > 0) {
    // Extract the sequence number from the last vendor ID
    const lastSequence = parseInt(rows[0].vendor_id.slice(3));
    sequence = lastSequence + 1;
  }

  // Format: VYY#### (V + Year + 4-digit sequence)
  return `V${currentYear}${sequence.toString().padStart(4, '0')}`;
};

const postVendors = async (req, res) => {
  const organizationId = req.params.organizationId;
  let pool, client;

  try {
    const {
      firstName,
      lastName,
      companyName,
      displayName,
      email,
      category,
      workPhone,
      mobile,
      doorNo,
      city,
      state,
      district,
      country,
      bankDetails,
      status
    } = req.body;

    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    pool = await connectToOrganizationDB(orgData.organization_db);
    client = await pool.connect();
    await initializeSchema(client);

    // Generate unique vendor ID
    const vendorId = await generateVendorId(client);

    const { rows } = await client.query(
      `INSERT INTO vendors (
        vendor_id, first_name, last_name, company_name, display_name, email, 
        category, work_phone, mobile, door_no, city, state, 
        district, country, bank_details, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        vendorId, firstName, lastName, companyName, displayName, email,
        category, workPhone, mobile, doorNo, city, state,
        district, country, bankDetails, status
      ]
    );

    res.status(201).json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    console.error('Error in postVendors:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  } finally {
    if (client) client.release();
  }
};

const putVendors = async (req, res) => {
  const { id } = req.params;
  const organizationId = req.params.organizationId;
  let pool, client;

  try {
    const {
      firstName,
      lastName,
      companyName,
      displayName,
      email,
      category,
      workPhone,
      mobile,
      doorNo,
      city,
      state,
      district,
      country,
      bankDetails,
      status
    } = req.body;

    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    pool = await connectToOrganizationDB(orgData.organization_db);
    client = await pool.connect();
    await initializeSchema(client);

    const { rows } = await client.query(
      `UPDATE vendors SET
        first_name = $1, last_name = $2, company_name = $3, display_name = $4,
        email = $5, category = $6, work_phone = $7, mobile = $8, door_no = $9,
        city = $10, state = $11, district = $12, country = $13,
        bank_details = $14, status = $15, updated_at = CURRENT_TIMESTAMP
      WHERE id = $16
      RETURNING *`,
      [
        firstName, lastName, companyName, displayName, email,
        category, workPhone, mobile, doorNo, city, state,
        district, country, bankDetails, status, id
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    console.error('Error in putVendors:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  getVendors,
  postVendors,
  putVendors
};




