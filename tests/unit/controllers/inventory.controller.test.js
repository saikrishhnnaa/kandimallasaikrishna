const pool = require('../../../src/config/database');

describe('InventoryController', () => {
  let mockClient;
  const InventoryController = require('../../../src/controllers/inventory.controller');

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    jest.clearAllMocks();
  });

  describe('getAllProducts', () => {
    it('should return paginated list of products', async () => {
      const req = {
        query: { page: 1, limit: 10 }
      };

      const res = {
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '50' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'Widget A', sku: 'SKU001', price: 500, stock_quantity: 100 }
          ]
        });

      await InventoryController.getAllProducts(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Products retrieved successfully',
          data: expect.any(Array),
          pagination: expect.objectContaining({
            total: 50,
            page: 1,
            limit: 10
          })
        })
      );
    });

    it('should filter products by category', async () => {
      const req = {
        query: { category: 'Electronics', page: 1, limit: 10 }
      };

      const res = {
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await InventoryController.getAllProducts(req, res, next);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('category = $1'),
        expect.any(Array)
      );
    });

    it('should filter low stock items', async () => {
      const req = {
        query: { low_stock: 'true', page: 1, limit: 10 }
      };

      const res = {
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await InventoryController.getAllProducts(req, res, next);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('stock_quantity <= min_stock_level'),
        expect.any(Array)
      );
    });
  });

  describe('getProductById', () => {
    it('should return product by id', async () => {
      const req = { params: { id: 1 } };
      const res = { json: jest.fn() };
      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Widget A',
          sku: 'SKU001',
          price: 500,
          stock_quantity: 100
        }]
      });

      await InventoryController.getProductById(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Product retrieved successfully',
          data: expect.objectContaining({
            id: 1,
            name: 'Widget A'
          })
        })
      );
    });

    it('should return 404 if product not found', async () => {
      const req = { params: { id: 999 } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await InventoryController.getProductById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('createProduct', () => {
    it('should create a new product', async () => {
      const req = {
        validatedData: {
          name: 'New Widget',
          sku: 'NEW-001',
          category: 'Electronics',
          price: 599.99,
          cost_price: 350,
          stock_quantity: 100
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check if SKU exists
        .mockResolvedValueOnce({
          rows: [{
            id: 5,
            name: 'New Widget',
            sku: 'NEW-001',
            price: 599.99,
            stock_quantity: 100
          }]
        });

      await InventoryController.createProduct(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Product created successfully',
          data: expect.objectContaining({
            name: 'New Widget',
            sku: 'NEW-001'
          })
        })
      );
    });

    it('should return 409 if SKU already exists', async () => {
      const req = {
        validatedData: {
          name: 'Widget',
          sku: 'EXISTING-001',
          category: 'Electronics',
          price: 500,
          stock_quantity: 100
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await InventoryController.createProduct(req, res, next);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Product with this SKU already exists'
        })
      );
    });
  });

  describe('adjustStock', () => {
    it('should adjust product stock successfully', async () => {
      const req = {
        params: { id: 1 },
        validatedData: {
          quantity: 50,
          type: 'purchase',
          notes: 'Stock received'
        },
        user: { id: 1 }
      };

      const res = {
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 1, stock_quantity: 100 }]
        }) // SELECT product
        .mockResolvedValueOnce(undefined) // UPDATE stock
        .mockResolvedValueOnce(undefined) // INSERT transaction
        .mockResolvedValueOnce(undefined); // COMMIT

      await InventoryController.adjustStock(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Stock adjusted successfully',
          data: expect.objectContaining({
            product_id: 1,
            previous_stock: 100,
            new_stock: 150,
            type: 'purchase'
          })
        })
      );
    });

    it('should return 400 if stock would go negative', async () => {
      const req = {
        params: { id: 1 },
        validatedData: {
          quantity: 150,
          type: 'sale',
          notes: ''
        },
        user: { id: 1 }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 1, stock_quantity: 100 }]
        }); // SELECT product

      await InventoryController.adjustStock(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Insufficient stock for this transaction'
        })
      );
    });
  });
});
