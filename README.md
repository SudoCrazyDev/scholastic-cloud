# ScholasticCloud - SaaS Application

A modern SaaS application built with AdonisJS (API) and React (Frontend).

## Project Structure

```
ScholasticCloud/
├── api/                    # AdonisJS API server
├── app/                    # React frontend application
├── shared/                 # Shared types and utilities
├── docs/                   # Documentation
├── scripts/               # Build and deployment scripts
├── docker-compose.yml     # Docker Compose for PostgreSQL
└── README.md              # This file
```

## Tech Stack

### Backend (API)
- **Framework**: AdonisJS 6.x
- **Database**: PostgreSQL
- **Language**: TypeScript
- **ORM**: Lucid ORM

### Frontend (APP)
- **Framework**: React 18.x
- **Build Tool**: Vite
- **Language**: TypeScript
- **State Management**: TanStack Query
- **HTTP Client**: Axios
- **Styling**: TailwindCSS
- **Forms**: Formik

### Shared
- **Types**: Shared TypeScript interfaces and types

### Database
- **PostgreSQL**: 15.x with Docker
- **pgAdmin**: Web-based database management

## Prerequisites

- Node.js 18+
- Docker Desktop
- npm or yarn

## Quick Start

### 1. Start the Database

First, start the PostgreSQL database using Docker:

```bash
# Unix/Linux/macOS
chmod +x scripts/docker-db.sh
./scripts/docker-db.sh start

# Windows PowerShell
.\scripts\docker-db.ps1 start
```

Or start both PostgreSQL and pgAdmin:
```bash
# Unix/Linux/macOS
./scripts/docker-db.sh start-all

# Windows PowerShell
.\scripts\docker-db.ps1 start-all
```

**Database Access:**
- **PostgreSQL**: `localhost:5432`
- **Username**: `scholasticcloud`
- **Password**: `scholasticcloud123`
- **Database**: `scholasticcloud`
- **pgAdmin**: `http://localhost:5050` (admin@scholasticcloud.com / admin123)

### 2. Setup the Application

Run the setup script to install dependencies:

```bash
# Unix/Linux/macOS
chmod +x scripts/setup.sh
./scripts/setup.sh

# Windows PowerShell
.\scripts\setup.ps1
```

### 3. Configure Environment

Copy the environment file and update it with your settings:

```bash
# Copy the environment file
cp api/env api/.env

# Edit the file with your preferred editor
# The default settings should work with the Docker database
```

### 4. Start Development Servers

```bash
# Terminal 1 - Start API server
cd api
npm run dev

# Terminal 2 - Start frontend server
cd app
npm run dev
```

## Development

- **API**: http://localhost:3333
- **APP**: http://localhost:5173
- **Database**: localhost:5432
- **pgAdmin**: http://localhost:5050

## Database Management

### Using Docker Scripts

```bash
# Start database only
./scripts/docker-db.sh start

# Start database and pgAdmin
./scripts/docker-db.sh start-all

# Stop all services
./scripts/docker-db.sh stop

# Restart database
./scripts/docker-db.sh restart

# View logs
./scripts/docker-db.sh logs

# Reset database (delete all data)
./scripts/docker-db.sh reset

# Check status
./scripts/docker-db.sh status
```

### Using Docker Compose Directly

```bash
# Start all services
docker-compose up -d

# Start only PostgreSQL
docker-compose up -d postgres

# Stop all services
docker-compose down

# View logs
docker-compose logs -f

# Reset database
docker-compose down -v
docker-compose up -d postgres
```

## Environment Variables

### API Environment (api/.env)

```env
# Database Configuration
DB_CONNECTION=pg
PG_HOST=localhost
PG_PORT=5432
PG_USER=scholasticcloud
PG_PASSWORD=scholasticcloud123
PG_DB_NAME=scholasticcloud

# App Configuration
NODE_ENV=development
PORT=3333
APP_KEY=your-app-key-here
APP_URL=http://localhost:3333

# Authentication
JWT_SECRET=your-jwt-secret-here
JWT_EXPIRES_IN=24h
```

### Frontend Environment (app/.env)

```env
VITE_API_BASE_URL=http://localhost:3333
VITE_APP_NAME=ScholasticCloud
```

## Docker Services

The `docker-compose.yml` file includes:

- **PostgreSQL 15**: Main database
- **pgAdmin 4**: Database management interface

### Service Details

| Service | Port | Description |
|---------|------|-------------|
| postgres | 5432 | PostgreSQL database |
| pgadmin | 5050 | Web-based database admin |

## Troubleshooting

### Database Connection Issues

1. **Check if Docker is running:**
   ```bash
   docker --version
   docker-compose --version
   ```

2. **Check database status:**
   ```bash
   ./scripts/docker-db.sh status
   ```

3. **View database logs:**
   ```bash
   ./scripts/docker-db.sh logs
   ```

4. **Reset database if needed:**
   ```bash
   ./scripts/docker-db.sh reset
   ```

### Port Conflicts

If ports 5432 or 5050 are already in use:

1. **Stop existing services:**
   ```bash
   # Stop PostgreSQL service (if running locally)
   sudo systemctl stop postgresql
   
   # Or find and kill processes using the ports
   lsof -ti:5432 | xargs kill -9
   lsof -ti:5050 | xargs kill -9
   ```

2. **Or modify docker-compose.yml to use different ports**

## Contributing

Please read the contributing guidelines before submitting pull requests.

## License

This project is licensed under the MIT License.
