# Hackbyt Bot

Telegram bot for controlled publishing to `@hackbyt`.

## Environment variables

- `TELEGRAM_BOT_TOKEN` — token from BotFather. Never commit it.
- `ADMIN_USER_IDS` — comma-separated Telegram user IDs allowed to control the bot.

## Commands

- `/id` — show your Telegram user ID.
- `/help` — show commands.
- `/post <text>` — publish text to `@hackbyt`.

## Deployment

Deploy the repository to Vercel, then set the environment variables in the Vercel project settings.

Webhook URL:

`https://YOUR-DOMAIN.vercel.app/api/telegram`

Set it with Telegram Bot API `setWebhook` using your bot token.
