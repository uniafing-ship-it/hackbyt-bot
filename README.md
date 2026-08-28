# Hackbyt Bot

Telegram bot for controlled publishing to `@hackbyt`.

## Environment variables

- `TELEGRAM_BOT_TOKEN` — token from BotFather. Never commit it.
- `ADMIN_USER_IDS` — comma-separated Telegram user IDs allowed to control the bot.
- `TELEGRAM_API_ID` — Telegram API ID for MTProto history access.
- `TELEGRAM_API_HASH` — Telegram API hash for MTProto history access.
- `TELEGRAM_SESSION_STRING` — StringSession for a Telegram user account that has permission to edit `@hackbyt`. Never commit it.

## Commands

- `/id` — show your Telegram user ID.
- `/help` — show commands.
- `/post <text>` — publish text to `@hackbyt`.
- `/footer_old` — add the standard subscription footer to the latest 100 channel posts that do not already contain it.

The `/footer_old` command uses Telegram MTProto because the Bot API does not expose arbitrary channel history. The MTProto account must be allowed to edit messages in `@hackbyt`.

## Deployment

Deploy the repository to Vercel, then set the environment variables in the Vercel project settings.

Webhook URL:

`https://YOUR-DOMAIN.vercel.app/api/telegram`

Set it with Telegram Bot API `setWebhook` using your bot token.
