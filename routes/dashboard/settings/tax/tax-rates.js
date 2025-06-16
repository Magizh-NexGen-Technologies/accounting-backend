const express = require('express');
const router = express.Router({ mergeParams: true });

const {
  postTaxSettings,
  getTaxSettings,
  putTaxSettings,
  deleteTaxSettings,

  getGSTSettings,
  postGSTSettings,
  putGSTSettings,
  deleteGSTSettings
  
} = require('../../../../controllers/dashboard/settings/tax/TaxControllers');

// Add error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

// Tax settings routes
router.post('/', postTaxSettings);
router.get('/', getTaxSettings);
router.put('/:id', putTaxSettings);
router.delete('/:id', deleteTaxSettings);

// GST settings routes
router.post('/gst', postGSTSettings);
router.get('/gst', getGSTSettings);
router.put('/gst/:id', putGSTSettings); 
router.delete('/gst/:id', deleteGSTSettings )

// Add error handling middleware
router.use(errorHandler);

module.exports = router;     