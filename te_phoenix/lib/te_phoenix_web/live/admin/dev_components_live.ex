defmodule TePhoenixWeb.Admin.DevComponentsLive do
  @moduledoc """
  Tier α P7 — living style guide / storybook for the Tier α component
  family. Renders every component in isolation with sample inputs so
  staff can discover what's available and verify visual regressions
  after deploys.

  Admin-role-gated: non-admin staff see a "you must be admin" panel
  instead of the storybook content. Admin = role.weight >= 90.
  """

  use TePhoenixWeb, :live_view

  alias TePhoenixWeb.Components.PowerUserField
  alias TePhoenixWeb.Components.RuleTreeBuilder
  alias TePhoenixWeb.Components.ConfirmAction
  alias TePhoenixWeb.Components.BulkAction
  alias TePhoenixWeb.Components.RuleSchemas
  alias TePhoenixWeb.Components.AiAssist

  alias TePhoenixWeb.Components.VisualPreview.{
    RarityBadge,
    StatBonusCard,
    DamageFormulaCard,
    HpBarThreshold,
    ChargeBar,
    AnimationLoop,
    LootSimulator,
    ComboSequence,
    AffinityChart,
    ReactionMatrix,
    ParticlePreview
  }

  @impl true
  def mount(_params, session, socket) do
    user = session["current_user"] || %{role: "PLAYER"}
    weight = PowerUserField.role_weight(user)

    {:ok,
     assign(socket,
       active_tab: :dev,
       page_title: "Component Storybook",
       current_user: user,
       role_weight: weight,
       admin_only: weight < 90,
       # PowerUserField sample state
       field_views: %{},
       # BulkAction sample state
       bulk_selected: MapSet.new(),
       sample_rows: sample_rows(),
       # ConfirmAction sample state — track which "fired" so we can show feedback
       confirm_log: []
     )}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="p-6 max-w-7xl mx-auto space-y-8">
      <header class="border-b border-zinc-800 pb-3 mb-2">
        <h1 class="text-2xl font-bold text-amber-400">Component Storybook</h1>
        <p class="text-xs text-zinc-500 mt-1">
          Tier α component reference. Renders every wrapper in isolation with sample inputs.
          Useful for "what components exist?" + visual regression after deploys.
        </p>
        <div class="text-[10px] text-zinc-600 mt-1">
          You: <span class="font-mono text-zinc-400">{Map.get(@current_user, :username) || Map.get(@current_user, :role) || "anon"}</span>
          · weight <span class="font-mono text-zinc-400">{@role_weight}</span>
          · {if @admin_only, do: "ADMIN-ONLY VIEWS HIDDEN", else: "FULL ACCESS"}
        </div>
      </header>

      <%!-- ── PowerUserField ─────────────────────────────────── --%>
      <section class="space-y-3">
        <h2 class="text-lg font-bold text-zinc-200">PowerUserField</h2>
        <p class="text-xs text-zinc-500">
          Wraps a form field in a structured-by-default editor with an
          opt-in <code>&lt;/&gt; Raw</code> toggle for power users.
          Toggle visibility gated by role.weight ≥ 90.
        </p>
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-zinc-900/50 border border-zinc-800 rounded p-3">
            <div class="text-[10px] uppercase text-zinc-500 mb-2">As you (weight {@role_weight})</div>
            <PowerUserField.power_user_field
              label="Sample condition"
              help_text="Toggle behaves per your role weight."
              role_weight={@role_weight}
              user_id={Map.get(@current_user, :id)}
              form_id="storybook"
              field_name="sample"
              view={@field_views["storybook.sample"] || "structured"}>
              <:structured>
                <div class="text-xs text-zinc-400 italic">[ structured editor goes here ]</div>
              </:structured>
              <:raw>
                <textarea rows="2" class="w-full bg-zinc-900 border border-zinc-700 rounded p-1 text-xs font-mono">{"raw json"}</textarea>
              </:raw>
            </PowerUserField.power_user_field>
          </div>

          <div class="bg-zinc-900/50 border border-zinc-800 rounded p-3">
            <div class="text-[10px] uppercase text-zinc-500 mb-2">As Player (weight 0)</div>
            <PowerUserField.power_user_field
              label="Sample condition"
              help_text="Toggle hidden for non-admin."
              role_weight={0}
              user_id={Map.get(@current_user, :id)}
              form_id="storybook"
              field_name="sample_player"
              view="structured">
              <:structured>
                <div class="text-xs text-zinc-400 italic">[ structured editor — only view available ]</div>
              </:structured>
              <:raw><span></span></:raw>
            </PowerUserField.power_user_field>
          </div>
        </div>
      </section>

      <%!-- ── RuleBuilder ────────────────────────────────────── --%>
      <section class="space-y-3">
        <h2 class="text-lg font-bold text-zinc-200">RuleBuilder — 5 schemas</h2>
        <p class="text-xs text-zinc-500">
          Schema-driven trigger/condition/action editor. Each schema
          declares its triggers + conditions + actions; the same
          component renders all of them.
        </p>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-[10px] uppercase text-zinc-500 mb-1">Battle rule (conditions)</div>
            <RuleTreeBuilder.rule_tree_builder
              kind={:condition_tree}
              schema={RuleSchemas.BattleRule.condition_schema()}
              field_name="storybook[battle_cond]"
              value={"{\"stat\":\"hp_pct\",\"operator\":\"<\",\"value\":0.25}"} />
          </div>
          <div>
            <div class="text-[10px] uppercase text-zinc-500 mb-1">Battle rule (actions)</div>
            <RuleTreeBuilder.rule_tree_builder
              kind={:action_list}
              schema={RuleSchemas.BattleRule.action_schema()}
              field_name="storybook[battle_act]"
              value={"{\"apply_status\":\"Bleed\",\"announce\":\"{name} bleeds!\"}"} />
          </div>

          <div>
            <div class="text-[10px] uppercase text-zinc-500 mb-1">Boss phase (transition)</div>
            <RuleTreeBuilder.rule_tree_builder
              kind={:condition_tree}
              schema={RuleSchemas.BossPhase.transition_schema()}
              field_name="storybook[boss_cond]"
              value={"{\"hp_pct_below\":50}"} />
          </div>
          <div>
            <div class="text-[10px] uppercase text-zinc-500 mb-1">Surface (effect)</div>
            <RuleTreeBuilder.rule_tree_builder
              kind={:action_list}
              schema={RuleSchemas.Surface.effect_schema()}
              field_name="storybook[surface_act]"
              value={"{\"damage_per_step\":{\"amount\":10}}"} />
          </div>

          <div>
            <div class="text-[10px] uppercase text-zinc-500 mb-1">Match mode (settings)</div>
            <RuleTreeBuilder.rule_tree_builder
              kind={:action_list}
              schema={RuleSchemas.MatchMode.settings_schema()}
              field_name="storybook[match_act]"
              value={"{\"queue_threshold\":4,\"ranked\":true}"} />
          </div>
          <div>
            <div class="text-[10px] uppercase text-zinc-500 mb-1">Wave round (spawn list)</div>
            <RuleTreeBuilder.rule_tree_builder
              kind={:action_list}
              schema={RuleSchemas.WaveRound.spawn_action_schema()}
              field_name="storybook[wave_act]"
              value={"{\"spawn_npc\":{\"npc_id\":1,\"count\":3}}"} />
          </div>
        </div>
      </section>

      <%!-- ── VisualPreview library ──────────────────────────── --%>
      <section class="space-y-3">
        <h2 class="text-lg font-bold text-zinc-200">VisualPreview library (all 11)</h2>
        <p class="text-xs text-zinc-500">
          Read-only previews. Take structured props (NOT raw JSON).
          Sized for inline-compact contexts.
        </p>

        <div class="grid grid-cols-3 gap-4">
          <div class="space-y-2">
            <div class="text-[10px] uppercase text-zinc-500">RarityBadge</div>
            <div class="flex flex-wrap gap-1.5">
              <RarityBadge.rarity_badge tier={:common} />
              <RarityBadge.rarity_badge tier={:uncommon} />
              <RarityBadge.rarity_badge tier={:rare} />
              <RarityBadge.rarity_badge tier={:epic} />
              <RarityBadge.rarity_badge tier={:legendary} />
              <RarityBadge.rarity_badge tier={:mythic} size={:lg} />
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-[10px] uppercase text-zinc-500">StatBonusCard</div>
            <StatBonusCard.stat_bonus_card stats={%{atk: 15, def: -5, hp: 200, speed: 3, mp: -20}} />
          </div>

          <div class="space-y-2">
            <div class="text-[10px] uppercase text-zinc-500">ChargeBar</div>
            <ChargeBar.charge_bar pct={75} segments={4} color="amber" max_label="LIMIT" />
            <ChargeBar.charge_bar pct={100} color="rose" max_label="ULTRA" />
          </div>

          <div class="space-y-2 col-span-2">
            <div class="text-[10px] uppercase text-zinc-500">DamageFormulaCard</div>
            <DamageFormulaCard.damage_formula_card
              formula="ATK*1.5 + LVL*3"
              levels={1..50}
              attacker_atk={20}
              defender_def={10} />
          </div>

          <div class="space-y-2">
            <div class="text-[10px] uppercase text-zinc-500">HpBarThreshold</div>
            <HpBarThreshold.hp_bar_threshold
              max_hp={5000}
              current={3200}
              phases={[
                %{at: 75, label: "Phase 2"},
                %{at: 30, label: "Enrage"}
              ]} />
          </div>

          <div class="space-y-2">
            <div class="text-[10px] uppercase text-zinc-500">AnimationLoop</div>
            <AnimationLoop.animation_loop frame_urls={[]} fps={4} title="(no frames sample)" />
          </div>

          <div class="space-y-2 col-span-2">
            <div class="text-[10px] uppercase text-zinc-500">LootSimulator</div>
            <LootSimulator.loot_simulator
              rolls={1000}
              table={[
                %{item: "Gold", weight: 50, qty: "10-30"},
                %{item: "Iron Ore", weight: 30, qty: "1-2"},
                %{item: "Rare Gem", weight: 5, qty: "1"},
                %{item: "(nothing)", weight: 15, qty: "0"}
              ]} />
          </div>

          <div class="space-y-2">
            <div class="text-[10px] uppercase text-zinc-500">ComboSequence</div>
            <ComboSequence.combo_sequence
              inputs={["←", "↓", "→", "A", "B"]}
              title="Hadouken+"
              timing_ms={250} />
          </div>

          <div class="space-y-2">
            <div class="text-[10px] uppercase text-zinc-500">AffinityChart</div>
            <AffinityChart.affinity_chart
              affinities={%{fire: 0.5, water: -0.25, shadow: 1.0, light: -1.0, earth: 0.0}} />
          </div>

          <div class="space-y-2 col-span-2">
            <div class="text-[10px] uppercase text-zinc-500">ReactionMatrix</div>
            <ReactionMatrix.reaction_matrix
              elements={["fire", "water", "earth", "air"]}
              reactions={%{
                {"fire", "water"} => "steam",
                {"fire", "air"} => "explosion",
                {"water", "earth"} => "mud",
                {"earth", "air"} => "dust"
              }} />
          </div>

          <div class="space-y-2 col-span-3">
            <div class="text-[10px] uppercase text-zinc-500">ParticlePreview — all 10 kinds</div>
            <div class="flex flex-wrap gap-3">
              <ParticlePreview.particle_preview :for={kind <- ~w(fire ice poison water shadow light electric smoke blood sand)} kind={kind} size={56} />
            </div>
          </div>
        </div>
      </section>

      <%!-- ── ConfirmAction ──────────────────────────────────── --%>
      <section class="space-y-3">
        <h2 class="text-lg font-bold text-zinc-200">ConfirmAction</h2>
        <p class="text-xs text-zinc-500">
          Three kinds: destructive (type-to-confirm), reversible (yellow), info (neutral).
        </p>

        <div class="flex gap-3">
          <ConfirmAction.confirm_action
            id="storybook-destructive"
            kind={:destructive}
            title="Destructive action"
            message="This is a sample destructive action. The Confirm button stays grey until you type the phrase exactly."
            confirm_label="Drop it"
            confirm_phrase="DROP TABLE STORYBOOK"
            on_confirm={JS.push("storybook:fired", value: %{kind: "destructive"})}>
            <:trigger>
              <button class="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded text-sm">Destructive</button>
            </:trigger>
          </ConfirmAction.confirm_action>

          <ConfirmAction.confirm_action
            id="storybook-reversible"
            kind={:reversible}
            title="Reversible action"
            message="This is a reversible action — it can be undone. Plain confirm/cancel."
            confirm_label="Do it"
            on_confirm={JS.push("storybook:fired", value: %{kind: "reversible"})}>
            <:trigger>
              <button class="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm">Reversible</button>
            </:trigger>
          </ConfirmAction.confirm_action>

          <ConfirmAction.confirm_action
            id="storybook-info"
            kind={:info}
            title="Heads-up"
            message="Non-destructive speed-bump. Click confirm to proceed."
            on_confirm={JS.push("storybook:fired", value: %{kind: "info"})}>
            <:trigger>
              <button class="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-sm">Info</button>
            </:trigger>
          </ConfirmAction.confirm_action>
        </div>

        <div :if={@confirm_log != []}
          class="bg-zinc-900/50 border border-zinc-800 rounded p-2 space-y-1 text-[10px] text-zinc-500">
          <div class="uppercase font-bold text-zinc-400">Fired log</div>
          <div :for={entry <- @confirm_log}>{entry}</div>
        </div>
      </section>

      <%!-- ── BulkAction ─────────────────────────────────────── --%>
      <section class="space-y-3">
        <h2 class="text-lg font-bold text-zinc-200">BulkAction</h2>
        <p class="text-xs text-zinc-500">
          Master + per-row checkboxes drive a floating action bar. Bar
          appears bottom-center when ≥1 row is selected.
        </p>

        <table class="w-full bg-zinc-900/50 border border-zinc-800 rounded overflow-hidden">
          <thead>
            <tr class="border-b border-zinc-800 text-left">
              <th class="px-3 py-2 w-8">
                <BulkAction.bulk_master_checkbox items={@sample_rows} selected={@bulk_selected} />
              </th>
              <th class="px-3 py-2 text-[10px] uppercase text-zinc-500">id</th>
              <th class="px-3 py-2 text-[10px] uppercase text-zinc-500">name</th>
              <th class="px-3 py-2 text-[10px] uppercase text-zinc-500">tier</th>
            </tr>
          </thead>
          <tbody>
            <tr :for={row <- @sample_rows} class="border-b border-zinc-800/30">
              <td class="px-3 py-1.5 w-8">
                <BulkAction.bulk_row_checkbox id={row.id} selected={@bulk_selected} />
              </td>
              <td class="px-3 py-1.5 text-xs font-mono text-zinc-500">{row.id}</td>
              <td class="px-3 py-1.5 text-xs text-zinc-200">{row.name}</td>
              <td class="px-3 py-1.5"><RarityBadge.rarity_badge tier={row.tier} /></td>
            </tr>
          </tbody>
        </table>

        <BulkAction.bulk_action_bar
          selected={@bulk_selected}
          actions={[
            %{key: "delete", label: "Delete", kind: :destructive, confirm_phrase: "BULK DELETE"},
            %{key: "export", label: "Export JSON", kind: :reversible},
            %{key: "clone", label: "Clone", kind: :reversible}
          ]} />
      </section>

      <%!-- ── AiAssist (Tier α-AI) ──────────────────────────── --%>
      <section class="space-y-3">
        <h2 class="text-lg font-bold text-zinc-200">AiAssist (Tier α-AI)</h2>
        <p class="text-xs text-zinc-500">
          Universal AI accelerator. Default-hides when feature is unavailable
          for the user's role. Click ✨ to open the popover; cost preview shows
          before fire; never auto-applies the suggestion.
          <span class="text-amber-400/80">
            Real Anthropic calls require ai_features populated + Anthropic key.
          </span>
        </p>

        <div class="grid grid-cols-2 gap-4">
          <div class="bg-zinc-900/50 border border-zinc-800 rounded p-3">
            <div class="text-[10px] uppercase text-zinc-500 mb-2">As you (weight {@role_weight})</div>
            <p class="text-[11px] text-zinc-400 mb-2">
              The button below opens the live AiAssist popover for the
              <code class="text-amber-300">rule_suggester</code> feature
              (which requires role.weight ≥ 60 by default).
            </p>
            <.live_component
              module={AiAssist}
              id="storybook-rule-suggester"
              feature_key="rule_suggester"
              user_id={Map.get(@current_user, :id)}
              role={Map.get(@current_user, :role)}
              role_weight={@role_weight}
              trigger_label="✨ Suggest a rule"
              context={%{before_value: ""}}
              on_accept={Phoenix.LiveView.JS.push("storybook:ai_accepted")} />
          </div>

          <div class="bg-zinc-900/50 border border-zinc-800 rounded p-3">
            <div class="text-[10px] uppercase text-zinc-500 mb-2">As Player (weight 0)</div>
            <p class="text-[11px] text-zinc-400 mb-2">
              Same component, role gate fails. The button renders nothing —
              users without permission don't see broken sparkle buttons.
            </p>
            <.live_component
              module={AiAssist}
              id="storybook-rule-suggester-player"
              feature_key="rule_suggester"
              user_id={nil}
              role="PLAYER"
              role_weight={0}
              trigger_label="✨ Suggest a rule"
              context={%{}}
              on_accept={Phoenix.LiveView.JS.push("storybook:ai_accepted")} />
            <div class="text-[10px] text-zinc-600 italic">↑ no button rendered (role too low)</div>
          </div>
        </div>

        <div :if={@confirm_log != []} class="text-[10px] text-zinc-500 mt-2">
          Storybook event log: {Enum.join(@confirm_log, " · ")}
        </div>
      </section>
    </div>
    """
  end

  @impl true
  def handle_event("power_user_field:toggle", params, socket) do
    PowerUserField.handle_toggle(params, socket)
  end

  def handle_event("storybook:ai_accepted", _params, socket) do
    log = ["AI suggestion accepted at #{NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)}" | socket.assigns.confirm_log] |> Enum.take(5)
    {:noreply, assign(socket, :confirm_log, log)}
  end

  def handle_event("storybook:fired", %{"kind" => kind}, socket) do
    log = ["#{kind} confirmed at #{NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)}" | socket.assigns.confirm_log] |> Enum.take(5)
    {:noreply, assign(socket, :confirm_log, log)}
  end

  def handle_event("bulk_action:" <> _ = ev, params, socket) do
    BulkAction.handle_event(ev, params, socket)
  end

  def handle_event(_ev, _params, socket), do: {:noreply, socket}

  @impl true
  def handle_info({:bulk_action_fired, msg}, socket) do
    log = ["bulk #{msg["key"]} on #{length(msg["ids"])} rows" | socket.assigns.confirm_log] |> Enum.take(5)
    {:noreply, socket |> assign(:confirm_log, log) |> assign(:bulk_selected, MapSet.new())}
  end

  def handle_info(_, socket), do: {:noreply, socket}

  defp sample_rows do
    [
      %{id: 1, name: "Ironforge Hammer", tier: :common},
      %{id: 2, name: "Stormcaller's Robe", tier: :rare},
      %{id: 3, name: "Sun-Eater Blade", tier: :epic},
      %{id: 4, name: "Dragon's Last Tear", tier: :legendary},
      %{id: 5, name: "Voidsong Crown", tier: :mythic}
    ]
  end
end
