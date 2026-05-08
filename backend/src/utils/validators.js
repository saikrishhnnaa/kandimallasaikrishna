const Joi = require('joi');

// Auth Validators
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().required(),
  role: Joi.string().valid('admin', 'employee', 'sales_agent').required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// User Validators
const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().required(),
  role: Joi.string().valid('admin', 'employee', 'sales_agent').required(),
  phone: Joi.string().optional(),
  department: Joi.string().optional()
});

const updateUserSchema = Joi.object({
  email: Joi.string().email().optional(),
  name: Joi.string().optional(),
  phone: Joi.string().optional(),
  department: Joi.string().optional(),
  status: Joi.string().valid('active', 'inactive').optional()
});

// Product Validators
const createProductSchema = Joi.object({
  name: Joi.string().required(),
  sku: Joi.string().required(),
  category: Joi.string().required(),
  price: Joi.number().positive().required(),
  cost_price: Joi.number().positive().optional(),
  stock_quantity: Joi.number().min(0).required(),
  min_stock_level: Joi.number().min(0).optional(),
  max_stock_level: Joi.number().min(0).optional(),
  unit_of_measurement: Joi.string().optional()
});

const updateProductSchema = Joi.object({
  name: Joi.string().optional(),
  category: Joi.string().optional(),
  price: Joi.number().positive().optional(),
  cost_price: Joi.number().positive().optional(),
  min_stock_level: Joi.number().min(0).optional(),
  max_stock_level: Joi.number().min(0).optional(),
  status: Joi.string().valid('active', 'inactive', 'discontinued').optional()
});

const stockAdjustmentSchema = Joi.object({
  quantity: Joi.number().required(),
  type: Joi.string().valid('purchase', 'sale', 'adjustment', 'return').required(),
  notes: Joi.string().optional()
});

// Order Validators
const createOrderSchema = Joi.object({
  customer_id: Joi.number().required(),
  items: Joi.array().items(
    Joi.object({
      product_id: Joi.number().required(),
      quantity: Joi.number().min(1).required(),
      unit_price: Joi.number().positive().required()
    })
  ).required(),
  discount_amount: Joi.number().min(0).optional(),
  tax_amount: Joi.number().min(0).optional(),
  payment_method: Joi.string().valid('cash', 'card', 'digital_wallet', 'check', 'credit').required(),
  notes: Joi.string().optional()
});

const updateOrderStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled').required()
});

const processPaymentSchema = Joi.object({
  payment_amount: Joi.number().positive().required(),
  payment_method: Joi.string().valid('cash', 'card', 'digital_wallet', 'check').required(),
  payment_reference: Joi.string().optional()
});

// Validation helper
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const messages = error.details.map(detail => detail.message);
      return res.status(400).json({
        error: 'Validation failed',
        details: messages,
        status: 400
      });
    }

    req.validatedData = value;
    next();
  };
};

module.exports = {
  registerSchema,
  loginSchema,
  createUserSchema,
  updateUserSchema,
  createProductSchema,
  updateProductSchema,
  stockAdjustmentSchema,
  createOrderSchema,
  updateOrderStatusSchema,
  processPaymentSchema,
  validate
};
