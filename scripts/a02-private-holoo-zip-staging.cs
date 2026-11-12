// A02: private local Holoo ZIP staging. Compiles with Windows PowerShell 5.1 / .NET Framework.
// Do not log owner ZIP names, input paths, extracted bytes or per-record data.
using System;
using System.IO;
using System.IO.Compression;
using System.Text;
namespace Finora.Migration {
  public sealed class HolooZipReport {
    public long ArchiveBytes { get; internal set; }
    public long BackupBytes { get; internal set; }
    public long CompressedBytes { get; internal set; }
    public bool EnvelopeValid { get; internal set; }
    public bool CrcVerified { get; internal set; }
    public bool SqlTapeHeaderVerified { get; internal set; }
    public bool CanImport { get { return false; } }
  }

  public static class SafeHolooZip {
    private const long MaxArchive = 2L * 1024 * 1024 * 1024;
    private const long MaxBackup = 4L * 1024 * 1024 * 1024 - 1;
    private const long MaxRatio = 1000;
    private static readonly uint[] CrcTable = BuildCrcTable();
    private sealed class ZipMeta {
      public uint Crc, Compressed, Uncompressed;
      public ushort Flags, Method;
      public string EntryName;
    }
    private static uint[] BuildCrcTable() {
      uint[] values = new uint[256];
      for (uint i = 0; i < 256; i++) {
        uint c = i;
        for (int j = 0; j < 8; j++) c = (c & 1) != 0 ? 0xedb88320u ^ (c >> 1) : c >> 1;
        values[i] = c;
      }
      return values;
    }
    private static uint UpdateCrc(uint crc, byte[] bytes, int length) {
      for (int i = 0; i < length; i++) crc = CrcTable[(int)((crc ^ bytes[i]) & 0xff)] ^ (crc >> 8);
      return crc;
    }
    private static void Require(bool valid, string code) {
      if (!valid) throw new InvalidDataException(code);
    }
    private static string SafeName(byte[] bytes, ushort flags) {
      Require(bytes.Length > 0 && bytes.Length <= 255, "A02_ENTRY_NAME_LENGTH");
      string name = ((flags & 0x0800) != 0
        ? new UTF8Encoding(false, true)
        : Encoding.GetEncoding(437)).GetString(bytes);
      Require(name.Length > 0 && name.Length <= 255 &&
        name.IndexOf('/') < 0 && name.IndexOf('\\') < 0 &&
        name.IndexOf(':') < 0 && name.IndexOf("..", StringComparison.Ordinal) < 0 &&
        name.TrimEnd(' ', '.') == name, "A02_UNSAFE_ENTRY_NAME");
      foreach (char c in name) Require(!Char.IsControl(c), "A02_UNSAFE_ENTRY_NAME");
      return name;
    }
    private static ZipMeta ParseCentral(FileStream stream) {
      Require(stream.Length >= 52 && stream.Length <= MaxArchive, "A02_ZIP_SIZE_UNSUPPORTED");
      const int maxEnd = 22 + 65535;
      int n = (int)Math.Min(stream.Length, maxEnd);
      byte[] tail = new byte[n];
      stream.Seek(-n, SeekOrigin.End);
      Require(stream.Read(tail, 0, n) == n, "A02_ZIP_TRAILER_UNREADABLE");
      int p = -1;
      for (int i = n - 22; i >= 0; i--) {
        if (BitConverter.ToUInt32(tail, i) == 0x06054b50u &&
            i + 22 + BitConverter.ToUInt16(tail, i + 20) == n) { p = i; break; }
      }
      Require(p >= 0, "A02_ZIP_END_MISSING");
      Require(BitConverter.ToUInt16(tail, p + 4) == 0 &&
        BitConverter.ToUInt16(tail, p + 6) == 0 &&
        BitConverter.ToUInt16(tail, p + 8) == 1 &&
        BitConverter.ToUInt16(tail, p + 10) == 1, "A02_ZIP_SINGLE_ENTRY_REQUIRED");
      uint directorySize = BitConverter.ToUInt32(tail, p + 12);
      uint directoryOffset = BitConverter.ToUInt32(tail, p + 16);
      long directoryEnd = stream.Length - n + p;
      Require(directorySize >= 46 && directorySize != uint.MaxValue &&
        directoryOffset != uint.MaxValue &&
        ((long)directoryOffset + directorySize) == directoryEnd,
        "A02_ZIP_CENTRAL_INVALID");
      stream.Position = directoryOffset;
      byte[] header = new byte[46];
      Require(stream.Read(header, 0, header.Length) == 46 &&
        BitConverter.ToUInt32(header, 0) == 0x02014b50u,
        "A02_ZIP_CENTRAL_INVALID");
      ushort flags = BitConverter.ToUInt16(header, 8);
      ushort method = BitConverter.ToUInt16(header, 10);
      uint crc = BitConverter.ToUInt32(header, 16);
      uint compressed = BitConverter.ToUInt32(header, 20);
      uint uncompressed = BitConverter.ToUInt32(header, 24);
      ushort nameSize = BitConverter.ToUInt16(header, 28);
      ushort extraSize = BitConverter.ToUInt16(header, 30);
      ushort commentSize = BitConverter.ToUInt16(header, 32);
      uint externalAttributes = BitConverter.ToUInt32(header, 38);
      uint localOffset = BitConverter.ToUInt32(header, 42);
      Require((flags & 0x0041) == 0 && (method == 0 || method == 8),
        "A02_ZIP_ENCRYPTED_OR_UNSUPPORTED_METHOD");
      Require(compressed > 0 && uncompressed >= 4 && uncompressed <= MaxBackup &&
        uncompressed <= (long)compressed * MaxRatio &&
        compressed != uint.MaxValue && uncompressed != uint.MaxValue,
        "A02_ZIP_UNPACK_LIMIT");
      Require(localOffset == 0 && nameSize > 0 && nameSize <= 255 &&
        (long)46 + nameSize + extraSize + commentSize == directorySize &&
        (externalAttributes >> 28) != 0xA, "A02_ZIP_LAYOUT_UNSUPPORTED");
      byte[] nameBytes = new byte[nameSize];
      Require(stream.Read(nameBytes, 0, nameSize) == nameSize,
        "A02_ZIP_NAME_TRUNCATED");
      string name = SafeName(nameBytes, flags);
      stream.Position = 0;
      byte[] local = new byte[30];
      Require(stream.Read(local, 0, 30) == 30 &&
        BitConverter.ToUInt32(local, 0) == 0x04034b50u &&
        BitConverter.ToUInt16(local, 6) == flags &&
        BitConverter.ToUInt16(local, 8) == method &&
        BitConverter.ToUInt16(local, 26) == nameSize,
        "A02_ZIP_LOCAL_MISMATCH");
      ushort localExtra = BitConverter.ToUInt16(local, 28);
      byte[] localName = new byte[nameSize];
      Require(stream.Read(localName, 0, nameSize) == nameSize,
        "A02_ZIP_LOCAL_NAME_TRUNCATED");
      for (int i = 0; i < nameSize; i++) {
        Require(nameBytes[i] == localName[i], "A02_ZIP_NAMES_DIFFER");
      }
      Require(30L + nameSize + localExtra + compressed <= directoryOffset,
        "A02_ZIP_DATA_BOUNDS_INVALID");
      return new ZipMeta {
        Crc = crc, Compressed = compressed, Uncompressed = uncompressed,
        Flags = flags, Method = method, EntryName = name
      };
    }
    private static ZipArchiveEntry OpenValidatedEntry(FileStream file, ZipMeta meta, out ZipArchive zip) {
      file.Position = 0;
      zip = new ZipArchive(file, ZipArchiveMode.Read, true);
      Require(zip.Entries.Count == 1, "A02_ZIP_MULTIPLE_ENTRIES");
      ZipArchiveEntry entry = zip.Entries[0];
      Require(entry.FullName == meta.EntryName && entry.Name == meta.EntryName &&
        entry.Length == meta.Uncompressed && entry.CompressedLength == meta.Compressed,
        "A02_ZIP_ENTRY_DISAGREEMENT");
      return entry;
    }
    public static HolooZipReport Probe(string source) {
      using (FileStream file = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read)) {
        ZipMeta meta = ParseCentral(file);
        ZipArchive zip = null;
        try {
          OpenValidatedEntry(file, meta, out zip);
          return new HolooZipReport {
            ArchiveBytes = file.Length, BackupBytes = meta.Uncompressed,
            CompressedBytes = meta.Compressed, EnvelopeValid = true,
            CrcVerified = false, SqlTapeHeaderVerified = false
          };
        } finally { if (zip != null) zip.Dispose(); }
      }
    }
    public static HolooZipReport Stage(string source, string destination) {
      // Stage NEVER overwrites a destination and locks the source against
      // concurrent writers for the duration of verification and extraction.
      using (FileStream file = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read)) {
        ZipMeta meta = ParseCentral(file);
        ZipArchive zip = null;
        bool destinationCreated = false;
        try {
          ZipArchiveEntry entry = OpenValidatedEntry(file, meta, out zip);
          using (Stream input = entry.Open()) {
            using (FileStream output = new FileStream(destination, FileMode.CreateNew,
              FileAccess.Write, FileShare.None, 1024 * 1024, FileOptions.SequentialScan)) {
              destinationCreated = true;
              byte[] buffer = new byte[1024 * 1024];
              byte[] tape = new byte[4];
              int tapeRead = 0;
              uint crc = 0xffffffffu;
              long total = 0;
              while (true) {
                int count = input.Read(buffer, 0, buffer.Length);
                if (count == 0) break;
                total += count;
                Require(total <= meta.Uncompressed && total <= MaxBackup,
                  "A02_UNCOMPRESSED_LIMIT_EXCEEDED");
                for (int i = 0; i < count && tapeRead < 4; i++) tape[tapeRead++] = buffer[i];
                crc = UpdateCrc(crc, buffer, count);
                output.Write(buffer, 0, count);
              }
              Require(total == meta.Uncompressed && (crc ^ 0xffffffffu) == meta.Crc,
                "A02_ZIP_CRC_OR_LENGTH_MISMATCH");
              Require(tapeRead == 4 && tape[0] == (byte)'T' && tape[1] == (byte)'A' &&
                tape[2] == (byte)'P' && tape[3] == (byte)'E',
                "A02_SQL_TAPE_SIGNATURE_MISSING");
              output.Flush(true);
            }
          }
          return new HolooZipReport {
            ArchiveBytes = file.Length, BackupBytes = meta.Uncompressed,
            CompressedBytes = meta.Compressed, EnvelopeValid = true,
            CrcVerified = true, SqlTapeHeaderVerified = true
          };
        } catch {
          if (destinationCreated) {
            // Delete only the new file this operation itself created.
            try { File.Delete(destination); } catch { }
          }
          throw;
        } finally { if (zip != null) zip.Dispose(); }
      }
    }
    public static void SelfTest() {
      string root = Path.Combine(Path.GetTempPath(), "FinoraHolooSynthetic_" +
        Guid.NewGuid().ToString("N"));
      Directory.CreateDirectory(root);
      try {
        string good = Path.Combine(root, "synthetic.zip");
        using (FileStream f = new FileStream(good, FileMode.CreateNew)) {
          using (ZipArchive zip = new ZipArchive(f, ZipArchiveMode.Create, true)) {
            using (Stream s = zip.CreateEntry("Holoo1", CompressionLevel.Optimal).Open()) {
              byte[] sample = Encoding.ASCII.GetBytes("TAPE-SYNTHETIC-DATA");
              s.Write(sample, 0, sample.Length);
            }
          }
        }
        HolooZipReport probe = Probe(good);
        Require(probe.EnvelopeValid && !probe.CrcVerified &&
          !probe.SqlTapeHeaderVerified && !probe.CanImport,
          "A02_SYNTHETIC_PROBE_FAILED");
        string outFile = Path.Combine(root, "extracted.bak");
        HolooZipReport staged = Stage(good, outFile);
        Require(staged.CrcVerified && staged.SqlTapeHeaderVerified &&
          !staged.CanImport && File.Exists(outFile) &&
          Encoding.ASCII.GetString(File.ReadAllBytes(outFile)) == "TAPE-SYNTHETIC-DATA",
          "A02_SYNTHETIC_STAGE_FAILED");
        bool refusedOverwrite = false;
        try { Stage(good, outFile); }
        catch (IOException) { refusedOverwrite = true; }
        Require(refusedOverwrite, "A02_OVERWRITE_ALLOWED");
        // Mutate ONLY central CRC, leaving compressed source bytes intact:
        // probing must not claim CRC, and staging must fail and clean up.
        string damaged = Path.Combine(root, "bad_crc.zip");
        byte[] corrupt = File.ReadAllBytes(good);
        int central = -1;
        for (int i = 0; i <= corrupt.Length - 46; i++) {
          if (BitConverter.ToUInt32(corrupt, i) == 0x02014b50u) { central = i; break; }
        }
        Require(central >= 0, "A02_SYNTHETIC_CENTRAL_MISSING");
        corrupt[central + 16] ^= 0x80;
        File.WriteAllBytes(damaged, corrupt);
        HolooZipReport badProbe = Probe(damaged);
        Require(badProbe.EnvelopeValid && !badProbe.CrcVerified,
          "A02_PROBE_MUST_NOT_CLAIM_CRC");
        string damagedOut = Path.Combine(root, "bad_crc.bak");
        bool crcBlocked = false;
        try { Stage(damaged, damagedOut); }
        catch (InvalidDataException) { crcBlocked = true; }
        Require(crcBlocked && !File.Exists(damagedOut),
          "A02_CORRUPTED_CRC_ACCEPTED_OR_OUTPUT_LEFT");
        string wrong = Path.Combine(root, "not_sql.zip");
        using (FileStream f = new FileStream(wrong, FileMode.CreateNew)) {
          using (ZipArchive zip = new ZipArchive(f, ZipArchiveMode.Create, true)) {
            using (Stream s = zip.CreateEntry("Holoo1").Open()) {
              byte[] sample = Encoding.ASCII.GetBytes("NOPE");
              s.Write(sample, 0, sample.Length);
            }
          }
        }
        string badOut = Path.Combine(root, "bad.bak");
        bool blocked = false;
        try { Stage(wrong, badOut); } catch (InvalidDataException) { blocked = true; }
        Require(blocked && !File.Exists(badOut), "A02_BAD_SIGNATURE_LEFT_FILE");
        string multi = Path.Combine(root, "multi.zip");
        using (FileStream f = new FileStream(multi, FileMode.CreateNew)) {
          using (ZipArchive zip = new ZipArchive(f, ZipArchiveMode.Create, true)) {
            zip.CreateEntry("Holoo1");
            zip.CreateEntry("Another");
          }
        }
        blocked = false;
        try { Probe(multi); } catch (InvalidDataException) { blocked = true; }
        Require(blocked, "A02_MULTIENTRY_ACCEPTED");
      } finally {
        Directory.Delete(root, true);
      }
    }
  }
}
