defmodule TePhoenix.World.Shop do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_shops" do
    field :name, :string
    field :description, :string
    field :icon, :string, default: "🏪"
    field :map_id, :integer

    has_many :supplies, TePhoenix.World.ShopSupply, foreign_key: :shop_id
  end
end

defmodule TePhoenix.World.ShopSupply do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_shop_supplies" do
    field :buy_price, :integer, default: 100
    field :sell_price, :integer, default: 50
    field :stock, :integer, default: -1
    field :world_flag_conditions, :map
    field :flag_price_modifiers, :map

    belongs_to :shop, TePhoenix.World.Shop, foreign_key: :shop_id
    belongs_to :item, TePhoenix.Game.Item, foreign_key: :item_id
  end
end
