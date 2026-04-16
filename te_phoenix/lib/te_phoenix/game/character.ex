defmodule TePhoenix.Game.Character do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "characters" do
    field :name, :string
    field :level, :integer, default: 1
    field :experience, :integer, default: 0
    field :current_hp, :integer, default: 100
    field :max_hp, :integer, default: 100
    field :current_mp, :integer, default: 50
    field :max_mp, :integer, default: 50
    field :atk, :integer, default: 10
    field :def, :integer, default: 5
    field :mo, :integer, default: 5
    field :md, :integer, default: 5
    field :speed, :integer, default: 10
    field :luck, :integer, default: 5
    field :map_id, :integer, default: 1
    field :x, :integer, default: 10
    field :y, :integer, default: 10
    field :limitbreak, :float, default: 0.0
    field :breaklevel, :integer, default: 1
    field :battle_record, :map
    field :status_effects, :map
    field :state_json, :string
    field :respawn_map_id, :integer, default: 1
    field :respawn_x, :integer, default: 10
    field :respawn_y, :integer, default: 10
    field :profile_bio, :string
    field :profile_color, :string, default: "#bb86fc"
    field :profile_banner_emoji, :string, default: "⚔️"
    field :equipped_title, :string
    field :presence_status, :string, default: "online"

    belongs_to :user, TePhoenix.Accounts.User
    belongs_to :class, TePhoenix.Game.Class, foreign_key: :class_id
    belongs_to :race, TePhoenix.Game.Race, foreign_key: :race_id
    field :background_id, :integer, default: 0
    field :feat_id, :integer, default: 0

    has_many :items, TePhoenix.Game.CharacterItem, foreign_key: :character_id
    has_many :equipment, TePhoenix.Game.CharacterEquipment, foreign_key: :character_id

    timestamps(inserted_at: :created_at, updated_at: false)
  end
end
