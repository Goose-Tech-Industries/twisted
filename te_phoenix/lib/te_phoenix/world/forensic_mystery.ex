defmodule TePhoenix.World.ForensicMystery do
  @moduledoc """
  Forensic Crime Mystery, Suspect Interrogation & Magistrate Courtroom Trials.

  Players investigate autonomous nocturnal crimes, discover forensic evidence chips,
  interrogate suspects, and either present evidence in a Magistrate Courtroom trial
  or accept underworld bribes to frame someone else.
  """

  require Logger
  alias TePhoenix.Repo
  alias TePhoenix.World.EngineFeatureFlags

  @cases_table "game_forensic_cases"
  @suspects_table "game_case_suspects"
  @clues_table "game_case_clues"

  @doc """
  Ensures mystery tables exist.
  """
  def ensure_schema! do
    case :persistent_term.get({__MODULE__, :schema_ready}, false) do
      true ->
        :ok

      false ->
        Repo.query!("""
        CREATE TABLE IF NOT EXISTS #{@cases_table} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(128) NOT NULL,
          case_code VARCHAR(32) NOT NULL UNIQUE,
          status VARCHAR(32) NOT NULL DEFAULT 'open',
          crime_type VARCHAR(64) NOT NULL,
          victim_name VARCHAR(128) NOT NULL,
          location_hint VARCHAR(255) NOT NULL,
          culprit_suspect_id INT NOT NULL,
          reward_gold INT NOT NULL DEFAULT 300,
          reward_xp INT NOT NULL DEFAULT 500,
          created_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        Repo.query!("""
        CREATE TABLE IF NOT EXISTS #{@suspects_table} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          case_id INT NOT NULL,
          suspect_id INT NOT NULL,
          name VARCHAR(128) NOT NULL,
          role VARCHAR(64) NOT NULL,
          icon VARCHAR(16) DEFAULT '👤',
          alibi TEXT,
          is_guilty TINYINT(1) NOT NULL DEFAULT 0,
          interrogated_count INT NOT NULL DEFAULT 0,
          confessed TINYINT(1) NOT NULL DEFAULT 0,
          INDEX idx_case (case_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        Repo.query!("""
        CREATE TABLE IF NOT EXISTS #{@clues_table} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          case_id INT NOT NULL,
          clue_key VARCHAR(64) NOT NULL,
          name VARCHAR(128) NOT NULL,
          icon VARCHAR(16) DEFAULT '🔍',
          clue_text TEXT NOT NULL,
          is_discovered TINYINT(1) NOT NULL DEFAULT 0,
          points_to_suspect_id INT,
          INDEX idx_case (case_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        seed_default_case!()
        :persistent_term.put({__MODULE__, :schema_ready}, true)
        :ok
    end
  end

  @doc """
  Seeds a starter murder mystery: 'The Defenestration of Lord Aubrey'.
  """
  def seed_default_case! do
    case Repo.query("SELECT COUNT(*) FROM #{@cases_table}") do
      {:ok, %{rows: [[0]]}} ->
        now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

        result =
          Repo.query!(
            """
            INSERT INTO #{@cases_table}
            (title, case_code, status, crime_type, victim_name, location_hint, culprit_suspect_id, reward_gold, reward_xp, created_at)
            VALUES ('The Defenestration of Lord Aubrey', 'CASE-701', 'open', 'homicide', 'Lord Aubrey the Gilded', 'Rusty Anchor Tavern, 2nd Floor Room', 2, 450, 750, ?)
            """,
            [now]
          )

        case_id = result.last_insert_id

        # Suspects
        Repo.query!(
          """
          INSERT INTO #{@suspects_table}
          (case_id, suspect_id, name, role, icon, alibi, is_guilty)
          VALUES
          (?, 1, 'Silas the Fence', 'Smuggler Kingpin', '🗡️', 'I was counting coin in the cellars all evening. Several cutthroats can vouch for me.', 0),
          (?, 2, 'Barnaby the Blacksmith', 'Foundry Foreman', '🔨', 'I was forging iron window bars. Lord Aubrey owed me 200 gold for palace grates, but I didn\\'t touch him.', 1),
          (?, 3, 'Mother Althea', 'High Herbalist', '🧪', 'I was brewing valyrian salves in the apothecary garden. I heard a loud crash around midnight.', 0)
          """,
          [case_id, case_id, case_id]
        )

        # Clues
        Repo.query!(
          """
          INSERT INTO #{@clues_table}
          (case_id, clue_key, name, icon, clue_text, is_discovered, points_to_suspect_id)
          VALUES
          (?, 'broken_bars', 'Shattered Iron Bars', '⛓️', 'The window frame iron bars were sheared clean off with a masterwork heavy forging hammer.', 0, 2),
          (?, 'soot_footprints', 'Black Foundry Soot', '👣', 'Heavy bootprints coated with foundry charcoal lead from the bedroom window down the alley.', 0, 2),
          (?, 'bloodstained_promissory', 'Bloodstained IOU Note', '📜', 'A torn note in Lord Aubrey\\'s pocket demanding payment of 200 gold to Barnaby the Blacksmith.', 0, 2)
          """,
          [case_id, case_id, case_id]
        )

        :ok

      _ ->
        :ok
    end
  end

  def list_active_cases do
    ensure_schema!()

    case Repo.query(
           "SELECT id, title, case_code, status, crime_type, victim_name, location_hint, reward_gold, reward_xp, created_at FROM #{@cases_table} ORDER BY id DESC"
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, title, code, status, ctype, victim, loc, rgold, rxp, created] ->
          %{
            id: id,
            title: title,
            case_code: code,
            status: status,
            crime_type: ctype,
            victim_name: victim,
            location_hint: loc,
            reward_gold: rgold,
            reward_xp: rxp,
            created_at: created,
            is_enabled: EngineFeatureFlags.is_enabled?("forensic_mysteries_enabled")
          }
        end)

      _ ->
        []
    end
  end

  def get_case_details(case_id) when is_integer(case_id) do
    ensure_schema!()

    case Repo.query(
           "SELECT id, title, case_code, status, crime_type, victim_name, location_hint, culprit_suspect_id, reward_gold, reward_xp FROM #{@cases_table} WHERE id = ?",
           [case_id]
         ) do
      {:ok, %{rows: [[id, title, code, status, ctype, victim, loc, culprit, rgold, rxp]]}} ->
        suspects = list_case_suspects(case_id)
        clues = list_case_clues(case_id)

        {:ok,
         %{
           id: id,
           title: title,
           case_code: code,
           status: status,
           crime_type: ctype,
           victim_name: victim,
           location_hint: loc,
           culprit_suspect_id: culprit,
           reward_gold: rgold,
           reward_xp: rxp,
           suspects: suspects,
           clues: clues,
           is_enabled: EngineFeatureFlags.is_enabled?("forensic_mysteries_enabled")
         }}

      _ ->
        {:error, "Case not found"}
    end
  end

  def list_case_suspects(case_id) do
    ensure_schema!()

    case Repo.query(
           "SELECT id, suspect_id, name, role, icon, alibi, is_guilty, interrogated_count, confessed FROM #{@suspects_table} WHERE case_id = ?",
           [case_id]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, sid, name, role, icon, alibi, guilty, icount, conf] ->
          %{
            id: id,
            suspect_id: sid,
            name: name,
            role: role,
            icon: icon,
            alibi: alibi,
            is_guilty: guilty == 1,
            interrogated_count: icount,
            confessed: conf == 1
          }
        end)

      _ ->
        []
    end
  end

  def list_case_clues(case_id) do
    ensure_schema!()

    case Repo.query(
           "SELECT id, clue_key, name, icon, clue_text, is_discovered, points_to_suspect_id FROM #{@clues_table} WHERE case_id = ?",
           [case_id]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, ckey, name, icon, text, disc, points_to] ->
          %{
            id: id,
            clue_key: ckey,
            name: name,
            icon: icon,
            clue_text: text,
            is_discovered: disc == 1,
            points_to_suspect_id: points_to
          }
        end)

      _ ->
        []
    end
  end

  @doc """
  Inspects the crime scene with forensic dusting and chalk analysis, discovering all evidence clues.
  """
  def inspect_crime_scene(case_id) do
    ensure_schema!()

    unless EngineFeatureFlags.is_enabled?("forensic_mysteries_enabled") do
      {:error, "Forensic crime mysteries are currently disabled by server policy"}
    else
      Repo.query!("UPDATE #{@clues_table} SET is_discovered = 1 WHERE case_id = ?", [case_id])
      clues = list_case_clues(case_id)

      {:ok,
       %{
         message: "Forensic analysis complete! Discovered #{length(clues)} crucial physical clues at the scene.",
         clues: clues
       }}
    end
  end

  @doc """
  Interrogates a suspect using verbal pressure or sleight-of-hand wiretap evidence.
  """
  def interrogate_suspect(case_id, suspect_id, tactic \\ "pressure") do
    ensure_schema!()

    case Repo.query(
           "SELECT name, is_guilty, interrogated_count FROM #{@suspects_table} WHERE case_id = ? AND suspect_id = ?",
           [case_id, suspect_id]
         ) do
      {:ok, %{rows: [[name, is_guilty, icount]]}} ->
        Repo.query!(
          "UPDATE #{@suspects_table} SET interrogated_count = interrogated_count + 1 WHERE case_id = ? AND suspect_id = ?",
          [case_id, suspect_id]
        )

        cond do
          is_guilty == 1 and (tactic == "evidence" or icount >= 1) ->
            Repo.query!(
              "UPDATE #{@suspects_table} SET confessed = 1 WHERE case_id = ? AND suspect_id = ?",
              [case_id, suspect_id]
            )

            {:ok,
             %{
               confessed: true,
               message:
                 "#{name} breaks down under relentless pressure! 'Alright! I did it! Lord Aubrey threatened to bankrupt my foundry! I hurled him out the window!'",
               suspect_name: name
             }}

          is_guilty == 1 ->
            {:ok,
             %{
               confessed: false,
               message:
                 "#{name} sweats profusely, avoiding eye contact. 'I told you, I was at the forge! You have no proof!'",
               suspect_name: name
             }}

          true ->
            {:ok,
             %{
               confessed: false,
               message: "#{name} stares calmly. 'Check your facts, detective. My ledger and witnesses are spotless.'",
               suspect_name: name
             }}
        end

      _ ->
        {:error, "Suspect not found"}
    end
  end

  @doc """
  Holds a trial in the City Courtroom. If accused is guilty, awards full bounty & magistrate rep.
  """
  def hold_courtroom_trial(case_id, accused_suspect_id) do
    ensure_schema!()

    case Repo.query(
           "SELECT culprit_suspect_id, reward_gold, reward_xp FROM #{@cases_table} WHERE id = ?",
           [case_id]
         ) do
      {:ok, %{rows: [[culprit_id, rgold, rxp]]}} ->
        is_correct = culprit_id == accused_suspect_id

        if is_correct do
          Repo.query!("UPDATE #{@cases_table} SET status = 'closed' WHERE id = ?", [case_id])

          {:ok,
           %{
             verdict: :guilty_convicted,
             success: true,
             message:
               "GUILTY AS CHARGED! The Magistrate slams the gavel. The culprit is condemned to the Iron Mines! You received +#{rgold}g and +#{rxp} XP.",
             reward_gold: rgold,
             reward_xp: rxp
           }}
        else
          {:ok,
           %{
             verdict: :innocent_mistrial,
             success: false,
             message:
               "MISTRIAL! The Magistrate dismisses your charges due to lack of proof. The real killer remains free in Lowtown!",
             reward_gold: 0,
             reward_xp: 50
           }}
        end

      _ ->
        {:error, "Case not found"}
    end
  end

  @doc """
  Underworld alternative: Accept a bribe from Silas to frame an innocent suspect.
  """
  def accept_bribe_to_frame(case_id, frame_suspect_id, bribe_gold \\ 350) do
    ensure_schema!()
    Repo.query!("UPDATE #{@cases_table} SET status = 'closed' WHERE id = ?", [case_id])

    {:ok,
     %{
       verdict: :corrupt_frame_job,
       success: true,
       message:
         "Silas slips you #{bribe_gold} gold under the table. Innocent suspect #{frame_suspect_id} takes the fall, and the Syndicate honors your silence!",
       bribe_gold: bribe_gold
     }}
  end
end
