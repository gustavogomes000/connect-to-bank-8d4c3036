"""
Motor Analítico - API FastAPI para MotherDuck (DuckDB)
Arquitetura: Zero-IA SQL — queries geradas por templates Python determinísticos.
Hospedagem: Vercel Serverless Function via Mangum (ASGI adapter).
"""

import os
import logging
from typing import Optional

import duckdb
from fastapi import FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel, Field

# INTEGRAÇÃO IA
from api.chat_service import processar_chat, ChatRequest

from chat_service import ChatRequest, ChatResponse, processar_chat

# ---------------------------------------------------------------------------
# Configuração de logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("motor-analitico")

# ---------------------------------------------------------------------------
# Aplicação FastAPI
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Motor Analítico GO",
    description="API de consultas determinísticas ao MotherDuck — dados eleitorais de Goiás.",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# CORS permissivo para desenvolvimento; restringir `origins` em produção.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Conexão MotherDuck
# ---------------------------------------------------------------------------
_db_connection = None

def get_db_connection() -> duckdb.DuckDBPyConnection:
    """
    Retorna uma conexão DuckDB Singleton apontando para o MotherDuck.
    """
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
        ) from exc


# ---------------------------------------------------------------------------
# Modelos Pydantic
# ---------------------------------------------------------------------------
class RankingPayload(BaseModel):
    """Payload recebido pelo endpoint POST /api/dados/ranking."""

    ano: int = Field(..., ge=1994, le=2030, description="Ano eleitoral (ex: 2022).")
    municipio: Optional[str] = Field(
        None, description="Nome do município (filtro opcional)."
    )
    cargo: Optional[str] = Field(
        None, description="Cargo disputado (filtro opcional, ex: 'VEREADOR')."
    )


class RankingResponse(BaseModel):
    """Envelope de resposta padronizado."""

    status: str
    total_registros: int
    dados: list[dict]


# ---------------------------------------------------------------------------
# Helpers — Construção SQL Zero-IA
# ---------------------------------------------------------------------------
def _build_ranking_query(payload: RankingPayload) -> str:
    """
    Constrói a query SQL de forma determinística via f-string Python.
    REGRA DE OURO: nenhum LLM toca neste SQL.

    Tabelas utilizadas (padrão TSE / MotherDuck - Goiás):
        consulta_cand_{ano}_GO          → dados cadastrais dos candidatos
        votacao_candidato_munzona_{ano}_GO → votos por candidato/municipio/zona
    """
    ano = int(payload.ano)  # garante int para evitar injeção via str

    base_query = f"""
        SELECT
            c.NM_CANDIDATO,
            c.NM_PARTIDO,
            c.DS_CARGO,
            c.NM_MUNICIPIO_NASCIMENTO,
            c.DS_SIT_TOT_TURNO,
            COALESCE(SUM(v.QT_VOTOS_NOMINAIS), 0) AS total_votos
        FROM consulta_cand_{ano}_GO AS c
        LEFT JOIN votacao_candidato_munzona_{ano}_GO AS v
            ON  c.SQ_CANDIDATO = v.SQ_CANDIDATO
            AND c.ANO_ELEICAO    = v.ANO_ELEICAO
    """

    # Filtros dinâmicos — valores sanitizados via parametrização DuckDB
    # (ver chamada em _execute_query; não interpolados diretamente aqui)
    where_clauses: list[str] = []

    if payload.municipio:
        where_clauses.append("UPPER(c.NM_MUNICIPIO_NASCIMENTO) = UPPER(?)")

    if payload.cargo:
        where_clauses.append("UPPER(c.DS_CARGO) = UPPER(?)")

    if where_clauses:
        base_query += " WHERE " + " AND ".join(where_clauses)

    base_query += """
        GROUP BY
            c.NM_CANDIDATO,
            c.NM_PARTIDO,
            c.DS_CARGO,
            c.NM_MUNICIPIO_NASCIMENTO,
            c.DS_SIT_TOT_TURNO
        ORDER BY total_votos DESC
        LIMIT 200
    """
    return base_query


def _collect_params(payload: RankingPayload) -> list:
    """Coleta parâmetros na mesma ordem dos ? na query."""
    params: list = []
    if payload.municipio:
        params.append(payload.municipio)
    if payload.cargo:
        params.append(payload.cargo)
    return params


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health", tags=["Infra"])
def health_check():
    """Verifica se a API está no ar (não toca no banco)."""
    return {"status": "ok", "versao": "1.0.0"}


@app.post(
    "/api/dados/ranking",
    response_model=RankingResponse,
    summary="Ranking de candidatos por votos",
    tags=["Dados Eleitorais"],
)
def ranking_candidatos(payload: RankingPayload):
    """
    Retorna o ranking de candidatos ordenado por total de votos.

    - **ano**: Ano eleitoral obrigatório.
    - **municipio**: Filtra por município de nascimento (opcional).
    - **cargo**: Filtra por cargo disputado (opcional).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = _build_ranking_query(payload)
        params = _collect_params(payload)

        logger.info(
            "Executando query | ano=%s | municipio=%s | cargo=%s",
            payload.ano,
            payload.municipio,
            payload.cargo,
        )

        result = cursor.execute(query, params).fetchall()
        col_names = [desc[0] for desc in cursor.description]

        rows = [dict(zip(col_names, row)) for row in result]

        return RankingResponse(
            status="sucesso",
            total_registros=len(rows),
            dados=rows,
        )

    except HTTPException:
        raise  # re-propaga erros HTTP já formatados
    except Exception as exc:
        logger.exception("Erro ao executar query de ranking.")
        raise HTTPException(
            status_code=500,
            detail=f"Erro no Motor Analítico: falha na consulta. {exc}",
        ) from exc
    finally:
        cursor.close()


@app.get(
    "/api/dados/candidato/{sq_candidato}/territorio",
    summary="Força Territorial por candidato",
    tags=["Dados Eleitorais"],
)
def territorio_candidato(
    sq_candidato: int = Path(..., description="SQ_CANDIDATO"),
    ano: int = Query(..., description="Ano eleitoral"),
):
    """Retorna a distribuição de votos por zona, bairro e escola."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = f"""
            SELECT
                v.NR_ZONA AS zona,
                e.NM_BAIRRO AS bairro,
                e.NM_LOCVOT AS escola,
                SUM(v.QT_VOTOS_NOMINAIS) AS votos
            FROM votacao_secao_{ano}_GO v
            INNER JOIN eleitorado_local_{ano}_GO e
                ON v.NR_ZONA = e.NR_ZONA
                AND v.NR_SECAO = e.NR_SECAO
            WHERE v.SQ_CANDIDATO = ?
            GROUP BY zona, bairro, escola
            ORDER BY votos DESC
        """
        result = cursor.execute(query, [sq_candidato]).fetchall()
        col_names = [desc[0] for desc in cursor.description]
        rows = [dict(zip(col_names, r)) for r in result]
        return {"status": "sucesso", "total": len(rows), "dados": rows}
    except Exception as exc:
        logger.exception("Erro ao consultar força territorial.")
        raise HTTPException(status_code=500, detail=f"Erro no Motor Analítico: {exc}")
    finally:
        cursor.close()


@app.get(
    "/api/dados/candidato/{sq_candidato}/bens",
    summary="Bens declarados pelo candidato",
    tags=["Dados Eleitorais"],
)
def bens_candidato(
    sq_candidato: int = Path(..., description="SQ_CANDIDATO"),
    ano: int = Query(..., description="Ano eleitoral"),
):
    """
    Retorna a lista de bens: DS_TIPO_BEM_CANDIDATO, DS_BEM_CANDIDATO e VR_BEM_CANDIDATO.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = f"""
            SELECT
                DS_TIPO_BEM_CANDIDATO,
                DS_BEM_CANDIDATO,
                CAST(VR_BEM_CANDIDATO AS DOUBLE) AS VR_BEM_CANDIDATO
            FROM bem_candidato_{ano}_GO
            WHERE SQ_CANDIDATO = ?
            ORDER BY VR_BEM_CANDIDATO DESC
        """
        result = cursor.execute(query, [sq_candidato]).fetchall()
        col_names = [desc[0] for desc in cursor.description]
        rows = [dict(zip(col_names, r)) for r in result]
        return {"status": "sucesso", "total": len(rows), "dados": rows}
    except Exception as exc:
        logger.exception("Erro ao consultar bens.")
        raise HTTPException(status_code=500, detail=f"Erro no Motor Analítico: {exc}")
    finally:
        cursor.close()


@app.get(
    "/api/dados/candidato/{sq_candidato}/receitas",
    summary="Receitas do candidato",
    tags=["Dados Eleitorais"],
)
def receitas_candidato(
    sq_candidato: int = Path(..., description="SQ_CANDIDATO"),
    ano: int = Query(..., description="Ano eleitoral"),
):
    """
    Retorna doações e receitas: NM_DOADOR, VR_RECEITA, DS_ORIGEM_RECEITA.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = f"""
            SELECT
                NM_DOADOR,
                CAST(VR_RECEITA AS DOUBLE) AS VR_RECEITA,
                DS_ORIGEM_RECEITA
            FROM receitas_candidatos_{ano}_GO
            WHERE SQ_CANDIDATO = ?
            ORDER BY VR_RECEITA DESC
        """
        result = cursor.execute(query, [sq_candidato]).fetchall()
        col_names = [desc[0] for desc in cursor.description]
        rows = [dict(zip(col_names, r)) for r in result]
        return {"status": "sucesso", "total": len(rows), "dados": rows}
    except Exception as exc:
        logger.exception("Erro ao consultar receitas.")
        raise HTTPException(status_code=500, detail=f"Erro no Motor Analítico: {exc}")
    finally:
        cursor.close()

# ---------------------------------------------------------------------------
# MÓDULO LOGÍSTICA ELEITORAL (Escolas e Mesários)
# ---------------------------------------------------------------------------

@app.get(
    "/api/dados/escolas",
    summary="Listagem de escolas e seções",
    tags=["Logística Eleitoral"],
)
def listar_escolas(
    ano: int = Query(..., description="Ano eleitoral"),
    municipio: Optional[str] = Query(None, description="Município"),
    zona: Optional[str] = Query(None, description="Zona Eleitoral"),
):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        where_clauses = []
        params = []
        
        if municipio:
            where_clauses.append("UPPER(NM_MUNICIPIO) = UPPER(?)")
            params.append(municipio)
        if zona:
            where_clauses.append("NR_ZONA = ?")
            params.append(zona)
            
        where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
            
        query = f"""
            SELECT
                NM_LOCVOT AS escola,
                NM_BAIRRO AS setor,
                NR_ZONA AS zona,
                COUNT(NR_SECAO) AS qtd_secoes,
                group_concat(CAST(NR_SECAO AS VARCHAR), ', ') AS secoes
            FROM eleitorado_local_{ano}_GO
            {where_sql}
            GROUP BY NM_LOCVOT, NM_BAIRRO, NR_ZONA
            ORDER BY escola
        """
        result = cursor.execute(query, params).fetchall()
        col_names = [desc[0] for desc in cursor.description]
        rows = [dict(zip(col_names, r)) for r in result]
        return {"status": "sucesso", "total": len(rows), "dados": rows}
    except Exception as exc:
        logger.exception("Erro ao listar escolas.")
        raise HTTPException(status_code=500, detail=f"Erro no Motor Analítico: {exc}")
    finally:
        cursor.close()

@app.get(
    "/api/dados/escolas/pessoal",
    summary="Listagem de lideranças/mesários",
    tags=["Logística Eleitoral"],
)
def listar_pessoal(
    ano: int = Query(..., description="Ano eleitoral"),
    zona: str = Query(..., description="Zona Eleitoral"),
    secao: str = Query(..., description="Seção"),
):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = f"""
            SELECT
                UPPER(NM_MESARIO) AS lideranca,
                DS_FUNCAO_MESARIO AS funcao
            FROM mesarios_{ano}_GO
            WHERE NR_ZONA = ? AND NR_SECAO = ?
            ORDER BY funcao, lideranca
        """
        result = cursor.execute(query, [zona, secao]).fetchall()
        col_names = [desc[0] for desc in cursor.description]
        rows = [dict(zip(col_names, r)) for r in result]
        return {"status": "sucesso", "total": len(rows), "dados": rows}
    except Exception as exc:
        logger.exception("Erro ao listar lideranças de campo.")
        raise HTTPException(status_code=500, detail=f"Erro no Motor Analítico: {exc}")
    finally:
        cursor.close()

# ---------------------------------------------------------------------------
# MÓDULO DE DEEP DRILL-DOWN (Central de Inteligência)
# ---------------------------------------------------------------------------
@app.get(
    "/api/inteligencia/mapa-votos",
    summary="Capivara Geográfica e Dominância",
    tags=["Central de Inteligência"],
)
def mapa_votos(
    ano: int = Query(..., description="Ano eleitoral"),
    sq_candidato: int = Query(..., description="SQ_CANDIDATO"),
):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # A CTE calcula o total da seção antes de filtrar pelo candidato
        query = f"""
            WITH TotaisSecao AS (
                SELECT 
                    NR_ZONA, 
                    NR_SECAO,
                    SUM(QT_VOTOS_NOMINAIS) as total_votos_secao
                FROM votacao_secao_{ano}_GO
                GROUP BY NR_ZONA, NR_SECAO
            )
            SELECT
                e.NM_BAIRRO AS setor,
                e.NM_LOCVOT AS escola,
                v.NR_ZONA AS zona,
                v.NR_SECAO AS secao,
                v.QT_VOTOS_NOMINAIS AS votos,
                t.total_votos_secao,
                CAST((v.QT_VOTOS_NOMINAIS * 100.0 / NULLIF(t.total_votos_secao, 0)) AS DOUBLE) AS dominancia
            FROM votacao_secao_{ano}_GO v
            INNER JOIN eleitorado_local_{ano}_GO e
                ON v.NR_ZONA = e.NR_ZONA AND v.NR_SECAO = e.NR_SECAO
            INNER JOIN TotaisSecao t
                ON v.NR_ZONA = t.NR_ZONA AND v.NR_SECAO = t.NR_SECAO
            WHERE v.SQ_CANDIDATO = ? AND v.QT_VOTOS_NOMINAIS > 0
            ORDER BY v.QT_VOTOS_NOMINAIS DESC
        """
        result = cursor.execute(query, [sq_candidato]).fetchall()
        col_names = [desc[0] for desc in cursor.description]
        rows = [dict(zip(col_names, r)) for r in result]
        return {"status": "sucesso", "total": len(rows), "dados": rows}
    except Exception as exc:
        logger.exception("Erro ao gerar Deep Drill-Down.")
        raise HTTPException(status_code=500, detail=f"Erro no Motor Analítico: {exc}")
    finally:
        cursor.close()

# ---------------------------------------------------------------------------
# MÓDULO DE INTELIGÊNCIA ARTIFICIAL (Chat)
# ---------------------------------------------------------------------------
@app.post("/api/chat", response_model=ChatResponse, tags=["AI", "Chat"])
def chat_eleicoes(req: ChatRequest):
    """
    Super-rota Sarelli: 
    1. Vector Search para contexto
    2. Prompt Injection (Text-to-SQL)
    3. Execução Zero-IA SQL via MotherDuck
    4. Formatação Final e Upstash Cache
    """
    return processar_chat(req)

# ---------------------------------------------------------------------------
# Handler ASGI para Vercel Serverless
# ---------------------------------------------------------------------------
handler = Mangum(app, lifespan="off")
