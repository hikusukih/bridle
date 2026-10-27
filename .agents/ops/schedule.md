# Schedule and install steps

The design is `docs/design/slots.md`: only the clock starts sessions, and the run window is the cron expression. The expressions use the time zone set in the task configuration, which this repo does not record.

## Cron expressions

- Box worker A, every day except Wednesday: `0 7-10 * * 0,1,2,4,5,6` (07:00 to 10:00 on the hour).
- Box worker B, every day except Wednesday: `30 7-10 * * 0,1,2,4,5,6` (07:30 to 10:30 on the half hour). Nothing starts after the window is four hours old.
- Box worker A on Wednesday: `1 0-22 * * 3` (00:01 to 22:01).
- Box worker B on Wednesday: `31 0-22 * * 3` (00:31 to 22:31). Work in flight finishes by about 23:00.
- Planner, morning: `0 6 * * *`, before the box window.
- Planner, feature: `0 14 * * *`, after the box window on most days.

Each worker needs two scheduled tasks, since one cron expression can't skip Wednesday and also cover all of it. That makes four box-worker tasks and two planner tasks.

## Install

1. Create the four box-worker tasks with the prompt in `box-worker-prompt.md` and the four expressions above.
2. Create the morning planner task with `planner-morning-prompt.md` and the feature planner task with `planner-feature-prompt.md`. Set both to Opus or better; use Fable only when there is spare promotional usage.
3. Set the time zone in each task's configuration.
4. The same day, disable the old daily box task and the old Wednesday evening task, so two schedules never work the queue at once. Claims are atomic, so an overlap wastes usage but can't take a box twice.

## After the first Wednesday

Check what `slots.md` lists: whether any box was claimed twice, how many workers ran at once, how many boxes landed against sessions started, how much went to proposals nobody wanted, and what the usage page says each kind of session cost.
