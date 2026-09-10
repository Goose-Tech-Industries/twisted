defmodule TePhoenix.AI.SemanticMemory do
  @moduledoc """
  SOTA Vector-Powered Semantic Memory & Episodic Lore Retrieval.

  Features:
    * Stores vector embeddings and JSONB metadata directly in PostgreSQL 16
    * Fast cosine similarity vector search (`vector_cosine_similarity`)
    * GIN index accelerated JSONB filtering for NPC state and tags
    * Decoupled architecture: works with any embedding dimension (e.g. 768, 1536)
  """

  alias TePhoenix.Repo
  require Logger

  @doc """
  Stores a memory for an NPC with optional vector embedding and JSON metadata.
  """
  def store(npc_id, content, opts \\ []) when is_binary(npc_id) and is_binary(content) do
    embedding = Keyword.get(opts, :embedding)
    memory_type = Keyword.get(opts, :memory_type, "episodic")
    importance = Keyword.get(opts, :importance, 1.0)
    metadata = Keyword.get(opts, :metadata, %{})
    metadata_json = Jason.encode!(metadata)

    sql = """
    INSERT INTO npc_semantic_memories
      (npc_id, memory_type, content, embedding, importance, metadata_json)
    VALUES
      ($1, $2, $3, $4, $5, $6::jsonb)
    RETURNING id, npc_id, memory_type, content, importance, metadata_json, created_at
    """

    case Repo.query(sql, [npc_id, memory_type, content, embedding, importance, metadata_json]) do
      {:ok, %{rows: [[id, n_id, m_type, cont, imp, meta, created_at]]}} ->
        {:ok,
         %{
           id: id,
           npc_id: n_id,
           memory_type: m_type,
           content: cont,
           importance: imp,
           metadata: parse_meta(meta),
           created_at: created_at
         }}

      {:error, reason} = err ->
        Logger.error("[SemanticMemory] Failed to store memory: #{inspect(reason)}")
        err
    end
  end

  @doc """
  Performs cosine similarity search against stored embeddings for an NPC.
  """
  def search(npc_id, query_embedding, opts \\ [])
      when is_binary(npc_id) and is_list(query_embedding) do
    limit = Keyword.get(opts, :limit, 5)
    threshold = Keyword.get(opts, :threshold, 0.0)

    sql = """
    SELECT id, npc_id, memory_type, content, importance, metadata_json,
           vector_cosine_similarity(embedding, $1) AS similarity
    FROM npc_semantic_memories
    WHERE npc_id = $2
      AND embedding IS NOT NULL
      AND vector_cosine_similarity(embedding, $1) >= $3
    ORDER BY similarity DESC
    LIMIT $4
    """

    case Repo.query(sql, [query_embedding, npc_id, threshold, limit]) do
      {:ok, %{rows: rows}} ->
        memories =
          Enum.map(rows, fn [id, n_id, m_type, cont, imp, meta, sim] ->
            %{
              id: id,
              npc_id: n_id,
              memory_type: m_type,
              content: cont,
              importance: imp,
              metadata: parse_meta(meta),
              similarity: sim
            }
          end)

        {:ok, memories}

      {:error, reason} = err ->
        Logger.error("[SemanticMemory] Search error: #{inspect(reason)}")
        err
    end
  end

  @doc """
  Retrieves recent memories for an NPC ordered chronologically.
  """
  def list_recent(npc_id, limit \\ 10) when is_binary(npc_id) and is_integer(limit) do
    sql = """
    SELECT id, npc_id, memory_type, content, importance, metadata_json, created_at
    FROM npc_semantic_memories
    WHERE npc_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT $2
    """

    case Repo.query(sql, [npc_id, limit]) do
      {:ok, %{rows: rows}} ->
        memories =
          Enum.map(rows, fn [id, n_id, m_type, cont, imp, meta, created_at] ->
            %{
              id: id,
              npc_id: n_id,
              memory_type: m_type,
              content: cont,
              importance: imp,
              metadata: parse_meta(meta),
              created_at: created_at
            }
          end)

        {:ok, memories}

      {:error, reason} = err ->
        Logger.error("[SemanticMemory] list_recent error: #{inspect(reason)}")
        err
    end
  end

  defp parse_meta(meta) when is_binary(meta) do
    case Jason.decode(meta) do
      {:ok, parsed} -> parsed
      _ -> %{}
    end
  end

  defp parse_meta(%{} = meta), do: meta
  defp parse_meta(_), do: %{}

  @doc """
  Deletes a memory by ID.
  """
  def delete(id) when is_integer(id) do
    case Repo.query("DELETE FROM npc_semantic_memories WHERE id = $1", [id]) do
      {:ok, _} -> :ok
      {:error, reason} = err -> err
    end
  end
end
