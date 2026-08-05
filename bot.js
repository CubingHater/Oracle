import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const CONFIG = {
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  SERVER_URL: process.env.SERVER_URL || 'https://3dflorrr.duckdns.org',
  NOTIFICATION_CHANNEL_ID: process.env.NOTIFICATION_CHANNEL_ID || '1528927946801152030',
  GUILD_ID: process.env.GUILD_ID || '1525831377725952150',
  ADMIN_USER_ID: process.env.ADMIN_USER_ID || '1453329316833398819',
  POLL_INTERVAL_MS: 5000 // Poll every 5 seconds
};

// Will be fetched from server
let RARITIES = [];
let PETAL_TYPES = [];
let lastEventIndex = 0;
let lastProcessedTimestamp = 0;
const processedEventHashes = new Set();

// Giveaway storage
const giveaways = new Map();

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Helper functions for prefix commands
async function handleGiveaway(message, params) {
  const duration = parseInt(params[0]);
  if (!duration || isNaN(duration)) {
    await message.reply('Usage: !giveaway [duration in minutes]');
    return;
  }

  const channel = await client.channels.fetch(CONFIG.NOTIFICATION_CHANNEL_ID);
  if (!channel) {
    await message.reply('Notification channel not found');
    return;
  }

  // Convert PETAL_TYPES object to array if needed
  const petalTypeArray = Array.isArray(PETAL_TYPES) ? PETAL_TYPES : Object.keys(PETAL_TYPES);

  // Random selection (Common to Ultra only)
  const ultraIndex = RARITIES.findIndex(r => r.name === 'Ultra');
  const maxIndex = ultraIndex >= 0 ? ultraIndex : 6;
  const validRarities = RARITIES.slice(0, maxIndex + 1);
  let selectedRarity = validRarities[Math.floor(Math.random() * validRarities.length)];
  
  let availablePetals = petalTypeArray.filter(p => p !== 'bloodsacrifice');
  let selectedPetal = availablePetals[Math.floor(Math.random() * availablePetals.length)];

  // If Special rarity is selected, only allow blood sacrifice
  if (selectedRarity.name === 'Special') {
    selectedPetal = 'bloodsacrifice';
  }

  // If blood sacrifice is selected but not Special rarity, force Special rarity
  if (selectedPetal === 'bloodsacrifice' && selectedRarity.name !== 'Special') {
    selectedRarity = RARITIES.find(r => r.name === 'Special');
  }

  const rarityIndex = RARITIES.findIndex(r => r.name === selectedRarity.name);
  const endTime = Date.now() + (duration * 60 * 1000);
  const giveawayId = `giveaway_${Date.now()}`;

  const embed = new EmbedBuilder()
    .setTitle('Giveaway')
    .setDescription(`Prize: ${selectedRarity.name} ${selectedPetal}\n\nEnds: <t:${Math.floor(endTime / 1000)}:R>\n\nClick the button below to enter!`)
    .setColor(parseInt(selectedRarity.color.replace('#', ''), 16));

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_${giveawayId}`)
        .setLabel('Enter Giveaway')
        .setStyle(ButtonStyle.Primary)
    );

  const msg = await channel.send({ embeds: [embed], components: [row] });

  giveaways.set(giveawayId, {
    message: msg,
    rarity: selectedRarity.name,
    petal: selectedPetal,
    rarityIndex,
    endTime,
    entries: []
  });

  setTimeout(() => endGiveaway(giveawayId), duration * 60 * 1000);
  await message.reply(`Giveaway started for ${duration} minutes`);
}

async function endGiveaway(giveawayId) {
  const giveaway = giveaways.get(giveawayId);
  if (!giveaway) return;

  giveaways.delete(giveawayId);

  if (giveaway.entries.length === 0) {
    await giveaway.message.edit({
      content: 'Giveaway ended - No valid entries',
      embeds: [giveaway.message.embeds[0]],
      components: []
    });
    return;
  }

  const winnerIndex = Math.floor(Math.random() * giveaway.entries.length);
  const winner = giveaway.entries[winnerIndex];

  const isVerified = await verifyDiscordUser(winner.userId);
  
  if (!isVerified) {
    await giveaway.message.edit({
      content: 'Giveaway ended - Winner not verified',
      embeds: [giveaway.message.embeds[0]],
      components: []
    });
    return;
  }

  const awarded = await awardPetal(winner.userId, giveaway.petal, giveaway.rarityIndex);
  
  if (awarded) {
    const user = await client.users.fetch(winner.userId);
    await giveaway.message.edit({
      content: `Giveaway ended - Winner: ${user.tag}`,
      embeds: [giveaway.message.embeds[0]],
      components: []
    });

    await sendNotification(
      'Giveaway Winner',
      `${user.tag} won a ${giveaway.rarity} ${giveaway.petal}`,
      RARITIES.find(r => r.name === giveaway.rarity).color
    );
  }
}

async function handleBoostReward(message, params) {
  const userId = params[0];
  if (!userId) {
    await message.reply('Usage: !boost_reward [user_id]');
    return;
  }

  const isVerified = await verifyDiscordUser(userId);
  if (!isVerified) {
    await message.reply('User is not logged in to the game');
    return;
  }

  // Convert PETAL_TYPES object to array if needed
  const petalTypeArray = Array.isArray(PETAL_TYPES) ? PETAL_TYPES : Object.keys(PETAL_TYPES);

  // Award 1 special blood sacrifice
  await awardPetal(userId, 'bloodsacrifice', 9); // Special = index 9

  // Award 3 random ultra petals
  const ultraIndex = RARITIES.findIndex(r => r.name === 'Ultra');
  const availablePetals = petalTypeArray.filter(p => p !== 'bloodsacrifice');

  const awardedPetals = ['bloodsacrifice'];
  for (let i = 0; i < 3; i++) {
    const randomPetal = availablePetals[Math.floor(Math.random() * availablePetals.length)];
    await awardPetal(userId, randomPetal, ultraIndex);
    awardedPetals.push(randomPetal);
  }

  // Get user for DM and notifications
  const user = await client.users.fetch(userId);

  // Send DM to user
  try {
    await user.send(`Thanks for boosting the server! You gained 1 blood sacrifice, 1 ultra ${awardedPetals[1]}, 1 ultra ${awardedPetals[2]} and 1 ultra ${awardedPetals[3]}.`);
  } catch (error) {
    console.error('Failed to send DM:', error);
  }

  // Send notification in channel
  const petalNames = awardedPetals.map(p => PETAL_TYPES[p]?.name || p).join(', ');
  await sendNotification(
    'Server Boost',
    `${user.tag} boosted the server!`,
    '#ff00ff'
  );

  await sendNotification(
    'Boost Reward',
    `As reward ${user.tag} got ${petalNames}`,
    '#ff00ff'
  );

  await message.reply(`Boost reward sent to ${userId}`);
}

async function handleRefund(message, params) {
  const userId = params[0];
  const rarityName = params[1];
  const petalName = params[2];

  if (!userId || !rarityName || !petalName) {
    await message.reply('Usage: !refund [user_id] [rarity] [petalname]');
    return;
  }

  const rarityIndex = RARITIES.findIndex(r => r.name.toLowerCase() === rarityName.toLowerCase());
  if (rarityIndex === -1) {
    await message.reply('Invalid rarity');
    return;
  }

  const isVerified = await verifyDiscordUser(userId);
  if (!isVerified) {
    await message.reply('User is not logged in to the game');
    return;
  }

  const awarded = await awardPetal(userId, petalName.toLowerCase(), rarityIndex);

  if (awarded) {
    const user = await client.users.fetch(userId);

    // Send DM to user
    try {
      await user.send(`You got 1 ${rarityName} ${petalName} refunded`);
    } catch (error) {
      console.error('Failed to send DM:', error);
    }

    // Send notification in channel
    await sendNotification(
      'Refund',
      `${user.tag} got refunded 1 ${rarityName} ${petalName}`,
      RARITIES[rarityIndex].color
    );

    await message.reply(`Refunded 1 ${rarityName} ${petalName} to ${userId}`);
  } else {
    await message.reply('Failed to award petal');
  }
}

async function verifyDiscordUser(discordId) {
  const result = await sendApiRequest(`/api/external/verify-discord?discord_id=${discordId}`);
  return result?.verified || false;
}

async function awardPetal(discordId, petalType, rarity) {
  const result = await sendApiRequest('/api/external/award-petal', 'POST', {
    discord_id: discordId,
    petal_type: petalType,
    rarity: rarity
  });
  return result?.success || false;
}

// Daily air scheduler
function scheduleDailyAir() {
  const now = new Date();
  const targetTime = new Date();
  targetTime.setUTCHours(16, 0, 0, 0); // 5PM Amsterdam = 4PM UTC (winter) / 3PM UTC (summer)

  if (now > targetTime) {
    targetTime.setDate(targetTime.getDate() + 1);
  }

  const delay = targetTime - now;
  console.log(`Next daily air scheduled for: ${targetTime.toISOString()} (in ${Math.round(delay / 1000 / 60)} minutes)`);

  setTimeout(async () => {
    await giveDailyAir();
    scheduleDailyAir(); // Schedule next day
  }, delay);
}

async function giveDailyAir() {
  try {
    const result = await sendApiRequest('/api/external/get-logged-users');
    if (!result || !result.users || result.users.length === 0) {
      console.log('No logged users for daily air');
      return;
    }

    const randomUser = result.users[Math.floor(Math.random() * result.users.length)];
    const ultraIndex = RARITIES.findIndex(r => r.name === 'Ultra');
    
    const awarded = await awardPetal(randomUser.discord_id, 'air', ultraIndex);
    
    if (awarded) {
      try {
        const user = await client.users.fetch(randomUser.discord_id);
        await sendNotification(
          'Daily Air',
          `${user.tag} got the daily air!`,
          RARITIES[ultraIndex].color
        );
        console.log(`Daily air given to ${user.tag}`);
      } catch (error) {
        console.error('Failed to send daily air notification:', error);
      }
    }
  } catch (error) {
    console.error('Daily air error:', error);
  }
}

// Helper function to send API requests
async function sendApiRequest(endpoint, method = 'GET', body = null) {
  const url = `${CONFIG.SERVER_URL}${endpoint}`;
  console.log(`API Request: ${method} ${url}`);
  if (body) console.log(`Body:`, body);

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
    const response = await fetch(url, options);
    console.log(`API Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error(`API request failed with status ${response.status}: ${response.statusText}`);
      const errorText = await response.text();
      console.error(`Error response:`, errorText);
      return null;
    }

    const text = await response.text();
    console.log(`API Response body:`, text.substring(0, 500));

    if (!text) {
      console.error('API request failed: Empty response');
      return null;
    }

    try {
      const parsed = JSON.parse(text);
      console.log(`API Response parsed:`, parsed);
      return parsed;
    } catch (parseError) {
      console.error('API request failed: Invalid JSON response:', text.substring(0, 200));
      return null;
    }
  } catch (error) {
    console.error('API request failed:', error.message);
    console.error('Error stack:', error.stack);
    return null;
  }
}

// Fetch config from server
async function fetchConfig() {
  const config = await sendApiRequest('/api/external/config');
  if (config) {
    RARITIES = config.rarities;
    PETAL_TYPES = config.petalTypes;
    console.log('Config fetched from server');
  }
}

// Poll for game events
async function pollGameEvents() {
  const result = await sendApiRequest(`/api/external/events?since_index=${lastEventIndex}`);
  
  if (result && result.events) {
    console.log(`Received ${result.events.length} events from server (current index: ${lastEventIndex})`);
    for (const event of result.events) {
      console.log(`Processing event:`, event);
      await processGameEvent(event);
    }
    // Only update index if we successfully processed events
    if (result.events.length > 0) {
      lastEventIndex = result.currentIndex;
    }
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
  
  // Create a hash to detect duplicates
  const eventHash = `${event.e}:${event.text}`;
  if (processedEventHashes.has(eventHash)) {
    console.log('Skipping duplicate event');
    return;
  }
  processedEventHashes.add(eventHash);
  
  // Keep the set from growing too large
  if (processedEventHashes.size > 1000) {
    const hashesArray = Array.from(processedEventHashes);
    processedEventHashes.clear();
    hashesArray.slice(-500).forEach(hash => processedEventHashes.add(hash));
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
  console.log(`Guild ID: ${CONFIG.GUILD_ID}`);
  console.log(`Admin User ID: ${CONFIG.ADMIN_USER_ID}`);
  
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
    console.log(`Registering commands for guild: ${CONFIG.GUILD_ID}`);
    
    // Check if guild ID is valid
    if (!CONFIG.GUILD_ID || CONFIG.GUILD_ID === '1525831377725952150') {
      console.warn('Using default guild ID - make sure this is correct for your server');
    }
    
    // Register commands for specific guild (faster than global)
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, CONFIG.GUILD_ID),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error reloading commands:', error);
    console.error('Guild ID:', CONFIG.GUILD_ID);
    console.error('Application ID:', client.user.id);
  }
  
  // Start polling for game events
  console.log('Starting to poll for game events...');
  setInterval(pollGameEvents, CONFIG.POLL_INTERVAL_MS);
  
  // Initial poll
  pollGameEvents();
  
  // Schedule daily air
  scheduleDailyAir();
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

// Handle prefix commands
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).split(' ');
  const command = args[0].toLowerCase();
  const params = args.slice(1);

  console.log(`Received command: ${command} from user ${message.author.id}`);

  // Check if user is admin
  if (message.author.id !== CONFIG.ADMIN_USER_ID) {
    console.log(`User ${message.author.id} is not admin (${CONFIG.ADMIN_USER_ID}), ignoring command`);
    return;
  }

  console.log(`User is admin, executing command: ${command}`);

  if (command === 'giveaway') {
    await handleGiveaway(message, params);
  } else if (command === 'boost_reward' || command === 'booster_reward') {
    await handleBoostReward(message, params);
  } else if (command === 'refund') {
    await handleRefund(message, params);
  } else {
    console.log(`Unknown command: ${command}`);
  }
});

// Handle button interactions for giveaways
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;
  if (!customId.startsWith('giveaway_')) return;

  const giveawayId = customId.replace('giveaway_', '');
  const giveaway = giveaways.get(giveawayId);

  if (!giveaway) {
    await interaction.reply({ content: 'This giveaway has ended', ephemeral: true });
    return;
  }

  if (giveaway.entries.some(e => e.userId === interaction.user.id)) {
    await interaction.reply({ content: 'You have already entered this giveaway', ephemeral: true });
    return;
  }

  // Check if user is verified
  const isVerified = await verifyDiscordUser(interaction.user.id);
  if (!isVerified) {
    await interaction.reply({ 
      content: 'You must be logged in to 3dflorrr.duckdns.org with Discord to enter giveaways', 
      ephemeral: true 
    });
    return;
  }

  giveaway.entries.push({ userId: interaction.user.id });
  await interaction.reply({ content: 'You have entered the giveaway', ephemeral: true });

  // Update entry count
  const updatedEmbed = EmbedBuilder.from(giveaway.message.embeds[0])
    .setDescription(`Prize: ${giveaway.rarity} ${giveaway.petal}\n\nEnds: <t:${Math.floor(giveaway.endTime / 1000)}:R>\n\nEntries: ${giveaway.entries.length}\n\nClick the button below to enter!`);

  await giveaway.message.edit({ embeds: [updatedEmbed] });
});

// Login
client.login(CONFIG.DISCORD_BOT_TOKEN);

// HTTP server for UptimeRobot and Render health checks
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Florr3D Discord Bot is running');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connected: !!lastEventIndex,
    eventIndex: lastEventIndex,
    uptime: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
