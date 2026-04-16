defmodule TePhoenix.Game.CharacterEquipment do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "character_equipment" do
    field :slot_key, :string

    belongs_to :character, TePhoenix.Game.Character, foreign_key: :character_id
    belongs_to :item, TePhoenix.Game.Item, foreign_key: :item_id
  end
end
