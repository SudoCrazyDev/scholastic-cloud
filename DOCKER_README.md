# Docker Development Setup

This project uses Docker Compose to run the entire development environment with hot reloading.

## Services

- **MySQL Database** (Port 3306) - Database for Laravel API
- **Laravel API** (Port 8000) - Backend API service
- **React App** (Port 5173) - Frontend application with Vite

## Quick Start

1. **Start all services:**
   ```bash
   docker-compose up -d
   ```

2. **View logs:**
   ```bash
   # All services
   docker-compose logs -f
   
   # Specific service
   docker-compose logs -f api
   docker-compose logs -f app
   docker-compose logs -f mysql
   ```

3. **Stop all services:**
   ```bash
   docker-compose down
   ```

4. **Rebuild services (after Dockerfile changes):**
   ```bash
   docker-compose up -d --build
   ```

## Development Workflow

### Hot Reloading
- **React App**: Any changes in the `app/` folder will automatically reload the development server
- **Laravel API**: Any changes in the `api/` folder will automatically reload the PHP server

### Database
- MySQL data is persisted in a Docker volume
- Database credentials:
  - Database: `schoolmate`
  - Username: `schoolmate_user`
  - Password: `schoolmate_password`
  - Root Password: `rootpassword`

### API Endpoints
- Laravel API is available at: `http://localhost:8000`
- API documentation: `http://localhost:8000/api/documentation` (if available)

### Frontend
- React app is available at: `http://localhost:5173`
- Vite dev server with hot module replacement

## Environment Variables

### Laravel API (.env)
```env
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=schoolmate
DB_USERNAME=schoolmate_user
DB_PASSWORD=schoolmate_password
APP_ENV=local
APP_DEBUG=true
```

### React App (.env)
```env
VITE_API_URL=http://localhost:8000
NODE_ENV=development
```

## Useful Commands

### Laravel API
```bash
# Run migrations
docker-compose exec api php artisan migrate

# Run seeders
docker-compose exec api php artisan db:seed

# Clear cache
docker-compose exec api php artisan cache:clear

# Generate app key
docker-compose exec api php artisan key:generate
```

### React App
```bash
# Install dependencies
docker-compose exec app npm install

# Build for production
docker-compose exec app npm run build
```

### Database
```bash
# Access MySQL shell
docker-compose exec mysql mysql -u schoolmate_user -p schoolmate

# Backup database
docker-compose exec mysql mysqldump -u schoolmate_user -p schoolmate > backup.sql
```

## Troubleshooting

### Port Conflicts
If you get port conflicts, you can modify the ports in `docker-compose.yml`:
- MySQL: Change `3306:3306` to `3307:3306`
- API: Change `8000:8000` to `8001:8000`
- App: Change `5173:5173` to `5174:5173`

### Permission Issues
If you encounter permission issues:
```bash
# Fix Laravel storage permissions
docker-compose exec api chmod -R 775 storage bootstrap/cache
```

### Database Connection Issues
If the API can't connect to MySQL:
1. Ensure MySQL container is running: `docker-compose ps`
2. Check MySQL logs: `docker-compose logs mysql`
3. Wait a few seconds for MySQL to fully start before starting the API

## Production

For production deployment, you should:
1. Use production-optimized Dockerfiles
2. Set appropriate environment variables
3. Use a production web server (nginx/apache) instead of Laravel's built-in server
4. Configure proper SSL certificates
5. Use a managed database service instead of containerized MySQL 