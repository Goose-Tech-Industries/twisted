defmodule TePhoenix.AI.SemanticMemoryTest do
  use ExUnit.Case, async: false

  alias TePhoenix.AI.SemanticMemory

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(TePhoenix.Repo)
    :ok
  end

  describe "PostgreSQL 16 Vector Semantic Memory" do
    test "stores memory with JSONB metadata and vector embedding" do
      embedding = [1.0, 0.0, 0.0]
      metadata = %{"emotion" => "fear", "location" => "tavern_cellar"}

      {:ok, mem} =
        SemanticMemory.store("olaf_the_drunk", "He remembers the shield wall command.",
          embedding: embedding,
          metadata: metadata,
          importance: 1.5
        )

      assert is_integer(mem.id)
      assert mem.npc_id == "olaf_the_drunk"
      assert mem.content == "He remembers the shield wall command."
      assert mem.importance == 1.5
      assert mem.metadata["emotion"] == "fear"
    end

    test "performs vector cosine similarity search" do
      # Store two distinct memories with known vectors
      {:ok, _} =
        SemanticMemory.store("barnaby_merchant", "Barnaby hid the runic lockpicks under the floorboards.",
          embedding: [1.0, 0.0, 0.0]
        )

      {:ok, _} =
        SemanticMemory.store("barnaby_merchant", "Barnaby loves selling stale cabbage.",
          embedding: [0.0, 1.0, 0.0]
        )

      # Query vector strongly pointing along the first vector: [0.9, 0.1, 0.0]
      query_vec = [0.9, 0.1, 0.0]
      {:ok, results} = SemanticMemory.search("barnaby_merchant", query_vec, limit: 2)

      assert length(results) == 2
      [top | _] = results
      assert top.content =~ "runic lockpicks"
      assert top.similarity > 0.8
    end

    test "lists recent memories chronologically and deletes by ID" do
      {:ok, m1} = SemanticMemory.store("kip_apprentice", "First memory")
      {:ok, m2} = SemanticMemory.store("kip_apprentice", "Second memory")

      {:ok, list} = SemanticMemory.list_recent("kip_apprentice", 5)
      ids = Enum.map(list, & &1.id)
      assert m2.id in ids
      assert m1.id in ids

      assert :ok = SemanticMemory.delete(m1.id)
      {:ok, remaining} = SemanticMemory.list_recent("kip_apprentice", 5)
      refute m1.id in Enum.map(remaining, & &1.id)
    end
  end
end
