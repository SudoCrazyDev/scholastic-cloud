<?php

namespace App\Support;

/**
 * Minimal, dependency-free ZIP writer (STORE method — no compression). Avoids the
 * ext-zip requirement so the installer download works on any host, including shared
 * hosting where ZipArchive may be unavailable. Suitable for small text bundles.
 */
class ZipBuilder
{
    /** @var array<int,array{name:string,crc:int,size:int,offset:int}> */
    private array $entries = [];

    private string $buffer = '';

    public function addFile(string $name, string $data): void
    {
        $name = str_replace('\\', '/', $name);
        $crc = crc32($data);
        $size = strlen($data);
        $offset = strlen($this->buffer);

        // Local file header (0x04034b50)
        $this->buffer .= "PK\x03\x04";
        $this->buffer .= pack('v', 20);    // version needed to extract
        $this->buffer .= pack('v', 0);     // general purpose flags
        $this->buffer .= pack('v', 0);     // compression method: 0 = store
        $this->buffer .= pack('v', 0);     // mod time
        $this->buffer .= pack('v', 0x21);  // mod date = 1980-01-01
        $this->buffer .= pack('V', $crc);
        $this->buffer .= pack('V', $size); // compressed size
        $this->buffer .= pack('V', $size); // uncompressed size
        $this->buffer .= pack('v', strlen($name));
        $this->buffer .= pack('v', 0);     // extra field length
        $this->buffer .= $name;
        $this->buffer .= $data;

        $this->entries[] = compact('name', 'crc', 'size', 'offset');
    }

    public function build(): string
    {
        $central = '';
        foreach ($this->entries as $e) {
            // Central directory header (0x02014b50)
            $central .= "PK\x01\x02";
            $central .= pack('v', 20);   // version made by
            $central .= pack('v', 20);   // version needed
            $central .= pack('v', 0);    // flags
            $central .= pack('v', 0);    // method: store
            $central .= pack('v', 0);    // mod time
            $central .= pack('v', 0x21); // mod date
            $central .= pack('V', $e['crc']);
            $central .= pack('V', $e['size']);
            $central .= pack('V', $e['size']);
            $central .= pack('v', strlen($e['name']));
            $central .= pack('v', 0);    // extra length
            $central .= pack('v', 0);    // comment length
            $central .= pack('v', 0);    // disk number start
            $central .= pack('v', 0);    // internal attributes
            $central .= pack('V', 0);    // external attributes
            $central .= pack('V', $e['offset']);
            $central .= $e['name'];
        }

        $centralOffset = strlen($this->buffer);
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

        return $this->buffer.$central.$eocd;
    }
}
