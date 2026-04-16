import os
import json
import logging
from typing import Optional
import hashlib

from fastapi import HTTPException
from pydantic import BaseModel
import duckdb
from supabase import create_client, Client
import google.generativeai as genai
from upstash_redis import Redis

logger = logging.getLogger("chat-service")

# --- CONEXÕES ---
def get_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise ValueError("Supabase (conhecimento_ia) env vars missing")
    return create_client(url, key)

def get_redis_client() -> Optional[Redis]:
    url = os.getenv("UPSTASH_REDIS_REST_URL")
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN")
    if not url or not token:
        logger.warning("Redis não configurado. Cache será ignorado.")
        return None
    return Redis(url=url, token=token)

_db_connection = None

def get_db_connection() -> duckdb.DuckDBPyConnection:
    global _db_connection
    if _db_connection is not None:
        return _db_connection
    token = os.getenv("MOTHERDUCK_TOKEN")
    _db_connection = duckdb.connect(f"md:?motherduck_token={token}")
    return _db_connection

def configure_gemini():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY missing")
    genai.configure(api_key=api_key)

class ChatRequest(BaseModel):
    pergunta: str
    ano: int = 2024

class ChatResponse(BaseModel):
    resposta: str
    sql_gerado: Optional[str] = None
    cache: bool = False

def gerar_hash(pergunta: str, ano: int) -> str:
    s = f"{pergunta.strip().lower()}|{ano}"
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def processar_chat(req: ChatRequest) -> ChatResponse:
    redis = get_redis_client()
    cache_key = None
    
    if redis:
        cache_key = f"chat_{gerar_hash(req.pergunta, req.ano)}"
        cached_resp = redis.get(cache_key)
        if cached_resp:
            logger.info("Retornando do cache Upstash. Custo Zero.")
            return ChatResponse(resposta=cached_resp, cache=True)

    configure_gemini()
    
    # ETAPA A: Busca Vetorial
    try:
        resultado_embed = genai.embed_content(
            model="models/gemini-embedding-001",
            content=req.pergunta,
            task_type="retrieval_query",
        )
        vetor = resultado_embed["embedding"]
        
        supabase = get_supabase_client()
        res_rpc = supabase.rpc("match_conhecimento_ia", {"query_embedding": vetor, "match_count": 3}).execute()
        
        contexto_tabelas = ""
        if res_rpc.data:
            contexto_tabelas = "\n".join([r.get("conteudo", r.get("esquema", "")) for r in res_rpc.data])
    except Exception as e:
        logger.warning(f"Falha na busca vetorial (usando fallback de esquema): {e}")
        contexto_tabelas = "Considere que existem as tabelas: votacao_secao_{ano}_GO, eleitorado_local_{ano}_GO, mesarios_{ano}_GO e receitas_candidatos_{ano}_GO."

    # ETAPA B: Prompt Injection (Text-to-SQL)
    model_sql = genai.GenerativeModel("gemini-1.5-flash")
    prompt_sql = f"""Você é o Engenheiro de Dados Sarelli Especialista em DuckDB / MotherDuck.
O usuário perguntou: '{req.pergunta}'
O ano de contexto da eleição é {req.ano} e as tabelas devem ter este sufixo.
Com base nos vetores recuperados (esquemas do DB):
{contexto_tabelas}

Retorne **EXATAMENTE e SOMENTE** o código SQL (dialecto PostgreSQL adaptado para DuckDB) necessário.
Não retorne blocos de código com crases (Ex: nunca envie ```sql). Apenas queries de leitura pura (SELECT).
Se for impossível, retorne a palara `VAZIO`.
"""
    resp_sql = model_sql.generate_content(prompt_sql)
    sql_query = resp_sql.text.strip().replace("```sql", "").replace("```", "").strip()

    if not sql_query or sql_query.upper() == "VAZIO" or not sql_query.upper().startswith("SELECT"):
        return ChatResponse(resposta="Não foi possível mapear sua pergunta para a basologia eleitoral ou dados são insuficientes.")

    # ETAPA C: Execução Analítica (DuckDB)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        result = cursor.execute(sql_query).fetchall()
        col_names = [desc[0] for desc in cursor.description]
        rows = [dict(zip(col_names, row)) for row in result[:25]] # max 25 rows pro LLM payload limit
        dados_json = json.dumps(rows, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Erro MotherDuck ao rodar SQL gerado ({sql_query}): {e}")
        return ChatResponse(resposta="Falha técnica na consulta analítica. Nossa equipe foi notificada.", sql_gerado=sql_query)
    finally:
        cursor.close()

    # ETAPA D: Formatação e Response final
    model_chat = genai.GenerativeModel("gemini-1.5-flash")
    prompt_final = f"""Você é o Assistente Estratégico AI da 'Sarelli Inteligência'. (Se comporte de modo premium e firme, estilo ChatGPT B2B).
Você acabou de consultar o MotherDuck e recebeu o seguinte JSON bruto:
{dados_json}

Pergunta do Usuário: '{req.pergunta}'

DIRETRIZES DA MARCA:
1. Sempre chame "Mesários" de "Lideranças de campo" ou "apoio".
2. Sempre chame "Bairros" de "Setores".
3. Formate os valores (votos/dinheiro) adequadamente.
4. Responda DIRETAMENTE a pergunta usando os dados brutos. Organize-os em parágrafos e tabelas markdown limpas (quando houver mais de 3 itens).

Responda:"""
    
    resp_final = model_chat.generate_content(prompt_final)
    resposta_markdown = resp_final.text.strip()
    
    if redis:
        try:
            # 12 horas cache ttl
            redis.set(cache_key, resposta_markdown, ex=43200)
        except Exception as e:
            logger.warning(f"Failed to cache response in Redis: {e}")

    return ChatResponse(resposta=resposta_markdown, sql_gerado=sql_query, cache=False)
