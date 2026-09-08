defmodule TePhoenixWeb.CutsceneControllerTest do
  use TePhoenixWeb.ConnCase, async: false
  alias TePhoenix.Repo

  setup %{conn: conn} do
    user_id =
      case Repo.query("SELECT id FROM users LIMIT 1") do
        {:ok, %{rows: [[id]]}} -> id
        _ ->
          {:ok, %{last_insert_id: id}} = Repo.query(
            "INSERT INTO users (username, email, password_hash, role, is_banned) VALUES ('tester_camp', 'tester_camp@example.com', 'hash', 'PLAYER', 0)"
          )
          id
      end

    token = Phoenix.Token.sign(TePhoenixWeb.Endpoint, "user socket", user_id)
    authed_conn =
      conn
      |> put_req_header("authorization", "Bearer " <> token)

    {:ok, %{rows: [[r_id]]}} = Repo.query("SELECT id FROM game_races LIMIT 1")
    {:ok, %{rows: [[c_id]]}} = Repo.query("SELECT id FROM game_classes LIMIT 1")
    char_name = "CampHero#{:rand.uniform(99999)}"

    params = %{
      "name" => char_name,
      "raceId" => r_id,
      "classId" => c_id,
      "backgroundId" => 1,
      "visualPrompt" => "Amethyst eye glow, obsidian face mask",
      "portraitUrl" => "/portraits/portrait_mage.png"
    }

    create_conn = post(authed_conn, ~p"/api/characters/create", params)
    char_id = json_response(create_conn, 200)["charId"]

    {:ok, conn: authed_conn, user_id: user_id, char_id: char_id, token: token}
  end

  describe "camp and cutscene system" do
    test "GET /api/camp/status/:char_id returns camp info and companions", %{conn: conn, char_id: char_id} do
      conn = get(conn, ~p"/api/camp/status/#{char_id}")
      assert json_response(conn, 200)["success"] == true
      body = json_response(conn, 200)

      assert body["location"] in ["wilderness", "inn"]
      assert is_list(body["companions"])
      assert length(body["companions"]) >= 3
      assert Enum.any?(body["companions"], &(&1["id"] == "valerius"))
      assert Enum.any?(body["companions"], &(&1["id"] == "lyra"))
      assert Enum.any?(body["companions"], &(&1["id"] == "bram"))
    end

    test "POST /api/cutscenes/choice modifies affinity and returns reactive line", %{conn: conn, char_id: char_id} do
      payload = %{
        "charId" => char_id,
        "companionId" => "valerius",
        "choiceId" => "c1",
        "delta" => 5
      }
      conn = post(conn, ~p"/api/cutscenes/choice", payload)
      assert json_response(conn, 200)["success"] == true
      body = json_response(conn, 200)

      assert body["companionId"] == "valerius"
      assert is_binary(body["message"])
      assert is_binary(body["reply"])
    end

    test "POST /api/camp/rest handles rest and recovery", %{conn: conn, char_id: char_id} do
      payload = %{
        "charId" => char_id,
        "type" => "wilderness"
      }
      conn = post(conn, ~p"/api/camp/rest", payload)
      assert json_response(conn, 200)["success"] == true
      body = json_response(conn, 200)
      assert is_binary(body["message"])
    end

    test "POST /api/cutscenes/choice with multi-companion affinities updates all companions and returns reactions", %{conn: conn, char_id: char_id} do
      payload = %{
        "charId" => char_id,
        "choiceId" => "choice_comrade",
        "affinities" => %{"valerius" => 6, "bram" => 8, "lyra" => 4}
      }
      conn = post(conn, ~p"/api/cutscenes/choice", payload)
      assert json_response(conn, 200)["success"] == true
      body = json_response(conn, 200)

      assert is_list(body["reactions"])
      assert length(body["reactions"]) >= 3
      assert is_map(body["updatedAffinities"])
      assert body["updatedAffinities"]["bram"] > 50
    end

    test "GET /api/companions/supports/:char_id returns Fire Emblem companion pairs and ranks", %{conn: conn, char_id: char_id} do
      conn = get(conn, ~p"/api/companions/supports/#{char_id}")
      assert json_response(conn, 200)["success"] == true
      body = json_response(conn, 200)

      assert is_list(body["pairs"])
      assert length(body["pairs"]) == 3
      valerius_lyra = Enum.find(body["pairs"], &(&1["pairId"] == "valerius_lyra"))
      assert valerius_lyra != nil
      assert valerius_lyra["rank"] in ["C", "B", "A", "S"]
      assert is_binary(valerius_lyra["combatSynergy"])
    end

    test "GET /api/companions/support_stream returns SSE stream for 1-on-1 dialogue", %{conn: conn, char_id: char_id, token: token} do
      conn = get(conn, ~p"/api/companions/support_stream?charId=#{char_id}&pair=valerius_lyra&rank=B&token=#{token}")
      assert response(conn, 200)
      assert get_resp_header(conn, "content-type") == ["text/event-stream"]
    end

    test "POST /api/companions/support_complete promotes rank and returns upgraded combat synergy", %{conn: conn, char_id: char_id} do
      payload = %{
        "charId" => char_id,
        "pair" => "valerius_lyra",
        "rank" => "B"
      }
      conn = post(conn, ~p"/api/companions/support_complete", payload)
      assert json_response(conn, 200)["success"] == true
      body = json_response(conn, 200)

      assert body["pairId"] == "valerius_lyra"
      assert body["rank"] == "B"
      assert is_binary(body["combatSynergy"])
      assert String.contains?(body["combatSynergy"], "Dual Strike")
    end

    test "GET /api/camp/cooking/:char_id returns ingredients, recipes, and sous-chefs", %{conn: conn, char_id: char_id} do
      conn = get(conn, ~p"/api/camp/cooking/#{char_id}")
      assert json_response(conn, 200)["success"] == true
      body = json_response(conn, 200)

      assert is_list(body["ingredients"])
      assert is_list(body["recipes"])
      assert is_list(body["sousChefs"])
      assert length(body["recipes"]) >= 3
      assert length(body["sousChefs"]) >= 3
    end

    test "POST /api/camp/cook prepares meal, grants meal buff, and awards companion affinity", %{conn: conn, char_id: char_id} do
      payload = %{
        "charId" => char_id,
        "recipeId" => "venison_stew",
        "sousChef" => "lyra"
      }
      conn = post(conn, ~p"/api/camp/cook", payload)
      assert json_response(conn, 200)["success"] == true
      body = json_response(conn, 200)

      assert body["dish"] == "Hunter's Hearty Venison Stew"
      assert is_map(body["mealBuff"])
      assert body["mealBuff"]["atk"] == 12
      assert is_binary(body["chefReply"])
      assert body["affinityDelta"] == 12
    end

    test "POST /api/camp/rest with force_ambush triggers night defense encounter", %{conn: conn, char_id: char_id} do
      payload = %{
        "charId" => char_id,
        "type" => "wilderness",
        "guard" => "bram",
        "force_ambush" => true
      }
      conn = post(conn, ~p"/api/camp/rest", payload)
      assert json_response(conn, 200)["success"] == true
      body = json_response(conn, 200)

      assert body["ambush"] == true
      assert is_map(body["enemy"])
      assert is_list(body["tacticalOptions"])
      assert is_binary(body["message"])
    end

    test "POST /api/camp/resolve_ambush successfully repels ambush, restores HP, awards XP and loot", %{conn: conn, char_id: char_id} do
      payload = %{
        "charId" => char_id,
        "tacticalChoice" => "flank_shot",
        "guard" => "bram"
      }
      conn = post(conn, ~p"/api/camp/resolve_ambush", payload)
      assert json_response(conn, 200)["success"] == true
      body = json_response(conn, 200)

      assert body["ambushResolved"] == true
      assert body["bonusXp"] == 120
      assert is_list(body["lootedIngredients"])
      assert is_binary(body["guardReply"])
      assert body["updatedAffinities"]["valerius"] >= 75
    end
  end
end
