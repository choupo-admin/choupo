/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
File
    src/core/MiniZip.H

Description
    A tiny, dependency-free ZIP writer using the STORED method (no
    compression).  Enough to assemble OpenDocument files (.ods/.odt),
    which are ZIP archives of XML.  No zlib, no libzip --- faithful to
    the project's zero-dependency rule.

    STORED entries are valid ZIP: LibreOffice/Excel open them fine, the
    archive is just larger than a deflated one (irrelevant for the
    small XML payloads of a report).  The ODF spec requires the
    `mimetype` entry to be FIRST and STORED --- since everything here
    is STORED, just add it first.

    Usage:
        MiniZip zip;
        zip.add("mimetype", "application/vnd.oasis.opendocument.spreadsheet");
        zip.add("content.xml", contentXml);
        zip.add("META-INF/manifest.xml", manifestXml);
        zip.save("report.ods");
\*---------------------------------------------------------------------------*/

#pragma once

#include <cstdint>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

class MiniZip
{
public:
    void add(const std::string& name, const std::string& data)
    {
        entries_.push_back({name, data});
    }

    void save(const std::string& path) const
    {
        std::ofstream out(path, std::ios::binary);
        if (!out.is_open())
            throw std::runtime_error("MiniZip: cannot open '" + path
                                     + "' for writing");

        struct Record { std::uint32_t crc; std::uint32_t size;
                        std::uint32_t offset; std::string name; };
        std::vector<Record> records;
        std::uint32_t offset = 0;

        // ---- Local file headers + data ----------------------------------
        for (const auto& e : entries_)
        {
            const std::uint32_t crc  = crc32(e.data);
            const std::uint32_t size = static_cast<std::uint32_t>(e.data.size());
            records.push_back({crc, size, offset, e.name});

            std::string h;
            putU32(h, 0x04034b50);          // local file header signature
            putU16(h, 20);                  // version needed
            putU16(h, 0);                   // flags
            putU16(h, 0);                   // method = 0 (stored)
            putU16(h, 0);                   // mod time
            putU16(h, 0x21);                // mod date (1980-01-01)
            putU32(h, crc);
            putU32(h, size);                // compressed size = size
            putU32(h, size);                // uncompressed size
            putU16(h, static_cast<std::uint16_t>(e.name.size()));
            putU16(h, 0);                   // extra length
            h += e.name;
            out.write(h.data(), static_cast<std::streamsize>(h.size()));
            out.write(e.data.data(), static_cast<std::streamsize>(e.data.size()));
            offset += static_cast<std::uint32_t>(h.size() + e.data.size());
        }

        // ---- Central directory ------------------------------------------
        const std::uint32_t cdStart = offset;
        std::string cd;
        for (const auto& r : records)
        {
            putU32(cd, 0x02014b50);         // central dir signature
            putU16(cd, 20);                 // version made by
            putU16(cd, 20);                 // version needed
            putU16(cd, 0);                  // flags
            putU16(cd, 0);                  // method
            putU16(cd, 0);                  // mod time
            putU16(cd, 0x21);               // mod date
            putU32(cd, r.crc);
            putU32(cd, r.size);
            putU32(cd, r.size);
            putU16(cd, static_cast<std::uint16_t>(r.name.size()));
            putU16(cd, 0);                  // extra len
            putU16(cd, 0);                  // comment len
            putU16(cd, 0);                  // disk number start
            putU16(cd, 0);                  // internal attrs
            putU32(cd, 0);                  // external attrs
            putU32(cd, r.offset);           // local header offset
            cd += r.name;
        }
        out.write(cd.data(), static_cast<std::streamsize>(cd.size()));

        // ---- End of central directory -----------------------------------
        std::string eocd;
        putU32(eocd, 0x06054b50);
        putU16(eocd, 0);                    // disk number
        putU16(eocd, 0);                    // disk with cd
        putU16(eocd, static_cast<std::uint16_t>(records.size()));
        putU16(eocd, static_cast<std::uint16_t>(records.size()));
        putU32(eocd, static_cast<std::uint32_t>(cd.size()));
        putU32(eocd, cdStart);
        putU16(eocd, 0);                    // comment len
        out.write(eocd.data(), static_cast<std::streamsize>(eocd.size()));
    }

private:
    struct Entry { std::string name; std::string data; };
    std::vector<Entry> entries_;

    static void putU16(std::string& s, std::uint16_t v)
    {
        s.push_back(static_cast<char>(v & 0xFF));
        s.push_back(static_cast<char>((v >> 8) & 0xFF));
    }
    static void putU32(std::string& s, std::uint32_t v)
    {
        s.push_back(static_cast<char>(v & 0xFF));
        s.push_back(static_cast<char>((v >> 8) & 0xFF));
        s.push_back(static_cast<char>((v >> 16) & 0xFF));
        s.push_back(static_cast<char>((v >> 24) & 0xFF));
    }

    static std::uint32_t crc32(const std::string& data)
    {
        static std::uint32_t table[256];
        static bool init = false;
        if (!init)
        {
            for (std::uint32_t i = 0; i < 256; ++i)
            {
                std::uint32_t c = i;
                for (int k = 0; k < 8; ++k)
                    c = (c & 1) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
                table[i] = c;
            }
            init = true;
        }
        std::uint32_t c = 0xFFFFFFFFu;
        for (unsigned char ch : data)
            c = table[(c ^ ch) & 0xFF] ^ (c >> 8);
        return c ^ 0xFFFFFFFFu;
    }
};

} // namespace Choupo
