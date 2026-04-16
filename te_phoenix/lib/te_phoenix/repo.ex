defmodule TePhoenix.Repo do
  use Ecto.Repo,
    otp_app: :te_phoenix,
    adapter: Ecto.Adapters.MyXQL
end
