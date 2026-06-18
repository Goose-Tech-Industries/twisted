defmodule TePhoenixWeb.Admin.AiApplyHelpers do
  @moduledoc """
  Tier α-AI: shared merge helpers for `ai:apply_*` LV handlers.

  When the user clicks Accept on an AiAssist suggestion, the parent
  LV gets `%{"suggestion" => json_string}`. This module decodes it
  and merges accepted fields into an existing form/editing map. The
  point is to make per-LV `ai:apply_X` clauses one-liners.

  All helpers preserve the original map's existing values when the
  suggestion doesn't include the field — never wipes data.
  """

  @doc """
  Merge a JSON suggestion into a map (typically `@editing` or
  `@form_data`). Only keys present in `allowed_keys` are merged;
  unknown keys are dropped (defense against AI hallucinating
  schema fields). Lists/maps in the suggestion get JSON-encoded
  into the destination string field.

  ## Example

      defp accept_rule(suggestion_json, editing) do
        AiApplyHelpers.merge(suggestion_json, editing,
          ~w(name description trigger condition_json effect_json))
      end
  """
  def merge(json, target, allowed_keys) when is_binary(json) and is_map(target) do
    case Jason.decode(json) do
      {:ok, %{} = parsed} ->
        Enum.reduce(allowed_keys, target, fn key, acc ->
          str_key = to_string(key)

          case Map.get(parsed, str_key) || Map.get(parsed, String.to_atom(str_key)) do
            nil -> acc
            "" -> acc
            v -> Map.put(acc, str_key, encode_for_field(v))
          end
        end)

      _ ->
        # Non-JSON response → stuff into description if allowed
        if "description" in allowed_keys do
          Map.put(target, "description", json)
        else
          target
        end
    end
  end

  def merge(_, target, _), do: target

  @doc "Same as merge/3 but with a key-rename map (suggestion_key → form_key)."
  def merge_renamed(json, target, key_map)
      when is_binary(json) and is_map(target) and is_map(key_map) do
    case Jason.decode(json) do
      {:ok, %{} = parsed} ->
        Enum.reduce(key_map, target, fn {src, dst}, acc ->
          src_str = to_string(src)
          dst_str = to_string(dst)

          case Map.get(parsed, src_str) do
            nil -> acc
            "" -> acc
            v -> Map.put(acc, dst_str, encode_for_field(v))
          end
        end)

      _ ->
        target
    end
  end

  def merge_renamed(_, target, _), do: target

  defp encode_for_field(v) when is_binary(v), do: v
  defp encode_for_field(v) when is_number(v), do: to_string(v)
  defp encode_for_field(v) when is_boolean(v), do: to_string(v)
  defp encode_for_field(nil), do: ""
  defp encode_for_field(v), do: Jason.encode!(v)
end
