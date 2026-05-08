# Kandimalla Saikrishna POS System

A comprehensive Point of Sale (POS) software for trading and distribution companies with specialized interfaces for:
- **Admin Dashboard** - System management, analytics, and reporting
- **In-House Employees** - Inventory and order management
- **Onsite Sales Agents** - Mobile-first field operations and billing

## Project Overview

This is a full-stack application built with:
- **Frontend**: React.js with TypeScript
- **Backend**: Node.js/Express
- **Database**: PostgreSQL
- **Mobile**: React Native (optional)

## Directory Structure

```
kandimallasaikrishna/
├── frontend/                 # Web application
│   ├── admin/               # Admin dashboard
│   ├── employee/            # Employee portal
│   ├── agent/               # Sales agent interface
│   └── shared/              # Shared components
├── backend/                 # REST API server
│   ├── src/
│   │   ├── routes/          # API endpoints
│   │   ├── controllers/     # Business logic
│   │   ├── middleware/      # Auth & validation
│   │   ├── models/          # Database models
│   │   ├── services/        # Business services
│   │   └── config/          # Configuration
│   └── tests/               # Unit & integration tests
├── mobile/                  # React Native mobile app
├── database/                # Database migrations & schema
├── docs/                    # Project documentation
├── .github/                 # GitHub workflows & templates
└── docker-compose.yml       # Docker setup (optional)
```

## Getting Started

See [SETUP.md](./docs/SETUP.md) for development environment setup.

## Documentation

- [Architecture Guide](./docs/ARCHITECTURE.md)
- [API Documentation](./docs/API.md)
- [Database Schema](./database/schema.sql)
- [Development Guide](./docs/DEVELOPMENT.md)

## Features

### Admin Dashboard
- User & employee management
- Inventory tracking & management
- Sales analytics & KPI reports
- Pricing & discount policies
- Commission tracking

### Employee Portal
- Real-time inventory visibility
- Purchase order management
- Customer database
- Payment processing
- Daily sales reports

### Sales Agent Mobile App
- Offline-capable interface
- Quick billing & invoicing
- GPS location tracking
- Customer management
- Multiple payment methods

## Development

```bash
# Install dependencies
npm install

# Run development servers
npm run dev

# Run tests
npm run test
```

## License

Proprietary - Kandimalla Saikrishna Trading & Distribution

## Contact

For questions or issues, contact the development team.
