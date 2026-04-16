import os

def refactor_main():
    filepath = 'api/main.py'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Replace get_db_connection body
    old_conn = """def get_db_connection() -> duckdb.DuckDBPyConnection:
    \"\"\"
    Retorna uma conexão DuckDB apontando para o MotherDuck.
    O token é lido da variável de ambiente MOTHERDUCK_TOKEN.
    Lança HTTPException 500 se o token não estiver configurado.
    \"\"\"
    token = os.getenv("MOTHERDUCK_TOKEN")
    if not token:
        logger.error("Variável de ambiente MOTHERDUCK_TOKEN não definida.")
        raise HTTPException(
            status_code=500,
            detail="Erro no Motor Analítico: token MotherDuck não configurado.",
        )
    try:
        conn = duckdb.connect(f"md:?motherduck_token={token}")
        logger.info("Conexão ao MotherDuck estabelecida com sucesso.")
        return conn
    except Exception as exc:
        logger.exception("Falha ao conectar ao MotherDuck.")
        raise HTTPException(
            status_code=500,
            detail=f"Erro no Motor Analítico: não foi possível conectar ao banco. {exc}",
        ) from exc"""
    
    new_conn = """_db_connection = None

def get_db_connection() -> duckdb.DuckDBPyConnection:
    \"\"\"
    Retorna uma conexão DuckDB Singleton apontando para o MotherDuck.
    \"\"\"
    global _db_connection
    if _db_connection is not None:
        return _db_connection

    token = os.getenv("MOTHERDUCK_TOKEN")
    if not token:
        logger.error("Variável de ambiente MOTHERDUCK_TOKEN não definida.")
        raise HTTPException(
            status_code=500,
            detail="Erro no Motor Analítico: token MotherDuck não configurado.",
        )
    try:
        conn = duckdb.connect(f"md:?motherduck_token={token}")
        logger.info("Conexão ao MotherDuck estabelecida com sucesso.")
        _db_connection = conn
        return _db_connection
    except Exception as exc:
        logger.exception("Falha ao conectar ao MotherDuck.")
        raise HTTPException(
            status_code=500,
            detail=f"Erro no Motor Analítico: não foi possível conectar ao banco. {exc}",
        ) from exc"""
    content = content.replace(old_conn, new_conn)

    # 2. Replace conn.execute with cursor.execute
    content = content.replace('conn.execute(', 'cursor.execute(')
    content = content.replace('conn.description', 'cursor.description')
    
    # 3. Inject cursor
    content = content.replace('conn = get_db_connection()\n    try:', 'conn = get_db_connection()\n    cursor = conn.cursor()\n    try:')

    # 4. Replace finally
    content = content.replace('finally:\n        conn.close()', 'finally:\n        cursor.close()')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

def refactor_chat():
    filepath = 'api/chat_service.py'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    old_conn = """def get_db_connection() -> duckdb.DuckDBPyConnection:
    token = os.getenv("MOTHERDUCK_TOKEN")
    return duckdb.connect(f"md:?motherduck_token={token}")"""

    new_conn = """_db_connection = None

def get_db_connection() -> duckdb.DuckDBPyConnection:
    global _db_connection
    if _db_connection is not None:
        return _db_connection
    token = os.getenv("MOTHERDUCK_TOKEN")
    _db_connection = duckdb.connect(f"md:?motherduck_token={token}")
    return _db_connection"""

    content = content.replace(old_conn, new_conn)
    content = content.replace('conn = get_db_connection()\n    try:', 'conn = get_db_connection()\n    cursor = conn.cursor()\n    try:')
    content = content.replace('conn.execute(', 'cursor.execute(')
    content = content.replace('conn.description', 'cursor.description')
    content = content.replace('finally:\n        conn.close()', 'finally:\n        cursor.close()')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

refactor_main()
refactor_chat()
print("Refactoring complete.")
