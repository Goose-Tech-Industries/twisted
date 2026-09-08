import Config

# Load local .env if present
env_file = Path.expand("../.env", __DIR__)
if File.exists?(env_file) do
  for line <- File.stream!(env_file) do
    case String.trim(line) do
      "#" <> _ -> :ok
      "" -> :ok
      line ->
        case String.split(line, "=", parts: 2) do
          [k, v] ->
            clean_v = String.trim(v, "'\" \t\r\n")
            System.put_env(String.trim(k), clean_v)
          _ -> :ok
        end
    end
  end
end

# config/runtime.exs is executed for all environments, including
# during releases. It is executed after compilation and before the
# system starts, so it is typically used to load production configuration
# and secrets from environment variables or elsewhere. Do not define
# any compile-time configuration in here, as it won't be applied.
# The block below contains prod specific runtime configuration.

# ## Using releases
#
# If you use `mix release`, you need to explicitly enable the server
# by passing the PHX_SERVER=true when you start it:
#
#     PHX_SERVER=true bin/te_phoenix start
#
# Alternatively, you can use `mix phx.gen.release` to generate a `bin/server`
# script that automatically sets the env var above.
if System.get_env("PHX_SERVER") do
  config :te_phoenix, TePhoenixWeb.Endpoint, server: true
end

config :te_phoenix, TePhoenixWeb.Endpoint,
  http: [port: String.to_integer(System.get_env("PORT", "8420"))]

if config_env() == :prod do
  database_url =
    System.get_env("DATABASE_URL") ||
      raise """
      environment variable DATABASE_URL is missing.
      For example: ecto://USER:PASS@HOST/DATABASE
      """

  maybe_ipv6 = if System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: []

  config :te_phoenix, TePhoenix.Repo,
    # ssl: true,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    # For machines with several cores, consider starting multiple pools of `pool_size`
    # pool_count: 4,
    socket_options: maybe_ipv6

  # The secret key base is used to sign/encrypt cookies and other secrets.
  # A default value is used in config/dev.exs and config/test.exs but you
  # want to use a different value for prod and you most likely don't want
  # to check this value into version control, so we use an environment
  # variable instead.
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  host = System.get_env("PHX_HOST") || "localhost"

  # Scheme and advertised URL port default to the listening port on
  # plain HTTP so generated links match how the app is actually being
  # served. Override with PHX_SCHEME=https and PHX_PORT=443 once you
  # terminate TLS in front of it.
  url_scheme = System.get_env("PHX_SCHEME") || "http"

  url_port =
    case System.get_env("PHX_PORT") do
      nil -> String.to_integer(System.get_env("PORT", "8420"))
      s -> String.to_integer(s)
    end

  config :te_phoenix, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  # check_origin: LiveView rejects websocket connections whose Origin
  # header doesn't match the configured URL host. On a dev/staging box
  # accessed via LAN IP, the configured host rarely matches — so we
  # default to permissive and let the operator lock it down via
  # CHECK_ORIGIN=https://yourhost.com when they're ready.
  check_origin =
    case System.get_env("CHECK_ORIGIN") do
      nil -> false
      "false" -> false
      "true" -> true
      list -> String.split(list, ",", trim: true)
    end

  config :te_phoenix, TePhoenixWeb.Endpoint,
    url: [host: host, port: url_port, scheme: url_scheme],
    check_origin: check_origin,
    http: [
      # Enable IPv6 and bind on all interfaces.
      # Set it to  {0, 0, 0, 0, 0, 0, 0, 1} for local network only access.
      ip: {0, 0, 0, 0, 0, 0, 0, 0}
    ],
    secret_key_base: secret_key_base

  # ## SSL Support
  #
  # To get SSL working, you will need to add the `https` key
  # to your endpoint configuration:
  #
  #     config :te_phoenix, TePhoenixWeb.Endpoint,
  #       https: [
  #         ...,
  #         port: 443,
  #         cipher_suite: :strong,
  #         keyfile: System.get_env("SOME_APP_SSL_KEY_PATH"),
  #         certfile: System.get_env("SOME_APP_SSL_CERT_PATH")
  #       ]
  #
  # The `cipher_suite` is set to `:strong` to support only the
  # latest and more secure SSL ciphers. This means old browsers
  # and clients may not be supported. You can set it to
  # `:compatible` for wider support.
  #
  # `:keyfile` and `:certfile` expect an absolute path to the key
  # and cert in disk or a relative path inside priv, for example
  # "priv/ssl/server.key". For all supported SSL configuration
  # options, see https://hexdocs.pm/plug/Plug.SSL.html#configure/1
  #
  # We also recommend setting `force_ssl` in your config/prod.exs,
  # ensuring no data is ever sent via http, always redirecting to https:
  #
  #     config :te_phoenix, TePhoenixWeb.Endpoint,
  #       force_ssl: [hsts: true]
  #
  # Check `Plug.SSL` for all available options in `force_ssl`.
end
