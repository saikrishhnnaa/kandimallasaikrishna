// User model
// TODO: Implement database queries for User operations

class User {
  constructor(id, email, name, role, status) {
    this.id = id;
    this.email = email;
    this.name = name;
    this.role = role; // admin, employee, sales_agent
    this.status = status; // active, inactive
    this.createdAt = new Date();
  }

  static async create(userData) {
    // TODO: Insert into database
  }

  static async findById(id) {
    // TODO: Query from database
  }

  static async findByEmail(email) {
    // TODO: Query from database
  }

  static async update(id, userData) {
    // TODO: Update in database
  }

  static async delete(id) {
    // TODO: Delete from database
  }

  static async findByRole(role) {
    // TODO: Query users by role
  }
}

module.exports = User;
