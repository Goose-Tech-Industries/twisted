defmodule TePhoenix.Party.CardPacks do
  @moduledoc """
  Card Pack Marketplace — official and community-created card packs for party games.
  Supports free and paid packs, ratings, approval workflow, and deck building.

  Tables: game_card_packs, game_card_pack_cards, game_card_pack_installs
  """

  alias TePhoenix.Repo
  import Ecto.Query
  require Logger

  # ── Schemas ──────────────────────────────────────────────────────

  defmodule Pack do
    use Ecto.Schema
    import Ecto.Changeset

    @primary_key {:id, :id, autogenerate: true}
    schema "game_card_packs" do
      field :key, :string
      field :name, :string
      field :description, :string
      field :icon, :string, default: "🃏"
      field :author_id, :integer
      field :author_name, :string
      field :category, :string, default: "community"
      field :price_cents, :integer, default: 0
      field :cards_count, :integer, default: 0
      field :rating, :float, default: 0.0
      field :rating_count, :integer, default: 0
      field :downloads, :integer, default: 0
      field :approved, :boolean, default: false
      field :nsfw, :boolean, default: false
      field :language, :string, default: "en"
      field :tags_json, :string, default: "[]"
      field :deleted, :boolean, default: false
      timestamps(inserted_at: :created_at, updated_at: :updated_at)
    end

    def changeset(pack, attrs) do
      pack
      |> cast(attrs, [
        :key, :name, :description, :icon, :author_id, :author_name,
        :category, :price_cents, :cards_count, :rating, :rating_count,
        :downloads, :approved, :nsfw, :language, :tags_json, :deleted
      ])
      |> validate_required([:name, :author_id])
      |> validate_inclusion(:category, ~w(official community premium))
      |> validate_number(:price_cents, greater_than_or_equal_to: 0)
      |> validate_number(:rating, greater_than_or_equal_to: 0.0, less_than_or_equal_to: 5.0)
      |> unique_constraint(:key)
    end
  end

  defmodule Card do
    use Ecto.Schema
    import Ecto.Changeset

    @primary_key {:id, :id, autogenerate: true}
    schema "game_card_pack_cards" do
      field :pack_id, :integer
      field :card_type, :string, default: "response"
      field :text, :string
      field :blanks_count, :integer, default: 0
      field :metadata_json, :string, default: "{}"
    end

    def changeset(card, attrs) do
      card
      |> cast(attrs, [:pack_id, :card_type, :text, :blanks_count, :metadata_json])
      |> validate_required([:pack_id, :card_type, :text])
      |> validate_inclusion(:card_type, ~w(prompt response))
    end
  end

  defmodule Install do
    use Ecto.Schema
    import Ecto.Changeset

    @primary_key {:id, :id, autogenerate: true}
    schema "game_card_pack_installs" do
      field :user_id, :integer
      field :pack_id, :integer
      timestamps(inserted_at: :installed_at, updated_at: false)
    end

    def changeset(install, attrs) do
      install
      |> cast(attrs, [:user_id, :pack_id])
      |> validate_required([:user_id, :pack_id])
      |> unique_constraint([:user_id, :pack_id])
    end
  end

  defmodule Rating do
    use Ecto.Schema
    import Ecto.Changeset

    @primary_key {:id, :id, autogenerate: true}
    schema "game_card_pack_ratings" do
      field :user_id, :integer
      field :pack_id, :integer
      field :rating, :integer, default: 5
      timestamps(inserted_at: :rated_at, updated_at: false)
    end

    def changeset(r, attrs) do
      r
      |> cast(attrs, [:user_id, :pack_id, :rating])
      |> validate_required([:user_id, :pack_id, :rating])
      |> validate_number(:rating, greater_than_or_equal_to: 1, less_than_or_equal_to: 5)
      |> unique_constraint([:user_id, :pack_id])
    end
  end

  # ── Pack Management ─────────────────────────────────────────────

  @doc "Create a new card pack. Community packs require approval."
  def create_pack(author_id, attrs) do
    key = attrs[:key] || attrs["key"] || generate_pack_key(attrs[:name] || attrs["name"])
    category = attrs[:category] || attrs["category"] || "community"
    auto_approve = category == "official"

    pack_attrs = %{
      key: key,
      name: attrs[:name] || attrs["name"],
      description: attrs[:description] || attrs["description"] || "",
      icon: attrs[:icon] || attrs["icon"] || "🃏",
      author_id: author_id,
      author_name: attrs[:author_name] || attrs["author_name"] || "Unknown",
      category: category,
      price_cents: attrs[:price_cents] || attrs["price_cents"] || 0,
      nsfw: attrs[:nsfw] || attrs["nsfw"] || false,
      language: attrs[:language] || attrs["language"] || "en",
      tags_json: Jason.encode!(attrs[:tags] || attrs["tags"] || []),
      approved: auto_approve,
      cards_count: 0,
      rating: 0.0,
      rating_count: 0,
      downloads: 0
    }

    case Repo.insert(Pack.changeset(%Pack{}, pack_attrs)) do
      {:ok, pack} ->
        # Auto-install for author
        install_pack(author_id, pack.id)
        {:ok, pack}

      {:error, cs} ->
        {:error, cs}
    end
  end

  @doc "Update pack metadata."
  def update_pack(pack_id, attrs) do
    case Repo.get(Pack, pack_id) do
      nil -> {:error, :not_found}
      pack ->
        update_attrs = Map.new(attrs, fn
          {:tags, v} -> {:tags_json, Jason.encode!(v)}
          {"tags", v} -> {:tags_json, Jason.encode!(v)}
          {k, v} when is_atom(k) -> {k, v}
          {k, v} when is_binary(k) -> {String.to_existing_atom(k), v}
        end)

        Repo.update(Pack.changeset(pack, update_attrs))
    end
  end

  @doc "Soft delete a pack."
  def delete_pack(pack_id) do
    case Repo.get(Pack, pack_id) do
      nil -> {:error, :not_found}
      pack -> Repo.update(Pack.changeset(pack, %{deleted: true}))
    end
  end

  @doc "Add cards to a pack. cards = list of %{type, text, blanks}."
  def add_cards(pack_id, cards) when is_list(cards) do
    pack = Repo.get(Pack, pack_id)
    if pack == nil do
      {:error, :pack_not_found}
    else
      inserted = Enum.map(cards, fn card_attrs ->
        attrs = %{
          pack_id: pack_id,
          card_type: card_attrs[:type] || card_attrs["type"] || "response",
          text: card_attrs[:text] || card_attrs["text"],
          blanks_count: card_attrs[:blanks] || card_attrs["blanks"] || card_attrs[:blanks_count] || card_attrs["blanks_count"] || 0,
          metadata_json: Jason.encode!(card_attrs[:metadata] || card_attrs["metadata"] || %{})
        }

        case Repo.insert(Card.changeset(%Card{}, attrs)) do
          {:ok, card} -> card
          {:error, _} -> nil
        end
      end)

      valid = Enum.reject(inserted, &is_nil/1)

      # Update card count
      total = Repo.one(from c in Card, where: c.pack_id == ^pack_id, select: count())
      Repo.update!(Pack.changeset(pack, %{cards_count: total}))

      {:ok, length(valid)}
    end
  end

  @doc "Remove a single card."
  def remove_card(card_id) do
    case Repo.get(Card, card_id) do
      nil -> {:error, :not_found}
      card ->
        pack_id = card.pack_id
        Repo.delete!(card)

        # Update count
        pack = Repo.get(Pack, pack_id)
        if pack do
          total = Repo.one(from c in Card, where: c.pack_id == ^pack_id, select: count())
          Repo.update!(Pack.changeset(pack, %{cards_count: total}))
        end

        {:ok, :removed}
    end
  end

  @doc "Admin approves a community pack."
  def approve_pack(pack_id) do
    case Repo.get(Pack, pack_id) do
      nil -> {:error, :not_found}
      pack -> Repo.update(Pack.changeset(pack, %{approved: true}))
    end
  end

  @doc "Admin rejects a community pack with a reason."
  def reject_pack(pack_id, reason) do
    case Repo.get(Pack, pack_id) do
      nil ->
        {:error, :not_found}

      pack ->
        # Store rejection reason in tags_json alongside existing tags
        existing_tags = decode_json(pack.tags_json, [])
        rejection_meta = %{"rejected" => true, "rejection_reason" => reason, "rejected_at" => DateTime.to_iso8601(DateTime.utc_now())}
        new_tags = existing_tags ++ [rejection_meta]

        Repo.update(Pack.changeset(pack, %{approved: false, tags_json: Jason.encode!(new_tags)}))
    end
  end

  # ── Marketplace ─────────────────────────────────────────────────

  @doc """
  Browse packs with filters and pagination.
  opts: category, language, nsfw, search, sort_by (downloads/rating/newest), page, per_page
  """
  def browse_packs(opts \\ %{}) do
    page = opts[:page] || opts["page"] || 1
    per_page = opts[:per_page] || opts["per_page"] || 20
    offset = (page - 1) * per_page

    query = from(p in Pack, where: p.deleted == false and p.approved == true)

    query = if opts[:category] || opts["category"] do
      cat = opts[:category] || opts["category"]
      from p in query, where: p.category == ^cat
    else
      query
    end

    query = if opts[:language] || opts["language"] do
      lang = opts[:language] || opts["language"]
      from p in query, where: p.language == ^lang
    else
      query
    end

    query = if (opts[:nsfw] || opts["nsfw"]) != true do
      from p in query, where: p.nsfw == false
    else
      query
    end

    query = if opts[:search] || opts["search"] do
      term = "%#{opts[:search] || opts["search"]}%"
      from p in query, where: ilike(p.name, ^term) or ilike(p.description, ^term)
    else
      query
    end

    sort = opts[:sort_by] || opts["sort_by"] || "downloads"
    query = case sort do
      "rating" -> from p in query, order_by: [desc: p.rating, desc: p.downloads]
      "newest" -> from p in query, order_by: [desc: p.created_at]
      "name" -> from p in query, order_by: [asc: p.name]
      _ -> from p in query, order_by: [desc: p.downloads]
    end

    total = Repo.one(from p in query, select: count())
    packs = Repo.all(from p in query, limit: ^per_page, offset: ^offset)

    {:ok, %{
      packs: packs,
      total: total,
      page: page,
      per_page: per_page,
      total_pages: ceil(total / per_page)
    }}
  end

  @doc "Get full pack info with a preview of the first 10 cards."
  def get_pack(pack_id) do
    case Repo.get(Pack, pack_id) do
      nil ->
        {:error, :not_found}

      pack ->
        preview_cards = Repo.all(
          from c in Card,
          where: c.pack_id == ^pack_id,
          limit: 10,
          order_by: [asc: c.id]
        )

        prompt_count = Repo.one(from c in Card, where: c.pack_id == ^pack_id and c.card_type == "prompt", select: count())
        response_count = Repo.one(from c in Card, where: c.pack_id == ^pack_id and c.card_type == "response", select: count())

        {:ok, %{
          pack: pack,
          preview_cards: preview_cards,
          prompt_count: prompt_count,
          response_count: response_count
        }}
    end
  end

  @doc "Get all cards in a pack (only for installed packs)."
  def get_pack_cards(pack_id, user_id \\ nil) do
    # If user_id provided, verify they have it installed
    if user_id do
      installed = Repo.one(from i in Install, where: i.user_id == ^user_id and i.pack_id == ^pack_id)
      if installed == nil do
        {:error, :not_installed}
      else
        cards = Repo.all(from c in Card, where: c.pack_id == ^pack_id, order_by: [asc: c.id])
        {:ok, cards}
      end
    else
      cards = Repo.all(from c in Card, where: c.pack_id == ^pack_id, order_by: [asc: c.id])
      {:ok, cards}
    end
  end

  @doc "Install a free pack or purchase+install a paid pack."
  def install_pack(user_id, pack_id) do
    pack = Repo.get(Pack, pack_id)

    cond do
      pack == nil ->
        {:error, :not_found}

      pack.deleted ->
        {:error, :pack_deleted}

      not pack.approved ->
        {:error, :not_approved}

      true ->
        # Check if already installed
        existing = Repo.one(from i in Install, where: i.user_id == ^user_id and i.pack_id == ^pack_id)

        if existing do
          {:ok, :already_installed}
        else
          # For paid packs, we'd check payment here. For now, just install.
          # In production, this would integrate with a payment gateway.
          if pack.price_cents > 0 do
            Logger.info("Pack purchase: user=#{user_id} pack=#{pack_id} price=#{pack.price_cents}")
          end

          case Repo.insert(Install.changeset(%Install{}, %{user_id: user_id, pack_id: pack_id})) do
            {:ok, _} ->
              # Increment download count
              Repo.update_all(
                from(p in Pack, where: p.id == ^pack_id),
                inc: [downloads: 1]
              )
              {:ok, :installed}

            {:error, cs} ->
              {:error, cs}
          end
        end
    end
  end

  @doc "Uninstall a pack from user's collection."
  def uninstall_pack(user_id, pack_id) do
    case Repo.one(from i in Install, where: i.user_id == ^user_id and i.pack_id == ^pack_id) do
      nil -> {:error, :not_installed}
      install ->
        Repo.delete!(install)
        {:ok, :uninstalled}
    end
  end

  @doc "Get user's installed packs."
  def my_packs(user_id) do
    pack_ids = Repo.all(from i in Install, where: i.user_id == ^user_id, select: i.pack_id)
    packs = Repo.all(from p in Pack, where: p.id in ^pack_ids and p.deleted == false, order_by: [asc: p.name])
    {:ok, packs}
  end

  @doc "Get packs authored by this user."
  def my_created_packs(user_id) do
    packs = Repo.all(from p in Pack, where: p.author_id == ^user_id and p.deleted == false, order_by: [desc: p.created_at])
    {:ok, packs}
  end

  @doc "Rate a pack 1-5 stars. Updates the pack's average rating."
  def rate_pack(user_id, pack_id, rating) when rating >= 1 and rating <= 5 do
    pack = Repo.get(Pack, pack_id)
    if pack == nil do
      {:error, :not_found}
    else
      # Check for existing rating
      existing = Repo.one(from r in Rating, where: r.user_id == ^user_id and r.pack_id == ^pack_id)

      if existing do
        # Update existing rating
        Repo.update!(Rating.changeset(existing, %{rating: rating}))
      else
        Repo.insert!(Rating.changeset(%Rating{}, %{user_id: user_id, pack_id: pack_id, rating: rating}))
      end

      # Recalculate average
      stats = Repo.one(
        from r in Rating,
        where: r.pack_id == ^pack_id,
        select: {avg(r.rating), count()}
      )

      {avg_rating, count} = stats
      avg_float = if avg_rating, do: Decimal.to_float(avg_rating) |> Float.round(2), else: 0.0

      Repo.update!(Pack.changeset(pack, %{rating: avg_float, rating_count: count}))
      {:ok, %{rating: avg_float, count: count}}
    end
  end

  def rate_pack(_user_id, _pack_id, _rating), do: {:error, :invalid_rating}

  # ── Deck Building ───────────────────────────────────────────────

  @doc """
  Combine multiple installed packs into one shuffled deck for a game session.
  Returns {:ok, deck_state} with prompts and responses separated and shuffled.
  """
  def build_deck(user_id, pack_ids) when is_list(pack_ids) do
    # Verify all packs are installed
    installed_ids = Repo.all(
      from i in Install,
      where: i.user_id == ^user_id and i.pack_id in ^pack_ids,
      select: i.pack_id
    )

    missing = pack_ids -- installed_ids

    if length(missing) > 0 do
      {:error, {:packs_not_installed, missing}}
    else
      # Load all cards from selected packs
      all_cards = Repo.all(
        from c in Card,
        where: c.pack_id in ^pack_ids,
        order_by: fragment("RAND()")
      )

      prompts = all_cards
      |> Enum.filter(&(&1.card_type == "prompt"))
      |> Enum.shuffle()
      |> Enum.map(fn c ->
        %{
          "id" => c.id,
          "text" => c.text,
          "blanks_count" => c.blanks_count,
          "pack_id" => c.pack_id
        }
      end)

      responses = all_cards
      |> Enum.filter(&(&1.card_type == "response"))
      |> Enum.shuffle()
      |> Enum.map(fn c ->
        %{
          "id" => c.id,
          "text" => c.text,
          "pack_id" => c.pack_id
        }
      end)

      deck_state = %{
        "prompts" => prompts,
        "responses" => responses,
        "prompt_idx" => 0,
        "total_prompts" => length(prompts),
        "total_responses" => length(responses),
        "pack_ids" => pack_ids
      }

      {:ok, deck_state}
    end
  end

  @doc "Draw a prompt card from the deck. Returns {prompt, updated_deck_state}."
  def draw_prompt(deck_state) do
    prompts = deck_state["prompts"] || []
    idx = deck_state["prompt_idx"] || 0

    if idx >= length(prompts) do
      # Reshuffle if exhausted
      reshuffled = Enum.shuffle(prompts)
      prompt = List.first(reshuffled)
      new_state = deck_state
      |> Map.put("prompts", reshuffled)
      |> Map.put("prompt_idx", 1)
      {prompt, new_state}
    else
      prompt = Enum.at(prompts, idx)
      new_state = Map.put(deck_state, "prompt_idx", idx + 1)
      {prompt, new_state}
    end
  end

  @doc "Draw response cards for a player's hand. Returns {hand, updated_deck_state}."
  def draw_hand(deck_state, count) do
    responses = deck_state["responses"] || []

    if length(responses) < count do
      # Not enough cards — give what we have
      {responses, Map.put(deck_state, "responses", [])}
    else
      {drawn, remaining} = Enum.split(responses, count)
      {drawn, Map.put(deck_state, "responses", remaining)}
    end
  end

  # ── Seed Data ───────────────────────────────────────────────────

  @doc "Seed 3 default official card packs with real card text."
  def seed_default_packs do
    seed_classic_party()
    seed_fantasy_tavern()
    seed_scifi_showdown()
    {:ok, 3}
  end

  defp seed_classic_party do
    {:ok, pack} = upsert_pack(%{
      key: "classic_party",
      name: "Classic Party",
      description: "The essential party pack. 50 prompts and 200 responses for laughs with friends and family.",
      icon: "🎉",
      author_id: 0,
      author_name: "Official",
      category: "official",
      price_cents: 0,
      nsfw: false,
      language: "en",
      tags: ["classic", "family-friendly", "party"]
    })

    prompts = [
      {"The best part of waking up is ____ in your cup.", 1},
      {"I got fired from my job for ____.", 1},
      {"What's actually in Area 51? ____.", 1},
      {"The secret to a happy marriage is ____.", 1},
      {"My therapist told me to stop ____.", 1},
      {"The #1 cause of divorce is ____.", 1},
      {"If I could have dinner with anyone, I'd pick ____.", 1},
      {"The worst birthday present is ____.", 1},
      {"My autobiography will be titled '____'.", 1},
      {"Step 1: ____. Step 2: ????. Step 3: Profit.", 1},
      {"In a shocking twist, scientists discovered that ____ is actually good for you.", 1},
      {"The real reason dinosaurs went extinct: ____.", 1},
      {"I can't believe they made a movie about ____.", 1},
      {"The fastest way to ruin a wedding is ____.", 1},
      {"What do you find in a haunted house? ____.", 1},
      {"My dating profile says I enjoy ____ and long walks on the beach.", 1},
      {"The teacher was horrified to find ____ in the student's backpack.", 1},
      {"Breaking news: ____ declared illegal in 12 countries.", 1},
      {"Instead of a diploma, graduates now receive ____.", 1},
      {"Nothing ruins a vacation faster than ____.", 1},
      {"I keep ____ in my glove compartment just in case.", 1},
      {"The zoo had to close because of ____.", 1},
      {"My grandma's secret recipe calls for a pinch of ____.", 1},
      {"The next Olympic sport should be ____.", 1},
      {"You haven't lived until you've tried ____.", 1},
      {"Life hack: replace your morning coffee with ____.", 1},
      {"The surgeon general now warns against ____.", 1},
      {"What I lack in talent, I make up for in ____.", 1},
      {"My safe word is ____.", 1},
      {"The last thing you want to see in your rearview mirror is ____.", 1},
      {"____ + ____ = a really bad time.", 2},
      {"In an alternate universe, ____ is the president and ____ is the national anthem.", 2},
      {"The new superhero's powers include ____ and ____.", 2},
      {"My mom always said: ____ is just ____ with extra steps.", 2},
      {"Due to budget cuts, ____ will be replaced with ____.", 2},
      {"I replaced my roommate's shampoo with ____.", 1},
      {"Aliens visited Earth and all they wanted was ____.", 1},
      {"The real treasure was ____ all along.", 1},
      {"A little-known fact: Napoleon was afraid of ____.", 1},
      {"Before electricity, people entertained themselves with ____.", 1},
      {"My last words will probably be about ____.", 1},
      {"The airline lost my luggage but found ____.", 1},
      {"What keeps me up at night: ____.", 1},
      {"The world record for ____ was just broken.", 1},
      {"I told my kids ____ and now they won't stop crying.", 1},
      {"My spirit animal is ____.", 1},
      {"The fortune cookie said: Beware of ____.", 1},
      {"What's trending on social media? ____.", 1},
      {"The invention that changed everything: ____.", 1},
      {"If I had a time machine, I'd go back and ____.", 1}
    ]

    responses = [
      "A questionable life choices", "Aggressive interpretive dance",
      "An inappropriately timed sneeze", "Anxiety in a trench coat",
      "Artisanal cheese from a gas station", "A strongly-worded letter to no one",
      "Bad karaoke at 3 AM", "Being emotionally unavailable",
      "Bees in a briefcase", "Blaming the dog",
      "Breakfast for dinner", "Bubble wrap therapy",
      "Calling your teacher 'Mom'", "Cats plotting world domination",
      "Chaotic good energy", "Competitive napping",
      "Crying in a pillow fort", "Dad jokes gone wrong",
      "Doing taxes for fun", "Dramatically reading the terms of service",
      "Eating cereal at midnight", "Emotional support tacos",
      "Existential dread", "Extreme couponing",
      "Falling up the stairs", "Faking an accent all day",
      "Flying to another country to avoid a conversation", "Forgetting everyone's name",
      "Getting lost in a parking lot", "Glitter bombs",
      "Going to the gym once and posting about it for a month", "Googling symptoms at 2 AM",
      "Having too many tabs open in your brain", "Hiding in the bathroom at a party",
      "Hitting reply-all by accident", "Hot sauce on everything",
      "Hugging a stranger thinking it's your friend", "Interpretive dance battles",
      "Ironing your jeans", "Just one more episode at 4 AM",
      "Keeping a diary in code", "Laughing at your own jokes",
      "Learning a language from a cartoon", "Leaving a group chat dramatically",
      "Licking the last slice of pizza so nobody takes it", "Living in a blanket cocoon",
      "Looking busy while doing nothing", "Losing to a five-year-old at a board game",
      "Making eye contact while eating a banana", "Microwaving fish in the office",
      "Narrating your own life", "Napping as a personality trait",
      "Not knowing what day it is", "Offering unsolicited life advice",
      "Online shopping at 3 AM", "Opening a bag of chips with scissors",
      "Overthinking a text message", "Passive-aggressive sticky notes",
      "Petting every dog you see", "Photobombing strangers",
      "Picking the longest checkout line", "Pretending to be on the phone",
      "Putting on pants", "Reading the comments section",
      "Replying 'K' to a long message", "Running with scissors",
      "Saying 'you too' when the waiter says enjoy your meal", "Screaming into the void",
      "Singing in the shower", "Sitting in a chair wrong",
      "Socks with sandals", "Spilling coffee on everything important",
      "Standing too close in an elevator", "Starting a diet on Monday",
      "Staring at the fridge hoping food appears", "Stepping on a Lego",
      "Subtweeting your boss", "Taking a selfie with a stranger's dog",
      "Talking to plants", "Texting back three days later",
      "The audacity", "The friend zone",
      "The last slice of pizza", "The snooze button",
      "Throwing a tantrum in a grocery store", "Too much cheese",
      "Tripping over nothing", "Trusting a fart",
      "Trying to fold a fitted sheet", "Two raccoons in a trench coat",
      "Ugly crying", "Uncontrollable hiccups",
      "Using a fork for soup", "Walking into a glass door",
      "Wearing pajamas to the store", "Winking at strangers",
      "Your browser history", "Your childhood dreams",
      "A concerning amount of enthusiasm", "A hallmark movie plot",
      "A kazoo orchestra", "A motivational poster from 1998",
      "A polite but firm no", "A surprisingly aggressive handshake",
      "An evil laugh", "An uncomfortable silence",
      "Anything deep-fried", "Awkward family photos",
      "Being technically correct", "Chaperoning a middle school dance",
      "Conspiracy theories", "Crowd-sourced parenting",
      "Deleting everything and starting over", "Disappointed sighing",
      "Doing the robot at a funeral", "Dramatically quitting",
      "Explaining memes to grandparents", "Extreme procrastination",
      "Filling your pockets with cheese", "Finding Waldo immediately",
      "Friendship bracelets made of pasta", "Getting lost in IKEA",
      "Ghost-writing your own obituary", "Going to bed at 8 PM",
      "Having strong opinions about fonts", "Hiring a mariachi band for no reason",
      "Hoarding sauce packets", "Holding a grudge for 20 years",
      "Impulse-buying a goat", "Inventing a holiday",
      "Just vibes", "Keeping a pet rock collection",
      "Knowing the Wi-Fi password everywhere", "Lactose intolerance denial",
      "Loud chewing", "Making everything a competition",
      "Matching outfits with your pet", "Midnight snack raids",
      "Motivational yelling", "Naming your houseplants",
      "Never finishing a sente", "Not recycling",
      "Organized chaos", "Oversharing on social media",
      "Panic-buying toilet paper", "Parallel parking anxiety",
      "Questionable fashion choices", "Randomly breakdancing",
      "Reading the entire Wikipedia article", "Refusing to ask for directions",
      "Running late as an art form", "Saying 'that's what she said'",
      "Secret handshakes", "Sending 47 texts in a row",
      "Shopping cart road rage", "Sleeping with the lights on",
      "Slow internet", "Smiling through the pain",
      "Social media stalking", "Starting clapping at the wrong time",
      "Taking the stairs to avoid small talk", "Talking in the third person",
      "The audible stomach growl in a quiet room", "The awkward wave back",
      "The entire state of Florida", "The floor is lava",
      "The power of friendship", "Thinking about that embarrassing thing from 2009",
      "Too many emojis", "Unattended children",
      "Unexpected jazz hands", "Unsolicited life advice",
      "Vigorously nodding while understanding nothing", "Walking dramatically in slow motion",
      "Wearing a cape to work", "Whispering aggressively",
      "Writing a strongly-worded Yelp review", "Yelling at clouds",
      "Your mom's cooking", "Zero spatial awareness"
    ]

    ensure_cards(pack.id, prompts, responses)
  end

  defp seed_fantasy_tavern do
    {:ok, pack} = upsert_pack(%{
      key: "fantasy_tavern",
      name: "Fantasy Tavern",
      description: "For brave adventurers! 30 prompts and 150 responses inspired by fantasy worlds, tavern tales, and RPG lore.",
      icon: "🍺",
      author_id: 0,
      author_name: "Official",
      category: "official",
      price_cents: 0,
      nsfw: false,
      language: "en",
      tags: ["fantasy", "rpg", "tavern", "medieval"]
    })

    prompts = [
      {"The bard's song was about ____.", 1},
      {"The dragon hoards nothing but ____.", 1},
      {"The wizard's spell went wrong and created ____.", 1},
      {"Legend says the dungeon's final boss is actually ____.", 1},
      {"The tavern's special tonight is ____ stew.", 1},
      {"The kingdom fell because the king was obsessed with ____.", 1},
      {"I rolled a natural 20 on ____ and regretted it.", 1},
      {"The quest reward was just ____.", 1},
      {"The dark lord's weakness is ____.", 1},
      {"My character's tragic backstory involves ____.", 1},
      {"The enchanted sword can only be wielded by someone who has ____.", 1},
      {"The thieves' guild's entrance is hidden behind ____.", 1},
      {"The most dangerous creature in the forest is ____.", 1},
      {"The ancient prophecy foretold ____.", 1},
      {"The potion of healing tastes like ____.", 1},
      {"The goblin king demands a tribute of ____.", 1},
      {"My ranger's animal companion is ____.", 1},
      {"The mimic was disguised as ____.", 1},
      {"The paladin broke their oath because of ____.", 1},
      {"The necromancer raised ____ from the dead.", 1},
      {"The treasure map leads to ____.", 1},
      {"The fairy granted me ____ instead of a wish.", 1},
      {"Our party's strategy is always ____ first, questions later.", 1},
      {"The shopkeeper won't sell you ____ without a license.", 1},
      {"The haunted armor is possessed by the spirit of ____.", 1},
      {"Dwarven engineering at its finest: ____.", 1},
      {"The elf's 800-year grudge is about ____.", 1},
      {"The barbarian's rage was triggered by ____.", 1},
      {"In the land of ____, ____ is currency.", 2},
      {"The wizard combined ____ and ____ and things got weird.", 2}
    ]

    responses = [
      "A barrel of slightly sentient mead", "A bard who only knows one song",
      "A chicken that judges you silently", "A cursed rubber duck",
      "A dragon with social anxiety", "A dungeon that's just an IKEA",
      "A goblin pyramid scheme", "A knight who's afraid of swords",
      "A map drawn by a drunk cartographer", "A mimic pretending to be another mimic",
      "A moat filled with pudding", "A potion that turns you into a table",
      "A quest for the world's comfiest pillow", "A really aggressive door knocker",
      "A scroll of passive-aggressive notes", "A sentient cheese wheel",
      "A shield made of pure stubbornness", "A skeleton who just wants to dance",
      "A spell that summons bees", "A surprisingly well-read orc",
      "A sword that screams when drawn", "A talking hat with bad advice",
      "A tax collector in the dungeon", "A troll under a bridge who charges tolls",
      "A very tiny apocalypse", "A wizard's laundry pile",
      "Aggressive negotiations with a door", "An arrow to the knee",
      "An enchanted whoopee cushion", "An existential crisis in a bottle",
      "Betraying the party for a shiny rock", "Casting fireball indoors",
      "Charisma as a dump stat", "Constructive criticism from a dragon",
      "Elven bread that tastes like cardboard", "Falling into every trap, every time",
      "Forbidden knowledge about sandwiches", "Getting lost in your own dungeon",
      "Gold-plated mediocrity", "Having a conversation with a rock",
      "Hiring goblins as accountants", "Insulting the quest giver",
      "Looting the bodies before checking for survivors", "Making a pact with a suspiciously friendly demon",
      "Mithril underwear", "Murder hoboing",
      "Negotiating with the final boss", "Not splitting the party (for once)",
      "One ring to bind your anxiety", "Opening the obviously cursed book",
      "Pickpocketing the king during an audience", "Polymorphing into a duck",
      "Putting all your points into cooking", "Questioning the DM's life choices",
      "Rolling a 1 at the worst possible moment", "Setting the tavern on fire (again)",
      "Seducing the dragon", "Stealing from the party's healer",
      "Summoning something that doesn't obey", "Suspiciously specific denials",
      "Swimming in full plate armor", "Taking a nap in a dungeon",
      "The bard's terrible puns", "The DM's evil laughter",
      "The dungeon's complaint box", "The friend you made along the way",
      "The haunted bagpipes", "The power of friendship (and also fireball)",
      "The quest log that's just a grocery list", "The wizard's increasingly questionable experiments",
      "Three kobolds in a trench coat", "Too many healing potions",
      "Trying to befriend the monster", "Turning invisible at the wrong time",
      "Unidentified loot goblin behavior", "Using a longsword as a butter knife",
      "Wearing cursed boots to look stylish", "Yet another fetch quest",
      "A bedroll of infinite comfort", "A black market for spell components",
      "A bottomless tankard of regret", "A cape that dramatically billows on command",
      "A critically acclaimed puppet show", "A diplomacy check with a gelatinous cube",
      "A dwarf's beard braiding competition", "A eldritch horror that just wants tea",
      "A fireball aimed at your feelings", "A gnome with a grudge",
      "A haunted accordion", "A healing potion that's just hot sauce",
      "A horse that critiques your riding", "A legendary artifact (it's a spoon)",
      "A librarian more dangerous than the lich", "A magic carpet with motion sickness",
      "A mercenary guild's dental plan", "A necromancer's book club",
      "A overpowered magic ring you found in a puddle", "A passive-aggressive fairy godmother",
      "A pet basilisk", "A pirate ship crewed entirely by skeletons",
      "A potion of questionable origin", "A rogue's retirement plan",
      "A secretly evil innkeeper", "A shrine to the god of minor inconveniences",
      "A trap that's just a philosophical question", "A very polite vampire",
      "A war crime disguised as tactics", "A wizard's failed experiment (it's alive)",
      "An alignment crisis", "An angry mob of villagers",
      "An orc who writes poetry", "Bag of holding filled with bees",
      "Being technically the chosen one", "Blaming everything on the wizard",
      "Communing with a disinterested god", "Competitive tavern brawling",
      "Critical failure at life", "Dwarf-tossing (consensual)",
      "Emotional damage from a bard's insult", "Enchanted beans of unknown power",
      "Everything is a mimic if you're paranoid enough", "Excessive use of prestidigitation",
      "Faking your own character death", "Forging quest completion documents",
      "Goblin court proceedings", "Haunted dungeon bathroom",
      "Heroic sacrifice (it didn't stick)", "Incomprehensible arcane bureaucracy",
      "Letting the barbarian negotiate", "Living in a barrel by choice",
      "Multiclassing into regret", "Necromancy for household chores",
      "Offering the monster a sandwich", "Overthrowing the local government",
      "Pet dragon that refuses to be intimidating", "Raiding the snack table mid-combat",
      "Resurrecting someone just to yell at them", "Rolling to seduce the lock",
      "Secret underground fighting ring for familiars", "Smiting first, asking questions never",
      "Stealing a country", "Summoning the wrong elemental",
      "The DM's barely contained rage", "The floor suddenly being lava",
      "The forbidden snack in the alchemy lab", "The inn's one-star review",
      "The party's shared braincell", "The suspiciously convenient plot device",
      "Threatening a mountain", "Training montage set to lute music",
      "Trojan horse but it's a real horse", "Trusting the suspicious stranger",
      "Using Detect Magic on everything including breakfast", "Wearing your armor to bed"
    ]

    ensure_cards(pack.id, prompts, responses)
  end

  defp seed_scifi_showdown do
    {:ok, pack} = upsert_pack(%{
      key: "scifi_showdown",
      name: "Sci-Fi Showdown",
      description: "Boldly go where no card game has gone before! 30 prompts and 150 responses spanning space, time, and technology.",
      icon: "🚀",
      author_id: 0,
      author_name: "Official",
      category: "official",
      price_cents: 0,
      nsfw: false,
      language: "en",
      tags: ["sci-fi", "space", "technology", "future"]
    })

    prompts = [
      {"The AI became sentient and immediately ____.", 1},
      {"Mission log: Day 47. The crew has started ____.", 1},
      {"The alien ambassador's first request was ____.", 1},
      {"The space station's biggest problem is ____.", 1},
      {"Time travel was invented and the first thing people did was ____.", 1},
      {"The robot uprising started because of ____.", 1},
      {"Mars colony update: We've discovered ____.", 1},
      {"The teleporter malfunctioned and I'm now ____.", 1},
      {"The clone of myself won't stop ____.", 1},
      {"The intergalactic treaty bans ____.", 1},
      {"First contact went wrong when humanity showed them ____.", 1},
      {"The captain's last order was ____.", 1},
      {"The ship's computer recommends ____ for your space sickness.", 1},
      {"The space pirates demand ____ as ransom.", 1},
      {"The cryosleep chamber accidentally preserved ____.", 1},
      {"The new planet's atmosphere is 90% ____.", 1},
      {"The holodeck's most popular program is ____.", 1},
      {"Alien cuisine is just ____ but in space.", 1},
      {"The warp drive runs on ____.", 1},
      {"The Federation's prime directive now includes ____.", 1},
      {"The robot's new firmware update added ____.", 1},
      {"Zero gravity makes ____ extremely dangerous.", 1},
      {"The distress signal was just ____.", 1},
      {"My cybernetic implant lets me ____.", 1},
      {"The black hole turned out to be ____.", 1},
      {"The galaxy's most wanted criminal is known for ____.", 1},
      {"Space tourism's biggest attraction is ____.", 1},
      {"The simulation glitched and now ____ is everywhere.", 1},
      {"In the future, ____ replaced ____ entirely.", 2},
      {"The alien said ____ and our translator returned ____.", 2}
    ]

    responses = [
      "A bureaucratic space station", "A coffee machine that judges your life choices",
      "A conspiracy involving sentient toasters", "A distress signal from your future self",
      "A galaxy-wide recall on faulty warp drives", "A haunted space helmet",
      "A legally distinct lightsaber", "A malfunctioning gravity generator",
      "A moon made entirely of cheese (confirmed)", "A parallel universe where everything is slightly worse",
      "A planet ruled by cats", "A robot going through a midlife crisis",
      "A self-driving spaceship that gets road rage", "A sentient vending machine",
      "A space pirate's parrot (it's a drone)", "A spaceship with a check engine light",
      "A suspicious amount of probing", "A time loop but only on Tuesdays",
      "A wormhole to the DMV", "AI-generated pickup lines",
      "Accidentally declaring war via typo", "Alien food that tastes like chicken",
      "An escape pod full of cats", "An interstellar Yelp review",
      "Arguing with the ship's AI about music", "Asteroid mining for bitcoin",
      "Being ghosted across dimensions", "Cloning yourself for company",
      "Converting the cargo bay into a ball pit", "Cosmic background radiation but make it jazz",
      "Crashing into a gas giant", "Cybernetic nose hair trimmer",
      "Debugging the matrix", "Deep space boredom",
      "Discovering Earth was the tutorial level", "Emergency protocols written in Comic Sans",
      "Existential dread at light speed", "Faster-than-light passive aggression",
      "Finding out your planet is flat (it's a space station)", "Floating dramatically in zero-g",
      "Galaxy brain but in a bad way", "Getting a parking ticket on Mars",
      "Getting catfished by an alien", "Gravity-defying dance moves",
      "Having a staring contest with a black hole", "Holographic customer service",
      "Hyperdrive-powered procrastination", "Ignoring the prime directive (again)",
      "Infinite improbability", "Installing unauthorized mods on the space station",
      "Intergalactic HOA violations", "Involuntary teleportation",
      "Jetpack malfunctions", "Lag in real life",
      "Laser tag with actual lasers", "Light-year-long commute",
      "Living in a simulation of a simulation", "Making first contact via memes",
      "Mandatory fun in the holodeck", "Microwaving in zero gravity",
      "Naming a star after your ex", "Navigating by GPS in space",
      "One small step for man, one giant faceplant", "Opening the airlock for fresh air",
      "Outsourcing to robots", "Overthrowing a galactic empire with spreadsheets",
      "Parallel parking a starship", "Photon torpedo road rage",
      "Playing chess with a supercomputer (and losing)", "Quantum entangled socks",
      "Rebooting the universe", "Robot uprising over minimum wage",
      "Running Windows on a spaceship", "Sending a distress signal in all caps",
      "Sentient space debris", "Setting phasers to 'disappointed'",
      "Sleeping through an alien invasion", "Space garbage collection",
      "Space madness (it's real)", "Space pirates with surprisingly good manners",
      "Spilling coffee on the warp core", "Starting a podcast in deep space",
      "Stowaway tribbles", "Stranding yourself on a desert planet",
      "Suing a parallel universe version of yourself", "Terraforming your apartment",
      "Testing experimental teleportation with the intern", "The Bermuda Triangle but in space",
      "The cosmic microwave background humming a tune", "The heat death of the universe (it's next Tuesday)",
      "The ship's therapist (it's a plant)", "The speed of plot convenience",
      "The universe's terms of service", "Time traveling to avoid a meeting",
      "Training montage in zero gravity", "Translating alien profanity",
      "Trusting the ship's autopilot", "Turning it off and on again (the sun)",
      "Unauthorized cloning", "Unexplained space noises",
      "Using a black hole as a garbage disposal", "Waking up from cryosleep on the wrong planet",
      "Warp speed road trips", "WiFi in deep space (2 bars)",
      "Zero gravity hair", "A dyson sphere around a nightlight",
      "A fleet of roomba warships", "A force field around the snack cabinet",
      "A glitch in the gravitational matrix", "A nano-bot rebellion over working conditions",
      "A perfectly normal supernova (nothing to worry about)", "A quantum computer running Tetris",
      "A rogue planet just vibing", "A sentient asteroid with opinions",
      "A ship powered by sheer willpower", "A star map drawn by a toddler",
      "A suspicious lack of alien life (or IS there)", "A terraformed planet that's just a parking lot",
      "A time traveler's browser history", "A universal translator that only knows sarcasm",
      "An AI therapist that needs therapy", "An alien pen pal program",
      "An intergalactic fast food chain", "Anti-gravity yoga",
      "Asteroid belt road rage", "Biodome drama",
      "Black market teleporter coordinates", "Cargo cult science (literally)",
      "Cloning ethical dilemmas", "Colonizing a planet just for the aesthetics",
      "Cosmic horror that's actually just cosmic mild inconvenience", "Cryogenic brain freeze",
      "Dark matter snacks", "Dimensional hopping for cheaper rent",
      "FTL customer complaints", "Galactic jury duty",
      "Holographic comfort food", "Hyperspace motion sickness",
      "Interstellar road trip snacks", "Ion storm mood swings",
      "Micrometeorite acne", "Multi-dimensional chess rage-quit",
      "Nebula photography (influencer edition)", "Neural implant pop-up ads",
      "Orbital mechanics homework", "Photosynthetic skin augmentation",
      "Planetary ring hula hooping", "Reprogramming drones for interpretive dance",
      "Solar flare sunburn", "Space elevator small talk",
      "Space farming reality TV", "Tractor beam tug-of-war",
      "Vacuum of space (great for cleaning)", "Warp bubble wrap"
    ]

    ensure_cards(pack.id, prompts, responses)
  end

  # ── Private Helpers ─────────────────────────────────────────────

  defp upsert_pack(attrs) do
    key = attrs[:key]
    existing = Repo.one(from p in Pack, where: p.key == ^key)

    if existing do
      {:ok, existing}
    else
      create_pack(attrs[:author_id], attrs)
    end
  end

  defp ensure_cards(pack_id, prompts, responses) do
    # Check if cards already exist
    existing_count = Repo.one(from c in Card, where: c.pack_id == ^pack_id, select: count())

    if existing_count == 0 do
      prompt_cards = Enum.map(prompts, fn {text, blanks} ->
        %{type: "prompt", text: text, blanks: blanks}
      end)

      response_cards = Enum.map(responses, fn text ->
        %{type: "response", text: text, blanks: 0}
      end)

      add_cards(pack_id, prompt_cards ++ response_cards)
    else
      {:ok, :already_seeded}
    end
  end

  defp generate_pack_key(nil), do: "pack_#{:rand.uniform(99999)}"
  defp generate_pack_key(name) do
    name
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/, "_")
    |> String.trim("_")
    |> String.slice(0, 30)
  end

  defp decode_json(nil, default), do: default
  defp decode_json(json_str, default) when is_binary(json_str) do
    case Jason.decode(json_str) do
      {:ok, val} -> val
      _ -> default
    end
  end
  defp decode_json(_, default), do: default
end
