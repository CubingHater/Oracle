import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const CONFIG = {
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  SERVER_URL: process.env.SERVER_URL || 'https://3dflorrr.duckdns.org',
  NOTIFICATION_CHANNEL_ID: process.env.NOTIFICATION_CHANNEL_ID || '1528927946801152030',
  GUILD_ID: process.env.GUILD_ID || '1525831377725952150',
  POLL_INTERVAL_MS: 5000 // Poll every 5 seconds
};

// Will be fetched from server
let RARITIES = [];
let lastEventIndex = 0;

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Helper function to send API requests
async function sendApiRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${CONFIG.SERVER_URL}${endpoint}`, options);
    
    if (!response.ok) {
      console.error(`API request failed with status ${response.status}: ${response.statusText}`);
      return null;
    }
    
    const text = await response.text();
    if (!text) {
      console.error('API request failed: Empty response');
      return null;
    }
    
    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.error('API request failed: Invalid JSON response:', text.substring(0, 200));
      return null;
    }
  } catch (error) {
    console.error('API request failed:', error.message);
    return null;
  }
}

// Fetch config from server
async function fetchConfig() {
  const config = await sendApiRequest('/api/external/config');
  if (config) {
    RARITIES = config.rarities;
    console.log('Config fetched from server');
  }
}

// Poll for game events
async function pollGameEvents() {
  const result = await sendApiRequest(`/api/external/events?since_index=${lastEventIndex}`);
  
  if (result && result.events) {
    console.log(`Received ${result.events.length} events from server`);
    for (const event of result.events) {
      console.log(`Processing event:`, event);
      await processGameEvent(event);
    }
    lastEventIndex = result.currentIndex;
  } else {
    console.log('No events received or invalid response');
  }
}

// Process game events and send to Discord
async function processGameEvent(event) {
  console.log(`Event type: ${event.e}, text: ${event.text}`);
  
  if (event.e !== 'toast') {
    console.log('Skipping non-toast event');
    return; // Only process toast events
  }
  
  const text = event.text;
  const rarity = RARITIES.find(r => text.includes(r.name));
  
  if (!rarity) {
    console.log('No rarity found in event text, skipping');
    return; // Skip if no rarity found
  }
  
  console.log(`Found rarity: ${rarity.name}, color: ${rarity.color}`);
  
  const color = rarity.color;
  let title = 'Game Event';
  let description = text;
  
  // Determine event type from text
  if (text.includes('spawned')) {
    title = 'Mob Spawned';
  } else if (text.includes('defeated')) {
    title = 'Mob Defeated';
  } else if (text.includes('found') || text.includes('received')) {
    title = 'Petal Drop';
  }
  
  console.log(`Sending notification: ${title}`);
  await sendNotification(title, description, color);
}

// Send embed notification to Discord
async function sendNotification(title, description, color) {
  try {
    const channel = await client.channels.fetch(CONFIG.NOTIFICATION_CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(parseInt(color.replace('#', ''), 16));

    await channel.send({ embeds: [embed] });
    console.log(`Sent notification: ${title}`);
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

// Client ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Fetch config from server
  await fetchConfig();
  
  // Register slash commands
  const commands = [
    {
      name: 'status',
      description: 'Check bot status and connection'
    },
    {
      name: 'test-notification',
      description: 'Send a test notification'
    },
    {
      name: 'poll',
      description: 'Manually poll for game events'
    }
  ];

  const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_BOT_TOKEN);

  try {
    console.log('Started refreshing application (/) commands.');
    // Register commands for specific guild (faster than global)
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, CONFIG.GUILD_ID),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error reloading commands:', error);
  }
  
  // Start polling for game events
  console.log('Starting to poll for game events...');
  setInterval(pollGameEvents, CONFIG.POLL_INTERVAL_MS);
  
  // Initial poll
  pollGameEvents();
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'status') {
    const status = {
      connected: !!lastEventIndex,
      eventIndex: lastEventIndex,
      serverUrl: CONFIG.SERVER_URL,
      notificationChannel: CONFIG.NOTIFICATION_CHANNEL_ID
    };
    
    await interaction.reply({ 
      content: `Bot Status:\n- Connected: ${status.connected ? 'Yes' : 'No'}\n- Event Index: ${status.eventIndex}\n- Server: ${status.serverUrl}\n- Channel: ${status.notificationChannel}`,
      ephemeral: true 
    });
  } else if (commandName === 'test-notification') {
    await sendNotification('Test Notification', 'This is a test message from the bot', '#7eef6d');
    await interaction.reply({ content: 'Test notification sent', ephemeral: true });
  } else if (commandName === 'poll') {
    await pollGameEvents();
    await interaction.reply({ content: 'Manual poll completed', ephemeral: true });
  }
});

// Login
client.login(CONFIG.DISCORD_BOT_TOKEN);
