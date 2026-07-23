CREATE TABLE sessions (
  sid TEXT PRIMARY KEY,
  session TEXT NOT NULL,
  expires INTEGER NOT NULL
);

CREATE INDEX idx_sessions_expires ON sessions(expires);
