const { getRazorpayInstance } = require('../../../utils/config/connectRazorpay');
const crypto = require('crypto');
const pool = require('../../../utils/config/connectDB');

// Create a new order
exports.createOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid amount' 
      });
    }

    // Get settings from database 
    const settingsQuery = `
      SELECT api_key, api_secret, is_test_mode
      FROM payment_gateways
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const settingsResult = await pool.query(settingsQuery);
    
    if (settingsResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment gateway not configured'
      });
    }

    const settings = settingsResult.rows[0];
    const razorpay = getRazorpayInstance(settings.api_key, settings.api_secret);

    const options = {
      amount: Math.round(amount), // amount in paisa
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    // Store order details in database
    const insertOrderQuery = `
      INSERT INTO razorpay_orders (
        order_id,
        amount,
        currency,
        receipt,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `;

    await pool.query(insertOrderQuery, [
      order.id,
      order.amount,
      order.currency,
      order.receipt,
      order.status
    ]);

    res.json({
      success: true,
      orderId: order.id,
      apiKey: settings.api_key,
      amount: order.amount,
      currency: order.currency
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
};

// Verify payment signature
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    // Get settings from database
    const settingsQuery = `
      SELECT api_key, api_secret, webhook_secret
      FROM payment_gateways
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const settingsResult = await pool.query(settingsQuery);
    
    if (settingsResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment gateway not configured'
      });
    }

    const settings = settingsResult.rows[0];

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', settings.api_secret)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      // Save failure data
      await this.savePaymentFailure(razorpay_order_id, {
        reason: 'signature_verification_failed',
        code: 'INVALID_SIGNATURE',
        description: 'Payment signature verification failed'
      });

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Update order status in database
    const updateOrderQuery = `
      UPDATE razorpay_orders
      SET 
        payment_id = $1,
        payment_signature = $2,
        status = 'paid',
        updated_at = NOW()
      WHERE order_id = $3 
    `;

    await pool.query(updateOrderQuery, [
      razorpay_payment_id,
      razorpay_signature,
      razorpay_order_id
    ]);

    res.json({
      success: true,
      message: 'Payment verified successfully'
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
};

// Handle payment failure
exports.handlePaymentFailure = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      error_code, 
      error_description,
      error_reason
    } = req.body;

    if (!razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    await this.savePaymentFailure(razorpay_order_id, {
      reason: error_reason || 'payment_failed',
      code: error_code || 'UNKNOWN_ERROR',
      description: error_description || 'Payment failed due to unknown reason'
    });

    res.json({
      success: true,
      message: 'Payment failure recorded successfully'
    });

  } catch (error) {
    console.error('Error handling payment failure:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record payment failure',
      error: error.message
    });
  }
};

// Save payment failure data (internal function)
exports.savePaymentFailure = savePaymentFailure;

// Get all payments
exports.getPaymentFailures = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const paymentsQuery = `
      SELECT 
        order_id,
        payment_id,
        amount,
        currency,
        receipt,
        status,
        failure_reason,
        failure_code,
        failure_description,
        created_at,
        updated_at
      FROM razorpay_orders
      ORDER BY updated_at DESC
      LIMIT $1 OFFSET $2
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM razorpay_orders
    `;

    const [paymentsResult, countResult] = await Promise.all([
      pool.query(paymentsQuery, [limit, offset]),
      pool.query(countQuery)
    ]);

    res.json({
      success: true,
      data: paymentsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
      error: error.message
    });
  }
};

// Get webhook events log
exports.getWebhookEvents = async (req, res) => {
  try {
    const { page = 1, limit = 10, processed } = req.query;
    const offset = (page - 1) * limit;

    // Build the query with optional processed filter
    let eventsQuery = `
      SELECT 
        id,
        event_id,
        event_type,
        payload,
        processed,
        created_at
      FROM webhook_events
    `;
    
    const queryParams = [];
    
    // Add processed filter if provided
    if (processed !== undefined) {
      eventsQuery += ` WHERE processed = $1`;
      queryParams.push(processed === 'true');
    }
    
    // Add sorting and pagination
    eventsQuery += `
      ORDER BY created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    
    queryParams.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM webhook_events
      ${processed !== undefined ? 'WHERE processed = $1' : ''}
    `;

    const [eventsResult, countResult] = await Promise.all([
      pool.query(eventsQuery, queryParams),
      pool.query(countQuery, processed !== undefined ? [processed === 'true'] : [])
    ]);

    res.json({
      success: true,
      data: eventsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching webhook events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch webhook events',
      error: error.message
    });
  }
};

// Retry processing a specific webhook event
exports.retryWebhookEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    
    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: 'Event ID is required'
      });
    }
    
    // Get the event from database
    const eventQuery = `
      SELECT event_id, event_type, payload
      FROM webhook_events
      WHERE event_id = $1
    `;
    
    const eventResult = await pool.query(eventQuery, [eventId]);
    
    if (eventResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webhook event not found'
      });
    }
    
    const event = eventResult.rows[0];
    
    // Parse the payload if it's stored as a string
    const eventPayload = typeof event.payload === 'string' 
      ? JSON.parse(event.payload) 
      : event.payload;
    
    // Process the event
    await processWebhookEventAsync(eventPayload, event.event_id);
    
    // Update the event status
    await pool.query(
      `UPDATE webhook_events 
       SET processed = TRUE 
       WHERE event_id = $1`,
      [eventId]
    );
    
    res.json({
      success: true,
      message: 'Webhook event reprocessed successfully'
    });
    
  } catch (error) {
    console.error('Error retrying webhook event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry webhook event',
      error: error.message
    });
  }
};

// Handle Razorpay webhooks
exports.handleWebhook = async (req, res) => {
  try {
    // Get webhook signature from headers
    const webhookSignature = req.headers['x-razorpay-signature'];
    const eventId = req.headers['x-razorpay-event-id'];
    
    if (!webhookSignature) {
      console.error('Webhook signature missing');
      // Still return 200 to prevent Razorpay from retrying
      return res.status(200).json({ 
        success: false,
        message: 'Webhook signature missing' 
      });
    }
    
    // Check for duplicate event (quick check before processing)
    if (eventId) {
      const duplicateCheck = await pool.query(
        'SELECT id FROM webhook_events WHERE event_id = $1',
        [eventId]
      );
      
      if (duplicateCheck.rows.length > 0) {
        console.log(`Duplicate webhook event: ${eventId}. Skipping.`);
        return res.status(200).json({
          success: true,
          message: 'Duplicate event. Already processed.'
        });
      }
    }
    
    // Get webhook secret from database
    const settingsQuery = `
      SELECT api_secret, webhook_secret
      FROM payment_gateways
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const settingsResult = await pool.query(settingsQuery);
    if (settingsResult.rows.length === 0 || !settingsResult.rows[0].webhook_secret) {
      console.error('Webhook secret not configured');
      return res.status(200).json({
        success: false,
        message: 'Webhook secret not configured'
      });
    }
    
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || settingsResult.rows[0].webhook_secret;
    
    // Verify webhook signature
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');
    
    if (expectedSignature !== webhookSignature) {
      console.error('Invalid webhook signature');
      return res.status(200).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }
    
    // Store the event data for asynchronous processing
    const event = req.body;
    
    // Store event in database for idempotency (quick operation)
    if (eventId) {
      await pool.query(
        `INSERT INTO webhook_events (event_id, event_type, payload, processed)
         VALUES ($1, $2, $3, FALSE)
         ON CONFLICT (event_id) DO NOTHING`,
        [eventId, event.event, JSON.stringify(event)]
      );
    }
    
    // Send response immediately to prevent timeout
    res.status(200).json({ 
      success: true,
      message: 'Webhook received successfully'
    });
    
    // Process the webhook event asynchronously
    processWebhookEventAsync(event, eventId);
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Always return 200 to prevent Razorpay from retrying
    return res.status(200).json({ 
      success: false,
      message: 'Error processing webhook' 
    });
  }
};

// Asynchronous processing function for webhook events
async function processWebhookEventAsync(event, eventId) {
  try {
    console.log(`Processing webhook event asynchronously: ${event.event}`);
    
    // Handle different event types
    switch (event.event) {
      case 'payment.authorized':
        console.log('Payment authorized:', event.payload.payment.entity.id);
        // Payment is authorized but not captured yet
        break;
        
      case 'payment.captured':
        console.log('Payment captured:', event.payload.payment.entity.id);
        // Update order status in database
        await pool.query(`
          UPDATE razorpay_orders
          SET 
            payment_id = $1,
            status = 'paid',
            updated_at = NOW()
          WHERE order_id = $2
        `, [
          event.payload.payment.entity.id,
          event.payload.payment.entity.order_id
        ]);
        break;
        
      case 'payment.failed':
        console.log('Payment failed:', event.payload.payment.entity.id);
        // Handle payment failure
        await savePaymentFailure(
          event.payload.payment.entity.order_id, 
          {
            reason: event.payload.payment.entity.error_reason || 'unknown',
            code: event.payload.payment.entity.error_code || 'UNKNOWN_ERROR',
            description: event.payload.payment.entity.error_description || 'Payment failed'
          }
        );
        break;
        
      case 'order.paid':
        console.log('Order paid:', event.payload.order.entity.id);
        // Update order status to paid
        await pool.query(`
          UPDATE razorpay_orders
          SET 
            payment_id = $1,
            status = 'paid',
            updated_at = NOW()
          WHERE order_id = $2
        `, [
          event.payload.payment.entity.id,
          event.payload.order.entity.id
        ]);
        break;
        
      case 'refund.created':
        console.log('Refund created:', event.payload.refund.entity.id);
        // Handle refund creation
        // You might want to add a refunds table in your database
        break;
        
      case 'refund.processed':
        console.log('Refund processed:', event.payload.refund.entity.id);
        // Handle refund processing
        break;
        
      case 'payment.dispute.created':
        console.log('Payment dispute created:', event.payload.payment.entity.id);
        // Handle payment dispute
        break;
        
      case 'subscription.charged':
        console.log('Subscription charged:', event.payload.subscription.entity.id);
        // Handle subscription charge
        break;
        
      case 'invoice.paid':
        console.log('Invoice paid:', event.payload.invoice.entity.id);
        // Handle invoice payment
        break;
        
      default:
        console.log(`Unhandled event type: ${event.event}`);
    }
    
    // Mark event as processed in the database
    if (eventId) {
      await pool.query(
        `UPDATE webhook_events 
         SET processed = TRUE 
         WHERE event_id = $1`,
        [eventId]
      );
    }
    
    console.log(`Webhook event processed successfully: ${event.event}`);
  } catch (error) {
    console.error('Error in async webhook processing:', error);
    // Here you could implement retry logic or logging to a separate error table
  }
}

// Function to save payment failure data (used by both synchronous and asynchronous code)
async function savePaymentFailure(orderId, failureData) {
  try {
    const updateFailureQuery = `
      UPDATE razorpay_orders
      SET 
        status = 'failed',
        failure_reason = $1,
        failure_code = $2,
        failure_description = $3,
        updated_at = NOW()
      WHERE order_id = $4
    `;

    await pool.query(updateFailureQuery, [
      failureData.reason,
      failureData.code,
      failureData.description,
      orderId
    ]);

    console.log(`Payment failure recorded for order: ${orderId}`);
  } catch (error) {
    console.error('Error saving payment failure:', error);
    throw error;
  }
}

// Update middleware to use database for duplicate check
exports.checkDuplicateWebhook = async (req, res, next) => {
  const eventId = req.headers['x-razorpay-event-id'];
  
  if (!eventId) {
    console.warn('Webhook missing event ID');
    return next();
  }
  
  try {
    const duplicateCheck = await pool.query(
      'SELECT id FROM webhook_events WHERE event_id = $1',
      [eventId]
    );
    
    if (duplicateCheck.rows.length > 0) {
      console.log(`Duplicate webhook event: ${eventId}. Skipping.`);
      return res.status(200).json({
        success: true,
        message: 'Duplicate event. Already processed.'
      });
    }
    
    next();
  } catch (error) {
    console.error('Error checking for duplicate webhook:', error);
    // Continue to next middleware/handler even if check fails
    next();
  }
};

// Test webhook configuration
exports.testWebhook = async (req, res) => {
  try {
    // Get settings from database
    const settingsQuery = `
      SELECT api_key, api_secret, webhook_secret, is_test_mode
      FROM payment_gateways
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const settingsResult = await pool.query(settingsQuery);
    
    if (settingsResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment gateway not configured'
      });
    }

    const settings = settingsResult.rows[0];
    
    if (!settings.webhook_secret) {
      return res.status(400).json({
        success: false,
        message: 'Webhook secret not configured'
      });
    }

    // Check for HTTPS in production
    const protocol = req.protocol;
    if (protocol !== 'https' && process.env.NODE_ENV === 'production') {
      console.warn('Webhook test requested over non-HTTPS protocol in production');
    }
    
    // Create a sample order in the database
    const orderId = `order_test_${Date.now()}`;
    const amount = 10000; // 100 INR in paise
    const receiptId = `receipt_test_${Date.now()}`;
    
    // Insert test order into database
    const insertOrderQuery = `
      INSERT INTO razorpay_orders (
        order_id,
        amount,
        currency,
        receipt,
        status
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const order = await pool.query(insertOrderQuery, [
      orderId,
      amount,
      'INR',
      receiptId,
      'created'
    ]);
    
    // Create a sample webhook event payload
    const paymentId = `pay_test_${Date.now()}`;
    const eventId = `evt_test_${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000);
    
    const eventPayload = {
      entity: "event",
      account_id: "acc_test",
      event: "payment.captured",
      contains: ["payment"],
      payload: {
        payment: {
          entity: {
            id: paymentId,
            entity: "payment",
            amount: amount,
            currency: "INR",
            status: "captured",
            order_id: orderId,
            method: "test",
            captured: true,
            description: "Test payment for webhook verification",
            email: "test@example.com",
            contact: "+919999999999",
            created_at: timestamp
          }
        }
      },
      created_at: timestamp
    };
    
    // Sign the payload with the webhook secret
    const payload = JSON.stringify(eventPayload);
    const signature = crypto
      .createHmac('sha256', settings.webhook_secret)
      .update(payload)
      .digest('hex');
    
    // Create a test webhook endpoint URL with proper protocol detection
    const host = req.get('host');
    const testProtocol = process.env.NODE_ENV === 'production' ? 'https' : protocol;
    const webhookUrl = `${testProtocol}://${host}/api/superadmin/payment-gateways/webhook`;
    
    // Create curl command for testing
    const curlCommand = `curl -X POST ${webhookUrl} \\
-H "Content-Type: application/json" \\
-H "x-razorpay-signature: ${signature}" \\
-H "x-razorpay-event-id: ${eventId}" \\
-d '${payload}'`;
    
    return res.json({
      success: true,
      message: 'Webhook test setup successfully',
      testData: {
        url: webhookUrl,
        payload: eventPayload,
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature,
          'x-razorpay-event-id': eventId
        },
        curlCommand,
        note: 'To test, make a POST request to the webhook URL with the payload and headers provided, or use the curl command above.'
      }
    });
    
  } catch (error) {
    console.error('Error setting up webhook test:', error);
    
    // Better error classification
    if (error.code === '23505') { // PostgreSQL unique violation
      return res.status(400).json({
        success: false,
        message: 'Test event already exists with this order ID',
        error: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to setup webhook test',
      error: error.message
    });
  }
};
