import os
import duckdb
from dotenv import load_dotenv

load_dotenv()

token = os.getenv("MOTHERDUCK_TOKEN")
if not token:
    print("MOTHERDUCK_TOKEN missing")
    exit(1)

print("Connecting to MotherDuck...")
conn = duckdb.connect(f"md:?motherduck_token={token}")

tables = ['candidatos_2024', 'candidatos_2022', 'candidatos_2020']

for tab in tables:
    try:
        print(f"Creating exact indexes on {tab}...")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{tab}_uf ON {tab}(SG_UF)")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{tab}_ue ON {tab}(NM_UE)")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{tab}_cargo ON {tab}(DS_CARGO)")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{tab}_partido ON {tab}(SG_PARTIDO)")
        print(f"Index success on {tab}")
    except Exception as e:
        print(f"Error creating indexes on {tab}: {e}")

print("Index creation finished successfully!")
