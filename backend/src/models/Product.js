// Product model
// TODO: Implement database queries for Product operations

class Product {
  constructor(id, name, sku, category, price, stockQuantity) {
    this.id = id;
    this.name = name;
    this.sku = sku;
    this.category = category;
    this.price = price;
    this.stockQuantity = stockQuantity;
    this.createdAt = new Date();
  }

  static async create(productData) {
    // TODO: Insert into database
  }

  static async findById(id) {
    // TODO: Query from database
  }

  static async findBySku(sku) {
    // TODO: Query from database
  }

  static async update(id, productData) {
    // TODO: Update in database
  }

  static async delete(id) {
    // TODO: Delete from database
  }

  static async findByCategory(category) {
    // TODO: Query products by category
  }

  static async getLowStockItems(threshold = 10) {
    // TODO: Find items with low stock
  }
}

module.exports = Product;
