# Reminders V1

Trace stores reminder intent as durable user configuration, not as a fixed UTC timestamp. Daily Check-In has one optional reminder (`enabled`, `HH:mm`), and each Trackable can have one (`enabled`, `HH:mm`, selected weekdays, and `skipIfAlreadyLoggedToday`). The displayed time is a local wall-clock time, so 9:00 PM remains 9:00 PM when dates or daylight-saving transitions change.

The evaluator is a browser-testable domain service. A Daily Check-In reminder is due after its configured time only when today has no completed routine record; a draft remains eligible. Trackable reminders are never eligible for archived or deleted Trackables. When skip is enabled, a same-day Quick Log suppresses an Occurrence Trackable; only an explicit Yes on today’s routine record suppresses a boolean Daily Value Trackable. No, missing values, and ambiguous types such as scale, number, choice, text, duration, or time remain scheduled because V1 does not infer a goal threshold.

Each device records the local date on which it handled a reminder, preventing repeated delivery for one scheduled occurrence. That delivery state is deliberately not exported or synced. Configuration is included in JSON backup and the existing Google Sheets protocol. The Apps Script tab headers add the optional configuration fields, so an existing connected Sheet requires redeploying the updated script before live sync verification.

The V1 routing plan sends Daily Check-In reminders to `/check-in`; Quick Log-enabled Trackables to their Quick Log surface; routine-only Trackables to Daily Check-In; and other Trackables to their editor. `LocalNotificationAdapter` is an intentionally unimplemented boundary for a later Capacitor/native-notification batch.

Deferred: native notifications and permissions, multiple times, snooze, intervals, thresholds, AI timing, location triggers, notification history, push/email/SMS, and widget integration.
