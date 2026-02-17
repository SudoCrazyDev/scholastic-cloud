#!/bin/bash
set -e

# When the app is mounted (e.g. .:/var/www/html), vendor/ may be missing.
# Install dependencies and fix permissions so the app can run.
if [ ! -f vendor/autoload.php ]; then
  echo "vendor/ missing or incomplete, running composer install..."
  composer install --no-dev --optimize-autoloader --no-interaction
fi

chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache 2>/dev/null || true
chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache 2>/dev/null || true

exec gosu www-data "$@"
