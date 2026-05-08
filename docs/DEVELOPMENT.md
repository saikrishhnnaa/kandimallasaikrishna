# Development Guide

## Code Standards

### File Structure

```
src/
├── routes/       # Express route handlers
├── controllers/  # Business logic
├── middleware/   # Express middleware
├── models/       # Database models
├── services/     # Business services
├── utils/        # Utility functions
├── config/       # Configuration files
└── index.js      # Entry point
```

### Naming Conventions

- **Files**: Use kebab-case (e.g., `auth.routes.js`)
- **Classes**: Use PascalCase (e.g., `UserController`)
- **Functions**: Use camelCase (e.g., `getUserById`)
- **Constants**: Use UPPER_SNAKE_CASE (e.g., `MAX_FILE_SIZE`)

### Code Examples

#### Creating a Route Handler

```javascript
const express = require('express');
const router = express.Router();
const { verifyToken, authorize } = require('../middleware/auth.middleware');

// GET endpoint with auth
router.get('/', verifyToken, authorize('admin', 'employee'), (req, res) => {
  // Logic here
});

module.exports = router;
```

#### Creating a Controller

```javascript
class UserController {
  static async getUser(req, res, next) {
    try {
      const { id } = req.params;
      // Business logic
      res.json({ data: user });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = UserController;
```

#### Creating a Service

```javascript
class UserService {
  static async createUser(userData) {
    // Validate data
    // Hash password
    // Save to database
    // Return user (without password)
  }

  static async findUserByEmail(email) {
    // Query database
  }
}

module.exports = UserService;
```

### Data Validation

Use Joi for request validation:

```javascript
const Joi = require('joi');

const userSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().required(),
  role: Joi.string().valid('admin', 'employee', 'sales_agent').required()
});

const { error, value } = userSchema.validate(req.body);
```

## Git Workflow

### Branch Naming

- Feature: `feature/feature-name`
- Bugfix: `bugfix/issue-name`
- Hotfix: `hotfix/issue-name`
- Release: `release/v1.0.0`

### Commit Messages

Follow conventional commits:

```
feat: Add user authentication
fix: Resolve inventory sync issue
docs: Update API documentation
test: Add order creation tests
refactor: Simplify payment processing
```

### Pull Request Process

1. Create feature branch from `main`
2. Make changes and commit regularly
3. Push to remote repository
4. Create pull request with description
5. Request code review
6. Address feedback
7. Merge when approved

## Testing

### Running Tests

```bash
# Run all tests
npm run test

# Run specific test file
npm test -- auth.test.js

# Run with coverage
npm run test -- --coverage

# Watch mode
npm run test:watch
```

### Test Structure

```javascript
describe('User Controller', () => {
  describe('getUser', () => {
    it('should return user by id', async () => {
      // Arrange
      const userId = 1;

      // Act
      const response = await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('id');
    });

    it('should return 404 if user not found', async () => {
      // Test implementation
    });
  });
});
```

## Database Management

### Creating a Migration

```sql
-- migrations/001_create_users_table.sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Running Migrations

```bash
node database/migrations.js
```

## Debugging

### Using Console Logs

```javascript
console.log('Debug info:', variable);
console.error('Error occurred:', error);
```

### Using Node Inspector

```bash
node --inspect src/index.js
# Open chrome://inspect in Chrome
```

## Performance Optimization

1. **Database Indexing**: Add indexes on frequently queried columns
2. **Query Optimization**: Use SELECT specific columns, not *
3. **Caching**: Cache frequently accessed data
4. **Connection Pooling**: Reuse database connections
5. **API Rate Limiting**: Prevent abuse

## Security Best Practices

1. **Input Validation**: Always validate user input
2. **SQL Injection Prevention**: Use parameterized queries
3. **XSS Prevention**: Sanitize output
4. **CSRF Protection**: Implement CSRF tokens
5. **CORS**: Configure properly
6. **Secrets Management**: Use environment variables
7. **HTTPS**: Use in production

## Logging Best Practices

```javascript
const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  error: (message, error) => console.error(`[ERROR] ${message}`, error),
  warn: (message) => console.warn(`[WARN] ${message}`)
};
```

## Documentation

- Update README.md when adding major features
- Add JSDoc comments to functions
- Keep API documentation up to date
- Document complex business logic

## Common Issues & Solutions

### Database Connection Pool Exhausted

**Solution**: Check for unclosed connections, increase pool size

### Slow API Responses

**Solution**: Check database indexes, optimize queries, add caching

### Memory Leaks

**Solution**: Use memory profiler, check for circular references

