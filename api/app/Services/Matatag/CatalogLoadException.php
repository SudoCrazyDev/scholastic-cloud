<?php

namespace App\Services\Matatag;

use RuntimeException;

/**
 * A catalog file was refused, and nothing was written.
 *
 * Every throw from CatalogLoader happens inside its transaction, so the
 * database is exactly as it was before the load began. The message is written
 * to be read by whoever is running a DepEd update at the time - it should say
 * what is wrong with the file or the state, not what the code was doing.
 */
class CatalogLoadException extends RuntimeException {}
