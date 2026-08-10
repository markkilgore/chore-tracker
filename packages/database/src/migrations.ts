export const migrations = [
  {
    version: 1,
    name: "initial_domain",
    sql: `
      CREATE TABLE IF NOT EXISTS households (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        timezone TEXT NOT NULL,
        week_starts_on INTEGER NOT NULL DEFAULT 0 CHECK (week_starts_on BETWEEN 0 AND 6),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS household_members (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        display_name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('CHILD','ADULT','OTHER')),
        can_administer INTEGER NOT NULL DEFAULT 0 CHECK (can_administer IN (0,1)),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS members_household ON household_members(household_id, active);

      CREATE TABLE IF NOT EXISTS member_profiles (
        member_id TEXT PRIMARY KEY REFERENCES household_members(id) ON DELETE CASCADE,
        birth_date TEXT,
        avatar TEXT,
        theme_key TEXT NOT NULL DEFAULT 'sunny',
        kid_view_enabled INTEGER NOT NULL DEFAULT 0 CHECK (kid_view_enabled IN (0,1))
      );

      CREATE TABLE IF NOT EXISTS chore_definitions (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('INDIVIDUAL','HOUSEHOLD')),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS chore_title_household ON chore_definitions(household_id, title COLLATE NOCASE);

      CREATE TABLE IF NOT EXISTS routines (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX IF NOT EXISTS routine_name_household ON routines(household_id, name COLLATE NOCASE);

      CREATE TABLE IF NOT EXISTS responsibility_templates (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        chore_definition_id TEXT NOT NULL REFERENCES chore_definitions(id),
        routine_id TEXT REFERENCES routines(id) ON DELETE SET NULL,
        recurrence_json TEXT NOT NULL,
        allocation_kind TEXT NOT NULL CHECK (allocation_kind IN ('fixed','rotation','open')),
        rotation_offset INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active_from TEXT NOT NULL,
        active_through TEXT,
        supersedes_template_id TEXT REFERENCES responsibility_templates(id),
        created_at TEXT NOT NULL,
        CHECK (active_through IS NULL OR active_through >= active_from)
      );
      CREATE INDEX IF NOT EXISTS templates_household_active ON responsibility_templates(household_id, active_from, active_through);

      CREATE TABLE IF NOT EXISTS responsibility_participants (
        template_id TEXT NOT NULL REFERENCES responsibility_templates(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL REFERENCES household_members(id),
        position INTEGER NOT NULL,
        PRIMARY KEY(template_id, member_id),
        UNIQUE(template_id, position)
      );

      CREATE TABLE IF NOT EXISTS weekly_plans (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        week_start_date TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        generated_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(household_id, week_start_date)
      );

      CREATE TABLE IF NOT EXISTS chore_occurrences (
        id TEXT PRIMARY KEY,
        weekly_plan_id TEXT NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
        chore_definition_id TEXT NOT NULL REFERENCES chore_definitions(id),
        source_template_id TEXT REFERENCES responsibility_templates(id),
        source_instance_key TEXT NOT NULL,
        origin TEXT NOT NULL CHECK (origin IN ('RECURRING','ONE_OFF','OVERRIDE')),
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','CANCELLED')),
        chore_title_snapshot TEXT NOT NULL,
        chore_description_snapshot TEXT,
        chore_kind_snapshot TEXT NOT NULL CHECK (chore_kind_snapshot IN ('INDIVIDUAL','HOUSEHOLD')),
        routine_id TEXT REFERENCES routines(id) ON DELETE SET NULL,
        routine_name_snapshot TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        replaces_occurrence_id TEXT REFERENCES chore_occurrences(id),
        created_at TEXT NOT NULL,
        UNIQUE(weekly_plan_id, source_instance_key)
      );
      CREATE INDEX IF NOT EXISTS occurrences_plan_date ON chore_occurrences(weekly_plan_id, due_date, sort_order);

      CREATE TABLE IF NOT EXISTS occurrence_assignees (
        occurrence_id TEXT PRIMARY KEY REFERENCES chore_occurrences(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL REFERENCES household_members(id)
      );

      CREATE TABLE IF NOT EXISTS occurrence_eligible_members (
        occurrence_id TEXT NOT NULL REFERENCES chore_occurrences(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL REFERENCES household_members(id),
        PRIMARY KEY(occurrence_id, member_id)
      );

      CREATE TABLE IF NOT EXISTS weekly_plan_changes (
        id TEXT PRIMARY KEY,
        weekly_plan_id TEXT NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
        occurrence_id TEXT REFERENCES chore_occurrences(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        recorded_by_member_id TEXT REFERENCES household_members(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS completions (
        id TEXT PRIMARY KEY,
        occurrence_id TEXT NOT NULL REFERENCES chore_occurrences(id) ON DELETE CASCADE,
        completed_by_member_id TEXT NOT NULL REFERENCES household_members(id),
        recorded_by_member_id TEXT REFERENCES household_members(id) ON DELETE SET NULL,
        completed_at TEXT NOT NULL,
        note TEXT,
        voided_at TEXT,
        voided_by_member_id TEXT REFERENCES household_members(id) ON DELETE SET NULL,
        replaces_completion_id TEXT REFERENCES completions(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_completion ON completions(occurrence_id) WHERE voided_at IS NULL;

      CREATE TABLE IF NOT EXISTS chart_exports (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        weekly_plan_id TEXT NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL REFERENCES household_members(id),
        plan_revision INTEGER NOT NULL,
        theme_key TEXT NOT NULL,
        theme_version INTEGER NOT NULL,
        layout_version INTEGER NOT NULL,
        content_snapshot_json TEXT NOT NULL,
        cell_manifest_json TEXT NOT NULL,
        checksum TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chart_exports_plan_member ON chart_exports(weekly_plan_id, member_id, created_at);
    `
  }
] as const;
