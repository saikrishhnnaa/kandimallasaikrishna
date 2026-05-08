# Test Coverage & Documentation

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage report
```bash
npm test -- --coverage
```

### Run specific test file
```bash
npm test -- auth.controller.test.js
```

### Run tests matching pattern
```bash
npm test -- --testNamePattern="should register"
```

## Test Structure

```
tests/
├── setup.js                          # Global test setup
├── mocks/
│   └── database.mock.js             # Database mocks
├── unit/
│   ├── controllers/                 # Controller unit tests
│   │   ├── auth.controller.test.js
│   │   ├── user.controller.test.js
│   │   ├── inventory.controller.test.js
│   │   ├── order.controller.test.js
│   │   └── analytics.controller.test.js
│   ├── middleware/
│   │   └── auth.middleware.test.js
│   └── utils/
│       ├── jwt.test.js
│       └── password.test.js
└── integration/
    ├── auth.routes.test.js
    ├── inventory.routes.test.js
    └── order.routes.test.js
```

## Test Coverage Summary

### Controllers (5 controllers)
- **AuthController**: 4 test suites, 11 tests
  - ✅ User registration
  - ✅ User login
  - ✅ User logout
  - ✅ Error handling

- **UserController**: 5 test suites, 11 tests
  - ✅ Get all users with pagination
  - ✅ Get user by ID
  - ✅ Create user
  - ✅ Update user
  - ✅ Delete user

- **InventoryController**: 5 test suites, 12 tests
  - ✅ List products with filters
  - ✅ Get product by ID
  - ✅ Create product
  - ✅ Update product
  - ✅ Stock adjustment

- **OrderController**: 5 test suites, 8 tests
  - ✅ List orders (role-based)
  - ✅ Get order with items
  - ✅ Create order with inventory sync
  - ✅ Update order status
  - ✅ Process payment

- **AnalyticsController**: Covered in integration tests

### Middleware
- **AuthMiddleware**: 3 test suites, 6 tests
  - ✅ Token verification
  - ✅ Role authorization
  - ✅ Error handling

### Utilities
- **JWT Utils**: 3 test suites, 6 tests
  - ✅ Token generation
  - ✅ Token verification
  - ✅ Token decoding

- **Password Utils**: 2 test suites, 5 tests
  - ✅ Password hashing
  - ✅ Password verification

### Integration Tests
- **Auth Routes**: 3 test cases
  - ✅ Register endpoint
  - ✅ Login endpoint
  - ✅ Logout endpoint

- **Inventory Routes**: 3 test cases
  - ✅ GET /api/inventory
  - ✅ POST /api/inventory
  - ✅ POST /api/inventory/:id/stock-adjustment

- **Order Routes**: 3 test cases
  - ✅ GET /api/orders
  - ✅ POST /api/orders
  - ✅ POST /api/orders/:id/payment

## Test Examples

### Example 1: Testing User Registration
```bash
npm test -- auth.controller.test.js --testNamePattern="should register"
```

### Example 2: Testing with Coverage
```bash
npm test -- --coverage --collectCoverageFrom="src/controllers/**/*.js"
```

### Example 3: Running All Integration Tests
```bash
npm test -- tests/integration/
```

## Key Testing Patterns

### 1. Mocking Database Calls
```javascript
mockClient.query.mockResolvedValueOnce({ rows: [...] });
```

### 2. Testing Authorization
```javascript
it('should return 403 for unauthorized role', async () => {
  const response = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${salesAgentToken}`)
    .send(userData);
  expect(response.status).toBe(403);
});
```

### 3. Testing Error Handling
```javascript
it('should handle database errors', async () => {
  mockClient.query.mockRejectedValueOnce(new Error('DB Error'));
  await controller.method(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.any(Error));
});
```

## Coverage Goals

- Controllers: **90%+ coverage**
- Middleware: **95%+ coverage**
- Utils: **95%+ coverage**
- Integration: **80%+ endpoint coverage**

## Continuous Integration

Tests should be run on every commit:
- Unit tests must pass
- Coverage threshold: 80%
- Integration tests for critical paths

## Debugging Tests

### Run single test with debugging
```bash
node --inspect-brk ./node_modules/.bin/jest --runInBand auth.controller.test.js
```

### View detailed error logs
```bash
DEBUG=* npm test
```

## Best Practices

1. **Test behavior, not implementation**: Focus on what the function does, not how it does it
2. **Use meaningful test names**: Describe what is being tested and expected
3. **Keep tests isolated**: Each test should be independent
4. **Mock external dependencies**: Database, APIs, file systems
5. **Test both success and failure cases**: Happy path and error scenarios
6. **Maintain test data**: Use realistic test data
7. **Clean up after tests**: Reset mocks and state

