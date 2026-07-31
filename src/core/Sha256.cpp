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
    This file is part of Choupo.  See Sha256.H for the full notice.

    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "core/Sha256.H"

#include <array>
#include <cstdint>
#include <fstream>
#include <sstream>
#include <vector>

namespace Choupo {
namespace sha256 {

namespace {

//  FIPS 180-4 sec.4.2.2: the first 32 bits of the fractional parts of the cube
//  roots of the first 64 primes.
const std::uint32_t K[64] = {
    0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,
    0x923f82a4u,0xab1c5ed5u,0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,
    0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,0xe49b69c1u,0xefbe4786u,
    0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
    0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,
    0x06ca6351u,0x14292967u,0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,
    0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,0xa2bfe8a1u,0xa81a664bu,
    0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
    0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cb3u,0x4ed8aa4au,
    0x5b9cca4fu,0x682e6ff3u,0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,
    0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u };

inline std::uint32_t rotr(std::uint32_t x, int n)
{ return (x >> n) | (x << (32 - n)); }

void compress(std::array<std::uint32_t, 8>& h, const unsigned char* p)
{
    std::uint32_t w[64];
    for (int i = 0; i < 16; ++i)
        w[i] = (std::uint32_t(p[4*i]) << 24) | (std::uint32_t(p[4*i+1]) << 16)
             | (std::uint32_t(p[4*i+2]) << 8) | std::uint32_t(p[4*i+3]);
    for (int i = 16; i < 64; ++i)
    {
        const std::uint32_t s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >> 3);
        const std::uint32_t s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19)  ^ (w[i-2] >> 10);
        w[i] = w[i-16] + s0 + w[i-7] + s1;
    }
    std::uint32_t a = h[0], b = h[1], c = h[2], d = h[3];
    std::uint32_t e = h[4], f = h[5], g = h[6], hh = h[7];
    for (int i = 0; i < 64; ++i)
    {
        const std::uint32_t S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        const std::uint32_t ch = (e & f) ^ (~e & g);
        const std::uint32_t t1 = hh + S1 + ch + K[i] + w[i];
        const std::uint32_t S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        const std::uint32_t mj = (a & b) ^ (a & c) ^ (b & c);
        const std::uint32_t t2 = S0 + mj;
        hh = g; g = f; f = e; e = d + t1;
        d = c; c = b; b = a; a = t1 + t2;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d;
    h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
}

} // anonymous namespace

std::string hex(const std::string& data)
{
    //  FIPS 180-4 sec.5.3.3: the initial hash, the first 32 bits of the
    //  fractional parts of the square roots of the first eight primes.
    std::array<std::uint32_t, 8> h = {
        0x6a09e667u,0xbb67ae85u,0x3c6ef372u,0xa54ff53au,
        0x510e527fu,0x9b05688cu,0x1f83d9abu,0x5be0cd19u };

    const unsigned char* p =
        reinterpret_cast<const unsigned char*>(data.data());
    const std::size_t n = data.size();
    std::size_t i = 0;
    for (; i + 64 <= n; i += 64) compress(h, p + i);

    //  The tail: the remaining bytes, 0x80, zero padding to 56 mod 64, then
    //  the message length in BITS as a big-endian 64-bit integer.
    std::vector<unsigned char> tail(p + i, p + n);
    tail.push_back(0x80);
    while (tail.size() % 64 != 56) tail.push_back(0x00);
    const std::uint64_t bits = std::uint64_t(n) * 8u;
    for (int s = 56; s >= 0; s -= 8)
        tail.push_back(static_cast<unsigned char>((bits >> s) & 0xffu));
    for (std::size_t k = 0; k < tail.size(); k += 64) compress(h, tail.data() + k);

    std::ostringstream os;
    static const char* d = "0123456789abcdef";
    for (std::uint32_t v : h)
        for (int s = 28; s >= 0; s -= 4) os << d[(v >> s) & 0xfu];
    return os.str();
}

std::string hexFile(const std::string& path)
{
    std::ifstream f(path, std::ios::binary);
    if (!f) return {};
    std::ostringstream buf;
    buf << f.rdbuf();
    return hex(buf.str());
}

bool selfTest()
{
    //  The two published sample vectors, plus the empty string.  A build that
    //  miscompiles this says so here rather than disagreeing silently with
    //  the importer that wrote the manifests.
    return hex("abc")
             == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        && hex("")
             == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        && hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")
             == "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1";
}

} // namespace sha256
} // namespace Choupo
