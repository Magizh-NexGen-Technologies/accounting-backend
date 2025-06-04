const pool = require("../../../utils/config/connectDB");
const financeSettingsSchema = require("../../../utils/models/superadmin/finance/financeSchema");

// Initialize schema function
const initializeSchema = async (client) => {
  try {
    await client.query(financeSettingsSchema);
    console.log("finance schema initialized successfully");
  } catch (error) {
    console.error("Error initializing finance schema:", error);
    throw error;
  }
};

// Generate a financial year code from dates
const generateFinancialYearCode = (startDate, endDate) => {
  const startYear = new Date(startDate).getFullYear() % 100; // Get last 2 digits
  const endYear = new Date(endDate).getFullYear() % 100; // Get last 2 digits
  return `${startYear}-${endYear}`;
};

// Generate invoice number
exports.generateInvoiceNumber = async (req, res) => {
  const client = await pool.connect();
  
  try {
    // Initialize schema if needed
    await initializeSchema(client);
    
    // Get current active finance settings
    const settingsResult = await client.query(
      "SELECT * FROM finance_settings WHERE active = TRUE ORDER BY id DESC LIMIT 1"
    );
    
    if (settingsResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Finance settings not found"
      });
    }
    
    const settings = settingsResult.rows[0];
    const { 
      invoice_prefix,
      financial_year_start_date,
      financial_year_end_date
    } = settings;
    
    // Use default invoice number length if not set
    const invoice_number_length = settings.invoice_number_length || 16;
    
    // Generate financial year code
    const financialYearCode = generateFinancialYearCode(
      financial_year_start_date,
      financial_year_end_date
    );
    
    // Start a transaction
    await client.query('BEGIN');
    
    // Use the database function to get the next number atomically
    const nextNumberResult = await client.query(
      'SELECT get_next_invoice_number($1, $2) AS next_number',
      [financialYearCode, invoice_prefix]
    );
    
    const nextNumber = nextNumberResult.rows[0].next_number;
    
    // Format the invoice number
    const sequentialPart = nextNumber.toString();
    
    // Calculate the maximum length for the sequential part
    const prefixYearLength = invoice_prefix.length + 1 + financialYearCode.length + 1;
    const maxSequentialLength = Math.max(1, invoice_number_length - prefixYearLength);
    
    // Check if the sequential part exceeds maximum allowed length
    if (sequentialPart.length > maxSequentialLength) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Invoice number exceeds maximum length of ${invoice_number_length} characters`
      });
    }
    
    // Format the full invoice number
    const invoiceNumber = `${invoice_prefix}/${financialYearCode}/${sequentialPart}`;
    
    // Commit transaction
    await client.query('COMMIT');
    
    // Get all counters for response
    const countersResult = await client.query(
      "SELECT * FROM invoice_counters ORDER BY financial_year_code DESC, prefix"
    );
    
    return res.status(200).json({
      success: true,
      message: "Invoice number generated successfully",
      data: {
        invoiceNumber,
        prefix: invoice_prefix,
        financialYearCode,
        sequentialNumber: nextNumber,
        nextInvoiceNumber: invoiceNumber,
        counters: countersResult.rows
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error generating invoice number:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate invoice number",
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Get finance settings
exports.getFinanceSettings = async (req, res) => {
  const client = await pool.connect();
  
  try {
    // Initialize schema if needed
    await initializeSchema(client);
    
    // Check if finance settings exist
    const { rows } = await client.query(
      "SELECT * FROM finance_settings WHERE active = TRUE ORDER BY id DESC LIMIT 1"
    );
    
    // If no settings exist, create default ones
    if (rows.length === 0) {
      const defaultStartDate = new Date(new Date().getFullYear(), 3, 1); // April 1st
      const defaultEndDate = new Date(new Date().getFullYear() + 1, 2, 31); // March 31st next year
      
      const financialYearCode = generateFinancialYearCode(defaultStartDate, defaultEndDate);
      
      // Start transaction
      await client.query('BEGIN');
      
      const insertResult = await client.query(
        `INSERT INTO finance_settings 
         (invoice_prefix, financial_year_start_date, financial_year_end_date, gst_percentage) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        ['INV', defaultStartDate, defaultEndDate, 18.00]
      );
      
      // Create initial counter for default financial year
      await client.query(
        `INSERT INTO invoice_counters 
         (financial_year_code, prefix, last_number) 
         VALUES ($1, $2, 0)
         ON CONFLICT (financial_year_code, prefix) DO NOTHING`,
        [financialYearCode, 'INV']
      );
      
      // Commit transaction
      await client.query('COMMIT');
      
      const countersResult = await client.query(
        "SELECT * FROM invoice_counters ORDER BY financial_year_code DESC, prefix"
      );
      
      return res.status(200).json({
        success: true,
        message: "Default finance settings created",
        data: {
          ...insertResult.rows[0],
          financialYearCode,
          nextInvoiceNumber: `INV/${financialYearCode}/1`,
          counters: countersResult.rows
        }
      });
    }
    
    // Get current counters for each financial year
    const countersResult = await client.query(
      "SELECT * FROM invoice_counters ORDER BY financial_year_code DESC, prefix"
    );
    
    // Get financial year code for current settings
    const settings = rows[0];
    const financialYearCode = generateFinancialYearCode(
      settings.financial_year_start_date,
      settings.financial_year_end_date
    );
    
    // Find current counter
    const currentCounter = countersResult.rows.find(
      counter => counter.financial_year_code === financialYearCode && 
                 counter.prefix === settings.invoice_prefix
    );
    
    // If no counter exists for current financial year, create one
    if (!currentCounter) {
      await client.query(
        `INSERT INTO invoice_counters 
         (financial_year_code, prefix, last_number) 
         VALUES ($1, $2, 0)
         ON CONFLICT (financial_year_code, prefix) DO NOTHING`,
        [financialYearCode, settings.invoice_prefix]
      );
      
      // Refresh counters
      const updatedCountersResult = await client.query(
        "SELECT * FROM invoice_counters ORDER BY financial_year_code DESC, prefix"
      );
      
      const nextInvoiceNumber = `${settings.invoice_prefix}/${financialYearCode}/1`;
      
      return res.status(200).json({
        success: true,
        message: "Finance settings retrieved successfully",
        data: {
          ...settings,
          financialYearCode,
          nextInvoiceNumber,
          counters: updatedCountersResult.rows
        }
      });
    }
    
    const nextInvoiceNumber = `${settings.invoice_prefix}/${financialYearCode}/${currentCounter.last_number + 1}`;
    
    return res.status(200).json({
      success: true,
      message: "Finance settings retrieved successfully",
      data: {
        ...settings,
        financialYearCode,
        nextInvoiceNumber,
        counters: countersResult.rows
      }
    });
  } catch (error) {
    console.error("Error getting finance settings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get finance settings",
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Create new finance settings
exports.postFinanceSettings = async (req, res) => {
  const client = await pool.connect();
  
  try {
    // Initialize schema if needed
    await initializeSchema(client);
    
    const { 
      invoice_prefix, 
      financial_year_start_date, 
      financial_year_end_date, 
      gst_percentage
    } = req.body;
    
    // Validate input
    if (!invoice_prefix || !financial_year_start_date || !gst_percentage) {
      return res.status(400).json({
        success: false,
        message: "Required fields are missing"
      });
    }
    
    // Validate invoice prefix length
    if (invoice_prefix.length < 2 || invoice_prefix.length > 3) {
      return res.status(400).json({
        success: false,
        message: "Invoice prefix must be 2-3 characters"
      });
    }
    
    // Start a transaction
    await client.query('BEGIN');
    
    // Generate financial year code
    const financialYearCode = generateFinancialYearCode(
      financial_year_start_date,
      financial_year_end_date
    );
    
    // Check if counter exists for this financial year and prefix
    const counterCheckResult = await client.query(
      `SELECT * FROM invoice_counters 
       WHERE financial_year_code = $1 AND prefix = $2`,
      [financialYearCode, invoice_prefix.toUpperCase()]
    );
    
    // If no counter exists for this financial year, create one starting at 0
    if (counterCheckResult.rows.length === 0) {
      await client.query(
        `INSERT INTO invoice_counters 
         (financial_year_code, prefix, last_number) 
         VALUES ($1, $2, 0)`,
        [financialYearCode, invoice_prefix.toUpperCase()]
      );
    }
    
    // Set all existing settings to inactive
    await client.query(
      "UPDATE finance_settings SET active = FALSE WHERE active = TRUE"
    );
    
    // Insert new settings
    const { rows } = await client.query(
      `INSERT INTO finance_settings 
       (invoice_prefix, financial_year_start_date, financial_year_end_date, 
        gst_percentage, active) 
       VALUES ($1, $2, $3, $4, TRUE) 
       RETURNING *`,
      [
        invoice_prefix.toUpperCase(), 
        new Date(financial_year_start_date), 
        new Date(financial_year_end_date), 
        parseFloat(gst_percentage)
      ]
    );
    
    // Commit transaction
    await client.query('COMMIT');
    
    // Get all counters for the response
    const countersResult = await client.query(
      "SELECT * FROM invoice_counters ORDER BY financial_year_code DESC, prefix"
    );
    
    return res.status(201).json({
      success: true,
      message: "Finance settings created successfully",
      data: {
        ...rows[0],
        financialYearCode,
        counters: countersResult.rows
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error creating finance settings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create finance settings",
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Update existing finance settings by ID
exports.putFinanceSettings = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    
    // Check if record exists
    const checkResult = await client.query(
      "SELECT * FROM finance_settings WHERE id = $1",
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Finance settings not found"
      });
    }
    
    const existingSettings = checkResult.rows[0];
    
    const { 
      invoice_prefix, 
      financial_year_start_date, 
      financial_year_end_date, 
      gst_percentage
    } = req.body;
    
    // Validate input
    if (!invoice_prefix || !financial_year_start_date || !gst_percentage) {
      return res.status(400).json({
        success: false,
        message: "Required fields are missing"
      });
    }
    
    // Validate invoice prefix length
    if (invoice_prefix.length < 2 || invoice_prefix.length > 3) {
      return res.status(400).json({
        success: false,
        message: "Invoice prefix must be 2-3 characters"
      });
    }
    
    // Start a transaction
    await client.query('BEGIN');
    
    // Check for financial year change
    const oldStartDate = new Date(existingSettings.financial_year_start_date);
    const newStartDate = new Date(financial_year_start_date);
    const isFinancialYearChanged = 
      oldStartDate.getFullYear() !== newStartDate.getFullYear() || 
      oldStartDate.getMonth() !== newStartDate.getMonth() || 
      oldStartDate.getDate() !== newStartDate.getDate();

    // Generate old and new financial year codes
    const oldFinancialYearCode = generateFinancialYearCode(
      existingSettings.financial_year_start_date,
      existingSettings.financial_year_end_date
    );
    
    const newFinancialYearCode = generateFinancialYearCode(
      financial_year_start_date,
      financial_year_end_date
    );
    
    // Check existing invoice counter for the new financial year
    if (isFinancialYearChanged) {
      const counterCheckResult = await client.query(
        `SELECT * FROM invoice_counters 
         WHERE financial_year_code = $1 AND prefix = $2`,
        [newFinancialYearCode, invoice_prefix.toUpperCase()]
      );
      
      // If no counter exists for the new financial year, create one starting at 0
      if (counterCheckResult.rows.length === 0) {
        await client.query(
          `INSERT INTO invoice_counters 
           (financial_year_code, prefix, last_number) 
           VALUES ($1, $2, 0)`,
          [newFinancialYearCode, invoice_prefix.toUpperCase()]
        );
      }
    }
    
    // Set all existing settings to inactive
    await client.query(
      "UPDATE finance_settings SET active = FALSE WHERE active = TRUE"
    );
    
    // Update the record
    const { rows } = await client.query(
      `UPDATE finance_settings 
       SET invoice_prefix = $1, 
           financial_year_start_date = $2, 
           financial_year_end_date = $3, 
           gst_percentage = $4,
           active = TRUE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [
        invoice_prefix.toUpperCase(), 
        new Date(financial_year_start_date), 
        new Date(financial_year_end_date), 
        parseFloat(gst_percentage),
        id
      ]
    );
    
    // Commit transaction
    await client.query('COMMIT');
    
    // Get all counters for the response
    const countersResult = await client.query(
      "SELECT * FROM invoice_counters ORDER BY financial_year_code DESC, prefix"
    );
    
    return res.status(200).json({
      success: true,
      message: "Finance settings updated successfully",
      data: {
        ...rows[0],
        financialYearCode: newFinancialYearCode,
        counters: countersResult.rows,
        financialYearChanged: isFinancialYearChanged
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error updating finance settings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update finance settings",
      error: error.message
    });
  } finally {
    client.release();
  }
};
