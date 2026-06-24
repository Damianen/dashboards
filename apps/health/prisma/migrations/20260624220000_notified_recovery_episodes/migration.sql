-- CreateTable
CREATE TABLE "notified_recovery_episodes" (
    "id" TEXT NOT NULL,
    "episode_start" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "notified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notified_recovery_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notified_recovery_episodes_episode_start_key" ON "notified_recovery_episodes"("episode_start");

