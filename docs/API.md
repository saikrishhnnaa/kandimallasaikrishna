# API Documentation

## Base URL

```
http://localhost:5000/api
```

## Authentication

All endpoints (except login/register) require JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

## Error Response Format

```json
{
  "error": "Error message",
  "status": 400
}
```

## Endpoints

### Authentication

#### Register User

```
POST /auth/register
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secure_password",
  "name": "John Doe",
  "role": "sales_agent"
}
```

**Response (201):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "role": "sales_agent",
  "token": "jwt_token_here"
}
```

#### Login

```
POST /auth/login
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response (200):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "role": "sales_agent",
  "token": "jwt_token_here"
}
```

### Users Management

#### List Users (Admin Only)

```
GET /users
```

**Query Parameters:**
- `role`: Filter by role (admin, employee, sales_agent)
- `status`: Filter by status (active, inactive)
- `search`: Search by name or email
- `page`: Pagination page number
- `limit`: Items per page

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "email": "user@example.com",
      "name": "John Doe",
      "role": "sales_agent",
      "status": "active"
    }
  ],
  "total": 10,
  "page": 1
}
```

#### Get User Details

```
GET /users/:id
```

#### Create User (Admin Only)

```
POST /users
```

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "secure_password",
  "name": "New User",
  "role": "employee",
  "phone": "9876543210",
  "department": "Sales"
}
```

#### Update User

```
PUT /users/:id
```

#### Delete User (Admin Only)

```
DELETE /users/:id
```

### Inventory Management

#### List Products

```
GET /inventory
```

**Query Parameters:**
- `category`: Filter by category
- `status`: Filter by status
- `low_stock`: Show only low stock items
- `search`: Search by name or SKU

#### Get Product Details

```
GET /inventory/:id
```

#### Create Product

```
POST /inventory
```

**Request:**
```json
{
  "name": "Product Name",
  "sku": "SKU123",
  "category": "Electronics",
  "price": 500.00,
  "cost_price": 300.00,
  "stock_quantity": 100,
  "min_stock_level": 10,
  "unit_of_measurement": "piece"
}
```

#### Update Product

```
PUT /inventory/:id
```

#### Adjust Stock

```
POST /inventory/:id/stock-adjustment
```

**Request:**
```json
{
  "quantity": 50,
  "type": "purchase",
  "notes": "Stock received from supplier"
}
```

### Orders Management

#### List Orders

```
GET /orders
```

**Query Parameters:**
- `status`: Filter by order status
- `agent_id`: Filter by agent
- `start_date`: Filter by date range start
- `end_date`: Filter by date range end

#### Get Order Details

```
GET /orders/:id
```

#### Create Order

```
POST /orders
```

**Request:**
```json
{
  "customer_id": 1,
  "items": [
    {
      "product_id": 1,
      "quantity": 5,
      "unit_price": 500.00
    }
  ],
  "discount_amount": 0,
  "payment_method": "cash"
}
```

#### Update Order Status

```
PUT /orders/:id
```

**Request:**
```json
{
  "status": "completed"
}
```

#### Process Payment

```
POST /orders/:id/payment
```

**Request:**
```json
{
  "payment_amount": 2500.00,
  "payment_method": "card",
  "payment_reference": "TXN123456"
}
```

### Analytics

#### Dashboard Metrics

```
GET /analytics/dashboard
```

**Response (200):**
```json
{
  "total_sales": 250000,
  "total_orders": 150,
  "total_revenue": 245000,
  "average_order_value": 1633.33,
  "top_products": [...],
  "sales_by_agent": [...]
}
```

#### Sales Analytics

```
GET /analytics/sales?start_date=2026-01-01&end_date=2026-05-08
```

#### Inventory Analytics

```
GET /analytics/inventory
```

#### Commission Tracking

```
GET /analytics/commission?period=2026-05
```

## Response Codes

- `200 OK`: Successful request
- `201 Created`: Resource created
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Missing/invalid authentication
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

