-- Sample data for development and testing

-- Sample Users
INSERT INTO users (email, password_hash, name, role, status, phone, department)
VALUES
  ('admin@kandimalla.com', 'hashed_password_here', 'Admin User', 'admin', 'active', '9876543210', 'Management'),
  ('emp1@kandimalla.com', 'hashed_password_here', 'John Employee', 'employee', 'active', '9876543211', 'Sales'),
  ('agent1@kandimalla.com', 'hashed_password_here', 'Agent Smith', 'sales_agent', 'active', '9876543212', 'Field Sales'),
  ('agent2@kandimalla.com', 'hashed_password_here', 'Agent Johnson', 'sales_agent', 'active', '9876543213', 'Field Sales');

-- Sample Customers
INSERT INTO customers (name, email, phone, address, city, state, postal_code, customer_type)
VALUES
  ('ABC Trading Co', 'contact@abctrading.com', '9000000001', '123 Main St', 'Mumbai', 'Maharashtra', '400001', 'wholesale'),
  ('XYZ Retail Store', 'shop@xyzretail.com', '9000000002', '456 Market St', 'Bangalore', 'Karnataka', '560001', 'retail'),
  ('Super Distributors', 'sales@superdist.com', '9000000003', '789 Trade St', 'Delhi', 'Delhi', '110001', 'distributor');

-- Sample Products
INSERT INTO products (name, sku, category, description, price, cost_price, stock_quantity, min_stock_level, max_stock_level, unit_of_measurement)
VALUES
  ('Premium Widget A', 'SKU001', 'Electronics', 'High quality widget', 500.00, 300.00, 100, 10, 500, 'piece'),
  ('Standard Widget B', 'SKU002', 'Electronics', 'Standard quality widget', 350.00, 200.00, 150, 10, 500, 'piece'),
  ('Deluxe Widget C', 'SKU003', 'Electronics', 'Luxury widget with features', 800.00, 500.00, 50, 5, 200, 'piece'),
  ('Bulk Material X', 'SKU004', 'Materials', 'Raw material in bulk', 100.00, 60.00, 1000, 100, 5000, 'kg'),
  ('Supply Kit Y', 'SKU005', 'Supplies', 'Complete supply kit', 250.00, 150.00, 75, 10, 300, 'box');
