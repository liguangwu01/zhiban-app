-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "home_location" JSONB,
    "work_location" JSONB,
    "do_not_disturb_start" TEXT,
    "do_not_disturb_end" TEXT,
    "preferred_travel_mode" TEXT,
    "notification_methods" JSONB NOT NULL DEFAULT '["in_app","web_push"]',
    "web_push_subscription" JSONB,
    "learning_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_insights" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "avg_early_arrival_minutes" INTEGER NOT NULL DEFAULT 10,
    "avg_response_time_minutes" INTEGER,
    "snooze_frequency" DOUBLE PRECISION,
    "best_reminder_hours" JSONB,
    "habit_completion_rates" JSONB,
    "learning_data_expires_at" TIMESTAMP(3),
    "last_analyzed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "raw_input" TEXT NOT NULL,
    "event_category" TEXT NOT NULL,
    "event_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "target_date" TIMESTAMP(3),
    "location_name" TEXT,
    "location_address" TEXT,
    "location_lat" DOUBLE PRECISION,
    "location_lng" DOUBLE PRECISION,
    "participants" JSONB,
    "recurrence" JSONB,
    "ai_context" JSONB,
    "preparation_items" JSONB,
    "check_list" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "trigger_at" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "action_suggestions" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "platform_response" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "user_action" TEXT,
    "user_action_at" TIMESTAMP(3),
    "snooze_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "function_calls" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_insights_user_id_key" ON "user_insights"("user_id");

-- CreateIndex
CREATE INDEX "events_user_id_start_time_idx" ON "events"("user_id", "start_time");

-- CreateIndex
CREATE INDEX "events_user_id_event_category_idx" ON "events"("user_id", "event_category");

-- CreateIndex
CREATE INDEX "events_deleted_at_idx" ON "events"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_idempotency_key_key" ON "reminders"("idempotency_key");

-- CreateIndex
CREATE INDEX "reminders_trigger_at_status_idx" ON "reminders"("trigger_at", "status");

-- CreateIndex
CREATE INDEX "reminders_event_id_idx" ON "reminders"("event_id");

-- CreateIndex
CREATE INDEX "conversation_history_user_id_session_id_idx" ON "conversation_history"("user_id", "session_id");

-- CreateIndex
CREATE INDEX "conversation_history_created_at_idx" ON "conversation_history"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_insights" ADD CONSTRAINT "user_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_history" ADD CONSTRAINT "conversation_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
