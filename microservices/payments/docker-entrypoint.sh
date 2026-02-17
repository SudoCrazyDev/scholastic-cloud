#!/bin/bash
set -e

if [ ! -f vendor/autoload.php ]; then
  echo "vendor/ missing or incomplete, running composer install..."
  composer install --no-dev --optimize-autoloader --no-interaction
fi

chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache 2>/dev/null || true
chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache 2>/dev/null || true

exec gosu www-data "$@"
