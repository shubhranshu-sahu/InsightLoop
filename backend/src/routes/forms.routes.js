const express = require('express');
const router = express.Router();
const formsController = require('../controllers/forms.controller');
const { verifyToken } = require('../middleware/auth');

// All form routes require JWT authentication
router.get('/', verifyToken, formsController.getAllForms);
router.post('/', verifyToken, formsController.createForm);
router.get('/:form_id', verifyToken, formsController.getFormById);
router.put('/:form_id', verifyToken, formsController.updateForm);
router.delete('/:form_id', verifyToken, formsController.deleteForm);

module.exports = router;
