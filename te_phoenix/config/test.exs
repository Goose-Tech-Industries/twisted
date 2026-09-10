import Config

# Configure your database
#
# The MIX_TEST_PARTITION environment variable can be used
# to provide built-in test partitioning in CI environment.
# Run `mix help test` for more information.
config :te_phoenix, TePhoenix.Repo,
  username: System.get_env("TE_DB_USER") || "postgres",
  password: System.get_env("TE_DB_PASSWORD") || "postgres",
  hostname: System.get_env("TE_DB_HOST") || "127.0.0.1",
  port: String.to_integer(System.get_env("TE_DB_PORT") || "5432"),
  database: "twisted_rpg_test",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: 10

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :te_phoenix, TePhoenixWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "/F8a5yYDVLDlv2N7ZxOBJUTJ5ZvbC8jBeVQW1oetl8tdKhyhoYVNKfqtxl04DK+U",
  server: false

# Print only warnings and errors during test
config :logger, level: :warning

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true
