defmodule TePhoenixWeb.AuthController do
  @moduledoc """
  Auth endpoints: register, login, logout, me, email verification, invite codes, report player.
  Ported from routes/auth.js.
  """

  use TePhoenixWeb, :controller

  alias TePhoenix.Repo

  # ── CHECK FIELD (username/email taken?) ──────────────────────────

  def check_field(conn, %{"field" => field, "value" => value}) do
    if field not in ["username", "email"] do
      conn |> put_status(400) |> json(%{error: "Invalid field"})
    else
      case Repo.query("SELECT id FROM users WHERE #{field}=? LIMIT 1", [value]) do
        {:ok, %{rows: [_]}} -> json(conn, %{taken: true})
        _ -> json(conn, %{taken: false})
      end
    end
  end

  # ── REGISTER ─────────────────────────────────────────────────────

  def register(conn, params) do
    username = params["username"]
    password = params["password"]
    email = params["email"]
    honeypot = params["honeypot"]
    invite_code = params["inviteCode"]

    # Honeypot check (bot trap)
    if honeypot && honeypot != "" do
      json(conn, %{success: true})
    else
      cond do
        is_nil(username) or is_nil(password) or is_nil(email) ->
          json(conn, %{success: false, message: "All fields required."})

        String.length(username) < 3 or String.length(username) > 20 ->
          json(conn, %{success: false, message: "Username must be 3-20 characters."})

        not Regex.match?(~r/^[a-zA-Z0-9_]+$/, username) ->
          json(conn, %{success: false, message: "Username can only contain letters, numbers, and underscores."})

        String.length(password) < 6 ->
          json(conn, %{success: false, message: "Password must be 6+ characters."})

        true ->
          do_register(conn, username, password, email, invite_code)
      end
    end
  end

  defp do_register(conn, username, password, email, invite_code) do
    case Repo.query("SELECT id FROM users WHERE username=? OR email=?", [username, email]) do
      {:ok, %{rows: [_]}} ->
        json(conn, %{success: false, message: "Username or Email taken."})

      _ ->
        hash = Bcrypt.hash_pwd_salt(password)
        verify_token = :crypto.strong_rand_bytes(32) |> Base.encode16(case: :lower)
        invite = :crypto.strong_rand_bytes(4) |> Base.encode16(case: :upper)

        try do
          Repo.query!(
            "INSERT INTO users (username, password_hash, email, email_verified, email_verify_token, invite_code) VALUES (?,?,?,1,?,?)",
            [username, hash, email, verify_token, invite]
          )

          # Resolve referral
          if invite_code && String.trim(invite_code) != "" do
            case Repo.query("SELECT id FROM users WHERE invite_code=? LIMIT 1", [String.upcase(String.trim(invite_code))]) do
              {:ok, %{rows: [[referrer_id]]}} ->
                Repo.query("UPDATE users SET referred_by=? WHERE username=?", [referrer_id, username])
              _ -> nil
            end
          end

          json(conn, %{success: true, message: "Welcome to the Carnage."})
        rescue
          _ -> json(conn, %{success: false, message: "Database Error"})
        end
    end
  end

  # ── LOGIN ────────────────────────────────────────────────────────

  def login(conn, %{"username" => username, "password" => password}) do
    case Repo.query("SELECT id, username, password_hash, role, is_banned, login_streak, last_login_date, email_verified FROM users WHERE username=?", [username]) do
      {:ok, %{rows: [[id, uname, hash, role, banned, streak, last_date, _verified]]}} ->
        cond do
          banned == 1 or banned == true ->
            json(conn, %{success: false, message: "Account suspended."})

          not Bcrypt.verify_pass(password, hash) ->
            json(conn, %{success: false, message: "Wrong password."})

          true ->
            # Daily login reward
            daily_reward = calculate_daily_reward(id, streak, last_date)

            # Generate token for WebSocket auth
            token = Phoenix.Token.sign(TePhoenixWeb.Endpoint, "user socket", id)

            conn = conn
              |> put_session(:user_id, id)
              |> put_session(:username, uname)
              |> put_session(:role, role)

            json(conn, %{
              success: true, username: uname, role: role || "PLAYER",
              token: token, dailyReward: daily_reward
            })
        end

      _ ->
        json(conn, %{success: false, message: "User not found."})
    end
  end

  def login(conn, _), do: json(conn, %{success: false, message: "Username and password required."})

  # ── ME ───────────────────────────────────────────────────────────

  def me(conn, _params) do
    user_id = get_session(conn, :user_id) || get_bearer_user_id(conn)

    if is_nil(user_id) do
      json(conn, %{success: false})
    else
      case Repo.query("SELECT username, role, chat_color FROM users WHERE id=?", [user_id]) do
        {:ok, %{rows: [[username, role, chat_color]]}} ->
          char_id = case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id DESC LIMIT 1", [user_id]) do
            {:ok, %{rows: [[id]]}} -> id
            _ -> nil
          end

          json(conn, %{success: true, username: username, role: role, chatColor: chat_color, charId: char_id})

        _ -> json(conn, %{success: false})
      end
    end
  end

  # ── LOGOUT ───────────────────────────────────────────────────────

  def logout(conn, _params) do
    conn
    |> clear_session()
    |> json(%{success: true})
  end

  # ── VERIFY EMAIL ─────────────────────────────────────────────────

  def verify_email(conn, %{"token" => token}) do
    case Repo.query("SELECT id, email_verify_expires FROM users WHERE email_verify_token=? LIMIT 1", [token]) do
      {:ok, %{rows: [[id, expires]]}} ->
        if expires && NaiveDateTime.compare(expires, NaiveDateTime.utc_now()) == :lt do
          text(conn, "This link has expired.")
        else
          Repo.query!("UPDATE users SET email_verified=1, email_verify_token=NULL WHERE id=?", [id])
          text(conn, "Email verified! You can now log in.")
        end
      _ ->
        text(conn, "Invalid or expired link.")
    end
  end

  def verify_email(conn, _), do: conn |> put_status(400) |> text("Invalid link.")

  # ── INVITE CODE ──────────────────────────────────────────────────

  def invite_code(conn, _params) do
    user_id = get_session(conn, :user_id)

    if is_nil(user_id) do
      json(conn, %{success: false})
    else
      case Repo.query("SELECT invite_code FROM users WHERE id=?", [user_id]) do
        {:ok, %{rows: [[code]]}} when not is_nil(code) ->
          json(conn, %{success: true, code: code})

        {:ok, %{rows: [[nil]]}} ->
          new_code = :crypto.strong_rand_bytes(4) |> Base.encode16(case: :upper)
          Repo.query("UPDATE users SET invite_code=? WHERE id=?", [new_code, user_id])
          json(conn, %{success: true, code: new_code})

        _ -> json(conn, %{success: false})
      end
    end
  end

  # ── REPORT PLAYER ────────────────────────────────────────────────

  def report_player(conn, params) do
    user_id = conn.assigns[:user_id] || get_session(conn, :user_id)

    if is_nil(user_id) do
      json(conn, %{success: false, error: "Not logged in."})
    else
      reporter_char_id = params["reporterCharId"]
      reported_char_id = params["reportedCharId"]
      reason = params["reason"]

      valid_reasons = ~w(harassment cheating spam offensive_name bug_abuse other)

      if reason not in valid_reasons do
        json(conn, %{success: false, error: "Invalid reason."})
      else
        try do
          case Repo.query("SELECT id, name FROM characters WHERE id=? AND user_id=?", [reporter_char_id, user_id]) do
            {:ok, %{rows: [[r_id, r_name]]}} ->
              case Repo.query("SELECT id, name FROM characters WHERE id=?", [reported_char_id]) do
                {:ok, %{rows: [[d_id, d_name]]}} ->
                  if r_id == d_id do
                    json(conn, %{success: false, error: "You can't report yourself."})
                  else
                    case Repo.query("SELECT id FROM player_reports WHERE reporter_char_id=? AND reported_char_id=? AND created_at > NOW() - INTERVAL 24 HOUR LIMIT 1", [r_id, d_id]) do
                      {:ok, %{rows: [_]}} ->
                        json(conn, %{success: false, error: "You already reported this player today."})
                      _ ->
                        Repo.query!("INSERT INTO player_reports (reporter_char_id, reporter_name, reported_char_id, reported_name, reason, details) VALUES (?,?,?,?,?,?)",
                          [r_id, r_name, d_id, d_name, reason, String.slice(params["details"] || "", 0, 500)])
                        json(conn, %{success: true})
                    end
                  end

                _ -> json(conn, %{success: false, error: "Player not found."})
              end
            _ -> json(conn, %{success: false, error: "Unauthorized."})
          end
        rescue
          e -> json(conn, %{success: false, error: Exception.message(e)})
        end
      end
    end
  end

  # ── RESEND VERIFY ────────────────────────────────────────────────

  def resend_verify(conn, %{"email" => email}) do
    # Generates new token but email sending requires SMTP config
    case Repo.query("SELECT id, username, email_verified FROM users WHERE email=? LIMIT 1", [email]) do
      {:ok, %{rows: [[_id, _username, verified]]}} ->
        if verified == 1 do
          json(conn, %{success: false, message: "Email is already verified."})
        else
          json(conn, %{success: true, message: "If that email is registered, we sent a new link."})
        end
      _ ->
        json(conn, %{success: true, message: "If that email is registered, we sent a new link."})
    end
  end

  # ── Private ──────────────────────────────────────────────────────

  defp get_bearer_user_id(conn) do
    case Plug.Conn.get_req_header(conn, "authorization") do
      ["Bearer " <> token] ->
        case Phoenix.Token.verify(TePhoenixWeb.Endpoint, "user socket", token, max_age: 86_400) do
          {:ok, user_id} -> user_id
          _ -> nil
        end
      _ -> nil
    end
  end

  defp calculate_daily_reward(user_id, streak, last_date) do
    today = Date.utc_today() |> Date.to_iso8601()
    last = if last_date, do: last_date |> to_string() |> String.slice(0, 10), else: nil

    if last == today do
      # Already claimed today
      Repo.query("UPDATE users SET last_login=NOW() WHERE id=?", [user_id])
      nil
    else
      yesterday = Date.utc_today() |> Date.add(-1) |> Date.to_iso8601()
      new_streak = if last == yesterday, do: (streak || 0) + 1, else: 1

      rewards = [50, 100, 150, 200, 300, 400, 500]
      # Try to load custom rewards from settings
      rewards = case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key='daily_login_rewards' LIMIT 1") do
        {:ok, %{rows: [[json]]}} ->
          case Jason.decode(to_string(json)) do
            {:ok, list} when is_list(list) and list != [] -> list
            _ -> rewards
          end
        _ -> rewards
      end

      idx = min(new_streak - 1, length(rewards) - 1)
      gold = Enum.at(rewards, idx, 50)
      is_weekly = rem(new_streak, 7) == 0

      try do
        Repo.query!("UPDATE users SET last_login=NOW(), last_login_date=?, login_streak=?, currency=currency+? WHERE id=?",
          [today, new_streak, gold, user_id])
      rescue
        _ -> Repo.query("UPDATE users SET last_login=NOW() WHERE id=?", [user_id])
      end

      %{gold: gold, streak: new_streak, bonus: is_weekly,
        message: if(is_weekly, do: "#{new_streak}-day streak! Bonus reward: #{gold}g!", else: "Day #{new_streak} login reward: #{gold}g!")}
    end
  end
end
