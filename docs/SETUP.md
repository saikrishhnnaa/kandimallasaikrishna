# Development Environment Setup

## Prerequisites

- **Node.js**: v16 or higher
- **PostgreSQL**: v12 or higher
- **Git**: Latest version
- **npm** or **yarn**: Latest version

## Backend Setup

### 1. Clone the Repository

```bash
git clone https://github.com/saikrishhnnaa/kandimallasaikrishna.git
cd kandimallasaikrishna
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` and update the following:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pos_db
DB_USER=your_db_user
DB_PASSWORD=your_secure_password
JWT_SECRET=your_super_secret_key
CORS_ORIGIN=http://localhost:3000
```

### 4. Database Setup

#### Create PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE pos_db;
CREATE USER pos_user WITH PASSWORD 'your_secure_password';
ALTER ROLE pos_user SET client_encoding TO 'utf8';
ALTER ROLE pos_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE pos_user SET default_transaction_deferrable TO on;
GRANT ALL PRIVILEGES ON DATABASE pos_db TO pos_user;
\c pos_db
GRANT SCHEMA public TO pos_user;
```

#### Run Database Schema

```bash
psql -U pos_user -d pos_db -f database/schema.sql
```

#### Seed Sample Data (Optional)

```bash
psql -U pos_user -d pos_db -f database/seed.sql
```

### 5. Start Development Server

```bash
npm run dev
```

Server will be running at `http://localhost:5000`

### 6. Verify Setup

```bash
curl http://localhost:5000/api/health
```

You should get:
```json
{"status": "OK", "timestamp": "2026-05-08T..."}
```

## Frontend Setup

### Coming Soon

- React.js admin dashboard
- Employee portal
- Sales agent interface

## Running Tests

```bash
npm run test          # Run all tests
npm run test:watch   # Run tests in watch mode
```

## Linting

```bash
npm run lint  # Check code style
```

## Database Migrations

```bash
npm run db:migrate  # Run pending migrations
npm run db:seed     # Seed sample data
```

## Troubleshooting

### PostgreSQL Connection Error

- Verify PostgreSQL is running: `psql --version`
- Check credentials in `.env` file
- Ensure database exists: `psql -l`

### Port Already in Use

```bash
# Change PORT in .env or use:
PORT=5001 npm run dev
```

### Module Not Found Errors

```bash
rm -rf node_modules
npm install
```

## Next Steps

- Review [Architecture Guide](./ARCHITECTURE.md)
- Check [API Documentation](./API.md)
- Start implementing features

