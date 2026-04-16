defmodule TePhoenix.Mods.ModPacks do
  @moduledoc """
  Export and import game content as mod packs.

  A mod pack is a JSON bundle containing selected game content (maps, items,
  NPCs, skills, status effects, trigger rules, visual scripts, objectives,
  surfaces, wave sequences) with metadata. Packs can be exported, shared,
  and imported into other game instances.

  ## Conflict resolution on import

  When importing content that already exists (matched by key/name):
    * `:skip` — skip existing, only import new (default)
    * `:overwrite` — replace existing with imported data
    * `:rename` — import with a suffix to avoid collision

  ## Tables

    * `game_mod_packs` — registry of exported packs with metadata
  """

  require Logger
  alias TePhoenix.Repo

  @packs_table "game_mod_packs"
  @version "1.0"

  @exportable_types ~w(maps items npcs skills statuses rules scripts objectives surfaces waves)a

  @source_tables %{
    maps: "game_maps",
    items: "game_items",
    npcs: "game_npcs",
    skills: "game_skills",
    statuses: "game_battle_statuses",
    rules: "game_battle_rules",
    scripts: "game_visual_scripts",
    objectives: "game_objective_defs",
    surfaces: "game_surface_defs",
    waves: "game_wave_defs"
  }

  # ── Setup ───────────────────────────────────────────────────────

  def ensure_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@packs_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      slug VARCHAR(200) NOT NULL,
      description TEXT,
      author_id INT,
      version VARCHAR(20) DEFAULT '1.0',
      contents_json LONGTEXT,
      bundle_json LONGTEXT,
      exported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_slug (slug)
    )
    """)

    Logger.info("[ModPacks] tables ensured")
  end

  # ── Export ──────────────────────────────────────────────────────

  @doc """
  Export selected content as a mod pack JSON bundle.

  Options:
    * `:description` — pack description
    * `:author_id` — user who created the pack
    * `:maps` — list of map IDs to include, or `:all`
    * `:items` — list of item IDs or `:all`
    * `:npcs` — list of NPC IDs or `:all`
    * `:skills` — list of skill IDs or `:all`
    * `:statuses` — list of status IDs or `:all`
    * `:rules` — list of rule IDs or `:all`
    * `:scripts` — list of script IDs or `:all`
    * `:objectives` — list of objective IDs or `:all`
    * `:surfaces` — list of surface IDs or `:all`
    * `:waves` — list of wave IDs or `:all`

  Returns `{:ok, json_string}` or `{:error, reason}`.
  """
  def export(name, opts \\ []) when is_binary(name) do
    ensure_tables()

    bundle = %{
      meta: %{
        name: name,
        version: @version,
        exported_at: DateTime.utc_now() |> DateTime.to_iso8601(),
        engine: "TwistedEngine",
        author_id: Keyword.get(opts, :author_id),
        description: Keyword.get(opts, :description, "")
      },
      content: %{}
    }

    content =
      @exportable_types
      |> Enum.reduce(%{}, fn type, acc ->
        case Keyword.get(opts, type) do
          nil -> acc
          selection -> Map.put(acc, type, export_type(type, selection))
        end
      end)

    bundle = put_in(bundle.content, content)

    contents_summary =
      content
      |> Enum.map(fn {type, rows} -> %{type: type, count: length(rows)} end)

    json = Jason.encode!(bundle, pretty: true)
    slug = slugify(name)

    Repo.query(
      """
      INSERT INTO #{@packs_table} (name, slug, description, author_id, version, contents_json, bundle_json, exported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        name = VALUES(name), description = VALUES(description),
        contents_json = VALUES(contents_json), bundle_json = VALUES(bundle_json),
        exported_at = NOW()
      """,
      [
        name,
        slug,
        Keyword.get(opts, :description, ""),
        Keyword.get(opts, :author_id),
        @version,
        Jason.encode!(contents_summary),
        json
      ]
    )

    Logger.info("[ModPacks] exported pack '#{name}' with #{map_size(content)} content types")
    {:ok, json}
  rescue
    e ->
      Logger.error("[ModPacks] export failed: #{inspect(e)}")
      {:error, inspect(e)}
  end

  defp export_type(type, :all) do
    table = Map.fetch!(@source_tables, type)

    case Repo.query("SELECT * FROM #{table}") do
      {:ok, %{columns: cols, rows: rows}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)

      _ ->
        []
    end
  end

  defp export_type(type, ids) when is_list(ids) do
    table = Map.fetch!(@source_tables, type)

    if ids == [] do
      []
    else
      placeholders = Enum.map_join(ids, ", ", fn _ -> "?" end)

      case Repo.query("SELECT * FROM #{table} WHERE id IN (#{placeholders})", ids) do
        {:ok, %{columns: cols, rows: rows}} ->
          Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)

        _ ->
          []
      end
    end
  end

  # ── Import ─────────────────────────────────────────────────────

  @doc """
  Import a mod pack from a JSON bundle string.

  Options:
    * `:conflict` — `:skip` (default), `:overwrite`, or `:rename`
    * `:dry_run` — if true, returns preview without importing

  Returns `{:ok, %{imported: count, skipped: count, errors: count}}`.
  """
  def import(json_bundle, opts \\ []) when is_binary(json_bundle) do
    ensure_tables()
    conflict = Keyword.get(opts, :conflict, :skip)
    dry_run = Keyword.get(opts, :dry_run, false)

    case Jason.decode(json_bundle) do
      {:ok, %{"content" => content, "meta" => meta}} ->
        Logger.info("[ModPacks] importing pack '#{meta["name"]}' (conflict=#{conflict}, dry_run=#{dry_run})")

        results =
          content
          |> Enum.reduce(%{imported: 0, skipped: 0, errors: 0, details: []}, fn {type_str, rows}, acc ->
            type = safe_atom(type_str)

            if type in @exportable_types do
              import_rows(type, rows, conflict, dry_run, acc)
            else
              Logger.warning("[ModPacks] unknown content type: #{type_str}")
              acc
            end
          end)

        Logger.info("[ModPacks] import complete: #{results.imported} imported, #{results.skipped} skipped, #{results.errors} errors")
        {:ok, results}

      {:ok, _} ->
        {:error, :invalid_bundle_format}

      {:error, reason} ->
        {:error, {:json_parse_error, reason}}
    end
  rescue
    e ->
      Logger.error("[ModPacks] import failed: #{inspect(e)}")
      {:error, inspect(e)}
  end

  defp import_rows(_type, rows, _conflict, _dry_run, acc) when rows == [], do: acc

  defp import_rows(type, rows, conflict, dry_run, acc) do
    table = Map.fetch!(@source_tables, type)

    Enum.reduce(rows, acc, fn row, inner_acc ->
      row_name = row["name"] || row["key"] || row["id"]

      if dry_run do
        detail = %{type: type, name: row_name, action: :would_import}
        %{inner_acc | details: [detail | inner_acc.details]}
      else
        case check_existing(table, row) do
          {:exists, existing_id} ->
            handle_conflict(table, row, existing_id, conflict, type, row_name, inner_acc)

          :not_found ->
            case insert_row(table, row) do
              :ok ->
                %{inner_acc | imported: inner_acc.imported + 1,
                  details: [%{type: type, name: row_name, action: :imported} | inner_acc.details]}

              {:error, reason} ->
                Logger.warning("[ModPacks] failed to import #{type}/#{row_name}: #{inspect(reason)}")
                %{inner_acc | errors: inner_acc.errors + 1,
                  details: [%{type: type, name: row_name, action: :error, reason: reason} | inner_acc.details]}
            end
        end
      end
    end)
  end

  defp check_existing(table, row) do
    name = row["name"]
    key = row["key"]

    cond do
      name ->
        case Repo.query("SELECT id FROM #{table} WHERE name = ? LIMIT 1", [name]) do
          {:ok, %{rows: [[id]]}} -> {:exists, id}
          _ -> :not_found
        end

      key ->
        case Repo.query("SELECT id FROM #{table} WHERE `key` = ? LIMIT 1", [key]) do
          {:ok, %{rows: [[id]]}} -> {:exists, id}
          _ -> :not_found
        end

      true ->
        :not_found
    end
  end

  defp handle_conflict(table, row, existing_id, conflict, type, row_name, acc) do
    case conflict do
      :skip ->
        %{acc | skipped: acc.skipped + 1,
          details: [%{type: type, name: row_name, action: :skipped} | acc.details]}

      :overwrite ->
        case update_row(table, existing_id, row) do
          :ok ->
            %{acc | imported: acc.imported + 1,
              details: [%{type: type, name: row_name, action: :overwritten} | acc.details]}

          {:error, _} ->
            %{acc | errors: acc.errors + 1,
              details: [%{type: type, name: row_name, action: :error} | acc.details]}
        end

      :rename ->
        renamed_row =
          cond do
            row["name"] -> Map.put(row, "name", row["name"] <> "_imported_#{System.unique_integer([:positive])}")
            row["key"] -> Map.put(row, "key", row["key"] <> "_imported_#{System.unique_integer([:positive])}")
            true -> row
          end

        case insert_row(table, renamed_row) do
          :ok ->
            %{acc | imported: acc.imported + 1,
              details: [%{type: type, name: row_name, action: :renamed} | acc.details]}

          {:error, _} ->
            %{acc | errors: acc.errors + 1,
              details: [%{type: type, name: row_name, action: :error} | acc.details]}
        end
    end
  end

  defp insert_row(table, row) do
    row_without_id = Map.drop(row, ["id"])
    columns = Map.keys(row_without_id)
    values = Map.values(row_without_id)

    if columns == [] do
      {:error, :empty_row}
    else
      cols_str = Enum.map_join(columns, ", ", &"`#{&1}`")
      placeholders = Enum.map_join(columns, ", ", fn _ -> "?" end)

      case Repo.query("INSERT INTO #{table} (#{cols_str}) VALUES (#{placeholders})", values) do
        {:ok, _} -> :ok
        {:error, reason} -> {:error, reason}
      end
    end
  end

  defp update_row(table, id, row) do
    row_without_id = Map.drop(row, ["id"])
    columns = Map.keys(row_without_id)
    values = Map.values(row_without_id)

    if columns == [] do
      {:error, :empty_row}
    else
      set_str = Enum.map_join(columns, ", ", &"`#{&1}` = ?")

      case Repo.query("UPDATE #{table} SET #{set_str} WHERE id = ?", values ++ [id]) do
        {:ok, _} -> :ok
        {:error, reason} -> {:error, reason}
      end
    end
  end

  # ── Preview ────────────────────────────────────────────────────

  @doc """
  Preview what a bundle contains without importing.
  Returns `{:ok, summary}` with type counts and sample names.
  """
  def preview_import(json_bundle) when is_binary(json_bundle) do
    case Jason.decode(json_bundle) do
      {:ok, %{"content" => content, "meta" => meta}} ->
        summary =
          content
          |> Enum.map(fn {type_str, rows} ->
            sample_names =
              rows
              |> Enum.take(5)
              |> Enum.map(fn row -> row["name"] || row["key"] || "unnamed" end)

            %{
              type: type_str,
              count: length(rows),
              sample_names: sample_names
            }
          end)

        {:ok, %{meta: meta, content_summary: summary, total_items: Enum.reduce(summary, 0, &(&1.count + &2))}}

      {:ok, _} ->
        {:error, :invalid_bundle_format}

      {:error, reason} ->
        {:error, {:json_parse_error, reason}}
    end
  end

  # ── List / Delete ──────────────────────────────────────────────

  @doc "List all exported mod packs."
  def list_packs do
    ensure_tables()

    case Repo.query(
           "SELECT id, name, slug, description, author_id, version, contents_json, exported_at FROM #{@packs_table} ORDER BY exported_at DESC"
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, name, slug, desc, author, ver, contents, exported] ->
          %{
            id: id,
            name: name,
            slug: slug,
            description: desc,
            author_id: author,
            version: ver,
            contents: decode_json(contents, []),
            exported_at: exported
          }
        end)

      _ ->
        []
    end
  end

  @doc "Delete a mod pack by ID."
  def delete_pack(id) do
    ensure_tables()

    case Repo.query("DELETE FROM #{@packs_table} WHERE id = ?", [id]) do
      {:ok, _} ->
        Logger.info("[ModPacks] deleted pack id=#{id}")
        :ok

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc "Get the full bundle JSON for a pack by ID."
  def get_pack_bundle(id) do
    ensure_tables()

    case Repo.query("SELECT bundle_json FROM #{@packs_table} WHERE id = ?", [id]) do
      {:ok, %{rows: [[json]]}} when is_binary(json) -> {:ok, json}
      _ -> {:error, :not_found}
    end
  end

  # ── Helpers ────────────────────────────────────────────────────

  defp slugify(name) do
    name
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9\s-]/, "")
    |> String.replace(~r/\s+/, "-")
    |> String.trim("-")
    |> String.slice(0, 200)
  end

  defp safe_atom(str) when is_binary(str) do
    try do
      String.to_existing_atom(str)
    rescue
      ArgumentError -> String.to_atom(str)
    end
  end

  defp decode_json(nil, default), do: default
  defp decode_json("", default), do: default

  defp decode_json(json, default) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, data} -> data
      _ -> default
    end
  end

  defp decode_json(data, _default) when is_list(data) or is_map(data), do: data
  defp decode_json(_, default), do: default
end
