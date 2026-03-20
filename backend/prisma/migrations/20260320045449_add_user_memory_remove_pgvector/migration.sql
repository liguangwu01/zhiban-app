/*
  Warnings:

  - You are about to drop the column `last_login_at` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "events_deleted_at_idx";

-- AlterTable
ALTER TABLE "conversation_history" ADD COLUMN     "input_type" TEXT NOT NULL DEFAULT 'text';

-- AlterTable
ALTER TABLE "users" DROP COLUMN "last_login_at";

-- CreateTable
CREATE TABLE "user_memory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "profile" TEXT NOT NULL DEFAULT '# 用户记忆档案

## 基本信息
- 姓名：未知

## 出行偏好
- 暂无记录

## 重要联系人
- 暂无记录

## 健康习惯
- 暂无记录

## 用户偏好备注
- 暂无记录',
    "recent_events_summary" TEXT NOT NULL DEFAULT '暂无历史事件',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_memory_user_id_key" ON "user_memory"("user_id");

-- AddForeignKey
ALTER TABLE "user_memory" ADD CONSTRAINT "user_memory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
