# POS System Architecture

## Overview

The Kandimalla Saikrishna POS System is built on a modern three-tier architecture:

```
┌─────────────────────────────────────────────────────────┐
│         Presentation Layer (Frontend)                   │
│  ┌──────────────┬──────────────┬──────────────────┐    │
│  │   Admin      │   Employee   │   Sales Agent    │    │
│  │  Dashboard   │    Portal    │    Mobile App    │    │
│  └──────────────┴──────────────┴──────────────────┘    │
└──────────────────────────────────────────────────────────┘
                          ↕ (REST API)
┌──────────────────────────────────────────────────────────┐
│         Application Layer (Node.js/Express)             │
│  ┌──────────────┬──────────────┬──────────────────┐    │
│  │   Routes     │  Controllers │   Middleware     │    │
│  │   /auth      │   /inventory │  (Auth, Validate)│    │
│  │   /users     │   /orders    │  (CORS, Helmet)  │    │
│  │   /orders    │   /analytics │                  │    │
│  └──────────────┴──────────────┴──────────────────┘    │
└──────────────────────────────────────────────────────────┘
                          ↕ (SQL)
┌──────────────────────────────────────────────────────────┐
│         Data Layer (PostgreSQL)                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  • users      • customers   • products           │   │
│  │  • orders     • payments    • commissions        │   │
│  │  • inventory  • activity_logs                    │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Authentication & Authorization

- **JWT-based authentication** for stateless API communication
- **Role-based access control (RBAC)** with three roles:
  - `admin`: Full system access
  - `employee`: Inventory and order management
  - `sales_agent`: Field operations and billing

### 2. API Endpoints Structure

```
GET    /api/auth/login              - User authentication
GET    /api/users                   - List users (Admin)
GET    /api/inventory               - List products
GET    /api/orders                  - List orders (role-based)
POST   /api/orders                  - Create new order
GET    /api/analytics/dashboard     - Dashboard metrics
```

### 3. Database Schema

**Key Tables:**

- **users**: User accounts with roles and permissions
- **customers**: Customer database with credit limits
- **products**: Inventory with pricing and stock levels
- **orders**: Sales orders with status tracking
- **order_items**: Line items in orders
- **payments**: Payment tracking
- **commissions**: Agent commission calculations
- **inventory_transactions**: Stock movement logs
- **activity_logs**: User action audit trail

### 4. Security

- **Password hashing**: bcryptjs
- **JWT tokens**: Secure API authentication
- **CORS**: Cross-origin resource sharing
- **Helmet**: HTTP security headers
- **Input validation**: Joi schema validation

### 5. Error Handling

- Centralized error middleware
- HTTP status codes
- Descriptive error messages
- Request/Response logging

## Data Flow Example: Creating an Order

```
1. Sales Agent App
   └─→ POST /api/orders {customerId, items, paymentMethod}

2. Auth Middleware
   └─→ Verify JWT token, Check role (sales_agent)

3. Order Controller
   └─→ Validate request data using Joi

4. Order Service
   ├─→ Check inventory availability
   ├─→ Calculate pricing and discounts
   └─→ Create order in database

5. Database Transaction
   ├─→ Insert order
   ├─→ Insert order items
   ├─→ Update inventory stock
   ├─→ Log activity
   └─→ Calculate commissions

6. Response
   └─→ Return order details with ID and status
```

## Scalability Considerations

1. **Database Connection Pooling**: For high-concurrency environments
2. **Caching Layer**: Redis for frequently accessed data
3. **Message Queue**: For async operations (emails, reports)
4. **Load Balancing**: Horizontal scaling with PM2 or Kubernetes
5. **API Rate Limiting**: Prevent abuse

## Development Workflow

1. **Feature Branch**: `git checkout -b feature/feature-name`
2. **Implementation**: Write code following conventions
3. **Testing**: Add unit and integration tests
4. **Code Review**: Submit PR for review
5. **Deployment**: Merge and deploy to staging/production

## Technology Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | React.js, TypeScript, Redux/Context |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Authentication | JWT, bcryptjs |
| Validation | Joi, Helmet |
| Testing | Jest, Supertest |
| Deployment | Docker, PM2, CI/CD |

