import { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const CONFIG = {
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  SERVER_URL: process.env.SERVER_URL || 'https://3dflorrr.duckdns.org',
  EXTERNAL_API_TOKEN: process.env.EXTERNAL_API_TOKEN,
  GUILD_ID: process.env.GUILD_ID || '1525831377725952150',
  GIVEAWAY_CHANNEL_ID: process.env.GIVEAWAY_CHANNEL_ID || '1527013645723369664',
  NOTIFICATION_CHANNEL_ID: process.env.NOTIFICATION_CHANNEL_ID || '1528927946801152030',
  ALLOWED_USER_ID: process.env.ALLOWED_USER_ID || '1453329316833398819'
};

// Will be fetched from server
let RARITIES = [];
let PETAL_TYPES = [];

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

// Helper function to send API requests
async function sendApiRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${CONFIG.EXTERNAL_API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${CONFIG.SERVER_URL}${endpoint}`, options);
    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
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

// Verify Discord user is logged in to the game
async function verifyDiscordUser(discordId) {
  const result = await sendApiRequest(`/api/external/verify-discord?discord_id=${discordId}`);
  return result?.verified || false;
}

// Award petal to user
async function awardPetal(discordId, petalType, rarity) {
  const result = await sendApiRequest('/api/external/award-petal', 'POST', {
    discord_id: discordId,
    petal_type: petalType,
    rarity: rarity
  });
  return result?.success || false;
}

// Send notification to game (like built-in bot)
async function sendGameNotification(type, data) {
  return await sendApiRequest('/api/external/message', 'POST', { type, data });
}

// Random rarity selection (Common to Ultra only for giveaways)
function getRandomRarity() {
  // Only select from Common (0) to Ultra (6)
  const ultraIndex = RARITIES.findIndex(r => r.name === 'Ultra');
  const maxIndex = ultraIndex >= 0 ? ultraIndex : 6;
  const randomIndex = Math.floor(Math.random() * (maxIndex + 1));
  return RARITIES[randomIndex];
}

function getRandomPetal(excludeBloodSacrifice = true) {
  let availablePetals = PETAL_TYPES;
  
  // Exclude blood sacrifice unless specified
  if (excludeBloodSacrifice) {
    availablePetals = PETAL_TYPES.filter(p => p !== 'bloodsacrifice');
  }
  
  const randomIndex = Math.floor(Math.random() * availablePetals.length);
  return availablePetals[randomIndex];
}

// Convert hex color to decimal for Discord
function hexToDecimal(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

// Send embed notification
async function sendNotification(title, description, color, channelId = CONFIG.NOTIFICATION_CHANNEL_ID) {
  const channel = await client.channels.fetch(channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(hexToDecimal(color));

  await channel.send({ embeds: [embed] });
}

// Start giveaway
async function startGiveaway(durationMinutes, rarityName = null, petalType = null) {
  const channel = await client.channels.fetch(CONFIG.GIVEAWAY_CHANNEL_ID);
  if (!channel) return;

  // Random selection if not specified (Common to Ultra only)
  let selectedRarity = rarityName || getRandomRarity();
  let selectedPetal = petalType || getRandomPetal();

  // If Special rarity is specified, only allow blood sacrifice
  if (selectedRarity.name === 'Special') {
    selectedPetal = 'bloodsacrifice';
  }

  // If blood sacrifice is selected but not Special rarity, force Special rarity
  if (selectedPetal === 'bloodsacrifice' && selectedRarity.name !== 'Special') {
    selectedRarity = RARITIES.find(r => r.name === 'Special');
  }

  // Ensure random selection stays within Common-Ultra range
  if (!rarityName) {
    const ultraIndex = RARITIES.findIndex(r => r.name === 'Ultra');
    const maxIndex = ultraIndex >= 0 ? ultraIndex : 6;
    const validRarities = RARITIES.slice(0, maxIndex + 1);
    selectedRarity = validRarities[Math.floor(Math.random() * validRarities.length)];
  }

  const rarityIndex = RARITIES.findIndex(r => r.name === selectedRarity.name);
  const endTime = Date.now() + (durationMinutes * 60 * 1000);
  const giveawayId = `giveaway_${Date.now()}`;

  const embed = new EmbedBuilder()
    .setTitle('Giveaway')
    .setDescription(`Prize: ${selectedRarity.name} ${selectedPetal}\n\nEnds: <t:${Math.floor(endTime / 1000)}:R>\n\nClick the button below to enter!`)
    .setColor(hexToDecimal(selectedRarity.color));

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_${giveawayId}`)
        .setLabel('Enter Giveaway')
        .setStyle(ButtonStyle.Primary)
    );

  const message = await channel.send({ embeds: [embed], components: [row] });

  // Store giveaway data
  giveaways.set(giveawayId, {
    message,
    rarity: selectedRarity.name,
    petal: selectedPetal,
    rarityIndex,
    endTime,
    entries: []
  });

  // Schedule giveaway end
  setTimeout(() => endGiveaway(giveawayId), durationMinutes * 60 * 1000);

  return giveawayId;
}

// End giveaway and award petal
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

  // Pick random winner
  const winnerIndex = Math.floor(Math.random() * giveaway.entries.length);
  const winner = giveaway.entries[winnerIndex];

  // Verify winner is logged in to game
  const isVerified = await verifyDiscordUser(winner.userId);
  
  if (!isVerified) {
    // Pick another winner if first is not verified
    const remainingEntries = giveaway.entries.filter((_, i) => i !== winnerIndex);
    if (remainingEntries.length > 0) {
      const newWinnerIndex = Math.floor(Math.random() * remainingEntries.length);
      const newWinner = remainingEntries[newWinnerIndex];
      const newIsVerified = await verifyDiscordUser(newWinner.userId);
      
      if (newIsVerified) {
        await awardPetalAndAnnounce(newWinner.userId, giveaway, giveaway.message);
      } else {
        await giveaway.message.edit({
          content: 'Giveaway ended - No verified participants',
          embeds: [giveaway.message.embeds[0]],
          components: []
        });
      }
    } else {
      await giveaway.message.edit({
        content: 'Giveaway ended - No verified participants',
        embeds: [giveaway.message.embeds[0]],
        components: []
      });
    }
  } else {
    await awardPetalAndAnnounce(winner.userId, giveaway, giveaway.message);
  }
}

async function awardPetalAndAnnounce(winnerId, giveaway, message) {
  // Award petal
  const awarded = await awardPetal(winnerId, giveaway.petal, giveaway.rarityIndex);
  
  if (awarded) {
    const user = await client.users.fetch(winnerId);
    await message.edit({
      content: `Giveaway ended - Winner: ${user.tag}`,
      embeds: [message.embeds[0]],
      components: []
    });

    // Send notification
    await sendNotification(
      'Giveaway Winner',
      `${user.tag} won a ${giveaway.rarity} ${giveaway.petal}`,
      RARITIES.find(r => r.name === giveaway.rarity).color
    );
  } else {
    await message.edit({
      content: 'Giveaway ended - Failed to award prize',
      embeds: [message.embeds[0]],
      components: []
    });
  }
}

// Handle button interactions
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

// Client ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Fetch config from server
  await fetchConfig();
  
  // Register slash commands
  // Filter rarities to Common-Ultra for random giveaways
  const commonToUltraRarities = RARITIES.filter(r => ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultra'].includes(r.name));
  
  const commands = [
    {
      name: 'giveaway',
      description: 'Start a giveaway',
      options: [
        {
          name: 'duration',
          type: 4, // INTEGER
          description: 'Duration in minutes',
          required: true
        },
        {
          name: 'rarity',
          type: 3, // STRING
          description: 'Rarity (Common-Ultra for random, Special only gives blood sacrifice)',
          required: false,
          choices: RARITIES.map(r => ({ name: r.name, value: r.name }))
        },
        {
          name: 'petal',
          type: 3, // STRING
          description: 'Petal type (leave empty for random)',
          required: false,
          choices: PETAL_TYPES.map(p => ({ name: p, value: p }))
        }
      ]
    },
    {
      name: 'notify-spawn',
      description: 'Send spawn notification',
      options: [
        {
          name: 'mob',
          type: 3, // STRING
          description: 'Mob name',
          required: true
        },
        {
          name: 'rarity',
          type: 3, // STRING
          description: 'Rarity',
          required: true,
          choices: RARITIES.map(r => ({ name: r.name, value: r.name }))
        }
      ]
    },
    {
      name: 'notify-kill',
      description: 'Send kill notification',
      options: [
        {
          name: 'mob',
          type: 3, // STRING
          description: 'Mob name',
          required: true
        },
        {
          name: 'rarity',
          type: 3, // STRING
          description: 'Rarity',
          required: true,
          choices: RARITIES.map(r => ({ name: r.name, value: r.name }))
        },
        {
          name: 'player',
          type: 3, // STRING
          description: 'Player name',
          required: true
        }
      ]
    },
    {
      name: 'notify-drop',
      description: 'Send drop notification',
      options: [
        {
          name: 'petal',
          type: 3, // STRING
          description: 'Petal name',
          required: true
        },
        {
          name: 'rarity',
          type: 3, // STRING
          description: 'Rarity',
          required: true,
          choices: RARITIES.map(r => ({ name: r.name, value: r.name }))
        },
        {
          name: 'player',
          type: 3, // STRING
          description: 'Player name',
          required: true
        }
      ]
    }
  ];

  const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_BOT_TOKEN);

  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, CONFIG.GUILD_ID),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error reloading commands:', error);
  }
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'giveaway') {
    // Check if user is allowed to use giveaway command
    if (interaction.user.id !== CONFIG.ALLOWED_USER_ID) {
      await interaction.reply({ content: 'You do not have permission to use this command', ephemeral: true });
      return;
    }

    const duration = interaction.options.getInteger('duration');
    const rarity = interaction.options.getString('rarity');
    const petal = interaction.options.getString('petal');

    await startGiveaway(duration, rarity, petal);
    await interaction.reply({ content: 'Giveaway started', ephemeral: true });
  } else if (commandName === 'notify-spawn') {
    const mob = interaction.options.getString('mob');
    const rarity = interaction.options.getString('rarity');

    const rarityData = RARITIES.find(r => r.name === rarity);
    await sendNotification(
      `${rarity} spawned`,
      `A ${mob} rolled ${rarity} rarity`,
      rarityData.color
    );
    await interaction.reply({ content: 'Spawn notification sent', ephemeral: true });
  } else if (commandName === 'notify-kill') {
    const mob = interaction.options.getString('mob');
    const rarity = interaction.options.getString('rarity');
    const player = interaction.options.getString('player');

    const rarityData = RARITIES.find(r => r.name === rarity);
    await sendNotification(
      `${rarity} defeated`,
      `A ${rarity} ${mob} has been defeated by ${player}`,
      rarityData.color
    );
    await interaction.reply({ content: 'Kill notification sent', ephemeral: true });
  } else if (commandName === 'notify-drop') {
    const petal = interaction.options.getString('petal');
    const rarity = interaction.options.getString('rarity');
    const player = interaction.options.getString('player');

    const rarityData = RARITIES.find(r => r.name === rarity);
    await sendNotification(
      `${rarity} drop`,
      `${player} found a ${rarity} ${petal}`,
      rarityData.color
    );
    await interaction.reply({ content: 'Drop notification sent', ephemeral: true });
  }
});

// Login
client.login(CONFIG.DISCORD_BOT_TOKEN);
