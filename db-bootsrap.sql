-- Optional SQL if you prefer running migrations manually instead of programmatic migration
CREATE TABLE IF NOT EXISTS users ( id INTEGER PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, is_moderator INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP );
CREATE TABLE IF NOT EXISTS topics ( id INTEGER PRIMARY KEY, title TEXT, created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP );
CREATE TABLE IF NOT EXISTS posts ( id INTEGER PRIMARY KEY, topic_id INTEGER, user_id INTEGER, content TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_hidden INTEGER DEFAULT 0, reports INTEGER DEFAULT 0 );
CREATE TABLE IF NOT EXISTS tags ( id INTEGER PRIMARY KEY, name TEXT UNIQUE );
CREATE TABLE IF NOT EXISTS topic_tags ( topic_id INTEGER, tag_id INTEGER, PRIMARY KEY(topic_id, tag_id) );
CREATE TABLE IF NOT EXISTS votes ( id INTEGER PRIMARY KEY, post_id INTEGER, user_id INTEGER, value INTEGER, UNIQUE(post_id, user_id) );