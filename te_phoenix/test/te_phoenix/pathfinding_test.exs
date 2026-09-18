defmodule TePhoenix.PathfindingTest do
  use ExUnit.Case, async: false

  alias TePhoenix.{Capabilities, Pathfinding}

  setup do
    Capabilities.set_enabled(:pathfinding, true)
    Pathfinding.__init__()
    :ok
  end

  defp make_grid(width, height, default_val \\ 0) do
    List.duplicate(default_val, width * height)
  end

  defp set_blocked(grid, width, points) do
    Enum.reduce(points, grid, fn {x, y}, acc ->
      List.replace_at(acc, y * width + x, 1)
    end)
  end

  describe "Pathfinding.path/4 input validation" do
    test "returns error when width is missing" do
      grid = make_grid(5, 5)
      assert {:error, :missing_width} = Pathfinding.path({0, 0}, {2, 2}, grid, height: 5)
    end

    test "returns error when height is missing" do
      grid = make_grid(5, 5)
      assert {:error, :missing_height} = Pathfinding.path({0, 0}, {2, 2}, grid, width: 5)
    end

    test "returns error when capability is disabled" do
      Capabilities.set_enabled(:pathfinding, false)
      grid = make_grid(5, 5)
      assert {:error, :capability_disabled} = Pathfinding.path({0, 0}, {2, 2}, grid, width: 5, height: 5)
      Capabilities.set_enabled(:pathfinding, true)
    end
  end

  describe "Pathfinding.path/4 unobstructed routing" do
    test "returns single-point path when start equals goal" do
      grid = make_grid(5, 5)
      assert {:ok, [{2, 2}]} = Pathfinding.path({2, 2}, {2, 2}, grid, width: 5, height: 5)
    end

    test "finds straight horizontal path" do
      grid = make_grid(5, 5)
      assert {:ok, path} = Pathfinding.path({0, 2}, {4, 2}, grid, width: 5, height: 5)
      assert hd(path) == {0, 2}
      assert List.last(path) == {4, 2}
      assert length(path) == 5
    end

    test "finds straight vertical path" do
      grid = make_grid(5, 5)
      assert {:ok, path} = Pathfinding.path({2, 0}, {2, 4}, grid, width: 5, height: 5)
      assert hd(path) == {2, 0}
      assert List.last(path) == {2, 4}
      assert length(path) == 5
    end

    test "finds L-shaped path on 4-connected grid without diagonals" do
      grid = make_grid(3, 3)
      assert {:ok, path} = Pathfinding.path({0, 0}, {2, 2}, grid, width: 3, height: 3, diagonals: false)
      assert hd(path) == {0, 0}
      assert List.last(path) == {2, 2}
      # Manhattan distance is 4 steps -> 5 points inclusive
      assert length(path) == 5
    end

    test "finds diagonal path when diagonals: true" do
      grid = make_grid(3, 3)
      assert {:ok, path} = Pathfinding.path({0, 0}, {2, 2}, grid, width: 3, height: 3, diagonals: true)
      assert hd(path) == {0, 0}
      assert List.last(path) == {2, 2}
      # Diagonal direct step -> 3 points ({0,0}, {1,1}, {2,2})
      assert length(path) == 3
      assert path == [{0, 0}, {1, 1}, {2, 2}]
    end
  end

  describe "Pathfinding.path/4 obstacle navigation" do
    test "navigates around a wall obstacle" do
      # 5x5 grid with a vertical wall at x=2, y=1..3
      grid =
        make_grid(5, 5)
        |> set_blocked(5, [{2, 1}, {2, 2}, {2, 3}])

      assert {:ok, path} = Pathfinding.path({1, 2}, {3, 2}, grid, width: 5, height: 5)
      assert hd(path) == {1, 2}
      assert List.last(path) == {3, 2}

      # Path should NOT step on any blocked tiles
      refute {2, 1} in path
      refute {2, 2} in path
      refute {2, 3} in path
    end

    test "navigates around a U-shaped dead end" do
      # U-trap open to the left
      trap = [{2, 1}, {3, 1}, {3, 2}, {3, 3}, {2, 3}]
      grid = make_grid(5, 5) |> set_blocked(5, trap)

      # Start inside the trap at {2, 2}, goal outside at {4, 2}
      assert {:ok, path} = Pathfinding.path({2, 2}, {4, 2}, grid, width: 5, height: 5)
      assert hd(path) == {2, 2}
      assert List.last(path) == {4, 2}
      for p <- trap, do: refute p in path
    end

    test "returns {:error, :no_path} when goal is completely blocked" do
      # Wall across the entire width
      grid = make_grid(5, 5) |> set_blocked(5, [{0, 2}, {1, 2}, {2, 2}, {3, 2}, {4, 2}])
      assert {:error, :no_path} = Pathfinding.path({2, 0}, {2, 4}, grid, width: 5, height: 5)
    end

    test "returns {:error, :no_path} when goal itself is a blocked wall tile" do
      grid = make_grid(5, 5) |> set_blocked(5, [{4, 4}])
      assert {:error, :no_path} = Pathfinding.path({0, 0}, {4, 4}, grid, width: 5, height: 5)
    end

    test "allows escaping from a blocked start tile to walkable goal" do
      grid = make_grid(5, 5) |> set_blocked(5, [{0, 0}])
      assert {:ok, path} = Pathfinding.path({0, 0}, {4, 4}, grid, width: 5, height: 5)
      assert hd(path) == {0, 0}
      assert List.last(path) == {4, 4}
    end

    test "treats tile code 2 (trigger) as walkable" do
      grid =
        make_grid(5, 5)
        |> List.replace_at(1 * 5 + 1, 2)

      assert {:ok, path} = Pathfinding.path({0, 1}, {2, 1}, grid, width: 5, height: 5)
      assert {1, 1} in path
    end
  end

  describe "Pathfinding queue operations (enqueue, next_step, clear, queue_length)" do
    test "enqueue stores path for player" do
      route = [{0, 0}, {1, 0}, {2, 0}]
      assert :ok = Pathfinding.enqueue(101, route)
      assert Pathfinding.queue_length(101) == 3
    end

    test "next_step advances through path queue until done" do
      route = [{0, 0}, {1, 0}, {2, 0}]
      Pathfinding.enqueue(202, route)

      assert {:ok, {1, 0}, [{1, 0}, {2, 0}]} = Pathfinding.next_step(202)
      assert {:ok, {2, 0}, [{2, 0}]} = Pathfinding.next_step(202)
      assert :done = Pathfinding.next_step(202)
    end

    test "next_step returns :done for empty or unknown queue" do
      assert :done = Pathfinding.next_step(999_999)
    end

    test "clear wipes queue immediately" do
      route = [{0, 0}, {1, 0}, {2, 0}]
      Pathfinding.enqueue(303, route)
      assert Pathfinding.queue_length(303) == 3

      assert :ok = Pathfinding.clear(303)
      assert Pathfinding.queue_length(303) == 0
      assert :done = Pathfinding.next_step(303)
    end

    test "enqueue replaces any existing queue for the same character" do
      Pathfinding.enqueue(404, [{0, 0}, {1, 0}])
      assert Pathfinding.queue_length(404) == 2

      Pathfinding.enqueue(404, [{5, 5}, {6, 5}, {7, 5}, {8, 5}])
      assert Pathfinding.queue_length(404) == 4
      assert {:ok, {6, 5}, _rest} = Pathfinding.next_step(404)
    end
  end
end
