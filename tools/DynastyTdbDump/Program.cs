using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DynastyTdbDump;

internal static class Program
{
    private const string DefaultTdbDll = "tdbaccess.dll";

    [DllImport(DefaultTdbDll, CharSet = CharSet.Unicode)]
    private static extern int TDBOpen(string fileName);

    [DllImport(DefaultTdbDll)]
    private static extern bool TDBClose(int dbIndex);

    [DllImport(DefaultTdbDll)]
    private static extern int TDBDatabaseGetTableCount(int dbIndex);

    [DllImport(DefaultTdbDll)]
    private static extern bool TDBTableGetProperties(int dbIndex, int tableIndex, ref TdbTableProperties tableProperties);

    [DllImport(DefaultTdbDll, CharSet = CharSet.Unicode)]
    private static extern bool TDBFieldGetProperties(int dbIndex, string tableName, int fieldIndex, ref TdbFieldProperties fieldProperties);

    [DllImport(DefaultTdbDll, CharSet = CharSet.Unicode)]
    private static extern int TDBFieldGetValueAsInteger(int dbIndex, string tableName, string fieldName, int recNo);

    [DllImport(DefaultTdbDll, CharSet = CharSet.Unicode)]
    private static extern float TDBFieldGetValueAsFloat(int dbIndex, string tableName, string fieldName, int recNo);

    [DllImport(DefaultTdbDll, CharSet = CharSet.Unicode)]
    private static extern bool TDBFieldGetValueAsString(int dbIndex, string tableName, string fieldName, int recNo, ref string outBuffer);

    [DllImport(DefaultTdbDll, CharSet = CharSet.Unicode)]
    private static extern bool TDBTableRecordDeleted(int dbIndex, string tableName, int recNo);

    private static readonly string[] NameAlphabet = BuildNameAlphabet();

    private static int Main(string[] args)
    {
        try
        {
            var opts = ParseArgs(args);

            var dbIndex = TDBOpen(opts.DbPath);
            if (dbIndex < 0)
            {
                Console.Error.WriteLine($"Failed to open DB: {opts.DbPath}");
                return 2;
            }

            try
            {
                var tableCount = TDBDatabaseGetTableCount(dbIndex);

                var tableFilter = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (!string.IsNullOrWhiteSpace(opts.TablesCsv))
                {
                    foreach (var t in opts.TablesCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                    {
                        tableFilter.Add(t);
                    }
                }

                var tables = new List<TableDump>(capacity: Math.Max(tableCount, 0));

                for (var i = 0; i < tableCount; i++)
                {
                    var props = new TdbTableProperties { Name = new string((char)0, 5) };
                    if (!TDBTableGetProperties(dbIndex, i, ref props)) continue;

                    var tableName = NormalizeName(props.Name);
                    if (tableFilter.Count > 0 && !tableFilter.Contains(tableName)) continue;

                    var fields = ReadFields(dbIndex, tableName, props.FieldCount);

                    if (!opts.EmitCsv)
                    {
                        List<Dictionary<string, object?>>? rows = null;
                        if (opts.IncludeRows)
                        {
                            rows = ReadRows(dbIndex, tableName, props.RecordCount, fields, opts.MaxRowsPerTable);
                        }

                        tables.Add(new TableDump(
                            Name: tableName,
                            FieldCount: props.FieldCount,
                            RecordCount: props.RecordCount,
                            DeletedCount: props.DeletedCount,
                            Fields: fields,
                            Rows: rows
                        ));
                    }
                    else
                    {
                        // In CSV mode, we don't keep rows in memory.
                        if (string.IsNullOrWhiteSpace(opts.OutDir))
                        {
                            throw new Exception("--outDir is required when using --csv");
                        }

                        Directory.CreateDirectory(opts.OutDir);
                        var outPath = Path.Combine(opts.OutDir, $"{tableName}.csv");
                        WriteCsv(dbIndex, tableName, props.RecordCount, fields, outPath, opts.MaxRowsPerTable);

                        tables.Add(new TableDump(
                            Name: tableName,
                            FieldCount: props.FieldCount,
                            RecordCount: props.RecordCount,
                            DeletedCount: props.DeletedCount,
                            Fields: fields,
                            Rows: null
                        ));
                    }
                }

                if (!opts.EmitCsv)
                {
                    var payload = new DbDump(
                        DbPath: opts.DbPath,
                        TableCount: tableCount,
                        Tables: tables
                    );

                    var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions
                    {
                        WriteIndented = true,
                        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
                    });

                    Console.WriteLine(json);
                }
                else
                {
                    var payload = new CsvExportResult(
                        DbPath: opts.DbPath,
                        OutDir: opts.OutDir!,
                        TablesExported: tables.Select(t => t.Name).ToList()
                    );

                    Console.WriteLine(JsonSerializer.Serialize(payload, new JsonSerializerOptions
                    {
                        WriteIndented = true,
                        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
                    }));
                }

                return 0;
            }
            finally
            {
                TDBClose(dbIndex);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.Message);
            return 1;
        }
    }

    private static List<FieldDump> ReadFields(int dbIndex, string tableName, int fieldCount)
    {
        var fields = new List<FieldDump>(capacity: Math.Max(fieldCount, 0));

        for (var f = 0; f < fieldCount; f++)
        {
            var fieldProps = new TdbFieldProperties { Name = new string((char)0, 5) };
            if (!TDBFieldGetProperties(dbIndex, tableName, f, ref fieldProps)) continue;

            fields.Add(new FieldDump(
                Name: NormalizeName(fieldProps.Name),
                SizeBits: fieldProps.Size,
                FieldType: fieldProps.FieldType.ToString()
            ));
        }

        return fields;
    }

    private static List<Dictionary<string, object?>> ReadRows(
        int dbIndex,
        string tableName,
        int recordCount,
        List<FieldDump> fields,
        int? maxRows)
    {
        var limit = maxRows is > 0 ? Math.Min(recordCount, maxRows.Value) : recordCount;
        var rows = new List<Dictionary<string, object?>>(capacity: Math.Max(0, Math.Min(limit, 1024)));

        for (var r = 0; r < limit; r++)
        {
            if (TDBTableRecordDeleted(dbIndex, tableName, r)) continue;

            var row = new Dictionary<string, object?>(StringComparer.Ordinal);
            row["__recNo"] = r;
            foreach (var field in fields)
            {
                row[field.Name] = ReadFieldValue(dbIndex, tableName, field, r);
            }

            rows.Add(row);
        }

        return rows;
    }

    private static void WriteCsv(
        int dbIndex,
        string tableName,
        int recordCount,
        List<FieldDump> fields,
        string outPath,
        int? maxRows)
    {
        var extraCols = new List<string>();
        if (tableName.Equals("PLAY", StringComparison.OrdinalIgnoreCase))
        {
            extraCols.Add("FirstName");
            extraCols.Add("LastName");
        }

        var columns = fields.Select(f => f.Name).Concat(extraCols).ToList();

        using var fs = new FileStream(outPath, FileMode.Create, FileAccess.Write, FileShare.Read);
        using var sw = new StreamWriter(fs, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));

        sw.WriteLine(string.Join(',', columns.Select(CsvEscape)));

        var limit = maxRows is > 0 ? Math.Min(recordCount, maxRows.Value) : recordCount;

        for (var r = 0; r < limit; r++)
        {
            if (TDBTableRecordDeleted(dbIndex, tableName, r)) continue;

            var values = new List<string>(capacity: columns.Count);

            // Base fields
            foreach (var field in fields)
            {
                var v = ReadFieldValue(dbIndex, tableName, field, r);
                values.Add(CsvEscape(ToInvariantString(v)));
            }

            // Extra derived columns
            if (tableName.Equals("PLAY", StringComparison.OrdinalIgnoreCase))
            {
                var fn = DecodePlayName(dbIndex, r, isFirst: true);
                var ln = DecodePlayName(dbIndex, r, isFirst: false);
                values.Add(CsvEscape(fn));
                values.Add(CsvEscape(ln));
            }

            sw.WriteLine(string.Join(',', values));
        }
    }

    private static string DecodePlayName(int dbIndex, int recNo, bool isFirst)
    {
        // db-editor uses PF01..PF10 / PL01..PL10 indices into Alphabet.
        var prefix = isFirst ? "PF" : "PL";
        var sb = new StringBuilder();

        for (var i = 1; i <= 10; i++)
        {
            var field = $"{prefix}{i:00}";
            var code = TDBFieldGetValueAsInteger(dbIndex, "PLAY", field, recNo);
            if (code <= 0) break;
            if (code < NameAlphabet.Length)
            {
                sb.Append(NameAlphabet[code]);
            }
        }

        return sb.ToString();
    }

    private static object? ReadFieldValue(int dbIndex, string tableName, FieldDump field, int recNo)
    {
        if (!Enum.TryParse<TdbFieldType>(field.FieldType, out var ft))
        {
            return null;
        }

        switch (ft)
        {
            case TdbFieldType.tdbString:
                {
                    var charCount = (field.SizeBits / 8) + 1;
                    var buf = new string((char)0, charCount);
                    TDBFieldGetValueAsString(dbIndex, tableName, field.Name, recNo, ref buf);
                    return buf.TrimEnd('\0');
                }
            case TdbFieldType.tdbUInt:
            case TdbFieldType.tdbSInt:
            case TdbFieldType.tdbInt:
                return TDBFieldGetValueAsInteger(dbIndex, tableName, field.Name, recNo);
            case TdbFieldType.tdbFloat:
                return TDBFieldGetValueAsFloat(dbIndex, tableName, field.Name, recNo);
            case TdbFieldType.tdbBinary:
            case TdbFieldType.tdbVarchar:
            case TdbFieldType.tdbLongVarchar:
                // db-editor writes "usft" for these; tracker doesn't need them.
                return null;
            default:
                return null;
        }
    }

    private static string NormalizeName(string? raw)
        => (raw ?? string.Empty).TrimEnd('\0').Trim();

    private static string ToInvariantString(object? v)
    {
        if (v is null) return string.Empty;
        if (v is string s) return s;
        if (v is float f) return f.ToString("0.########", CultureInfo.InvariantCulture);
        if (v is double d) return d.ToString("0.########", CultureInfo.InvariantCulture);
        if (v is IFormattable fmt) return fmt.ToString(null, CultureInfo.InvariantCulture);
        return v.ToString() ?? string.Empty;
    }

    private static string CsvEscape(string? s)
    {
        s ??= string.Empty;
        var needs = s.IndexOfAny([',', '"', '\n', '\r']) >= 0;
        if (!needs) return s;
        return '"' + s.Replace("\"", "\"\"") + '"';
    }

    private static string[] BuildNameAlphabet()
    {
        // Index matches db-editor CreateNameConversionTable
        var map = new string[59];
        map[0] = string.Empty;
        var lower = "abcdefghijklmnopqrstuvwxyz";
        for (var i = 0; i < lower.Length; i++) map[1 + i] = lower[i].ToString();
        var upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        for (var i = 0; i < upper.Length; i++) map[27 + i] = upper[i].ToString();
        map[53] = "-";
        map[54] = "'";
        map[55] = ".";
        map[56] = " ";
        map[57] = "@";
        map[58] = "ñ";
        return map;
    }

    private static Options ParseArgs(string[] args)
    {
        string? dbPath = null;
        string? tables = null;
        var includeRows = false;
        var emitCsv = false;
        string? outDir = null;
        int? maxRows = null;

        for (var i = 0; i < args.Length; i++)
        {
            var a = args[i];
            if (a is "--db" or "-d")
            {
                if (i + 1 >= args.Length) throw new Exception("Missing value for --db");
                dbPath = args[++i];
                continue;
            }

            if (a is "--tables")
            {
                if (i + 1 >= args.Length) throw new Exception("Missing value for --tables");
                tables = args[++i];
                continue;
            }

            if (a is "--rows")
            {
                includeRows = true;
                continue;
            }

            if (a is "--csv")
            {
                emitCsv = true;
                continue;
            }

            if (a is "--outDir")
            {
                if (i + 1 >= args.Length) throw new Exception("Missing value for --outDir");
                outDir = args[++i];
                continue;
            }

            if (a is "--maxRows")
            {
                if (i + 1 >= args.Length) throw new Exception("Missing value for --maxRows");
                var raw = args[++i];
                if (int.TryParse(raw, out var n) && n > 0) maxRows = n;
                continue;
            }
        }

        if (string.IsNullOrWhiteSpace(dbPath))
        {
            throw new Exception("Usage: DynastyTdbDump --db <path-to-.db> [--tables TEAM,SCHD] [--rows] [--csv --outDir <dir>] [--maxRows 10]");
        }

        if (!File.Exists(dbPath))
        {
            throw new Exception($"DB file not found: {dbPath}");
        }

        if (emitCsv && string.IsNullOrWhiteSpace(outDir))
        {
            throw new Exception("--outDir is required when using --csv");
        }

        return new Options(
            DbPath: Path.GetFullPath(dbPath),
            TablesCsv: tables,
            IncludeRows: includeRows,
            EmitCsv: emitCsv,
            OutDir: outDir is null ? null : Path.GetFullPath(outDir),
            MaxRowsPerTable: maxRows
        );
    }

    private sealed record Options(
        string DbPath,
        string? TablesCsv,
        bool IncludeRows,
        bool EmitCsv,
        string? OutDir,
        int? MaxRowsPerTable);

    private enum TdbFieldType
    {
        tdbString = 0,
        tdbBinary = 1,
        tdbSInt = 2,
        tdbUInt = 3,
        tdbFloat = 4,
        tdbVarchar = 0xD,
        tdbLongVarchar = 0xE,
        tdbInt = 0x2CE,
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct TdbFieldProperties
    {
        public string Name;
        public int Size;
        public TdbFieldType FieldType;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct TdbTableProperties
    {
        public string Name;
        public int FieldCount;
        public int Capacity;
        public int RecordCount;
        public int DeletedCount;
        public int NextDeletedRecord;
        public bool Flag0;
        public bool Flag1;
        public bool Flag2;
        public bool Flag3;
        public bool NonAllocated;
        public bool HasVarChar;
        public bool HasCompressedVarChar;
    }

    private sealed record DbDump(string DbPath, int TableCount, List<TableDump> Tables);

    private sealed record TableDump(string Name, int FieldCount, int RecordCount, int DeletedCount, List<FieldDump> Fields, List<Dictionary<string, object?>>? Rows);

    private sealed record FieldDump(string Name, int SizeBits, string FieldType);

    private sealed record CsvExportResult(string DbPath, string OutDir, List<string> TablesExported);
}
