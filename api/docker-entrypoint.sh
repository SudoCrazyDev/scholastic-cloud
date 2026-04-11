#!/bin/bash
set -e

# Wait for the database to be ready before starting the app.
if [ -n "$DB_HOST" ] && [ -n "$DB_PORT" ]; then
  echo "Waiting for database at $DB_HOST:$DB_PORT..."
  until php -r "new PDO('mysql:host=$DB_HOST;port=$DB_PORT', '${DB_USERNAME:-root}', '${DB_PASSWORD:-}');" 2>/dev/null; do
    echo "Database not ready yet, retrying in 2s..."
    sleep 2
  done
  echo "Database is ready."
fi

# When the app is mounted (e.g. .:/var/www/html), vendor/ may be missing.
# Install dependencies and fix permissions so the app can run.
if [ ! -f vendor/autoload.php ]; then
  echo "vendor/ missing or incomplete, running composer install..."
  composer install --no-dev --optimize-autoloader --no-interaction
fi

chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache 2>/dev/null || true
chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache 2>/dev/null || true

# Cache the config using the Docker environment variables (CLI has full env access,
# but the php artisan serve subprocess does not inherit Docker env vars, so we bake
# them into a compiled config.php that all HTTP workers will use instead of .env).
echo "Caching Laravel config with Docker environment..."
php artisan config:cache

exec gosu www-data "$@"
