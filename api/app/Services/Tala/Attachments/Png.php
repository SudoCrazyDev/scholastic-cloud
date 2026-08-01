<?php

namespace App\Services\Tala\Attachments;

/**
 * Writing a PNG by hand, because there is no GD or Imagick on these servers.
 *
 * Some PDFs store a page as an uncompressed bitmap rather than an embedded
 * JPEG. Those pixels are readable but not sendable: no provider accepts a bare
 * pixel array, so it has to be wrapped in a real image format first. PNG is the
 * one that can be written with nothing but zlib and crc32, both of which are
 * present.
 *
 * The format is small enough to state in full: an 8-byte signature, then
 * length-type-data-CRC chunks. IHDR describes the raster, IDAT holds the
 * scanlines zlib-deflated with a filter byte prepended to each, IEND ends it.
 * No interlacing, no palette, no ancillary chunks.
 */
class Png
{
    /** Truecolour, 8 bits per sample. */
    private const COLOR_RGB = 2;

    /** Greyscale, 8 bits per sample. */
    private const COLOR_GRAY = 0;

    /**
     * Wrap raw 8-bit pixels as a PNG.
     *
     * @param  string  $pixels  Exactly $width * $height * $components bytes, top row first.
     * @param  int  $components  3 for RGB, 1 for greyscale.
     * @return string|null Null when the input does not match the dimensions claimed,
     *                     which means the bytes are not what they were said to be —
     *                     better to skip the page than to send a garbled image.
     */
    public static function fromPixels(string $pixels, int $width, int $height, int $components): ?string
    {
        if ($width < 1 || $height < 1 || ! in_array($components, [1, 3], true)) {
            return null;
        }

        $stride = $width * $components;

        if (strlen($pixels) !== $stride * $height) {
            return null;
        }

        $raster = '';

        for ($row = 0; $row < $height; $row++) {
            // Filter type 0 (None) per scanline. Filtering only buys
            // compression, and these are one-shot images.
            $raster .= "\x00".substr($pixels, $row * $stride, $stride);
        }

        $header = pack(
            'NNCCCCC',
            $width,
            $height,
            8,
            $components === 3 ? self::COLOR_RGB : self::COLOR_GRAY,
            0, // deflate
            0, // no filtering
            0, // no interlacing
        );

        return "\x89PNG\r\n\x1a\n"
            .self::chunk('IHDR', $header)
            .self::chunk('IDAT', gzcompress($raster, 6))
            .self::chunk('IEND', '');
    }

    private static function chunk(string $type, string $data): string
    {
        return pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));
    }
}
