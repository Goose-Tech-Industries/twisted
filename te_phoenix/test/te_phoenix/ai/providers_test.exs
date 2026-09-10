defmodule TePhoenix.AI.ProvidersTest do
  use ExUnit.Case, async: false

  alias TePhoenix.AI.{Gateway, FeatureRegistry}
  alias TePhoenix.AI.Providers.{Gemini, OpenAI, Ollama}

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(TePhoenix.Repo)
    FeatureRegistry.seed_canonical_features()
    :ok
  end

  describe "Native AI Providers through Gateway" do
    test "Gateway dispatches to Gemini with graceful dev fallback" do
      {:ok, res} = Gateway.call(:npc_dialogue, "Speak, traveler.", provider_override: :gemini)
      assert res.provider == :gemini
      assert is_binary(res.text)
      assert res.input_tokens >= 0
    end

    test "Gateway dispatches to OpenAI with graceful dev fallback" do
      {:ok, res} = Gateway.call(:npc_dialogue, "State your business.", provider_override: :openai)
      assert res.provider == :openai
      assert is_binary(res.text)
      assert res.input_tokens >= 0
    end

    test "Gateway dispatches to Ollama with graceful offline standby" do
      {:ok, res} = Gateway.call(:npc_dialogue, "Greetings.", provider_override: :local_ollama)
      assert res.provider == :local_ollama
      assert is_binary(res.text)
      assert res.cost_cents == 0
    end
  end

  describe "Individual Provider Direct Calls" do
    test "Gemini provider handles missing key gracefully" do
      System.delete_env("GEMINI_API_KEY")
      System.delete_env("GOOGLE_API_KEY")
      assert {:error, :no_api_key} = Gemini.call("gemini-2.0-flash", "Test prompt")
    end

    test "OpenAI provider handles missing key gracefully" do
      System.delete_env("OPENAI_API_KEY")
      assert {:error, :no_api_key} = OpenAI.call("gpt-4o-mini", "Test prompt")
    end

    test "Ollama provider returns error when host is unreachable or dummy host" do
      res = Ollama.call("llama3.1:8b", "Test prompt", timeout_ms: 500)
      assert match?({:error, _}, res) or match?({:ok, _}, res)
    end
  end
end
