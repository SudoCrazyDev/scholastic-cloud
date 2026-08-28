<?php

namespace App\Support;

/**
 * Writes a ZIP straight to a file, one entry at a time (STORE method — no
 * compression).
 *
 * The sibling {@see ZipBuilder} accumulates the whole archive in a string, which
 * is right for the few-KB installer bundle it serves. A gate seed snapshot is
 * 3,000+ JPEGs — around 90 MB, and roughly double that at the moment
 * `ZipBuilder::build()` concatenates — so it would sit at the edge of, or past,
 * a typical `memory_limit`. Here only one entry is in memory at a time.
 *
 * Same deliberate constraint as ZipBuilder: no `ext-zip`, because it is not
 * guaranteed on shared hosting. STORE costs nothing here anyway — JPEGs are
 * already compressed.
 */
class ZipStreamWriter
{
    /** @var resource */
    private $handle;

    /** @var array<int,array{name:string,crc:int,size:int,offset:int}> */
    private array $entries = [];

    private int $offset = 0;

    private bool $closed = false;

    public function __construct(private string $path)
    {
        $handle = @fopen($path, 'wb');

        if ($handle === false) {
            throw new \RuntimeException("Cannot open {$path} for writing");
        }

        $this->handle = $handle;
    }

    public function addFile(string $name, string $data): void
    {
        if ($this->closed) {
            throw new \LogicException('Archive is already closed');
        }

        $name = str_replace('\\', '/', $name);
        $crc = crc32($data);
        $size = strlen($data);

        // Local file header (0x04034b50)
        $header = "PK\x03\x04";
        $header .= pack('v', 20);    // version needed to extract
        $header .= pack('v', 0);     // general purpose flags
        $header .= pack('v', 0);     // compression method: 0 = store
        $header .= pack('v', 0);     // mod time
        $header .= pack('v', 0x21);  // mod date = 1980-01-01
        $header .= pack('V', $crc);
        $header .= pack('V', $size); // compressed size
        $header .= pack('V', $size); // uncompressed size
        $header .= pack('v', strlen($name));
        $header .= pack('v', 0);     // extra field length
        $header .= $name;

        $this->entries[] = ['name' => $name, 'crc' => $crc, 'size' => $size, 'offset' => $this->offset];

        $this->write($header);
        $this->write($data);
    }

    /**
     * Write the central directory and close the file. Returns the byte size of
     * the finished archive.
     */
    public function close(): int
    {
        if ($this->closed) {
            return $this->offset;
        }

        $central = '';
        foreach ($this->entries as $entry) {
            // Central directory header (0x02014b50)
            $central .= "PK\x01\x02";
            $central .= pack('v', 20);   // version made by
            $central .= pack('v', 20);   // version needed
            $central .= pack('v', 0);    // flags
            $central .= pack('v', 0);    // method: store
            $central .= pack('v', 0);    // mod time
            $central .= pack('v', 0x21); // mod date
            $central .= pack('V', $entry['crc']);
            $central .= pack('V', $entry['size']);
            $central .= pack('V', $entry['size']);
            $central .= pack('v', strlen($entry['name']));
            $central .= pack('v', 0);    // extra length
            $central .= pack('v', 0);    // comment length
            $central .= pack('v', 0);    // disk number start
            $central .= pack('v', 0);    // internal attributes
            $central .= pack('V', 0);    // external attributes
            $central .= pack('V', $entry['offset']);
            $central .= $entry['name'];
        }

        $centralOffset = $this->offset;
        $count = count($this->entries);

        // End of central directory (0x06054b50)
        $eocd = "PK\x05\x06";
        $eocd .= pack('v', 0);              // this disk number
        $eocd .= pack('v', 0);              // disk with central directory
        $eocd .= pack('v', $count);         // entries on this disk
        $eocd .= pack('v', $count);         // total entries
        $eocd .= pack('V', strlen($central));
        $eocd .= pack('V', $centralOffset);
        $eocd .= pack('v', 0);              // comment length

        $this->write($central);
        $this->write($eocd);

        fclose($this->handle);
        $this->closed = true;

        return $this->offset;
    }

    public function path(): string
    {
        return $this->path;
    }

    private function write(string $bytes): void
    {
        $written = fwrite($this->handle, $bytes);

        if ($written === false || $written !== strlen($bytes)) {
            throw new \RuntimeException("Short write to {$this->path} — is the disk full?");
        }

        $this->offset += $written;
    }
}
