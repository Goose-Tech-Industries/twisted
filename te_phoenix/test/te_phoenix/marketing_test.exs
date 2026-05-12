defmodule TePhoenix.MarketingTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Marketing

  describe "record_signup/3 — validation only" do
    test "empty string rejected" do
      assert {:error, :empty_email} = Marketing.record_signup("", "x", nil)
      assert {:error, :empty_email} = Marketing.record_signup("   ", "x", nil)
    end

    test "non-string rejected" do
      assert {:error, :invalid_email} = Marketing.record_signup(nil, "x", nil)
      assert {:error, :invalid_email} = Marketing.record_signup(42, "x", nil)
    end

    test "obviously malformed rejected" do
      assert {:error, :invalid_email} = Marketing.record_signup("noatsign", "x", nil)
      assert {:error, :invalid_email} = Marketing.record_signup("a@b", "x", nil)
    end

    test "long email rejected" do
      long = String.duplicate("a", 250) <> "@example.com"
      assert {:error, :email_too_long} = Marketing.record_signup(long, "x", nil)
    end
  end
end
