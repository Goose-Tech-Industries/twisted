const mysql = require('mysql2/promise');
(async () => {
  const db = await mysql.createPool({ host:'localhost', user:'root', password:'***REDACTED-DB-PASSWORD***', database:'twisted_rpg' });

  await db.query(`CREATE TABLE IF NOT EXISTS game_battle_templates (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE,
    label VARCHAR(128) NOT NULL,
    icon VARCHAR(8) DEFAULT '⚔️',
    description TEXT,
    author VARCHAR(64) DEFAULT 'Twisted Engine',
    version VARCHAR(16) DEFAULT '1.0',
    settings_json MEDIUMTEXT NOT NULL,
    terminology_json JSON DEFAULT NULL,
    sample_commands_json JSON DEFAULT NULL,
    sample_ki_moves_json JSON DEFAULT NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    installed TINYINT(1) NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const templates = [
    {
      name: 'classic_turn', label: 'Classic Turn-Based', icon: '⚔️',
      description: 'Traditional JRPG combat. Take turns, select commands, use items and skills. Inspired by Final Fantasy and Dragon Quest.',
      settings: { enable_dice_rolls:'false', ki_equals_hp:'false', enable_formations:'true', enable_counter_attacks:'true', enable_auto_battle:'true', battle_turn_delay_ms:'1500' },
      terms: { hp:'HP', mp:'MP', atk:'STR', def:'VIT', mo:'MAG', md:'SPR', speed:'AGI', luck:'LCK' },
      commands: [
        { name:'Attack', icon:'⚔️' }, { name:'Defend', icon:'🛡️' },
        { name:'Magic', icon:'✨' }, { name:'Item', icon:'🎒' }, { name:'Flee', icon:'🏃' }
      ]
    },
    {
      name: 'sim_battle', label: 'Sim Battle (RP Combat)', icon: '🎲',
      description: 'Dice-roll RP combat. Ki = HP, moves drain life force. Planet Mado style. Best for RP-heavy games.',
      settings: {
        enable_dice_rolls:'true', dice_attack_formula:'1d20+ATK', dice_defense_formula:'1d20+DEF',
        dice_dodge_formula:'1d20+SPEED', dice_crit_threshold:'18', dice_show_rolls_in_chat:'true',
        ki_equals_hp:'true', ki_moves_use_hp:'true', ki_label:'Ki',
        enable_beam_clash:'true', beam_clash_formula:'ATK+1d20', beam_clash_damage_mult:'3.0',
        enable_interrupts:'true', enable_counter_attacks:'true', counter_base_chance:'15',
        enable_mentor_system:'true', enable_magic_duels:'true', battle_turn_delay_ms:'2000',
        enable_auto_battle:'false', enable_formations:'false'
      },
      terms: { hp:'Ki', mp:'Focus', atk:'Power Level', def:'Endurance', mo:'Ki Control', md:'Ki Defense', speed:'Speed', luck:'Instinct' },
      commands: [
        { name:'Strike', icon:'👊' }, { name:'Block', icon:'🛡️' },
        { name:'Ki Charge', icon:'⚡' }, { name:'Sense', icon:'👁️' }, { name:'Flee', icon:'💨' }
      ],
      kiMoves: [
        { name:'Ki Blast', icon:'💥', move_type:'blast', hp_cost_pct:5, damage_formula:'ATK*2', charge_turns:0 },
        { name:'Kamehameha', icon:'🌊', move_type:'beam', hp_cost_pct:15, damage_formula:'ATK*4+MO*2', charge_turns:2, brunt_mode:1 },
        { name:'Solar Flare', icon:'☀️', move_type:'special', hp_cost_pct:3, damage_formula:'0' },
        { name:'Spirit Bomb', icon:'💫', move_type:'beam', hp_cost_pct:30, damage_formula:'ATK*8', charge_turns:3, brunt_mode:1 },
        { name:'Destructo Disc', icon:'💿', move_type:'blast', hp_cost_pct:10, damage_formula:'ATK*3', charge_turns:1 }
      ]
    },
    {
      name: 'tactical_grid', label: 'Tactical Grid Combat', icon: '♟️',
      description: 'Position-matters grid combat with formations, flanking, and terrain. Inspired by Fire Emblem and BG3.',
      settings: {
        enable_dice_rolls:'true', dice_attack_formula:'1d20+ATK', dice_crit_threshold:'20', dice_show_rolls_in_chat:'true',
        enable_formations:'true', back_row_damage_reduction:'40', back_row_melee_penalty:'60',
        enable_counter_attacks:'true', counter_base_chance:'20', counter_dex_scaling:'1.0',
        enable_interrupts:'true', interrupt_speed_threshold:'3',
        enable_aggro_system:'true', aggro_decay_per_turn:'15', taunt_duration_turns:'2',
        enable_auto_battle:'false', battle_turn_delay_ms:'1000'
      },
      terms: { hp:'Health', mp:'Mana', atk:'Might', def:'Armor', mo:'Arcane', md:'Warding', speed:'Initiative', luck:'Fortune' },
      commands: [
        { name:'Attack', icon:'⚔️' }, { name:'Defend', icon:'🛡️' }, { name:'Move', icon:'🏃' },
        { name:'Skill', icon:'✨' }, { name:'Item', icon:'🎒' }, { name:'Taunt', icon:'😤' }
      ]
    }
  ];

  for (const t of templates) {
    await db.query(
      `INSERT IGNORE INTO game_battle_templates (name, label, icon, description, is_default, settings_json, terminology_json, sample_commands_json, sample_ki_moves_json) VALUES (?,?,?,?,?,?,?,?,?)`,
      [t.name, t.label, t.icon, t.description, t.name === 'classic_turn' ? 1 : 0,
       JSON.stringify(t.settings), JSON.stringify(t.terms), JSON.stringify(t.commands), t.kiMoves ? JSON.stringify(t.kiMoves) : null]
    );
  }

  console.log('Battle templates table created + 3 templates seeded');
  await db.end();
})().catch(e => console.error(e.message));
