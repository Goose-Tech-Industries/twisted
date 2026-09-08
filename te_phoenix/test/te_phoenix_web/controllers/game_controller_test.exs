defmodule TePhoenixWeb.GameControllerTest do
  use TePhoenixWeb.ConnCase, async: false
  alias TePhoenix.Repo

  describe "character-options" do
    test "GET /api/character-options returns races, classes, and backgrounds", %{conn: conn} do
      conn = get(conn, ~p"/api/character-options")
      assert json_response(conn, 200)["success"] == true
      body = json_response(conn, 200)

      assert is_list(body["races"])
      assert is_list(body["classes"])
      assert is_list(body["backgrounds"])
      assert is_list(body["subclasses"])
      assert is_list(body["feats"])

      if length(body["races"]) > 0 do
        assert length(body["races"]) >= 20
        assert Enum.any?(body["races"], &(&1["name"] == "Forgeborn (Automaton)"))
        assert Enum.any?(body["races"], &(&1["name"] == "Voidstrider (Astral)"))
      end

      if length(body["classes"]) > 0 do
        assert length(body["classes"]) >= 20
        assert Enum.any?(body["classes"], &(&1["name"] == "Chronomancer"))
        assert Enum.any?(body["classes"], &(&1["name"] == "Hemomancer"))
      end

      if length(body["backgrounds"]) > 0 do
        assert length(body["backgrounds"]) >= 20
        assert Enum.any?(body["backgrounds"], &(&1["tag"] == "outlander"))
        assert Enum.any?(body["backgrounds"], &(&1["tag"] == "gladiator" && &1["bonus_hp"] == 30))
        assert Enum.any?(body["backgrounds"], &(&1["tag"] == "machinist"))
        assert Enum.any?(body["backgrounds"], &(&1["tag"] == "fey_touched"))
      end

      if length(body["subclasses"]) > 0 do
        assert length(body["subclasses"]) >= 80
        assert Enum.any?(body["subclasses"], &(&1["name"] == "Berserker" && &1["passive_name"] == "Blood Frenzy"))
        assert Enum.any?(body["subclasses"], &(&1["name"] == "Dreadnought" && &1["signature_ability"] == "Shield Fortress"))
        assert Enum.any?(body["subclasses"], &(&1["name"] == "Frostblade" && &1["class_id"] == 13))
      end
    end

    test "GET /api/subclasses filters by class_id", %{conn: conn} do
      conn = get(conn, ~p"/api/subclasses?class_id=1")
      body = json_response(conn, 200)
      assert body["success"] == true
      assert length(body["subclasses"]) == 4
      names = Enum.map(body["subclasses"], & &1["name"])
      assert "Berserker" in names
      assert "Dreadnought" in names
      assert "Weaponmaster" in names
      assert "Warlord" in names
    end
  end

  describe "create_character" do
    setup %{conn: conn} do
      # Ensure a valid user exists in db
      user_id = case Repo.query("SELECT id FROM users LIMIT 1") do
        {:ok, %{rows: [[id]]}} -> id
        _ ->
          {:ok, %{last_insert_id: id}} = Repo.query(
            "INSERT INTO users (username, email, password_hash, role, is_banned) VALUES ('tester', 'tester@example.com', 'hash', 'PLAYER', 0)"
          )
          id
      end

      token = Phoenix.Token.sign(TePhoenixWeb.Endpoint, "user socket", user_id)
      authed_conn =
        conn
        |> put_req_header("authorization", "Bearer " <> token)

      {:ok, conn: authed_conn, user_id: user_id}
    end

    test "returns validation error for empty name", %{conn: conn} do
      conn = post(conn, ~p"/api/characters/create", %{"name" => ""})
      assert json_response(conn, 200)["success"] == false
      assert json_response(conn, 200)["message"] =~ "Name required"
    end

    test "creates a character with custom race, class, background, and visual prompt", %{conn: conn} do
      # Get race and class ids
      {:ok, %{rows: [[r_id]]}} = Repo.query("SELECT id FROM game_races LIMIT 1")
      {:ok, %{rows: [[c_id]]}} = Repo.query("SELECT id FROM game_classes LIMIT 1")

      char_name = "TestHero#{:rand.uniform(99999)}"

      params = %{
        "name" => char_name,
        "raceId" => r_id,
        "classId" => c_id,
        "backgroundId" => 1,
        "visualPrompt" => "Amethyst eye glow, frost scars",
        "portraitUrl" => "/portraits/portrait_mage.png"
      }

      conn = post(conn, ~p"/api/characters/create", params)
      body = json_response(conn, 200)

      assert body["success"] == true
      assert is_integer(body["charId"])

      # Verify it was persisted to the database with portrait and prompt
      char_id = body["charId"]
      {:ok, %{rows: [[name, portrait, prompt]]}} =
        Repo.query("SELECT name, portrait_url, visual_prompt FROM characters WHERE id = ?", [char_id])

      assert name == char_name
      assert portrait == "/portraits/portrait_mage.png"
      assert prompt == "Amethyst eye glow, frost scars"
    end

    test "specializes in a subclass at level 3+", %{conn: conn, user_id: user_id} do
      # Insert a level 3 warrior
      {:ok, %{last_insert_id: char_id}} = Repo.query("""
        INSERT INTO characters (user_id, name, level, class_id, race_id, background_id, current_hp, max_hp, current_mp, max_mp, atk, def, mo, md, speed, luck)
        VALUES (?, 'Lvl3Warrior', 3, 1, 1, 1, 120, 120, 30, 30, 14, 8, 2, 4, 10, 5)
      """, [user_id])

      # Pick Berserker (subclass id 1, class_id 1)
      conn = post(conn, ~p"/api/characters/#{char_id}/subclass", %{"subclassId" => 1})
      body = json_response(conn, 200)

      assert body["success"] == true
      assert body["subclass"]["name"] == "Berserker"
      assert body["subclass"]["archetype_title"] == "Frenzy Reaver"
      assert body["subclass"]["passive_name"] == "Blood Frenzy"

      # Verify characters table was updated
      {:ok, %{rows: [[sub_id, max_hp, atk]]}} = Repo.query("SELECT subclass_id, max_hp, atk FROM characters WHERE id = ?", [char_id])
      assert sub_id == 1
      assert max_hp == 140
      assert atk == 18
    end
  end
end
