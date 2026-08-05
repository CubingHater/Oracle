# Florr3D External Discord Bot

An external Discord bot for florr3d with notification system and giveaway functionality.

## Features

- **Game Notifications**: Send spawn, kill, and drop notifications to Discord (same as built-in bot)
- **Giveaway System**: Run giveaways with random rarity and petal selection
- **Discord Login Verification**: Only users logged in to 3dflorrr.duckdns.org can enter giveaways
- **Automatic Petal Awarding**: Winners automatically receive their prize in-game
- **REST API Integration**: Connect external bots to the game server

## Prerequisites

- Node.js 18+ installed
- Discord Bot Token from [Discord Developer Portal](https://discord.com/developers/applications)
- Access to the florr3d server (3dflorrr.duckdns.org)

## Server Setup

### 1. Configure External API Access

On your server, edit the `.env` file:

```bash
# Add your external bot tokens (comma-separated)
EXTERNAL_BOT_TOKENS=your_external_token_here,another_token_here
```

### 2. Restart the Server

```bash
# If using PM2
pm2 restart florr3d

# Or if running directly
# Stop and restart the server
npm run server
```

## Bot Setup

### 1. Install Dependencies

```bash
cd external-discord-bot
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
EXTERNAL_API_TOKEN=your_external_api_token_here
SERVER_URL=https://3dflorrr.duckdns.org
GUILD_ID=1525831377725952150
GIVEAWAY_CHANNEL_ID=1527013645723369664
NOTIFICATION_CHANNEL_ID=1528927946801152030
ALLOWED_USER_ID=1453329316833398819
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
   - `applications.commands`
6. Select bot permissions:
   - Send Messages
   - Embed Links
   - Use Slash Commands
7. Generate URL and invite bot to your server

### 4. Start the Bot

```bash
npm start
```

## Usage

### Slash Commands

#### `/giveaway <duration> [rarity] [petal]`
**Restricted**: Only the user specified in `ALLOWED_USER_ID` can use this command.
Start a giveaway with specified duration in minutes.

- `duration` (required): Duration in minutes
- `rarity` (optional): Specific rarity (Common-Ultra for random giveaways, Special only gives blood sacrifice)
- `petal` (optional): Specific petal type

**Giveaway Rules:**
- Random giveaways only select from Common to Ultra rarities
- Special rarity always gives blood sacrifice
- Blood sacrifice only appears in Special rarity

Examples:
```
/giveaway 60
/giveaway 30 Ultra
/giveaway 45 Special
```

#### `/notify-spawn <mob> <rarity>`
Send a spawn notification to the game.

#### `/notify-kill <mob> <rarity> <player>`
Send a kill notification to the game.

#### `/notify-drop <petal> <rarity> <player>`
Send a drop notification to the game.

### Giveaway System

1. **Start Giveaway**: Use `/giveaway` command
2. **Random Selection**: System automatically selects random rarity (Common-Ultra) and petal
3. **Special Rarity**: Special rarity always gives blood sacrifice only
4. **Enter Giveaway**: Users click "Enter Giveaway" button
5. **Verification**: System checks if user is logged in to 3dflorrr.duckdns.org with Discord
6. **Winner Selection**: Random winner picked when time expires
7. **Prize Awarding**: Petal automatically added to winner's inventory

### REST API Endpoints

External bots can connect to the server using these endpoints:

#### POST `/api/external/message`
Send a toast message to all players.

```bash
curl -X POST https://3dflorrr.duckdns.org/api/external/message \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "toast", "data": {"text": "Your message here"}}'
```

#### GET `/api/external/verify-discord?discord_id=<id>`
Verify if a Discord user is logged in to the game.

```bash
curl https://3dflorrr.duckdns.org/api/external/verify-discord?discord_id=123456789 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### POST `/api/external/award-petal`
Award a petal to a user's inventory.

```bash
curl -X POST https://3dflorrr.duckdns.org/api/external/award-petal \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"discord_id": "123456789", "petal_type": "basic", "rarity": 0}'
```

#### GET `/api/external/config`
Get game configuration (rarities and petal types).

```bash
curl https://3dflorrr.duckdns.org/api/external/config \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Bot Permissions

The bot requires the following Discord permissions:
- Send Messages
- Embed Links
- Use Slash Commands
- Read Message History
- Add Reactions

## Troubleshooting

### Bot not responding to commands
- Check that bot has slash commands permission
- Verify bot token is correct
- Ensure guild ID matches your server

### Giveaway entries not working
- Verify users are logged in to 3dflorrr.duckdns.org with Discord
- Check that external API token is valid
- Ensure server is running and API is accessible

### API requests failing
- Verify `EXTERNAL_BOT_TOKENS` is set in server `.env`
- Check server URL is correct
- Ensure CORS is properly configured

## Development

The bot automatically fetches game configuration from the server on startup, ensuring it always has the latest rarity and petal types.

## Security Notes

- Keep your Discord bot token and external API token secure
- Never commit tokens to version control
- Use environment variables for sensitive data
- Restrict API token usage to trusted bots only
