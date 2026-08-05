# Florr3D External Discord Bot

An external Discord bot for florr3d that receives game notifications (spawn, kill, drop messages) and displays them in Discord.

## Features

- **Game Notifications**: Receives spawn, kill, and drop notifications from the game server
- **Real-time Polling**: Polls the game server every 5 seconds for new events
- **Rarity-based Colors**: Messages use the same colors as in the game
- **Event Filtering**: Only processes spawn, kill, and drop events (no chat messages)
- **Event Categorization**: Automatically categorizes events (spawn, kill, drop)
- **Slash Commands**: Quick access to bot status and manual polling

## Prerequisites

- Node.js 18+ installed
- Discord Bot Token from [Discord Developer Portal](https://discord.com/developers/applications)
- Access to the florr3d server (3dflorrr.duckdns.org)
- External API token from the server configuration

## Server Setup

No server configuration required. The external API is now publicly accessible for game event polling.

## Bot Setup

### 1. Install Dependencies

```bash
cd C:\Users\david\Desktop\external-discord-bot
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
SERVER_URL=https://3dflorrr.duckdns.org
NOTIFICATION_CHANNEL_ID=1528927946801152030
```

### 3. Configure Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select existing one
3. Go to "Bot" section and enable:
   - Message Content Intent
   - Server Members Intent
4. Go to "OAuth2" → "URL Generator"
5. Select scopes:
   - `bot`
6. Select bot permissions:
   - Send Messages
   - Embed Links
   - Read Message History
7. Generate URL and invite bot to your server

### 4. Start the Bot

```bash
npm start
```

## Slash Commands

The bot provides the following slash commands:

### `/status`
Check the bot's current status and connection details.

### `/test-notification`
Send a test notification to verify the bot is working correctly.

### `/poll`
Manually trigger a poll for game events (useful for testing).

## How It Works

### Polling Mechanism

The bot polls the game server every 5 seconds using the REST API:

1. **GET `/api/external/events?since_index=X`** - Fetches new events since last poll
2. **Event Processing** - Filters for toast events with rarity information
3. **Discord Display** - Sends formatted embeds to the notification channel

### Event Types Processed

- **Spawn Messages**: "A Ultra Ladybug has spawned somewhere"
- **Kill Messages**: "A Ultra Rock has been defeated by PlayerName"
- **Drop Messages**: "A Ultra iris has been found by PlayerName"

### Event Filtering

The bot only processes:
- Toast events (global game messages)
- Events containing rarity names (Common through Eternal)
- Events with color information for embed styling

## REST API Endpoints

### GET `/api/external/events?since_index=<index>`
Fetch new game events since the specified index.

```bash
curl https://3dflorrr.duckdns.org/api/external/events?since_index=0
```

Response:
```json
{
  "events": [
    {
      "e": "toast",
      "text": "A Ultra Ladybug has spawned somewhere"
    }
  ],
  "currentIndex": 42
}
```

### GET `/api/external/config`
Get game configuration (rarities and petal types).

```bash
curl https://3dflorrr.duckdns.org/api/external/config
```

## Configuration

### Environment Variables

- `DISCORD_BOT_TOKEN`: Your Discord bot token
- `SERVER_URL`: Game server URL (default: https://3dflorrr.duckdns.org)
- `NOTIFICATION_CHANNEL_ID`: Discord channel ID for notifications
- `GUILD_ID`: Discord server ID for slash commands (default: 1525831377725952150)

### Polling Settings

- **Poll Interval**: 5 seconds (can be adjusted in bot.js)
- **Event Index Tracking**: Prevents duplicate notifications
- **Automatic Reconnection**: Bot reconnects if server restarts

## Hosting

### Free Options

1. **Oracle Cloud Free Tier** (Recommended)
   - 24/7 uptime without sleep mode
   - Already hosting your game server
   - Run bot alongside the game server

2. **Render + UptimeRobot**
   - Free tier with keep-alive script
   - Easy GitHub integration
   - Requires HTTP server for keep-alive

### Setup on Oracle Cloud

Since you already use Oracle Cloud for the game server:

1. SSH to your Oracle server
2. Upload bot files to separate directory
3. Install dependencies: `npm install`
4. Configure `.env` file
5. Run with PM2 for 24/7 uptime:
   ```bash
   npm install -g pm2
   pm2 start bot.js --name florr3d-notifications
   pm2 save
   pm2 startup
   ```

## Troubleshooting

### Bot not receiving events
- Check server URL is accessible
- Verify server is running and has event system
- Check bot console for API errors

### Duplicate notifications
- Check event index tracking is working
- Verify polling interval is appropriate
- Check server event system is functioning

### No notifications appearing
- Verify Discord bot has send permissions
- Check channel ID is correct
- Ensure bot is actually polling (check console)
- Verify server is generating events

## Development

The bot automatically fetches game configuration on startup, ensuring it always has the latest rarity information for proper color matching.

## Changes from Previous Version

- **Removed**: Giveaway system and slash commands
- **Removed**: Message sending capabilities
- **Added**: Event polling mechanism
- **Added**: Real-time game notification reception
- **Simplified**: Focused purely on receiving and displaying game events
