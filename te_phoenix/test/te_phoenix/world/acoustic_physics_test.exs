defmodule TePhoenix.World.AcousticPhysicsTest do
  use ExUnit.Case, async: true

  alias TePhoenix.World.AcousticPhysics

  describe "AcousticPhysics.calculate_spatial_audio/4 distance and modes" do
    test "party mode is completely silent and private (zero external acoustic footprint)" do
      audio = AcousticPhysics.calculate_spatial_audio(%{x: 10, y: 10}, %{x: 10, y: 10}, "party")
      assert audio.audible == false
      assert audio.volume == 0.0
      assert audio.distance == 999.0
    end

    test "whisper mode is audible within 4 tiles" do
      # 2 tiles away: within whisper radius of 4
      audio = AcousticPhysics.calculate_spatial_audio(%{x: 12, y: 10}, %{x: 10, y: 10}, "whisper")
      assert audio.audible == true
      assert audio.distance == 2.0
      assert audio.volume > 0.0
    end

    test "whisper mode is inaudible beyond 4 tiles" do
      # 5 tiles away: beyond whisper radius of 4
      audio = AcousticPhysics.calculate_spatial_audio(%{x: 15, y: 10}, %{x: 10, y: 10}, "whisper")
      assert audio.audible == false
      assert audio.volume == 0.0
      assert audio.distance == 5.0
    end

    test "proximity mode is audible up to 16 tiles" do
      # 8 tiles away: half of proximity radius 16
      audio = AcousticPhysics.calculate_spatial_audio(%{x: 18, y: 10}, %{x: 10, y: 10}, "proximity")
      assert audio.audible == true
      assert audio.distance == 8.0
      assert audio.volume > 0.0
    end

    test "proximity mode is inaudible beyond 16 tiles" do
      # 20 tiles away: beyond proximity radius 16
      audio = AcousticPhysics.calculate_spatial_audio(%{x: 30, y: 10}, %{x: 10, y: 10}, "proximity")
      assert audio.audible == false
      assert audio.volume == 0.0
      assert audio.distance == 20.0
    end

    test "shout mode is audible up to 32 tiles" do
      # 25 tiles away: within shout radius 32
      audio = AcousticPhysics.calculate_spatial_audio(%{x: 35, y: 10}, %{x: 10, y: 10}, "shout")
      assert audio.audible == true
      assert audio.distance == 25.0
    end

    test "shout mode has higher reverb than normal proximity" do
      audio = AcousticPhysics.calculate_spatial_audio(%{x: 15, y: 10}, %{x: 10, y: 10}, "shout")
      assert audio.reverb >= 0.45
    end
  end

  describe "AcousticPhysics.calculate_spatial_audio/4 stereo panning" do
    test "speaker to the right pans audio to the right (+pan)" do
      # Speaker at x:16, Listener at x:10 -> dx = +6
      audio = AcousticPhysics.calculate_spatial_audio(%{x: 16, y: 10}, %{x: 10, y: 10}, "proximity")
      assert audio.pan > 0.0
      assert audio.pan <= 1.0
    end

    test "speaker to the left pans audio to the left (-pan)" do
      # Speaker at x:4, Listener at x:10 -> dx = -6
      audio = AcousticPhysics.calculate_spatial_audio(%{x: 4, y: 10}, %{x: 10, y: 10}, "proximity")
      assert audio.pan < 0.0
      assert audio.pan >= -1.0
    end

    test "speaker at identical x coordinate centers audio (pan = 0.0)" do
      audio = AcousticPhysics.calculate_spatial_audio(%{x: 10, y: 14}, %{x: 10, y: 10}, "proximity")
      assert audio.pan == 0.0
    end

    test "pan is clamped between -1.0 and 1.0 on large offsets" do
      # Distance is 25 tiles (within shout max_radius of 32 tiles), dx = +25, dx/8 = 3.125 clamped to 1.0
      audio_right = AcousticPhysics.calculate_spatial_audio(%{x: 35, y: 10}, %{x: 10, y: 10}, "shout")
      assert audio_right.pan == 1.0

      audio_left = AcousticPhysics.calculate_spatial_audio(%{x: 10, y: 10}, %{x: 35, y: 10}, "shout")
      assert audio_left.pan == -1.0
    end
  end

  describe "AcousticPhysics.calculate_footstep/4 surface acoustics" do
    test "stone footstep has expected default decibels and frequency" do
      step = AcousticPhysics.calculate_footstep(:stone, :walk, %{x: 10, y: 10}, "day")
      assert step.surface == :stone
      assert step.decibels == 55
      assert step.frequency == 1800
      assert step.radius == 6
      assert step.is_night == false
    end

    test "metal footstep is loud with high decibels and radius" do
      step = AcousticPhysics.calculate_footstep(:metal, :walk, %{x: 10, y: 10}, "day")
      assert step.surface == :metal
      assert step.decibels == 75
      assert step.radius == 10
      assert step.frequency == 2400
    end

    test "grass footstep is soft with low decibels and radius" do
      step = AcousticPhysics.calculate_footstep(:grass, :walk, %{x: 10, y: 10}, "day")
      assert step.surface == :grass
      assert step.decibels == 32
      assert step.radius == 3
    end

    test "dirt footstep is soft" do
      step = AcousticPhysics.calculate_footstep(:dirt, :walk, %{x: 10, y: 10}, "day")
      assert step.surface == :dirt
      assert step.decibels == 35
      assert step.radius == 3
    end

    test "water footstep has expected surface values" do
      step = AcousticPhysics.calculate_footstep(:water, :walk, %{x: 10, y: 10}, "day")
      assert step.surface == :water
      assert step.decibels == 62
      assert step.radius == 8
    end
  end

  describe "AcousticPhysics.calculate_footstep/4 locomotion stances" do
    test "stealth stance substantially reduces acoustic radius" do
      walk_step = AcousticPhysics.calculate_footstep(:stone, :walk, %{x: 10, y: 10}, "day")
      stealth_step = AcousticPhysics.calculate_footstep(:stone, :stealth, %{x: 10, y: 10}, "day")

      assert stealth_step.radius < walk_step.radius
      assert stealth_step.decibels < walk_step.decibels
      assert stealth_step.can_awaken == false
    end

    test "sprint stance amplifies footstep radius and volume" do
      walk_step = AcousticPhysics.calculate_footstep(:stone, :walk, %{x: 10, y: 10}, "day")
      sprint_step = AcousticPhysics.calculate_footstep(:stone, :sprint, %{x: 10, y: 10}, "day")

      assert sprint_step.radius > walk_step.radius
      assert sprint_step.decibels > walk_step.decibels
      assert sprint_step.can_awaken == true
    end
  end

  describe "AcousticPhysics.calculate_footstep/4 circadian nocturnal dynamics" do
    test "nighttime expands sound radius by 1.5x" do
      day_step = AcousticPhysics.calculate_footstep(:stone, :walk, %{x: 10, y: 10}, "day")
      night_step = AcousticPhysics.calculate_footstep(:stone, :walk, %{x: 10, y: 10}, "night")

      assert night_step.is_night == true
      # Day radius is 6, night radius is round(6 * 1.5) = 9
      assert night_step.radius == 9
      assert night_step.radius > day_step.radius
    end

    test "recognizes midnight and dusk as nighttime" do
      midnight_step = AcousticPhysics.calculate_footstep(:stone, :walk, %{x: 10, y: 10}, "midnight")
      dusk_step = AcousticPhysics.calculate_footstep(:stone, :walk, %{x: 10, y: 10}, "dusk")

      assert midnight_step.is_night == true
      assert dusk_step.is_night == true
    end

    test "stealth walking at night still does NOT awaken sleepers" do
      step = AcousticPhysics.calculate_footstep(:stone, :stealth, %{x: 10, y: 10}, "night")
      assert step.can_awaken == false
    end

    test "sprinting on stone at night flags can_awaken as true" do
      step = AcousticPhysics.calculate_footstep(:stone, :sprint, %{x: 10, y: 10}, "night")
      assert step.can_awaken == true
    end

    test "soft grass walking does NOT awaken sleepers even in daytime" do
      step = AcousticPhysics.calculate_footstep(:grass, :walk, %{x: 10, y: 10}, "day")
      assert step.can_awaken == false
    end
  end
end
