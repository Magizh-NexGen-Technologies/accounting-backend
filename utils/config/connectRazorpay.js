const Razorpay = require('razorpay');
const crypto = require('crypto');

class RazorpayConnection {
  constructor(apiKey, apiSecret, isTestMode = true) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isTestMode = isTestMode;
    this.instance = null;
  }

  // Validate API key format
  validateApiKey() {
    if (!this.apiKey) {
      return {
        success: false,
        message: 'API key is required'
      };
    }

    const keyPrefix = this.isTestMode ? 'rzp_test_' : 'rzp_live_';
    if (!this.apiKey.startsWith(keyPrefix)) {
      return {
        success: false,
        message: `Invalid API key format. ${this.isTestMode ? 'Test' : 'Live'} mode key should start with '${keyPrefix}'`
      };
    }

    return { success: true };
  }

  // Initialize Razorpay instance
  initialize() {
    try {
      const keyValidation = this.validateApiKey();
      if (!keyValidation.success) {
        return keyValidation;
      }

      this.instance = new Razorpay({
        key_id: this.apiKey,
        key_secret: this.apiSecret
      });
      return { success: true };
    } catch (error) {
      console.error('Error initializing Razorpay:', error);
      return {
        success: false,
        message: 'Failed to initialize Razorpay connection'
      };
    }
  }

  // Verify Razorpay credentials by making a test API call
  async verifyCredentials() {
    try {
      // First validate API key format
      const keyValidation = this.validateApiKey();
      if (!keyValidation.success) {
        return keyValidation;
      }

      // Check if API secret is provided
      if (!this.apiSecret) {
        return {
          success: false,
          message: 'API secret is required'
        };
      }

      if (!this.instance) {
        const initResult = this.initialize();
        if (!initResult.success) {
          return initResult;
        }
      }

      // Make a test API call to verify credentials
      const response = await this.instance.payments.all({
        count: 1
      });

      return {
        success: true,
        message: `Razorpay ${this.isTestMode ? 'test' : 'live'} credentials verified successfully`,
        mode: this.isTestMode ? 'test' : 'live'
      };
    } catch (error) {
      console.error('Error verifying Razorpay credentials:', error);
      
      // Handle specific error cases
      if (error.error) {
        if (error.error.description) {
          return {
            success: false,
            message: `Invalid credentials: ${error.error.description}`
          };
        }
        if (error.error.code === 'BAD_REQUEST_ERROR') {
          return {
            success: false,
            message: 'Invalid API key or secret key'
          };
        }
      }

      return {
        success: false,
        message: 'Failed to verify Razorpay credentials. Please check your API key and secret key.'
      };
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(webhookSecret, signature, body) {
    try {
      if (!webhookSecret) {
        return {
          success: false,
          message: 'Webhook secret is required for signature verification'
        };
      }

      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(body))
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      return {
        success: isValid,
        message: isValid ? 'Signature verified' : 'Invalid signature'
      };
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return {
        success: false,
        message: 'Failed to verify webhook signature'
      };
    }
  }

  // Create a test payment to verify integration
  async createTestPayment(amount = 100, currency = 'INR') {
    try {
      if (!this.instance) {
        const initResult = this.initialize();
        if (!initResult.success) {
          return initResult;
        }
      }

      const options = {
        amount: amount * 100, // Razorpay expects amount in smallest currency unit (paise for INR)
        currency: currency,
        receipt: `test_${Date.now()}`,
        notes: {
          test: true
        }
      };

      const order = await this.instance.orders.create(options);
      return {
        success: true,
        order: order
      };
    } catch (error) {
      console.error('Error creating test payment:', error);
      return {
        success: false,
        message: error.message || 'Failed to create test payment',
        error: error
      };
    }
  }

  // Get payment details
  async getPaymentDetails(paymentId) {
    try {
      if (!this.instance) {
        const initResult = this.initialize();
        if (!initResult.success) {
          return initResult;
        }
      }

      const payment = await this.instance.payments.fetch(paymentId);
      return {
        success: true,
        payment: payment
      };
    } catch (error) {
      console.error('Error fetching payment details:', error);
      return {
        success: false,
        message: error.message || 'Failed to fetch payment details',
        error: error
      };
    }
  }

  // Get all payment methods
  async getPaymentMethods() {
    try {
      if (!this.instance) {
        this.initialize();
      }

      const methods = await this.instance.payments.methods();
      return {
        success: true,
        methods: methods
      };
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      return {
        success: false,
        message: error.message || 'Failed to fetch payment methods',
        error: error
      };
    }
  }
}

// Function expected by the controller
function getRazorpayInstance(apiKey, apiSecret) {
  return new Razorpay({
    key_id: apiKey,
    key_secret: apiSecret
  });
}

// Export a function to create a new Razorpay connection
module.exports = function createRazorpayConnection(apiKey, apiSecret, isTestMode = true) {
  return new RazorpayConnection(apiKey, apiSecret, isTestMode);
};

// Also export the getRazorpayInstance function for the controller
module.exports.getRazorpayInstance = getRazorpayInstance; 