import subprocess
import re
import sys
import os

def clean_create_table(block):
    lines = block.splitlines()
    new_lines = []
    for line in lines:
        stripped = line.strip()
        # Preserve UNIQUE KEY / UNIQUE INDEX as standard SQL UNIQUE constraints
        if re.match(r'^UNIQUE\s+(KEY|INDEX)\b', stripped, re.IGNORECASE):
            line = re.sub(r'UNIQUE\s+(KEY|INDEX)\s+([^\s(]+\s*)?', 'UNIQUE ', line, flags=re.IGNORECASE)
            new_lines.append(line)
            continue

        # Drop secondary non-unique MySQL keys/indexes inside CREATE TABLE
        if re.match(r'^(KEY|FULLTEXT|SPATIAL|CONSTRAINT)\s+', stripped, re.IGNORECASE):
            continue
            
        # Strip MySQL character sets, collations, and json_valid checks
        line = re.sub(r'CHARACTER SET \w+', '', line, flags=re.IGNORECASE)
        line = re.sub(r'COLLATE \w+', '', line, flags=re.IGNORECASE)
        line = re.sub(r'CHECK\s*\(json_valid\([^)]+\)\)', '', line, flags=re.IGNORECASE)
        line = re.sub(r'ON UPDATE CURRENT_TIMESTAMP(\(\))?', '', line, flags=re.IGNORECASE)
            
        # Fix types
        line = re.sub(r'\s+bigint(\(\d+\))?(\s+unsigned)?\s+NOT\s+NULL\s+AUTO_INCREMENT\b', ' BIGSERIAL', line, flags=re.IGNORECASE)
        line = re.sub(r'\s+(int|integer|mediumint)(\(\d+\))?(\s+unsigned)?\s+NOT\s+NULL\s+AUTO_INCREMENT\b', ' SERIAL', line, flags=re.IGNORECASE)
        line = re.sub(r'\bauto_increment\b', '', line, flags=re.IGNORECASE)
        
        line = re.sub(r'\benum\([^)]+\)', 'varchar(64)', line, flags=re.IGNORECASE)
        line = re.sub(r'\s+(tinyint|smallint)(\(\d+\))?', ' smallint', line, flags=re.IGNORECASE)
        line = re.sub(r'\s+bigint(\(\d+\))?', ' bigint', line, flags=re.IGNORECASE)
        line = re.sub(r'\s+(int|integer|mediumint)(\(\d+\))?', ' integer', line, flags=re.IGNORECASE)
        line = re.sub(r'\bunsigned\b', '', line, flags=re.IGNORECASE)
        line = re.sub(r'\s+(longtext|mediumtext)\b', ' text', line, flags=re.IGNORECASE)
        line = re.sub(r'\s+datetime\b', ' timestamp', line, flags=re.IGNORECASE)
        line = re.sub(r'\s+double\b', ' double precision', line, flags=re.IGNORECASE)
        line = re.sub(r'\bcurrent_timestamp\(\)', 'CURRENT_TIMESTAMP', line, flags=re.IGNORECASE)
        
        new_lines.append(line)
        
    content_indices = [i for i, l in enumerate(new_lines) if l.strip() and not l.strip().startswith("CREATE TABLE") and not l.strip().startswith(")")]
    if content_indices:
        last_idx = content_indices[-1]
        new_lines[last_idx] = re.sub(r',\s*$', '', new_lines[last_idx])
        
    return "\n".join(new_lines)

def run():
    print("[1/4] Dumping twisted_rpg from MariaDB...")
    dump_cmd = [
        r"C:\Program Files\MariaDB 12.2\bin\mysqldump.exe",
        "-u", os.environ.get("MARIADB_USER", "twisted"),
        f"-p{os.environ.get('MARIADB_PASSWORD', 'twisted')}",
        "-h", "127.0.0.1",
        "--compatible=postgresql",
        "--skip-triggers",
        "--no-set-names",
        "--default-character-set=utf8mb4",
        "twisted_rpg"
    ]
    
    proc = subprocess.run(dump_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        print("Error dumping MariaDB:", proc.stderr)
        sys.exit(1)
        
    raw_sql = proc.stdout
    print(f"Dumped {len(raw_sql)} chars of SQL from MariaDB.")

    print("[2/4] Translating MySQL syntax to PostgreSQL...")
    raw_sql = raw_sql.replace(r"\'", "''")
    raw_sql = raw_sql.replace(r'\"', '"')
    
    statements = []
    lines = raw_sql.splitlines()
    current_statement = []
    in_create_table = False
    
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("/*") or stripped.startswith("--") or not stripped:
            continue
        if stripped.startswith("SET @") or stripped.startswith("SET AUTOCOMMIT") or stripped.startswith("LOCK TABLES") or stripped.startswith("UNLOCK TABLES") or stripped.startswith("COMMIT;"):
            continue
            
        if stripped.startswith("CREATE TABLE"):
            in_create_table = True
            current_statement = [line]
        elif in_create_table:
            current_statement.append(line)
            if stripped.endswith(";"):
                in_create_table = False
                cleaned_block = clean_create_table("\n".join(current_statement))
                statements.append(cleaned_block)
                current_statement = []
        else:
            line = re.sub(r'\bcurrent_timestamp\(\)', 'CURRENT_TIMESTAMP', line, flags=re.IGNORECASE)
            statements.append(line)
            
    final_sql = "\n".join(statements)
    
    out_file = r"C:\Users\rjd42\Desktop\twisted\twisted_rpg_postgres.sql"
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(final_sql)
    print(f"Wrote cleaned SQL to {out_file} ({len(final_sql)} chars)")
    
    env = {**os.environ, "PGPASSWORD": "postgres"}
    
    print("[3/4] Resetting and importing into twisted_rpg_dev...")
    # Drop existing tables in public schema and re-import
    reset_sql = "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public; CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
    subprocess.run([r"C:\Program Files\PostgreSQL\16\bin\psql.exe", "-U", "postgres", "-h", "localhost", "-d", "twisted_rpg_dev", "-c", reset_sql], env=env)
    res_dev = subprocess.run([r"C:\Program Files\PostgreSQL\16\bin\psql.exe", "-U", "postgres", "-h", "localhost", "-d", "twisted_rpg_dev", "-f", out_file], capture_output=True, text=True, env=env)
    errors_dev = [l for l in res_dev.stderr.splitlines() if "ERROR:" in l]
    print(f"twisted_rpg_dev: {len(errors_dev)} errors.")
    if errors_dev:
        for e in errors_dev[:5]:
            print("  ", e)

    print("[4/4] Resetting and importing into twisted_rpg_test...")
    subprocess.run([r"C:\Program Files\PostgreSQL\16\bin\psql.exe", "-U", "postgres", "-h", "localhost", "-d", "twisted_rpg_test", "-c", reset_sql], env=env)
    res_test = subprocess.run([r"C:\Program Files\PostgreSQL\16\bin\psql.exe", "-U", "postgres", "-h", "localhost", "-d", "twisted_rpg_test", "-f", out_file], capture_output=True, text=True, env=env)
    errors_test = [l for l in res_test.stderr.splitlines() if "ERROR:" in l]
    print(f"twisted_rpg_test: {len(errors_test)} errors.")
    if errors_test:
        for e in errors_test[:5]:
            print("  ", e)

    print("[5/5] Configuring sequences for all AUTO_INCREMENT tables...")
    query_cmd = [
        r"C:\Program Files\MariaDB 12.2\bin\mysql.exe",
        "-u", "twisted",
        "-ptwisted",
        "-h", "127.0.0.1",
        "twisted_rpg",
        "-B", "-N",
        "-e", "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'twisted_rpg' AND extra LIKE '%auto_increment%';"
    ]
    res_ai = subprocess.run(query_cmd, capture_output=True, text=True)
    pairs = [l.strip().split('\t') for l in res_ai.stdout.splitlines() if l.strip()]
    print(f"Found {len(pairs)} auto_increment columns to configure sequences for.")

    seq_sql_lines = []
    for table, col in pairs:
        seq_name = f"{table}_{col}_seq"
        seq_sql_lines.append(f"""
            CREATE SEQUENCE IF NOT EXISTS "{seq_name}";
            ALTER TABLE "{table}" ALTER COLUMN "{col}" SET DEFAULT nextval('"{seq_name}"');
            ALTER SEQUENCE "{seq_name}" OWNED BY "{table}"."{col}";
            SELECT setval('"{seq_name}"', COALESCE((SELECT MAX("{col}") FROM "{table}"), 1));
        """)
    seq_sql = "\n".join(seq_sql_lines)
    seq_file = r"C:\Users\rjd42\Desktop\twisted\sequences.sql"
    with open(seq_file, "w", encoding="utf-8") as f:
        f.write(seq_sql)

    for db in ["twisted_rpg_dev", "twisted_rpg_test"]:
        psql_seq = subprocess.run([r"C:\Program Files\PostgreSQL\16\bin\psql.exe", "-U", "postgres", "-h", "localhost", "-d", db, "-f", seq_file], env=env, capture_output=True, text=True)
        seq_errs = [l for l in psql_seq.stderr.splitlines() if "ERROR:" in l]
        print(f"{db} sequences: {len(seq_errs)} errors.")
        if seq_errs:
            for e in seq_errs[:5]:
                print("  ", e)

    print("Migration complete.")

if __name__ == "__main__":
    run()
