const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getBrand, postBrand, putBrand } = require('../../../controllers/superadmin/brand/BrandRoutes');

// Create branding-image directory in public folder
const brandingImageDir = path.join(__dirname, '../../../public/branding-image');
if (!fs.existsSync(brandingImageDir)) {
  fs.mkdirSync(brandingImageDir, { recursive: true });
}

// Cache control middleware for branding images
const brandingCacheControl = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
};

// Allowed file types
const MIME_TYPES = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico'
};

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Save directly to public/branding-image
        cb(null, brandingImageDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = MIME_TYPES[file.mimetype];
        const filename = `${file.fieldname}-${uniqueSuffix}.${extension}`;
        cb(null, filename);
    }
});

const fileFilter = (req, file, cb) => {
    if (MIME_TYPES[file.mimetype]) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, SVG, and ICO files are allowed.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 50 * 1024 * 1024, // 5MB limit
        files: 2 // Maximum 2 files (logo and favicon)
    },
    fileFilter: fileFilter
});

const uploadFields = upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'favicon', maxCount: 1 }
]);

// Middleware to handle file upload errors
const handleUpload = (req, res, next) => {
    uploadFields(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File size is too large. Maximum size is 5MB.' });
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({ error: 'Too many files uploaded.' });
            }
            return res.status(400).json({ error: err.message });
        } else if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
};

// Apply cache control middleware to all branding routes
router.use(brandingCacheControl);

router.get('/', getBrand);
router.post('/', handleUpload, postBrand);
router.put('/:id', handleUpload, putBrand);

// Simplified error handling
router.use((err, req, res, next) => {
    console.error('Brand Settings Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

module.exports = router;
