ALTER TABLE fee_schedules ADD COLUMN schedule_kind text NOT NULL DEFAULT 'master'
  CHECK(schedule_kind IN ('master','flex'));
