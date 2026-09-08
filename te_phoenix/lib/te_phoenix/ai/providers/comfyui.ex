defmodule TePhoenix.AI.Providers.ComfyUI do
  @moduledoc """
  Local GPU provider for ComfyUI running on `http://127.0.0.1:8188`.
  Executes pixel-art tileset and sprite generation locally on the host's GPU
  (NVIDIA GeForce GTX 1660 SUPER or better) with zero cloud fees.
  """

  require Logger

  @default_url "http://127.0.0.1:8188"

  @doc "Get active ComfyUI endpoint URL."
  def endpoint do
    System.get_env("COMFYUI_URL") || @default_url
  end

  @doc "Check if local ComfyUI server is online and query GPU status."
  def status do
    url = "#{endpoint()}/system_stats"
    case Req.get(url, receive_timeout: 2_000) do
      {:ok, %{status: 200, body: body}} ->
        devices = get_in(body, ["devices"]) || []
        gpu_name =
          case devices do
            [first | _] -> first["name"] || "NVIDIA GPU"
            _ -> "Local GPU"
          end

        {:ok, %{online: true, gpu: gpu_name, vram_free_gb: get_vram_free(devices)}}

      _ ->
        {:error, :offline}
    end
  end

  @doc """
  Generates a 512x512 pixel art tileset sheet using the local SD 1.5 model.
  Returns `{:ok, relative_web_path}` or `{:error, reason}`.
  """
  def generate_tileset(prompt, opts \\ []) do
    steps = Keyword.get(opts, :steps, 20)
    cfg = Keyword.get(opts, :cfg, 7.5)
    seed = Keyword.get(opts, :seed, :rand.uniform(1_000_000_000))
    ckpt_name = Keyword.get(opts, :checkpoint, "v1-5-pruned-emaonly.safetensors")

    positive_prompt = "pixel art 32x32 tileset, 16-bit RPG, #{prompt}, top-down view, seamless textures, high quality, clean pixel grid"
    negative_prompt = "blurry, 3d render, photo, realistic, deformed, noisy, text, watermark, isometric, perspective angle"

    workflow = build_sd15_workflow(ckpt_name, positive_prompt, negative_prompt, seed, steps, cfg, "TwistedTileset")

    case Req.post("#{endpoint()}/prompt", json: %{"prompt" => workflow}, receive_timeout: 60_000) do
      {:ok, %{status: 200, body: %{"prompt_id" => prompt_id}}} ->
        poll_and_fetch_output(prompt_id, 30, :tilesets)

      {:ok, %{status: status, body: body}} ->
        {:error, "ComfyUI returned #{status}: #{inspect(body)}"}

      {:error, reason} ->
        {:error, "ComfyUI connection failed: #{inspect(reason)}"}
    end
  end

  @doc """
  Generates a 512x512 pixel art character sprite sheet using the local SD 1.5 model.
  Produces 4-direction character walk/action sprites on a solid black/dark background.
  Returns `{:ok, relative_web_path}` or `{:error, reason}`.
  """
  def generate_sprite(prompt, opts \\ []) do
    steps = Keyword.get(opts, :steps, 20)
    cfg = Keyword.get(opts, :cfg, 7.5)
    seed = Keyword.get(opts, :seed, :rand.uniform(1_000_000_000))
    ckpt_name = Keyword.get(opts, :checkpoint, "v1-5-pruned-emaonly.safetensors")

    positive_prompt = "pixel art character sprite sheet, 16-bit RPG game character, #{prompt}, front back left right walk frames, clean pixel outlines, solid dark background, retro masterwork, sharp sprite details"
    negative_prompt = "blurry, 3d render, smooth gradients, photo, realistic human, extra limbs, messy background, text, watermark, compression artifacts"

    workflow = build_sd15_workflow(ckpt_name, positive_prompt, negative_prompt, seed, steps, cfg, "TwistedSprite")

    case Req.post("#{endpoint()}/prompt", json: %{"prompt" => workflow}, receive_timeout: 60_000) do
      {:ok, %{status: 200, body: %{"prompt_id" => prompt_id}}} ->
        poll_and_fetch_output(prompt_id, 30, :sprites)

      {:ok, %{status: status, body: body}} ->
        {:error, "ComfyUI returned #{status}: #{inspect(body)}"}

      {:error, reason} ->
        {:error, "ComfyUI connection failed: #{inspect(reason)}"}
    end
  end

  @doc """
  Generates a 512x512 pixel art character portrait using the local SD 1.5 model.
  Returns `{:ok, relative_web_path}` or `{:error, reason}`.
  """
  def generate_portrait(prompt, opts \\ []) do
    steps = Keyword.get(opts, :steps, 20)
    cfg = Keyword.get(opts, :cfg, 7.5)
    seed = Keyword.get(opts, :seed, :rand.uniform(1_000_000_000))
    ckpt_name = Keyword.get(opts, :checkpoint, "v1-5-pruned-emaonly.safetensors")

    positive_prompt = "pixel art character portrait, bust shot, dramatic lighting, 16-bit RPG character avatar, #{prompt}, sharp expressive eyes, masterwork pixel portrait, clean dark background"
    negative_prompt = "blurry, 3d render, photo, photorealistic, deformed face, distorted eyes, text, watermark, bad anatomy"

    workflow = build_sd15_workflow(ckpt_name, positive_prompt, negative_prompt, seed, steps, cfg, "TwistedPortrait")

    case Req.post("#{endpoint()}/prompt", json: %{"prompt" => workflow}, receive_timeout: 60_000) do
      {:ok, %{status: 200, body: %{"prompt_id" => prompt_id}}} ->
        poll_and_fetch_output(prompt_id, 30, :portraits)

      {:ok, %{status: status, body: body}} ->
        {:error, "ComfyUI returned #{status}: #{inspect(body)}"}

      {:error, reason} ->
        {:error, "ComfyUI connection failed: #{inspect(reason)}"}
    end
  end

  # Build standard SD 1.5 graph for ComfyUI
  defp build_sd15_workflow(ckpt, pos_prompt, neg_prompt, seed, steps, cfg, prefix) do
    %{
      "1" => %{
        "class_type" => "CheckpointLoaderSimple",
        "inputs" => %{"ckpt_name" => ckpt}
      },
      "2" => %{
        "class_type" => "CLIPTextEncode",
        "inputs" => %{"clip" => ["1", 1], "text" => pos_prompt}
      },
      "3" => %{
        "class_type" => "CLIPTextEncode",
        "inputs" => %{"clip" => ["1", 1], "text" => neg_prompt}
      },
      "4" => %{
        "class_type" => "EmptyLatentImage",
        "inputs" => %{"batch_size" => 1, "height" => 512, "width" => 512}
      },
      "5" => %{
        "class_type" => "KSampler",
        "inputs" => %{
          "cfg" => cfg,
          "denoise" => 1.0,
          "latent_image" => ["4", 0],
          "model" => ["1", 0],
          "negative" => ["3", 0],
          "positive" => ["2", 0],
          "sampler_name" => "euler_ancestral",
          "scheduler" => "normal",
          "seed" => seed,
          "steps" => steps
        }
      },
      "6" => %{
        "class_type" => "VAEDecode",
        "inputs" => %{"samples" => ["5", 0], "vae" => ["1", 2]}
      },
      "7" => %{
        "class_type" => "SaveImage",
        "inputs" => %{"filename_prefix" => prefix, "images" => ["6", 0]}
      }
    }
  end

  defp poll_and_fetch_output(prompt_id, attempts \\ 30, kind \\ :tilesets)
  defp poll_and_fetch_output(_prompt_id, 0, _kind), do: {:error, :timeout}
  defp poll_and_fetch_output(prompt_id, attempts, kind) do
    :timer.sleep(1_000)

    case Req.get("#{endpoint()}/history/#{prompt_id}", receive_timeout: 5_000) do
      {:ok, %{status: 200, body: body}} ->
        case get_in(body, [prompt_id, "outputs", "7", "images"]) do
          [%{"filename" => filename} | _] ->
            # Fetch image binary from ComfyUI view endpoint
            fetch_and_save_image(filename, kind)

          _ ->
            poll_and_fetch_output(prompt_id, attempts - 1, kind)
        end

      _ ->
        poll_and_fetch_output(prompt_id, attempts - 1, kind)
    end
  end

  defp fetch_and_save_image(filename, kind) do
    view_url = "#{endpoint()}/view?filename=#{filename}&type=output"

    case Req.get(view_url, receive_timeout: 10_000) do
      {:ok, %{status: 200, body: binary}} when is_binary(binary) ->
        subdir =
          case kind do
            :sprites -> "sprites"
            :portraits -> "portraits"
            _ -> "tilesets"
          end

        out_dir = Path.join(:code.priv_dir(:te_phoenix), "static/#{subdir}")
        File.mkdir_p!(out_dir)

        prefix =
          case kind do
            :sprites -> "ai_sprite"
            :portraits -> "ai_portrait"
            _ -> "ai_tileset"
          end

        dest_name = "#{prefix}_#{System.system_time(:second)}.png"
        dest_path = Path.join(out_dir, dest_name)
        File.write!(dest_path, binary)

        {:ok, "/#{subdir}/#{dest_name}"}

      error ->
        {:error, "Failed to download generated asset: #{inspect(error)}"}
    end
  end

  defp get_vram_free([%{"vram_free" => free} | _]) when is_number(free) do
    Float.round(free / (1024 * 1024 * 1024), 2)
  end
  defp get_vram_free(_), do: 0.0
end
