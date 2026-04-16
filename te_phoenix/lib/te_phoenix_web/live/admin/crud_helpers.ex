defmodule TePhoenixWeb.Admin.CrudHelpers do
  @moduledoc """
  Shared CRUD logic for all admin hub pages.
  Each hub defines its tabs as {label, table_name} pairs.
  This module provides load, create, edit, delete, search, pagination.
  """

  alias TePhoenix.Repo

  @table_name_re ~r/^[a-z_][a-z0-9_]*$/

  defp safe_table!(table) do
    t = to_string(table)
    unless t =~ @table_name_re, do: raise(ArgumentError, "invalid table name: #{inspect(t)}")
    "`#{t}`"
  end

  # ── Load data for current tab ──────────────────────────────────
  def load_tab_data(socket, table, opts \\ []) do
    per_page = opts[:per_page] || 30
    page = socket.assigns[:page] || 1
    search = socket.assigns[:search] || ""
    offset = (page - 1) * per_page
    tbl = safe_table!(table)

    # Get column metadata
    column_types = case Repo.query("SHOW COLUMNS FROM #{tbl}") do
      {:ok, %{rows: rows}} ->
        for [field, type, null, _key, default, _extra] <- rows, into: %{} do
          {field, %{type: type, default: default, nullable: null == "YES"}}
        end
      _ -> %{}
    end

    columns = Map.keys(column_types) |> Enum.sort_by(fn c -> if c == "id", do: "0", else: c end)

    # Count
    {count_sql, count_params} = if search != "" do
      where = columns |> Enum.map(fn c -> "CAST(`#{c}` AS CHAR) LIKE ?" end) |> Enum.join(" OR ")
      {"SELECT COUNT(*) FROM #{tbl} WHERE #{where}", List.duplicate("%#{search}%", length(columns))}
    else
      {"SELECT COUNT(*) FROM #{tbl}", []}
    end

    total = case Repo.query(count_sql, count_params) do
      {:ok, %{rows: [[c]]}} -> c
      _ -> 0
    end

    # Fetch
    {select_sql, select_params} = if search != "" do
      where = columns |> Enum.map(fn c -> "CAST(`#{c}` AS CHAR) LIKE ?" end) |> Enum.join(" OR ")
      {"SELECT * FROM #{tbl} WHERE #{where} ORDER BY id DESC LIMIT ? OFFSET ?",
       List.duplicate("%#{search}%", length(columns)) ++ [per_page, offset]}
    else
      {"SELECT * FROM #{tbl} ORDER BY id DESC LIMIT ? OFFSET ?", [per_page, offset]}
    end

    {rows, _cols} = case Repo.query(select_sql, select_params) do
      {:ok, %{rows: r, columns: c}} -> {r, c}
      _ -> {[], []}
    end

    row_maps = Enum.map(rows, fn row -> Enum.zip(columns, row) |> Map.new() end)

    Phoenix.Component.assign(socket,
      rows: row_maps,
      columns: columns,
      column_types: column_types,
      total: total,
      current_table: table
    )
  end

  # ── Create record ──────────────────────────────────────────────
  def create_record(table, form_data, column_types) do
    tbl = safe_table!(table)
    cols = Map.keys(form_data)
      |> Enum.filter(fn c -> c != "id" and form_data[c] != nil and form_data[c] != "" end)

    if cols == [] do
      {:error, "At least one field is required"}
    else
      placeholders = Enum.map(cols, fn _ -> "?" end) |> Enum.join(", ")
      col_names = Enum.map(cols, fn c -> "`#{c}`" end) |> Enum.join(", ")
      values = Enum.map(cols, fn c -> cast_value(form_data[c], column_types[c]) end)

      case Repo.query("INSERT INTO #{tbl} (#{col_names}) VALUES (#{placeholders})", values) do
        {:ok, _} -> :ok
        {:error, err} -> {:error, inspect(err)}
      end
    end
  end

  # ── Update record ──────────────────────────────────────────────
  def update_record(table, id, form_data, columns, column_types) do
    id = parse_int(id)
    cond do
      id <= 0 ->
        {:error, "Invalid id"}

      true ->
        tbl = safe_table!(table)
        editable_set = MapSet.new(columns) |> MapSet.delete("id")

        touched =
          form_data
          |> Map.keys()
          |> Enum.filter(fn c -> MapSet.member?(editable_set, c) end)
          |> Enum.filter(fn c ->
            meta = column_types[c] || %{}
            val = form_data[c]
            # Skip blank/nil values on NOT NULL columns so we don't clobber existing data
            not (val in [nil, ""] and meta[:nullable] == false)
          end)

        case touched do
          [] ->
            {:error, "Nothing to update"}

          cols ->
            sets = cols |> Enum.map(fn c -> "`#{c}` = ?" end) |> Enum.join(", ")
            values = Enum.map(cols, fn c -> cast_value(form_data[c], column_types[c]) end) ++ [id]

            case Repo.query("UPDATE #{tbl} SET #{sets} WHERE id = ?", values) do
              {:ok, %{num_rows: n}} when n > 0 -> :ok
              {:ok, _} -> {:error, "Row not found"}
              {:error, err} -> {:error, inspect(err)}
            end
        end
    end
  end

  # ── Delete record ──────────────────────────────────────────────
  def delete_record(table, id) do
    id = parse_int(id)
    cond do
      id <= 0 ->
        {:error, "Invalid id"}

      true ->
        tbl = safe_table!(table)
        case Repo.query("DELETE FROM #{tbl} WHERE id=?", [id]) do
          {:ok, %{num_rows: n}} when n > 0 -> :ok
          {:ok, _} -> {:error, "Row not found"}
          {:error, err} -> {:error, inspect(err)}
        end
    end
  end

  # ── Value casting ──────────────────────────────────────────────
  def cast_value(nil, _), do: nil
  def cast_value("", %{default: default, nullable: false}) when not is_nil(default), do: default
  def cast_value("", _), do: nil
  def cast_value(val, %{type: type}) do
    type_str = String.downcase(to_string(type))
    cond do
      type_str =~ ~r/tinyint\(1\)|boolean/ -> if val in ["1", "true", "on"], do: 1, else: 0
      type_str =~ ~r/int/ ->
        case Integer.parse(to_string(val)) do
          {n, _} -> n
          :error -> val
        end
      type_str =~ ~r/decimal|float|double/ ->
        case Float.parse(to_string(val)) do
          {n, _} -> n
          :error -> val
        end
      true -> to_string(val)
    end
  end
  def cast_value(val, _), do: to_string(val)

  # ── Field type detection ───────────────────────────────────────
  def field_type(column_types, col) do
    meta = column_types[col] || %{type: "varchar(255)"}
    type_str = String.downcase(to_string(meta.type))
    cond do
      type_str =~ ~r/tinyint\(1\)|boolean|bool/ -> :boolean
      type_str =~ ~r/text|longtext|mediumtext|json/ -> :textarea
      type_str =~ ~r/int|decimal|float|double/ -> :number
      true -> :text
    end
  end

  # ── Formatting ─────────────────────────────────────────────────
  def format_cell(nil), do: ""
  def format_cell(val) when is_binary(val) do
    if String.length(val) > 80, do: String.slice(val, 0, 80) <> "...", else: val
  end
  def format_cell(%DateTime{} = dt), do: Calendar.strftime(dt, "%Y-%m-%d %H:%M")
  def format_cell(%NaiveDateTime{} = dt), do: Calendar.strftime(dt, "%Y-%m-%d %H:%M")
  def format_cell(%Date{} = d), do: Date.to_iso8601(d)
  def format_cell(val), do: to_string(val)

  defp parse_int(val) when is_integer(val), do: val
  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp parse_int(_), do: 0
end
