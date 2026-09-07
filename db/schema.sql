CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  daily_goal_hours INT NOT NULL DEFAULT 4,
  auth_source VARCHAR(24) NOT NULL DEFAULT 'mariadb',
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  consent_version VARCHAR(40) NOT NULL DEFAULT '2026-05-web-v1',
  privacy_consent_at DATETIME NULL,
  camera_consent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  INDEX idx_users_admin_created_at (is_admin, created_at)
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  provider VARCHAR(24) NOT NULL,
  model_name VARCHAR(120) NULL,
  request_day DATE NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cache_creation_input_tokens INT NOT NULL DEFAULT 0,
  cache_read_input_tokens INT NOT NULL DEFAULT 0,
  estimated_cost_usd DECIMAL(12, 6) NOT NULL DEFAULT 0,
  was_blocked TINYINT(1) NOT NULL DEFAULT 0,
  blocked_reason VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_usage_logs_day_provider (request_day, provider, was_blocked),
  INDEX idx_ai_usage_logs_user_day (user_id, request_day),
  CONSTRAINT fk_ai_usage_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_subjects_display_name (display_name)
);

CREATE TABLE IF NOT EXISTS user_subjects (
  user_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, subject_id),
  INDEX idx_user_subjects_subject_id (subject_id),
  CONSTRAINT fk_user_subjects_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_subjects_subject
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id BIGINT PRIMARY KEY,
  daily_goal_hours INT NOT NULL DEFAULT 4,
  idle_threshold_seconds INT NOT NULL DEFAULT 25,
  focus_alert TINYINT(1) NOT NULL DEFAULT 1,
  break_reminder TINYINT(1) NOT NULL DEFAULT 1,
  save_raw_video TINYINT(1) NOT NULL DEFAULT 0,
  default_session_minutes INT NOT NULL DEFAULT 90,
  default_session_mode VARCHAR(120) NOT NULL DEFAULT '능동 학습',
  auto_resume_session TINYINT(1) NOT NULL DEFAULT 1,
  sound_alerts TINYINT(1) NOT NULL DEFAULT 1,
  show_live_score TINYINT(1) NOT NULL DEFAULT 1,
  show_event_log TINYINT(1) NOT NULL DEFAULT 1,
  reduce_motion TINYINT(1) NOT NULL DEFAULT 0,
  keep_screen_awake TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_settings_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS study_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  subject_name VARCHAR(120) NOT NULL,
  mode_name VARCHAR(120) NOT NULL,
  goal_minutes INT NOT NULL,
  elapsed_seconds INT NOT NULL,
  focused_seconds INT NOT NULL,
  avg_score INT NOT NULL,
  final_score INT NOT NULL,
  timeline_json LONGTEXT NOT NULL,
  tab_switches INT NOT NULL DEFAULT 0,
  idle_events INT NOT NULL DEFAULT 0,
  absence_events INT NOT NULL DEFAULT 0,
  hidden_seconds INT NOT NULL DEFAULT 0,
  highest_score INT NOT NULL DEFAULT 0,
  lowest_score INT NOT NULL DEFAULT 0,
  studied_note LONGTEXT NOT NULL,
  distraction_note LONGTEXT NOT NULL,
  next_goal_note LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  server_created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_study_sessions_user_created_at (user_id, created_at),
  INDEX idx_study_sessions_user_server_created_at (user_id, server_created_at),
  CONSTRAINT fk_study_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_score_samples (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  sample_index INT NOT NULL,
  score INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_session_score_samples_order (session_id, sample_index),
  INDEX idx_session_score_samples_session_id (session_id),
  CONSTRAINT fk_session_score_samples_session
    FOREIGN KEY (session_id) REFERENCES study_sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  message VARCHAR(255) NOT NULL,
  event_timestamp DATETIME(3) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_events_session_id (session_id),
  INDEX idx_session_events_session_time (session_id, event_timestamp),
  CONSTRAINT fk_session_events_session
    FOREIGN KEY (session_id) REFERENCES study_sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_token_hash CHAR(64) NOT NULL,
  user_id BIGINT NOT NULL,
  expires_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auth_sessions_token_hash (session_token_hash),
  INDEX idx_auth_sessions_user_expires (user_id, expires_at),
  CONSTRAINT fk_auth_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  requested_ip VARCHAR(80) NOT NULL DEFAULT '',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_password_reset_tokens_hash (token_hash),
  INDEX idx_password_reset_tokens_user_expires (user_id, expires_at),
  CONSTRAINT fk_password_reset_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  tone VARCHAR(16) NOT NULL DEFAULT 'info',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_announcements_active_window (is_active, starts_at, ends_at, updated_at),
  CONSTRAINT fk_announcements_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_announcements_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  category VARCHAR(24) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  subject VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  admin_reply TEXT NULL,
  answered_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_support_tickets_user_created (user_id, created_at),
  INDEX idx_support_tickets_status_created (status, created_at),
  CONSTRAINT fk_support_tickets_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT NULL,
  actor_name VARCHAR(120) NOT NULL,
  actor_email VARCHAR(255) NOT NULL,
  action_type VARCHAR(80) NOT NULL,
  target_type VARCHAR(80) NOT NULL,
  target_id VARCHAR(120) NULL,
  summary VARCHAR(255) NOT NULL,
  details LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_admin_audit_logs_created_at (created_at),
  INDEX idx_admin_audit_logs_actor_created (actor_user_id, created_at),
  CONSTRAINT fk_admin_audit_logs_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS discord_bot_settings (
  id TINYINT PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  token_ciphertext LONGTEXT NULL,
  token_preview VARCHAR(32) NULL,
  client_id VARCHAR(120) NOT NULL DEFAULT '',
  guild_ids LONGTEXT NOT NULL,
  admin_channel_id VARCHAR(120) NULL,
  admin_role_ids LONGTEXT NOT NULL,
  bot_actor_user_id VARCHAR(120) NULL,
  register_commands TINYINT(1) NOT NULL DEFAULT 1,
  admin_url VARCHAR(255) NULL,
  support_poll_ms INT NOT NULL DEFAULT 30000,
  health_poll_ms INT NOT NULL DEFAULT 60000,
  daily_summary_hour INT NOT NULL DEFAULT 9,
  status_state VARCHAR(24) NOT NULL DEFAULT 'disabled',
  bot_user_tag VARCHAR(120) NULL,
  last_started_at DATETIME NULL,
  last_stopped_at DATETIME NULL,
  last_error TEXT NULL,
  updated_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_discord_bot_settings_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
