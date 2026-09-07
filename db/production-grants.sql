CREATE USER IF NOT EXISTS 'focusai_app'@'%' IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`users`
TO 'focusai_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`subjects`
TO 'focusai_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`user_subjects`
TO 'focusai_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`user_settings`
TO 'focusai_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`study_sessions`
TO 'focusai_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`session_score_samples`
TO 'focusai_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`session_events`
TO 'focusai_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`auth_sessions`
TO 'focusai_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`password_reset_tokens`
TO 'focusai_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`announcements`
TO 'focusai_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`support_tickets`
TO 'focusai_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`admin_audit_logs`
TO 'focusai_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`ai_usage_logs`
TO 'focusai_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
ON `focusai`.`discord_bot_settings`
TO 'focusai_app'@'%';

FLUSH PRIVILEGES;
